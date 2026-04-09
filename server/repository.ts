import type { Place as PrismaPlace, Prisma, PrismaClient } from '@prisma/client';
import { findPlaceById, findTravelerById, store, type MomentRecord } from './store';
import { prisma, withPrismaFallback } from './prisma';
import { generateTravelerProfileDescriptor } from './travelerProfileEnrichment';

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

function isRenderableMediaUrl(url?: string | null) {
  if (!url) return false;
  return /^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:');
}

function mapPlaceForClient(
  place: PlaceWithRelations,
  overrides?: {
    similarityStat?: number | null;
    recommendationReason?: string | null;
  },
) {
  const hasSimilarityOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, 'similarityStat'));
  const hasRecommendationOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, 'recommendationReason'));
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
    similarityStat: hasSimilarityOverride ? (overrides?.similarityStat ?? undefined) : undefined,
    whyYoullLikeIt: [
      ...(
        overrides?.recommendationReason
          ? [overrides.recommendationReason]
          : place.aiEnrichment?.description
            ? [place.aiEnrichment.description]
            : []
      ),
      ...(place.aiEnrichment?.bestTime ? [`best at ${place.aiEnrichment.bestTime}`] : []),
    ],
    recommendationReason: hasRecommendationOverride ? (overrides?.recommendationReason ?? '') : (place.aiEnrichment?.description ?? ''),
    priceRange: mapPriceLevel(place.priceLevel),
    category: place.category,
  };
}

async function getUserPlaceScoreOverrideMap(userId: string, placeIds: string[]) {
  const uniquePlaceIds = Array.from(new Set(placeIds.filter(Boolean)));
  if (uniquePlaceIds.length === 0) return new Map<string, { similarityStat?: number | null; recommendationReason?: string | null }>();

  const persistedScores = await prisma.userPlaceScore.findMany({
    where: {
      userId,
      placeId: {
        in: uniquePlaceIds,
      },
    },
  });

  return new Map(
    persistedScores.map((score) => [
      score.placeId,
      {
        similarityStat: score.similarityPercentage ?? score.matchScore ?? null,
        recommendationReason: score.recommendationReason,
      },
    ]),
  );
}

function getPlaceScoreOverride(
  overrideMap: Map<string, { similarityStat?: number | null; recommendationReason?: string | null }>,
  placeId: string,
) {
  return overrideMap.get(placeId) ?? { similarityStat: null, recommendationReason: null };
}

type ClientPlace = ReturnType<typeof mapPlaceForClient> & {
  momentId?: string;
  ownerUserId?: string;
  visitedDate?: string;
  visitedAtIso?: string;
  momentMedia?: Array<{ url: string; mediaType: 'image' | 'video' }>;
  momentCaption?: string;
  momentVibeTags?: string[];
  momentVisitType?: MomentRecord['visitType'];
  momentTimeOfDay?: MomentRecord['timeOfDay'];
  momentWouldRevisit?: MomentRecord['wouldRevisit'];
  momentRating?: number;
};

function mapMomentForClient(moment: MomentWithRelations) {
  return {
    id: moment.id,
    placeId: moment.placeId,
    visitedDate: moment.visitedAt.toISOString().split('T')[0],
    visitedAtIso: moment.visitedAt.toISOString(),
    caption: moment.caption,
    uploadedMedia: moment.media.map((item) => item.url),
    uploadedMediaItems: moment.media.map((item) => ({
      url: item.url,
      mediaType: item.mediaType.toLowerCase().startsWith('video') ? 'video' as const : 'image' as const,
    })),
    rating: moment.rating,
    budgetLevel: moment.budgetLevel as '$' | '$$' | '$$$',
    visitType: moment.visitType.toLowerCase() as MomentRecord['visitType'],
    timeOfDay: moment.timeOfDay.toLowerCase() as MomentRecord['timeOfDay'],
    privacy: moment.privacy.toLowerCase() as MomentRecord['privacy'],
    wouldRevisit: (
      moment.wouldRevisit === 'NOT_SURE'
        ? 'not_sure'
        : moment.wouldRevisit === 'NOT_INTERESTED'
          ? 'not_interested'
          : 'yes'
    ) as MomentRecord['wouldRevisit'],
    vibeTags: moment.vibeTags,
    place: mapPlaceForClient(moment.place),
  };
}

