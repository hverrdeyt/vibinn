import crypto from 'node:crypto';
import './env';

const descriptorCache = new Map<string, { signature: string; summary: string; pendingSignature?: string }>();

type TravelerDescriptorInput = {
  userId: string;
  displayName?: string | null;
  moments: Array<{
    caption?: string | null;
    vibeTags?: string[];
    place: {
      name: string;
      location?: string;
      category?: string;
      tags?: string[];
    };
  }>;
  bookmarkedPlaces: Array<{
    name: string;
    location?: string;
    category?: string;
    tags?: string[];
  }>;
};

function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function bumpCount(map: Map<string, number>, key: string, weight: number) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

type TravelerKeywordRule = {
  label: string;
  tokens: string[];
  priority: number;
};

const TRAVELER_KEYWORD_RULES: TravelerKeywordRule[] = [
  {
    label: 'Coffee hunter',
    tokens: ['good coffee', 'coffee', 'cafe', 'espresso', 'roastery', 'matcha', 'coffee stop', 'coffee run'],
    priority: 95,
  },
  {
    label: 'Sweet tooth',
    tokens: ['dessert', 'sweet', 'bakery', 'pastry', 'ice cream', 'cake', 'donut', 'sweet stop', 'little treat'],
    priority: 92,
  },
  {
    label: 'Late-night plans',
    tokens: ['drinks nightlife', 'nightlife', 'late night', 'bar', 'cocktail', 'speakeasy', 'after dark', 'night out'],
    priority: 90,
  },
  {
    label: 'Wine night',
    tokens: ['wine', 'wine bar', 'natural wine', 'date drinks'],
    priority: 88,
  },
  {
    label: 'Asian comfort',
    tokens: ['asian comfort food', 'asian comfort', 'asian', 'japanese', 'korean', 'thai', 'vietnamese', 'chinese'],
    priority: 86,
  },
  {
    label: 'Ramen mood',
    tokens: ['ramen'],
    priority: 84,
  },
  {
    label: 'Sushi fix',
    tokens: ['sushi'],
    priority: 83,
  },
  {
    label: 'Casual eats',
    tokens: ['street food casual eats', 'casual eats', 'food', 'restaurant', 'burger', 'taco', 'pizza', 'sandwich', 'easy bite'],
    priority: 80,
  },
  {
    label: 'Culture strolls',
    tokens: ['fun activities', 'culture', 'museum', 'gallery', 'art', 'historic', 'landmark', 'theater', 'cinema', 'culture fix'],
    priority: 78,
  },
  {
    label: 'Gallery hopping',
    tokens: ['art gallery', 'gallery hopping', 'gallery'],
    priority: 77,
  },
  {
    label: 'Shop & stroll',
    tokens: ['shop stroll', 'shopping', 'shop around', 'boutique', 'market', 'store', 'weekend roam'],
    priority: 74,
  },
  {
    label: 'Bookish stops',
    tokens: ['bookstore', 'book store', 'bookish', 'library'],
    priority: 72,
  },
  {
    label: 'Outdoor reset',
    tokens: ['parks outdoor', 'outdoor', 'park', 'garden', 'trail', 'scenic', 'green reset', 'open air', 'touch grass'],
    priority: 70,
  },
  {
    label: 'Aesthetic cafes',
    tokens: ['aesthetic cafes', 'aesthetic', 'photo friendly', 'worth a look', 'instagrammable', 'cute cafe'],
    priority: 68,
  },
  {
    label: 'Group hangouts',
    tokens: ['group friendly', 'group hangout', 'group drinks', 'good for groups'],
    priority: 62,
  },
  {
    label: 'Hidden gems',
    tokens: ['hidden gem', 'little detour', 'worth a stop', 'easy wander'],
    priority: 52,
  },
];

const GENERIC_DESCRIPTOR_TOKENS = new Set([
  'place',
  'point of interest',
  'establishment',
  'recommended spot',
  'easy stop',
  'highly rated',
  'trending pick',
  'city break',
]);

