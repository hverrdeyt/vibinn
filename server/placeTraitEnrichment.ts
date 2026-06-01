import './env';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
export const PLACE_TRAIT_SOURCE_VERSION = 'decision_traits_v1';

export type PlaceTraitScores = {
  quietScore: number;
  socialScore: number;
  soloScore: number;
  cozyScore: number;
  workScore: number;
  dateScore: number;
  utilitarianScore: number;
  qualityScore: number;
  quickReadyScore: number;
  stayReadyScore: number;
  budgetFriendlyScore: number;
  confidence: number;
  archetype?: string | null;
  evidence?: Record<string, string> | null;
};

export type OpenAiUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
};

export type PlaceTraitEnrichmentBatchInput = {
  provider?: 'openai';
  city?: string | null;
  limit?: number;
  placeIds?: string[];
  force?: boolean;
};

export type PlaceTraitCoverageStatus = {
  city: string | null;
  sourceVersion: string;
  totalCoffeePlaces: number;
  enrichedPlaces: number;
  remainingEligible: number;
  coverageRatio: number;
  sampleRemainingPlaceIds: string[];
};

export async function getStoredPlaceTraitProfile(placeId: string) {
  return prisma.placeTraitProfile.findUnique({
    where: { placeId },
  });
}

type RawPlaceInput = Awaited<ReturnType<typeof fetchPlaceForTraitEnrichment>>;

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function extractOpenAiUsage(raw: any): OpenAiUsageSummary {
  const usage = raw?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens ?? 0);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
  };
}

function extractStructuredJsonText(raw: any) {
  const outputItems = Array.isArray(raw?.output) ? raw.output : [];

  for (const item of outputItems) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (typeof content?.text === 'string' && content.text.trim().length > 0) {
        return content.text;
      }
      if (typeof content?.json === 'string' && content.json.trim().length > 0) {
        return content.json;
      }
    }
  }

  if (typeof raw?.output_text === 'string' && raw.output_text.trim().length > 0) {
    return raw.output_text;
  }

  return null;
}

function normalizeKeyword(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickReviewSnippets(reviewsJson: unknown, limit = 6) {
  if (!Array.isArray(reviewsJson)) return [];
  return reviewsJson
    .slice(0, limit)
    .map((review: any) => review?.text?.text ?? review?.originalText?.text ?? null)
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.slice(0, 500));
}

function buildTraitPromptInput(place: NonNullable<RawPlaceInput>) {
  return {
    id: place.id,
    name: place.name,
    city: place.city,
    country: place.country,
    neighborhood: place.neighborhood ?? place.adminAreaLevel4 ?? null,
    category: place.category,
    googlePrimaryType: place.googlePrimaryType,
    googleTypes: place.googleTypes,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    servesCoffee: place.servesCoffee,
    servesBreakfast: place.servesBreakfast,
    servesBrunch: place.servesBrunch,
    servesDessert: place.servesDessert,
    dineIn: place.dineIn,
    takeout: place.takeout,
    delivery: place.delivery,
    goodForGroups: place.goodForGroups,
    outdoorSeating: place.outdoorSeating,
    restroom: place.restroom,
    openingHours: place.openingHours,
    currentOpeningHours: place.currentOpeningHours,
    photoCount: Array.isArray(place.photosJson) ? place.photosJson.length : 0,
    reviewSummary: (place.reviewSummaryJson as any)?.text?.text ?? (place.reviewSummaryJson as any)?.text ?? null,
    editorialSummary: (place.editorialSummaryJson as any)?.text ?? null,
    generativeOverview: (place.generativeSummaryJson as any)?.overview?.text ?? null,
    reviewSnippets: pickReviewSnippets(place.reviewsJson, 6),
  };
}

async function fetchPlaceForTraitEnrichment(placeId: string) {
  return prisma.place.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      neighborhood: true,
      adminAreaLevel4: true,
      category: true,
      googlePrimaryType: true,
      googleTypes: true,
      rating: true,
      userRatingCount: true,
      priceLevel: true,
      servesCoffee: true,
      servesBreakfast: true,
      servesBrunch: true,
      servesDessert: true,
      dineIn: true,
      takeout: true,
      delivery: true,
      goodForGroups: true,
      outdoorSeating: true,
      restroom: true,
      openingHours: true,
      currentOpeningHours: true,
      photosJson: true,
      reviewSummaryJson: true,
      editorialSummaryJson: true,
      generativeSummaryJson: true,
      reviewsJson: true,
    },
  });
}

