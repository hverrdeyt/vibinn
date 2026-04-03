import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { MOCK_PLACES, MOCK_USER, SIMILAR_TRAVELERS } from '../src/mockData';

const prisma = new PrismaClient();

function hashPassword(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  await prisma.vibin.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.collectionMoment.deleteMany();
  await prisma.collectionPlace.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.momentMedia.deleteMany();
  await prisma.moment.deleteMany();
  await prisma.dismissedPlace.deleteMany();
  await prisma.bookmark.deleteMany();
  await prisma.userPlaceScore.deleteMany();
  await prisma.placeAiEnrichment.deleteMany();
  await prisma.placeMedia.deleteMany();
  await prisma.place.deleteMany();
  await prisma.userSavedLocation.deleteMany();
  await prisma.location.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.userNotificationSettings.deleteMany();
  await prisma.userPrivacySettings.deleteMany();
  await prisma.userAccountSettings.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.userFlag.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.travelerSimilarity.deleteMany();
  await prisma.share.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      username: MOCK_USER.username,
      displayName: MOCK_USER.displayName ?? 'Alex Rivera',
      email: 'alex@vibecheck.app',
      passwordHash: hashPassword('password123'),
      bio: MOCK_USER.bio,
      avatarUrl: MOCK_USER.avatar,
      authProvider: 'MANUAL',
      badges: { create: (MOCK_USER.badges ?? []).map((label) => ({ label })) },
      flags: { create: (MOCK_USER.flags ?? []).map((emoji) => ({ emoji })) },
      accountSettings: { create: {} },
      notificationPrefs: {
        create: { pushEnabled: true, emailEnabled: true, recommendationEnabled: true },
      },
      privacySettings: {
        create: { profileVisibility: 'PUBLIC', momentVisibility: 'PUBLIC' },
      },
      preferences: {
        create: {
          selectedInterests: ['cafe', 'culture'],
          selectedVibe: 'aesthetic',
          onboardingCompleted: true,
        },
      },
    },
  });

  for (const place of MOCK_PLACES) {
    await prisma.place.create({
      data: {
        id: place.id,
        name: place.name,
        city: place.location.split(',')[0]?.trim(),
        country: place.location.split(',')[1]?.trim(),
        category: place.category ?? 'recommended spot',
        rating: 4.6,
        priceLevel: place.priceRange === '$$$' ? 3 : place.priceRange === '$$' ? 2 : 1,
        primaryImageUrl: place.image,
        media: {
          create: (place.images ?? [place.image]).map((url, index) => ({
            mediaType: 'image',
            url,
            sortOrder: index,
          })),
        },
        aiEnrichment: {
          create: {
            hook: place.description,
            description: place.description,
            vibeTags: place.tags.map((tag) => tag.replace(/-/g, ' ')),
            attitudeLabel: place.tags.includes('hidden-gem') ? 'hidden gem' : 'worth the hype',
            bestTime: 'sunset',
          },
        },
      },
    });
  }

  for (const traveler of SIMILAR_TRAVELERS) {
    const createdTraveler = await prisma.user.create({
      data: {
        username: traveler.username,
        displayName: traveler.displayName ?? traveler.username,
        email: `${traveler.username}@vibecheck.app`,
        passwordHash: hashPassword('password123'),
        bio: traveler.bio,
        avatarUrl: traveler.avatar,
        authProvider: 'MANUAL',
        badges: { create: (traveler.badges ?? []).map((label) => ({ label })) },
        flags: { create: (traveler.flags ?? []).map((emoji) => ({ emoji })) },
      },
    });

    await prisma.follow.create({
      data: {
        sourceUserId: user.id,
        targetUserId: createdTraveler.id,
      },
    });

    await prisma.travelerSimilarity.create({
      data: {
        userId: user.id,
        travelerId: createdTraveler.id,
        matchScore: traveler.matchScore ?? 80,
        relevanceReason: 'Shared taste in aesthetic, low-pressure, city-first spots.',
      },
    });

    const travelerPlaces =
      traveler.travelHistory.flatMap((history) => history.places ?? []).length > 0
        ? traveler.travelHistory.flatMap((history) => history.places ?? [])
        : [MOCK_PLACES[(SIMILAR_TRAVELERS.indexOf(traveler) + 1) % MOCK_PLACES.length]];

    for (const [index, place] of travelerPlaces.slice(0, 2).entries()) {
      await prisma.moment.create({
        data: {
          userId: createdTraveler.id,
          placeId: place.id,
          visitedAt: new Date(2026, 1 + index, 10 + index),
          caption: `${traveler.displayName ?? traveler.username} saved this stop from ${place.location.split(',')[0]}.`,
          rating: 4,
          budgetLevel: place.priceRange === '$$$' ? '$$$' : place.priceRange === '$$' ? '$$' : '$',
          visitType: 'SOLO',
          timeOfDay: index % 2 === 0 ? 'SUNSET' : 'NIGHT',
          privacy: 'PUBLIC',
          wouldRevisit: 'YES',
          vibeTags: place.tags.slice(0, 3).map((tag) => tag.replace(/-/g, ' ')),
          media: {
            create: (place.images ?? [place.image]).slice(0, 2).map((url, mediaIndex) => ({
              mediaType: mediaIndex === 1 ? 'video' : 'image',
              url: mediaIndex === 1 ? 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' : url,
              thumbnailUrl: mediaIndex === 1 ? url : null,
              sortOrder: mediaIndex,
            })),
          },
        },
      });
    }
  }

  await prisma.moment.create({
    data: {
      userId: user.id,
      placeId: MOCK_PLACES[0].id,
      visitedAt: new Date('2026-03-20'),
      caption: `Still one of my favorite stops from ${MOCK_PLACES[0].location.split(',')[0]}.`,
      rating: 4,
      budgetLevel: '$$',
      visitType: 'SOLO',
      timeOfDay: 'NIGHT',
      privacy: 'PUBLIC',
      wouldRevisit: 'YES',
      vibeTags: ['aesthetic', 'worth it'],
      media: {
        create: [
          { mediaType: 'image', url: 'tokyo-night-walk.jpg', sortOrder: 0 },
          { mediaType: 'video', url: 'table-video.mp4', sortOrder: 1 },
        ],
      },
    },
  });

  await prisma.collection.create({
    data: {
      userId: user.id,
      title: 'Spring 2026',
      places: {
        create: [
          { placeId: MOCK_PLACES[0].id, sortOrder: 0 },
          { placeId: MOCK_PLACES[1].id, sortOrder: 1 },
        ],
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: 'PLACE_MATCH',
      targetType: 'PLACE',
      targetId: MOCK_PLACES[0].id,
      title: 'Fresh match for your vibe',
      body: `${MOCK_PLACES[0].name} is trending with travelers who save aesthetic and low-pressure spots.`,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
