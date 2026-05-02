import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { createMoment } from './repository';

const decisionPrisma = prisma as any;

type DecisionEntryMode = 'mood' | 'decide_for_me' | 'try_this_vibe';
type DecisionSwipeDirection = 'left' | 'right';
type DecisionRatingLabel = 'disliked' | 'not_bad' | 'liked' | 'recommended';

type DecisionIntentDefinition = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  withValue: DecisionWithValue;
  feelValue: DecisionFeelValue;
  stateValue: DecisionStateValue;
  primaryPreferenceCategories: string[];
  discoveryQueryKeywords: string[];
  facetWeights: {
    coffeeQuality: number;
    quickStop: number;
    stayAwhile: number;
    social: number;
    aesthetic: number;
    budgetFriendly: number;
    sweetPairing: number;
  };
};

type DecisionWithValue = 'alone' | 'friends' | 'dating' | 'work';
type DecisionFeelValue = 'chill' | 'quiet' | 'social' | 'lowkey' | 'great';
type DecisionStateValue = 'quick' | 'stay' | 'near' | 'no_plan';

type DecisionSelectionValues = {
  withValue: DecisionWithValue;
  feelValue: DecisionFeelValue;
  stateValue: DecisionStateValue;
};

type DecisionTargetTraitKey =
  | 'quiet'
  | 'social'
  | 'solo'
  | 'cozy'
  | 'work'
  | 'date'
  | 'utilitarian'
  | 'quality'
  | 'quickReady'
  | 'stayReady'
  | 'budgetFriendly';

type DecisionTargetTraitWeights = Partial<Record<DecisionTargetTraitKey, number>>;

type DecisionTargetTraitProfile = {
  target: DecisionTargetTraitWeights;
  weights: DecisionTargetTraitWeights;
};

type DecisionConstraintProfile = {
  cityKey: string;
  coffeeRequired: boolean;
  openNowRequired: boolean;
  dineInRequired: boolean;
  stayReadyRequired: boolean;
  maxDistanceMiles: number | null;
  maxQuickDistanceMiles: number | null;
};

type DecisionRequestProfile = {
  id: string;
  selection: DecisionSelectionValues;
  constraints: DecisionConstraintProfile;
  withProfile: DecisionTargetTraitProfile;
  feelProfile: DecisionTargetTraitProfile;
  stateProfile: DecisionTargetTraitProfile;
};

type ResolvedPlaceTraits = {
  quiet: number;
  social: number;
  solo: number;
  cozy: number;
  work: number;
  date: number;
  utilitarian: number;
  quality: number;
  quickReady: number;
  stayReady: number;
  budgetFriendly: number;
  confidence: number;
  source: 'heuristic' | 'ai_ready';
  archetype: string;
  evidence: string[];
};

type DecisionFinalScoreWeights = {
  withFit: number;
  feelFit: number;
  stateFit: number;
  personalFit: number;
  contextFit: number;
  placeQuality: number;
  frictionPenalty: number;
  rotationPenalty: number;
  freshnessBonus: number;
  intentSpecificBonus: number;
};

const DECISION_PLACE_INCLUDE = Prisma.validator<Prisma.PlaceInclude>()({
  location: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  aiEnrichment: true,
  traitProfile: true,
  media: {
    orderBy: {
      sortOrder: 'asc',
    },
    take: 1,
  },
  discoverySignals: {
    orderBy: [
      { bestResultRank: 'asc' },
      { resultRank: 'asc' },
      { createdAt: 'asc' },
    ],
  },
});

type PlaceCandidate = Prisma.PlaceGetPayload<{
  include: typeof DECISION_PLACE_INCLUDE;
}>;

type UserDecisionProfile = {
  selectedInterests: string[];
  bookmarkedPlaceIds: Set<string>;
  bookmarkedCategoryKeywords: Set<string>;
  momentPlaceIds: Set<string>;
  neighborhoodAffinity: Set<string>;
  priceLevels: number[];
  recentExposureByPlaceId: Map<string, Date[]>;
  recentChosenByPlaceId: Map<string, Date[]>;
  recentSkippedByPlaceId: Map<string, Date[]>;
};

type DecisionScoreBreakdown = {
  withFit: number;
  feelFit: number;
  stateFit: number;
  intentFit: number;
  traitMatch?: number;
  personalFit: number;
  contextFit: number;
  placeQuality: number;
  frictionPenalty: number;
  rotationPenalty: number;
  freshnessBonus: number;
  finalScore: number;
  matchedSignals: string[];
  placeTraits?: {
    quiet: number;
    social: number;
    solo: number;
    cozy: number;
    work: number;
    date: number;
    utilitarian: number;
    quality: number;
    quickReady: number;
    stayReady: number;
    budgetFriendly: number;
    confidence: number;
    source: string;
    archetype: string;
  };
};

type TraitEvidenceByTrait = Partial<Record<
  'quiet' | 'social' | 'solo' | 'cozy' | 'work' | 'date' | 'utilitarian' | 'quality',
  string
>>;

type RankedCandidate = {
  place: PlaceCandidate;
  distanceMiles: number;
  reasonLabel: string;
  breakdown: DecisionScoreBreakdown;
};

type DecisionSessionResponse = {
  session: {
    id: string;
    status: string;
    cityKey: string;
    cityLabel: string;
    entryMode: string;
    intentId: string;
    swapCount: number;
    skipCount: number;
    expiresAt: string | null;
  };
  options: ReturnType<typeof mapDecisionOptionForClient>[];
  debug?: Record<string, unknown>;
};

const DECISION_SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const DECISION_SAVE_TTL_MS = 1000 * 60 * 60 * 24;
const DECISION_RECENT_EXPOSURE_WINDOWS = [1, 3, 7];
const DECISION_MIN_WITH_FIT = 0.38;
const DECISION_MIN_FEEL_FIT = 0.4;
const DECISION_MIN_STATE_FIT = 0.36;
const DECISION_MIN_FINAL_SCORE = 42;

const CITY_CONFIG: Record<string, {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  aliases: string[];
}> = {
  boston: {
    key: 'boston',
    label: 'Boston',
    latitude: 42.3601,
    longitude: -71.0589,
    aliases: ['boston'],
  },
  new_york: {
    key: 'new_york',
    label: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    aliases: ['new york', 'new_york', 'nyc'],
  },
  jakarta: {
    key: 'jakarta',
    label: 'Jakarta',
    latitude: -6.2088,
    longitude: 106.8456,
    aliases: ['jakarta'],
  },
  bandung: {
    key: 'bandung',
    label: 'Bandung',
    latitude: -6.9175,
    longitude: 107.6191,
    aliases: ['bandung'],
  },
};

const DECISION_WITH_VALUES: DecisionWithValue[] = ['alone', 'friends', 'dating', 'work'];
const DECISION_FEEL_VALUES: DecisionFeelValue[] = ['chill', 'quiet', 'social', 'lowkey', 'great'];
const DECISION_STATE_VALUES: DecisionStateValue[] = ['quick', 'stay', 'near', 'no_plan'];

const LEGACY_INTENT_SELECTION_MAP: Record<string, DecisionSelectionValues> = {
  good_coffee: { withValue: 'alone', feelValue: 'great', stateValue: 'no_plan' },
  quick_coffee: { withValue: 'alone', feelValue: 'lowkey', stateValue: 'quick' },
  focus_and_work: { withValue: 'work', feelValue: 'quiet', stateValue: 'stay' },
  catch_up: { withValue: 'friends', feelValue: 'social', stateValue: 'stay' },
  cozy_reset: { withValue: 'alone', feelValue: 'chill', stateValue: 'stay' },
  sweet_coffee_break: { withValue: 'dating', feelValue: 'great', stateValue: 'stay' },
  treat_myself: { withValue: 'dating', feelValue: 'great', stateValue: 'no_plan' },
  cheap_and_easy: { withValue: 'alone', feelValue: 'lowkey', stateValue: 'near' },
};