function deriveQuickReadyScore(input: ReturnType<typeof buildTraitPromptInput>, raw: any) {
  const text = normalizeKeyword([
    input.reviewSummary,
    input.editorialSummary,
    input.generativeOverview,
    ...(input.reviewSnippets ?? []),
  ].join(' '));
  let score = 0.2;
  if (input.takeout) score += 0.28;
  if (input.delivery) score += 0.08;
  if ((input.priceLevel ?? 2) <= 2) score += 0.08;
  if (text.includes('quick service') || text.includes('grab and go')) score += 0.22;
  if (raw.utilitarianScore >= 0.7) score += 0.12;
  if (text.includes('stay a while') || text.includes('destination cafe')) score -= 0.1;
  return clamp01(score);
}

function deriveStayReadyScore(input: ReturnType<typeof buildTraitPromptInput>, raw: any) {
  const text = normalizeKeyword([
    input.reviewSummary,
    input.editorialSummary,
    input.generativeOverview,
    ...(input.reviewSnippets ?? []),
  ].join(' '));
  let score = 0.2;
  if (input.dineIn) score += 0.28;
  if (input.outdoorSeating) score += 0.08;
  if (input.restroom) score += 0.06;
  if (input.servesBrunch || input.servesBreakfast) score += 0.06;
  if ((input.currentOpeningHours ?? []).length > 0 || (input.openingHours ?? []).length > 0) score += 0.04;
  if (text.includes('stay a while') || text.includes('destination cafe') || text.includes('lingering')) score += 0.18;
  if (raw.utilitarianScore >= 0.75) score -= 0.12;
  return clamp01(score);
}

export async function upsertPlaceTraitProfile(input: {
  placeId: string;
  provider: string;
  model?: string | null;
  traits: PlaceTraitScores;
  evidenceJson?: Prisma.InputJsonValue | null;
  rawResponseJson?: Prisma.InputJsonValue | null;
  inputSnapshotJson?: Prisma.InputJsonValue | null;
}) {
  return prisma.placeTraitProfile.upsert({
    where: { placeId: input.placeId },
    create: {
      placeId: input.placeId,
      provider: input.provider,
      model: input.model ?? null,
      sourceVersion: PLACE_TRAIT_SOURCE_VERSION,
      confidence: input.traits.confidence,
      quietScore: input.traits.quietScore,
      socialScore: input.traits.socialScore,
      soloScore: input.traits.soloScore,
      cozyScore: input.traits.cozyScore,
      workScore: input.traits.workScore,
      dateScore: input.traits.dateScore,
      utilitarianScore: input.traits.utilitarianScore,
      qualityScore: input.traits.qualityScore,
      quickReadyScore: input.traits.quickReadyScore,
      stayReadyScore: input.traits.stayReadyScore,
      budgetFriendlyScore: input.traits.budgetFriendlyScore,
      archetype: input.traits.archetype ?? null,
      evidenceJson: input.evidenceJson ?? undefined,
      rawResponseJson: input.rawResponseJson ?? undefined,
      inputSnapshotJson: input.inputSnapshotJson ?? undefined,
      enrichedAt: new Date(),
    },
    update: {
      provider: input.provider,
      model: input.model ?? null,
      sourceVersion: PLACE_TRAIT_SOURCE_VERSION,
      confidence: input.traits.confidence,
      quietScore: input.traits.quietScore,
      socialScore: input.traits.socialScore,
      soloScore: input.traits.soloScore,
      cozyScore: input.traits.cozyScore,
      workScore: input.traits.workScore,
      dateScore: input.traits.dateScore,
      utilitarianScore: input.traits.utilitarianScore,
      qualityScore: input.traits.qualityScore,
      quickReadyScore: input.traits.quickReadyScore,
      stayReadyScore: input.traits.stayReadyScore,
      budgetFriendlyScore: input.traits.budgetFriendlyScore,
      archetype: input.traits.archetype ?? null,
      evidenceJson: input.evidenceJson ?? undefined,
      rawResponseJson: input.rawResponseJson ?? undefined,
      inputSnapshotJson: input.inputSnapshotJson ?? undefined,
      enrichedAt: new Date(),
    },
  });
}

