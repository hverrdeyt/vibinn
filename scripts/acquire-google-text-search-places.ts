import '../server/env';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/prisma';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

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

type GoogleTextSearchPlace = {
  id: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
    languageCode?: string;
  }>;
  location?: { latitude?: number; longitude?: number };
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
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  currentOpeningHours?: { weekdayDescriptions?: string[] };
  timeZone?: { id?: string; version?: string };
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
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  priceRange?: GooglePriceRange;
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number; authorAttributions?: unknown }>;
};

type QueryDescriptor = {
  queryText: string;
  preferenceCategory: string;
};

const locationArg = process.argv.find((arg) => arg.startsWith('--location='));
const locationLabel = locationArg ? locationArg.split('=').slice(1).join('=').trim() : 'Boston';
const typeArg = process.argv.find((arg) => arg.startsWith('--type='));
const locationType = typeArg ? typeArg.split('=')[1]?.trim() || 'city' : 'city';
const pageSizeArg = process.argv.find((arg) => arg.startsWith('--page-size='));
const pageSize = Math.max(1, Math.min(Number(pageSizeArg?.split('=')[1] ?? 20), 20));
const dryRun = process.argv.includes('--dry-run');

const allowedLocations = new Set(['Boston']);

const queryTemplates: Array<{
  preferenceCategory: string;
  queries: string[];
}> = [
  {
    preferenceCategory: 'good_coffee',
    queries: ['best coffee in {location}', 'specialty coffee in {location}', 'good espresso bar in {location}'],
  },
  {
    preferenceCategory: 'aesthetic_cafes',
    queries: ['aesthetic cafe in {location}', 'cute cafe in {location}', 'instagrammable cafe in {location}'],
  },
  {
    preferenceCategory: 'desserts_sweet_treats',
    queries: ['best desserts in {location}', 'sweet treats in {location}', 'dessert cafe in {location}'],
  },
  {
    preferenceCategory: 'street_food_casual_eats',
    queries: ['best casual eats in {location}', 'street food in {location}', 'cheap eats in {location}'],
  },
  {
    preferenceCategory: 'asian_comfort_food',
    queries: ['best ramen in {location}', 'best sushi in {location}', 'asian comfort food in {location}'],
  },
  {
    preferenceCategory: 'drinks_nightlife',
    queries: ['best bars in {location}', 'nightlife in {location}', 'cocktail bar in {location}'],
  },
  {
    preferenceCategory: 'shop_stroll',
    queries: ['best local boutiques in {location}', 'shopping streets in {location}', 'best area to walk and shop in {location}'],
  },
  {
    preferenceCategory: 'fun_activities',
    queries: ['fun things to do in {location}', 'cool activities in {location}', 'unique places to visit in {location}'],
  },
  {
    preferenceCategory: 'parks_outdoor',
    queries: ['best parks in {location}', 'best outdoor spots in {location}', 'scenic walk in {location}'],
  },
];

function buildQueries(location: string): QueryDescriptor[] {
  return queryTemplates.flatMap((group) =>
    group.queries.map((query) => ({
      preferenceCategory: group.preferenceCategory,
      queryText: query.replace('{location}', location),
    })),
  );
}

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

function mapGooglePriceLevel(priceLevel?: GoogleTextSearchPlace['priceLevel']) {
  switch (priceLevel) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
}

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function extractAddressComponent(components: GoogleTextSearchPlace['addressComponents'], type: string) {
  return components?.find((component) => component.types?.includes(type))?.longText ?? null;
}

function parseLocationBits(place: GoogleTextSearchPlace) {
  const city =
    extractAddressComponent(place.addressComponents, 'locality') ??
    extractAddressComponent(place.addressComponents, 'administrative_area_level_2') ??
    null;
  const country = extractAddressComponent(place.addressComponents, 'country');
  const neighborhood = extractAddressComponent(place.addressComponents, 'neighborhood') ?? extractAddressComponent(place.addressComponents, 'sublocality');
  const adminAreaLevel4 = extractAddressComponent(place.addressComponents, 'administrative_area_level_4');
  return { city, country, neighborhood, adminAreaLevel4 };
}

