import dotenv from 'dotenv';
import { prisma } from '../server/prisma';

dotenv.config();

const namesArg = process.argv.find((arg) => arg.startsWith('--names='));

function parseNames() {
  if (!namesArg) return [];
  return namesArg
    .slice('--names='.length)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLocationPart(part: string) {
  const trimmed = part.trim();
  if (!trimmed) return null;

  const withoutPostalCode = trimmed
    .replace(/\b\d{4,6}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!withoutPostalCode) return null;

  if (/daerah khusus ibukota jakarta/i.test(withoutPostalCode)) return 'Jakarta';

  return withoutPostalCode
    .replace(/^(kota|city of)\s+/i, '')
    .replace(/\b(city|regency)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

function isLikelyCityCandidate(part: string) {
  const normalized = part.trim();
  if (!normalized) return false;

  if (/^[A-Z0-9]{3,}\+[A-Z0-9]+$/i.test(normalized)) return false;
  if (/^[A-Z]{2,3}$/.test(normalized)) return false;
  if (/^(jl\.|jalan\b|street\b|st\b|road\b|rd\b|avenue\b|ave\b|rt\.?|rw\.?|no\.|halte\b|komplek\b|complex\b)/i.test(normalized)) return false;
  if (/^(kec\.|kecamatan|kel\.|kelurahan|kota adm\.|kabupaten|regency of)\b/i.test(normalized)) return false;
  if (/^[A-Z]{2}\s+\d{4,6}$/i.test(normalized)) return false;
  if (/^\d+/.test(normalized)) return false;

  return true;
}

function parseLocationBits(raw?: string) {
  const parts = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const country = normalizeLocationPart(parts.at(-1) ?? '') ?? null;
  const candidates = parts
    .slice(0, Math.max(parts.length - 1, 0))
    .map((part) => normalizeLocationPart(part))
    .filter((part): part is string => Boolean(part));

  let city: string | null = null;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!isLikelyCityCandidate(candidate)) continue;
    city = candidate;
    break;
  }

  if (city && /jakarta/i.test(city)) {
    city = city
      .replace(/\b(barat|timur|utara|selatan|pusat)\b/i, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase())
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return { city, country };
}

async function main() {
  const names = parseNames();
  if (names.length === 0) {
    console.log('Pass --names="Place A|Place B"');
    return;
  }

  const places = await prisma.place.findMany({
    where: { name: { in: names } },
    orderBy: { name: 'asc' },
  });

  for (const place of places) {
    const next = parseLocationBits(place.address ?? undefined);
    await prisma.place.update({
      where: { id: place.id },
      data: {
        city: next.city,
        country: next.country ?? place.country,
      },
    });
    console.log(`Backfilled: ${place.name} -> city=${next.city ?? 'null'} country=${next.country ?? place.country ?? 'null'}`);
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
