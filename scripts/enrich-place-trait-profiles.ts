import '../server/env';
import { prisma } from '../server/prisma';
import { enrichAndStorePlaceTraitsBatch } from '../server/placeTraitEnrichment';

const cityArg = process.argv.find((arg) => arg.startsWith('--city='));
const city = cityArg ? cityArg.split('=')[1]?.trim() : null;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 25;
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const placeIds = idsArg
  ? idsArg
      .split('=')[1]
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  : [];
const force = process.argv.includes('--force');

async function main() {
  const result = await enrichAndStorePlaceTraitsBatch({
    provider: 'openai',
    city,
    limit: Number.isFinite(limit) ? limit : 25,
    placeIds,
    force,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
