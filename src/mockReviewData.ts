import { type EventItem, type Place, type User } from './types';
import { MOCK_PLACES } from './mockData';

export const MOCK_REVIEW_QUERY_PARAM = 'mock-review';

function withMoment(
  place: Place,
  overrides?: Partial<Place>,
): Place {
  return {
    ...place,
    momentId: overrides?.momentId ?? `moment-${place.id}`,
    visitedDate: overrides?.visitedDate ?? '2026-03-21',
    momentCaption: overrides?.momentCaption ?? `${place.name} ended up being a better stop than expected.`,
    momentRating: overrides?.momentRating ?? 5,
    momentWouldRevisit: overrides?.momentWouldRevisit ?? 'yes',
    momentVisitType: overrides?.momentVisitType ?? 'friends',
    momentTimeOfDay: overrides?.momentTimeOfDay ?? 'afternoon',
    momentVibeTags: overrides?.momentVibeTags ?? ['worth it', 'easy stop'],
    momentMedia: overrides?.momentMedia ?? [{
      url: place.image,
      mediaType: 'image',
    }],
    ...overrides,
  };
}

const bostonBookshop = {
  ...MOCK_PLACES[0],
  address: '71 Charles St, Boston, MA',
  bestTime: 'Late afternoon',
  attitudeLabel: 'Soft-spoken favorite',
  rating: 4.7,
} satisfies Place;

const harborwalk = {
  ...MOCK_PLACES[1],
  address: 'Atlantic Ave, Boston, MA',
  bestTime: 'Sunset',
  attitudeLabel: 'Skyline reset',
  rating: 4.6,
} satisfies Place;

const southEndCoffee = {
  ...MOCK_PLACES[2],
  address: '560 Tremont St, Boston, MA',
  bestTime: 'Morning',
  attitudeLabel: 'Slow start',
  rating: 4.5,
} satisfies Place;

const vinylBar = {
  ...MOCK_PLACES[3],
  address: 'Hanover St, Boston, MA',
  bestTime: 'After dark',
  attitudeLabel: 'Night energy',
  rating: 4.8,
} satisfies Place;

const sowaHall = {
  ...MOCK_PLACES[4],
  address: '450 Harrison Ave, Boston, MA',
  bestTime: 'Weekend afternoons',
  attitudeLabel: 'Browse-first',
  rating: 4.6,
} satisfies Place;

const scienceMuseum: Place = {
  id: 'p-bos-6',
  name: 'Museum of Science',
  location: 'Boston, USA',
  description: 'Hands-on exhibits, planetarium energy, and the kind of stop that works for both curiosity and nostalgia.',
  image: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80',
  images: ['https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80'],
  tags: ['science', 'museum', 'cultural'],
  whyYoullLikeIt: ['easy cultural stop', 'good reset from pure food-shopping loops'],
  similarityStat: 84,
  category: 'Museum',
  address: '1 Museum Of Science Dr, Boston, MA',
  rating: 4.5,
  bestTime: 'Midday',
};

const reflectingPool: Place = {
  id: 'p-bos-7',
  name: 'Reflecting Pool',
  location: 'Boston, USA',
  description: 'Quiet water, clean lines, and a slower pause between louder city stops.',
  image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
  images: ['https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80'],
  tags: ['scenic', 'quiet', 'walkable'],
  whyYoullLikeIt: ['easy reset between packed plans', 'good if you want a cleaner, calmer stop'],
  similarityStat: 80,
  category: 'Outdoor Space',
  address: 'Boston, MA',
  rating: 4.4,
  bestTime: 'Golden hour',
};

