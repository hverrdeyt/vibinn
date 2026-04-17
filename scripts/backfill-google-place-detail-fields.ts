import dotenv from 'dotenv';
import { prisma } from '../server/prisma';

dotenv.config();

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
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  timeZone?: {
    id?: string;
    version?: string;
  };
  utcOffsetMinutes?: number;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBrunch?: boolean;
  servesDessert?: boolean;
  servesCoffee?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  outdoorSeating?: boolean;
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

function mapGooglePlaceDetailColumns(details: GooglePlaceDetailsResponse) {
  const priceRange = normalizeGooglePriceRange(details.priceRange);

  return {
    openingHours: details.regularOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [],
    servesBreakfast: details.servesBreakfast ?? null,
    servesLunch: details.servesLunch ?? null,
    servesDinner: details.servesDinner ?? null,
    servesBeer: details.servesBeer ?? null,
    servesWine: details.servesWine ?? null,
    servesBrunch: details.servesBrunch ?? null,
    servesDessert: details.servesDessert ?? null,
    servesCoffee: details.servesCoffee ?? null,
    goodForGroups: details.goodForGroups ?? null,
    goodForWatchingSports: details.goodForWatchingSports ?? null,
    timeZoneId: details.timeZone?.id ?? null,
    utcOffsetMinutes: typeof details.utcOffsetMinutes === 'number' ? details.utcOffsetMinutes : null,
    outdoorSeating: details.outdoorSeating ?? null,
    googlePriceRangeStart: priceRange?.startAmount ?? null,
    googlePriceRangeEnd: priceRange?.endAmount ?? null,
    googlePriceRangeCurrency: priceRange?.currencyCode ?? null,
  };
}

async function fetchGooglePlaceDetails(googlePlaceId: string) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY is required');
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'id',
        'regularOpeningHours.weekdayDescriptions',
        'servesBreakfast',
        'servesLunch',
        'servesDinner',
        'servesBeer',
        'servesWine',
        'servesBrunch',
        'servesDessert',
        'servesCoffee',
        'goodForGroups',
        'goodForWatchingSports',
        'timeZone',
        'utcOffsetMinutes',
        'outdoorSeating',
        'priceRange',
      ].join(','),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Place Details failed with ${response.status}${body ? `: ${body}` : ''}`);
  }

  return response.json() as Promise<GooglePlaceDetailsResponse>;
}

async function main() {
  const places = await prisma.place.findMany({
    where: {
      googlePlaceId: { not: null },
      ...(shouldOnlyMissing
        ? {
            AND: [
              { openingHours: { isEmpty: true } },
              { servesBreakfast: null },
              { servesLunch: null },
              { servesDinner: null },
              { servesBeer: null },
              { servesWine: null },
              { servesBrunch: null },
              { servesDessert: null },
              { servesCoffee: null },
              { goodForGroups: null },
              { goodForWatchingSports: null },
              { timeZoneId: null },
              { utcOffsetMinutes: null },
              { outdoorSeating: null },
            ],
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

  console.log(`Found ${places.length} places to backfill Google place detail fields.`);

  let updatedCount = 0;
  let failedCount = 0;

  for (const place of places) {
    if (!place.googlePlaceId) continue;

    try {
      const details = await fetchGooglePlaceDetails(place.googlePlaceId);
      const mapped = mapGooglePlaceDetailColumns(details);

      await prisma.place.update({
        where: { id: place.id },
        data: mapped,
      });

      await prisma.placeGoogleSnapshot.create({
        data: {
          placeId: place.id,
          googlePlaceId: place.googlePlaceId,
          source: 'PLACE_DETAILS',
          queryContext: 'detail-fields-backfill',
          payloadJson: JSON.parse(JSON.stringify(details)),
        },
      });

      updatedCount += 1;
      console.log(`Updated: ${place.name}`);
    } catch (error) {
      failedCount += 1;
      console.error(`Failed: ${place.name}`, error);
    }
  }

  console.log(`Done. Updated=${updatedCount} failed=${failedCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

