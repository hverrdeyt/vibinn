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

type FeedPostWithRelations = Prisma.FeedPostGetPayload<{
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
    sourceMoment: true;
  };
}>;

const BOOKMARK_TTL_MS = 48 * 60 * 60 * 1000;

const repositoryPlaceDetailInclude = {
  aiEnrichment: true,
  media: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
  },
} satisfies Prisma.PlaceInclude;

const repositoryFeedPostInclude = {
  place: {
    include: repositoryPlaceDetailInclude,
  },
  sourceMoment: true,
} satisfies Prisma.FeedPostInclude;

const repositoryFeedUserInclude = {
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
    orderBy: { createdAt: 'desc' as const },
    take: 12,
    include: {
      place: {
        include: repositoryPlaceDetailInclude,
      },
    },
  },
  moments: {
    orderBy: { createdAt: 'desc' as const },
    take: 24,
    include: {
      place: {
        include: repositoryPlaceDetailInclude,
      },
      media: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  collections: {
    orderBy: { createdAt: 'desc' as const },
    take: 8,
    include: {
      places: {
        orderBy: { sortOrder: 'asc' as const },
        take: 8,
        include: {
          place: {
            include: repositoryPlaceDetailInclude,
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

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

function mapMomentRatingLabel(value?: MomentRecord['ratingLabel'] | null) {
  if (value === 'disliked') return 'DISLIKED';
  if (value === 'not_bad') return 'NOT_BAD';
  if (value === 'recommended') return 'RECOMMENDED';
  return 'LIKED';
}

const deletedAccountWhere: Prisma.UserWhereInput = {
  OR: [
    { email: { endsWith: '@vibinn.invalid' } },
    { username: { startsWith: 'deleted.' } },
    { displayName: 'Deleted account' },
    { bio: 'This account has been deleted.' },
  ],
};

const activeAccountWhere: Prisma.UserWhereInput = {
  NOT: deletedAccountWhere,
};

function isActiveAccount(user: {
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  bio?: string | null;
}) {
  const username = user.username?.toLowerCase() ?? '';
  const displayName = user.displayName?.toLowerCase() ?? '';
  const email = user.email?.toLowerCase() ?? '';
  const bio = user.bio?.toLowerCase() ?? '';

  return !(
    username.startsWith('deleted.')
    || displayName === 'deleted account'
    || email.endsWith('@vibinn.invalid')
    || bio === 'this account has been deleted.'
  );
}

function mapMomentRatingLabelForClient(value?: string | null): MomentRecord['ratingLabel'] {
  if (value === 'DISLIKED') return 'disliked';
  if (value === 'NOT_BAD') return 'not_bad';
  if (value === 'RECOMMENDED') return 'recommended';
  return 'liked';
}

function mapPriceLevel(value?: number | null) {
  if (!value || value <= 0) return 'Free';
  return '$'.repeat(Math.min(value, 4));
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
  const priceRangeLabel = formatStoredGooglePriceRange({
    startAmount: place.googlePriceRangeStart,
    endAmount: place.googlePriceRangeEnd,
    currencyCode: place.googlePriceRangeCurrency,
  }) ?? undefined;
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
    priceRange: priceRangeLabel,
    priceRangeLabel,
    category: place.category,
  };
}

function resolveBookmarkExpiresAt(bookmark: { createdAt: Date; expiresAt?: Date | null }) {
  return bookmark.expiresAt ?? new Date(bookmark.createdAt.getTime() + BOOKMARK_TTL_MS);
}

function normalizeBookmarkSource(source?: string | null) {
  return source?.trim().toLowerCase() || 'saved';
}

function formatBookmarkSourceLabel(source?: string | null) {
  const normalized = normalizeBookmarkSource(source);
  switch (normalized) {
    case 'todays_pick':
    case 'daily':
    case 'decision':
      return 'Saved from Daily';
    case 'feed':
      return 'Saved from Feed';
    case 'discovery':
      return 'Saved from Discovery';
    case 'profile':
      return 'Saved from Profile';
    case 'user_profile':
      return 'Saved from User Profile';
    case 'place_details':
      return 'Saved from Place Details';
    case 'saved':
      return 'Saved on Vibinn';
    default:
      return `Saved from ${normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}`;
  }
}

function mapBookmarkEntryForClient(
  bookmark: {
    id: string;
    createdAt: Date;
    expiresAt?: Date | null;
    source?: string | null;
    place: PlaceWithRelations;
    placeId: string;
  },
  overrides?: {
    similarityStat?: number | null;
    recommendationReason?: string | null;
  },
) {
  const expiresAt = resolveBookmarkExpiresAt(bookmark);
  return {
    id: bookmark.id,
    place: mapPlaceForClient(bookmark.place, overrides),
    savedAtIso: bookmark.createdAt.toISOString(),
    expiresAtIso: expiresAt.toISOString(),
    source: normalizeBookmarkSource(bookmark.source),
    sourceLabel: formatBookmarkSourceLabel(bookmark.source),
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

async function getBlockedUserIdsSet(userId?: string) {
  if (!userId) return new Set<string>();

  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { sourceUserId: userId },
        { targetUserId: userId },
      ],
    },
    select: {
      sourceUserId: true,
      targetUserId: true,
    },
  });

  const blocked = new Set<string>();
  for (const block of blocks) {
    if (block.sourceUserId === userId) blocked.add(block.targetUserId);
    if (block.targetUserId === userId) blocked.add(block.sourceUserId);
  }

  return blocked;
}

type ClientPlace = ReturnType<typeof mapPlaceForClient> & {
  momentId?: string;
  ownerUserId?: string;
  visitedDate?: string;
  visitedAtIso?: string;
  // Explicitly separate user uploads from place media in the response.
  // Clients should not infer based on URL shape.
  placeMediaUrls?: string[];
  userMediaUrls?: string[];
  momentMedia?: Array<{ url: string; mediaType: 'image' | 'video' }>;
  momentCaption?: string;
  momentVibeTags?: string[];
  momentVisitType?: MomentRecord['visitType'];
  momentTimeOfDay?: MomentRecord['timeOfDay'];
  momentWouldRevisit?: MomentRecord['wouldRevisit'];
  momentRating?: number;
  momentRatingLabel?: MomentRecord['ratingLabel'];
};

function mapMomentPlaceForClient(moment: MomentWithRelations): ClientPlace {
  const mappedMoment = mapMomentForClient(moment);
  const usableUploadedMedia = mappedMoment.uploadedMedia.filter((url) => isRenderableMediaUrl(url));
  const usableUploadedMediaItems = mappedMoment.uploadedMediaItems.filter((item) => isRenderableMediaUrl(item.url));

  return {
    ...mappedMoment.place,
    placeMediaUrls: mappedMoment.place.images ?? [],
    userMediaUrls: usableUploadedMedia,
    momentMedia: usableUploadedMediaItems.length > 0 ? usableUploadedMediaItems : undefined,
    momentId: mappedMoment.id,
    ownerUserId: moment.userId,
    visitedDate: mappedMoment.visitedDate,
    visitedAtIso: mappedMoment.visitedAtIso,
    momentCaption: mappedMoment.caption,
    momentVibeTags: mappedMoment.vibeTags,
    momentVisitType: mappedMoment.visitType,
    momentTimeOfDay: mappedMoment.timeOfDay,
    momentWouldRevisit: mappedMoment.wouldRevisit,
    momentRating: mappedMoment.rating,
    momentRatingLabel: mappedMoment.ratingLabel,
  };
}

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
    ratingLabel: mapMomentRatingLabelForClient(moment.ratingLabel),
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

function isRenderableImageMoment(moment: Pick<MomentWithRelations, 'media'>) {
  return moment.media.some((item) =>
    item.mediaType.toLowerCase().startsWith('image') && isRenderableMediaUrl(item.url),
  );
}

function getRenderableImageMedia<T extends { url: string; mediaType: string; thumbnailUrl?: string | null }>(media: T[]) {
  return media.find((item) =>
    item.mediaType.toLowerCase().startsWith('image') && isRenderableMediaUrl(item.url),
  ) ?? null;
}

function mapFeedPostPlaceForClient(feedPost: FeedPostWithRelations): ClientPlace {
  return {
    ...mapPlaceForClient(feedPost.place),
    placeMediaUrls: feedPost.place.media.map((item) => item.url),
    userMediaUrls: [feedPost.imageUrl],
    momentMedia: [{
      url: feedPost.imageUrl,
      mediaType: 'image',
    }],
    momentId: feedPost.sourceMomentId ?? feedPost.id,
    ownerUserId: feedPost.userId,
    visitedDate: feedPost.visitedAt.toISOString().split('T')[0],
    visitedAtIso: feedPost.visitedAt.toISOString(),
    momentCaption: feedPost.threeWordReview ?? feedPost.caption,
    momentRatingLabel: feedPost.ratingLabel ? mapMomentRatingLabelForClient(feedPost.ratingLabel) : undefined,
  };
}

function mapFeedPostForClient(feedPost: FeedPostWithRelations) {
  const visitedAtIso = feedPost.visitedAt.toISOString();
  return {
    id: feedPost.sourceMomentId ?? feedPost.id,
    placeId: feedPost.placeId,
    visitedDate: visitedAtIso.split('T')[0],
    visitedAtIso,
    caption: feedPost.threeWordReview ?? feedPost.caption,
    uploadedMedia: [feedPost.imageUrl],
    uploadedMediaItems: [{
      url: feedPost.imageUrl,
      mediaType: 'image' as const,
    }],
    rating: undefined,
    ratingLabel: feedPost.ratingLabel ? mapMomentRatingLabelForClient(feedPost.ratingLabel) : undefined,
    budgetLevel: '$$' as const,
    visitType: 'solo' as const,
    timeOfDay: 'afternoon' as const,
    privacy: feedPost.privacy.toLowerCase() as MomentRecord['privacy'],
    wouldRevisit: 'yes' as const,
    vibeTags: [],
    place: mapFeedPostPlaceForClient(feedPost),
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
    ratingLabel: MomentRecord['ratingLabel'];
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
      existing.places.push({
        ...moment.place,
        // Keep place media (Google / place details) on the place fields.
        // Moment uploads are sent separately so clients can render them without stealing the place thumbnail.
        placeMediaUrls: moment.place.images ?? [],
        userMediaUrls: usableUploadedMedia,
        momentMedia: usableUploadedMediaItems.length > 0 ? usableUploadedMediaItems : undefined,
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
        momentRatingLabel: moment.ratingLabel,
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

function buildTravelerInspirationMedia(
  traveler: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  },
  moments: MomentWithRelations[],
) {
  return moments
    .flatMap((moment) => moment.media
      .filter((media) => media.mediaType.toLowerCase().startsWith('image'))
      .map((media) => ({
        id: media.id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl ?? media.url,
        mediaType: 'image',
        momentId: moment.id,
        place: {
          ...mapPlaceForClient(moment.place),
          momentId: moment.id,
          ownerUserId: traveler.id,
          visitedDate: moment.visitedAt.toISOString().split('T')[0],
          visitedAtIso: moment.visitedAt.toISOString(),
          momentCaption: moment.caption,
          momentRating: moment.rating,
          momentRatingLabel: mapMomentRatingLabelForClient(moment.ratingLabel),
        },
        traveler: {
          id: traveler.id,
          username: traveler.username,
          displayName: traveler.displayName,
          avatar: traveler.avatarUrl,
          bio: traveler.bio,
          descriptor: undefined,
          matchScore: undefined,
          followersCount: undefined,
          recentSavedPlaces: [],
          recentCollections: [],
          travelHistory: [],
          visitedPlacesCount: undefined,
          savedPlacesCount: undefined,
          collectionsCount: undefined,
        },
      })))
    .slice(0, 10);
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

function sortSuggestedTravelers<T extends {
  visitedPlacesCount?: number;
  matchScore?: number;
  stats: { trips: number };
}>(travelers: T[]) {
  return [...travelers].sort((a, b) => {
    const visitedDelta = (b.visitedPlacesCount ?? b.stats.trips) - (a.visitedPlacesCount ?? a.stats.trips);
    if (visitedDelta !== 0) return visitedDelta;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
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
      preferences: {
        select: {
          onboardingCompleted: true,
        },
      },
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
      feedPosts: {
        where: {
          privacy: { in: ['PUBLIC', 'FOLLOWERS'] },
        },
        orderBy: { visitedAt: 'desc' },
        include: repositoryFeedPostInclude,
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

  const moments = user.feedPosts.map(mapFeedPostForClient);
  const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
    user.id,
    [
      ...user.bookmarks.map((bookmark) => bookmark.placeId),
      ...user.feedPosts.map((feedPost) => feedPost.placeId),
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
    user: {
      ...buildProfileUserWithMatch(user, moments, undefined, {
        descriptor,
        recentSavedPlaces: user.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(
            bookmark.place,
            getPlaceScoreOverride(userPlaceScoreOverrideMap, bookmark.placeId),
          ),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        visitedPlacesCount: user.feedPosts.length,
        savedPlacesCount: user.bookmarks.length,
        collectionsCount: user.collections.length,
        latestVisitedAtIso: user.feedPosts[0]?.visitedAt?.toISOString(),
      }),
      hasCompletedTastePreferences: Boolean(user.preferences?.onboardingCompleted),
    },
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
      feedPosts: {
        where: {
          privacy: 'PUBLIC',
        },
        orderBy: { visitedAt: 'desc' },
        include: repositoryFeedPostInclude,
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

  const moments = user.feedPosts.map(mapFeedPostForClient);
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
      latestVisitedAtIso: user.feedPosts[0]?.visitedAt?.toISOString?.(),
      visitedPlacesCount: user.feedPosts.length,
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
  const blockedUserIds = await getBlockedUserIdsSet(currentUser.id);

  const [followedUsers, similarUsers, profileVibins] = await Promise.all([
    prisma.follow.findMany({
      where: {
        sourceUserId: currentUser.id,
        targetUser: activeAccountWhere,
      },
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
      where: {
        userId: currentUser.id,
        traveler: activeAccountWhere,
      },
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
          ...activeAccountWhere,
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
  const visibleFollowedUsers = followedUsers.filter((item) => !blockedUserIds.has(item.targetUser.id) && isActiveAccount(item.targetUser));
  const visibleSimilarUsers = similarUsers.filter((item) => !blockedUserIds.has(item.traveler.id) && isActiveAccount(item.traveler));
  const visibleFallbackTravelers = fallbackTravelers.filter((traveler) => !blockedUserIds.has(traveler.id) && isActiveAccount(traveler));
  const fallbackTravelerIds = new Set(visibleFallbackTravelers.map((traveler) => traveler.id));

  const followedTravelerDescriptors = await Promise.all(
    visibleFollowedUsers.map(async (item) => {
      const visibleMoments = item.targetUser.moments.filter(isRenderableImageMoment);
      const descriptor = await generateTravelerProfileDescriptor({
        userId: item.targetUser.id,
        displayName: item.targetUser.displayName,
        moments: visibleMoments.map(mapMomentForClient),
        bookmarkedPlaces: item.targetUser.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [item.targetUser.id, descriptor] as const;
    }),
  );

  const similarTravelerDescriptors = await Promise.all(
    [
      ...visibleSimilarUsers.map((item) => item.traveler),
      ...visibleFallbackTravelers.filter((traveler) => !visibleSimilarUsers.some((item) => item.traveler.id === traveler.id)),
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
  const feedSavedDrops = visibleFollowedUsers
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
    followedTravelers: visibleFollowedUsers.map((item) =>
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
    similarTravelers: sortSuggestedTravelers([
      ...visibleSimilarUsers.map((item) => ({
        user: item.traveler,
        matchScore: item.matchScore,
        relevanceReason: item.relevanceReason,
      })),
      ...visibleFallbackTravelers
        .filter((traveler) =>
          !visibleFollowedUsers.some((follow) => follow.targetUser.id === traveler.id)
          && !visibleSimilarUsers.some((item) => item.traveler.id === traveler.id),
        )
        .slice(0, Math.max(0, 12 - visibleSimilarUsers.length))
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
    )),
    feedSavedDrops,
  };
}

export async function getFollowingFeed(userId?: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const blockedUserIds = await getBlockedUserIdsSet(currentUser.id);
  const todayCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const [acceptedFriendships, profileVibins] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: currentUser.id },
          { addresseeId: currentUser.id },
        ],
      },
      select: {
        requesterId: true,
        addresseeId: true,
        respondedAt: true,
        updatedAt: true,
      },
      orderBy: [
        { respondedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    }),
    prisma.vibin.groupBy({
      by: ['targetId'],
      where: {
        targetType: 'PROFILE',
      },
      _count: { _all: true },
    }),
  ]);
  const acceptedFriendIds = Array.from(
    new Set(
      acceptedFriendships.map((friendship) =>
        friendship.requesterId === currentUser.id
          ? friendship.addresseeId
          : friendship.requesterId
      ),
    ),
  );
  const feedParticipantIds = Array.from(new Set([currentUser.id, ...acceptedFriendIds]));
  const friendSortOrder = new Map(acceptedFriendIds.map((id, index) => [id, index]));
  const participantUsers = feedParticipantIds.length
    ? await prisma.user.findMany({
        where: {
          ...activeAccountWhere,
          id: { in: feedParticipantIds },
        },
        include: repositoryFeedUserInclude,
      })
    : [];
  const selfUser = participantUsers.find((user) => user.id === currentUser.id);
  const friendUsers = participantUsers.filter((user) => user.id !== currentUser.id);
  const followedUsers = friendUsers
    .sort((a, b) => (friendSortOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (friendSortOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    .map((targetUser) => ({ targetUser }));
  const vibinMap = new Map(profileVibins.map((item) => [item.targetId, item._count._all]));
  const visibleFollowedUsers = followedUsers.filter((item) => !blockedUserIds.has(item.targetUser.id) && isActiveAccount(item.targetUser));
  const followedUserIds = new Set(visibleFollowedUsers.map((item) => item.targetUser.id));
  const excludedSuggestedUserIds = new Set([
    currentUser.id,
    ...blockedUserIds,
    ...followedUserIds,
  ]);

  const followedPlaceIds = Array.from(new Set([
    ...visibleFollowedUsers.flatMap((item) => item.targetUser.bookmarks.map((bookmark) => bookmark.placeId)),
    ...visibleFollowedUsers.flatMap((item) => item.targetUser.moments.map((moment) => moment.placeId)),
    ...visibleFollowedUsers.flatMap((item) => item.targetUser.collections.flatMap((collection) => collection.places.map((entry) => entry.placeId))),
  ]));
  const followedPlaceOverrideMap = await getUserPlaceScoreOverrideMap(currentUser.id, followedPlaceIds);

  const followedTravelerDescriptors = await Promise.all(
    visibleFollowedUsers.map(async (item) => {
      const visibleMoments = item.targetUser.moments.filter(isRenderableImageMoment);
      const descriptor = await generateTravelerProfileDescriptor({
        userId: item.targetUser.id,
        displayName: item.targetUser.displayName,
        moments: visibleMoments.map(mapMomentForClient),
        bookmarkedPlaces: item.targetUser.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [item.targetUser.id, descriptor] as const;
    }),
  );
  const followedDescriptorMap = new Map(followedTravelerDescriptors);

  const followedTravelers = visibleFollowedUsers.map((item) =>
    {
      const visibleMoments = item.targetUser.moments.filter(isRenderableImageMoment);
      return trimTravelerForFeed(buildProfileUserWithMatch(
      item.targetUser,
      visibleMoments.map((moment) => {
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
        latestVisitedAtIso: visibleMoments[0]?.visitedAt?.toISOString?.() ?? visibleMoments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: visibleMoments.length,
        savedPlacesCount: item.targetUser._count.bookmarks,
        collectionsCount: item.targetUser._count.collections,
      },
    ));
    }
  );

  let selfTraveler: ReturnType<typeof trimTravelerForFeed> | null = null;
  if (selfUser && isActiveAccount(selfUser)) {
    const visibleMoments = selfUser.moments.filter(isRenderableImageMoment);
    selfTraveler = trimTravelerForFeed(buildProfileUserWithMatch(
      selfUser,
      visibleMoments.map((moment) => {
        const mappedMoment = mapMomentForClient(moment);
        return {
          ...mappedMoment,
          place: mapPlaceForClient(moment.place),
        };
      }),
      undefined,
      {
        vibinCount: vibinMap.get(selfUser.id) ?? 0,
        recentSavedPlaces: selfUser.bookmarks.map((bookmark) => ({
          place: mapPlaceForClient(bookmark.place),
          savedAtLabel: formatRelativeActivityLabel(bookmark.createdAt),
          savedAtIso: bookmark.createdAt.toISOString(),
        })),
        recentCollections: selfUser.collections.map((collection) => ({
          id: collection.id,
          label: collection.title,
          createdAt: collection.createdAt.toISOString(),
          places: collection.places.map((entry) => mapPlaceForClient(entry.place)),
        })),
        latestVisitedAtIso: visibleMoments[0]?.visitedAt?.toISOString?.() ?? visibleMoments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: visibleMoments.length,
        savedPlacesCount: selfUser._count.bookmarks,
        collectionsCount: selfUser._count.collections,
      },
    ));
  }

  const travelerMap = new Map([
    ...followedTravelers.map((traveler) => [traveler.id, traveler] as const),
    ...(selfTraveler ? [[selfTraveler.id, selfTraveler] as const] : []),
  ]);

  const feedPosts = feedParticipantIds.length
    ? await prisma.feedPost.findMany({
      where: {
        createdAt: { gte: todayCutoff },
        OR: [
          {
            userId: currentUser.id,
          },
          {
            userId: { in: Array.from(followedUserIds) },
            privacy: { in: ['PUBLIC', 'FOLLOWERS'] },
          },
        ],
      },
        include: repositoryFeedPostInclude,
        orderBy: [
          { createdAt: 'desc' },
          { visitedAt: 'desc' },
        ],
        take: 80,
      })
    : [];

  const items = feedPosts
    .map((feedPost) => {
      const traveler = travelerMap.get(feedPost.userId);
      if (!traveler) return null;

      return {
        id: `feed-post-${feedPost.id}`,
        type: 'visited' as const,
        traveler,
        timestampLabel: formatRelativeActivityLabel(feedPost.createdAt),
        sortTimestamp: feedPost.createdAt.toISOString(),
        place: mapFeedPostPlaceForClient(feedPost),
        collection: null,
        caption: feedPost.caption || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const aTime = a.sortTimestamp ? new Date(a.sortTimestamp).getTime() : 0;
      const bTime = b.sortTimestamp ? new Date(b.sortTimestamp).getTime() : 0;
      return bTime - aTime;
    });

  const fallbackFriendFeedPosts = followedUserIds.size
    ? await prisma.feedPost.findMany({
      where: {
        userId: { in: Array.from(followedUserIds) },
        privacy: { in: ['PUBLIC', 'FOLLOWERS'] },
        createdAt: { lt: todayCutoff },
      },
        include: repositoryFeedPostInclude,
        orderBy: [
          { createdAt: 'desc' },
          { visitedAt: 'desc' },
        ],
        take: 12,
      })
    : [];

  const fallbackItems = fallbackFriendFeedPosts
    .map((feedPost) => {
      const traveler = travelerMap.get(feedPost.userId);
      if (!traveler) return null;

      return {
        id: `fallback-feed-post-${feedPost.id}`,
        type: 'visited' as const,
        traveler,
        timestampLabel: formatRelativeActivityLabel(feedPost.createdAt),
        sortTimestamp: feedPost.createdAt.toISOString(),
        place: mapFeedPostPlaceForClient(feedPost),
        collection: null,
        caption: feedPost.caption || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.traveler.id === item.traveler.id) === index)
    .slice(0, 3);

  const suggestedFeedPosts = await prisma.feedPost.findMany({
    where: {
      privacy: 'PUBLIC',
      userId: {
        notIn: Array.from(excludedSuggestedUserIds),
      },
      user: activeAccountWhere,
      createdAt: { gte: todayCutoff },
    },
    include: {
      ...repositoryFeedPostInclude,
      user: {
        include: repositoryFeedUserInclude,
      },
    },
    orderBy: [
      { createdAt: 'desc' },
      { visitedAt: 'desc' },
    ],
    take: 24,
  });

  const suggestedMomentIds = suggestedFeedPosts
    .map((feedPost) => feedPost.sourceMomentId)
    .filter((value): value is string => Boolean(value));
  const suggestedMomentVibins = suggestedMomentIds.length
    ? await prisma.vibin.groupBy({
        by: ['targetId'],
        where: {
          targetType: 'MOMENT',
          targetId: { in: suggestedMomentIds },
        },
        _count: { _all: true },
      })
    : [];
  const suggestedMomentComments = suggestedMomentIds.length
    ? await prisma.comment.groupBy({
        by: ['targetId'],
        where: {
          targetType: 'MOMENT',
          targetId: { in: suggestedMomentIds },
        },
        _count: { _all: true },
      })
    : [];
  const suggestedMomentVibinMap = new Map(suggestedMomentVibins.map((item) => [item.targetId, item._count._all]));
  const suggestedMomentCommentMap = new Map(suggestedMomentComments.map((item) => [item.targetId, item._count._all]));

  const suggestedMomentUserDescriptors = await Promise.all(
    Array.from(new Map(suggestedFeedPosts.map((feedPost) => [feedPost.user.id, feedPost.user])).values()).map(async (traveler) => {
      const visibleMoments = traveler.moments.filter(isRenderableImageMoment);
      const descriptor = await generateTravelerProfileDescriptor({
        userId: traveler.id,
        displayName: traveler.displayName,
        moments: visibleMoments.map(mapMomentForClient),
        bookmarkedPlaces: traveler.bookmarks.map((bookmark) => mapPlaceForClient(bookmark.place)),
      });
      return [traveler.id, descriptor] as const;
    }),
  );
  const suggestedMomentDescriptorMap = new Map(suggestedMomentUserDescriptors);
  const suggestedMomentTravelerMap = new Map(
    Array.from(new Map(suggestedFeedPosts.map((feedPost) => [feedPost.user.id, feedPost.user])).values()).map((traveler) => {
      const visibleMoments = traveler.moments.filter(isRenderableImageMoment);
      return [
        traveler.id,
        trimTravelerForFeed(buildProfileUserWithMatch(
          traveler,
          visibleMoments.map(mapMomentForClient),
          undefined,
          {
            vibinCount: vibinMap.get(traveler.id) ?? 0,
            descriptor: suggestedMomentDescriptorMap.get(traveler.id),
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
            latestVisitedAtIso: visibleMoments[0]?.visitedAt?.toISOString?.() ?? visibleMoments[0]?.createdAt?.toISOString?.(),
            visitedPlacesCount: visibleMoments.length,
            savedPlacesCount: traveler._count.bookmarks,
            collectionsCount: traveler._count.collections,
          },
        )),
      ] as const;
    }),
  );

  const suggestedItems = suggestedFeedPosts
    .map((feedPost) => {
      const traveler = suggestedMomentTravelerMap.get(feedPost.user.id);
      if (!traveler) return null;

      const interactionTargetId = feedPost.sourceMomentId ?? '';
      const vibinCount = interactionTargetId ? (suggestedMomentVibinMap.get(interactionTargetId) ?? 0) : 0;
      const commentCount = interactionTargetId ? (suggestedMomentCommentMap.get(interactionTargetId) ?? 0) : 0;
      const ageHours = Math.max(1, (Date.now() - feedPost.createdAt.getTime()) / (1000 * 60 * 60));
      const freshnessBonus = 48 / ageHours;
      const popularityScore = (vibinCount * 3) + (commentCount * 2) + freshnessBonus;

      return {
        id: `suggested-feed-post-${feedPost.id}`,
        type: 'visited' as const,
        traveler,
        timestampLabel: formatRelativeActivityLabel(feedPost.createdAt),
        sortTimestamp: feedPost.createdAt.toISOString(),
        place: mapFeedPostPlaceForClient(feedPost),
        collection: null,
        caption: feedPost.caption || null,
        popularityScore,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.traveler.id === item.traveler.id) === index)
    .slice(0, 3)
    .map(({ popularityScore: _popularityScore, ...item }) => item);

  return {
    followedTravelers,
    suggestedTravelers: [],
    items,
    fallbackItems,
    suggestedItems,
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
        activeAccountWhere,
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
      const visibleMoments = user.moments.filter(isRenderableImageMoment);
      const moments = visibleMoments.map(mapMomentForClient);
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
        latestVisitedAtIso: visibleMoments[0]?.visitedAt?.toISOString?.() ?? visibleMoments[0]?.createdAt?.toISOString?.(),
        visitedPlacesCount: visibleMoments.length,
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
      ...activeAccountWhere,
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

  return sortSuggestedTravelers(travelers);
}

export async function getTravelerProfile(travelerId: string, viewerUserId?: string) {
  if (viewerUserId) {
    const blockedUserIds = await getBlockedUserIdsSet(viewerUserId);
    if (blockedUserIds.has(travelerId)) {
      return null;
    }
  }

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
      feedPosts: {
        where: {
          privacy: 'PUBLIC',
        },
        orderBy: { visitedAt: 'desc' },
        include: repositoryFeedPostInclude,
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

  const moments = traveler.feedPosts.map(mapFeedPostForClient);

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
        latestVisitedAtIso: traveler.feedPosts[0]?.visitedAt?.toISOString?.(),
        visitedPlacesCount: traveler.feedPosts.length,
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
    inspirationMedia: buildTravelerInspirationMedia(traveler, traveler.moments.filter(isRenderableImageMoment)),
  };
}

export async function getTravelerFollowers(travelerId: string, viewerUserId?: string) {
  const blockedUserIds = viewerUserId ? await getBlockedUserIdsSet(viewerUserId) : new Set<string>();
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
    followers
      .filter((follow) => !blockedUserIds.has(follow.sourceUser.id))
      .map(async (follow) => {
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

    const placeTargetIds = notifications
      .filter((item) => item.targetType === 'PLACE' && item.targetId)
      .map((item) => item.targetId!) as string[];
    const momentTargetIds = notifications
      .filter((item) => (item.targetType === 'MOMENT' || item.targetType === 'PLACE_VISIT') && item.targetId)
      .map((item) => item.targetId!) as string[];

    const [places, moments] = await Promise.all([
      placeTargetIds.length > 0
        ? client.place.findMany({
            where: { id: { in: Array.from(new Set(placeTargetIds)) } },
            include: repositoryPlaceDetailInclude,
          })
        : Promise.resolve([]),
      momentTargetIds.length > 0
        ? client.moment.findMany({
            where: { id: { in: Array.from(new Set(momentTargetIds)) } },
            include: {
              place: {
                include: repositoryPlaceDetailInclude,
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const placeById = new Map(places.map((place) => [place.id, mapPlaceForClient(place)]));
    const momentPlaceById = new Map(moments.map((moment) => [moment.id, mapPlaceForClient(moment.place)]));

    return notifications.map((item) => {
      const resolvedPlace =
        item.targetType === 'PLACE' && item.targetId
          ? placeById.get(item.targetId) ?? undefined
          : item.targetType === 'MOMENT' || item.targetType === 'PLACE_VISIT'
            ? (item.targetId ? momentPlaceById.get(item.targetId) ?? undefined : undefined)
            : undefined;
      const placeContext =
        item.targetType === 'PLACE'
          ? 'saved'
          : item.targetType === 'MOMENT' || item.targetType === 'PLACE_VISIT'
            ? 'visited'
            : null;
      const messageKind =
        item.type === 'FOLLOW'
          ? 'follow'
          : String(item.type) === 'CHAT_MESSAGE'
            ? 'chat'
          : item.type === 'VIBIN'
            ? placeContext === 'saved'
              ? 'vibin_saved'
              : placeContext === 'visited'
                ? 'vibin_visited'
                : 'vibin'
            : item.type === 'COMMENT'
              ? placeContext === 'saved'
                ? 'comment_saved'
                : placeContext === 'visited'
                  ? 'comment_visited'
                  : 'comment'
              : item.type === 'SYSTEM'
                ? 'system'
                : 'generic';

      return {
        id: item.id,
        notificationType: item.type,
        messageKind,
        targetType: item.targetType,
        targetId: item.targetId,
        type: item.targetType === 'PLACE' ? 'place' : 'traveler',
        avatar: item.actorUser?.avatarUrl ?? store.me.avatar,
        title: item.title,
        body: item.body,
        time: item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
        actor: item.actorUser
          ? {
              id: item.actorUser.id,
              username: item.actorUser.username,
              displayName: item.actorUser.displayName ?? item.actorUser.username,
              avatar: item.actorUser.avatarUrl,
            }
          : null,
        placeTitle: resolvedPlace?.name ?? null,
        placeContext,
        place: resolvedPlace,
        traveler: item.targetType === 'PROFILE' && item.actorUser
          ? {
              id: item.actorUser.id,
              username: item.actorUser.username,
              displayName: item.actorUser.displayName ?? item.actorUser.username,
              bio: item.actorUser.bio,
              avatar: item.actorUser.avatarUrl,
            }
          : undefined,
      };
    });
  });

  if (dbResult) return dbResult;

  return store.notifications.map((item) => {
    if (item.type === 'place') {
      const resolvedPlace = findPlaceById(item.placeId);
      return {
        ...item,
        notificationType: 'SYSTEM',
        messageKind: 'system',
        targetType: 'PLACE',
        targetId: item.placeId,
        createdAt: item.time,
        readAt: null,
        actor: null,
        placeTitle: resolvedPlace?.name ?? null,
        placeContext: 'saved',
        place: resolvedPlace,
      };
    }

    const traveler = findTravelerById(item.travelerId);
    return {
      ...item,
      notificationType: 'FOLLOW',
      messageKind: 'follow',
      targetType: 'PROFILE',
      targetId: item.travelerId,
      createdAt: item.time,
      readAt: null,
      actor: traveler
        ? {
            id: traveler.id,
            username: traveler.username,
            displayName: traveler.displayName ?? traveler.username,
            avatar: traveler.avatar,
          }
        : null,
      traveler,
    };
  });
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

export async function updateCollection(
  userId: string | undefined,
  collectionId: string,
  payload: { label?: string; placeIds?: string[] },
) {
  const currentUser = await getCurrentUser(prisma, userId);
  const normalizedTitle = typeof payload.label === 'string' ? payload.label.trim() : undefined;
  const normalizedPlaceIds = Array.isArray(payload.placeIds)
    ? Array.from(new Set(payload.placeIds.filter(Boolean)))
    : undefined;

  if (normalizedTitle !== undefined && normalizedTitle.length === 0) {
    throw new Error('Collection title required');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.collection.findFirst({
      where: { id: collectionId, userId: currentUser.id },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('Collection not found');
    }

    await tx.collection.update({
      where: { id: collectionId },
      data: {
        ...(normalizedTitle !== undefined ? { title: normalizedTitle } : {}),
      },
    });

    if (normalizedPlaceIds !== undefined) {
      await tx.collectionPlace.deleteMany({ where: { collectionId } });
      if (normalizedPlaceIds.length > 0) {
        await tx.collectionPlace.createMany({
          data: normalizedPlaceIds.map((placeId, index) => ({
            collectionId,
            placeId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    return tx.collection.findUnique({
      where: { id: collectionId },
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
  });

  if (!updated) {
    throw new Error('Collection not found');
  }

  const userPlaceScoreOverrideMap = await getUserPlaceScoreOverrideMap(
    currentUser.id,
    updated.places.map((item) => item.placeId),
  );

  return {
    id: updated.id,
    label: updated.title,
    createdAt: updated.createdAt.toISOString(),
    places: updated.places.map((item) => mapPlaceForClient(
      item.place,
      getPlaceScoreOverride(userPlaceScoreOverrideMap, item.placeId),
    )),
  };
}

export async function deleteCollection(userId: string | undefined, collectionId: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const existing = await prisma.collection.findFirst({
    where: { id: collectionId, userId: currentUser.id },
    select: { id: true },
  });
  if (!existing) {
    throw new Error('Collection not found');
  }
  await prisma.collection.delete({ where: { id: collectionId } });
  return { ok: true };
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

  const activeBookmarks = bookmarks.filter((bookmark) => resolveBookmarkExpiresAt(bookmark) > new Date());

  return {
    bookmarks: activeBookmarks.map((bookmark) => mapPlaceForClient(
      bookmark.place,
      getPlaceScoreOverride(persistedScoreMap, bookmark.placeId),
    )),
    entries: activeBookmarks.map((bookmark) => mapBookmarkEntryForClient(
      bookmark,
      getPlaceScoreOverride(persistedScoreMap, bookmark.placeId),
    )),
  };
}

async function syncFeedPostForMoment(moment: MomentWithRelations) {
  const primaryImage = getRenderableImageMedia(moment.media);
  if (!primaryImage) {
    await prisma.feedPost.deleteMany({
      where: { sourceMomentId: moment.id },
    });
    return;
  }

  await prisma.feedPost.upsert({
    where: {
      sourceMomentId: moment.id,
    },
    create: {
      userId: moment.userId,
      placeId: moment.placeId,
      sourceMomentId: moment.id,
      imageUrl: primaryImage.url,
      thumbnailUrl: primaryImage.thumbnailUrl ?? primaryImage.url,
      caption: moment.caption,
      ratingLabel: moment.ratingLabel,
      threeWordReview: moment.caption,
      privacy: moment.privacy,
      visitedAt: moment.visitedAt,
    },
    update: {
      userId: moment.userId,
      placeId: moment.placeId,
      imageUrl: primaryImage.url,
      thumbnailUrl: primaryImage.thumbnailUrl ?? primaryImage.url,
      caption: moment.caption,
      ratingLabel: moment.ratingLabel,
      threeWordReview: moment.caption,
      privacy: moment.privacy,
      visitedAt: moment.visitedAt,
    },
  });
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
      ratingLabel: mapMomentRatingLabel(payload.ratingLabel),
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

  await syncFeedPostForMoment(moment);

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
      ratingLabel: payload.ratingLabel ? mapMomentRatingLabel(payload.ratingLabel) : existing.ratingLabel,
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

  await syncFeedPostForMoment(moment);

  return mapMomentForClient(moment);
}

export async function deleteMoment(userId: string | undefined, id: string) {
  const currentUser = await getCurrentUser(prisma, userId);
  const existing = await prisma.moment.findFirst({
    where: {
      id,
      userId: currentUser.id,
    },
    select: {
      id: true,
      placeId: true,
    },
  });

  if (!existing) {
    return null;
  }

  await prisma.$transaction([
    prisma.feedPost.deleteMany({
      where: {
        sourceMomentId: existing.id,
      },
    }),
    prisma.comment.deleteMany({
      where: {
        OR: [
          { momentId: existing.id },
          { targetType: 'MOMENT', targetId: existing.id },
        ],
      },
    }),
    prisma.vibin.deleteMany({
      where: {
        OR: [
          { momentId: existing.id },
          { targetType: 'MOMENT', targetId: existing.id },
        ],
      },
    }),
    prisma.moment.delete({
      where: { id: existing.id },
    }),
  ]);

  return {
    placeId: existing.placeId,
  };
}