const mockVisitedPlaces: Place[] = [
  withMoment(bostonBookshop, {
    visitedDate: '2026-03-21',
    momentCaption: 'Still one of my easiest yeses in Boston. Soft, quiet, and actually worth lingering in.',
    momentVibeTags: ['cozy', 'bookish'],
    momentTimeOfDay: 'afternoon',
  }),
  withMoment(vinylBar, {
    visitedDate: '2026-03-15',
    momentCaption: 'Felt more low-key than the usual night plans, in a good way.',
    momentWouldRevisit: 'yes',
    momentVisitType: 'friends',
    momentTimeOfDay: 'night',
    momentVibeTags: ['after dark', 'vinyl night'],
  }),
  withMoment(scienceMuseum, {
    visitedDate: '2026-02-28',
    momentCaption: 'A surprisingly easy cultural stop when we wanted something indoors but not sleepy.',
    momentWouldRevisit: 'not_sure',
    momentRating: 4,
    momentVisitType: 'couple',
    momentVibeTags: ['cultural', 'smart reset'],
  }),
];

const mockSavedPlaces: Place[] = [
  southEndCoffee,
  sowaHall,
  harborwalk,
  reflectingPool,
];

const savedPlaceDrop: Place = {
  id: 'p-bos-8',
  name: 'Little Wolf Coffee',
  location: 'Boston, USA',
  description: 'A quieter coffee stop with enough personality to feel like a real find.',
  image: 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=800&q=80',
  images: ['https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=800&q=80'],
  tags: ['chill', 'coffee'],
  whyYoullLikeIt: ['feels neighborhood-first', 'good if you want a softer morning plan'],
  similarityStat: 82,
  category: 'Cafe',
  address: 'Boston, MA',
  rating: 4.4,
  bestTime: 'Morning',
};

const mockCollections = [
  {
    label: 'Boston soft spots',
    places: [bostonBookshop, southEndCoffee, reflectingPool],
  },
  {
    label: 'After dark but still tasteful',
    places: [vinylBar, harborwalk],
  },
];

const followedTravelerA: User = {
  id: 'u-feed-1',
  username: 'aulia',
  displayName: 'Aulia',
  bio: 'Late dinners, low-light bars, and places with an actual point of view.',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
  descriptor: 'leans after-dark but still polished',
  relevanceReason: 'You both keep saving places that feel more low-key than loud.',
  vibinCount: 18,
  badges: ['after dark', 'taste overlap'],
  flags: ['🇺🇸', '🇫🇷', '🇯🇵'],
  stats: { countries: 9, cities: 26, trips: 14 },
  matchScore: 92,
  travelHistory: [
    {
      country: 'USA',
      cities: ['Boston'],
      places: [
        withMoment(vinylBar, {
          momentId: 'm-follow-1',
          momentCaption: 'This felt like the exact right energy for a Saturday that did not need to get chaotic.',
          momentVisitType: 'friends',
          momentTimeOfDay: 'night',
        }),
        withMoment(harborwalk, {
          momentId: 'm-follow-2',
          momentCaption: 'Quick harbor reset before dinner, and honestly that was enough.',
          momentVisitType: 'solo',
          momentTimeOfDay: 'sunset',
        }),
      ],
    },
  ],
};

const followedTravelerB: User = {
  id: 'u-feed-2',
  username: 'miles.daytrip',
  displayName: 'Miles Harper',
  bio: 'Walkable neighborhoods, good coffee, and museum stops that still feel alive.',
  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
  descriptor: 'good at finding low-effort, high-reward stops',
  relevanceReason: 'Their saves keep landing near the same coffee and culture lane as yours.',
  vibinCount: 11,
  badges: ['walkable', 'culture'],
  flags: ['🇺🇸', '🇮🇹'],
  stats: { countries: 6, cities: 18, trips: 10 },
  matchScore: 88,
  travelHistory: [
    {
      country: 'USA',
      cities: ['Boston'],
      places: [
        withMoment(southEndCoffee, {
          momentId: 'm-follow-3',
          momentCaption: 'A very easy start to the day when you want somewhere good without turning it into a whole mission.',
          momentVisitType: 'solo',
          momentTimeOfDay: 'morning',
        }),
        withMoment(scienceMuseum, {
          momentId: 'm-follow-4',
          momentCaption: 'Less touristy-feeling than I expected once we were inside.',
          momentWouldRevisit: 'yes',
          momentRating: 4,
        }),
      ],
    },
  ],
};