function mapGooglePlaceColumns(place: GoogleTextSearchPlace) {
  const priceRange = normalizeGooglePriceRange(place.priceRange);
  return {
    googleDisplayName: place.displayName?.text ?? null,
    shortFormattedAddress: place.shortFormattedAddress ?? null,
    googleTypes: place.types ?? [],
    googlePrimaryType: place.primaryType ?? null,
    googlePrimaryTypeDisplayName: place.primaryTypeDisplayName?.text ?? null,
    googleMapsTypeLabel: place.googleMapsTypeLabel?.text ?? null,
    businessStatus: place.businessStatus ?? null,
    openingDateJson: jsonOrDbNull(place.openingDate),
    rating: place.rating ?? null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    priceLevel: mapGooglePriceLevel(place.priceLevel),
    googlePriceRangeStart: priceRange?.startAmount ?? null,
    googlePriceRangeEnd: priceRange?.endAmount ?? null,
    googlePriceRangeCurrency: priceRange?.currencyCode ?? null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [],
    currentOpeningHours: place.currentOpeningHours?.weekdayDescriptions?.filter(Boolean) ?? [],
    servesBreakfast: place.servesBreakfast ?? null,
    servesLunch: place.servesLunch ?? null,
    servesDinner: place.servesDinner ?? null,
    servesBeer: place.servesBeer ?? null,
    servesWine: place.servesWine ?? null,
    servesBrunch: place.servesBrunch ?? null,
    servesDessert: place.servesDessert ?? null,
    servesCoffee: place.servesCoffee ?? null,
    servesCocktails: place.servesCocktails ?? null,
    servesVegetarianFood: place.servesVegetarianFood ?? null,
    takeout: place.takeout ?? null,
    delivery: place.delivery ?? null,
    dineIn: place.dineIn ?? null,
    curbsidePickup: place.curbsidePickup ?? null,
    reservable: place.reservable ?? null,
    liveMusic: place.liveMusic ?? null,
    menuForChildren: place.menuForChildren ?? null,
    goodForChildren: place.goodForChildren ?? null,
    allowsDogs: place.allowsDogs ?? null,
    restroom: place.restroom ?? null,
    goodForGroups: place.goodForGroups ?? null,
    goodForWatchingSports: place.goodForWatchingSports ?? null,
    timeZoneId: place.timeZone?.id ?? null,
    utcOffsetMinutes: typeof place.utcOffsetMinutes === 'number' ? place.utcOffsetMinutes : null,
    outdoorSeating: place.outdoorSeating ?? null,
    websiteUri: place.websiteUri ?? null,
    mapsEmbedUrl: place.googleMapsUri ?? null,
    addressComponentsJson: jsonOrDbNull(place.addressComponents),
    photosJson: jsonOrDbNull(place.photos),
    reviewsJson: jsonOrDbNull(place.reviews),
    paymentOptionsJson: jsonOrDbNull(place.paymentOptions),
    parkingOptionsJson: jsonOrDbNull(place.parkingOptions),
    accessibilityOptionsJson: jsonOrDbNull(place.accessibilityOptions),
    editorialSummaryJson: jsonOrDbNull(place.editorialSummary),
    reviewSummaryJson: jsonOrDbNull(place.reviewSummary),
    generativeSummaryJson: jsonOrDbNull(place.generativeSummary),
    googleMapsLinksJson: jsonOrDbNull(place.googleMapsLinks),
    containingPlacesJson: jsonOrDbNull(place.containingPlaces),
    lastGoogleFetchedAt: new Date(),
  };
}

function placeFieldMask() {
  return [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.location',
    'places.primaryType',
    'places.primaryTypeDisplayName',
    'places.googleMapsTypeLabel',
    'places.types',
    'places.businessStatus',
    'places.openingDate',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.priceRange',
    'places.googleMapsUri',
    'places.googleMapsLinks',
    'places.websiteUri',
    'places.regularOpeningHours.weekdayDescriptions',
    'places.currentOpeningHours.weekdayDescriptions',
    'places.photos',
    'places.addressComponents',
    'places.servesBreakfast',
    'places.servesLunch',
    'places.servesDinner',
    'places.servesBeer',
    'places.servesWine',
    'places.servesBrunch',
    'places.servesDessert',
    'places.servesCoffee',
    'places.servesCocktails',
    'places.servesVegetarianFood',
    'places.takeout',
    'places.delivery',
    'places.dineIn',
    'places.curbsidePickup',
    'places.reservable',
    'places.liveMusic',
    'places.menuForChildren',
    'places.goodForChildren',
    'places.allowsDogs',
    'places.restroom',
    'places.goodForGroups',
    'places.goodForWatchingSports',
    'places.timeZone',
    'places.utcOffsetMinutes',
    'places.outdoorSeating',
    'places.paymentOptions',
    'places.parkingOptions',
    'places.accessibilityOptions',
    'places.editorialSummary',
    'places.reviewSummary',
    'places.generativeSummary',
    'places.containingPlaces',
    'places.reviews',
  ].join(',');
}

