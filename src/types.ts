export type Interest = 'cafe' | 'nature' | 'party' | 'culture' | 'shopping' | 'adventure';
export type Vibe = 'solo' | 'luxury' | 'aesthetic' | 'budget' | 'spontaneous';

export interface Place {
  id: string;
  name: string;
  location: string;
  description: string;
  address?: string;
  hook?: string;
  image: string;
  tags: string[];
  attitudeLabel?: string;
  bestTime?: string;
  similarityStat?: number; // e.g. 68% of similar travelers visited
  recommendationReason?: string;
  whyYoullLikeIt?: string[];
  priceRange?: string;
  priceLevel?: number;
  rating?: number;
  category?: string;
  images?: string[]; // for carousel
  openingHours?: string[];
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  momentId?: string;
  ownerUserId?: string;
  visitedDate?: string;
  momentMedia?: Array<{ url: string; mediaType: 'image' | 'video' }>;
  momentCaption?: string;
  momentVibeTags?: string[];
  momentVisitType?: 'solo' | 'couple' | 'friends' | 'family';
  momentTimeOfDay?: 'morning' | 'afternoon' | 'sunset' | 'night';
  momentWouldRevisit?: 'yes' | 'not_sure' | 'not_interested';
  momentRating?: number;
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  bio: string;
  avatar: string;
  descriptor?: string;
  relevanceReason?: string;
  vibinCount?: number;
  badges?: string[];
  flags?: string[]; // array of emoji flags
  stats: {
    countries: number;
    cities: number;
    trips: number;
  };
  travelHistory: {
    country: string;
    cities: string[];
    places?: Place[]; // Added places for the collection view
  }[];
  matchScore?: number;
}

export interface EventItem {
  id: string;
  source: 'ticketmaster';
  name: string;
  description: string;
  hook?: string;
  image?: string;
  venueName?: string;
  location: string;
  category?: string;
  tags: string[];
  startAt: string;
  endAt?: string;
  ticketUrl?: string;
  priceLabel?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  compatibilityScore: number;
  compatibilityReason: string;
  status?: string;
}

export type Screen =
  | 'landing'
  | 'onboarding'
  | 'post-preferences-intro'
  | 'login'
  | 'register'
  | 'profile'
  | 'notifications'
  | 'settings'
  | 'settings-account'
  | 'settings-notifications'
  | 'settings-privacy'
  | 'support'
  | 'add-collection'
  | 'edit-profile'
  | 'edit-moment'
  | 'bookmarks'
  | 'create-moment'
  | 'collection-detail'
  | 'location-search'
  | 'discover-places'
  | 'discover-travelers'
  | 'public-profile'
  | 'place-detail'
  | 'event-detail'
  | 'traveler-profile';
