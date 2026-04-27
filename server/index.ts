import express from 'express';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { cert, getApps, initializeApp as initializeFirebaseAdminApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Prisma, NotificationType, TargetType } from '@prisma/client';
import { MOCK_PLACES, SIMILAR_TRAVELERS } from '../src/mockData';
import { prisma } from './prisma';
import {
  attachDecisionPlace,
  createDecisionSession,
  getDecisionIntentCatalog,
  getDecisionSession,
  getDecisionTodayFeed,
  markDecisionGoNow,
  saveDecisionPlace,
  submitDecisionCheckin,
  swipeDecisionSession,
  swapDecisionSessionOption,
} from './decision';
import { generateAiCompatibilityAssessment, generateDeterministicPlaceEnrichment, generatePlaceAiEnrichment } from './placeEnrichment';
import {
  enrichAndStorePlaceTraits,
  enrichAndStorePlaceTraitsBatch,
  findPlaceIdsForTraitEnrichment,
  getPlaceTraitCoverageStatus,
  getStoredPlaceTraitProfile,
  upsertPlaceTraitProfile,
} from './placeTraitEnrichment';
import { generateTravelerProfileDescriptor, queueTravelerProfileDescriptorRefresh } from './travelerProfileEnrichment';
import {
  createCollection,
  deleteCollection,
  deleteMoment,
  getBookmarks,
  createMoment,
  getFollowingFeed,
  getTravelerDiscovery,
  getTravelerProfile,
  getTravelerFollowers,
  getPublicTravelerSuggestions,
  searchPublicTravelers,
  getPlaceTravelerMoments,
  getRelatedPlaces,
  getAccountSettings,
  getCollections,
  getMoments,
  getNotifications,
  getNotificationSettings,
  getPrivacySettings,
  getPublicCollectionById,
  getProfileMe,
  getPublicProfileByUsername,
  getSupport,
  updateCollection,
  updateMoment,
  updateNotificationSettings,
  updatePrivacySettings,
  updateProfile,
} from './repository';

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT || 3001);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_RUNTIME_AI = String(process.env.ENABLE_RUNTIME_AI ?? '').toLowerCase() === 'true';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;
const GOOGLE_CLIENT_IDS = process.env.GOOGLE_CLIENT_IDS;
const NATIVE_IOS_GOOGLE_CLIENT_ID = '937557434052-dj8h3e2pr7s85dmv4o4b2nttfjh40ma4.apps.googleusercontent.com';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
const APPLE_CLIENT_IDS = process.env.APPLE_CLIENT_IDS;
const NATIVE_IOS_APPLE_CLIENT_ID = 'club.vibinn.ios';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const r2Client = R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;
const DISCOVERY_POOL_MIN_CANDIDATES = 80;
const DISCOVERY_SEARCH_MIN_CANDIDATES = 18;
const DISCOVERY_RESEED_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7;
const DISCOVERY_FORCE_REFRESH_MIN_INTERVAL_MS = 1000 * 60 * 60 * 12;
const DISCOVERY_FORCE_REFRESH_MIN_CANDIDATES = 24;
const DISCOVERY_SEARCH_RESEED_INTERVAL_MS = 1000 * 60 * 60 * 24;
const RECOMMENDATION_CONTEXT_CACHE_TTL_MS = 1000 * 60;
const placeEnrichmentInflight = new Map<string, Promise<{
  hook: string;
  description: string | null;
  vibeTags: string[];
  attitudeLabel: string | null;
  bestTime: string | null;
} | null>>();
const recommendationContextCache = new Map<string, {
  expiresAt: number;
  value: RecommendationContext;
}>();
let appleKeyCache: {
  expiresAt: number;
  keys: Array<Record<string, string>>;
} | null = null;

type AuthenticatedRequest = express.Request & {
  authUserId?: string;
};

type BookmarkPlaceSnapshot = {
  name?: string;
  location?: string;
  address?: string;
  category?: string;
  image?: string;
  images?: string[];
  tags?: string[];
  description?: string;
  hook?: string;
  attitudeLabel?: string;
  bestTime?: string;
  rating?: number;
  priceLevel?: number;
  latitude?: number;
  longitude?: number;
};

type InteractionTargetType = 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION';

function handleError(res: express.Response, error: unknown) {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'upload';
}

function getUploadExtension(fileName: string, mimeType?: string) {
  const ext = path.extname(fileName);
  if (ext) return ext.toLowerCase();
  if (mimeType?.startsWith('video/')) return '.mp4';
  if (mimeType?.startsWith('image/png')) return '.png';
  if (mimeType?.startsWith('image/webp')) return '.webp';
  return '.jpg';
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid media payload');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildMediaUrl(key: string, requestOrigin?: string) {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  const baseOrigin = requestOrigin?.replace(/\/$/, '');
  if (baseOrigin) {
    return `${baseOrigin}/api/media?key=${encodeURIComponent(key)}`;
  }
  return `/api/media?key=${encodeURIComponent(key)}`;
}

function getAllowedGoogleClientIds() {
  return Array.from(
    new Set(
      [
        GOOGLE_CLIENT_ID,
        GOOGLE_IOS_CLIENT_ID,
        NATIVE_IOS_GOOGLE_CLIENT_ID,
        ...(GOOGLE_CLIENT_IDS?.split(',') ?? []),
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function getAllowedAppleClientIds() {
  return Array.from(
    new Set(
      [
        APPLE_CLIENT_ID,
        NATIVE_IOS_APPLE_CLIENT_ID,
        ...(APPLE_CLIENT_IDS?.split(',') ?? []),
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function decodeBase64URL(value: string) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(normalized, 'base64');
}

async function getAppleSigningKeys() {
  if (appleKeyCache && appleKeyCache.expiresAt > Date.now()) {
    return appleKeyCache.keys;
  }

  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) {
    throw new Error('Could not verify Apple sign-in');
  }

  const payload = await response.json() as { keys?: Array<Record<string, string>> };
  const keys = payload.keys ?? [];
  appleKeyCache = {
    expiresAt: Date.now() + 1000 * 60 * 60,
    keys,
  };
  return keys;
}

async function verifyAppleIdToken(idToken: string) {
  const segments = idToken.split('.');
  if (segments.length !== 3) {
    throw new Error('Invalid Apple identity token');
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = JSON.parse(decodeBase64URL(headerSegment).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decodeBase64URL(payloadSegment).toString('utf8')) as {
    iss?: string;
    aud?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid Apple identity token');
  }

  if (payload.iss !== 'https://appleid.apple.com') {
    throw new Error('Invalid Apple issuer');
  }

  const allowedClientIds = getAllowedAppleClientIds();
  if (allowedClientIds.length > 0 && (!payload.aud || !allowedClientIds.includes(payload.aud))) {
    throw new Error('Apple client mismatch');
  }

  if (!payload.sub) {
    throw new Error('Apple subject is missing');
  }

  if (!payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new Error('Apple identity token expired');
  }

  const keys = await getAppleSigningKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error('Could not verify Apple sign-in');
  }

  const publicKey = crypto.createPublicKey({
    key: jwk as crypto.JsonWebKey,
    format: 'jwk',
  });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();

  const isValid = verifier.verify(publicKey, decodeBase64URL(signatureSegment));
  if (!isValid) {
    throw new Error('Invalid Apple identity token signature');
  }

  return payload;
}

async function verifyGoogleIdToken(idToken: string) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);

  if (!response.ok) {
    throw new Error('Could not verify Google sign-in');
  }

  const payload = await response.json() as {
    aud?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
  };

  const allowedClientIds = getAllowedGoogleClientIds();

  if (allowedClientIds.length > 0 && (!payload.aud || !allowedClientIds.includes(payload.aud))) {
    throw new Error('Google client mismatch');
  }

  if (!payload.email || payload.email_verified !== 'true') {
    throw new Error('Google account email is not verified');
  }

  return payload;
}

function hashPassword(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function buildUsernameFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24) || `traveler.${crypto.randomUUID().slice(0, 6)}`;
}

async function buildUniqueUsername(base: string) {
  let candidate = base;
  let index = 1;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    candidate = `${base}.${index}`;
    index += 1;
  }

  return candidate;
}

function getFirebaseMessagingClient() {
  try {
    if (getApps().length > 0) {
      return getMessaging();
    }

    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      const parsed = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        initializeFirebaseAdminApp({
          credential: cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key.replace(/\\n/g, '\n'),
          }),
        });
        return getMessaging();
      }
    }

    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
      initializeFirebaseAdminApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      return getMessaging();
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK', error);
  }

  return null;
}

async function sendPushNotification(input: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  const messaging = getFirebaseMessagingClient();
  if (!messaging) {
    return;
  }

  const [settings, devices] = await Promise.all([
    prisma.userNotificationSettings.findUnique({
      where: { userId: input.userId },
      select: { pushEnabled: true },
    }),
    prisma.userDevice.findMany({
      where: {
        userId: input.userId,
        isActive: true,
      },
      select: {
        id: true,
        fcmToken: true,
      },
    }),
  ]);

  if (settings?.pushEnabled === false || devices.length === 0) {
    return;
  }

  const response = await messaging.sendEachForMulticast({
    tokens: devices.map((device) => device.fcmToken),
    notification: {
      title: input.title,
      body: input.body,
    },
    data: input.data,
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  const invalidDeviceIds = response.responses.flatMap((result, index) => {
    if (!result.error) {
      return [];
    }
    const code = result.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      return [devices[index]?.id].filter(Boolean) as string[];
    }
    console.error('Push send failed', code, result.error.message);
    return [];
  });

  if (invalidDeviceIds.length > 0) {
    await prisma.userDevice.updateMany({
      where: { id: { in: invalidDeviceIds } },
      data: { isActive: false },
    });
  }
}

async function createSession(userId: string) {
  const token = crypto.randomUUID();
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

async function createNotification(input: {
  userId: string;
  actorUserId?: string | null;
  type: NotificationType;
  targetType?: TargetType | null;
  targetId?: string | null;
  title: string;
  body: string;
}) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      title: input.title,
      body: input.body,
    },
  });

  void sendPushNotification({
    userId: input.userId,
    title: input.title,
    body: input.body,
    data: {
      type: input.type,
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
    },
  });
}

function normalizeDirectConversationPair(userIdA: string, userIdB: string) {
  return userIdA.localeCompare(userIdB) <= 0
    ? [userIdA, userIdB] as const
    : [userIdB, userIdA] as const;
}

async function findBlockingRelationship(userId: string, otherUserId: string) {
  return prisma.userBlock.findFirst({
    where: {
      OR: [
        { sourceUserId: userId, targetUserId: otherUserId },
        { sourceUserId: otherUserId, targetUserId: userId },
      ],
    },
  });
}

async function findFriendshipBetween(userId: string, otherUserId: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
  });
}

async function resolveFriendshipStatusForUsers(userId: string, otherUserId: string) {
  const [blockingRelationship, friendship] = await Promise.all([
    findBlockingRelationship(userId, otherUserId),
    findFriendshipBetween(userId, otherUserId),
  ]);

  if (blockingRelationship) {
    return {
      status: 'blocked' as const,
      friendship,
    };
  }

  if (!friendship) {
    return {
      status: 'none' as const,
      friendship: null,
    };
  }

  if (friendship.status === 'ACCEPTED') {
    return {
      status: 'accepted' as const,
      friendship,
    };
  }

  return {
    status: friendship.requesterId === userId ? 'pending_sent' as const : 'pending_received' as const,
    friendship,
  };
}

async function ensureAcceptedFriendship(userId: string, otherUserId: string) {
  if (userId === otherUserId) {
    throw new Error('Cannot start a conversation with yourself');
  }

  const state = await resolveFriendshipStatusForUsers(userId, otherUserId);
  if (state.status === 'blocked') {
    throw new Error('Cannot chat with a blocked account');
  }
  if (state.status !== 'accepted') {
    throw new Error('Chat is only available for friends');
  }

  return state.friendship!;
}

const chatMessageAttachmentArgs = Prisma.validator<Prisma.ChatMessageAttachmentDefaultArgs>()({
  include: {
    moment: {
      include: {
        place: true,
        media: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
      },
    },
  },
});

const chatMessageArgs = Prisma.validator<Prisma.ChatMessageDefaultArgs>()({
  include: {
    senderUser: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    },
    attachments: {
      include: chatMessageAttachmentArgs.include,
    },
  },
});

const conversationArgs = Prisma.validator<Prisma.ConversationDefaultArgs>()({
  include: {
    members: {
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    },
    messages: {
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: chatMessageArgs.include,
    },
  },
});

type ChatMessageAttachmentWithRelations = Prisma.ChatMessageAttachmentGetPayload<typeof chatMessageAttachmentArgs>;
type ChatMessageWithRelations = Prisma.ChatMessageGetPayload<typeof chatMessageArgs>;
type ConversationWithRelations = {
  id: string;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  members: Array<{
    userId: string;
    lastReadAt: Date | null;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  }>;
  messages: ChatMessageWithRelations[];
};

function mapChatAttachmentForClient(attachment: ChatMessageAttachmentWithRelations) {
  return {
    id: attachment.id,
    targetType: attachment.targetType,
    targetId: attachment.targetId,
    previewText: attachment.previewText ?? null,
    moment: attachment.moment
      ? {
          id: attachment.moment.id,
          caption: attachment.moment.caption,
          visitedAt: attachment.moment.visitedAt.toISOString(),
          place: {
            id: attachment.moment.place.id,
            name: attachment.moment.place.name,
            location: attachment.moment.place.city ?? attachment.moment.place.address ?? attachment.moment.place.name,
            image: attachment.moment.media[0]?.url ?? attachment.moment.place.primaryImageUrl ?? null,
          },
        }
      : null,
  };
}

function mapChatMessageForClient(message: ChatMessageWithRelations) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    kind: message.kind,
    body: message.body ?? '',
    createdAt: message.createdAt.toISOString(),
    sender: {
      id: message.senderUser.id,
      username: message.senderUser.username,
      displayName: message.senderUser.displayName ?? message.senderUser.username,
      avatarUrl: message.senderUser.avatarUrl ?? null,
    },
    attachments: message.attachments.map(mapChatAttachmentForClient),
  };
}

async function ensureDirectConversation(userId: string, otherUserId: string) {
  await ensureAcceptedFriendship(userId, otherUserId);

  const [directUserAId, directUserBId] = normalizeDirectConversationPair(userId, otherUserId);
  const existing = await prisma.conversation.findUnique({
    where: {
      directUserAId_directUserBId: {
        directUserAId,
        directUserBId,
      },
    },
    include: conversationArgs.include,
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      kind: 'direct',
      directUserAId,
      directUserBId,
      members: {
        create: [
          { userId: directUserAId },
          { userId: directUserBId },
        ],
      },
    },
    include: conversationArgs.include,
  });
}

async function assertConversationMember(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  if (!member) {
    throw new Error('Conversation not found');
  }

  return member;
}

async function mapConversationSummaryForUser(
  conversation: ConversationWithRelations,
  userId: string
) {
  const otherMember = conversation.members.find((member) => member.userId !== userId);
  const viewerMember = conversation.members.find((member) => member.userId === userId) ?? null;
  const lastMessage = conversation.messages[0] ?? null;
  const unreadCount = await prisma.chatMessage.count({
    where: {
      conversationId: conversation.id,
      senderUserId: { not: userId },
      ...(viewerMember?.lastReadAt
        ? { createdAt: { gt: viewerMember.lastReadAt } }
        : {}),
    },
  });

  return {
    id: conversation.id,
    kind: conversation.kind,
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? lastMessage?.createdAt.toISOString() ?? conversation.createdAt.toISOString(),
    unreadCount,
    otherUser: otherMember
      ? {
          id: otherMember.user.id,
          username: otherMember.user.username,
          displayName: otherMember.user.displayName ?? otherMember.user.username,
          avatarUrl: otherMember.user.avatarUrl ?? null,
        }
      : null,
    lastMessage: lastMessage ? mapChatMessageForClient(lastMessage) : null,
  };
}

async function createChatMessage(input: {
  conversationId: string;
  senderUserId: string;
  kind?: string;
  body?: string | null;
  attachments?: Array<{
    targetType: TargetType;
    targetId: string;
    momentId?: string | null;
    previewText?: string | null;
  }>;
}) {
  const trimmedBody = input.body?.trim() ?? '';
  if (!trimmedBody && (!input.attachments || input.attachments.length === 0)) {
    throw new Error('Message body or attachment is required');
  }

  await assertConversationMember(input.conversationId, input.senderUserId);

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        kind: input.kind ?? (input.attachments?.length ? 'attachment' : 'text'),
        body: trimmedBody || null,
        attachments: input.attachments?.length
          ? {
              create: input.attachments.map((attachment) => ({
                targetType: attachment.targetType,
                targetId: attachment.targetId,
                momentId: attachment.momentId ?? null,
                previewText: attachment.previewText ?? null,
              })),
            }
          : undefined,
      },
      include: chatMessageArgs.include,
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: created.createdAt,
      },
    });

    return created;
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      members: true,
    },
  });

  if (conversation) {
    const actor = await prisma.user.findUnique({
      where: { id: input.senderUserId },
      select: { username: true, displayName: true },
    });

    if (actor) {
      await Promise.all(
        conversation.members
          .filter((member) => member.userId !== input.senderUserId)
          .map((member) =>
            createNotification({
              userId: member.userId,
              actorUserId: input.senderUserId,
              type: 'CHAT_MESSAGE',
              targetType: 'CONVERSATION',
              targetId: input.conversationId,
              title: `${actor.displayName ?? actor.username} sent a message`,
              body: trimmedBody || input.attachments?.[0]?.previewText || 'Opened a chat with you',
            })
          )
      );
    }
  }

  return message;
}

function mapUserForClient(user: { id: string; username: string; displayName: string | null; email: string; bio?: string | null; avatarUrl?: string | null }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    email: user.email,
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

async function mapUserForClientWithTasteState(user: { id: string; username: string; displayName: string | null; email: string; bio?: string | null; avatarUrl?: string | null }) {
  const preferences = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { onboardingCompleted: true },
  });

  return {
    ...mapUserForClient(user),
    hasCompletedTastePreferences: Boolean(preferences?.onboardingCompleted),
  };
}

async function ensureDefaultUserRelations(userId: string) {
  const tasks = await Promise.allSettled([
    prisma.userPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        selectedInterests: [],
        onboardingCompleted: false,
        skippedPreferences: true,
      },
    }),
    prisma.userAccountSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
    prisma.userNotificationSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        pushEnabled: true,
        emailEnabled: true,
        recommendationEnabled: true,
      },
    }),
    prisma.userPrivacySettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        profileVisibility: 'PUBLIC',
        momentVisibility: 'PUBLIC',
      },
    }),
  ]);

  for (const task of tasks) {
    if (task.status == 'rejected') {
      console.error('ensureDefaultUserRelations failed', task.reason);
    }
  }
}

async function eraseAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const deletedSuffix = `${Date.now()}-${user.id.slice(0, 8)}`;
  const deletedUsername = await buildUniqueUsername(`deleted.${user.id.slice(0, 8)}`);
  const deletedEmail = `deleted+${deletedSuffix}@vibinn.invalid`;
  const deletedAvatar = 'https://placehold.co/400x400/111111/D3FF48?text=D';

  await prisma.$transaction([
    prisma.follow.deleteMany({
      where: {
        OR: [
          { sourceUserId: user.id },
          { targetUserId: user.id },
        ],
      },
    }),
    prisma.userDevice.updateMany({
      where: { userId: user.id },
      data: { isActive: false },
    }),
    prisma.session.deleteMany({
      where: { userId: user.id },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        username: deletedUsername,
        displayName: 'Deleted account',
        email: deletedEmail,
        passwordHash: hashPassword(crypto.randomUUID()),
        bio: 'This account has been deleted.',
        avatarUrl: deletedAvatar,
        appleSubject: null,
      },
    }),
  ]);
}

function normalizeLocationPart(part: string) {
  const trimmed = part.trim();
  if (!trimmed) return null;

  const withoutPostalCode = trimmed
    .replace(/\b\d{4,6}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!withoutPostalCode) return null;

  if (/daerah khusus ibukota jakarta/i.test(withoutPostalCode)) return 'Jakarta';

  return withoutPostalCode
    .replace(/^(kota|city of)\s+/i, '')
    .replace(/\b(city|regency)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

function isLikelyCityCandidate(part: string) {
  const normalized = part.trim();
  if (!normalized) return false;

  if (/^[A-Z0-9]{3,}\+[A-Z0-9]+$/i.test(normalized)) return false;
  if (/^[A-Z]{2,3}$/.test(normalized)) return false;
  if (/^(jl\.|jalan\b|street\b|st\b|road\b|rd\b|avenue\b|ave\b|rt\.?|rw\.?|no\.|halte\b|komplek\b|complex\b)/i.test(normalized)) return false;
  if (/^(kec\.|kecamatan|kel\.|kelurahan|kota adm\.|kabupaten|regency of)\b/i.test(normalized)) return false;
  if (/^[A-Z]{2}\s+\d{4,6}$/i.test(normalized)) return false;
  if (/^\d+/.test(normalized)) return false;

  return true;
}

function parseLocationBits(raw?: string) {
  const parts = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const country = normalizeLocationPart(parts.at(-1) ?? '') ?? null;
  const candidates = parts
    .slice(0, Math.max(parts.length - 1, 0))
    .map((part) => normalizeLocationPart(part))
    .filter((part): part is string => Boolean(part));

  let city: string | null = null;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!isLikelyCityCandidate(candidate)) continue;
    city = candidate;
    break;
  }

  if (city && /jakarta/i.test(city)) {
    city = city
      .replace(/\b(barat|timur|utara|selatan|pusat)\b/i, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase())
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return {
    city,
    country,
    location: parts.join(', '),
  };
}

const IRRELEVANT_PRIMARY_TYPES = new Set([
  'geocode',
  'establishment',
  'point_of_interest',
  'association_or_organization',
  'health',
  'finance',
  'administrative_area_level_1',
  'country',
  'postal_code',
  'route',
  'street_address',
  'subpremise',
  'premise',
  'political',
]);

const LOCATION_TYPES = new Set([
  'locality',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
]);

function isRelevantPredictionType(type?: string) {
  if (!type) return true;
  return !IRRELEVANT_PRIMARY_TYPES.has(type);
}

function mapGoogleLocationType(type?: string): 'city' | 'province' | 'country' {
  if (type === 'country') return 'country';
  if (type === 'administrative_area_level_1' || type === 'administrative_area_level_2') return 'province';
  return 'city';
}

function mapLocationTypeForDb(type: 'city' | 'province' | 'country') {
  if (type === 'country') return 'COUNTRY';
  if (type === 'province') return 'PROVINCE';
  return 'CITY';
}

function normalizeLocationType(type?: string) {
  if (type === 'country') return 'COUNTRY';
  if (type === 'province') return 'PROVINCE';
  return 'CITY';
}

function mapLocationForClient(location: { id: string; name: string; type: 'CITY' | 'PROVINCE' | 'COUNTRY'; googlePlaceId: string | null; latitude: number | null; longitude: number | null }) {
  return {
    id: location.id,
    label: location.name,
    type: location.type.toLowerCase() as 'city' | 'province' | 'country',
    googlePlaceId: location.googlePlaceId ?? undefined,
    latitude: location.latitude ?? undefined,
    longitude: location.longitude ?? undefined,
  };
}

async function resolveTargetOwner(targetType: InteractionTargetType, targetId: string) {
  if (targetType === 'PROFILE') {
    return targetId;
  }

  if (targetType === 'MOMENT') {
    const moment = await prisma.moment.findUnique({
      where: { id: targetId },
      select: { userId: true },
    });
    return moment?.userId ?? null;
  }

  if (targetType === 'PLACE_VISIT') {
    const moment = await prisma.moment.findUnique({
      where: { id: targetId },
      select: { userId: true },
    });
    return moment?.userId ?? null;
  }

  return null;
}

async function resolveTargetPlaceId(targetType: InteractionTargetType, targetId: string) {
  if (targetType === 'PLACE') {
    return targetId;
  }

  if (targetType === 'MOMENT' || targetType === 'PLACE_VISIT') {
    const moment = await prisma.moment.findUnique({
      where: { id: targetId },
      select: { placeId: true },
    });
    return moment?.placeId ?? null;
  }

  return null;
}

type GooglePlaceSuggestion = {
  placeId: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

const CHECK_IN_AUTOCOMPLETE_CITY_BOUNDS: Record<string, {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}> = {
  boston: {
    low: { latitude: 42.2279, longitude: -71.1912 },
    high: { latitude: 42.4008, longitude: -70.9860 },
  },
  'new york': {
    low: { latitude: 40.4774, longitude: -74.2591 },
    high: { latitude: 40.9176, longitude: -73.7004 },
  },
  jakarta: {
    low: { latitude: -6.3700, longitude: 106.6800 },
    high: { latitude: -6.0900, longitude: 106.9700 },
  },
  bandung: {
    low: { latitude: -6.9950, longitude: 107.5200 },
    high: { latitude: -6.8200, longitude: 107.7400 },
  },
};

function normalizeCheckInAutocompleteCity(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'nyc') return 'new york';
  return CHECK_IN_AUTOCOMPLETE_CITY_BOUNDS[normalized] ? normalized : null;
}

async function fetchGooglePlaceSuggestions(input: string, options?: {
  sessionToken?: string | null;
  locationLabel?: string | null;
}) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const cityKey = normalizeCheckInAutocompleteCity(options?.locationLabel);
  const locationRestriction = cityKey
    ? { rectangle: CHECK_IN_AUTOCOMPLETE_CITY_BOUNDS[cityKey] }
    : undefined;

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input,
      includeQueryPredictions: false,
      ...(options?.sessionToken ? { sessionToken: options.sessionToken } : {}),
      ...(locationRestriction ? { locationRestriction } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Google Places autocomplete failed with ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
  }

  const data = await response.json() as {
    suggestions?: Array<{
      placePrediction?: GooglePlaceSuggestion;
    }>;
  };

  return data.suggestions
    ?.map((item) => item.placePrediction)
    .filter(Boolean)
    .slice(0, 6) ?? [];
}

type GoogleMoney = {
  currencyCode?: string;
  units?: string | number;
  nanos?: number;
};

type GooglePriceRange = {
  startPrice?: GoogleMoney;
  endPrice?: GoogleMoney;
};

type GoogleLocalizedText = {
  text?: string;
  languageCode?: string;
};

type GoogleDate = {
  year?: number;
  month?: number;
  day?: number;
};

type GooglePlaceDetailsResponse = {
  id: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
    languageCode?: string;
  }>;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: GoogleLocalizedText;
  googleMapsTypeLabel?: GoogleLocalizedText;
  types?: string[];
  businessStatus?: string;
  openingDate?: GoogleDate;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  googleMapsLinks?: unknown;
  websiteUri?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  timeZone?: {
    id?: string;
    version?: string;
  };
  utcOffsetMinutes?: number;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBrunch?: boolean;
  servesDessert?: boolean;
  servesCoffee?: boolean;
  servesCocktails?: boolean;
  servesVegetarianFood?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  curbsidePickup?: boolean;
  reservable?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  goodForChildren?: boolean;
  allowsDogs?: boolean;
  restroom?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  outdoorSeating?: boolean;
  paymentOptions?: unknown;
  parkingOptions?: unknown;
  accessibilityOptions?: unknown;
  editorialSummary?: GoogleLocalizedText;
  reviewSummary?: unknown;
  generativeSummary?: unknown;
  containingPlaces?: unknown;
  reviews?: unknown[];
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  priceRange?: GooglePriceRange;
  photos?: Array<{
    name: string;
  }>;
};

type PreferenceDrivenQueryDescriptor = {
  queryText: string;
  queryType: 'interest' | 'vibe' | 'location';
  preferenceCategory?: string;
  selectedVibe?: string;
};

type PlaceDiscoverySignalInput = PreferenceDrivenQueryDescriptor & {
  resultRank?: number;
  locationLabel?: string;
  locationType?: string;
  payload?: GoogleTextSearchPlace;
};

type PlaceDiscoverySignalForScoring = {
  queryText?: string | null;
  queryType?: string | null;
  preferenceCategory?: string | null;
  resultRank?: number | null;
  bestResultRank?: number | null;
  seenCount?: number | null;
};

type GoogleTextSearchPlace = GooglePlaceDetailsResponse;

function googleMoneyToNumber(money?: GoogleMoney | null) {
  if (!money) return null;
  const units = typeof money.units === 'number' ? money.units : Number(money.units ?? 0);
  const nanos = typeof money.nanos === 'number' ? money.nanos : 0;
  const amount = units + nanos / 1_000_000_000;
  return Number.isFinite(amount) ? amount : null;
}

function normalizeGooglePriceRange(priceRange?: GooglePriceRange | null) {
  if (!priceRange) return null;
  const startAmount = googleMoneyToNumber(priceRange.startPrice);
  const endAmount = googleMoneyToNumber(priceRange.endPrice);
  const currencyCode = priceRange.startPrice?.currencyCode ?? priceRange.endPrice?.currencyCode ?? null;
  if (!currencyCode || (startAmount == null && endAmount == null)) return null;
  return { startAmount, endAmount, currencyCode };
}

function normalizeGoogleOpeningHours(details?: GooglePlaceDetailsResponse | null) {
  return details?.regularOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [];
}

function normalizeGoogleCurrentOpeningHours(details?: GooglePlaceDetailsResponse | null) {
  return details?.currentOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [];
}

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapGooglePlaceDetailColumns(details?: GooglePlaceDetailsResponse | null) {
  if (!details) {
    return {};
  }

  return {
    googleDisplayName: details.displayName?.text ?? null,
    shortFormattedAddress: details.shortFormattedAddress ?? null,
    googleTypes: details.types ?? [],
    googlePrimaryType: details.primaryType ?? null,
    googlePrimaryTypeDisplayName: details.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: details.googleMapsTypeLabel?.text ?? null,
    businessStatus: details.businessStatus ?? null,
    openingDateJson: jsonOrDbNull(details.openingDate),
    openingHours: normalizeGoogleOpeningHours(details),
    currentOpeningHours: normalizeGoogleCurrentOpeningHours(details),
    servesBreakfast: details.servesBreakfast ?? null,
    servesLunch: details.servesLunch ?? null,
    servesDinner: details.servesDinner ?? null,
    servesBeer: details.servesBeer ?? null,
    servesWine: details.servesWine ?? null,
    servesBrunch: details.servesBrunch ?? null,
    servesDessert: details.servesDessert ?? null,
    servesCoffee: details.servesCoffee ?? null,
    servesCocktails: details.servesCocktails ?? null,
    servesVegetarianFood: details.servesVegetarianFood ?? null,
    takeout: details.takeout ?? null,
    delivery: details.delivery ?? null,
    dineIn: details.dineIn ?? null,
    curbsidePickup: details.curbsidePickup ?? null,
    reservable: details.reservable ?? null,
    liveMusic: details.liveMusic ?? null,
    menuForChildren: details.menuForChildren ?? null,
    goodForChildren: details.goodForChildren ?? null,
    allowsDogs: details.allowsDogs ?? null,
    restroom: details.restroom ?? null,
    goodForGroups: details.goodForGroups ?? null,
    goodForWatchingSports: details.goodForWatchingSports ?? null,
    timeZoneId: details.timeZone?.id ?? null,
    utcOffsetMinutes: typeof details.utcOffsetMinutes === 'number' ? details.utcOffsetMinutes : null,
    outdoorSeating: details.outdoorSeating ?? null,
    userRatingCount: typeof details.userRatingCount === 'number' ? details.userRatingCount : null,
    websiteUri: details.websiteUri ?? null,
    addressComponentsJson: jsonOrDbNull(details.addressComponents),
    photosJson: jsonOrDbNull(details.photos),
    reviewsJson: jsonOrDbNull(details.reviews),
    paymentOptionsJson: jsonOrDbNull(details.paymentOptions),
    parkingOptionsJson: jsonOrDbNull(details.parkingOptions),
    accessibilityOptionsJson: jsonOrDbNull(details.accessibilityOptions),
    editorialSummaryJson: jsonOrDbNull(details.editorialSummary),
    reviewSummaryJson: jsonOrDbNull(details.reviewSummary),
    generativeSummaryJson: jsonOrDbNull(details.generativeSummary),
    googleMapsLinksJson: jsonOrDbNull(details.googleMapsLinks),
    containingPlacesJson: jsonOrDbNull(details.containingPlaces),
    lastGoogleFetchedAt: new Date(),
  };
}

function formatStoredGooglePriceRange(input: {
  startAmount?: number | null;
  endAmount?: number | null;
  currencyCode?: string | null;
}) {
  const currencyCode = input.currencyCode?.trim();
  if (!currencyCode) return null;

  const formatter = new Intl.NumberFormat(currencyCode === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  });

  const format = (amount: number) => formatter.format(amount).replace(/\s/g, '');
  if (typeof input.startAmount === 'number' && typeof input.endAmount === 'number') {
    return `${format(input.startAmount)}-${format(input.endAmount)}`;
  }
  if (typeof input.startAmount === 'number') return `${format(input.startAmount)}+`;
  if (typeof input.endAmount === 'number') return `<${format(input.endAmount)}`;
  return null;
}

function extractGoogleSummaryText(summary: unknown): string | null {
  if (!summary || typeof summary !== 'object') return null;

  const pickText = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const directText = record.text;
    if (typeof directText === 'string' && directText.trim()) return directText.trim();
    return null;
  };

  const record = summary as Record<string, unknown>;
  const preferredCandidates = [
    record.overview,
    record.text,
    record.summary,
    record.description,
  ];

  for (const candidate of preferredCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    const nestedText = pickText(candidate);
    if (nestedText) return nestedText;
  }

  return pickText(summary);
}

function resolveGoogleSummaryHook(place: {
  generativeSummaryJson?: unknown;
  editorialSummaryJson?: unknown;
  aiEnrichment?: { hook?: string | null } | null;
}) {
  return (
    extractGoogleSummaryText(place.generativeSummaryJson) ??
    extractGoogleSummaryText(place.editorialSummaryJson) ??
    place.aiEnrichment?.hook ??
    ''
  );
}

