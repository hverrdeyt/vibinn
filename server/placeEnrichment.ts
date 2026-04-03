import dotenv from 'dotenv';

dotenv.config();

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

function buildHeuristicPlaceAiEnrichment(place: {
  name: string;
  city: string | null;
  country: string | null;
  category: string;
  rating: number | null;
}) {
  const category = normalizeKeyword(place.category);
  const cityLabel = place.city && !/^\w{2,}\d|^\d|^jl\.|^rr|^vr/i.test(place.city) ? place.city : null;
  const locale = cityLabel ?? place.country ?? 'the city';

  if (category.includes('park')) {
    return {
      hook: truncateText(`Green reset tucked into ${locale}.`, 80),
      description: truncateText(`${titleCase(place.name)} is an easy outdoor stop for a walk, a breather, and a slower pocket of city time.`, 180),
      vibeTags: ['green reset', 'short walk', 'open air'],
      attitudeLabel: 'green reset',
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
      attitudeLabel: 'hidden gem',
      bestTime: 'late afternoon',
    };
  }

  if (category.includes('cafe') || category.includes('coffee')) {
    return {
      hook: truncateText(`Coffee stop worth folding into a slower city loop.`, 80),
      description: truncateText(`${titleCase(place.name)} feels best as an easy café pause when you want something reliable, unfussy, and easy to pair with a walk nearby.`, 180),
      vibeTags: ['coffee stop', 'easy pause', 'city break'],
      attitudeLabel: 'coffee stop',
      bestTime: 'mid-morning',
    };
  }

  return {
    hook: truncateText(`${titleCase(category || 'Place')} worth a closer look in ${locale}.`, 80),
    description: truncateText(`${titleCase(place.name)} stands out as a solid ${category || 'travel'} stop when you want a low-friction addition to your plan in ${locale}.`, 180),
    vibeTags: dedupeKeywords([category || 'recommended stop', 'easy stop']),
    attitudeLabel: null,
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
                ],
                avoid_description_patterns: [
                  'raw address only',
                  'copying the place name',
                  'restating category without context',
                ],
                tag_style: 'specific mood or use-case tags only',
                context_hint: locationLabel,
              },
              output_rules: {
                hook: '1 short editorial line, max 80 chars, no place name repetition',
                description: '1 sentence, max 180 chars, factual and not just an address',
                vibeTags: '2 to 4 short lowercase tags, no hashtags',
                attitudeLabel: 'short label like hidden gem, worth the hype, easy stop, date-night pick, or null',
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
      ? truncateText(parsed.attitudeLabel.trim().replace(/^new find$/i, '').trim(), 28) || null
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
            text: 'You judge how well a travel place fits a user taste profile. Be conservative and use only the provided facts. Return compact JSON only.',
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
                reason: 'one short sentence, max 110 chars',
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
