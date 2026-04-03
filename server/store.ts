import { MOCK_PLACES, MOCK_USER, SIMILAR_TRAVELERS } from '../src/mockData';

type NotificationItem =
  | {
      id: string;
      type: 'place';
      avatar: string;
      title: string;
      body: string;
      time: string;
      placeId: string;
    }
  | {
      id: string;
      type: 'traveler';
      avatar: string;
      title: string;
      body: string;
      time: string;
      travelerId: string;
    };

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  recommendationEnabled: boolean;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'followers';
  momentVisibility: 'public' | 'private';
}

export interface MomentRecord {
  id: string;
  placeId: string;
  visitedDate: string;
  caption: string;
  uploadedMedia: string[];
  rating: number;
  budgetLevel: '$' | '$$' | '$$$';
  visitType: 'solo' | 'couple' | 'friends' | 'family';
  timeOfDay: 'morning' | 'afternoon' | 'sunset' | 'night';
  privacy: 'public' | 'private';
  wouldRevisit: 'yes' | 'not_sure' | 'not_interested';
  vibeTags: string[];
}

export interface CollectionRecord {
  id: string;
  label: string;
  placeIds: string[];
}

const me = {
  ...MOCK_USER,
  displayName: MOCK_USER.displayName ?? 'Alex Rivera',
  email: 'alex@vibecheck.app',
};

const notifications: NotificationItem[] = [
  {
    id: 'n1',
    type: 'place',
    avatar: SIMILAR_TRAVELERS[0].avatar,
    title: 'Fresh match for your vibe',
    body: `${MOCK_PLACES[0].name} is trending with travelers who save aesthetic and low-pressure spots.`,
    time: '2m ago',
    placeId: MOCK_PLACES[0].id,
  },
  {
    id: 'n2',
    type: 'traveler',
    avatar: SIMILAR_TRAVELERS[0].avatar,
    title: 'New traveler overlap',
    body: `@${SIMILAR_TRAVELERS[0].username} keeps visiting places close to your saves.`,
    time: '1h ago',
    travelerId: SIMILAR_TRAVELERS[0].id,
  },
  {
    id: 'n3',
    type: 'place',
    avatar: SIMILAR_TRAVELERS[1].avatar,
    title: 'People you follow were here',
    body: `${MOCK_PLACES[2].name} keeps showing up in your circle this week.`,
    time: 'Yesterday',
    placeId: MOCK_PLACES[2].id,
  },
];

const notificationSettings: NotificationSettings = {
  pushEnabled: true,
  emailEnabled: true,
  recommendationEnabled: true,
};

const privacySettings: PrivacySettings = {
  profileVisibility: 'public',
  momentVisibility: 'public',
};

const moments: MomentRecord[] = [
  {
    id: 'm1',
    placeId: MOCK_PLACES[0].id,
    visitedDate: '2026-03-20',
    caption: `Still one of my favorite stops from ${MOCK_PLACES[0].location.split(',')[0]}.`,
    uploadedMedia: ['tokyo-night-walk.jpg', 'table-video.mp4'],
    rating: 4,
    budgetLevel: '$$',
    visitType: 'solo',
    timeOfDay: 'night',
    privacy: 'public',
    wouldRevisit: 'yes',
    vibeTags: ['aesthetic', 'worth it'],
  },
];

const collections: CollectionRecord[] = [
  { id: 'c1', label: 'Spring 2026', placeIds: [MOCK_PLACES[0].id, MOCK_PLACES[1].id] },
  { id: 'c2', label: 'Lebaran moment', placeIds: [MOCK_PLACES[1].id, MOCK_PLACES[2].id] },
];

export const store = {
  me,
  notifications,
  notificationSettings,
  privacySettings,
  moments,
  collections,
};

export function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function findPlaceById(placeId: string) {
  return MOCK_PLACES.find((place) => place.id === placeId) ?? null;
}

export function findTravelerById(travelerId: string) {
  return SIMILAR_TRAVELERS.find((traveler) => traveler.id === travelerId) ?? null;
}