async function fetchGoogleTextSearch(textQuery: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const placeFieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.location',
    'places.primaryType',
    'places.primaryTypeDisplayName',
    'places.googleMapsTypeLabel',
    'places.types',
    'places.businessStatus',
    'places.openingDate',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.priceRange',
    'places.googleMapsUri',
    'places.googleMapsLinks',
    'places.websiteUri',
    'places.regularOpeningHours.weekdayDescriptions',
    'places.currentOpeningHours.weekdayDescriptions',
    'places.photos',
    'places.addressComponents',
    'places.servesBreakfast',
    'places.servesLunch',
    'places.servesDinner',
    'places.servesBeer',
    'places.servesWine',
    'places.servesBrunch',
    'places.servesDessert',
    'places.servesCoffee',
    'places.servesCocktails',
    'places.servesVegetarianFood',
    'places.takeout',
    'places.delivery',
    'places.dineIn',
    'places.curbsidePickup',
    'places.reservable',
    'places.liveMusic',
    'places.menuForChildren',
    'places.goodForChildren',
    'places.allowsDogs',
    'places.restroom',
    'places.goodForGroups',
    'places.goodForWatchingSports',
    'places.timeZone',
    'places.utcOffsetMinutes',
    'places.outdoorSeating',
    'places.paymentOptions',
    'places.parkingOptions',
    'places.accessibilityOptions',
    'places.editorialSummary',
    'places.reviewSummary',
    'places.generativeSummary',
    'places.containingPlaces',
    'places.reviews',
  ];

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': placeFieldMask.join(','),
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Places text search failed with ${response.status}`);
  }

  return response.json() as Promise<{
    places?: GoogleTextSearchPlace[];
  }>;
}

async function getPlaceSuggestions(input: string) {
  try {
    const googlePredictions = await fetchGooglePlaceSuggestions(input).catch((error) => {
      console.error(error);
      return null;
    });

    if (googlePredictions && googlePredictions.length > 0) {
      const filteredPredictions = googlePredictions;

      if (filteredPredictions.length > 0) {
        const places = await Promise.all(
          filteredPredictions.map(async (prediction) => {
            const mainText = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? 'Unnamed place';
            const secondaryText = prediction.structuredFormat?.secondaryText?.text ?? '';
            const locationBits = parseLocationBits(secondaryText);
            const category = 'recommended spot';

            const place = await prisma.place.upsert({
              where: { googlePlaceId: prediction.placeId },
              update: {
                name: mainText,
                city: locationBits.city,
                country: locationBits.country,
                category,
              },
              create: {
                googlePlaceId: prediction.placeId,
                name: mainText,
                city: locationBits.city,
                country: locationBits.country,
                category,
              },
            });

            return {
              id: place.id,
              name: mainText,
              location: locationBits.location || 'Unknown location',
              description: '',
              image: 'https://placehold.co/800x1000/111111/ffffff?text=Place',
              images: ['https://placehold.co/800x1000/111111/ffffff?text=Place'],
	              tags: [category],
	              similarityStat: 82,
	              whyYoullLikeIt: [],
	              category,
	            };
          }),
        );

        return places;
      }
    }

    const searchResults = await fetchGoogleTextSearch(input).catch((error) => {
      console.error(error);
      return null;
    });

    if (searchResults?.places?.length) {
      const mappedPlaces = await Promise.all(
        searchResults.places
          .filter((place) => isRelevantPredictionType(place.primaryType ?? place.types?.[0]))
          .slice(0, 6)
          .map((place) => mapGoogleSearchPlaceToInternalPlace(place, { queryContext: input })),
      );

      if (mappedPlaces.length > 0) {
        return mappedPlaces;
      }
    }

    return MOCK_PLACES.filter((place) => `${place.name} ${place.location}`.toLowerCase().includes(input.toLowerCase().trim()));
  } catch (error) {
    console.error('Falling back to mock place suggestions', error);
    return MOCK_PLACES.filter((place) => `${place.name} ${place.location}`.toLowerCase().includes(input.toLowerCase().trim()));
  }
}

function mapGoogleAutocompleteSuggestionForClient(
  prediction: GooglePlaceSuggestion,
  options: {
    sessionToken: string;
    locationLabel?: string | null;
  },
) {
  const mainText = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? 'Unnamed place';
  const secondaryText = prediction.structuredFormat?.secondaryText?.text ?? '';
  const locationBits = parseLocationBits(secondaryText);
  const location = locationBits.location || secondaryText || options.locationLabel || 'Google Places';

  return {
    id: `google:${prediction.placeId}`,
    googlePlaceId: prediction.placeId,
    autocompleteSessionToken: options.sessionToken,
    name: mainText,
    location,
    address: secondaryText || undefined,
    description: '',
    hook: '',
    image: 'https://placehold.co/800x1000/111111/ffffff?text=Place',
    images: [],
    tags: [],
    similarityStat: undefined,
    whyYoullLikeIt: [],
    category: 'google place',
  };
}

async function getCheckInPlaceSuggestions(input: string, options: {
  sessionToken: string;
  locationLabel: string;
}) {
  const normalizedInput = input.trim();
  if (normalizedInput.length < 3) return [];

  const predictions = await fetchGooglePlaceSuggestions(normalizedInput, {
    sessionToken: options.sessionToken,
    locationLabel: options.locationLabel,
  }).catch((error) => {
    console.error(error);
    return null;
  });

  return (predictions ?? []).map((prediction) => mapGoogleAutocompleteSuggestionForClient(prediction, options));
}

const INITIAL_LOCATION_FALLBACKS = [
  { id: 'boston', label: 'Boston', type: 'city' as const },
  { id: 'new-york', label: 'New York', type: 'city' as const },
  { id: 'jakarta', label: 'Jakarta', type: 'city' as const },
  { id: 'bandung', label: 'Bandung', type: 'city' as const },
];

function scoreLocationKeywordMatch(label: string, query: string) {
  const normalizedLabel = label.toLowerCase().trim();
  const normalizedQuery = query.toLowerCase().trim();

  if (normalizedLabel === normalizedQuery) return 400;
  if (normalizedLabel.startsWith(normalizedQuery)) return 300;

  const words = normalizedLabel.split(/[\s,-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(normalizedQuery))) return 220;
  if (normalizedLabel.includes(normalizedQuery)) return 140;

  return -1;
}

function getFallbackLocationSuggestions(query: string) {
  return INITIAL_LOCATION_FALLBACKS
    .map((location) => ({
      location,
      score: scoreLocationKeywordMatch(location.label, query),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.location.label.localeCompare(right.location.label);
    })
    .map((entry) => entry.location);
}

async function getLocationSuggestions(input: string) {
  const normalizedInput = input.trim();
  if (normalizedInput.length < 3) return [];
  return getFallbackLocationSuggestions(normalizedInput);
}

async function mapGoogleSearchPlaceToInternalPlace(rawPlace: GoogleTextSearchPlace, options?: {
  queryContext?: string;
  discoverySignals?: PlaceDiscoverySignalInput[];
}) {
  const effectiveDisplayName = rawPlace.displayName?.text ?? 'Unnamed place';
  const effectiveAddress = rawPlace.formattedAddress;
  const effectiveLocation = rawPlace.location;
  const effectivePrimaryType = rawPlace.primaryType;
  const effectiveTypes = rawPlace.types;
  const effectiveRating = rawPlace.rating ?? null;
  const effectiveUserRatingCount = rawPlace.userRatingCount ?? null;
  const effectivePriceLevel = mapGooglePriceLevel(rawPlace.priceLevel);
  const effectivePriceRange = normalizeGooglePriceRange(rawPlace.priceRange);
  const effectivePhotoRefs = rawPlace.photos ?? [];
  const googleDetailColumns = mapGooglePlaceDetailColumns(rawPlace);
  const googlePlaceColumns = {
    googleDisplayName: effectiveDisplayName,
    shortFormattedAddress: rawPlace.shortFormattedAddress ?? null,
    googleTypes: effectiveTypes ?? [],
    googlePrimaryType: effectivePrimaryType ?? null,
    googlePrimaryTypeDisplayName: rawPlace.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: rawPlace.googleMapsTypeLabel?.text ?? null,
    businessStatus: rawPlace.businessStatus ?? null,
    userRatingCount: effectiveUserRatingCount,
    photosJson: jsonOrDbNull(effectivePhotoRefs),
    ...googleDetailColumns,
  };
  const locationBits = parseLocationBits(effectiveAddress);
  const category = (effectivePrimaryType ?? effectiveTypes?.[0] ?? 'recommended spot').replace(/_/g, ' ');
  const existingPlace = await prisma.place.findUnique({
    where: { googlePlaceId: rawPlace.id },
    select: { id: true },
  });
  const isNewPlace = !existingPlace;
  // Resolve a small number of renderable photo URLs only when the place is first
  // acquired. Existing places keep their current media to avoid recurring photo
  // requests on later query runs.
  const photoUris = isNewPlace && effectivePhotoRefs.length
    ? await fetchGooglePhotoUris(effectivePhotoRefs.map((photo) => photo.name), 3).catch((error) => {
        console.error(error);
        return [];
      })
    : [];
  const photoUri = photoUris[0] ?? null;
  const neighborhoodBits = extractNeighborhoodFromAddressComponents(rawPlace.addressComponents);

  const place = await prisma.place.upsert({
    where: { googlePlaceId: rawPlace.id },
    update: {
      name: effectiveDisplayName,
      address: effectiveAddress,
      city: locationBits.city,
      country: locationBits.country,
      neighborhood: neighborhoodBits.neighborhood ?? undefined,
      adminAreaLevel4: neighborhoodBits.adminAreaLevel4 ?? undefined,
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      ...googlePlaceColumns,
	      rating: effectiveRating,
	      priceLevel: effectivePriceLevel,
	      googlePriceRangeStart: effectivePriceRange?.startAmount ?? null,
	      googlePriceRangeEnd: effectivePriceRange?.endAmount ?? null,
	      googlePriceRangeCurrency: effectivePriceRange?.currencyCode ?? null,
	      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: rawPlace.googleMapsUri ?? undefined,
      media: photoUris.length > 0
        ? {
            deleteMany: {},
            create: photoUris.map((uri, index) => ({
              mediaType: 'image',
              url: uri,
              sortOrder: index,
              source: 'google-places',
            })),
          }
        : undefined,
    },
    create: {
      googlePlaceId: rawPlace.id,
      name: effectiveDisplayName,
      address: effectiveAddress,
      city: locationBits.city,
      country: locationBits.country,
      neighborhood: neighborhoodBits.neighborhood ?? null,
      adminAreaLevel4: neighborhoodBits.adminAreaLevel4 ?? null,
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      ...googlePlaceColumns,
	      rating: effectiveRating,
	      priceLevel: effectivePriceLevel,
	      googlePriceRangeStart: effectivePriceRange?.startAmount ?? null,
	      googlePriceRangeEnd: effectivePriceRange?.endAmount ?? null,
	      googlePriceRangeCurrency: effectivePriceRange?.currencyCode ?? null,
	      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: rawPlace.googleMapsUri ?? null,
      media: photoUris.length > 0
        ? {
            create: photoUris.map((uri, index) => ({
                mediaType: 'image',
                url: uri,
                sortOrder: index,
                source: 'google-places',
              })),
          }
        : undefined,
    },
  });

  if (options?.discoverySignals?.length) {
    for (const signal of options.discoverySignals) {
      await persistGooglePlaceSnapshot({
        placeId: place.id,
        googlePlaceId: rawPlace.id,
        source: 'TEXT_SEARCH',
        queryContext: signal.queryText,
        payload: signal.payload ?? rawPlace,
      });
    }

    await persistPlaceDiscoverySignals({
      placeId: place.id,
      googlePlaceId: rawPlace.id,
      signals: options.discoverySignals,
    });
  } else {
    await persistGooglePlaceSnapshot({
      placeId: place.id,
      googlePlaceId: rawPlace.id,
      source: 'TEXT_SEARCH',
      queryContext: options?.queryContext ?? null,
      payload: rawPlace,
    });
  }

  const deterministicEnrichment = generateDeterministicPlaceEnrichment({
    name: effectiveDisplayName,
    address: effectiveAddress,
    city: locationBits.city,
    country: locationBits.country,
    neighborhood: neighborhoodBits.neighborhood,
    adminAreaLevel4: neighborhoodBits.adminAreaLevel4,
    category,
    rating: effectiveRating,
    priceLevel: effectivePriceLevel,
    userRatingCount: effectiveUserRatingCount,
    googlePrimaryType: effectivePrimaryType,
    googlePrimaryTypeDisplayName: rawPlace.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: rawPlace.googleMapsTypeLabel?.text ?? null,
    googleTypes: effectiveTypes ?? [],
    servesBreakfast: rawPlace.servesBreakfast ?? null,
    servesLunch: rawPlace.servesLunch ?? null,
    servesDinner: rawPlace.servesDinner ?? null,
    servesBeer: rawPlace.servesBeer ?? null,
    servesWine: rawPlace.servesWine ?? null,
    servesBrunch: rawPlace.servesBrunch ?? null,
    servesDessert: rawPlace.servesDessert ?? null,
    servesCoffee: rawPlace.servesCoffee ?? null,
    servesCocktails: rawPlace.servesCocktails ?? null,
    goodForGroups: rawPlace.goodForGroups ?? null,
    goodForWatchingSports: rawPlace.goodForWatchingSports ?? null,
    outdoorSeating: rawPlace.outdoorSeating ?? null,
    discoverySignals: options?.discoverySignals ?? [],
  });

  if (!ENABLE_RUNTIME_AI) {
    await prisma.placeAiEnrichment.upsert({
      where: { placeId: place.id },
      update: deterministicEnrichment,
      create: {
        placeId: place.id,
        ...deterministicEnrichment,
      },
    });
  }

  return {
    id: place.id,
    googlePlaceId: rawPlace.id,
    name: effectiveDisplayName,
    location: [locationBits.city, locationBits.country].filter(Boolean).join(', ') || effectiveAddress || 'Unknown location',
    description: deterministicEnrichment.description ?? '',
    hook: resolveGoogleSummaryHook({ ...place, aiEnrichment: deterministicEnrichment }),
    image: photoUri ?? place.primaryImageUrl ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
    images: photoUris.length > 0 ? photoUris : [place.primaryImageUrl ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place'],
	    tags: deterministicEnrichment.vibeTags,
      attitudeLabel: deterministicEnrichment.attitudeLabel,
      bestTime: deterministicEnrichment.bestTime,
	    similarityStat: 82,
	    whyYoullLikeIt: [
        deterministicEnrichment.description,
        deterministicEnrichment.bestTime ? `best at ${deterministicEnrichment.bestTime}` : null,
      ].filter((item): item is string => Boolean(item)),
	    priceRange: formatStoredGooglePriceRange({
	      startAmount: effectivePriceRange?.startAmount,
	      endAmount: effectivePriceRange?.endAmount,
	      currencyCode: effectivePriceRange?.currencyCode,
	    }) ?? undefined,
	    priceRangeLabel: formatStoredGooglePriceRange({
	      startAmount: effectivePriceRange?.startAmount,
	      endAmount: effectivePriceRange?.endAmount,
	      currencyCode: effectivePriceRange?.currencyCode,
	    }) ?? undefined,
	    openingHours: place.openingHours.length > 0 ? place.openingHours : undefined,
	    servesBreakfast: place.servesBreakfast ?? undefined,
	    servesLunch: place.servesLunch ?? undefined,
	    servesDinner: place.servesDinner ?? undefined,
	    servesBeer: place.servesBeer ?? undefined,
	    servesWine: place.servesWine ?? undefined,
	    servesBrunch: place.servesBrunch ?? undefined,
	    servesDessert: place.servesDessert ?? undefined,
	    servesCoffee: place.servesCoffee ?? undefined,
	    servesCocktails: place.servesCocktails ?? undefined,
	    goodForGroups: place.goodForGroups ?? undefined,
	    goodForWatchingSports: place.goodForWatchingSports ?? undefined,
	    timeZone: place.timeZoneId ?? undefined,
	    utcOffsetMinutes: place.utcOffsetMinutes ?? undefined,
	    outdoors: place.outdoorSeating ?? undefined,
	    outdoorSeating: place.outdoorSeating ?? undefined,
	    category,
	  };
}

async function acquireCheckInPlaceFromGoogleDetails(input: {
  googlePlaceId: string;
  sessionToken?: string | null;
  locationLabel?: string | null;
}) {
  const googlePlaceId = input.googlePlaceId.trim();
  if (!googlePlaceId) throw new Error('googlePlaceId is required');

  const existingPlace = await prisma.place.findUnique({
    where: { googlePlaceId },
    select: {
      id: true,
      address: true,
      lastGoogleFetchedAt: true,
      primaryImageUrl: true,
      media: {
        select: { id: true },
        take: 1,
      },
    },
  });

  const needsDetails = !existingPlace || !existingPlace.lastGoogleFetchedAt || !existingPlace.address;
  if (existingPlace && !needsDetails) {
    return existingPlace;
  }

  const details = await fetchGooglePlaceDetails(googlePlaceId, {
    sessionToken: input.sessionToken,
  });

  if (!details) {
    throw new Error('Google Place Details is unavailable');
  }

  const effectiveDisplayName = details.displayName?.text ?? 'Unnamed place';
  const effectiveAddress = details.formattedAddress;
  const effectiveLocation = details.location;
  const effectivePrimaryType = details.primaryType;
  const effectiveTypes = details.types;
  const effectiveRating = details.rating ?? null;
  const effectiveUserRatingCount = details.userRatingCount ?? null;
  const effectivePriceLevel = mapGooglePriceLevel(details.priceLevel);
  const effectivePriceRange = normalizeGooglePriceRange(details.priceRange);
  const effectivePhotoRefs = details.photos ?? [];
  const locationBits = parseLocationBits(effectiveAddress);
  const neighborhoodBits = extractNeighborhoodFromAddressComponents(details.addressComponents);
  const category = (effectivePrimaryType ?? effectiveTypes?.[0] ?? 'recommended spot').replace(/_/g, ' ');
  const googlePlaceColumns = {
    googleDisplayName: effectiveDisplayName,
    shortFormattedAddress: details.shortFormattedAddress ?? null,
    googleTypes: effectiveTypes ?? [],
    googlePrimaryType: effectivePrimaryType ?? null,
    googlePrimaryTypeDisplayName: details.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: details.googleMapsTypeLabel?.text ?? null,
    businessStatus: details.businessStatus ?? null,
    userRatingCount: effectiveUserRatingCount,
    photosJson: jsonOrDbNull(effectivePhotoRefs),
    ...mapGooglePlaceDetailColumns(details),
  };

  const shouldFetchPhotos = !existingPlace || (!existingPlace.primaryImageUrl && existingPlace.media.length === 0);
  const photoUris = shouldFetchPhotos && effectivePhotoRefs.length > 0
    ? await fetchGooglePhotoUris(effectivePhotoRefs.map((photo) => photo.name), 3).catch((error) => {
        console.error(error);
        return [];
      })
    : [];
  const photoUri = photoUris[0] ?? null;

  const place = await prisma.place.upsert({
    where: { googlePlaceId },
    update: {
      name: effectiveDisplayName,
      address: effectiveAddress,
      city: locationBits.city,
      country: locationBits.country,
      neighborhood: neighborhoodBits.neighborhood ?? undefined,
      adminAreaLevel4: neighborhoodBits.adminAreaLevel4 ?? undefined,
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      ...googlePlaceColumns,
      rating: effectiveRating,
      priceLevel: effectivePriceLevel,
      googlePriceRangeStart: effectivePriceRange?.startAmount ?? null,
      googlePriceRangeEnd: effectivePriceRange?.endAmount ?? null,
      googlePriceRangeCurrency: effectivePriceRange?.currencyCode ?? null,
      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: details.googleMapsUri ?? undefined,
      media: photoUris.length > 0
        ? {
            deleteMany: {},
            create: photoUris.map((uri, index) => ({
              mediaType: 'image',
              url: uri,
              sortOrder: index,
              source: 'google-places',
            })),
          }
        : undefined,
    },
    create: {
      googlePlaceId,
      name: effectiveDisplayName,
      address: effectiveAddress,
      city: locationBits.city,
      country: locationBits.country,
      neighborhood: neighborhoodBits.neighborhood ?? null,
      adminAreaLevel4: neighborhoodBits.adminAreaLevel4 ?? null,
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      ...googlePlaceColumns,
      rating: effectiveRating,
      priceLevel: effectivePriceLevel,
      googlePriceRangeStart: effectivePriceRange?.startAmount ?? null,
      googlePriceRangeEnd: effectivePriceRange?.endAmount ?? null,
      googlePriceRangeCurrency: effectivePriceRange?.currencyCode ?? null,
      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: details.googleMapsUri ?? null,
      media: photoUris.length > 0
        ? {
            create: photoUris.map((uri, index) => ({
              mediaType: 'image',
              url: uri,
              sortOrder: index,
              source: 'google-places',
            })),
          }
        : undefined,
    },
  });

  await persistGooglePlaceSnapshot({
    placeId: place.id,
    googlePlaceId,
    source: 'PLACE_DETAILS',
    queryContext: ['check_in', input.locationLabel].filter(Boolean).join(':') || 'check_in',
    payload: details,
  });

  const deterministicEnrichment = generateDeterministicPlaceEnrichment({
    name: effectiveDisplayName,
    address: effectiveAddress,
    city: locationBits.city,
    country: locationBits.country,
    neighborhood: neighborhoodBits.neighborhood,
    adminAreaLevel4: neighborhoodBits.adminAreaLevel4,
    category,
    rating: effectiveRating,
    priceLevel: effectivePriceLevel,
    userRatingCount: effectiveUserRatingCount,
    googlePrimaryType: effectivePrimaryType,
    googlePrimaryTypeDisplayName: details.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: details.googleMapsTypeLabel?.text ?? null,
    googleTypes: effectiveTypes ?? [],
    servesBreakfast: details.servesBreakfast ?? null,
    servesLunch: details.servesLunch ?? null,
    servesDinner: details.servesDinner ?? null,
    servesBeer: details.servesBeer ?? null,
    servesWine: details.servesWine ?? null,
    servesBrunch: details.servesBrunch ?? null,
    servesDessert: details.servesDessert ?? null,
    servesCoffee: details.servesCoffee ?? null,
    servesCocktails: details.servesCocktails ?? null,
    goodForGroups: details.goodForGroups ?? null,
    goodForWatchingSports: details.goodForWatchingSports ?? null,
    outdoorSeating: details.outdoorSeating ?? null,
    discoverySignals: [],
  });

  await prisma.placeAiEnrichment.upsert({
    where: { placeId: place.id },
    update: deterministicEnrichment,
    create: {
      placeId: place.id,
      ...deterministicEnrichment,
    },
  });

  return place;
}

function normalizePlaceCategory(category?: string | null, tags: string[] = []) {
  const trimmedCategory = category?.trim();
  if (trimmedCategory) return trimmedCategory;

  const firstTag = tags.find((tag) => tag?.trim());
  if (firstTag) return firstTag.replace(/[_-]+/g, ' ');

  return 'recommended spot';
}

function buildDiscoveryDisplayTags(
  attitudeLabel?: string | null,
  vibeTags: string[] = [],
  category?: string | null,
) {
  const seen = new Set<string>();
  const candidates = [
    attitudeLabel?.trim() ?? '',
    ...vibeTags.map((tag) => tag?.trim() ?? ''),
    category?.trim() ?? '',
  ];

  return candidates
    .filter(Boolean)
    .filter((value) => {
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 5);
}

function buildDeterministicDiscoveryTags(input: {
  category?: string | null;
  rating?: number | null;
  priceLevel?: number | null;
}) {
  const tags: string[] = [];

  const rawCategory = (input.category ?? '').trim().toLowerCase();
  const category = rawCategory.replace(/[_-]+/g, ' ');

  const push = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return;
    if (tags.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) return;
    tags.push(normalized);
  };

  // 1) Primary type/category tag (most specific we have without AI).
  if (category) {
    const categoryTag = (() => {
      if (category.includes('coffee')) return 'coffee';
      if (category.includes('cafe')) return 'cafe';
      if (category.includes('bakery')) return 'bakery';
      if (category.includes('dessert') || category.includes('ice cream')) return 'dessert';
      if (category.includes('sushi')) return 'sushi';
      if (category.includes('ramen')) return 'ramen';
      if (category.includes('noodle')) return 'noodles';
      if (category.includes('korean')) return 'korean';
      if (category.includes('japanese')) return 'japanese';
      if (category.includes('thai')) return 'thai';
      if (category.includes('vietnamese')) return 'vietnamese';
      if (category.includes('chinese')) return 'chinese';
      if (category.includes('bar') || category.includes('cocktail')) return 'drinks';
      if (category.includes('museum') || category.includes('art gallery') || category.includes('gallery')) return 'culture';
      if (category.includes('book store') || category.includes('bookstore')) return 'bookstore';
      if (category.includes('park') || category.includes('garden') || category.includes('state park')) return 'outdoors';
      if (category.includes('restaurant')) return 'restaurant';
      return input.category?.trim() ?? '';
    })();

    push(categoryTag);
  }

  // 2) Meta tags from normalized Place fields.
  const rating = typeof input.rating === 'number' ? input.rating : null;
  if (rating != null) {
    if (rating >= 4.7) push("top rated");
    else if (rating >= 4.5) push("highly rated");
  }

  const priceRange = mapPriceLevel(input.priceLevel);
  if (priceRange && priceRange !== 'Free') push(priceRange);

  return tags.slice(0, 5);
}

function dedupeQueries(queries: string[]) {
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function dedupeQueryDescriptors(queries: PreferenceDrivenQueryDescriptor[]) {
  const seen = new Set<string>();
  const deduped: PreferenceDrivenQueryDescriptor[] = [];

  for (const query of queries) {
    const queryText = query.queryText.trim();
    if (!queryText || seen.has(queryText)) continue;
    seen.add(queryText);
    deduped.push({ ...query, queryText });
  }

  return deduped;
}

function buildPreferenceDrivenQueryDescriptors(
  locationLabel: string,
  locationType: string | undefined,
  selectedInterests: string[],
  selectedVibe?: string | null,
) {
  const q = (
    queryText: string,
    queryType: PreferenceDrivenQueryDescriptor['queryType'],
    preferenceCategory?: string,
  ): PreferenceDrivenQueryDescriptor => ({
    queryText,
    queryType,
    preferenceCategory,
    selectedVibe: queryType === 'vibe' ? selectedVibe ?? undefined : undefined,
  });

  const locationQueries =
    locationType === 'country'
      ? [
          q(`top travel spots in ${locationLabel}`, 'location'),
          q(`best cultural places in ${locationLabel}`, 'location'),
          q(`hidden gems in ${locationLabel}`, 'location'),
        ]
      : locationType === 'province'
        ? [
            q(`best places to visit in ${locationLabel}`, 'location'),
            q(`hidden gems in ${locationLabel}`, 'location'),
            q(`best cafes and viewpoints in ${locationLabel}`, 'location'),
          ]
        : [
            q(`best places to visit in ${locationLabel}`, 'location'),
            q(`hidden gems in ${locationLabel}`, 'location'),
          ];

  const interestQueries = selectedInterests.flatMap((interest) => {
    switch (interest) {
      case 'good_coffee':
        return [
          q(`best coffee in ${locationLabel}`, 'interest', interest),
          q(`specialty coffee in ${locationLabel}`, 'interest', interest),
          q(`good espresso bar in ${locationLabel}`, 'interest', interest),
        ];
      case 'aesthetic_cafes':
        return [
          q(`aesthetic cafe in ${locationLabel}`, 'interest', interest),
          q(`cute cafe in ${locationLabel}`, 'interest', interest),
          q(`instagrammable cafe in ${locationLabel}`, 'interest', interest),
        ];
      case 'desserts_sweet_treats':
        return [
          q(`best desserts in ${locationLabel}`, 'interest', interest),
          q(`sweet treats in ${locationLabel}`, 'interest', interest),
          q(`dessert cafe in ${locationLabel}`, 'interest', interest),
        ];
      case 'street_food_casual_eats':
        return [
          q(`best casual eats in ${locationLabel}`, 'interest', interest),
          q(`street food in ${locationLabel}`, 'interest', interest),
          q(`cheap eats in ${locationLabel}`, 'interest', interest),
        ];
      case 'asian_comfort_food':
        return [
          q(`best ramen in ${locationLabel}`, 'interest', interest),
          q(`best sushi in ${locationLabel}`, 'interest', interest),
          q(`asian comfort food in ${locationLabel}`, 'interest', interest),
        ];
      case 'drinks_nightlife':
        return [
          q(`best bars in ${locationLabel}`, 'interest', interest),
          q(`nightlife in ${locationLabel}`, 'interest', interest),
          q(`cocktail bar in ${locationLabel}`, 'interest', interest),
        ];
      case 'shop_stroll':
        return [
          q(`best local boutiques in ${locationLabel}`, 'interest', interest),
          q(`shopping streets in ${locationLabel}`, 'interest', interest),
          q(`best area to walk and shop in ${locationLabel}`, 'interest', interest),
        ];
      case 'fun_activities':
        return [
          q(`fun things to do in ${locationLabel}`, 'interest', interest),
          q(`cool activities in ${locationLabel}`, 'interest', interest),
          q(`unique places to visit in ${locationLabel}`, 'interest', interest),
        ];
      case 'parks_outdoor':
        return [
          q(`best parks in ${locationLabel}`, 'interest', interest),
          q(`best outdoor spots in ${locationLabel}`, 'interest', interest),
          q(`scenic walk in ${locationLabel}`, 'interest', interest),
        ];
      case 'nature':
        return [
          q(`best parks in ${locationLabel}`, 'interest', interest),
          q(`nature spots in ${locationLabel}`, 'interest', interest),
          q(`scenic walks in ${locationLabel}`, 'interest', interest),
        ];
      case 'cafe':
        return [
          q(`best cafes in ${locationLabel}`, 'interest', interest),
          q(`aesthetic cafes in ${locationLabel}`, 'interest', interest),
          q(`specialty coffee in ${locationLabel}`, 'interest', interest),
        ];
      case 'culture':
        return [
          q(`best cultural spots in ${locationLabel}`, 'interest', interest),
          q(`art museums in ${locationLabel}`, 'interest', interest),
          q(`historic districts in ${locationLabel}`, 'interest', interest),
        ];
      case 'shopping':
        return [
          q(`best concept stores in ${locationLabel}`, 'interest', interest),
          q(`local markets in ${locationLabel}`, 'interest', interest),
          q(`shopping streets in ${locationLabel}`, 'interest', interest),
        ];
      case 'party':
        return [
          q(`best nightlife in ${locationLabel}`, 'interest', interest),
          q(`live music bars in ${locationLabel}`, 'interest', interest),
          q(`cocktail bars in ${locationLabel}`, 'interest', interest),
        ];
      case 'adventure':
        return [
          q(`outdoor activities in ${locationLabel}`, 'interest', interest),
          q(`hikes near ${locationLabel}`, 'interest', interest),
          q(`adventure spots in ${locationLabel}`, 'interest', interest),
        ];
      default:
        return [];
    }
  });

  const vibeQueries = selectedVibe
    ? (() => {
        switch (selectedVibe) {
          case 'aesthetic':
            return [
              q(`aesthetic places in ${locationLabel}`, 'vibe'),
              q(`design spots in ${locationLabel}`, 'vibe'),
            ];
          case 'solo':
            return [
              q(`quiet places in ${locationLabel}`, 'vibe'),
              q(`solo friendly spots in ${locationLabel}`, 'vibe'),
            ];
          case 'luxury':
            return [
              q(`luxury experiences in ${locationLabel}`, 'vibe'),
              q(`high end places in ${locationLabel}`, 'vibe'),
            ];
          case 'budget':
            return [
              q(`budget friendly places in ${locationLabel}`, 'vibe'),
              q(`cheap hidden gems in ${locationLabel}`, 'vibe'),
            ];
          case 'spontaneous':
            return [
              q(`walkable spots in ${locationLabel}`, 'vibe'),
              q(`easy last minute plans in ${locationLabel}`, 'vibe'),
            ];
          default:
            return [];
        }
      })()
    : [];

  return dedupeQueryDescriptors([
    ...interestQueries,
    ...vibeQueries,
    ...locationQueries,
  ]).slice(0, 12);
}

function buildPreferenceDrivenQueries(
  locationLabel: string,
  locationType: string | undefined,
  selectedInterests: string[],
  selectedVibe?: string | null,
) {
  return buildPreferenceDrivenQueryDescriptors(locationLabel, locationType, selectedInterests, selectedVibe)
    .map((query) => query.queryText);
}

async function getDiscoveryPlacesByLocation(
  locationLabel: string,
  locationType?: string,
  selectedInterests: string[] = [],
  selectedVibe?: string | null,
) {
  const queryDescriptors = buildPreferenceDrivenQueryDescriptors(locationLabel, locationType, selectedInterests, selectedVibe);
  const queries = queryDescriptors.map((query) => query.queryText);

  const searchResults = await Promise.all(
    queryDescriptors.map((query) =>
      fetchGoogleTextSearch(query.queryText).then((result) => ({
        query,
        result,
      })).catch((error) => {
        console.error(error);
        return null;
      }),
    ),
  );

  const mergedPlaces = searchResults.flatMap((entry) =>
    entry?.result?.places?.map((place, index) => ({
      place,
      signal: {
        ...entry.query,
        resultRank: index + 1,
        locationLabel,
        locationType: locationType ?? 'city',
        payload: place,
      },
    })) ?? [],
  );
  const seenPlaceIds = new Set<string>();
  const relevantPlaces = mergedPlaces.filter((entry) => {
    const place = entry.place;
    if (!isRelevantPredictionType(place.primaryType ?? place.types?.[0])) {
      return false;
    }
    if (seenPlaceIds.has(place.id)) {
      return false;
    }
    seenPlaceIds.add(place.id);
    return true;
  });

  if (relevantPlaces.length > 0) {
    const signalsByGooglePlaceId = new Map<string, PlaceDiscoverySignalInput[]>();
    for (const entry of mergedPlaces) {
      const signals = signalsByGooglePlaceId.get(entry.place.id) ?? [];
      signals.push(entry.signal);
      signalsByGooglePlaceId.set(entry.place.id, signals);
    }

    const mappedPlaces = await Promise.all(
      relevantPlaces.slice(0, 36).map(({ place }) =>
        mapGoogleSearchPlaceToInternalPlace(place, {
          queryContext: queries.join(' | '),
          discoverySignals: signalsByGooglePlaceId.get(place.id) ?? [],
        }).catch((error) => {
          console.error('Discovery Google place mapping failed', {
            googlePlaceId: place.id,
            displayName: place.displayName?.text ?? null,
            primaryType: place.primaryType ?? place.types?.[0] ?? null,
            error,
          });
          return null;
        }),
      ),
    );

    const validMappedPlaces = mappedPlaces.filter((place): place is NonNullable<typeof place> => Boolean(place));

    if (validMappedPlaces.length > 0) {
      return validMappedPlaces;
    }
  }

  return MOCK_PLACES.filter((place) => place.location.toLowerCase().includes(locationLabel.toLowerCase()));
}

async function getOrCreateDiscoveryLocation(locationLabel: string, locationType?: string) {
  const normalizedName = locationLabel.trim();
  const normalizedType = normalizeLocationType(locationType);

  const existing = await prisma.location.findFirst({
    where: {
      name: normalizedName,
      type: normalizedType,
    },
  });

  if (existing) return existing;

  return prisma.location.create({
    data: {
      name: normalizedName,
      type: normalizedType,
      discoverySeedVersion: 'city-pool-v2',
    },
  });
}

function buildLocationWhere(locationLabel: string, locationType?: string): Prisma.PlaceWhereInput {
  const normalizedLabel = locationLabel.trim();
  const containsFilter = {
    contains: normalizedLabel,
    mode: 'insensitive' as const,
  };

  if (locationType === 'country') {
    return {
      OR: [
        { country: containsFilter },
        { address: containsFilter },
      ],
    };
  }

  if (locationType === 'province') {
    return {
      OR: [
        { address: containsFilter },
        { city: containsFilter },
        { country: containsFilter },
      ],
    };
  }

  return {
    OR: [
      { city: containsFilter },
      { address: containsFilter },
    ],
  };
}

function mapCachedPlaceForDiscovery(place: Prisma.PlaceGetPayload<{
  include: {
    aiEnrichment: true;
    media: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
    discoverySignals: {
      orderBy: [
        { bestResultRank: 'asc' },
        { resultRank: 'asc' },
        { lastSeenAt: 'desc' },
      ];
      take: 30;
    };
  };
}>) {
  const image = place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place';
  const fallbackEnrichment = generateDeterministicPlaceEnrichment({
    name: place.name,
    address: place.address,
    city: place.city,
    country: place.country,
    neighborhood: place.neighborhood,
    adminAreaLevel4: place.adminAreaLevel4,
    category: place.category,
    rating: place.rating ?? null,
    priceLevel: place.priceLevel ?? null,
    userRatingCount: place.userRatingCount ?? null,
    googlePrimaryType: place.googlePrimaryType,
    googlePrimaryTypeDisplayName: place.googlePrimaryTypeDisplayName,
    googleMapsTypeLabel: place.googleMapsTypeLabel,
    googleTypes: place.googleTypes,
    servesBreakfast: place.servesBreakfast,
    servesLunch: place.servesLunch,
    servesDinner: place.servesDinner,
    servesBeer: place.servesBeer,
    servesWine: place.servesWine,
    servesBrunch: place.servesBrunch,
    servesDessert: place.servesDessert,
    servesCoffee: place.servesCoffee,
    servesCocktails: place.servesCocktails,
    goodForGroups: place.goodForGroups,
    goodForWatchingSports: place.goodForWatchingSports,
    outdoorSeating: place.outdoorSeating,
    discoverySignals: place.discoverySignals,
  });
  const editorial = place.aiEnrichment ?? fallbackEnrichment;
  const tags = editorial.vibeTags?.length ? editorial.vibeTags : buildDeterministicDiscoveryTags({
    category: place.category,
    rating: place.rating ?? null,
    priceLevel: place.priceLevel ?? null,
  });
  const category = normalizePlaceCategory(place.category, tags);
  const neighborhoodLabel = place.neighborhood ?? place.adminAreaLevel4 ?? undefined;
  const priceRangeLabel = formatStoredGooglePriceRange({
    startAmount: place.googlePriceRangeStart,
    endAmount: place.googlePriceRangeEnd,
    currencyCode: place.googlePriceRangeCurrency,
  }) ?? undefined;
  return {
    id: place.id,
    name: place.name,
    location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
    address: place.address ?? undefined,
    neighborhood: neighborhoodLabel,
    description: editorial.description ?? '',
    hook: resolveGoogleSummaryHook({ ...place, aiEnrichment: editorial }),
    image,
    images: place.media.length > 0 ? place.media.map((item) => item.url) : [image],
    tags,
    attitudeLabel: editorial.attitudeLabel ?? undefined,
    bestTime: editorial.bestTime ?? undefined,
    openingHours: place.openingHours.length > 0 ? place.openingHours : undefined,
    servesBreakfast: place.servesBreakfast ?? undefined,
    servesLunch: place.servesLunch ?? undefined,
    servesDinner: place.servesDinner ?? undefined,
    servesBeer: place.servesBeer ?? undefined,
    servesWine: place.servesWine ?? undefined,
    servesBrunch: place.servesBrunch ?? undefined,
    servesDessert: place.servesDessert ?? undefined,
    servesCoffee: place.servesCoffee ?? undefined,
    servesCocktails: place.servesCocktails ?? undefined,
    goodForGroups: place.goodForGroups ?? undefined,
    goodForWatchingSports: place.goodForWatchingSports ?? undefined,
    timeZone: place.timeZoneId ?? undefined,
    utcOffsetMinutes: place.utcOffsetMinutes ?? undefined,
    outdoors: place.outdoorSeating ?? undefined,
    outdoorSeating: place.outdoorSeating ?? undefined,
    similarityStat: 82,
    whyYoullLikeIt: [
      ...(editorial.description ? [editorial.description] : []),
      ...(editorial.bestTime ? [`best at ${editorial.bestTime}`] : []),
    ],
    rating: place.rating ?? undefined,
    priceRange: priceRangeLabel,
    priceRangeLabel,
    category,
    topBadgeLabel: buildDiscoveryTopBadgeLabel(place.discoverySignals),
    discoveryTopRank: buildDiscoveryTopRank(place.discoverySignals),
    discoverySignals: mapDiscoverySignalsForClient(place.discoverySignals),
    tabIds: buildDiscoveryTabIdsForPlace({
      category,
      servesCoffee: place.servesCoffee,
      servesDessert: place.servesDessert,
      servesBeer: place.servesBeer,
      servesWine: place.servesWine,
      discoverySignals: place.discoverySignals,
    }),
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
  };
}

function mapDiscoverySignalsForClient(signals: PlaceDiscoverySignalForScoring[] = []) {
  return signals.map((signal) => ({
    queryText: signal.queryText ?? undefined,
    queryType: signal.queryType ?? undefined,
    preferenceCategory: signal.preferenceCategory ?? undefined,
    resultRank: signal.resultRank ?? undefined,
    bestResultRank: signal.bestResultRank ?? undefined,
    seenCount: signal.seenCount ?? undefined,
  }));
}

function buildDiscoveryTopBadgeLabel(signals: PlaceDiscoverySignalForScoring[] = []) {
  const topSignal = signals
    .map((signal) => {
      const queryText = signal.queryText?.trim();
      const rank = signal.bestResultRank ?? signal.resultRank ?? null;
      if (!queryText || typeof rank !== 'number') return null;
      return { queryText, rank };
    })
    .filter((signal): signal is { queryText: string; rank: number } => Boolean(signal))
    .sort((left, right) => left.rank - right.rank)[0];

  return topSignal ? `Top ${topSignal.rank} ${topSignal.queryText}` : undefined;
}

function buildDiscoveryTopRank(signals: PlaceDiscoverySignalForScoring[] = []) {
  const ranks = signals
    .map((signal) => signal.bestResultRank ?? signal.resultRank ?? null)
    .filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank));
  const topRank = ranks.length > 0 ? Math.min(...ranks) : null;
  return topRank !== null && topRank >= 1 && topRank <= 3 ? topRank : undefined;
}

async function getCachedDiscoveryPlacesByLocation(locationLabel: string, locationType?: string) {
  const places = await prisma.place.findMany({
    where: buildLocationWhere(locationLabel, locationType),
    include: {
      aiEnrichment: true,
      media: {
        orderBy: { sortOrder: 'asc' },
      },
      discoverySignals: {
        orderBy: [
          { bestResultRank: 'asc' },
          { resultRank: 'asc' },
          { lastSeenAt: 'desc' },
        ],
        take: 30,
      },
    },
    take: 120,
    orderBy: [
      { rating: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  return places.flatMap((place) => {
    try {
      return [mapCachedPlaceForDiscovery(place)];
    } catch (error) {
      console.error('Cached discovery place mapping failed', {
        placeId: place.id,
        name: place.name,
        category: place.category,
        error,
      });
      return [];
    }
  });
}

function normalizeDiscoverySearchQuery(input?: string | null) {
  return input?.trim().toLowerCase() ?? '';
}

function placeMatchesDiscoverySearch(place: ReturnType<typeof mapCachedPlaceForDiscovery>, searchQuery: string) {
  const normalizedQuery = normalizeDiscoverySearchQuery(searchQuery);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const searchableText = [
    place.name,
    place.location,
    place.address,
    place.category,
    place.description,
    place.hook,
    place.bestTime,
    place.attitudeLabel,
    ...place.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => searchableText.includes(token));
}

function mapMockPlaceForDiscovery(place: typeof MOCK_PLACES[number]) {
  const category = normalizePlaceCategory(place.category, place.tags ?? []);
  return {
    id: place.id,
    name: place.name,
    location: place.location,
    address: '',
    neighborhood: undefined,
    description: place.description,
    hook: '',
    image: place.image,
    images: place.images?.length ? place.images : [place.image],
    tags: buildDeterministicDiscoveryTags({
      category,
      rating: typeof place.rating === 'number' ? place.rating : null,
      priceLevel: undefined,
    }),
    attitudeLabel: '',
    bestTime: '',
    openingHours: undefined,
    servesBreakfast: undefined,
    servesLunch: undefined,
    servesDinner: undefined,
    servesBeer: undefined,
    servesWine: undefined,
    servesBrunch: undefined,
    servesDessert: undefined,
    servesCoffee: undefined,
    servesCocktails: undefined,
    goodForGroups: undefined,
    goodForWatchingSports: undefined,
    timeZone: undefined,
    utcOffsetMinutes: undefined,
    outdoors: undefined,
    outdoorSeating: undefined,
    similarityStat: place.similarityStat ?? 0,
	    whyYoullLikeIt: place.whyYoullLikeIt ?? [],
	    rating: 0,
    priceRange: undefined,
    priceRangeLabel: undefined,
    category,
    topBadgeLabel: undefined,
    discoveryTopRank: undefined,
    discoverySignals: [],
    tabIds: buildDiscoveryTabIdsForPlace({ category, discoverySignals: [] }),
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
  };
}

function getFallbackDiscoveryPlaces(locationLabel: string, searchQuery?: string) {
  const normalizedLocation = locationLabel.trim().toLowerCase();
  const locationMatches = MOCK_PLACES.filter((place) => place.location.toLowerCase().includes(normalizedLocation));
  const mappedPlaces = locationMatches.map(mapMockPlaceForDiscovery);
  const normalizedSearchQuery = normalizeDiscoverySearchQuery(searchQuery);

  return mappedPlaces
    .filter((place) => !isServiceLikePlace({
      name: place.name,
      tags: place.tags,
      category: place.category,
      hook: place.hook,
      description: place.description,
      whyYoullLikeIt: place.whyYoullLikeIt,
    }))
    .filter((place) => placeMatchesDiscoverySearch(place, normalizedSearchQuery));
}

function splitDiscoveryLocation(location?: string | null) {
  const [city, country] = (location ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: city || null,
    country: country || null,
  };
}

async function ensureBookmarkablePlaceExists(placeId: string, snapshot?: BookmarkPlaceSnapshot | null) {
  const existingPlace = await prisma.place.findUnique({
    where: { id: placeId },
    select: { id: true },
  });

  if (existingPlace) return;

  const mockPlace = MOCK_PLACES.find((place) => place.id === placeId);
  const source = snapshot ?? mockPlace;
  if (!source?.name) return;

  const { city, country } = splitDiscoveryLocation(source.location);
  const tags = source.tags?.filter(Boolean) ?? [];
  const images = (source.images?.filter(Boolean) ?? (source.image ? [source.image] : [])).slice(0, 6);

  try {
    await prisma.place.create({
      data: {
        id: placeId,
        name: source.name,
        address: source.address?.trim() || null,
        city,
        country,
        category: normalizePlaceCategory(source.category ?? 'recommended spot', tags),
        latitude: typeof source.latitude === 'number' ? source.latitude : null,
        longitude: typeof source.longitude === 'number' ? source.longitude : null,
        rating: typeof source.rating === 'number' ? source.rating : null,
        priceLevel: typeof source.priceLevel === 'number' ? source.priceLevel : null,
        primaryImageUrl: source.image?.trim() || images[0] || null,
        media: images.length > 0
          ? {
              create: images.map((url, index) => ({
                url,
                mediaType: 'image',
                sortOrder: index,
                source: mockPlace ? 'fallback-mock' : 'bookmark-snapshot',
              })),
            }
          : undefined,
        aiEnrichment: source.description || source.hook || tags.length > 0 || source.attitudeLabel || source.bestTime
          ? {
              create: {
                hook: source.hook?.trim() || source.name,
                description: source.description?.trim() || null,
                vibeTags: tags,
                attitudeLabel: source.attitudeLabel?.trim() || null,
                bestTime: source.bestTime?.trim() || null,
              },
            }
          : undefined,
      },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return;
    }

    throw error;
  }
}

async function seedDiscoverySearchCandidates(
  locationLabel: string,
  locationType: string | undefined,
  searchQuery: string,
) {
  const normalizedQuery = searchQuery.trim();
  if (normalizedQuery.length < 2) return;

  const queries = dedupeQueries([
    `${normalizedQuery} in ${locationLabel}`,
    `${normalizedQuery} ${locationLabel}`,
    locationType === 'country'
      ? `${normalizedQuery} travel spots in ${locationLabel}`
      : `${normalizedQuery} near ${locationLabel}`,
  ]).slice(0, 3);

  const searchResults = await Promise.all(
    queries.map((query) =>
      fetchGoogleTextSearch(query).catch((error) => {
        console.error(error);
        return null;
      }),
    ),
  );

  const mergedPlaces = searchResults.flatMap((result) => result?.places ?? []);
  const seenPlaceIds = new Set<string>();
  const relevantPlaces = mergedPlaces.filter((place) => {
    if (!isRelevantPredictionType(place.primaryType ?? place.types?.[0])) {
      return false;
    }
    if (seenPlaceIds.has(place.id)) {
      return false;
    }
    seenPlaceIds.add(place.id);
    return true;
  });

  await Promise.all(
    relevantPlaces
      .slice(0, 18)
      .map((place) => mapGoogleSearchPlaceToInternalPlace(place, {
        queryContext: normalizedQuery,
      }).catch((error) => {
        console.error(error);
        return null;
      })),
  );
}

async function ensureLocationCandidatePool(
  locationLabel: string,
  locationType?: string,
  selectedInterests: string[] = [],
  selectedVibe?: string | null,
  forceRefresh = false,
) {
  const location = await getOrCreateDiscoveryLocation(locationLabel, locationType);
  const cachedCount = await prisma.place.count({
    where: buildLocationWhere(locationLabel, locationType),
  });

  // Google acquisition is intentionally manual-only. User-facing discovery must
  // read from our database so API cost and data changes are controlled.
  if (location.discoveryCandidateCount !== cachedCount) {
    await prisma.location.update({
      where: { id: location.id },
      data: {
        discoveryCandidateCount: cachedCount,
        discoverySeedVersion: 'manual-google-acquisition-v1',
      },
    });
  }
  return;

  /*
  const seededRecently = location.discoveryLastGoogleSyncAt
    ? (Date.now() - location.discoveryLastGoogleSyncAt.getTime()) < DISCOVERY_RESEED_INTERVAL_MS
    : false;
  const forceRefreshAllowed = location.discoveryLastGoogleSyncAt
    ? (Date.now() - location.discoveryLastGoogleSyncAt.getTime()) >= DISCOVERY_FORCE_REFRESH_MIN_INTERVAL_MS
    : true;
  const shouldBypassGoogleOnForcedRefresh = forceRefresh && cachedCount >= DISCOVERY_FORCE_REFRESH_MIN_CANDIDATES && !forceRefreshAllowed;

  if (
    !forceRefresh &&
    location.discoverySeededAt &&
    cachedCount >= DISCOVERY_POOL_MIN_CANDIDATES
  ) {
    if (location.discoveryCandidateCount !== cachedCount) {
      await prisma.location.update({
        where: { id: location.id },
        data: {
          discoveryCandidateCount: cachedCount,
        },
      });
    }
    return;
  }

  if (shouldBypassGoogleOnForcedRefresh) {
    if (location.discoveryCandidateCount !== cachedCount) {
      await prisma.location.update({
        where: { id: location.id },
        data: {
          discoveryCandidateCount: cachedCount,
          discoverySeedVersion: 'city-pool-v2',
        },
      });
    }
    return;
  }

  if (!forceRefresh && seededRecently) {
    if (location.discoveryCandidateCount !== cachedCount) {
      await prisma.location.update({
        where: { id: location.id },
        data: {
          discoveryCandidateCount: cachedCount,
          discoverySeedVersion: 'city-pool-v2',
        },
      });
    }
    return;
  }

  await getDiscoveryPlacesByLocation(locationLabel, locationType, selectedInterests, selectedVibe);

  const nextCachedCount = await prisma.place.count({
    where: buildLocationWhere(locationLabel, locationType),
  });

  await prisma.location.update({
    where: { id: location.id },
    data: {
      discoverySeededAt: location.discoverySeededAt ?? new Date(),
      discoveryLastGoogleSyncAt: new Date(),
      discoveryCandidateCount: nextCachedCount,
      discoverySeedVersion: 'city-pool-v2',
    },
  });
  */
}

async function getDiscoveryPlacesForUser(options: {
  userId?: string;
  locationLabel: string;
  locationType?: string;
  searchQuery?: string;
  selectedInterests?: string[];
  selectedVibe?: string | null;
  page?: number;
  limit?: number;
  forceRefresh?: boolean;
  seed?: string;
}) {
  const currentPreferences = options.userId
    ? await prisma.userPreference.findUnique({
        where: { userId: options.userId },
      }).catch((error) => {
        console.error('Discovery preferences load failed', error);
        return null;
      })
    : null;

  const selectedInterests = options.selectedInterests?.length
    ? options.selectedInterests
    : currentPreferences?.selectedInterests ?? [];
  const selectedVibe = options.selectedVibe ?? currentPreferences?.selectedVibe ?? null;

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(options.limit ?? 10, 20));
  const normalizedSearchQuery = normalizeDiscoverySearchQuery(options.searchQuery);
  let places: Awaited<ReturnType<typeof getCachedDiscoveryPlacesByLocation>> = [];

  try {
    await ensureLocationCandidatePool(
      options.locationLabel,
      options.locationType,
      selectedInterests,
      selectedVibe,
      options.forceRefresh,
    );

    if (normalizedSearchQuery) {
      const cachedSearchMatches = (await getCachedDiscoveryPlacesByLocation(
        options.locationLabel,
        options.locationType,
      )).filter((place) => placeMatchesDiscoverySearch(place, normalizedSearchQuery));
      const location = await getOrCreateDiscoveryLocation(options.locationLabel, options.locationType);
      const seededSearchRecently = location.discoveryLastGoogleSyncAt
        ? (Date.now() - location.discoveryLastGoogleSyncAt.getTime()) < DISCOVERY_SEARCH_RESEED_INTERVAL_MS
        : false;

      if (
        cachedSearchMatches.length < DISCOVERY_SEARCH_MIN_CANDIDATES &&
        !seededSearchRecently
      ) {
        await seedDiscoverySearchCandidates(
          options.locationLabel,
          options.locationType,
          normalizedSearchQuery,
        );
      }
    }

    places = await getCachedDiscoveryPlacesByLocation(
      options.locationLabel,
      options.locationType,
    );
  } catch (error) {
    console.error('Discovery places fallback activated', error);
    places = getFallbackDiscoveryPlaces(options.locationLabel, normalizedSearchQuery);
  }

  if (places.length === 0) {
    places = getFallbackDiscoveryPlaces(options.locationLabel, normalizedSearchQuery);
  }

  const emptyContext = {
    selectedInterests,
    selectedVibe,
    bookmarkedPlaceIds: new Set<string>(),
    visitedPlaceIds: new Set<string>(),
    dismissedPlaceIds: new Set<string>(),
    manuallyDismissedPlaceIds: new Set<string>(),
    tasteKeywords: new Set<string>(),
    bookmarkKeywords: new Set<string>(),
    momentKeywords: new Set<string>(),
    followedUserIds: new Set<string>(),
    followedPlaceIds: new Set<string>(),
    socialKeywords: new Set<string>(),
    vibedPlaceIds: new Set<string>(),
    commentedPlaceIds: new Set<string>(),
    recentPlaceIds: new Set<string>(),
    momentRatingsByPlaceId: new Map<string, number>(),
  };

  const context = options.userId
    ? await getUserRecommendationContext(options.userId).catch((error) => {
        console.error('Discovery recommendation context failed', error);
        return emptyContext;
      })
    : emptyContext;

  let persistedScores: Array<{
    placeId: string;
    similarityPercentage: number | null;
    matchScore: number | null;
    sourceVersion?: string | null;
  }> = [];
  let rankedPlaces: Array<(ReturnType<typeof mapCachedPlaceForDiscovery> & {
    _preferenceAffinity: ReturnType<typeof getPlacePreferenceAffinity>;
  })> = [];

  try {
    persistedScores = options.userId
      ? await prisma.userPlaceScore.findMany({
          where: {
            userId: options.userId,
            placeId: { in: places.map((place) => place.id) },
          },
        }).catch((error) => {
          console.error('Discovery persisted score load failed', error);
          return [];
        })
      : [];

    const persistedScoreMap = new Map(
      persistedScores.map((item) => [item.placeId, item.similarityPercentage ?? item.matchScore ?? null]),
    );
    const shouldUsePersistedScores = !options.forceRefresh;

    rankedPlaces = places
      .filter((place) => !context.dismissedPlaceIds.has(place.id))
      .filter((place) => !isServiceLikePlace({
        name: place.name,
        tags: place.tags,
        category: place.category,
        hook: place.hook,
        description: place.description,
        whyYoullLikeIt: place.whyYoullLikeIt,
      }))
      .filter((place) => placeMatchesDiscoverySearch(place, normalizedSearchQuery))
      .flatMap((place) => {
        try {
          const persistedSimilarityScore = persistedScoreMap.get(place.id);
          return [{
            ...place,
            _preferenceAffinity: getPlacePreferenceAffinity(
              {
                tags: place.tags,
                category: place.category,
                hook: place.hook,
                description: place.description,
                whyYoullLikeIt: place.whyYoullLikeIt,
                discoverySignals: place.discoverySignals,
              },
              {
                selectedInterests,
                selectedVibe,
              },
            ),
            similarityStat: shouldUsePersistedScores && typeof persistedSimilarityScore === 'number'
              ? applyDiscoverySignalBoostToScore(
                  persistedSimilarityScore,
                  place.discoverySignals,
                  { selectedInterests },
                )
              : computeRecommendationScore(
                  {
                    id: place.id,
                    tags: place.tags,
                    category: place.category,
                    similarityStat: place.similarityStat,
                    rating: typeof place.rating === 'number' ? place.rating : null,
                    hook: place.hook,
                    description: place.description,
                    whyYoullLikeIt: place.whyYoullLikeIt,
                    discoverySignals: place.discoverySignals,
                  },
                  {
                    selectedInterests,
                    selectedVibe,
                    bookmarkKeywords: context.bookmarkKeywords,
                    momentKeywords: context.momentKeywords,
                    socialKeywords: context.socialKeywords,
                    isBookmarked: context.bookmarkedPlaceIds.has(place.id),
                    isVisited: context.visitedPlaceIds.has(place.id),
                    isVibed: context.vibedPlaceIds.has(place.id),
                    isCommented: context.commentedPlaceIds.has(place.id),
                    isRecent: context.recentPlaceIds.has(place.id),
                    followedPlaceMatch: context.followedPlaceIds.has(place.id),
                    momentRating: context.momentRatingsByPlaceId.get(place.id) ?? null,
                  },
                ),
          }];
        } catch (error) {
          console.error('Discovery ranking candidate failed', {
            placeId: place.id,
            name: place.name,
            category: place.category,
            error,
          });
          return [];
        }
      })
      .sort((a, b) => {
        const affinityA = a._preferenceAffinity.matchedInterestCount + (a._preferenceAffinity.matchedVibe ? 1 : 0);
        const affinityB = b._preferenceAffinity.matchedInterestCount + (b._preferenceAffinity.matchedVibe ? 1 : 0);
        if (affinityB !== affinityA) return affinityB - affinityA;
        return (b.similarityStat ?? 0) - (a.similarityStat ?? 0);
      });
  } catch (error) {
    console.error('Discovery ranking fallback activated', error);
    rankedPlaces = places
      .filter((place) => placeMatchesDiscoverySearch(place, normalizedSearchQuery))
      .map((place) => ({
        ...place,
        _preferenceAffinity: getPlacePreferenceAffinity(
          {
            tags: place.tags,
            category: place.category,
            hook: place.hook,
            description: place.description,
            whyYoullLikeIt: place.whyYoullLikeIt,
            discoverySignals: place.discoverySignals,
          },
          {
            selectedInterests,
            selectedVibe,
          },
        ),
      }));
  }

  if (selectedInterests.length > 0 || selectedVibe) {
    const matchedPlaces = rankedPlaces.filter((place) =>
      shouldKeepPlaceForPreferences(
        {
          tags: place.tags,
          category: place.category,
          hook: place.hook,
          description: place.description,
          whyYoullLikeIt: place.whyYoullLikeIt,
          discoverySignals: place.discoverySignals,
        },
        {
          selectedInterests,
          selectedVibe,
        },
      ),
    );
    const unmatchedPlaces = rankedPlaces.filter((place) =>
      !shouldKeepPlaceForPreferences(
        {
          tags: place.tags,
          category: place.category,
          hook: place.hook,
          description: place.description,
          whyYoullLikeIt: place.whyYoullLikeIt,
          discoverySignals: place.discoverySignals,
        },
        {
          selectedInterests,
          selectedVibe,
        },
      ),
    );

    if (matchedPlaces.length > 0) {
      rankedPlaces = [...matchedPlaces, ...unmatchedPlaces];
    }
  }

  if (!normalizedSearchQuery && page === 1 && selectedInterests.length > 0) {
    const interestMatchedPlaces = rankedPlaces.filter((place) => place._preferenceAffinity.matchedInterestCount > 0);
    const nonInterestMatchedPlaces = rankedPlaces.filter((place) => place._preferenceAffinity.matchedInterestCount === 0);

    if (interestMatchedPlaces.length >= Math.min(6, limit)) {
      rankedPlaces = interestMatchedPlaces;
    } else {
      rankedPlaces = [...interestMatchedPlaces, ...nonInterestMatchedPlaces];
    }
  }

  if (rankedPlaces.length === 0 && !normalizedSearchQuery) {
    rankedPlaces = getFallbackDiscoveryPlaces(options.locationLabel)
      .map((place) => ({
        ...place,
        _preferenceAffinity: getPlacePreferenceAffinity(
          {
            tags: place.tags,
            category: place.category,
            hook: place.hook,
            description: place.description,
            whyYoullLikeIt: place.whyYoullLikeIt,
            discoverySignals: place.discoverySignals,
          },
          {
            selectedInterests,
            selectedVibe,
          },
        ),
        similarityStat: computeRecommendationScore(
          {
            id: place.id,
            tags: place.tags,
            category: place.category,
            similarityStat: place.similarityStat,
            rating: typeof place.rating === 'number' ? place.rating : null,
            hook: place.hook,
            description: place.description,
            whyYoullLikeIt: place.whyYoullLikeIt,
            discoverySignals: place.discoverySignals,
          },
          {
            selectedInterests,
            selectedVibe,
            bookmarkKeywords: context.bookmarkKeywords,
            momentKeywords: context.momentKeywords,
            socialKeywords: context.socialKeywords,
            isBookmarked: context.bookmarkedPlaceIds.has(place.id),
            isVisited: context.visitedPlaceIds.has(place.id),
            isVibed: context.vibedPlaceIds.has(place.id),
            isCommented: context.commentedPlaceIds.has(place.id),
            isRecent: context.recentPlaceIds.has(place.id),
            followedPlaceMatch: context.followedPlaceIds.has(place.id),
            momentRating: context.momentRatingsByPlaceId.get(place.id) ?? null,
          },
        ),
      }))
      .sort((a, b) => (b.similarityStat ?? 0) - (a.similarityStat ?? 0));
  }

  if (options.userId && places.length > 0 && (options.forceRefresh || page === 1)) {
    void refreshUserPlaceScores(
      options.userId,
      rankedPlaces.slice(0, Math.min(rankedPlaces.length, 40)).map((place) => place.id),
    ).catch((error) => {
      console.error('Background user place score refresh failed', error);
    });
  }

  rankedPlaces = rankedPlaces.filter((place) => !isServiceLikePlace({
    name: place.name,
    tags: place.tags,
    category: place.category,
    hook: place.hook,
    description: place.description,
    whyYoullLikeIt: place.whyYoullLikeIt,
  }));

  if (!normalizedSearchQuery && page === 1) {
    rankedPlaces = applyRankedVariety(
      rankedPlaces,
      options.seed ?? `${options.userId ?? 'guest'}|${options.locationLabel}|${selectedInterests.join(',')}|${selectedVibe ?? ''}|${new Date().toISOString().slice(0, 10)}`,
    );
  }

  const start = (page - 1) * limit;
  const pagedPlaces = rankedPlaces
    .slice(start, start + limit)
    .map(({ _preferenceAffinity, ...place }) => ({
      ...place,
      // List screens only need the primary image. Detail pages fetch the full
      // place bundle, so trimming list images keeps discovery payloads lighter.
      images: place.image ? [place.image] : place.images?.slice(0, 1),
      tabIds: place.tabIds ?? buildDiscoveryTabIdsForPlace(place),
    }));

  if (page === 1) {
    const enrichmentCandidates = pagedPlaces
      .filter((place) => !place.hook && !place.attitudeLabel)
      .slice(0, 3)
      .map((place) => place.id);

    if (enrichmentCandidates.length > 0) {
      void Promise.allSettled(enrichmentCandidates.map((placeId) => ensurePlaceAiEnrichment(placeId)))
        .catch((error) => {
          console.error('Background place enrichment failed', error);
        });
    }
  }

  if (options.userId && ENABLE_RUNTIME_AI && OPENAI_API_KEY && page === 1) {
    void applyAiCompatibilityToPlaces({
      userId: options.userId,
      places: pagedPlaces,
      context,
      persistedScores: persistedScores.map((item) => ({
        placeId: item.placeId,
        sourceVersion: item.sourceVersion ?? null,
      })),
      forceRefresh: options.forceRefresh,
    }).catch((error) => {
      console.error('Background AI compatibility refresh failed', error);
    });
  }

  return {
    places: pagedPlaces,
    inspirationMedia: page === 1 ? await getDiscoveryInspirationMedia() : [],
    pagination: {
      page,
      limit,
      total: rankedPlaces.length,
      hasMore: start + limit < rankedPlaces.length,
    },
  };
}

async function getDiscoveryInspirationMedia() {
  const media = await prisma.momentMedia.findMany({
    where: {
      mediaType: {
        startsWith: 'image',
        mode: 'insensitive',
      },
      moment: {
        privacy: 'PUBLIC',
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      moment: {
        include: {
          user: true,
          place: {
            include: {
              media: { orderBy: { sortOrder: 'asc' } },
              aiEnrichment: true,
            },
          },
        },
      },
    },
  });

  return media.map((item) => {
    const traveler = item.moment.user;
    const place = item.moment.place;
    return {
      id: item.id,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? item.url,
      mediaType: 'image',
      momentId: item.momentId,
      place: {
        id: place.id,
        name: place.name,
        location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
        image: place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
        images: place.media.map((mediaItem) => mediaItem.url),
        category: place.category,
        tags: place.aiEnrichment?.vibeTags.length ? place.aiEnrichment.vibeTags : [place.category].filter(Boolean),
        description: place.aiEnrichment?.description ?? '',
        hook: place.aiEnrichment?.hook ?? '',
      },
      traveler: {
        id: traveler.id,
        username: traveler.username,
        displayName: traveler.displayName,
        avatar: traveler.avatarUrl,
        bio: traveler.bio,
        matchScore: undefined,
        followersCount: undefined,
        recentSavedPlaces: [],
        recentCollections: [],
        travelHistory: [],
        visitedPlacesCount: undefined,
        savedPlacesCount: undefined,
        collectionsCount: undefined,
      },
    };
  });
}

async function fetchGooglePlaceDetails(googlePlaceId: string, options?: {
  sessionToken?: string | null;
}) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const detailsUrl = new URL(`https://places.googleapis.com/v1/places/${googlePlaceId}`);
  if (options?.sessionToken) {
    detailsUrl.searchParams.set('sessionToken', options.sessionToken);
  }

  const response = await fetch(detailsUrl, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'id',
        'displayName',
        'formattedAddress',
        'shortFormattedAddress',
        'location',
        'primaryType',
        'primaryTypeDisplayName',
        'googleMapsTypeLabel',
        'types',
        'businessStatus',
        'openingDate',
        'rating',
        'userRatingCount',
        'priceLevel',
        'priceRange',
        'googleMapsUri',
        'googleMapsLinks',
        'websiteUri',
        'regularOpeningHours.weekdayDescriptions',
        'currentOpeningHours.weekdayDescriptions',
        'photos',
        'addressComponents',
        'servesBreakfast',
        'servesLunch',
        'servesDinner',
        'servesBeer',
        'servesWine',
        'servesBrunch',
        'servesDessert',
        'servesCoffee',
        'servesCocktails',
        'servesVegetarianFood',
        'takeout',
        'delivery',
        'dineIn',
        'curbsidePickup',
        'reservable',
        'liveMusic',
        'menuForChildren',
        'goodForChildren',
        'allowsDogs',
        'restroom',
        'goodForGroups',
        'goodForWatchingSports',
        'timeZone',
        'utcOffsetMinutes',
        'outdoorSeating',
        'paymentOptions',
        'parkingOptions',
        'accessibilityOptions',
        'editorialSummary',
        'reviewSummary',
        'generativeSummary',
        'containingPlaces',
        'reviews',
      ].join(','),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Place Details failed with ${response.status}`);
  }

  return response.json() as Promise<GooglePlaceDetailsResponse>;
}

function extractNeighborhoodFromAddressComponents(components: Array<{
  longText?: string;
  shortText?: string;
  types?: string[];
}> | undefined | null): { neighborhood?: string | null; adminAreaLevel4?: string | null } {
  const items = Array.isArray(components) ? components : [];
  const pick = (type: string) => items.find((item) => (item.types ?? []).includes(type));

  const neighborhood =
    pick('neighborhood')?.longText
    ?? pick('sublocality_level_2')?.longText
    ?? pick('sublocality_level_1')?.longText
    ?? pick('sublocality')?.longText
    ?? null;

  const adminAreaLevel4 = pick('administrative_area_level_4')?.longText ?? null;
  return { neighborhood, adminAreaLevel4 };
}

async function fetchGooglePhotoUri(photoName: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_MAPS_API_KEY}&maxWidthPx=1200&skipHttpRedirect=true`,
  );

  if (!response.ok) {
    throw new Error(`Google Place Photo failed with ${response.status}`);
  }

  const data = await response.json() as { photoUri?: string };
  return data.photoUri ?? null;
}

