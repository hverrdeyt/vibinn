import type { Place as PrismaPlace, Prisma, PrismaClient } from '@prisma/client';
import { findPlaceById, findTravelerById, store, type MomentRecord } from './store';
import { prisma, withPrismaFallback } from './prisma';

const supportFaqs = [
  'How do bookmarks affect my recommendations?',
  'How do vibin and follows change what I see?',
  'Can I keep moments private?',
];

type PlaceWithRelations = PrismaPlace & {
  aiEnrichment: {
    hook: string;
    description: string | null;
    vibeTags: string[];
    attitudeLabel: string | null;
    bestTime: string | null;
  } | null;
  media: Array<{
    url: string;
    mediaType: string;
    sortOrder: number;
  }>;
};

type MomentWithRelations = Prisma.MomentGetPayload<{
  include: {
    place: {
      include: {
        aiEnrichment: true;
        media: {
          orderBy: {
            sortOrder: 'asc';
          };
        };
      };
    };
    media: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
  };
}>;

function mapVisibility(value: 'public' | 'private' | 'followers') {
  return value.toUpperCase() as 'PUBLIC' | 'PRIVATE' | 'FOLLOWERS';
}

function mapVisitType(value: MomentRecord['visitType']) {
  return value.toUpperCase() as 'SOLO' | 'COUPLE' | 'FRIENDS' | 'FAMILY';
}

function mapTimeOfDay(value: MomentRecord['timeOfDay']) {
  return value.toUpperCase() as 'MORNING' | 'AFTERNOON' | 'SUNSET' | 'NIGHT';
}

function mapRevisit(value: MomentRecord['wouldRevisit']) {
  if (value === 'not_sure') return 'NOT_SURE';
  if (value === 'not_interested') return 'NOT_INTERESTED';
  return 'YES';
}

function mapPriceLevel(value?: number | null) {
  if (!value || value <= 0) return 'Free';
  return '$'.repeat(Math.min(value, 4));
}

function mapPlaceForClient(place: PlaceWithRelations) {
  return {
    id: place.id,
    name: place.name,
    location: [place.city, place.country].filter(Boolean).join(', ') || place.address || 'Unknown location',
    description: place.aiEnrichment?.description ?? '',
    hook: place.aiEnrichment?.hook ?? '',
    image: place.primaryImageUrl ?? place.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
    images: place.media.map((item) => item.url),
    tags: place.aiEnrichment?.vibeTags.length ? place.aiEnrichment.vibeTags : [place.category].filter(Boolean),
    attitudeLabel: place.aiEnrichment?.attitudeLabel ?? undefined,
    bestTime: place.aiEnrichment?.bestTime ?? undefined,
    similarityStat: 82,
    whyYoullLikeIt: [
      ...(place.aiEnrichment?.description ? [place.aiEnrichment.description] : []),
      ...(place.aiEnrichment?.bestTime ? [`best at ${place.aiEnrichment.bestTime}`] : []),
    ],
    priceRange: mapPriceLevel(place.priceLevel),
    category: place.category,
  };
}

type ClientPlace = ReturnType<typeof mapPlaceForClient> & {
  momentId?: string;
  ownerUserId?: string;
  visitedDate?: string;
};

function mapMomentForClient(moment: MomentWithRelations) {
  return {
    id: moment.id,
    placeId: moment.placeId,
    visitedDate: moment.visitedAt.toISOString().split('T')[0],
    caption: moment.caption,
    uploadedMedia: moment.media.map((item) => item.url),
    rating: moment.rating,
    budgetLevel: moment.budgetLevel as '$' | '$$' | '$$$',
    visitType: moment.visitType.toLowerCase() as MomentRecord['visitType'],
    timeOfDay: moment.timeOfDay.toLowerCase() as MomentRecord['timeOfDay'],
    privacy: moment.privacy.toLowerCase() as MomentRecord['privacy'],
    wouldRevisit:
      moment.wouldRevisit === 'NOT_SURE'
        ? 'not_sure'
        : moment.wouldRevisit === 'NOT_INTERESTED'
          ? 'not_interested'
          : 'yes',
    vibeTags: moment.vibeTags,
    place: mapPlaceForClient(moment.place),
  };
}

