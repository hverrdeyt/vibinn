import express from 'express';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { cert, getApps, initializeApp as initializeFirebaseAdminApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Prisma } from '@prisma/client';
import { MOCK_PLACES, SIMILAR_TRAVELERS } from '../src/mockData';
import { prisma } from './prisma';
import { generateAiCompatibilityAssessment, generatePlaceAiEnrichment } from './placeEnrichment';
import { generateTravelerProfileDescriptor, queueTravelerProfileDescriptorRefresh } from './travelerProfileEnrichment';
import {
  createCollection,
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
  type: 'PLACE_MATCH' | 'TRAVELER_OVERLAP' | 'COMMENT' | 'VIBIN' | 'FOLLOW' | 'SYSTEM';
  targetType?: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION' | null;
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

async function fetchGooglePlaceSuggestions(input: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Google Places autocomplete failed with ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
  }

  const data = await response.json() as {
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  return data.suggestions
    ?.map((item) => item.placePrediction)
    .filter(Boolean)
    .slice(0, 6) ?? [];
}

async function fetchGoogleTextSearch(textQuery: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.priceLevel,places.photos',
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
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      primaryType?: string;
      types?: string[];
      rating?: number;
      priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
      photos?: Array<{ name: string }>;
    }>;
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
              priceRange: '$$',
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

const INITIAL_LOCATION_FALLBACKS = [
  { id: 'kyoto', label: 'Kyoto', type: 'city' as const },
  { id: 'paris', label: 'Paris', type: 'city' as const },
  { id: 'massachusetts', label: 'Massachusetts', type: 'province' as const },
  { id: 'indonesia', label: 'Indonesia', type: 'country' as const },
  { id: 'new-york', label: 'New York', type: 'city' as const },
  { id: 'bali', label: 'Bali', type: 'province' as const },
  { id: 'bandung', label: 'Bandung', type: 'city' as const },
  { id: 'jakarta', label: 'Jakarta', type: 'city' as const },
  { id: 'tokyo', label: 'Tokyo', type: 'city' as const },
  { id: 'boston', label: 'Boston', type: 'city' as const },
  { id: 'seoul', label: 'Seoul', type: 'city' as const },
  { id: 'singapore', label: 'Singapore', type: 'country' as const },
  { id: 'bangkok', label: 'Bangkok', type: 'city' as const },
  { id: 'barcelona', label: 'Barcelona', type: 'city' as const },
  { id: 'berlin', label: 'Berlin', type: 'city' as const },
  { id: 'buenos-aires', label: 'Buenos Aires', type: 'city' as const },
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

  const googlePredictions = await fetchGooglePlaceSuggestions(normalizedInput).catch((error) => {
    console.error(error);
    return null;
  });

  if (googlePredictions && googlePredictions.length > 0) {
    const locations = googlePredictions
      .filter((prediction) => {
        const types = [prediction.primaryType, ...(prediction.types ?? [])].filter(Boolean) as string[];
        return types.some((type) => LOCATION_TYPES.has(type));
      })
      .map((prediction) => ({
        id: prediction.placeId,
        label: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? 'Unnamed location',
        type: mapGoogleLocationType(prediction.primaryType ?? prediction.types?.[0]),
        googlePlaceId: prediction.placeId,
      }));

    if (locations.length > 0) {
      const fallbackLocations = getFallbackLocationSuggestions(normalizedInput);
      const merged = [...locations];
      const seen = new Set(locations.map((location) => location.label.toLowerCase()));

      for (const location of fallbackLocations) {
        const key = location.label.toLowerCase();
        if (!seen.has(key)) {
          merged.push(location);
          seen.add(key);
        }
      }

      return merged.slice(0, 8);
    }
  }

  const searchResults = await fetchGoogleTextSearch(normalizedInput).catch((error) => {
    console.error(error);
    return null;
  });

  if (searchResults?.places?.length) {
    const locations = searchResults.places
      .filter((place) => {
        const types = [place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[];
        return types.some((type) => LOCATION_TYPES.has(type));
      })
      .slice(0, 8)
      .map((place) => ({
        id: place.id,
        label: place.displayName?.text ?? 'Unnamed location',
        type: mapGoogleLocationType(place.primaryType ?? place.types?.[0]),
        googlePlaceId: place.id,
      }));

    if (locations.length > 0) {
      const fallbackLocations = getFallbackLocationSuggestions(normalizedInput);
      const merged = [...locations];
      const seen = new Set(locations.map((location) => location.label.toLowerCase()));

      for (const location of fallbackLocations) {
        const key = location.label.toLowerCase();
        if (!seen.has(key)) {
          merged.push(location);
          seen.add(key);
        }
      }

      return merged.slice(0, 8);
    }
  }

  return getFallbackLocationSuggestions(normalizedInput);
}

async function mapGoogleSearchPlaceToInternalPlace(rawPlace: {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  photos?: Array<{ name: string }>;
}, options?: {
  queryContext?: string;
}) {
  const details = await fetchGooglePlaceDetails(rawPlace.id).catch((error) => {
    console.error('Google Place Details enrichment failed during place import', {
      googlePlaceId: rawPlace.id,
      queryContext: options?.queryContext ?? null,
      error,
    });
    return null;
  });

  const effectiveDisplayName = details?.displayName?.text ?? rawPlace.displayName?.text ?? 'Unnamed place';
  const effectiveAddress = details?.formattedAddress ?? rawPlace.formattedAddress;
  const effectiveLocation = details?.location ?? rawPlace.location;
  const effectivePrimaryType = details?.primaryType ?? rawPlace.primaryType;
  const effectiveTypes = details?.types ?? rawPlace.types;
  const effectiveRating = details?.rating ?? rawPlace.rating ?? null;
  const effectivePriceLevel = mapGooglePriceLevel(details?.priceLevel ?? rawPlace.priceLevel);
  const effectivePhotoRefs = details?.photos ?? rawPlace.photos ?? [];
  const locationBits = parseLocationBits(effectiveAddress);
  const category = (effectivePrimaryType ?? effectiveTypes?.[0] ?? 'recommended spot').replace(/_/g, ' ');
  const photoUris = effectivePhotoRefs.length
    ? await fetchGooglePhotoUris(effectivePhotoRefs.map((photo) => photo.name), 5).catch((error) => {
        console.error(error);
        return [];
      })
    : [];
  const photoUri = photoUris[0] ?? null;

  const place = await prisma.place.upsert({
    where: { googlePlaceId: rawPlace.id },
    update: {
      name: effectiveDisplayName,
      address: effectiveAddress,
      city: locationBits.city,
      country: locationBits.country,
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      rating: effectiveRating,
      priceLevel: effectivePriceLevel,
      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: details?.googleMapsUri ?? undefined,
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
      latitude: effectiveLocation?.latitude ?? null,
      longitude: effectiveLocation?.longitude ?? null,
      category,
      rating: effectiveRating,
      priceLevel: effectivePriceLevel,
      primaryImageUrl: photoUri ?? undefined,
      mapsEmbedUrl: details?.googleMapsUri ?? null,
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
    googlePlaceId: rawPlace.id,
    source: 'TEXT_SEARCH',
    queryContext: options?.queryContext ?? null,
    payload: rawPlace,
  });

  if (details) {
    await persistGooglePlaceSnapshot({
      placeId: place.id,
      googlePlaceId: details.id,
      source: 'PLACE_DETAILS',
      payload: details,
      queryContext: options?.queryContext ?? null,
    });
  }

  return {
    id: place.id,
    name: effectiveDisplayName,
    location: [locationBits.city, locationBits.country].filter(Boolean).join(', ') || effectiveAddress || 'Unknown location',
    description: '',
    image: photoUri ?? place.primaryImageUrl ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
    images: photoUris.length > 0 ? photoUris : [place.primaryImageUrl ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place'],
    tags: (effectiveTypes?.slice(0, 3).map((type) => type.replace(/_/g, ' ')) ?? [category]).slice(0, 3),
    similarityStat: 82,
    whyYoullLikeIt: [],
    priceRange: mapPriceLevel(mapGooglePriceLevel(rawPlace.priceLevel)),
    category,
  };
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

function buildPreferenceDrivenQueries(
  locationLabel: string,
  locationType: string | undefined,
  selectedInterests: string[],
  selectedVibe?: string | null,
) {
  const locationQueries =
    locationType === 'country'
      ? [
          `top travel spots in ${locationLabel}`,
          `best cultural places in ${locationLabel}`,
          `hidden gems in ${locationLabel}`,
        ]
      : locationType === 'province'
        ? [
            `best places to visit in ${locationLabel}`,
            `hidden gems in ${locationLabel}`,
            `best cafes and viewpoints in ${locationLabel}`,
          ]
        : [
            `best places to visit in ${locationLabel}`,
            `hidden gems in ${locationLabel}`,
          ];

  const interestQueries = selectedInterests.flatMap((interest) => {
    switch (interest) {
      case 'good_coffee':
        return [
          `best coffee in ${locationLabel}`,
          `specialty coffee in ${locationLabel}`,
          `good espresso bar in ${locationLabel}`,
        ];
      case 'aesthetic_cafes':
        return [
          `aesthetic cafe in ${locationLabel}`,
          `cute cafe in ${locationLabel}`,
          `instagrammable cafe in ${locationLabel}`,
        ];
      case 'desserts_sweet_treats':
        return [
          `best desserts in ${locationLabel}`,
          `sweet treats in ${locationLabel}`,
          `dessert cafe in ${locationLabel}`,
        ];
      case 'street_food_casual_eats':
        return [
          `best casual eats in ${locationLabel}`,
          `street food in ${locationLabel}`,
          `cheap eats in ${locationLabel}`,
        ];
      case 'asian_comfort_food':
        return [
          `best ramen in ${locationLabel}`,
          `best sushi in ${locationLabel}`,
          `asian comfort food in ${locationLabel}`,
        ];
      case 'drinks_nightlife':
        return [
          `best bars in ${locationLabel}`,
          `nightlife in ${locationLabel}`,
          `cocktail bar in ${locationLabel}`,
        ];
      case 'shop_stroll':
        return [
          `best local boutiques in ${locationLabel}`,
          `shopping streets in ${locationLabel}`,
          `best area to walk and shop in ${locationLabel}`,
        ];
      case 'fun_activities':
        return [
          `fun things to do in ${locationLabel}`,
          `cool activities in ${locationLabel}`,
          `unique places to visit in ${locationLabel}`,
        ];
      case 'parks_outdoor':
        return [
          `best parks in ${locationLabel}`,
          `best outdoor spots in ${locationLabel}`,
          `scenic walk in ${locationLabel}`,
        ];
      case 'nature':
        return [
          `best parks in ${locationLabel}`,
          `nature spots in ${locationLabel}`,
          `scenic walks in ${locationLabel}`,
        ];
      case 'cafe':
        return [
          `best cafes in ${locationLabel}`,
          `aesthetic cafes in ${locationLabel}`,
          `specialty coffee in ${locationLabel}`,
        ];
      case 'culture':
        return [
          `best cultural spots in ${locationLabel}`,
          `art museums in ${locationLabel}`,
          `historic districts in ${locationLabel}`,
        ];
      case 'shopping':
        return [
          `best concept stores in ${locationLabel}`,
          `local markets in ${locationLabel}`,
          `shopping streets in ${locationLabel}`,
        ];
      case 'party':
        return [
          `best nightlife in ${locationLabel}`,
          `live music bars in ${locationLabel}`,
          `cocktail bars in ${locationLabel}`,
        ];
      case 'adventure':
        return [
          `outdoor activities in ${locationLabel}`,
          `hikes near ${locationLabel}`,
          `adventure spots in ${locationLabel}`,
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
              `aesthetic places in ${locationLabel}`,
              `design spots in ${locationLabel}`,
            ];
          case 'solo':
            return [
              `quiet places in ${locationLabel}`,
              `solo friendly spots in ${locationLabel}`,
            ];
          case 'luxury':
            return [
              `luxury experiences in ${locationLabel}`,
              `high end places in ${locationLabel}`,
            ];
          case 'budget':
            return [
              `budget friendly places in ${locationLabel}`,
              `cheap hidden gems in ${locationLabel}`,
            ];
          case 'spontaneous':
            return [
              `walkable spots in ${locationLabel}`,
              `easy last minute plans in ${locationLabel}`,
            ];
          default:
            return [];
        }
      })()
    : [];

  return dedupeQueries([
    ...interestQueries,
    ...vibeQueries,
    ...locationQueries,
  ]).slice(0, 12);
}

async function getDiscoveryPlacesByLocation(
  locationLabel: string,
  locationType?: string,
  selectedInterests: string[] = [],
  selectedVibe?: string | null,
) {
  const queries = buildPreferenceDrivenQueries(locationLabel, locationType, selectedInterests, selectedVibe);

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

  if (relevantPlaces.length > 0) {
    const mappedPlaces = await Promise.all(
      relevantPlaces.slice(0, 36).map((place) =>
        mapGoogleSearchPlaceToInternalPlace(place, {
          queryContext: queries.join(' | '),
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
  };
}>) {
  const image = place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place';
  const tags = buildDeterministicDiscoveryTags({
    category: place.category,
    rating: place.rating ?? null,
    priceLevel: place.priceLevel ?? null,
  });
  const category = normalizePlaceCategory(place.category, tags);
  return {
    id: place.id,
    name: place.name,
    location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
    address: place.address ?? undefined,
    description: place.aiEnrichment?.description ?? '',
    hook: place.aiEnrichment?.hook ?? '',
    image,
    images: place.media.length > 0 ? place.media.map((item) => item.url) : [image],
    tags,
    attitudeLabel: place.aiEnrichment?.attitudeLabel ?? undefined,
    bestTime: place.aiEnrichment?.bestTime ?? undefined,
    similarityStat: 82,
    whyYoullLikeIt: [
      ...(place.aiEnrichment?.description ? [place.aiEnrichment.description] : []),
      ...(place.aiEnrichment?.bestTime ? [`best at ${place.aiEnrichment.bestTime}`] : []),
    ],
    rating: place.rating ?? undefined,
    priceRange: mapPriceLevel(place.priceLevel),
    category,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
  };
}

async function getCachedDiscoveryPlacesByLocation(locationLabel: string, locationType?: string) {
  const places = await prisma.place.findMany({
    where: buildLocationWhere(locationLabel, locationType),
    include: {
      aiEnrichment: true,
      media: {
        orderBy: { sortOrder: 'asc' },
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
    similarityStat: place.similarityStat ?? 0,
    whyYoullLikeIt: place.whyYoullLikeIt ?? [],
    rating: 0,
    priceRange: place.priceRange ?? '',
    category,
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
          return [{
            ...place,
            _preferenceAffinity: getPlacePreferenceAffinity(
              {
                tags: place.tags,
                category: place.category,
                hook: place.hook,
                description: place.description,
                whyYoullLikeIt: place.whyYoullLikeIt,
              },
              {
                selectedInterests,
                selectedVibe,
              },
            ),
            similarityStat: shouldUsePersistedScores
              ? (persistedScoreMap.get(place.id) ?? computeRecommendationScore(
                  {
                    id: place.id,
                    tags: place.tags,
                    category: place.category,
                    similarityStat: place.similarityStat,
                    rating: typeof place.rating === 'number' ? place.rating : null,
                    hook: place.hook,
                    description: place.description,
                    whyYoullLikeIt: place.whyYoullLikeIt,
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
                ))
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
    .map(({ _preferenceAffinity, ...place }) => place);

  if (OPENAI_API_KEY && page === 1) {
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

  if (options.userId && OPENAI_API_KEY && page === 1) {
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
    pagination: {
      page,
      limit,
      total: rankedPlaces.length,
      hasMore: start + limit < rankedPlaces.length,
    },
  };
}

async function fetchGooglePlaceDetails(googlePlaceId: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const response = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,primaryType,types,rating,priceLevel,googleMapsUri,regularOpeningHours.weekdayDescriptions,photos',
    },
  });

  if (!response.ok) {
    throw new Error(`Google Place Details failed with ${response.status}`);
  }

  return response.json() as Promise<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    primaryType?: string;
    types?: string[];
    rating?: number;
    googleMapsUri?: string;
    regularOpeningHours?: {
      weekdayDescriptions?: string[];
    };
    priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
    photos?: Array<{
      name: string;
    }>;
  }>;
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
  if (!OPENAI_API_KEY) return null;

  const existingTask = placeEnrichmentInflight.get(placeId);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: { aiEnrichment: true },
    });

    if (!place) return null;

    if (place.aiEnrichment?.hook && place.aiEnrichment.vibeTags.length > 0) {
      return place.aiEnrichment;
    }

    const generated = await generatePlaceAiEnrichment({
      id: place.id,
      name: place.name,
      address: place.address,
      city: place.city,
      country: place.country,
      category: place.category,
      rating: place.rating,
      priceLevel: place.priceLevel,
    });

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

function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
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
  for (const interest of input.selectedInterests) {
    const matchers = PLACE_INTEREST_MATCHERS[interest] ?? [normalizeKeyword(interest)];
    if (matchesAnyMatcher(matchers)) {
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
  if (score >= 85) return 'Must visit';
  if (score >= 70) return 'Fits you';
  if (score >= 55) return 'Worth a look';
  return 'Maybe';
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
  if (!OPENAI_API_KEY || input.places.length === 0) {
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
  const similarityStat = persistedScore?.similarityPercentage
    ?? persistedScore?.matchScore
    ?? (
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
    await ensurePlaceAiEnrichment(place.id);
    place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        aiEnrichment: true,
        media: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!place) return null;
  }

  if (!place.googlePlaceId) {
    return {
      id: place.id,
      name: place.name,
      location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
      description: place.aiEnrichment?.description ?? '',
      hook: place.aiEnrichment?.hook ?? '',
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
      openingHours: undefined,
      mapsUrl: place.latitude && place.longitude
        ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
        : place.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`
          : undefined,
      latitude: place.latitude ?? undefined,
      longitude: place.longitude ?? undefined,
      priceRange: mapPriceLevel(place.priceLevel),
      category: place.category,
    };
  }

  const details = await fetchGooglePlaceDetails(place.googlePlaceId).catch((error) => {
    console.error(error);
    return null;
  });

  if (details) {
    const photoUris = details.photos?.length
      ? await fetchGooglePhotoUris(details.photos.map((photo) => photo.name)).catch((error) => {
          console.error(error);
          return [];
        })
      : [];
    const photoUri = photoUris[0] ?? null;
    const locationBits = parseLocationBits(details.formattedAddress);
    const updated = await prisma.place.update({
      where: { id: place.id },
      data: {
        name: details.displayName?.text ?? place.name,
        address: details.formattedAddress ?? place.address,
        city: locationBits.city,
        country: locationBits.country,
        latitude: details.location?.latitude ?? place.latitude,
        longitude: details.location?.longitude ?? place.longitude,
        category: details.primaryType?.replace(/_/g, ' ') ?? place.category,
        rating: details.rating ?? place.rating,
        priceLevel: mapGooglePriceLevel(details.priceLevel) ?? place.priceLevel,
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
      },
    });
    const finalPlace = enriched ?? updated;

    return {
      id: finalPlace.id,
      name: finalPlace.name,
      location: [finalPlace.city, finalPlace.country].filter(Boolean).join(', ') || finalPlace.address || 'Unknown location',
      description: finalPlace.aiEnrichment?.description ?? '',
      hook: finalPlace.aiEnrichment?.hook ?? '',
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
      openingHours: details.regularOpeningHours?.weekdayDescriptions ?? undefined,
      mapsUrl: details.googleMapsUri ?? (finalPlace.latitude && finalPlace.longitude
        ? `https://www.google.com/maps/search/?api=1&query=${finalPlace.latitude},${finalPlace.longitude}`
        : finalPlace.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(finalPlace.address)}`
          : undefined),
      latitude: finalPlace.latitude ?? undefined,
      longitude: finalPlace.longitude ?? undefined,
      priceRange: mapPriceLevel(finalPlace.priceLevel),
      category: finalPlace.category,
    };
  }

  return {
    id: place.id,
    name: place.name,
    location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
    description: place.aiEnrichment?.description ?? '',
    hook: place.aiEnrichment?.hook ?? '',
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
    openingHours: undefined,
    mapsUrl: place.latitude && place.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
      : place.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`
        : undefined,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
    priceRange: mapPriceLevel(place.priceLevel),
    category: place.category,
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

async function getTodayRecommendationForUser(input: {
  userId: string;
  locationLabel: string;
  locationType?: string;
  latitude: number;
  longitude: number;
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
      const score = persisted?.score ?? computeRecommendationScore(
        {
          id: mappedPlace.id,
          tags: mappedPlace.tags,
          category: mappedPlace.category,
          similarityStat: mappedPlace.similarityStat,
          rating: typeof mappedPlace.rating === 'number' ? mappedPlace.rating : null,
          hook: mappedPlace.hook,
          description: mappedPlace.description,
          whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
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

app.get('/api/moments', requireAuth, (req: AuthenticatedRequest, res) => {
  void getMoments(req.authUserId)
    .then((moments) => res.json({ moments }))
    .catch((error) => handleError(res, error));
});

app.post('/api/moments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const moment = await createMoment(req.authUserId, req.body);
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
  void (
    req.authUserId
      ? refreshUserPlaceScores(req.authUserId, [req.params.id]).catch(() => {})
      : Promise.resolve()
  )
    .then(() => getUnifiedPlaceDetailPayload(req.params.id, req.authUserId))
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
  void (
    req.authUserId
      ? refreshUserPlaceScores(req.authUserId, [req.params.id]).catch(() => {})
      : Promise.resolve()
  )
    .then(() => getUnifiedPlaceDetailPayload(req.params.id, req.authUserId))
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
          allowedClassifications: ['Must visit', 'Fits you'],
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
        const score = persisted?.score ?? computeRecommendationScore(
          {
            id: mappedPlace.id,
            tags: mappedPlace.tags,
            category: mappedPlace.category,
            similarityStat: mappedPlace.similarityStat,
            rating: typeof mappedPlace.rating === 'number' ? mappedPlace.rating : null,
            hook: mappedPlace.hook,
            description: mappedPlace.description,
            whyYoullLikeIt: mappedPlace.whyYoullLikeIt,
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
        allowedClassifications: ['Must visit', 'Fits you'],
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