async function fetchGooglePhotoUris(photoNames: string[], limit = 5) {
  const uniquePhotoNames = Array.from(new Set(photoNames.filter(Boolean))).slice(0, limit);
  if (uniquePhotoNames.length === 0) return [];

  const results = await Promise.allSettled(
    uniquePhotoNames.map((photoName) => fetchGooglePhotoUri(photoName)),
  );

  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

async function ensurePlaceAiEnrichment(placeId: string) {
  const existingTask = placeEnrichmentInflight.get(placeId);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        aiEnrichment: true,
        discoverySignals: {
          orderBy: [
            { bestResultRank: 'asc' },
            { resultRank: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 20,
        },
      },
    });

    if (!place) return null;

    if (place.aiEnrichment?.hook && place.aiEnrichment.vibeTags.length > 0) {
      return place.aiEnrichment;
    }

    const deterministicInput = {
      id: place.id,
      name: place.name,
      address: place.address,
      city: place.city,
      country: place.country,
      neighborhood: place.neighborhood,
      adminAreaLevel4: place.adminAreaLevel4,
      category: place.category,
      rating: place.rating,
      priceLevel: place.priceLevel,
      userRatingCount: place.userRatingCount,
      googlePrimaryType: place.googlePrimaryType,
      googlePrimaryTypeDisplayName: place.googlePrimaryTypeDisplayName,
      googleMapsTypeLabel: place.googleMapsTypeLabel,
      googleTypes: place.googleTypes,
      servesBreakfast: place.servesBreakfast,
      servesLunch: place.servesLunch,
      servesDinner: place.servesDinner,
      servesBeer: place.servesBeer,
      servesWine: place.servesWine,
      servesBrunch: place.servesBrunch,
      servesDessert: place.servesDessert,
      servesCoffee: place.servesCoffee,
      servesCocktails: place.servesCocktails,
      goodForGroups: place.goodForGroups,
      goodForWatchingSports: place.goodForWatchingSports,
      outdoorSeating: place.outdoorSeating,
      discoverySignals: place.discoverySignals,
    };

    const generated = ENABLE_RUNTIME_AI && OPENAI_API_KEY
      ? await generatePlaceAiEnrichment(deterministicInput)
      : generateDeterministicPlaceEnrichment(deterministicInput);

    if (!generated) return null;

    return prisma.placeAiEnrichment.upsert({
      where: { placeId },
      update: generated,
      create: {
        placeId,
        ...generated,
      },
    });
  })()
    .catch((error) => {
      console.error(error);
      return null;
    })
    .finally(() => {
      placeEnrichmentInflight.delete(placeId);
    });

  placeEnrichmentInflight.set(placeId, task);
  return task;
}

function mapGooglePriceLevel(priceLevel?: string) {
  switch (priceLevel) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
}

function mapPriceLevel(value?: number | null) {
  if (!value || value <= 0) return 'Free';
  return '$'.repeat(Math.min(value, 4));
}

function toGoogleSnapshotPayload(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload ?? null)) as Prisma.InputJsonValue;
}

async function persistGooglePlaceSnapshot(input: {
  placeId: string;
  googlePlaceId: string;
  source: 'TEXT_SEARCH' | 'PLACE_DETAILS';
  payload: unknown;
  queryContext?: string | null;
}) {
  try {
    await prisma.placeGoogleSnapshot.create({
      data: {
        placeId: input.placeId,
        googlePlaceId: input.googlePlaceId,
        source: input.source,
        queryContext: input.queryContext ?? null,
        payloadJson: toGoogleSnapshotPayload(input.payload),
      },
    });
  } catch (error) {
    console.error('Persist Google place snapshot failed', {
      placeId: input.placeId,
      googlePlaceId: input.googlePlaceId,
      source: input.source,
      error,
    });
  }
}

async function persistPlaceDiscoverySignals(input: {
  placeId: string;
  googlePlaceId: string;
  signals: PlaceDiscoverySignalInput[];
}) {
  for (const signal of input.signals) {
    const queryText = signal.queryText.trim();
    if (!queryText) continue;

    try {
      await prisma.placeDiscoverySignal.upsert({
        where: {
          googlePlaceId_queryText_locationLabel_locationType: {
            googlePlaceId: input.googlePlaceId,
            queryText,
            locationLabel: signal.locationLabel ?? '',
            locationType: signal.locationType ?? '',
          },
        },
        update: {
          placeId: input.placeId,
          queryType: signal.queryType,
          preferenceCategory: signal.preferenceCategory ?? null,
          selectedVibe: signal.selectedVibe ?? null,
          resultRank: signal.resultRank ?? null,
          seenCount: { increment: 1 },
          lastSeenAt: new Date(),
        },
        create: {
          placeId: input.placeId,
          googlePlaceId: input.googlePlaceId,
          queryText,
          queryType: signal.queryType,
          preferenceCategory: signal.preferenceCategory ?? null,
          selectedVibe: signal.selectedVibe ?? null,
          resultRank: signal.resultRank ?? null,
          bestResultRank: signal.resultRank ?? null,
          locationLabel: signal.locationLabel ?? '',
          locationType: signal.locationType ?? '',
        },
      });
    } catch (error) {
      console.error('Persist place discovery signal failed', {
        placeId: input.placeId,
        googlePlaceId: input.googlePlaceId,
        queryText,
        error,
      });
    }
  }
}

function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