function addMatchedTravelerKeywords(counts: Map<string, number>, rawValue: string, weight: number) {
  const value = normalizeKeyword(rawValue);
  if (!value || GENERIC_DESCRIPTOR_TOKENS.has(value)) return;

  for (const rule of TRAVELER_KEYWORD_RULES) {
    if (rule.tokens.some((token) => value.includes(token))) {
      bumpCount(counts, rule.label, weight + rule.priority / 100);
    }
  }
}

function buildTravelerKeywordDescriptor(input: TravelerDescriptorInput) {
  const keywordCounts = new Map<string, number>();

  for (const moment of input.moments) {
    for (const tag of moment.vibeTags ?? []) {
      addMatchedTravelerKeywords(keywordCounts, tag, 3);
    }

    addMatchedTravelerKeywords(keywordCounts, moment.place.category ?? '', 3);
    addMatchedTravelerKeywords(keywordCounts, moment.caption ?? '', 1.5);

    for (const tag of moment.place.tags ?? []) {
      addMatchedTravelerKeywords(keywordCounts, tag, 2.5);
    }
  }

  for (const place of input.bookmarkedPlaces) {
    addMatchedTravelerKeywords(keywordCounts, place.category ?? '', 1);

    for (const tag of place.tags ?? []) {
      addMatchedTravelerKeywords(keywordCounts, tag, 1);
    }
  }

  const selectedKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 4);

  const fallbacks = ['City explorer', 'Food curious', 'Hidden gems', 'Weekend plans'];
  for (const fallback of fallbacks) {
    if (selectedKeywords.length >= 3) break;
    if (!selectedKeywords.includes(fallback)) selectedKeywords.push(fallback);
  }

  return selectedKeywords.join(' · ');
}

function buildDescriptorSignature(input: TravelerDescriptorInput) {
  const signaturePayload = {
    userId: input.userId,
    moments: input.moments.slice(0, 12).map((moment) => ({
      caption: moment.caption ?? '',
      vibeTags: (moment.vibeTags ?? []).slice(0, 4),
      place: {
        name: moment.place.name,
        location: moment.place.location ?? '',
        category: moment.place.category ?? '',
        tags: (moment.place.tags ?? []).slice(0, 4),
      },
    })),
    bookmarkedPlaces: input.bookmarkedPlaces.slice(0, 12).map((place) => ({
      name: place.name,
      location: place.location ?? '',
      category: place.category ?? '',
      tags: (place.tags ?? []).slice(0, 4),
    })),
  };

  return crypto.createHash('sha1').update(JSON.stringify(signaturePayload)).digest('hex');
}

async function computeTravelerDescriptorSummary(input: TravelerDescriptorInput) {
  return buildTravelerKeywordDescriptor(input);
}

export function queueTravelerProfileDescriptorRefresh(input: TravelerDescriptorInput) {
  const signature = buildDescriptorSignature(input);
  const cached = descriptorCache.get(input.userId);
  if (cached?.signature === signature || cached?.pendingSignature === signature) {
    return;
  }

  descriptorCache.set(input.userId, {
    signature: cached?.signature ?? signature,
    summary: cached?.summary ?? buildTravelerKeywordDescriptor(input),
    pendingSignature: signature,
  });

  void computeTravelerDescriptorSummary(input)
    .then((summary) => {
      descriptorCache.set(input.userId, { signature, summary });
    })
    .catch(() => {
      const fallbackSummary = buildTravelerKeywordDescriptor(input);
      descriptorCache.set(input.userId, { signature, summary: fallbackSummary });
    });
}

export async function generateTravelerProfileDescriptor(input: TravelerDescriptorInput) {
  const signature = buildDescriptorSignature(input);
  const cached = descriptorCache.get(input.userId);
  if (cached?.signature === signature) {
    return cached.summary;
  }

  if (cached?.summary) {
    queueTravelerProfileDescriptorRefresh(input);
    return cached.summary;
  }

  const summary = await computeTravelerDescriptorSummary(input);
  descriptorCache.set(input.userId, { signature, summary });
  return summary;
}
