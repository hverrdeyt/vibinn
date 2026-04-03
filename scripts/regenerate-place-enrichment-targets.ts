import dotenv from 'dotenv';
import { prisma } from '../server/prisma';
import { generatePlaceAiEnrichment } from '../server/placeEnrichment';

dotenv.config();

const namesArg = process.argv.find((arg) => arg.startsWith('--names='));
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));

function parseListArg(value?: string) {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const names = parseListArg(namesArg?.split('=')[1]);
  const ids = parseListArg(idsArg?.split('=')[1]);

  if (names.length === 0 && ids.length === 0) {
    console.log('Pass --names="Place A,Place B" or --ids="id1,id2"');
    return;
  }

  const places = await prisma.place.findMany({
    where: {
      OR: [
        ...(names.length > 0 ? [{ name: { in: names } }] : []),
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
      ],
    },
    include: {
      aiEnrichment: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${places.length} target places.`);

  for (const place of places) {
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
      console.log(`Skipped: ${place.name}`);
      continue;
    }

    await prisma.placeAiEnrichment.upsert({
      where: { placeId: place.id },
      update: generated,
      create: {
        placeId: place.id,
        ...generated,
      },
    });

    console.log(`Regenerated: ${place.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