const PLACE_PREFERENCE_CATEGORY_ALIASES: Record<string, string> = {
  cafe: 'good_coffee',
  nature: 'parks_outdoor',
  shopping: 'shop_stroll',
  party: 'drinks_nightlife',
  culture: 'fun_activities',
  adventure: 'fun_activities',
};

function normalizePreferenceCategoryKey(value?: string | null) {
  const normalized = normalizeKeyword(value ?? '').replace(/\s+/g, '_');
  if (!normalized) return '';
  return PLACE_PREFERENCE_CATEGORY_ALIASES[normalized] ?? normalized;
}

function placeSignalCategories(discoverySignals?: PlaceDiscoverySignalForScoring[]) {
  return new Set(
    (discoverySignals ?? [])
      .map((signal) => normalizePreferenceCategoryKey(signal.preferenceCategory))
      .filter(Boolean),
  );
}

function bestDiscoverySignalRank(discoverySignals?: PlaceDiscoverySignalForScoring[]) {
  const ranks = (discoverySignals ?? [])
    .map((signal) => signal.bestResultRank ?? signal.resultRank ?? null)
    .filter((rank): rank is number => typeof rank === 'number');
  return ranks.length > 0 ? Math.min(...ranks) : null;
}

function buildDiscoveryTabIdsForPlace(place: {
  category?: string | null;
  servesCoffee?: boolean | null;
  servesDessert?: boolean | null;
  servesBeer?: boolean | null;
  servesWine?: boolean | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}) {
  const tabs = new Set<string>(['all']);
  const category = normalizeKeyword(place.category ?? '');
  const signalCategories = placeSignalCategories(place.discoverySignals);
  const hasSignal = (categoryKey: string) => signalCategories.has(normalizePreferenceCategoryKey(categoryKey));
  const bestRank = bestDiscoverySignalRank(place.discoverySignals);

  if (
    category.includes('restaurant') ||
    category.includes('food') ||
    category.includes('eat') ||
    category.includes('brunch') ||
    category.includes('ramen') ||
    category.includes('sushi') ||
    category.includes('taco') ||
    category.includes('burger') ||
    category.includes('noodle') ||
    category.includes('bakery') ||
    category.includes('cafe')
  ) {
    tabs.add('eat');
  }

  if (hasSignal('asian_comfort_food')) tabs.add('asian-food');

  if (
    category.includes('coffee') ||
    category.includes('espresso') ||
    category.includes('cafe') ||
    category.includes('roastery') ||
    category.includes('matcha') ||
    place.servesCoffee === true
  ) {
    tabs.add('coffee');
  }

  if (
    category.includes('dessert') ||
    category.includes('pastry') ||
    category.includes('bakery') ||
    category.includes('ice cream') ||
    category.includes('sweet') ||
    place.servesDessert === true
  ) {
    tabs.add('dessert');
  }

  if (place.servesBeer === true || place.servesWine === true || hasSignal('drinks_nightlife')) tabs.add('drinks');
  if (typeof bestRank === 'number' && bestRank >= 1 && bestRank <= 5) tabs.add('trending');
  if (hasSignal('fun_activities')) tabs.add('culture');
  if (hasSignal('shop_stroll')) tabs.add('shop-stroll');
  if (hasSignal('parks_outdoor')) tabs.add('parks-outdoor');
  if (hasSignal('aesthetic_cafes') || hasSignal('aesthetic_cafe')) tabs.add('aesthetic');

  return Array.from(tabs);
}

function getPlaceDiscoverySignalAffinity(
  discoverySignals: PlaceDiscoverySignalForScoring[] | undefined,
  input: { selectedInterests: string[] },
) {
  const selectedCategories = new Set(
    input.selectedInterests
      .map(normalizePreferenceCategoryKey)
      .filter(Boolean),
  );

  if (selectedCategories.size === 0 || !discoverySignals?.length) {
    return {
      matchedCategories: [] as string[],
      bestRank: null as number | null,
      maxSeenCount: 0,
    };
  }

  const matchedCategories = new Set<string>();
  let bestRank: number | null = null;
  let maxSeenCount = 0;

  for (const signal of discoverySignals) {
    const category = normalizePreferenceCategoryKey(signal.preferenceCategory);
    if (!category || !selectedCategories.has(category)) continue;

    matchedCategories.add(category);
    maxSeenCount = Math.max(maxSeenCount, signal.seenCount ?? 0);

    const rank = signal.bestResultRank ?? signal.resultRank ?? null;
    if (typeof rank === 'number' && (bestRank == null || rank < bestRank)) {
      bestRank = rank;
    }
  }

  return {
    matchedCategories: Array.from(matchedCategories),
    bestRank,
    maxSeenCount,
  };
}

function computePlaceDiscoverySignalBoost(
  discoverySignals: PlaceDiscoverySignalForScoring[] | undefined,
  input: { selectedInterests: string[] },
) {
  const signalAffinity = getPlaceDiscoverySignalAffinity(discoverySignals, input);
  if (signalAffinity.matchedCategories.length === 0) {
    return {
      delta: 0,
      matchedCategories: signalAffinity.matchedCategories,
      bestRank: signalAffinity.bestRank,
    };
  }

  const rank = signalAffinity.bestRank;
  const rankBonus = rank == null
    ? 2
    : rank <= 3
      ? 8
      : rank <= 10
        ? 5
        : rank <= 20
          ? 3
          : 1;
  const categoryBonus = 6 + Math.min(Math.max(signalAffinity.matchedCategories.length - 1, 0) * 4, 8);
  const repeatBonus = Math.min(Math.max(signalAffinity.maxSeenCount - 1, 0), 4);

  return {
    delta: Math.min(categoryBonus + rankBonus + repeatBonus, 22),
    matchedCategories: signalAffinity.matchedCategories,
    bestRank: rank,
  };
}

function applyDiscoverySignalBoostToScore(
  score: number,
  discoverySignals: PlaceDiscoverySignalForScoring[] | undefined,
  input: { selectedInterests: string[] },
) {
  const boost = computePlaceDiscoverySignalBoost(discoverySignals, input);
  return Math.max(28, Math.min(score + boost.delta, 98));
}

function buildMaxMomentRatingMap(items: Array<{ placeId: string; rating: number }>) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const existing = map.get(item.placeId) ?? 0;
    if (item.rating > existing) {
      map.set(item.placeId, item.rating);
    }
  });
  return map;
}

function isServiceLikePlace(place: {
  name?: string | null;
  tags: string[];
  category?: string | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
}) {
  const haystack = [
    place.name ?? '',
    place.category ?? '',
    place.hook ?? '',
    place.description ?? '',
    ...(place.whyYoullLikeIt ?? []),
    ...place.tags,
  ]
    .map(normalizeKeyword)
    .join(' ');

  const blockedMatchers = [
    'service',
    'services',
    'school',
    'high school',
    'middle school',
    'elementary school',
    'prep school',
    'academy',
    'college',
    'university',
    'campus',
    'student center',
    'education',
    'educational',
    'salon',
    'hair salon',
    'beauty salon',
    'barber',
    'spa',
    'repair',
    'car repair',
    'auto repair',
    'lawyer',
    'attorney',
    'legal service',
    'dentist',
    'doctor',
    'medical',
    'insurance',
    'bank',
    'accounting',
    'real estate',
    'realtor',
    'broker',
    'property management',
    'clinic',
    'hospital',
    'physician',
    'audiology',
    'hearing',
    'cell phone repair',
    'phone repair',
    'computer repair',
    'screen repair',
  ];

  if (blockedMatchers.some((matcher) => haystack.includes(matcher))) {
    return true;
  }

  const professionalSuffixPatterns = [
    /\bmd\b/,
    /\bm\.d\.\b/,
    /\bdds\b/,
    /\bdmd\b/,
    /\bdo\b/,
    /\baud\b/,
    /\besq\b/,
    /\bphd\b/,
    /\bod\b/,
    /\brn\b/,
  ];

  if (professionalSuffixPatterns.some((pattern) => pattern.test(haystack))) {
    return true;
  }

  const personServicePatterns = [
    /\bdr\b/,
    /\bdoctor\b/,
    /\brealtor\b/,
    /\battorney\b/,
    /\blawyer\b/,
    /\baudiologist\b/,
    /\bphysician\b/,
  ];

  return personServicePatterns.some((pattern) => pattern.test(haystack));
}

const PLACE_INTEREST_MATCHERS: Record<string, string[]> = {
  nature: ['nature', 'park', 'garden', 'waterfront', 'scenic', 'outdoor', 'green', 'lake', 'trail', 'harbor', 'walk'],
  cafe: ['cafe', 'coffee', 'espresso', 'bakery', 'brunch', 'pastry', 'tea', 'roastery', 'easy pause'],
  culture: ['culture', 'museum', 'gallery', 'historic', 'history', 'arts', 'theatre', 'design', 'bookstore', 'library', 'monument'],
  shopping: ['shopping', 'market', 'boutique', 'concept store', 'mall', 'retail', 'gift', 'design shop', 'bazaar', 'showroom'],
  party: ['nightlife', 'bar', 'cocktail', 'rooftop', 'live music', 'music', 'dj', 'club', 'late night', 'jazz', 'speakeasy'],
  adventure: ['adventure', 'walkable', 'viewpoint', 'hike', 'trail', 'outdoor', 'easy stop', 'detour', 'quick escape', 'open air'],
  good_coffee: ['coffee', 'espresso', 'specialty coffee', 'roastery', 'coffee bar', 'latte', 'matcha'],
  aesthetic_cafes: ['aesthetic', 'cute cafe', 'stylish cafe', 'cafe', 'design', 'brunch', 'pastry', 'visual'],
  desserts_sweet_treats: ['dessert', 'sweet', 'pastry', 'bakery', 'ice cream', 'gelato', 'cake', 'cookie', 'treat'],
  street_food_casual_eats: ['street food', 'casual', 'cheap eats', 'burger', 'fried chicken', 'taco', 'sandwich', 'comfort food'],
  asian_comfort_food: ['ramen', 'sushi', 'udon', 'noodles', 'izakaya', 'korean', 'japanese', 'asian comfort'],
  drinks_nightlife: ['nightlife', 'bar', 'cocktail', 'wine', 'beer', 'rooftop', 'late night', 'speakeasy'],
  shop_stroll: ['shopping', 'shop', 'boutique', 'vintage', 'market', 'stroll', 'walkable', 'browse'],
  fun_activities: ['activity', 'experience', 'museum', 'gallery', 'arcade', 'fun', 'unique', 'things to do'],
  parks_outdoor: ['park', 'outdoor', 'garden', 'trail', 'waterfront', 'scenic', 'green', 'walk'],
};

const PLACE_VIBE_MATCHERS: Record<string, string[]> = {
  aesthetic: ['aesthetic', 'design', 'stylish', 'photo', 'beautiful', 'gallery', 'visual', 'curated'],
  solo: ['solo', 'quiet', 'low key', 'intimate', 'easy pause', 'bookstore', 'museum', 'slow', 'calm'],
  luxury: ['luxury', 'premium', 'fine dining', 'hotel', 'exclusive', 'high end', 'polished', 'elevated'],
  budget: ['budget', 'cheap', 'free', 'casual', 'community', 'street', 'market', 'easy stop'],
  spontaneous: ['spontaneous', 'walkable', 'easy stop', 'drop in', 'quick escape', 'detour', 'open air', 'last minute'],
};

function getPlacePreferenceAffinity(place: {
  tags: string[];
  category?: string | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}, input: {
  selectedInterests: string[];
  selectedVibe?: string | null;
}) {
  const normalizedTags = place.tags.map(normalizeKeyword);
  const normalizedCategory = normalizeKeyword(place.category ?? '');
  const normalizedHook = normalizeKeyword(place.hook ?? '');
  const normalizedDescription = normalizeKeyword(place.description ?? '');
  const normalizedWhyLines = (place.whyYoullLikeIt ?? []).map(normalizeKeyword);
  const keywordBag = new Set([
    ...normalizedTags,
    normalizedCategory,
    normalizedHook,
    normalizedDescription,
    ...normalizedWhyLines,
  ].filter(Boolean));

  const matchesAnyMatcher = (matchers: string[]) =>
    matchers.some((matcher) => {
      const normalizedMatcher = normalizeKeyword(matcher);
      return Array.from(keywordBag).some((keyword) =>
        keyword.includes(normalizedMatcher) || normalizedMatcher.includes(keyword),
      );
    });

  let matchedInterestCount = 0;
  const signalAffinity = getPlaceDiscoverySignalAffinity(place.discoverySignals, input);
  const signalMatchedCategories = new Set(signalAffinity.matchedCategories);
  const selectedInterests = Array.from(new Set(input.selectedInterests.map(normalizePreferenceCategoryKey).filter(Boolean)));

  for (const interest of selectedInterests) {
    const matchers = PLACE_INTEREST_MATCHERS[interest] ?? [normalizeKeyword(interest)];
    if (matchesAnyMatcher(matchers)) {
      matchedInterestCount += 1;
    } else if (signalMatchedCategories.has(interest)) {
      matchedInterestCount += 1;
    }
  }

  let matchedVibe = false;
  if (input.selectedVibe) {
    const matchers = PLACE_VIBE_MATCHERS[input.selectedVibe] ?? [normalizeKeyword(input.selectedVibe)];
    matchedVibe = matchesAnyMatcher(matchers);
  }

  return { matchedInterestCount, matchedVibe };
}

function getPlacePreferenceNoisePenalty(place: {
  tags: string[];
  category?: string | null;
  hook?: string | null;
  description?: string | null;
}, input: {
  selectedInterests: string[];
}) {
  if (input.selectedInterests.length === 0) return 0;

  const haystack = [
    place.category ?? '',
    place.hook ?? '',
    place.description ?? '',
    ...place.tags,
  ]
    .map(normalizeKeyword)
    .join(' ');

  let penalty = 0;

  if (input.selectedInterests.includes('party') || input.selectedInterests.includes('drinks_nightlife')) {
    if (
      haystack.includes('park') ||
      haystack.includes('nature preserve') ||
      haystack.includes('city park') ||
      haystack.includes('service')
    ) {
      penalty += 18;
    }
  }

  if (input.selectedInterests.includes('shopping') || input.selectedInterests.includes('shop_stroll')) {
    if (
      haystack.includes('park') ||
      haystack.includes('nature preserve') ||
      haystack.includes('city park')
    ) {
      penalty += 16;
    }
  }

  if (
    (input.selectedInterests.includes('party') || input.selectedInterests.includes('drinks_nightlife')) &&
    (input.selectedInterests.includes('shopping') || input.selectedInterests.includes('shop_stroll')) &&
    (haystack.includes('coffee shop') || haystack.includes('cafe'))
  ) {
    penalty += 12;
  }

  return penalty;
}

function shouldKeepPlaceForPreferences(place: {
  tags: string[];
  category?: string | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}, input: {
  selectedInterests: string[];
  selectedVibe?: string | null;
}) {
  if (input.selectedInterests.length === 0 && !input.selectedVibe) return true;

  const affinity = getPlacePreferenceAffinity(place, input);
  if (affinity.matchedInterestCount === 0 && !affinity.matchedVibe) {
    return false;
  }

  if (
    input.selectedInterests.length === 1 &&
    (input.selectedInterests[0] === 'shopping' || input.selectedInterests[0] === 'shop_stroll')
  ) {
    const haystack = [
      place.category ?? '',
      place.hook ?? '',
      place.description ?? '',
      ...(place.whyYoullLikeIt ?? []),
      ...place.tags,
    ]
      .map(normalizeKeyword)
      .join(' ');

    if (
      haystack.includes('coffee') ||
      haystack.includes('cafe') ||
      haystack.includes('museum') ||
      haystack.includes('park') ||
      haystack.includes('garden')
    ) {
      return false;
    }
  }

  return true;
}

function hashScoreSeed(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 997;
  }
  return hash;
}

function describeRecommendationClassification(score?: number | null) {
  if (typeof score !== 'number') return 'Unscored';
  if (score >= 85) return 'Your vibe';
  if (score >= 70) return 'Strong fit';
  if (score >= 55) return 'Could hit';
  return 'Soft maybe';
}

function collectTasteKeywords(places: Array<{ category?: string | null; aiEnrichment?: { vibeTags: string[] } | null }>) {
  const keywords = new Set<string>();

  for (const place of places) {
    if (place.category) {
      keywords.add(normalizeKeyword(place.category));
    }
    for (const tag of place.aiEnrichment?.vibeTags ?? []) {
      keywords.add(normalizeKeyword(tag));
    }
  }

  return keywords;
}

function computeRecommendationScore(place: {
  id?: string;
  tags: string[];
  category?: string;
  similarityStat?: number;
  rating?: number | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}, input: {
  selectedInterests: string[];
  selectedVibe?: string | null;
  bookmarkKeywords?: Set<string>;
  momentKeywords?: Set<string>;
  socialKeywords?: Set<string>;
  isBookmarked?: boolean;
  isVisited?: boolean;
  isVibed?: boolean;
  isCommented?: boolean;
  isRecent?: boolean;
  followedPlaceMatch?: boolean;
  momentRating?: number | null;
}) {
  return computeRecommendationScoreAudit(place, input).finalScore;
}

function computeRecommendationScoreAudit(place: {
  id?: string;
  tags: string[];
  category?: string;
  similarityStat?: number;
  rating?: number | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}, input: {
  selectedInterests: string[];
  selectedVibe?: string | null;
  bookmarkKeywords?: Set<string>;
  momentKeywords?: Set<string>;
  socialKeywords?: Set<string>;
  isBookmarked?: boolean;
  isVisited?: boolean;
  isVibed?: boolean;
  isCommented?: boolean;
  isRecent?: boolean;
  followedPlaceMatch?: boolean;
  momentRating?: number | null;
}) {
  const normalizedTags = place.tags.map(normalizeKeyword);
  const normalizedCategory = normalizeKeyword(place.category ?? '');
  const keywordBag = new Set([
    ...normalizedTags,
    normalizedCategory,
  ].filter(Boolean));
  const matchesAnyMatcher = (matchers: string[]) =>
    matchers.some((matcher) => {
      const normalizedMatcher = normalizeKeyword(matcher);
      return Array.from(keywordBag).some((keyword) =>
        keyword.includes(normalizedMatcher) || normalizedMatcher.includes(keyword),
      );
    });
  const diversitySeed = hashScoreSeed(`${place.id ?? normalizedCategory}|${normalizedTags.join('|')}`) % 17;
  const bookmarkKeywords = input.bookmarkKeywords ?? new Set<string>();
  const momentKeywords = input.momentKeywords ?? new Set<string>();
  const socialKeywords = input.socialKeywords ?? new Set<string>();
  const contributions: Array<{ key: string; label: string; delta: number; note?: string }> = [];
  let score = 34 + diversitySeed;
  contributions.push({ key: 'base', label: 'Base score', delta: 34 });
  contributions.push({ key: 'diversity', label: 'Diversity seed', delta: diversitySeed });
  if (place.similarityStat && place.similarityStat !== 82) {
    const beforeBlend = score;
    score = Math.round((score * 0.76) + (place.similarityStat * 0.24));
    contributions.push({
      key: 'existing_similarity',
      label: 'Existing similarity blend',
      delta: score - beforeBlend,
      note: `Blended with existing similarityStat ${place.similarityStat}`,
    });
  }

  const affinity = getPlacePreferenceAffinity(place, input);
  const matchedInterestCount = affinity.matchedInterestCount;
  score += matchedInterestCount * 15;
  if (matchedInterestCount > 0) {
    contributions.push({
      key: 'interest_match',
      label: 'Matched interests',
      delta: matchedInterestCount * 15,
      note: `${matchedInterestCount} interest match(es)`,
    });
  }

  const discoverySignalBoost = computePlaceDiscoverySignalBoost(place.discoverySignals, input);
  if (discoverySignalBoost.delta > 0) {
    score += discoverySignalBoost.delta;
    contributions.push({
      key: 'discovery_signal',
      label: 'Matched Google acquisition query',
      delta: discoverySignalBoost.delta,
      note: [
        discoverySignalBoost.matchedCategories.join(', '),
        discoverySignalBoost.bestRank ? `best rank ${discoverySignalBoost.bestRank}` : null,
      ].filter(Boolean).join(' · '),
    });
  }

  if (input.selectedInterests.length > 0 && matchedInterestCount === 0) {
    score -= 12;
    contributions.push({
      key: 'interest_miss',
      label: 'No interest match penalty',
      delta: -12,
    });
  }

  const matchedVibe = affinity.matchedVibe;
  if (input.selectedVibe && matchedVibe) {
    score += 18;
    contributions.push({
      key: 'vibe_match',
      label: 'Matched vibe',
      delta: 18,
      note: input.selectedVibe,
    });
  }

  const noisePenalty = getPlacePreferenceNoisePenalty(place, input);
  score -= noisePenalty;
  if (noisePenalty > 0) {
    contributions.push({
      key: 'noise_penalty',
      label: 'Preference noise penalty',
      delta: -noisePenalty,
    });
  }

  if (input.selectedVibe && !matchedVibe) {
    score -= 8;
    contributions.push({
      key: 'vibe_miss',
      label: 'No vibe match penalty',
      delta: -8,
      note: input.selectedVibe,
    });
  }

  const momentOverlapCount = Array.from(momentKeywords).filter((keyword) =>
    normalizedTags.some((tag) => tag.includes(keyword) || keyword.includes(tag)) ||
    normalizedCategory.includes(keyword) ||
    keyword.includes(normalizedCategory),
  ).length;

  score += Math.min(momentOverlapCount * 10, 36);
  if (momentOverlapCount > 0) {
    contributions.push({
      key: 'moment_overlap',
      label: 'Moment keyword overlap',
      delta: Math.min(momentOverlapCount * 10, 36),
      note: `${momentOverlapCount} overlap(s)`,
    });
  }

  const bookmarkOverlapCount = Array.from(bookmarkKeywords).filter((keyword) =>
    normalizedTags.some((tag) => tag.includes(keyword) || keyword.includes(tag)) ||
    normalizedCategory.includes(keyword) ||
    keyword.includes(normalizedCategory),
  ).length;

  score += Math.min(bookmarkOverlapCount * 4, 12);
  if (bookmarkOverlapCount > 0) {
    contributions.push({
      key: 'bookmark_overlap',
      label: 'Bookmark keyword overlap',
      delta: Math.min(bookmarkOverlapCount * 4, 12),
      note: `${bookmarkOverlapCount} overlap(s)`,
    });
  }

  const socialOverlapCount = Array.from(socialKeywords).filter((keyword) =>
    normalizedTags.some((tag) => tag.includes(keyword) || keyword.includes(tag)) ||
    normalizedCategory.includes(keyword) ||
    keyword.includes(normalizedCategory),
  ).length;

  score += Math.min(socialOverlapCount * 4, 16);
  if (socialOverlapCount > 0) {
    contributions.push({
      key: 'social_overlap',
      label: 'Social keyword overlap',
      delta: Math.min(socialOverlapCount * 4, 16),
      note: `${socialOverlapCount} overlap(s)`,
    });
  }

  if ((place.rating ?? 0) >= 4.7) {
    score += 8;
    contributions.push({ key: 'rating', label: 'High place rating', delta: 8, note: `rating ${(place.rating ?? 0).toFixed(1)}` });
  } else if ((place.rating ?? 0) >= 4.4) {
    score += 5;
    contributions.push({ key: 'rating', label: 'Strong place rating', delta: 5, note: `rating ${(place.rating ?? 0).toFixed(1)}` });
  } else if ((place.rating ?? 0) >= 4.0) {
    score += 2;
    contributions.push({ key: 'rating', label: 'Good place rating', delta: 2, note: `rating ${(place.rating ?? 0).toFixed(1)}` });
  } else if ((place.rating ?? 0) > 0 && (place.rating ?? 0) < 3.8) {
    score -= 6;
    contributions.push({ key: 'rating', label: 'Low place rating penalty', delta: -6, note: `rating ${(place.rating ?? 0).toFixed(1)}` });
  }

  if (input.followedPlaceMatch) {
    score += 12;
    contributions.push({ key: 'followed_match', label: 'Followed-user overlap', delta: 12 });
  }

  if (input.isBookmarked) {
    score += 7;
    contributions.push({ key: 'bookmarked', label: 'Already bookmarked', delta: 7 });
  }

  if (input.isVisited) {
    score += 16;
    contributions.push({ key: 'visited', label: 'Already visited', delta: 16 });
  }

  if (typeof input.momentRating === 'number') {
    if (input.momentRating >= 5) {
      score += 24;
      contributions.push({ key: 'moment_rating', label: 'Moment rating boost', delta: 24, note: `rating ${input.momentRating}/5` });
    } else if (input.momentRating >= 4) {
      score += 18;
      contributions.push({ key: 'moment_rating', label: 'Moment rating boost', delta: 18, note: `rating ${input.momentRating}/5` });
    } else if (input.momentRating >= 3) {
      score += 10;
      contributions.push({ key: 'moment_rating', label: 'Moment rating boost', delta: 10, note: `rating ${input.momentRating}/5` });
    } else if (input.momentRating > 0 && input.momentRating <= 2) {
      score -= 10;
      contributions.push({ key: 'moment_rating', label: 'Low moment rating penalty', delta: -10, note: `rating ${input.momentRating}/5` });
    }
  }

  if (input.isVibed) {
    score += 7;
    contributions.push({ key: 'vibed', label: 'Previously vibed', delta: 7 });
  }

  if (input.isCommented) {
    score += 6;
    contributions.push({ key: 'commented', label: 'Previously commented', delta: 6 });
  }

  if (input.isRecent) {
    score += 7;
    contributions.push({ key: 'recent', label: 'Recent interaction', delta: 7 });
  }

  const unclampedScore = score;
  const finalScore = Math.max(28, Math.min(score, 98));
  if (finalScore != unclampedScore) {
    contributions.push({
      key: 'clamp',
      label: 'Score clamp',
      delta: finalScore - unclampedScore,
      note: `Clamped into 28...98`,
    });
  }

  return {
    finalScore,
    unclampedScore,
    classification: describeRecommendationClassification(finalScore),
    baseScore: 34,
    diversitySeed,
    matchedInterestCount,
    matchedVibe,
    discoverySignalBoost: discoverySignalBoost.delta,
    discoverySignalMatchedCategories: discoverySignalBoost.matchedCategories,
    discoverySignalBestRank: discoverySignalBoost.bestRank,
    noisePenalty,
    momentOverlapCount,
    bookmarkOverlapCount,
    socialOverlapCount,
    contributions,
  };
}

function computeDiscoveryAlignedPlaceScore(place: {
  id?: string;
  tags: string[];
  category?: string;
  similarityStat?: number;
  rating?: number | null;
  hook?: string | null;
  description?: string | null;
  whyYoullLikeIt?: string[] | null;
  discoverySignals?: PlaceDiscoverySignalForScoring[];
}, context: RecommendationContext) {
  return computeRecommendationScore(
    {
      id: place.id,
      tags: place.tags,
      category: place.category,
      similarityStat: place.similarityStat,
      rating: place.rating,
      hook: place.hook,
      description: place.description,
      whyYoullLikeIt: place.whyYoullLikeIt,
      discoverySignals: place.discoverySignals,
    },
    {
      selectedInterests: context.selectedInterests,
      selectedVibe: context.selectedVibe,
      bookmarkKeywords: context.bookmarkKeywords,
      momentKeywords: context.momentKeywords,
      socialKeywords: context.socialKeywords,
      isBookmarked: context.bookmarkedPlaceIds.has(place.id ?? ''),
      isVisited: context.visitedPlaceIds.has(place.id ?? ''),
      isVibed: context.vibedPlaceIds.has(place.id ?? ''),
      isCommented: context.commentedPlaceIds.has(place.id ?? ''),
      isRecent: context.recentPlaceIds.has(place.id ?? ''),
      followedPlaceMatch: context.followedPlaceIds.has(place.id ?? ''),
      momentRating: place.id ? (context.momentRatingsByPlaceId.get(place.id) ?? null) : null,
    },
  );
}

type RecommendationContext = {
  selectedInterests: string[];
  selectedVibe: string | null;
  bookmarkedPlaceIds: Set<string>;
  visitedPlaceIds: Set<string>;
  dismissedPlaceIds: Set<string>;
  manuallyDismissedPlaceIds: Set<string>;
  tasteKeywords: Set<string>;
  bookmarkKeywords: Set<string>;
  momentKeywords: Set<string>;
  followedUserIds: Set<string>;
  followedPlaceIds: Set<string>;
  socialKeywords: Set<string>;
  vibedPlaceIds: Set<string>;
  commentedPlaceIds: Set<string>;
  recentPlaceIds: Set<string>;
  momentRatingsByPlaceId: Map<string, number>;
};

type EventRecommendationContext = {
  selectedInterests: string[];
  selectedVibe: string | null;
  tasteKeywords: Set<string>;
  socialKeywords: Set<string>;
};

type TodayRecommendationCandidate = {
  id: string;
  name: string;
  category: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
  aiEnrichment: {
    vibeTags: string[];
    hook: string | null;
    description: string | null;
    bestTime: string | null;
    attitudeLabel: string | null;
  } | null;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenMiles(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const earthRadiusMiles = 3958.7613;
  const latDelta = toRadians(destination.latitude - origin.latitude);
  const lngDelta = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function buildTodayRecommendationReason(input: {
  baseReason?: string | null;
  bestTime?: string | null;
  distanceMiles: number;
  score: number;
}) {
  const distanceLabel = input.distanceMiles < 0.2
    ? 'just a short walk away'
    : `${input.distanceMiles.toFixed(1)} mi away`;
  const bestTime = input.bestTime?.trim();

  if (bestTime) {
    return `Strong fit for today: ${distanceLabel} and best if you go ${bestTime}.`;
  }

  if (input.baseReason?.trim()) {
    const cleaned = input.baseReason.trim().replace(/\s+/g, ' ');
    const normalized = cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned;
    return `${normalized}, and it is ${distanceLabel} today.`;
  }

  if (input.score >= 92) {
    return `One of your strongest nearby matches today, and only ${distanceLabel}.`;
  }

  return `High-compatibility pick for today that is only ${distanceLabel}.`;
}

function pickRandomTodayRecommendationCandidate<T>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] ?? null;
}

async function getUserRecommendationContext(userId: string): Promise<RecommendationContext> {
  const cached = recommendationContextCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const recentSince = new Date(Date.now() - (1000 * 60 * 60 * 24 * 120));
  const [preferences, dismissed, bookmarks, moments, follows, vibins, comments] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId },
    }),
    prisma.dismissedPlace.findMany({
      where: { userId },
      select: { placeId: true, reason: true },
    }),
    prisma.bookmark.findMany({
      where: { userId },
      select: {
        placeId: true,
        createdAt: true,
        place: {
          select: {
            category: true,
            aiEnrichment: { select: { vibeTags: true } },
          },
        },
      },
    }),
    prisma.moment.findMany({
      where: { userId },
      select: {
        placeId: true,
        visitedAt: true,
        createdAt: true,
        rating: true,
        place: {
          select: {
            category: true,
            aiEnrichment: { select: { vibeTags: true } },
          },
        },
      },
    }),
    prisma.follow.findMany({
      where: { sourceUserId: userId },
      select: { targetUserId: true },
    }),
    prisma.vibin.findMany({
      where: { senderUserId: userId },
      select: {
        targetType: true,
        targetId: true,
        createdAt: true,
        moment: {
          select: { placeId: true },
        },
      },
    }),
    prisma.comment.findMany({
      where: { userId },
      select: {
        targetType: true,
        targetId: true,
        createdAt: true,
        moment: {
          select: { placeId: true },
        },
      },
    }),
  ]);

  const followedUserIds = follows.map((item) => item.targetUserId);
  const followedMoments = followedUserIds.length > 0
    ? await prisma.moment.findMany({
        where: {
          userId: { in: followedUserIds },
          privacy: 'PUBLIC',
        },
        select: {
          placeId: true,
          place: {
            select: {
              category: true,
              aiEnrichment: { select: { vibeTags: true } },
            },
          },
        },
      })
    : [];

  const vibedPlaceIds = new Set(
    vibins
      .map((item) => (item.targetType === 'PLACE' ? item.targetId : item.moment?.placeId))
      .filter(Boolean) as string[],
  );
  const commentedPlaceIds = new Set(
    comments
      .map((item) => (item.targetType === 'PLACE' ? item.targetId : item.moment?.placeId))
      .filter(Boolean) as string[],
  );
  const recentPlaceIds = new Set<string>([
    ...bookmarks.filter((item) => item.createdAt >= recentSince).map((item) => item.placeId),
    ...moments.filter((item) => item.visitedAt >= recentSince || item.createdAt >= recentSince).map((item) => item.placeId),
    ...vibins
      .filter((item) => item.createdAt >= recentSince)
      .map((item) => (item.targetType === 'PLACE' ? item.targetId : item.moment?.placeId))
      .filter(Boolean) as string[],
    ...comments
      .filter((item) => item.createdAt >= recentSince)
      .map((item) => (item.targetType === 'PLACE' ? item.targetId : item.moment?.placeId))
      .filter(Boolean) as string[],
  ]);

  const value = {
    selectedInterests: preferences?.selectedInterests ?? [],
    selectedVibe: preferences?.selectedVibe ?? null,
    bookmarkedPlaceIds: new Set(bookmarks.map((item) => item.placeId)),
    visitedPlaceIds: new Set(moments.map((item) => item.placeId)),
    dismissedPlaceIds: new Set(dismissed.map((item) => item.placeId)),
    manuallyDismissedPlaceIds: new Set(
      dismissed
        .filter((item) => (item.reason ?? 'manual_hide') !== 'saved_to_bookmarks')
        .map((item) => item.placeId),
    ),
    tasteKeywords: new Set([
      ...collectTasteKeywords(bookmarks.map((item) => item.place)),
      ...collectTasteKeywords(moments.map((item) => item.place)),
    ]),
    bookmarkKeywords: collectTasteKeywords(bookmarks.map((item) => item.place)),
    momentKeywords: collectTasteKeywords(moments.map((item) => item.place)),
    followedUserIds: new Set(followedUserIds),
    followedPlaceIds: new Set(followedMoments.map((item) => item.placeId)),
    socialKeywords: collectTasteKeywords(followedMoments.map((item) => item.place)),
    vibedPlaceIds,
    commentedPlaceIds,
    recentPlaceIds,
    momentRatingsByPlaceId: buildMaxMomentRatingMap(
      moments.map((item) => ({
        placeId: item.placeId,
        rating: item.rating,
      })),
    ),
  };

  recommendationContextCache.set(userId, {
    expiresAt: Date.now() + RECOMMENDATION_CONTEXT_CACHE_TTL_MS,
    value,
  });

  return value;
}

function getEventRecommendationContext(context: RecommendationContext): EventRecommendationContext {
  return {
    selectedInterests: context.selectedInterests,
    selectedVibe: context.selectedVibe,
    tasteKeywords: context.tasteKeywords,
    socialKeywords: context.socialKeywords,
  };
}

function mapLocationToTicketmasterFilters(locationLabel: string, locationType?: string) {
  const normalized = locationLabel.trim().toLowerCase();

  if (locationType === 'city') {
    return {
      city: locationLabel,
    };
  }

  if (locationType === 'country') {
    const countryCode =
      normalized === 'united states' || normalized === 'usa' || normalized === 'us'
        ? 'US'
        : normalized === 'japan'
          ? 'JP'
          : normalized === 'indonesia'
            ? 'ID'
            : normalized === 'singapore'
              ? 'SG'
              : normalized === 'france'
                ? 'FR'
                : null;

    if (countryCode) {
      return { countryCode };
    }
  }

  return {};
}