async function fetchGoogleTextSearch(queryText: string) {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY is required');

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': placeFieldMask(),
    },
    body: JSON.stringify({ textQuery: queryText, pageSize }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Text Search failed with ${response.status}${body ? `: ${body}` : ''}`);
  }

  return response.json() as Promise<{ places?: GoogleTextSearchPlace[] }>;
}

async function fetchGooglePhotoUri(photoName: string) {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY is required');

  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_MAPS_API_KEY}&maxWidthPx=1200&skipHttpRedirect=true`,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Place Photo failed with ${response.status}${body ? `: ${body}` : ''}`);
  }

  const data = await response.json() as { photoUri?: string };
  return data.photoUri ?? null;
}

async function fetchGooglePhotoUris(photoNames: string[], limit = 3) {
  const uniquePhotoNames = Array.from(new Set(photoNames.filter(Boolean))).slice(0, limit);
  if (uniquePhotoNames.length === 0) return [];

  const results = await Promise.allSettled(uniquePhotoNames.map((photoName) => fetchGooglePhotoUri(photoName)));
  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

async function upsertPlaceFromTextSearch(place: GoogleTextSearchPlace, query: QueryDescriptor, resultRank: number) {
  const locationBits = parseLocationBits(place);
  const category = (place.primaryType ?? place.types?.[0] ?? 'recommended spot').replace(/_/g, ' ');
  const name = place.displayName?.text ?? 'Unnamed place';
  const existingPlace = await prisma.place.findUnique({
    where: { googlePlaceId: place.id },
    select: { id: true },
  });
  const isNewPlace = !existingPlace;
  const photoUris = isNewPlace && place.photos?.length
    ? await fetchGooglePhotoUris(place.photos.map((photo) => photo.name), 3).catch((error) => {
        console.warn(`Photo fetch skipped for ${name}`, error);
        return [];
      })
    : [];
  const data = {
    name,
    address: place.formattedAddress ?? null,
    city: locationBits.city,
    country: locationBits.country,
    neighborhood: locationBits.neighborhood,
    adminAreaLevel4: locationBits.adminAreaLevel4,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    category,
    ...mapGooglePlaceColumns(place),
  };

  const savedPlace = await prisma.place.upsert({
    where: { googlePlaceId: place.id },
    update: data,
    create: {
      googlePlaceId: place.id,
      ...data,
      primaryImageUrl: photoUris[0] ?? null,
      media: photoUris.length > 0
        ? {
            create: photoUris.map((url, index) => ({
              mediaType: 'image',
              url,
              sortOrder: index,
              source: 'google-places',
            })),
          }
        : undefined,
    },
  });

  await prisma.placeGoogleSnapshot.create({
    data: {
      placeId: savedPlace.id,
      googlePlaceId: place.id,
      source: 'TEXT_SEARCH',
      queryContext: query.queryText,
      payloadJson: JSON.parse(JSON.stringify(place)) as Prisma.InputJsonValue,
    },
  });

  await prisma.placeDiscoverySignal.upsert({
    where: {
      googlePlaceId_queryText_locationLabel_locationType: {
        googlePlaceId: place.id,
        queryText: query.queryText,
        locationLabel,
        locationType,
      },
    },
    update: {
      placeId: savedPlace.id,
      preferenceCategory: query.preferenceCategory,
      queryType: 'interest',
      resultRank,
      seenCount: { increment: 1 },
      lastSeenAt: new Date(),
    },
    create: {
      placeId: savedPlace.id,
      googlePlaceId: place.id,
      queryText: query.queryText,
      queryType: 'interest',
      preferenceCategory: query.preferenceCategory,
      resultRank,
      bestResultRank: resultRank,
      locationLabel,
      locationType,
    },
  });

  return savedPlace;
}

async function main() {
  if (!allowedLocations.has(locationLabel)) {
    throw new Error(`This manual acquisition script is currently limited to Boston. Received: ${locationLabel}`);
  }

  const queries = buildQueries(locationLabel);
  console.log(`Manual Google Text Search acquisition for ${locationLabel} (${locationType})`);
  console.log(`Queries=${queries.length} pageSize=${pageSize} dryRun=${dryRun ? 'yes' : 'no'}`);

  if (dryRun) {
    queries.forEach((query, index) => {
      console.log(`${index + 1}. [${query.preferenceCategory}] ${query.queryText}`);
    });
    return;
  }

  const seenGooglePlaceIds = new Set<string>();
  let rawResults = 0;
  let upserted = 0;

  for (const query of queries) {
    console.log(`Query: [${query.preferenceCategory}] ${query.queryText}`);
    const result = await fetchGoogleTextSearch(query.queryText);
    const places = result.places ?? [];
    rawResults += places.length;

    for (const [index, place] of places.entries()) {
      await upsertPlaceFromTextSearch(place, query, index + 1);
      seenGooglePlaceIds.add(place.id);
      upserted += 1;
    }
  }

  await prisma.location.updateMany({
    where: {
      name: locationLabel,
      type: locationType.toUpperCase() === 'COUNTRY'
        ? 'COUNTRY'
        : locationType.toUpperCase() === 'PROVINCE'
          ? 'PROVINCE'
          : 'CITY',
    },
    data: {
      discoveryLastGoogleSyncAt: new Date(),
      discoveryCandidateCount: await prisma.place.count({
        where: {
          OR: [
            { city: { contains: locationLabel, mode: 'insensitive' } },
            { address: { contains: locationLabel, mode: 'insensitive' } },
          ],
        },
      }),
      discoverySeedVersion: 'manual-text-search-9-category-v1',
    },
  });

  console.log(`Done. queries=${queries.length} rawResults=${rawResults} uniquePlaces=${seenGooglePlaceIds.size} upserts=${upserted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
