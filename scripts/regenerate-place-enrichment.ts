import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../server/prisma';
import { generatePlaceAiEnrichment } from '../server/placeEnrichment';

dotenv.config();

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const shouldRunAll = process.argv.includes('--all');
const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch='));
const batchSize = batchSizeArg ? Number(batchSizeArg.split('=')[1]) : 1;
const failureLogPath = path.resolve(process.cwd(), 'tmp/place-enrichment-failures.json');

async function main() {
  const stalePlaces = await prisma.place.findMany({
    where: {
      aiEnrichment: {
        is: {
          OR: [
            { hook: { contains: 'keeps showing up for your vibe', mode: 'insensitive' } },
            { attitudeLabel: 'new find' },
          ],
        },
      },
      googlePlaceId: { not: null },
    },
    include: {
      aiEnrichment: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: shouldRunAll ? undefined : (limit ?? 25),
  });

  console.log(`Found ${stalePlaces.length} stale place enrichments to regenerate.`);

  let regenerated = 0;
  let failed = 0;
  const failures: Array<{ id: string; name: string; error: string }> = [];

  for (let index = 0; index < stalePlaces.length; index += batchSize) {
    const batch = stalePlaces.slice(index, index + batchSize);

    await Promise.all(batch.map(async (place) => {
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
        console.log(`Regenerated: ${place.name}`);
      } catch (error) {
        failed += 1;
        failures.push({
          id: place.id,
          name: place.name,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Failed: ${place.name}`);
        console.error(error);
      }
    }));
  }

  await mkdir(path.dirname(failureLogPath), { recursive: true });
  await writeFile(failureLogPath, JSON.stringify(failures, null, 2));

  console.log(`Done. Regenerated ${regenerated}, failed ${failed}.`);
  console.log(`Failure log: ${failureLogPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