async function fetchTicketmasterEvents(input: {
  locationLabel: string;
  locationType?: string;
  query?: string;
  selectedInterests?: string[];
  page?: number;
  limit?: number;
}) {
  if (!TICKETMASTER_API_KEY) {
    return {
      events: [],
      pagination: {
        page: input.page ?? 1,
        limit: input.limit ?? 10,
        total: 0,
        hasMore: false,
      },
    };
  }

  const page = Math.max(1, input.page ?? 1);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 20));
  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    size: String(limit),
    page: String(page - 1),
    sort: 'date,asc',
    locale: '*',
  });

  const selectedInterests = input.selectedInterests ?? [];
  const shoppingOnly = selectedInterests.length > 0 && selectedInterests.every((interest) => interest === 'shopping' || interest === 'shop_stroll');
  const natureOnly = selectedInterests.length > 0 && selectedInterests.every((interest) => interest === 'nature' || interest === 'parks_outdoor');
  const cafeOnly = selectedInterests.length > 0 && selectedInterests.every((interest) => interest === 'cafe' || interest === 'good_coffee' || interest === 'aesthetic_cafes');
  const cultureOnly = selectedInterests.length > 0 && selectedInterests.every((interest) => interest === 'culture' || interest === 'fun_activities');
  const partySelected = selectedInterests.includes('party') || selectedInterests.includes('drinks_nightlife');

  if (!shoppingOnly && !natureOnly && !cafeOnly) {
    params.set('classificationName', 'music');
  }

  const locationFilters = mapLocationToTicketmasterFilters(input.locationLabel, input.locationType);
  if (locationFilters.city) params.set('city', locationFilters.city);
  if (locationFilters.countryCode) params.set('countryCode', locationFilters.countryCode);

  if (input.query?.trim()) {
    params.set('keyword', input.query.trim());
  } else if (shoppingOnly) {
    params.set('keyword', 'market fair bazaar pop up makers expo');
  } else if (cultureOnly) {
    params.set('keyword', 'arts theatre jazz cultural festival exhibition');
  } else if (natureOnly) {
    params.set('keyword', 'outdoor garden park festival');
  } else if (cafeOnly) {
    params.set('keyword', 'acoustic listening community intimate');
  } else if (partySelected && (selectedInterests.includes('shopping') || selectedInterests.includes('shop_stroll'))) {
    params.set('keyword', 'concert nightlife market pop up');
  }

  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Ticketmaster Discovery API failed with ${response.status}`);
  }

  const payload = await response.json() as {
    page?: {
      number?: number;
      size?: number;
      totalElements?: number;
      totalPages?: number;
    };
    _embedded?: {
      events?: Array<{
        id: string;
        name?: string;
        url?: string;
        info?: string;
        pleaseNote?: string;
        dates?: {
          start?: {
            localDate?: string;
            localTime?: string;
            dateTime?: string;
          };
          end?: {
            localDate?: string;
            localTime?: string;
            dateTime?: string;
          };
          status?: {
            code?: string;
          };
        };
        images?: Array<{
          url?: string;
          width?: number;
          ratio?: string;
        }>;
        classifications?: Array<{
          segment?: { name?: string };
          genre?: { name?: string };
          subGenre?: { name?: string };
          type?: { name?: string };
          subType?: { name?: string };
        }>;
        priceRanges?: Array<{
          min?: number;
          max?: number;
          currency?: string;
        }>;
        _embedded?: {
          venues?: Array<{
            name?: string;
            city?: { name?: string };
            country?: { name?: string };
          }>;
        };
      }>;
    };
  };

  return {
    events: payload._embedded?.events ?? [],
    pagination: {
      page: (payload.page?.number ?? (page - 1)) + 1,
      limit: payload.page?.size ?? limit,
      total: payload.page?.totalElements ?? 0,
      hasMore: ((payload.page?.number ?? (page - 1)) + 1) < (payload.page?.totalPages ?? 0),
    },
  };
}

function buildEventKeywordBag(event: {
  name: string;
  category?: string | null;
  tags: string[];
  description?: string | null;
  venueName?: string | null;
  location: string;
}) {
  return new Set(
    [event.name, event.category ?? '', event.description ?? '', event.venueName ?? '', event.location, ...event.tags]
      .join(' ')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function getEventPreferenceAffinity(event: {
  name: string;
  category?: string | null;
  tags: string[];
  description?: string | null;
  venueName?: string | null;
  location: string;
}, input: EventRecommendationContext) {
  const keywords = buildEventKeywordBag(event);
  const normalizedCategory = normalizeKeyword(event.category ?? '');

  const interestMatchers: Record<string, string[]> = {
    nature: ['outdoor', 'park', 'festival', 'garden'],
    cafe: ['acoustic', 'intimate', 'coffee', 'community', 'listening'],
    culture: ['arts', 'museum', 'gallery', 'cultural', 'classical', 'jazz', 'theatre', 'festival'],
    shopping: ['market', 'fair', 'expo', 'pop up', 'bazaar', 'vendor', 'makers'],
    party: ['concert', 'music', 'dance', 'dj', 'nightlife', 'festival', 'electronic', 'after dark'],
    adventure: ['sports', 'outdoor', 'active', 'arena', 'race'],
    good_coffee: ['coffee', 'latte', 'espresso', 'listening', 'community'],
    aesthetic_cafes: ['design', 'art', 'visual', 'fashion', 'immersive'],
    desserts_sweet_treats: ['dessert', 'sweet', 'festival', 'bakery'],
    street_food_casual_eats: ['food', 'street', 'market', 'festival', 'casual'],
    asian_comfort_food: ['ramen', 'sushi', 'asian', 'japanese', 'korean'],
    drinks_nightlife: ['concert', 'music', 'dance', 'dj', 'nightlife', 'festival', 'electronic', 'after dark'],
    shop_stroll: ['market', 'fair', 'expo', 'pop up', 'bazaar', 'vendor', 'makers'],
    fun_activities: ['festival', 'museum', 'gallery', 'immersive', 'sports', 'active'],
    parks_outdoor: ['outdoor', 'park', 'festival', 'garden'],
  };

  let matchedInterestCount = 0;
  for (const interest of input.selectedInterests) {
    const matchers = interestMatchers[interest] ?? [normalizeKeyword(interest)];
    if (matchers.some((matcher) => Array.from(keywords).some((keyword) => keyword.includes(matcher.replace(/\s+/g, '')) || matcher.includes(keyword)) || normalizedCategory.includes(matcher))) {
      matchedInterestCount += 1;
    }
  }

  const vibeMatchers: Record<string, string[]> = {
    aesthetic: ['visual', 'immersive', 'art', 'design', 'fashion'],
    solo: ['intimate', 'acoustic', 'museum', 'classical', 'listening', 'seated'],
    luxury: ['vip', 'premium', 'gala', 'exclusive'],
    budget: ['free', 'community', 'festival', 'outdoor'],
    spontaneous: ['tonight', 'live', 'downtown', 'weekend', 'after dark', 'late'],
  };

  let matchedVibe = false;
  if (input.selectedVibe) {
    matchedVibe = (vibeMatchers[input.selectedVibe] ?? []).some((matcher) =>
      Array.from(keywords).some((keyword) => keyword.includes(matcher.replace(/\s+/g, '')) || matcher.includes(keyword)) ||
      normalizedCategory.includes(matcher),
    );
  }

  return { matchedInterestCount, matchedVibe };
}

function shouldKeepEventForPreferences(event: {
  category?: string | null;
  tags: string[];
  description?: string | null;
  venueName?: string | null;
  location: string;
  name: string;
}, input: EventRecommendationContext) {
  if (input.selectedInterests.length === 0 && !input.selectedVibe) return true;

  const affinity = getEventPreferenceAffinity(event, input);
  if (affinity.matchedInterestCount > 0 || affinity.matchedVibe) return true;

  if (input.selectedInterests.includes('shopping') || input.selectedInterests.includes('shop_stroll')) {
    return false;
  }

  if (input.selectedInterests.length > 0) {
    return false;
  }

  return true;
}

function normalizeEventCategory(category?: string | null, tags: string[] = [], description?: string | null) {
  const trimmedCategory = category?.trim();
  if (trimmedCategory) return trimmedCategory;

  const normalizedDescription = normalizeKeyword(description ?? '');
  if (normalizedDescription.includes('dj') || normalizedDescription.includes('dance floor')) return 'Nightlife / DJ';
  if (normalizedDescription.includes('market') || normalizedDescription.includes('vendors')) return 'Market / Pop-up';

  const firstTag = tags.find((tag) => tag?.trim());
  if (firstTag) return firstTag.replace(/[_-]+/g, ' ');

  return 'Live event';
}

function computeEventCompatibilityScore(event: {
  id: string;
  name: string;
  category?: string | null;
  tags: string[];
  description?: string | null;
  venueName?: string | null;
  location: string;
  startAt: string;
  priceMin?: number | null;
  priceMax?: number | null;
}, input: EventRecommendationContext) {
  const keywords = buildEventKeywordBag(event);
  const normalizedCategory = normalizeKeyword(event.category ?? '');
  let score = 38 + (hashScoreSeed(`${event.id}|${event.name}|${event.startAt}`) % 14);
  const affinity = getEventPreferenceAffinity(event, input);
  const matchedInterestCount = affinity.matchedInterestCount;
  score += matchedInterestCount * 12;
  if (input.selectedInterests.length > 0 && matchedInterestCount === 0) {
    score -= 10;
  }

  if (input.selectedVibe) {
    if (affinity.matchedVibe) {
      score += 14;
    } else {
      score -= 8;
    }
  }

  const tasteOverlapCount = Array.from(input.tasteKeywords).filter((keyword) =>
    Array.from(keywords).some((item) => item.includes(keyword) || keyword.includes(item)) ||
    normalizedCategory.includes(keyword),
  ).length;
  score += Math.min(tasteOverlapCount * 6, 24);

  const socialOverlapCount = Array.from(input.socialKeywords).filter((keyword) =>
    Array.from(keywords).some((item) => item.includes(keyword) || keyword.includes(item)) ||
    normalizedCategory.includes(keyword),
  ).length;
  score += Math.min(socialOverlapCount * 4, 16);

  const now = Date.now();
  const startsAtMs = Number.isNaN(new Date(event.startAt).getTime()) ? null : new Date(event.startAt).getTime();
  if (startsAtMs) {
    const daysUntilStart = (startsAtMs - now) / (1000 * 60 * 60 * 24);
    if (daysUntilStart < 0) {
      score -= 18;
    } else if (daysUntilStart <= 3) {
      score += 16;
    } else if (daysUntilStart <= 7) {
      score += 12;
    } else if (daysUntilStart <= 30) {
      score += 6;
    }
  }

  const effectivePrice = typeof event.priceMin === 'number' ? event.priceMin : event.priceMax ?? null;
  if (input.selectedVibe === 'budget') {
    if (effectivePrice === 0) score += 10;
    else if (typeof effectivePrice === 'number' && effectivePrice <= 35) score += 6;
    else if (typeof effectivePrice === 'number' && effectivePrice >= 120) score -= 10;
  }
  if (input.selectedVibe === 'luxury' && typeof effectivePrice === 'number' && effectivePrice >= 120) {
    score += 8;
  }

  return Math.max(24, Math.min(score, 98));
}

function buildEventCompatibilityReason(event: {
  name: string;
  category?: string | null;
  tags: string[];
  description?: string | null;
  venueName?: string | null;
  location: string;
  startAt: string;
  score: number;
}, input: EventRecommendationContext) {
  const normalizedTags = event.tags.map((tag) => normalizeKeyword(tag));
  const normalizedDescription = normalizeKeyword(event.description ?? '');
  const normalizedName = normalizeKeyword(event.name);
  const normalizedCategory = normalizeKeyword(event.category ?? '');
  const startsAt = new Date(event.startAt);
  const daysUntilStart = Number.isNaN(startsAt.getTime())
    ? null
    : Math.round((startsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const scoreLabel = event.score >= 88 ? 'very strong' : event.score >= 78 ? 'strong' : 'solid';

  if ((input.selectedInterests.includes('party') || input.selectedInterests.includes('drinks_nightlife')) && (normalizedTags.some((tag) => tag.includes('concert') || tag.includes('festival') || tag.includes('music')) || normalizedName.includes('live') || normalizedCategory.includes('music'))) {
    return `it looks like a ${scoreLabel} nightlife fit, with live-music energy that lines up with what you usually lean toward`;
  }

  if ((input.selectedInterests.includes('culture') || input.selectedInterests.includes('fun_activities')) && normalizedTags.some((tag) => tag.includes('arts') || tag.includes('museum') || tag.includes('theatre') || tag.includes('jazz'))) {
    return `it reads as a ${scoreLabel} culture pick, with more arts-led energy than the average event in this city`;
  }

  if ((input.selectedInterests.includes('shopping') || input.selectedInterests.includes('shop_stroll')) && (normalizedTags.some((tag) => tag.includes('market') || tag.includes('fair') || tag.includes('bazaar')) || normalizedDescription.includes('vendor'))) {
    return `it feels like a ${scoreLabel} shopping-and-browse pick, especially if you are in the mood for markets, makers, and pop-ups`;
  }

  if (input.selectedVibe === 'solo' && normalizedTags.some((tag) => tag.includes('intimate') || tag.includes('acoustic') || tag.includes('classical'))) {
    return `it feels like a ${scoreLabel} solo-night match, with a lower-pressure format than a big crowd event`;
  }

  if (input.selectedVibe === 'budget' && normalizedTags.some((tag) => tag.includes('festival') || tag.includes('community'))) {
    return `it looks like a ${scoreLabel} budget-friendly pick for your current vibe, with lighter commitment than most ticketed events`;
  }

  if (input.selectedVibe === 'aesthetic' && (normalizedTags.some((tag) => tag.includes('fashion') || tag.includes('art') || tag.includes('design')) || normalizedDescription.includes('immersive'))) {
    return `it has a more visual, curated feel, so it lands as a ${scoreLabel} aesthetic match right now`;
  }

  if (input.selectedVibe === 'spontaneous' && typeof daysUntilStart === 'number' && daysUntilStart >= 0 && daysUntilStart <= 7) {
    return `it is happening soon, which makes it a ${scoreLabel} spontaneous pick if you want something timely without overplanning`;
  }

  if (typeof daysUntilStart === 'number' && daysUntilStart >= 0 && daysUntilStart <= 7) {
    return `the timing is unusually strong right now, and that makes it a ${scoreLabel} pick in ${event.location}`;
  }

  if (event.venueName) {
    return `it stands out as a ${scoreLabel} fit around ${event.venueName}, even before adding the timing boost`;
  }

  return `it lines up as a ${scoreLabel} fit for the event energy your profile is responding to right now`;
}

function hashStringSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function rotateArray<T>(items: T[], offset: number) {
  if (items.length <= 1) return items;
  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function applyRankedVariety<T extends { similarityStat?: number | null }>(items: T[], seedKey: string) {
  if (items.length <= 2) return items;

  const mustVisitBucket: T[] = [];
  const fitsYouBucket: T[] = [];
  const worthALookBucket: T[] = [];
  const maybeBucket: T[] = [];

  items.forEach((item) => {
    const score = item.similarityStat ?? 0;
    if (score >= 90) mustVisitBucket.push(item);
    else if (score >= 78) fitsYouBucket.push(item);
    else if (score >= 62) worthALookBucket.push(item);
    else maybeBucket.push(item);
  });

  const seed = hashStringSeed(seedKey);
  const buckets = {
    mustVisit: rotateArray(mustVisitBucket, seed),
    fitsYou: rotateArray(fitsYouBucket, seed * 2 + 1),
    worthALook: rotateArray(worthALookBucket, seed * 3 + 2),
    maybe: rotateArray(maybeBucket, seed * 5 + 3),
  };
  const pattern: Array<keyof typeof buckets> = [
    'mustVisit',
    'fitsYou',
    'worthALook',
    'worthALook',
    'maybe',
  ];
  const usedItems = new Set<T>();
  const result: T[] = [];

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;

    for (const bucketKey of pattern) {
      const bucket = buckets[bucketKey];
      while (bucket.length > 0) {
        const candidate = bucket.shift()!;
        if (usedItems.has(candidate)) {
          continue;
        }
        usedItems.add(candidate);
        result.push(candidate);
        madeProgress = true;
        break;
      }
    }
  }

  return result;
}

function buildEventHook(event: {
  name: string;
  category?: string | null;
  venueName?: string | null;
  tags: string[];
  score: number;
}) {
  const normalizedTags = event.tags.map((tag) => normalizeKeyword(tag));
  const normalizedCategory = normalizeKeyword(event.category ?? '');
  const scoreLabel = event.score >= 88 ? 'Very your vibe.' : event.score >= 78 ? 'Worth opening.' : 'Worth a look.';

  if (normalizedTags.some((tag) => tag.includes('market') || tag.includes('bazaar') || tag.includes('fair'))) {
    return `${event.venueName ? `${event.venueName} has` : 'This one has'} market energy. ${scoreLabel}`;
  }

  if (normalizedTags.some((tag) => tag.includes('concert') || tag.includes('music') || tag.includes('festival')) || normalizedCategory.includes('music')) {
    return `${event.name} looks like a live-night pick. ${scoreLabel}`;
  }

  if (normalizedTags.some((tag) => tag.includes('jazz') || tag.includes('theatre') || tag.includes('arts'))) {
    return `${event.name} leans more culture than generic. ${scoreLabel}`;
  }

  return `${event.name} fits the current feed better than most. ${scoreLabel}`;
}

async function getDiscoveryEventsForUser(options: {
  userId?: string;
  locationLabel: string;
  locationType?: string;
  searchQuery?: string;
  selectedInterests?: string[];
  selectedVibe?: string | null;
  page?: number;
  limit?: number;
}) {
  const currentPreferences = options.userId
    ? await prisma.userPreference.findUnique({
        where: { userId: options.userId },
      })
    : null;

  const selectedInterests = options.selectedInterests?.length
    ? options.selectedInterests
    : currentPreferences?.selectedInterests ?? [];
  const selectedVibe = options.selectedVibe ?? currentPreferences?.selectedVibe ?? null;

  const ticketmasterResponse = await fetchTicketmasterEvents({
    locationLabel: options.locationLabel,
    locationType: options.locationType,
    query: options.searchQuery,
    selectedInterests,
    page: options.page,
    limit: options.limit,
  });

  const context = options.userId
    ? getEventRecommendationContext(await getUserRecommendationContext(options.userId))
    : {
        selectedInterests,
        selectedVibe,
        tasteKeywords: new Set<string>(),
        socialKeywords: new Set<string>(),
      };

  const rankedEvents = ticketmasterResponse.events
    .map((event) => {
      const venue = event._embedded?.venues?.[0];
      const classifications = event.classifications?.[0];
      const tags = [
        classifications?.segment?.name,
        classifications?.genre?.name,
        classifications?.subGenre?.name,
        classifications?.type?.name,
        classifications?.subType?.name,
      ].filter(Boolean) as string[];
      const description = event.info ?? event.pleaseNote ?? '';
      const startAt = event.dates?.start?.dateTime
        ?? (event.dates?.start?.localDate
          ? `${event.dates.start.localDate}T${event.dates?.start?.localTime ?? '19:00:00'}`
          : new Date().toISOString());
      const priceRange = event.priceRanges?.[0];
      const location = [venue?.city?.name, venue?.country?.name].filter(Boolean).join(', ') || options.locationLabel;
      const category = normalizeEventCategory(
        [classifications?.segment?.name, classifications?.genre?.name].filter(Boolean).join(' / '),
        tags,
        description,
      );
      const score = computeEventCompatibilityScore({
        id: event.id,
        name: event.name ?? 'Untitled event',
        category,
        tags,
        description,
        venueName: venue?.name,
        location,
        startAt,
        priceMin: priceRange?.min ?? null,
        priceMax: priceRange?.max ?? null,
      }, context);

      return {
        id: event.id,
        source: 'ticketmaster',
        name: event.name ?? 'Untitled event',
        description,
        hook: buildEventHook({
          name: event.name ?? 'Untitled event',
          category,
          venueName: venue?.name,
          tags,
          score,
        }),
        image: event.images?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url,
        venueName: venue?.name,
        location,
        category,
        tags: tags.filter((tag) => tag && tag.trim().toLowerCase() !== 'undefined'),
        startAt,
        endAt: event.dates?.end?.dateTime
          ?? (event.dates?.end?.localDate
            ? `${event.dates.end.localDate}T${event.dates?.end?.localTime ?? '23:00:00'}`
            : undefined),
        ticketUrl: event.url,
        priceLabel: typeof priceRange?.min === 'number' || typeof priceRange?.max === 'number'
          ? `${priceRange.currency ?? ''} ${priceRange.min ?? priceRange.max}${typeof priceRange?.max === 'number' && priceRange.max !== priceRange.min ? ` - ${priceRange.max}` : ''}`.trim()
          : undefined,
        priceMin: priceRange?.min,
        priceMax: priceRange?.max,
        currency: priceRange?.currency,
        compatibilityScore: score,
        compatibilityReason: buildEventCompatibilityReason({
          name: event.name ?? 'Untitled event',
          category,
          tags,
          description,
          venueName: venue?.name,
          location,
          startAt,
          score,
        }, context),
        status: event.dates?.status?.code,
        _preferenceAffinity: getEventPreferenceAffinity({
          name: event.name ?? 'Untitled event',
          category,
          tags,
          description,
          venueName: venue?.name,
          location,
        }, context),
      };
    })
    .sort((a, b) => {
      const affinityA = a._preferenceAffinity.matchedInterestCount + (a._preferenceAffinity.matchedVibe ? 1 : 0);
      const affinityB = b._preferenceAffinity.matchedInterestCount + (b._preferenceAffinity.matchedVibe ? 1 : 0);
      if (affinityB !== affinityA) return affinityB - affinityA;
      return b.compatibilityScore - a.compatibilityScore;
    });

  let events = rankedEvents;

  if (selectedInterests.length > 0 || selectedVibe) {
    const filteredEvents = events.filter((event) =>
      shouldKeepEventForPreferences(
        {
          name: event.name,
          category: event.category,
          tags: event.tags,
          description: event.description,
          venueName: event.venueName,
          location: event.location,
        },
        context,
      ),
    );

    if (filteredEvents.length > 0 || selectedInterests.includes('shopping') || selectedInterests.includes('shop_stroll')) {
      events = filteredEvents;
    }
  }

  const finalEvents = events.map(({ _preferenceAffinity, ...event }) => event);

  return {
    events: finalEvents,
    pagination: ticketmasterResponse.pagination,
  };
}

async function applyAiCompatibilityToPlaces(input: {
  userId: string;
  places: Array<{
    id: string;
    name: string;
    location: string;
    category?: string;
    rating?: number | null;
    tags: string[];
    attitudeLabel?: string;
    bestTime?: string;
    similarityStat?: number;
    whyYoullLikeIt?: string[];
  }>;
  context: RecommendationContext;
  persistedScores: Array<{ placeId: string; sourceVersion: string | null }>;
  forceRefresh?: boolean;
}) {
  if (!ENABLE_RUNTIME_AI || !OPENAI_API_KEY || input.places.length === 0) {
    return new Map<string, { score: number; reason: string }>();
  }

  const persistedMap = new Map(input.persistedScores.map((item) => [item.placeId, item.sourceVersion]));
  const candidates = input.places
    .filter((place) => input.forceRefresh || persistedMap.get(place.id) !== 'writeback-v6-ai')
    .slice(0, 3);

  const results = new Map<string, { score: number; reason: string }>();

  for (const place of candidates) {
    const [city, country] = place.location.split(',').map((part) => part.trim());
    let assessment: Awaited<ReturnType<typeof generateAiCompatibilityAssessment>> = null;
    try {
      assessment = await generateAiCompatibilityAssessment({
        place: {
          name: place.name,
          city: city || null,
          country: country || null,
          category: place.category ?? 'recommended spot',
          rating: typeof place.rating === 'number' ? place.rating : null,
          vibeTags: place.tags,
          attitudeLabel: place.attitudeLabel ?? null,
          bestTime: place.bestTime ?? null,
        },
        user: {
          selectedInterests: input.context.selectedInterests,
          selectedVibe: input.context.selectedVibe,
          tasteKeywords: Array.from(input.context.tasteKeywords).slice(0, 8),
          socialKeywords: Array.from(input.context.socialKeywords).slice(0, 6),
          tasteProfileSummary: buildUserTasteProfileSummary(input.context),
          followedPlaceMatch: input.context.followedPlaceIds.has(place.id),
          isBookmarked: input.context.bookmarkedPlaceIds.has(place.id),
          isVisited: input.context.visitedPlaceIds.has(place.id),
          isVibed: input.context.vibedPlaceIds.has(place.id),
          isCommented: input.context.commentedPlaceIds.has(place.id),
          isRecent: input.context.recentPlaceIds.has(place.id),
        },
      });
    } catch (error) {
      console.error('AI compatibility skipped for place', place.id, place.name, error);
      continue;
    }

    if (!assessment) continue;

    const score = Math.max(28, Math.min(98, (place.similarityStat ?? 0) + assessment.boost));
    await prisma.userPlaceScore.upsert({
      where: {
        userId_placeId: {
          userId: input.userId,
          placeId: place.id,
        },
      },
        update: {
          matchScore: score,
          similarityPercentage: score,
          recommendationReason: assessment.reason,
          sourceVersion: 'writeback-v6-ai',
        },
        create: {
          userId: input.userId,
          placeId: place.id,
          matchScore: score,
          similarityPercentage: score,
          recommendationReason: assessment.reason,
          sourceVersion: 'writeback-v6-ai',
        },
    });

    results.set(place.id, {
      score,
      reason: assessment.reason,
    });
  }

  return results;
}

function buildUserTasteProfileSummary(context: RecommendationContext) {
  const interestLabelMap: Record<string, string> = {
    cafe: 'coffee-stop taste',
    nature: 'green-reset taste',
    culture: 'culture-heavy taste',
    shopping: 'good-browse taste',
    party: 'after-dark taste',
    adventure: 'detour-first taste',
  };
  const vibeLabelMap: Record<string, string> = {
    aesthetic: 'main-character energy',
    solo: 'solo-day energy',
    luxury: 'elevated taste',
    budget: 'budget-win instinct',
    spontaneous: 'spur-of-the-moment energy',
  };

  const traits: string[] = [];
  const primaryInterest = context.selectedInterests[0];
  if (primaryInterest && interestLabelMap[primaryInterest]) {
    traits.push(interestLabelMap[primaryInterest]);
  }
  if (context.selectedVibe && vibeLabelMap[context.selectedVibe]) {
    traits.push(vibeLabelMap[context.selectedVibe]);
  }

  const keywordSlice = Array.from(context.tasteKeywords).slice(0, 4);
  if (keywordSlice.length > 0) {
    traits.push(`save pattern around ${keywordSlice.join(', ')}`);
  }

  if (context.followedUserIds.size > 0 || context.followedPlaceIds.size > 0) {
    traits.push('social proof matters in their picks');
  }

  if (context.recentPlaceIds.size > 0) {
    traits.push('recent behavior matters most');
  }

  return traits.slice(0, 4);
}

function buildRecommendationReason(input: {
  place: {
    category?: string;
    tags: string[];
  };
  selectedInterests: string[];
  selectedVibe?: string | null;
  tasteKeywords: Set<string>;
  followedTravelerVisits: number;
  followedPlaceMatch: boolean;
  socialOverlap: boolean;
  isBookmarked: boolean;
  isVisited: boolean;
  isVibed: boolean;
  isCommented: boolean;
  isRecent: boolean;
  isDismissed: boolean;
}) {
  if (input.isDismissed) {
    return 'You hid this one, so it drops out of your picks.';
  }

  const normalizedTags = input.place.tags.map(normalizeKeyword);
  const normalizedCategory = normalizeKeyword(input.place.category ?? '');

  const matchingInterests = input.selectedInterests.filter((interest) => {
    const normalizedInterest = normalizeKeyword(interest);
    return normalizedTags.some((tag) => tag.includes(normalizedInterest)) || normalizedCategory.includes(normalizedInterest);
  });

  const interestLabelMap: Record<string, string> = {
    cafe: 'coffee stop',
    nature: 'green reset',
    culture: 'culture fix',
    shopping: 'good browse',
    party: 'after-dark plan',
    adventure: 'easy detour',
    good_coffee: 'coffee run',
    aesthetic_cafes: 'aesthetic cafe streak',
    desserts_sweet_treats: 'sweet treat hunt',
    street_food_casual_eats: 'casual eats streak',
    asian_comfort_food: 'asian comfort run',
    drinks_nightlife: 'after-dark plan',
    shop_stroll: 'shop-and-stroll mood',
    fun_activities: 'things-to-do streak',
    parks_outdoor: 'green reset',
  };

  const vibeLabelMap: Record<string, string> = {
    aesthetic: 'main-character vibe',
    solo: 'solo-day energy',
    luxury: 'elevated taste',
    budget: 'budget-win energy',
    spontaneous: 'spur-of-the-moment plan',
  };

  if (matchingInterests.length > 0) {
    const interestLabel = interestLabelMap[matchingInterests[0]] ?? matchingInterests[0];
    if (input.selectedVibe && vibeLabelMap[input.selectedVibe]) {
      return `It fits your ${interestLabel} streak with ${vibeLabelMap[input.selectedVibe]}.`;
    }
    return `It fits the ${interestLabel} side of your taste right now.`;
  }

  if (input.selectedVibe) {
    const normalizedVibe = normalizeKeyword(input.selectedVibe);
    if (normalizedTags.some((tag) => tag.includes(normalizedVibe)) || normalizedCategory.includes(normalizedVibe)) {
      return `It lands right in your ${vibeLabelMap[input.selectedVibe] ?? input.selectedVibe} lane.`;
    }
  }

  if (Array.from(input.tasteKeywords).some((keyword) =>
    normalizedTags.some((tag) => tag.includes(keyword) || keyword.includes(tag)) ||
    normalizedCategory.includes(keyword) ||
    keyword.includes(normalizedCategory),
  )) {
    return 'It feels close to the places you already save and revisit.';
  }

  if (input.followedPlaceMatch) {
    return 'It keeps showing up around travelers you already trust.';
  }

  if (input.followedTravelerVisits > 0) {
    return input.followedTravelerVisits === 1
      ? 'Someone you follow already put this on the map.'
      : `People you follow keep ending up here.`;
  }

  if (input.socialOverlap) {
    return 'It matches the taste pattern building around your graph.';
  }

  if (input.isBookmarked) {
    return 'You already saved this, so it still ranks as your thing.';
  }

  if (input.isVisited) {
    return 'It lines up with the kinds of places you actually go to.';
  }

  if (input.isVibed) {
    return 'It tracks with the places you keep vibing with.';
  }

  if (input.isCommented) {
    return 'It is close to the spots you usually have thoughts about.';
  }

  if (input.isRecent) {
    return 'It matches what you have been into lately.';
  }

  return 'It is one of the strongest fits for your taste in this area.';
}

function buildPlaceDetailRecommendationFallback(place: {
  category?: string | null;
  tags?: string[] | null;
  attitudeLabel?: string | null;
  bestTime?: string | null;
  hook?: string | null;
  description?: string | null;
}) {
  const normalizedCategory = normalizeKeyword(place.category ?? '');
  const normalizedTags = (place.tags ?? []).map(normalizeKeyword);

  if (normalizedTags.some((tag) => tag.includes('hidden gem')) || normalizeKeyword(place.attitudeLabel ?? '').includes('hidden gem')) {
    return 'It feels like the kind of under-the-radar find your feed keeps rewarding.';
  }

  if (normalizedTags.some((tag) => tag.includes('cafe')) || normalizedCategory.includes('cafe') || normalizedCategory.includes('coffee')) {
    return 'It lines up with the slower, save-now coffee spots your taste keeps leaning toward.';
  }

  if (normalizedTags.some((tag) => tag.includes('nature')) || normalizedCategory.includes('park') || normalizedCategory.includes('garden')) {
    return 'It fits the reset-heavy side of your taste more than the average stop nearby.';
  }

  if (normalizedTags.some((tag) => tag.includes('shopping')) || normalizedCategory.includes('shop') || normalizedCategory.includes('market')) {
    return 'It reads like one of your stronger browse-and-discover kinds of stops.';
  }

  if (place.bestTime) {
    return `It stands out more than most places nearby, especially if you catch it ${place.bestTime}.`;
  }

  return 'It is landing as one of the stronger fits for your taste in this area right now.';
}

function isGenericPlaceSummaryReason(input: {
  persistedReason?: string | null;
  category?: string | null;
  hook?: string | null;
  description?: string | null;
  placeName?: string | null;
}) {
  const persistedReason = input.persistedReason?.trim().toLowerCase();
  if (!persistedReason) return false;

  const description = input.description?.trim().toLowerCase();
  const hook = input.hook?.trim().toLowerCase();
  const category = normalizeKeyword(input.category ?? '');
  const placeName = input.placeName?.trim().toLowerCase() ?? '';

  if (description && persistedReason === description) return true;
  if (hook && persistedReason === hook) return true;

  if (
    placeName &&
    persistedReason.includes(placeName) &&
    (
      persistedReason.includes('stands out as a solid') ||
      persistedReason.includes('works best when') ||
      persistedReason.includes('offers a compact') ||
      persistedReason.includes('feels best as an easy') ||
      persistedReason.includes('worth a closer look')
    )
  ) {
    return true;
  }

  if (
    category &&
    (
      persistedReason.includes(`solid ${category}`) ||
      persistedReason.includes(`${category} worth a closer look`) ||
      persistedReason.includes(`travel stop when you want`) ||
      persistedReason.includes(`addition to your plan`)
    )
  ) {
    return true;
  }

  return false;
}

function resolvePlaceDetailRecommendationReason(input: {
  persistedReason?: string | null;
  category?: string | null;
  tags?: string[] | null;
  attitudeLabel?: string | null;
  bestTime?: string | null;
  hook?: string | null;
  description?: string | null;
  placeName?: string | null;
}) {
  const persistedReason = input.persistedReason?.trim();
  const description = input.description?.trim();
  const hook = input.hook?.trim();

  if (
    persistedReason &&
    !isGenericPlaceSummaryReason(input) &&
    persistedReason.toLowerCase() !== description?.toLowerCase() &&
    persistedReason.toLowerCase() !== hook?.toLowerCase()
  ) {
    return persistedReason;
  }

  return buildPlaceDetailRecommendationFallback(input);
}

async function refreshUserPlaceScores(userId: string, placeIds: string[]) {
  const uniquePlaceIds = Array.from(new Set(placeIds.filter(Boolean)));
  if (uniquePlaceIds.length === 0) return;

  const context = await getUserRecommendationContext(userId);
  const [places, followedTravelerVisits] = await Promise.all([
    prisma.place.findMany({
      where: { id: { in: uniquePlaceIds } },
      include: {
        aiEnrichment: true,
        discoverySignals: {
          orderBy: [
            { bestResultRank: 'asc' },
            { resultRank: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 30,
        },
      },
    }),
    context.followedUserIds.size > 0
      ? prisma.moment.groupBy({
          by: ['placeId'],
          where: {
            placeId: { in: uniquePlaceIds },
            userId: { in: Array.from(context.followedUserIds) },
            privacy: 'PUBLIC',
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const followedVisitMap = new Map(followedTravelerVisits.map((item) => [item.placeId, item._count._all]));

  await Promise.all(
    places.map((place) => {
      const baseScore = computeRecommendationScore(
        {
          id: place.id,
          tags: place.aiEnrichment?.vibeTags ?? [place.category],
          category: place.category,
          rating: place.rating,
          hook: place.aiEnrichment?.hook ?? null,
          description: place.aiEnrichment?.description ?? null,
          whyYoullLikeIt: [
            ...(place.aiEnrichment?.description ? [place.aiEnrichment.description] : []),
            ...(place.aiEnrichment?.bestTime ? [`best at ${place.aiEnrichment.bestTime}`] : []),
          ],
          discoverySignals: place.discoverySignals,
        },
        {
          selectedInterests: context.selectedInterests,
          selectedVibe: context.selectedVibe,
          bookmarkKeywords: context.bookmarkKeywords,
          momentKeywords: context.momentKeywords,
          socialKeywords: context.socialKeywords,
          isBookmarked: context.bookmarkedPlaceIds.has(place.id),
          isVisited: context.visitedPlaceIds.has(place.id),
          isVibed: context.vibedPlaceIds.has(place.id),
          isCommented: context.commentedPlaceIds.has(place.id),
          isRecent: context.recentPlaceIds.has(place.id),
          followedPlaceMatch: context.followedPlaceIds.has(place.id),
          momentRating: context.momentRatingsByPlaceId.get(place.id) ?? null,
        },
      );

      const followedVisits = followedVisitMap.get(place.id) ?? 0;
      const finalScore = context.manuallyDismissedPlaceIds.has(place.id)
        ? 24
        : Math.min(baseScore + Math.min(followedVisits * 4, 12), 98);

      return prisma.userPlaceScore.upsert({
        where: {
          userId_placeId: {
            userId,
            placeId: place.id,
          },
        },
        update: {
          matchScore: finalScore,
          similarityPercentage: finalScore,
          recommendationReason: buildRecommendationReason({
            place: {
              category: place.category,
              tags: place.aiEnrichment?.vibeTags ?? [place.category],
            },
            selectedInterests: context.selectedInterests,
            selectedVibe: context.selectedVibe,
            tasteKeywords: context.tasteKeywords,
            followedTravelerVisits: followedVisits,
            followedPlaceMatch: context.followedPlaceIds.has(place.id),
            socialOverlap: context.socialKeywords.size > 0,
            isBookmarked: context.bookmarkedPlaceIds.has(place.id),
            isVisited: context.visitedPlaceIds.has(place.id),
            isVibed: context.vibedPlaceIds.has(place.id),
            isCommented: context.commentedPlaceIds.has(place.id),
            isRecent: context.recentPlaceIds.has(place.id),
            isDismissed: context.manuallyDismissedPlaceIds.has(place.id),
          }),
          sourceVersion: 'writeback-v5',
        },
        create: {
          userId,
          placeId: place.id,
          matchScore: finalScore,
          similarityPercentage: finalScore,
          recommendationReason: buildRecommendationReason({
            place: {
              category: place.category,
              tags: place.aiEnrichment?.vibeTags ?? [place.category],
            },
            selectedInterests: context.selectedInterests,
            selectedVibe: context.selectedVibe,
            tasteKeywords: context.tasteKeywords,
            followedTravelerVisits: followedVisits,
            followedPlaceMatch: context.followedPlaceIds.has(place.id),
            socialOverlap: context.socialKeywords.size > 0,
            isBookmarked: context.bookmarkedPlaceIds.has(place.id),
            isVisited: context.visitedPlaceIds.has(place.id),
            isVibed: context.vibedPlaceIds.has(place.id),
            isCommented: context.commentedPlaceIds.has(place.id),
            isRecent: context.recentPlaceIds.has(place.id),
            isDismissed: context.manuallyDismissedPlaceIds.has(place.id),
          }),
          sourceVersion: 'writeback-v5',
        },
      });
    }),
  );
}

function computeTravelerMatchScore(input: {
  overlapPlaces: number;
  overlapKeywords: number;
  isFollowing: boolean;
  interactionBoost: number;
}) {
  let score = 46;
  score += Math.min(input.overlapPlaces * 12, 28);
  score += Math.min(input.overlapKeywords * 5, 18);
  if (input.isFollowing) score += 8;
  score += Math.min(input.interactionBoost, 10);
  return Math.max(42, Math.min(score, 97));
}

function buildTravelerReason(input: {
  overlapPlaces: number;
  overlapKeywords: number;
  isFollowing: boolean;
}) {
  if (input.overlapPlaces > 0) {
    return input.overlapPlaces === 1
      ? 'You overlap on a place already in your graph.'
      : `You overlap on ${input.overlapPlaces} places already in your graph.`;
  }

  if (input.overlapKeywords > 0) {
    return 'Their recent moments match the taste signals in your saves.';
  }

  if (input.isFollowing) {
    return 'You already follow them, so their graph keeps shaping your feed.';
  }

  return 'Their travel graph is starting to match your current vibe.';
}

async function refreshTravelerSimilarity(userId: string, travelerIds: string[]) {
  const uniqueTravelerIds = Array.from(new Set(travelerIds.filter((id) => id && id !== userId)));
  if (uniqueTravelerIds.length === 0) return;

  const context = await getUserRecommendationContext(userId);
  const myPlaceIds = new Set([...context.bookmarkedPlaceIds, ...context.visitedPlaceIds]);

  const travelerMoments = await prisma.moment.findMany({
    where: {
      userId: { in: uniqueTravelerIds },
      privacy: 'PUBLIC',
    },
    select: {
      userId: true,
      placeId: true,
      place: {
        select: {
          category: true,
          aiEnrichment: { select: { vibeTags: true } },
        },
      },
    },
  });

  const interactionCounts = await prisma.vibin.groupBy({
    by: ['receiverUserId'],
    where: {
      receiverUserId: { in: uniqueTravelerIds },
      senderUserId: userId,
    },
    _count: { _all: true },
  });

  const groupedMoments = new Map<string, typeof travelerMoments>();
  for (const moment of travelerMoments) {
    const existing = groupedMoments.get(moment.userId) ?? [];
    existing.push(moment);
    groupedMoments.set(moment.userId, existing);
  }

  const interactionMap = new Map(interactionCounts.map((item) => [item.receiverUserId ?? '', item._count._all]));

  await Promise.all(
    uniqueTravelerIds.map((travelerId) => {
      const moments = groupedMoments.get(travelerId) ?? [];
      const overlapPlaces = new Set(
        moments.filter((moment) => myPlaceIds.has(moment.placeId)).map((moment) => moment.placeId),
      ).size;

      const travelerKeywords = collectTasteKeywords(moments.map((moment) => moment.place));
      const overlapKeywords = Array.from(context.tasteKeywords).filter((keyword) => travelerKeywords.has(keyword)).length;
      const isFollowing = context.followedUserIds.has(travelerId);
      const interactionBoost = (interactionMap.get(travelerId) ?? 0) * 2;
      const matchScore = computeTravelerMatchScore({
        overlapPlaces,
        overlapKeywords,
        isFollowing,
        interactionBoost,
      });

      return prisma.travelerSimilarity.upsert({
        where: {
          userId_travelerId: {
            userId,
            travelerId,
          },
        },
        update: {
          matchScore,
          relevanceReason: buildTravelerReason({ overlapPlaces, overlapKeywords, isFollowing }),
        },
        create: {
          userId,
          travelerId,
          matchScore,
          relevanceReason: buildTravelerReason({ overlapPlaces, overlapKeywords, isFollowing }),
        },
      });
    }),
  );
}

async function runRecommendationWriteback(input: {
  userId: string;
  placeIds?: string[];
  travelerIds?: string[];
}) {
  const placeIds = Array.from(new Set((input.placeIds ?? []).filter(Boolean)));
  const travelerIds = Array.from(new Set((input.travelerIds ?? []).filter(Boolean)));
  recommendationContextCache.delete(input.userId);

  await Promise.all([
    placeIds.length > 0 ? refreshUserPlaceScores(input.userId, placeIds) : Promise.resolve(),
    travelerIds.length > 0 ? refreshTravelerSimilarity(input.userId, travelerIds) : Promise.resolve(),
  ]);
}

async function refreshSavedPlaceScoresForUser(userId: string) {
  const [bookmarks, collectionPlaces] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId },
      select: { placeId: true },
      orderBy: { createdAt: 'desc' },
      take: 32,
    }),
    prisma.collectionPlace.findMany({
      where: { collection: { userId } },
      select: { placeId: true },
      orderBy: { collection: { createdAt: 'desc' } },
      take: 32,
    }),
  ]);

  const placeIds = Array.from(new Set([
    ...bookmarks.map((item) => item.placeId),
    ...collectionPlaces.map((item) => item.placeId),
  ]));

  if (placeIds.length === 0) return;
  await refreshUserPlaceScores(userId, placeIds);
}

async function queueOwnTravelerDescriptorRefresh(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      bookmarks: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          place: {
            select: {
              name: true,
              city: true,
              country: true,
              category: true,
              aiEnrichment: {
                select: {
                  vibeTags: true,
                },
              },
            },
          },
        },
      },
      moments: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          caption: true,
          place: {
            select: {
              name: true,
              city: true,
              country: true,
              category: true,
              aiEnrichment: {
                select: {
                  vibeTags: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return;

  queueTravelerProfileDescriptorRefresh({
    userId: user.id,
    displayName: user.displayName,
    moments: user.moments.map((moment) => ({
      caption: moment.caption,
      vibeTags: moment.place.aiEnrichment?.vibeTags ?? [],
      place: {
        name: moment.place.name,
        location: [moment.place.city, moment.place.country].filter(Boolean).join(', '),
        category: moment.place.category,
        tags: moment.place.aiEnrichment?.vibeTags ?? [],
      },
    })),
    bookmarkedPlaces: user.bookmarks.map((bookmark) => ({
      name: bookmark.place.name,
      location: [bookmark.place.city, bookmark.place.country].filter(Boolean).join(', '),
      category: bookmark.place.category,
      tags: bookmark.place.aiEnrichment?.vibeTags ?? [],
    })),
  });
}

async function getPlaceDetailsByInternalId(placeId: string, userId?: string) {
  let place = await prisma.place.findUnique({
    where: { id: placeId },
    include: {
      aiEnrichment: true,
      media: {
        orderBy: { sortOrder: 'asc' },
      },
      discoverySignals: {
        orderBy: [
          { bestResultRank: 'asc' },
          { resultRank: 'asc' },
          { lastSeenAt: 'desc' },
        ],
        take: 30,
      },
    },
  });

  if (!place) return null;

  const persistedScore = userId
    ? await prisma.userPlaceScore.findUnique({
        where: {
          userId_placeId: {
            userId,
            placeId,
          },
        },
      })
    : null;
  const recommendationContext = userId ? await getUserRecommendationContext(userId) : null;
  const persistedSimilarityStat = persistedScore?.similarityPercentage ?? persistedScore?.matchScore ?? null;
  const similarityStat = typeof persistedSimilarityStat === 'number' && recommendationContext
    ? applyDiscoverySignalBoostToScore(
        persistedSimilarityStat,
        place.discoverySignals,
        { selectedInterests: recommendationContext.selectedInterests },
      )
    : (
      recommendationContext
        ? computeDiscoveryAlignedPlaceScore(
            {
              id: place.id,
              tags: place.aiEnrichment?.vibeTags ?? [place.category].filter(Boolean),
              category: place.category,
              similarityStat: undefined,
              rating: typeof place.rating === 'number' ? place.rating : null,
              hook: place.aiEnrichment?.hook ?? null,
              description: place.aiEnrichment?.description ?? null,
              whyYoullLikeIt: place.aiEnrichment?.description ? [place.aiEnrichment.description] : [],
              discoverySignals: place.discoverySignals,
            },
            recommendationContext,
          )
        : undefined
    );
  const recommendationReason = resolvePlaceDetailRecommendationReason({
    persistedReason: persistedScore?.recommendationReason,
    placeName: place.name,
    category: place.category,
    tags: place.aiEnrichment?.vibeTags ?? [place.category],
    attitudeLabel: place.aiEnrichment?.attitudeLabel ?? null,
    bestTime: place.aiEnrichment?.bestTime ?? null,
    hook: place.aiEnrichment?.hook ?? null,
    description: place.aiEnrichment?.description ?? null,
  });

  if (!place.aiEnrichment) {
    // Do not block the detail page on enrichment generation. Return the stored
    // Google/database payload immediately and let enrichment fill in later.
    void ensurePlaceAiEnrichment(place.id).catch((error) => {
      console.error('Background place detail enrichment failed', error);
    });
  }

  if (!place.googlePlaceId) {
    return {
      id: place.id,
      name: place.name,
      location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
      description: place.aiEnrichment?.description ?? '',
      hook: resolveGoogleSummaryHook(place),
      address: place.address ?? undefined,
      image: place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
      images: place.media.length > 0 ? place.media.map((item) => item.url) : ['https://placehold.co/800x1000/111111/ffffff?text=Place'],
      tags: place.aiEnrichment?.vibeTags.length ? place.aiEnrichment.vibeTags : [place.category].filter(Boolean),
      attitudeLabel: place.aiEnrichment?.attitudeLabel ?? undefined,
      bestTime: place.aiEnrichment?.bestTime ?? undefined,
      similarityStat,
      whyYoullLikeIt: place.aiEnrichment?.description ? [place.aiEnrichment.description] : [],
      recommendationReason,
      rating: place.rating ?? undefined,
      priceLevel: place.priceLevel ?? undefined,
      openingHours: place.openingHours.length > 0 ? place.openingHours : undefined,
      servesBreakfast: place.servesBreakfast ?? undefined,
      servesLunch: place.servesLunch ?? undefined,
      servesDinner: place.servesDinner ?? undefined,
      servesBeer: place.servesBeer ?? undefined,
      servesWine: place.servesWine ?? undefined,
      servesBrunch: place.servesBrunch ?? undefined,
      servesDessert: place.servesDessert ?? undefined,
      servesCoffee: place.servesCoffee ?? undefined,
      servesCocktails: place.servesCocktails ?? undefined,
      goodForGroups: place.goodForGroups ?? undefined,
      goodForWatchingSports: place.goodForWatchingSports ?? undefined,
      timeZone: place.timeZoneId ?? undefined,
      utcOffsetMinutes: place.utcOffsetMinutes ?? undefined,
      outdoors: place.outdoorSeating ?? undefined,
      outdoorSeating: place.outdoorSeating ?? undefined,
      mapsUrl: place.latitude && place.longitude
        ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
        : place.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`
          : undefined,
	      latitude: place.latitude ?? undefined,
	      longitude: place.longitude ?? undefined,
	      priceRange: formatStoredGooglePriceRange({
	        startAmount: place.googlePriceRangeStart,
	        endAmount: place.googlePriceRangeEnd,
	        currencyCode: place.googlePriceRangeCurrency,
	      }) ?? undefined,
      priceRangeLabel: formatStoredGooglePriceRange({
        startAmount: place.googlePriceRangeStart,
        endAmount: place.googlePriceRangeEnd,
        currencyCode: place.googlePriceRangeCurrency,
      }) ?? undefined,
      category: place.category,
      topBadgeLabel: buildDiscoveryTopBadgeLabel(place.discoverySignals),
      discoveryTopRank: buildDiscoveryTopRank(place.discoverySignals),
      discoverySignals: mapDiscoverySignalsForClient(place.discoverySignals),
    };
  }

  // Place acquisition now stores the full Google payload from Text Search. Avoid
  // per-place Place Details calls here so opening a detail page does not create
  // an extra Google request for data we already persist.
  const details = null as Awaited<ReturnType<typeof fetchGooglePlaceDetails>>;

  if (details) {
    const photoUris = details.photos?.length
      ? await fetchGooglePhotoUris(details.photos.map((photo) => photo.name)).catch((error) => {
          console.error(error);
          return [];
        })
      : [];
	    const photoUri = photoUris[0] ?? null;
	    const locationBits = parseLocationBits(details.formattedAddress);
	    const neighborhoodBits = extractNeighborhoodFromAddressComponents(details.addressComponents);
	    const googlePriceRange = normalizeGooglePriceRange(details.priceRange);
	    const googleDetailColumns = mapGooglePlaceDetailColumns(details);
	    const updated = await prisma.place.update({
      where: { id: place.id },
      data: {
        name: details.displayName?.text ?? place.name,
        address: details.formattedAddress ?? place.address,
        city: locationBits.city,
        country: locationBits.country,
        neighborhood: neighborhoodBits.neighborhood ?? undefined,
        adminAreaLevel4: neighborhoodBits.adminAreaLevel4 ?? undefined,
        latitude: details.location?.latitude ?? place.latitude,
        longitude: details.location?.longitude ?? place.longitude,
        category: details.primaryType?.replace(/_/g, ' ') ?? place.category,
        ...googleDetailColumns,
	        rating: details.rating ?? place.rating,
	        priceLevel: mapGooglePriceLevel(details.priceLevel) ?? place.priceLevel,
	        googlePriceRangeStart: googlePriceRange?.startAmount ?? null,
	        googlePriceRangeEnd: googlePriceRange?.endAmount ?? null,
	        googlePriceRangeCurrency: googlePriceRange?.currencyCode ?? null,
	        primaryImageUrl: photoUri ?? place.primaryImageUrl,
        media: photoUris.length > 0
          ? {
              deleteMany: {},
              create: photoUris.map((uri, index) => ({
                  mediaType: 'image',
                  url: uri,
                  sortOrder: index,
                })),
            }
          : undefined,
      },
      include: {
        aiEnrichment: true,
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        discoverySignals: {
          orderBy: [
            { bestResultRank: 'asc' },
            { resultRank: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 30,
        },
      },
    });

    await persistGooglePlaceSnapshot({
      placeId: updated.id,
      googlePlaceId: details.id,
      source: 'PLACE_DETAILS',
      payload: details,
    });

    await ensurePlaceAiEnrichment(updated.id);
    const enriched = await prisma.place.findUnique({
      where: { id: updated.id },
      include: {
        aiEnrichment: true,
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        discoverySignals: {
          orderBy: [
            { bestResultRank: 'asc' },
            { resultRank: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 30,
        },
      },
    });
    const finalPlace = enriched ?? updated;

    return {
      id: finalPlace.id,
      name: finalPlace.name,
      location: [finalPlace.city, finalPlace.country].filter(Boolean).join(', ') || finalPlace.address || 'Unknown location',
      description: finalPlace.aiEnrichment?.description ?? '',
      hook: resolveGoogleSummaryHook(finalPlace),
      address: finalPlace.address ?? undefined,
      image: finalPlace.primaryImageUrl ?? finalPlace.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
      images: finalPlace.media.length > 0 ? finalPlace.media.map((item) => item.url) : ['https://placehold.co/800x1000/111111/ffffff?text=Place'],
      tags: buildDiscoveryDisplayTags(
        finalPlace.aiEnrichment?.attitudeLabel,
        finalPlace.aiEnrichment?.vibeTags ?? [],
        finalPlace.category,
      ),
      attitudeLabel: finalPlace.aiEnrichment?.attitudeLabel ?? undefined,
      bestTime: finalPlace.aiEnrichment?.bestTime ?? undefined,
      similarityStat,
      whyYoullLikeIt: finalPlace.aiEnrichment?.description ? [finalPlace.aiEnrichment.description] : [],
      recommendationReason: resolvePlaceDetailRecommendationReason({
        persistedReason: persistedScore?.recommendationReason,
        placeName: finalPlace.name,
        category: finalPlace.category,
        tags: finalPlace.aiEnrichment?.vibeTags ?? [finalPlace.category],
        attitudeLabel: finalPlace.aiEnrichment?.attitudeLabel ?? null,
        bestTime: finalPlace.aiEnrichment?.bestTime ?? null,
        hook: finalPlace.aiEnrichment?.hook ?? null,
        description: finalPlace.aiEnrichment?.description ?? null,
      }),
      rating: finalPlace.rating ?? undefined,
      priceLevel: finalPlace.priceLevel ?? undefined,
      openingHours: finalPlace.openingHours.length > 0 ? finalPlace.openingHours : undefined,
      servesBreakfast: finalPlace.servesBreakfast ?? undefined,
      servesLunch: finalPlace.servesLunch ?? undefined,
      servesDinner: finalPlace.servesDinner ?? undefined,
      servesBeer: finalPlace.servesBeer ?? undefined,
      servesWine: finalPlace.servesWine ?? undefined,
      servesBrunch: finalPlace.servesBrunch ?? undefined,
      servesDessert: finalPlace.servesDessert ?? undefined,
      servesCoffee: finalPlace.servesCoffee ?? undefined,
      servesCocktails: finalPlace.servesCocktails ?? undefined,
      goodForGroups: finalPlace.goodForGroups ?? undefined,
      goodForWatchingSports: finalPlace.goodForWatchingSports ?? undefined,
      timeZone: finalPlace.timeZoneId ?? undefined,
      utcOffsetMinutes: finalPlace.utcOffsetMinutes ?? undefined,
      outdoors: finalPlace.outdoorSeating ?? undefined,
      outdoorSeating: finalPlace.outdoorSeating ?? undefined,
      mapsUrl: details.googleMapsUri ?? (finalPlace.latitude && finalPlace.longitude
        ? `https://www.google.com/maps/search/?api=1&query=${finalPlace.latitude},${finalPlace.longitude}`
        : finalPlace.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(finalPlace.address)}`
          : undefined),
      latitude: finalPlace.latitude ?? undefined,
      longitude: finalPlace.longitude ?? undefined,
	      priceRange: formatStoredGooglePriceRange({
	        startAmount: finalPlace.googlePriceRangeStart,
	        endAmount: finalPlace.googlePriceRangeEnd,
	        currencyCode: finalPlace.googlePriceRangeCurrency,
	      }) ?? undefined,
      priceRangeLabel: formatStoredGooglePriceRange({
        startAmount: finalPlace.googlePriceRangeStart,
        endAmount: finalPlace.googlePriceRangeEnd,
        currencyCode: finalPlace.googlePriceRangeCurrency,
      }) ?? undefined,
      category: finalPlace.category,
      topBadgeLabel: buildDiscoveryTopBadgeLabel(finalPlace.discoverySignals),
      discoveryTopRank: buildDiscoveryTopRank(finalPlace.discoverySignals),
      discoverySignals: mapDiscoverySignalsForClient(finalPlace.discoverySignals),
    };
  }

  return {
    id: place.id,
    name: place.name,
    location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
    description: place.aiEnrichment?.description ?? '',
    hook: resolveGoogleSummaryHook(place),
    address: place.address ?? undefined,
    image: place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
    images: place.media.length > 0 ? place.media.map((item) => item.url) : ['https://placehold.co/800x1000/111111/ffffff?text=Place'],
    tags: buildDiscoveryDisplayTags(
      place.aiEnrichment?.attitudeLabel,
      place.aiEnrichment?.vibeTags ?? [],
      place.category,
    ),
    attitudeLabel: place.aiEnrichment?.attitudeLabel ?? undefined,
    bestTime: place.aiEnrichment?.bestTime ?? undefined,
    similarityStat,
    whyYoullLikeIt: place.aiEnrichment?.description ? [place.aiEnrichment.description] : [],
    recommendationReason,
    rating: place.rating ?? undefined,
    priceLevel: place.priceLevel ?? undefined,
    openingHours: place.openingHours.length > 0 ? place.openingHours : undefined,
    servesBreakfast: place.servesBreakfast ?? undefined,
    servesLunch: place.servesLunch ?? undefined,
    servesDinner: place.servesDinner ?? undefined,
    servesBeer: place.servesBeer ?? undefined,
    servesWine: place.servesWine ?? undefined,
    servesBrunch: place.servesBrunch ?? undefined,
    servesDessert: place.servesDessert ?? undefined,
    servesCoffee: place.servesCoffee ?? undefined,
    servesCocktails: place.servesCocktails ?? undefined,
    goodForGroups: place.goodForGroups ?? undefined,
    goodForWatchingSports: place.goodForWatchingSports ?? undefined,
    timeZone: place.timeZoneId ?? undefined,
    utcOffsetMinutes: place.utcOffsetMinutes ?? undefined,
    outdoors: place.outdoorSeating ?? undefined,
    outdoorSeating: place.outdoorSeating ?? undefined,
    mapsUrl: place.latitude && place.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
      : place.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`
        : undefined,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
	    priceRange: formatStoredGooglePriceRange({
	      startAmount: place.googlePriceRangeStart,
	      endAmount: place.googlePriceRangeEnd,
	      currencyCode: place.googlePriceRangeCurrency,
	    }) ?? undefined,
    priceRangeLabel: formatStoredGooglePriceRange({
      startAmount: place.googlePriceRangeStart,
      endAmount: place.googlePriceRangeEnd,
      currencyCode: place.googlePriceRangeCurrency,
    }) ?? undefined,
    category: place.category,
    topBadgeLabel: buildDiscoveryTopBadgeLabel(place.discoverySignals),
    discoveryTopRank: buildDiscoveryTopRank(place.discoverySignals),
    discoverySignals: mapDiscoverySignalsForClient(place.discoverySignals),
	  };
}

async function getUnifiedPlaceDetailPayload(placeId: string, userId?: string) {
  const place = await getPlaceDetailsByInternalId(placeId, userId);
  if (!place) return null;

  const [relatedPlaces, travelerMoments, interactionState] = await Promise.all([
    getRelatedPlaces(placeId).catch((error) => {
      console.error(error);
      return [];
    }),
    userId
      ? getPlaceTravelerMoments(placeId, userId).catch((error) => {
          console.error(error);
          return [];
        })
      : Promise.resolve([]),
    userId
      ? Promise.all([
          prisma.bookmark.findMany({
            where: { userId, placeId: { in: [placeId] } },
            select: { placeId: true },
          }),
          prisma.moment.findMany({
            where: { userId, placeId: { in: [placeId] } },
            distinct: ['placeId'],
            select: { placeId: true },
          }),
        ])
          .then(([bookmarked, beenThereMoments]) => ({
            bookmarkedPlaceIds: bookmarked.map((item) => item.placeId),
            beenTherePlaceIds: beenThereMoments.map((item) => item.placeId),
          }))
          .catch((error) => {
            console.error(error);
            return {
              bookmarkedPlaceIds: [] as string[],
              beenTherePlaceIds: [] as string[],
            };
          })
      : Promise.resolve({
          bookmarkedPlaceIds: [] as string[],
          beenTherePlaceIds: [] as string[],
        }),
  ]);

  return {
    place,
    relatedPlaces,
    travelerMoments,
    interactionState,
  };
}

type TodayRecommendationFocus = 'coffee' | 'eat' | 'outdoor' | 'fun' | 'cheap';

function normalizeTodayRecommendationFocus(value?: string | null): TodayRecommendationFocus | null {
  const key = normalizeKeyword(value ?? '').replace(/\s+/g, '_');
  if (!key) return null;
  if (['coffee', 'cafe'].includes(key)) return 'coffee';
  if (['eat', 'food', 'restaurant'].includes(key)) return 'eat';
  if (['outdoor', 'outdoors', 'go_outdoor', 'parks_outdoor', 'park'].includes(key)) return 'outdoor';
  if (['fun', 'something_fun', 'activity', 'activities', 'culture'].includes(key)) return 'fun';
  if (['cheap', 'budget', 'affordable'].includes(key)) return 'cheap';
  return null;
}

function placeMatchesTodayRecommendationFocus(
  place: Awaited<ReturnType<typeof getCachedDiscoveryPlacesByLocation>>[number],
  focus: TodayRecommendationFocus,
) {
  const category = normalizeKeyword(place.category ?? '');
  const tags = (place.tags ?? []).map((tag) => normalizeKeyword(tag)).join(' ');
  const haystack = `${category} ${tags}`;
  const tabIds = new Set(place.tabIds ?? []);

  switch (focus) {
    case 'coffee':
      return tabIds.has('coffee')
        || place.servesCoffee === true
        || /\b(coffee|cafe|espresso|roastery|matcha)\b/.test(haystack);
    case 'eat':
      return tabIds.has('eat')
        || /\b(restaurant|food|eat|brunch|ramen|sushi|taco|burger|noodle|bakery|cafe|dining)\b/.test(haystack);
    case 'outdoor':
      return tabIds.has('parks-outdoor')
        || place.outdoors === true
        || place.outdoorSeating === true
        || /\b(park|outdoor|garden|trail|beach|scenic)\b/.test(haystack);
    case 'fun':
      return tabIds.has('culture')
        || /\b(museum|gallery|activity|arcade|bowling|theater|theatre|entertainment|experience)\b/.test(haystack);
    case 'cheap':
      return /\b(cheap|budget|affordable|street|casual|fast|bakery|cafe)\b/.test(haystack);
  }
}

async function getTodayRecommendationForUser(input: {
  userId: string;
  locationLabel: string;
  locationType?: string;
  latitude: number;
  longitude: number;
  focus?: string | null;
}) {
  const recommendationContext = await getUserRecommendationContext(input.userId);
  let candidatePlaces: Awaited<ReturnType<typeof getCachedDiscoveryPlacesByLocation>> = [];

  try {
    await ensureLocationCandidatePool(
      input.locationLabel,
      input.locationType,
      recommendationContext.selectedInterests,
      recommendationContext.selectedVibe,
      false,
    );
    candidatePlaces = await getCachedDiscoveryPlacesByLocation(
      input.locationLabel,
      input.locationType,
    );
  } catch (error) {
    console.error('Today recommendation area candidate load failed', error);
    candidatePlaces = getFallbackDiscoveryPlaces(input.locationLabel);
  }

  if (candidatePlaces.length === 0) {
    candidatePlaces = getFallbackDiscoveryPlaces(input.locationLabel);
  }

  const candidateIds = candidatePlaces.map((place) => place.id);
  if (candidateIds.length === 0) {
    return null;
  }

  await refreshUserPlaceScores(input.userId, candidateIds);

  const [persistedScores, candidates] = await Promise.all([
    prisma.userPlaceScore.findMany({
      where: {
        userId: input.userId,
        placeId: { in: candidateIds },
      },
      select: {
        placeId: true,
        similarityPercentage: true,
        matchScore: true,
        recommendationReason: true,
      },
    }),
    prisma.place.findMany({
      where: { id: { in: candidateIds } },
      include: {
        aiEnrichment: true,
      },
    }),
  ]);

  const scoreMap = new Map(
    persistedScores.map((item) => [
      item.placeId,
      {
        score: item.similarityPercentage ?? item.matchScore ?? null,
        reason: item.recommendationReason ?? null,
      },
    ]),
  );

  const origin = {
    latitude: input.latitude,
    longitude: input.longitude,
  };
  const focus = normalizeTodayRecommendationFocus(input.focus);

  const candidatePlaceMap = new Map(candidatePlaces.map((place) => [place.id, place]));

  const rankedCandidates = candidates
    .map((place) => {
      const mappedPlace = candidatePlaceMap.get(place.id);
      if (!mappedPlace || mappedPlace.latitude == null || mappedPlace.longitude == null) return null;
      if (isServiceLikePlace({
        name: mappedPlace.name,
        tags: mappedPlace.tags,
        category: mappedPlace.category,
        hook: mappedPlace.hook,
        description: mappedPlace.description,
        whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
      })) return null;
      if (focus && !placeMatchesTodayRecommendationFocus(mappedPlace, focus)) return null;

      const distanceMiles = distanceBetweenMiles(origin, {
        latitude: mappedPlace.latitude,
        longitude: mappedPlace.longitude,
      });
      const persisted = scoreMap.get(place.id);
      const score = typeof persisted?.score === 'number'
        ? applyDiscoverySignalBoostToScore(
            persisted.score,
            mappedPlace.discoverySignals,
            { selectedInterests: recommendationContext.selectedInterests },
          )
        : computeRecommendationScore(
        {
          id: mappedPlace.id,
          tags: mappedPlace.tags,
          category: mappedPlace.category,
          similarityStat: mappedPlace.similarityStat,
          rating: typeof mappedPlace.rating === 'number' ? mappedPlace.rating : null,
          hook: mappedPlace.hook,
          description: mappedPlace.description,
          whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
          discoverySignals: mappedPlace.discoverySignals,
        },
        {
          selectedInterests: recommendationContext.selectedInterests,
          selectedVibe: recommendationContext.selectedVibe,
          bookmarkKeywords: recommendationContext.bookmarkKeywords,
          momentKeywords: recommendationContext.momentKeywords,
          socialKeywords: recommendationContext.socialKeywords,
          isBookmarked: recommendationContext.bookmarkedPlaceIds.has(mappedPlace.id),
          isVisited: recommendationContext.visitedPlaceIds.has(mappedPlace.id),
          isVibed: recommendationContext.vibedPlaceIds.has(mappedPlace.id),
          isCommented: recommendationContext.commentedPlaceIds.has(mappedPlace.id),
          isRecent: recommendationContext.recentPlaceIds.has(mappedPlace.id),
          followedPlaceMatch: recommendationContext.followedPlaceIds.has(mappedPlace.id),
          momentRating: recommendationContext.momentRatingsByPlaceId.get(mappedPlace.id) ?? null,
        },
      );

      return {
        place,
        distanceMiles,
        score,
        reason: persisted?.reason ?? buildRecommendationReason({
          place: {
            category: mappedPlace.category,
            tags: mappedPlace.tags,
          },
          selectedInterests: recommendationContext.selectedInterests,
          selectedVibe: recommendationContext.selectedVibe,
          tasteKeywords: recommendationContext.tasteKeywords,
          followedTravelerVisits: 0,
          followedPlaceMatch: recommendationContext.followedPlaceIds.has(mappedPlace.id),
          socialOverlap: recommendationContext.socialKeywords.size > 0,
          isBookmarked: recommendationContext.bookmarkedPlaceIds.has(mappedPlace.id),
          isVisited: recommendationContext.visitedPlaceIds.has(mappedPlace.id),
          isVibed: recommendationContext.vibedPlaceIds.has(mappedPlace.id),
          isCommented: recommendationContext.commentedPlaceIds.has(mappedPlace.id),
          isRecent: recommendationContext.recentPlaceIds.has(mappedPlace.id),
          isDismissed: recommendationContext.manuallyDismissedPlaceIds.has(mappedPlace.id),
        }),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => !recommendationContext.visitedPlaceIds.has(candidate.place.id))
    .filter((candidate) => (candidate.score ?? 0) >= 78)
    .sort((left, right) => {
      if (left.distanceMiles !== right.distanceMiles) {
        return left.distanceMiles - right.distanceMiles;
      }
      if ((right.score ?? 0) !== (left.score ?? 0)) {
        return (right.score ?? 0) - (left.score ?? 0);
      }
      return (right.place.rating ?? 0) - (left.place.rating ?? 0);
    });

  const nearbyCandidates = rankedCandidates.filter((candidate) => candidate.distanceMiles <= 1);
  const fallbackCandidates = rankedCandidates.filter((candidate) => candidate.distanceMiles <= 2);
  const selectedCandidate = pickRandomTodayRecommendationCandidate(nearbyCandidates)
    ?? pickRandomTodayRecommendationCandidate(fallbackCandidates);
  if (!selectedCandidate) {
    return null;
  }

  const place = await getPlaceDetailsByInternalId(selectedCandidate.place.id, input.userId);
  if (!place) {
    return null;
  }

  return {
    place,
    distanceMiles: Number(selectedCandidate.distanceMiles.toFixed(1)),
    compatibilityScore: selectedCandidate.score ?? place.similarityStat ?? 0,
    todayReason: buildTodayRecommendationReason({
      baseReason: selectedCandidate.reason ?? place.recommendationReason,
      bestTime: place.bestTime ?? selectedCandidate.place.aiEnrichment?.bestTime ?? null,
      distanceMiles: selectedCandidate.distanceMiles,
      score: selectedCandidate.score ?? place.similarityStat ?? 0,
    }),
  };
}

app.use(async (req: AuthenticatedRequest, _res, next) => {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date()) {
      req.authUserId = session.userId;
    }
  } catch (error) {
    console.error(error);
  }

  next();
});

app.use(express.json({ limit: '100mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use((req, res, next) => {
  const origin = req.header('Origin') ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/session', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.authUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.authUserId },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.json({ user: await mapUserForClientWithTasteState(user) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = await createSession(user.id);
    res.json({ token, user: await mapUserForClientWithTasteState(user) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    const username = await buildUniqueUsername(buildUsernameFromName(name));
    const user = await prisma.user.create({
      data: {
        username,
        displayName: name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        bio: 'Still building my travel graph.',
        avatarUrl: `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(name.trim().slice(0, 1).toUpperCase())}`,
        authProvider: 'MANUAL',
      },
    });
    await ensureDefaultUserRelations(user.id);

    const token = await createSession(user.id);
    res.status(201).json({ token, user: await mapUserForClientWithTasteState(user) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required' });
      return;
    }

    const googleProfile = await verifyGoogleIdToken(idToken);
    const normalizedEmail = googleProfile.email.toLowerCase().trim();
    const fallbackAvatar = `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent((googleProfile.name?.trim().slice(0, 1) || 'G').toUpperCase())}`;
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            displayName: existingUser.displayName ?? googleProfile.name?.trim() ?? existingUser.username,
            avatarUrl: googleProfile.picture
              ? (
                existingUser.authProvider === 'GOOGLE'
                  || existingUser.avatarUrl.includes('placehold.co')
              )
                ? googleProfile.picture
                : existingUser.avatarUrl
              : existingUser.avatarUrl,
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
            authProvider: 'GOOGLE',
          },
        })
      : await prisma.user.create({
          data: {
            username: await buildUniqueUsername(buildUsernameFromName(googleProfile.name?.trim() || normalizedEmail.split('@')[0] || 'google.traveler')),
            displayName: googleProfile.name?.trim() || 'Google Traveler',
            email: normalizedEmail,
            bio: 'Still building my travel graph.',
            avatarUrl: googleProfile.picture || fallbackAvatar,
            authProvider: 'GOOGLE',
            emailVerifiedAt: new Date(),
          },
        });
    await ensureDefaultUserRelations(user.id);

    const token = await createSession(user.id);
    res.json({ token, user: await mapUserForClientWithTasteState(user) });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    handleError(res, error);
  }
});

app.post('/api/auth/apple', async (req, res) => {
  try {
    const {
      idToken,
      email,
      givenName,
      familyName,
    } = req.body as {
      idToken?: string;
      email?: string;
      givenName?: string;
      familyName?: string;
    };

    if (!idToken) {
      res.status(400).json({ error: 'Apple ID token is required' });
      return;
    }

    const appleProfile = await verifyAppleIdToken(idToken);
    const normalizedEmail = (appleProfile.email ?? email)?.toLowerCase().trim() ?? null;
    const fullName = [givenName?.trim(), familyName?.trim()].filter(Boolean).join(' ').trim();
    const fallbackDisplayName = fullName || (normalizedEmail?.split('@')[0] ?? 'Apple Traveler');
    const fallbackAvatar = `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent((fallbackDisplayName.slice(0, 1) || 'A').toUpperCase())}`;

    const existingBySubject = await prisma.user.findUnique({
      where: { appleSubject: appleProfile.sub },
    });

    const existingByEmail = normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })
      : null;

    const existingUser = existingBySubject ?? existingByEmail;

    if (!existingUser && !normalizedEmail) {
      res.status(400).json({ error: 'Apple did not provide an email for this account.' });
      return;
    }

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            appleSubject: appleProfile.sub,
            displayName: existingUser.displayName ?? fallbackDisplayName,
            avatarUrl: existingUser.avatarUrl.includes('placehold.co')
              ? fallbackAvatar
              : existingUser.avatarUrl,
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
            authProvider: 'APPLE',
          },
        })
      : await prisma.user.create({
          data: {
            username: await buildUniqueUsername(buildUsernameFromName(fallbackDisplayName)),
            displayName: fallbackDisplayName,
            email: normalizedEmail!,
            bio: 'Still building my travel graph.',
            avatarUrl: fallbackAvatar,
            authProvider: 'APPLE',
            appleSubject: appleProfile.sub,
            emailVerifiedAt: new Date(),
          },
        });

    await ensureDefaultUserRelations(user.id);

    const token = await createSession(user.id);
    res.json({ token, user: await mapUserForClientWithTasteState(user) });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    handleError(res, error);
  }
});