const mockReviewFeedSavedDrops: Array<{
  id: string;
  travelerId: string;
  place: Place;
  caption: string;
  savedAtLabel: string;
}> = [
  {
    id: 'saved-drop-1',
    travelerId: followedTravelerA.id,
    place: savedPlaceDrop,
    caption: 'Saved this because it feels like a very easy yes for a slower Boston morning.',
    savedAtLabel: '4h ago',
  },
  {
    id: 'saved-drop-2',
    travelerId: followedTravelerB.id,
    place: reflectingPool,
    caption: 'Saved for the kind of day that needs one quieter stop in the middle.',
    savedAtLabel: 'yesterday',
  },
  {
    id: 'saved-drop-3',
    travelerId: followedTravelerA.id,
    place: bostonBookshop,
    caption: 'Saved because this feels like the kind of stop you end up recommending twice.',
    savedAtLabel: '1d ago',
  },
];

const similarTravelerA: User = {
  id: 'u-feed-3',
  username: 'jade.lowkey',
  displayName: 'Jade Kim',
  bio: 'Cozy bookstores, design stores, and city walks that do not feel overplanned.',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
  descriptor: 'strong overlap in slower, aesthetic city taste',
  relevanceReason: 'You keep circling similar coffee, bookstore, and browse-heavy stops.',
  vibinCount: 14,
  badges: ['cozy', 'browsey'],
  flags: ['🇺🇸', '🇰🇷', '🇯🇵'],
  stats: { countries: 8, cities: 21, trips: 12 },
  matchScore: 95,
  travelHistory: [
    {
      country: 'USA',
      cities: ['Boston'],
      places: [
        withMoment(bostonBookshop, {
          momentId: 'm-sim-1',
          momentCaption: 'This feels like the kind of stop you end up recommending more than once.',
        }),
        withMoment(sowaHall, {
          momentId: 'm-sim-2',
          momentCaption: 'Good browse energy without feeling like a generic shopping stop.',
        }),
      ],
    },
  ],
};

const similarTravelerB: User = {
  id: 'u-feed-4',
  username: 'omar.citylayers',
  displayName: 'Omar Reyes',
  bio: 'I like a city more when the day can hold coffee, a walk, and one smart stop.',
  avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
  descriptor: 'balanced between scenic and cultural',
  relevanceReason: 'There is a clear overlap in your save-and-visit pattern, especially around cultural resets.',
  vibinCount: 9,
  badges: ['cultural', 'scenic'],
  flags: ['🇺🇸', '🇪🇸'],
  stats: { countries: 5, cities: 16, trips: 9 },
  matchScore: 86,
  travelHistory: [
    {
      country: 'USA',
      cities: ['Boston'],
      places: [
        withMoment(reflectingPool, {
          momentId: 'm-sim-3',
          momentCaption: 'A good quiet pause when the rest of the city feels a little too on.',
        }),
        withMoment(scienceMuseum, {
          momentId: 'm-sim-4',
          momentCaption: 'Still a solid call if you want something cultural that stays easy.',
        }),
      ],
    },
  ],
};

const mockDiscoveryPlaces: Place[] = [
  bostonBookshop,
  harborwalk,
  southEndCoffee,
  vinylBar,
  sowaHall,
  scienceMuseum,
  reflectingPool,
];

const mockDiscoveryEvents: EventItem[] = [
  {
    id: 'e-mock-1',
    source: 'ticketmaster',
    name: 'Late Set at The Sinclair',
    description: 'A small-room night that feels more vibey than chaotic.',
    hook: 'Good after-dark plan if your nights lean more intimate than huge.',
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80',
    venueName: 'The Sinclair',
    location: 'Cambridge, USA',
    category: 'Music',
    tags: ['music', 'after dark'],
    startAt: '2026-04-19T20:00:00-04:00',
    compatibilityScore: 84,
    compatibilityReason: 'Feels aligned with the after-dark but still tasteful side of your taste graph.',
    status: 'onsale',
  },
];

