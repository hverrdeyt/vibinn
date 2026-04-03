import dotenv from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../server/prisma';
import { generatePlaceAiEnrichment } from '../server/placeEnrichment';

dotenv.config();

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch='));
const batchSize = batchSizeArg ? Number(batchSizeArg.split('=')[1]) : 1;
const failureLogPath = path.resolve(process.cwd(), 'tmp/place-enrichment-failures.json');
const retryFailureLogPath = path.resolve(process.cwd(), 'tmp/place-enrichment-failures.retry.json');

type FailureEntry = {
  id: string;
  name: string;
  error: string;
};

async function main() {
  let failures: FailureEntry[] = [];
  try {
    const raw = await readFile(failureLogPath, 'utf8');
    failures = JSON.parse(raw) as FailureEntry[];
  } catch {
    console.log('No failure log found. Nothing to retry.');
    return;
  }

  const targetFailures = (limit ? failures.slice(0, limit) : failures);
  const places = await prisma.place.findMany({
    where: {
      id: { in: targetFailures.map((item) => item.id) },
    },
    include: {
      aiEnrichment: true,
    },
  });

  const placeMap = new Map(places.map((place) => [place.id, place]));
  const remainingFailures: FailureEntry[] = [];
  let regenerated = 0;
  let failed = 0;

  console.log(`Retrying ${targetFailures.length} failed enrichments.`);

  for (let index = 0; index < targetFailures.length; index += batchSize) {
    const batch = targetFailures.slice(index, index + batchSize);

    await Promise.all(batch.map(async (failure) => {
      const place = placeMap.get(failure.id);
      if (!place) {
        failed += 1;
        remainingFailures.push({ ...failure, error: 'Place not found in database during retry' });
        return;
      }

      try {
        const generated = await generatePlaceAiEnrichment({
          id: place.id,
          name: place.name,
          address: place.address,
          city: place.city,
          country: place.country,
          category: place.category,
          rating: place.rating,
          priceLevel: place.priceLevel,
        });

        if (!generated) {
          failed += 1;
          remainingFailures.push({ ...failure, error: 'No enrichment returned during retry' });
          return;
        }

        await prisma.placeAiEnrichment.upsert({
          where: { placeId: place.id },
          update: generated,
          create: {
            placeId: place.id,
            ...generated,
          },
        });

        regenerated += 1;
        console.log(`Retried successfully: ${place.name}`);
      } catch (error) {
        failed += 1;
        remainingFailures.push({
          id: place.id,
          name: place.name,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Retry failed: ${place.name}`);
        console.error(error);
      }
    }));
  }

  await mkdir(path.dirname(retryFailureLogPath), { recursive: true });
  await writeFile(retryFailureLogPath, JSON.stringify(remainingFailures, null, 2));

  console.log(`Retry done. Regenerated ${regenerated}, failed ${failed}.`);
  console.log(`Retry failure log: ${retryFailureLogPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