app.post('/api/auth/logout', async (req: AuthenticatedRequest, res) => {
  try {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (token) {
      await prisma.session.deleteMany({
        where: { token },
      });
    }

    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

function requireAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.authUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

async function optionalAuth(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      next();
      return;
    }

    const session = await prisma.session.findFirst({
      where: {
        token,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (session) {
      req.authUserId = session.userId;
    }
  } catch (error) {
    console.error(error);
  }

  next();
}

function handleDecisionError(res: express.Response, error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.message.includes('does not belong')) {
      res.status(403).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  handleError(res, error);
}

app.get('/api/decision/catalog/intents', (_req, res) => {
  res.json({
    intents: getDecisionIntentCatalog(),
  });
});

app.post('/api/decision/places/:placeId/trait-profile/enrich', async (req, res) => {
  try {
    const placeId = String(req.params.placeId ?? '').trim();
    const provider = String(req.body?.provider ?? 'openai').trim().toLowerCase();

    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const result = await enrichAndStorePlaceTraits(placeId, provider as 'openai');
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enrich place traits',
    });
  }
});

app.get('/api/decision/places/:placeId/trait-profile', async (req, res) => {
  try {
    const placeId = String(req.params.placeId ?? '').trim();

    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const traitProfile = await getStoredPlaceTraitProfile(placeId);
    res.json({
      ok: true,
      traitProfile,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch place trait profile',
    });
  }
});

app.get('/api/decision/trait-profiles/enrichment-targets', async (req, res) => {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const force = String(req.query.force ?? '').toLowerCase() === 'true';
    const placeIds = await findPlaceIdsForTraitEnrichment({
      city,
      limit: Number.isFinite(limit) ? limit : 25,
      force,
    });

    res.json({
      ok: true,
      count: placeIds.length,
      placeIds,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list trait enrichment targets',
    });
  }
});

app.get('/api/decision/trait-profiles/status', async (req, res) => {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
    const sampleLimit = typeof req.query.sampleLimit === 'string' ? Number(req.query.sampleLimit) : undefined;
    const status = await getPlaceTraitCoverageStatus({
      city,
      limit: Number.isFinite(sampleLimit) ? sampleLimit : 10,
    });

    res.json({
      ok: true,
      status,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trait profile coverage status',
    });
  }
});