const mockUser: User = {
  id: 'u-local-review',
  username: 'fauzan',
  displayName: 'Fauzan',
  bio: 'Using Vibinn like a taste graph: saving first, checking in when it is worth remembering, and collecting places into trip moods.',
  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
  descriptor: 'leans cozy, browsey, and low-pressure with a soft spot for after-dark plans that still feel intentional',
  relevanceReason: 'Mock local review profile',
  vibinCount: 22,
  badges: ['taste-first', 'city weekender', 'soft planning'],
  flags: ['🇺🇸', '🇯🇵', '🇮🇹'],
  stats: { countries: 7, cities: 19, trips: 11 },
  matchScore: 97,
  travelHistory: [
    {
      country: 'USA',
      cities: ['Boston'],
      places: mockVisitedPlaces,
    },
  ],
};

type MockBundle = {
  place: Place;
  relatedPlaces: Array<{ id: string; name: string; imageUrl: string }>;
  travelerMoments: Array<{
    id: string;
    travelerUsername: string;
    travelerAvatar: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }>;
  interactionState: {
    bookmarkedPlaceIds: string[];
    beenTherePlaceIds: string[];
  };
};

const travelerMomentFromPlace = (traveler: User, place: Place) => ({
  id: place.momentId ?? `${traveler.id}-${place.id}`,
  travelerUsername: traveler.username,
  travelerAvatar: traveler.avatar,
  mediaUrl: place.momentMedia?.[0]?.url ?? place.image,
  mediaType: place.momentMedia?.[0]?.mediaType ?? 'image' as const,
  caption: place.momentCaption ?? `${place.name} was a strong stop.`,
});

function buildPlaceBundle(place: Place): MockBundle {
  const relatedPlaces = mockDiscoveryPlaces
    .filter((candidate) => candidate.id !== place.id)
    .slice(0, 4)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      imageUrl: candidate.image,
    }));

  const travelerMoments = [followedTravelerA, followedTravelerB, similarTravelerA, similarTravelerB]
    .flatMap((traveler) => traveler.travelHistory.flatMap((trip) => trip.places ?? []).filter((entry) => entry.id === place.id).map((entry) => travelerMomentFromPlace(traveler, entry)))
    .slice(0, 4);

  return {
    place,
    relatedPlaces,
    travelerMoments,
    interactionState: {
      bookmarkedPlaceIds: mockSavedPlaces.map((entry) => entry.id),
      beenTherePlaceIds: mockVisitedPlaces.map((entry) => entry.id),
    },
  };
}

export const MOCK_REVIEW_SCENARIO = {
  user: mockUser,
  savedLocations: [
    { id: 'loc-bos', label: 'Boston', type: 'city' as const, latitude: 42.3601, longitude: -71.0589 },
    { id: 'loc-nyc', label: 'New York City', type: 'city' as const, latitude: 40.7128, longitude: -74.006 },
  ],
  activeLocationId: 'loc-bos',
  selectedInterests: ['cafe', 'culture', 'shopping'] as const,
  selectedVibe: 'aesthetic' as const,
  discoveryPlaces: mockDiscoveryPlaces,
  discoveryEvents: mockDiscoveryEvents,
  bookmarkedPlaces: mockSavedPlaces,
  bookmarkedPlaceIds: mockSavedPlaces.map((place) => place.id),
  dismissedPlaceIds: [] as string[],
  customCollections: mockCollections,
  myMoments: mockVisitedPlaces.map((place) => ({ id: place.momentId ?? `moment-${place.id}`, placeId: place.id })),
  followedTravelers: [followedTravelerA, followedTravelerB],
  similarTravelers: [similarTravelerA, similarTravelerB],
  feedSavedDrops: mockReviewFeedSavedDrops.filter((entry) => entry.travelerId === followedTravelerA.id || entry.id === 'saved-drop-2'),
  placeDetailBundles: Object.fromEntries(
    mockDiscoveryPlaces.map((place) => [place.id, buildPlaceBundle(place)]),
  ) as Record<string, MockBundle>,
};

export function isMockReviewModeEnabled() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(MOCK_REVIEW_QUERY_PARAM) === '1';
}