function normalizeKeyword(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityKey(value?: string | null) {
  const normalized = normalizeKeyword(value);
  for (const config of Object.values(CITY_CONFIG)) {
    if (config.aliases.includes(normalized)) {
      return config.key;
    }
  }
  return null;
}

function normalizeDecisionValue(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeIntentId(value?: string | null) {
  return normalizeDecisionValue(value);
}

function normalizeWithValue(value?: string | null): DecisionWithValue | null {
  const normalized = normalizeDecisionValue(value);
  return DECISION_WITH_VALUES.includes(normalized as DecisionWithValue)
    ? normalized as DecisionWithValue
    : null;
}

function normalizeFeelValue(value?: string | null): DecisionFeelValue | null {
  const normalized = normalizeDecisionValue(value);
  return DECISION_FEEL_VALUES.includes(normalized as DecisionFeelValue)
    ? normalized as DecisionFeelValue
    : null;
}

function normalizeStateValue(value?: string | null): DecisionStateValue | null {
  const normalized = normalizeDecisionValue(value);
  return DECISION_STATE_VALUES.includes(normalized as DecisionStateValue)
    ? normalized as DecisionStateValue
    : null;
}

function titleCase(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getCityConfig(value?: string | null) {
  const key = normalizeCityKey(value);
  return key ? CITY_CONFIG[key] : null;
}

function resolveSelectionValues(input: {
  intentId?: string | null;
  withValue?: string | null;
  feelValue?: string | null;
  stateValue?: string | null;
}): DecisionSelectionValues {
  const directSelection = {
    withValue: normalizeWithValue(input.withValue),
    feelValue: normalizeFeelValue(input.feelValue),
    stateValue: normalizeStateValue(input.stateValue),
  };

  if (directSelection.withValue && directSelection.feelValue && directSelection.stateValue) {
    return {
      withValue: directSelection.withValue,
      feelValue: directSelection.feelValue,
      stateValue: directSelection.stateValue,
    };
  }

  const normalizedIntentId = normalizeIntentId(input.intentId);
  const derivedParts = normalizedIntentId.split('_');
  if (derivedParts.length >= 3) {
    const possibleState = derivedParts.slice(2).join('_');
    const withValue = normalizeWithValue(derivedParts[0]);
    const feelValue = normalizeFeelValue(derivedParts[1]);
    const stateValue = normalizeStateValue(possibleState);
    if (withValue && feelValue && stateValue) {
      return { withValue, feelValue, stateValue };
    }
  }

  if (LEGACY_INTENT_SELECTION_MAP[normalizedIntentId]) {
    return LEGACY_INTENT_SELECTION_MAP[normalizedIntentId];
  }

  return {
    withValue: directSelection.withValue ?? 'alone',
    feelValue: directSelection.feelValue ?? 'chill',
    stateValue: directSelection.stateValue ?? 'no_plan',
  };
}

function buildDecisionFacetWeights(selection: DecisionSelectionValues): DecisionIntentDefinition['facetWeights'] {
  const feelWeights: Record<DecisionFeelValue, DecisionIntentDefinition['facetWeights']> = {
    chill: {
      coffeeQuality: 0.24,
      quickStop: 0.08,
      stayAwhile: 0.2,
      social: 0.08,
      aesthetic: 0.18,
      budgetFriendly: 0.08,
      sweetPairing: 0.14,
    },
    quiet: {
      coffeeQuality: 0.24,
      quickStop: 0.06,
      stayAwhile: 0.26,
      social: 0.03,
      aesthetic: 0.14,
      budgetFriendly: 0.11,
      sweetPairing: 0.08,
    },
    social: {
      coffeeQuality: 0.2,
      quickStop: 0.08,
      stayAwhile: 0.14,
      social: 0.28,
      aesthetic: 0.14,
      budgetFriendly: 0.06,
      sweetPairing: 0.1,
    },
    lowkey: {
      coffeeQuality: 0.2,
      quickStop: 0.18,
      stayAwhile: 0.12,
      social: 0.06,
      aesthetic: 0.12,
      budgetFriendly: 0.18,
      sweetPairing: 0.08,
    },
    great: {
      coffeeQuality: 0.32,
      quickStop: 0.05,
      stayAwhile: 0.12,
      social: 0.08,
      aesthetic: 0.18,
      budgetFriendly: 0.02,
      sweetPairing: 0.12,
    },
  };

  const weights = { ...feelWeights[selection.feelValue] };

  if (selection.withValue === 'friends') {
    weights.social += 0.1;
    weights.stayAwhile += 0.05;
    weights.quickStop -= 0.03;
  } else if (selection.withValue === 'dating') {
    weights.aesthetic += 0.08;
    weights.sweetPairing += 0.06;
    weights.budgetFriendly -= 0.03;
  } else if (selection.withValue === 'work') {
    weights.stayAwhile += 0.1;
    weights.coffeeQuality += 0.06;
    weights.social -= 0.06;
  } else {
    weights.quickStop += 0.04;
    weights.budgetFriendly += 0.02;
  }

  if (selection.stateValue === 'quick') {
    weights.quickStop += 0.14;
    weights.stayAwhile -= 0.08;
  } else if (selection.stateValue === 'stay') {
    weights.stayAwhile += 0.12;
    weights.quickStop -= 0.05;
  } else if (selection.stateValue === 'near') {
    weights.quickStop += 0.12;
    weights.budgetFriendly += 0.04;
  } else {
    weights.coffeeQuality += 0.04;
    weights.aesthetic += 0.02;
  }

  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(value, 0), 0) || 1;
  return {
    coffeeQuality: Math.max(weights.coffeeQuality, 0) / total,
    quickStop: Math.max(weights.quickStop, 0) / total,
    stayAwhile: Math.max(weights.stayAwhile, 0) / total,
    social: Math.max(weights.social, 0) / total,
    aesthetic: Math.max(weights.aesthetic, 0) / total,
    budgetFriendly: Math.max(weights.budgetFriendly, 0) / total,
    sweetPairing: Math.max(weights.sweetPairing, 0) / total,
  };
}

function buildDecisionIntentDefinition(selection: DecisionSelectionValues): DecisionIntentDefinition {
  const title = `${titleCase(selection.feelValue)} pick`;
  const subtitle = `${titleCase(selection.withValue)} + ${titleCase(selection.stateValue)}`;
  const icon = selection.feelValue === 'quiet'
    ? 'moon.stars.fill'
    : selection.feelValue === 'social'
      ? 'person.2.fill'
      : selection.feelValue === 'great'
        ? 'sparkles.rectangle.stack.fill'
        : selection.feelValue === 'lowkey'
          ? 'sparkles'
          : 'cup.and.saucer.fill';

  const primaryPreferenceCategories = new Set<string>(['good_coffee']);
  const discoveryQueryKeywords = new Set<string>(['coffee', 'cafe']);

  if (selection.feelValue === 'quiet') {
    discoveryQueryKeywords.add('quiet');
    discoveryQueryKeywords.add('calm');
  }
  if (selection.feelValue === 'social') {
    primaryPreferenceCategories.add('aesthetic_cafes');
    discoveryQueryKeywords.add('brunch');
    discoveryQueryKeywords.add('hangout');
  }
  if (selection.feelValue === 'chill' || selection.feelValue === 'great') {
    primaryPreferenceCategories.add('aesthetic_cafes');
  }
  if (selection.feelValue === 'great' || selection.withValue === 'dating') {
    primaryPreferenceCategories.add('desserts_sweet_treats');
    discoveryQueryKeywords.add('dessert');
    discoveryQueryKeywords.add('bakery');
  }
  if (selection.withValue === 'work') {
    discoveryQueryKeywords.add('work friendly');
    discoveryQueryKeywords.add('study');
  }
  if (selection.stateValue === 'quick' || selection.stateValue === 'near') {
    discoveryQueryKeywords.add('espresso');
    discoveryQueryKeywords.add('grab and go');
  }

  return {
    id: `${selection.withValue}_${selection.feelValue}_${selection.stateValue}`,
    title,
    subtitle,
    icon,
    withValue: selection.withValue,
    feelValue: selection.feelValue,
    stateValue: selection.stateValue,
    primaryPreferenceCategories: Array.from(primaryPreferenceCategories),
    discoveryQueryKeywords: Array.from(discoveryQueryKeywords),
    facetWeights: buildDecisionFacetWeights(selection),
  };
}

function getDecisionFinalScoreWeights(intent: DecisionIntentDefinition): DecisionFinalScoreWeights {
  const base: DecisionFinalScoreWeights = {
    withFit: 0.24,
    feelFit: 0.28,
    stateFit: 0.18,
    personalFit: 0.12,
    contextFit: 0.07,
    placeQuality: 0.11,
    frictionPenalty: -0.13,
    rotationPenalty: -0.1,
    freshnessBonus: 0.03,
    intentSpecificBonus: 0.08,
  };

  if (intent.withValue === 'dating') {
    return {
      ...base,
      withFit: 0.31,
      feelFit: 0.26,
      stateFit: 0.16,
      personalFit: 0.1,
      contextFit: 0.05,
      placeQuality: 0.07,
      frictionPenalty: -0.12,
      rotationPenalty: -0.08,
      freshnessBonus: 0.02,
      intentSpecificBonus: 0.12,
    };
  }

  if (intent.withValue === 'alone') {
    return {
      ...base,
      withFit: 0.29,
      feelFit: 0.24,
      stateFit: 0.18,
      personalFit: 0.12,
      contextFit: 0.08,
      placeQuality: 0.08,
      frictionPenalty: -0.13,
      rotationPenalty: -0.1,
      freshnessBonus: 0.03,
      intentSpecificBonus: 0.07,
    };
  }

  if (intent.withValue === 'work') {
    return {
      ...base,
      withFit: 0.3,
      feelFit: 0.24,
      stateFit: 0.2,
      personalFit: 0.11,
      contextFit: 0.08,
      placeQuality: 0.07,
      frictionPenalty: -0.13,
      rotationPenalty: -0.1,
      freshnessBonus: 0.02,
      intentSpecificBonus: 0.08,
    };
  }

  return base;
}

function getIntentDefinition(intentId?: string | null) {
  return buildDecisionIntentDefinition(resolveSelectionValues({ intentId }));
}

function resolveIntentDefinitionOrThrow(input: {
  intentId?: string | null;
  withValue?: string | null;
  feelValue?: string | null;
  stateValue?: string | null;
}) {
  return buildDecisionIntentDefinition(resolveSelectionValues(input));
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

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

function inferThumbnailUrl(place: PlaceCandidate) {
  return place.primaryImageUrl
    ?? place.media[0]?.url
    ?? null;
}

function inferBestSignal(place: PlaceCandidate) {
  return place.discoverySignals.reduce<PlaceCandidate['discoverySignals'][number] | null>((best, signal) => {
    if (!best) return signal;
    const bestRank = best.bestResultRank ?? best.resultRank ?? 9999;
    const signalRank = signal.bestResultRank ?? signal.resultRank ?? 9999;
    if (signalRank !== bestRank) return signalRank < bestRank ? signal : best;
    return signal.createdAt < best.createdAt ? signal : best;
  }, null);
}

function deriveNeighborhood(place: PlaceCandidate) {
  return place.neighborhood?.trim()
    || place.adminAreaLevel4?.trim()
    || place.city?.trim()
    || place.location?.name?.trim()
    || null;
}

function buildCompactPriceLabel(place: PlaceCandidate) {
  const start = place.googlePriceRangeStart;
  const end = place.googlePriceRangeEnd;
  const currency = place.googlePriceRangeCurrency?.trim();
  if (!currency) return null;

  const locale = currency === 'IDR' ? 'id-ID' : 'en-US';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const format = (value: number) => formatter.format(value).replace(/\s/g, '');

  if (typeof start === 'number' && typeof end === 'number') {
    return `${format(start)}-${format(end)}`;
  }
  if (typeof start === 'number') return `${format(start)}+`;
  if (typeof end === 'number') return `<${format(end)}`;
  return null;
}

function inferVibeLabel(place: PlaceCandidate, intent: DecisionIntentDefinition) {
  const archetype = resolvePlaceTraitProfile(place).archetype;
  return archetype
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function inferHourBucket(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'morning';
  if (hour < 16) return 'afternoon';
  if (hour < 19) return 'sunset';
  return 'night';
}

function inferVisitTimeLabels(place: PlaceCandidate) {
  const labels: string[] = [];
  if (place.servesBreakfast) labels.push('Breakfast');
  if (place.servesBrunch) labels.push('Brunch');
  if (place.servesLunch) labels.push('Lunch');
  if (place.servesDinner) labels.push('Dinner');
  if (labels.length === 0 && place.servesCoffee) labels.push('Coffee');
  return labels;
}

function inferOpenNowScore(place: PlaceCandidate) {
  const currentHours = place.currentOpeningHours ?? [];
  if (currentHours.some((entry) => normalizeKeyword(entry).includes('closed'))) return 0.05;
  if (currentHours.some((entry) => normalizeKeyword(entry).includes('open'))) return 1;
  if ((place.openingHours ?? []).length > 0) return 0.65;
  return 0.55;
}

function average(numbers: number[]) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

async function buildUserDecisionProfile(userId?: string | null): Promise<UserDecisionProfile | null> {
  if (!userId) return null;

  const [preferences, bookmarks, moments, recentEvents] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId },
      select: {
        selectedInterests: true,
      },
    }),
    prisma.bookmark.findMany({
      where: { userId },
      select: {
        placeId: true,
        place: {
          select: {
            category: true,
            neighborhood: true,
            adminAreaLevel4: true,
            priceLevel: true,
          },
        },
      },
    }),
    prisma.moment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        placeId: true,
        place: {
          select: {
            neighborhood: true,
            adminAreaLevel4: true,
            priceLevel: true,
          },
        },
      },
    }),
    decisionPrisma.decisionSessionEvent.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - (1000 * 60 * 60 * 24 * 14)),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        placeId: true,
        eventType: true,
        createdAt: true,
      },
    }),
  ]);

  const bookmarkedPlaceIds = new Set<string>(bookmarks.map((bookmark) => bookmark.placeId));
  const bookmarkedCategoryKeywords = new Set<string>();
  const neighborhoodAffinity = new Set<string>();
  const priceLevels: number[] = [];
  const recentExposureByPlaceId = new Map<string, Date[]>();
  const recentChosenByPlaceId = new Map<string, Date[]>();
  const recentSkippedByPlaceId = new Map<string, Date[]>();

  for (const bookmark of bookmarks) {
    normalizeKeyword(bookmark.place.category).split(' ').filter(Boolean).forEach((keyword) => bookmarkedCategoryKeywords.add(keyword));
    const area = bookmark.place.neighborhood || bookmark.place.adminAreaLevel4;
    if (area) neighborhoodAffinity.add(normalizeKeyword(area));
    if (typeof bookmark.place.priceLevel === 'number') {
      priceLevels.push(bookmark.place.priceLevel);
    }
  }

  const momentPlaceIds = new Set<string>(moments.map((moment) => moment.placeId));
  for (const moment of moments) {
    const area = moment.place.neighborhood || moment.place.adminAreaLevel4;
    if (area) neighborhoodAffinity.add(normalizeKeyword(area));
    if (typeof moment.place.priceLevel === 'number') {
      priceLevels.push(moment.place.priceLevel);
    }
  }

  for (const event of recentEvents) {
    if (!event.placeId) continue;
    const targetMap = event.eventType === 'swipe_right' || event.eventType === 'go_now_clicked'
      ? recentChosenByPlaceId
      : event.eventType === 'swipe_left'
        ? recentSkippedByPlaceId
        : recentExposureByPlaceId;
    const existing = targetMap.get(event.placeId) ?? [];
    existing.push(event.createdAt);
    targetMap.set(event.placeId, existing);

    if (event.eventType === 'session_started' || event.eventType === 'options_generated') {
      const shown = recentExposureByPlaceId.get(event.placeId) ?? [];
      shown.push(event.createdAt);
      recentExposureByPlaceId.set(event.placeId, shown);
    }
  }

  return {
    selectedInterests: preferences?.selectedInterests ?? [],
    bookmarkedPlaceIds,
    bookmarkedCategoryKeywords,
    momentPlaceIds,
    neighborhoodAffinity,
    priceLevels,
    recentExposureByPlaceId,
    recentChosenByPlaceId,
    recentSkippedByPlaceId,
  };
}

