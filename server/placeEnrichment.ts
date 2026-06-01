import './env';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function dedupeKeywords(values: unknown) {
  const sourceValues = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[,\n]/g)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of sourceValues) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeKeyword(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

const GENERIC_VIBE_TAGS = new Set([
  'point of interest',
  'tourist attraction',
  'establishment',
  'place',
  'location',
  'premise',
  'park',
  'museum',
  'cafe',
  'coffee shop',
  'art gallery',
]);

function titleCase(value: string) {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export type DeterministicPlaceEnrichmentInput = {
  name: string;
  address?: string | null;
  city: string | null;
  country: string | null;
  neighborhood?: string | null;
  adminAreaLevel4?: string | null;
  category: string;
  rating: number | null;
  priceLevel?: number | null;
  userRatingCount?: number | null;
  googlePrimaryType?: string | null;
  googlePrimaryTypeDisplayName?: string | null;
  googleMapsTypeLabel?: string | null;
  googleTypes?: string[] | null;
  servesBreakfast?: boolean | null;
  servesLunch?: boolean | null;
  servesDinner?: boolean | null;
  servesBeer?: boolean | null;
  servesWine?: boolean | null;
  servesBrunch?: boolean | null;
  servesDessert?: boolean | null;
  servesCoffee?: boolean | null;
  servesCocktails?: boolean | null;
  goodForGroups?: boolean | null;
  goodForWatchingSports?: boolean | null;
  outdoorSeating?: boolean | null;
  discoverySignals?: Array<{
    queryText?: string | null;
    preferenceCategory?: string | null;
    resultRank?: number | null;
    bestResultRank?: number | null;
  }> | null;
};

type DeterministicTemplate = {
  id: string;
  preferenceCategories?: string[];
  keywords: string[];
  serviceFlags?: Array<keyof DeterministicPlaceEnrichmentInput>;
  hook: (context: DeterministicTemplateContext) => string;
  description: (context: DeterministicTemplateContext) => string;
  vibeTags: (context: DeterministicTemplateContext) => string[];
  attitudeLabel: string;
  bestTime: string | null;
};

type DeterministicTemplateContext = {
  placeName: string;
  category: string;
  categoryLabel: string;
  locale: string;
  area: string | null;
  hasStrongRating: boolean;
  bestRank: number | null;
  signalCategories: Set<string>;
  queryText: string;
  place: DeterministicPlaceEnrichmentInput;
};

function normalizePreferenceCategory(value?: string | null) {
  return normalizeKeyword(value ?? '').replace(/\s+/g, '_');
}

function compactTitleCase(value?: string | null) {
  const normalized = normalizeKeyword(value ?? '');
  if (!normalized) return '';
  return titleCase(normalized);
}

function bestSignalRank(signals?: DeterministicPlaceEnrichmentInput['discoverySignals']) {
  const ranks = (signals ?? [])
    .map((signal) => signal.bestResultRank ?? signal.resultRank ?? null)
    .filter((rank): rank is number => typeof rank === 'number');
  return ranks.length ? Math.min(...ranks) : null;
}

function buildDeterministicTemplateContext(place: DeterministicPlaceEnrichmentInput): DeterministicTemplateContext {
  const categoryParts = [
    place.category,
    place.googlePrimaryTypeDisplayName,
    place.googleMapsTypeLabel,
    place.googlePrimaryType,
    ...(place.googleTypes ?? []),
  ];
  const category = normalizeKeyword(categoryParts.filter(Boolean).join(' '));
  const cityLabel = place.city && !/^\w{2,}\d|^\d|^jl\.|^rr|^vr/i.test(place.city) ? place.city : null;
  const area = place.neighborhood ?? place.adminAreaLevel4 ?? null;
  const locale = area ?? cityLabel ?? place.country ?? 'the city';
  const signalCategories = new Set(
    (place.discoverySignals ?? [])
      .map((signal) => normalizePreferenceCategory(signal.preferenceCategory))
      .filter(Boolean),
  );
  const queryText = normalizeKeyword((place.discoverySignals ?? []).map((signal) => signal.queryText).filter(Boolean).join(' '));
  const categoryLabel =
    compactTitleCase(place.googlePrimaryTypeDisplayName) ||
    compactTitleCase(place.googleMapsTypeLabel) ||
    compactTitleCase(place.category) ||
    'Place';

  return {
    placeName: titleCase(place.name),
    category,
    categoryLabel,
    locale,
    area,
    hasStrongRating: typeof place.rating === 'number' && place.rating >= 4.5,
    bestRank: bestSignalRank(place.discoverySignals),
    signalCategories,
    queryText,
    place,
  };
}

function hasAnyKeyword(context: DeterministicTemplateContext, keywords: string[]) {
  return keywords.some((keyword) => context.category.includes(keyword) || context.queryText.includes(keyword));
}

function hasAnyPreference(context: DeterministicTemplateContext, preferenceCategories: string[] = []) {
  return preferenceCategories.some((category) => context.signalCategories.has(normalizePreferenceCategory(category)));
}

function hasAnyServiceFlag(context: DeterministicTemplateContext, flags: Array<keyof DeterministicPlaceEnrichmentInput> = []) {
  return flags.some((flag) => context.place[flag] === true);
}

const DETERMINISTIC_PLACE_TEMPLATES: DeterministicTemplate[] = [
  {
    id: 'coffee',
    preferenceCategories: ['good_coffee', 'aesthetic_cafes'],
    keywords: ['coffee', 'cafe', 'espresso', 'roastery', 'matcha'],
    serviceFlags: ['servesCoffee'],
    hook: () => 'Coffee stop with enough reason to linger.',
    description: ({ placeName, locale }) => `${placeName} fits when you want a reliable coffee pause around ${locale}.`,
    vibeTags: ({ place }) => ['Coffee Stop', place.outdoorSeating ? 'Outdoor Seat' : 'Easy Pause', place.servesDessert ? 'Sweet Pairing' : 'Cafe Break'],
    attitudeLabel: 'Coffee Run',
    bestTime: 'Mid-morning',
  },
  {
    id: 'dessert',
    preferenceCategories: ['desserts_sweet_treats'],
    keywords: ['dessert', 'bakery', 'pastry', 'ice cream', 'sweet', 'cake', 'donut'],
    serviceFlags: ['servesDessert'],
    hook: () => 'Sweet stop built for a little treat detour.',
    description: ({ placeName, locale }) => `${placeName} works best when the plan needs something sweet around ${locale}.`,
    vibeTags: () => ['Sweet Stop', 'Dessert Run', 'Little Treat'],
    attitudeLabel: 'Sweet Stop',
    bestTime: 'Late afternoon',
  },
  {
    id: 'asian',
    preferenceCategories: ['asian_comfort_food'],
    keywords: ['ramen', 'sushi', 'asian', 'japanese', 'korean', 'thai', 'vietnamese', 'chinese', 'noodle'],
    hook: () => 'Comfort-food energy without making the plan complicated.',
    description: ({ placeName, locale }) => `${placeName} is an easy pick when you want Asian comfort food around ${locale}.`,
    vibeTags: ({ category }) => [
      category.includes('sushi') ? 'Sushi Fix' : category.includes('ramen') ? 'Ramen Mood' : 'Asian Comfort',
      'Casual Eats',
      'Food Plan',
    ],
    attitudeLabel: 'Comfort Crave',
    bestTime: 'Dinner',
  },
  {
    id: 'casual-food',
    preferenceCategories: ['street_food_casual_eats'],
    keywords: ['restaurant', 'food', 'eat', 'burger', 'taco', 'sandwich', 'pizza', 'street food', 'fast casual'],
    serviceFlags: ['servesLunch', 'servesDinner'],
    hook: () => 'Low-friction food stop for an easy plan.',
    description: ({ placeName, locale }) => `${placeName} makes sense when you want a casual food stop around ${locale}.`,
    vibeTags: ({ place }) => ['Casual Eats', place.servesLunch ? 'Lunch Move' : 'Food Stop', place.goodForGroups ? 'Group Friendly' : 'Easy Bite'],
    attitudeLabel: 'Easy Bite',
    bestTime: 'Lunch',
  },
  {
    id: 'drinks',
    preferenceCategories: ['drinks_nightlife'],
    keywords: ['bar', 'wine', 'cocktail', 'pub', 'nightlife', 'beer'],
    serviceFlags: ['servesBeer', 'servesWine', 'servesCocktails'],
    hook: () => 'Easy place to turn the night into something.',
    description: ({ placeName, locale }) => `${placeName} fits when the plan is drinks, dinner momentum, or a social night around ${locale}.`,
    vibeTags: ({ place }) => [place.servesWine ? 'Wine Bar' : 'Drinks Spot', place.goodForGroups ? 'Group Drinks' : 'Night Out', 'After Dark'],
    attitudeLabel: 'Night Out',
    bestTime: 'After dark',
  },
  {
    id: 'shop-stroll',
    preferenceCategories: ['shop_stroll'],
    keywords: ['shopping', 'store', 'boutique', 'market', 'bookstore', 'book store', 'mall'],
    hook: () => 'Worth a little wander instead of a hard plan.',
    description: ({ placeName, locale }) => `${placeName} fits when you want to browse, stroll, and let the stop shape the plan around ${locale}.`,
    vibeTags: ({ category }) => [category.includes('book') ? 'Bookish Stop' : 'Shop Around', 'Weekend Roam', 'Little Detour'],
    attitudeLabel: 'Shop Around',
    bestTime: 'Midday',
  },
  {
    id: 'culture',
    preferenceCategories: ['fun_activities'],
    keywords: ['museum', 'gallery', 'art', 'historic', 'theater', 'cinema', 'landmark', 'tourist attraction'],
    hook: () => 'Culture stop with a real sense of place.',
    description: ({ placeName, locale }) => `${placeName} works when you want a thoughtful activity or city highlight around ${locale}.`,
    vibeTags: () => ['Culture Fix', 'City Highlight', 'Easy Wander'],
    attitudeLabel: 'Culture Fix',
    bestTime: 'Late afternoon',
  },
  {
    id: 'parks-outdoor',
    preferenceCategories: ['parks_outdoor'],
    keywords: ['park', 'garden', 'outdoor', 'scenic', 'trail', 'walk', 'beach'],
    serviceFlags: ['outdoorSeating'],
    hook: () => 'Green reset for when the city needs breathing room.',
    description: ({ placeName, locale }) => `${placeName} is a simple outdoor reset for a walk, a breather, or slower time around ${locale}.`,
    vibeTags: () => ['Green Reset', 'Open Air', 'Short Walk'],
    attitudeLabel: 'Touch Grass',
    bestTime: 'Early morning',
  },
  {
    id: 'aesthetic',
    preferenceCategories: ['aesthetic_cafes'],
    keywords: ['aesthetic', 'instagrammable', 'cute cafe', 'design', 'concept'],
    hook: () => 'Pretty enough for the camera, easy enough for the plan.',
    description: ({ placeName, locale }) => `${placeName} fits when you want a visually nice stop that still works as part of a real day around ${locale}.`,
    vibeTags: () => ['Aesthetic Stop', 'Photo Friendly', 'Cafe Mood'],
    attitudeLabel: 'Worth A Look',
    bestTime: 'Late morning',
  },
];

function chooseDeterministicTemplate(context: DeterministicTemplateContext) {
  return DETERMINISTIC_PLACE_TEMPLATES.find((template) => (
    hasAnyPreference(context, template.preferenceCategories) ||
    hasAnyServiceFlag(context, template.serviceFlags) ||
    hasAnyKeyword(context, template.keywords)
  ));
}

function cleanDeterministicTags(tags: string[], fallback: string) {
  const cleaned = dedupeKeywords(tags)
    .filter((tag) => !GENERIC_VIBE_TAGS.has(tag))
    .slice(0, 4)
    .map(titleCase);

  return cleaned.length > 0 ? cleaned : [fallback].filter(Boolean).map(titleCase);
}

export function generateDeterministicPlaceEnrichment(place: DeterministicPlaceEnrichmentInput) {
  const context = buildDeterministicTemplateContext(place);
  const template = chooseDeterministicTemplate(context);

  if (template) {
    const extraTags = [
      context.bestRank != null && context.bestRank <= 5 ? 'Trending Pick' : null,
      context.hasStrongRating ? 'Highly Rated' : null,
    ].filter((tag): tag is string => Boolean(tag));
    const rawTags = [...template.vibeTags(context), ...extraTags];

    return {
      hook: truncateText(template.hook(context), 80),
      description: truncateText(template.description(context), 180),
      vibeTags: cleanDeterministicTags(rawTags, context.categoryLabel),
      attitudeLabel: truncateText(template.attitudeLabel, 28),
      bestTime: template.bestTime,
    };
  }

  return {
    hook: truncateText(`${context.categoryLabel} worth a closer look in ${context.locale}.`, 80),
    description: truncateText(`${context.placeName} stands out as a low-friction stop when you want something easy to add around ${context.locale}.`, 180),
    vibeTags: cleanDeterministicTags([context.categoryLabel, context.hasStrongRating ? 'Highly Rated' : 'Easy Stop'], context.categoryLabel),
    attitudeLabel: 'Worth A Stop',
    bestTime: null,
  };
}

function buildHeuristicPlaceAiEnrichment(place: DeterministicPlaceEnrichmentInput) {
  const category = normalizeKeyword(place.category);
  const cityLabel = place.city && !/^\w{2,}\d|^\d|^jl\.|^rr|^vr/i.test(place.city) ? place.city : null;
  const locale = cityLabel ?? place.country ?? 'the city';

  if (category.includes('park')) {
    return {
      hook: truncateText(`Green reset tucked into ${locale}.`, 80),
      description: truncateText(`${titleCase(place.name)} is an easy outdoor stop for a walk, a breather, and a slower pocket of city time.`, 180),
      vibeTags: ['green reset', 'short walk', 'open air'],
      attitudeLabel: 'touch grass',
      bestTime: 'early morning',
    };
  }

  if (category.includes('tourist attraction') || category.includes('scenic') || category.includes('landmark')) {
    return {
      hook: truncateText(`Classic stop with a strong sense of place in ${locale}.`, 80),
      description: truncateText(`${titleCase(place.name)} works best when you want a recognisable city highlight with room to wander, look around, and take it in slowly.`, 180),
      vibeTags: ['city highlight', 'photo stop', 'easy wander'],
      attitudeLabel: 'photo stop',
      bestTime: 'early morning',
    };
  }

  if (category.includes('art gallery') || category.includes('museum')) {
    return {
      hook: truncateText(`Quiet culture stop with an easy browse rhythm.`, 80),
      description: truncateText(`${titleCase(place.name)} offers a compact art-and-culture pause that suits a slower visit and a more thoughtful detour through ${locale}.`, 180),
      vibeTags: ['quiet browse', 'culture fix', 'thoughtful stop'],
      attitudeLabel: 'quiet culture',
      bestTime: 'late afternoon',
    };
  }

  if (category.includes('cafe') || category.includes('coffee')) {
    return {
      hook: truncateText(`Coffee stop worth folding into a slower city loop.`, 80),
      description: truncateText(`${titleCase(place.name)} feels best as an easy café pause when you want something reliable, unfussy, and easy to pair with a walk nearby.`, 180),
      vibeTags: ['coffee stop', 'easy pause', 'city break'],
      attitudeLabel: 'coffee run',
      bestTime: 'mid-morning',
    };
  }

  if (category.includes('dessert') || category.includes('bakery') || category.includes('ice cream') || category.includes('pastry')) {
    return {
      hook: truncateText(`Sweet stop worth working into your ${locale} loop.`, 80),
      description: truncateText(`${titleCase(place.name)} makes most sense when you want an easy dessert-led stop that still feels like part of the plan.`, 180),
      vibeTags: ['sweet stop', 'dessert run', 'little treat'],
      attitudeLabel: 'sweet stop',
      bestTime: 'late afternoon',
    };
  }

  if (category.includes('bar') || category.includes('cocktail') || category.includes('night') || category.includes('pub')) {
    return {
      hook: truncateText(`Easy place to turn the night into something.`, 80),
      description: truncateText(`${titleCase(place.name)} works best when the plan is drinks, a little momentum, and a place that feels social without overthinking it.`, 180),
      vibeTags: ['night out', 'date drinks', 'group plans'],
      attitudeLabel: 'night out',
      bestTime: 'after dark',
    };
  }

  if (category.includes('bookstore') || category.includes('library')) {
    return {
      hook: truncateText(`Quiet browse energy with enough reason to stay.`, 80),
      description: truncateText(`${titleCase(place.name)} lands best when you want a slower browse, a small reset, and something a little more thoughtful than another quick stop.`, 180),
      vibeTags: ['bookish stop', 'quiet hang', 'slow browse'],
      attitudeLabel: 'bookish stop',
      bestTime: 'late afternoon',
    };
  }

  if (category.includes('shopping') || category.includes('store') || category.includes('market') || category.includes('boutique')) {
    return {
      hook: truncateText(`Worth a little wander instead of a hard plan.`, 80),
      description: truncateText(`${titleCase(place.name)} fits best when the mood is to walk around, look for something interesting, and let the stop shape the rest.`, 180),
      vibeTags: ['shop around', 'weekend roam', 'little detour'],
      attitudeLabel: 'shop around',
      bestTime: 'midday',
    };
  }

  return {
    hook: truncateText(`${titleCase(category || 'Place')} worth a closer look in ${locale}.`, 80),
    description: truncateText(`${titleCase(place.name)} stands out as a solid ${category || 'travel'} stop when you want a low-friction addition to your plan in ${locale}.`, 180),
    vibeTags: dedupeKeywords([category || 'recommended stop', 'easy stop']),
    attitudeLabel: 'worth a stop',
    bestTime: null,
  };
}

function parseJsonFromOpenAIResponse(payload: any) {
  const tryParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const extractJsonCandidate = (value: string) => {
    const trimmed = value.trim();
    const direct = tryParse(trimmed);
    if (direct) return direct;

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      const fencedParsed = tryParse(fencedMatch[1].trim());
      if (fencedParsed) return fencedParsed;
    }

    const firstObjectStart = trimmed.indexOf('{');
    const lastObjectEnd = trimmed.lastIndexOf('}');
    if (firstObjectStart !== -1 && lastObjectEnd !== -1 && lastObjectEnd > firstObjectStart) {
      const objectParsed = tryParse(trimmed.slice(firstObjectStart, lastObjectEnd + 1));
      if (objectParsed) return objectParsed;
    }

    const firstArrayStart = trimmed.indexOf('[');
    const lastArrayEnd = trimmed.lastIndexOf(']');
    if (firstArrayStart !== -1 && lastArrayEnd !== -1 && lastArrayEnd > firstArrayStart) {
      const arrayParsed = tryParse(trimmed.slice(firstArrayStart, lastArrayEnd + 1));
      if (arrayParsed) return arrayParsed;
    }

    return null;
  };

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    const parsed = extractJsonCandidate(payload.output_text);
    if (parsed) return parsed;
  }

  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string' && content.text.trim()) {
        const parsed = extractJsonCandidate(content.text);
        if (parsed) return parsed;
      }

      const jsonCandidate = content?.json ?? content?.parsed ?? content?.value;
      if (jsonCandidate && typeof jsonCandidate === 'object') {
        return jsonCandidate;
      }
    }
  }

  throw new Error('OpenAI response did not include structured JSON text');
}

