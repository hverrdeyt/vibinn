import '../server/env';
import { Prisma } from '@prisma/client';
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

type GoogleLocalizedText = {
  text?: string;
  languageCode?: string;
};

type GooglePlaceDetailsResponse = {
  id: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: unknown[];
  primaryType?: string;
  primaryTypeDisplayName?: GoogleLocalizedText;
  googleMapsTypeLabel?: GoogleLocalizedText;
  types?: string[];
  businessStatus?: string;
  openingDate?: unknown;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  googleMapsLinks?: unknown;
  websiteUri?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
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
  servesCocktails?: boolean;
  servesVegetarianFood?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  curbsidePickup?: boolean;
  reservable?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  goodForChildren?: boolean;
  allowsDogs?: boolean;
  restroom?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  outdoorSeating?: boolean;
  paymentOptions?: unknown;
  parkingOptions?: unknown;
  accessibilityOptions?: unknown;
  editorialSummary?: unknown;
  reviewSummary?: unknown;
  generativeSummary?: unknown;
  containingPlaces?: unknown;
  reviews?: unknown[];
  photos?: unknown[];
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

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapGooglePlaceDetailColumns(details: GooglePlaceDetailsResponse) {
  const priceRange = normalizeGooglePriceRange(details.priceRange);

  return {
    googleDisplayName: details.displayName?.text ?? null,
    address: details.formattedAddress ?? undefined,
    shortFormattedAddress: details.shortFormattedAddress ?? null,
    googleTypes: details.types ?? [],
    googlePrimaryType: details.primaryType ?? null,
    googlePrimaryTypeDisplayName: details.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: details.googleMapsTypeLabel?.text ?? null,
    businessStatus: details.businessStatus ?? null,
    openingDateJson: jsonOrDbNull(details.openingDate),
    rating: details.rating ?? null,
    userRatingCount: typeof details.userRatingCount === 'number' ? details.userRatingCount : null,
    openingHours: details.regularOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [],
    currentOpeningHours: details.currentOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [],
    servesBreakfast: details.servesBreakfast ?? null,
    servesLunch: details.servesLunch ?? null,
    servesDinner: details.servesDinner ?? null,
    servesBeer: details.servesBeer ?? null,
    servesWine: details.servesWine ?? null,
    servesBrunch: details.servesBrunch ?? null,
    servesDessert: details.servesDessert ?? null,
    servesCoffee: details.servesCoffee ?? null,
    servesCocktails: details.servesCocktails ?? null,
    servesVegetarianFood: details.servesVegetarianFood ?? null,
    takeout: details.takeout ?? null,
    delivery: details.delivery ?? null,
    dineIn: details.dineIn ?? null,
    curbsidePickup: details.curbsidePickup ?? null,
    reservable: details.reservable ?? null,
    liveMusic: details.liveMusic ?? null,
    menuForChildren: details.menuForChildren ?? null,
    goodForChildren: details.goodForChildren ?? null,
    allowsDogs: details.allowsDogs ?? null,
    restroom: details.restroom ?? null,
    goodForGroups: details.goodForGroups ?? null,
    goodForWatchingSports: details.goodForWatchingSports ?? null,
    timeZoneId: details.timeZone?.id ?? null,
    utcOffsetMinutes: typeof details.utcOffsetMinutes === 'number' ? details.utcOffsetMinutes : null,
    outdoorSeating: details.outdoorSeating ?? null,
    websiteUri: details.websiteUri ?? null,
    mapsEmbedUrl: details.googleMapsUri ?? undefined,
    addressComponentsJson: jsonOrDbNull(details.addressComponents),
    photosJson: jsonOrDbNull(details.photos),
    reviewsJson: jsonOrDbNull(details.reviews),
    paymentOptionsJson: jsonOrDbNull(details.paymentOptions),
    parkingOptionsJson: jsonOrDbNull(details.parkingOptions),
    accessibilityOptionsJson: jsonOrDbNull(details.accessibilityOptions),
    editorialSummaryJson: jsonOrDbNull(details.editorialSummary),
    reviewSummaryJson: jsonOrDbNull(details.reviewSummary),
    generativeSummaryJson: jsonOrDbNull(details.generativeSummary),
    googleMapsLinksJson: jsonOrDbNull(details.googleMapsLinks),
    containingPlacesJson: jsonOrDbNull(details.containingPlaces),
    googlePriceRangeStart: priceRange?.startAmount ?? null,
    googlePriceRangeEnd: priceRange?.endAmount ?? null,
    googlePriceRangeCurrency: priceRange?.currencyCode ?? null,
    lastGoogleFetchedAt: new Date(),
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
        'displayName',
        'formattedAddress',
        'shortFormattedAddress',
        'primaryType',
        'primaryTypeDisplayName',
        'googleMapsTypeLabel',
        'types',
        'businessStatus',
        'openingDate',
        'rating',
        'userRatingCount',
        'priceLevel',
        'googleMapsUri',
        'googleMapsLinks',
        'websiteUri',
        'regularOpeningHours.weekdayDescriptions',
        'currentOpeningHours.weekdayDescriptions',
        'servesBreakfast',
        'servesLunch',
        'servesDinner',
        'servesBeer',
        'servesWine',
        'servesBrunch',
        'servesDessert',
        'servesCoffee',
        'servesCocktails',
        'servesVegetarianFood',
        'takeout',
        'delivery',
        'dineIn',
        'curbsidePickup',
        'reservable',
        'liveMusic',
        'menuForChildren',
        'goodForChildren',
        'allowsDogs',
        'restroom',
        'goodForGroups',
        'goodForWatchingSports',
        'timeZone',
        'utcOffsetMinutes',
        'outdoorSeating',
        'paymentOptions',
        'parkingOptions',
        'accessibilityOptions',
        'editorialSummary',
        'reviewSummary',
        'generativeSummary',
        'containingPlaces',
        'reviews',
        'photos',
        'addressComponents',
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
              { userRatingCount: null },
              { generativeSummaryJson: null },
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