function buildTravelHistory(
  moments: Array<{
    id: string;
    visitedDate: string;
    visitedAtIso: string;
    uploadedMedia: string[];
    uploadedMediaItems: Array<{ url: string; mediaType: 'image' | 'video' }>;
    caption: string;
    vibeTags: string[];
    visitType: MomentRecord['visitType'];
    timeOfDay: MomentRecord['timeOfDay'];
    wouldRevisit: MomentRecord['wouldRevisit'];
    rating: number;
    place: ReturnType<typeof mapPlaceForClient>;
  }>,
  ownerUserId: string,
) {
  const grouped = new Map<string, { country: string; cities: Set<string>; places: ClientPlace[] }>();

  for (const moment of moments) {
    const [city = 'Unknown city', country = 'Unknown country'] = moment.place.location.split(',').map((part) => part.trim());
    const existing = grouped.get(country) ?? { country, cities: new Set<string>(), places: [] };
    existing.cities.add(city);
    if (!existing.places.some((item) => item.id === moment.place.id && item.momentId === moment.id)) {
      const usableUploadedMedia = moment.uploadedMedia.filter((url) => isRenderableMediaUrl(url));
      const usableUploadedMediaItems = moment.uploadedMediaItems.filter((item) => isRenderableMediaUrl(item.url));
      const mediaImages = usableUploadedMedia.length > 0 ? usableUploadedMedia : moment.place.images;
      existing.places.push({
        ...moment.place,
        image: mediaImages[0] ?? moment.place.image,
        images: mediaImages.length > 0 ? mediaImages : moment.place.images,
        momentMedia: usableUploadedMediaItems.length > 0
          ? usableUploadedMediaItems
          : (moment.place.images ?? []).map((url) => ({ url, mediaType: 'image' as const })),
        momentId: moment.id,
        ownerUserId,
        visitedDate: moment.visitedDate,
        visitedAtIso: moment.visitedAtIso,
        momentCaption: moment.caption,
        momentVibeTags: moment.vibeTags,
        momentVisitType: moment.visitType,
        momentTimeOfDay: moment.timeOfDay,
        momentWouldRevisit: moment.wouldRevisit,
        momentRating: moment.rating,
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
    followersCount?: number;
    recentSavedPlaces?: Array<{
      place: ReturnType<typeof mapPlaceForClient>;
      savedAtLabel: string;
      savedAtIso?: string;
    }>;
    recentCollections?: Array<{
      id: string;
      label: string;
      createdAt?: string;
      places: ReturnType<typeof mapPlaceForClient>[];
    }>;
    latestVisitedAtIso?: string;
    visitedPlacesCount?: number;
    savedPlacesCount?: number;
    collectionsCount?: number;
  },
) {
  return {
    ...buildProfileUser(user, moments),
    ...(typeof matchScore === 'number' ? { matchScore } : {}),
    ...(extras?.relevanceReason ? { relevanceReason: extras.relevanceReason } : {}),
    ...(extras?.descriptor ? { descriptor: extras.descriptor } : {}),
    ...(typeof extras?.vibinCount === 'number' ? { vibinCount: extras.vibinCount } : {}),
    ...(typeof extras?.followersCount === 'number' ? { followersCount: extras.followersCount } : {}),
    ...(extras?.recentSavedPlaces?.length ? { recentSavedPlaces: extras.recentSavedPlaces } : {}),
    ...(extras?.recentCollections?.length ? { recentCollections: extras.recentCollections } : {}),
    ...(extras?.latestVisitedAtIso ? { latestVisitedAtIso: extras.latestVisitedAtIso } : {}),
    ...(typeof extras?.visitedPlacesCount === 'number' ? { visitedPlacesCount: extras.visitedPlacesCount } : {}),
    ...(typeof extras?.savedPlacesCount === 'number' ? { savedPlacesCount: extras.savedPlacesCount } : {}),
    ...(typeof extras?.collectionsCount === 'number' ? { collectionsCount: extras.collectionsCount } : {}),
  };
}

function trimPlaceForFeed(place: ReturnType<typeof mapPlaceForClient>) {
  return {
    ...place,
    images: (place.images ?? []).slice(0, 1),
    tags: (place.tags ?? []).slice(0, 3),
    whyYoullLikeIt: (place.whyYoullLikeIt ?? []).slice(0, 1),
  };
}

function trimTravelerForFeed<T extends ReturnType<typeof buildProfileUserWithMatch>>(traveler: T): T {
  return {
    ...traveler,
    travelHistory: (traveler.travelHistory ?? []).slice(0, 2).map((history) => ({
      ...history,
      places: (history.places ?? []).slice(0, 2).map((place) => trimPlaceForFeed(place)),
    })),
    recentSavedPlaces: (traveler.recentSavedPlaces ?? []).slice(0, 3).map((entry) => ({
      ...entry,
      place: trimPlaceForFeed(entry.place),
    })),
    recentCollections: (traveler.recentCollections ?? []).slice(0, 2).map((collection) => ({
      ...collection,
      places: (collection.places ?? []).slice(0, 4).map((place) => trimPlaceForFeed(place)),
    })),
  };
}

function formatRelativeActivityLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${Math.max(1, diffMonths)}mo ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${Math.max(1, diffYears)}y ago`;
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
      },
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
  const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
    user.id,
    [
      ...user.bookmarks.map((bookmark) => bookmark.placeId),
      ...user.collections.flatMap((collection) => collection.places.map((item) => item.placeId)),
    ],
  );
  const descriptor = await generateTravelerProfileDescriptor({
    userId: user.id,
    displayName: user.displayName,
    moments,
    bookmarkedPlaces: user.bookmarks.map((bookmark) => mapPlaceForClient(
      bookmark.place,
      getPlaceScoreOverride(userPlaceScoreOverrideMap, bookmark.placeId),
    )),
  });

  return {
    user: buildProfileUserWithMatch(user, moments, undefined, {
      descriptor,
      recentSavedPlaces: user.bookmarks.map((bookmark) => ({
        place: mapPlaceForClient(
          bookmark.place,
          getPlaceScoreOverride(userPlaceScoreOverrideMap, bookmark.placeId),
        ),
        savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
        savedAtIso: bookmark.createdAt.toISOString(),
      })),
      visitedPlacesCount: user.moments.length,
      savedPlacesCount: user.bookmarks.length,
      collectionsCount: user.collections.length,
      latestVisitedAtIso: user.moments[0]?.visitedAt?.toISOString(),
    }),
    bookmarks: user.bookmarks.map((bookmark) => mapPlaceForClient(
      bookmark.place,
      getPlaceScoreOverride(userPlaceScoreOverrideMap, bookmark.placeId),
    )),
    collections: user.collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      createdAt: collection.createdAt.toISOString(),
      places: collection.places.map((item) => mapPlaceForClient(
        item.place,
        getPlaceScoreOverride(userPlaceScoreOverrideMap, item.placeId),
      )),
    })),
    moments,
  };
}

export async function getPublicCollectionById(collectionId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: {
      user: {
        include: {
          badges: true,
          flags: true,
        },
      },
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

  if (!collection) {
    throw new Error('Collection not found');
  }

  return {
    collection: {
      id: collection.id,
      label: collection.title,
      createdAt: collection.createdAt.toISOString(),
      places: collection.places.map((item) => mapPlaceForClient(item.place)),
    },
    owner: {
      id: collection.user.id,
      username: collection.user.username,
      displayName: collection.user.displayName ?? collection.user.username,
      avatar: collection.user.avatarUrl,
    },
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
      },
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
  const descriptor = await generateTravelerProfileDescriptor({
    userId: user.id,
    displayName: user.displayName,
    moments,
    bookmarkedPlaces: user.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
  });

  return {
    user: buildProfileUserWithMatch(user, moments, undefined, {
      descriptor,
      recentSavedPlaces: user.bookmarks.map((bookmark) => ({
        place: mapPlaceForClient(bookmark.place),
        savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
        savedAtIso: bookmark.createdAt.toISOString(),
      })),
      recentCollections: user.collections.map((collection) => ({
        id: collection.id,
        label: collection.title,
        createdAt: collection.createdAt.toISOString(),
        places: collection.places.map((item) => mapPlaceForClient(item.place)),
      })),
      latestVisitedAtIso: user.moments[0]?.visitedAt?.toISOString?.() ?? user.moments[0]?.createdAt?.toISOString?.(),
      savedPlacesCount: user.bookmarks.length,
      collectionsCount: user.collections.length,
    }),
    bookmarks: user.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
    collections: user.collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      createdAt: collection.createdAt.toISOString(),
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
            _count: {
              select: {
                moments: true,
                bookmarks: true,
                collections: true,
              },
            },
            bookmarks: {
              orderBy: { createdAt: 'desc' },
              take: 4,
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
            moments: {
              orderBy: { createdAt: 'desc' },
              take: 6,
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
              take: 3,
              include: {
                places: {
                  orderBy: { sortOrder: 'asc' },
                  take: 4,
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
            _count: {
              select: {
                moments: true,
                bookmarks: true,
                collections: true,
              },
            },
            bookmarks: {
              orderBy: { createdAt: 'desc' },
              take: 4,
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
            moments: {
              orderBy: { createdAt: 'desc' },
              take: 6,
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
              take: 3,
              include: {
                places: {
                  orderBy: { sortOrder: 'asc' },
                  take: 4,
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
  const fallbackTravelers = await prisma.user.findMany({
        where: {
          id: { not: currentUser.id },
          OR: [
            {
              moments: {
                some: {},
              },
            },
            {
              bookmarks: {
                some: {},
              },
            },
            {
              collections: {
                some: {},
              },
            },
          ],
        },
        include: {
          badges: true,
          flags: true,
          _count: {
            select: {
              moments: true,
              bookmarks: true,
              collections: true,
            },
          },
          bookmarks: {
            orderBy: { createdAt: 'desc' },
            take: 4,
            include: {
              place: {
                include: {
                  aiEnrichment: true,
                  media: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
          moments: {
            orderBy: { createdAt: 'desc' },
            take: 6,
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
            take: 3,
            include: {
              places: {
                orderBy: { sortOrder: 'asc' },
                take: 4,
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
        orderBy: { createdAt: 'desc' },
        take: 24,
      });
  const fallbackTravelerIds = new Set(fallbackTravelers.map((traveler) => traveler.id));

  const followedTravelerDescriptors = await Promise.all(
    followedUsers.map(async (item) => {
      const descriptor = await generateTravelerProfileDescriptor({
        userId: item.targetUser.id,
        displayName: item.targetUser.displayName,
        moments: item.targetUser.moments.map(mapMomentForClient),
        bookmarkedPlaces: item.targetUser.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [item.targetUser.id, descriptor] as const;
    }),
  );

  const similarTravelerDescriptors = await Promise.all(
    [
      ...similarUsers.map((item) => item.traveler),
      ...fallbackTravelers.filter((traveler) => !similarUsers.some((item) => item.traveler.id === traveler.id)),
    ].map(async (traveler) => {
      const descriptor = await generateTravelerProfileDescriptor({
        userId: traveler.id,
        displayName: traveler.displayName,
        moments: traveler.moments.map(mapMomentForClient),
        bookmarkedPlaces: traveler.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [traveler.id, descriptor] as const;
    }),
  );

  const followedDescriptorMap = new Map(followedTravelerDescriptors);
  const similarDescriptorMap = new Map(similarTravelerDescriptors);
  const feedSavedDrops = followedUsers
    .flatMap((item) =>
      item.targetUser.bookmarks.map((bookmark) => ({
        id: `saved-${item.targetUser.id}-${bookmark.id}`,
        travelerId: item.targetUser.id,
        place: mapPlaceForClient(bookmark.place),
        caption: '',
        savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
        savedAtIso: bookmark.createdAt.toISOString(),
        createdAtMs: bookmark.createdAt.getTime(),
      })),
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 8)
    .map(({ createdAtMs: _createdAtMs, ...entry }) => entry);

  return {
    followedTravelers: followedUsers.map((item) =>
      trimTravelerForFeed(buildProfileUserWithMatch(
        item.targetUser,
        item.targetUser.moments.map(mapMomentForClient),
        undefined,
        {
          vibinCount: vibinMap.get(item.targetUser.id) ?? 0,
          descriptor: followedDescriptorMap.get(item.targetUser.id),
          recentSavedPlaces: item.targetUser.bookmarks.map((bookmark) => ({
            place: mapPlaceForClient(bookmark.place),
            savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
            savedAtIso: bookmark.createdAt.toISOString(),
          })),
          recentCollections: item.targetUser.collections.map((collection) => ({
            id: collection.id,
            label: collection.title,
            createdAt: collection.createdAt.toISOString(),
            places: collection.places.map((entry) => mapPlaceForClient(entry.place)),
          })),
          latestVisitedAtIso: item.targetUser.moments[0]?.visitedAt?.toISOString?.() ?? item.targetUser.moments[0]?.createdAt?.toISOString?.(),
          visitedPlacesCount: item.targetUser._count.moments,
          savedPlacesCount: item.targetUser._count.bookmarks,
          collectionsCount: item.targetUser._count.collections,
        },
      )),
    ),
    similarTravelers: [
      ...similarUsers.map((item) => ({
        user: item.traveler,
        matchScore: item.matchScore,
        relevanceReason: item.relevanceReason,
      })),
      ...fallbackTravelers
        .filter((traveler) =>
          !followedUsers.some((follow) => follow.targetUser.id === traveler.id)
          && !similarUsers.some((item) => item.traveler.id === traveler.id),
        )
        .slice(0, Math.max(0, 12 - similarUsers.length))
        .map((traveler, index) => ({
          user: traveler,
          matchScore: Math.max(58, 76 - index),
          relevanceReason: 'Community traveler worth exploring while your exact matches warm up.',
        })),
    ].map((item) =>
      trimTravelerForFeed(buildProfileUserWithMatch(
        item.user,
        item.user.moments.map(mapMomentForClient),
        item.matchScore,
        {
          relevanceReason: item.relevanceReason,
          vibinCount: vibinMap.get(item.user.id) ?? 0,
          descriptor: similarDescriptorMap.get(item.user.id)
            ?? (fallbackTravelerIds.has(item.user.id) ? 'community traveler' : undefined),
          recentSavedPlaces: item.user.bookmarks.map((bookmark) => ({
            place: mapPlaceForClient(bookmark.place),
            savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
            savedAtIso: bookmark.createdAt.toISOString(),
          })),
          recentCollections: item.user.collections.map((collection) => ({
            id: collection.id,
            label: collection.title,
            createdAt: collection.createdAt.toISOString(),
            places: collection.places.map((entry) => mapPlaceForClient(entry.place)),
          })),
          latestVisitedAtIso: item.user.moments[0]?.visitedAt?.toISOString?.() ?? item.user.moments[0]?.createdAt?.toISOString?.(),
          visitedPlacesCount: item.user._count.moments,
          savedPlacesCount: item.user._count.bookmarks,
          collectionsCount: item.user._count.collections,
        },
      )),
    ),
    feedSavedDrops,
  };
}

export async function getFollowingFeed(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const [followedUsers, similarUsers, fallbackTravelers, profileVibins] = await Promise.all([
    prisma.follow.findMany({
      where: { sourceUserId: currentUser.id },
      include: {
        targetUser: {
          include: {
            badges: true,
            flags: true,
            _count: {
              select: {
                moments: true,
                bookmarks: true,
                collections: true,
              },
            },
            bookmarks: {
              orderBy: { createdAt: 'desc' },
              take: 12,
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
            moments: {
              orderBy: { createdAt: 'desc' },
              take: 24,
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
              take: 8,
              include: {
                places: {
                  orderBy: { sortOrder: 'asc' },
                  take: 8,
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
            _count: {
              select: {
                moments: true,
                bookmarks: true,
                collections: true,
              },
            },
            bookmarks: {
              orderBy: { createdAt: 'desc' },
              take: 4,
              include: {
                place: {
                  include: {
                    aiEnrichment: true,
                    media: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
            moments: {
              orderBy: { createdAt: 'desc' },
              take: 6,
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
              take: 3,
              include: {
                places: {
                  orderBy: { sortOrder: 'asc' },
                  take: 4,
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
        },
      },
      orderBy: { matchScore: 'desc' },
      take: 12,
    }),
    prisma.user.findMany({
      where: {
        id: { not: currentUser.id },
        OR: [
          { moments: { some: {} } },
          { bookmarks: { some: {} } },
          { collections: { some: {} } },
        ],
      },
      include: {
        badges: true,
        flags: true,
        _count: {
          select: {
            moments: true,
            bookmarks: true,
            collections: true,
          },
        },
        bookmarks: {
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: {
            place: {
              include: {
                aiEnrichment: true,
                media: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
        moments: {
          orderBy: { createdAt: 'desc' },
          take: 6,
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
          take: 3,
          include: {
            places: {
              orderBy: { sortOrder: 'asc' },
              take: 4,
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
      orderBy: { createdAt: 'desc' },
      take: 24,
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
  const followedUserIds = new Set(followedUsers.map((item) => item.targetUser.id));

  const followedPlaceIds = Array.from(new Set([
    ...followedUsers.flatMap((item) => item.targetUser.bookmarks.map((bookmark) => bookmark.placeId)),
    ...followedUsers.flatMap((item) => item.targetUser.moments.map((moment) => moment.placeId)),
    ...followedUsers.flatMap((item) => item.targetUser.collections.flatMap((collection) => collection.places.map((entry) => entry.placeId))),
  ]));
  const followedPlaceOverrideMap = await getUserPlaceScoreOverrideMap(currentUser.id, followedPlaceIds);

  const followedTravelerDescriptors = await Promise.all(
    followedUsers.map(async (item) => {
      const descriptor = await generateTravelerProfileDescriptor({
        userId: item.targetUser.id,
        displayName: item.targetUser.displayName,
        moments: item.targetUser.moments.map(mapMomentForClient),
        bookmarkedPlaces: item.targetUser.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [item.targetUser.id, descriptor] as const;
    }),
  );
  const followedDescriptorMap = new Map(followedTravelerDescriptors);
  const suggestedTravelerDescriptors = await Promise.all(
    [
      ...similarUsers.map((item) => item.traveler),
      ...fallbackTravelers.filter((traveler) =>
        !followedUserIds.has(traveler.id)
        && !similarUsers.some((item) => item.traveler.id === traveler.id),
      ),
    ].map(async (traveler) => {
      const descriptor = await generateTravelerProfileDescriptor({
        userId: traveler.id,
        displayName: traveler.displayName,
        moments: traveler.moments.map(mapMomentForClient),
        bookmarkedPlaces: traveler.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [traveler.id, descriptor] as const;
    }),
  );
  const suggestedDescriptorMap = new Map(suggestedTravelerDescriptors);

  const followedTravelers = followedUsers.map((item) =>
    trimTravelerForFeed(buildProfileUserWithMatch(
      item.targetUser,
      item.targetUser.moments.map((moment) => {
        const mappedMoment = mapMomentForClient(moment);
        return {
          ...mappedMoment,
          place: mapPlaceForClient(
            moment.place,
            getPlaceScoreOverride(followedPlaceOverrideMap, moment.placeId),
          ),
        };
      }),
      undefined,
      {
        vibinCount: vibinMap.get(item.targetUser.id) ?? 0,
        descriptor: followedDescriptorMap.get(item.targetUser.id),
        recentSavedPlaces: item.targetUser.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(
            bookmark.place,
            getPlaceScoreOverride(followedPlaceOverrideMap, bookmark.placeId),
          ),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        recentCollections: item.targetUser.collections.map((collection) => ({
          id: collection.id,
          label: collection.title,
          createdAt: collection.createdAt.toISOString(),
          places: collection.places.map((entry) => mapPlaceForClient(
            entry.place,
            getPlaceScoreOverride(followedPlaceOverrideMap, entry.placeId),
          )),
        })),
        latestVisitedAtIso: item.targetUser.moments[0]?.visitedAt?.toISOString?.() ?? item.targetUser.moments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: item.targetUser._count.moments,
        savedPlacesCount: item.targetUser._count.bookmarks,
        collectionsCount: item.targetUser._count.collections,
      },
    )),
  );

  const feedSavedDrops = followedUsers
    .flatMap((item) =>
      item.targetUser.bookmarks.map((bookmark) => ({
        id: `saved-${item.targetUser.id}-${bookmark.id}`,
        travelerId: item.targetUser.id,
        place: mapPlaceForClient(
          bookmark.place,
          getPlaceScoreOverride(followedPlaceOverrideMap, bookmark.placeId),
        ),
        caption: '',
        savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
        savedAtIso: bookmark.createdAt.toISOString(),
        createdAtMs: bookmark.createdAt.getTime(),
      })),
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 8)
    .map(({ createdAtMs: _createdAtMs, ...entry }) => entry);

  const travelerMap = new Map(followedTravelers.map((traveler) => [traveler.id, traveler]));
  const fullTravelerFeedMap = new Map(
    followedUsers.map((item) => [
      item.targetUser.id,
      buildProfileUserWithMatch(
        item.targetUser,
        item.targetUser.moments.map((moment) => {
          const mappedMoment = mapMomentForClient(moment);
          return {
            ...mappedMoment,
            place: mapPlaceForClient(
              moment.place,
              getPlaceScoreOverride(followedPlaceOverrideMap, moment.placeId),
            ),
          };
        }),
        undefined,
        {
          recentSavedPlaces: item.targetUser.bookmarks.map((bookmark) => ({
            place: mapPlaceForClient(
              bookmark.place,
              getPlaceScoreOverride(followedPlaceOverrideMap, bookmark.placeId),
            ),
            savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
            savedAtIso: bookmark.createdAt.toISOString(),
          })),
          recentCollections: item.targetUser.collections.map((collection) => ({
            id: collection.id,
            label: collection.title,
            createdAt: collection.createdAt.toISOString(),
            places: collection.places.map((entry) => mapPlaceForClient(
              entry.place,
              getPlaceScoreOverride(followedPlaceOverrideMap, entry.placeId),
            )),
          })),
          latestVisitedAtIso: item.targetUser.moments[0]?.visitedAt?.toISOString?.() ?? item.targetUser.moments[0]?.createdAt?.toISOString?.(),
          savedPlacesCount: item.targetUser._count.bookmarks,
          collectionsCount: item.targetUser._count.collections,
        },
      ),
    ]),
  );

  const items = [
    ...feedSavedDrops.map((drop) => {
      const traveler = travelerMap.get(drop.travelerId);
      if (!traveler) return null;
      return {
        id: drop.id,
        type: 'saved' as const,
        traveler,
        timestampLabel: drop.savedAtLabel,
        sortTimestamp: drop.savedAtIso ?? null,
        place: drop.place,
        collection: null,
        caption: null,
      };
    }),
    ...Array.from(fullTravelerFeedMap.values()).flatMap((traveler) => [
      ...traveler.travelHistory.flatMap((history) =>
        history.places
          .filter((place) => place.visitedDate)
          .map((place) => ({
            id: `visited-${traveler.id}-${place.momentId ?? place.id}`,
            type: 'visited' as const,
            traveler,
            timestampLabel: formatRelativeActivityLabel(place.visitedAtIso ? new Date(place.visitedAtIso) : new Date(place.visitedDate!)),
            sortTimestamp: place.visitedAtIso ?? place.visitedDate ?? null,
            place,
            collection: null,
            caption: place.momentCaption ?? null,
          })),
      ),
      ...(traveler.recentCollections ?? []).map((collection) => ({
        id: `collection-${traveler.id}-${collection.id}`,
        type: 'collection' as const,
        traveler,
        timestampLabel: formatRelativeActivityLabel(collection.createdAt ? new Date(collection.createdAt) : new Date()),
        sortTimestamp: collection.createdAt ?? null,
        place: null,
        collection,
        caption: null,
      })),
    ]),
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const aTime = a.sortTimestamp ? new Date(a.sortTimestamp).getTime() : 0;
      const bTime = b.sortTimestamp ? new Date(b.sortTimestamp).getTime() : 0;
      return bTime - aTime;
    });

  const suggestedTravelers = [
    ...similarUsers
      .filter((item) => !followedUserIds.has(item.traveler.id))
      .map((item) =>
        trimTravelerForFeed(buildProfileUserWithMatch(
          item.traveler,
          item.traveler.moments.map(mapMomentForClient),
          item.matchScore,
          {
            relevanceReason: item.relevanceReason,
            vibinCount: vibinMap.get(item.traveler.id) ?? 0,
            descriptor: suggestedDescriptorMap.get(item.traveler.id),
            recentSavedPlaces: item.traveler.bookmarks.map((bookmark) => ({
              place: mapPlaceForClient(bookmark.place),
              savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
              savedAtIso: bookmark.createdAt.toISOString(),
            })),
            recentCollections: item.traveler.collections.map((collection) => ({
              id: collection.id,
              label: collection.title,
              createdAt: collection.createdAt.toISOString(),
              places: collection.places.map((entry) => mapPlaceForClient(entry.place)),
            })),
            latestVisitedAtIso: item.traveler.moments[0]?.visitedAt?.toISOString?.() ?? item.traveler.moments[0]?.createdAt?.toISOString?.(),
            visitedPlacesCount: item.traveler._count.moments,
            savedPlacesCount: item.traveler._count.bookmarks,
            collectionsCount: item.traveler._count.collections,
          },
        )),
      ),
    ...fallbackTravelers
      .filter((traveler) =>
        !followedUserIds.has(traveler.id)
        && !similarUsers.some((item) => item.traveler.id === traveler.id),
      )
      .slice(0, 12)
      .map((traveler, index) =>
        trimTravelerForFeed(buildProfileUserWithMatch(
          traveler,
          traveler.moments.map(mapMomentForClient),
          Math.max(58, 76 - index),
          {
            relevanceReason: 'Community traveler worth exploring while your exact matches warm up.',
            vibinCount: vibinMap.get(traveler.id) ?? 0,
            descriptor: suggestedDescriptorMap.get(traveler.id),
            recentSavedPlaces: traveler.bookmarks.map((bookmark) => ({
              place: mapPlaceForClient(bookmark.place),
              savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
              savedAtIso: bookmark.createdAt.toISOString(),
            })),
            recentCollections: traveler.collections.map((collection) => ({
              id: collection.id,
              label: collection.title,
              createdAt: collection.createdAt.toISOString(),
              places: collection.places.map((entry) => mapPlaceForClient(entry.place)),
            })),
            latestVisitedAtIso: traveler.moments[0]?.visitedAt?.toISOString?.() ?? traveler.moments[0]?.createdAt?.toISOString?.(),
            visitedPlacesCount: traveler._count.moments,
            savedPlacesCount: traveler._count.bookmarks,
            collectionsCount: traveler._count.collections,
          },
        )),
      ),
  ].slice(0, 12);

  return {
    followedTravelers,
    suggestedTravelers,
    items,
  };
}

export async function searchPublicTravelers(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            {
              username: {
                contains: normalizedQuery,
                mode: 'insensitive',
              },
            },
            {
              displayName: {
                contains: normalizedQuery,
                mode: 'insensitive',
              },
            },
            {
              bio: {
                contains: normalizedQuery,
                mode: 'insensitive',
              },
            },
          ],
        },
        {
          OR: [
            {
              moments: {
                some: {},
              },
            },
            {
              bookmarks: {
                some: {},
              },
            },
          ],
        },
      ],
    },
    include: {
      badges: true,
      flags: true,
      _count: {
        select: {
          moments: true,
          bookmarks: true,
          collections: true,
        },
      },
      bookmarks: {
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
      moments: {
        orderBy: { createdAt: 'desc' },
        take: 6,
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
    take: 12,
  });

  const travelers = await Promise.all(
    users.map(async (user) => {
      const moments = user.moments.map(mapMomentForClient);
      const descriptor = await generateTravelerProfileDescriptor({
        userId: user.id,
        displayName: user.displayName,
        moments,
        bookmarkedPlaces: user.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });

      return trimTravelerForFeed(buildProfileUserWithMatch(user, moments, undefined, {
        descriptor,
        recentSavedPlaces: user.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(bookmark.place),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        latestVisitedAtIso: user.moments[0]?.visitedAt?.toISOString?.() ?? user.moments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: user._count.moments,
        savedPlacesCount: user._count.bookmarks,
        collectionsCount: user._count.collections,
      }));
    }),
  );

  return travelers.sort((a, b) => {
    const aStarts = a.username.toLowerCase().startsWith(normalizedQuery) || (a.displayName ?? '').toLowerCase().startsWith(normalizedQuery);
    const bStarts = b.username.toLowerCase().startsWith(normalizedQuery) || (b.displayName ?? '').toLowerCase().startsWith(normalizedQuery);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return (b.stats.trips + (b.savedPlacesCount ?? 0)) - (a.stats.trips + (a.savedPlacesCount ?? 0));
  });
}

export async function getPublicTravelerSuggestions(limit = 12) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        {
          moments: {
            some: {},
          },
        },
        {
          bookmarks: {
            some: {},
          },
        },
        {
          collections: {
            some: {},
          },
        },
      ],
    },
    include: {
      badges: true,
      flags: true,
      _count: {
        select: {
          moments: true,
          bookmarks: true,
          collections: true,
        },
      },
      bookmarks: {
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: {
          place: {
            include: {
              aiEnrichment: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
      moments: {
        orderBy: { createdAt: 'desc' },
        take: 6,
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
    take: limit,
  });

  const travelers = await Promise.all(
    users.map(async (user) => {
      const moments = user.moments.map(mapMomentForClient);
      const descriptor = await generateTravelerProfileDescriptor({
        userId: user.id,
        displayName: user.displayName,
        moments,
        bookmarkedPlaces: user.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });

      return trimTravelerForFeed(buildProfileUserWithMatch(user, moments, undefined, {
        descriptor,
        relevanceReason: 'Worth exploring while your taste graph builds out.',
        recentSavedPlaces: user.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(bookmark.place),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        latestVisitedAtIso: user.moments[0]?.visitedAt?.toISOString?.() ?? user.moments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: user._count.moments,
        savedPlacesCount: user._count.bookmarks,
        collectionsCount: user._count.collections,
      }));
    }),
  );

  return travelers.sort((a, b) => {
    const aWeight = (a.stats.trips * 2) + (a.savedPlacesCount ?? 0) + (a.collectionsCount ?? 0);
    const bWeight = (b.stats.trips * 2) + (b.savedPlacesCount ?? 0) + (b.collectionsCount ?? 0);
    return bWeight - aWeight;
  });
}

export async function getTravelerProfile(travelerId: string, viewerUserId?: string) {
  const traveler = await prisma.user.findUnique({
    where: { id: travelerId },
    include: {
      badges: true,
      flags: true,
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
      },
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

  if (!traveler) return null;

  const moments = traveler.moments.map(mapMomentForClient);

  const [similarity, vibinCount, followersCount, descriptor] = await Promise.all([
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
    prisma.follow.count({
      where: {
        targetUserId: travelerId,
      },
    }),
    generateTravelerProfileDescriptor({
      userId: traveler.id,
      displayName: traveler.displayName,
      moments,
      bookmarkedPlaces: traveler.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
    }),
  ]);

  return {
    traveler: buildProfileUserWithMatch(
      traveler,
      moments,
      similarity?.matchScore,
      {
        relevanceReason: similarity?.relevanceReason,
        vibinCount,
        followersCount,
        descriptor,
        recentSavedPlaces: traveler.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(bookmark.place),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        recentCollections: traveler.collections.map((collection) => ({
          id: collection.id,
          label: collection.title,
          createdAt: collection.createdAt.toISOString(),
          places: collection.places.map((item) => mapPlaceForClient(item.place)),
        })),
        latestVisitedAtIso: traveler.moments[0]?.visitedAt?.toISOString?.() ?? traveler.moments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: traveler.moments.length,
        savedPlacesCount: traveler.bookmarks.length,
        collectionsCount: traveler.collections.length,
      },
    ),
    bookmarks: traveler.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
    collections: traveler.collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      createdAt: collection.createdAt.toISOString(),
      places: collection.places.map((item) => mapPlaceForClient(item.place)),
    })),
  };
}

export async function getTravelerFollowers(travelerId: string, viewerUserId?: string) {
  const followers = await prisma.follow.findMany({
    where: {
      targetUserId: travelerId,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sourceUser: {
        include: {
          badges: true,
          flags: true,
        },
      },
    },
  });

  return Promise.all(
    followers.map(async (follow) => {
      const user = follow.sourceUser;
      const similarity = viewerUserId
        ? await prisma.travelerSimilarity.findFirst({
            where: {
              travelerId: user.id,
              userId: viewerUserId,
            },
            orderBy: { updatedAt: 'desc' },
          })
        : null;

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? user.username,
        avatar: user.avatarUrl,
        matchScore: similarity?.matchScore,
      };
    }),
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

  return related.map((item) => mapPlaceForClient(item));
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

  const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
    currentUser.id,
    collections.flatMap((collection) => collection.places.map((item) => item.placeId)),
  );

  return collections.map((collection) => ({
    id: collection.id,
    label: collection.title,
    createdAt: collection.createdAt.toISOString(),
    places: collection.places.map((item) => mapPlaceForClient(
      item.place,
      getPlaceScoreOverride(userPlaceScoreOverrideMap, item.placeId),
    )),
  }));
}

export async function createCollection(userId: string | undefined, payload: { label: string; placeIds: string[] }) {
  const currentUser = await getCurrentUser(prisma, userId);
  const normalizedTitle = payload.label.trim();
  const normalizedPlaceIds = Array.from(new Set(payload.placeIds.filter(Boolean)));
  const recentDuplicate = await prisma.collection.findFirst({
    where: {
      userId: currentUser.id,
      title: normalizedTitle,
      createdAt: {
        gte: new Date(Date.now() - 30 * 1000),
      },
    },
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

  if (recentDuplicate) {
    const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
      currentUser.id,
      recentDuplicate.places.map((item) => item.placeId),
    );
    const existingPlaceIds = recentDuplicate.places.map((item) => item.placeId);
    const isSameComposition = (
      existingPlaceIds.length === normalizedPlaceIds.length
      && existingPlaceIds.every((placeId, index) => placeId === normalizedPlaceIds[index])
    );

    if (isSameComposition) {
      return {
        id: recentDuplicate.id,
        label: recentDuplicate.title,
        createdAt: recentDuplicate.createdAt.toISOString(),
        places: recentDuplicate.places.map((item) => mapPlaceForClient(
          item.place,
          getPlaceScoreOverride(userPlaceScoreOverrideMap, item.placeId),
        )),
      };
    }
  }

  const collection = await prisma.collection.create({
    data: {
      userId: currentUser.id,
      title: normalizedTitle,
      places: {
        create: normalizedPlaceIds.map((placeId, index) => ({
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

  const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
    currentUser.id,
    collection.places.map((item) => item.placeId),
  );

  return {
    id: collection.id,
    label: collection.title,
    createdAt: collection.createdAt.toISOString(),
    places: collection.places.map((item) => mapPlaceForClient(
      item.place,
      getPlaceScoreOverride(userPlaceScoreOverrideMap, item.placeId),
    )),
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

  const persistedScoreMap = await getUserPlaceScoreOverrideMap(
    currentUser.id,
    bookmarks.map((bookmark) => bookmark.placeId),
  );

  return bookmarks.map((bookmark) => mapPlaceForClient(
    bookmark.place,
    getPlaceScoreOverride(persistedScoreMap, bookmark.placeId),
  ));
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