async function runOpenAIJsonRequest(body: Record<string, unknown>) {
  if (!OPENAI_API_KEY) return null;

  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const payload = await response.json() as any;
      try {
        return parseJsonFromOpenAIResponse(payload);
      } catch (error) {
        if (attempt < OPENAI_MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    const errorText = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < OPENAI_MAX_RETRIES) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    throw new Error(`OpenAI enrichment failed with ${response.status}: ${errorText}`);
  }

  return null;
}

export async function generatePlaceAiEnrichment(place: {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  category: string;
  rating: number | null;
  priceLevel: number | null;
}) {
  if (!OPENAI_API_KEY) return null;

  const category = normalizeKeyword(place.category);
  const locationLabel = [place.city, place.country].filter(Boolean).join(', ') || place.address || null;

  const requestBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You create concise editorial travel-place enrichment for a discovery app. Stay factual, avoid invented claims, and keep outputs compact, specific, and tasteful. Do not repeat the place name in the hook. Do not use generic phrases like "keeps showing up for your vibe". Do not output raw addresses as the description. Prefer sensory or situational cues that can be reasonably inferred from the place type, rating, and known location context.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              place: {
                name: place.name,
                address: place.address,
                city: place.city,
                country: place.country,
                category,
                rating: place.rating,
                priceLevel: place.priceLevel,
              },
              constraints: {
                avoid_phrases: [
                  'keeps showing up for your vibe',
                  'point of interest',
                  'tourist attraction',
                  'new find',
                  'golden hour',
                  'good for',
                  'great for',
                ],
                avoid_description_patterns: [
                  'raw address only',
                  'copying the place name',
                  'restating category without context',
                ],
                tag_style: 'specific mood or use-case tags only, casual and hooky',
                context_hint: locationLabel,
              },
              output_rules: {
                hook: '1 short editorial line, max 80 chars, no place name repetition',
                description: '1 sentence, max 180 chars, factual and not just an address',
                vibeTags: '2 to 4 short lowercase tags, no hashtags',
                attitudeLabel: '1 unique lowercase micro-tag, 2 to 4 words, casual, gen-z friendly, specific to this place, like sweet stop, night out, touch grass, bookish stop, date drinks, or coffee run',
                bestTime: 'simple time phrase like early morning, midday, sunset, after dark, late night, or null if unclear',
              },
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'place_enrichment',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hook: { type: 'string' },
            description: { type: 'string' },
            vibeTags: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string' },
            },
            attitudeLabel: {
              type: ['string', 'null'],
            },
            bestTime: {
              type: ['string', 'null'],
            },
          },
          required: ['hook', 'description', 'vibeTags', 'attitudeLabel', 'bestTime'],
        },
      },
    },
    reasoning: {
      effort: 'low' as const,
    },
    max_output_tokens: 300,
  };

  let parsed: {
    hook: string;
    description: string;
    vibeTags: string[];
    attitudeLabel: string | null;
    bestTime: string | null;
  } | null = null;

  try {
    parsed = await runOpenAIJsonRequest(requestBody) as {
      hook: string;
      description: string;
      vibeTags: string[];
      attitudeLabel: string | null;
      bestTime: string | null;
    } | null;
  } catch {
    try {
      parsed = await runOpenAIJsonRequest({
        ...requestBody,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'Return only valid JSON matching the schema. Be concise, factual, and specific. No markdown.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Create travel-place enrichment JSON for this place.\nName: ${place.name}\nCategory: ${category}\nCity: ${place.city ?? 'unknown'}\nCountry: ${place.country ?? 'unknown'}\nAddress: ${place.address ?? 'unknown'}\nRating: ${place.rating ?? 'unknown'}\nPrice level: ${place.priceLevel ?? 'unknown'}\nReturn hook, description, vibeTags, attitudeLabel, bestTime.`,
              },
            ],
          },
        ],
        max_output_tokens: 220,
      }) as {
        hook: string;
        description: string;
        vibeTags: string[];
        attitudeLabel: string | null;
        bestTime: string | null;
      } | null;
    } catch {
      parsed = buildHeuristicPlaceAiEnrichment(place);
    }
  }

  if (!parsed) {
    parsed = buildHeuristicPlaceAiEnrichment(place);
  }

  const filteredVibeTags = dedupeKeywords(parsed.vibeTags)
    .filter((tag) => !GENERIC_VIBE_TAGS.has(tag))
    .slice(0, 4);
  const safeHook = typeof parsed.hook === 'string' ? parsed.hook : '';
  const safeDescription = typeof parsed.description === 'string' ? parsed.description : '';
  const cleanedHook = truncateText(
    safeHook.trim().replace(new RegExp(place.name, 'ig'), '').replace(/\s{2,}/g, ' ').trim(),
    80,
  );
  const cleanedDescription = truncateText(safeDescription.trim(), 180);

  return {
    hook: cleanedHook || truncateText(`${category} worth a closer look`, 80),
    description: cleanedDescription || truncateText(`${place.name} in ${place.city ?? place.country ?? 'this area'} is a notable ${category} stop.`, 180),
    vibeTags: filteredVibeTags.length > 0 ? filteredVibeTags : dedupeKeywords([category]).slice(0, 1),
    attitudeLabel: parsed.attitudeLabel
      ? truncateText(
          parsed.attitudeLabel
            .trim()
            .replace(/^new find$/i, '')
            .replace(/^hidden gem$/i, 'worth a stop')
            .toLowerCase(),
          28,
        ) || null
      : null,
    bestTime: parsed.bestTime
      ? truncateText(parsed.bestTime.trim().replace(/^golden hour$/i, '').trim(), 32) || null
      : null,
  };
}