function buildTravelHistory(
  moments: Array<{ id: string; visitedDate: string; uploadedMedia: string[]; place: ReturnType<typeof mapPlaceForClient> }>,
  ownerUserId: string,
) {
  const grouped = new Map<string, { country: string; cities: Set<string>; places: ClientPlace[] }>();

  for (const moment of moments) {
    const [city = 'Unknown city', country = 'Unknown country'] = moment.place.location.split(',').map((part) => part.trim());
    const existing = grouped.get(country) ?? { country, cities: new Set<string>(), places: [] };
    existing.cities.add(city);
    if (!existing.places.some((item) => item.id === moment.place.id && item.momentId === moment.id)) {
      const mediaImages = moment.uploadedMedia.length > 0 ? moment.uploadedMedia : moment.place.images;
      existing.places.push({
        ...moment.place,
        image: mediaImages[0] ?? moment.place.image,
        images: mediaImages.length > 0 ? mediaImages : moment.place.images,
        momentId: moment.id,
        ownerUserId,
        visitedDate: moment.visitedDate,
      });
    }
    grouped.set(country, existing);
  }

  return Array.from(grouped.values()).map((group) => ({
    country: group.country,
    cities: Array.from(group.cities),
    places: group.places,
  }));
}

function buildProfileUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  bio: string;
  avatarUrl: string;
  badges: Array<{ label: string }>;
  flags: Array<{ emoji: string }>;
}, moments: ReturnType<typeof mapMomentForClient>[]) {
  const travelHistory = buildTravelHistory(moments, user.id);
  const countries = new Set(travelHistory.map((item) => item.country)).size;
  const cities = new Set(travelHistory.flatMap((item) => item.cities)).size;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    bio: user.bio,
    avatar: user.avatarUrl,
    badges: user.badges.map((item) => item.label),
    flags: user.flags.map((item) => item.emoji),
    stats: {
      countries,
      cities,
      trips: moments.length,
    },
    travelHistory,
  };
}

function buildProfileUserWithMatch(
  user: {
    id: string;
    username: string;
    displayName: string | null;
    bio: string;
    avatarUrl: string;
    badges: Array<{ label: string }>;
    flags: Array<{ emoji: string }>;
  },
  moments: ReturnType<typeof mapMomentForClient>[],
  matchScore?: number,
  extras?: {
    relevanceReason?: string;
    descriptor?: string;
    vibinCount?: number;
  },
) {
  return {
    ...buildProfileUser(user, moments),
    ...(typeof matchScore === 'number' ? { matchScore } : {}),
    ...(extras?.relevanceReason ? { relevanceReason: extras.relevanceReason } : {}),
    ...(extras?.descriptor ? { descriptor: extras.descriptor } : {}),
    ...(typeof extras?.vibinCount === 'number' ? { vibinCount: extras.vibinCount } : {}),
  };
}

async function getCurrentUser(client: PrismaClient, userId?: string) {
  const user = userId
    ? await client.user.findUnique({
        where: { id: userId },
      })
    : await client.user.findFirst({
        orderBy: { createdAt: 'asc' },
      });

  if (!user) {
    throw new Error('No user found in database');
  }

  return user;
}