app.post('/api/decision/trait-profiles/enrich-batch', async (req, res) => {
  try {
    const body = req.body ?? {};
    const city = typeof body.city === 'string' ? body.city.trim() : null;
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : 25;
    const placeIds = Array.isArray(body.placeIds)
      ? body.placeIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const force = body.force === true;

    const result = await enrichAndStorePlaceTraitsBatch({
      provider: 'openai',
      city,
      limit,
      placeIds,
      force,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to batch enrich place traits',
    });
  }
});

app.post('/api/decision/places/:placeId/trait-profile', async (req, res) => {
  try {
    const placeId = String(req.params.placeId ?? '').trim();
    const body = req.body ?? {};

    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const requiredNumericFields = [
      'quietScore',
      'socialScore',
      'soloScore',
      'cozyScore',
      'workScore',
      'dateScore',
      'utilitarianScore',
      'qualityScore',
      'quickReadyScore',
      'stayReadyScore',
      'budgetFriendlyScore',
      'confidence',
    ];

    for (const field of requiredNumericFields) {
      if (typeof body[field] !== 'number') {
        res.status(400).json({ error: `${field} must be a number` });
        return;
      }
    }

    const stored = await upsertPlaceTraitProfile({
      placeId,
      provider: String(body.provider ?? 'manual').trim() || 'manual',
      model: typeof body.model === 'string' ? body.model : null,
      traits: {
        quietScore: body.quietScore,
        socialScore: body.socialScore,
        soloScore: body.soloScore,
        cozyScore: body.cozyScore,
        workScore: body.workScore,
        dateScore: body.dateScore,
        utilitarianScore: body.utilitarianScore,
        qualityScore: body.qualityScore,
        quickReadyScore: body.quickReadyScore,
        stayReadyScore: body.stayReadyScore,
        budgetFriendlyScore: body.budgetFriendlyScore,
        confidence: body.confidence,
        archetype: typeof body.archetype === 'string' ? body.archetype : null,
        evidence: typeof body.evidence === 'object' && body.evidence ? body.evidence : null,
      },
      evidenceJson: typeof body.evidence === 'object' && body.evidence ? body.evidence : null,
      rawResponseJson: typeof body.rawResponseJson === 'object' && body.rawResponseJson ? body.rawResponseJson : null,
      inputSnapshotJson: typeof body.inputSnapshotJson === 'object' && body.inputSnapshotJson ? body.inputSnapshotJson : null,
    });

    res.json({
      ok: true,
      stored,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to store place trait profile',
    });
  }
});

app.post('/api/decision/sessions', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      cityKey?: string | null;
      intentId?: string | null;
      withValue?: string | null;
      feelValue?: string | null;
      stateValue?: string | null;
      entryMode?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };

    const session = await createDecisionSession({
      userId: req.authUserId,
      cityKey: payload.cityKey ?? null,
      intentId: payload.intentId ?? null,
      withValue: payload.withValue ?? null,
      feelValue: payload.feelValue ?? null,
      stateValue: payload.stateValue ?? null,
      entryMode: payload.entryMode ?? null,
      latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
      longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
    });

    res.status(201).json(session);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.get('/api/decision/sessions/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const session = await getDecisionSession(String(req.params.id), req.authUserId);
    res.json(session);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/sessions/:id/swipe', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      placeId?: string;
      direction?: 'left' | 'right';
    };
    const placeId = String(payload.placeId ?? '').trim();
    const direction = payload.direction === 'right' ? 'right' : 'left';

    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const response = await swipeDecisionSession({
      sessionId: String(req.params.id),
      authUserId: req.authUserId,
      placeId,
      direction,
    });
    res.json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/sessions/:id/swap', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      replacePlaceId?: string;
    };
    const replacePlaceId = String(payload.replacePlaceId ?? '').trim();
    if (!replacePlaceId) {
      res.status(400).json({ error: 'replacePlaceId is required' });
      return;
    }

    const response = await swapDecisionSessionOption({
      sessionId: String(req.params.id),
      authUserId: req.authUserId,
      replacePlaceId,
    });
    res.json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/sessions/:id/save', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      placeId?: string;
    };
    const placeId = String(payload.placeId ?? '').trim();
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const response = await saveDecisionPlace({
      sessionId: String(req.params.id),
      userId: req.authUserId!,
      placeId,
    });
    res.json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/sessions/:id/go-now', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      placeId?: string;
      mapProvider?: string | null;
    };
    const placeId = String(payload.placeId ?? '').trim();
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const response = await markDecisionGoNow({
      sessionId: String(req.params.id),
      authUserId: req.authUserId,
      placeId,
      mapProvider: payload.mapProvider ?? null,
    });
    res.json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/checkins', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      sessionId?: string;
      placeId?: string | null;
      ratingLabel?: 'disliked' | 'not_bad' | 'liked' | 'recommended';
      threeWordReview?: string | null;
      uploadedMedia?: string[];
    };
    const sessionId = String(payload.sessionId ?? '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const ratingLabel = payload.ratingLabel ?? 'liked';
    if (!['disliked', 'not_bad', 'liked', 'recommended'].includes(ratingLabel)) {
      res.status(400).json({ error: 'ratingLabel is invalid' });
      return;
    }

    const response = await submitDecisionCheckin({
      sessionId,
      userId: req.authUserId!,
      placeId: payload.placeId ? String(payload.placeId).trim() : null,
      ratingLabel,
      threeWordReview: payload.threeWordReview ?? null,
      uploadedMedia: Array.isArray(payload.uploadedMedia) ? payload.uploadedMedia : [],
    });
    res.status(201).json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.get('/api/decision/feed/today', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await getDecisionTodayFeed(req.authUserId!);
    res.json(payload);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.post('/api/decision/add-place', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      sessionId?: string | null;
      placeId?: string;
    };
    const placeId = String(payload.placeId ?? '').trim();
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const response = await attachDecisionPlace({
      sessionId: payload.sessionId ? String(payload.sessionId).trim() : null,
      authUserId: req.authUserId,
      placeId,
    });
    res.json(response);
  } catch (error) {
    handleDecisionError(res, error);
  }
});

app.get('/api/profile/me', requireAuth, (req: AuthenticatedRequest, res) => {
  void refreshSavedPlaceScoresForUser(req.authUserId!).catch(() => {});
  void getProfileMe(req.authUserId)
    .then((payload) => res.json(payload))
    .catch((error) => handleError(res, error));
});

app.get('/api/profiles/:username/public', (req, res) => {
  const username = req.params.username?.trim();
  if (!username) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  void getPublicProfileByUsername(username)
    .then((payload) => {
      if (!payload) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      res.json(payload);
    })
    .catch((error) => handleError(res, error));
});

app.post('/api/waitlist', async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const source = String(req.body?.source ?? 'landing-invite').trim() || 'landing-invite';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address' });
      return;
    }

    const entry = await prisma.waitlistEntry.upsert({
      where: { email },
      update: { source },
      create: { email, source },
    });

    res.status(201).json({ entry });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/profile/me', requireAuth, (req: AuthenticatedRequest, res) => {
  void updateProfile(req.authUserId, req.body)
    .then((user) => res.json({ user }))
    .catch((error) => handleError(res, error));
});

app.delete('/api/profile/me', requireAuth, (req: AuthenticatedRequest, res) => {
  void eraseAccount(req.authUserId!)
    .then(() => res.status(204).send())
    .catch((error) => handleError(res, error));
});

app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  void getNotifications(req.authUserId).then((notifications) => res.json({ notifications }));
});

app.post('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.authUserId!,
      },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });

    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.authUserId!,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/me/push-devices', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      fcmToken,
      platform,
      appVersion,
    } = req.body as {
      fcmToken?: string;
      platform?: string;
      appVersion?: string | null;
    };

    const normalizedToken = fcmToken?.trim();
    const normalizedPlatform = platform?.trim().toLowerCase() || 'ios';

    if (!normalizedToken) {
      res.status(400).json({ error: 'fcmToken is required' });
      return;
    }

    await prisma.userDevice.upsert({
      where: { fcmToken: normalizedToken },
      update: {
        userId: req.authUserId!,
        platform: normalizedPlatform,
        appVersion: appVersion?.trim() || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId: req.authUserId!,
        fcmToken: normalizedToken,
        platform: normalizedPlatform,
        appVersion: appVersion?.trim() || null,
        isActive: true,
      },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/me/push-devices', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { fcmToken } = req.body as { fcmToken?: string };
    const normalizedToken = fcmToken?.trim();

    if (!normalizedToken) {
      res.status(400).json({ error: 'fcmToken is required' });
      return;
    }

    await prisma.userDevice.updateMany({
      where: {
        userId: req.authUserId!,
        fcmToken: normalizedToken,
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/settings/account', requireAuth, (req: AuthenticatedRequest, res) => {
  void getAccountSettings(req.authUserId).then((payload) => res.json(payload));
});

app.get('/api/settings/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  void getNotificationSettings(req.authUserId).then((payload) => res.json(payload));
});

app.patch('/api/settings/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  void updateNotificationSettings(req.authUserId, req.body).then((payload) => res.json(payload));
});

app.get('/api/settings/privacy', requireAuth, (req: AuthenticatedRequest, res) => {
  void getPrivacySettings(req.authUserId).then((payload) => res.json(payload));
});

app.patch('/api/settings/privacy', requireAuth, (req: AuthenticatedRequest, res) => {
  void updatePrivacySettings(req.authUserId, req.body).then((payload) => res.json(payload));
});

app.get('/api/support', requireAuth, (_, res) => {
  void getSupport().then((payload) => res.json(payload));
});

app.get('/api/collections', requireAuth, (req: AuthenticatedRequest, res) => {
  void refreshSavedPlaceScoresForUser(req.authUserId!).catch(() => {});
  void getCollections(req.authUserId)
    .then((collections) => res.json({ collections }))
    .catch((error) => handleError(res, error));
});

app.get('/api/collections/:id/public', (req, res) => {
  void getPublicCollectionById(req.params.id)
    .then((payload) => res.json(payload))
    .catch((error) => {
      if (error instanceof Error && error.message === 'Collection not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      handleError(res, error);
    });
});

app.get('/api/bookmarks', requireAuth, (req: AuthenticatedRequest, res) => {
  void refreshSavedPlaceScoresForUser(req.authUserId!).catch(() => {});
  void getBookmarks(req.authUserId)
    .then((bookmarks) => res.json({ bookmarks }))
    .catch((error) => handleError(res, error));
});

app.post('/api/collections', requireAuth, (req: AuthenticatedRequest, res) => {
  void createCollection(req.authUserId, req.body)
    .then((collection) => res.status(201).json({ collection }))
    .catch((error) => handleError(res, error));
});

app.patch('/api/collections/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  void updateCollection(req.authUserId, req.params.id, req.body)
    .then((collection) => res.json({ collection }))
    .catch((error) => {
      if (error instanceof Error && error.message === 'Collection not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      handleError(res, error);
    });
});

app.delete('/api/collections/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  void deleteCollection(req.authUserId, req.params.id)
    .then((payload) => res.json(payload))
    .catch((error) => {
      if (error instanceof Error && error.message === 'Collection not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      handleError(res, error);
    });
});

app.get('/api/moments', requireAuth, (req: AuthenticatedRequest, res) => {
  void getMoments(req.authUserId)
    .then((moments) => res.json({ moments }))
    .catch((error) => handleError(res, error));
});

app.post('/api/moments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = { ...req.body };
    const googlePlaceId = typeof payload.googlePlaceId === 'string' ? payload.googlePlaceId.trim() : '';
    if (googlePlaceId) {
      const acquiredPlace = await acquireCheckInPlaceFromGoogleDetails({
        googlePlaceId,
        sessionToken: typeof payload.autocompleteSessionToken === 'string' ? payload.autocompleteSessionToken : null,
        locationLabel: typeof payload.placeSearchLocation === 'string' ? payload.placeSearchLocation : null,
      });
      payload.placeId = acquiredPlace.id;
    }

    const moment = await createMoment(req.authUserId, payload);
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [moment.placeId],
    });
    res.status(201).json({ moment });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/moments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const moment = await updateMoment(req.authUserId, req.params.id, req.body);
    if (!moment) {
      res.status(404).json({ error: 'Moment not found' });
      return;
    }
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [moment.placeId],
    });
    res.json({ moment });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/moments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await deleteMoment(req.authUserId, req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Moment not found' });
      return;
    }
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [result.placeId],
    });
    res.json({});
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/media', async (req, res) => {
  try {
    const key = String(req.query.key ?? '').trim();
    if (!key) {
      res.status(400).json({ error: 'key is required' });
      return;
    }

    if (r2Client && R2_BUCKET_NAME) {
      const object = await r2Client.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }));

      if (object.ContentType) {
        res.setHeader('Content-Type', object.ContentType);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const body = object.Body as NodeJS.ReadableStream | undefined;
      if (!body) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      body.pipe(res);
      return;
    }

    const localPath = path.join(UPLOADS_DIR, path.basename(key));
    res.sendFile(localPath);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/uploads/media', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requestOrigin = `${req.protocol}://${req.get('host') ?? `localhost:${port}`}`;
    const files = (req.body as {
      files?: Array<{
        fileName?: string;
        mimeType?: string;
        dataUrl?: string;
      }>;
    }).files ?? [];

    if (!files.length) {
      res.status(400).json({ error: 'files are required' });
      return;
    }

    const uploaded = await Promise.all(files.map(async (file, index) => {
      if (!file.fileName || !file.dataUrl) {
        throw new Error('Each file needs fileName and dataUrl');
      }

      const parsed = parseDataUrl(file.dataUrl);
      const extension = getUploadExtension(file.fileName, file.mimeType ?? parsed.mimeType);
      const safeBaseName = path.basename(sanitizeFileName(file.fileName), path.extname(file.fileName));
      const storageName = `${Date.now()}-${index}-${crypto.randomUUID().slice(0, 8)}-${safeBaseName}${extension}`;
      const objectKey = `moments/${req.authUserId}/${storageName}`;

      if (r2Client && R2_BUCKET_NAME) {
        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: parsed.buffer,
          ContentType: file.mimeType ?? parsed.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }));
      } else {
        await mkdir(UPLOADS_DIR, { recursive: true });
        const absolutePath = path.join(UPLOADS_DIR, storageName);
        await writeFile(absolutePath, parsed.buffer);
      }

      return {
        url: buildMediaUrl(r2Client && R2_BUCKET_NAME ? objectKey : storageName, requestOrigin),
        fileName: file.fileName,
        mediaType: (file.mimeType ?? parsed.mimeType).startsWith('video/') ? 'video' : 'image',
      };
    }));

    res.status(201).json({ files: uploaded });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/lookups/places', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 3) {
    res.json({ places: [] });
    return;
  }

  void getPlaceSuggestions(q)
    .then((places) => res.json({ places }))
    .catch((error) => handleError(res, error));
});

app.get('/api/lookups/places/autocomplete', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = String(req.query.q || '').trim();
  const locationLabel = String(req.query.location || '').trim();
  const sessionToken = String(req.query.sessionToken || crypto.randomUUID()).trim();

  if (q.length < 3) {
    res.json({ places: [], sessionToken });
    return;
  }

  if (!normalizeCheckInAutocompleteCity(locationLabel)) {
    res.status(400).json({ error: 'Unsupported check-in city' });
    return;
  }

  void getCheckInPlaceSuggestions(q, { sessionToken, locationLabel })
    .then((places) => res.json({ places, sessionToken }))
    .catch((error) => handleError(res, error));
});

app.get('/api/lookups/locations', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    res.json({ locations: [] });
    return;
  }

  void getLocationSuggestions(q)
    .then((locations) => res.json({ locations }))
    .catch((error) => handleError(res, error));
});

app.get('/api/recommendations/today', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const locationLabel = typeof req.query.location === 'string' && req.query.location.trim()
      ? req.query.location.trim()
      : 'Boston';
    const locationType = typeof req.query.type === 'string' && req.query.type.trim()
      ? req.query.type.trim()
      : 'city';
    const focus = typeof req.query.focus === 'string' && req.query.focus.trim()
      ? req.query.focus.trim()
      : null;
    const latitude = typeof req.query.latitude === 'string' ? Number(req.query.latitude) : NaN;
    const longitude = typeof req.query.longitude === 'string' ? Number(req.query.longitude) : NaN;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: 'Latitude and longitude are required' });
      return;
    }

    const recommendation = await getTodayRecommendationForUser({
      userId: req.authUserId!,
      locationLabel,
      locationType,
      latitude,
      longitude,
      focus,
    });

    if (!recommendation) {
      res.status(404).json({ error: 'No strong recommendation available today' });
      return;
    }

    res.json(recommendation);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/saved-locations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const savedLocations = await prisma.userSavedLocation.findMany({
      where: { userId: req.authUserId! },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { location: true },
    });

    res.json({
      locations: savedLocations.map((item) => mapLocationForClient(item.location)),
      activeLocationId: savedLocations.find((item) => item.isDefault)?.locationId ?? savedLocations[0]?.locationId ?? null,
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/saved-locations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      label,
      type,
      googlePlaceId,
      isDefault,
    } = req.body as { label?: string; type?: 'city' | 'province' | 'country'; googlePlaceId?: string; isDefault?: boolean };

    if (!label || !type) {
      res.status(400).json({ error: 'label and type are required' });
      return;
    }

    const trimmedLabel = label.trim();
    const locationDetails = googlePlaceId
      ? await fetchGooglePlaceDetails(googlePlaceId).catch((error) => {
          console.error(error);
          return null;
        })
      : null;
    const location = googlePlaceId
      ? await prisma.location.upsert({
          where: { googlePlaceId },
          update: {
            name: trimmedLabel,
            type: mapLocationTypeForDb(type),
            latitude: locationDetails?.location?.latitude ?? undefined,
            longitude: locationDetails?.location?.longitude ?? undefined,
          },
          create: {
            name: trimmedLabel,
            type: mapLocationTypeForDb(type),
            googlePlaceId,
            latitude: locationDetails?.location?.latitude ?? null,
            longitude: locationDetails?.location?.longitude ?? null,
          },
        })
      : await prisma.location.create({
          data: {
            name: trimmedLabel,
            type: mapLocationTypeForDb(type),
          },
        });

    if (isDefault) {
      await prisma.userSavedLocation.updateMany({
        where: { userId: req.authUserId! },
        data: { isDefault: false },
      });
    }

    const existing = await prisma.userSavedLocation.findFirst({
      where: {
        userId: req.authUserId!,
        locationId: location.id,
      },
    });

    if (!existing) {
      const count = await prisma.userSavedLocation.count({
        where: { userId: req.authUserId! },
      });

      await prisma.userSavedLocation.create({
        data: {
          userId: req.authUserId!,
          locationId: location.id,
          sortOrder: count,
          isDefault: isDefault ?? count === 0,
        },
      });
    } else if (isDefault) {
      await prisma.userSavedLocation.update({
        where: { id: existing.id },
        data: { isDefault: true },
      });
    }

    const savedLocations = await prisma.userSavedLocation.findMany({
      where: { userId: req.authUserId! },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { location: true },
    });

    res.status(201).json({
      locations: savedLocations.map((item) => mapLocationForClient(item.location)),
      activeLocationId: savedLocations.find((item) => item.isDefault)?.locationId ?? location.id,
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/saved-locations/:locationId/default', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { locationId } = req.params;
    await prisma.userSavedLocation.updateMany({
      where: { userId: req.authUserId! },
      data: { isDefault: false },
    });

    await prisma.userSavedLocation.updateMany({
      where: {
        userId: req.authUserId!,
        locationId,
      },
      data: { isDefault: true },
    });

    res.json({ activeLocationId: locationId });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/lookups/places/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUserId) {
    void refreshUserPlaceScores(req.authUserId, [req.params.id]).catch((error) => {
      console.error('Background place detail score refresh failed', error);
    });
  }

  void getUnifiedPlaceDetailPayload(req.params.id, req.authUserId)
    .then((payload) => {
      if (!payload) {
        res.status(404).json({ error: 'Place not found' });
        return;
      }
      res.json(payload);
    })
    .catch((error) => handleError(res, error));
});

app.get('/api/lookups/places/:id/bundle', optionalAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUserId) {
    void refreshUserPlaceScores(req.authUserId, [req.params.id]).catch((error) => {
      console.error('Background place detail bundle score refresh failed', error);
    });
  }

  void getUnifiedPlaceDetailPayload(req.params.id, req.authUserId)
    .then((payload) => {
      if (!payload) {
        res.status(404).json({ error: 'Place not found' });
        return;
      }
      res.json(payload);
    })
    .catch((error) => handleError(res, error));
});

app.get('/api/discovery/places', (req: AuthenticatedRequest, res) => {
  const location = String(req.query.location || '').trim();
  const type = String(req.query.type || '').trim();
  const searchQuery = String(req.query.q || '').trim();
  const selectedVibe = String(req.query.vibe || '').trim() || null;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const forceRefresh = String(req.query.refresh || '').trim() === '1';
  const seed = String(req.query.seed || '').trim();
  const selectedInterests = String(req.query.interests || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!location) {
    res.json({ places: [] });
    return;
  }

  void getDiscoveryPlacesForUser({
    userId: req.authUserId,
    locationLabel: location,
    locationType: type,
    searchQuery,
    selectedInterests,
    selectedVibe,
    page,
    limit,
    forceRefresh,
    seed,
  })
    .then((payload) => res.json(payload))
    .catch((error) => handleError(res, error));
});

app.get('/api/discovery/places/count', (req: AuthenticatedRequest, res) => {
  const location = String(req.query.location || '').trim();
  const type = String(req.query.type || '').trim();
  const searchQuery = String(req.query.q || '').trim();
  const selectedVibe = String(req.query.vibe || '').trim() || null;
  const forceRefresh = String(req.query.refresh || '').trim() === '1';
  const seed = String(req.query.seed || '').trim();
  const selectedInterests = String(req.query.interests || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!location) {
    res.json({
      location: null,
      total: 0,
    });
    return;
  }

  void getDiscoveryPlacesForUser({
    userId: req.authUserId,
    locationLabel: location,
    locationType: type,
    searchQuery,
    selectedInterests,
    selectedVibe,
    page: 1,
    limit: 1,
    forceRefresh,
    seed,
  })
    .then((payload) => {
      res.json({
        location,
        total: payload.pagination.total,
      });
    })
    .catch((error) => handleError(res, error));
});

app.get('/api/discovery/events', (req: AuthenticatedRequest, res) => {
  const location = String(req.query.location || '').trim();
  const type = String(req.query.type || '').trim();
  const searchQuery = String(req.query.q || '').trim();
  const selectedVibe = String(req.query.vibe || '').trim() || null;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const selectedInterests = String(req.query.interests || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!location) {
    res.json({
      events: [],
      pagination: { page: 1, limit, total: 0, hasMore: false },
    });
    return;
  }

  void getDiscoveryEventsForUser({
    userId: req.authUserId,
    locationLabel: location,
    locationType: type,
    searchQuery,
    selectedInterests,
    selectedVibe,
    page,
    limit,
  })
    .then((payload) => res.json(payload))
    .catch((error) => handleError(res, error));
});

