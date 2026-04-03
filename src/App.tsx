/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, type TouchEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, 
  Compass, 
  Plus, 
  Share2, 
  ChevronRight, 
  MapPin, 
  Heart,
  ArrowRight,
  Lock,
  Globe,
  Sparkles,
  Settings,
  Bell,
  MoreHorizontal,
  Grid,
  Bookmark,
  ExternalLink,
  Users,
  ChevronDown,
  Search,
  X,
  Zap,
  MessageCircle,
  PencilLine,
  CalendarDays,
  ImagePlus,
  Star,
  WalletCards,
  SlidersHorizontal,
  Check,
  Mail,
  KeyRound,
} from 'lucide-react';
import { Screen, User, Place, Interest, Vibe, EventItem } from './types';
import { MOCK_USER, MOCK_PLACES, SIMILAR_TRAVELERS } from './mockData';
import PlaceCard, { PlaceCardData } from './components/PlaceCard';
import PlaceDetailPage, { PlaceDetailData } from './components/PlaceDetailPage';
import TravelerCard, { TravelerCardData } from './components/TravelerCard';
import DetailActionBar from './components/DetailActionBar';
import { api, ApiError } from './lib/api';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            ux_mode?: 'popup' | 'redirect';
            context?: string;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: string | number;
              logo_alignment?: 'left' | 'center';
            },
          ) => void;
          prompt: (callback?: (notification: {
            isNotDisplayed?: () => boolean;
            isSkippedMoment?: () => boolean;
            getNotDisplayedReason?: () => string;
            getSkippedReason?: () => string;
          }) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface SavedLocationOption {
  id: string;
  label: string;
  type: 'city' | 'province' | 'country';
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
}

interface DeviceLocation {
  latitude: number;
  longitude: number;
}

const INITIAL_SAVED_LOCATIONS: SavedLocationOption[] = [
  { id: 'boston', label: 'Boston', type: 'city' },
];

const DISCOVERY_PLACE_FEED: Place[] = [
  ...MOCK_PLACES,
  {
    id: 'p4',
    name: 'Beacon Hill Bookshop',
    location: 'Boston, USA',
    description: 'Cozy shelves, soft light, and a lowkey corner for disappearing offline.',
    image: 'https://images.unsplash.com/photo-1526243741027-444d633d7365?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1526243741027-444d633d7365?auto=format&fit=crop&w=1200&q=80'],
    tags: ['bookstore', 'cozy', 'hidden-gem'],
    similarityStat: 88,
    whyYoullLikeIt: ['great for solo afternoons', 'quiet neighborhood energy'],
    priceRange: '$',
    category: 'Bookstore / Cafe',
  },
  {
    id: 'p5',
    name: 'Lotte World Tower View',
    location: 'Seoul, South Korea',
    description: 'Skyline glow, polished fits, and late-night city energy.',
    image: 'https://images.unsplash.com/photo-1549692520-acc6669e2f0c?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1549692520-acc6669e2f0c?auto=format&fit=crop&w=1200&q=80'],
    tags: ['night-view', 'polished', 'popular'],
    similarityStat: 81,
    whyYoullLikeIt: ['best when the city lights hit', 'easy date-night anchor'],
    priceRange: '$$',
    category: 'Viewpoint',
  },
  {
    id: 'p6',
    name: 'Little Island',
    location: 'New York, USA',
    description: 'Green escape with skyline payoff and surprisingly calm energy.',
    image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80'],
    tags: ['nature', 'city-reset', 'people-like-you'],
    similarityStat: 79,
    whyYoullLikeIt: ['good reset between city plans', 'sunset hits hard here'],
    priceRange: 'Free',
    category: 'Park',
  },
  {
    id: 'p7',
    name: 'Nami Cafe Alley',
    location: 'Bandung, Indonesia',
    description: 'Cute little strip of coffee spots that feels made for slow mornings.',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80'],
    tags: ['cafe-hop', 'aesthetic', 'hidden-gem'],
    similarityStat: 91,
    whyYoullLikeIt: ['easy cafe crawl', 'strong visual mood without trying too hard'],
    priceRange: '$',
    category: 'Cafe District',
  },
  {
    id: 'p8',
    name: 'Seokchon Lake Walk',
    location: 'Seoul, South Korea',
    description: 'Waterfront loop with soft city views and clean-girl walk energy.',
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80'],
    tags: ['walkable', 'chill', 'vibe-match'],
    similarityStat: 84,
    whyYoullLikeIt: ['good for decompressing', 'pairs well with a cafe stop after'],
    priceRange: 'Free',
    category: 'Lake Walk',
  },
  {
    id: 'p9',
    name: 'Tsutaya Daikanyama',
    location: 'Tokyo, Japan',
    description: 'Design books, vinyl, and calm rich-aunt energy.',
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80'],
    tags: ['design', 'quiet-luxury', 'lowkey-spot'],
    similarityStat: 90,
    whyYoullLikeIt: ['great for unhurried browsing', 'tasteful without being loud'],
    priceRange: '$$',
    category: 'Books / Culture',
  },
  {
    id: 'p10',
    name: 'Jalan Braga Evenings',
    location: 'Bandung, Indonesia',
    description: 'Old street facades, live music, and just enough chaos to be fun.',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80'],
    tags: ['street-energy', 'culture', 'people-like-you'],
    similarityStat: 77,
    whyYoullLikeIt: ['good if you like night walks', 'more personality than polished malls'],
    priceRange: '$',
    category: 'Street / Culture',
  },
  {
    id: 'p11',
    name: 'Newbury Street Corners',
    location: 'Boston, USA',
    description: 'Window-shopping, brownstones, and casual main-character walking.',
    image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80',
    images: ['https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80'],
    tags: ['shopping', 'city-walk', 'vibe-match'],
    similarityStat: 74,
    whyYoullLikeIt: ['easy half-day plan', 'great if you like pretty streets more than landmarks'],
    priceRange: '$$',
    category: 'Shopping Street',
  },
].slice(0, 10);

function getCleanAttitudeLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized === 'new find' ||
    normalized === 'vibe match' ||
    normalized === 'local favorite' ||
    normalized === 'people pick'
  ) {
    return null;
  }

  return normalized;
}

function getSpecificPlaceLabel(place: Place) {
  const normalizedTags = place.tags.map((tag) => tag.toLowerCase().replace(/_/g, ' ').trim());
  const normalizedCategory = (place.category ?? '').toLowerCase().replace(/_/g, ' ').trim();

  if (normalizedTags.some((tag) => tag.includes('hidden gem'))) return 'hidden gem';
  if (normalizedTags.some((tag) => tag.includes('low key') || tag.includes('quiet'))) return 'low-key stop';
  if (normalizedTags.some((tag) => tag.includes('craft cocktails') || tag.includes('night'))) return 'after-dark pick';
  if (normalizedTags.some((tag) => tag.includes('design') || tag.includes('bookstore'))) return 'tasteful stop';
  if (normalizedTags.some((tag) => tag.includes('green reset') || tag.includes('open air')) || normalizedCategory.includes('park')) return 'green reset';
  if (normalizedTags.some((tag) => tag.includes('waterfront') || tag.includes('harbor') || tag.includes('river'))) return 'waterfront pick';
  if (normalizedTags.some((tag) => tag.includes('photo stop') || tag.includes('city highlight') || tag.includes('scenic'))) return 'photo stop';
  if (normalizedTags.some((tag) => tag.includes('walkable') || tag.includes('scenic'))) return 'easy stroll';
  if (normalizedTags.some((tag) => tag.includes('local') || tag.includes('neighborhood'))) return 'local pick';
  if (normalizedTags.some((tag) => tag.includes('cafe') || tag.includes('coffee'))) return 'coffee stop';
  if (normalizedTags.some((tag) => tag.includes('museum') || tag.includes('gallery') || tag.includes('culture'))) return 'culture fix';
  return null;
}

function getDisplayAttitudeLabel(place: Place) {
  const specificLabel = getSpecificPlaceLabel(place);
  if (specificLabel) return specificLabel;

  const normalizedAttitude = getCleanAttitudeLabel(place.attitudeLabel);
  if (!normalizedAttitude) return null;

  if (normalizedAttitude === 'worth the hype' || normalizedAttitude === 'easy stop') {
    return null;
  }

  return normalizedAttitude;
}

