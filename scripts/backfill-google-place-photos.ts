import dotenv from 'dotenv';
import { prisma } from '../server/prisma';

dotenv.config();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;
const shouldRunAll = process.argv.includes('--all');
const shouldRefresh = process.argv.includes('--refresh');
const photoLimitArg = process.argv.find((arg) => arg.startsWith('--photo-limit='));
const photoLimit = photoLimitArg ? Number(photoLimitArg.split('=')[1]) : 4;
const minimumExistingPhotosArg = process.argv.find((arg) => arg.startsWith('--skip-at-or-above='));
const skipAtOrAbove = minimumExistingPhotosArg ? Number(minimumExistingPhotosArg.split('=')[1]) : 2;

type GooglePlaceDetailsResponse = {
  id: string;
  photos?: Array<{
    name: string;
  }>;
};

function buildCandidateQuery() {
  return {
    where: {
      googlePlaceId: { not: null },
    },
    include: {
      media: {
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { updatedAt: 'desc' as const },
    take: shouldRunAll ? undefined : limit,
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
      'X-Goog-FieldMask': 'id,photos',
    },
  });

  if (!response.ok) {
    throw new Error(`Google Place Details failed with ${response.status}`);
  }

  return response.json() as Promise<GooglePlaceDetailsResponse>;
}

async function fetchGooglePhotoUri(photoName: string) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY is required');
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_MAPS_API_KEY}&maxWidthPx=1200&skipHttpRedirect=true`,
  );

  if (!response.ok) {
    throw new Error(`Google Place Photo failed with ${response.status}`);
  }

  const data = await response.json() as { photoUri?: string };
  return data.photoUri ?? null;
}

async function fetchGooglePhotoUris(photoNames: string[], limitPerPlace = 4) {
  const uniquePhotoNames = Array.from(new Set(photoNames.filter(Boolean))).slice(0, limitPerPlace);
  if (uniquePhotoNames.length === 0) return [];

  const results = await Promise.allSettled(
    uniquePhotoNames.map((photoName) => fetchGooglePhotoUri(photoName)),
  );

  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

async function main() {
  const places = await prisma.place.findMany(buildCandidateQuery());

  console.log(`Found ${places.length} candidate places to backfill Google photos.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const place of places) {
    const existingPhotoCount = place.media.filter((item) => item.mediaType === 'image').length;
    if (!shouldRefresh && existingPhotoCount >= skipAtOrAbove) {
      skippedCount += 1;
      continue;
    }

    if (!place.googlePlaceId) {
      skippedCount += 1;
      continue;
    }

    try {
      const details = await fetchGooglePlaceDetails(place.googlePlaceId);
      const photoUris = details.photos?.length
        ? await fetchGooglePhotoUris(details.photos.map((photo) => photo.name), photoLimit)
        : [];

      if (photoUris.length === 0) {
        skippedCount += 1;
        console.log(`Skipped: ${place.name} (no Google photos)`);
        continue;
      }

      await prisma.place.update({
        where: { id: place.id },
        data: {
          primaryImageUrl: photoUris[0],
          media: {
            deleteMany: {},
            create: photoUris.map((uri, index) => ({
              mediaType: 'image',
              url: uri,
              sortOrder: index,
              source: 'google-places',
            })),
          },
        },
      });

      updatedCount += 1;
      console.log(`Updated: ${place.name} (${photoUris.length} images)`);
    } catch (error) {
      failedCount += 1;
      console.error(`Failed: ${place.name}`);
      console.error(error);
    }
  }

  console.log(`Done. Updated ${updatedCount}, skipped ${skippedCount}, failed ${failedCount}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