app.post('/api/debug/place-score', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      placeId,
      selectedInterests: requestedInterests,
      selectedVibe: requestedVibe,
    } = req.body as {
      placeId?: string;
      selectedInterests?: string[];
      selectedVibe?: string | null;
    };

    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const dbPlace = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        aiEnrichment: true,
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        discoverySignals: {
          orderBy: [
            { bestResultRank: 'asc' },
            { resultRank: 'asc' },
            { lastSeenAt: 'desc' },
          ],
          take: 30,
        },
      },
    });

    if (!dbPlace) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }

    const mappedPlace = mapCachedPlaceForDiscovery(dbPlace);
    const selectedInterests = Array.isArray(requestedInterests) ? requestedInterests : [];
    const selectedVibe = requestedVibe ?? null;

    const emptyContext: RecommendationContext = {
      selectedInterests,
      selectedVibe,
      bookmarkedPlaceIds: new Set<string>(),
      visitedPlaceIds: new Set<string>(),
      dismissedPlaceIds: new Set<string>(),
      manuallyDismissedPlaceIds: new Set<string>(),
      tasteKeywords: new Set<string>(),
      bookmarkKeywords: new Set<string>(),
      momentKeywords: new Set<string>(),
      followedUserIds: new Set<string>(),
      followedPlaceIds: new Set<string>(),
      socialKeywords: new Set<string>(),
      vibedPlaceIds: new Set<string>(),
      commentedPlaceIds: new Set<string>(),
      recentPlaceIds: new Set<string>(),
      momentRatingsByPlaceId: new Map<string, number>(),
    };

    const baseContext = req.authUserId
      ? await getUserRecommendationContext(req.authUserId).catch((error) => {
          console.error('Debug place score context failed', error);
          return emptyContext;
        })
      : emptyContext;

    const scoringContext: RecommendationContext = {
      ...baseContext,
      selectedInterests,
      selectedVibe,
    };

    const persistedScore = req.authUserId
      ? await prisma.userPlaceScore.findUnique({
          where: {
            userId_placeId: {
              userId: req.authUserId,
              placeId,
            },
          },
        }).catch((error) => {
          console.error('Debug place score persisted load failed', error);
          return null;
        })
      : null;

    const audit = computeRecommendationScoreAudit(
      {
        id: mappedPlace.id,
        tags: mappedPlace.tags ?? [],
        category: mappedPlace.category,
        similarityStat: mappedPlace.similarityStat ?? undefined,
        rating: typeof mappedPlace.rating === 'number' ? mappedPlace.rating : null,
        hook: mappedPlace.hook,
        description: mappedPlace.description,
        whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
        discoverySignals: mappedPlace.discoverySignals,
      },
      {
        selectedInterests,
        selectedVibe,
        bookmarkKeywords: scoringContext.bookmarkKeywords,
        momentKeywords: scoringContext.momentKeywords,
        socialKeywords: scoringContext.socialKeywords,
        isBookmarked: scoringContext.bookmarkedPlaceIds.has(placeId),
        isVisited: scoringContext.visitedPlaceIds.has(placeId),
        isVibed: scoringContext.vibedPlaceIds.has(placeId),
        isCommented: scoringContext.commentedPlaceIds.has(placeId),
        isRecent: scoringContext.recentPlaceIds.has(placeId),
        followedPlaceMatch: scoringContext.followedPlaceIds.has(placeId),
        momentRating: scoringContext.momentRatingsByPlaceId.get(placeId) ?? null,
      },
    );

    const persistedSimilarity = persistedScore?.similarityPercentage ?? persistedScore?.matchScore ?? null;
    const effectiveScore = persistedSimilarity ?? audit.finalScore;

    res.json({
      placeId,
      placeName: mappedPlace.name,
      effectiveScore,
      effectiveClassification: describeRecommendationClassification(effectiveScore),
      persistedScore: persistedScore
        ? {
            matchScore: persistedScore.matchScore,
            similarityPercentage: persistedScore.similarityPercentage,
            recommendationReason: persistedScore.recommendationReason,
            distanceKm: persistedScore.distanceKm,
            sourceVersion: persistedScore.sourceVersion,
            updatedAt: persistedScore.updatedAt,
          }
        : null,
      calculation: {
        finalScore: audit.finalScore,
        classification: audit.classification,
        unclampedScore: audit.unclampedScore,
        baseScore: audit.baseScore,
        diversitySeed: audit.diversitySeed,
        baseSimilarityInput: mappedPlace.similarityStat ?? null,
        selectedInterests,
        selectedVibe,
        matchedInterestCount: audit.matchedInterestCount,
        matchedVibe: audit.matchedVibe,
        noisePenalty: audit.noisePenalty,
        momentOverlapCount: audit.momentOverlapCount,
        bookmarkOverlapCount: audit.bookmarkOverlapCount,
        socialOverlapCount: audit.socialOverlapCount,
        contributions: audit.contributions,
      },
      interactions: {
        isBookmarked: scoringContext.bookmarkedPlaceIds.has(placeId),
        isVisited: scoringContext.visitedPlaceIds.has(placeId),
        isVibed: scoringContext.vibedPlaceIds.has(placeId),
        isCommented: scoringContext.commentedPlaceIds.has(placeId),
        isRecent: scoringContext.recentPlaceIds.has(placeId),
        followedPlaceMatch: scoringContext.followedPlaceIds.has(placeId),
        momentRating: scoringContext.momentRatingsByPlaceId.get(placeId) ?? null,
      },
      availableSignals: {
        bookmarkKeywords: Array.from(scoringContext.bookmarkKeywords).sort(),
        momentKeywords: Array.from(scoringContext.momentKeywords).sort(),
        socialKeywords: Array.from(scoringContext.socialKeywords).sort(),
        tasteKeywords: Array.from(scoringContext.tasteKeywords).sort(),
      },
      history: {
        persistedUpdatedAt: persistedScore?.updatedAt ?? null,
        sourceVersion: persistedScore?.sourceVersion ?? null,
        persistedReason: persistedScore?.recommendationReason ?? null,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/debug/today-recommendation', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const locationLabel = String(req.query.location || '').trim() || 'Boston';
    const locationType = String(req.query.type || '').trim() || 'city';
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: 'latitude and longitude are required' });
      return;
    }

    const recommendationContext = await getUserRecommendationContext(req.authUserId!);
    let candidatePlaces: Awaited<ReturnType<typeof getCachedDiscoveryPlacesByLocation>> = [];

    try {
      await ensureLocationCandidatePool(
        locationLabel,
        locationType,
        recommendationContext.selectedInterests,
        recommendationContext.selectedVibe,
        false,
      );
      candidatePlaces = await getCachedDiscoveryPlacesByLocation(locationLabel, locationType);
    } catch (error) {
      console.error('Today recommendation debug area candidate load failed', error);
      candidatePlaces = getFallbackDiscoveryPlaces(locationLabel);
    }

    if (candidatePlaces.length === 0) {
      candidatePlaces = getFallbackDiscoveryPlaces(locationLabel);
    }

    const candidateIds = candidatePlaces.map((place) => place.id);
    if (candidateIds.length === 0) {
      res.json({
        criteria: {
          minScore: 78,
          preferredDistanceMiles: 1,
          fallbackDistanceMiles: 2,
          allowedClassifications: ['Your vibe', 'Strong fit'],
          excludesVisited: true,
        },
        poolSummary: {
          totalAreaCandidates: 0,
          rankedCandidates: 0,
          nearbyCandidates: 0,
          fallbackCandidates: 0,
        },
        topCandidates: [],
      });
      return;
    }

    await refreshUserPlaceScores(req.authUserId!, candidateIds);

    const [persistedScores, candidates] = await Promise.all([
      prisma.userPlaceScore.findMany({
        where: {
          userId: req.authUserId!,
          placeId: { in: candidateIds },
        },
        select: {
          placeId: true,
          similarityPercentage: true,
          matchScore: true,
          recommendationReason: true,
          sourceVersion: true,
          updatedAt: true,
        },
      }),
      prisma.place.findMany({
        where: { id: { in: candidateIds } },
        include: { aiEnrichment: true },
      }),
    ]);

    const scoreMap = new Map(
      persistedScores.map((item) => [
        item.placeId,
        {
          score: item.similarityPercentage ?? item.matchScore ?? null,
          reason: item.recommendationReason ?? null,
          sourceVersion: item.sourceVersion ?? null,
          updatedAt: item.updatedAt,
        },
      ]),
    );

    const origin = { latitude, longitude };
    const candidatePlaceMap = new Map(candidatePlaces.map((place) => [place.id, place]));

    const rankedCandidates = candidates
      .map((place) => {
        const mappedPlace = candidatePlaceMap.get(place.id);
        if (!mappedPlace || mappedPlace.latitude == null || mappedPlace.longitude == null) return null;
        if (isServiceLikePlace({
          name: mappedPlace.name,
          tags: mappedPlace.tags,
          category: mappedPlace.category,
          hook: mappedPlace.hook,
          description: mappedPlace.description,
          whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
        })) return null;

        const distanceMiles = distanceBetweenMiles(origin, {
          latitude: mappedPlace.latitude,
          longitude: mappedPlace.longitude,
        });
        const persisted = scoreMap.get(place.id);
        const score = typeof persisted?.score === 'number'
          ? applyDiscoverySignalBoostToScore(
              persisted.score,
              mappedPlace.discoverySignals,
              { selectedInterests: recommendationContext.selectedInterests },
            )
          : computeRecommendationScore(
          {
            id: mappedPlace.id,
            tags: mappedPlace.tags,
            category: mappedPlace.category,
            similarityStat: mappedPlace.similarityStat,
            rating: typeof mappedPlace.rating === 'number' ? mappedPlace.rating : null,
            hook: mappedPlace.hook,
            description: mappedPlace.description,
            whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
            discoverySignals: mappedPlace.discoverySignals,
          },
          {
            selectedInterests: recommendationContext.selectedInterests,
            selectedVibe: recommendationContext.selectedVibe,
            bookmarkKeywords: recommendationContext.bookmarkKeywords,
            momentKeywords: recommendationContext.momentKeywords,
            socialKeywords: recommendationContext.socialKeywords,
            isBookmarked: recommendationContext.bookmarkedPlaceIds.has(mappedPlace.id),
            isVisited: recommendationContext.visitedPlaceIds.has(mappedPlace.id),
            isVibed: recommendationContext.vibedPlaceIds.has(mappedPlace.id),
            isCommented: recommendationContext.commentedPlaceIds.has(mappedPlace.id),
            isRecent: recommendationContext.recentPlaceIds.has(mappedPlace.id),
            followedPlaceMatch: recommendationContext.followedPlaceIds.has(mappedPlace.id),
            momentRating: recommendationContext.momentRatingsByPlaceId.get(mappedPlace.id) ?? null,
          },
        );

        const classification = describeRecommendationClassification(score);
        return {
          placeId: place.id,
          placeName: mappedPlace.name,
          distanceMiles: Number(distanceMiles.toFixed(2)),
          score,
          classification,
          reason: persisted?.reason ?? buildRecommendationReason({
            place: {
              category: mappedPlace.category,
              tags: mappedPlace.tags,
            },
            selectedInterests: recommendationContext.selectedInterests,
            selectedVibe: recommendationContext.selectedVibe,
            tasteKeywords: recommendationContext.tasteKeywords,
            followedTravelerVisits: 0,
            followedPlaceMatch: recommendationContext.followedPlaceIds.has(mappedPlace.id),
            socialOverlap: recommendationContext.socialKeywords.size > 0,
            isBookmarked: recommendationContext.bookmarkedPlaceIds.has(mappedPlace.id),
            isVisited: recommendationContext.visitedPlaceIds.has(mappedPlace.id),
            isVibed: recommendationContext.vibedPlaceIds.has(mappedPlace.id),
            isCommented: recommendationContext.commentedPlaceIds.has(mappedPlace.id),
            isRecent: recommendationContext.recentPlaceIds.has(mappedPlace.id),
            isDismissed: recommendationContext.manuallyDismissedPlaceIds.has(mappedPlace.id),
          }),
          isVisited: recommendationContext.visitedPlaceIds.has(mappedPlace.id),
          persistedSourceVersion: persisted?.sourceVersion ?? null,
          persistedUpdatedAt: persisted?.updatedAt ?? null,
          bestTime: mappedPlace.bestTime ?? place.aiEnrichment?.bestTime ?? null,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .filter((candidate) => !candidate.isVisited)
      .filter((candidate) => (candidate.score ?? 0) >= 78)
      .sort((left, right) => {
        if (left.distanceMiles !== right.distanceMiles) return left.distanceMiles - right.distanceMiles;
        if ((right.score ?? 0) !== (left.score ?? 0)) return (right.score ?? 0) - (left.score ?? 0);
        return 0;
      });

    const nearbyCandidates = rankedCandidates.filter((candidate) => candidate.distanceMiles <= 1);
    const fallbackCandidates = rankedCandidates.filter((candidate) => candidate.distanceMiles <= 2);
    const selected = pickRandomTodayRecommendationCandidate(nearbyCandidates)
      ?? pickRandomTodayRecommendationCandidate(fallbackCandidates);

    res.json({
      criteria: {
        minScore: 78,
        preferredDistanceMiles: 1,
        fallbackDistanceMiles: 2,
        allowedClassifications: ['Your vibe', 'Strong fit'],
        excludesVisited: true,
      },
      profileContext: {
        selectedInterests: recommendationContext.selectedInterests,
        selectedVibe: recommendationContext.selectedVibe,
        bookmarkedCount: recommendationContext.bookmarkedPlaceIds.size,
        visitedCount: recommendationContext.visitedPlaceIds.size,
        followedPlacesCount: recommendationContext.followedPlaceIds.size,
        socialKeywordCount: recommendationContext.socialKeywords.size,
      },
      poolSummary: {
        totalAreaCandidates: candidatePlaces.length,
        rankedCandidates: rankedCandidates.length,
        nearbyCandidates: nearbyCandidates.length,
        fallbackCandidates: fallbackCandidates.length,
      },
      selectedCandidate: selected
        ? {
            ...selected,
            selectionBucket: selected.distanceMiles <= 1 ? 'preferred_under_1_mile' : 'fallback_under_2_miles',
            todayReason: buildTodayRecommendationReason({
              baseReason: selected.reason,
              bestTime: selected.bestTime,
              distanceMiles: selected.distanceMiles,
              score: selected.score ?? 0,
            }),
          }
        : null,
      topCandidates: rankedCandidates.slice(0, 5),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/debug/place-google-snapshots/:placeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const placeId = String(req.params.placeId || '').trim();
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        name: true,
        googlePlaceId: true,
        address: true,
        city: true,
        country: true,
        category: true,
        rating: true,
        priceLevel: true,
        mapsEmbedUrl: true,
      },
    });

    if (!place) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }

    const snapshots = await prisma.placeGoogleSnapshot.findMany({
      where: { placeId },
      select: {
        id: true,
        source: true,
        queryContext: true,
        fetchedAt: true,
        payloadJson: true,
      },
      orderBy: { fetchedAt: 'desc' },
      take: 4,
    });

    res.json({ place, snapshots });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/debug/travelers/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const travelerId = req.params.id;
    const userId = req.authUserId!;
    if (!travelerId || travelerId === userId) {
      res.status(400).json({ error: 'A different traveler id is required' });
      return;
    }

    const context = await getUserRecommendationContext(userId);
    const myPlaceIds = new Set([...context.bookmarkedPlaceIds, ...context.visitedPlaceIds]);

    const [traveler, travelerMoments, persistedSimilarity, interactionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: travelerId },
        include: {
          bookmarks: {
            orderBy: { createdAt: 'desc' },
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
            take: 6,
          },
          moments: {
            where: { privacy: 'PUBLIC' },
            orderBy: { visitedAt: 'desc' },
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
            take: 12,
          },
        },
      }),
      prisma.moment.findMany({
        where: {
          userId: travelerId,
          privacy: 'PUBLIC',
        },
        select: {
          placeId: true,
          place: {
            select: {
              name: true,
              category: true,
              aiEnrichment: { select: { vibeTags: true } },
            },
          },
        },
        take: 24,
      }),
      prisma.travelerSimilarity.findUnique({
        where: {
          userId_travelerId: {
            userId,
            travelerId,
          },
        },
      }),
      prisma.vibin.count({
        where: {
          senderUserId: userId,
          receiverUserId: travelerId,
        },
      }),
    ]);

    if (!traveler) {
      res.status(404).json({ error: 'Traveler not found' });
      return;
    }

    const overlapPlaceMap = new Map<string, string>();
    for (const moment of travelerMoments) {
      if (myPlaceIds.has(moment.placeId)) {
        overlapPlaceMap.set(moment.placeId, moment.place.name);
      }
    }

    const travelerKeywords = collectTasteKeywords(travelerMoments.map((moment) => moment.place));
    const sharedTasteKeywords = Array.from(context.tasteKeywords).filter((keyword) => travelerKeywords.has(keyword));
    const isFollowing = context.followedUserIds.has(travelerId);
    const overlapPlaces = overlapPlaceMap.size;
    const overlapKeywords = sharedTasteKeywords.length;
    const interactionBoost = interactionCount * 2;
    const computedScore = computeTravelerMatchScore({
      overlapPlaces,
      overlapKeywords,
      isFollowing,
      interactionBoost,
    });
    const relevanceReason = buildTravelerReason({ overlapPlaces, overlapKeywords, isFollowing });
    const descriptor = await generateTravelerProfileDescriptor({
      userId: traveler.id,
      displayName: traveler.displayName,
      moments: traveler.moments.map((moment) => ({
        caption: moment.caption,
        vibeTags: moment.place.aiEnrichment?.vibeTags ?? [],
        place: {
          name: moment.place.name,
          category: moment.place.category ?? undefined,
          tags: (moment.place.aiEnrichment?.vibeTags ?? []).map((tag) => tag.trim()).filter(Boolean),
        },
      })),
      bookmarkedPlaces: traveler.bookmarks.map((bookmark) => ({
        name: bookmark.place.name,
        category: bookmark.place.category ?? undefined,
        tags: (bookmark.place.aiEnrichment?.vibeTags ?? []).map((tag) => tag.trim()).filter(Boolean),
      })),
    });

    res.json({
      travelerId,
      travelerUsername: traveler.username,
      effectiveScore: persistedSimilarity?.matchScore ?? computedScore,
      persistedScore: persistedSimilarity?.matchScore ?? null,
      persistedReason: persistedSimilarity?.relevanceReason ?? null,
      persistedUpdatedAt: persistedSimilarity?.updatedAt ?? null,
      descriptor,
      calculation: {
        baseScore: 46,
        overlapPlaces,
        overlapPlacesDelta: Math.min(overlapPlaces * 12, 28),
        overlapKeywords,
        overlapKeywordsDelta: Math.min(overlapKeywords * 5, 18),
        isFollowing,
        followingDelta: isFollowing ? 8 : 0,
        interactionCount,
        interactionBoost,
        interactionDelta: Math.min(interactionBoost, 10),
        computedScore,
      },
      overlaps: {
        sharedPlaceNames: Array.from(overlapPlaceMap.values()),
        sharedTasteKeywords,
      },
      reasoning: {
        computedReason: relevanceReason,
        persistedReason: persistedSimilarity?.relevanceReason ?? null,
      },
      viewerContext: {
        selectedInterests: context.selectedInterests,
        selectedVibe: context.selectedVibe,
        tasteKeywords: Array.from(context.tasteKeywords).sort(),
      },
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/me/signals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [bookmarks, dismissed, preferences] = await Promise.all([
      prisma.bookmark.findMany({
        where: { userId: req.authUserId },
        select: { placeId: true },
      }),
      prisma.dismissedPlace.findMany({
        where: { userId: req.authUserId },
        select: { placeId: true },
      }),
      prisma.userPreference.findUnique({
        where: { userId: req.authUserId },
      }),
    ]);

    res.json({
      bookmarkedPlaceIds: bookmarks.map((item) => item.placeId),
      dismissedPlaceIds: dismissed.map((item) => item.placeId),
      selectedInterests: preferences?.selectedInterests ?? [],
      selectedVibe: preferences?.selectedVibe ?? null,
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/me/interaction-state', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const placeIds = String(req.query.placeIds ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const momentIds = String(req.query.momentIds ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const profileIds = String(req.query.profileIds ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const [
      bookmarked,
      beenThereMoments,
      vibedPlacesByMe,
      vibedMomentsByMe,
      commentsByPlace,
      vibinsByPlace,
      commentsByMoment,
      vibinsByMoment,
      followsByMe,
      vibedProfilesByMe,
      followersByProfile,
      vibinsByProfile,
    ] = await Promise.all([
      placeIds.length
        ? prisma.bookmark.findMany({
            where: { userId: req.authUserId!, placeId: { in: placeIds } },
            select: { placeId: true },
          })
        : Promise.resolve([]),
      placeIds.length
        ? prisma.moment.findMany({
            where: { userId: req.authUserId!, placeId: { in: placeIds } },
            distinct: ['placeId'],
            select: { placeId: true },
          })
        : Promise.resolve([]),
      placeIds.length
        ? prisma.vibin.findMany({
            where: {
              senderUserId: req.authUserId!,
              targetType: 'PLACE',
              targetId: { in: placeIds },
            },
            select: { targetId: true },
          })
        : Promise.resolve([]),
      momentIds.length
        ? prisma.vibin.findMany({
            where: {
              senderUserId: req.authUserId!,
              targetType: 'MOMENT',
              targetId: { in: momentIds },
            },
            select: { targetId: true },
          })
        : Promise.resolve([]),
      placeIds.length
        ? prisma.comment.groupBy({
            by: ['targetId'],
            where: {
              targetType: 'PLACE',
              targetId: { in: placeIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      placeIds.length
        ? prisma.vibin.groupBy({
            by: ['targetId'],
            where: {
              targetType: 'PLACE',
              targetId: { in: placeIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      momentIds.length
        ? prisma.comment.groupBy({
            by: ['targetId'],
            where: {
              targetType: 'MOMENT',
              targetId: { in: momentIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      momentIds.length
        ? prisma.vibin.groupBy({
            by: ['targetId'],
            where: {
              targetType: 'MOMENT',
              targetId: { in: momentIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      profileIds.length
        ? prisma.follow.findMany({
            where: { sourceUserId: req.authUserId!, targetUserId: { in: profileIds } },
            select: { targetUserId: true },
          })
        : Promise.resolve([]),
      profileIds.length
        ? prisma.vibin.findMany({
            where: {
              senderUserId: req.authUserId!,
              targetType: 'PROFILE',
              targetId: { in: profileIds },
            },
            select: { targetId: true },
          })
        : Promise.resolve([]),
      profileIds.length
        ? prisma.follow.groupBy({
            by: ['targetUserId'],
            where: { targetUserId: { in: profileIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      profileIds.length
        ? prisma.vibin.groupBy({
            by: ['targetId'],
            where: {
              targetType: 'PROFILE',
              targetId: { in: profileIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    res.json({
      bookmarkedPlaceIds: bookmarked.map((item) => item.placeId),
      beenTherePlaceIds: beenThereMoments.map((item) => item.placeId),
      vibedPlaceIds: vibedPlacesByMe.map((item) => item.targetId),
      vibedMomentIds: vibedMomentsByMe.map((item) => item.targetId),
      placeCommentCounts: Object.fromEntries(commentsByPlace.map((item) => [item.targetId, item._count._all])),
      placeVibinCounts: Object.fromEntries(vibinsByPlace.map((item) => [item.targetId, item._count._all])),
      momentCommentCounts: Object.fromEntries(commentsByMoment.map((item) => [item.targetId, item._count._all])),
      momentVibinCounts: Object.fromEntries(vibinsByMoment.map((item) => [item.targetId, item._count._all])),
      followedUserIds: followsByMe.map((item) => item.targetUserId),
      vibedProfileIds: vibedProfilesByMe.map((item) => item.targetId),
      profileFollowerCounts: Object.fromEntries(followersByProfile.map((item) => [item.targetUserId, item._count._all])),
      profileVibinCounts: Object.fromEntries(vibinsByProfile.map((item) => [item.targetId, item._count._all])),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/discovery/travelers', requireAuth, (req: AuthenticatedRequest, res) => {
  void getTravelerDiscovery(req.authUserId)
    .then((payload) => res.json(payload))
    .catch((error) => handleError(res, error));
});

app.get('/api/feed', requireAuth, (req: AuthenticatedRequest, res) => {
  void getFollowingFeed(req.authUserId)
    .then((payload) => res.json(payload))
    .catch((error) => handleError(res, error));
});

app.get('/api/discovery/travelers/public-search', (req, res) => {
  const query = String(req.query.q ?? '').trim();
  void searchPublicTravelers(query)
    .then((travelers) => res.json({ travelers }))
    .catch((error) => handleError(res, error));
});

app.get('/api/discovery/travelers/public-suggestions', (req, res) => {
  const rawLimit = Number(req.query.limit ?? 12);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 24)) : 12;
  void getPublicTravelerSuggestions(limit)
    .then((travelers) => res.json({ travelers }))
    .catch((error) => handleError(res, error));
});

app.get('/api/travelers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  void getTravelerProfile(req.params.id, req.authUserId)
    .then((payload) => {
      if (!payload) {
        res.status(404).json({ error: 'Traveler not found' });
        return;
      }
      res.json(payload);
    })
    .catch((error) => handleError(res, error));
});

app.get('/api/travelers/:id/followers', requireAuth, (req: AuthenticatedRequest, res) => {
  void getTravelerFollowers(req.params.id, req.authUserId)
    .then((followers) => res.json({ travelers: followers }))
    .catch((error) => handleError(res, error));
});

app.get('/api/places/:id/travelers', requireAuth, (req: AuthenticatedRequest, res) => {
  void getPlaceTravelerMoments(req.params.id, req.authUserId)
    .then((travelerMoments) => res.json({ travelerMoments }))
    .catch((error) => handleError(res, error));
});

app.get('/api/places/:id/related', requireAuth, (req: AuthenticatedRequest, res) => {
  void getRelatedPlaces(req.params.id)
    .then((places) => res.json({ places }))
    .catch((error) => handleError(res, error));
});

app.patch('/api/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body as {
      selectedInterests?: string[];
      selectedVibe?: string | null;
      skippedPreferences?: boolean;
      onboardingCompleted?: boolean;
    };

    const preferences = await prisma.userPreference.upsert({
      where: { userId: req.authUserId! },
      update: {
        selectedInterests: payload.selectedInterests ?? [],
        selectedVibe: payload.selectedVibe ?? null,
        skippedPreferences: payload.skippedPreferences ?? false,
        onboardingCompleted: payload.onboardingCompleted ?? true,
      },
      create: {
        userId: req.authUserId!,
        selectedInterests: payload.selectedInterests ?? [],
        selectedVibe: payload.selectedVibe ?? null,
        skippedPreferences: payload.skippedPreferences ?? false,
        onboardingCompleted: payload.onboardingCompleted ?? true,
      },
    });

    const impactedPlaceIds = await prisma.place.findMany({
      take: 40,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: impactedPlaceIds.map((item) => item.id),
    });

    res.json(preferences);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/bookmarks', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { placeId, place } = req.body as { placeId?: string; place?: BookmarkPlaceSnapshot };
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    await ensureBookmarkablePlaceExists(placeId, place ?? null);

    await prisma.bookmark.upsert({
      where: {
        userId_placeId: {
          userId: req.authUserId!,
          placeId,
        },
      },
      update: {},
      create: {
        userId: req.authUserId!,
        placeId,
      },
    });

    await prisma.dismissedPlace.deleteMany({
      where: {
        userId: req.authUserId!,
        placeId,
      },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [placeId],
    });
    void queueOwnTravelerDescriptorRefresh(req.authUserId!).catch(() => {});

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: req.authUserId! },
      select: { placeId: true },
    });

    res.json({ bookmarkedPlaceIds: bookmarks.map((item) => item.placeId) });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/bookmarks/:placeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { placeId } = req.params;
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    await prisma.bookmark.deleteMany({
      where: {
        userId: req.authUserId!,
        placeId,
      },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [placeId],
    });
    void queueOwnTravelerDescriptorRefresh(req.authUserId!).catch(() => {});

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: req.authUserId! },
      select: { placeId: true },
    });

    res.json({ bookmarkedPlaceIds: bookmarks.map((item) => item.placeId) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/dismissed-places', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { placeId, reason } = req.body as { placeId?: string; reason?: string };
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    await prisma.dismissedPlace.upsert({
      where: {
        userId_placeId: {
          userId: req.authUserId!,
          placeId,
        },
      },
      update: { reason: reason ?? 'manual_hide' },
      create: {
        userId: req.authUserId!,
        placeId,
        reason: reason ?? 'manual_hide',
      },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [placeId],
    });

    const dismissed = await prisma.dismissedPlace.findMany({
      where: { userId: req.authUserId! },
      select: { placeId: true },
    });

    res.json({ dismissedPlaceIds: dismissed.map((item) => item.placeId) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/been-there', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { placeId, visitedAt } = req.body as { placeId?: string; visitedAt?: string };
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }

    const existingMoment = await prisma.moment.findFirst({
      where: {
        userId: req.authUserId!,
        placeId,
      },
      orderBy: { visitedAt: 'desc' },
      include: {
        place: true,
      },
    });

    if (existingMoment) {
      await runRecommendationWriteback({
        userId: req.authUserId!,
        placeIds: [placeId],
      });
      res.json({ created: false, momentId: existingMoment.id, placeId });
      return;
    }

    const createdMoment = await prisma.moment.create({
      data: {
        userId: req.authUserId!,
        placeId,
        visitedAt: visitedAt ? new Date(visitedAt) : new Date(),
        caption: 'Been there',
        rating: 5,
        ratingLabel: 'LIKED',
        budgetLevel: '$$',
        visitType: 'SOLO',
        timeOfDay: 'AFTERNOON',
        privacy: 'PRIVATE',
        wouldRevisit: 'YES',
        vibeTags: ['been there'],
      },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: [placeId],
    });

    res.json({ created: true, momentId: createdMoment.id, placeId });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/follows/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUserId } = req.body as { targetUserId?: string };
    if (!targetUserId) {
      res.status(400).json({ error: 'targetUserId is required' });
      return;
    }

    const blockingRelationship = await prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            sourceUserId: req.authUserId!,
            targetUserId,
          },
          {
            sourceUserId: targetUserId,
            targetUserId: req.authUserId!,
          },
        ],
      },
    });

    if (blockingRelationship) {
      res.status(400).json({ error: 'Cannot follow a blocked account' });
      return;
    }

    const existing = await prisma.follow.findFirst({
      where: {
        sourceUserId: req.authUserId!,
        targetUserId,
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: { id: existing.id },
      });
      const impactedPlaces = await prisma.moment.findMany({
        where: {
          userId: targetUserId,
          privacy: 'PUBLIC',
        },
        select: { placeId: true },
        take: 12,
      });
      await runRecommendationWriteback({
        userId: req.authUserId!,
        placeIds: impactedPlaces.map((item) => item.placeId),
        travelerIds: [targetUserId],
      });
      const followersCount = await prisma.follow.count({
        where: { targetUserId },
      });
      res.json({ active: false, followersCount });
      return;
    }

    await prisma.follow.create({
      data: {
        sourceUserId: req.authUserId!,
        targetUserId,
      },
    });

    const actor = await prisma.user.findUnique({
      where: { id: req.authUserId! },
      select: { username: true, displayName: true },
    });

    if (actor) {
      await createNotification({
        userId: targetUserId,
        actorUserId: req.authUserId!,
        type: 'FOLLOW',
        targetType: 'PROFILE',
        targetId: targetUserId,
        title: `${actor.displayName ?? actor.username} followed you`,
        body: 'Your travel graph just pulled in a new follower.',
      });
    }

    const followersCount = await prisma.follow.count({
      where: { targetUserId },
    });
    const impactedPlaces = await prisma.moment.findMany({
      where: {
        userId: targetUserId,
        privacy: 'PUBLIC',
      },
      select: { placeId: true },
      take: 12,
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: impactedPlaces.map((item) => item.placeId),
      travelerIds: [targetUserId],
    });

    res.json({ active: true, followersCount });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/friendships/status/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const otherUserId = String(req.params.userId ?? '').trim();
    if (!otherUserId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const status = await resolveFriendshipStatusForUsers(req.authUserId!, otherUserId);
    res.json({
      status: status.status,
      friendshipId: status.friendship?.id ?? null,
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/friendships/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: {
        addresseeId: req.authUserId!,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      requests: requests.map((item) => ({
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        requester: {
          id: item.requester.id,
          username: item.requester.username,
          displayName: item.requester.displayName ?? item.requester.username,
          avatar: item.requester.avatarUrl ?? null,
        },
      })),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/friendships/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetUserId = String(req.body?.targetUserId ?? '').trim();
    if (!targetUserId) {
      res.status(400).json({ error: 'targetUserId is required' });
      return;
    }
    if (targetUserId === req.authUserId) {
      res.status(400).json({ error: 'Cannot add yourself' });
      return;
    }

    const state = await resolveFriendshipStatusForUsers(req.authUserId!, targetUserId);
    if (state.status === 'blocked') {
      res.status(400).json({ error: 'Cannot add a blocked account' });
      return;
    }
    if (state.status === 'accepted') {
      res.json({ status: 'accepted', friendshipId: state.friendship?.id ?? null });
      return;
    }
    if (state.status === 'pending_sent') {
      res.json({ status: 'pending_sent', friendshipId: state.friendship?.id ?? null });
      return;
    }
    if (state.status === 'pending_received' && state.friendship) {
      const accepted = await prisma.friendship.update({
        where: { id: state.friendship.id },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });
      const actor = await prisma.user.findUnique({
        where: { id: req.authUserId! },
        select: { username: true, displayName: true },
      });
      if (actor) {
        await createNotification({
          userId: targetUserId,
          actorUserId: req.authUserId!,
          type: 'SYSTEM',
          targetType: 'PROFILE',
          targetId: req.authUserId!,
          title: `${actor.displayName ?? actor.username} accepted your friend request`,
          body: `${actor.displayName ?? actor.username} accepted your friend request.`,
        });
      }
      res.json({ status: 'accepted', friendshipId: accepted.id });
      return;
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: req.authUserId!,
        addresseeId: targetUserId,
        status: 'PENDING',
      },
    });

    const actor = await prisma.user.findUnique({
      where: { id: req.authUserId! },
      select: { username: true, displayName: true },
    });
    if (actor) {
      await createNotification({
        userId: targetUserId,
        actorUserId: req.authUserId!,
        type: 'SYSTEM',
        targetType: 'PROFILE',
        targetId: req.authUserId!,
        title: `${actor.displayName ?? actor.username} sent you a friend request`,
        body: `${actor.displayName ?? actor.username} sent you a friend request.`,
      });
    }

    res.status(201).json({ status: 'pending_sent', friendshipId: friendship.id });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/friendships/respond', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requesterUserId = String(req.body?.requesterUserId ?? '').trim();
    const action = String(req.body?.action ?? '').trim().toLowerCase();

    if (!requesterUserId || !['accept', 'decline'].includes(action)) {
      res.status(400).json({ error: 'requesterUserId and valid action are required' });
      return;
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        requesterId: requesterUserId,
        addresseeId: req.authUserId!,
        status: 'PENDING',
      },
    });

    if (!friendship) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    if (action === 'decline') {
      await prisma.friendship.delete({ where: { id: friendship.id } });
      res.json({ status: 'declined' });
      return;
    }

    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
      },
    });

    const actor = await prisma.user.findUnique({
      where: { id: req.authUserId! },
      select: { username: true, displayName: true },
    });
    if (actor) {
      await createNotification({
        userId: requesterUserId,
        actorUserId: req.authUserId!,
        type: 'SYSTEM',
        targetType: 'PROFILE',
        targetId: req.authUserId!,
        title: `${actor.displayName ?? actor.username} accepted your friend request`,
        body: `${actor.displayName ?? actor.username} accepted your friend request.`,
      });
    }

    res.json({ status: 'accepted', friendshipId: updated.id });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/friendships/remove', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetUserId = String(req.body?.targetUserId ?? '').trim();
    if (!targetUserId) {
      res.status(400).json({ error: 'targetUserId is required' });
      return;
    }

    const friendship = await findFriendshipBetween(req.authUserId!, targetUserId);
    if (!friendship) {
      res.json({ removed: false });
      return;
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });
    res.json({ removed: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/chat/conversations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId: req.authUserId!,
          },
        },
      },
      orderBy: [
        { lastMessageAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: conversationArgs.include,
    });

    const items = await Promise.all(
      conversations.map((conversation) => mapConversationSummaryForUser(conversation, req.authUserId!))
    );

    res.json({ conversations: items });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/chat/conversations/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const otherUserId = String(req.body?.otherUserId ?? '').trim();
    if (!otherUserId) {
      res.status(400).json({ error: 'otherUserId is required' });
      return;
    }

    const conversation = await ensureDirectConversation(req.authUserId!, otherUserId);
    const summary = await mapConversationSummaryForUser(conversation, req.authUserId!);
    res.json({ conversation: summary });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/chat/conversations/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const conversationId = String(req.params.id ?? '').trim();
    await assertConversationMember(conversationId, req.authUserId!);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: chatMessageArgs.include,
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const summary = await mapConversationSummaryForUser({
      ...conversation,
      messages: conversation.messages.slice(-1),
    }, req.authUserId!);

    res.json({
      conversation: {
        ...summary,
        members: conversation.members.map((member) => ({
          id: member.user.id,
          username: member.user.username,
          displayName: member.user.displayName ?? member.user.username,
          avatarUrl: member.user.avatarUrl ?? null,
        })),
      },
      messages: conversation.messages.map(mapChatMessageForClient),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/chat/conversations/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const conversationId = String(req.params.id ?? '').trim();
    const body = typeof req.body?.body === 'string' ? req.body.body : null;
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
          .filter((attachment: unknown): attachment is { targetType: TargetType; targetId: string; momentId?: string | null; previewText?: string | null } =>
            typeof attachment === 'object'
            && attachment !== null
            && typeof (attachment as any).targetType === 'string'
            && typeof (attachment as any).targetId === 'string'
          )
      : [];

    const message = await createChatMessage({
      conversationId,
      senderUserId: req.authUserId!,
      body,
      attachments,
    });

    await prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.authUserId!,
        },
      },
      data: {
        lastReadAt: message.createdAt,
      },
    });

    res.status(201).json({ message: mapChatMessageForClient(message) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/chat/conversations/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const conversationId = String(req.params.id ?? '').trim();
    await prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.authUserId!,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/reports', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      targetType,
      targetId,
      targetUserId,
      reason,
      details,
    } = req.body as {
      targetType?: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION';
      targetId?: string;
      targetUserId?: string;
      reason?: string;
      details?: string;
    };

    const allowedTargetTypes = new Set(['PROFILE', 'MOMENT', 'PLACE', 'PLACE_VISIT', 'COLLECTION']);
    if (!targetType || !allowedTargetTypes.has(targetType) || !targetId || !reason?.trim()) {
      res.status(400).json({ error: 'targetType, targetId, and reason are required' });
      return;
    }

    const report = await prisma.userReport.create({
      data: {
        reporterId: req.authUserId!,
        targetType,
        targetId,
        targetUserId: targetUserId ?? null,
        reason: reason.trim(),
        details: details?.trim() || null,
      },
    });

    res.status(201).json({ ok: true, reportId: report.id });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/users/:id/block', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetUserId = req.params.id;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;

    if (!targetUserId || targetUserId === req.authUserId) {
      res.status(400).json({ error: 'A different target user is required' });
      return;
    }

    await prisma.userBlock.upsert({
      where: {
        sourceUserId_targetUserId: {
          sourceUserId: req.authUserId!,
          targetUserId,
        },
      },
      update: { reason },
      create: {
        sourceUserId: req.authUserId!,
        targetUserId,
        reason,
      },
    });

    await prisma.follow.deleteMany({
      where: {
        OR: [
          {
            sourceUserId: req.authUserId!,
            targetUserId,
          },
          {
            sourceUserId: targetUserId,
            targetUserId: req.authUserId!,
          },
        ],
      },
    });

    res.json({ ok: true, blockedUserId: targetUserId });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/users/:id/block', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetUserId = req.params.id;

    if (!targetUserId || targetUserId === req.authUserId) {
      res.status(400).json({ error: 'A different target user is required' });
      return;
    }

    await prisma.userBlock.deleteMany({
      where: {
        sourceUserId: req.authUserId!,
        targetUserId,
      },
    });

    res.json({ ok: true, blockedUserId: targetUserId });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/users/blocks', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: {
        sourceUserId: req.authUserId!,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        targetUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      users: blocks.map((block) => ({
        id: block.targetUser.id,
        username: block.targetUser.username,
        displayName: block.targetUser.displayName,
        avatar: block.targetUser.avatarUrl,
        blockedAt: block.createdAt.toISOString(),
        reason: block.reason ?? null,
      })),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/vibins/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      targetType,
      targetId,
      receiverUserId,
      momentId,
    } = req.body as {
      targetType?: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION';
      targetId?: string;
      receiverUserId?: string;
      momentId?: string;
    };

    if (!targetType || !targetId) {
      res.status(400).json({ error: 'targetType and targetId are required' });
      return;
    }

    const resolvedReceiverUserId = receiverUserId ?? await resolveTargetOwner(targetType, targetId);
    const impactedPlaceId = await resolveTargetPlaceId(targetType, targetId);

    const existing = await prisma.vibin.findFirst({
      where: {
        senderUserId: req.authUserId!,
        targetType,
        targetId,
      },
    });

    if (existing) {
      await prisma.vibin.delete({
        where: { id: existing.id },
      });
      await runRecommendationWriteback({
        userId: req.authUserId!,
        placeIds: impactedPlaceId ? [impactedPlaceId] : [],
        travelerIds: resolvedReceiverUserId ? [resolvedReceiverUserId] : [],
      });
      const count = await prisma.vibin.count({
        where: { targetType, targetId },
      });
      res.json({ active: false, count });
      return;
    }

    await prisma.vibin.create({
      data: {
        senderUserId: req.authUserId!,
        receiverUserId: resolvedReceiverUserId ?? null,
        momentId: momentId ?? null,
        targetType,
        targetId,
      },
    });

    if (resolvedReceiverUserId && resolvedReceiverUserId !== req.authUserId) {
      const actor = await prisma.user.findUnique({
        where: { id: req.authUserId! },
        select: { username: true, displayName: true },
      });

      if (actor) {
        await createNotification({
          userId: resolvedReceiverUserId,
          actorUserId: req.authUserId!,
          type: 'VIBIN',
          targetType,
          targetId,
          title: `${actor.displayName ?? actor.username} sent vibin`,
          body: targetType === 'PROFILE' ? 'Someone vibed with your profile.' : 'Someone vibed with one of your moments or places.',
        });
      }
    }

    const count = await prisma.vibin.count({
      where: { targetType, targetId },
    });
    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: impactedPlaceId ? [impactedPlaceId] : [],
      travelerIds: resolvedReceiverUserId ? [resolvedReceiverUserId] : [],
    });

    res.json({ active: true, count });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetType = String(req.query.targetType ?? '');
    const targetId = String(req.query.targetId ?? '');

    if (!targetType || !targetId) {
      res.status(400).json({ error: 'targetType and targetId are required' });
      return;
    }

    const blockedUsers = await prisma.userBlock.findMany({
      where: {
        sourceUserId: req.authUserId!,
      },
      select: {
        targetUserId: true,
      },
    });
    const blockedUserIds = blockedUsers.map((item) => item.targetUserId);

    const comments = await prisma.comment.findMany({
      where: {
        targetType: targetType as 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION',
        targetId,
        ...(blockedUserIds.length > 0
          ? {
              userId: {
                notIn: blockedUserIds,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
      },
    });

    res.json({
      comments: comments.map((comment) => ({
        id: comment.id,
        user: comment.user.username,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      targetType,
      targetId,
      body,
      momentId,
    } = req.body as {
      targetType?: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION';
      targetId?: string;
      body?: string;
      momentId?: string;
    };

    if (!targetType || !targetId || !body?.trim()) {
      res.status(400).json({ error: 'targetType, targetId, and body are required' });
      return;
    }

    const comment = await prisma.comment.create({
      data: {
        userId: req.authUserId!,
        targetType,
        targetId,
        body: body.trim(),
        momentId: momentId ?? null,
      },
      include: {
        user: true,
      },
    });

    const count = await prisma.comment.count({
      where: { targetType, targetId },
    });

    const notificationUserId = targetType === 'PROFILE'
      ? (targetId !== req.authUserId ? targetId : null)
      : await resolveTargetOwner(targetType, targetId);
    const impactedPlaceId = await resolveTargetPlaceId(targetType, targetId);

    if (notificationUserId && notificationUserId !== req.authUserId) {
      await createNotification({
        userId: notificationUserId,
        actorUserId: req.authUserId!,
        type: 'COMMENT',
        targetType,
        targetId,
        title: `${comment.user.displayName ?? comment.user.username} commented`,
        body: comment.body,
      });
    }

    if (
      targetType === 'MOMENT'
      && notificationUserId
      && notificationUserId !== req.authUserId
    ) {
      const friendshipState = await resolveFriendshipStatusForUsers(req.authUserId!, notificationUserId);
      if (friendshipState.status === 'accepted') {
        const conversation = await ensureDirectConversation(req.authUserId!, notificationUserId);
        const existingMirror = await prisma.chatMessage.findFirst({
          where: {
            conversationId: conversation.id,
            senderUserId: req.authUserId!,
            body: comment.body.trim(),
            attachments: {
              some: {
                targetType: 'MOMENT',
                targetId,
              },
            },
          },
          select: { id: true },
        });

        if (!existingMirror) {
          await createChatMessage({
            conversationId: conversation.id,
            senderUserId: req.authUserId!,
            kind: 'moment_comment',
            body: comment.body.trim(),
            attachments: [
              {
                targetType: 'MOMENT',
                targetId,
                momentId: momentId ?? targetId,
                previewText: 'Commented on your post',
              },
            ],
          });
        }
      }
    }

    await runRecommendationWriteback({
      userId: req.authUserId!,
      placeIds: impactedPlaceId ? [impactedPlaceId] : [],
      travelerIds: notificationUserId ? [notificationUserId] : [],
    });

    res.json({
      comment: {
        id: comment.id,
        user: comment.user.username,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      },
      count,
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/lookups/travelers', (_, res) => {
  res.json({ travelers: SIMILAR_TRAVELERS });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