function extractSummaryText(place: PlaceCandidate) {
  const reviewSummary = (place.reviewSummaryJson as any)?.text?.text
    ?? (place.reviewSummaryJson as any)?.text
    ?? null;
  const editorialSummary = (place.editorialSummaryJson as any)?.text ?? null;
  const generativeOverview = (place.generativeSummaryJson as any)?.overview?.text ?? null;

  return [reviewSummary, editorialSummary, generativeOverview]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

function extractReviewSnippets(place: PlaceCandidate, limit = 5) {
  const reviews = Array.isArray(place.reviewsJson) ? place.reviewsJson : [];
  return reviews
    .slice(0, limit)
    .map((review: any) => review?.text?.text ?? review?.originalText?.text ?? null)
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

function buildRawEvidenceBlob(place: PlaceCandidate) {
  return normalizeKeyword([
    place.name,
    place.category,
    place.googlePrimaryTypeDisplayName,
    place.googlePrimaryType,
    ...(place.googleTypes ?? []),
    extractSummaryText(place),
    extractReviewSnippets(place),
  ].filter(Boolean).join(' '));
}

function keywordEvidenceScore(blob: string, keywords: string[], perHit = 0.12, maxScore = 0.36) {
  const hits = keywords.filter((keyword) => blob.includes(keyword)).length;
  return Math.min(hits * perHit, maxScore);
}

function inferPlaceArchetype(place: PlaceCandidate, blob?: string) {
  const evidence = blob ?? buildRawEvidenceBlob(place);
  const category = normalizeKeyword(place.category);

  if (category.includes('book') || evidence.includes('bookstore')) return 'bookstore_cafe';
  if (place.servesDessert && (evidence.includes('bakery') || evidence.includes('pastry'))) return 'bakery_cafe';
  if (place.takeout && !place.dineIn) return 'quick_stop_coffee';
  if (place.dineIn && (evidence.includes('study') || evidence.includes('laptop') || evidence.includes('wifi') || evidence.includes('workspace'))) {
    return 'work_friendly_cafe';
  }
  if ((place.goodForGroups ?? false) || evidence.includes('social') || evidence.includes('hang out') || evidence.includes('catching up')) {
    return 'social_cafe';
  }
  if (place.servesCoffee) return 'specialty_coffee';
  return 'coffee_spot';
}

function buildHeuristicPlaceTraitProfile(place: PlaceCandidate): ResolvedPlaceTraits {
  const evidenceBlob = buildRawEvidenceBlob(place);
  const rating = typeof place.rating === 'number' ? place.rating : 4;
  const ratingCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  const reviewSignalsCount = Array.isArray(place.reviewsJson) ? Math.min(place.reviewsJson.length, 5) : 0;
  const archetype = inferPlaceArchetype(place, evidenceBlob);

  let quiet = 0.26;
  if (place.dineIn) quiet += 0.08;
  if (place.goodForGroups === false) quiet += 0.12;
  if (place.outdoorSeating === false) quiet += 0.04;
  if (place.takeout) quiet -= 0.05;
  quiet += keywordEvidenceScore(evidenceBlob, ['quiet', 'calm', 'peaceful', 'study', 'focus', 'low conversation'], 0.1, 0.28);
  quiet -= keywordEvidenceScore(evidenceBlob, ['busy', 'lively', 'crowded', 'social energy', 'buzzing'], 0.1, 0.24);

  let social = 0.24;
  if (place.goodForGroups) social += 0.24;
  if (place.outdoorSeating) social += 0.08;
  if (place.servesBrunch || place.servesDessert) social += 0.06;
  if (place.dineIn) social += 0.08;
  social += keywordEvidenceScore(evidenceBlob, ['social', 'catching up', 'hang out', 'hangout', 'group', 'friends', 'community'], 0.1, 0.3);
  social -= keywordEvidenceScore(evidenceBlob, ['solo', 'study', 'work quietly'], 0.06, 0.12);

  let solo = 0.3;
  if (place.servesCoffee) solo += 0.08;
  if (place.dineIn) solo += 0.08;
  if (place.goodForGroups === false) solo += 0.08;
  if (!place.goodForGroups) solo += 0.04;
  solo += keywordEvidenceScore(evidenceBlob, ['solo', 'alone', 'sit and stay', 'book', 'browse', 'study'], 0.1, 0.28);
  solo -= keywordEvidenceScore(evidenceBlob, ['group', 'large groups', 'party'], 0.08, 0.16);

  let cozy = 0.26;
  if (place.dineIn) cozy += 0.1;
  if (place.servesDessert || place.servesBrunch) cozy += 0.06;
  if (place.outdoorSeating) cozy += 0.04;
  cozy += keywordEvidenceScore(evidenceBlob, ['cozy', 'cute', 'warm', 'welcoming', 'relaxed', 'charming', 'bookstore'], 0.1, 0.36);

  let work = 0.18;
  if (place.dineIn) work += 0.14;
  if (place.restroom) work += 0.04;
  work += keywordEvidenceScore(evidenceBlob, ['wifi', 'laptop', 'work', 'study', 'workspace', 'outlets'], 0.12, 0.42);
  work += quiet * 0.16;
  work += (place.servesCoffee ? 0.06 : 0);
  work -= keywordEvidenceScore(evidenceBlob, ['busy', 'crowded', 'quick service', 'grab and go'], 0.08, 0.2);

  let date = 0.22;
  if (place.dineIn) date += 0.1;
  if (place.servesDessert) date += 0.08;
  date += cozy * 0.2;
  date += keywordEvidenceScore(evidenceBlob, ['date', 'cute', 'charming', 'romantic', 'aesthetic', 'intimate', 'unique drinks'], 0.1, 0.28);
  date -= keywordEvidenceScore(evidenceBlob, ['grab and go', 'tiny', 'standing room'], 0.08, 0.16);

  let utilitarian = 0.18;
  if (place.takeout) utilitarian += 0.18;
  if (place.delivery) utilitarian += 0.08;
  if (place.dineIn === false) utilitarian += 0.14;
  if ((place.priceLevel ?? 2) <= 1) utilitarian += 0.08;
  utilitarian += keywordEvidenceScore(evidenceBlob, ['quick service', 'grab and go', 'efficient', 'tiny', 'standing room'], 0.12, 0.42);
  utilitarian -= keywordEvidenceScore(evidenceBlob, ['destination', 'linger', 'stay a while', 'cozy', 'bookstore', 'date'], 0.08, 0.2);

  let quickReady = 0.22;
  if (place.takeout) quickReady += 0.26;
  if (place.delivery) quickReady += 0.06;
  if ((place.priceLevel ?? 2) <= 2) quickReady += 0.08;
  quickReady += keywordEvidenceScore(evidenceBlob, ['quick service', 'grab and go', 'espresso bar', 'train', 'on the go'], 0.12, 0.34);
  quickReady -= keywordEvidenceScore(evidenceBlob, ['stay a while', 'destination', 'linger'], 0.08, 0.16);

  let stayReady = 0.22;
  if (place.dineIn) stayReady += 0.24;
  if (place.outdoorSeating) stayReady += 0.08;
  if (place.restroom) stayReady += 0.06;
  if (place.servesBrunch || place.servesBreakfast) stayReady += 0.06;
  if ((place.currentOpeningHours ?? []).length > 0 || (place.openingHours ?? []).length > 0) stayReady += 0.05;
  stayReady += keywordEvidenceScore(evidenceBlob, ['stay a while', 'lingering', 'sit and stay', 'destination cafe', 'workspace'], 0.1, 0.32);

  const budgetFriendly = computeBudgetFriendly(place);
  const quality = clamp01(
    (clamp01((rating - 3.5) / 1.5) * 0.4)
    + (clamp01(Math.log10(ratingCount + 1) / 3) * 0.25)
    + ((place.primaryImageUrl ? 1 : 0) * 0.08)
    + (((place.currentOpeningHours?.length ?? 0) > 0 ? 1 : 0.7) * 0.07)
    + (keywordEvidenceScore(evidenceBlob, ['best', 'excellent', 'top tier', 'specialty', 'renowned', 'expert'], 0.08, 0.2))
  );

  const confidence = clamp01(
    0.22
    + ((extractSummaryText(place) ? 0.14 : 0))
    + (reviewSignalsCount * 0.08)
    + ((place.goodForGroups !== null ? 0.08 : 0))
    + ((place.outdoorSeating !== null ? 0.05 : 0))
    + ((place.dineIn !== null ? 0.08 : 0))
    + ((place.rating != null && place.userRatingCount != null) ? 0.12 : 0)
  );

  const evidence = [
    `archetype:${archetype}`,
    place.dineIn ? 'dine_in' : 'no_dine_in',
    place.takeout ? 'takeout' : 'no_takeout',
    place.servesDessert ? 'dessert_support' : 'no_dessert_support',
    place.goodForGroups ? 'group_support' : 'no_group_support',
    ...['quiet', 'social', 'solo', 'cozy', 'work', 'date', 'grab and go', 'destination'].filter((keyword) => evidenceBlob.includes(keyword)),
  ];

  return {
    quiet: clamp01(quiet),
    social: clamp01(social),
    solo: clamp01(solo),
    cozy: clamp01(cozy),
    work: clamp01(work),
    date: clamp01(date),
    utilitarian: clamp01(utilitarian),
    quality,
    quickReady: clamp01(quickReady),
    stayReady: clamp01(stayReady),
    budgetFriendly,
    confidence,
    source: 'heuristic',
    archetype,
    evidence,
  };
}

function resolvePlaceTraitProfile(place: PlaceCandidate): ResolvedPlaceTraits {
  if (place.traitProfile) {
    return {
      quiet: place.traitProfile.quietScore,
      social: place.traitProfile.socialScore,
      solo: place.traitProfile.soloScore,
      cozy: place.traitProfile.cozyScore,
      work: place.traitProfile.workScore,
      date: place.traitProfile.dateScore,
      utilitarian: place.traitProfile.utilitarianScore,
      quality: place.traitProfile.qualityScore,
      quickReady: place.traitProfile.quickReadyScore,
      stayReady: place.traitProfile.stayReadyScore,
      budgetFriendly: place.traitProfile.budgetFriendlyScore,
      confidence: place.traitProfile.confidence ?? 0.8,
      source: 'ai_ready',
      archetype: place.traitProfile.archetype ?? inferPlaceArchetype(place),
      evidence: Array.isArray((place.traitProfile.evidenceJson as any)?.signals)
        ? (place.traitProfile.evidenceJson as any).signals.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    };
  }

  return buildHeuristicPlaceTraitProfile(place);
}

function buildDecisionRequestProfile(selection: DecisionSelectionValues, cityKey: string): DecisionRequestProfile {
  const withProfiles: Record<DecisionWithValue, DecisionTargetTraitProfile> = {
    alone: {
      target: { quiet: 0.74, social: 0.22, solo: 0.82, cozy: 0.58, work: 0.38, date: 0.26, utilitarian: 0.42 },
      weights: { quiet: 0.2, social: 0.14, solo: 0.24, cozy: 0.12, work: 0.08, date: 0.05, utilitarian: 0.17 },
    },
    friends: {
      target: { quiet: 0.3, social: 0.86, solo: 0.18, cozy: 0.56, work: 0.2, date: 0.42, utilitarian: 0.24 },
      weights: { quiet: 0.08, social: 0.32, solo: 0.05, cozy: 0.12, work: 0.04, date: 0.08, utilitarian: 0.12, stayReady: 0.19 },
    },
    dating: {
      target: { quiet: 0.5, social: 0.48, solo: 0.28, cozy: 0.84, work: 0.18, date: 0.9, utilitarian: 0.14 },
      weights: { quiet: 0.08, social: 0.08, cozy: 0.22, date: 0.32, utilitarian: 0.14, quality: 0.06, stayReady: 0.1 },
    },
    work: {
      target: { quiet: 0.82, social: 0.22, solo: 0.66, cozy: 0.42, work: 0.92, date: 0.12, utilitarian: 0.34 },
      weights: { quiet: 0.24, social: 0.12, solo: 0.12, cozy: 0.06, work: 0.26, utilitarian: 0.06, stayReady: 0.14 },
    },
  };

  const feelProfiles: Record<DecisionFeelValue, DecisionTargetTraitProfile> = {
    chill: {
      target: { quiet: 0.56, social: 0.44, cozy: 0.82, utilitarian: 0.22, quality: 0.64, stayReady: 0.66 },
      weights: { quiet: 0.12, social: 0.08, cozy: 0.26, utilitarian: 0.12, quality: 0.18, stayReady: 0.16, date: 0.08 },
    },
    quiet: {
      target: { quiet: 0.9, social: 0.16, cozy: 0.5, work: 0.58, utilitarian: 0.28, stayReady: 0.58 },
      weights: { quiet: 0.34, social: 0.14, cozy: 0.08, work: 0.16, utilitarian: 0.1, stayReady: 0.18 },
    },
    social: {
      target: { quiet: 0.22, social: 0.9, cozy: 0.54, utilitarian: 0.2, stayReady: 0.62, date: 0.5 },
      weights: { quiet: 0.08, social: 0.34, cozy: 0.12, utilitarian: 0.06, stayReady: 0.14, date: 0.1, quality: 0.08 },
    },
    lowkey: {
      target: { quiet: 0.58, social: 0.26, cozy: 0.42, utilitarian: 0.68, quickReady: 0.72, budgetFriendly: 0.82 },
      weights: { quiet: 0.14, social: 0.08, cozy: 0.08, utilitarian: 0.22, quickReady: 0.2, budgetFriendly: 0.2, quality: 0.08 },
    },
    great: {
      target: { quiet: 0.48, social: 0.46, cozy: 0.62, utilitarian: 0.2, quality: 0.92, date: 0.56 },
      weights: { quiet: 0.08, social: 0.08, cozy: 0.14, utilitarian: 0.08, quality: 0.42, date: 0.1, stayReady: 0.1 },
    },
  };

  const stateProfiles: Record<DecisionStateValue, DecisionTargetTraitProfile> = {
    quick: {
      target: { quickReady: 0.92, stayReady: 0.22, utilitarian: 0.7, budgetFriendly: 0.64 },
      weights: { quickReady: 0.42, stayReady: 0.18, utilitarian: 0.24, budgetFriendly: 0.16 },
    },
    stay: {
      target: { quickReady: 0.2, stayReady: 0.92, cozy: 0.58, utilitarian: 0.18 },
      weights: { quickReady: 0.08, stayReady: 0.46, cozy: 0.2, utilitarian: 0.1, quiet: 0.08, social: 0.08 },
    },
    near: {
      target: { quickReady: 0.68, utilitarian: 0.52, budgetFriendly: 0.62 },
      weights: { quickReady: 0.34, utilitarian: 0.22, budgetFriendly: 0.16, quality: 0.08, quiet: 0.1, social: 0.1 },
    },
    no_plan: {
      target: { quality: 0.78, cozy: 0.46, stayReady: 0.48, quickReady: 0.42 },
      weights: { quality: 0.44, cozy: 0.12, stayReady: 0.14, quickReady: 0.1, quiet: 0.1, social: 0.1 },
    },
  };

  return {
    id: `${selection.withValue}_${selection.feelValue}_${selection.stateValue}`,
    selection,
    constraints: {
      cityKey,
      coffeeRequired: true,
      openNowRequired: true,
      dineInRequired: selection.withValue === 'work' || selection.stateValue === 'stay' || selection.withValue === 'dating',
      stayReadyRequired: selection.stateValue === 'stay' || selection.withValue === 'work',
      maxDistanceMiles: selection.stateValue === 'near' ? 1.6 : selection.stateValue === 'quick' ? 1.9 : 3.0,
      maxQuickDistanceMiles: selection.stateValue === 'quick' ? 1.4 : null,
    },
    withProfile: withProfiles[selection.withValue],
    feelProfile: feelProfiles[selection.feelValue],
    stateProfile: stateProfiles[selection.stateValue],
  };
}

function computeTraitProfileMatch(traits: ResolvedPlaceTraits, profile: DecisionTargetTraitProfile) {
  const entries = Object.entries(profile.weights) as Array<[DecisionTargetTraitKey, number]>;
  if (entries.length === 0) return 0.5;

  let weightedScore = 0;
  let totalWeight = 0;

  for (const [key, weight] of entries) {
    const target = profile.target[key];
    if (typeof target !== 'number') continue;
    const actual = traits[key];
    const similarity = 1 - Math.abs(actual - target);
    weightedScore += similarity * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? clamp01(weightedScore / totalWeight) : 0.5;
}

function buildConstraintSignals(place: PlaceCandidate, traits: ResolvedPlaceTraits, distanceMiles: number) {
  return {
    isCoffeeEligible: place.servesCoffee === true,
    isOpenNow: inferOpenNowScore(place) >= 0.5,
    hasDineIn: place.dineIn === true,
    isStayReady: traits.stayReady >= 0.5,
    distanceMiles,
    quickReady: traits.quickReady,
  };
}

function passesRequestConstraints(
  place: PlaceCandidate,
  traits: ResolvedPlaceTraits,
  requestProfile: DecisionRequestProfile,
  distanceMiles: number,
) {
  const signals = buildConstraintSignals(place, traits, distanceMiles);
  const category = normalizeKeyword(place.category);
  const looksLikeMarket = category.includes('market') || category.includes('food hall');

  if (looksLikeMarket) return false;
  if (requestProfile.constraints.coffeeRequired && !signals.isCoffeeEligible) return false;
  if (requestProfile.constraints.openNowRequired && !signals.isOpenNow) return false;
  if (requestProfile.constraints.dineInRequired && !signals.hasDineIn) return false;
  if (requestProfile.constraints.stayReadyRequired && !signals.isStayReady) return false;
  if (requestProfile.constraints.maxDistanceMiles != null && distanceMiles > requestProfile.constraints.maxDistanceMiles) return false;
  if (requestProfile.constraints.maxQuickDistanceMiles != null && distanceMiles > requestProfile.constraints.maxQuickDistanceMiles) return false;
  if (requestProfile.selection.stateValue === 'quick' && traits.quickReady < 0.45) return false;
  if (requestProfile.selection.feelValue === 'quiet' && traits.quiet < 0.42) return false;
  if (requestProfile.selection.withValue === 'dating' && traits.date < 0.52) return false;
  if (requestProfile.selection.withValue === 'work' && traits.work < 0.5) return false;
  return true;
}

function computeCoffeeQuality(place: PlaceCandidate, intent: DecisionIntentDefinition, matchedSignals: string[]) {
  let score = 0;
  if (place.servesCoffee) {
    score += 0.35;
    matchedSignals.push('serves_coffee');
  }
  const normalizedCategory = normalizeKeyword(place.category);
  const normalizedPrimaryType = normalizeKeyword(place.googlePrimaryTypeDisplayName || place.googlePrimaryType);
  const bestSignal = inferBestSignal(place);
  if (
    normalizedCategory.includes('coffee')
    || normalizedCategory.includes('cafe')
    || normalizedPrimaryType.includes('coffee')
    || normalizedPrimaryType.includes('cafe')
  ) {
    score += 0.2;
  }
  if (bestSignal?.preferenceCategory && intent.primaryPreferenceCategories.includes(bestSignal.preferenceCategory)) {
    score += 0.2;
    matchedSignals.push(`preference:${bestSignal.preferenceCategory}`);
  }
  if (bestSignal?.queryText && intent.discoveryQueryKeywords.some((keyword) => normalizeKeyword(bestSignal.queryText).includes(keyword))) {
    score += 0.15;
  }
  if (typeof bestSignal?.bestResultRank === 'number' || typeof bestSignal?.resultRank === 'number') {
    const rank = bestSignal?.bestResultRank ?? bestSignal?.resultRank ?? 20;
    score += clamp01((8 - Math.min(rank, 8)) / 8) * 0.1;
  }
  return clamp01(score);
}

function computeQuickStop(place: PlaceCandidate, distanceMiles: number) {
  let score = clamp01((2.5 - distanceMiles) / 2.5) * 0.6;
  if (place.takeout) score += 0.2;
  if (place.delivery) score += 0.05;
  if (place.dineIn === false) score += 0.05;
  if (typeof place.priceLevel === 'number' && place.priceLevel <= 2) score += 0.1;
  return clamp01(score);
}

function computeStayAwhile(place: PlaceCandidate) {
  let score = 0;
  if (place.dineIn) score += 0.35;
  if (place.goodForGroups) score += 0.15;
  if (place.outdoorSeating) score += 0.1;
  if (place.servesBrunch || place.servesBreakfast) score += 0.1;
  if (normalizeKeyword(place.category).includes('cafe')) score += 0.15;
  if ((place.currentOpeningHours ?? []).length > 0 || (place.openingHours ?? []).length > 0) score += 0.05;
  return clamp01(score);
}

function computeSocial(place: PlaceCandidate) {
  let score = 0;
  if (place.goodForGroups) score += 0.4;
  if (place.outdoorSeating) score += 0.15;
  if (place.servesBrunch || place.servesDessert) score += 0.15;
  if (place.dineIn) score += 0.15;
  if (normalizeKeyword(place.category).includes('cafe')) score += 0.1;
  return clamp01(score);
}

function computeAesthetic(place: PlaceCandidate) {
  let score = 0;
  const bestSignal = inferBestSignal(place);
  const summaryKeywords = [
    normalizeKeyword(place.aiEnrichment?.hook),
    normalizeKeyword(place.aiEnrichment?.description),
    normalizeKeyword(JSON.stringify(place.editorialSummaryJson ?? null)),
    normalizeKeyword(JSON.stringify(place.generativeSummaryJson ?? null)),
  ].join(' ');

  if (bestSignal?.preferenceCategory === 'aesthetic_cafes') score += 0.45;
  if (summaryKeywords.includes('aesthetic') || summaryKeywords.includes('cozy') || summaryKeywords.includes('design')) score += 0.2;
  if (Boolean(inferThumbnailUrl(place))) score += 0.1;
  if (place.outdoorSeating) score += 0.05;
  if (place.servesDessert) score += 0.05;
  if (normalizeKeyword(place.category).includes('cafe')) score += 0.1;
  return clamp01(score);
}

function computeBudgetFriendly(place: PlaceCandidate) {
  if (typeof place.priceLevel !== 'number') return 0.45;
  if (place.priceLevel <= 1) return 1;
  if (place.priceLevel === 2) return 0.75;
  if (place.priceLevel === 3) return 0.35;
  return 0.1;
}

function computeSweetPairing(place: PlaceCandidate) {
  let score = 0;
  if (place.servesDessert) score += 0.55;
  if (place.servesBrunch || place.servesBreakfast) score += 0.1;
  const normalizedCategory = normalizeKeyword(place.category);
  if (normalizedCategory.includes('dessert') || normalizedCategory.includes('bakery')) score += 0.25;
  if (normalizeKeyword(JSON.stringify(place.discoverySignals.map((signal) => signal.queryText))).includes('dessert')) score += 0.1;
  return clamp01(score);
}

function computeQuiet(place: PlaceCandidate) {
  const normalizedCategory = normalizeKeyword(place.category);
  const queryBlob = normalizeKeyword(place.discoverySignals.map((signal) => signal.queryText).join(' '));
  const summaryKeywords = [
    normalizeKeyword(place.aiEnrichment?.hook),
    normalizeKeyword(place.aiEnrichment?.description),
    queryBlob,
  ].join(' ');

  let score = 0.18;
  if (place.dineIn) score += 0.18;
  if (!place.goodForGroups) score += 0.16;
  if (!place.outdoorSeating) score += 0.08;
  if (!place.servesBrunch) score += 0.06;
  if (summaryKeywords.includes('quiet') || summaryKeywords.includes('calm') || summaryKeywords.includes('cozy')) score += 0.16;
  if (normalizedCategory.includes('coffee') || normalizedCategory.includes('cafe')) score += 0.08;
  if (place.takeout) score -= 0.08;
  if (place.goodForGroups) score -= 0.08;
  return clamp01(score);
}

function computeLowkey(place: PlaceCandidate, distanceMiles: number) {
  const budget = computeBudgetFriendly(place);
  const quick = computeQuickStop(place, distanceMiles);
  const quiet = computeQuiet(place);
  const social = computeSocial(place);
  const aesthetic = computeAesthetic(place);
  return clamp01((budget * 0.25) + (quick * 0.3) + (quiet * 0.2) + (aesthetic * 0.1) + ((1 - social) * 0.15));
}

function computeDating(place: PlaceCandidate, distanceMiles: number) {
  const aesthetic = computeAesthetic(place);
  const sweet = computeSweetPairing(place);
  const stay = computeStayAwhile(place);
  const quality = computePlaceQuality(place);
  const social = computeSocial(place);
  const priceFit = typeof place.priceLevel === 'number'
    ? clamp01((place.priceLevel - 1) / 3)
    : 0.45;
  const proximity = clamp01((2.8 - distanceMiles) / 2.8);
  return clamp01((aesthetic * 0.3) + (sweet * 0.2) + (stay * 0.18) + (quality * 0.16) + (social * 0.06) + (priceFit * 0.04) + (proximity * 0.06));
}

function computeWork(place: PlaceCandidate, distanceMiles: number) {
  const quiet = computeQuiet(place);
  const stay = computeStayAwhile(place);
  const coffee = computeCoffeeQuality(place, buildDecisionIntentDefinition({
    withValue: 'work',
    feelValue: 'quiet',
    stateValue: 'stay',
  }), []);
  const proximity = clamp01((2.4 - distanceMiles) / 2.4);
  return clamp01((quiet * 0.35) + (stay * 0.28) + (coffee * 0.22) + (proximity * 0.15));
}

function computeAlone(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  const quiet = computeQuiet(place);
  const stay = computeStayAwhile(place);
  const coffee = computeCoffeeQuality(place, intent, []);
  const social = computeSocial(place);
  const aesthetic = computeAesthetic(place);
  const proximity = clamp01((2.5 - distanceMiles) / 2.5);
  return clamp01((quiet * 0.32) + (coffee * 0.24) + (stay * 0.16) + ((1 - social) * 0.2) + (proximity * 0.06) + (aesthetic * 0.02));
}

function computeWithFit(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  switch (intent.withValue) {
    case 'friends':
      return clamp01((computeSocial(place) * 0.42) + (computeStayAwhile(place) * 0.28) + (computeAesthetic(place) * 0.1) + (computeSweetPairing(place) * 0.08) + (clamp01((2.2 - distanceMiles) / 2.2) * 0.12));
    case 'dating':
      return computeDating(place, distanceMiles);
    case 'work':
      return computeWork(place, distanceMiles);
    case 'alone':
    default:
      return computeAlone(place, intent, distanceMiles);
  }
}

function computeFeelFit(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  switch (intent.feelValue) {
    case 'quiet':
      return clamp01((computeQuiet(place) * 0.42) + (computeStayAwhile(place) * 0.18) + (computeCoffeeQuality(place, intent, []) * 0.16) + ((1 - computeSocial(place)) * 0.14) + (clamp01((2.4 - distanceMiles) / 2.4) * 0.1));
    case 'social':
      return clamp01((computeSocial(place) * 0.42) + (computeStayAwhile(place) * 0.18) + (computeAesthetic(place) * 0.12) + (computeSweetPairing(place) * 0.08) + (computeCoffeeQuality(place, intent, []) * 0.1) + (clamp01((2.4 - distanceMiles) / 2.4) * 0.1));
    case 'lowkey':
      return computeLowkey(place, distanceMiles);
    case 'great':
      return clamp01((computeCoffeeQuality(place, intent, []) * 0.34) + (computePlaceQuality(place) * 0.24) + (computeAesthetic(place) * 0.18) + (computeSweetPairing(place) * 0.12) + (computeStayAwhile(place) * 0.06) + (clamp01((2.8 - distanceMiles) / 2.8) * 0.06));
    case 'chill':
    default:
      return clamp01((computeAesthetic(place) * 0.24) + (computeStayAwhile(place) * 0.2) + (computeCoffeeQuality(place, intent, []) * 0.18) + (computeQuiet(place) * 0.14) + (computeSweetPairing(place) * 0.1) + (clamp01((2.6 - distanceMiles) / 2.6) * 0.14));
  }
}

function computeStateFit(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  const proximity = clamp01((2.8 - distanceMiles) / 2.8);
  switch (intent.stateValue) {
    case 'quick':
      return clamp01((computeQuickStop(place, distanceMiles) * 0.45) + (proximity * 0.3) + (computeBudgetFriendly(place) * 0.1) + (computeCoffeeQuality(place, intent, []) * 0.15));
    case 'stay':
      return clamp01((computeStayAwhile(place) * 0.52) + (computeQuiet(place) * 0.16) + (computeSocial(place) * 0.12) + (computeCoffeeQuality(place, intent, []) * 0.1) + (proximity * 0.1));
    case 'near':
      return clamp01((proximity * 0.54) + (computeQuickStop(place, distanceMiles) * 0.2) + (computeBudgetFriendly(place) * 0.12) + (computeCoffeeQuality(place, intent, []) * 0.14));
    case 'no_plan':
    default:
      return clamp01((computePlaceQuality(place) * 0.3) + (computeCoffeeQuality(place, intent, []) * 0.28) + (computeContextFit(place, distanceMiles) * 0.22) + (computeAesthetic(place) * 0.1) + (computeStayAwhile(place) * 0.1));
  }
}

function computePersonalFit(place: PlaceCandidate, profile: UserDecisionProfile | null, intent: DecisionIntentDefinition, matchedSignals: string[]) {
  if (!profile) return 0.5;

  let score = 0.15;
  const normalizedCategory = normalizeKeyword(place.category);
  const area = deriveNeighborhood(place);
  const averagePriceLevel = average(profile.priceLevels);

  if (intent.primaryPreferenceCategories.some((category) => profile.selectedInterests.includes(category))) {
    score += 0.25;
    matchedSignals.push('interest_match');
  }

  if (profile.bookmarkedPlaceIds.has(place.id)) {
    score += 0.2;
    matchedSignals.push('bookmarked_before');
  }

  if (profile.momentPlaceIds.has(place.id)) {
    score += 0.08;
  }

  if (normalizedCategory.split(' ').some((keyword) => profile.bookmarkedCategoryKeywords.has(keyword))) {
    score += 0.12;
  }

  if (area && profile.neighborhoodAffinity.has(normalizeKeyword(area))) {
    score += 0.1;
    matchedSignals.push('area_affinity');
  }

  if (typeof averagePriceLevel === 'number' && Number.isFinite(averagePriceLevel) && typeof place.priceLevel === 'number') {
    const delta = Math.abs(averagePriceLevel - place.priceLevel);
    score += clamp01((2 - delta) / 2) * 0.1;
  }

  return clamp01(score);
}

function computeContextFit(place: PlaceCandidate, distanceMiles: number) {
  const openNow = inferOpenNowScore(place);
  const distanceFit = clamp01((3 - distanceMiles) / 3);
  const daypart = inferHourBucket();
  let timeFit = 0.7;
  if (daypart === 'morning') {
    timeFit = place.servesBreakfast || place.servesBrunch || place.servesCoffee ? 1 : 0.55;
  } else if (daypart === 'afternoon') {
    timeFit = place.servesCoffee || place.servesLunch || place.servesDessert ? 1 : 0.6;
  } else {
    timeFit = place.servesCoffee || place.servesDessert || place.servesDinner ? 0.9 : 0.55;
  }
  return clamp01((openNow * 0.4) + (distanceFit * 0.4) + (timeFit * 0.2));
}

function computePlaceQuality(place: PlaceCandidate) {
  const ratingScore = typeof place.rating === 'number'
    ? clamp01((place.rating - 3.5) / 1.5)
    : 0.45;
  const popularityScore = typeof place.userRatingCount === 'number'
    ? clamp01(Math.log10(place.userRatingCount + 1) / 3)
    : 0.35;
  const bestSignal = inferBestSignal(place);
  const rank = bestSignal?.bestResultRank ?? bestSignal?.resultRank;
  const sourceScore = typeof rank === 'number'
    ? clamp01((8 - Math.min(rank, 8)) / 8)
    : 0.35;
  const metadataCompleteness = [
    place.primaryImageUrl,
    place.neighborhood,
    place.currentOpeningHours?.length,
    place.rating,
    place.userRatingCount,
  ].filter(Boolean).length / 5;
  return clamp01((ratingScore * 0.3) + (popularityScore * 0.25) + (sourceScore * 0.3) + (metadataCompleteness * 0.15));
}

function computeFrictionPenalty(place: PlaceCandidate, distanceMiles: number, profile: UserDecisionProfile | null) {
  let penalty = 0;
  if (distanceMiles > 2.5) penalty += 0.35;
  else if (distanceMiles > 1.5) penalty += 0.2;
  else if (distanceMiles > 1) penalty += 0.1;

  if (inferOpenNowScore(place) < 0.2) penalty += 0.25;
  if (typeof place.priceLevel === 'number' && profile?.priceLevels.length) {
    const averagePriceLevel = average(profile.priceLevels);
    if (place.priceLevel - averagePriceLevel >= 2) penalty += 0.15;
  }

  return clamp01(penalty);
}

function computeRotationPenalty(placeId: string, profile: UserDecisionProfile | null) {
  if (!profile) return 0;
  const exposures = profile.recentExposureByPlaceId.get(placeId) ?? [];
  const chosen = profile.recentChosenByPlaceId.get(placeId) ?? [];
  const skipped = profile.recentSkippedByPlaceId.get(placeId) ?? [];
  const now = Date.now();

  let penalty = 0;
  for (const days of DECISION_RECENT_EXPOSURE_WINDOWS) {
    const threshold = now - (1000 * 60 * 60 * 24 * days);
    if (exposures.some((date) => date.getTime() >= threshold)) {
      penalty += days === 1 ? 0.35 : days === 3 ? 0.2 : 0.1;
      break;
    }
  }
  if (chosen.some((date) => date.getTime() >= now - (1000 * 60 * 60 * 24 * 7))) {
    penalty += 0.35;
  }
  if (skipped.some((date) => date.getTime() >= now - (1000 * 60 * 60 * 24 * 3))) {
    penalty += 0.15;
  }

  return clamp01(penalty);
}

function computeFreshnessBonus(place: PlaceCandidate, profile: UserDecisionProfile | null) {
  if (!profile) return 0.04;
  const wasShown = profile.recentExposureByPlaceId.has(place.id);
  if (wasShown) return 0;
  const daysSinceFirstSeen = (Date.now() - place.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceFirstSeen <= 14) return 0.08;
  if (daysSinceFirstSeen <= 45) return 0.04;
  return 0.02;
}

function computeIntentSpecificBonus(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  const normalizedCategory = normalizeKeyword(place.category);
  const queryBlob = normalizeKeyword(place.discoverySignals.map((signal) => signal.queryText).join(' '));
  const preferenceCategories = new Set(
    place.discoverySignals
      .map((signal) => signal.preferenceCategory)
      .filter((value): value is string => Boolean(value))
  );
  const bestRank = place.discoverySignals.reduce<number | null>((best, signal) => {
    const rank = signal.bestResultRank ?? signal.resultRank ?? null;
    if (rank == null) return best;
    if (best == null) return rank;
    return Math.min(best, rank);
  }, null);
  const isDessertLed = Boolean(
    place.servesDessert
    || normalizedCategory.includes('dessert')
    || normalizedCategory.includes('bakery')
    || queryBlob.includes('dessert')
    || queryBlob.includes('bakery')
    || preferenceCategories.has('desserts_sweet_treats')
  );
  const isAesthetic = preferenceCategories.has('aesthetic_cafes')
    || queryBlob.includes('aesthetic')
    || queryBlob.includes('cozy');

  let bonus = 0;
  if (preferenceCategories.has('good_coffee')) bonus += 0.06;
  if (queryBlob.includes('specialty') && intent.feelValue === 'great') bonus += 0.05;
  if (bestRank != null && bestRank <= 3 && intent.feelValue === 'great') bonus += 0.04;

  if (intent.withValue === 'friends') {
    bonus += place.goodForGroups ? 0.08 : 0;
    bonus += place.servesBrunch ? 0.05 : 0;
    bonus += place.outdoorSeating ? 0.03 : 0;
  } else if (intent.withValue === 'dating') {
    bonus += isAesthetic ? 0.08 : 0;
    bonus += isDessertLed ? 0.07 : 0;
    bonus += place.dineIn ? 0.04 : 0;
  } else if (intent.withValue === 'work') {
    bonus += place.dineIn ? 0.08 : 0;
    bonus += isAesthetic ? 0.03 : 0;
  } else {
    bonus += computeQuiet(place) >= 0.58 ? 0.08 : 0;
    bonus += distanceMiles <= 0.9 ? 0.04 : 0;
    bonus -= place.goodForGroups ? 0.05 : 0;
  }

  if (intent.stateValue === 'quick') {
    bonus += distanceMiles <= 0.7 ? 0.11 : distanceMiles <= 1.1 ? 0.07 : 0;
    bonus += place.takeout ? 0.08 : 0;
  } else if (intent.stateValue === 'stay') {
    bonus += place.dineIn ? 0.07 : 0;
    bonus += place.outdoorSeating ? 0.03 : 0;
  } else if (intent.stateValue === 'near') {
    bonus += distanceMiles <= 0.8 ? 0.12 : distanceMiles <= 1.2 ? 0.07 : 0;
    bonus += ((place.priceLevel ?? 3) <= 2 ? 0.04 : 0);
  }

  if (intent.feelValue === 'quiet') {
    bonus += place.dineIn ? 0.04 : 0;
    bonus -= place.goodForGroups ? 0.04 : 0;
  } else if (intent.feelValue === 'social') {
    bonus += place.goodForGroups ? 0.08 : 0;
    bonus += place.outdoorSeating ? 0.03 : 0;
  } else if (intent.feelValue === 'lowkey') {
    bonus += ((place.priceLevel ?? 3) <= 2 ? 0.08 : 0);
    bonus += place.takeout ? 0.05 : 0;
  } else if (intent.feelValue === 'great') {
    bonus += isAesthetic ? 0.06 : 0;
    bonus += isDessertLed ? 0.05 : 0;
  } else {
    bonus += isAesthetic ? 0.05 : 0;
  }

  return bonus;
}

function getIntentHardMatch(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  const normalizedCategory = normalizeKeyword(place.category);
  const normalizedPrimaryType = normalizeKeyword(place.googlePrimaryTypeDisplayName || place.googlePrimaryType);
  const queryBlob = normalizeKeyword(place.discoverySignals.map((signal) => signal.queryText).join(' '));
  const preferenceCategories = new Set(
    place.discoverySignals
      .map((signal) => signal.preferenceCategory)
      .filter((value): value is string => Boolean(value))
  );
  const isCoffeeLed = Boolean(
    place.servesCoffee
    || normalizedCategory.includes('coffee')
    || normalizedCategory.includes('cafe')
    || normalizedCategory.includes('espresso')
    || normalizedPrimaryType.includes('coffee')
    || normalizedPrimaryType.includes('cafe')
    || queryBlob.includes('coffee')
    || queryBlob.includes('espresso')
  );
  const isDessertLed = Boolean(
    place.servesDessert
    || normalizedCategory.includes('dessert')
    || normalizedCategory.includes('bakery')
    || queryBlob.includes('dessert')
    || queryBlob.includes('bakery')
    || preferenceCategories.has('desserts_sweet_treats')
  );
  const isAesthetic = preferenceCategories.has('aesthetic_cafes')
    || queryBlob.includes('aesthetic')
    || queryBlob.includes('cozy');
  const isSocial = Boolean(place.goodForGroups || place.dineIn || place.outdoorSeating || place.servesBrunch);
  const isBudget = typeof place.priceLevel === 'number' ? place.priceLevel <= 2 : false;
  const isFast = Boolean(place.takeout || distanceMiles <= 1.2 || isBudget);
  const isStayFriendly = Boolean(place.dineIn || place.outdoorSeating || place.goodForGroups);
  const looksLikeMarket = normalizedCategory.includes('market') || queryBlob.includes('food hall');

  if (!isCoffeeLed || looksLikeMarket) return false;
  if (intent.stateValue === 'near' && distanceMiles > 1.7) return false;
  if (intent.stateValue === 'quick' && distanceMiles > 1.8) return false;

  const withFit = computeWithFit(place, intent, distanceMiles);
  const feelFit = computeFeelFit(place, intent, distanceMiles);
  const stateFit = computeStateFit(place, intent, distanceMiles);

  if (withFit < DECISION_MIN_WITH_FIT) return false;
  if (feelFit < DECISION_MIN_FEEL_FIT) return false;
  if (stateFit < DECISION_MIN_STATE_FIT) return false;

  if (intent.withValue === 'dating' && !(isAesthetic || isDessertLed)) return false;
  if (intent.withValue === 'dating' && computeDating(place, distanceMiles) < 0.58) return false;
  if (intent.withValue === 'work' && !(isStayFriendly || place.dineIn)) return false;
  if (intent.withValue === 'alone' && computeAlone(place, intent, distanceMiles) < 0.5) return false;
  if (intent.feelValue === 'social' && !isSocial) return false;
  if (intent.feelValue === 'quiet' && computeQuiet(place) < 0.42) return false;
  if (intent.feelValue === 'lowkey' && !(isFast || isBudget || distanceMiles <= 1.3)) return false;

  return true;
}

function buildDecisionReason(intent: DecisionIntentDefinition, place: PlaceCandidate, breakdown: DecisionScoreBreakdown, distanceMiles: number) {
  const distanceLabel = distanceMiles < 0.2 ? 'right nearby' : `${distanceMiles.toFixed(1)} mi away`;
  if (breakdown.matchedSignals.includes('bookmarked_before')) {
    return `You already saved similar energy, and this one is ${distanceLabel}.`;
  }
  if (breakdown.matchedSignals.includes('interest_match') && breakdown.intentFit >= 0.75) {
    return `Strong ${intent.feelValue} match, and it is ${distanceLabel}.`;
  }
  if (breakdown.intentFit >= 0.8) {
    return `This fits ${intent.withValue} + ${intent.feelValue} + ${intent.stateValue} without adding much friction.`;
  }
  if (breakdown.contextFit >= 0.8) {
    return `Easy pick for right now, especially with it being ${distanceLabel}.`;
  }
  return `Worth a look if you want something more ${intent.feelValue} and ${intent.stateValue.replace('_', ' ')}.`;
}

function getTraitEvidenceByTrait(place: PlaceCandidate): TraitEvidenceByTrait {
  const raw = (place.traitProfile?.evidenceJson as any)?.byTrait;
  if (!raw || typeof raw !== 'object') return {};
  const allowedKeys = ['quiet', 'social', 'solo', 'cozy', 'work', 'date', 'utilitarian', 'quality'] as const;
  return allowedKeys.reduce<TraitEvidenceByTrait>((accumulator, key) => {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      accumulator[key] = value.trim();
    }
    return accumulator;
  }, {});
}

function pickFeelEvidence(place: PlaceCandidate, feelValue: DecisionFeelValue) {
  const evidenceByTrait = getTraitEvidenceByTrait(place);
  const keysByFeel: Record<DecisionFeelValue, (keyof TraitEvidenceByTrait)[]> = {
    chill: ['cozy', 'quiet', 'quality'],
    quiet: ['quiet', 'solo', 'work'],
    social: ['social', 'cozy', 'date'],
    lowkey: ['solo', 'utilitarian', 'quiet', 'cozy'],
    great: ['quality', 'date', 'cozy'],
  };

  for (const key of keysByFeel[feelValue]) {
    const value = evidenceByTrait[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function estimateTravelTimeMinutes(distanceMiles: number) {
  if (distanceMiles <= 0.15) return 2;
  if (distanceMiles <= 0.35) return Math.max(3, Math.round((distanceMiles * 16) + 1));
  if (distanceMiles <= 1.2) return Math.max(5, Math.round((distanceMiles * 6) + 1));
  return Math.max(8, Math.round((distanceMiles * 4.5) + 2));
}

function buildTravelTimeLabel(distanceMiles: number) {
  const minutes = estimateTravelTimeMinutes(distanceMiles);
  return `${minutes} mins away`;
}

function computeTraitDrivenIntentSpecificBonus(
  place: PlaceCandidate,
  traits: ResolvedPlaceTraits,
  requestProfile: DecisionRequestProfile,
  distanceMiles: number,
) {
  const { withValue, feelValue, stateValue } = requestProfile.selection;
  let bonus = 0;

  if (withValue === 'dating') {
    bonus += traits.date >= 0.72 ? 0.08 : 0;
    bonus += traits.cozy >= 0.7 ? 0.05 : 0;
    bonus -= traits.utilitarian >= 0.65 ? 0.08 : 0;
  } else if (withValue === 'work') {
    bonus += traits.work >= 0.72 ? 0.08 : 0;
    bonus += traits.quiet >= 0.68 ? 0.05 : 0;
    bonus -= traits.social >= 0.74 ? 0.06 : 0;
  } else if (withValue === 'friends') {
    bonus += traits.social >= 0.74 ? 0.08 : 0;
    bonus += traits.stayReady >= 0.68 ? 0.05 : 0;
  } else {
    bonus += traits.solo >= 0.72 ? 0.07 : 0;
    bonus += traits.quiet >= 0.66 ? 0.05 : 0;
    bonus -= traits.social >= 0.74 ? 0.05 : 0;
  }

  if (feelValue === 'quiet') {
    bonus += traits.quiet >= 0.74 ? 0.08 : 0;
    bonus -= traits.social >= 0.7 ? 0.05 : 0;
  } else if (feelValue === 'social') {
    bonus += traits.social >= 0.78 ? 0.08 : 0;
  } else if (feelValue === 'lowkey') {
    bonus += traits.utilitarian >= 0.62 ? 0.06 : 0;
    bonus += traits.budgetFriendly >= 0.72 ? 0.04 : 0;
  } else if (feelValue === 'great') {
    bonus += traits.quality >= 0.82 ? 0.08 : 0;
  } else {
    bonus += traits.cozy >= 0.7 ? 0.06 : 0;
  }

  if (stateValue === 'quick') {
    bonus += traits.quickReady >= 0.75 ? 0.1 : 0;
    bonus += distanceMiles <= 0.8 ? 0.08 : distanceMiles <= 1.2 ? 0.04 : 0;
  } else if (stateValue === 'stay') {
    bonus += traits.stayReady >= 0.74 ? 0.08 : 0;
    bonus += place.dineIn ? 0.04 : 0;
  } else if (stateValue === 'near') {
    bonus += distanceMiles <= 0.8 ? 0.1 : distanceMiles <= 1.2 ? 0.06 : 0;
  }

  return bonus;
}

function rankCandidateForIntent(input: {
  place: PlaceCandidate;
  intent: DecisionIntentDefinition;
  requestProfile: DecisionRequestProfile;
  origin: { latitude: number; longitude: number };
  profile: UserDecisionProfile | null;
}) {
  const distanceMiles = input.place.latitude != null && input.place.longitude != null
    ? distanceBetweenMiles(input.origin, {
        latitude: input.place.latitude,
        longitude: input.place.longitude,
      })
    : 2.5;

  const traits = resolvePlaceTraitProfile(input.place);
  const matchedSignals: string[] = [];
  const withFit = computeTraitProfileMatch(traits, input.requestProfile.withProfile);
  const feelFit = computeTraitProfileMatch(traits, input.requestProfile.feelProfile);
  const stateFit = computeTraitProfileMatch(traits, input.requestProfile.stateProfile);
  const traitMatch = clamp01((withFit * 0.34) + (feelFit * 0.38) + (stateFit * 0.28));
  const intentFit = traitMatch;
  const personalFit = computePersonalFit(input.place, input.profile, input.intent, matchedSignals);
  const contextFit = computeContextFit(input.place, distanceMiles);
  const placeQuality = traits.quality;
  const frictionPenalty = computeFrictionPenalty(input.place, distanceMiles, input.profile);
  const rotationPenalty = computeRotationPenalty(input.place.id, input.profile);
  const freshnessBonus = computeFreshnessBonus(input.place, input.profile);
  const intentSpecificBonus = computeTraitDrivenIntentSpecificBonus(input.place, traits, input.requestProfile, distanceMiles);
  const finalWeights = getDecisionFinalScoreWeights(input.intent);

  const finalScoreRaw =
    (withFit * finalWeights.withFit)
    + (feelFit * finalWeights.feelFit)
    + (stateFit * finalWeights.stateFit)
    + (personalFit * finalWeights.personalFit)
    + (contextFit * finalWeights.contextFit)
    + (placeQuality * finalWeights.placeQuality)
    + (intentSpecificBonus * finalWeights.intentSpecificBonus)
    + (freshnessBonus * finalWeights.freshnessBonus)
    + (frictionPenalty * finalWeights.frictionPenalty)
    + (rotationPenalty * finalWeights.rotationPenalty);
  const finalScore = clamp01(finalScoreRaw);

  const breakdown: DecisionScoreBreakdown = {
    withFit: Number(withFit.toFixed(3)),
    feelFit: Number(feelFit.toFixed(3)),
    stateFit: Number(stateFit.toFixed(3)),
    intentFit: Number(intentFit.toFixed(3)),
    personalFit: Number(personalFit.toFixed(3)),
    contextFit: Number(contextFit.toFixed(3)),
    placeQuality: Number(placeQuality.toFixed(3)),
    frictionPenalty: Number(frictionPenalty.toFixed(3)),
    rotationPenalty: Number(rotationPenalty.toFixed(3)),
    freshnessBonus: Number(freshnessBonus.toFixed(3)),
    finalScore: Number((finalScore * 100).toFixed(1)),
    matchedSignals: [
      ...matchedSignals,
      `trait_source:${traits.source}`,
      `archetype:${traits.archetype}`,
      ...traits.evidence.slice(0, 4),
    ],
    traitMatch: Number(traitMatch.toFixed(3)),
    placeTraits: {
      quiet: Number(traits.quiet.toFixed(3)),
      social: Number(traits.social.toFixed(3)),
      solo: Number(traits.solo.toFixed(3)),
      cozy: Number(traits.cozy.toFixed(3)),
      work: Number(traits.work.toFixed(3)),
      date: Number(traits.date.toFixed(3)),
      utilitarian: Number(traits.utilitarian.toFixed(3)),
      quality: Number(traits.quality.toFixed(3)),
      quickReady: Number(traits.quickReady.toFixed(3)),
      stayReady: Number(traits.stayReady.toFixed(3)),
      budgetFriendly: Number(traits.budgetFriendly.toFixed(3)),
      confidence: Number(traits.confidence.toFixed(3)),
      source: traits.source,
      archetype: traits.archetype,
    },
  };

  return {
    place: input.place,
    distanceMiles,
    breakdown,
    reasonLabel: buildDecisionReason(input.intent, input.place, breakdown, distanceMiles),
  } satisfies RankedCandidate;
}

function rerankWithDiversity(candidates: RankedCandidate[]) {
  const selected: RankedCandidate[] = [];
  const usedPlaceIds = new Set<string>();
  const usedAreas = new Set<string>();

  while (selected.length < 3 && selected.length < candidates.length) {
    const next = candidates
      .filter((candidate) => !usedPlaceIds.has(candidate.place.id))
      .map((candidate) => {
        const area = deriveNeighborhood(candidate.place);
        const diversityPenalty = area && usedAreas.has(normalizeKeyword(area)) ? 5 : 0;
        return {
          candidate,
          effectiveScore: candidate.breakdown.finalScore - diversityPenalty,
        };
      })
      .sort((left, right) => right.effectiveScore - left.effectiveScore)[0]?.candidate;

    if (!next) break;
    selected.push(next);
    usedPlaceIds.add(next.place.id);
    const area = deriveNeighborhood(next.place);
    if (area) usedAreas.add(normalizeKeyword(area));
  }

  return selected;
}

function mapDecisionPlaceForClient(place: PlaceCandidate, intent: DecisionIntentDefinition, distanceMiles: number) {
  const traits = resolvePlaceTraitProfile(place);
  return {
    id: place.id,
    googlePlaceId: place.googlePlaceId,
    name: place.name,
    thumbnailUrl: inferThumbnailUrl(place),
    distanceMiles: Number(distanceMiles.toFixed(1)),
    travelTimeLabel: buildTravelTimeLabel(distanceMiles),
    neighborhood: deriveNeighborhood(place),
    city: place.city ?? place.location?.name ?? null,
    vibeLabel: inferVibeLabel(place, intent),
    feelEvidenceLabel: pickFeelEvidence(place, intent.feelValue),
    priceRangeLabel: buildCompactPriceLabel(place),
    topBadge: traits.quality >= 0.82 ? 'Sharp Pick' : traits.quickReady >= 0.78 ? 'Easy Stop' : null,
    timeToVisit: inferVisitTimeLabels(place),
    traitSource: traits.source,
    archetype: traits.archetype,
    traitConfidence: Number(traits.confidence.toFixed(3)),
  };
}

function mapDecisionOptionForClient(option: {
  id: string;
  optionRank: number;
  sourceType: string;
  reasonLabel: string | null;
  scoreTotal: number | null;
  scoreBreakdown: Prisma.JsonValue | null;
  isSelected: boolean;
  isSkipped: boolean;
  isVisible: boolean;
  place: PlaceCandidate;
}, intent: DecisionIntentDefinition) {
  const breakdown = (option.scoreBreakdown ?? {}) as Partial<DecisionScoreBreakdown>;
  const distanceMiles = typeof breakdown.finalScore === 'number' && typeof (breakdown as { distanceMiles?: number }).distanceMiles === 'number'
    ? (breakdown as { distanceMiles: number }).distanceMiles
    : 0;
  return {
    id: option.id,
    rank: option.optionRank,
    sourceType: option.sourceType,
    isSelected: option.isSelected,
    isSkipped: option.isSkipped,
    isVisible: option.isVisible,
    score: option.scoreTotal,
    scoreBreakdown: option.scoreBreakdown,
    reasonLabel: option.reasonLabel,
    place: mapDecisionPlaceForClient(option.place, intent, distanceMiles),
  };
}

function buildDecisionDebugPayload(session: any, intent: DecisionIntentDefinition, extra: Record<string, unknown> = {}) {
  const finalWeights = getDecisionFinalScoreWeights(intent);
  const requestProfile = buildDecisionRequestProfile({
    withValue: intent.withValue,
    feelValue: intent.feelValue,
    stateValue: intent.stateValue,
  }, session.cityKey);
  return {
    selection: {
      with: intent.withValue,
      feel: intent.feelValue,
      state: intent.stateValue,
      derivedIntentId: intent.id,
    },
    requestProfile: {
      constraints: requestProfile.constraints,
      withProfile: requestProfile.withProfile,
      feelProfile: requestProfile.feelProfile,
      stateProfile: requestProfile.stateProfile,
    },
    intentProfile: {
      title: intent.title,
      subtitle: intent.subtitle,
      facetWeights: intent.facetWeights,
    },
    thresholds: {
      withFitMin: DECISION_MIN_WITH_FIT,
      feelFitMin: DECISION_MIN_FEEL_FIT,
      stateFitMin: DECISION_MIN_STATE_FIT,
      finalScoreMin: DECISION_MIN_FINAL_SCORE,
    },
    finalScoreWeights: {
      ...finalWeights,
    },
    options: session.options.map((option: any) => ({
      optionId: option.id,
      rank: option.optionRank,
      placeId: option.placeId,
      placeName: option.place?.name ?? null,
      reasonLabel: option.reasonLabel,
      scoreTotal: option.scoreTotal,
      scoreBreakdown: option.scoreBreakdown,
    })),
    ...extra,
  };
}

function resolveSelectionFromSession(session: any): DecisionSelectionValues {
  const metadata = (session.metadataJson ?? {}) as { selection?: Partial<DecisionSelectionValues> | null };
  return resolveSelectionValues({
    intentId: session.intentId,
    withValue: metadata.selection?.withValue ?? null,
    feelValue: metadata.selection?.feelValue ?? null,
    stateValue: metadata.selection?.stateValue ?? null,
  });
}

function mapDecisionSessionForClient(session: any) {
  const intent = buildDecisionIntentDefinition(resolveSelectionFromSession(session));
  return {
    session: {
      id: session.id,
      status: session.status,
      cityKey: session.cityKey,
      cityLabel: session.cityLabel,
      entryMode: session.entryMode,
      intentId: session.intentId,
      swapCount: session.swapCount,
      skipCount: session.skipCount,
      expiresAt: session.expiresAt?.toISOString() ?? null,
    },
    options: session.options.map((option) => mapDecisionOptionForClient(option as never, intent)),
    debug: buildDecisionDebugPayload(session, intent),
  } satisfies DecisionSessionResponse;
}

async function logDecisionEvent(input: {
  sessionId: string;
  userId?: string | null;
  placeId?: string | null;
  eventType: string;
  eventValue?: string | null;
  eventPayload?: Prisma.InputJsonValue | null;
}) {
  await decisionPrisma.decisionSessionEvent.create({
    data: {
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      placeId: input.placeId ?? null,
      eventType: input.eventType,
      eventValue: input.eventValue ?? null,
      eventPayload: input.eventPayload ?? undefined,
    },
  });
}

async function fetchDecisionCandidatePool(input: {
  cityKey: string;
  limit?: number;
  excludePlaceIds?: string[];
}) {
  const city = CITY_CONFIG[input.cityKey];
  const excludePlaceIds = input.excludePlaceIds ?? [];
  const candidates = await prisma.place.findMany({
    where: {
      AND: [
        {
          OR: [
            { city: { equals: city.label, mode: 'insensitive' } },
            { city: { contains: city.label, mode: 'insensitive' } },
            { location: { name: { equals: city.label, mode: 'insensitive' } } },
            { location: { name: { contains: city.label, mode: 'insensitive' } } },
          ],
        },
        { servesCoffee: true },
        excludePlaceIds.length > 0 ? { id: { notIn: excludePlaceIds } } : {},
      ],
    },
    include: DECISION_PLACE_INCLUDE,
    take: input.limit ?? 120,
  });

  return candidates;
}

async function buildSessionOptions(input: {
  userId?: string | null;
  cityKey: string;
  intentId?: string | null;
  withValue?: string | null;
  feelValue?: string | null;
  stateValue?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  excludePlaceIds?: string[];
  take?: number;
}) {
  const city = CITY_CONFIG[input.cityKey];
  const intent = resolveIntentDefinitionOrThrow({
    intentId: input.intentId,
    withValue: input.withValue,
    feelValue: input.feelValue,
    stateValue: input.stateValue,
  });
  const requestProfile = buildDecisionRequestProfile({
    withValue: intent.withValue,
    feelValue: intent.feelValue,
    stateValue: intent.stateValue,
  }, input.cityKey);
  const requestedOrigin = {
    latitude: input.latitude ?? city.latitude,
    longitude: input.longitude ?? city.longitude,
  };
  const requestedOriginDistanceFromCityCenter = distanceBetweenMiles(requestedOrigin, {
    latitude: city.latitude,
    longitude: city.longitude,
  });
  const origin = requestedOriginDistanceFromCityCenter > 60
    ? {
        latitude: city.latitude,
        longitude: city.longitude,
      }
    : requestedOrigin;
  const [profile, pool] = await Promise.all([
    buildUserDecisionProfile(input.userId),
    fetchDecisionCandidatePool({
      cityKey: input.cityKey,
      excludePlaceIds: input.excludePlaceIds,
    }),
  ]);

  const ranked = pool
    .map((place) => {
      const distanceMiles = place.latitude != null && place.longitude != null
        ? distanceBetweenMiles(origin, {
            latitude: place.latitude,
            longitude: place.longitude,
          })
        : 2.5;
      return {
        place,
        distanceMiles,
      };
    })
    .map(({ place, distanceMiles }) => ({
      place,
      distanceMiles,
      traits: resolvePlaceTraitProfile(place),
    }))
    .filter(({ place, distanceMiles, traits }) => passesRequestConstraints(place, traits, requestProfile, distanceMiles))
    .map(({ place }) => rankCandidateForIntent({
      place,
      intent,
      requestProfile,
      origin,
      profile,
    }))
    .filter((candidate) => candidate.breakdown.finalScore >= DECISION_MIN_FINAL_SCORE)
    .sort((left, right) => {
      if (right.breakdown.finalScore !== left.breakdown.finalScore) {
        return right.breakdown.finalScore - left.breakdown.finalScore;
      }
      return left.distanceMiles - right.distanceMiles;
    });

  return rerankWithDiversity(ranked).slice(0, input.take ?? 3);
}

async function getSessionWithOwnershipCheck(sessionId: string, authUserId?: string | null) {
  const session = await decisionPrisma.decisionSession.findUnique({
    where: { id: sessionId },
    include: {
      options: {
        include: {
          place: {
            include: DECISION_PLACE_INCLUDE,
          },
        },
        orderBy: { optionRank: 'asc' },
      },
    },
  });

  if (!session) {
    throw new Error('Decision session not found');
  }
  if (session.userId && session.userId !== authUserId) {
    throw new Error('Decision session does not belong to this user');
  }
  return session;
}

function toDecisionMomentRating(label: DecisionRatingLabel) {
  if (label === 'disliked') return 1;
  if (label === 'not_bad') return 2;
  if (label === 'recommended') return 5;
  return 4;
}

function toDecisionRevisitIntent(label: DecisionRatingLabel): 'yes' | 'not_sure' | 'not_interested' {
  if (label === 'disliked') return 'not_interested';
  if (label === 'not_bad') return 'not_sure';
  return 'yes';
}

function toBudgetLevel(place: { priceLevel?: number | null }): '$' | '$$' | '$$$' {
  if ((place.priceLevel ?? 2) <= 1) return '$';
  if ((place.priceLevel ?? 2) >= 4) return '$$$';
  return '$$';
}

function getTodayUnlockDate() {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function getDecisionIntentCatalog() {
  return DECISION_FEEL_VALUES.map((feelValue) => {
    const profile = buildDecisionIntentDefinition({
      withValue: 'alone',
      feelValue,
      stateValue: 'no_plan',
    });
    return {
      id: profile.id,
      title: titleCase(feelValue),
      subtitle: profile.subtitle,
      icon: profile.icon,
      primaryPreferenceCategories: profile.primaryPreferenceCategories,
    };
  });
}

export async function createDecisionSession(input: {
  userId?: string | null;
  cityKey?: string | null;
  intentId?: string | null;
  withValue?: string | null;
  feelValue?: string | null;
  stateValue?: string | null;
  entryMode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const city = getCityConfig(input.cityKey) ?? CITY_CONFIG.boston;
  const selection = resolveSelectionValues(input);
  const normalizedIntentId = normalizeIntentId(input.intentId ?? `${selection.withValue}_${selection.feelValue}_${selection.stateValue}`);
  const intent = buildDecisionIntentDefinition(selection);
  const entryMode = (input.entryMode === 'decide_for_me' || input.entryMode === 'try_this_vibe')
    ? input.entryMode
    : 'mood';
  const options = await buildSessionOptions({
    userId: input.userId,
    cityKey: city.key,
    intentId: intent.id,
    withValue: selection.withValue,
    feelValue: selection.feelValue,
    stateValue: selection.stateValue,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (options.length === 0) {
    throw new Error(`No eligible ${intent.title.toLowerCase()} candidates available right now`);
  }

  const expiresAt = new Date(Date.now() + DECISION_SESSION_TTL_MS);
  const session = await decisionPrisma.decisionSession.create({
    data: {
      userId: input.userId ?? null,
      cityKey: city.key,
      cityLabel: city.label,
      intentId: intent.id,
      entryMode,
      status: 'active',
      userLatitude: input.latitude ?? null,
      userLongitude: input.longitude ?? null,
      expiresAt,
      metadataJson: {
        candidateCount: options.length,
        selection,
      },
      options: {
        create: options.map((candidate, index) => ({
          placeId: candidate.place.id,
          optionRank: index + 1,
          sourceType: 'ranked',
          scoreTotal: candidate.breakdown.finalScore,
          scoreBreakdown: {
            ...candidate.breakdown,
            distanceMiles: Number(candidate.distanceMiles.toFixed(2)),
          },
          reasonLabel: candidate.reasonLabel,
        })),
      },
    },
    include: {
      options: {
        include: {
          place: {
            include: DECISION_PLACE_INCLUDE,
          },
        },
        orderBy: { optionRank: 'asc' },
      },
    },
  });

  await Promise.all([
    logDecisionEvent({
      sessionId: session.id,
      userId: input.userId,
      eventType: 'session_started',
      eventValue: intent.id,
      eventPayload: {
        cityKey: city.key,
        entryMode,
        selection,
      },
    }),
    ...session.options.map((option) => logDecisionEvent({
      sessionId: session.id,
      userId: input.userId,
      placeId: option.placeId,
      eventType: 'option_viewed',
      eventValue: String(option.optionRank),
      eventPayload: {
        score: option.scoreTotal ?? null,
      },
    })),
  ]);

  return {
    ...mapDecisionSessionForClient(session),
    debug: buildDecisionDebugPayload(session, intent, {
      requestedIntentId: input.intentId ?? null,
      normalizedIntentId,
      resolvedIntentId: intent.id,
      requestedWithValue: input.withValue ?? null,
      requestedFeelValue: input.feelValue ?? null,
      requestedStateValue: input.stateValue ?? null,
    }),
  };
}

export async function getDecisionSession(sessionId: string, authUserId?: string | null) {
  const session = await getSessionWithOwnershipCheck(sessionId, authUserId);
  return mapDecisionSessionForClient(session);
}

export async function swipeDecisionSession(input: {
  sessionId: string;
  authUserId?: string | null;
  placeId: string;
  direction: DecisionSwipeDirection;
}) {
  const session = await getSessionWithOwnershipCheck(input.sessionId, input.authUserId);
  const option = session.options.find((entry) => entry.placeId === input.placeId);
  if (!option) {
    throw new Error('Place is not part of this decision session');
  }
  if (session.status === 'completed') {
    throw new Error('Decision session already completed');
  }

  if (input.direction === 'right') {
    const updated = await decisionPrisma.decisionSession.update({
      where: { id: session.id },
      data: {
        status: 'chosen',
        chosenPlaceId: input.placeId,
        endedAt: new Date(),
        options: {
          updateMany: [
            {
              where: { placeId: input.placeId },
              data: { isSelected: true, isSkipped: false },
            },
            {
              where: { placeId: { not: input.placeId } },
              data: { isSelected: false },
            },
          ],
        },
      },
      include: {
        options: {
          include: {
            place: {
              include: DECISION_PLACE_INCLUDE,
            },
          },
          orderBy: { optionRank: 'asc' },
        },
      },
    });

    await logDecisionEvent({
      sessionId: session.id,
      userId: input.authUserId ?? session.userId,
      placeId: input.placeId,
      eventType: 'swipe_right',
      eventPayload: {
        direction: 'right',
      },
    });

    return {
      ...mapDecisionSessionForClient(updated),
      selectedOptionId: option.id,
    };
  }

  const updated = await decisionPrisma.decisionSession.update({
    where: { id: session.id },
    data: {
      skipCount: { increment: 1 },
      options: {
        update: {
          where: {
            sessionId_placeId: {
              sessionId: session.id,
              placeId: input.placeId,
            },
          },
          data: {
            isSkipped: true,
          },
        },
      },
    },
    include: {
      options: {
        include: {
            place: {
            include: DECISION_PLACE_INCLUDE,
          },
        },
        orderBy: { optionRank: 'asc' },
      },
    },
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.authUserId ?? session.userId,
    placeId: input.placeId,
    eventType: 'swipe_left',
    eventPayload: {
      direction: 'left',
    },
  });

  return mapDecisionSessionForClient(updated);
}

export async function swapDecisionSessionOption(input: {
  sessionId: string;
  authUserId?: string | null;
  replacePlaceId: string;
}) {
  const session = await getSessionWithOwnershipCheck(input.sessionId, input.authUserId);
  const selection = resolveSelectionFromSession(session);
  if (session.swapCount >= 1) {
    throw new Error('Swap limit reached for this session');
  }

  const targetOption = session.options.find((option) => option.placeId === input.replacePlaceId);
  if (!targetOption) {
    throw new Error('Place is not part of this decision session');
  }

  const replacement = (await buildSessionOptions({
    userId: session.userId,
    cityKey: session.cityKey,
    intentId: session.intentId,
    withValue: selection.withValue,
    feelValue: selection.feelValue,
    stateValue: selection.stateValue,
    latitude: session.userLatitude,
    longitude: session.userLongitude,
    excludePlaceIds: session.options.map((option) => option.placeId),
    take: 1,
  }))[0];

  if (!replacement) {
    throw new Error('No replacement candidate available right now');
  }

  const updated = await decisionPrisma.decisionSession.update({
    where: { id: session.id },
    data: {
      swapCount: { increment: 1 },
      options: {
        update: {
          where: {
            sessionId_placeId: {
              sessionId: session.id,
              placeId: targetOption.placeId,
            },
          },
          data: {
            placeId: replacement.place.id,
            sourceType: 'swapped',
            scoreTotal: replacement.breakdown.finalScore,
            scoreBreakdown: {
              ...replacement.breakdown,
              distanceMiles: Number(replacement.distanceMiles.toFixed(2)),
            },
            reasonLabel: replacement.reasonLabel,
            isSkipped: false,
            isSelected: false,
          },
        },
      },
    },
    include: {
      options: {
        include: {
            place: {
            include: DECISION_PLACE_INCLUDE,
          },
        },
        orderBy: { optionRank: 'asc' },
      },
    },
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.authUserId ?? session.userId,
    placeId: replacement.place.id,
    eventType: 'swap_requested',
    eventPayload: {
      replacedPlaceId: targetOption.placeId,
      replacementPlaceId: replacement.place.id,
    },
  });

  return mapDecisionSessionForClient(updated);
}

export async function saveDecisionPlace(input: {
  sessionId: string;
  userId: string;
  placeId: string;
}) {
  const session = await getSessionWithOwnershipCheck(input.sessionId, input.userId);
  const option = session.options.find((entry) => entry.placeId === input.placeId);
  if (!option) {
    throw new Error('Place is not part of this session');
  }

  const expiresAt = new Date(Date.now() + DECISION_SAVE_TTL_MS);
  const saved = await prisma.$transaction(async (tx) => {
    const client = tx as any;
    await client.decisionSave.updateMany({
      where: {
        userId: input.userId,
        status: 'active',
      },
      data: {
        status: 'removed',
      },
    });

    const created = await client.decisionSave.create({
      data: {
        userId: input.userId,
        sessionId: session.id,
        placeId: input.placeId,
        status: 'active',
        expiresAt,
      },
    });

    await client.bookmark.upsert({
      where: {
        userId_placeId: {
          userId: input.userId,
          placeId: input.placeId,
        },
      },
      update: {
        source: 'todays_pick',
        expiresAt,
      },
      create: {
        userId: input.userId,
        placeId: input.placeId,
        source: 'todays_pick',
        expiresAt,
      },
    });

    return created;
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.userId,
    placeId: input.placeId,
    eventType: 'save_clicked',
  });

  return {
    saved: {
      id: saved.id,
      placeId: saved.placeId,
      status: saved.status,
      expiresAt: saved.expiresAt.toISOString(),
    },
  };
}

export async function markDecisionGoNow(input: {
  sessionId: string;
  authUserId?: string | null;
  placeId: string;
  mapProvider?: string | null;
}) {
  const session = await getSessionWithOwnershipCheck(input.sessionId, input.authUserId);
  const option = session.options.find((entry) => entry.placeId === input.placeId);
  if (!option) {
    throw new Error('Place is not part of this session');
  }

  const updated = await decisionPrisma.decisionSession.update({
    where: { id: session.id },
    data: {
      status: 'chosen',
      chosenPlaceId: input.placeId,
      endedAt: new Date(),
      options: {
        updateMany: [
          {
            where: { placeId: input.placeId },
            data: { isSelected: true, isSkipped: false },
          },
          {
            where: { placeId: { not: input.placeId } },
            data: { isSelected: false },
          },
        ],
      },
    },
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.authUserId ?? session.userId,
    placeId: input.placeId,
    eventType: 'go_now_clicked',
    eventValue: input.mapProvider ?? null,
  });

  return {
    ok: true,
    session: {
      id: updated.id,
      status: updated.status,
      chosenPlaceId: updated.chosenPlaceId,
    },
  };
}

export async function submitDecisionCheckin(input: {
  sessionId: string;
  userId: string;
  placeId?: string | null;
  ratingLabel: DecisionRatingLabel;
  threeWordReview?: string | null;
  uploadedMedia?: string[];
}) {
  const session = await getSessionWithOwnershipCheck(input.sessionId, input.userId);
  const resolvedPlaceId = input.placeId ?? session.chosenPlaceId ?? session.options[0]?.placeId;
  if (!resolvedPlaceId) {
    throw new Error('No place selected for this session');
  }
  const place = session.options.find((entry) => entry.placeId === resolvedPlaceId)?.place
    ?? await prisma.place.findUnique({
      where: { id: resolvedPlaceId },
      include: DECISION_PLACE_INCLUDE,
    });

  if (!place) {
    throw new Error('Selected place not found');
  }

  const review = (input.threeWordReview ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  const selection = resolveSelectionFromSession(session);
  const intent = buildDecisionIntentDefinition(selection);
  const vibeLabel = inferVibeLabel(place, intent);

  const moment = await createMoment(input.userId, {
    placeId: resolvedPlaceId,
    visitedDate: new Date().toISOString(),
    caption: review || `Decision mode pick: ${place.name}`,
    uploadedMedia: input.uploadedMedia ?? [],
    rating: toDecisionMomentRating(input.ratingLabel),
    ratingLabel: input.ratingLabel,
    budgetLevel: toBudgetLevel(place),
    visitType: 'solo',
    timeOfDay: inferHourBucket() as 'morning' | 'afternoon' | 'sunset' | 'night',
    privacy: 'public',
    wouldRevisit: toDecisionRevisitIntent(input.ratingLabel),
    vibeTags: [vibeLabel, intent.title].slice(0, 3),
  });

  const unlockDate = getTodayUnlockDate();
  const expiresAt = new Date(unlockDate.getTime() + (1000 * 60 * 60 * 24));

  await prisma.$transaction(async (tx) => {
    const client = tx as any;
    await client.decisionCheckinContext.create({
      data: {
        sessionId: session.id,
        momentId: moment.id,
        userId: input.userId,
        placeId: resolvedPlaceId,
        intentId: session.intentId,
        ratingLabel: input.ratingLabel,
        threeWordReview: review || null,
        unlockFeed: true,
      },
    });

    await client.decisionFeedUnlock.upsert({
      where: {
        userId_unlockDate: {
          userId: input.userId,
          unlockDate,
        },
      },
      update: {
        sourceMomentId: moment.id,
        expiresAt,
      },
      create: {
        userId: input.userId,
        unlockDate,
        sourceMomentId: moment.id,
        expiresAt,
      },
    });

    await client.decisionSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        chosenPlaceId: resolvedPlaceId,
        endedAt: new Date(),
      },
    });
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.userId,
    placeId: resolvedPlaceId,
    eventType: 'checkin_submitted',
    eventValue: input.ratingLabel,
    eventPayload: {
      momentId: moment.id,
      uploadedMediaCount: input.uploadedMedia?.length ?? 0,
    },
  });

  return {
    moment,
    feedUnlock: {
      isUnlocked: true,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function getDecisionTodayFeed(userId: string) {
  const unlockDate = getTodayUnlockDate();
  const unlock = await decisionPrisma.decisionFeedUnlock.findUnique({
    where: {
      userId_unlockDate: {
        userId,
        unlockDate,
      },
    },
  });

  if (!unlock || unlock.expiresAt <= new Date()) {
    return {
      isUnlocked: false,
      message: 'Check in first to unlock today feed.',
    };
  }

  const since = new Date(unlockDate.getTime());
  const items = await decisionPrisma.decisionCheckinContext.findMany({
    where: {
      createdAt: {
        gte: since,
      },
      moment: {
        privacy: 'PUBLIC',
      },
      user: {
        NOT: [
          { email: { endsWith: '@vibinn.invalid' } },
          { username: { startsWith: 'deleted.' } },
          { displayName: 'Deleted account' },
          { bio: 'This account has been deleted.' },
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: {
      moment: {
        include: {
          media: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      user: true,
      place: true,
    },
  });

  return {
    isUnlocked: true,
    expiresAt: unlock.expiresAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      type: 'checkin',
      ratingLabel: item.ratingLabel,
      threeWordReview: item.threeWordReview,
      createdAt: item.createdAt.toISOString(),
      user: {
        id: item.user.id,
        username: item.user.username,
        displayName: item.user.displayName,
        avatarUrl: item.user.avatarUrl,
      },
      place: {
        id: item.place.id,
        name: item.place.name,
        neighborhood: item.place.neighborhood ?? item.place.adminAreaLevel4 ?? item.place.city,
      },
      media: item.moment.media.map((media) => ({
        id: media.id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        mediaType: media.mediaType,
      })),
    })),
  };
}

export async function attachDecisionPlace(input: {
  sessionId?: string | null;
  authUserId?: string | null;
  placeId: string;
}) {
  const place = await prisma.place.findUnique({
    where: { id: input.placeId },
    include: DECISION_PLACE_INCLUDE,
  });

  if (!place) {
    throw new Error('Place not found');
  }

  if (!input.sessionId) {
    const previewIntent = buildDecisionIntentDefinition({
      withValue: 'alone',
      feelValue: 'chill',
      stateValue: 'no_plan',
    });
    return {
      place: mapDecisionPlaceForClient(place, previewIntent, 0),
    };
  }

  const session = await getSessionWithOwnershipCheck(input.sessionId, input.authUserId);
  const existing = session.options.find((option) => option.placeId === place.id);
  if (existing) {
    return mapDecisionSessionForClient(session);
  }

  const targetOption = session.options
    .filter((option) => !option.isSelected)
    .sort((left, right) => right.optionRank - left.optionRank)[0];
  if (!targetOption) {
    throw new Error('No replaceable option available in this session');
  }

  const selection = resolveSelectionFromSession(session);
  const intent = buildDecisionIntentDefinition(selection);
  const origin = {
    latitude: session.userLatitude ?? CITY_CONFIG[session.cityKey]?.latitude ?? CITY_CONFIG.boston.latitude,
    longitude: session.userLongitude ?? CITY_CONFIG[session.cityKey]?.longitude ?? CITY_CONFIG.boston.longitude,
  };
  const profile = await buildUserDecisionProfile(session.userId);
  const requestProfile = buildDecisionRequestProfile(selection, session.cityKey);
  const ranked = rankCandidateForIntent({
    place,
    intent,
    requestProfile,
    origin,
    profile,
  });

  const updated = await decisionPrisma.decisionSession.update({
    where: { id: session.id },
    data: {
      options: {
        update: {
          where: {
            sessionId_placeId: {
              sessionId: session.id,
              placeId: targetOption.placeId,
            },
          },
          data: {
            placeId: place.id,
            sourceType: 'user_added',
            scoreTotal: ranked.breakdown.finalScore,
            scoreBreakdown: {
              ...ranked.breakdown,
              distanceMiles: Number(ranked.distanceMiles.toFixed(2)),
            },
            reasonLabel: 'Manually added into this decision session.',
            isSkipped: false,
            isSelected: false,
          },
        },
      },
    },
    include: {
      options: {
        include: {
            place: {
            include: DECISION_PLACE_INCLUDE,
          },
        },
        orderBy: { optionRank: 'asc' },
      },
    },
  });

  await logDecisionEvent({
    sessionId: session.id,
    userId: input.authUserId ?? session.userId,
    placeId: place.id,
    eventType: 'add_place_clicked',
  });

  return mapDecisionSessionForClient(updated);
}