export async function getProfileMe(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: currentUser.id },
    include: {
      badges: true,
      flags: true,
      moments: {
        orderBy: { createdAt: 'desc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
      collections: {
        orderBy: { createdAt: 'desc' },
        include: {
          places: {
            orderBy: { sortOrder: 'asc' },
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  const moments = user.moments.map(mapMomentForClient);

  return {
    user: buildProfileUserWithMatch(user, moments),
    collections: user.collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      places: collection.places.map((item) => mapPlaceForClient(item.place)),
    })),
    moments,
  };
}

export async function getPublicProfileByUsername(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      username: {
        equals: normalizedUsername,
        mode: 'insensitive',
      },
    },
    include: {
      badges: true,
      flags: true,
      moments: {
        orderBy: { createdAt: 'desc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
      collections: {
        orderBy: { createdAt: 'desc' },
        include: {
          places: {
            orderBy: { sortOrder: 'asc' },
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const moments = user.moments.map(mapMomentForClient);

  return {
    user: buildProfileUserWithMatch(user, moments),
    collections: user.collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      places: collection.places.map((item) => mapPlaceForClient(item.place)),
    })),
    moments,
  };
}

export async function updateProfile(userId: string | undefined, payload: { displayName?: string; username?: string; bio?: string; avatarUrl?: string }) {
  const currentUser = await getCurrentUser(prisma, userId);

  const updatedUser = await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      displayName: payload.displayName ?? currentUser.displayName,
      username: payload.username ?? currentUser.username,
      bio: payload.bio ?? currentUser.bio,
      avatarUrl: payload.avatarUrl ?? currentUser.avatarUrl,
    },
    include: {
      badges: true,
      flags: true,
      moments: {
        orderBy: { createdAt: 'desc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  return buildProfileUserWithMatch(updatedUser, updatedUser.moments.map(mapMomentForClient));
}

export async function getTravelerDiscovery(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);

  const [followedUsers, similarUsers, profileVibins] = await Promise.all([
    prisma.follow.findMany({
      where: { sourceUserId: currentUser.id },
      include: {
        targetUser: {
          include: {
            badges: true,
            flags: true,
            moments: {
              orderBy: { createdAt: 'desc' },
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
                media: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    }),
    prisma.travelerSimilarity.findMany({
      where: { userId: currentUser.id },
      include: {
        traveler: {
          include: {
            badges: true,
            flags: true,
            moments: {
              orderBy: { createdAt: 'desc' },
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
                media: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
      orderBy: { matchScore: 'desc' },
    }),
    prisma.vibin.groupBy({
      by: ['targetId'],
      where: {
        targetType: 'PROFILE',
      },
      _count: { _all: true },
    }),
  ]);

  const vibinMap = new Map(profileVibins.map((item) => [item.targetId, item._count._all]));
  const fallbackTravelers = similarUsers.length === 0
    ? await prisma.user.findMany({
        where: {
          id: { not: currentUser.id },
          moments: {
            some: {},
          },
        },
        include: {
          badges: true,
          flags: true,
          moments: {
            orderBy: { createdAt: 'desc' },
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 24,
      })
    : [];
  const fallbackTravelerIds = new Set(fallbackTravelers.map((traveler) => traveler.id));

  return {
    followedTravelers: followedUsers.map((item) =>
      buildProfileUserWithMatch(
        item.targetUser,
        item.targetUser.moments.map(mapMomentForClient),
        undefined,
        {
          vibinCount: vibinMap.get(item.targetUser.id) ?? 0,
        },
      ),
    ),
    similarTravelers: (
      similarUsers.length > 0
        ? similarUsers.map((item) => ({
            user: item.traveler,
            matchScore: item.matchScore,
            relevanceReason: item.relevanceReason,
          }))
        : fallbackTravelers
            .filter((traveler) => !followedUsers.some((follow) => follow.targetUser.id === traveler.id))
            .map((traveler, index) => ({
              user: traveler,
              matchScore: Math.max(58, 76 - index),
              relevanceReason: 'Community traveler worth exploring while your exact matches warm up.',
            }))
    ).map((item) =>
      buildProfileUserWithMatch(
        item.user,
        item.user.moments.map(mapMomentForClient),
        item.matchScore,
        {
          relevanceReason: item.relevanceReason,
          vibinCount: vibinMap.get(item.user.id) ?? 0,
          descriptor: similarUsers.length === 0 && fallbackTravelerIds.has(item.user.id) ? 'community traveler' : undefined,
        },
      ),
    ),
  };
}

export async function getTravelerProfile(travelerId: string, viewerUserId?: string) {
  const traveler = await prisma.user.findUnique({
    where: { id: travelerId },
    include: {
      badges: true,
      flags: true,
      moments: {
        orderBy: { createdAt: 'desc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  if (!traveler) return null;

  const [similarity, vibinCount] = await Promise.all([
    prisma.travelerSimilarity.findFirst({
      where: {
        travelerId,
        ...(viewerUserId ? { userId: viewerUserId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.vibin.count({
      where: {
        targetType: 'PROFILE',
        targetId: travelerId,
      },
    }),
  ]);

  return buildProfileUserWithMatch(
    traveler,
    traveler.moments.map(mapMomentForClient),
    similarity?.matchScore,
    {
      relevanceReason: similarity?.relevanceReason,
      vibinCount,
    },
  );
}

export async function getRelatedPlaces(placeId: string) {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      city: true,
      country: true,
      category: true,
    },
  });

  if (!place) return [];

  const related = await prisma.place.findMany({
    where: {
      id: { not: place.id },
      OR: [
        ...(place.city ? [{ city: place.city }] : []),
        ...(place.country ? [{ country: place.country }] : []),
        { category: place.category },
      ],
    },
    include: {
      aiEnrichment: true,
      media: { orderBy: { sortOrder: 'asc' } },
    },
    take: 6,
    orderBy: [
      { rating: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  return related.map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.primaryImageUrl ?? item.media[0]?.url ?? 'https://placehold.co/800x1000/111111/ffffff?text=Place',
  }));
}

export async function getPlaceTravelerMoments(placeId: string, userId?: string) {
  const moments = await prisma.moment.findMany({
    where: {
      placeId,
      ...(userId ? { userId: { not: userId } } : {}),
      privacy: 'PUBLIC',
    },
    orderBy: { visitedAt: 'desc' },
    take: 8,
    include: {
      user: true,
      media: {
        orderBy: { sortOrder: 'asc' },
      },
      place: {
        include: {
          media: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  return moments.map((moment, index) => {
    const primaryMedia = moment.media[0];
    const fallbackPlaceMedia = moment.place.media[0];
    const mediaUrl = primaryMedia?.url ?? fallbackPlaceMedia?.url ?? moment.place.primaryImageUrl ?? 'https://placehold.co/800x1000/111111/ffffff?text=Moment';
    const mediaType = primaryMedia?.mediaType?.startsWith('video') ? 'video' : 'image';

    return {
      id: moment.id,
      travelerUsername: moment.user.username,
      travelerAvatar: moment.user.avatarUrl,
      mediaUrl,
      mediaType: mediaType as 'image' | 'video',
      caption: moment.caption || (index % 2 === 0 ? 'saved this right after visiting' : 'caught the vibe here and posted the whole evening'),
    };
  });
}

export async function getNotifications(userId?: string) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await getCurrentUser(client, userId);
    const notifications = await client.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { actorUser: true },
    });

    return notifications.map((item) => ({
      id: item.id,
      type: item.targetType === 'PLACE' ? 'place' : 'traveler',
      avatar: item.actorUser?.avatarUrl ?? store.me.avatar,
      title: item.title,
      body: item.body,
      time: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
      place: item.targetType === 'PLACE' && item.targetId ? findPlaceById(item.targetId) : undefined,
      traveler: item.targetType === 'PROFILE' && item.actorUser
        ? {
            id: item.actorUser.id,
            username: item.actorUser.username,
            displayName: item.actorUser.displayName ?? item.actorUser.username,
            bio: item.actorUser.bio,
            avatar: item.actorUser.avatarUrl,
          }
        : undefined,
    }));
  });

  if (dbResult) return dbResult;

  return store.notifications.map((item) =>
    item.type === 'place'
      ? { ...item, place: findPlaceById(item.placeId) }
      : { ...item, traveler: findTravelerById(item.travelerId) },
  );
}

export async function getAccountSettings(userId?: string) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await getCurrentUser(client, userId);
    return {
      profileDetails: {
        displayName: user.displayName,
        username: user.username,
        bio: user.bio,
      },
      signIn: {
        email: user.email,
        providers: [user.authProvider.toLowerCase(), 'google'],
      },
    };
  });

  if (dbResult) return dbResult;

  return {
    profileDetails: {
      displayName: store.me.displayName,
      username: store.me.username,
      bio: store.me.bio,
    },
    signIn: {
      email: store.me.email,
      providers: ['manual', 'google'],
    },
  };
}

export async function getNotificationSettings(userId?: string) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await client.user.findUnique({
      where: { id: userId },
      include: { notificationPrefs: true },
    });
    return user?.notificationPrefs ?? null;
  });
  return dbResult ?? store.notificationSettings;
}

export async function updateNotificationSettings(userId: string | undefined, payload: { pushEnabled: boolean; emailEnabled: boolean; recommendationEnabled: boolean }) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await getCurrentUser(client, userId);
    return client.userNotificationSettings.upsert({
      where: { userId: user.id },
      update: payload,
      create: { userId: user.id, ...payload },
    });
  });

  if (dbResult) return dbResult;
  Object.assign(store.notificationSettings, payload);
  return store.notificationSettings;
}

export async function getPrivacySettings(userId?: string) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await client.user.findUnique({
      where: { id: userId },
      include: { privacySettings: true },
    });
    if (!user?.privacySettings) return null;
    return {
      profileVisibility: user.privacySettings.profileVisibility.toLowerCase(),
      momentVisibility: user.privacySettings.momentVisibility.toLowerCase(),
    };
  });

  return dbResult ?? store.privacySettings;
}

export async function updatePrivacySettings(userId: string | undefined, payload: { profileVisibility: 'public' | 'followers'; momentVisibility: 'public' | 'private' }) {
  const dbResult = await withPrismaFallback(async (client) => {
    const user = await getCurrentUser(client, userId);
    const updated = await client.userPrivacySettings.upsert({
      where: { userId: user.id },
      update: {
        profileVisibility: mapVisibility(payload.profileVisibility),
        momentVisibility: mapVisibility(payload.momentVisibility),
      },
      create: {
        userId: user.id,
        profileVisibility: mapVisibility(payload.profileVisibility),
        momentVisibility: mapVisibility(payload.momentVisibility),
      },
    });
    return {
      profileVisibility: updated.profileVisibility.toLowerCase(),
      momentVisibility: updated.momentVisibility.toLowerCase(),
    };
  });

  if (dbResult) return dbResult;
  Object.assign(store.privacySettings, payload);
  return store.privacySettings;
}

export async function getSupport() {
  return { faqs: supportFaqs };
}

export async function getCollections(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const collections = await prisma.collection.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'desc' },
    include: {
      places: {
        orderBy: { sortOrder: 'asc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  });

  return collections.map((collection) => ({
    id: collection.id,
    label: collection.title,
    places: collection.places.map((item) => mapPlaceForClient(item.place)),
  }));
}

export async function createCollection(userId: string | undefined, payload: { label: string; placeIds: string[] }) {
  const currentUser = await getCurrentUser(prisma, userId);
  const collection = await prisma.collection.create({
    data: {
      userId: currentUser.id,
      title: payload.label,
      places: {
        create: payload.placeIds.map((placeId, index) => ({
          placeId,
          sortOrder: index,
        })),
      },
    },
    include: {
      places: {
        orderBy: { sortOrder: 'asc' },
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  });

  return {
    id: collection.id,
    label: collection.title,
    places: collection.places.map((item) => mapPlaceForClient(item.place)),
  };
}

export async function getBookmarks(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'desc' },
    include: {
      place: {
        include: {
          aiEnrichment: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  return bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place));
}

export async function getMoments(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const moments = await prisma.moment.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'desc' },
    include: {
      place: {
        include: {
          aiEnrichment: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return moments.map(mapMomentForClient);
}

export async function createMoment(userId: string | undefined, payload: Omit<MomentRecord, 'id'>) {
  const currentUser = await getCurrentUser(prisma, userId);
  const moment = await prisma.moment.create({
    data: {
      userId: currentUser.id,
      placeId: payload.placeId,
      visitedAt: new Date(payload.visitedDate),
      caption: payload.caption,
      rating: payload.rating,
      budgetLevel: payload.budgetLevel,
      visitType: mapVisitType(payload.visitType),
      timeOfDay: mapTimeOfDay(payload.timeOfDay),
      privacy: mapVisibility(payload.privacy),
      wouldRevisit: mapRevisit(payload.wouldRevisit),
      vibeTags: payload.vibeTags,
      media: {
        create: payload.uploadedMedia.map((url, index) => ({
          mediaType: url.endsWith('.mp4') ? 'video' : 'image',
          url,
          sortOrder: index,
        })),
      },
    },
    include: {
      place: {
        include: {
          aiEnrichment: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return mapMomentForClient(moment);
}

export async function updateMoment(userId: string | undefined, id: string, payload: Partial<Omit<MomentRecord, 'id'>>) {
  const currentUser = await getCurrentUser(prisma, userId);
  const existing = await prisma.moment.findFirst({
    where: {
      id,
      userId: currentUser.id,
    },
    include: {
      media: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!existing) {
    return null;
  }

  const moment = await prisma.moment.update({
    where: { id: existing.id },
    data: {
      placeId: payload.placeId ?? existing.placeId,
      visitedAt: payload.visitedDate ? new Date(payload.visitedDate) : existing.visitedAt,
      caption: payload.caption ?? existing.caption,
      rating: payload.rating ?? existing.rating,
      budgetLevel: payload.budgetLevel ?? existing.budgetLevel,
      visitType: payload.visitType ? mapVisitType(payload.visitType) : existing.visitType,
      timeOfDay: payload.timeOfDay ? mapTimeOfDay(payload.timeOfDay) : existing.timeOfDay,
      privacy: payload.privacy ? mapVisibility(payload.privacy) : existing.privacy,
      wouldRevisit: payload.wouldRevisit ? mapRevisit(payload.wouldRevisit) : existing.wouldRevisit,
      vibeTags: payload.vibeTags ?? existing.vibeTags,
      media: payload.uploadedMedia
        ? {
            deleteMany: {},
            create: payload.uploadedMedia.map((url, index) => ({
              mediaType: url.endsWith('.mp4') ? 'video' : 'image',
              url,
              sortOrder: index,
            })),
          }
        : undefined,
    },
    include: {
      place: {
        include: {
          aiEnrichment: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
      },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return mapMomentForClient(moment);
}
