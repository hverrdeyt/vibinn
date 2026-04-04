import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

const descriptorCache = new Map<string, { signature: string; summary: string }>();

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

function sanitizeSingleSentence(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const firstSentence = trimmed.match(/[^.!?]+[.!?]?/u)?.[0]?.trim() ?? trimmed;
  const capped = firstSentence.length > 120 ? `${firstSentence.slice(0, 119).trimEnd()}…` : firstSentence;
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function pickTravelerArchetype(input: TravelerDescriptorInput) {
  const haystack = [
    ...input.moments.flatMap((moment) => [
      ...(moment.vibeTags ?? []),
      moment.place.category ?? '',
      ...(moment.place.tags ?? []),
      moment.caption ?? '',
    ]),
    ...input.bookmarkedPlaces.flatMap((place) => [
      place.category ?? '',
      ...(place.tags ?? []),
    ]),
  ].map(normalizeKeyword);

  const includesAny = (tokens: string[]) => tokens.some((token) => haystack.some((item) => item.includes(token)));

  if (includesAny(['cocktail', 'late night', 'nightlife', 'dj', 'live music', 'jazz', 'speakeasy'])) {
    return 'after-dark traveler';
  }
  if (includesAny(['coffee', 'cafe', 'espresso', 'bakery', 'bookstore'])) {
    return 'slow-city traveler';
  }
  if (includesAny(['museum', 'gallery', 'historic', 'design', 'arts', 'theatre'])) {
    return 'culture-first traveler';
  }
  if (includesAny(['market', 'boutique', 'retail', 'design shop', 'bazaar', 'showroom'])) {
    return 'taste-led shopper';
  }
  if (includesAny(['park', 'garden', 'waterfront', 'trail', 'outdoor', 'green reset'])) {
    return 'reset-seeking traveler';
  }

  return 'taste-led traveler';
}

function parseStructuredSummary(payload: any) {
  const candidates: string[] = [];

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    candidates.push(payload.output_text.trim());
  }

  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        candidates.push(content.text.trim());
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
        return sanitizeSingleSentence(parsed.summary);
      }
    } catch {
      const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
      if (!fenced) continue;
      try {
        const parsed = JSON.parse(fenced);
        if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
          return sanitizeSingleSentence(parsed.summary);
        }
      } catch {
        // Ignore parse failure and keep looking.
      }
    }
  }

  return '';
}

function buildHeuristicTravelerDescriptor(input: TravelerDescriptorInput) {
  const vibeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();

  for (const moment of input.moments) {
    for (const tag of moment.vibeTags ?? []) {
      const normalized = normalizeKeyword(tag);
      if (!normalized) continue;
      vibeCounts.set(normalized, (vibeCounts.get(normalized) ?? 0) + 1);
    }

    const normalizedCategory = normalizeKeyword(moment.place.category ?? '');
    if (normalizedCategory) {
      categoryCounts.set(normalizedCategory, (categoryCounts.get(normalizedCategory) ?? 0) + 1);
    }

    const city = moment.place.location?.split(',')[0]?.trim();
    if (city) {
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    }
  }

  for (const place of input.bookmarkedPlaces) {
    const normalizedCategory = normalizeKeyword(place.category ?? '');
    if (normalizedCategory) {
      categoryCounts.set(normalizedCategory, (categoryCounts.get(normalizedCategory) ?? 0) + 1);
    }
    for (const tag of place.tags ?? []) {
      const normalized = normalizeKeyword(tag);
      if (!normalized) continue;
      vibeCounts.set(normalized, (vibeCounts.get(normalized) ?? 0) + 1);
    }
  }

  const topVibes = Array.from(vibeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)
    .filter((value) => !['recommended stop', 'easy stop', 'city break', 'place'].includes(value))
    .slice(0, 2);
  const topCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)
    .filter((value) => !['point of interest', 'establishment', 'tourist attraction'].includes(value))
    .slice(0, 2);
  const topCity = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const archetype = pickTravelerArchetype(input);

  const descriptorParts = [
    topVibes[0],
    topVibes[1],
    topCategories[0],
  ].filter(Boolean);

  if (descriptorParts.length === 0) {
    return topCity
      ? `A ${archetype} building a memorable trail of places around ${topCity}.`
      : `A ${archetype} with a sharp eye for places that feel personal and worth passing on.`;
  }

  return sanitizeSingleSentence(
    `A ${archetype} with a thing for ${descriptorParts.join(', ')}${topCity ? ` around ${topCity}` : ''}`,
  );
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

export async function generateTravelerProfileDescriptor(input: TravelerDescriptorInput) {
  const signature = buildDescriptorSignature(input);
  const cached = descriptorCache.get(input.userId);
  if (cached?.signature === signature) {
    return cached.summary;
  }

  const heuristicSummary = buildHeuristicTravelerDescriptor(input);

  if (!OPENAI_API_KEY) {
    descriptorCache.set(input.userId, { signature, summary: heuristicSummary });
    return heuristicSummary;
  }

  const topMoments = input.moments.slice(0, 6).map((moment) => ({
    caption: moment.caption ?? '',
    vibeTags: moment.vibeTags ?? [],
    placeName: moment.place.name,
    location: moment.place.location ?? '',
    category: moment.place.category ?? '',
    tags: moment.place.tags ?? [],
  }));
  const topBookmarks = input.bookmarkedPlaces.slice(0, 6).map((place) => ({
    name: place.name,
    location: place.location ?? '',
    category: place.category ?? '',
    tags: place.tags ?? [],
  }));

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'You write ultra-short traveler taste descriptors. Return strict JSON: {"summary":"..."} only. The summary must be exactly one sentence, compelling, natural, under 120 characters, and position the person as a specific kind of traveler first, then hint at their taste. Example shape: "A late-night city traveler with a soft spot for underrated cocktail bars." Avoid generic words like passionate, loves to travel, explorer, wanderlust, or travel lover. No emojis. No hashtags.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  traveler: input.displayName ?? 'Traveler',
                  recentMoments: topMoments,
                  savedPlaces: topBookmarks,
                  fallbackStyle: heuristicSummary,
                }),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI traveler descriptor failed with ${response.status}`);
    }

    const payload = await response.json() as any;
    const summary = parseStructuredSummary(payload) || heuristicSummary;
    descriptorCache.set(input.userId, { signature, summary });
    return summary;
  } catch {
    descriptorCache.set(input.userId, { signature, summary: heuristicSummary });
    return heuristicSummary;
  }
}