async function callOpenAiPlaceTraits(input: ReturnType<typeof buildTraitPromptInput>) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const requestBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You classify coffee-focused places into stable recommendation traits. Use only the provided place facts, summaries, and review snippets. Do not hallucinate. Return JSON only.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              task: 'Infer stable place-level traits for a recommendation engine. These are place traits, not personalized user scores.',
              scoringScale: '0.00-1.00',
              place: input,
              responseStyle: 'Be concise. Keep each evidence string under 14 words.',
              outputRequirements: {
                quietScore: 'Calm, low-noise, or focus-friendly feel.',
                socialScore: 'Supports chatting, groups, or social energy.',
                soloScore: 'Comfortable and natural to visit alone.',
                cozyScore: 'Warm, tucked-in, intimate, or relaxed feel.',
                workScore: 'Supports working or sitting with focus for a while.',
                dateScore: 'Suitable for a casual coffee date.',
                utilitarianScore: 'Transactional, grab-and-go, or practical feel.',
                qualityScore: 'Overall quality confidence from reviews and metadata.',
                confidence: 'Confidence in the inferred traits.',
                archetype: 'Short archetype label such as specialty_coffee, work_friendly_cafe, bakery_cafe, bookstore_cafe, social_cafe, quick_stop_coffee.',
                evidence: 'One short sentence per trait using only the provided evidence.',
              },
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'place_trait_profile',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            quietScore: { type: 'number' },
            socialScore: { type: 'number' },
            soloScore: { type: 'number' },
            cozyScore: { type: 'number' },
            workScore: { type: 'number' },
            dateScore: { type: 'number' },
            utilitarianScore: { type: 'number' },
            qualityScore: { type: 'number' },
            confidence: { type: 'number' },
            archetype: { type: 'string' },
            evidence: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quiet: { type: 'string' },
                social: { type: 'string' },
                solo: { type: 'string' },
                cozy: { type: 'string' },
                work: { type: 'string' },
                date: { type: 'string' },
                utilitarian: { type: 'string' },
                quality: { type: 'string' },
              },
              required: ['quiet', 'social', 'solo', 'cozy', 'work', 'date', 'utilitarian', 'quality'],
            },
          },
          required: ['quietScore', 'socialScore', 'soloScore', 'cozyScore', 'workScore', 'dateScore', 'utilitarianScore', 'qualityScore', 'confidence', 'archetype', 'evidence'],
        },
      },
    },
    reasoning: { effort: 'low' as const },
    max_output_tokens: 1200,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const raw = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI trait enrichment failed with ${response.status}: ${JSON.stringify(raw)}`);
  }

  const parsedText = extractStructuredJsonText(raw);
  const parsed = raw.output_parsed
    ?? (parsedText ? JSON.parse(parsedText) : null);

  if (!parsed) {
    throw new Error(`OpenAI trait enrichment returned no structured output: ${JSON.stringify(raw)}`);
  }
  return { raw, parsed };
}

export async function enrichAndStorePlaceTraits(placeId: string, provider: 'openai' = 'openai') {
  const place = await fetchPlaceForTraitEnrichment(placeId);
  if (!place) {
    throw new Error('Place not found');
  }

  const promptInput = buildTraitPromptInput(place);

  if (provider !== 'openai') {
    throw new Error(`Unsupported trait enrichment provider: ${provider}`);
  }

  const { raw, parsed } = await callOpenAiPlaceTraits(promptInput);
  const traits: PlaceTraitScores = {
    quietScore: clamp01(parsed.quietScore),
    socialScore: clamp01(parsed.socialScore),
    soloScore: clamp01(parsed.soloScore),
    cozyScore: clamp01(parsed.cozyScore),
    workScore: clamp01(parsed.workScore),
    dateScore: clamp01(parsed.dateScore),
    utilitarianScore: clamp01(parsed.utilitarianScore),
    qualityScore: clamp01(parsed.qualityScore),
    quickReadyScore: deriveQuickReadyScore(promptInput, parsed),
    stayReadyScore: deriveStayReadyScore(promptInput, parsed),
    budgetFriendlyScore: clamp01((promptInput.priceLevel ?? 2) <= 1 ? 1 : (promptInput.priceLevel ?? 2) === 2 ? 0.75 : (promptInput.priceLevel ?? 2) === 3 ? 0.35 : 0.1),
    confidence: clamp01(parsed.confidence),
    archetype: typeof parsed.archetype === 'string' ? parsed.archetype : null,
    evidence: parsed.evidence,
  };

  const stored = await upsertPlaceTraitProfile({
    placeId,
    provider: 'openai',
    model: OPENAI_MODEL,
    traits,
    evidenceJson: {
      signals: Object.values(parsed.evidence ?? {}).filter((value): value is string => typeof value === 'string'),
      byTrait: parsed.evidence ?? {},
    },
    rawResponseJson: raw,
    inputSnapshotJson: promptInput,
  });

  return {
    placeId,
    provider: 'openai',
    model: OPENAI_MODEL,
    traits,
    usage: extractOpenAiUsage(raw),
    stored,
  };
}

export async function findPlaceIdsForTraitEnrichment(input: {
  city?: string | null;
  limit?: number;
  placeIds?: string[];
  force?: boolean;
}) {
  const explicitIds = (input.placeIds ?? []).map((value) => value.trim()).filter(Boolean);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const places = await prisma.place.findMany({
    where: {
      AND: [
        { googlePlaceId: { not: null } },
        { servesCoffee: true },
        ...(input.city
          ? [
              {
                city: {
                  equals: input.city,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : []),
        ...(input.force
          ? []
          : [
              {
                OR: [
                  { traitProfile: null },
                  {
                    traitProfile: {
                      is: {
                        sourceVersion: { not: PLACE_TRAIT_SOURCE_VERSION },
                      },
                    },
                  },
                ],
              },
            ]),
      ],
    },
    select: {
      id: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { firstSeenAt: 'desc' },
    ],
    take: input.limit ?? 25,
  });

  return places.map((place) => place.id);
}

export async function enrichAndStorePlaceTraitsBatch(input: PlaceTraitEnrichmentBatchInput = {}) {
  const provider = input.provider ?? 'openai';
  const placeIds = await findPlaceIdsForTraitEnrichment({
    city: input.city ?? null,
    limit: input.limit ?? 25,
    placeIds: input.placeIds ?? [],
    force: input.force ?? false,
  });

  const usageTotals: OpenAiUsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  };
  const results: Array<{ placeId: string; ok: true; usage: OpenAiUsageSummary }> = [];
  const failures: Array<{ placeId: string; ok: false; error: string }> = [];

  for (const placeId of placeIds) {
    try {
      const enriched = await enrichAndStorePlaceTraits(placeId, provider);
      usageTotals.inputTokens += enriched.usage.inputTokens;
      usageTotals.outputTokens += enriched.usage.outputTokens;
      usageTotals.totalTokens += enriched.usage.totalTokens;
      usageTotals.reasoningTokens += enriched.usage.reasoningTokens;
      results.push({ placeId, ok: true, usage: enriched.usage });
    } catch (error) {
      failures.push({
        placeId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    provider,
    model: OPENAI_MODEL,
    sourceVersion: PLACE_TRAIT_SOURCE_VERSION,
    requestedCount: placeIds.length,
    enrichedCount: results.length,
    failedCount: failures.length,
    usageTotals,
    placeIds,
    results,
    failures,
  };
}

export async function getPlaceTraitCoverageStatus(input: {
  city?: string | null;
  limit?: number;
}) : Promise<PlaceTraitCoverageStatus> {
  const city = input.city?.trim() || null;
  const rows = await prisma.place.findMany({
    where: {
      servesCoffee: true,
      ...(city
        ? {
            city: {
              equals: city,
              mode: 'insensitive',
            },
          }
        : {}),
    },
    select: {
      id: true,
      traitProfile: {
        select: {
          sourceVersion: true,
        },
      },
    },
    orderBy: [
      { updatedAt: 'desc' },
      { firstSeenAt: 'desc' },
    ],
  });

  const remaining = rows.filter((row) => !row.traitProfile || row.traitProfile.sourceVersion !== PLACE_TRAIT_SOURCE_VERSION);
  const enriched = rows.length - remaining.length;

  return {
    city,
    sourceVersion: PLACE_TRAIT_SOURCE_VERSION,
    totalCoffeePlaces: rows.length,
    enrichedPlaces: enriched,
    remainingEligible: remaining.length,
    coverageRatio: rows.length > 0 ? Number((enriched / rows.length).toFixed(4)) : 0,
    sampleRemainingPlaceIds: remaining.slice(0, input.limit ?? 10).map((row) => row.id),
  };
}
