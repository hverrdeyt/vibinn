import '../server/env';
import { prisma } from '../server/prisma';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
const shouldRunAll = process.argv.includes('--all');
const shouldOnlyMissing = process.argv.includes('--missing-only');

type GoogleMoney = {
  currencyCode?: string;
  units?: string | number;
  nanos?: number;
};

type GooglePriceRange = {
  startPrice?: GoogleMoney;
  endPrice?: GoogleMoney;
};

type GooglePlaceDetailsResponse = {
  id: string;
  priceRange?: GooglePriceRange;
};

function googleMoneyToNumber(money?: GoogleMoney | null) {
  if (!money) return null;
  const units = typeof money.units === 'number' ? money.units : Number(money.units ?? 0);
  const nanos = typeof money.nanos === 'number' ? money.nanos : 0;
  const amount = units + nanos / 1_000_000_000;
  return Number.isFinite(amount) ? amount : null;
}

function normalizeGooglePriceRange(priceRange?: GooglePriceRange | null) {
  if (!priceRange) return null;
  const startAmount = googleMoneyToNumber(priceRange.startPrice);
  const endAmount = googleMoneyToNumber(priceRange.endPrice);
  const currencyCode = priceRange.startPrice?.currencyCode ?? priceRange.endPrice?.currencyCode ?? null;
  if (!currencyCode || (startAmount == null && endAmount == null)) return null;
  return { startAmount, endAmount, currencyCode };
}

async function fetchGooglePlaceDetails(googlePlaceId: string) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY is required');
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'id,priceRange',
    },
  });

  if (!response.ok) {
    throw new Error(`Google Place Details failed with ${response.status}`);
  }

  return response.json() as Promise<GooglePlaceDetailsResponse>;
}

async function main() {
  const places = await prisma.place.findMany({
    where: {
      googlePlaceId: { not: null },
      ...(shouldOnlyMissing
        ? {
            googlePriceRangeCurrency: null,
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: shouldRunAll ? undefined : limit,
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
    },
  });

  console.log(`Found ${places.length} places to backfill Google price ranges.`);

  let updatedCount = 0;
  let emptyCount = 0;
  let failedCount = 0;

  for (const place of places) {
    if (!place.googlePlaceId) continue;

    try {
      const details = await fetchGooglePlaceDetails(place.googlePlaceId);
      const priceRange = normalizeGooglePriceRange(details.priceRange);

      await prisma.place.updateMany({
        where: { id: place.id },
        data: {
          googlePriceRangeStart: priceRange?.startAmount ?? null,
          googlePriceRangeEnd: priceRange?.endAmount ?? null,
          googlePriceRangeCurrency: priceRange?.currencyCode ?? null,
        },
      });

      await prisma.placeGoogleSnapshot
        .create({
          data: {
            placeId: place.id,
            googlePlaceId: place.googlePlaceId,
            source: 'PLACE_DETAILS',
            queryContext: 'price-range-backfill',
            payloadJson: JSON.parse(JSON.stringify(details)),
          },
        })
        .catch((error) => {
          console.warn(`Snapshot skipped: ${place.name}`, error);
        });

      if (priceRange) {
        updatedCount += 1;
        console.log(`Updated: ${place.name} (${priceRange.currencyCode} ${priceRange.startAmount ?? ''}-${priceRange.endAmount ?? ''})`);
      } else {
        emptyCount += 1;
        console.log(`No priceRange: ${place.name}`);
      }
    } catch (error) {
      failedCount += 1;
      console.error(`Failed: ${place.name}`, error);
    }
  }

  console.log(`Done. Updated=${updatedCount} empty=${emptyCount} failed=${failedCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