function GoogleIdentityButton({
  clientId,
  text,
  disabled,
  onCredential,
}: {
  clientId?: string;
  text: 'continue_with' | 'signup_with';
  disabled?: boolean;
  onCredential: (idToken: string) => Promise<void>;
}) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !buttonRef.current || !window.google?.accounts?.id || disabled) return;

    buttonRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      context: text === 'signup_with' ? 'signup' : 'signin',
      callback: (response) => {
        if (!response.credential) {
          setErrorMessage('Google did not return a sign-in credential.');
          return;
        }
        setErrorMessage(null);
        void onCredential(response.credential).catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : 'Could not continue with Google right now.');
        });
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'pill',
      width: 320,
      logo_alignment: 'left',
    });
  }, [clientId, disabled, onCredential, text]);

  if (!clientId) {
    return (
      <div className="rounded-[1.25rem] border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100">
        Google sign-in is not configured yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
        <div ref={buttonRef} className="flex justify-center" />
      </div>
      {errorMessage ? (
        <div className="rounded-[1.25rem] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

function getEditorialLabel(place: Place, index = 0) {
  const specificOrClean = getDisplayAttitudeLabel(place);
  if (specificOrClean) return specificOrClean;

  const normalizedTags = place.tags.map((tag) => tag.toLowerCase().replace(/_/g, ' ').trim());
  void index;
  if (normalizedTags.some((tag) => tag.includes('easy pause') || tag.includes('city break'))) return 'coffee stop';
  if (normalizedTags.some((tag) => tag.includes('thoughtful stop') || tag.includes('quiet browse'))) return 'culture fix';
  if (normalizedTags.some((tag) => tag.includes('easy wander'))) return 'easy stroll';
  return null;
}

function getPriceLevel(place: Place) {
  if (place.priceRange === 'Free') return 1;
  if (place.priceRange === '$') return 1;
  if (place.priceRange === '$$') return 2;
  return 3;
}

function getVibeAccentStyles(vibe: Vibe | null) {
  switch (vibe) {
    case 'aesthetic':
      return {
        panel: 'border-rose-300/30 bg-rose-300/10 shadow-[0_12px_30px_rgba(253,164,175,0.10)] hover:bg-rose-300/14',
        pill: 'bg-rose-300 text-zinc-950',
        accentText: 'text-rose-200',
      };
    case 'solo':
      return {
        panel: 'border-sky-300/30 bg-sky-300/10 shadow-[0_12px_30px_rgba(125,211,252,0.10)] hover:bg-sky-300/14',
        pill: 'bg-sky-300 text-zinc-950',
        accentText: 'text-sky-200',
      };
    case 'luxury':
      return {
        panel: 'border-amber-300/30 bg-amber-300/10 shadow-[0_12px_30px_rgba(252,211,77,0.10)] hover:bg-amber-300/14',
        pill: 'bg-amber-300 text-zinc-950',
        accentText: 'text-amber-200',
      };
    case 'budget':
      return {
        panel: 'border-emerald-300/30 bg-emerald-300/10 shadow-[0_12px_30px_rgba(110,231,183,0.10)] hover:bg-emerald-300/14',
        pill: 'bg-emerald-300 text-zinc-950',
        accentText: 'text-emerald-200',
      };
    case 'spontaneous':
      return {
        panel: 'border-orange-300/30 bg-orange-300/10 shadow-[0_12px_30px_rgba(253,186,116,0.10)] hover:bg-orange-300/14',
        pill: 'bg-orange-300 text-zinc-950',
        accentText: 'text-orange-200',
      };
    default:
      return {
        panel: 'border-accent/30 bg-accent/12 shadow-[0_12px_30px_rgba(194,243,104,0.08)] hover:bg-accent/16',
        pill: 'bg-accent text-black',
        accentText: 'text-accent',
      };
  }
}

function calculateDistanceKm(
  from?: { latitude?: number; longitude?: number },
  to?: { latitude?: number; longitude?: number },
) {
  if (
    typeof from?.latitude !== 'number' ||
    typeof from?.longitude !== 'number' ||
    typeof to?.latitude !== 'number' ||
    typeof to?.longitude !== 'number'
  ) {
    return undefined;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 10) / 10;
}

function buildPlaceRecommendationReason(place: Place, travelerMomentCount = 0) {
  const normalizedTags = place.tags.map((tag) => tag.toLowerCase().replace(/[_-]+/g, ' ').trim());
  const normalizedCategory = (place.category ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  const whyLine = place.whyYoullLikeIt?.find((item) => item && !/^best at /i.test(item));

  if (whyLine) return whyLine;

  if (travelerMomentCount > 1) {
    return 'travelers with overlapping taste keep surfacing this stop';
  }

  if (travelerMomentCount === 1) {
    return 'a traveler with overlapping taste already logged this stop';
  }

  if (normalizedTags.some((tag) => tag.includes('waterfront') || tag.includes('harbor') || tag.includes('river'))) {
    return 'it lines up with the scenic waterside places your profile keeps leaning toward';
  }

  if (normalizedTags.some((tag) => tag.includes('coffee') || tag.includes('cafe') || tag.includes('easy pause'))) {
    return 'it fits the slower coffee-stop pattern showing up in your recommendations';
  }

  if (normalizedTags.some((tag) => tag.includes('museum') || tag.includes('gallery') || tag.includes('culture') || tag.includes('thoughtful stop'))) {
    return 'it overlaps with the culture-heavy places that keep matching your taste';
  }

  if (normalizedTags.some((tag) => tag.includes('green reset') || tag.includes('open air') || tag.includes('short walk')) || normalizedCategory.includes('park')) {
    return 'it matches the calmer outdoor resets that keep surfacing in your feed';
  }

  if (place.bestTime) {
    return `it fits your current taste profile, especially for ${place.bestTime} plans`;
  }

  if (normalizedCategory) {
    return `it keeps ranking well against your current taste profile for ${normalizedCategory} places`;
  }

  return 'it keeps ranking well against the places and signals already shaping your profile';
}

function mapPlaceToCardData(place: Place, index = 0): PlaceCardData {
  const [city, country] = place.location.split(',').map((part) => part.trim());
  const followedTravelerAvatars = SIMILAR_TRAVELERS.slice(0, 2)
    .filter((traveler) =>
      traveler.travelHistory.some((trip) => (trip.places ?? []).some((savedPlace) => savedPlace.id === place.id)),
    )
    .map((traveler) => traveler.avatar);

  return {
    id: place.id,
    name: place.name,
    city: city ?? place.location,
    country: country ?? '',
    category: place.category ?? 'recommended spot',
    imageUrl: place.image,
    rating: [4.8, 4.7, 4.6][index % 3],
    priceLevel: getPriceLevel(place),
    hook: place.hook ?? place.description,
    vibeTags: place.tags.slice(0, 3).map((tag) => tag.replace(/-/g, ' ')),
    attitudeLabel: getDisplayAttitudeLabel(place) ?? undefined,
    matchScore: place.similarityStat,
    similarityPercentage: place.similarityStat,
    recommendationReason: place.recommendationReason ?? buildPlaceRecommendationReason(place),
    bestTime: place.bestTime,
    visitedByFollowingAvatars: followedTravelerAvatars,
  };
}

function getPlaceInteractionTargetId(place: Place) {
  return place.momentId ?? place.id;
}

function getPlaceInteractionTargetType(place: Place): 'MOMENT' | 'PLACE' {
  return place.momentId ? 'MOMENT' : 'PLACE';
}

function getPlaceInteractionPayload(place: Place) {
  return {
    targetType: getPlaceInteractionTargetType(place),
    targetId: getPlaceInteractionTargetId(place),
    receiverUserId: place.ownerUserId,
    momentId: place.momentId,
  };
}

function buildAuthenticatedUserDraft(payload?: { id?: string; name?: string; username?: string; email?: string }): User {
  const displayName = payload?.name?.trim() || payload?.username || payload?.email?.split('@')[0] || 'Traveler';
  return {
    id: payload?.id || 'auth-user',
    username: payload?.username || payload?.email?.split('@')[0] || 'traveler',
    displayName,
    bio: '',
    avatar: getAvatarFallbackUrl(displayName),
    badges: [],
    flags: [],
    stats: {
      countries: 0,
      cities: 0,
      trips: 0,
    },
    travelHistory: [],
  };
}

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [currentScreen, setCurrentScreen] = useState<Screen>('onboarding');
  const [onboardingEntryMode, setOnboardingEntryMode] = useState<'invite' | 'preferences'>('invite');
  const [user, setUser] = useState<User>(MOCK_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReturnScreen, setAuthReturnScreen] = useState<Screen>('discover-places');
  const [authPrompt, setAuthPrompt] = useState('Log in to keep your travel graph synced.');
  const pendingAuthActionRef = useRef<null | (() => void)>(null);
  const isGoogleScriptLoadedRef = useRef(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isInviteValid, setIsInviteValid] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<Interest[]>([]);
  const [selectedVibe, setSelectedVibe] = useState<Vibe | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<User | null>(null);
  const [isTravelerProfileLoading, setIsTravelerProfileLoading] = useState(false);
  const [placeTravelerMoments, setPlaceTravelerMoments] = useState<Array<{
    id: string;
    travelerUsername: string;
    travelerAvatar: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }>>([]);
  const [placeFallbackTravelers, setPlaceFallbackTravelers] = useState<User[]>([]);
  const [relatedPlaces, setRelatedPlaces] = useState<Array<{ id: string; name: string; imageUrl: string }>>([]);
  const [placeDetailInteraction, setPlaceDetailInteraction] = useState({
    isSaved: false,
    isBeenThere: false,
    isVibed: false,
  });
  const [bookmarkedPlaceIds, setBookmarkedPlaceIds] = useState<string[]>([]);
  const [bookmarkedPlaces, setBookmarkedPlaces] = useState<Place[]>([]);
  const [dismissedPlaceIds, setDismissedPlaceIds] = useState<string[]>([]);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocationOption[]>(INITIAL_SAVED_LOCATIONS);
  const [activeLocationId, setActiveLocationId] = useState<string>(INITIAL_SAVED_LOCATIONS[0].id);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [deviceLocationPermission, setDeviceLocationPermission] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown');
  const hasRequestedDeviceLocationRef = useRef(false);
  const [discoveryPlaces, setDiscoveryPlaces] = useState<Place[]>([]);
  const [discoverySearchInput, setDiscoverySearchInput] = useState('');
  const [discoverySearchQuery, setDiscoverySearchQuery] = useState('');
  const [discoveryEvents, setDiscoveryEvents] = useState<EventItem[]>([]);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [vibedEventIds, setVibedEventIds] = useState<string[]>([]);
  const [sharedEventIds, setSharedEventIds] = useState<string[]>([]);
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const [discoveryHasMore, setDiscoveryHasMore] = useState(true);
  const [isDiscoveryPlacesLoading, setIsDiscoveryPlacesLoading] = useState(false);
  const [isDiscoveryPlacesLoadingMore, setIsDiscoveryPlacesLoadingMore] = useState(false);
  const [isDiscoveryPlacesRefreshing, setIsDiscoveryPlacesRefreshing] = useState(false);
  const [isDiscoveryPlacesError, setIsDiscoveryPlacesError] = useState(false);
  const [isDiscoveryEventsLoading, setIsDiscoveryEventsLoading] = useState(false);
  const [isDiscoveryEventsError, setIsDiscoveryEventsError] = useState(false);
  const [isFloatingNavHidden, setIsFloatingNavHidden] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<{ label: string; places: Place[] } | null>(null);
  const [customCollections, setCustomCollections] = useState<{ label: string; places: Place[] }[]>([]);
  const [myMoments, setMyMoments] = useState<Array<{ id: string; placeId: string }>>([]);
  const [editableMomentPlace, setEditableMomentPlace] = useState<Place | null>(null);
  const [editableMomentId, setEditableMomentId] = useState<string | null>(null);
  const [createMomentInitialPlace, setCreateMomentInitialPlace] = useState<Place | null>(null);
  const [createMomentInitialVisitedDate, setCreateMomentInitialVisitedDate] = useState<string>('');
  const [createMomentReturnScreen, setCreateMomentReturnScreen] = useState<Screen>('discover-places');
  const previousScreenRef = useRef<Screen>('onboarding');
  const screenScrollPositionsRef = useRef<Partial<Record<Screen, number>>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousScreen = previousScreenRef.current;
    screenScrollPositionsRef.current[previousScreen] = window.scrollY;

    const shouldRestorePreviousPosition =
      currentScreen === 'discover-places' ||
      currentScreen === 'discover-travelers' ||
      currentScreen === 'bookmarks';

    const targetScrollTop = shouldRestorePreviousPosition
      ? (screenScrollPositionsRef.current[currentScreen] ?? 0)
      : 0;

    const applyScroll = () => {
      window.scrollTo({ top: targetScrollTop, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = targetScrollTop;
      document.body.scrollTop = targetScrollTop;
    };

    const frameId = window.requestAnimationFrame(applyScroll);
    const timeoutId = window.setTimeout(applyScroll, 60);
    previousScreenRef.current = currentScreen;

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [
    currentScreen,
    selectedPlace?.id,
    selectedEvent?.id,
    selectedTraveler?.id,
    selectedCollection?.label,
    editableMomentId,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDiscoverySearchQuery(discoverySearchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [discoverySearchInput]);

  useEffect(() => {
    if (currentScreen !== 'discover-places' && currentScreen !== 'place-detail') {
      return;
    }

    if (deviceLocationPermission !== 'unknown' || hasRequestedDeviceLocationRef.current) {
      return;
    }

    requestDeviceLocation();
  }, [currentScreen, deviceLocationPermission]);

  // Handle invite submit
  const handleInviteSubmit = () => {
    if (inviteCode.toUpperCase() === 'VIBE2026') {
      setIsInviteValid(true);
    }
  };

  // Handle onboarding completion
  const completeOnboarding = () => {
    if (isAuthenticated) {
      void api.savePreferences({
        selectedInterests,
        selectedVibe,
        skippedPreferences: selectedInterests.length === 0 && !selectedVibe,
        onboardingCompleted: true,
      });
    }
    setOnboardingEntryMode('invite');
    setCurrentScreen('discover-places');
  };

  const showActionToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => {
      setActionToast((current) => (current === message ? null : current));
    }, 1800);
  };

  const requestDeviceLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setDeviceLocationPermission('unsupported');
      return;
    }

    hasRequestedDeviceLocationRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeviceLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setDeviceLocationPermission('granted');
      },
      () => {
        setDeviceLocationPermission('denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  };

  const refreshOwnProfile = async () => {
    try {
      const [profileResponse, bookmarksResponse] = await Promise.all([
        api.getProfileMe(),
        api.getBookmarks().catch(() => ({ bookmarks: [] as any[] })),
      ]);
      const response = profileResponse;
      setUser(response.user as User);
      setCustomCollections(
        response.collections.map((collection) => ({
          label: collection.label,
          places: collection.places as Place[],
        })),
      );
      setMyMoments(
        response.moments.map((moment) => ({
          id: String(moment.id),
          placeId: String(moment.placeId),
        })),
      );
      setBookmarkedPlaces(bookmarksResponse.bookmarks as Place[]);
    } catch {
      showActionToast('Could not sync profile right now');
    }
  };

  const openAuthGate = (message: string, mode: 'login' | 'register' = 'login', action?: () => void) => {
    pendingAuthActionRef.current = action ?? null;
    setAuthPrompt(message);
    setAuthReturnScreen(currentScreen === 'login' || currentScreen === 'register' ? 'discover-places' : currentScreen);
    setCurrentScreen(mode);
  };

  const resetCreateMomentDraft = () => {
    setCreateMomentInitialPlace(null);
    setCreateMomentInitialVisitedDate('');
    setCreateMomentReturnScreen('discover-places');
  };

  const openTravelerProfile = async (traveler: User) => {
    setSelectedTraveler(traveler);
    setCurrentScreen('traveler-profile');

    if (!isAuthenticated) return;

    setIsTravelerProfileLoading(true);
    try {
      const response = await api.getTravelerProfile(traveler.id);
      setSelectedTraveler(response.traveler as User);
    } catch {
      showActionToast('Could not load the latest traveler details');
    } finally {
      setIsTravelerProfileLoading(false);
    }
  };

  const syncBookmarkState = async (place: Place, nextActive: boolean, options?: { dismissAfterSave?: boolean; toast?: string }) => {
    if (!isAuthenticated) {
      openAuthGate('Log in to save places to your bookmarks.', 'login', () => {
        void syncBookmarkState(place, nextActive, options);
      });
      return false;
    }

    try {
      if (nextActive) {
        const response = await api.bookmarkPlace({ placeId: place.id });
        setBookmarkedPlaceIds(response.bookmarkedPlaceIds);
        setBookmarkedPlaces((prev) => (prev.some((item) => item.id === place.id) ? prev : [place, ...prev]));

        if (options?.dismissAfterSave) {
          const dismissedResponse = await api.dismissPlace({ placeId: place.id, reason: 'saved_to_bookmarks' });
          setDismissedPlaceIds(dismissedResponse.dismissedPlaceIds);
        }

        showActionToast(options?.toast ?? 'Saved to bookmarks');
      } else {
        const response = await api.removeBookmarkPlace(place.id);
        setBookmarkedPlaceIds(response.bookmarkedPlaceIds);
        setBookmarkedPlaces((prev) => prev.filter((item) => item.id !== place.id));
        showActionToast('Removed save');
      }

      return true;
    } catch {
      showActionToast('Could not update bookmarks right now');
      return false;
    }
  };

  const completeAuth = async (payload?: { id?: string; name?: string; username?: string; email?: string }) => {
    setIsAuthenticated(true);
    setUser(buildAuthenticatedUserDraft(payload));

    try {
      await refreshOwnProfile();
    } catch {
      // refreshOwnProfile already handles the user-facing toast
    }

    const pendingAction = pendingAuthActionRef.current;
    pendingAuthActionRef.current = null;

    if (pendingAction) {
      pendingAction();
      return;
    }

    setCurrentScreen(authReturnScreen);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!['profile', 'edit-profile', 'edit-moment', 'add-collection'].includes(currentScreen)) return;
    void refreshOwnProfile();
  }, [isAuthenticated, currentScreen]);

  useEffect(() => {
    if (!googleClientId || typeof window === 'undefined') return;
    if (window.google?.accounts?.id) {
      isGoogleScriptLoadedRef.current = true;
      return;
    }

    const existingScript = document.querySelector('script[data-google-identity="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        isGoogleScriptLoadedRef.current = true;
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => {
      isGoogleScriptLoadedRef.current = true;
    };
    document.head.appendChild(script);
  }, [googleClientId]);

  const continueWithGoogle = async (idToken: string) => {
    if (!googleClientId) {
      throw new Error('Google sign-in is not configured yet.');
    }

    if (!idToken) {
      throw new Error('Google did not return a sign-in credential.');
    }

    if (!window.google?.accounts?.id && !isGoogleScriptLoadedRef.current) {
      throw new Error('Google sign-in is still loading. Try again in a moment.');
    }

    return api.googleAuth({ idToken });
  };

  const loadDiscoveryPlaces = async (
    page: number,
    mode: 'reset' | 'append' = 'reset',
    options?: { refresh?: boolean },
  ) => {
    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;
    const isRefresh = Boolean(options?.refresh) && mode === 'reset';

    if (mode === 'reset' && !isRefresh) {
      setIsDiscoveryPlacesLoading(true);
    } else if (mode === 'append') {
      setIsDiscoveryPlacesLoadingMore(true);
    } else if (isRefresh) {
      setIsDiscoveryPlacesRefreshing(true);
    }

    try {
      setIsDiscoveryPlacesError(false);
      const response = await api.getDiscoveryPlaces(
        activeLocation.label,
        activeLocation.type,
        {
          selectedInterests,
          selectedVibe,
        },
        {
          page,
          limit: 10,
          refresh: options?.refresh,
          query: discoverySearchQuery,
        },
      );

      const nextPlaces = response.places as Place[];
      setDiscoveryPlaces((prev) => (
        mode === 'append'
          ? [...prev, ...nextPlaces.filter((place) => !prev.some((item) => item.id === place.id))]
          : nextPlaces
      ));
      setDiscoveryPage(response.pagination.page);
      setDiscoveryHasMore(response.pagination.hasMore);
    } catch {
      if (mode === 'reset') {
        setDiscoveryPlaces([]);
        setDiscoveryPage(1);
        setDiscoveryHasMore(false);
        setIsDiscoveryPlacesError(true);
      }
    } finally {
      if (mode === 'reset' && !isRefresh) {
        setIsDiscoveryPlacesLoading(false);
      } else if (mode === 'append') {
        setIsDiscoveryPlacesLoadingMore(false);
      } else if (isRefresh) {
        setIsDiscoveryPlacesRefreshing(false);
      }
    }
  };

  const loadDiscoveryEvents = async () => {
    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;

    setIsDiscoveryEventsLoading(true);
    try {
      setIsDiscoveryEventsError(false);
      const response = await api.getDiscoveryEvents(
        activeLocation.label,
        activeLocation.type,
        {
          selectedInterests,
          selectedVibe,
        },
        {
          page: 1,
          limit: 6,
          query: discoverySearchQuery,
        },
      );

      setDiscoveryEvents(response.events as EventItem[]);
    } catch {
      setDiscoveryEvents([]);
      setIsDiscoveryEventsError(true);
    } finally {
      setIsDiscoveryEventsLoading(false);
    }
  };

  useEffect(() => {
    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;

    setDiscoveryPage(1);
    setDiscoveryHasMore(true);
    setDiscoveryPlaces([]);
    setDiscoveryEvents([]);
    void loadDiscoveryPlaces(1, 'reset');
    void loadDiscoveryEvents();
  }, [activeLocationId, savedLocations, selectedInterests, selectedVibe, discoverySearchQuery]);

  useEffect(() => {
    if (!api.getStoredAuthToken()) return;

    void api.getAuthSession()
      .then(async (response) => {
        await completeAuth({
          id: response.user.id,
          name: response.user.displayName,
          username: response.user.username,
          email: response.user.email,
        });
      })
      .catch(() => {
        api.clearAuthToken();
      });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    void api.getPersonalizationSignals()
      .then((signals) => {
        setBookmarkedPlaceIds(signals.bookmarkedPlaceIds);
        setDismissedPlaceIds(signals.dismissedPlaceIds);
        if (signals.selectedInterests.length > 0) {
          setSelectedInterests(signals.selectedInterests as Interest[]);
        }
        if (signals.selectedVibe) {
          setSelectedVibe(signals.selectedVibe as Vibe);
        }
      })
      .catch(() => undefined);

    void api.getBookmarks()
      .then((response) => {
        setBookmarkedPlaces(response.bookmarks as Place[]);
      })
      .catch(() => undefined);

    void api.getSavedLocations()
      .then((response) => {
        const nextLocations = response.locations as SavedLocationOption[];
        if (nextLocations.length > 0) {
          setSavedLocations(nextLocations);
          if (response.activeLocationId) {
            setActiveLocationId(response.activeLocationId);
          }
        }
      })
      .catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    if (currentScreen !== 'place-detail' || !selectedPlace) {
      return;
    }

    void api.getPlaceDetails(selectedPlace.id)
      .then((response) => {
        setSelectedPlace(response.place as Place);
      })
      .catch(() => undefined);
  }, [currentScreen, selectedPlace?.id]);

  useEffect(() => {
    if (!isAuthenticated || currentScreen !== 'place-detail' || !selectedPlace) return;

    void api.getInteractionState({ placeIds: [selectedPlace.id] })
      .then((response) => {
        setPlaceDetailInteraction({
          isSaved: response.bookmarkedPlaceIds.includes(selectedPlace.id),
          isBeenThere: response.beenTherePlaceIds.includes(selectedPlace.id),
          isVibed: response.vibedPlaceIds.includes(selectedPlace.id),
        });
      })
      .catch(() => undefined);
  }, [isAuthenticated, currentScreen, selectedPlace?.id]);

  useEffect(() => {
    if (!isAuthenticated || currentScreen !== 'place-detail' || !selectedPlace) {
      setPlaceTravelerMoments([]);
      return;
    }

    void api.getPlaceTravelerMoments(selectedPlace.id)
      .then((response) => {
        setPlaceTravelerMoments(response.travelerMoments);
      })
      .catch(() => {
        setPlaceTravelerMoments([]);
      });
  }, [isAuthenticated, currentScreen, selectedPlace?.id]);

  useEffect(() => {
    if (!isAuthenticated || currentScreen !== 'place-detail') {
      setPlaceFallbackTravelers([]);
      return;
    }

    void api.getTravelerDiscovery()
      .then((response) => {
        const combined = [...(response.similarTravelers as User[]), ...(response.followedTravelers as User[])];
        const deduped = combined.filter(
          (traveler, index, list) => list.findIndex((item) => item.id === traveler.id) === index,
        );
        setPlaceFallbackTravelers(deduped.slice(0, 8));
      })
      .catch(() => {
        setPlaceFallbackTravelers([]);
      });
  }, [isAuthenticated, currentScreen, selectedPlace?.id]);

  useEffect(() => {
    if (!isAuthenticated || currentScreen !== 'place-detail' || !selectedPlace) {
      setRelatedPlaces([]);
      return;
    }

    void api.getRelatedPlaces(selectedPlace.id)
      .then((response) => {
        setRelatedPlaces(response.places);
      })
      .catch(() => {
        setRelatedPlaces([]);
      });
  }, [isAuthenticated, currentScreen, selectedPlace?.id]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'onboarding':
        return (
          <Onboarding 
            entryMode={onboardingEntryMode}
            inviteCode={inviteCode}
            setInviteCode={setInviteCode}
            isInviteValid={isInviteValid}
            onInviteSubmit={handleInviteSubmit}
            selectedInterests={selectedInterests}
            setSelectedInterests={setSelectedInterests}
            selectedVibe={selectedVibe}
            setSelectedVibe={setSelectedVibe}
            onComplete={completeOnboarding}
          />
        );
      case 'login':
        return (
          <LoginScreen
            prompt={authPrompt}
            onBack={() => setCurrentScreen(authReturnScreen)}
            onOpenRegister={() => setCurrentScreen('register')}
            googleClientId={googleClientId}
            onGoogleAuth={continueWithGoogle}
            onSuccess={(payload) => completeAuth(payload)}
          />
        );
      case 'register':
        return (
          <RegisterScreen
            prompt={authPrompt}
            onBack={() => setCurrentScreen(authReturnScreen)}
            onOpenLogin={() => setCurrentScreen('login')}
            googleClientId={googleClientId}
            onGoogleAuth={continueWithGoogle}
            onSuccess={(payload) => completeAuth(payload)}
          />
        );
      case 'profile':
        return (
          <Profile
            user={user}
            bookmarkedPlaces={bookmarkedPlaces}
            onNavigate={(s) => setCurrentScreen(s)}
            onSavePlace={(placeToSave, nextActive) => syncBookmarkState(placeToSave, nextActive)}
            onSelectPlace={(p) => {
              setSelectedPlace(p);
              setCurrentScreen('place-detail');
            }}
            onOpenCollection={(collection) => {
              setSelectedCollection(collection);
              setCurrentScreen('collection-detail');
            }}
            customCollections={customCollections}
            onEditProfile={() => setCurrentScreen('edit-profile')}
            onEditMoment={(place) => {
              const momentId = myMoments.find((moment) => moment.placeId === place.id)?.id ?? null;
              setEditableMomentPlace(place);
              setEditableMomentId(momentId);
              if (!momentId) {
                showActionToast('Moment data is still syncing');
                return;
              }
              setCurrentScreen('edit-moment');
            }}
          />
        );
      case 'notifications':
        return (
          <NotificationsScreen
            onBack={() => setCurrentScreen('discover-places')}
            onOpenPlace={(place) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open places from your notifications.', 'login', () => {
                  setSelectedPlace(place);
                  setCurrentScreen('place-detail');
                });
                return;
              }
              setSelectedPlace(place);
              setCurrentScreen('place-detail');
            }}
            onOpenTraveler={(traveler) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open traveler profiles from notifications.', 'login', () => {
                  void openTravelerProfile(traveler);
                });
                return;
              }
              void openTravelerProfile(traveler);
            }}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            user={user}
            onBack={() => setCurrentScreen('profile')}
            onOpenSection={(screen) => setCurrentScreen(screen)}
            onOpenPreferences={() => {
              setOnboardingEntryMode('preferences');
              setCurrentScreen('onboarding');
            }}
            onLogout={async () => {
              await api.logout().catch(() => undefined);
              setIsAuthenticated(false);
              showActionToast('Logged out');
              setCurrentScreen('discover-places');
            }}
          />
        );
      case 'settings-account':
        return <AccountSettingsScreen user={user} onBack={() => setCurrentScreen('settings')} />;
      case 'settings-notifications':
        return <NotificationSettingsScreen onBack={() => setCurrentScreen('settings')} />;
      case 'settings-privacy':
        return <PrivacySettingsScreen onBack={() => setCurrentScreen('settings')} />;
      case 'support':
        return <SupportScreen onBack={() => setCurrentScreen('settings')} />;
      case 'add-collection':
        return (
          <AddCollectionScreen
            moments={user.travelHistory.flatMap((history) => history.places || [])}
            onBack={() => setCurrentScreen('profile')}
            onCreateCollection={async (collection) => {
              const response = await api.createCollection({
                label: collection.label,
                placeIds: collection.places.map((place) => place.id),
              });
              const nextCollection = {
                label: response.collection.label,
                places: response.collection.places as Place[],
              };
              setCustomCollections((prev) => [...prev, nextCollection]);
              setSelectedCollection(nextCollection);
              await refreshOwnProfile();
              showActionToast('Collection created');
              setCurrentScreen('collection-detail');
            }}
          />
        );
      case 'edit-profile':
        return (
          <EditProfileScreen
            user={user}
            onBack={() => setCurrentScreen('profile')}
            onSave={async (payload) => {
              await api.updateProfile(payload);
              await refreshOwnProfile();
              showActionToast('Profile updated');
              setCurrentScreen('profile');
            }}
          />
        );
      case 'edit-moment':
        return editableMomentPlace && editableMomentId ? (
          <EditMomentScreen
            place={editableMomentPlace}
            onBack={() => setCurrentScreen('profile')}
            onSave={async (payload) => {
              await api.updateMoment(editableMomentId, payload);
              await refreshOwnProfile();
              showActionToast('Moment updated');
              setCurrentScreen('profile');
            }}
          />
        ) : null;
      case 'bookmarks':
        return (
          <BookmarksScreen
            bookmarkedPlaces={bookmarkedPlaces}
            onSelectPlace={(place) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open saved places and interact with them.', 'login', () => {
                  setSelectedPlace(place);
                  setCurrentScreen('place-detail');
                });
                return;
              }
              setSelectedPlace(place);
              setCurrentScreen('place-detail');
            }}
          />
        );
      case 'create-moment':
        return (
          <CreateMomentScreen
            initialPlace={createMomentInitialPlace}
            initialVisitedDate={createMomentInitialVisitedDate}
            onBack={() => {
              const nextScreen = createMomentReturnScreen;
              resetCreateMomentDraft();
              setCurrentScreen(nextScreen);
            }}
            onCreateMoment={async (payload) => {
              await api.createMoment(payload);
              await refreshOwnProfile();
              resetCreateMomentDraft();
              showActionToast('Moment saved');
              setCurrentScreen('profile');
            }}
          />
        );
      case 'discover-places':
        return (
          <PlaceDiscovery 
            selectedInterests={selectedInterests}
            selectedVibe={selectedVibe}
            activeLocation={savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0]}
            savedLocations={savedLocations}
            events={discoveryEvents}
            searchInput={discoverySearchInput}
            searchQuery={discoverySearchQuery}
            onOpenPreferences={() => {
              setOnboardingEntryMode('preferences');
              setCurrentScreen('onboarding');
            }}
            onOpenLocationManager={() => setCurrentScreen('location-search')}
            onOpenNotifications={() => setCurrentScreen('notifications')}
            onSearchInputChange={setDiscoverySearchInput}
            onClearSearch={() => {
              setDiscoverySearchInput('');
              setDiscoverySearchQuery('');
            }}
            onSelectLocation={(locationId) => {
              setActiveLocationId(locationId);
              if (isAuthenticated) {
                void api.setDefaultSavedLocation(locationId).catch(() => undefined);
              }
            }}
            onLocationSheetVisibilityChange={setIsFloatingNavHidden}
            visiblePlaces={discoveryPlaces.filter((place) => !dismissedPlaceIds.includes(place.id))}
            isLoading={isDiscoveryPlacesLoading}
            isEventsLoading={isDiscoveryEventsLoading}
            isLoadingMore={isDiscoveryPlacesLoadingMore}
            isRefreshing={isDiscoveryPlacesRefreshing}
            hasMore={discoveryHasMore}
            hasError={isDiscoveryPlacesError}
            hasEventsError={isDiscoveryEventsError}
            bookmarkedPlaceIds={bookmarkedPlaceIds}
            onRefresh={() => {
              if (isDiscoveryPlacesLoading || isDiscoveryPlacesLoadingMore || isDiscoveryPlacesRefreshing) return;
              void loadDiscoveryPlaces(1, 'reset', { refresh: true });
              void loadDiscoveryEvents();
            }}
            onLoadMore={() => {
              if (isDiscoveryPlacesLoading || isDiscoveryPlacesLoadingMore || isDiscoveryPlacesRefreshing || !discoveryHasMore) return;
              void loadDiscoveryPlaces(discoveryPage + 1, 'append');
            }}
            onBookmarkPlace={(place) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to save places to your bookmarks.', 'login', () => {
                  void syncBookmarkState(place, true, { dismissAfterSave: true });
                });
                return;
              }
              void syncBookmarkState(place, true, { dismissAfterSave: true });
            }}
            onDismissPlace={(place) => {
              if (!isAuthenticated) {
                openAuthGate('Log in so we can learn what not to recommend for you.', 'login', () => {
                  setDismissedPlaceIds((prev) => (prev.includes(place.id) ? prev : [...prev, place.id]));
                  showActionToast('Removed from recommendations');
                });
                return;
              }
              setDismissedPlaceIds((prev) => (prev.includes(place.id) ? prev : [...prev, place.id]));
              void api.dismissPlace({ placeId: place.id, reason: 'manual_hide' }).catch(() => undefined);
              showActionToast('Removed from recommendations');
            }}
            onSelectPlace={(p) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open place details and keep your discoveries synced.', 'login', () => {
                  setSelectedPlace(p);
                  setCurrentScreen('place-detail');
                });
                return;
              }
              setSelectedPlace(p);
              setCurrentScreen('place-detail');
            }}
            onSelectEvent={(event) => {
              setSelectedEvent(event);
              setCurrentScreen('event-detail');
            }}
          />
        );
      case 'location-search':
        return (
          <LocationSearchScreen
            savedLocations={savedLocations}
            onBack={() => setCurrentScreen('discover-places')}
            onAddLocation={(location) => {
              if (isAuthenticated) {
                void api.addSavedLocation({
                  label: location.label,
                  type: location.type,
                  googlePlaceId: location.googlePlaceId,
                  isDefault: true,
                })
                  .then((response) => {
                    setSavedLocations(response.locations as SavedLocationOption[]);
                    if (response.activeLocationId) {
                      setActiveLocationId(response.activeLocationId);
                    }
                    setCurrentScreen('discover-places');
                    showActionToast(`${location.label} added`);
                  })
                  .catch(() => {
                    showActionToast('Could not save location right now');
                  });
                return;
              }

              setSavedLocations((prev) => {
                if (prev.some((item) => item.label.toLowerCase() === location.label.toLowerCase())) {
                  return prev;
                }
                return [...prev, location];
              });
              setActiveLocationId(location.id);
              setCurrentScreen('discover-places');
              showActionToast(`${location.label} added`);
            }}
          />
        );
      case 'discover-travelers':
        return (
          <TravelerDiscovery
            isAuthenticated={isAuthenticated}
            onRequireAuth={(message, action) => openAuthGate(message, 'login', action)}
            onSelectPlace={(p) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open places shared by travelers you follow.', 'login', () => {
                  setSelectedPlace(p);
                  setCurrentScreen('place-detail');
                });
                return;
              }
              setSelectedPlace(p);
              setCurrentScreen('place-detail');
            }}
            onSelectTraveler={(t) => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open traveler profiles and follow their vibe.', 'login', () => {
                  void openTravelerProfile(t);
                });
                return;
              }
              void openTravelerProfile(t);
            }}
          />
        );
      case 'traveler-profile':
        return isTravelerProfileLoading ? (
          <div className="min-h-screen bg-zinc-950 px-4 pb-24 pt-16 text-white">
            <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
              <div className="text-lg font-black text-white">Loading traveler profile...</div>
              <p className="mt-2 text-sm font-medium text-white/55">
                Pulling the latest moments, stats, and overlap from the backend.
              </p>
            </div>
          </div>
        ) : selectedTraveler ? (
          <TravelerProfile 
            user={selectedTraveler} 
            onBack={() => setCurrentScreen('discover-travelers')} 
            onExploreMoreTravelers={() => {
              setCurrentScreen('discover-travelers');
            }}
            onSavePlace={(placeToSave, nextActive) => syncBookmarkState(placeToSave, nextActive)}
            onSelectPlace={(p) => {
              setSelectedPlace(p);
              setCurrentScreen('place-detail');
            }}
            onOpenCollection={(collection) => {
              setSelectedCollection(collection);
              setCurrentScreen('collection-detail');
            }}
          />
        ) : null;
      case 'collection-detail':
        return selectedCollection ? (
          <CollectionDetailScreen
            collection={selectedCollection}
            onBack={() => setCurrentScreen('traveler-profile')}
            onSelectPlace={(place) => {
              setSelectedPlace(place);
              setCurrentScreen('place-detail');
            }}
          />
        ) : null;
      case 'place-detail':
        return selectedPlace ? (
          <PlaceDetail 
            place={selectedPlace} 
            savedLocations={savedLocations}
            activeLocationId={activeLocationId}
            deviceLocation={deviceLocation}
            deviceLocationPermission={deviceLocationPermission}
            relatedPlaces={relatedPlaces}
            travelerMoments={placeTravelerMoments}
            fallbackTravelers={placeFallbackTravelers}
            onBack={() => setCurrentScreen('discover-places')} 
            interactionState={placeDetailInteraction}
            onSavePlace={async (placeToSave, nextActive) => {
              const updated = await syncBookmarkState(placeToSave, nextActive);
              if (updated) {
                setPlaceDetailInteraction((prev) => ({ ...prev, isSaved: nextActive }));
              }
              return updated;
            }}
            onMarkBeenThere={async () => {
              setPlaceDetailInteraction((prev) => ({ ...prev, isBeenThere: true }));
              setCreateMomentInitialPlace(selectedPlace);
              setCreateMomentInitialVisitedDate(new Date().toISOString().split('T')[0]);
              setCreateMomentReturnScreen('place-detail');
              setCurrentScreen('create-moment');
            }}
            onToggleVibe={async () => {
              try {
                const response = await api.toggleVibin({ targetType: 'PLACE', targetId: selectedPlace.id });
                setPlaceDetailInteraction((prev) => ({ ...prev, isVibed: response.active }));
                showActionToast(response.active ? 'Sent vibin' : 'Removed vibin');
              } catch {
                showActionToast('Could not update vibin right now');
              }
            }}
            onRequestDeviceLocation={requestDeviceLocation}
            onExploreTravelers={() => {
              setCurrentScreen('discover-travelers');
            }}
            onExplorePlaces={() => {
              setCurrentScreen('discover-places');
            }}
            onSelectPlace={(p) => {
              void api.getPlaceDetails(p.id)
                .then((response) => {
                  setSelectedPlace(response.place as Place);
                  setCurrentScreen('place-detail');
                })
                .catch(() => {
                  setSelectedPlace(p);
                  setCurrentScreen('place-detail');
                });
            }}
            onSelectTraveler={(travelerId) => {
              const traveler = placeFallbackTravelers.find((item) => item.id === travelerId);
              if (traveler) {
                void openTravelerProfile(traveler);
              } else {
                setCurrentScreen('discover-travelers');
              }
            }}
          />
        ) : null;
      case 'event-detail':
        return selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            isSaved={savedEventIds.includes(selectedEvent.id)}
            isVibed={vibedEventIds.includes(selectedEvent.id)}
            onBack={() => setCurrentScreen('discover-places')}
            onSave={() => {
              const isActive = savedEventIds.includes(selectedEvent.id);
              setSavedEventIds((prev) => isActive ? prev.filter((id) => id !== selectedEvent.id) : [...prev, selectedEvent.id]);
              showActionToast(isActive ? 'Removed save' : 'Saved event');
            }}
            onShare={() => {
              const isActive = sharedEventIds.includes(selectedEvent.id);
              setSharedEventIds((prev) => isActive ? prev.filter((id) => id !== selectedEvent.id) : [...prev, selectedEvent.id]);
              showActionToast(isActive ? 'Removed share' : 'Shared event');
            }}
            onVibe={() => {
              const isActive = vibedEventIds.includes(selectedEvent.id);
              setVibedEventIds((prev) => isActive ? prev.filter((id) => id !== selectedEvent.id) : [...prev, selectedEvent.id]);
              showActionToast(isActive ? 'Removed vibin' : 'Sent vibin');
            }}
          />
        ) : null;
      case 'public-profile':
        return <PublicProfile user={user} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-zinc-950 relative overflow-hidden shadow-2xl border-x border-white/8">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pb-24 min-h-screen"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>

      {currentScreen !== 'onboarding' && currentScreen !== 'public-profile' && currentScreen !== 'place-detail' && currentScreen !== 'event-detail' && currentScreen !== 'traveler-profile' && currentScreen !== 'location-search' && currentScreen !== 'collection-detail' && currentScreen !== 'create-moment' && currentScreen !== 'login' && currentScreen !== 'register' && currentScreen !== 'settings' && currentScreen !== 'settings-account' && currentScreen !== 'settings-notifications' && currentScreen !== 'settings-privacy' && currentScreen !== 'support' && currentScreen !== 'add-collection' && currentScreen !== 'notifications' && currentScreen !== 'edit-profile' && currentScreen !== 'edit-moment' && !isFloatingNavHidden && (
        <nav className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[24rem] -translate-x-1/2 items-center justify-between rounded-full border border-white/10 bg-black/88 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <button 
            onClick={() => setCurrentScreen('discover-places')}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              currentScreen === 'discover-places' ? 'bg-white text-black scale-105' : 'text-white/55'
            }`}
          >
            <Compass size={22} strokeWidth={currentScreen === 'discover-places' ? 2.5 : 2} />
          </button>
          <button 
            onClick={() => setCurrentScreen('discover-travelers')}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              currentScreen === 'discover-travelers' ? 'bg-white text-black scale-105' : 'text-white/55'
            }`}
          >
            <Users size={22} strokeWidth={currentScreen === 'discover-travelers' ? 2.5 : 2} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                openAuthGate('Create an account to add moments and trips to your own profile.', 'register', () => {
                  resetCreateMomentDraft();
                  setCurrentScreen('create-moment');
                });
                return;
              }
              resetCreateMomentDraft();
              setCurrentScreen('create-moment');
            }}
            className="relative -my-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-zinc-950 bg-accent text-black shadow-[0_18px_40px_rgba(211,255,72,0.28)] transition hover:scale-105 active:scale-[0.98]"
            aria-label="Add moment or trip"
          >
            <Plus size={26} strokeWidth={2.8} />
          </button>
          <button 
            onClick={() => setCurrentScreen('bookmarks')}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              currentScreen === 'bookmarks' ? 'bg-white text-black scale-105' : 'text-white/55'
            }`}
          >
            <Bookmark size={22} strokeWidth={currentScreen === 'bookmarks' ? 2.5 : 2} />
            {bookmarkedPlaceIds.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-black">
                {bookmarkedPlaceIds.length}
              </span>
            ) : null}
          </button>
          <button 
            onClick={() => {
              if (!isAuthenticated) {
                openAuthGate('Log in to open your profile and manage your moments.', 'login', () => {
                  setCurrentScreen('profile');
                });
                return;
              }
              setCurrentScreen('profile');
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              currentScreen === 'profile' ? 'bg-white text-black scale-105' : 'text-white/55'
            }`}
          >
            <UserIcon size={26} strokeWidth={currentScreen === 'profile' ? 2.5 : 2} />
          </button>
        </nav>
      )}

      <AnimatePresence>
        {actionToast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-3rem)] max-w-xs -translate-x-1/2 rounded-full border border-white/10 bg-white px-4 py-3 text-center text-sm font-black text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
          >
            {actionToast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// --- ONBOARDING SCREEN ---
function Onboarding({ 
  entryMode,
  inviteCode,
  setInviteCode,
  isInviteValid,
  onInviteSubmit,
  selectedInterests,
  setSelectedInterests,
  selectedVibe,
  setSelectedVibe,
  onComplete 
}: any) {
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const [stage, setStage] = useState<'invite' | 'choice' | 'swipe'>(
    entryMode === 'preferences' ? 'swipe' : isInviteValid ? 'choice' : 'invite',
  );
  const [step, setStep] = useState<'interests' | 'vibes'>('interests');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  useEffect(() => {
    if (isInviteValid && stage === 'invite') {
      setStage('choice');
    }
  }, [isInviteValid, stage]);

  useEffect(() => {
    if (entryMode !== 'preferences') return;
    setStage('swipe');
    setStep('interests');
    setCurrentCardIndex(0);
  }, [entryMode]);

  const swipeSteps = {
    interests: [
      { id: 'cafe' as Interest, title: 'Cafe hopping', desc: 'good coffee and better neighborhood energy.', img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80' },
      { id: 'culture' as Interest, title: 'Culture spots', desc: 'museums, old streets, and places with a story.', img: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80' },
      { id: 'nature' as Interest, title: 'Nature days', desc: 'touch grass, reset the brain, keep the camera ready.', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80' },
      { id: 'party' as Interest, title: 'Nightlife', desc: 'city lights, loud rooms, and plans after midnight.', img: 'https://images.unsplash.com/photo-1514525253361-bee8718a74a2?auto=format&fit=crop&w=800&q=80' },
      { id: 'shopping' as Interest, title: 'Shopping breaks', desc: 'concept stores, hidden racks, and cute receipts.', img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80' },
      { id: 'adventure' as Interest, title: 'Spontaneous detours', desc: 'the unplanned stop that becomes the whole trip.', img: 'https://images.unsplash.com/photo-1533692328991-08159ff19fca?auto=format&fit=crop&w=800&q=80' },
    ],
    vibes: [
      { id: 'aesthetic' as Vibe, title: 'Aesthetic', desc: 'camera-roll worthy and low effort to love.', img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80' },
      { id: 'solo' as Vibe, title: 'Solo', desc: 'quiet, low-pressure wandering with no group chat chaos.', img: 'https://images.unsplash.com/photo-1501503060443-9e3b97922111?auto=format&fit=crop&w=800&q=80' },
      { id: 'spontaneous' as Vibe, title: 'Chaotic', desc: 'missed trains, good stories, zero regrets.', img: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80' },
      { id: 'luxury' as Vibe, title: 'Polished', desc: 'good taste, soft sheets, and not pretending otherwise.', img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80' },
      { id: 'budget' as Vibe, title: 'Budget', desc: 'great finds without burning the whole wallet.', img: 'https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=800&q=80' },
    ],
  };

  const currentCards = swipeSteps[step];
  const handleSwipe = (direction: 'right' | 'left', cardId: Interest | Vibe) => {
    const isRight = direction === 'right';

    if (isRight && step === 'interests') {
      setSelectedInterests((prev: Interest[]) =>
        prev.includes(cardId as Interest) ? prev : [...prev, cardId as Interest].slice(-3),
      );
    }

    if (isRight && step === 'vibes') {
      setSelectedVibe(cardId as Vibe);
    }

    if (currentCardIndex < currentCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
      return;
    }

    if (step === 'interests') {
      setStep('vibes');
      setCurrentCardIndex(0);
      return;
    }

    onComplete();
  };

  const startPreferenceFlow = () => {
    setStage('swipe');
    setStep('interests');
    setCurrentCardIndex(0);
  };

  if (stage === 'invite') {
    return (
      <div className="p-10 pt-32 flex flex-col h-screen bg-zinc-950 text-white">
        <div className="mb-16">
          <div className="w-14 h-14 bg-white/8 rounded-2xl mb-8 flex items-center justify-center shadow-lg border border-white/10">
            <Lock className="text-accent" size={28} />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tighter mb-6 leading-[0.9]">
            If you&apos;re here, <br />you know.
          </h1>
          <p className="text-white/60 text-xl font-medium leading-snug">
            Enter the code, then we&apos;ll decide how personalized your first feed should be.
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="INVITE CODE"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-white/10 bg-white/6 px-5 py-5 text-xl font-mono uppercase tracking-widest text-white outline-none transition-all focus:ring-2 focus:ring-white/10"
          />
          <button
            onClick={onInviteSubmit}
            disabled={!inviteCode}
            className="w-full btn-primary py-5 text-lg flex items-center justify-center gap-2"
          >
            Verify Access <ArrowRight size={20} />
          </button>
        </div>

        <p className="mt-auto text-center text-white/25 text-xs font-mono uppercase tracking-widest">
          Hint for the desperate: VIBE2026
        </p>
      </div>
    );
  }

  if (stage === 'choice') {
    return (
      <div className="relative min-h-screen bg-white">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"
            alt="Travel background"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/10" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col justify-end px-6 pb-10 pt-10">
          <div className="mb-6 text-white">
            <h1 className="text-4xl font-black leading-[0.92] tracking-[-0.05em]">
              Personalize your feed?
            </h1>
            <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-white/78">
              Choosing your preferences helps AI recommend places and people that feel more relevant to your vibe.
            </p>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={startPreferenceFlow}
              className="w-full btn-primary py-5 text-lg"
            >
              Choose preferences
            </button>

            <button
              type="button"
              onClick={onComplete}
              className="w-full rounded-xl bg-white/14 px-6 py-5 text-lg font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 active:scale-[0.98]"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-dark overflow-hidden flex flex-col">
      <div className="p-6 pt-12 flex flex-col gap-4 z-20">
        <div className="flex justify-between items-center">
          <div className="flex gap-1.5">
            {[0, 1].map((index) => (
              <div
                key={index}
                className={`h-1.5 w-12 rounded-full transition-all duration-500 ${
                  (step === 'interests' && index === 0) || step === 'vibes' ? 'bg-accent' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">
            {step === 'interests' ? 'Step 1 of 2' : 'Step 2 of 2'}
          </span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-white text-2xl font-black tracking-tight">
              {step === 'interests' ? 'Swipe what you always save.' : 'Pick the vibe that feels most like you.'}
            </h2>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">
              Swipe right to keep it. Left to skip.
            </p>
          </div>
          <button
            onClick={onComplete}
            className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors pb-1"
          >
            Skip setup
          </button>
        </div>
      </div>

      <div className="flex-1 relative px-4 pb-12 mt-4">
        <AnimatePresence mode="popLayout">
          {currentCards.slice(currentCardIndex, currentCardIndex + 2).reverse().map((card, index) => {
            const isTop = index === 1 || currentCards.slice(currentCardIndex, currentCardIndex + 2).length === 1;
            return (
              <SwipeCard
                key={`${step}-${card.id}`}
                card={card}
                isTop={isTop}
                onSwipe={(dir) => handleSwipe(dir, card.id)}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SwipeCard({ card, isTop, onSwipe }: { card: any, isTop: boolean, onSwipe: (dir: 'right' | 'left') => void, key?: string }) {
  const [exitX, setExitX] = useState(0);

  return (
    <motion.div
      style={{ x: exitX, zIndex: isTop ? 10 : 0 }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100) {
          setExitX(1000);
          onSwipe('right');
        } else if (info.offset.x < -100) {
          setExitX(-1000);
          onSwipe('left');
        }
      }}
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ 
        scale: isTop ? 1 : 0.95, 
        opacity: 1, 
        y: isTop ? 0 : 10,
        rotate: 0
      }}
      whileDrag={{ rotate: exitX > 0 ? 5 : -5 }}
      exit={{ x: exitX, opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      className="absolute inset-0 px-4 pb-12"
    >
      <div className="w-full h-full rounded-[2.5rem] overflow-hidden relative shadow-2xl border border-white/10">
        <img 
          src={card.img} 
          alt={card.title} 
          className="w-full h-full object-cover" 
          referrerPolicy="no-referrer"
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        {/* Content Overlay */}
        <div className="absolute bottom-0 left-0 w-full p-8 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="text-white text-4xl font-black tracking-tighter mb-2 leading-none">
              {card.title}
            </h3>
            <p className="text-white/70 text-lg font-medium leading-tight">
              {card.desc}
            </p>
          </motion.div>
        </div>

        {/* Swipe Indicators */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 pointer-events-none">
          <div className="p-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white/30">
            <ArrowRight size={24} className="rotate-180" />
          </div>
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 pointer-events-none">
          <div className="p-3 bg-accent/20 backdrop-blur-md rounded-full border border-accent/30 text-accent">
            <ArrowRight size={24} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LoginScreen({
  prompt,
  onBack,
  onOpenRegister,
  googleClientId,
  onGoogleAuth,
  onSuccess,
}: {
  prompt: string;
  onBack: () => void;
  onOpenRegister: () => void;
  googleClientId?: string;
  onGoogleAuth: (idToken: string) => Promise<{ user: { id: string; displayName?: string; username: string; email?: string } }>;
  onSuccess: (payload?: { id?: string; name?: string; username?: string; email?: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Log in</div>
        <div className="w-12" />
      </div>

      <div className="rounded-[2.5rem] border border-white/10 bg-black p-6 shadow-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Pick up where your taste graph left off.</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/55">{prompt}</p>
        </div>

        <GoogleIdentityButton
          clientId={googleClientId}
          text="continue_with"
          disabled={isSubmitting}
          onCredential={async (idToken) => {
            setIsSubmitting(true);
            setErrorMessage(null);
            try {
              const response = await onGoogleAuth(idToken);
              onSuccess({
                id: response.user.id,
                name: response.user.displayName,
                username: response.user.username,
                email: response.user.email,
              });
            } catch (error) {
              setErrorMessage(
                error instanceof ApiError
                  ? error.message
                  : error instanceof Error
                    ? error.message
                    : 'Could not continue with Google right now.',
              );
            } finally {
              setIsSubmitting(false);
            }
          }}
        />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">
              <Mail size={13} />
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">
              <KeyRound size={13} />
              Password
            </div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-[1.25rem] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={async () => {
            setIsSubmitting(true);
            setErrorMessage(null);
            try {
              const response = await api.login({ email, password });
              onSuccess({
                id: response.user.id,
                name: response.user.displayName,
                username: response.user.username,
                email: response.user.email || email,
              });
            } catch (error) {
              setErrorMessage(error instanceof ApiError ? error.message : 'Could not log in right now.');
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={!email || !password}
          className={`mt-5 w-full rounded-[1.4rem] px-5 py-4 text-sm font-black transition ${
            email && password ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
          }`}
        >
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </button>

        <div className="mt-5 text-center text-sm text-white/55">
          New here?{' '}
          <button type="button" onClick={onOpenRegister} className="font-black text-accent">
            Create account
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterScreen({
  prompt,
  onBack,
  onOpenLogin,
  googleClientId,
  onGoogleAuth,
  onSuccess,
}: {
  prompt: string;
  onBack: () => void;
  onOpenLogin: () => void;
  googleClientId?: string;
  onGoogleAuth: (idToken: string) => Promise<{ user: { id: string; displayName?: string; username: string; email?: string } }>;
  onSuccess: (payload?: { id?: string; name?: string; username?: string; email?: string }) => void;
}) {
  const [mode, setMode] = useState<'options' | 'manual'>('options');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Register</div>
        <div className="w-12" />
      </div>

      <div className="rounded-[2.5rem] border border-white/10 bg-black p-6 shadow-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Make your travel graph yours.</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/55">{prompt}</p>
        </div>

        <div className="space-y-3">
          <GoogleIdentityButton
            clientId={googleClientId}
            text="signup_with"
            disabled={isSubmitting}
            onCredential={async (idToken) => {
              setIsSubmitting(true);
              setErrorMessage(null);
              try {
                const response = await onGoogleAuth(idToken);
                onSuccess({
                  id: response.user.id,
                  name: response.user.displayName || 'Google traveler',
                  username: response.user.username,
                  email: response.user.email,
                });
              } catch (error) {
                setErrorMessage(
                  error instanceof ApiError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : 'Could not continue with Google right now.',
                );
              } finally {
                setIsSubmitting(false);
              }
            }}
          />

          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`w-full rounded-[1.4rem] border px-5 py-4 text-sm font-black transition ${
              mode === 'manual' ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-white/6 text-white hover:bg-white/8'
            }`}
          >
            Sign up manually
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="mt-5 space-y-4">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
            />

            {confirmPassword && !passwordsMatch ? (
              <div className="text-xs font-bold text-red-300">Passwords need to match.</div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-[1.25rem] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={async () => {
                setIsSubmitting(true);
                setErrorMessage(null);
                try {
                  const response = await api.register({ name, email, password });
                  onSuccess({
                    id: response.user.id,
                    name: response.user.displayName || name,
                    username: response.user.username,
                    email,
                  });
                } catch (error) {
                  setErrorMessage(error instanceof ApiError ? error.message : 'Could not create your account right now.');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={!name || !email || !passwordsMatch}
              className={`w-full rounded-[1.4rem] px-5 py-4 text-sm font-black transition ${
                name && email && passwordsMatch ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
              }`}
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        ) : null}

        <div className="mt-5 text-center text-sm text-white/55">
          Already have an account?{' '}
          <button type="button" onClick={onOpenLogin} className="font-black text-accent">
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationsScreen({
  onBack,
  onOpenPlace,
  onOpenTraveler,
}: {
  onBack: () => void;
  onOpenPlace: (place: Place) => void;
  onOpenTraveler: (traveler: User) => void;
}) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    api.getNotifications().then((response) => setNotifications(response.notifications));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Notifications</div>
        <button
          type="button"
          onClick={() => {
            if (unreadCount === 0) return;
            void api.markAllNotificationsRead()
              .then(() => {
                setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
              })
              .catch(() => undefined);
          }}
          className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
            unreadCount > 0 ? 'bg-white text-black' : 'text-white/30'
          }`}
        >
          Read all
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">What moved in your vibe graph.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Quick updates around places and people worth checking next.</p>
      </div>

      <div className="space-y-4">
        {notifications.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              void api.markNotificationRead(item.id).catch(() => undefined);
              setNotifications((current) =>
                current.map((notification) =>
                  notification.id === item.id
                    ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
                    : notification,
                ),
              );

              if (item.type === 'place' && item.place) {
                onOpenPlace(item.place);
                return;
              }

              if (item.traveler) {
                onOpenTraveler(item.traveler);
              }
            }}
            className={`w-full rounded-[24px] border p-4 text-left transition hover:bg-white/8 ${
              item.readAt ? 'border-white/10 bg-white/6' : 'border-accent/30 bg-accent/8'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10">
                <img
                  src={item.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => handleAvatarImageError(event, item.title)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {!item.readAt ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" /> : null}
                    <div className="text-sm font-black text-white">{item.title}</div>
                  </div>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{item.time}</span>
                </div>
                <div className="mt-2 text-sm font-medium leading-relaxed text-white/68">{item.body}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsScreen({
  user,
  onBack,
  onOpenSection,
  onOpenPreferences,
  onLogout,
}: {
  user: User;
  onBack: () => void;
  onOpenSection: (screen: 'settings-account' | 'settings-notifications' | 'settings-privacy' | 'support') => void;
  onOpenPreferences: () => void;
  onLogout: () => void;
}) {
  const sections = [
    {
      title: 'Account',
      screen: 'settings-account' as const,
      items: [
        { label: 'Profile details', description: user.username },
        { label: 'Email & sign in', description: 'Manage login method and account access' },
      ],
    },
    {
      title: 'Notifications',
      screen: 'settings-notifications' as const,
      items: [
        { label: 'Push notifications', description: 'Vibin, comments, follows, and recommendation updates' },
        { label: 'Email updates', description: 'Weekly recaps and important account alerts' },
      ],
    },
    {
      title: 'Privacy',
      screen: 'settings-privacy' as const,
      items: [
        { label: 'Profile visibility', description: 'Control who can view your profile and moments' },
        { label: 'Moment visibility', description: 'Choose default visibility for new moments and collections' },
      ],
    },
    {
      title: 'Help',
      screen: 'support' as const,
      items: [
        { label: 'Support', description: 'Help center, report an issue, and app info' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Settings</div>
        <div className="w-12" />
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Keep your profile simple.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Just the essentials for account, privacy, and notifications.</p>
      </div>

      <div className="space-y-6">
        <section>
          <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
            Personalization
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={onOpenPreferences}
              className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left transition hover:bg-white/8"
            >
              <div>
                <div className="text-sm font-black text-white">Travel preferences</div>
                <div className="mt-1 text-sm font-medium text-white/60">Update your interests and vibe to reshape discovery.</div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-white/35" />
            </button>
          </div>
        </section>

        {sections.map((section) => (
          <section key={section.title}>
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
              {section.title}
            </div>
            <div className="space-y-3">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onOpenSection(section.screen)}
                  className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left transition hover:bg-white/8"
                >
                  <div>
                    <div className="text-sm font-black text-white">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-white/60">{item.description}</div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-white/35" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-6 w-full rounded-[1.4rem] border border-white/10 bg-white/8 px-5 py-4 text-sm font-black text-white transition hover:bg-white/12"
      >
        Log out
      </button>
    </div>
  );
}

function AccountSettingsScreen({
  user,
  onBack,
}: {
  user: User;
  onBack: () => void;
}) {
  const [accountData, setAccountData] = useState<{
    profileDetails: { displayName?: string; username: string; bio: string };
    signIn: { email?: string; providers: string[] };
  } | null>(null);

  useEffect(() => {
    api.getAccountSettings().then(setAccountData);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Account</div>
        <div className="w-12" />
      </div>

      <div className="space-y-4">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Profile details</div>
          <div className="mt-3 text-sm font-black text-white">{accountData?.profileDetails.displayName ?? user.displayName ?? user.username}</div>
          <div className="mt-1 text-sm font-medium text-white/60">@{accountData?.profileDetails.username ?? user.username}</div>
          <div className="mt-1 text-sm font-medium text-white/60">{accountData?.profileDetails.bio ?? user.bio}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Email & sign in</div>
          <div className="mt-3 text-sm font-medium text-white/60">{accountData?.signIn.email ?? 'alex@vibecheck.app'}</div>
          <div className="mt-1 text-sm font-medium text-white/60">Connected providers: {(accountData?.signIn.providers ?? ['manual', 'google']).join(', ')}</div>
        </div>
      </div>
    </div>
  );
}

function NotificationSettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [recommendationEnabled, setRecommendationEnabled] = useState(true);

  useEffect(() => {
    api.getNotificationSettings().then((settings) => {
      setPushEnabled(settings.pushEnabled);
      setEmailEnabled(settings.emailEnabled);
      setRecommendationEnabled(settings.recommendationEnabled);
    });
  }, []);

  const ToggleRow = ({
    label,
    description,
    checked,
    onToggle,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onToggle: () => void;
  }) => (
      <button type="button" onClick={async () => { onToggle(); }} className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left">
      <div>
        <div className="text-sm font-black text-white">{label}</div>
        <div className="mt-1 text-sm font-medium text-white/60">{description}</div>
      </div>
      <div className={`flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? 'bg-accent' : 'bg-white/15'}`}>
        <div className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Notifications</div>
        <div className="w-12" />
      </div>
      <div className="space-y-3">
        <ToggleRow label="Push notifications" description="Vibin, comments, follows, and saves." checked={pushEnabled} onToggle={() => {
          const next = !pushEnabled;
          setPushEnabled(next);
          void api.updateNotificationSettings({ pushEnabled: next, emailEnabled, recommendationEnabled });
        }} />
        <ToggleRow label="Email updates" description="Weekly roundups and account notices." checked={emailEnabled} onToggle={() => {
          const next = !emailEnabled;
          setEmailEnabled(next);
          void api.updateNotificationSettings({ pushEnabled, emailEnabled: next, recommendationEnabled });
        }} />
        <ToggleRow label="Recommendation updates" description="Fresh place and traveler matches." checked={recommendationEnabled} onToggle={() => {
          const next = !recommendationEnabled;
          setRecommendationEnabled(next);
          void api.updateNotificationSettings({ pushEnabled, emailEnabled, recommendationEnabled: next });
        }} />
      </div>
    </div>
  );
}

function PrivacySettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers'>('public');
  const [momentVisibility, setMomentVisibility] = useState<'public' | 'private'>('public');

  useEffect(() => {
    api.getPrivacySettings().then((settings) => {
      setProfileVisibility(settings.profileVisibility);
      setMomentVisibility(settings.momentVisibility);
    });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Privacy</div>
        <div className="w-12" />
      </div>

      <div className="space-y-5">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Profile visibility</div>
          <div className="mt-3 flex gap-2">
            {(['public', 'followers'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setProfileVisibility(option);
                  void api.updatePrivacySettings({ profileVisibility: option, momentVisibility });
                }}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                  profileVisibility === option ? 'bg-accent text-dark' : 'bg-white/8 text-white/70'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Default moment visibility</div>
          <div className="mt-3 flex gap-2">
            {(['public', 'private'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMomentVisibility(option);
                  void api.updatePrivacySettings({ profileVisibility, momentVisibility: option });
                }}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                  momentVisibility === option ? 'bg-accent text-dark' : 'bg-white/8 text-white/70'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [faqs, setFaqs] = useState<string[]>([]);

  useEffect(() => {
    api.getSupport().then((response) => setFaqs(response.faqs));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Support</div>
        <div className="w-12" />
      </div>

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div key={faq} className="rounded-[24px] border border-white/10 bg-white/6 p-4">
            <div className="text-sm font-black text-white">{faq}</div>
            <div className="mt-1 text-sm font-medium text-white/60">This will connect to help articles and report flows later.</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditProfileScreen({
  user,
  onBack,
  onSave,
}: {
  user: User;
  onBack: () => void;
  onSave: (payload: { displayName: string; username: string; bio: string; avatarUrl?: string }) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName ?? user.username);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Could not read image file'));
        reader.readAsDataURL(file);
      });

      const response = await api.uploadMomentMedia({
        files: [
          {
            fileName: file.name,
            mimeType: file.type,
            dataUrl,
          },
        ],
      });

      const uploadedAvatar = response.files[0]?.url;
      if (!uploadedAvatar) {
        throw new Error('Upload did not return a file URL');
      }

      setAvatarUrl(uploadedAvatar);
    } catch {
      setAvatarError('Could not upload avatar right now. Try another image.');
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Edit profile</div>
        <div className="w-12" />
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">Avatar</div>
          <div className="mb-3 text-sm font-medium text-white/55">Upload a profile photo so other travelers recognize you faster.</div>
          <div className="flex items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
            <div className="h-20 w-20 overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/8">
              <img
                src={avatarUrl}
                alt={user.username}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  isUploadingAvatar ? 'bg-white/10 text-white/40' : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {isUploadingAvatar ? 'Uploading...' : 'Upload photo'}
              </button>
              <div className="mt-2 text-xs text-white/45">Square photos work best. JPG, PNG, or WebP.</div>
              {avatarError ? <div className="mt-2 text-xs font-medium text-red-300">{avatarError}</div> : null}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">Name</div>
          <div className="mb-2 text-sm font-medium text-white/55">This is the name people see first on your profile.</div>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your display name"
            className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
          />
        </div>
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">Username</div>
          <div className="mb-2 text-sm font-medium text-white/55">Your public handle. Keep it short and easy to remember.</div>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
        />
        </div>
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">Bio</div>
          <div className="mb-2 text-sm font-medium text-white/55">A short line about your travel taste, current city, or what you like to save.</div>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            placeholder="Bio"
            className="w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
          />
        </div>
        <button
          type="button"
          onClick={() => onSave({ displayName, username, bio, avatarUrl })}
          disabled={!displayName.trim() || !username.trim() || !bio.trim() || isUploadingAvatar}
          className={`w-full rounded-[1.4rem] px-5 py-4 text-sm font-black transition ${
            displayName.trim() && username.trim() && bio.trim() && !isUploadingAvatar ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
          }`}
        >
          Save profile
        </button>
      </div>
    </div>
  );
}

function EditMomentScreen({
  place,
  onBack,
  onSave,
}: {
  place: Place;
  onBack: () => void;
  onSave: (payload: {
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
  }) => void | Promise<void>;
}) {
  return (
    <MomentFormScreen
      mode="edit"
      initialPlace={place}
      initialVisitedDate="2026-03-20"
      initialCaption={`Still one of my favorite stops from ${place.location.split(',')[0]}.`}
      initialUploadedMedia={['tokyo-night-walk.jpg', 'table-video.mp4']}
      initialRating={4}
      initialBudgetLevel="$$"
      initialVisitType="solo"
      initialTimeOfDay="night"
      initialPrivacy="public"
      initialWouldRevisit="yes"
      initialVibeTags={['aesthetic', 'worth it']}
      onBack={onBack}
      onSubmit={onSave}
    />
  );
}

function AddCollectionScreen({
  moments,
  onBack,
  onCreateCollection,
}: {
  moments: Place[];
  onBack: () => void;
  onCreateCollection: (collection: { label: string; places: Place[] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [selectedMomentIds, setSelectedMomentIds] = useState<string[]>([]);

  const uniqueMoments = moments.filter((place, index, array) => array.findIndex((item) => item.id === place.id) === index);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Add collection</div>
        <div className="w-12" />
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Bundle your moments into a collection.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Pick moments you already posted, then give the collection a title.</p>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">Collection title</div>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Spring 2026, Late night Seoul, etc."
          className="w-full rounded-[1.25rem] border border-white/10 bg-zinc-900 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
        />
      </div>

      <div className="mt-6">
        <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Choose from your moments</div>
        <div className="space-y-3">
          {uniqueMoments.map((place) => {
            const active = selectedMomentIds.includes(place.id);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() =>
                  setSelectedMomentIds((prev) => prev.includes(place.id) ? prev.filter((id) => id !== place.id) : [...prev, place.id])
                }
                className={`flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition ${
                  active ? 'border-accent bg-accent/12' : 'border-white/10 bg-white/6 hover:bg-white/8'
                }`}
              >
                <img src={place.image} alt={place.name} className="h-16 w-16 rounded-[16px] object-cover" referrerPolicy="no-referrer" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{place.name}</div>
                  <div className="mt-1 text-xs font-medium text-white/55">{place.location}</div>
                </div>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${active ? 'border-accent bg-accent text-dark' : 'border-white/20 text-transparent'}`}>
                  <Check size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCreateCollection({ label: title.trim(), places: uniqueMoments.filter((place) => selectedMomentIds.includes(place.id)) })}
        disabled={!title.trim() || selectedMomentIds.length === 0}
        className={`mt-6 w-full rounded-[1.4rem] px-5 py-4 text-sm font-black transition ${
          title.trim() && selectedMomentIds.length > 0 ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
        }`}
      >
        Create collection
      </button>
    </div>
  );
}

// --- PROFILE SCREEN ---
function Profile({
  user,
  bookmarkedPlaces,
  onNavigate,
  onSavePlace,
  onSelectPlace,
  onOpenCollection,
  customCollections,
  onEditProfile,
  onEditMoment,
}: {
  user: User;
  bookmarkedPlaces: Place[];
  onNavigate: (s: Screen) => void;
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>;
  onSelectPlace: (place: Place) => void;
  onOpenCollection: (collection: { label: string; places: Place[] }) => void;
  customCollections: { label: string; places: Place[] }[];
  onEditProfile: () => void;
  onEditMoment: (place: Place) => void;
}) {
  const [activeTab, setActiveTab] = useState<'moments' | 'saved' | 'vibin'>('moments');
  const [momentsFilter, setMomentsFilter] = useState<'city' | 'time'>('city');
  const [commentsPlace, setCommentsPlace] = useState<Place | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; user: string; body: string; createdAt?: string }>>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [vibedPlaceIds, setVibedPlaceIds] = useState<string[]>([]);
  const [sharedPlaceIds, setSharedPlaceIds] = useState<string[]>([]);
  const [profileToast, setProfileToast] = useState<string | null>(null);
  const ownPlaces = user.travelHistory.flatMap((history) => history.places || []);
  const uniqueBookmarkedPlaces = bookmarkedPlaces.filter((place, index, allPlaces) => (
    allPlaces.findIndex((candidate) => candidate.id === place.id) === index
  ));
  const travelerSummary = `${ownPlaces.length} places • ${user.stats.cities} cities • ${user.stats.countries} countries`;
  const momentCollections = customCollections.filter((collection) => collection.places.length > 0);
  const cityCollections = user.travelHistory.filter((history) => (history.places ?? []).length > 0);
  const groupedByTime = Object.values(
    ownPlaces.reduce<Record<string, { label: string; places: Place[] }>>((acc, place) => {
      const date = place.visitedDate ? new Date(place.visitedDate) : null;
      if (!date || Number.isNaN(date.getTime())) {
        return acc;
      }
      const label = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (!acc[label]) {
        acc[label] = { label, places: [] };
      }
      acc[label].places.push(place);
      return acc;
    }, {}),
  ).filter((group) => group.places.length > 0);

  const showProfileToast = (message: string) => {
    setProfileToast(message);
    window.setTimeout(() => {
      setProfileToast((current) => (current === message ? null : current));
    }, 1800);
  };

  useEffect(() => {
    setSavedPlaceIds(uniqueBookmarkedPlaces.map((place) => place.id));
  }, [uniqueBookmarkedPlaces]);

  useEffect(() => {
    if (!commentsPlace) return;
    void api.getComments({
      targetType: getPlaceInteractionTargetType(commentsPlace),
      targetId: getPlaceInteractionTargetId(commentsPlace),
    })
      .then((response) => {
        setComments(response.comments);
      })
      .catch(() => {
        setComments([]);
      });
  }, [commentsPlace]);

  return (
    <div className="bg-zinc-950 min-h-screen pb-24 text-white">
      <div className="px-4 pb-10 pt-3">
        <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="rounded-full p-3 text-white transition hover:bg-white/8"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('public-profile')}
            className="rounded-full p-3 text-white transition hover:bg-white/8"
            aria-label="Share public profile"
          >
            <Share2 size={18} />
          </button>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-black p-6 text-white shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="h-20 w-20 overflow-hidden rounded-[1.6rem] border border-white/10 bg-white">
              <img
                src={user.avatar}
                alt={user.username}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tighter">{user.displayName ?? user.username}</h1>
                <p className="text-sm font-black text-white/60">@{user.username}</p>
                <p className="mt-1 text-white/65 font-medium leading-tight">{user.bio}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{travelerSummary}</p>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {user.flags?.map((flag, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-lg shadow-sm">
                  {flag}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {user.badges?.slice(0, 3).map((badge) => (
                <span key={badge} className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-[2rem] bg-white/8 p-4 backdrop-blur-sm">
            <p className="text-sm font-semibold leading-relaxed text-white/80">
              Your profile is where moments, saves, and vibin stack into a public taste graph.
            </p>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={onEditProfile}
              className="flex-1 rounded-[1.25rem] bg-accent px-5 py-4 text-sm font-black text-dark transition hover:brightness-105"
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={onEditProfile}
              className="rounded-[1.25rem] border border-white/10 bg-white/8 px-4 py-4 text-white transition hover:bg-white/12"
              aria-label="Quick edit profile"
            >
              <PencilLine size={18} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{uniqueBookmarkedPlaces.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">saved places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{42 + user.stats.trips}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">vibin</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{user.stats.trips + 18}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">followers</div>
            </div>
          </div>
        </div>

        <div className="mb-8 mt-8">
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
                Collections
              </div>
              <button
                type="button"
                onClick={() => onNavigate('add-collection')}
                className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-accent"
              >
                <Plus size={12} />
                Add collection
              </button>
            </div>
            {momentCollections.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {momentCollections.map((collection) => (
                  <button
                    key={collection.label}
                    onClick={() => onOpenCollection(collection)}
                    className="min-w-44 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left"
                  >
                    <div className="text-base font-black text-white">{collection.label}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                      {collection.places.length} places
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                No collections yet. Start one for a trip, season, or theme.
              </div>
            )}
          </section>

          <div className="mb-8 inline-flex rounded-full border border-white/10 bg-white/6 p-1">
            {['moments', 'saved', 'vibin'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as 'moments' | 'saved' | 'vibin')}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === tab ? 'bg-white text-black' : 'text-white/65'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tighter">
              {activeTab === 'moments' ? 'Your latest moments' : activeTab === 'saved' ? 'Places saved to your graph' : 'People who sent vibin'}
            </h2>
          </div>

          {activeTab === 'moments' ? (
            <div className="space-y-8">
              <div className="inline-flex rounded-full border border-white/10 bg-white/6 p-1">
                <button
                  type="button"
                  onClick={() => setMomentsFilter('city')}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${momentsFilter === 'city' ? 'bg-white text-black' : 'text-white/65'}`}
                >
                  By city
                </button>
                <button
                  type="button"
                  onClick={() => setMomentsFilter('time')}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${momentsFilter === 'time' ? 'bg-white text-black' : 'text-white/65'}`}
                >
                  By time
                </button>
              </div>

              {(momentsFilter === 'city'
                ? cityCollections.map((history) => ({ key: history.country, label: history.cities[0], places: history.places ?? [] }))
                : groupedByTime.map((group) => ({ key: group.label, label: group.label, places: group.places }))
              ).map((group) => (
                <section key={group.key}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-black text-white">{group.label}</h3>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                      {momentsFilter === 'city' ? 'city moments' : 'monthly moments'}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {group.places.map((place, index) => (
                      <div key={`${group.key}-${place.id}`} className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                        <PlaceCard
                          data={{
                            ...mapPlaceToCardData(place, index),
                            visitedByFollowingAvatars: [],
                            contextNote: momentsFilter === 'city' ? 'visited here in March 2026' : `visited in ${group.label}`,
                          }}
                          className="rounded-b-none border-0 shadow-none hover:translate-y-0 hover:shadow-none"
                          onClick={() => onSelectPlace(place)}
                        />
                        <div className="space-y-3 px-4 pb-4 pt-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onEditMoment(place)}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-black text-white transition hover:bg-white/12"
                            >
                              <PencilLine size={14} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const targetId = getPlaceInteractionTargetId(place);
                                const isActive = vibedPlaceIds.includes(targetId);
                                setVibedPlaceIds((prev) => isActive ? prev.filter((id) => id !== targetId) : [...prev, targetId]);
                                showProfileToast(isActive ? 'Removed vibin' : 'Sent vibin');
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                vibedPlaceIds.includes(getPlaceInteractionTargetId(place))
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Zap size={14} />
                              <span>{vibedPlaceIds.includes(getPlaceInteractionTargetId(place)) ? 1 : 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommentsPlace(place)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                commentsPlace?.id === place.id
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <MessageCircle size={14} />
                              <span>0</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const isActive = savedPlaceIds.includes(place.id);
                                const updated = await onSavePlace(place, !isActive);
                                if (!updated) return;
                                setSavedPlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                savedPlaceIds.includes(place.id)
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Bookmark size={14} />
                              <span>{savedPlaceIds.includes(place.id) ? 1 : 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const isActive = sharedPlaceIds.includes(place.id);
                                setSharedPlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                                showProfileToast(isActive ? 'Removed share' : 'Shared place');
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                sharedPlaceIds.includes(place.id)
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Share2 size={14} />
                              <span>{sharedPlaceIds.includes(place.id) ? 1 : 0}</span>
                            </button>
                          </div>

                          <div className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-black text-white/75">{commentsPlace?.id === place.id ? comments.length : 0} comments</div>
                              <button type="button" onClick={() => setCommentsPlace(place)} className="text-xs font-black text-accent">
                                Write a comment
                              </button>
                            </div>
                            <div className="mt-2 space-y-1">
                              {commentsPlace?.id === place.id && comments.length > 0 ? (
                                comments.slice(0, 2).map((comment) => (
                                  <div key={comment.id} className="text-sm text-white/72">
                                    <span className="font-black text-white">@{comment.user}</span> {comment.body}
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-white/45">Comments load when you open this thread.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : activeTab === 'saved' ? (
            <div className="space-y-4">
              {uniqueBookmarkedPlaces.length > 0 ? (
                uniqueBookmarkedPlaces.map((place, index) => (
                  <div key={`${place.id}-${index}`}>
                    <PlaceCard
                      data={{
                        ...mapPlaceToCardData(place, index),
                        visitedByFollowingAvatars: [],
                        contextNote: 'saved to your vibe graph',
                      }}
                      onClick={() => onSelectPlace(place)}
                    />
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                  No saved places yet. Save spots from discovery to build your graph.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
              Vibin activity is still empty here until this feed is fully connected to backend notifications.
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {commentsPlace ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentsPlace(null)}
              className="fixed inset-0 z-40 bg-black/60"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pb-8 pt-4"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-4 text-center text-lg font-black text-white">Comments on {commentsPlace.name}</div>
              <div className="mt-5 space-y-4">
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                      <div className="text-sm text-white/75">
                        <span className="font-black text-white">@{comment.user}</span> {comment.body}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                    No comments yet.
                  </div>
                )}
              </div>
              <div className="mt-5 flex gap-3">
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  className="input-apple flex-1"
                />
                <button
                  className="rounded-full bg-accent px-4 py-3 text-sm font-black text-dark"
                  onClick={async () => {
                    if (!commentsPlace || !commentDraft.trim()) return;
                    try {
                      const response = await api.createComment({
                        targetType: getPlaceInteractionTargetType(commentsPlace),
                        targetId: getPlaceInteractionTargetId(commentsPlace),
                        body: commentDraft.trim(),
                        momentId: commentsPlace.momentId,
                      });
                      setComments((prev) => [response.comment, ...prev]);
                      setCommentDraft('');
                      showProfileToast('Comment sent');
                    } catch {
                      showProfileToast('Could not send comment right now');
                    }
                  }}
                >
                  Send
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {profileToast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-3rem)] max-w-xs -translate-x-1/2 rounded-full border border-white/10 bg-white px-4 py-3 text-center text-sm font-black text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
          >
            {profileToast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function buildTravelerCardData(traveler: User, index: number, isFollowing = false): TravelerCardData {
  return {
    id: traveler.id,
    username: traveler.username,
    avatarUrl: traveler.avatar,
    bio: traveler.bio,
    countriesCount: traveler.stats.countries,
    citiesCount: traveler.stats.cities,
    countryFlags: (traveler.flags ?? []).slice(0, 5).map((flag, flagIndex) => {
      const palettes = ['FFD60A', 'FF375F', '30D158', '0A84FF', 'BF5AF2'];
      return `https://placehold.co/80x80/${palettes[flagIndex % palettes.length]}/111111?text=${encodeURIComponent(flag)}`;
    }),
    // AI-generated descriptor and relevance lines stay short so the card remains scan-friendly.
    badges: traveler.badges?.slice(0, 3) ?? [],
    descriptor: traveler.descriptor ?? '',
    relevanceReason: traveler.relevanceReason ?? '',
    matchScore: traveler.matchScore ?? 0,
    recentLocation: traveler.travelHistory[0]?.cities[0],
    placesCount: traveler.travelHistory.flatMap((trip) => trip.places ?? []).length,
    vibinCount: traveler.vibinCount ?? 0,
    previewPlaces: traveler.travelHistory.flatMap((trip) => trip.places ?? []).slice(0, 3).map((place) => ({
      id: place.id,
      imageUrl: place.image,
    })),
    isFollowing,
  };
}

function TravelerPlaceCard({
  place,
  cardData,
  contextNote,
  vibed,
  saved,
  shared,
  commentsCount = 0,
  onOpenPlace,
  onToggleVibin,
  onToggleSave,
  onToggleShare,
  onOpenComments,
  traveler,
}: {
  place: Place;
  cardData: PlaceCardData;
  contextNote: string;
  vibed: boolean;
  saved: boolean;
  shared: boolean;
  commentsCount?: number;
  onOpenPlace: () => void;
  onToggleVibin: () => void;
  onToggleSave: () => void;
  onToggleShare: () => void;
  onOpenComments: () => void;
  traveler?: { username: string; avatar: string };
}) {
  const actionClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
      active ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
    }`;

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      {traveler ? (
        <button
          type="button"
          onClick={onOpenPlace}
          className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3 text-left"
        >
          <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10">
            <img
              src={traveler.avatar}
              alt={traveler.username}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, traveler.username)}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">@{traveler.username}</div>
            <div className="text-xs font-medium text-white/45">{contextNote}</div>
          </div>
        </button>
      ) : null}

      <PlaceCard
        data={{ ...cardData, visitedByFollowingAvatars: [], contextNote }}
        className="rounded-b-none border-0 shadow-none hover:translate-y-0 hover:shadow-none"
        onClick={onOpenPlace}
      />

      <div className="space-y-3 px-4 pb-4 pt-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onToggleVibin} className={actionClass(vibed)}>
            <Zap size={14} />
            <span>{vibed ? 1 : 0}</span>
          </button>
          <button type="button" onClick={onOpenComments} className={actionClass(false)}>
            <MessageCircle size={14} />
            <span>{commentsCount}</span>
          </button>
          <button type="button" onClick={onToggleSave} className={actionClass(saved)}>
            <Bookmark size={14} />
            <span>{saved ? 1 : 0}</span>
          </button>
          <button type="button" onClick={onToggleShare} className={actionClass(shared)}>
            <Share2 size={14} />
            <span>{shared ? 1 : 0}</span>
          </button>
        </div>

        <div className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-black text-white/75">{commentsCount} comments</div>
            <button type="button" onClick={onOpenComments} className="text-xs font-black text-accent">
              Write a comment
            </button>
          </div>
          <div className="mt-2 space-y-1">
            <div className="text-sm text-white/45">Comments load when you open this thread.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceDiscovery({
  selectedInterests,
  selectedVibe,
  activeLocation,
  savedLocations,
  events,
  searchInput,
  searchQuery,
  onOpenPreferences,
  onOpenLocationManager,
  onOpenNotifications,
  onSearchInputChange,
  onClearSearch,
  onSelectLocation,
  onLocationSheetVisibilityChange,
  visiblePlaces,
  isLoading,
  isEventsLoading,
  isLoadingMore,
  isRefreshing,
  hasMore,
  hasError,
  hasEventsError,
  bookmarkedPlaceIds,
  onRefresh,
  onLoadMore,
  onBookmarkPlace,
  onDismissPlace,
  onSelectPlace,
  onSelectEvent,
}: {
  selectedInterests: Interest[],
  selectedVibe: Vibe | null,
  activeLocation: SavedLocationOption,
  savedLocations: SavedLocationOption[],
  events: EventItem[],
  searchInput: string,
  searchQuery: string,
  onOpenPreferences: () => void,
  onOpenLocationManager: () => void,
  onOpenNotifications: () => void,
  onSearchInputChange: (value: string) => void,
  onClearSearch: () => void,
  onSelectLocation: (locationId: string) => void,
  onLocationSheetVisibilityChange: (isOpen: boolean) => void,
  visiblePlaces: Place[],
  isLoading: boolean,
  isEventsLoading: boolean,
  isLoadingMore: boolean,
  isRefreshing: boolean,
  hasMore: boolean,
  hasError: boolean,
  hasEventsError: boolean,
  bookmarkedPlaceIds: string[],
  onRefresh: () => void,
  onLoadMore: () => void,
  onBookmarkPlace: (p: Place) => void,
  onDismissPlace: (p: Place) => void,
  onSelectPlace: (p: Place) => void,
  onSelectEvent: (event: EventItem) => void,
}) {
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(searchInput.trim().length > 0);
  const [pullDistance, setPullDistance] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const currentCity = activeLocation?.label ?? 'Boston';
  const isFilteringBySearch = searchQuery.length > 0;
  const formatEventDate = (value: string) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
  // `visiblePlaces` already comes from the backend scoped to the selected location.
  // Re-filtering here breaks live Google results because formatted addresses don't
  // always repeat the selected city label in a predictable way.
  const displayPlaces = visiblePlaces;
  const mixedDiscoveryItems = (() => {
    const items: Array<
      | { type: 'place'; id: string; place: Place }
      | { type: 'event'; id: string; event: EventItem }
    > = [];

    displayPlaces.forEach((place, index) => {
      items.push({ type: 'place', id: place.id, place });
      const eventIndex = Math.floor(index / 4);
      if ((index + 1) % 4 === 0 && events[eventIndex]) {
        items.push({ type: 'event', id: events[eventIndex].id, event: events[eventIndex] });
      }
    });

    if (displayPlaces.length < 4) {
      events.slice(0, Math.min(events.length, 2)).forEach((event) => {
        if (!items.some((item) => item.id === event.id)) {
          items.push({ type: 'event', id: event.id, event });
        }
      });
    }

    return items;
  })();
  const leftColumnItems = mixedDiscoveryItems.filter((_, index) => index % 2 === 0);
  const rightColumnItems = mixedDiscoveryItems.filter((_, index) => index % 2 === 1);

  useEffect(() => {
    onLocationSheetVisibilityChange(isLocationSheetOpen);
    return () => onLocationSheetVisibilityChange(false);
  }, [isLocationSheetOpen, onLocationSheetVisibilityChange]);

  useEffect(() => {
    if (searchInput.trim().length > 0) {
      setIsSearchOpen(true);
    }
  }, [searchInput]);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore || isRefreshing) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        onLoadMore();
      }
    }, { rootMargin: '240px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, isRefreshing, onLoadMore, visiblePlaces.length]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.scrollY <= 0) {
      pullStartYRef.current = event.touches[0]?.clientY ?? null;
    }
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || typeof window === 'undefined' || window.scrollY > 0) return;
    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(delta * 0.55, 88));
  };

  const handleTouchEnd = () => {
    const shouldRefresh = pullDistance >= 64 && !isRefreshing && !isLoading && !isLoadingMore;
    pullStartYRef.current = null;
    setPullDistance(0);
    if (shouldRefresh) {
      onRefresh();
    }
  };

  return (
    <div
      className="min-h-screen bg-zinc-950 px-4 pb-28 pt-12 text-white"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="flex justify-center overflow-hidden transition-all duration-200"
        style={{ height: isRefreshing ? 52 : pullDistance > 0 ? Math.min(pullDistance, 52) : 0 }}
      >
        <div className="flex items-center text-[11px] font-black uppercase tracking-[0.2em] text-white/45">
          {isRefreshing ? 'Refreshing picks...' : pullDistance >= 64 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      </div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
            For Your Vibe
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsLocationSheetOpen(true)}
              className="inline-flex items-center gap-2 text-3xl font-black tracking-[-0.05em] text-white"
            >
              {currentCity}
              <ChevronDown size={20} className="text-white/60" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">For you</div>
            <div className="text-xs font-semibold text-white/75">
              {selectedVibe ? `${selectedVibe} picks` : 'AI-ranked picks'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSearchOpen((current) => !current)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-white transition ${
              isSearchOpen
                ? 'border-accent/40 bg-accent/12 text-accent hover:bg-accent/18'
                : 'border-white/10 bg-white/6 hover:bg-white/10'
            }`}
            aria-label={isSearchOpen ? 'Hide place search' : 'Open place search'}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenNotifications}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition hover:bg-white/10"
            aria-label="Open notifications"
          >
            <Bell size={18} />
          </button>
        </div>
      </div>

      <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
        Swipe right to save. Swipe left to hide.
      </div>

      {!hasPreferences ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Want sharper picks?</div>
            <div className="text-xs text-white/55">Choose preferences so AI can tune this feed for your vibe.</div>
          </div>
          <button
            type="button"
            onClick={onOpenPreferences}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-white/90"
          >
            Choose
          </button>
        </div>
      ) : null}

      {isSearchOpen || isFilteringBySearch ? (
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/6 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder={`Search places in ${currentCity}`}
              className="w-full rounded-[20px] border border-white/10 bg-zinc-950/70 py-3 pl-11 pr-11 text-sm font-medium text-white placeholder:text-white/32 focus:border-accent/60 focus:outline-none"
              autoFocus
            />
            {searchInput.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onClearSearch();
                  setIsSearchOpen(false);
                }}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close search"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            <div className="text-[11px] font-semibold tracking-[0.12em] text-white/35 uppercase">
              {isFilteringBySearch ? `Compatibility-ranked results for "${searchQuery}"` : `Search within ${currentCity}`}
            </div>
            {isFilteringBySearch ? (
              <button
                type="button"
                onClick={() => {
                  onClearSearch();
                  setIsSearchOpen(false);
                }}
                className="text-[11px] font-black uppercase tracking-[0.16em] text-accent"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-lg font-black text-white">
            {isFilteringBySearch ? `Searching places in ${currentCity}...` : `Loading picks for ${currentCity}...`}
          </div>
          <p className="mt-2 text-sm font-medium text-white/55">
            {isFilteringBySearch
              ? 'We\'re finding matches for your search and re-ranking them for your taste.'
              : 'We&apos;re pulling place recommendations for this location.'}
          </p>
        </div>
      ) : mixedDiscoveryItems.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-lg font-black text-white">
            {hasError
              ? `Couldn't load places for ${currentCity}.`
              : isFilteringBySearch
                ? `No places matched "${searchQuery}" in ${currentCity}.`
                : `No places yet for ${currentCity}.`}
          </div>
          <p className="mt-2 text-sm font-medium text-white/55">
            {hasError
              ? 'Pull to refresh to try again. Discovery no longer falls back to mock cards here.'
              : isFilteringBySearch
                ? 'Try another keyword or clear search to return to your broader ranked feed.'
                : 'Try another saved location or keep this as a future feed target.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 items-start gap-3">
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {leftColumnItems.map((item, columnIndex) => {
                  const index = columnIndex * 2;
                  return (
                    <div key={`${item.type}-${item.id}`} className="min-w-0">
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedVibe={selectedVibe}
                          isBookmarked={bookmarkedPlaceIds.includes(item.place.id)}
                          onBookmark={() => onBookmarkPlace(item.place)}
                          onDismiss={() => onDismissPlace(item.place)}
                          onOpen={() => onSelectPlace(item.place)}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          onOpen={() => onSelectEvent(item.event)}
                        />
                      )}
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {rightColumnItems.map((item, columnIndex) => {
                  const index = columnIndex * 2 + 1;
                  return (
                    <div key={`${item.type}-${item.id}`} className="min-w-0">
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedVibe={selectedVibe}
                          isBookmarked={bookmarkedPlaceIds.includes(item.place.id)}
                          onBookmark={() => onBookmarkPlace(item.place)}
                          onDismiss={() => onDismissPlace(item.place)}
                          onOpen={() => onSelectPlace(item.place)}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          onOpen={() => onSelectEvent(item.event)}
                        />
                      )}
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          <div ref={loadMoreRef} className="h-8" />

          {isLoadingMore ? (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white/60">
              {isFilteringBySearch ? `Loading more matches for "${searchQuery}"...` : `Loading more picks for ${currentCity}...`}
            </div>
          ) : !isEventsLoading && !hasEventsError && events.length > 0 ? (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white/60">
              Live Ticketmaster events are woven into this feed where they fit your current vibe.
            </div>
          ) : hasEventsError ? (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white/60">
              Live events could not load right now, so this pass is showing places only.
            </div>
          ) : null}
        </>
      )}

      <AnimatePresence>
        {isLocationSheetOpen ? (
          <LocationPickerSheet
            locations={savedLocations}
            activeLocationId={activeLocation.id}
            onClose={() => setIsLocationSheetOpen(false)}
            onSelectLocation={(locationId) => {
              onSelectLocation(locationId);
              setIsLocationSheetOpen(false);
            }}
            onAddLocation={() => {
              setIsLocationSheetOpen(false);
              onOpenLocationManager();
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PlaceDiscoveryTile({
  place,
  index,
  selectedVibe,
  isBookmarked,
  onBookmark,
  onDismiss,
  onOpen,
}: {
  place: Place,
  index: number,
  selectedVibe: Vibe | null,
  isBookmarked: boolean,
  onBookmark: () => void,
  onDismiss: () => void,
  onOpen: () => void,
}) {
  const suppressClickRef = useRef(false);
  const match = Math.min(place.similarityStat ?? (selectedVibe ? 74 : 68), 98);
  const editorialLabel = getEditorialLabel(place, index);
  const tileHeightClass =
    index % 4 === 0
      ? 'h-[20.5rem]'
      : index % 4 === 1
        ? 'h-[26rem]'
        : index % 4 === 2
          ? 'h-[18rem]'
          : 'h-[22.5rem]';

  return (
    <motion.button
      type="button"
      layout
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 90) {
          suppressClickRef.current = true;
          onBookmark();
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          return;
        }

        if (info.offset.x < -90) {
          suppressClickRef.current = true;
          onDismiss();
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          return;
        }
      }}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }

        onOpen();
      }}
      whileDrag={{ scale: 1.02, rotate: 4 }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      className={`group relative inline-block w-full overflow-hidden rounded-[28px] bg-zinc-900 text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${tileHeightClass}`}
    >
      <img
        src={place.image}
        alt={place.name}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-accent backdrop-blur-md">
        {match}%
      </div>
      {isBookmarked ? (
        <div className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
          Saved
        </div>
      ) : null}
      {editorialLabel ? (
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur-md">
            {editorialLabel}
          </p>
        </div>
      ) : null}
    </motion.button>
  );
}

function EventDiscoveryTile({
  event,
  index,
  onOpen,
}: {
  event: EventItem;
  index: number;
  onOpen: () => void;
}) {
  const visualLabel = (event.tags?.[0] ?? event.category ?? 'live event').toLowerCase();
  const tileHeightClass =
    index % 4 === 0
      ? 'h-[20.5rem]'
      : index % 4 === 1
        ? 'h-[26rem]'
        : index % 4 === 2
          ? 'h-[18rem]'
          : 'h-[22.5rem]';

  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      className={`group relative inline-block w-full overflow-hidden rounded-[28px] bg-zinc-900 text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${tileHeightClass}`}
    >
      <img
        src={event.image || 'https://placehold.co/800x1000/111111/ffffff?text=Event'}
        alt={event.name}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-accent backdrop-blur-md">
        {Math.min(event.compatibilityScore, 98)}%
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur-md">
          {visualLabel}
        </p>
      </div>
    </motion.button>
  );
}

function LocationPickerSheet({
  locations,
  activeLocationId,
  onClose,
  onSelectLocation,
  onAddLocation,
}: {
  locations: SavedLocationOption[],
  activeLocationId: string,
  onClose: () => void,
  onSelectLocation: (locationId: string) => void,
  onAddLocation: () => void,
}) {
  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pb-8 pt-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
        <div className="mt-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              Saved locations
            </div>
            <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">
              Pick where discovery starts.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/8 p-3 text-white transition hover:bg-white/12"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => onSelectLocation(location.id)}
              className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
                activeLocationId === location.id
                  ? 'border-accent bg-accent text-black'
                  : 'border-white/10 bg-white/6 text-white hover:bg-white/8'
              }`}
            >
              <div>
                <div className="text-base font-black">{location.label}</div>
                <div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                  activeLocationId === location.id ? 'text-black/65' : 'text-white/40'
                }`}>
                  {location.type}
                </div>
              </div>
              {activeLocationId === location.id ? (
                <span className="text-[11px] font-black uppercase tracking-[0.18em]">Active</span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddLocation}
          className="mt-5 flex w-full items-center justify-center rounded-[22px] border-2 border-accent bg-transparent px-4 py-4 text-sm font-black text-accent transition hover:bg-accent/10"
        >
          Add city / province / country
        </button>
      </motion.div>
    </>
  );
}

function LocationSearchScreen({
  savedLocations,
  onBack,
  onAddLocation,
}: {
  savedLocations: SavedLocationOption[],
  onBack: () => void,
  onAddLocation: (location: SavedLocationOption) => void,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SavedLocationOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      void api.lookupLocations(query.trim())
        .then((response) => {
          const nextResults = response.locations.filter(
            (location) =>
              !savedLocations.some((saved) => saved.label.toLowerCase() === location.label.toLowerCase()),
          ) as SavedLocationOption[];
          setResults(nextResults);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, savedLocations]);

  return (
    <div className="min-h-screen overflow-y-auto bg-zinc-950 px-4 pb-28 pt-12 text-white">
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/8 p-3 text-white transition hover:bg-white/12"
        >
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
          Add location
        </div>
        <div className="w-11" />
      </div>

      <h1 className="text-3xl font-black tracking-[-0.05em] text-white">
        Search a city, province, or country.
      </h1>
      <p className="mt-2 text-sm font-medium text-white/55">
        Start typing and we&apos;ll pull Google location suggestions in real time.
      </p>

      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white px-4 py-3.5 pl-11 text-black outline-none transition-all placeholder:text-black/45 focus:ring-2 focus:ring-white/10"
          placeholder="Search Boston, West Java, Japan..."
          autoFocus
        />
      </div>

      <div className="mt-6 space-y-3">
        {query.trim().length > 0 && query.trim().length < 3 ? (
          <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-5 text-sm font-medium text-white/55">
            Type at least 3 letters to search locations.
          </div>
        ) : null}

        {isSearching ? (
          <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-5 text-sm font-medium text-white/55">
            Searching locations...
          </div>
        ) : null}

        {results.map((location) => (
          <button
            key={location.id}
            type="button"
            onClick={() => onAddLocation(location)}
            className="flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-left transition hover:bg-white/8"
          >
            <div>
              <div className="text-base font-black text-white">{location.label}</div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                {location.type}
              </div>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-black">
              Add
            </span>
          </button>
        ))}

        {!isSearching && query.trim().length >= 3 && results.length === 0 ? (
          <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-5 text-sm font-medium text-white/55">
            No location matched. Try another city, province, or country name.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MomentFormScreen({
  mode,
  initialPlace = null,
  initialVisitedDate = '',
  initialCaption = '',
  initialUploadedMedia = [],
  initialRating = 4,
  initialBudgetLevel = '$$',
  initialVisitType = 'solo',
  initialTimeOfDay = 'sunset',
  initialPrivacy = 'public',
  initialWouldRevisit = 'yes',
  initialVibeTags = [],
  onBack,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initialPlace?: Place | null;
  initialVisitedDate?: string;
  initialCaption?: string;
  initialUploadedMedia?: string[];
  initialRating?: number;
  initialBudgetLevel?: '$' | '$$' | '$$$';
  initialVisitType?: 'solo' | 'couple' | 'friends' | 'family';
  initialTimeOfDay?: 'morning' | 'afternoon' | 'sunset' | 'night';
  initialPrivacy?: 'public' | 'private';
  initialWouldRevisit?: 'yes' | 'not_sure' | 'not_interested';
  initialVibeTags?: string[];
  onBack: () => void;
  onSubmit: (payload: {
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
  }) => void | Promise<void>;
}) {
  const createMediaItem = (url: string) => ({
    url,
    fileName: url.split('/').pop() ?? 'media',
    mediaType: url.match(/\.(mp4|mov|webm)$/i) ? 'video' as const : 'image' as const,
  });
  const [placeQuery, setPlaceQuery] = useState(initialPlace?.name ?? '');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(initialPlace);
  const [visitedDate, setVisitedDate] = useState(initialVisitedDate);
  const [caption, setCaption] = useState(initialCaption);
  const [rating, setRating] = useState<number>(initialRating);
  const [budgetLevel, setBudgetLevel] = useState<'$' | '$$' | '$$$'>(initialBudgetLevel);
  const [uploadedMedia, setUploadedMedia] = useState<Array<{ url: string; fileName: string; mediaType: 'image' | 'video' }>>(
    initialUploadedMedia.map(createMediaItem),
  );
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(mode === 'edit');
  const [visitType, setVisitType] = useState<'solo' | 'couple' | 'friends' | 'family'>(initialVisitType);
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'sunset' | 'night'>(initialTimeOfDay);
  const [privacy, setPrivacy] = useState<'public' | 'private'>(initialPrivacy);
  const [wouldRevisit, setWouldRevisit] = useState<'yes' | 'not_sure' | 'not_interested'>(initialWouldRevisit);
  const [vibeTags, setVibeTags] = useState<string[]>(initialVibeTags);
  const [placeSuggestions, setPlaceSuggestions] = useState<Place[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const canSubmit = !!selectedPlace && !!visitedDate && caption.trim().length > 0 && uploadedMedia.length > 0;

  const quickTags = ['aesthetic', 'quiet', 'crowded', 'date spot', 'hidden gem', 'worth it'];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastSunday = new Date();
  lastSunday.setDate(lastSunday.getDate() - ((lastSunday.getDay() + 7) % 7 || 7));
  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  const captionSuggestions = selectedPlace
    ? [
        `${selectedPlace.name} honestly lived up to the hype.`,
        `Would come back here just for the vibe alone.`,
        `${selectedPlace.location.split(',')[0]} felt different after this stop.`,
      ]
    : [
        'Way better than I expected and super easy to stay longer than planned.',
        'Low effort plan, high reward kind of place.',
        'One of those spots that actually feels good in real life too.',
      ];

  useEffect(() => {
    if (selectedPlace || placeQuery.trim().length < 3) {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      void api.lookupPlaces(placeQuery.trim())
        .then((response) => {
          setPlaceSuggestions(response.places as Place[]);
        })
        .catch(() => {
          setPlaceSuggestions([]);
        })
        .finally(() => {
          setIsSearchingPlaces(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [placeQuery, selectedPlace]);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-12 text-white">
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/8 p-3 text-white transition hover:bg-white/12"
        >
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
          {mode === 'create' ? 'Add moment' : 'Edit moment'}
        </div>
        <div className="w-11" />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">
          {mode === 'create' ? 'Add a new travel moment.' : 'Edit your travel moment.'}
        </h1>
        <p className="mt-2 text-sm font-medium text-white/55">
          {mode === 'create' ? 'Start with the essentials. Advanced details can come after.' : 'Update the essentials or refine the details below.'}
        </p>
      </div>

      <div className="space-y-5">
        <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <Search size={16} className="text-accent" />
            <span>Place</span>
          </div>
          <div className="relative mt-4">
            <input
              type="text"
              value={selectedPlace ? `${selectedPlace.name} • ${selectedPlace.location}` : placeQuery}
              onChange={(event) => {
                setSelectedPlace(null);
                setPlaceQuery(event.target.value);
              }}
              placeholder="Type at least 3 letters to search places"
              className="w-full rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-white/10"
            />

            {selectedPlace ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlace(null);
                  setPlaceQuery('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/8 p-2 text-white/70"
                aria-label="Clear selected place"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {!selectedPlace && placeQuery.trim().length >= 3 && placeSuggestions.length > 0 ? (
            <div className="mt-3 space-y-2">
              {placeSuggestions.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={async () => {
                    setIsResolvingPlace(true);
                    try {
                      const response = await api.getPlaceDetails(place.id);
                      setSelectedPlace(response.place as Place);
                      setPlaceQuery(response.place.name);
                    } finally {
                      setIsResolvingPlace(false);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-left transition hover:bg-white/8"
                >
                  <div>
                    <div className="text-sm font-black text-white">{place.name}</div>
                    <div className="mt-1 text-xs font-medium text-white/45">{place.location}</div>
                  </div>
                  <ChevronRight size={16} className="text-white/35" />
                </button>
              ))}
            </div>
          ) : null}

          {!selectedPlace && placeQuery.trim().length >= 3 && isSearchingPlaces ? (
            <div className="mt-3 rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-medium text-white/55">
              Searching places...
            </div>
          ) : null}

          {!selectedPlace && placeQuery.trim().length >= 3 && !isSearchingPlaces && placeSuggestions.length === 0 ? (
            <div className="mt-3 rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-medium text-white/45">
              No place suggestions yet. Try another keyword.
            </div>
          ) : null}

          {isResolvingPlace ? (
            <div className="mt-3 rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-medium text-white/55">
              Loading place details...
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <CalendarDays size={16} className="text-accent" />
            <span>Date visited</span>
          </div>
          <input
            type="date"
            value={visitedDate}
            onChange={(event) => setVisitedDate(event.target.value)}
            className="mt-4 w-full rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-4 text-sm font-medium text-white outline-none transition focus:ring-2 focus:ring-white/10"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisitedDate(formatDate(yesterday))}
              className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/72 transition hover:bg-white/8"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setVisitedDate(formatDate(lastSunday))}
              className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/72 transition hover:bg-white/8"
            >
              Last Sunday
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <ImagePlus size={16} className="text-accent" />
            <span>Media</span>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-center rounded-[22px] border border-dashed border-white/20 bg-zinc-900 px-4 py-8 text-center transition hover:bg-white/8">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []) as File[];
                if (!files.length) return;
                setMediaError(null);
                setIsUploadingMedia(true);

                const readFileAsDataUrl = (file: File) => new Promise<{ fileName: string; mimeType: string; dataUrl: string }>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      resolve({
                        fileName: file.name,
                        mimeType: file.type,
                        dataUrl: reader.result,
                      });
                      return;
                    }
                    reject(new Error('Could not read selected file'));
                  };
                  reader.onerror = () => reject(new Error('Could not read selected file'));
                  reader.readAsDataURL(file);
                });

                void files.reduce<Promise<void>>(async (chain, file) => {
                  await chain;
                  const preparedFile = await readFileAsDataUrl(file);
                  const response = await api.uploadMomentMedia({ files: [preparedFile] });
                  setUploadedMedia((current) => [
                    ...current,
                    ...response.files.map((uploadedFile) => ({
                      url: uploadedFile.url,
                      fileName: uploadedFile.fileName,
                      mediaType: uploadedFile.mediaType,
                    })),
                  ]);
                }, Promise.resolve())
                  .catch(() => {
                    setMediaError('Could not upload media right now. Try a smaller file or upload one image at a time.');
                  })
                  .finally(() => {
                    setIsUploadingMedia(false);
                    event.target.value = '';
                  });
              }}
            />
            <div>
              <div className="text-sm font-black text-white">Upload photos or video</div>
              <div className="mt-1 text-xs font-medium text-white/45">At least one file is required.</div>
            </div>
          </label>
          {isUploadingMedia ? (
            <div className="mt-3 rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-medium text-white/55">
              Uploading media...
            </div>
          ) : null}
          {mediaError ? (
            <div className="mt-3 rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
              {mediaError}
            </div>
          ) : null}
          {uploadedMedia.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {uploadedMedia.map((media) => (
                <div key={media.url} className="overflow-hidden rounded-[20px] border border-white/10 bg-zinc-900">
                  <div className="aspect-[4/5] bg-black">
                    {media.mediaType === 'video' ? (
                      <video src={media.url} className="h-full w-full object-cover" controls muted playsInline />
                    ) : (
                      <img src={media.url} alt={media.fileName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 truncate text-xs font-semibold text-white/78">{media.fileName}</div>
                    <button
                      type="button"
                      onClick={() => setUploadedMedia((current) => current.filter((item) => item.url !== media.url))}
                      className="rounded-full bg-white/8 p-1.5 text-white/65 transition hover:bg-white/12"
                      aria-label={`Remove ${media.fileName}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <MessageCircle size={16} className="text-accent" />
            <span>Caption</span>
          </div>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={4}
            placeholder="What did this place actually feel like?"
            className="mt-4 w-full rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-white/10"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {captionSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setCaption(suggestion)}
                className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-left text-xs font-semibold text-white/72 transition hover:bg-white/8"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Star size={16} className="text-accent" />
              <span>Rating</span>
            </div>
            <div className="mt-4 flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black transition ${
                    rating === value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <WalletCards size={16} className="text-accent" />
              <span>Budget</span>
            </div>
            <div className="mt-4 flex gap-2">
              {(['$', '$$', '$$$'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBudgetLevel(value)}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    budgetLevel === value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((current) => !current)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <SlidersHorizontal size={16} className="text-accent" />
              <span>Advanced settings</span>
            </div>
            <ChevronRight
              size={18}
              className={`text-white/45 transition-transform ${isAdvancedOpen ? 'rotate-90' : ''}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {isAdvancedOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-white/10"
              >
                <div className="space-y-5 p-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Visit type</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(['solo', 'couple', 'friends', 'family'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setVisitType(value)}
                          className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                            visitType === value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Time of day</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(['morning', 'afternoon', 'sunset', 'night'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setTimeOfDay(value)}
                          className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                            timeOfDay === value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Privacy</div>
                    <div className="mt-3 flex gap-2">
                      {(['public', 'private'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPrivacy(value)}
                          className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                            privacy === value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Would revisit</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { value: 'yes' as const, label: 'Yes, I would' },
                        { value: 'not_sure' as const, label: 'Maybe' },
                        { value: 'not_interested' as const, label: 'Not interested to revisit' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setWouldRevisit(option.value)}
                          className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                            wouldRevisit === option.value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Vibe tags</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickTags.map((tag) => {
                        const active = vibeTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setVibeTags((current) =>
                                current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 3),
                              )
                            }
                            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                              active ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      </div>

      <div className="sticky bottom-0 mt-8 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pb-2 pt-6">
        <button
          type="button"
          onClick={() =>
            selectedPlace
              ? onSubmit({
                  placeId: selectedPlace.id,
                  visitedDate,
                  caption,
                  uploadedMedia: uploadedMedia.map((media) => media.url),
                  rating,
                  budgetLevel,
                  visitType,
                  timeOfDay,
                  privacy,
                  wouldRevisit,
                  vibeTags,
                })
              : undefined
          }
          disabled={!canSubmit || isUploadingMedia}
          className={`w-full rounded-[22px] px-5 py-4 text-sm font-black transition ${
            canSubmit && !isUploadingMedia ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
          }`}
        >
          {isUploadingMedia ? 'Uploading media...' : mode === 'create' ? 'Save moment' : 'Update moment'}
        </button>
      </div>
    </div>
  );
}

function CreateMomentScreen({
  initialPlace = null,
  initialVisitedDate = '',
  onBack,
  onCreateMoment,
}: {
  initialPlace?: Place | null;
  initialVisitedDate?: string;
  onBack: () => void;
  onCreateMoment: (payload: {
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
  }) => void | Promise<void>;
}) {
  return (
    <MomentFormScreen
      mode="create"
      initialPlace={initialPlace}
      initialVisitedDate={initialVisitedDate}
      onBack={onBack}
      onSubmit={onCreateMoment}
    />
  );
}

function TravelerDiscovery({
  isAuthenticated,
  onRequireAuth,
  onSelectPlace,
  onSelectTraveler,
}: {
  isAuthenticated: boolean;
  onRequireAuth: (message: string, action: () => void) => void;
  onSelectPlace: (p: Place) => void,
  onSelectTraveler: (t: User) => void,
}) {
  const [tab, setTab] = useState<'similar' | 'following'>('following');
  const [vibedFollowingPlaceIds, setVibedFollowingPlaceIds] = useState<string[]>([]);
  const [savedFollowingPlaceIds, setSavedFollowingPlaceIds] = useState<string[]>([]);
  const [sharedFollowingPlaceIds, setSharedFollowingPlaceIds] = useState<string[]>([]);
  const [followingCommentsPlace, setFollowingCommentsPlace] = useState<Place | null>(null);
  const [followingComments, setFollowingComments] = useState<Array<{ id: string; user: string; body: string; createdAt: string }>>([]);
  const [followingCommentDraft, setFollowingCommentDraft] = useState('');
  const [followingVibinCounts, setFollowingVibinCounts] = useState<Record<string, number>>({});
  const [followingCommentCounts, setFollowingCommentCounts] = useState<Record<string, number>>({});
  const [followingToast, setFollowingToast] = useState<string | null>(null);
  const [discoveryTravelers, setDiscoveryTravelers] = useState<{
    followedTravelers: User[];
    similarTravelers: User[];
  }>({
    followedTravelers: SIMILAR_TRAVELERS.slice(0, 2),
    similarTravelers: SIMILAR_TRAVELERS,
  });
  const similarTravelers = discoveryTravelers.similarTravelers.map((traveler, index) => ({
    original: traveler,
    card: buildTravelerCardData(traveler, index, false),
  }));
  const followedTravelers = discoveryTravelers.followedTravelers.map((traveler, index) => ({
    original: traveler,
    card: buildTravelerCardData(traveler, index, true),
  }));
  const fallbackSimilarTravelers = [...similarTravelers, ...followedTravelers].filter(
    (traveler, index, list) => list.findIndex((item) => item.original.id === traveler.original.id) === index,
  );
  const isSimilarFallback = tab === 'similar' && similarTravelers.length === 0;
  const visibleTravelers = tab === 'similar' ? similarTravelers : followedTravelers;
  const latestFollowedPlaces = followedTravelers.flatMap(({ original }) => {
    const latestTrip = original.travelHistory[0];
    const latestPlaces = (latestTrip?.places ?? []).slice(0, 2);

    return latestPlaces.map((place, index) => ({
      id: `${original.id}-${place.id}-${index}`,
      place,
      traveler: original,
      cityLabel: latestTrip?.cities[0] ?? place.location,
      visitedTime: index === 0 ? '2 days ago' : 'last week',
      compatibility: Math.min((place.similarityStat ?? 72) + 10, 98),
    }));
  });
  const hasFollowingFeed = followedTravelers.length > 0 && latestFollowedPlaces.length > 0;

  const showFollowingToast = (message: string) => {
    setFollowingToast(message);
    window.setTimeout(() => {
      setFollowingToast((current) => (current === message ? null : current));
    }, 1800);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void api.getTravelerDiscovery()
      .then((response) => {
        setDiscoveryTravelers({
          followedTravelers: response.followedTravelers as User[],
          similarTravelers: response.similarTravelers as User[],
        });
      })
      .catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!followingCommentsPlace || !isAuthenticated) return;
    void api.getComments({
      targetType: getPlaceInteractionTargetType(followingCommentsPlace),
      targetId: getPlaceInteractionTargetId(followingCommentsPlace),
    })
      .then((response) => setFollowingComments(response.comments))
      .catch(() => undefined);
  }, [followingCommentsPlace, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || latestFollowedPlaces.length === 0) return;
    void api.getInteractionState({
      placeIds: latestFollowedPlaces.map((item) => item.place.id),
      momentIds: latestFollowedPlaces.map((item) => item.place.momentId).filter(Boolean) as string[],
      profileIds: followedTravelers.map((item) => item.original.id),
    })
      .then((response) => {
        setSavedFollowingPlaceIds(response.bookmarkedPlaceIds);
        setVibedFollowingPlaceIds([...response.vibedPlaceIds, ...response.vibedMomentIds]);
        setFollowingVibinCounts({ ...response.placeVibinCounts, ...response.momentVibinCounts });
        setFollowingCommentCounts({ ...response.placeCommentCounts, ...response.momentCommentCounts });
      })
      .catch(() => undefined);
  }, [isAuthenticated, latestFollowedPlaces.length]);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-28 pt-12 text-white">
      <div className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
          Traveler discovery
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">
          {tab === 'following'
            ? 'Fresh spots from people you follow.'
            : isSimilarFallback
              ? 'Community travelers worth exploring.'
              : 'People picked from your travel taste.'}
        </h1>
      </div>

      <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/6 p-1">
        <button
          type="button"
          onClick={() => setTab('following')}
          className={`rounded-full px-4 py-2 text-sm font-black transition ${
            tab === 'following' ? 'bg-white text-black' : 'text-white/65'
          }`}
        >
          Following
        </button>
        <button
          type="button"
          onClick={() => setTab('similar')}
          className={`rounded-full px-4 py-2 text-sm font-black transition ${
            tab === 'similar' ? 'bg-white text-black' : 'text-white/65'
          }`}
        >
          Similar travelers
        </button>
      </div>

      {tab === 'following' && hasFollowingFeed ? (
        <div className="mb-6">
          <div className="mb-5">
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              Following
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {followedTravelers.map(({ original }) => (
                <button
                  key={original.id}
                  type="button"
                  onClick={() => onSelectTraveler(original)}
                  className="shrink-0 text-center"
                >
                  <div className="mx-auto h-16 w-16 overflow-hidden rounded-full border-2 border-accent/60 p-[2px]">
                    <img
                      src={original.avatar}
                      alt={original.username}
                      className="h-full w-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(event) => handleAvatarImageError(event, original.username)}
                    />
                  </div>
                  <div className="mt-2 max-w-20 truncate text-xs font-bold text-white/75">
                    @{original.username}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
            Places they visited
          </div>
          <div className="space-y-4">
            {latestFollowedPlaces.map(({ id, place, traveler, cityLabel, visitedTime, compatibility }) => (
              <div
                key={id}
              >
                <TravelerPlaceCard
                  place={place}
                  cardData={{
                    ...mapPlaceToCardData(place, 0),
                    matchScore: compatibility,
                  }}
                  contextNote={`${visitedTime} • ${cityLabel}`}
                  traveler={{ username: traveler.username, avatar: traveler.avatar }}
                  vibed={vibedFollowingPlaceIds.includes(getPlaceInteractionTargetId(place))}
                  saved={savedFollowingPlaceIds.includes(place.id)}
                  shared={sharedFollowingPlaceIds.includes(place.id)}
                  onOpenPlace={() => onSelectPlace(place)}
                  commentsCount={
                    followingCommentsPlace?.id === place.id
                      ? followingComments.length || followingCommentCounts[getPlaceInteractionTargetId(place)] || 24
                      : followingCommentCounts[getPlaceInteractionTargetId(place)] || 24
                  }
                  onToggleVibin={async () => {
                    if (!isAuthenticated) {
                      onRequireAuth('Log in to send vibin to places from travelers you follow.', () => undefined);
                      return;
                    }
                    const targetId = getPlaceInteractionTargetId(place);
                    const isActive = vibedFollowingPlaceIds.includes(targetId);
                    try {
                      const response = await api.toggleVibin(getPlaceInteractionPayload(place));
                      setVibedFollowingPlaceIds((prev) =>
                        isActive ? prev.filter((item) => item !== targetId) : [...prev, targetId],
                      );
                      setFollowingVibinCounts((prev) => ({ ...prev, [targetId]: response.count }));
                      showFollowingToast(isActive ? 'Removed vibin' : 'Sent vibin');
                    } catch {
                      showFollowingToast('Could not update vibin right now');
                    }
                  }}
                  onToggleSave={async () => {
                    if (!isAuthenticated) {
                      onRequireAuth('Log in to save places from people you follow.', () => undefined);
                      return;
                    }
                    const isActive = savedFollowingPlaceIds.includes(place.id);
                    try {
                      if (isActive) {
                        await api.removeBookmarkPlace(place.id);
                      } else {
                        await api.bookmarkPlace({ placeId: place.id });
                      }
                      setSavedFollowingPlaceIds((prev) =>
                        isActive ? prev.filter((item) => item !== place.id) : [...prev, place.id],
                      );
                      showFollowingToast(isActive ? 'Removed save' : 'Saved to bookmarks');
                    } catch {
                      showFollowingToast('Could not update bookmarks right now');
                    }
                  }}
                  onToggleShare={() =>
                    setSharedFollowingPlaceIds((prev) =>
                      prev.includes(place.id) ? prev.filter((item) => item !== place.id) : [...prev, place.id],
                    )
                  }
                  onOpenComments={() => setFollowingCommentsPlace(place)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'following' ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
            Following
          </div>
          <div className="mt-2 text-lg font-black text-white">Your following feed is empty for now.</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
            Follow a few travelers to unlock fresh moments and place drops from people whose trips you want to keep tabs on.
          </p>
          <button
            type="button"
            onClick={() => setTab('similar')}
            className="mt-4 rounded-full bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-white/90"
          >
            Find travelers to follow
          </button>
        </div>
      ) : null}

      {tab === 'similar' ? (
        <div className="space-y-4">
          {similarTravelers.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
                Explore travelers
              </div>
              <div className="mt-2 text-lg font-black text-white">Your exact matches are still warming up.</div>
              <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
                Showing all available travelers for now, so you can still explore people with useful overlap while the match graph catches up.
              </p>
            </div>
          ) : null}

          {(similarTravelers.length === 0 ? fallbackSimilarTravelers : visibleTravelers).map(({ original, card }) => (
            <div key={original.id}>
              <TravelerCard
                data={
                  isSimilarFallback
                    ? {
                        ...card,
                        descriptor: card.descriptor || 'community traveler',
                        relevanceReason: card.relevanceReason || 'Broader community pick while your exact matches are still forming.',
                        badges: card.badges.length > 0 ? card.badges : ['broad match'],
                      }
                    : card
                }
                onClick={() => onSelectTraveler(original)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <AnimatePresence>
        {followingCommentsPlace ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFollowingCommentsPlace(null)}
              className="fixed inset-0 z-40 bg-black/60"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pb-8 pt-4"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-4 text-center text-lg font-black text-white">Comments on {followingCommentsPlace.name}</div>
              <div className="mt-5 space-y-4">
                {[
                  ...(followingComments.length > 0
                    ? followingComments.map((comment) => `${comment.user}:::${comment.body}`)
                    : [
                        'friend1:::saved this because of your post and it was so worth it',
                        'friend2:::the lighting here is unreal',
                      ])
                ].map((body, idx) => {
                  const [username, text] = body.split(':::');
                  return (
                  <div key={idx} className="rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm text-white/72">
                    <span className="font-black text-white">@{username}</span> {text}
                  </div>
                )})}
              </div>
              <div className="mt-5 flex gap-3">
                <input
                  type="text"
                  value={followingCommentDraft}
                  onChange={(event) => setFollowingCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  className="input-apple flex-1"
                />
                <button
                  className="rounded-full bg-accent px-4 py-3 text-sm font-black text-dark"
                  onClick={async () => {
                    if (!followingCommentsPlace || !followingCommentDraft.trim()) return;
                    if (!isAuthenticated) {
                      onRequireAuth('Log in to comment on places from travelers you follow.', () => undefined);
                      return;
                    }
                    try {
                      const response = await api.createComment({
                        targetType: getPlaceInteractionTargetType(followingCommentsPlace),
                        targetId: getPlaceInteractionTargetId(followingCommentsPlace),
                        body: followingCommentDraft.trim(),
                        momentId: followingCommentsPlace.momentId,
                      });
                      setFollowingComments((prev) => [response.comment, ...prev]);
                      setFollowingCommentCounts((prev) => ({
                        ...prev,
                        [getPlaceInteractionTargetId(followingCommentsPlace)]: response.count,
                      }));
                      setFollowingCommentDraft('');
                      showFollowingToast('Comment sent');
                    } catch {
                      showFollowingToast('Could not send comment right now');
                    }
                  }}
                >
                  Send
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {followingToast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-black text-black shadow-xl"
          >
            {followingToast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BookmarksScreen({
  bookmarkedPlaces,
  onSelectPlace,
}: {
  bookmarkedPlaces: Place[],
  onSelectPlace: (p: Place) => void,
}) {
  const groupedPlaces = bookmarkedPlaces.reduce<Record<string, Place[]>>((acc, place) => {
    const city = place.location.split(',')[0]?.trim() ?? place.location;
    acc[city] = [...(acc[city] ?? []), place];
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-28 pt-12 text-white">
      <div className="mb-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
          Saved places
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">
          Your bookmarks, sorted by city.
        </h1>
      </div>

      {bookmarkedPlaces.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-lg font-black text-white">No saved places yet.</div>
          <p className="mt-2 text-sm font-medium text-white/60">
            Swipe right on a place in discovery and it will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedPlaces).map(([city, places]) => (
            <section key={city}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black tracking-tight text-white">{city}</h2>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                  {places.length} saved
                </span>
              </div>

              <div className="space-y-4">
                {places.map((place, index) => (
                  <div key={place.id}>
                    <PlaceCard
                      data={mapPlaceToCardData(place, index)}
                      onClick={() => onSelectPlace(place)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// --- PLACE DETAIL SCREEN ---
function PlaceDetail({
  place,
  savedLocations,
  activeLocationId,
  deviceLocation,
  deviceLocationPermission,
  relatedPlaces,
  travelerMoments,
  fallbackTravelers,
  interactionState,
  onBack,
  onSavePlace,
  onMarkBeenThere,
  onToggleVibe,
  onRequestDeviceLocation,
  onSelectPlace,
  onSelectTraveler,
  onExploreTravelers,
  onExplorePlaces,
}: {
  place: Place,
  savedLocations: SavedLocationOption[],
  activeLocationId: string | null,
  deviceLocation: DeviceLocation | null,
  deviceLocationPermission: 'unknown' | 'granted' | 'denied' | 'unsupported',
  relatedPlaces: Array<{ id: string; name: string; imageUrl: string }>;
  travelerMoments: Array<{
    id: string;
    travelerUsername: string;
    travelerAvatar: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }>;
  fallbackTravelers: User[];
  interactionState: {
    isSaved: boolean;
    isBeenThere: boolean;
    isVibed: boolean;
  },
  onBack: () => void,
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>,
  onMarkBeenThere: () => void,
  onToggleVibe: () => Promise<void>,
  onRequestDeviceLocation: () => void,
  onSelectPlace: (p: Place) => void,
  onSelectTraveler: (travelerId: string) => void,
  onExploreTravelers: () => void,
  onExplorePlaces: () => void,
}) {
  const [city, country] = place.location.split(',').map((part) => part.trim());
  const activeLocation = savedLocations.find((item) => item.id === activeLocationId) ?? savedLocations[0];
  const distanceFromUserKm = calculateDistanceKm(
    deviceLocation ?? activeLocation,
    {
      latitude: place.latitude,
      longitude: place.longitude,
    },
  );
  const detailData: PlaceDetailData = {
    id: place.id,

    // Google Places-style structured content
    name: place.name,
    city: city ?? place.location,
    country: country ?? '',
    distanceFromUserKm,
    address: place.address ?? `${place.name}, ${place.location}`,
    category: place.category ?? 'recommended spot',
    images: place.images ?? [place.image],
    media: (place.images ?? [place.image]).map((item, index) => ({
      type: index === 1 && place.id === 'p1' ? 'video' as const : 'image' as const,
      url: index === 1 && place.id === 'p1'
        ? 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
        : item,
      thumbnailUrl: item,
    })),
    rating: place.rating,
    priceLevel: place.priceLevel ?? (place.priceRange === 'Free' ? 1 : place.priceRange === '$' ? 1 : place.priceRange === '$$' ? 2 : 3),
    openingHours: place.openingHours,
    mapsUrl: place.mapsUrl,

    // AI-enriched content
    hook: place.hook ?? '',
    description: place.description || undefined,
    vibeTags: place.tags.map((tag) => tag.replace('-', ' ')).slice(0, 4),
    whyYoullLike: [],
    bestTime: place.bestTime,
    attitudeLabel: getDisplayAttitudeLabel(place) ?? undefined,

    // Internal recommendation signals
    matchScore: place.similarityStat,
    similarityPercentage: place.similarityStat,
    recommendationReason: place.recommendationReason ?? buildPlaceRecommendationReason(place, travelerMoments.length),

    // Social / behavioral context
    similarTravelerCount: travelerMoments.length > 0 ? travelerMoments.length : undefined,
    travelerMoments,
    fallbackTravelers: fallbackTravelers.map((traveler) => ({
      id: traveler.id,
      username: traveler.username,
      avatarUrl: traveler.avatar,
      matchScore: traveler.matchScore,
      recentLocation: traveler.travelHistory[0]?.cities[0],
    })),

    // Feed-like related discovery
    relatedPlaces,
    mapsEmbedUrl: typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? `https://www.google.com/maps?q=${place.latitude},${place.longitude}&output=embed`
      : `https://www.google.com/maps?q=${encodeURIComponent(place.address ?? `${place.name}, ${place.location}`)}&output=embed`,
  };

  return (
    <PlaceDetailPage
      data={detailData}
      isSaved={interactionState.isSaved}
      isBeenThere={interactionState.isBeenThere}
      isVibed={interactionState.isVibed}
      locationPermission={deviceLocationPermission}
      onBack={onBack}
      onSave={() => onSavePlace(place, !interactionState.isSaved)}
      onBeenThere={onMarkBeenThere}
      onVibe={() => {
        void onToggleVibe();
      }}
      onRequestLocation={onRequestDeviceLocation}
      onSelectFallbackTraveler={onSelectTraveler}
      onExploreMoreLikeThis={onExplorePlaces}
      onExploreTravelers={onExploreTravelers}
      onSelectRelatedPlace={(placeId) => {
        void api.getPlaceDetails(placeId)
          .then((response) => {
            onSelectPlace(response.place as Place);
          })
          .catch(() => {});
      }}
    />
  );
}

function EventDetail({
  event,
  isSaved,
  isVibed,
  onBack,
  onSave,
  onShare,
  onVibe,
}: {
  event: EventItem;
  isSaved: boolean;
  isVibed: boolean;
  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
  onVibe: () => void;
}) {
  const renderChip = (label: string) => (
    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/82 shadow-sm">
      {label}
    </span>
  );
  const [city, country] = event.location.split(',').map((part) => part.trim());
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(event.startAt));
  const visibleTags = event.tags.slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-950 pb-32 text-white">
      <div className="sticky top-0 z-40 px-4 pt-6">
        <div className="flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 shadow-lg backdrop-blur-xl">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-3 text-white transition hover:bg-white/8"
            aria-label="Go back"
          >
            <ArrowRight size={20} className="rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onShare}
              className="rounded-full p-3 text-white transition hover:bg-white/8"
              aria-label="Share event"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={onVibe}
              className={`rounded-full p-3 transition ${
                isVibed ? 'bg-accent text-dark' : 'bg-white/8 text-white hover:bg-white/12'
              }`}
              aria-label="Vibe with this event"
            >
              <Zap size={18} />
            </button>
          </div>
        </div>
      </div>

      <section className="px-4 pt-4">
        <div className="relative overflow-hidden rounded-[32px] shadow-[0_20px_50px_rgba(15,23,42,0.14)]">
          {event.image ? (
            <img src={event.image} alt={event.name} className="h-[29rem] w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-[29rem] w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
          <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-dark backdrop-blur-md">
              Event
            </span>
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark shadow-lg">
              {event.compatibilityScore}% match
            </span>
          </div>
          <div className="absolute inset-x-5 bottom-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/80">
                <MapPin size={14} />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">
                  {[city, country].filter(Boolean).join(', ') || event.location}
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-[-0.05em] text-white">
                {event.name}
              </h1>
            </div>
          </div>
        </div>
      </section>

      <main className="space-y-8 px-4 pt-6">
        {event.category ? (
          <section className="space-y-3">
            <h2 className="text-[2rem] font-black leading-[0.95] tracking-[-0.06em] text-white">
              {event.category}
            </h2>
            {event.venueName ? (
              <p className="max-w-[34rem] text-base font-medium leading-relaxed text-white/68">
                {event.venueName} {event.description ? `is hosting this live event with a stronger timing fit for your current profile.` : 'is hosting this live pick right when it fits your current profile best.'}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[28px] bg-dark p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-accent">
            <Sparkles size={14} />
            Why this is showing up for you
          </div>
          <p className="mt-3 text-lg font-black leading-tight tracking-[-0.03em]">
            {event.compatibilityReason}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {renderChip(`${event.compatibilityScore}% event match`)}
            {renderChip(formattedDate)}
            {event.venueName ? renderChip(event.venueName) : null}
            {event.priceLabel ? renderChip(event.priceLabel) : null}
          </div>
        </section>

        {visibleTags.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-lg font-black tracking-[-0.03em] text-white">Vibe check.</h3>
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/72"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {event.description ? (
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-sm">
            <h3 className="text-lg font-black tracking-[-0.03em] text-white">About this event.</h3>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-white/72">
              {event.description}
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-lg font-black tracking-[-0.03em] text-white">Keep it practical.</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Category</div>
              <div className="mt-2 text-sm font-black text-white">{event.category ?? 'Live event'}</div>
            </div>

            {event.priceLabel ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Price</div>
                <div className="mt-2 text-sm font-black text-white">{event.priceLabel}</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-accent/20 p-2 text-white">
                <CalendarDays size={16} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Time</div>
                <div className="mt-1 text-sm font-semibold text-white">{formattedDate}</div>
              </div>
            </div>

            {event.venueName ? (
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-white/10 p-2 text-white">
                  <MapPin size={16} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Venue</div>
                  <div className="mt-1 text-sm font-semibold leading-relaxed text-white">
                    {event.venueName}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-3">
              <div className="rounded-full bg-white/10 p-2 text-white">
                <MapPin size={16} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Location</div>
                <div className="mt-1 text-sm font-semibold leading-relaxed text-white">
                  {event.location}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <DetailActionBar
        primaryActive={isSaved}
        primaryLabel="Save"
        primaryActiveLabel="Saved"
        primaryIcon={<Bookmark size={16} />}
        onPrimary={onSave}
        secondaryLabel={event.ticketUrl ? 'Open ticket' : 'No ticket'}
        secondaryIcon={<ExternalLink size={16} />}
        onSecondary={() => {
          if (event.ticketUrl) {
            window.open(event.ticketUrl, '_blank', 'noopener,noreferrer');
          }
        }}
        secondaryDisabled={!event.ticketUrl}
      />
    </div>
  );
}

// --- TRAVELER PROFILE SCREEN ---
function TravelerProfile({
  user,
  onBack,
  onSavePlace,
  onSelectPlace,
  onExploreMoreTravelers,
  onOpenCollection,
}: {
  user: User,
  onBack: () => void,
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>,
  onSelectPlace: (p: Place) => void,
  onExploreMoreTravelers: () => void,
  onOpenCollection: (collection: { label: string; places: Place[] }) => void,
}) {
  const [activeTab, setActiveTab] = useState<'moments' | 'saved' | 'vibe'>('moments');
  const [momentsFilter, setMomentsFilter] = useState<'city' | 'time'>('city');
  const [commentsPlace, setCommentsPlace] = useState<Place | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [profileVibed, setProfileVibed] = useState(false);
  const [vibedPlaceIds, setVibedPlaceIds] = useState<string[]>([]);
  const [savedProfilePlaceIds, setSavedProfilePlaceIds] = useState<string[]>([]);
  const [sharedPlaceIds, setSharedPlaceIds] = useState<string[]>([]);
  const [placeVibinCounts, setPlaceVibinCounts] = useState<Record<string, number>>({});
  const [profileVibinCount, setProfileVibinCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [comments, setComments] = useState<Array<{ id: string; user: string; body: string; createdAt: string }>>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [profileToast, setProfileToast] = useState<string | null>(null);
  const diaryPlaces = user.travelHistory.flatMap((history) => history.places || []);
  const matchSummary = user.matchScore
    ? `${user.matchScore}% match`
    : '';
  const travelerSummary = `${diaryPlaces.length} places • ${user.stats.cities} cities • ${user.stats.countries} countries`;
  const momentCollections: Array<{ label: string; places: Place[] }> = [];
  const cityCollections = user.travelHistory.filter((history) => (history.places ?? []).length > 0);
  const groupedByTime = Object.values(
    diaryPlaces.reduce<Record<string, { label: string; places: Place[] }>>((acc, place) => {
      const date = place.visitedDate ? new Date(place.visitedDate) : null;
      if (!date || Number.isNaN(date.getTime())) {
        return acc;
      }
      const label = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (!acc[label]) {
        acc[label] = { label, places: [] };
      }
      acc[label].places.push(place);
      return acc;
    }, {}),
  ).filter((group) => group.places.length > 0);
  const showProfileToast = (message: string) => {
    setProfileToast(message);
    window.setTimeout(() => {
      setProfileToast((current) => (current === message ? null : current));
    }, 1800);
  };

  useEffect(() => {
    if (!commentsPlace) return;
    void api.getComments({
      targetType: getPlaceInteractionTargetType(commentsPlace),
      targetId: getPlaceInteractionTargetId(commentsPlace),
    })
      .then((response) => {
        setComments(response.comments);
      })
      .catch(() => {
        setComments([]);
      });
  }, [commentsPlace]);

  useEffect(() => {
    const placeIds = diaryPlaces.map((place) => place.id);
    void api.getInteractionState({
      placeIds,
      momentIds: diaryPlaces.map((place) => place.momentId).filter(Boolean) as string[],
      profileIds: [user.id],
    })
      .then((response) => {
        setSavedProfilePlaceIds(response.bookmarkedPlaceIds);
        setVibedPlaceIds([...response.vibedPlaceIds, ...response.vibedMomentIds]);
        setPlaceVibinCounts({ ...response.placeVibinCounts, ...response.momentVibinCounts });
        setIsFollowing(response.followedUserIds.includes(user.id));
        setProfileVibed(response.vibedProfileIds.includes(user.id));
        setFollowersCount(response.profileFollowerCounts[user.id] ?? followersCount);
        setProfileVibinCount(response.profileVibinCounts[user.id] ?? profileVibinCount);
      })
      .catch(() => undefined);
  }, [user.id]);

  return (
    <div className="bg-zinc-950 min-h-screen pb-24 text-white">
      <div className="px-4 pb-10 pt-3">
        <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
          <button 
            onClick={onBack}
            className="p-3 rounded-full text-white hover:bg-white/8 transition-colors"
          >
            <ArrowRight size={20} className="rotate-180" />
          </button>
          <button
            type="button"
            className="rounded-full p-3 text-white transition hover:bg-white/8"
            aria-label="Share traveler profile"
          >
            <Share2 size={18} />
          </button>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-black p-6 text-white shadow-2xl">
          <div className="flex items-start gap-3">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="shrink-0"
            >
              <div className="h-20 w-20 rounded-[1.6rem] overflow-hidden border border-white/10 bg-white">
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
                />
              </div>
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tighter">{user.username}</h1>
                  <p className="text-sm font-black text-white/60">@{user.username}</p>
                  <p className="mt-1 text-white/65 font-medium leading-tight">{user.bio}</p>
                </div>
                {user.matchScore ? (
                  <div className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark">
                    {user.matchScore}% match
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{travelerSummary}</p>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {user.flags?.map((flag, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-lg shadow-sm">
                  {flag}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {user.badges?.slice(0, 3).map((badge) => (
                <span key={badge} className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {matchSummary ? (
            <div className="mt-6 rounded-[2rem] bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold leading-relaxed text-white/80">
                {matchSummary}
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await api.toggleFollow({ targetUserId: user.id });
                  setIsFollowing(response.active);
                  setFollowersCount(response.followersCount);
                  showProfileToast(response.active ? 'Followed traveler' : 'Unfollowed traveler');
                } catch {
                  showProfileToast('Could not update follow right now');
                }
              }}
              className={`flex-1 rounded-[1.25rem] px-5 py-4 text-sm font-black transition ${
                isFollowing ? 'border border-white/10 bg-white/8 text-white hover:bg-white/12' : 'bg-accent text-dark hover:brightness-105'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await api.toggleVibin({
                    targetType: 'PROFILE',
                    targetId: user.id,
                    receiverUserId: user.id,
                  });
                  setProfileVibed(response.active);
                  setProfileVibinCount(response.count);
                  showProfileToast(response.active ? 'Sent vibin' : 'Removed vibin');
                } catch {
                  showProfileToast('Could not update vibin right now');
                }
              }}
              className="rounded-[1.25rem] border border-white/10 bg-white/8 px-4 py-4 text-white transition hover:bg-white/12"
              aria-label="Vibe with traveler profile"
            >
              <Zap size={18} className={profileVibed ? 'text-accent' : ''} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{diaryPlaces.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">saved places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{profileVibinCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">vibin</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{followersCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">followers</div>
            </div>
          </div>
        </div>

        <div className="mb-8 mt-8">
          {momentCollections.length > 0 ? (
            <section className="mb-8">
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
                Collections
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {momentCollections.map((collection) => (
                  <button
                    key={collection.label}
                    onClick={() => onOpenCollection(collection)}
                    className="min-w-44 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left"
                  >
                    <div className="text-base font-black text-white">{collection.label}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                      {collection.places.length} places
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mb-8 inline-flex rounded-full border border-white/10 bg-white/6 p-1">
            {['moments', 'saved', 'vibe'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === tab ? 'bg-white text-black' : 'text-white/65'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black tracking-tighter">
              {activeTab === 'moments' ? 'Diary moments worth stealing' : activeTab === 'saved' ? 'Saved spots from their taste graph' : 'Why your vibe overlaps'}
            </h2>
          </div>

          {activeTab === 'moments' ? (
            <div className="space-y-8">
              <div className="inline-flex rounded-full border border-white/10 bg-white/6 p-1">
                <button
                  type="button"
                  onClick={() => setMomentsFilter('city')}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${momentsFilter === 'city' ? 'bg-white text-black' : 'text-white/65'}`}
                >
                  By city
                </button>
                <button
                  type="button"
                  onClick={() => setMomentsFilter('time')}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${momentsFilter === 'time' ? 'bg-white text-black' : 'text-white/65'}`}
                >
                  By time
                </button>
              </div>

              {(momentsFilter === 'city'
                ? cityCollections.map((history) => ({ key: history.country, label: history.cities[0], places: history.places ?? [] }))
                : groupedByTime.map((group) => ({ key: group.label, label: group.label, places: group.places }))
              ).map((group) => (
                <section key={group.key}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-black text-white">{group.label}</h3>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                      {momentsFilter === 'city' ? 'city moments' : 'monthly moments'}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {group.places.map((place, index) => (
                      <div key={`${group.key}-${place.id}`} className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                        <PlaceCard
                          data={{
                            ...mapPlaceToCardData(place, index),
                            visitedByFollowingAvatars: [],
                            contextNote: momentsFilter === 'city' ? 'visited here in March 2026' : `visited in ${group.label}`,
                          }}
                          className="rounded-b-none border-0 shadow-none hover:translate-y-0 hover:shadow-none"
                          onClick={() => onSelectPlace(place)}
                        />
                        <div className="space-y-3 px-4 pb-4 pt-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const targetId = getPlaceInteractionTargetId(place);
                                const isActive = vibedPlaceIds.includes(targetId);
                                try {
                                  const response = await api.toggleVibin(getPlaceInteractionPayload(place));
                                  setVibedPlaceIds((prev) => isActive ? prev.filter((id) => id !== targetId) : [...prev, targetId]);
                                  setPlaceVibinCounts((prev) => ({ ...prev, [targetId]: response.count }));
                                  showProfileToast(isActive ? 'Removed vibin' : 'Sent vibin');
                                } catch {
                                  showProfileToast('Could not update vibin right now');
                                }
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                vibedPlaceIds.includes(getPlaceInteractionTargetId(place))
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Zap size={14} />
                              <span>{placeVibinCounts[getPlaceInteractionTargetId(place)] ?? (vibedPlaceIds.includes(getPlaceInteractionTargetId(place)) ? 1 : 0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommentsPlace(place)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                commentsPlace?.id === place.id
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <MessageCircle size={14} />
                              <span>0</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const isActive = savedProfilePlaceIds.includes(place.id);
                                const updated = await onSavePlace(place, !isActive);
                                if (!updated) return;
                                setSavedProfilePlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                savedProfilePlaceIds.includes(place.id)
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Bookmark size={14} />
                              <span>{savedProfilePlaceIds.includes(place.id) ? 1 : 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const isActive = sharedPlaceIds.includes(place.id);
                                setSharedPlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                                showProfileToast(isActive ? 'Removed share' : 'Shared place');
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                                sharedPlaceIds.includes(place.id)
                                  ? 'border-accent bg-accent text-dark'
                                  : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                              }`}
                            >
                              <Share2 size={14} />
                              <span>{sharedPlaceIds.includes(place.id) ? 1 : 0}</span>
                            </button>
                          </div>

                          <div className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-black text-white/75">{commentsPlace?.id === place.id ? comments.length : 0} comments</div>
                              <button
                                type="button"
                                onClick={() => setCommentsPlace(place)}
                                className="text-xs font-black text-accent"
                              >
                                Write a comment
                              </button>
                            </div>
                            <div className="mt-2 space-y-1">
                              {commentsPlace?.id === place.id && comments.length > 0 ? (
                                comments.slice(0, 2).map((comment) => (
                                  <div key={comment.id} className="text-sm text-white/72">
                                    <span className="font-black text-white">@{comment.user}</span> {comment.body}
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-white/45">Comments load when you open this thread.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : activeTab === 'saved' ? (
            <div className="space-y-4">
              {diaryPlaces.map((place, i) => (
                <div key={place.id + i} className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  <PlaceCard
                    data={{
                      ...mapPlaceToCardData(place, i),
                      visitedByFollowingAvatars: [],
                      contextNote: 'saved from their travel diary',
                    }}
                    className="rounded-b-none border-0 shadow-none hover:translate-y-0 hover:shadow-none"
                    onClick={() => onSelectPlace(place)}
                  />
                  <div className="space-y-3 px-4 pb-4 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const targetId = getPlaceInteractionTargetId(place);
                          const isActive = vibedPlaceIds.includes(targetId);
                          try {
                            const response = await api.toggleVibin(getPlaceInteractionPayload(place));
                            setVibedPlaceIds((prev) => isActive ? prev.filter((id) => id !== targetId) : [...prev, targetId]);
                            setPlaceVibinCounts((prev) => ({ ...prev, [targetId]: response.count }));
                            showProfileToast(isActive ? 'Removed vibin' : 'Sent vibin');
                          } catch {
                            showProfileToast('Could not update vibin right now');
                          }
                        }}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                          vibedPlaceIds.includes(getPlaceInteractionTargetId(place))
                            ? 'border-accent bg-accent text-dark'
                            : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                        }`}
                      >
                        <Zap size={14} />
                        <span>{placeVibinCounts[getPlaceInteractionTargetId(place)] ?? (vibedPlaceIds.includes(getPlaceInteractionTargetId(place)) ? 1 : 0)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentsPlace(place)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                          commentsPlace?.id === place.id
                            ? 'border-accent bg-accent text-dark'
                            : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                        }`}
                      >
                        <MessageCircle size={14} />
                        <span>0</span>
                      </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const isActive = savedProfilePlaceIds.includes(place.id);
                            const updated = await onSavePlace(place, !isActive);
                            if (!updated) return;
                            setSavedProfilePlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                          }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                            savedProfilePlaceIds.includes(place.id)
                            ? 'border-accent bg-accent text-dark'
                            : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                        }`}
                      >
                        <Bookmark size={14} />
                        <span>{savedProfilePlaceIds.includes(place.id) ? 1 : 0}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const isActive = sharedPlaceIds.includes(place.id);
                          setSharedPlaceIds((prev) => isActive ? prev.filter((id) => id !== place.id) : [...prev, place.id]);
                          showProfileToast(isActive ? 'Removed share' : 'Shared place');
                        }}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                          sharedPlaceIds.includes(place.id)
                            ? 'border-accent bg-accent text-dark'
                            : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
                        }`}
                      >
                        <Share2 size={14} />
                        <span>{sharedPlaceIds.includes(place.id) ? 1 : 0}</span>
                      </button>
                    </div>

                    <div className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black text-white/75">{commentsPlace?.id === place.id ? comments.length : 0} comments</div>
                        <button
                          type="button"
                          onClick={() => setCommentsPlace(place)}
                          className="text-xs font-black text-accent"
                        >
                          Write a comment
                        </button>
                      </div>
                      <div className="mt-2 space-y-1">
                        {commentsPlace?.id === place.id && comments.length > 0 ? (
                          comments.slice(0, 2).map((comment) => (
                            <div key={comment.id} className="text-sm text-white/72">
                              <span className="font-black text-white">@{comment.user}</span> {comment.body}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-white/45">Comments load when you open this thread.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
              Vibe overlap details are still empty here. This section is ready for AI-generated reasoning later.
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {commentsPlace ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentsPlace(null)}
              className="fixed inset-0 z-40 bg-black/60"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pb-8 pt-4"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-4 text-center text-lg font-black text-white">Comments on {commentsPlace.name}</div>
              <div className="mt-5 space-y-4">
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                      <div className="text-sm text-white/75">
                        <span className="font-black text-white">@{comment.user}</span> {comment.body}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                    No comments yet.
                  </div>
                )}
              </div>
              <div className="mt-5 flex gap-3">
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  className="input-apple flex-1"
                />
                <button
                  className="rounded-full bg-accent px-4 py-3 text-sm font-black text-dark"
                  onClick={async () => {
                    if (!commentsPlace || !commentDraft.trim()) return;
                    try {
                      const response = await api.createComment({
                        targetType: getPlaceInteractionTargetType(commentsPlace),
                        targetId: getPlaceInteractionTargetId(commentsPlace),
                        body: commentDraft.trim(),
                        momentId: commentsPlace.momentId,
                      });
                      setComments((prev) => [response.comment, ...prev]);
                      setCommentDraft('');
                      showProfileToast('Comment sent');
                    } catch {
                      showProfileToast('Could not send comment right now');
                    }
                  }}
                >
                  Send
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {profileToast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-3rem)] max-w-xs -translate-x-1/2 rounded-full border border-white/10 bg-white px-4 py-3 text-center text-sm font-black text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
          >
            {profileToast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CollectionDetailScreen({
  collection,
  onBack,
  onSelectPlace,
}: {
  collection: { label: string; places: Place[] };
  onBack: () => void;
  onSelectPlace: (place: Place) => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="p-3 rounded-full text-white hover:bg-white/8 transition-colors">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">{collection.label}</div>
        <div className="w-12" />
      </div>
      <div className="space-y-4">
        {collection.places.map((place, index) => (
          <div key={place.id}>
            <PlaceCard data={mapPlaceToCardData(place, index)} onClick={() => onSelectPlace(place)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- PUBLIC PROFILE (WEB VIEW) ---
function PublicProfile({ user }: { user: User }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Notion-style Header */}
      <div className="h-48 bg-white/8 relative border-b border-white/10">
        <div className="absolute -bottom-12 left-10">
          <div className="w-28 h-28 rounded-3xl overflow-hidden border-4 border-zinc-950 shadow-xl bg-white">
            <img
              src={user.avatar}
              alt={user.username}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
            />
          </div>
        </div>
      </div>

      <div className="p-10 pt-16">
        <div className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">@{user.username}</h1>
            <p className="text-white/65 text-lg font-medium max-w-md">{user.bio}</p>
          </div>
          <button className="p-3 bg-white/8 rounded-xl hover:bg-white/12 transition-colors">
            <MoreHorizontal size={24} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-16 border-y border-white/10 py-8">
          <div className="text-center border-r border-white/10">
            <div className="text-3xl font-black">{user.stats.countries}</div>
            <div className="text-[10px] uppercase font-bold text-white/35 tracking-widest">Countries</div>
          </div>
          <div className="text-center border-r border-white/10">
            <div className="text-3xl font-black">{user.stats.cities}</div>
            <div className="text-[10px] uppercase font-bold text-white/35 tracking-widest">Cities</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black">{user.stats.trips}</div>
            <div className="text-[10px] uppercase font-bold text-white/35 tracking-widest">Trips</div>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-black tracking-tight mb-8 flex items-center gap-3">
            <Globe size={24} className="text-soft-purple" /> Travel Identity.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {user.travelHistory.map((item) => (
              <div key={item.country} className="card-notion p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 bg-accent rounded-full" />
                  <span className="font-black text-lg uppercase tracking-widest">{item.country}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.cities.map(city => (
                    <span key={city} className="px-3 py-2 bg-white/8 rounded-lg text-xs font-bold text-white/72 border border-white/10">
                      {city}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-dark text-white p-10 rounded-3xl text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <h3 className="text-3xl font-black mb-4">Want to see where I'm going next?</h3>
            <p className="text-white/60 mb-8 font-medium">Join the exclusive community of vibe-checkers.</p>
            <button className="btn-accent px-10 py-5 text-lg flex items-center justify-center gap-3 mx-auto">
              Download VibeCheck <ExternalLink size={20} />
            </button>
          </div>
        </div>
      </div>

      <footer className="p-12 text-center text-white/30 text-[10px] font-mono uppercase tracking-widest border-t border-white/10">
        VibeCheck Travel Identity Platform © 2026 — Built for the elite.
      </footer>
    </div>
  );
}