export async function generateAiCompatibilityAssessment(input: {
  place: {
    name: string;
    city: string | null;
    country: string | null;
    category: string;
    rating: number | null;
    vibeTags: string[];
    attitudeLabel?: string | null;
    bestTime?: string | null;
  };
  user: {
    selectedInterests: string[];
    selectedVibe: string | null;
    tasteKeywords: string[];
    socialKeywords: string[];
    tasteProfileSummary?: string[];
    followedPlaceMatch: boolean;
    isBookmarked: boolean;
    isVisited: boolean;
    isVibed: boolean;
    isCommented: boolean;
    isRecent: boolean;
  };
}) {
  if (!OPENAI_API_KEY) return null;

  const parsed = await runOpenAIJsonRequest({
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You write ultra-short personalized recommendation reasons for a Gen Z travel app. Be conservative and use only the provided facts. Sound sharp, social, and specific without sounding cringe. The reason must feel like it was written for this exact user, not a generic preference bucket. Use the strongest behavioral or taste signal only. Prefer language that feels editorial and social, like a smart friend calling out why this place is so them. Avoid phrases like "matches your vibe", "based on your preferences", "current profile", or "you may like". Return compact JSON only.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              place: input.place,
              user: input.user,
              output_rules: {
                boost: 'integer from -8 to 12',
                reason: 'one short sentence, max 90 chars, highly personal, specific, Gen Z-friendly',
              },
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'compatibility_assessment',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            boost: { type: 'integer', minimum: -8, maximum: 12 },
            reason: { type: 'string' },
          },
          required: ['boost', 'reason'],
        },
      },
    },
    reasoning: {
      effort: 'low',
    },
    max_output_tokens: 160,
  }) as { boost: number; reason: string } | null;

  if (!parsed) return null;

  return {
    boost: Math.max(-8, Math.min(12, Math.round(parsed.boost))),
    reason: truncateText(parsed.reason.trim(), 110),
  };
}
