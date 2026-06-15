/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect, useRef, type ReactNode, type TouchEvent, type ChangeEvent } from 'react';
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
  Check,
  Mail,
  KeyRound,
  Download,
  Smile,
  ThumbsDown,
} from 'lucide-react';
import { Screen, User, Place, PlaceCollection, Interest, Vibe, EventItem } from './types';
import { MOCK_USER, MOCK_PLACES, SIMILAR_TRAVELERS } from './mockData';
import { MOCK_REVIEW_QUERY_PARAM, MOCK_REVIEW_SCENARIO, isMockReviewModeEnabled } from './mockReviewData';
import PlaceCard, { PlaceCardData } from './components/PlaceCard';
import PlaceDetailPage, { PlaceDetailData } from './components/PlaceDetailPage';
import { TravelerCardData } from './components/TravelerCard';
import DetailActionBar from './components/DetailActionBar';
import { api, ApiError, resolveApiAssetUrl, type V2UserPayload } from './lib/api';
import { identifyAnalyticsUser, initAnalytics, resetAnalyticsUser, trackEvent, trackPageView } from './lib/analytics';
import { getCurrentDevicePosition, isNativeApp, openExternalUrl, shareNativeContent } from './lib/native';

const LandingPage = lazy(() => import('./screens/LandingPage'));
const OnboardingScreen = lazy(() => import('./screens/Onboarding'));
const NotificationsScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.NotificationsScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.SettingsScreen })));
const AccountSettingsScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.AccountSettingsScreen })));
const NotificationSettingsScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.NotificationSettingsScreen })));
const PrivacySettingsScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.PrivacySettingsScreen })));
const SupportScreen = lazy(() => import('./screens/SettingsScreens').then((module) => ({ default: module.SupportScreen })));
const TermsOfServiceScreen = lazy(() => import('./screens/LegalPages').then((module) => ({ default: module.TermsOfServiceScreen })));
const PrivacyPolicyScreen = lazy(() => import('./screens/LegalPages').then((module) => ({ default: module.PrivacyPolicyScreen })));
const PublicProfileScreen = lazy(() => import('./screens/PublicProfileScreen'));
const TravelerProfileScreen = lazy(() => import('./screens/TravelerProfileScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const PlaceDiscoveryScreen = lazy(() => import('./screens/PlaceDiscoveryScreen'));
const APP_STORE_URL = 'https://apps.apple.com/us/app/vibinn/id6762061149';

type MomentRatingLabel = 'disliked' | 'not_bad' | 'liked' | 'recommended';

const MOMENT_RATING_OPTIONS = [
  { value: 'disliked' as const, label: 'Disliked', score: 1, Icon: ThumbsDown },
  { value: 'not_bad' as const, label: 'Not bad', score: 3, Icon: Smile },
  { value: 'liked' as const, label: 'Liked', score: 4, Icon: Heart },
  { value: 'recommended' as const, label: 'Recommended', score: 5, Icon: Sparkles },
];

function normalizeMomentRatingLabel(value?: string | null): MomentRatingLabel {
  if (value === 'disliked' || value === 'DISLIKED') return 'disliked';
  if (value === 'not_bad' || value === 'NOT_BAD' || value === 'notBad') return 'not_bad';
  if (value === 'recommended' || value === 'RECOMMENDED') return 'recommended';
  return 'liked';
}

function momentRatingScore(value: MomentRatingLabel) {
  return MOMENT_RATING_OPTIONS.find((option) => option.value === value)?.score ?? 4;
}

function checkInCaptionTone(value: MomentRatingLabel) {
  switch (value) {
    case 'disliked':
      return 'like a miss';
    case 'not_bad':
      return 'pretty okay';
    case 'recommended':
      return 'easy to recommend';
    case 'liked':
    default:
      return 'like a strong call';
  }
}

function momentRatingMeta(label?: string | null, fallbackRating?: number) {
  if (label) {
    return MOMENT_RATING_OPTIONS.find((option) => option.value === normalizeMomentRatingLabel(label)) ?? MOMENT_RATING_OPTIONS[2];
  }
  if (typeof fallbackRating === 'number') {
    if (fallbackRating >= 5) return MOMENT_RATING_OPTIONS[3];
    if (fallbackRating >= 4) return MOMENT_RATING_OPTIONS[2];
    if (fallbackRating >= 3) return MOMENT_RATING_OPTIONS[1];
    return MOMENT_RATING_OPTIONS[0];
  }
  return null;
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }

  interface Window {
    deferredInstallPrompt?: BeforeInstallPromptEvent;
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

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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

interface DiscoveryPlacesCacheEntry {
  cachedAt: number;
  places: Place[];
  pagination: {
    page: number;
    hasMore: boolean;
  };
}

const ONBOARDING_COMPLETED_KEY = 'vibecheck_onboarding_completed';
const DEVICE_LOCATION_KEY = 'vibinn_device_location';
const DEVICE_LOCATION_PERMISSION_KEY = 'vibinn_device_location_permission';
const DISCOVERY_CACHE_PREFIX = 'vibinn_discovery_cache:';
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const OWN_PROFILE_CACHE_TTL_MS = 3 * 60 * 1000;
const BOOKMARKS_CACHE_TTL_MS = 2 * 60 * 1000;
const TRAVELER_FEED_CACHE_TTL_MS = 2 * 60 * 1000;
const TRAVELER_PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
const TRAVELER_FEED_CACHE_KEY = 'vibinn_traveler_feed_cache:v2';
const PUBLIC_SUGGESTIONS_CACHE_KEY = 'vibinn_public_suggestions_cache:v2';
const APP_BASE_PATH = '/app';
const LEGACY_PUBLIC_PROFILE_BASE_PATH = '/u';
const RESERVED_TOP_LEVEL_PATHS = new Set([
  'app',
  'api',
  'lists',
  'terms',
  'privacy',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);
const WEB_PUBLIC_ALLOWED_SCREENS = new Set<Screen>([
  'landing',
  'terms',
  'privacy',
  'public-profile',
]);

function isWebPublicAllowedScreen(screen: Screen) {
  return WEB_PUBLIC_ALLOWED_SCREENS.has(screen);
}

function mergeSavedLocations(
  currentLocations: SavedLocationOption[],
  incomingLocations: SavedLocationOption[],
) {
  const supportedLocationIds = new Set(INITIAL_SAVED_LOCATIONS.map((location) => location.id));
  const merged = [...currentLocations];

  incomingLocations
    .filter((incoming) => supportedLocationIds.has(incoming.id))
    .forEach((incoming) => {
    const existingIndex = merged.findIndex((location) =>
      location.id === incoming.id ||
      (
        location.type === incoming.type &&
        location.label.trim().toLowerCase() === incoming.label.trim().toLowerCase()
      ),
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...incoming,
      };
      return;
    }

    merged.push(incoming);
  });

  return merged;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readSessionJsonCache<T>(key: string, ttlMs: number) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt: number; data: T };
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSessionJsonCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now(),
      data,
    }));
  } catch {
    // ignore storage failures
  }
}

function slugifyFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vibinn';
}

function wrapSvgText(value: string, maxCharsPerLine: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function buildDiscoveryContextKey(input: {
  locationId: string;
  locationLabel: string;
  locationType: string;
  searchQuery: string;
  selectedInterests: Interest[];
  selectedVibe: Vibe | null;
}) {
  return [
    input.locationId,
    input.locationLabel,
    input.locationType,
    input.searchQuery.trim(),
    [...input.selectedInterests].sort().join(','),
    input.selectedVibe ?? '',
  ].join('|');
}

function readDiscoveryPlacesCache(contextKey: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(`${DISCOVERY_CACHE_PREFIX}${contextKey}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DiscoveryPlacesCacheEntry;
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > DISCOVERY_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(`${DISCOVERY_CACHE_PREFIX}${contextKey}`);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeDiscoveryPlacesCache(contextKey: string, entry: DiscoveryPlacesCacheEntry) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(`${DISCOVERY_CACHE_PREFIX}${contextKey}`, JSON.stringify(entry));
  } catch {
    // Ignore cache write failures; discovery should still work without session storage.
  }
}

async function fetchAssetAsDataUrl(url?: string | null) {
  const resolvedAssetUrl = resolveApiAssetUrl(url);
  const resolvedUrl = (() => {
    if (
      typeof window !== 'undefined'
      && !import.meta.env.VITE_API_BASE_URL
      && resolvedAssetUrl.startsWith('/api/')
    ) {
      return `${window.location.protocol}//${window.location.hostname}:3001${resolvedAssetUrl}`;
    }
    return resolvedAssetUrl;
  })();
  if (!resolvedUrl) return null;

  try {
    const token = api.getStoredAuthToken();
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
    const shouldAttachAuth = Boolean(token) && (
      resolvedUrl.startsWith('/api/')
      || (apiBaseUrl && resolvedUrl.startsWith(apiBaseUrl))
    );

    const response = await fetch(resolvedUrl, {
      headers: shouldAttachAuth && token ? { Authorization: `Bearer ${token}` } : undefined,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Could not read asset blob'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read asset blob'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function svgToPngDataUrl(svgMarkup: string, width: number, height: number) {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load SVG image'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create recap canvas');
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function loadCanvasImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = src;
  });
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const [meta, content] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const binary = atob(content);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new File([array], filename, { type: mime });
}

function hasStoredOnboardingCompletion() {
  return typeof window !== 'undefined' && window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === '1';
}

interface AppRouteState {
  screen: Screen;
  publicProfileUsername?: string | null;
  placeId?: string | null;
  collectionId?: string | null;
}

function buildPlaceDetailPath(placeId: string) {
  return `${APP_BASE_PATH}/place/${encodeURIComponent(placeId)}`;
}

function buildPublicCollectionPath(collectionId: string) {
  return `/lists/${encodeURIComponent(collectionId)}`;
}

function buildCanonicalProfilePath(username: string) {
  return `${LEGACY_PUBLIC_PROFILE_BASE_PATH}/${encodeURIComponent(username)}`;
}

function getNativeDefaultScreen(): Screen {
  return hasStoredOnboardingCompletion() ? 'discover-places' : 'onboarding';
}

function getSafePlaceImage(place: Pick<Place, 'image' | 'images' | 'name'>) {
  const candidate = [place.image, ...(place.images ?? [])].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (candidate) return candidate;
  return `https://placehold.co/1200x675/111111/D3FF48?text=${encodeURIComponent(place.name || 'Vibinn')}`;
}

function screenToAppPath(screen: Screen) {
  switch (screen) {
    case 'discover-places':
      return APP_BASE_PATH;
    case 'terms':
      return '/terms';
    case 'privacy':
      return '/privacy';
    case 'post-preferences-intro':
      return APP_BASE_PATH;
    case 'discover-travelers':
      return `${APP_BASE_PATH}/feed`;
    case 'bookmarks':
      return `${APP_BASE_PATH}/bookmarks`;
    case 'profile':
      return `${APP_BASE_PATH}/profile`;
    case 'notifications':
      return `${APP_BASE_PATH}/notifications`;
    case 'settings':
      return `${APP_BASE_PATH}/settings`;
    case 'settings-account':
      return `${APP_BASE_PATH}/settings/account`;
    case 'settings-notifications':
      return `${APP_BASE_PATH}/settings/notifications`;
    case 'settings-privacy':
      return `${APP_BASE_PATH}/settings/privacy`;
    case 'support':
      return `${APP_BASE_PATH}/support`;
    case 'login':
      return `${APP_BASE_PATH}/login`;
    case 'register':
      return `${APP_BASE_PATH}/register`;
    case 'onboarding':
      return `${APP_BASE_PATH}/onboarding`;
    default:
      return APP_BASE_PATH;
  }
}

function parseAppRoute(pathname: string): AppRouteState {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (normalizedPath === '/') {
    return { screen: 'landing' };
  }

  if (normalizedPath === '/terms') {
    return { screen: 'terms' };
  }

  if (normalizedPath === '/privacy') {
    return { screen: 'privacy' };
  }

  if (normalizedPath === APP_BASE_PATH) {
    return { screen: 'discover-places' };
  }

  if (normalizedPath.startsWith(`${LEGACY_PUBLIC_PROFILE_BASE_PATH}/`)) {
    const username = decodeURIComponent(normalizedPath.slice(LEGACY_PUBLIC_PROFILE_BASE_PATH.length + 1)).trim();
    return { screen: 'public-profile', publicProfileUsername: username || null };
  }

  const directPublicProfileMatch = normalizedPath.match(/^\/([^/]+)$/);
  if (directPublicProfileMatch) {
    const username = decodeURIComponent(directPublicProfileMatch[1]).trim();
    if (username && !RESERVED_TOP_LEVEL_PATHS.has(username.toLowerCase())) {
      return { screen: 'public-profile', publicProfileUsername: username };
    }
  }

  const publicCollectionMatch = normalizedPath.match(/^\/lists\/([^/]+)$/);
  if (publicCollectionMatch) {
    return {
      screen: 'collection-detail',
      collectionId: decodeURIComponent(publicCollectionMatch[1]).trim() || null,
    };
  }

  const appPath = normalizedPath.startsWith(`${APP_BASE_PATH}/`)
    ? normalizedPath.slice(APP_BASE_PATH.length + 1)
    : '';

  const placeDetailMatch = appPath.match(/^place\/([^/]+)$/);
  if (placeDetailMatch) {
    return {
      screen: 'place-detail',
      placeId: decodeURIComponent(placeDetailMatch[1]).trim() || null,
    };
  }

  switch (appPath) {
    case 'onboarding':
      return { screen: 'onboarding' };
    case 'invite':
      return { screen: 'onboarding' };
    case 'login':
      return { screen: 'login' };
    case 'register':
      return { screen: 'register' };
    case 'ready':
      return { screen: 'discover-places' };
    case 'travelers':
      return { screen: 'discover-travelers' };
    case 'feed':
      return { screen: 'discover-travelers' };
    case 'bookmarks':
      return { screen: 'bookmarks' };
    case 'profile':
      return { screen: 'profile' };
    case 'notifications':
      return { screen: 'notifications' };
    case 'settings':
      return { screen: 'settings' };
    case 'settings/account':
      return { screen: 'settings-account' };
    case 'settings/notifications':
      return { screen: 'settings-notifications' };
    case 'settings/privacy':
      return { screen: 'settings-privacy' };
    case 'support':
      return { screen: 'support' };
    default:
      return normalizedPath.startsWith(APP_BASE_PATH)
        ? { screen: 'discover-places' }
        : { screen: 'landing' };
  }
}

const INITIAL_SAVED_LOCATIONS: SavedLocationOption[] = [
  { id: 'boston', label: 'Boston', type: 'city' },
  { id: 'new-york', label: 'New York', type: 'city' },
  { id: 'jakarta', label: 'Jakarta', type: 'city' },
  { id: 'bandung', label: 'Bandung', type: 'city' },
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

function toEditorialTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getAIBackedPlaceLabel(place: Place) {
  const haystack = [
    place.attitudeLabel,
    place.hook,
    place.description,
    place.bestTime,
    ...(place.whyYoullLikeIt ?? []),
    ...(place.tags ?? []),
    place.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const phraseFirstMatchers: Array<{ label: string; matchers: string[] }> = [
    { label: 'Rich-Aunt Energy', matchers: ['rich aunt energy'] },
    { label: 'Main-Character Walk', matchers: ['main character walking', 'main character energy'] },
    { label: 'Old-Soul Street', matchers: ['old street facades', 'old world', 'historic facades'] },
    { label: 'Underrated Pour', matchers: ['underrated bar', 'underrated cocktail', 'speakeasy'] },
    { label: 'Vinyl Nightcap', matchers: ['vinyl bar', 'records and cocktails', 'vinyl and cocktails'] },
    { label: 'Design Stacks', matchers: ['design books', 'art books', 'design bookstore'] },
    { label: 'Golden Walk', matchers: ['brownstones', 'pretty streets', 'window shopping'] },
    { label: 'Harbor Breather', matchers: ['harborwalk', 'waterfront air', 'seaport breeze'] },
    { label: 'Green Reset', matchers: ['green reset'] },
    { label: 'Nostalgic Night', matchers: ['nostalgic concert', 'throwback set', 'retro set'] },
    { label: 'Quiet Browse', matchers: ['quiet browse', 'unhurried browsing'] },
    { label: 'Slow-Sip Stop', matchers: ['specialty coffee', 'slow coffee', 'coffee stop'] },
    { label: 'Pastry Detour', matchers: ['pastry', 'bakery stop', 'morning pastry'] },
    { label: 'Gallery Drift', matchers: ['gallery', 'art crawl', 'small exhibit'] },
    { label: 'Museum Mood', matchers: ['museum', 'cultural stop', 'historic house'] },
    { label: 'Sunset Breather', matchers: ['sunset', 'golden hour', 'sunset views'] },
    { label: 'Market Drift', matchers: ['artisan market', 'farmers market', 'night market', 'bazaar'] },
    { label: 'Treasure Hunt', matchers: ['concept store', 'boutique', 'vintage', 'showroom'] },
    { label: 'Easy Wander', matchers: ['easy wander', 'easy stroll', 'walkable'] },
    { label: 'Local Favorite', matchers: ['local favorite', 'neighborhood spot', 'hidden gem'] },
  ];

  const matchedPhrase = phraseFirstMatchers.find(({ matchers }) =>
    matchers.some((matcher) => haystack.includes(matcher)),
  );

  if (matchedPhrase) return matchedPhrase.label;

  const editorialMatchers: Array<{ label: string; matchers: string[] }> = [
    { label: 'Late-Night Pour', matchers: ['cocktail', 'late night', 'after dark', 'bar'] },
    { label: 'Live Music Fix', matchers: ['live music', 'jazz', 'dj', 'concert'] },
    { label: 'Market Wander', matchers: ['market', 'artisan', 'popup', 'fair'] },
    { label: 'Design Browse', matchers: ['design', 'curated', 'stylish'] },
    { label: 'Vintage Hunt', matchers: ['vintage', 'thrift', 'record shop'] },
    { label: 'Quiet Stacks', matchers: ['bookstore', 'library', 'books', 'reading'] },
    { label: 'Gallery Pause', matchers: ['gallery', 'exhibit', 'arts'] },
    { label: 'Historic Walk', matchers: ['historic', 'history', 'monument', 'heritage'] },
    { label: 'Green Escape', matchers: ['park', 'garden', 'nature preserve'] },
    { label: 'Harbor Reset', matchers: ['waterfront', 'harbor', 'river', 'seaport'] },
    { label: 'Sunset Stroll', matchers: ['scenic', 'viewpoint', 'boardwalk'] },
    { label: 'Slow Coffee', matchers: ['coffee', 'espresso', 'roastery', 'cafe'] },
    { label: 'Pastry Pause', matchers: ['bakery', 'croissant', 'brunch'] },
    { label: 'Easy Detour', matchers: ['easy stop', 'detour', 'quick escape'] },
    { label: 'Photo Moment', matchers: ['photo', 'aesthetic', 'visual', 'beautiful'] },
    { label: 'Neighborhood Find', matchers: ['local', 'neighborhood', 'underrated'] },
  ];

  const matched = editorialMatchers.find(({ matchers }) =>
    matchers.some((matcher) => haystack.includes(matcher)),
  );

  if (matched) return matched.label;

  const specificLabel = getSpecificPlaceLabel(place);
  if (specificLabel) {
    return toEditorialTitleCase(specificLabel.replace(/-/g, ' '));
  }

  const cleanedAttitude = getCleanAttitudeLabel(place.attitudeLabel);
  if (cleanedAttitude) {
    return toEditorialTitleCase(cleanedAttitude.replace(/-/g, ' '));
  }

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
  const [isGoogleButtonReady, setIsGoogleButtonReady] = useState(false);
  const nativePlatform = isNativeApp();

  const initializeGoogleSignIn = () => {
    if (!clientId || !window.google?.accounts?.id) {
      throw new Error('Google sign-in is not ready yet.');
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: nativePlatform ? 'popup' : 'popup',
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
  };

  useEffect(() => {
    if (!clientId || !window.google?.accounts?.id || disabled || nativePlatform) {
      setIsGoogleButtonReady(false);
      return;
    }

    if (!buttonRef.current) {
      setIsGoogleButtonReady(false);
      return;
    }

    try {
      buttonRef.current.innerHTML = '';
      setErrorMessage(null);
      initializeGoogleSignIn();
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,
        shape: 'pill',
        width: 320,
        logo_alignment: 'left',
      });
      setIsGoogleButtonReady(true);
    } catch (error) {
      setIsGoogleButtonReady(false);
      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in is not ready yet.');
    }
  }, [clientId, disabled, nativePlatform, onCredential, text]);

  const handleNativeGooglePress = () => {
    if (disabled) return;

    try {
      setErrorMessage(null);
      initializeGoogleSignIn();
      window.google?.accounts?.id?.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          setErrorMessage('Google sign-in is not available on this screen yet. Try again in a moment.');
        }
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in is not ready yet.');
    }
  };

  if (!clientId) {
    return (
      <div className="rounded-[1.25rem] border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100">
        Google sign-in is not configured yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nativePlatform ? (
        <button
          type="button"
          onClick={handleNativeGooglePress}
          disabled={disabled || !window.google?.accounts?.id}
          className="mx-auto flex w-full max-w-[320px] items-center justify-center rounded-full border border-white/12 bg-white px-5 py-3 text-base font-bold text-zinc-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Continue with Google
        </button>
      ) : (
        <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
          {!isGoogleButtonReady ? (
            <button
              type="button"
              disabled
              className="mx-auto flex w-full max-w-[320px] items-center justify-center rounded-full border border-white/12 bg-white px-5 py-3 text-base font-bold text-zinc-950 opacity-85"
            >
              Continue with Google
            </button>
          ) : null}
          <div ref={buttonRef} className={`flex justify-center ${isGoogleButtonReady ? '' : 'sr-only'}`} />
        </div>
      )}
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

function handleOnboardingImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackLabel = (label?.trim() || 'Vibe').replace(/\s+/g, '+');
  const fallbackUrl = `https://placehold.co/1200x1600/111111/D3FF48?text=${encodeURIComponent(fallbackLabel)}`;
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

const COUNTRY_FLAG_BY_KEYWORD: Array<[string, string]> = [
  ['united states', '🇺🇸'],
  ['usa', '🇺🇸'],
  ['boston', '🇺🇸'],
  ['new york', '🇺🇸'],
  ['massachusetts', '🇺🇸'],
  ['japan', '🇯🇵'],
  ['tokyo', '🇯🇵'],
  ['kyoto', '🇯🇵'],
  ['indonesia', '🇮🇩'],
  ['jakarta', '🇮🇩'],
  ['bali', '🇮🇩'],
  ['turkey', '🇹🇷'],
  ['türkiye', '🇹🇷'],
  ['turkiye', '🇹🇷'],
  ['istanbul', '🇹🇷'],
  ['france', '🇫🇷'],
  ['paris', '🇫🇷'],
  ['south korea', '🇰🇷'],
  ['korea', '🇰🇷'],
  ['seoul', '🇰🇷'],
  ['thailand', '🇹🇭'],
  ['bangkok', '🇹🇭'],
  ['singapore', '🇸🇬'],
  ['taiwan', '🇹🇼'],
  ['hong kong', '🇭🇰'],
  ['malaysia', '🇲🇾'],
  ['italy', '🇮🇹'],
  ['greece', '🇬🇷'],
  ['uae', '🇦🇪'],
];

function inferFlagFromLabel(label?: string | null) {
  const normalized = label?.trim().toLowerCase();
  if (!normalized) return null;
  for (const [keyword, flag] of COUNTRY_FLAG_BY_KEYWORD) {
    if (normalized.includes(keyword)) return flag;
  }
  return null;
}

function deriveFlagsFromTravelHistory(travelHistory: User['travelHistory']) {
  return Array.from(
    new Set(
      travelHistory
        .flatMap((history) => [history.country, ...history.cities])
        .map((label) => inferFlagFromLabel(label))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 5);
}

function getEditorialLabel(place: Place, index = 0) {
  const aiBackedLabel = getAIBackedPlaceLabel(place);
  if (aiBackedLabel) return aiBackedLabel;

  const normalizedTags = place.tags.map((tag) => tag.toLowerCase().replace(/_/g, ' ').trim());
  void index;
  if (normalizedTags.some((tag) => tag.includes('easy pause') || tag.includes('city break'))) return 'Slow Coffee';
  if (normalizedTags.some((tag) => tag.includes('thoughtful stop') || tag.includes('quiet browse'))) return 'Gallery Pause';
  if (normalizedTags.some((tag) => tag.includes('easy wander'))) return 'Easy Detour';

  const fallbackCategory = getDisplayPlaceCategory(place).toLowerCase().trim();
  if (fallbackCategory && fallbackCategory !== 'recommended spot') {
    const conciseCategoryMatchers: Array<{ label: string; matchers: string[] }> = [
      { label: 'Slow Coffee', matchers: ['cafe', 'coffee', 'bakery'] },
      { label: 'Gallery Pause', matchers: ['gallery', 'museum', 'culture'] },
      { label: 'Green Escape', matchers: ['park', 'garden', 'nature'] },
      { label: 'Market Wander', matchers: ['market', 'shopping', 'boutique', 'retail'] },
      { label: 'Late-Night Pour', matchers: ['bar', 'cocktail', 'nightlife'] },
      { label: 'Harbor Reset', matchers: ['waterfront', 'harbor', 'river'] },
      { label: 'Historic Walk', matchers: ['historic', 'monument'] },
    ];
    const categoryMatch = conciseCategoryMatchers.find(({ matchers }) =>
      matchers.some((matcher) => fallbackCategory.includes(matcher)),
    );
    if (categoryMatch) return categoryMatch.label;
    return toEditorialTitleCase(fallbackCategory.replace(/[\/,]+/g, ' '));
  }

  return 'Good Find';
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

function calculateDistanceMiles(
  from?: { latitude?: number; longitude?: number },
  to?: { latitude?: number; longitude?: number },
) {
  const distanceKm = calculateDistanceKm(from, to);
  if (typeof distanceKm !== 'number') return undefined;
  return Math.round(distanceKm * 0.621371 * 10) / 10;
}

function getLocationPermissionHelpMessage() {
  if (typeof navigator === 'undefined') {
    return 'Turn location back on in your browser settings, then try again.';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIPhone = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|chrome/.test(userAgent);

  if (isIPhone && isSafari) {
    return 'Turn Location back on in Safari settings for this site, then tap Allow again.';
  }

  return 'Turn location back on in your browser settings for this site, then try again.';
}

function getLocationEnvironmentHelpMessage() {
  if (typeof window === 'undefined') {
    return 'Location needs a secure connection.';
  }

  if (!window.isSecureContext) {
    return 'Location needs HTTPS on iPhone. Try this on vibinn.club or another secure URL.';
  }

  return 'Location needs a secure connection.';
}

function requestCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
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

function applyRankedVarietyToPlaces(places: Place[], seed: number) {
  if (places.length <= 2) return places;

  const rotate = (bucket: Place[], offset: number) => {
    if (bucket.length <= 1) return bucket;
    const normalizedOffset = ((offset % bucket.length) + bucket.length) % bucket.length;
    return [...bucket.slice(normalizedOffset), ...bucket.slice(0, normalizedOffset)];
  };

  const topBucket: Place[] = [];
  const upperBucket: Place[] = [];
  const baseBucket: Place[] = [];

  places.forEach((place) => {
    const score = place.similarityStat ?? 0;
    if (score >= 88) topBucket.push(place);
    else if (score >= 78) upperBucket.push(place);
    else baseBucket.push(place);
  });

  return [
    ...rotate(topBucket, seed),
    ...rotate(upperBucket, seed * 2 + 1),
    ...rotate(baseBucket, seed * 3 + 2),
  ];
}

const PLACE_INTEREST_MATCHERS: Record<Interest, string[]> = {
  cafe: ['cafe', 'coffee', 'espresso', 'bakery', 'brunch', 'pastry', 'tea', 'roastery', 'easy pause'],
  nature: ['nature', 'park', 'garden', 'waterfront', 'scenic', 'outdoor', 'green', 'lake', 'trail', 'harbor', 'walk'],
  party: ['nightlife', 'bar', 'cocktail', 'rooftop', 'live music', 'music', 'dj', 'club', 'late night', 'jazz', 'speakeasy'],
  culture: ['culture', 'museum', 'gallery', 'historic', 'history', 'arts', 'theatre', 'design', 'bookstore', 'library', 'monument'],
  shopping: ['shopping', 'market', 'boutique', 'concept store', 'mall', 'retail', 'gift', 'design shop', 'bazaar', 'showroom'],
  adventure: ['adventure', 'walkable', 'viewpoint', 'hike', 'trail', 'outdoor', 'easy stop', 'detour', 'quick escape', 'open air'],
};

const PLACE_VIBE_MATCHERS: Record<Vibe, string[]> = {
  aesthetic: ['aesthetic', 'design', 'stylish', 'photo', 'beautiful', 'gallery', 'visual', 'curated'],
  solo: ['solo', 'quiet', 'low key', 'intimate', 'easy pause', 'bookstore', 'museum', 'slow', 'calm'],
  luxury: ['luxury', 'premium', 'fine dining', 'hotel', 'exclusive', 'high end', 'polished', 'elevated'],
  budget: ['budget', 'cheap', 'free', 'casual', 'community', 'street', 'market', 'easy stop'],
  spontaneous: ['spontaneous', 'walkable', 'easy stop', 'drop in', 'quick escape', 'detour', 'open air', 'last minute'],
};

const INTEREST_DEBUG_LABELS: Record<Interest, string> = {
  cafe: 'Cafe hopping',
  nature: 'Nature days',
  party: 'Nightlife & music',
  culture: 'Culture',
  shopping: 'Shopping & markets',
  adventure: 'Spontaneous detours',
};

const VIBE_DEBUG_LABELS: Record<Vibe, string> = {
  aesthetic: 'Aesthetic',
  solo: 'Solo',
  luxury: 'Luxury',
  budget: 'Budget',
  spontaneous: 'Spontaneous',
};

function matchesDebugTerms(haystack: string, terms: string[]) {
  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase().replace(/[_-]+/g, ' ').trim();
    if (!normalizedTerm) return false;
    return haystack.includes(normalizedTerm);
  });
}

function getPlacePreferenceDebugMatches(place: Place, selectedInterests: Interest[], selectedVibe: Vibe | null) {
  const haystack = [
    place.name,
    place.category,
    place.hook,
    place.description,
    place.recommendationReason,
    ...(place.tags ?? []),
    ...(place.whyYoullLikeIt ?? []),
    place.bestTime,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const interestMatches = selectedInterests.filter((interest) =>
    matchesDebugTerms(haystack, PLACE_INTEREST_MATCHERS[interest] ?? []),
  );

  const vibeMatches = selectedVibe && matchesDebugTerms(haystack, PLACE_VIBE_MATCHERS[selectedVibe] ?? [])
    ? [selectedVibe]
    : [];

  const labels = [
    ...interestMatches.map((interest) => INTEREST_DEBUG_LABELS[interest]),
    ...vibeMatches.map((vibe) => VIBE_DEBUG_LABELS[vibe]),
  ].slice(0, 3);

  if (labels.length === 0 && (selectedInterests.length > 0 || selectedVibe)) {
    return ['No strong match'];
  }

  return labels;
}

function getDisplayPlaceCategory(place: Pick<Place, 'category' | 'tags'>) {
  const trimmedCategory = place.category?.trim();
  if (trimmedCategory) return trimmedCategory;

  const firstTag = place.tags.find((tag) => tag?.trim());
  if (firstTag) return firstTag.replace(/[_-]+/g, ' ');

  return 'recommended spot';
}

function shouldExcludeDiscoveryPlace(place: Pick<Place, 'name' | 'category' | 'tags' | 'hook' | 'description' | 'whyYoullLikeIt'>) {
  const haystack = [
    place.name,
    place.category,
    place.hook,
    place.description,
    ...(place.whyYoullLikeIt ?? []),
    ...(place.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const blockedMatchers = [
    'service',
    'services',
    'school',
    'high school',
    'middle school',
    'elementary school',
    'prep school',
    'academy',
    'college',
    'university',
    'campus',
    'student center',
    'education',
    'educational',
    'repair',
    'cell phone repair',
    'phone repair',
    'computer repair',
    'screen repair',
    'lawyer',
    'attorney',
    'legal service',
    'doctor',
    'medical',
    'physician',
    'clinic',
    'hospital',
    'realtor',
    'broker',
    'property management',
    'audiology',
    'hearing',
    'salon',
    'spa',
    'barber',
    'insurance',
    'bank',
    'accounting',
  ];

  if (blockedMatchers.some((matcher) => haystack.includes(matcher))) {
    return true;
  }

  return [
    /\bmd\b/,
    /\bm\.d\.\b/,
    /\bdds\b/,
    /\bdmd\b/,
    /\bdo\b/,
    /\baud\b/,
    /\besq\b/,
    /\bphd\b/,
    /\bod\b/,
    /\brn\b/,
  ].some((pattern) => pattern.test(haystack));
}

function hasRenderableDiscoveryImage(place: Pick<Place, 'image' | 'images'>) {
  const candidates = [place.image, ...(place.images ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());

  if (candidates.length === 0) return false;

  return candidates.some((value) => !value.includes('placehold.co/800x1000/111111/ffffff?text=Place'));
}

function getDisplayEventCategory(event: Pick<EventItem, 'category' | 'tags'>) {
  const trimmedCategory = event.category?.trim();
  if (trimmedCategory && trimmedCategory.toLowerCase() !== 'undefined') return trimmedCategory;

  const firstTag = event.tags.find((tag) => tag?.trim() && tag.trim().toLowerCase() !== 'undefined');
  if (firstTag) return firstTag.replace(/[_-]+/g, ' ');

  return 'live event';
}

const EVENT_INTEREST_MATCHERS: Record<Interest, string[]> = {
  cafe: ['acoustic', 'intimate', 'coffee', 'community', 'listening'],
  nature: ['outdoor', 'park', 'festival', 'garden'],
  party: ['concert', 'music', 'dance', 'dj', 'nightlife', 'festival', 'electronic'],
  culture: ['arts', 'museum', 'gallery', 'cultural', 'classical', 'jazz', 'theatre', 'festival'],
  shopping: ['market', 'fair', 'expo', 'pop up', 'bazaar'],
  adventure: ['sports', 'outdoor', 'active', 'arena', 'race'],
};

const EVENT_VIBE_MATCHERS: Record<Vibe, string[]> = {
  aesthetic: ['visual', 'immersive', 'art', 'design', 'fashion'],
  solo: ['intimate', 'acoustic', 'seated', 'listening', 'jazz'],
  luxury: ['vip', 'premium', 'gala', 'exclusive', 'orchestra'],
  budget: ['free', 'community', 'outdoor', 'festival'],
  spontaneous: ['tonight', 'late', 'drop in', 'last minute', 'after dark'],
};

function getEventPreferenceDebugMatches(event: EventItem, selectedInterests: Interest[], selectedVibe: Vibe | null) {
  const haystack = [
    event.name,
    event.category,
    event.compatibilityReason,
    event.description,
    event.hook,
    event.venueName,
    event.location,
    ...(event.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const interestMatches = selectedInterests.filter((interest) =>
    matchesDebugTerms(haystack, EVENT_INTEREST_MATCHERS[interest] ?? []),
  );

  const vibeMatches = selectedVibe && matchesDebugTerms(haystack, EVENT_VIBE_MATCHERS[selectedVibe] ?? [])
    ? [selectedVibe]
    : [];

  const labels = [
    ...interestMatches.map((interest) => INTEREST_DEBUG_LABELS[interest]),
    ...vibeMatches.map((vibe) => VIBE_DEBUG_LABELS[vibe]),
  ].slice(0, 3);

  if (labels.length === 0 && (selectedInterests.length > 0 || selectedVibe)) {
    return ['No strong match'];
  }

  return labels;
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
    category: getDisplayPlaceCategory(place),
    imageUrl: getSafePlaceImage(place),
    rating: place.rating,
    priceLevel: getPriceLevel(place),
    hook: place.hook ?? place.description,
    vibeTags: place.tags.slice(0, 3).map((tag) => tag.replace(/-/g, ' ')),
    attitudeLabel: getDisplayAttitudeLabel(place) ?? undefined,
    matchScore: place.similarityStat,
    similarityPercentage: place.similarityStat,
    recommendationReason: place.recommendationReason ?? buildPlaceRecommendationReason(place),
    bestTime: place.bestTime,
    visitedByFollowingAvatars: followedTravelerAvatars,
    isVisited: Boolean(place.momentId),
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

function buildAuthenticatedUserDraftFromV2(payload?: V2UserPayload): User {
  const displayName = payload?.displayName?.trim() || payload?.username || payload?.phoneNumber || 'Traveler';
  return {
    id: payload?.id || 'auth-user',
    username: payload?.username || payload?.phoneNumber || 'traveler',
    displayName,
    bio: '',
    avatar: payload?.avatarUrl ? resolveApiAssetUrl(payload.avatarUrl) : getAvatarFallbackUrl(displayName),
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

function resolvePublicProfileUser(username: string | null | undefined, currentUser: User) {
  const normalizedUsername = username?.trim().toLowerCase();
  if (!normalizedUsername) return null;

  if (currentUser.username.toLowerCase() === normalizedUsername) {
    return currentUser;
  }

  if (MOCK_USER.username.toLowerCase() === normalizedUsername) {
    return MOCK_USER;
  }

  return SIMILAR_TRAVELERS.find((traveler) => traveler.username.toLowerCase() === normalizedUsername) ?? null;
}

function getInitialDiscoveryRotationSeed() {
  if (typeof window === 'undefined') return 0;

  const existingSeed = window.sessionStorage.getItem('vibinn:discovery-rotation-seed');
  if (existingSeed) {
    const parsedSeed = Number.parseInt(existingSeed, 10);
    if (Number.isFinite(parsedSeed)) return parsedSeed;
  }

  const nextSeed = Math.floor(Math.random() * 100000);
  window.sessionStorage.setItem('vibinn:discovery-rotation-seed', String(nextSeed));
  return nextSeed;
}

function getStoredDeviceLocation() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEVICE_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number } | null;
    if (
      parsed &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number'
    ) {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      };
    }
  } catch {
    // Ignore malformed persisted location payloads.
  }
  return null;
}

function getStoredDeviceLocationPermission() {
  if (typeof window === 'undefined') return 'unknown' as const;
  const stored = window.localStorage.getItem(DEVICE_LOCATION_PERMISSION_KEY);
  if (stored === 'granted' || stored === 'denied' || stored === 'unsupported') {
    return stored;
  }
  return 'unknown' as const;
}

function getPlaceDetailIdFromLocation() {
  if (typeof window === 'undefined') return null;
  const route = parseAppRoute(window.location.pathname);
  if (route.placeId) {
    return route.placeId;
  }
  return new URLSearchParams(window.location.search).get('place');
}

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const mockReviewMode = isMockReviewModeEnabled();
  const isPublicWebMode = !isNativeApp() && !mockReviewMode;
  const mockReviewScenario = mockReviewMode ? MOCK_REVIEW_SCENARIO : null;
  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    if (typeof window === 'undefined') return 'landing';
    const isMockReview = isMockReviewModeEnabled();
    const route = parseAppRoute(window.location.pathname);
    const placeIdFromShareLink = getPlaceDetailIdFromLocation();
    const hasAccess = hasStoredOnboardingCompletion();

    if (route.screen === 'public-profile') {
      return route.screen;
    }

    if (route.screen === 'collection-detail') {
      return route.screen;
    }

    if (route.screen === 'landing') {
      if (isMockReview) {
        return 'discover-places';
      }
      return isNativeApp()
        ? getNativeDefaultScreen()
        : 'landing';
    }

    if (!isNativeApp() && !isMockReview && !isWebPublicAllowedScreen(route.screen)) {
      return 'landing';
    }

    if (placeIdFromShareLink) {
      return 'place-detail';
    }

    return hasAccess ? route.screen : 'onboarding';
  });
  const [publicProfileUsername, setPublicProfileUsername] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return parseAppRoute(window.location.pathname).publicProfileUsername ?? null;
  });
  const [publicCollectionId, setPublicCollectionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return parseAppRoute(window.location.pathname).collectionId ?? null;
  });
  const [publicProfileUser, setPublicProfileUser] = useState<User | null>(null);
  const [publicProfileBookmarkedPlaces, setPublicProfileBookmarkedPlaces] = useState<Place[]>([]);
  const [publicProfileCollections, setPublicProfileCollections] = useState<PlaceCollection[]>([]);
  const [isPublicProfileLoading, setIsPublicProfileLoading] = useState(false);
  const [isPublicCollectionLoading, setIsPublicCollectionLoading] = useState(false);
  const [publicCollectionError, setPublicCollectionError] = useState<string | null>(null);
  const [onboardingEntryMode, setOnboardingEntryMode] = useState<'area-first' | 'choice' | 'swipe-direct'>('area-first');
  const [user, setUser] = useState<User>(mockReviewScenario?.user ?? MOCK_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(mockReviewMode);
  const isAuthenticatedRef = useRef(false);
  const [authReturnScreen, setAuthReturnScreen] = useState<Screen>('discover-places');
  const [authPrompt, setAuthPrompt] = useState('Log in to keep your travel graph synced.');
  const pendingAuthActionRef = useRef<null | (() => void)>(null);
  const isGoogleScriptLoadedRef = useRef(false);
  const [selectedInterests, setSelectedInterests] = useState<Interest[]>(mockReviewScenario ? [...mockReviewScenario.selectedInterests] : []);
  const [selectedVibe, setSelectedVibe] = useState<Vibe | null>(mockReviewScenario?.selectedVibe ?? null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<User | null>(null);
  const [selectedTravelerBookmarkedPlaces, setSelectedTravelerBookmarkedPlaces] = useState<Place[]>([]);
  const [selectedTravelerCollections, setSelectedTravelerCollections] = useState<PlaceCollection[]>([]);
  const [selectedTravelerHasHydratedDetail, setSelectedTravelerHasHydratedDetail] = useState(false);
  const [selectedTravelerReturnScreen, setSelectedTravelerReturnScreen] = useState<Screen>('discover-travelers');
  const [placeDetailReturnScreen, setPlaceDetailReturnScreen] = useState<Screen>('discover-places');
  const [isTravelerProfileLoading, setIsTravelerProfileLoading] = useState(false);

  useEffect(() => {
    if (!isPublicWebMode) return;
    if (isWebPublicAllowedScreen(currentScreen)) return;

    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
    setCurrentScreen('landing');
  }, [currentScreen, isPublicWebMode]);
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
  });
  const placeDetailCacheRef = useRef(new Map<string, {
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
  }>());
  const [bookmarkedPlaceIds, setBookmarkedPlaceIds] = useState<string[]>(mockReviewScenario?.bookmarkedPlaceIds ?? []);
  const [bookmarkedPlaces, setBookmarkedPlaces] = useState<Place[]>(mockReviewScenario?.bookmarkedPlaces ?? []);
  const [isBookmarkedPlacesLoading, setIsBookmarkedPlacesLoading] = useState(false);
  const [dismissedPlaceIds, setDismissedPlaceIds] = useState<string[]>(mockReviewScenario?.dismissedPlaceIds ?? []);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [shareSheetState, setShareSheetState] = useState<null | {
    title: string;
    text: string;
    url: string;
    allowRecap?: boolean;
  }>(null);
  const [profileRecapState, setProfileRecapState] = useState<null | {
    imageUrl: string;
    title: string;
    fileName: string;
  }>(null);
  const [isProfileRecapGenerating, setIsProfileRecapGenerating] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocationOption[]>(mockReviewScenario?.savedLocations ?? INITIAL_SAVED_LOCATIONS);
  const [activeLocationId, setActiveLocationId] = useState<string>(mockReviewScenario?.activeLocationId ?? INITIAL_SAVED_LOCATIONS[0].id);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(() => getStoredDeviceLocation());
  const [deviceLocationPermission, setDeviceLocationPermission] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>(() => getStoredDeviceLocationPermission());
  const [isRequestingDeviceLocation, setIsRequestingDeviceLocation] = useState(false);
  const hasRequestedDeviceLocationRef = useRef(false);
  const placeDetailHasHistoryEntryRef = useRef(false);
  const [discoveryPlaces, setDiscoveryPlaces] = useState<Place[]>(mockReviewScenario?.discoveryPlaces ?? []);
  const discoveryRotationSeedRef = useRef(getInitialDiscoveryRotationSeed());
  const [discoverySearchInput, setDiscoverySearchInput] = useState('');
  const [discoverySearchQuery, setDiscoverySearchQuery] = useState('');
  const [discoveryEvents, setDiscoveryEvents] = useState<EventItem[]>(mockReviewScenario?.discoveryEvents ?? []);
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
  const [isPreferenceTransitionLoading, setIsPreferenceTransitionLoading] = useState(false);
  const [showDiscoveryGestureDemo, setShowDiscoveryGestureDemo] = useState(false);
  const postPreferencesIntroTimerRef = useRef<number | null>(null);
  const [isFloatingNavHidden, setIsFloatingNavHidden] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<PlaceCollection | null>(null);
  const [selectedCollectionReturnScreen, setSelectedCollectionReturnScreen] = useState<Screen>('bookmarks');
  const [selectedCollectionOwner, setSelectedCollectionOwner] = useState<Pick<User, 'avatar' | 'username' | 'displayName'> | null>(null);
  const [customCollections, setCustomCollections] = useState<PlaceCollection[]>(mockReviewScenario?.customCollections ?? []);
  const [myMoments, setMyMoments] = useState<Array<{ id: string; placeId: string }>>(mockReviewScenario?.myMoments ?? []);
  const [optimisticOwnFeedItems, setOptimisticOwnFeedItems] = useState<Array<
    | {
        id: string;
        type: 'saved' | 'visited';
        traveler: User;
        place: Place;
        activityDate: string;
        caption?: string;
        compatibility?: number;
        sortTimestamp: number;
      }
    | {
        id: string;
        type: 'collection';
        collectionId?: string;
        traveler: User;
        collectionName: string;
        collectionPlaces: Place[];
        activityDate: string;
        caption?: string;
        sortTimestamp: number;
      }
  >>([]);
  const [editableMomentPlace, setEditableMomentPlace] = useState<Place | null>(null);
  const [editableMomentId, setEditableMomentId] = useState<string | null>(null);
  const [createMomentInitialPlace, setCreateMomentInitialPlace] = useState<Place | null>(null);
  const [createMomentInitialVisitedDate, setCreateMomentInitialVisitedDate] = useState<string>('');
  const [createMomentReturnScreen, setCreateMomentReturnScreen] = useState<Screen>('discover-places');
  const previousScreenRef = useRef<Screen>('onboarding');
  const screenScrollPositionsRef = useRef<Partial<Record<Screen, number>>>({});
  const discoveryScrollRestoreRef = useRef<number | null>(null);
  const pendingDiscoveryScrollRestoreRef = useRef<number | null>(null);
  const pendingDiscoveryPlaceAnchorRef = useRef<string | null>(null);
  const pendingDiscoveryViewportOffsetRef = useRef<number | null>(null);
  const skipNextDiscoveryVarietyRef = useRef(false);
  const suppressNextDiscoveryAutoloadRef = useRef(false);
  const previousPreferenceKeyRef = useRef('');
  const forceDiscoveryRefreshAfterAuthRef = useRef(false);
  const lastDiscoveryContextKeyRef = useRef('');
  const ownProfileLastFetchedAtRef = useRef<number>(0);
  const bookmarkedPlacesLastFetchedAtRef = useRef<number>(0);
  const travelerProfileCacheRef = useRef(new Map<string, { cachedAt: number; traveler: User; bookmarks: Place[]; collections: PlaceCollection[] }>());

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!mockReviewScenario) return;

    isAuthenticatedRef.current = true;
    setIsAuthenticated(true);
    setUser(mockReviewScenario.user);
    setSelectedInterests([...mockReviewScenario.selectedInterests]);
    setSelectedVibe(mockReviewScenario.selectedVibe);
    setSavedLocations(mockReviewScenario.savedLocations);
    setActiveLocationId(mockReviewScenario.activeLocationId);
    setDiscoveryPlaces(mockReviewScenario.discoveryPlaces);
    setDiscoveryEvents(mockReviewScenario.discoveryEvents);
    setBookmarkedPlaceIds(mockReviewScenario.bookmarkedPlaceIds);
    setBookmarkedPlaces(mockReviewScenario.bookmarkedPlaces);
    setDismissedPlaceIds(mockReviewScenario.dismissedPlaceIds);
    setCustomCollections(mockReviewScenario.customCollections);
    setMyMoments(mockReviewScenario.myMoments);
    Object.entries(mockReviewScenario.placeDetailBundles).forEach(([placeId, bundle]) => {
      placeDetailCacheRef.current.set(placeId, bundle);
    });
  }, [mockReviewScenario]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousScreen = previousScreenRef.current;
    const previousScreenScrollTop =
      previousScreen === 'discover-places' && discoveryScrollRestoreRef.current !== null
        ? discoveryScrollRestoreRef.current
        : window.scrollY;
    screenScrollPositionsRef.current[previousScreen] = previousScreenScrollTop;

    const isDiscoveryOverlayScreen =
      (currentScreen === 'place-detail' && placeDetailReturnScreen === 'discover-places')
      || currentScreen === 'event-detail';

    const shouldRestorePreviousPosition =
      currentScreen === 'discover-places' ||
      currentScreen === 'discover-travelers' ||
      currentScreen === 'bookmarks' ||
      isDiscoveryOverlayScreen;

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
    placeDetailReturnScreen,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentScreen !== 'discover-places') return;

    const targetScrollTop = pendingDiscoveryScrollRestoreRef.current;
    const targetPlaceId = pendingDiscoveryPlaceAnchorRef.current;
    if (targetScrollTop === null && !targetPlaceId) return;

    let attemptCount = 0;
    let timeoutId: number | null = null;

    const tryRestore = () => {
      const anchorElement = targetPlaceId
        ? document.querySelector<HTMLElement>(`[data-discovery-place-id="${CSS.escape(targetPlaceId)}"]`)
        : null;

      if (anchorElement) {
        const nextTop = Math.max(
          0,
          anchorElement.getBoundingClientRect().top + window.scrollY - Math.max(116, window.innerHeight * 0.18),
        );
        window.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = nextTop;
        document.body.scrollTop = nextTop;
      } else if (targetScrollTop !== null) {
        const maxScrollableTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const nextTop = Math.min(targetScrollTop, maxScrollableTop);
        window.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = nextTop;
        document.body.scrollTop = nextTop;
      }

      const anchorTop = anchorElement?.getBoundingClientRect().top ?? null;
      const maxScrollableTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const hasEnoughHeight = targetScrollTop === null || maxScrollableTop >= targetScrollTop - 4;
      const isRestored = anchorElement
        ? Math.abs(anchorTop - Math.max(116, window.innerHeight * 0.18)) < 28
        : targetScrollTop !== null
          ? Math.abs(window.scrollY - Math.min(targetScrollTop, maxScrollableTop)) < 4
          : false;

      attemptCount += 1;
      if ((isRestored && hasEnoughHeight) || attemptCount >= 12) {
        pendingDiscoveryScrollRestoreRef.current = null;
        pendingDiscoveryPlaceAnchorRef.current = null;
        return;
      }

      timeoutId = window.setTimeout(tryRestore, 120);
    };

    const frameId = window.requestAnimationFrame(tryRestore);
    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [currentScreen, discoveryPlaces.length, isDiscoveryPlacesLoadingMore, isDiscoveryPlacesLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (deviceLocation) {
      window.localStorage.setItem(DEVICE_LOCATION_KEY, JSON.stringify(deviceLocation));
    } else {
      window.localStorage.removeItem(DEVICE_LOCATION_KEY);
    }
  }, [deviceLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (deviceLocationPermission === 'unknown') {
      window.localStorage.removeItem(DEVICE_LOCATION_PERMISSION_KEY);
      return;
    }

    window.localStorage.setItem(DEVICE_LOCATION_PERMISSION_KEY, deviceLocationPermission);
  }, [deviceLocationPermission]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (deviceLocationPermission === 'granted' && deviceLocation) return;
    if (!('permissions' in navigator) || typeof navigator.permissions.query !== 'function') return;

    let isCancelled = false;

    void navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (isCancelled) return;
        if (status.state === 'granted') {
          setDeviceLocationPermission('granted');
        } else if (status.state === 'denied') {
          setDeviceLocationPermission('denied');
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [deviceLocation, deviceLocationPermission]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const route = parseAppRoute(window.location.pathname);
      const hasAccess = hasStoredOnboardingCompletion();

      if (route.screen === 'public-profile') {
        placeDetailHasHistoryEntryRef.current = false;
        setPublicProfileUsername(route.publicProfileUsername ?? null);
        setPublicCollectionId(null);
        setCurrentScreen('public-profile');
        return;
      }

      if (route.screen === 'collection-detail' && route.collectionId) {
        placeDetailHasHistoryEntryRef.current = false;
        setPublicProfileUsername(null);
        setPublicCollectionId(route.collectionId);
        setCurrentScreen('collection-detail');
        return;
      }

      const placeIdFromRoute = getPlaceDetailIdFromLocation();
      if (placeIdFromRoute) {
        placeDetailHasHistoryEntryRef.current = false;
        setPublicProfileUsername(null);
        if (selectedPlace?.id !== placeIdFromRoute) {
          setSelectedPlace(null);
        }
        setCurrentScreen('place-detail');
        return;
      }

      if (route.screen === 'landing') {
        placeDetailHasHistoryEntryRef.current = false;
        setCurrentScreen(
          isNativeApp()
            ? (hasAccess ? 'discover-places' : 'onboarding')
            : 'landing',
        );
        return;
      }

      placeDetailHasHistoryEntryRef.current = false;
      setPublicProfileUsername(null);
      setPublicCollectionId(null);
      setCurrentScreen(hasAccess ? route.screen : 'onboarding');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const sharedPlaceId = getSharedPlaceIdFromUrl();
    if (currentScreen !== 'place-detail' || !sharedPlaceId || selectedPlace?.id === sharedPlaceId) return;

    void api.getPlaceDetails(sharedPlaceId)
      .then((response) => {
        setSelectedPlace(response.place as Place);
      })
      .catch(() => {
        showActionToast('Could not load that shared place right now');
        setCurrentScreen(isNativeApp() ? getNativeDefaultScreen() : 'landing');
      });
  }, [currentScreen, selectedPlace]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const route = parseAppRoute(window.location.pathname);
    if (route.screen === 'collection-detail' && route.collectionId) {
      if (currentScreen !== 'collection-detail' || publicCollectionId !== route.collectionId) {
        setPublicProfileUsername(null);
        setPublicCollectionId(route.collectionId);
        setCurrentScreen('collection-detail');
      }
      return;
    }

    if (route.screen === 'public-profile' && route.publicProfileUsername) {
      if (currentScreen === 'traveler-profile' && selectedTraveler?.username === route.publicProfileUsername) {
        return;
      }
      if (currentScreen === 'profile' && user.username === route.publicProfileUsername) {
        return;
      }
      if (currentScreen !== 'public-profile' || publicProfileUsername !== route.publicProfileUsername) {
        setPublicCollectionId(null);
        setPublicProfileUsername(route.publicProfileUsername);
        setCurrentScreen('public-profile');
      }
      return;
    }

    if (window.location.pathname === '/' && currentScreen !== 'landing' && currentScreen !== 'public-profile' && currentScreen !== 'collection-detail') {
      setPublicProfileUsername(null);
      setPublicCollectionId(null);
      setCurrentScreen(
        isNativeApp()
          ? getNativeDefaultScreen()
          : 'landing',
      );
      return;
    }

    let nextPath = '/';
    if (currentScreen === 'public-profile') {
      const username = publicProfileUsername ?? user.username;
      nextPath = buildCanonicalProfilePath(username);
    } else if (currentScreen === 'traveler-profile' && selectedTraveler?.username) {
      nextPath = buildCanonicalProfilePath(selectedTraveler.username);
    } else if (currentScreen === 'collection-detail' && publicCollectionId) {
      nextPath = buildPublicCollectionPath(publicCollectionId);
    } else if (currentScreen === 'place-detail') {
      nextPath = selectedPlace?.id ? buildPlaceDetailPath(selectedPlace.id) : window.location.pathname;
    } else if (currentScreen !== 'landing') {
      nextPath = screenToAppPath(currentScreen);
    }

    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  }, [currentScreen, publicProfileUsername, publicCollectionId, selectedPlace?.id, selectedTraveler?.username, user.username]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNativeApp()) return;
    if (window.location.pathname !== '/') return;

    const nextScreen = getNativeDefaultScreen();
    const nextPath = screenToAppPath(nextScreen);
    window.history.replaceState({}, '', nextPath);
    if (currentScreen === 'landing') {
      setCurrentScreen(nextScreen);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (currentScreen !== 'landing') return;
    setCurrentScreen(getNativeDefaultScreen());
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen !== 'public-profile') {
      setIsPublicProfileLoading(false);
      setPublicProfileUser(null);
      setPublicProfileBookmarkedPlaces([]);
      setPublicProfileCollections([]);
      return;
    }

    if (mockReviewScenario) {
      const localResolvedUser = resolvePublicProfileUser(publicProfileUsername, user);
      if (localResolvedUser) {
        setPublicProfileUser(localResolvedUser);
        setPublicProfileBookmarkedPlaces(localResolvedUser.recentSavedPlaces?.map((entry) => entry.place) ?? []);
        setPublicProfileCollections(
          (localResolvedUser.recentCollections ?? []).map((collection) => ({
            id: collection.id,
            label: collection.label,
            createdAt: collection.createdAt,
            places: collection.places,
          })),
        );
        setIsPublicProfileLoading(false);
        return;
      }
    }

    if (!publicProfileUsername?.trim()) {
      setPublicProfileUser(null);
      setPublicProfileBookmarkedPlaces([]);
      setPublicProfileCollections([]);
      setIsPublicProfileLoading(false);
      return;
    }

    let isCancelled = false;
    setIsPublicProfileLoading(true);

    void api.getPublicProfile(publicProfileUsername)
      .then((response) => {
        if (isCancelled) return;
        setPublicProfileUser(response.user as User);
        setPublicProfileBookmarkedPlaces((response.bookmarks ?? []) as Place[]);
        setPublicProfileCollections(
          (response.collections ?? []).map((collection) => ({
            id: collection.id,
            label: collection.label,
            createdAt: collection.createdAt,
            places: collection.places as Place[],
          })),
        );
      })
      .catch(() => {
        if (isCancelled) return;
        setPublicProfileUser(null);
        setPublicProfileBookmarkedPlaces([]);
        setPublicProfileCollections([]);
      })
      .finally(() => {
        if (isCancelled) return;
        setIsPublicProfileLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentScreen, publicProfileUsername, user, mockReviewScenario]);

  useEffect(() => {
    if (currentScreen !== 'collection-detail' || !publicCollectionId) return;

    let isCancelled = false;
    setSelectedCollectionReturnScreen('landing');
    setIsPublicCollectionLoading(true);
    setPublicCollectionError(null);

    void api.getPublicCollection(publicCollectionId)
      .then((response) => {
        if (isCancelled) return;
        setSelectedCollection(response.collection as PlaceCollection);
        setSelectedCollectionOwner({
          avatar: response.owner.avatar,
          username: response.owner.username,
          displayName: response.owner.displayName,
        });
      })
      .catch(() => {
        if (isCancelled) return;
        setSelectedCollection(null);
        setSelectedCollectionOwner(null);
        setPublicCollectionError('Collection not found');
      })
      .finally(() => {
        if (isCancelled) return;
        setIsPublicCollectionLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentScreen, publicCollectionId]);

  useEffect(() => {
    if (currentScreen === 'landing' || currentScreen === 'public-profile') return;
    if (currentScreen === 'collection-detail' && publicCollectionId) return;

    const hasAccess = hasStoredOnboardingCompletion();
    if (!hasAccess && currentScreen !== 'onboarding') {
      setCurrentScreen('onboarding');
    }
  }, [currentScreen]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDiscoverySearchQuery(discoverySearchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [discoverySearchInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resyncDeviceLocationPermission = () => {
      if (document.visibilityState === 'hidden') return;
      if (currentScreen !== 'discover-places' && currentScreen !== 'place-detail') return;
      if (deviceLocation) return;

      hasRequestedDeviceLocationRef.current = false;
      setDeviceLocationPermission('unknown');
    };

    window.addEventListener('focus', resyncDeviceLocationPermission);
    window.addEventListener('pageshow', resyncDeviceLocationPermission);
    document.addEventListener('visibilitychange', resyncDeviceLocationPermission);

    return () => {
      window.removeEventListener('focus', resyncDeviceLocationPermission);
      window.removeEventListener('pageshow', resyncDeviceLocationPermission);
      document.removeEventListener('visibilitychange', resyncDeviceLocationPermission);
    };
  }, [currentScreen, deviceLocation]);

  // Handle onboarding completion
  const completeOnboarding = async (override?: { selectedInterests?: Interest[]; selectedVibe?: Vibe | null; activeLocationId?: string }) => {
    const nextSelectedInterests = override?.selectedInterests ?? selectedInterests;
    const nextSelectedVibe = override?.selectedVibe ?? selectedVibe;
    const nextActiveLocationId = override?.activeLocationId ?? activeLocationId;
    const activeLocation = savedLocations.find((location) => location.id === nextActiveLocationId) ?? savedLocations[0];

    setSelectedInterests(nextSelectedInterests);
    setSelectedVibe(nextSelectedVibe ?? null);
    if (nextActiveLocationId !== activeLocationId) {
      setActiveLocationId(nextActiveLocationId);
    }

    if (isAuthenticated) {
      void api.savePreferences({
        selectedInterests: nextSelectedInterests,
        selectedVibe: nextSelectedVibe,
        skippedPreferences: nextSelectedInterests.length === 0 && !nextSelectedVibe,
        onboardingCompleted: true,
      });
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
    }
    setDiscoveryPlaces([]);
    setDiscoveryEvents([]);
    setDiscoveryPage(1);
    setDiscoveryHasMore(true);
    setIsPreferenceTransitionLoading(true);
    setOnboardingEntryMode('area-first');
    if (activeLocation) {
      lastDiscoveryContextKeyRef.current = buildDiscoveryContextKey({
        locationId: activeLocation.id,
        locationLabel: activeLocation.label,
        locationType: activeLocation.type,
        searchQuery: discoverySearchQuery,
        selectedInterests: nextSelectedInterests,
        selectedVibe: nextSelectedVibe ?? null,
      });
    } else {
      lastDiscoveryContextKeyRef.current = '';
    }
    previousPreferenceKeyRef.current = `${[...nextSelectedInterests].sort().join(',')}|${nextSelectedVibe ?? ''}`;
    suppressNextDiscoveryAutoloadRef.current = true;
    setCurrentScreen('discover-places');
    setShowDiscoveryGestureDemo(nextSelectedInterests.length > 0 || Boolean(nextSelectedVibe));
    if (postPreferencesIntroTimerRef.current) {
      window.clearTimeout(postPreferencesIntroTimerRef.current);
    }
    const releaseTransitionLoading = () => {
      setIsPreferenceTransitionLoading(false);
    };
    const transitionFallbackTimer = window.setTimeout(releaseTransitionLoading, 900);
    void loadDiscoveryPlaces(1, 'reset', {
      preferencesOverride: { selectedInterests: nextSelectedInterests, selectedVibe: nextSelectedVibe },
    }).finally(() => {
      window.clearTimeout(transitionFallbackTimer);
      releaseTransitionLoading();
    });
    window.setTimeout(() => {
      void loadDiscoveryEvents({ selectedInterests: nextSelectedInterests, selectedVibe: nextSelectedVibe });
    }, 650);
  };

  const showActionToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => {
      setActionToast((current) => (current === message ? null : current));
    }, 1800);
  };

  const bumpDiscoveryRotationSeed = () => {
    discoveryRotationSeedRef.current += 1;
    return discoveryRotationSeedRef.current;
  };

  const buildAnalyticsUserContext = () => {
    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0] ?? null;
    return {
      user_id: isAuthenticated ? user.id : null,
      username: isAuthenticated ? user.username : null,
      is_authenticated: isAuthenticated,
      active_location_id: activeLocationId,
      active_location_label: activeLocation?.label ?? null,
      active_location_type: activeLocation?.type ?? null,
      selected_interests: selectedInterests,
      selected_vibe: selectedVibe,
    };
  };

  const buildPlaceAnalyticsContext = (
    place: Place,
    metadata?: {
      positionInFeed?: number;
      currentPage?: number;
      sourceScreen?: Screen;
      action?: 'save' | 'hide' | 'open_detail';
    },
  ) => ({
    ...buildAnalyticsUserContext(),
    place_id: place.id,
    place_name: place.name,
    place_category: place.category ?? null,
    place_location: place.location,
    place_match_score: place.similarityStat ?? null,
    place_tags: place.tags,
    position_in_feed: metadata?.positionInFeed ?? null,
    current_page: metadata?.currentPage ?? null,
    source_screen: metadata?.sourceScreen ?? currentScreen,
    action: metadata?.action ?? null,
  });

  const openApp = () => {
    const hasAccess = hasStoredOnboardingCompletion();
    const targetScreen: Screen = hasAccess ? 'discover-places' : 'onboarding';
    setPublicProfileUsername(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', screenToAppPath(targetScreen));
    }
    setCurrentScreen(targetScreen);
  };

  const openAppStore = () => {
    if (typeof window === 'undefined') return;
    window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
  };

  const disableMockReviewMode = () => {
    if (typeof window === 'undefined') return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete(MOCK_REVIEW_QUERY_PARAM);
    window.location.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  };

  const openPublicProfile = (username?: string) => {
    const resolvedUsername = username ?? user.username;
    if (typeof window !== 'undefined') {
      const nextPath = buildCanonicalProfilePath(resolvedUsername);
      if (`${window.location.pathname}${window.location.search}` !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    }
    setPublicProfileUsername(resolvedUsername);
    setCurrentScreen('public-profile');
  };

  const openPlaceDetail = (place: Place, returnScreen: Screen = 'discover-places') => {
    setPlaceDetailReturnScreen(returnScreen);
    if (typeof window !== 'undefined' && returnScreen === 'discover-places') {
      discoveryScrollRestoreRef.current = window.scrollY;
      pendingDiscoveryPlaceAnchorRef.current = place.id;
      const anchorElement = document.querySelector<HTMLElement>(`[data-discovery-place-id="${CSS.escape(place.id)}"]`);
      pendingDiscoveryViewportOffsetRef.current = anchorElement?.getBoundingClientRect().top ?? null;
    }
    if (typeof window !== 'undefined') {
      const nextPath = buildPlaceDetailPath(place.id);
      if (`${window.location.pathname}${window.location.search}` !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
      placeDetailHasHistoryEntryRef.current = true;
    }
    setSelectedPlace(place);
    const cached = placeDetailCacheRef.current.get(place.id);
    if (cached) {
      setRelatedPlaces(cached.relatedPlaces);
      setPlaceTravelerMoments(cached.travelerMoments);
      setPlaceDetailInteraction({
        isSaved: cached.interactionState.bookmarkedPlaceIds.includes(place.id),
        isBeenThere: cached.interactionState.beenTherePlaceIds.includes(place.id),
      });
    }
    setCurrentScreen('place-detail');
  };

  const requestDeviceLocation = async () => {
    const supportsBrowserGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;
    if (!isNativeApp() && !supportsBrowserGeolocation) {
      setDeviceLocationPermission('unsupported');
      showActionToast('Location is not supported on this browser');
      return;
    }

    if (!isNativeApp() && typeof window !== 'undefined' && !window.isSecureContext) {
      setDeviceLocationPermission('unknown');
      showActionToast(getLocationEnvironmentHelpMessage());
      return;
    }

    setDeviceLocationPermission('unknown');
    hasRequestedDeviceLocationRef.current = true;
    setIsRequestingDeviceLocation(true);

    try {
      const position = isNativeApp()
        ? await getCurrentDevicePosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60 * 1000,
        }).catch(async () => getCurrentDevicePosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 10 * 60 * 1000,
        }))
        : await requestCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60 * 1000,
        }).catch(async (error) => {
          const geoError = error as GeolocationPositionError;
          if (geoError?.code === geoError.PERMISSION_DENIED) {
            throw geoError;
          }

          return requestCurrentPosition({
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 10 * 60 * 1000,
          });
        });

      setDeviceLocation({
        latitude: 'coords' in position ? position.coords.latitude : position.latitude,
        longitude: 'coords' in position ? position.coords.longitude : position.longitude,
      });
      setDeviceLocationPermission('granted');
      showActionToast('Location enabled');
    } catch (error) {
      const geoError = error as GeolocationPositionError | Error;
      if ('code' in geoError && geoError.code === 1) {
        setDeviceLocationPermission('denied');
        showActionToast(getLocationPermissionHelpMessage());
      } else if ('code' in geoError && geoError.code === 2) {
        setDeviceLocationPermission('unknown');
        showActionToast('Location services could not find you');
      } else if ('code' in geoError && geoError.code === 3) {
        setDeviceLocationPermission('unknown');
        showActionToast('Location check timed out');
      } else {
        setDeviceLocationPermission('unknown');
        showActionToast(geoError.message || 'Could not get your location right now');
      }
    } finally {
      setIsRequestingDeviceLocation(false);
    }
  };

  const refreshOwnProfile = async (options?: { force?: boolean }) => {
    if (mockReviewScenario) {
      setUser(mockReviewScenario.user);
      setCustomCollections(mockReviewScenario.customCollections);
      setMyMoments(mockReviewScenario.myMoments);
      setBookmarkedPlaces(mockReviewScenario.bookmarkedPlaces);
      setIsBookmarkedPlacesLoading(false);
      setBookmarkedPlaceIds(mockReviewScenario.bookmarkedPlaceIds);
      bookmarkedPlacesLastFetchedAtRef.current = Date.now();
      ownProfileLastFetchedAtRef.current = Date.now();
      return;
    }

    const shouldReuseRecentProfile = (
      !options?.force &&
      ownProfileLastFetchedAtRef.current > 0 &&
      Date.now() - ownProfileLastFetchedAtRef.current < OWN_PROFILE_CACHE_TTL_MS
    );
    if (shouldReuseRecentProfile) return;

    try {
      const response = await api.getProfileMe();
      setUser(response.user as User);
      setBookmarkedPlaces(response.bookmarks as Place[]);
      setIsBookmarkedPlacesLoading(false);
      bookmarkedPlacesLastFetchedAtRef.current = Date.now();
      setCustomCollections(
        response.collections.map((collection) => ({
          id: collection.id,
          label: collection.label,
          createdAt: collection.createdAt,
          places: collection.places as Place[],
        })),
      );
      setMyMoments(
        response.moments.map((moment) => ({
          id: String(moment.id),
          placeId: String(moment.placeId),
        })),
      );
      ownProfileLastFetchedAtRef.current = Date.now();
    } catch {
      showActionToast('Could not sync profile right now');
    }
  };

  const applyAuthenticatedBootstrapState = async (options?: {
    guestPreferences?: {
      selectedInterests: Interest[];
      selectedVibe: Vibe | null;
    };
    includeProfile?: boolean;
  }) => {
    if (mockReviewScenario) {
      setUser(mockReviewScenario.user);
      setBookmarkedPlaces(mockReviewScenario.bookmarkedPlaces);
      setIsBookmarkedPlacesLoading(false);
      setBookmarkedPlaceIds(mockReviewScenario.bookmarkedPlaceIds);
      bookmarkedPlacesLastFetchedAtRef.current = Date.now();
      setDismissedPlaceIds(mockReviewScenario.dismissedPlaceIds);
      setSavedLocations(mockReviewScenario.savedLocations);
      setActiveLocationId(mockReviewScenario.activeLocationId);
      setCustomCollections(mockReviewScenario.customCollections);
      setMyMoments(mockReviewScenario.myMoments);
      setSelectedInterests([...mockReviewScenario.selectedInterests]);
      setSelectedVibe(mockReviewScenario.selectedVibe);
      ownProfileLastFetchedAtRef.current = Date.now();
      return {
        selectedInterests: [...mockReviewScenario.selectedInterests] as Interest[],
        selectedVibe: mockReviewScenario.selectedVibe as Vibe | null,
      };
    }

    try {
      const [profileResponse, signalsResponse, savedLocationsResponse] = await Promise.all([
        options?.includeProfile ? api.getProfileMe() : Promise.resolve(null),
        api.getPersonalizationSignals().catch(() => null),
        api.getSavedLocations().catch(() => null),
      ]);

      if (profileResponse) {
        setUser(profileResponse.user as User);
        setCustomCollections(
          profileResponse.collections.map((collection) => ({
            id: collection.id,
            label: collection.label,
            createdAt: collection.createdAt,
            places: collection.places as Place[],
          })),
        );
        setMyMoments(
          profileResponse.moments.map((moment) => ({
            id: String(moment.id),
            placeId: String(moment.placeId),
          })),
        );
        setBookmarkedPlaces(profileResponse.bookmarks as Place[]);
        setIsBookmarkedPlacesLoading(false);
        bookmarkedPlacesLastFetchedAtRef.current = Date.now();
        ownProfileLastFetchedAtRef.current = Date.now();
      }

      let effectiveSelectedInterests = (signalsResponse?.selectedInterests ?? []) as Interest[];
      let effectiveSelectedVibe = (signalsResponse?.selectedVibe as Vibe | null | undefined) ?? null;
      const guestSelectedInterests = options?.guestPreferences?.selectedInterests ?? [];
      const guestSelectedVibe = options?.guestPreferences?.selectedVibe ?? null;
      const shouldHydrateGuestPreferences = (
        (guestSelectedInterests.length > 0 || guestSelectedVibe)
        && effectiveSelectedInterests.length === 0
        && !effectiveSelectedVibe
      );

      if (shouldHydrateGuestPreferences) {
        effectiveSelectedInterests = guestSelectedInterests;
        effectiveSelectedVibe = guestSelectedVibe;

        void api.savePreferences({
          selectedInterests: guestSelectedInterests,
          selectedVibe: guestSelectedVibe,
          skippedPreferences: guestSelectedInterests.length === 0 && !guestSelectedVibe,
          onboardingCompleted: hasStoredOnboardingCompletion(),
        }).catch(() => undefined);
      }

      if (signalsResponse) {
        setBookmarkedPlaceIds(signalsResponse.bookmarkedPlaceIds);
        setDismissedPlaceIds(signalsResponse.dismissedPlaceIds);
      }

      setSelectedInterests(effectiveSelectedInterests);
      setSelectedVibe(effectiveSelectedVibe);

      if (savedLocationsResponse) {
        const nextLocations = savedLocationsResponse.locations as SavedLocationOption[];
        const currentActiveLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
        if (nextLocations.length > 0) {
          const matchingCurrentLocation = currentActiveLocation
            ? nextLocations.find((location) =>
              location.type === currentActiveLocation.type &&
              location.label.trim().toLowerCase() === currentActiveLocation.label.trim().toLowerCase(),
            )
            : null;
          const mergedLocations = mergeSavedLocations(savedLocations, nextLocations);

          setSavedLocations(mergedLocations);
          setActiveLocationId(
            matchingCurrentLocation?.id ??
            currentActiveLocation?.id ??
            savedLocationsResponse.activeLocationId ??
            mergedLocations[0].id,
          );
        }
      }

      return {
        selectedInterests: effectiveSelectedInterests,
        selectedVibe: effectiveSelectedVibe,
      };
    } catch {
      showActionToast('Could not sync profile right now');
      return {
        selectedInterests: options?.guestPreferences?.selectedInterests ?? selectedInterests,
        selectedVibe: options?.guestPreferences?.selectedVibe ?? selectedVibe,
      };
    }
  };

  const openAuthGate = (message: string, mode: 'login' | 'register' = 'login', action?: () => void) => {
    pendingAuthActionRef.current = action ?? null;
    setAuthPrompt(message);
    setAuthReturnScreen(currentScreen === 'login' || currentScreen === 'register' ? 'discover-places' : currentScreen);
    setCurrentScreen(mode);
  };

  const getSharedPlaceIdFromUrl = () => {
    return getPlaceDetailIdFromLocation();
  };

  const buildPlaceShareUrl = (placeId: string) => {
    if (typeof window === 'undefined') return buildPlaceDetailPath(placeId);
    return `${window.location.origin}${buildPlaceDetailPath(placeId)}`;
  };

  const buildPublicProfileShareUrl = (username?: string) => {
    const resolvedUsername = username ?? user.username;
    const path = buildCanonicalProfilePath(resolvedUsername);
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  };

  const buildPublicCollectionShareUrl = (collectionId?: string) => {
    const resolvedCollectionId = collectionId ?? selectedCollection?.id;
    if (!resolvedCollectionId) {
      if (typeof window === 'undefined') return APP_BASE_PATH;
      return `${window.location.origin}${APP_BASE_PATH}`;
    }
    const path = buildPublicCollectionPath(resolvedCollectionId);
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  };

  const openShareSheet = (input: { url: string; title: string; text: string; allowRecap?: boolean }) => {
    setShareSheetState(input);
  };

  const copyText = async (value: string) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall back to manual copy below.
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  };

  const shareUrl = async (input: { url: string; title: string; text: string; successToast: string }) => {
    if (isNativeApp()) {
      try {
        await shareNativeContent({
          url: input.url,
          title: input.title,
          text: input.text,
        });
        showActionToast(input.successToast);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('abort') || message.includes('cancel')) return;
      }
    }

    if (typeof window !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          url: input.url,
          title: input.title,
          text: input.text,
        });
        showActionToast(input.successToast);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('abort') || message.includes('cancel')) return;
      }
    }

    if (await copyText(input.url)) {
      showActionToast('Link copied');
      return;
    }

    showActionToast(input.url);
  };

  const shareGeneratedImage = async (dataUrl: string, fileName: string) => {
    if (isNativeApp()) {
      try {
        await shareNativeContent({
          title: 'Vibinn travel recap',
          text: 'My Vibinn travel recap',
          files: [dataUrl],
        });
        showActionToast('Share sheet opened');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('abort') || message.includes('cancel')) {
          return false;
        }
      }
    }

    if (typeof window !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = dataUrlToFile(dataUrl, fileName);
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Vibinn travel recap',
            text: 'My Vibinn travel recap',
          });
          showActionToast('Share sheet opened');
          return true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('abort') || message.includes('cancel')) {
          return false;
        }
      }
    }

    return false;
  };

  const downloadDataUrl = (dataUrl: string, fileName: string) => {
    if (typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const generateProfileRecap = async () => {
    if (isProfileRecapGenerating) return;

    setIsProfileRecapGenerating(true);

    try {
      const ownPlaces = user.travelHistory.flatMap((history) => history.places ?? []);
      const flags = (user.flags?.length ? user.flags : deriveFlagsFromTravelHistory(user.travelHistory)).slice(0, 8);
      const profileUrl = buildPublicProfileShareUrl(user.username);
      const profileName = user.displayName ?? user.username;
      const uniquePlaceCount = new Set(ownPlaces.map((place) => place.id)).size;

      const interactionState = await api.getInteractionState({
        placeIds: ownPlaces.map((place) => place.id),
        momentIds: ownPlaces.map((place) => place.momentId).filter(Boolean) as string[],
        profileIds: [user.id],
      }).catch(() => null);

      const vibinCount = interactionState?.profileVibinCounts?.[user.id] ?? user.vibinCount ?? 0;
      const descriptor = user.descriptor?.trim() || 'A traveler building a taste graph through every save and moment.';
      const avatarInitials = (profileName || user.username)
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const recapMediaCandidates = ownPlaces
        .flatMap((place) => {
          const momentMedia = (place.momentMedia ?? [])
            .filter((item) => item.mediaType === 'image' && item.url)
            .map((item, index) => ({ url: item.url, key: `${place.id}-moment-${index}`, placeName: place.name }));
          if (momentMedia.length > 0) return momentMedia;
          const galleryImages = (place.images?.length ? place.images : [place.image])
            .filter(Boolean)
            .map((url, index) => ({ url, key: `${place.id}-image-${index}`, placeName: place.name }));
          return galleryImages;
        })
        .filter((item, index, array) => item.url && array.findIndex((candidate) => candidate.url === item.url) === index)
        .slice(0, 3);

      const [avatarDataUrl, ...mediaDataUrls] = await Promise.all([
        fetchAssetAsDataUrl(user.avatar),
        ...recapMediaCandidates.map((item) => fetchAssetAsDataUrl(item.url)),
      ]);

      const fallbackPalette = ['#d6ff72', '#7be7ff', '#ff8cc6'];
      const photoFrames = [0, 1, 2].map((index) => mediaDataUrls[index] ?? null);
      const topPlaces = recapMediaCandidates.map((item) => item.placeName)
        .filter(Boolean)
        .filter((placeName, index, allPlaces) => allPlaces.findIndex((candidate) => candidate === placeName) === index)
        .slice(0, 3);
      const descriptorLines = wrapSvgText(descriptor, 28).slice(0, 3);
      const profileUrlLines = wrapSvgText(profileUrl.replace(/^https?:\/\//, ''), 30).slice(0, 2);
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not create recap canvas');
      }

      context.fillStyle = '#0b1020';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const baseGradient = context.createLinearGradient(0, 0, 1080, 1920);
      baseGradient.addColorStop(0, '#09090b');
      baseGradient.addColorStop(0.5, '#111827');
      baseGradient.addColorStop(1, '#1b0b2e');
      context.fillStyle = baseGradient;
      context.fillRect(0, 0, 1080, 1920);

      const glowA = context.createRadialGradient(250, 240, 20, 250, 240, 320);
      glowA.addColorStop(0, 'rgba(214,255,114,0.72)');
      glowA.addColorStop(1, 'rgba(214,255,114,0)');
      context.fillStyle = glowA;
      context.fillRect(0, 0, 1080, 1920);

      const glowB = context.createRadialGradient(820, 360, 20, 820, 360, 280);
      glowB.addColorStop(0, 'rgba(123,231,255,0.36)');
      glowB.addColorStop(1, 'rgba(123,231,255,0)');
      context.fillStyle = glowB;
      context.fillRect(0, 0, 1080, 1920);

      const glowC = context.createRadialGradient(760, 1460, 20, 760, 1460, 320);
      glowC.addColorStop(0, 'rgba(255,140,198,0.22)');
      glowC.addColorStop(1, 'rgba(255,140,198,0)');
      context.fillStyle = glowC;
      context.fillRect(0, 0, 1080, 1920);

      drawRoundedRect(context, 56, 56, 968, 1808, 72);
      context.fillStyle = 'rgba(0,0,0,0.28)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.08)';
      context.lineWidth = 2;
      context.stroke();

      context.save();
      drawRoundedRect(context, 104, 144, 168, 168, 84);
      context.fillStyle = 'rgba(255,255,255,0.08)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.18)';
      context.stroke();
      context.clip();
      if (avatarDataUrl) {
        try {
          const avatarImage = await loadCanvasImage(avatarDataUrl);
          context.drawImage(avatarImage, 104, 144, 168, 168);
        } catch {
          context.fillStyle = '#ffffff';
          context.font = '900 56px Inter, Arial, sans-serif';
          context.textAlign = 'center';
          context.fillText(avatarInitials, 188, 246);
        }
      } else {
        context.fillStyle = '#ffffff';
        context.font = '900 56px Inter, Arial, sans-serif';
        context.textAlign = 'center';
        context.fillText(avatarInitials, 188, 246);
      }
      context.restore();

      context.textAlign = 'left';
      context.fillStyle = 'rgba(255,255,255,0.54)';
      context.font = '800 28px Inter, Arial, sans-serif';
      context.fillText('VIBINN CLUB', 306, 198);

      context.fillStyle = '#ffffff';
      context.font = '900 72px Inter, Arial, sans-serif';
      context.fillText(profileName, 306, 258);

      context.fillStyle = 'rgba(255,255,255,0.68)';
      context.font = '700 34px Inter, Arial, sans-serif';
      context.fillText(`@${user.username}`, 306, 310);

      const collageFrames = [
        { x: 640, y: 150, width: 280, height: 360, rotate: 7, fill: fallbackPalette[0], image: photoFrames[0] },
        { x: 760, y: 430, width: 220, height: 290, rotate: -6, fill: fallbackPalette[1], image: photoFrames[1] },
        { x: 556, y: 518, width: 250, height: 322, rotate: 5, fill: fallbackPalette[2], image: photoFrames[2] },
      ];

      for (const frame of collageFrames) {
        context.save();
        context.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
        context.rotate((frame.rotate * Math.PI) / 180);
        drawRoundedRect(context, -frame.width / 2, -frame.height / 2, frame.width, frame.height, 54);
        context.fillStyle = 'rgba(255,255,255,0.12)';
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,0.18)';
        context.stroke();

        drawRoundedRect(context, -frame.width / 2 + 12, -frame.height / 2 + 12, frame.width - 24, frame.height - 24, 42);
        context.save();
        context.clip();
        if (frame.image) {
          try {
            const image = await loadCanvasImage(String(frame.image));
            drawImageCover(
              context,
              image,
              -frame.width / 2 + 12,
              -frame.height / 2 + 12,
              frame.width - 24,
              frame.height - 24,
            );
          } catch {
            context.fillStyle = frame.fill;
            context.fillRect(-frame.width / 2 + 12, -frame.height / 2 + 12, frame.width - 24, frame.height - 24);
          }
        } else {
          context.fillStyle = frame.fill;
          context.fillRect(-frame.width / 2 + 12, -frame.height / 2 + 12, frame.width - 24, frame.height - 24);
        }
        context.restore();
        context.restore();
      }

      context.fillStyle = 'rgba(255,255,255,0.58)';
      context.font = '800 24px Inter, Arial, sans-serif';
      context.fillText('TRAVEL TASTE 2026', 112, 634);

      context.fillStyle = '#ffffff';
      context.font = '900 72px Inter, Arial, sans-serif';
      context.fillText('My travel', 112, 724);
      context.fillText('recap so far.', 112, 792);

      context.fillStyle = '#d6ff72';
      context.font = '800 38px Inter, Arial, sans-serif';
      descriptorLines.forEach((line, index) => {
        context.fillText(line, 112, 840 + (index * 52));
      });

      const stats = [
        { label: 'PLACES', value: String(uniquePlaceCount) },
        { label: 'COUNTRIES', value: String(user.stats.countries) },
        { label: 'VIBIN', value: String(vibinCount) },
      ];
      stats.forEach((item, index) => {
        const x = 112 + (index * 288);
        const y = 1038;
        drawRoundedRect(context, x, y, 240, 144, 38);
        context.fillStyle = 'rgba(255,255,255,0.07)';
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,0.12)';
        context.stroke();

        context.textAlign = 'center';
        context.fillStyle = '#ffffff';
        context.font = '900 56px Inter, Arial, sans-serif';
        context.fillText(item.value, x + 120, y + 68);
        context.fillStyle = 'rgba(255,255,255,0.62)';
        context.font = '700 22px Inter, Arial, sans-serif';
        context.fillText(item.label, x + 120, y + 108);
      });
      context.textAlign = 'left';

      const messyPositions = [
        { x: 128, y: 1328, rotate: -0.18 },
        { x: 388, y: 1468, rotate: 0.14 },
        { x: 164, y: 1608, rotate: -0.1 },
      ];
      context.fillStyle = 'rgba(255,255,255,0.08)';
      context.font = '900 46px Inter, Arial, sans-serif';
      topPlaces.forEach((placeName, index) => {
        const pos = messyPositions[index] ?? messyPositions[0];
        context.save();
        context.translate(pos.x, pos.y);
        context.rotate(pos.rotate);
        context.fillText(placeName, 0, 0);
        context.restore();
      });

      context.fillStyle = 'rgba(255,255,255,0.56)';
      context.font = '800 24px Inter, Arial, sans-serif';
      context.fillText('COUNTRIES IN THE MIX', 112, 1398);

      if (flags.length > 0) {
        context.font = '42px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        flags.slice(0, 6).forEach((flag, index) => {
          context.fillText(flag, 112 + (index * 68), 1456);
        });
      } else {
        context.fillStyle = 'rgba(255,255,255,0.45)';
        context.font = '700 26px Inter, Arial, sans-serif';
        context.fillText('No flags yet', 112, 1456);
      }

      drawRoundedRect(context, 112, 1608, 856, 116, 38);
      context.fillStyle = 'rgba(255,255,255,0.06)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.09)';
      context.stroke();

      context.fillStyle = 'rgba(255,255,255,0.56)';
      context.font = '800 24px Inter, Arial, sans-serif';
      context.fillText('PROFILE', 152, 1660);

      context.fillStyle = 'rgba(255,255,255,0.76)';
      context.font = '700 24px Inter, Arial, sans-serif';
      profileUrlLines.forEach((line, index) => {
        context.fillText(line, 152, 1698 + (index * 24));
      });

      context.fillStyle = 'rgba(255,255,255,0.36)';
      context.font = '700 22px Inter, Arial, sans-serif';
      context.fillText('Built on Vibinn for the share-worthy version of your travel taste.', 112, 1756);

      const dataUrl = canvas.toDataURL('image/png');
      setProfileRecapState({
        imageUrl: dataUrl,
        title: 'Recap travel 2026',
        fileName: `${slugifyFilename(user.username)}-travel-recap-2026.png`,
      });
      setShareSheetState(null);
    } catch {
      showActionToast('Could not generate recap right now');
    } finally {
      setIsProfileRecapGenerating(false);
    }
  };

  const resetCreateMomentDraft = () => {
    setCreateMomentInitialPlace(null);
    setCreateMomentInitialVisitedDate('');
    setCreateMomentReturnScreen('discover-places');
  };

  const findKnownPlaceById = (placeId: string) => {
    const knownPlaces = [
      ...discoveryPlaces,
      ...bookmarkedPlaces,
      ...user.travelHistory.flatMap((history) => history.places ?? []),
      ...customCollections.flatMap((collection) => collection.places),
    ];
    return knownPlaces.find((place) => place.id === placeId) ?? null;
  };

  const applyMockCheckIn = (payload: {
    placeId: string;
    visitedDate: string;
    caption: string;
    uploadedMedia: string[];
    rating: number;
    ratingLabel: MomentRatingLabel;
    budgetLevel: '$' | '$$' | '$$$';
    visitType: 'solo' | 'couple' | 'friends' | 'family';
    timeOfDay: 'morning' | 'afternoon' | 'sunset' | 'night';
    privacy: 'public' | 'private';
    wouldRevisit: 'yes' | 'not_sure' | 'not_interested';
    vibeTags: string[];
  }) => {
    const basePlace = findKnownPlaceById(payload.placeId);
    if (!basePlace) return;

    const nextMomentId = `mock-checkin-${payload.placeId}-${Date.now()}`;
    const checkedInPlace: Place = {
      ...basePlace,
      momentId: nextMomentId,
      visitedDate: payload.visitedDate,
      momentCaption: payload.caption,
      momentRating: payload.rating,
      momentRatingLabel: payload.ratingLabel,
      momentWouldRevisit: payload.wouldRevisit,
      momentVisitType: payload.visitType,
      momentTimeOfDay: payload.timeOfDay,
      momentVibeTags: payload.vibeTags,
      momentMedia: payload.uploadedMedia.length > 0
        ? payload.uploadedMedia.map((url) => ({ url, mediaType: /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url) ? 'video' as const : 'image' as const }))
        : [{ url: basePlace.image, mediaType: 'image' as const }],
    };

    setMyMoments((prev) => {
      const next = [{ id: nextMomentId, placeId: payload.placeId }, ...prev.filter((moment) => moment.placeId !== payload.placeId)];
      return next;
    });

    setUser((prev) => {
      const nextHistory = [...prev.travelHistory];
      const cityLabel = checkedInPlace.location.split(',')[0]?.trim() ?? checkedInPlace.location;
      const historyIndex = nextHistory.findIndex((history) => history.cities.includes(cityLabel));
      if (historyIndex >= 0) {
        const history = nextHistory[historyIndex];
        nextHistory[historyIndex] = {
          ...history,
          places: [checkedInPlace, ...(history.places ?? []).filter((place) => place.id !== checkedInPlace.id)],
        };
      } else {
        nextHistory.unshift({
          country: checkedInPlace.location.split(',')[1]?.trim() ?? 'USA',
          cities: [cityLabel],
          places: [checkedInPlace],
        });
      }

      return {
        ...prev,
        travelHistory: nextHistory,
      };
    });

    setOptimisticOwnFeedItems((prev) => {
      const nextItem = {
        id: `optimistic-visited-${nextMomentId}`,
        type: 'visited' as const,
        traveler: {
          ...user,
          travelHistory: user.travelHistory,
        },
        place: checkedInPlace,
        activityDate: formatRelativeActivityTime(Date.parse(payload.visitedDate)),
        caption: checkedInPlace.momentCaption ?? 'Dropped a check-in here.',
        compatibility: undefined,
        sortTimestamp: Date.parse(payload.visitedDate),
      };
      return [
        nextItem,
        ...prev.filter((item) => !(item.type === 'visited' && item.place.momentId === nextMomentId)),
      ];
    });

    setPlaceDetailInteraction((prev) => ({ ...prev, isBeenThere: true }));
  };

  const applyPersistedCheckIn = (moment: {
    id: string;
    placeId: string;
    visitedDate: string;
    caption?: string;
    rating?: number;
    ratingLabel?: MomentRatingLabel;
    wouldRevisit?: 'yes' | 'not_sure' | 'not_interested';
    visitType?: 'solo' | 'couple' | 'friends' | 'family';
    timeOfDay?: 'morning' | 'afternoon' | 'sunset' | 'night';
    vibeTags?: string[];
    uploadedMediaItems?: Array<{ url: string; mediaType: 'image' | 'video' }>;
    place?: Place;
  }) => {
    const basePlace = (moment.place as Place | undefined) ?? findKnownPlaceById(moment.placeId);
    if (!basePlace) return;

    const checkedInPlace: Place = {
      ...basePlace,
      momentId: moment.id,
      visitedDate: moment.visitedDate,
      momentCaption: moment.caption ?? '',
      momentRating: moment.rating,
      momentRatingLabel: moment.ratingLabel ?? 'liked',
      momentWouldRevisit: moment.wouldRevisit,
      momentVisitType: moment.visitType,
      momentTimeOfDay: moment.timeOfDay,
      momentVibeTags: moment.vibeTags ?? [],
      momentMedia: moment.uploadedMediaItems?.length
        ? moment.uploadedMediaItems
        : basePlace.image
          ? [{ url: basePlace.image, mediaType: 'image' as const }]
          : [],
    };

    setMyMoments((prev) => {
      const next = [{ id: moment.id, placeId: moment.placeId }, ...prev.filter((entry) => entry.id !== moment.id && entry.placeId !== moment.placeId)];
      return next;
    });

    setUser((prev) => {
      const nextHistory = [...prev.travelHistory];
      const cityLabel = checkedInPlace.location.split(',')[0]?.trim() ?? checkedInPlace.location;
      const countryLabel = checkedInPlace.location.split(',')[1]?.trim() ?? 'USA';
      const historyIndex = nextHistory.findIndex((history) => history.cities.includes(cityLabel));
      if (historyIndex >= 0) {
        const history = nextHistory[historyIndex];
        nextHistory[historyIndex] = {
          ...history,
          places: [checkedInPlace, ...(history.places ?? []).filter((place) => place.momentId !== checkedInPlace.momentId)],
        };
      } else {
        nextHistory.unshift({
          country: countryLabel,
          cities: [cityLabel],
          places: [checkedInPlace],
        });
      }

      return {
        ...prev,
        travelHistory: nextHistory,
      };
    });

    setPlaceDetailInteraction((prev) => ({ ...prev, isBeenThere: true }));
  };

  const openTravelerProfile = async (traveler: User) => {
    trackEvent('View Traveler Detail', {
      traveler_id: traveler.id,
      username: traveler.username,
      source_screen: currentScreen,
    });
    setSelectedTravelerReturnScreen(currentScreen);
    if (typeof window !== 'undefined' && traveler.username) {
      const nextPath = buildCanonicalProfilePath(traveler.username);
      if (`${window.location.pathname}${window.location.search}` !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    }
    setSelectedTraveler(traveler);
    setSelectedTravelerBookmarkedPlaces([]);
    setSelectedTravelerCollections([]);
    setSelectedTravelerHasHydratedDetail(false);
    setCurrentScreen('traveler-profile');

    if (mockReviewScenario) return;
    if (!isAuthenticatedRef.current) return;

    const cachedTraveler = travelerProfileCacheRef.current.get(traveler.id);
    const hasFreshCache = cachedTraveler && Date.now() - cachedTraveler.cachedAt < TRAVELER_PROFILE_CACHE_TTL_MS;
    if (hasFreshCache) {
      setSelectedTraveler(cachedTraveler.traveler);
      setSelectedTravelerBookmarkedPlaces(cachedTraveler.bookmarks);
      setSelectedTravelerCollections(cachedTraveler.collections);
      setSelectedTravelerHasHydratedDetail(true);
      setIsTravelerProfileLoading(false);
      return;
    }

    setIsTravelerProfileLoading(!cachedTraveler);
    try {
      const response = await api.getTravelerProfile(traveler.id);
      const nextTraveler = response.traveler as User;
      const nextBookmarks = (response.bookmarks ?? []) as Place[];
      const nextCollections = (response.collections ?? []).map((collection) => ({
        id: collection.id,
        label: collection.label,
        createdAt: collection.createdAt,
        places: collection.places as Place[],
      }));
      setSelectedTraveler(nextTraveler);
      setSelectedTravelerBookmarkedPlaces(nextBookmarks);
      setSelectedTravelerCollections(nextCollections);
      setSelectedTravelerHasHydratedDetail(true);
      travelerProfileCacheRef.current.set(traveler.id, {
        cachedAt: Date.now(),
        traveler: nextTraveler,
        bookmarks: nextBookmarks,
        collections: nextCollections,
      });
    } catch {
      showActionToast('Could not load the latest traveler details');
    } finally {
      setIsTravelerProfileLoading(false);
    }
  };

  const syncBookmarkState = async (place: Place, nextActive: boolean, options?: { dismissAfterSave?: boolean; toast?: string }) => {
    if (!isAuthenticatedRef.current) {
      openAuthGate('Log in to save places to your bookmarks.', 'login', () => {
        void syncBookmarkState(place, nextActive, options);
      });
      return false;
    }

    try {
      if (mockReviewScenario) {
        setBookmarkedPlaceIds((prev) => (
          nextActive
            ? (prev.includes(place.id) ? prev : [place.id, ...prev])
            : prev.filter((item) => item !== place.id)
        ));
        setBookmarkedPlaces((prev) => (
          nextActive
            ? (prev.some((item) => item.id === place.id) ? prev : [place, ...prev])
            : prev.filter((item) => item.id !== place.id)
        ));
        if (options?.dismissAfterSave) {
          setDismissedPlaceIds((prev) => (prev.includes(place.id) ? prev : [...prev, place.id]));
        }
        showActionToast(nextActive ? (options?.toast ?? 'Saved to bookmarks') : 'Removed save');
        return true;
      }

      if (nextActive) {
        const response = await api.bookmarkPlace({
          placeId: place.id,
          place: {
            name: place.name,
            location: place.location,
            address: place.address,
            category: place.category,
            image: place.image,
            images: place.images,
            tags: place.tags,
            description: place.description,
            hook: place.hook,
            attitudeLabel: place.attitudeLabel,
            bestTime: place.bestTime,
            rating: place.rating,
            priceLevel: place.priceLevel,
            latitude: place.latitude,
            longitude: place.longitude,
          },
        });
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
    const guestPreferences = {
      selectedInterests,
      selectedVibe,
    };
    const nextScreen = authReturnScreen === 'login' || authReturnScreen === 'register'
      ? 'discover-places'
      : authReturnScreen;
    const shouldRefreshDiscoveryImmediately = nextScreen === 'discover-places' && currentScreen === 'discover-places';

    isAuthenticatedRef.current = true;
    setIsAuthenticated(true);
    setUser(buildAuthenticatedUserDraft(payload));
    forceDiscoveryRefreshAfterAuthRef.current = nextScreen === 'discover-places';
    setCurrentScreen(nextScreen);

    if (payload?.id) {
      identifyAnalyticsUser({
        id: payload.id,
        username: payload.username,
        displayName: payload.name,
        email: payload.email,
      });
      trackEvent('Auth Completed', {
        user_id: payload.id,
        username: payload.username,
        method: payload.email ? 'credentials_or_google' : 'unknown',
      });
    }

    const pendingAction = pendingAuthActionRef.current;
    pendingAuthActionRef.current = null;

    if (pendingAction) {
      pendingAction();
    }

    void applyAuthenticatedBootstrapState({
      guestPreferences,
      includeProfile: false,
    }).then((hydratedPreferences) => {
      if (pendingAction) return;
      if (!shouldRefreshDiscoveryImmediately) return;
      setDiscoveryPage(1);
      setDiscoveryHasMore(true);
      const rotationSeed = bumpDiscoveryRotationSeed();
      void loadDiscoveryPlaces(1, 'reset', {
        refreshMode: 'soft',
        rotationSeedOverride: rotationSeed,
        preferencesOverride: hydratedPreferences,
      });
      window.setTimeout(() => {
        void loadDiscoveryEvents(hydratedPreferences);
      }, 650);
    });
  };

  const completeV2Auth = async (
    payload?: V2UserPayload,
    options?: { preserveCurrentScreen?: boolean },
  ) => {
    const wasAuthenticated = isAuthenticatedRef.current;
    const guestPreferences = {
      selectedInterests,
      selectedVibe,
    };

    isAuthenticatedRef.current = true;
    setIsAuthenticated(true);
    setUser(buildAuthenticatedUserDraftFromV2(payload));

    if (!options?.preserveCurrentScreen) {
      setCurrentScreen(hasStoredOnboardingCompletion() ? 'discover-places' : 'onboarding');
    }

    if (!wasAuthenticated && payload?.id) {
      identifyAnalyticsUser({
        id: payload.id,
        username: payload.username,
        displayName: payload.displayName,
      });
      trackEvent('Auth Completed', {
        user_id: payload.id,
        username: payload.username,
        method: 'phone_otp',
      });
    }

    if (!wasAuthenticated) {
      void applyAuthenticatedBootstrapState({
        guestPreferences,
        includeProfile: false,
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (currentScreen !== 'profile') return;
    void refreshOwnProfile();
  }, [isAuthenticated, currentScreen]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (currentScreen !== 'bookmarks') return;
    void refreshOwnProfile();
  }, [isAuthenticated, currentScreen]);

  useEffect(() => {
    if (!googleClientId || typeof window === 'undefined') return;
    let didCancel = false;

    const markLoaded = () => {
      if (didCancel) return;
      if (window.google?.accounts?.id) {
        isGoogleScriptLoadedRef.current = true;
      }
    };

    if (window.google?.accounts?.id) {
      markLoaded();
      return;
    }

    const existingScript = document.querySelector('script[data-google-identity="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === '1') {
        markLoaded();
        return;
      }

      const handleLoad = () => {
        existingScript.dataset.loaded = '1';
        markLoaded();
      };
      const handleError = () => {
        if (didCancel) return;
        isGoogleScriptLoadedRef.current = false;
      };
      const timeoutId = window.setTimeout(markLoaded, 2500);

      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);

      return () => {
        didCancel = true;
        window.clearTimeout(timeoutId);
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => {
      script.dataset.loaded = '1';
      markLoaded();
    };
    script.onerror = () => {
      if (didCancel) return;
      isGoogleScriptLoadedRef.current = false;
    };
    document.head.appendChild(script);

    const timeoutId = window.setTimeout(markLoaded, 2500);
    return () => {
      didCancel = true;
      window.clearTimeout(timeoutId);
    };
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
    options?: {
      refreshMode?: 'soft' | 'hard';
      rotationSeedOverride?: number;
      preferencesOverride?: {
        selectedInterests?: Interest[];
        selectedVibe?: Vibe | null;
      };
    },
  ) => {
    if (mockReviewScenario) {
      const query = discoverySearchQuery.trim().toLowerCase();
      const filteredPlaces = mockReviewScenario.discoveryPlaces.filter((place) => {
        if (!query) return true;
        const haystack = [
          place.name,
          place.location,
          place.category,
          place.description,
          place.hook,
          ...(place.tags ?? []),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
      const pageSize = page === 1 ? 18 : 10;
      const start = (page - 1) * pageSize;
      const nextPlaces = filteredPlaces.slice(start, start + pageSize);

      setDiscoveryPlaces((prev) => (
        mode === 'append'
          ? [...prev, ...nextPlaces.filter((place) => !prev.some((item) => item.id === place.id))]
          : applyRankedVarietyToPlaces(nextPlaces, options?.rotationSeedOverride ?? discoveryRotationSeedRef.current)
      ));
      setDiscoveryPage(page);
      setDiscoveryHasMore(start + pageSize < filteredPlaces.length);
      setIsDiscoveryPlacesLoading(false);
      setIsDiscoveryPlacesLoadingMore(false);
      setIsDiscoveryPlacesRefreshing(false);
      setIsDiscoveryPlacesError(false);
      return;
    }

    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;
    const appendScrollTop = mode === 'append' && typeof window !== 'undefined' ? window.scrollY : null;
    const refreshMode = mode === 'reset' ? options?.refreshMode : undefined;
    const isRefresh = Boolean(refreshMode) && mode === 'reset';
    const rotationSeed = options?.rotationSeedOverride ?? discoveryRotationSeedRef.current;
    const effectiveSelectedInterests = options?.preferencesOverride?.selectedInterests ?? selectedInterests;
    const effectiveSelectedVibe = options?.preferencesOverride?.selectedVibe ?? selectedVibe;
    const hasEffectivePreferences = effectiveSelectedInterests.length > 0 || !!effectiveSelectedVibe;
    const discoveryPageLimit = page === 1 && !hasEffectivePreferences && !discoverySearchQuery ? 18 : 10;
    const discoveryContextKey = buildDiscoveryContextKey({
      locationId: activeLocation.id,
      locationLabel: activeLocation.label,
      locationType: activeLocation.type,
      searchQuery: discoverySearchQuery,
      selectedInterests: effectiveSelectedInterests,
      selectedVibe: effectiveSelectedVibe,
    });
    const cachedDiscovery = (
      mode === 'reset'
      && page === 1
      && !isRefresh
      ? readDiscoveryPlacesCache(discoveryContextKey)
      : null
    );

    if (mode === 'reset' && !isRefresh && !cachedDiscovery) {
      setIsDiscoveryPlacesLoading(true);
    } else if (mode === 'append') {
      setIsDiscoveryPlacesLoadingMore(true);
    } else if (isRefresh) {
      setIsDiscoveryPlacesRefreshing(true);
    }

    if (cachedDiscovery) {
      setDiscoveryPlaces(applyRankedVarietyToPlaces(cachedDiscovery.places, rotationSeed));
      setDiscoveryPage(cachedDiscovery.pagination.page);
      setDiscoveryHasMore(cachedDiscovery.pagination.hasMore);
      setIsDiscoveryPlacesLoading(false);
      setIsDiscoveryPlacesError(false);
    }

    try {
      setIsDiscoveryPlacesError(false);
      const response = await api.getDiscoveryPlaces(
        activeLocation.label,
        activeLocation.type,
        {
          selectedInterests: effectiveSelectedInterests,
          selectedVibe: effectiveSelectedVibe,
        },
        {
          page,
          limit: discoveryPageLimit,
          refresh: refreshMode === 'hard',
          query: discoverySearchQuery,
          seed: `${activeLocation.id}:${page}:${rotationSeed}`,
        },
      );

      const nextPlaces = response.places as Place[];
      setDiscoveryPlaces((prev) => (
        mode === 'append'
          ? [...prev, ...nextPlaces.filter((place) => !prev.some((item) => item.id === place.id))]
          : applyRankedVarietyToPlaces(nextPlaces, rotationSeed)
      ));
      setDiscoveryPage(response.pagination.page);
      setDiscoveryHasMore(response.pagination.hasMore);
      if (mode === 'reset' && page === 1) {
        writeDiscoveryPlacesCache(discoveryContextKey, {
          cachedAt: Date.now(),
          places: nextPlaces,
          pagination: {
            page: response.pagination.page,
            hasMore: response.pagination.hasMore,
          },
        });
      }
      if (mode === 'append' && appendScrollTop !== null && typeof window !== 'undefined') {
        const restoreAppendScroll = () => {
          if (window.scrollY < appendScrollTop - 120) {
            window.scrollTo({ top: appendScrollTop, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = appendScrollTop;
            document.body.scrollTop = appendScrollTop;
          }
        };
        window.requestAnimationFrame(restoreAppendScroll);
        window.setTimeout(restoreAppendScroll, 80);
      }
    } catch {
      if (isRefresh) {
        setIsDiscoveryPlacesError(true);
        showActionToast('Could not refresh picks right now');
      } else if (mode === 'reset' && !cachedDiscovery) {
        setDiscoveryPlaces([]);
        setDiscoveryPage(1);
        setDiscoveryHasMore(false);
        setIsDiscoveryPlacesError(true);
        showActionToast('Could not load picks right now');
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

  const loadDiscoveryEvents = async (preferencesOverride?: {
    selectedInterests?: Interest[];
    selectedVibe?: Vibe | null;
  }) => {
    if (mockReviewScenario) {
      setDiscoveryEvents(mockReviewScenario.discoveryEvents);
      setIsDiscoveryEventsLoading(false);
      setIsDiscoveryEventsError(false);
      return;
    }

    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;
    const effectiveSelectedInterests = preferencesOverride?.selectedInterests ?? selectedInterests;
    const effectiveSelectedVibe = preferencesOverride?.selectedVibe ?? selectedVibe;

    setIsDiscoveryEventsLoading(true);
    try {
      setIsDiscoveryEventsError(false);
      const response = await api.getDiscoveryEvents(
        activeLocation.label,
        activeLocation.type,
        {
          selectedInterests: effectiveSelectedInterests,
          selectedVibe: effectiveSelectedVibe,
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
    if (currentScreen !== 'discover-places') return;
    if (suppressNextDiscoveryAutoloadRef.current) {
      suppressNextDiscoveryAutoloadRef.current = false;
      previousPreferenceKeyRef.current = `${[...selectedInterests].sort().join(',')}|${selectedVibe ?? ''}`;
      return;
    }

    const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0];
    if (!activeLocation) return;
    const nextPreferenceKey = `${[...selectedInterests].sort().join(',')}|${selectedVibe ?? ''}`;
    const shouldRefreshForPreferences =
      previousPreferenceKeyRef.current.length > 0 && previousPreferenceKeyRef.current !== nextPreferenceKey;
    const shouldForceRefreshAfterAuth = forceDiscoveryRefreshAfterAuthRef.current;
    const nextDiscoveryContextKey = buildDiscoveryContextKey({
      locationId: activeLocation.id,
      locationLabel: activeLocation.label,
      locationType: activeLocation.type,
      searchQuery: discoverySearchQuery,
      selectedInterests,
      selectedVibe,
    });
    forceDiscoveryRefreshAfterAuthRef.current = false;
    previousPreferenceKeyRef.current = nextPreferenceKey;

    const canReuseDiscoveryCache =
      lastDiscoveryContextKeyRef.current === nextDiscoveryContextKey
      && discoveryPlaces.length > 0
      && !shouldRefreshForPreferences
      && !shouldForceRefreshAfterAuth;

    if (canReuseDiscoveryCache) {
      if (skipNextDiscoveryVarietyRef.current) {
        skipNextDiscoveryVarietyRef.current = false;
      }
      return;
    }

    lastDiscoveryContextKeyRef.current = nextDiscoveryContextKey;
    setDiscoveryPage(1);
    setDiscoveryHasMore(true);
    void loadDiscoveryPlaces(1, 'reset', {
      refreshMode: shouldRefreshForPreferences || shouldForceRefreshAfterAuth ? 'hard' : undefined,
    });
    void loadDiscoveryEvents();
  }, [currentScreen, activeLocationId, savedLocations, selectedInterests, selectedVibe, discoverySearchQuery, discoveryPlaces.length]);

  useEffect(() => {
    if (mockReviewScenario) return;
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
        void api.getV2AuthSession()
          .then(async (response) => {
            await completeV2Auth(response.user, {
              preserveCurrentScreen: true,
            });
          })
          .catch(() => {
            api.clearAuthToken();
            resetAnalyticsUser();
          });
      });
  }, []);

  useEffect(() => {
    if (currentScreen === 'discover-travelers') {
      trackEvent('View Discovery Traveler');
      return;
    }

    if (currentScreen === 'profile') {
      trackEvent('View My Profile', {
        user_id: user.id,
        username: user.username,
      });
    }
  }, [currentScreen, user.id, user.username]);

  useEffect(() => {
    if (mockReviewScenario) return;
    if (!isAuthenticated) return;
    if (currentScreen !== 'bookmarks') return;

    let isCancelled = false;
    const hasFreshBookmarks = (
      bookmarkedPlacesLastFetchedAtRef.current > 0
      && Date.now() - bookmarkedPlacesLastFetchedAtRef.current < BOOKMARKS_CACHE_TTL_MS
    );
    if (hasFreshBookmarks) {
      setIsBookmarkedPlacesLoading(false);
      return;
    }

    setIsBookmarkedPlacesLoading(bookmarkedPlaces.length === 0);

    void api.getBookmarks()
      .then((response) => {
        if (isCancelled) return;
        setBookmarkedPlaces(response.bookmarks as Place[]);
        bookmarkedPlacesLastFetchedAtRef.current = Date.now();
      })
      .catch(() => {
        if (isCancelled) return;
        showActionToast('Could not refresh bookmarks right now');
      })
      .finally(() => {
        if (isCancelled) return;
        setIsBookmarkedPlacesLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentScreen, isAuthenticated, bookmarkedPlaces.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    trackPageView(window.location.pathname, document.title);
  }, [currentScreen, publicProfileUsername, selectedPlace?.id, selectedEvent?.id]);

  useEffect(() => {
    if (currentScreen !== 'place-detail' || !selectedPlace) {
      return;
    }

    if (mockReviewScenario) {
      const bundle = mockReviewScenario.placeDetailBundles[selectedPlace.id];
      if (bundle) {
        setSelectedPlace(bundle.place);
        setRelatedPlaces(bundle.relatedPlaces);
        setPlaceTravelerMoments(bundle.travelerMoments);
        setPlaceDetailInteraction({
          isSaved: bundle.interactionState.bookmarkedPlaceIds.includes(selectedPlace.id),
          isBeenThere: bundle.interactionState.beenTherePlaceIds.includes(selectedPlace.id),
        });
      }
      return;
    }

    const cached = placeDetailCacheRef.current.get(selectedPlace.id);
    if (cached) {
      setSelectedPlace(cached.place);
      setRelatedPlaces(cached.relatedPlaces);
      setPlaceTravelerMoments(cached.travelerMoments);
      setPlaceDetailInteraction({
        isSaved: cached.interactionState.bookmarkedPlaceIds.includes(selectedPlace.id),
        isBeenThere: cached.interactionState.beenTherePlaceIds.includes(selectedPlace.id),
      });
      return;
    }

    if (!isAuthenticated) {
      setPlaceTravelerMoments([]);
      setPlaceDetailInteraction({
        isSaved: false,
        isBeenThere: false,
      });
    }

    void api.getPlaceDetailBundle(selectedPlace.id)
      .then((response) => {
        placeDetailCacheRef.current.set(selectedPlace.id, {
          place: response.place as Place,
          relatedPlaces: response.relatedPlaces,
          travelerMoments: response.travelerMoments,
          interactionState: response.interactionState,
        });
        setSelectedPlace(response.place as Place);
        setRelatedPlaces(response.relatedPlaces);
        setPlaceTravelerMoments(response.travelerMoments);
        setPlaceDetailInteraction({
          isSaved: response.interactionState.bookmarkedPlaceIds.includes(selectedPlace.id),
          isBeenThere: response.interactionState.beenTherePlaceIds.includes(selectedPlace.id),
        });
      })
      .catch(() => undefined);
  }, [currentScreen, selectedPlace?.id, isAuthenticated]);

  useEffect(() => {
    if (mockReviewScenario) {
      if (currentScreen !== 'place-detail') {
        setPlaceFallbackTravelers([]);
        return;
      }
      const combined = [...mockReviewScenario.similarTravelers, ...mockReviewScenario.followedTravelers];
      const deduped = combined.filter((traveler, index, list) => list.findIndex((item) => item.id === traveler.id) === index);
      setPlaceFallbackTravelers(deduped.filter((traveler) => (traveler.matchScore ?? 0) >= 80).slice(0, 8));
      return;
    }

    if (!isAuthenticated || currentScreen !== 'place-detail') {
      setPlaceFallbackTravelers([]);
      return;
    }

    if (placeFallbackTravelers.length > 0) {
      return;
    }

    void api.getTravelerDiscovery()
      .then((response) => {
        const combined = [...(response.similarTravelers as User[]), ...(response.followedTravelers as User[])];
        const deduped = combined.filter(
          (traveler, index, list) => list.findIndex((item) => item.id === traveler.id) === index,
        );
        setPlaceFallbackTravelers(deduped.filter((traveler) => (traveler.matchScore ?? 0) >= 80).slice(0, 8));
      })
      .catch(() => {
        setPlaceFallbackTravelers([]);
      });
  }, [isAuthenticated, currentScreen, placeFallbackTravelers.length]);

  useEffect(() => {
    if (currentScreen === 'place-detail' && selectedPlace) {
      return;
    }

    setRelatedPlaces([]);
    setPlaceTravelerMoments([]);
    setPlaceDetailInteraction({
      isSaved: false,
      isBeenThere: false,
    });
  }, [currentScreen, selectedPlace]);

  useEffect(() => {
    return () => {
      if (postPreferencesIntroTimerRef.current) {
        window.clearTimeout(postPreferencesIntroTimerRef.current);
      }
    };
  }, []);

  const resolvedPublicProfileUser = publicProfileUser;
  const resolvedPublicProfileBookmarkedPlaces = publicProfileBookmarkedPlaces.length > 0
    ? publicProfileBookmarkedPlaces
    : (resolvedPublicProfileUser?.recentSavedPlaces?.map((entry) => entry.place) ?? []);
  const resolvedPublicProfileCollections = publicProfileCollections.length > 0
    ? publicProfileCollections
    : ((resolvedPublicProfileUser?.recentCollections ?? []).map((collection) => ({
        id: collection.id,
        label: collection.label,
        createdAt: collection.createdAt,
        places: collection.places,
      })));
  const publicProfileFeedItems = resolvedPublicProfileUser ? [
    ...((resolvedPublicProfileUser.recentSavedPlaces ?? []).map((entry, index) => ({
      id: `${resolvedPublicProfileUser.id}-saved-${entry.place.id}-${index}`,
      type: 'saved' as const,
      traveler: resolvedPublicProfileUser,
      place: entry.place,
      activityDate: entry.savedAtLabel,
      caption: undefined,
      compatibility: undefined,
      sortTimestamp: entry.savedAtIso
        ? Date.parse(entry.savedAtIso)
        : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (index + 1) * 3600000)),
    }))),
    ...resolvedPublicProfileUser.travelHistory.flatMap((history) => (history.places ?? []).slice(0, 6)).map((place, index) => ({
      id: `${resolvedPublicProfileUser.id}-visited-${place.id}-${index}`,
      type: 'visited' as const,
      traveler: resolvedPublicProfileUser,
      place,
      activityDate: formatRelativeActivityTime(place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000),
      caption: place.momentCaption ?? 'Dropped a check-in here.',
      compatibility: undefined,
      sortTimestamp: place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000,
    })),
    ...resolvedPublicProfileCollections.map((collection, index) => ({
      id: `${resolvedPublicProfileUser.id}-collection-${collection.id ?? collection.label}-${index}`,
      type: 'collection' as const,
      traveler: resolvedPublicProfileUser,
      collectionId: collection.id,
      collectionName: collection.label,
      collectionPlaces: collection.places.slice(0, 4),
      activityDate: formatRelativeActivityTime(collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000),
      caption: undefined,
      sortTimestamp: collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000,
    })),
  ].sort((a, b) => b.sortTimestamp - a.sortTimestamp) : [];

  const renderScreen = () => {

  const discoveryPlacesScreen = (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <PlaceDiscoveryScreen
        selectedInterests={selectedInterests}
        selectedVibe={selectedVibe}
        activeLocation={savedLocations.find((location) => location.id === activeLocationId) ?? savedLocations[0]}
        savedLocations={savedLocations}
        deviceLocation={deviceLocation}
        deviceLocationPermission={deviceLocationPermission}
        isRequestingDeviceLocation={isRequestingDeviceLocation}
        events={discoveryEvents}
        searchInput={discoverySearchInput}
        searchQuery={discoverySearchQuery}
        onOpenPreferences={() => {
          setOnboardingEntryMode('swipe-direct');
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
        onRequestDeviceLocation={requestDeviceLocation}
        visiblePlaces={discoveryPlaces.filter((place) =>
          !dismissedPlaceIds.includes(place.id)
          && !shouldExcludeDiscoveryPlace(place)
          && hasRenderableDiscoveryImage(place)
        )}
        isLoading={isDiscoveryPlacesLoading}
        isEventsLoading={isDiscoveryEventsLoading}
        isPreferenceTransitionLoading={isPreferenceTransitionLoading}
        isLoadingMore={isDiscoveryPlacesLoadingMore}
        isRefreshing={isDiscoveryPlacesRefreshing}
        hasMore={discoveryHasMore}
        currentPage={discoveryPage}
        hasError={isDiscoveryPlacesError}
        hasEventsError={isDiscoveryEventsError}
        restorePlaceId={pendingDiscoveryPlaceAnchorRef.current}
        restoreViewportOffset={pendingDiscoveryViewportOffsetRef.current}
        bookmarkedPlaceIds={bookmarkedPlaceIds}
        visitedPlaceIds={myMoments.map((moment) => moment.placeId)}
        showGestureDemo={showDiscoveryGestureDemo}
        onFinishGestureDemo={() => setShowDiscoveryGestureDemo(false)}
        onRestorePlaceHandled={() => {
          pendingDiscoveryPlaceAnchorRef.current = null;
          pendingDiscoveryScrollRestoreRef.current = null;
          pendingDiscoveryViewportOffsetRef.current = null;
        }}
        onRefresh={() => {
          if (isDiscoveryPlacesLoading || isDiscoveryPlacesLoadingMore || isDiscoveryPlacesRefreshing) return;
          const rotationSeed = bumpDiscoveryRotationSeed();
          void loadDiscoveryPlaces(1, 'reset', { refreshMode: 'soft', rotationSeedOverride: rotationSeed });
        }}
        onLoadMore={() => {
          if (isDiscoveryPlacesLoading || isDiscoveryPlacesLoadingMore || isDiscoveryPlacesRefreshing || !discoveryHasMore) {
            return false;
          }
          void loadDiscoveryPlaces(discoveryPage + 1, 'append');
          return true;
        }}
        onBookmarkPlace={(place, metadata) => {
          trackEvent('Swipe right card', buildPlaceAnalyticsContext(place, {
            ...metadata,
            sourceScreen: 'discover-places',
            action: 'save',
          }));
          if (!isAuthenticated) {
            openAuthGate('Log in to save places to your bookmarks.', 'login', () => {
              void syncBookmarkState(place, true, { dismissAfterSave: true });
            });
            return;
          }
          void syncBookmarkState(place, true, { dismissAfterSave: true });
        }}
        onDismissPlace={(place, metadata) => {
          trackEvent('Swipe left card', buildPlaceAnalyticsContext(place, {
            ...metadata,
            sourceScreen: 'discover-places',
            action: 'hide',
          }));
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
        onSelectPlace={(p, metadata) => {
          trackEvent('View detail page', buildPlaceAnalyticsContext(p, {
            ...metadata,
            sourceScreen: 'discover-places',
            action: 'open_detail',
          }));
          openPlaceDetail(p, 'discover-places');
        }}
        onSelectEvent={(event) => {
          setSelectedEvent(event);
          setCurrentScreen('event-detail');
        }}
        getEditorialLabel={getEditorialLabel}
        getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
        getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
      />
    </Suspense>
  );

  const placeDetailContent = selectedPlace ? (
    <PlaceDetail 
      place={selectedPlace} 
      hasCompatibilityScore={selectedInterests.length > 0 || !!selectedVibe}
      savedLocations={savedLocations}
      activeLocationId={activeLocationId}
      deviceLocation={deviceLocation}
      deviceLocationPermission={deviceLocationPermission}
      relatedPlaces={relatedPlaces}
      travelerMoments={placeTravelerMoments}
      fallbackTravelers={placeFallbackTravelers}
      onBack={() => {
        const currentPlacePath = selectedPlace ? buildPlaceDetailPath(selectedPlace.id) : null;
        if (
          typeof window !== 'undefined'
          && currentPlacePath
          && window.location.pathname === currentPlacePath
          && placeDetailHasHistoryEntryRef.current
        ) {
          placeDetailHasHistoryEntryRef.current = false;
          window.history.back();
          return;
        }
        const targetScrollTop = discoveryScrollRestoreRef.current;
        if (placeDetailReturnScreen === 'discover-places') {
          skipNextDiscoveryVarietyRef.current = true;
          if (targetScrollTop !== null) {
            screenScrollPositionsRef.current['discover-places'] = targetScrollTop;
            pendingDiscoveryScrollRestoreRef.current = targetScrollTop;
          }
        }
        setCurrentScreen(placeDetailReturnScreen);
        if (
          typeof window !== 'undefined' &&
          placeDetailReturnScreen === 'discover-places' &&
          targetScrollTop !== null
        ) {
          const restoreScroll = () => {
            window.scrollTo({ top: targetScrollTop, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = targetScrollTop;
            document.body.scrollTop = targetScrollTop;
          };
          window.requestAnimationFrame(restoreScroll);
          [60, 180, 360, 720].forEach((delay) => {
            window.setTimeout(restoreScroll, delay);
          });
        }
      }} 
      interactionState={placeDetailInteraction}
      onSavePlace={async (placeToSave, nextActive) => {
        if (!isAuthenticatedRef.current) {
          openAuthGate('Log in to save places to your bookmarks.', 'login');
          return false;
        }
        const updated = await syncBookmarkState(placeToSave, nextActive);
        if (updated) {
          setPlaceDetailInteraction((prev) => ({ ...prev, isSaved: nextActive }));
        }
        return updated;
      }}
      onMarkBeenThere={async () => {
        if (!isAuthenticatedRef.current) {
          openAuthGate('Log in to check in and track places you have been to.', 'login');
          return;
        }
        setPlaceDetailInteraction((prev) => ({ ...prev, isBeenThere: true }));
        setCreateMomentInitialPlace(selectedPlace);
        setCreateMomentInitialVisitedDate(new Date().toISOString().split('T')[0]);
        setCreateMomentReturnScreen('place-detail');
        setCurrentScreen('create-moment');
      }}
      onShare={() => {
        openShareSheet({
          url: buildPlaceShareUrl(selectedPlace.id),
          title: selectedPlace.name,
          text: `Found a place you might like on Vibinn: ${selectedPlace.name}`,
        });
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
            openPlaceDetail(response.place as Place, placeDetailReturnScreen);
          })
          .catch(() => {
            openPlaceDetail(p, placeDetailReturnScreen);
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

  const eventDetailContent = selectedEvent ? (
    <EventDetail
      event={selectedEvent}
      hasCompatibilityScore={selectedInterests.length > 0 || !!selectedVibe}
      isSaved={savedEventIds.includes(selectedEvent.id)}
      onBack={() => setCurrentScreen('discover-places')}
      onSave={() => {
        const isActive = savedEventIds.includes(selectedEvent.id);
        setSavedEventIds((prev) => isActive ? prev.filter((id) => id !== selectedEvent.id) : [...prev, selectedEvent.id]);
        showActionToast(isActive ? 'Removed save' : 'Saved event');
      }}
      onShare={() => {
        const nextActive = !sharedEventIds.includes(selectedEvent.id);
        setSharedEventIds((prev) => nextActive ? [...prev, selectedEvent.id] : prev.filter((id) => id !== selectedEvent.id));
        openShareSheet({
          url: typeof window !== 'undefined' ? window.location.href : `${APP_BASE_PATH}`,
          title: selectedEvent.name,
          text: `Thought you'd want this one on Vibinn: ${selectedEvent.name}`,
        });
      }}
    />
  ) : null;

  const ownProfileSavedEntries = (user.recentSavedPlaces?.length
    ? user.recentSavedPlaces
    : bookmarkedPlaces.slice(0, 8).map((place, index) => ({
        place,
        savedAtLabel: index === 0 ? 'just now' : formatRelativeActivityTime(Date.now() - (index + 1) * 3600000),
        savedAtIso: new Date(Date.now() - index * 3600000).toISOString(),
      })));

  const generatedOwnFeedItems = [
    ...ownProfileSavedEntries.map((entry, index) => ({
      id: `${user.id}-saved-${entry.place.id}-${index}`,
      type: 'saved' as const,
      traveler: user,
      place: entry.place,
      activityDate: entry.savedAtLabel,
      caption: undefined,
      compatibility: undefined,
      sortTimestamp: entry.savedAtIso
        ? Date.parse(entry.savedAtIso)
        : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (index + 1) * 3600000)),
    })),
    ...user.travelHistory.flatMap((history) => (history.places ?? []).slice(0, 6)).map((place, index) => ({
      id: `${user.id}-visited-${place.id}-${index}`,
      type: 'visited' as const,
      traveler: user,
      place,
      activityDate: formatRelativeActivityTime(place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000),
      caption: place.momentCaption ?? 'Dropped a check-in here.',
      compatibility: undefined,
      sortTimestamp: place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000,
    })),
    ...customCollections.map((collection, index) => ({
      id: `${user.id}-collection-${collection.id ?? collection.label}-${index}`,
      type: 'collection' as const,
      traveler: user,
      collectionId: collection.id,
      collectionName: collection.label,
      collectionPlaces: collection.places.slice(0, 4),
      activityDate: formatRelativeActivityTime(collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000),
      caption: undefined,
      sortTimestamp: collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000,
    })),
  ].sort((a, b) => b.sortTimestamp - a.sortTimestamp);
  const ownProfileFeedItems = [
    ...optimisticOwnFeedItems,
    ...generatedOwnFeedItems,
  ].filter((item, index, list) => {
    if (item.type === 'collection') {
      const key = item.collectionId ?? item.collectionName;
      return list.findIndex((entry) => entry.type === 'collection' && (entry.collectionId ?? entry.collectionName) === key) === index;
    }
    const key = item.type === 'visited'
      ? (item.place.momentId ?? `${item.place.id}-${item.activityDate}`)
      : item.place.id;
    return list.findIndex((entry) => {
      if (entry.type !== item.type || entry.type === 'collection') return false;
      const entryKey = entry.type === 'visited'
        ? (entry.place.momentId ?? `${entry.place.id}-${entry.activityDate}`)
        : entry.place.id;
      return entryKey === key;
    }) === index;
  }).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

  const selectedTravelerFeedItems = selectedTraveler ? [
    ...((selectedTraveler.recentSavedPlaces ?? []).map((entry, index) => ({
      id: `${selectedTraveler.id}-saved-${entry.place.id}-${index}`,
      type: 'saved' as const,
      traveler: selectedTraveler,
      place: entry.place,
      activityDate: entry.savedAtLabel,
      caption: undefined,
      compatibility: undefined,
      sortTimestamp: entry.savedAtIso
        ? Date.parse(entry.savedAtIso)
        : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (index + 1) * 3600000)),
    }))),
    ...selectedTraveler.travelHistory.flatMap((history) => (history.places ?? []).slice(0, 6)).map((place, index) => ({
      id: `${selectedTraveler.id}-visited-${place.id}-${index}`,
      type: 'visited' as const,
      traveler: selectedTraveler,
      place,
      activityDate: formatRelativeActivityTime(place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000),
      caption: place.momentCaption ?? 'Dropped a check-in here.',
      compatibility: undefined,
      sortTimestamp: place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000,
    })),
    ...selectedTravelerCollections.map((collection, index) => ({
      id: `${selectedTraveler.id}-collection-${collection.label}-${index}`,
      type: 'collection' as const,
      traveler: selectedTraveler,
      collectionId: collection.id,
      collectionName: collection.label,
      collectionPlaces: collection.places.slice(0, 4),
      activityDate: formatRelativeActivityTime(collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000),
      caption: undefined,
      sortTimestamp: collection.createdAt ? Date.parse(collection.createdAt) : Date.now() - (index + 1) * 86400000,
    })),
  ].sort((a, b) => b.sortTimestamp - a.sortTimestamp) : [];

  if (
    currentScreen === 'discover-places'
    || (currentScreen === 'place-detail' && placeDetailReturnScreen === 'discover-places')
    || currentScreen === 'event-detail'
  ) {
    return (
      <>
        <div aria-hidden={currentScreen !== 'discover-places'}>
          {discoveryPlacesScreen}
        </div>
        {currentScreen === 'place-detail' && selectedPlace ? (
          <div className="fixed inset-0 z-[80] overflow-y-auto bg-zinc-950">
            {placeDetailContent}
          </div>
        ) : null}
        {currentScreen === 'event-detail' && selectedEvent ? (
          <div className="fixed inset-0 z-[80] overflow-y-auto bg-zinc-950">
            {eventDetailContent}
          </div>
        ) : null}
      </>
    );
  }

  switch (currentScreen) {
      case 'landing':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <LandingPage
              analyticsContext={buildAnalyticsUserContext()}
              onHeaderTryNow={() => {
                trackEvent('Try now', {
                  ...buildAnalyticsUserContext(),
                  placement: 'landing_header',
                });
                openApp();
              }}
              onFloatingTryNow={() => {
                trackEvent('Try now', {
                  ...buildAnalyticsUserContext(),
                  placement: 'landing_floating',
                });
                openApp();
              }}
            />
          </Suspense>
        );
      case 'terms':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <TermsOfServiceScreen />
          </Suspense>
        );
      case 'privacy':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <PrivacyPolicyScreen />
          </Suspense>
        );
      case 'onboarding':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <OnboardingScreen
              entryMode={onboardingEntryMode}
              selectedInterests={selectedInterests}
              setSelectedInterests={setSelectedInterests}
              selectedVibe={selectedVibe}
              setSelectedVibe={setSelectedVibe}
              savedLocations={savedLocations}
              activeLocationId={activeLocationId}
              onSelectInitialLocation={(locationId) => setActiveLocationId(locationId)}
              onAddInitialLocation={async (location) => {
                if (isAuthenticated) {
                  try {
                    const response = await api.addSavedLocation({
                      label: location.label,
                      type: location.type,
                      googlePlaceId: location.googlePlaceId,
                      isDefault: true,
                    });
                    setSavedLocations((prev) => mergeSavedLocations(prev, response.locations as SavedLocationOption[]));
                    if (response.activeLocationId) {
                      setActiveLocationId(response.activeLocationId);
                    }
                    showActionToast(`${location.label} selected`);
                  } catch {
                    showActionToast('Could not save location right now');
                  }
                  return;
                }

                setSavedLocations((prev) => mergeSavedLocations(prev, [location]));
                setActiveLocationId(location.id);
                showActionToast(`${location.label} selected`);
              }}
              onComplete={completeOnboarding}
              analyticsContext={buildAnalyticsUserContext()}
            />
          </Suspense>
        );
      case 'post-preferences-intro':
        return <PostPreferencesIntro />;
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
          <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <ProfileScreen
              user={user}
              bookmarkedPlaces={bookmarkedPlaces}
              customCollections={customCollections}
              displayFlags={(user.flags?.length ? user.flags : deriveFlagsFromTravelHistory(user.travelHistory)).slice(0, 5)}
              onNavigate={(s) => setCurrentScreen(s)}
              onSavePlace={(placeToSave, nextActive) => syncBookmarkState(placeToSave, nextActive)}
              onSelectPlace={(p) => {
                openPlaceDetail(p, 'discover-places');
              }}
              onOpenCollection={(collection) => {
                setSelectedCollection(collection);
                setSelectedCollectionReturnScreen('profile');
                setPublicCollectionId(null);
                setSelectedCollectionOwner({
                  avatar: user.avatar,
                  username: user.username,
                  displayName: user.displayName,
                });
                setCurrentScreen('collection-detail');
              }}
              onEditProfile={() => setCurrentScreen('edit-profile')}
              onShareProfile={() => {
                openShareSheet({
                  url: buildPublicProfileShareUrl(user.username),
                  title: user.displayName ?? user.username,
                  text: `Take a look at my travel profile on Vibinn: @${user.username}`,
                  allowRecap: true,
                });
              }}
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
              renderMomentEntryCard={({ place, contextNote, footer }) => (
                <MomentEntryCard
                  place={place}
                  contextNote={contextNote}
                  onOpenPlace={() => {
                    openPlaceDetail(place, 'profile');
                  }}
                  footer={footer}
                />
              )}
              renderSavedPlaceCard={(place, index) => (
                <PlaceCard
                  data={{
                    ...mapPlaceToCardData(place, index),
                    visitedByFollowingAvatars: [],
                    contextNote: 'saved to your vibe graph',
                  }}
                  onClick={() => {
                    openPlaceDetail(place, 'profile');
                  }}
                />
              )}
              ownFeedItems={ownProfileFeedItems}
              renderFeedEntryCard={(item, _index, controls) => (
                <FollowingFeedCard
                  item={item}
                  vibed={controls?.vibed ?? false}
                  vibinCount={controls?.vibinCount ?? 0}
                  commentsCount={controls?.commentsCount ?? 0}
                  onOpenPlace={item.type !== 'collection' ? () => openPlaceDetail(item.place, 'profile') : undefined}
                  onOpenCollection={item.type === 'collection' && item.collectionId ? () => {
                    const collection = customCollections.find((entry) => entry.id === item.collectionId);
                    if (!collection) return;
                    setSelectedCollection(collection);
                    setSelectedCollectionReturnScreen('profile');
                    setPublicCollectionId(null);
                    setSelectedCollectionOwner({
                      avatar: user.avatar,
                      username: user.username,
                      displayName: user.displayName,
                    });
                    setCurrentScreen('collection-detail');
                  } : undefined}
                  onOpenTraveler={() => setCurrentScreen('profile')}
                  onToggleVibin={controls?.onToggleVibin}
                  onOpenComments={controls?.onOpenComments}
                />
              )}
            />
          </Suspense>
        );
      case 'notifications':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <NotificationsScreen
              onBack={() => setCurrentScreen('discover-places')}
              onOpenPlace={(place) => {
                openPlaceDetail(place, 'notifications');
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
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <SettingsScreen
              user={user}
              onBack={() => setCurrentScreen('profile')}
              onOpenSection={(screen) => setCurrentScreen(screen)}
              onOpenPreferences={() => {
                setOnboardingEntryMode('swipe-direct');
                setCurrentScreen('onboarding');
              }}
              onLogout={async () => {
                await api.logout().catch(() => undefined);
                resetAnalyticsUser();
                trackEvent('Logged Out');
                setIsAuthenticated(false);
                showActionToast('Logged out');
                setCurrentScreen('discover-places');
              }}
            />
          </Suspense>
        );
      case 'settings-account':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <AccountSettingsScreen user={user} onBack={() => setCurrentScreen('settings')} />
          </Suspense>
        );
      case 'settings-notifications':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <NotificationSettingsScreen onBack={() => setCurrentScreen('settings')} />
          </Suspense>
        );
      case 'settings-privacy':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <PrivacySettingsScreen onBack={() => setCurrentScreen('settings')} />
          </Suspense>
        );
      case 'support':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <SupportScreen onBack={() => setCurrentScreen('settings')} />
          </Suspense>
        );
      case 'add-collection':
        return (
          <AddCollectionScreen
            savedPlaces={bookmarkedPlaces}
            onBack={() => setCurrentScreen('bookmarks')}
            onCreateCollection={async (collection) => {
              const response = await api.createCollection({
                label: collection.label,
                placeIds: collection.places.map((place) => place.id),
              });
              const nextCollection = {
                id: response.collection.id,
                label: response.collection.label,
                createdAt: response.collection.createdAt,
                places: response.collection.places as Place[],
              };
              setCustomCollections((prev) => [...prev, nextCollection]);
              setSelectedCollection(nextCollection);
              setSelectedCollectionReturnScreen('bookmarks');
              setPublicCollectionId(null);
              setSelectedCollectionOwner({
                avatar: user.avatar,
                username: user.username,
                displayName: user.displayName,
              });
              await refreshOwnProfile({ force: true });
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
              if (mockReviewScenario) {
                applyMockCheckIn({
                  placeId: editableMomentPlace.id,
                  visitedDate: payload.visitedDate ?? new Date().toISOString().split('T')[0],
                  caption: payload.caption ?? '',
                  uploadedMedia: payload.uploadedMedia ?? [],
                  rating: payload.rating ?? 4,
                  ratingLabel: payload.ratingLabel ?? 'liked',
                  budgetLevel: payload.budgetLevel ?? '$$',
                  visitType: payload.visitType ?? 'solo',
                  timeOfDay: payload.timeOfDay ?? 'afternoon',
                  privacy: payload.privacy ?? 'public',
                  wouldRevisit: payload.wouldRevisit ?? 'yes',
                  vibeTags: payload.vibeTags ?? [],
                });
                resetCreateMomentDraft();
                showActionToast('Check-in updated');
                setCurrentScreen('profile');
                return;
              }
              const response = await api.updateMoment(editableMomentId, payload);
              applyPersistedCheckIn(response.moment);
              void refreshOwnProfile({ force: true });
              showActionToast('Moment updated');
              setCurrentScreen('profile');
            }}
          />
        ) : null;
      case 'bookmarks':
        return (
          <BookmarksScreen
            bookmarkedPlaces={bookmarkedPlaces}
            isBookmarkedPlacesLoading={isBookmarkedPlacesLoading}
            collections={customCollections}
            onSelectPlace={(place) => {
              openPlaceDetail(place, 'bookmarks');
            }}
            onCreateCollection={() => setCurrentScreen('add-collection')}
            onOpenCollection={(collection) => {
              setSelectedCollection(collection);
              setSelectedCollectionReturnScreen('bookmarks');
              setPublicCollectionId(null);
              setSelectedCollectionOwner({
                avatar: user.avatar,
                username: user.username,
                displayName: user.displayName,
              });
              setCurrentScreen('collection-detail');
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
              if (mockReviewScenario) {
                applyMockCheckIn(payload);
                resetCreateMomentDraft();
                showActionToast('Check-in saved');
                setCurrentScreen('profile');
                return;
              }
              const response = await api.createMoment(payload);
              applyPersistedCheckIn(response.moment);
              void refreshOwnProfile({ force: true });
              resetCreateMomentDraft();
              showActionToast('Check-in saved');
              setCurrentScreen('profile');
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
                    setSavedLocations((prev) => mergeSavedLocations(prev, response.locations as SavedLocationOption[]));
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
            mockReviewData={mockReviewScenario ? {
              followedTravelers: mockReviewScenario.followedTravelers,
              similarTravelers: mockReviewScenario.similarTravelers,
              feedSavedDrops: mockReviewScenario.feedSavedDrops,
            } : undefined}
            currentUser={user}
            ownFeedItems={ownProfileFeedItems}
            onRequireAuth={(message, action) => openAuthGate(message, 'login', action)}
            onSelectPlace={(p, returnScreen) => {
              openPlaceDetail(p, returnScreen ?? 'discover-places');
            }}
            onSelectCollection={(collection, owner) => {
              setSelectedCollection(collection);
              setSelectedCollectionReturnScreen('discover-travelers');
              setPublicCollectionId(null);
              setSelectedCollectionOwner({
                avatar: owner.avatar,
                username: owner.username,
                displayName: owner.displayName,
              });
              setCurrentScreen('collection-detail');
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
        return isTravelerProfileLoading || !selectedTravelerHasHydratedDetail ? (
          <div className="min-h-screen bg-zinc-950 px-4 pb-24 pt-16 text-white">
            <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
              <div className="text-lg font-black text-white">Loading traveler profile...</div>
              <p className="mt-2 text-sm font-medium text-white/55">
                Pulling the latest saved places, collections, and feed from the backend.
              </p>
            </div>
          </div>
        ) : selectedTraveler ? (
          <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <TravelerProfileScreen
              user={selectedTraveler}
              bookmarkedPlaces={selectedTravelerBookmarkedPlaces}
              displayFlags={(selectedTraveler.flags?.length ? selectedTraveler.flags : deriveFlagsFromTravelHistory(selectedTraveler.travelHistory)).slice(0, 5)}
              onBack={() => {
                const nextScreen = selectedTravelerReturnScreen;
                setPublicProfileUsername(null);
                if (typeof window !== 'undefined') {
                  const nextPath = screenToAppPath(nextScreen);
                  if (`${window.location.pathname}${window.location.search}` !== nextPath) {
                    window.history.pushState({}, '', nextPath);
                  }
                }
                setCurrentScreen(nextScreen);
              }}
              onSavePlace={(placeToSave, nextActive) => syncBookmarkState(placeToSave, nextActive)}
              onSelectPlace={(p) => {
                openPlaceDetail(p, 'traveler-profile');
              }}
              onOpenCollection={(collection) => {
                setSelectedCollection(collection);
                setSelectedCollectionReturnScreen('traveler-profile');
                setPublicCollectionId(null);
                setSelectedCollectionOwner({
                  avatar: selectedTraveler.avatar,
                  username: selectedTraveler.username,
                  displayName: selectedTraveler.displayName,
                });
                setCurrentScreen('collection-detail');
              }}
              onShareProfile={() => {
                openShareSheet({
                  url: buildPublicProfileShareUrl(selectedTraveler.username),
                  title: selectedTraveler.displayName ?? selectedTraveler.username,
                  text: `Check out this traveler on Vibinn: @${selectedTraveler.username}`,
                });
              }}
              renderMomentEntryCard={({ place, contextNote, matchScore, footer }) => (
                <MomentEntryCard
                  place={place}
                  contextNote={contextNote}
                  onOpenPlace={() => {
                    openPlaceDetail(place, 'traveler-profile');
                  }}
                  matchScore={matchScore}
                  footer={footer}
                />
              )}
              renderSavedPlaceCard={(place, i) => (
                <PlaceCard
                  data={{
                    ...mapPlaceToCardData(place, i),
                    visitedByFollowingAvatars: [],
                    contextNote: 'saved from their travel diary',
                  }}
                  className="rounded-b-none border-0 shadow-none hover:translate-y-0 hover:shadow-none"
                  onClick={() => {
                    openPlaceDetail(place, 'traveler-profile');
                  }}
                />
              )}
              feedItems={selectedTravelerFeedItems}
              renderFeedEntryCard={(item, _index, controls) => (
                <FollowingFeedCard
                  item={item}
                  vibed={controls?.vibed ?? false}
                  vibinCount={controls?.vibinCount ?? 0}
                  commentsCount={controls?.commentsCount ?? 0}
                  onOpenPlace={item.type === 'collection' ? undefined : () => openPlaceDetail(item.place, 'traveler-profile')}
                  onOpenCollection={item.type === 'collection' && item.collectionId ? () => {
                    const collection = selectedTravelerCollections.find((entry) => entry.id === item.collectionId);
                    if (!collection) return;
                    setSelectedCollection(collection);
                    setSelectedCollectionReturnScreen('traveler-profile');
                    setPublicCollectionId(null);
                    setSelectedCollectionOwner({
                      avatar: selectedTraveler.avatar,
                      username: selectedTraveler.username,
                      displayName: selectedTraveler.displayName,
                    });
                    setCurrentScreen('collection-detail');
                  } : undefined}
                  onOpenTraveler={() => setCurrentScreen('traveler-profile')}
                  onToggleVibin={controls?.onToggleVibin}
                  onOpenComments={controls?.onOpenComments}
                />
              )}
              customCollections={selectedTravelerCollections}
            />
          </Suspense>
        ) : null;
      case 'collection-detail':
        return selectedCollection ? (
          <CollectionDetailScreen
            collection={selectedCollection}
            owner={selectedCollectionOwner}
            canEdit={!publicCollectionId && (selectedCollectionReturnScreen === 'bookmarks' || selectedCollectionReturnScreen === 'profile')}
            onEdit={() => showActionToast('Collection editing is next up')}
            onShare={() => {
              openShareSheet({
                url: buildPublicCollectionShareUrl(selectedCollection.id),
                title: selectedCollection.label,
                text: `Take a look at this collection on Vibinn: ${selectedCollection.label}`,
                allowRecap: true,
              });
            }}
            onBack={() => {
              if (publicCollectionId) {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  window.history.back();
                } else {
                  setCurrentScreen(isNativeApp() ? getNativeDefaultScreen() : 'landing');
                }
                return;
              }
              setCurrentScreen(selectedCollectionReturnScreen);
            }}
            onSelectPlace={(place) => {
              openPlaceDetail(place, 'collection-detail');
            }}
          />
        ) : publicCollectionId ? (
          isPublicCollectionLoading ? (
            <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
              <div className="rounded-[2rem] border border-white/10 bg-white/6 px-6 py-8">
                <h1 className="text-2xl font-black tracking-tight">Loading collection</h1>
                <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                  Pulling this shared list now.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
              <div className="rounded-[2rem] border border-white/10 bg-white/6 px-6 py-8">
                <h1 className="text-2xl font-black tracking-tight">{publicCollectionError ?? 'Collection not found'}</h1>
                <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                  This shared collection is not available in the current environment.
                </p>
                <button
                  type="button"
                  onClick={openApp}
                  className="mt-5 rounded-[1.25rem] bg-accent px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:brightness-105"
                >
                  Open app
                </button>
              </div>
            </div>
          )
        ) : null;
      case 'discover-places':
        return discoveryPlacesScreen;
      case 'place-detail':
        return placeDetailContent;
      case 'event-detail':
        return eventDetailContent;
      case 'public-profile':
        return isPublicProfileLoading ? (
          <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
            <div className="rounded-[2rem] border border-white/10 bg-white/6 px-6 py-8">
              <h1 className="text-2xl font-black tracking-tight">Loading profile</h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                Pulling this traveler&apos;s public travel card now.
              </p>
            </div>
          </div>
        ) : resolvedPublicProfileUser ? (
          <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <PublicProfileScreen
              user={resolvedPublicProfileUser}
              bookmarkedPlaces={resolvedPublicProfileBookmarkedPlaces}
              customCollections={resolvedPublicProfileCollections}
              onFollow={openAppStore}
              onOpenCollection={(collection) => {
                setSelectedCollection(collection);
                setSelectedCollectionReturnScreen('public-profile');
                setPublicCollectionId(collection.id ?? null);
                setSelectedCollectionOwner({
                  avatar: resolvedPublicProfileUser.avatar,
                  username: resolvedPublicProfileUser.username,
                  displayName: resolvedPublicProfileUser.displayName,
                });
                setCurrentScreen('collection-detail');
              }}
              displayFlags={(resolvedPublicProfileUser.flags?.length ? resolvedPublicProfileUser.flags : deriveFlagsFromTravelHistory(resolvedPublicProfileUser.travelHistory)).slice(0, 5)}
              publicMomentsCount={resolvedPublicProfileUser.travelHistory.flatMap((item) => item.places ?? []).length}
              feedItems={publicProfileFeedItems}
              renderFeedEntryCard={(item, index) => (
                <FollowingFeedCard
                  item={item}
                  vibed={false}
                  vibinCount={0}
                  commentsCount={0}
                  onOpenPlace={undefined}
                  onOpenCollection={item.type === 'collection' ? () => {
                    const collection = resolvedPublicProfileCollections.find((entry) => entry.id === item.collectionId);
                    if (!collection) return;
                    setSelectedCollection(collection);
                    setSelectedCollectionReturnScreen('public-profile');
                    setPublicCollectionId(collection.id ?? null);
                    setSelectedCollectionOwner({
                      avatar: resolvedPublicProfileUser.avatar,
                      username: resolvedPublicProfileUser.username,
                      displayName: resolvedPublicProfileUser.displayName,
                    });
                    setCurrentScreen('collection-detail');
                  } : undefined}
                  onOpenTraveler={() => {}}
                />
              )}
              renderSavedPlaceCard={(place, index) => (
                <PlaceCard
                  data={{
                    ...mapPlaceToCardData(place, index),
                    visitedByFollowingAvatars: [],
                    contextNote: 'saved to their vibe graph',
                  }}
                  showFullHook
                  hideRecommendationSection
                  onClick={openApp}
                />
              )}
              renderMomentCard={(place, index) => (
                <MomentEntryCard
                  place={place}
                  contextNote={place.visitedDate ? `Visited on ${place.visitedDate}` : place.location}
                  traveler={{ username: resolvedPublicProfileUser.username, avatar: resolvedPublicProfileUser.avatar }}
                  onOpenPlace={openApp}
                />
              )}
            />
          </Suspense>
        ) : (
          <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
            <div className="rounded-[2rem] border border-white/10 bg-white/6 px-6 py-8">
              <h1 className="text-2xl font-black tracking-tight">Profile not found</h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                That public travel profile is not available in this local build.
              </p>
              <button
                type="button"
                onClick={openApp}
                className="mt-6 rounded-[1.2rem] bg-accent px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:brightness-105"
              >
                Open the app
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderPublicWebScreen = () => {
    switch (currentScreen) {
      case 'terms':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <TermsOfServiceScreen />
          </Suspense>
        );
      case 'privacy':
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <PrivacyPolicyScreen />
          </Suspense>
        );
      case 'public-profile':
        return isPublicProfileLoading ? (
          <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
            <div className="rounded-[2rem] border border-white/10 bg-white/6 px-6 py-8">
              <h1 className="text-2xl font-black tracking-tight">Loading profile</h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                Pulling this traveler&apos;s public travel card now.
              </p>
            </div>
          </div>
        ) : resolvedPublicProfileUser ? (
          <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <PublicProfileScreen
              user={resolvedPublicProfileUser}
              bookmarkedPlaces={resolvedPublicProfileBookmarkedPlaces}
              customCollections={resolvedPublicProfileCollections}
              onFollow={openAppStore}
              onOpenCollection={(collection) => {
                setSelectedCollection(collection);
                setSelectedCollectionReturnScreen('public-profile');
                setPublicCollectionId(collection.id ?? null);
                setSelectedCollectionOwner({
                  avatar: resolvedPublicProfileUser.avatar,
                  username: resolvedPublicProfileUser.username,
                  displayName: resolvedPublicProfileUser.displayName,
                });
                setCurrentScreen('collection-detail');
              }}
              displayFlags={(resolvedPublicProfileUser.flags?.length ? resolvedPublicProfileUser.flags : deriveFlagsFromTravelHistory(resolvedPublicProfileUser.travelHistory)).slice(0, 5)}
              publicMomentsCount={resolvedPublicProfileUser.travelHistory.flatMap((item) => item.places ?? []).length}
              feedItems={publicProfileFeedItems}
              renderFeedEntryCard={(item, index) => (
                <FollowingFeedCard
                  item={item}
                  vibed={publicProfileFeedControls[item.id]?.vibed}
                  vibinCount={publicProfileFeedControls[item.id]?.vibinCount}
                  commentsCount={publicProfileFeedControls[item.id]?.commentsCount}
                  onOpenPlace={item.type === 'collection' ? undefined : () => openPlaceDetail(item.place, 'public-profile')}
                  onOpenCollection={item.type === 'collection' && item.collectionId ? () => {
                    const collection = resolvedPublicProfileCollections.find((entry) => entry.id === item.collectionId);
                    if (!collection) return;
                    setSelectedCollection(collection);
                    setSelectedCollectionReturnScreen('public-profile');
                    setPublicCollectionId(collection.id ?? null);
                    setSelectedCollectionOwner({
                      avatar: resolvedPublicProfileUser.avatar,
                      username: resolvedPublicProfileUser.username,
                      displayName: resolvedPublicProfileUser.displayName,
                    });
                    setCurrentScreen('collection-detail');
                  } : undefined}
                  onOpenTraveler={() => undefined}
                  onToggleVibin={undefined}
                  onOpenComments={undefined}
                  showSocialActions={false}
                  animationDelay={Math.min(index, 8) * 0.03}
                />
              )}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <LandingPage
              analyticsContext={buildAnalyticsUserContext()}
              onHeaderTryNow={openAppStore}
              onFloatingTryNow={openAppStore}
            />
          </Suspense>
        );
      case 'landing':
      default:
        return (
          <Suspense fallback={<div className="h-[100svh] bg-zinc-950" />}>
            <LandingPage
              analyticsContext={buildAnalyticsUserContext()}
              onHeaderTryNow={() => {
                trackEvent('Try now', {
                  ...buildAnalyticsUserContext(),
                  placement: 'landing_header',
                });
                openAppStore();
              }}
              onFloatingTryNow={() => {
                trackEvent('Try now', {
                  ...buildAnalyticsUserContext(),
                  placement: 'landing_floating',
                });
                openAppStore();
              }}
            />
          </Suspense>
        );
    }
  };

  if (isPublicWebMode) {
    return (
      <div className="app-shell app-screen-shell relative overflow-hidden bg-zinc-950">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="app-screen-shell"
          >
            {renderPublicWebScreen()}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={currentScreen === 'landing'
      ? 'app-shell app-screen-shell bg-zinc-950 relative overflow-hidden'
      : `${isNativeApp() ? 'app-shell native-app-shell' : 'app-shell max-w-md mx-auto shadow-2xl border-x border-white/8'} bg-zinc-950 relative overflow-hidden`}
    >
      {mockReviewMode ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[95] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-accent/35 bg-black/88 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-accent shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span>Mock review mode</span>
            <button
              type="button"
              onClick={disableMockReviewMode}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] text-white"
            >
              Exit
            </button>
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isNativeApp() ? 0.12 : 0.2 }}
          className={currentScreen === 'landing' ? 'app-screen-shell' : 'app-screen-shell pb-24'}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>

      {currentScreen !== 'landing' && currentScreen !== 'onboarding' && currentScreen !== 'public-profile' && currentScreen !== 'place-detail' && currentScreen !== 'event-detail' && currentScreen !== 'traveler-profile' && currentScreen !== 'location-search' && currentScreen !== 'collection-detail' && currentScreen !== 'create-moment' && currentScreen !== 'login' && currentScreen !== 'register' && currentScreen !== 'settings' && currentScreen !== 'settings-account' && currentScreen !== 'settings-notifications' && currentScreen !== 'settings-privacy' && currentScreen !== 'support' && currentScreen !== 'add-collection' && currentScreen !== 'notifications' && currentScreen !== 'edit-profile' && currentScreen !== 'edit-moment' && !isFloatingNavHidden && (
        <nav className="safe-bottom-offset fixed left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[24rem] -translate-x-1/2 items-center justify-between rounded-full border border-white/10 bg-black/88 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
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
                openAuthGate('Create an account to check in and build your own taste profile.', 'register', () => {
                  resetCreateMomentDraft();
                  setCurrentScreen('create-moment');
                });
                return;
              }
              resetCreateMomentDraft();
              setCurrentScreen('create-moment');
            }}
            className="relative -my-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-zinc-950 bg-accent text-black shadow-[0_18px_40px_rgba(211,255,72,0.28)] transition hover:scale-105 active:scale-[0.98]"
            aria-label="Check in"
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
                openAuthGate('Log in to open your taste profile and manage your check-ins.', 'login', () => {
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
            className="safe-bottom-offset fixed left-1/2 z-50 w-[calc(100%-3rem)] max-w-xs -translate-x-1/2 rounded-full border border-white/10 bg-white px-4 py-3 text-center text-sm font-black text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
            style={{ marginBottom: '4.5rem' }}
          >
            {actionToast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {shareSheetState ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareSheetState(null)}
              className="fixed inset-0 z-[60] bg-black/70"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="safe-bottom-pad fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-950 px-4 pt-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-5">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Share</div>
                <div className="mt-2 text-xl font-black tracking-[-0.04em] text-white">{shareSheetState.title}</div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/58">
                  Send the link out, or copy it for later.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {shareSheetState.allowRecap ? (
                  <button
                    type="button"
                    onClick={() => {
                      void generateProfileRecap();
                    }}
                    disabled={isProfileRecapGenerating}
                    className="flex w-full items-center justify-center rounded-[20px] border border-white/10 bg-white/8 px-4 py-4 text-sm font-black text-white transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isProfileRecapGenerating ? 'Generating recap...' : 'Recap travel 2026'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void shareUrl({
                      ...shareSheetState,
                      successToast: 'Share sheet opened',
                    }).finally(() => setShareSheetState(null));
                  }}
                  className="flex w-full items-center justify-center rounded-[20px] bg-accent px-4 py-4 text-sm font-black text-black transition hover:brightness-105"
                >
                  Share now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(shareSheetState.url)
                      .then((copied) => {
                        if (copied) {
                          showActionToast('Link copied');
                        } else {
                          showActionToast(shareSheetState.url);
                        }
                      })
                      .finally(() => setShareSheetState(null));
                  }}
                  className="flex w-full items-center justify-center rounded-[20px] border border-white/10 bg-white/8 px-4 py-4 text-sm font-black text-white transition hover:bg-white/12"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => setShareSheetState(null)}
                  className="flex w-full items-center justify-center rounded-[20px] border border-white/10 bg-transparent px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white/6"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {profileRecapState ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProfileRecapState(null)}
              className="fixed inset-0 z-[70] bg-black/80"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              className="fixed inset-x-0 bottom-0 z-[80] mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-950 px-4 pb-8 pt-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-5">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Share recap</div>
                <div className="mt-2 text-xl font-black tracking-[-0.04em] text-white">Recap travel 2026</div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/58">
                  A shareable story card built from your moments, saved places, and travel taste.
                </p>
              </div>

              <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-black/50">
                <img
                  src={profileRecapState.imageUrl}
                  alt="Travel recap 2026"
                  className="h-auto w-full object-cover"
                />
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    void shareGeneratedImage(profileRecapState.imageUrl, profileRecapState.fileName).then((shared) => {
                      if (!shared) {
                        downloadDataUrl(profileRecapState.imageUrl, profileRecapState.fileName);
                        showActionToast('Recap saved');
                      }
                    });
                  }}
                  className="flex w-full items-center justify-center rounded-[20px] bg-accent px-4 py-4 text-sm font-black text-black transition hover:brightness-105"
                >
                  Share recap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadDataUrl(profileRecapState.imageUrl, profileRecapState.fileName);
                    showActionToast('Recap saved');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/8 px-4 py-4 text-sm font-black text-white transition hover:bg-white/12"
                >
                  <Download size={16} />
                  Save image
                </button>
                <button
                  type="button"
                  onClick={() => setProfileRecapState(null)}
                  className="flex w-full items-center justify-center rounded-[20px] border border-white/10 bg-transparent px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white/6"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// --- ONBOARDING SCREEN ---
function PostPreferencesIntro() {
  const title = "You're all set! Happy hunting!";
  const [typedTitle, setTypedTitle] = useState('');

  useEffect(() => {
    let currentIndex = 0;
    setTypedTitle('');

    const intervalId = window.setInterval(() => {
      currentIndex += 1;
      setTypedTitle(title.slice(0, currentIndex));
      if (currentIndex >= title.length) {
        window.clearInterval(intervalId);
      }
    }, 45);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="relative flex h-[100svh] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(211,255,72,0.18),_transparent_28%),linear-gradient(160deg,#120f1f_0%,#101820_38%,#071014_100%)] px-8 text-center text-white">
      <div className="pointer-events-none absolute -left-16 top-20 h-40 w-40 rounded-full bg-pink-400/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 top-24 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl" />
      <div className="pointer-events-none absolute bottom-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/12 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-sm">
        <h1 className="min-h-[6.4rem] text-4xl font-black tracking-tighter sm:text-5xl">
          {typedTitle}
          <span className="ml-1 inline-block h-[0.9em] w-[0.08em] animate-pulse bg-accent align-[-0.08em]" />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: typedTitle.length === title.length ? 1 : 0, y: typedTitle.length === title.length ? 0 : 14 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="mt-3 text-base font-medium leading-relaxed text-white/68"
        >
          We&apos;re locking in your first feed now.
        </motion.p>
      </div>
    </div>
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
  onSuccess: (payload?: { id?: string; name?: string; username?: string; email?: string }) => void | Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const authInputClassName = 'w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-base font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10';

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
              await onSuccess({
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
              className={authInputClassName}
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
              className={authInputClassName}
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
              void onSuccess({
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
  onSuccess: (payload?: { id?: string; name?: string; username?: string; email?: string }) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'options' | 'manual'>('options');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const authInputClassName = 'w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-base font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10';

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
                void onSuccess({
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
              className={authInputClassName}
            />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className={authInputClassName}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className={authInputClassName}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              className={authInputClassName}
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
                  void onSuccess({
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
  const profileInputClassName = 'w-full rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4 text-base font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10';

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
                src={resolveApiAssetUrl(avatarUrl)}
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
            className={profileInputClassName}
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
          className={profileInputClassName}
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
            className={profileInputClassName}
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
    ratingLabel: MomentRatingLabel;
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
  savedPlaces,
  onBack,
  onCreateCollection,
}: {
  savedPlaces: Place[];
  onBack: () => void;
  onCreateCollection: (collection: { label: string; places: Place[] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const uniqueSavedPlaces = savedPlaces.filter((place, index, array) => array.findIndex((item) => item.id === place.id) === index);

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
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Bundle your saved places into a collection.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Pick places you have saved, then give the collection a title.</p>
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
        <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Choose from your saved places</div>
        <div className="space-y-3">
          {uniqueSavedPlaces.map((place) => {
            const active = selectedPlaceIds.includes(place.id);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() =>
                  setSelectedPlaceIds((prev) => prev.includes(place.id) ? prev.filter((id) => id !== place.id) : [...prev, place.id])
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
        onClick={async () => {
          if (isSubmitting || !title.trim() || selectedPlaceIds.length === 0) return;
          setIsSubmitting(true);
          try {
            await onCreateCollection({ label: title.trim(), places: uniqueSavedPlaces.filter((place) => selectedPlaceIds.includes(place.id)) });
          } finally {
            setIsSubmitting(false);
          }
        }}
        disabled={!title.trim() || selectedPlaceIds.length === 0 || isSubmitting}
        className={`mt-6 w-full rounded-[1.4rem] px-5 py-4 text-sm font-black transition ${
          title.trim() && selectedPlaceIds.length > 0 && !isSubmitting ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
        }`}
      >
        {isSubmitting ? 'Creating...' : 'Create collection'}
      </button>
    </div>
  );
}

function buildTravelerCardData(traveler: User, index: number, isFollowing = false): TravelerCardData {
  const visitedPreviewPlaces = traveler.travelHistory
    .flatMap((trip) => trip.places ?? [])
    .flatMap((place) => {
      const mediaItems = (place.momentMedia?.map((item, mediaIndex) => ({
        id: `${place.id}-${place.momentId ?? 'place'}-${mediaIndex}`,
        imageUrl: item.url,
        label: place.name,
      })) ?? []).filter((item) => item.imageUrl);

      if (mediaItems.length > 0) {
        return mediaItems;
      }

      const fallbackImage = place.images?.[0] ?? place.image;
      return fallbackImage ? [{
        id: `${place.id}-${place.momentId ?? 'place'}`,
        imageUrl: fallbackImage,
        label: place.name,
      }] : [];
    });
  const savedPreviewPlaces = (traveler.recentSavedPlaces ?? [])
    .flatMap((entry) => {
      const place = entry.place;
      const fallbackImage = place.images?.[0] ?? place.image;
      return fallbackImage ? [{
        id: `saved-${place.id}`,
        imageUrl: fallbackImage,
        label: place.name,
      }] : [];
    });
  const previewPlaces = [...visitedPreviewPlaces, ...savedPreviewPlaces]
    .filter((item, itemIndex, items) => items.findIndex((candidate) => candidate.imageUrl === item.imageUrl) === itemIndex)
    .slice(0, 5);

  return {
    id: traveler.id,
    displayName: traveler.displayName,
    username: traveler.username,
    avatarUrl: traveler.avatar,
    bio: traveler.bio,
    countriesCount: traveler.stats.countries,
    citiesCount: traveler.stats.cities,
    countryFlags: ((traveler.flags?.length ? traveler.flags : deriveFlagsFromTravelHistory(traveler.travelHistory)) ?? []).slice(0, 6),
    badges: traveler.badges?.slice(0, 3) ?? [],
    descriptor: traveler.descriptor ?? '',
    relevanceReason: traveler.relevanceReason ?? '',
    matchScore: traveler.matchScore ?? 0,
    recentLocation: traveler.travelHistory[0]?.cities[0],
    recentPlaceName: traveler.travelHistory[0]?.places?.[0]?.name,
    placesCount: traveler.travelHistory.flatMap((trip) => trip.places ?? []).length,
    vibinCount: traveler.vibinCount ?? 0,
    previewPlaces,
    isFollowing,
  };
}

function SuggestedTravelerRailCard({
  traveler,
  card,
  onOpenTraveler,
  onToggleFollow,
}: {
  traveler: User;
  card: TravelerCardData;
  onOpenTraveler: () => void;
  onToggleFollow: () => void;
}) {
  const visitedCount = traveler.travelHistory.flatMap((trip) => trip.places ?? []).length;
  const savedCount = traveler.savedPlacesCount ?? traveler.recentSavedPlaces?.length ?? 0;
  const collectionsCount = traveler.collectionsCount ?? 0;

  return (
    <div className="flex h-[25.5rem] w-[19rem] shrink-0 flex-col rounded-[28px] border border-white/10 bg-white/6 p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpenTraveler} className="shrink-0">
          <img
            src={traveler.avatar}
            alt={traveler.username}
            className="h-14 w-14 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(event) => handleAvatarImageError(event, traveler.username)}
          />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpenTraveler} className="block text-left">
            <div className="truncate text-sm font-black text-white">{traveler.displayName ?? traveler.username}</div>
            <div className="truncate text-xs font-medium text-white/45">@{traveler.username}</div>
          </button>
          <div className="mt-2 text-[13px] font-medium leading-relaxed text-white/72">
            {card.descriptor || 'Taste worth exploring.'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-dark">
          {card.matchScore}% match
        </div>
        <button
          type="button"
          onClick={onToggleFollow}
          className={`rounded-full px-4 py-2 text-xs font-black transition ${card.isFollowing ? 'border border-white/10 bg-white/8 text-white' : 'bg-white text-black hover:bg-white/90'}`}
        >
          {card.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[18px] border border-white/10 bg-black/20 px-2 py-3">
          <div className="text-sm font-black text-white">{visitedCount}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Visited</div>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-black/20 px-2 py-3">
          <div className="text-sm font-black text-white">{savedCount}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Saved</div>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-black/20 px-2 py-3">
          <div className="text-sm font-black text-white">{collectionsCount}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Lists</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {card.previewPlaces.slice(0, 3).map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={onOpenTraveler}
            className="overflow-hidden rounded-[16px] border border-white/10 bg-zinc-900"
          >
            <img
              src={place.imageUrl}
              alt={place.label}
              className="aspect-[4/5] w-full object-cover"
              referrerPolicy="no-referrer"
              onError={(event) => handleMediaImageError(event, place.label)}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchTravelerListCard({
  traveler,
  card,
  onOpenTraveler,
  onToggleFollow,
}: {
  traveler: User;
  card: TravelerCardData;
  onOpenTraveler: () => void;
  onToggleFollow: () => void;
}) {
  const visitedCount = traveler.travelHistory.flatMap((trip) => trip.places ?? []).length;
  const savedCount = traveler.savedPlacesCount ?? traveler.recentSavedPlaces?.length ?? 0;
  const collectionsCount = traveler.collectionsCount ?? 0;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenTraveler} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <img
            src={traveler.avatar}
            alt={traveler.username}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(event) => handleAvatarImageError(event, traveler.username)}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{traveler.displayName ?? traveler.username}</div>
            <div className="truncate text-xs font-medium text-white/45">@{traveler.username}</div>
            <div className="mt-2 text-[13px] font-medium leading-relaxed text-white/72">
              {card.descriptor || 'Taste worth exploring.'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onToggleFollow}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${card.isFollowing ? 'border border-white/10 bg-white/8 text-white' : 'bg-white text-black hover:bg-white/90'}`}
        >
          {card.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-dark">
          {card.matchScore}% match
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
          {visitedCount} visited
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
          {savedCount} saved
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
          {collectionsCount} lists
        </div>
      </div>
    </div>
  );
}

function formatRelativeActivityTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'recently';
  const diffMs = Date.now() - timestamp;
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${Math.max(1, diffMonths)}mo ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${Math.max(1, diffYears)}y ago`;
}

function parseRelativeActivityLabelToTimestamp(label?: string | null) {
  if (!label) return 0;
  const normalized = label.trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized === 'just now') return Date.now();
  if (normalized === 'yesterday') return Date.now() - 24 * 60 * 60 * 1000;
  if (normalized === 'today') return Date.now();
  if (normalized === 'this week') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (normalized === 'last week') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (normalized === 'this month') return Date.now() - 30 * 24 * 60 * 60 * 1000;

  const shorthandMatch = normalized.match(/^(\d+)\s*(h|d|w|mo|y)\s*ago$/);
  const wordMatch = normalized.match(/^(\d+)\s*(hour|hours|day|days|week|weeks|month|months|year|years)\s*ago$/);
  const match = shorthandMatch ?? wordMatch;
  if (!match) return 0;

  const value = Number(match[1]);
  const unit = match[2];
  const hourMs = 60 * 60 * 1000;

  switch (unit) {
    case 'h':
    case 'hour':
    case 'hours':
      return Date.now() - value * hourMs;
    case 'd':
    case 'day':
    case 'days':
      return Date.now() - value * 24 * hourMs;
    case 'w':
    case 'week':
    case 'weeks':
      return Date.now() - value * 7 * 24 * hourMs;
    case 'mo':
    case 'month':
    case 'months':
      return Date.now() - value * 30 * 24 * hourMs;
    case 'y':
    case 'year':
    case 'years':
      return Date.now() - value * 365 * 24 * hourMs;
    default:
      return 0;
  }
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
}

function isRenderableAssetUrl(url?: string | null) {
  if (!url) return false;
  return /^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:');
}

function normalizeRenderableAssetUrl(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const resolved = resolveApiAssetUrl(trimmed);
  if (isRenderableAssetUrl(resolved)) return resolved;

  if (/^[a-z0-9/_-]+\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)(\?.*)?$/i.test(trimmed)) {
    return resolveApiAssetUrl(`/${trimmed.replace(/^\/+/, '')}`);
  }

  return null;
}

function handleMediaImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

function MomentMediaScroller({
  media,
  label,
  onOpen,
}: {
  media: Array<{ url: string; mediaType: 'image' | 'video' }>;
  label: string;
  onOpen: (index: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = () => {
    const container = scrollerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll('[data-media-slide="true"]')) as HTMLElement[];
    if (items.length === 0) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let nextIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.clientWidth / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextIndex = index;
      }
    });
    setActiveIndex(nextIndex);
  };

  return (
    <div className="overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={updateActiveIndex}
        className="overflow-x-auto snap-x snap-mandatory no-scrollbar"
      >
      <div className="flex gap-0">
        {media.map((item, index) => (
          <button
            key={`${item.url}-${index}`}
            type="button"
            onClick={() => onOpen(index)}
            data-media-slide="true"
            className="w-full shrink-0 snap-start snap-always overflow-hidden bg-white/6"
          >
            {item.mediaType === 'video' ? (
              <video
                src={item.url}
                className="block max-h-[30rem] min-h-[14rem] w-full bg-black object-contain"
                autoPlay={activeIndex === index}
                playsInline
                muted
                loop
              />
            ) : (
              <img
                src={item.url}
                alt={`${label} ${index + 1}`}
                className="block max-h-[30rem] min-h-[14rem] w-full bg-black object-contain"
                referrerPolicy="no-referrer"
                onError={(event) => handleMediaImageError(event, label)}
              />
            )}
          </button>
        ))}
      </div>
      </div>
      {media.length > 1 ? (
        <div className="px-4 pb-2 pt-2">
          <div className="flex items-center gap-1">
            {media.map((item, index) => (
              <div
                key={`${item.url}-progress-${index}`}
                className={`transition ${
                  index === activeIndex ? 'h-0.5 w-4 rounded-full bg-white' : 'h-1.5 w-1.5 rounded-full bg-white/22'
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MomentEntryCard({
  place,
  contextNote,
  onOpenPlace,
  onOpenTraveler,
  footer,
  matchScore,
  traveler,
}: {
  place: Place;
  contextNote: string;
  onOpenPlace: () => void;
  onOpenTraveler?: () => void;
  footer?: ReactNode;
  matchScore?: number;
  traveler?: { username: string; avatar: string };
}) {
  const media = (place.images?.length ? place.images : [place.image])
    .map((url) => normalizeRenderableAssetUrl(url))
    .filter((url): url is string => Boolean(url));
  const validMomentMedia = (place.momentMedia ?? [])
    .map((item) => {
      const normalizedUrl = normalizeRenderableAssetUrl(item.url);
      if (!normalizedUrl) return null;
      return {
        ...item,
        url: normalizedUrl,
      };
    })
    .filter((item): item is { url: string; mediaType: 'image' | 'video' } => Boolean(item));
  const normalizedMedia = (validMomentMedia.length > 0
    ? validMomentMedia
    : media.map((url) => ({ url, mediaType: isVideoUrl(url) ? 'video' as const : 'image' as const })));
  const ratingMeta = momentRatingMeta(place.momentRatingLabel, place.momentRating);
  const primaryMeta = [
    place.momentTimeOfDay,
    place.momentVisitType,
    place.momentWouldRevisit === 'yes'
      ? 'would revisit'
      : place.momentWouldRevisit === 'not_sure'
        ? 'maybe again'
        : place.momentWouldRevisit === 'not_interested'
          ? 'one-time stop'
          : null,
  ].filter(Boolean);
  const vibeTags = (place.momentVibeTags ?? []).filter(Boolean).slice(0, 3);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        {traveler ? (
          <button
            type="button"
            onClick={onOpenTraveler}
            className="flex w-full items-center gap-3 border-b border-white/8 px-4 py-4 text-left transition hover:bg-white/5"
          >
            <img
              src={resolveApiAssetUrl(traveler.avatar)}
              alt={traveler.username}
              className="h-11 w-11 rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, traveler.username)}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-white">@{traveler.username}</div>
              <div className="truncate text-xs font-medium text-white/45">{contextNote}</div>
            </div>
          </button>
        ) : null}
      <button
        type="button"
        onClick={onOpenPlace}
        className="w-full px-4 pb-4 pt-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {traveler ? (
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/30">
                Place
              </div>
            ) : null}
            <div className="text-lg font-black leading-tight text-white">{place.name}</div>
            {place.category ? (
              <div className="mt-2">
                <span className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                  {place.category}
                </span>
              </div>
            ) : null}
            {!traveler ? <div className="mt-1 text-xs font-medium text-white/45">{contextNote}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">
            {typeof matchScore === 'number' ? (
              <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-dark">
                {Math.min(matchScore, 98)}%
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <MomentMediaScroller
        media={normalizedMedia}
        label={place.name}
        onOpen={(index) => {
          setActiveMediaIndex(index);
          setIsViewerOpen(true);
        }}
      />

      <div className="border-t border-white/8 px-4 pb-4 pt-4">
        {traveler ? (
          <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/30">
            Moment
          </div>
        ) : null}
        <div className="space-y-3">
        {place.momentCaption ? (
          <p className="text-sm font-medium leading-relaxed text-white/82">{place.momentCaption}</p>
        ) : null}

        {ratingMeta || primaryMeta.length > 0 || vibeTags.length > 0 ? (
          <div className="space-y-1 text-xs font-medium text-white/42">
            {ratingMeta ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 font-black text-white/78">
                <ratingMeta.Icon size={12} />
                {ratingMeta.label}
              </div>
            ) : null}
            {primaryMeta.length > 0 ? (
              <div>{primaryMeta.join(' • ')}</div>
            ) : null}
            {vibeTags.length > 0 ? (
              <div>{vibeTags.map((tag) => `#${tag}`).join('  ')}</div>
            ) : null}
          </div>
        ) : null}

        {footer}
        </div>
      </div>
      </div>

      {isViewerOpen ? (
        <div className="fixed inset-0 z-[90] bg-black">
          <button
            type="button"
            onClick={() => setIsViewerOpen(false)}
            className="absolute right-4 top-6 z-[100] rounded-full bg-black/60 p-3 text-white backdrop-blur-md"
            aria-label="Close full-screen media"
          >
            <X size={18} />
          </button>
          <div className="h-full overflow-y-auto snap-y snap-mandatory">
            {normalizedMedia.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="relative flex min-h-screen snap-start items-center justify-center bg-black px-3 py-20"
              >
                {item.mediaType === 'video' ? (
                  <video
                    src={item.url}
                    autoPlay={index === activeMediaIndex}
                    muted
                    loop
                    controls
                    playsInline
                    className="max-h-full w-full rounded-[24px] object-contain"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={`${place.name} media ${index + 1}`}
                    className="max-h-full w-full rounded-[24px] object-contain"
                    onError={(event) => handleMediaImageError(event, place.name)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function TravelerPlaceCard({
  place,
  contextNote,
  vibed,
  saved,
  shared,
  commentsCount = 0,
  matchScore,
  onOpenPlace,
  onToggleVibin,
  onToggleSave,
  onToggleShare,
  onOpenComments,
  onOpenTraveler,
  traveler,
}: {
  place: Place;
  contextNote: string;
  vibed: boolean;
  saved: boolean;
  shared: boolean;
  commentsCount?: number;
  matchScore?: number;
  onOpenPlace: () => void;
  onToggleVibin: () => void;
  onToggleSave: () => void;
  onToggleShare: () => void;
  onOpenComments: () => void;
  onOpenTraveler?: () => void;
  traveler?: { username: string; avatar: string };
}) {
  const actionClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
      active ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
    }`;

  return (
    <MomentEntryCard
      place={place}
      contextNote={contextNote}
      onOpenPlace={onOpenPlace}
      onOpenTraveler={onOpenTraveler}
      matchScore={matchScore}
      traveler={traveler}
      footer={(
        <>
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
          </div>

          <div className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black text-white/75">{commentsCount} comments</div>
              <button type="button" onClick={onOpenComments} className="text-xs font-black text-accent">
                Write a comment
              </button>
            </div>
          </div>
        </>
      )}
    />
  );
}

function FollowingFeedCard({
  item,
  vibed,
  vibinCount = 0,
  commentsCount = 0,
  onOpenPlace,
  onOpenCollection,
  onOpenTraveler,
  onToggleVibin,
  onOpenComments,
}: {
  item:
    | {
        type: 'saved' | 'visited';
        traveler: User;
        place: Place;
        activityDate: string;
        caption?: string;
        compatibility?: number;
        sortTimestamp: number;
      }
    | {
        type: 'collection';
        collectionId?: string;
        traveler: User;
        collectionName: string;
        collectionPlaces: Place[];
        activityDate: string;
        caption?: string;
        sortTimestamp: number;
  };
  vibed: boolean;
  vibinCount?: number;
  commentsCount?: number;
  onOpenPlace?: () => void;
  onOpenCollection?: () => void;
  onOpenTraveler: () => void;
  onToggleVibin?: () => void;
  onOpenComments?: () => void;
}) {
  const activityCopy =
    item.type === 'saved'
      ? 'saved a place'
      : item.type === 'visited'
        ? 'visited a place'
        : 'created a collection';
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpenTraveler} className="shrink-0">
          <img
            src={item.traveler.avatar}
            alt={item.traveler.username}
            className="h-11 w-11 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(event) => handleAvatarImageError(event, item.traveler.username)}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white">
                <button type="button" onClick={onOpenTraveler} className="font-black text-left text-white">
                  {item.traveler.displayName ?? item.traveler.username}
                </button>
                <span className="ml-1 font-medium text-white/78">{activityCopy}</span>
              </div>
              <div className="text-xs font-medium text-white/45">
                @{item.traveler.username} • {item.activityDate}
              </div>
            </div>
          </div>

          {item.type !== 'saved' && item.caption ? (
            <p className="mt-3 text-sm font-medium leading-relaxed text-white/82">{item.caption}</p>
          ) : null}

          {item.type === 'collection' ? (
            <button
              type="button"
              onClick={onOpenCollection}
              className="mt-3 w-full overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/70 text-left transition hover:bg-white/8"
            >
              <div className="grid grid-cols-2 gap-[1px] bg-white/10">
                {item.collectionPlaces.slice(0, 4).map((place) => (
                  <div key={`${item.collectionName}-${place.id}`} className="overflow-hidden bg-black">
                    <img src={getSafePlaceImage(place)} alt={place.name} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <div className="px-4 py-4">
                <div className="text-sm font-black text-white">{item.collectionName}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
                  {item.collectionPlaces.length} places
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenPlace}
              className="mt-3 w-full overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/70 text-left transition hover:bg-white/8"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                <img src={getSafePlaceImage(item.place)} alt={item.place.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">{item.place.name}</div>
                      {(item.place.tags ?? []).slice(0, 1).map((tag) => (
                        <span key={`${item.place.id}-${tag}`} className="mt-2 inline-flex rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/80">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {typeof item.compatibility === 'number' ? (
                      <div className="shrink-0 rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-dark">
                        {item.compatibility}%
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          )}

          <div className="mt-4 flex items-center gap-4 text-white/60">
            <button
              type="button"
              onClick={onToggleVibin}
              disabled={!onToggleVibin}
              className={`inline-flex items-center gap-2 text-sm font-black transition ${vibed ? 'text-accent' : 'hover:text-white'} disabled:cursor-default disabled:opacity-60`}
            >
              <Zap size={16} fill={vibed ? 'currentColor' : 'none'} />
              <span>{vibinCount}</span>
            </button>
            <button
              type="button"
              onClick={onOpenComments}
              disabled={!onOpenComments}
              className="inline-flex items-center gap-2 text-sm font-black transition hover:text-white disabled:cursor-default disabled:opacity-60"
            >
              <MessageCircle size={16} />
              <span>{commentsCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
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
    ratingLabel: MomentRatingLabel;
    budgetLevel: '$' | '$$' | '$$$';
    visitType: 'solo' | 'couple' | 'friends' | 'family';
    timeOfDay: 'morning' | 'afternoon' | 'sunset' | 'night';
    privacy: 'public' | 'private';
    wouldRevisit: 'yes' | 'not_sure' | 'not_interested';
    vibeTags: string[];
  }) => void | Promise<void>;
}) {
  type DraftMediaItem = {
    id: string;
    url: string;
    previewUrl: string;
    fileName: string;
    mediaType: 'image' | 'video';
    status: 'uploaded' | 'processing' | 'uploading' | 'error';
  };

  const createMediaItem = (url: string): DraftMediaItem => ({
    id: crypto.randomUUID(),
    url,
    previewUrl: url,
    fileName: url.split('/').pop() ?? 'media',
    mediaType: url.match(/\.(mp4|mov|webm)$/i) ? 'video' as const : 'image' as const,
    status: 'uploaded',
  });
  const defaultVisitedDate = initialVisitedDate || new Date().toISOString().split('T')[0];
  const [placeQuery, setPlaceQuery] = useState(initialPlace?.name ?? '');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(initialPlace);
  const [visitedDate, setVisitedDate] = useState(defaultVisitedDate);
  const [caption, setCaption] = useState(initialCaption);
  const [ratingLabel, setRatingLabel] = useState<MomentRatingLabel>('liked');
  const [budgetLevel] = useState<'$' | '$$' | '$$$'>(initialBudgetLevel);
  const [uploadedMedia, setUploadedMedia] = useState<DraftMediaItem[]>(
    initialUploadedMedia.map(createMediaItem),
  );
  const [visitType] = useState<'solo' | 'couple' | 'friends' | 'family'>(initialVisitType);
  const [timeOfDay] = useState<'morning' | 'afternoon' | 'sunset' | 'night'>(initialTimeOfDay);
  const [privacy] = useState<'public' | 'private'>(initialPrivacy);
  const [wouldRevisit, setWouldRevisit] = useState<'yes' | 'not_sure' | 'not_interested'>(initialWouldRevisit);
  const [vibeTags] = useState<string[]>(initialVibeTags);
  const [placeSuggestions, setPlaceSuggestions] = useState<Place[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; currentFileName: string | null } | null>(null);

  const canSubmit = !!selectedPlace && !!visitedDate;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastSunday = new Date();
  lastSunday.setDate(lastSunday.getDate() - ((lastSunday.getDay() + 7) % 7 || 7));
  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  const captionSuggestions = selectedPlace
    ? [
        `${selectedPlace.name} was way better than expected.`,
        `I would send someone here without overexplaining it.`,
        `This one actually felt worth the stop.`,
      ]
    : [
        'Way better than expected.',
        'Easy yes if you are nearby.',
        'The vibe actually translated in real life.',
      ];

  const submitCaption = caption.trim()
    || (selectedPlace
      ? `${selectedPlace.name} felt ${checkInCaptionTone(ratingLabel)}. ${wouldRevisit === 'yes' ? 'I would come back.' : wouldRevisit === 'not_sure' ? 'Maybe again.' : 'Probably one and done.'}`
      : '');

  const readFileAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read selected file'));
    };
    reader.onerror = () => reject(new Error('Could not read selected file'));
    reader.readAsDataURL(file);
  });

  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = src;
  });

  const compressImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return {
        fileName: file.name,
        mimeType: file.type,
        dataUrl: await readFileAsDataUrl(file),
      };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const maxDimension = 2560;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

      if (scale === 1 && file.size <= 2_500_000) {
        return {
          fileName: file.name,
          mimeType: file.type,
          dataUrl: await readFileAsDataUrl(file),
        };
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return {
          fileName: file.name,
          mimeType: file.type,
          dataUrl: await readFileAsDataUrl(file),
        };
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      const outputMimeType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const compressedDataUrl = canvas.toDataURL(outputMimeType, outputMimeType === 'image/png' ? undefined : 0.92);

      if (compressedDataUrl.length >= file.size * 1.37) {
        return {
          fileName: file.name,
          mimeType: file.type,
          dataUrl: await readFileAsDataUrl(file),
        };
      }

      return {
        fileName: file.name.replace(/\.[^.]+$/, outputMimeType === 'image/jpeg' ? '.jpg' : outputMimeType === 'image/webp' ? '.webp' : '.png'),
        mimeType: outputMimeType,
        dataUrl: compressedDataUrl,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

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

  useEffect(() => () => {
    uploadedMedia.forEach((media) => {
      if (media.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(media.previewUrl);
      }
    });
  }, [uploadedMedia]);

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
          {mode === 'create' ? 'Check in' : 'Edit check-in'}
        </div>
        <div className="w-11" />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">
          {mode === 'create' ? 'Check in fast.' : 'Update your check-in.'}
        </h1>
        <p className="mt-2 text-sm font-medium text-white/55">
          {mode === 'create' ? 'Pick the place, rate it, say if you would go back, and add media if you want.' : 'Tighten the essentials without rebuilding the whole post.'}
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
              disabled={isResolvingPlace}
              placeholder="Type at least 3 letters to search places"
              className="w-full rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-white/10 disabled:cursor-wait disabled:opacity-70"
            />

            {selectedPlace ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlace(null);
                  setPlaceQuery('');
                }}
                disabled={isResolvingPlace}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/8 p-2 text-white/70"
                aria-label="Clear selected place"
              >
                <X size={14} />
              </button>
            ) : null}

            {isResolvingPlace ? (
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-accent">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
                <span>Selecting</span>
              </div>
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
                    setResolvingPlaceId(place.id);
                    try {
                      const response = await api.getPlaceDetails(place.id);
                      setSelectedPlace(response.place as Place);
                      setPlaceQuery(response.place.name);
                    } finally {
                      setIsResolvingPlace(false);
                      setResolvingPlaceId(null);
                    }
                  }}
                  disabled={isResolvingPlace}
                  className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-3 text-left transition hover:bg-white/8 disabled:cursor-wait disabled:opacity-80"
                >
                  <div>
                    <div className="text-sm font-black text-white">{place.name}</div>
                    <div className="mt-1 text-xs font-medium text-white/45">{place.location}</div>
                  </div>
                  {resolvingPlaceId === place.id ? (
                    <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                      Selecting
                    </div>
                  ) : (
                    <ChevronRight size={16} className="text-white/35" />
                  )}
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
            <div className="mt-3 rounded-[20px] border border-accent/20 bg-accent/8 px-4 py-3 text-sm font-medium text-white/75">
              Pulling in the place details...
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <CalendarDays size={16} className="text-accent" />
                <span>Check-in date</span>
              </div>
              <div className="mt-1 text-xs font-medium text-white/45">
                Starts as today, but you can move it if this happened earlier.
              </div>
            </div>
            <input
              type="date"
              value={visitedDate}
              onChange={(event) => setVisitedDate(event.target.value)}
              className="rounded-[16px] border border-white/10 bg-zinc-900 px-3 py-3 text-sm font-medium text-white outline-none transition focus:ring-2 focus:ring-white/10"
            />
          </div>
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
            <span>Photo or video</span>
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
                setUploadProgress({ completed: 0, total: files.length, currentFileName: files[0]?.name ?? null });

                const draftItems: DraftMediaItem[] = files.map((file) => ({
                  id: crypto.randomUUID(),
                  url: '',
                  previewUrl: URL.createObjectURL(file),
                  fileName: file.name,
                  mediaType: file.type.startsWith('video/') ? 'video' : 'image',
                  status: file.type.startsWith('video/') ? 'uploading' : 'processing',
                }));

                setUploadedMedia((current) => [...current, ...draftItems]);

                void files.reduce<Promise<void>>(async (chain, file, index) => {
                  await chain;
                  const draftId = draftItems[index].id;
                  setUploadProgress({ completed: index, total: files.length, currentFileName: file.name });

                  const preparedFile = file.type.startsWith('image/')
                    ? await compressImageFile(file)
                    : {
                        fileName: file.name,
                        mimeType: file.type,
                        dataUrl: await readFileAsDataUrl(file),
                      };

                  setUploadedMedia((current) => current.map((item) => (
                    item.id === draftId
                      ? { ...item, status: 'uploading' }
                      : item
                  )));

                  const response = await api.uploadMomentMedia({ files: [preparedFile] });
                  const uploadedFile = response.files[0];

                  setUploadedMedia((current) => current.map((item) => (
                    item.id === draftId
                      ? {
                          ...item,
                          url: uploadedFile.url,
                          fileName: uploadedFile.fileName,
                          mediaType: uploadedFile.mediaType,
                          status: 'uploaded',
                        }
                      : item
                  )));
                  setUploadProgress({ completed: index + 1, total: files.length, currentFileName: file.name });
                }, Promise.resolve())
                  .catch(() => {
                    setMediaError('Could not upload media right now. Try a smaller file or upload one image at a time.');
                    setUploadedMedia((current) => current.map((item) => (
                      draftItems.some((draft) => draft.id === item.id)
                        ? { ...item, status: item.url ? 'uploaded' : 'error' }
                        : item
                    )));
                  })
                  .finally(() => {
                    setIsUploadingMedia(false);
                    window.setTimeout(() => setUploadProgress(null), 500);
                    event.target.value = '';
                  });
              }}
            />
            <div>
              <div className="text-sm font-black text-white">Add media if you want</div>
              <div className="mt-1 text-xs font-medium text-white/45">Optional. The rating and revisit signal matter most.</div>
            </div>
          </label>
          {isUploadingMedia ? (
            <div className="mt-3 rounded-[20px] border border-white/10 bg-zinc-900 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white">Uploading media</div>
                  <div className="mt-1 text-xs font-medium text-white/45">
                    {uploadProgress?.currentFileName
                      ? `${Math.min(uploadProgress.completed + 1, uploadProgress.total)} of ${uploadProgress.total} • ${uploadProgress.currentFileName}`
                      : 'Preparing files...'}
                  </div>
                </div>
                <div className="text-sm font-black text-accent">
                  {uploadProgress ? Math.round((uploadProgress.completed / Math.max(uploadProgress.total, 1)) * 100) : 0}%
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${uploadProgress ? (uploadProgress.completed / Math.max(uploadProgress.total, 1)) * 100 : 0}%` }}
                />
              </div>
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
                <div key={media.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-zinc-900">
                  <div className="aspect-[4/5] bg-black">
                    {media.mediaType === 'video' ? (
                      <video src={media.previewUrl} className="h-full w-full object-cover" controls muted playsInline />
                    ) : (
                      <img src={media.previewUrl} alt={media.fileName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white/78">{media.fileName}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                        {media.status === 'processing' ? 'Optimizing' : media.status === 'uploading' ? 'Uploading' : media.status === 'error' ? 'Retry needed' : media.mediaType}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (media.previewUrl.startsWith('blob:')) {
                          URL.revokeObjectURL(media.previewUrl);
                        }
                        setUploadedMedia((current) => current.filter((item) => item.id !== media.id));
                      }}
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
            <span>Overall experience</span>
          </div>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={4}
            placeholder="What was the overall experience like?"
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Sparkles size={16} className="text-accent" />
              <span>How was it?</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {MOMENT_RATING_OPTIONS.map((option) => {
                const Icon = option.Icon;
                return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRatingLabel(option.value)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition ${
                    ratingLabel === option.value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                  }`}
                >
                  <Icon size={14} />
                  {option.label}
                </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Heart size={16} className="text-accent" />
              <span>Would you revisit?</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'yes' as const, label: 'Yes' },
                { value: 'not_sure' as const, label: 'Maybe' },
                { value: 'not_interested' as const, label: 'No' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWouldRevisit(option.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    wouldRevisit === option.value ? 'border-accent bg-accent text-dark' : 'border-white/10 bg-zinc-900 text-white/70'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 mt-8 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pb-2 pt-6">
        <button
          type="button"
          onClick={async () => {
            if (!selectedPlace) return;
            setIsSubmitting(true);
            try {
              await onSubmit({
                  placeId: selectedPlace.id,
                  visitedDate,
                  caption: submitCaption,
                  uploadedMedia: uploadedMedia.filter((media) => media.url).map((media) => media.url),
                  rating: momentRatingScore(ratingLabel),
                  ratingLabel,
                  budgetLevel,
                  visitType,
                  timeOfDay,
                  privacy,
                  wouldRevisit,
                  vibeTags,
                });
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={!canSubmit || isUploadingMedia || isSubmitting || uploadedMedia.some((media) => !media.url && media.status !== 'error')}
          className={`w-full rounded-[22px] px-5 py-4 text-sm font-black transition ${
            canSubmit && !isUploadingMedia && !isSubmitting ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
          }`}
        >
          {isUploadingMedia ? 'Uploading media...' : isSubmitting ? (mode === 'create' ? 'Saving check-in...' : 'Updating check-in...') : mode === 'create' ? 'Save check-in' : 'Update check-in'}
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
    ratingLabel: MomentRatingLabel;
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
  mockReviewData,
  currentUser,
  ownFeedItems,
  onRequireAuth,
  onSelectPlace,
  onSelectCollection,
  onSelectTraveler,
}: {
  isAuthenticated: boolean;
  mockReviewData?: {
    followedTravelers: User[];
    similarTravelers: User[];
    feedSavedDrops: Array<{
      id: string;
      travelerId: string;
      place: Place;
      caption: string;
      savedAtLabel: string;
      savedAtIso?: string;
    }>;
  };
  currentUser?: User | null;
  ownFeedItems?: Array<
    | {
        type: 'saved' | 'visited';
        traveler: User;
        place: Place;
        activityDate: string;
        caption?: string;
        compatibility?: number;
        sortTimestamp: number;
      }
    | {
        type: 'collection';
        collectionId?: string;
        traveler: User;
        collectionName: string;
        collectionPlaces: Place[];
        activityDate: string;
        caption?: string;
        sortTimestamp: number;
      }
  >;
  onRequireAuth: (message: string, action: () => void) => void;
  onSelectPlace: (p: Place, returnScreen?: Screen) => void,
  onSelectCollection: (collection: PlaceCollection, owner: User) => void,
  onSelectTraveler: (t: User) => void,
}) {
  type FollowingCommentsTarget =
    | { targetType: 'MOMENT' | 'PLACE'; targetId: string; name: string; momentId?: string }
    | { targetType: 'COLLECTION'; targetId: string; name: string };
  const [searchQuery, setSearchQuery] = useState('');
  const [isPeopleSearchOpen, setIsPeopleSearchOpen] = useState(false);
  const [isSuggestedDismissed, setIsSuggestedDismissed] = useState(false);
  const [searchTravelers, setSearchTravelers] = useState<Array<{ original: User; card: TravelerCardData }>>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [publicSuggestedTravelers, setPublicSuggestedTravelers] = useState<Array<{ original: User; card: TravelerCardData }>>([]);
  const [vibedFollowingPlaceIds, setVibedFollowingPlaceIds] = useState<string[]>([]);
  const [vibedFollowingCollectionIds, setVibedFollowingCollectionIds] = useState<string[]>([]);
  const [savedFollowingPlaceIds, setSavedFollowingPlaceIds] = useState<string[]>([]);
  const [sharedFollowingPlaceIds, setSharedFollowingPlaceIds] = useState<string[]>([]);
  const [followingCommentsTarget, setFollowingCommentsTarget] = useState<FollowingCommentsTarget | null>(null);
  const [followingComments, setFollowingComments] = useState<Array<{ id: string; user: string; body: string; createdAt: string }>>([]);
  const [followingCommentDraft, setFollowingCommentDraft] = useState('');
  const [followingVibinCounts, setFollowingVibinCounts] = useState<Record<string, number>>({});
  const [followingCommentCounts, setFollowingCommentCounts] = useState<Record<string, number>>({});
  const [followingCollectionVibinCounts, setFollowingCollectionVibinCounts] = useState<Record<string, number>>({});
  const [followingCollectionCommentCounts, setFollowingCollectionCommentCounts] = useState<Record<string, number>>({});
  const [followingToast, setFollowingToast] = useState<string | null>(null);
  const [discoveryTravelers, setDiscoveryTravelers] = useState<{
    followedTravelers: User[];
    similarTravelers: User[];
    feedSavedDrops: Array<{
      id: string;
      travelerId: string;
      place: Place;
      caption: string;
      savedAtLabel: string;
      savedAtIso?: string;
    }>;
  }>({
    followedTravelers: [],
    similarTravelers: [],
    feedSavedDrops: [],
  });
  useEffect(() => {
    const cachedFeed = readSessionJsonCache<{
      followedTravelers: User[];
      similarTravelers: User[];
      feedSavedDrops: Array<{
        id: string;
        travelerId: string;
        place: Place;
        caption: string;
        savedAtLabel: string;
        savedAtIso?: string;
      }>;
    }>(TRAVELER_FEED_CACHE_KEY, TRAVELER_FEED_CACHE_TTL_MS);
    if (cachedFeed) {
      setDiscoveryTravelers(cachedFeed);
    }

    const cachedSuggestions = readSessionJsonCache<User[]>(PUBLIC_SUGGESTIONS_CACHE_KEY, TRAVELER_FEED_CACHE_TTL_MS);
    if (cachedSuggestions) {
      setPublicSuggestedTravelers(
        cachedSuggestions.map((traveler, index) => ({
          original: traveler,
          card: buildTravelerCardData(traveler, index, false),
        })),
      );
    }
  }, []);
  const followedTravelerIds = new Set(discoveryTravelers.followedTravelers.map((traveler) => traveler.id));
  const followedTravelerIdsKey = discoveryTravelers.followedTravelers.map((traveler) => traveler.id).sort().join(',');
  const similarTravelers = discoveryTravelers.similarTravelers.map((traveler, index) => ({
    original: traveler,
    card: buildTravelerCardData(traveler, index, followedTravelerIds.has(traveler.id)),
  }));
  const followedTravelers = discoveryTravelers.followedTravelers.map((traveler, index) => ({
    original: traveler,
    card: buildTravelerCardData(traveler, index, true),
  }));
  const displayedFollowedTravelers = mockReviewData
    ? mockReviewData.followedTravelers.map((traveler, index) => ({
      original: traveler,
      card: buildTravelerCardData(traveler, index, true),
    }))
    : followedTravelers;
  const fallbackSimilarTravelers = [...similarTravelers, ...followedTravelers].filter(
    (traveler, index, list) => list.findIndex((item) => item.original.id === traveler.original.id) === index,
  );
  const followingFeedItems = displayedFollowedTravelers.flatMap(({ original }) => {
    const recentTrip = original.travelHistory[0];
    const tripPlaces = recentTrip?.places ?? [];
    const tripLatestVisitedAt = Math.max(
      ...tripPlaces
        .map((place) => (place.visitedDate ? Date.parse(place.visitedDate) : Number.NaN))
        .filter((value) => Number.isFinite(value)),
      0,
    );
    const recentVisited = tripPlaces.slice(0, 2).map((place, index) => ({
      id: `${original.id}-visited-${place.id}-${index}`,
      type: 'visited' as const,
      traveler: original,
      place,
      activityDate: formatRelativeActivityTime(place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000),
      caption: place.momentCaption ?? 'Dropped a check-in here.',
      compatibility: undefined,
      sortTimestamp: place.visitedDate ? Date.parse(place.visitedDate) : Date.now() - (index + 1) * 86400000,
    }));
    const recentSavedSource = mockReviewData?.feedSavedDrops ?? discoveryTravelers.feedSavedDrops ?? [];
    const recentSaved = mockReviewData
      ? recentSavedSource
          .filter((entry) => entry.travelerId === original.id)
          .map((entry) => ({
            id: entry.id,
            type: 'saved' as const,
            traveler: original,
            place: entry.place,
            activityDate: entry.savedAtLabel,
            caption: entry.caption,
            compatibility: undefined,
            sortTimestamp: entry.savedAtIso
              ? Date.parse(entry.savedAtIso)
              : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (recentSavedSource.findIndex((savedEntry) => savedEntry.id === entry.id) + 1) * 3600000)),
          }))
      : recentSavedSource.length > 0
        ? recentSavedSource.filter((entry) => entry.travelerId === original.id).map((entry) => ({
            id: entry.id,
            type: 'saved' as const,
            traveler: original,
            place: entry.place,
            activityDate: entry.savedAtLabel,
            caption: entry.caption,
            compatibility: undefined,
            sortTimestamp: entry.savedAtIso
              ? Date.parse(entry.savedAtIso)
              : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (recentSavedSource.findIndex((savedEntry) => savedEntry.id === entry.id) + 1) * 3600000)),
          }))
        : (original.recentSavedPlaces ?? []).slice(0, 2).map((entry, index) => ({
            id: `${original.id}-saved-${entry.place.id}-${index}`,
            type: 'saved' as const,
            traveler: original,
            place: entry.place,
            activityDate: entry.savedAtLabel,
            caption: undefined,
            compatibility: undefined,
            sortTimestamp: entry.savedAtIso
              ? Date.parse(entry.savedAtIso)
              : (parseRelativeActivityLabelToTimestamp(entry.savedAtLabel) || (Date.now() - (index + 1) * 3600000)),
          }));
    const collections = (original.recentCollections ?? [])
      .filter((collection) => (collection.places?.length ?? 0) >= 2)
      .slice(0, 1)
      .map((collection, index) => ({
        id: `${original.id}-collection-${collection.id ?? collection.label}-${index}`,
        type: 'collection' as const,
        traveler: original,
        collectionId: collection.id,
        collectionName: collection.label,
        collectionPlaces: (collection.places ?? []).slice(0, 4),
        activityDate: formatRelativeActivityTime(collection.createdAt ? Date.parse(collection.createdAt) : (original.latestVisitedAtIso ? Date.parse(original.latestVisitedAtIso) : tripLatestVisitedAt || (Date.now() - 7 * 86400000))),
        caption: undefined,
        sortTimestamp: collection.createdAt ? Date.parse(collection.createdAt) : (original.latestVisitedAtIso ? Date.parse(original.latestVisitedAtIso) : tripLatestVisitedAt || (Date.now() - 7 * 86400000)),
      }));

    return [...recentSaved, ...recentVisited, ...collections];
  }).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
  const guaranteedMockSavedFeedItems = (mockReviewData?.feedSavedDrops ?? [])
    .map((entry) => {
      const traveler = displayedFollowedTravelers.find((item) => item.original.id === entry.travelerId)?.original;
      if (!traveler) return null;
      return {
        id: entry.id,
        type: 'saved' as const,
        traveler,
        place: entry.place,
        activityDate: entry.savedAtLabel,
        caption: entry.caption,
        compatibility: undefined,
        sortTimestamp: entry.savedAtIso ? Date.parse(entry.savedAtIso) : parseRelativeActivityLabelToTimestamp(entry.savedAtLabel),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const ownActivityFeedItems = (ownFeedItems ?? []).map((item, index) => ({
    ...item,
    id: item.type === 'collection'
      ? `self-collection-${item.collectionId ?? item.collectionName}-${index}`
      : `self-${item.type}-${item.place.id}-${index}`,
    traveler: currentUser ?? item.traveler,
  }));
  const displayedFollowingFeedItems = (
    mockReviewData
      ? [...guaranteedMockSavedFeedItems, ...followingFeedItems.filter((item) => item.type !== 'saved')]
      : followingFeedItems
  );
  const mergedFollowingFeedItems = isAuthenticated
    ? [...ownActivityFeedItems, ...displayedFollowingFeedItems].sort((a, b) => b.sortTimestamp - a.sortTimestamp)
    : displayedFollowingFeedItems;
  const hasFollowingFeed = mockReviewData
    ? displayedFollowedTravelers.length > 0 || mergedFollowingFeedItems.length > 0
    : mergedFollowingFeedItems.length > 0;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const discoverableTravelers = (similarTravelers.length > 0 ? similarTravelers : fallbackSimilarTravelers)
    .filter(({ card }) => !card.isFollowing);
  const displayedSuggestedTravelers = (
    discoverableTravelers.length > 0
      ? discoverableTravelers
      : publicSuggestedTravelers.filter(({ card }) => !card.isFollowing)
  );
  const searchableTravelers = [...similarTravelers, ...displayedFollowedTravelers].filter(
    (traveler, index, list) => list.findIndex((item) => item.original.id === traveler.original.id) === index,
  );
  const searchResultsTravelers = searchableTravelers.filter(({ original }) => {
    if (!normalizedSearchQuery) return true;
    const haystack = [
      original.username,
      original.displayName,
      original.bio,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });
  const displayedSearchResults = normalizedSearchQuery.length >= 2 ? searchTravelers : searchResultsTravelers;
  const showFollowingToast = (message: string) => {
    setFollowingToast(message);
    window.setTimeout(() => {
      setFollowingToast((current) => (current === message ? null : current));
    }, 1800);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setDiscoveryTravelers({
        followedTravelers: [],
        similarTravelers: [],
        feedSavedDrops: [],
      });
    } else if (mockReviewData) {
      setDiscoveryTravelers({
        followedTravelers: mockReviewData.followedTravelers,
        similarTravelers: mockReviewData.similarTravelers,
        feedSavedDrops: mockReviewData.feedSavedDrops,
      });
    } else {
      const cachedFeed = readSessionJsonCache<{
        followedTravelers: User[];
        similarTravelers: User[];
        feedSavedDrops: Array<{
          id: string;
          travelerId: string;
          place: Place;
          caption: string;
          savedAtLabel: string;
          savedAtIso?: string;
        }>;
      }>(TRAVELER_FEED_CACHE_KEY, TRAVELER_FEED_CACHE_TTL_MS);
      if (cachedFeed) {
        setDiscoveryTravelers(cachedFeed);
        return;
      }

      void api.getTravelerDiscovery()
        .then((response) => {
          const nextFeed = {
            followedTravelers: response.followedTravelers as User[],
            similarTravelers: response.similarTravelers as User[],
            feedSavedDrops: (response.feedSavedDrops as Array<{
              id: string;
              travelerId: string;
              place: Place;
              caption: string;
              savedAtLabel: string;
              savedAtIso?: string;
            }> | undefined) ?? [],
          };
          setDiscoveryTravelers(nextFeed);
          writeSessionJsonCache(TRAVELER_FEED_CACHE_KEY, nextFeed);
        })
        .catch(() => undefined);
    }
  }, [isAuthenticated, mockReviewData]);

  useEffect(() => {
    if (mockReviewData) {
      setPublicSuggestedTravelers(
        mockReviewData.similarTravelers.map((traveler, index) => ({
          original: traveler,
          card: buildTravelerCardData(traveler, index, followedTravelerIds.has(traveler.id)),
        })),
      );
      return;
    }

    const cachedSuggestions = readSessionJsonCache<User[]>(PUBLIC_SUGGESTIONS_CACHE_KEY, TRAVELER_FEED_CACHE_TTL_MS);
    if (cachedSuggestions) {
      setPublicSuggestedTravelers(
        cachedSuggestions
          .filter((traveler) => !followedTravelerIds.has(traveler.id))
          .map((traveler, index) => ({
            original: traveler,
            card: buildTravelerCardData(traveler, index, followedTravelerIds.has(traveler.id)),
          })),
      );
      return;
    }

    void api.getPublicTravelerSuggestions(12)
      .then((response) => {
        const nextTravelers = (response.travelers as User[])
          .filter((traveler) => !followedTravelerIds.has(traveler.id))
          .map((traveler, index) => ({
            original: traveler,
            card: buildTravelerCardData(traveler, index, followedTravelerIds.has(traveler.id)),
          }));
        setPublicSuggestedTravelers(nextTravelers);
        writeSessionJsonCache(
          PUBLIC_SUGGESTIONS_CACHE_KEY,
          nextTravelers.map((item) => item.original),
        );
      })
      .catch(() => {
        setPublicSuggestedTravelers([]);
      });
  }, [followedTravelerIdsKey, isAuthenticated, mockReviewData]);

  useEffect(() => {
    if (!isPeopleSearchOpen || normalizedSearchQuery.length < 2) {
      setSearchTravelers([]);
      setIsSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearchLoading(true);
      void api.searchPublicTravelers(normalizedSearchQuery)
        .then((response) => {
          const travelers = (response.travelers as User[]).map((traveler, index) => ({
            original: traveler,
            card: buildTravelerCardData(
              traveler,
              index,
              followedTravelerIds.has(traveler.id),
            ),
          }));
          setSearchTravelers(travelers);
        })
        .catch(() => {
          setSearchTravelers([]);
        })
        .finally(() => {
          setIsSearchLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [followedTravelerIdsKey, isPeopleSearchOpen, normalizedSearchQuery]);

  useEffect(() => {
    if (!followingCommentsTarget || !isAuthenticated) return;
    void api.getComments({
      targetType: followingCommentsTarget.targetType,
      targetId: followingCommentsTarget.targetId,
    })
      .then((response) => setFollowingComments(response.comments))
      .catch(() => undefined);
  }, [followingCommentsTarget, isAuthenticated]);

  useEffect(() => {
    if (mockReviewData) {
      setSavedFollowingPlaceIds([]);
      setVibedFollowingPlaceIds([]);
      setVibedFollowingCollectionIds([]);
      setFollowingVibinCounts({});
      setFollowingCommentCounts({});
      setFollowingCollectionVibinCounts({});
      setFollowingCollectionCommentCounts({});
      return;
    }
    const interactivePlaceItems = followingFeedItems.filter((item) => item.type !== 'collection');
    if (!isAuthenticated || interactivePlaceItems.length === 0) return;
    void api.getInteractionState({
      placeIds: interactivePlaceItems.map((item) => item.place.id),
      momentIds: interactivePlaceItems.map((item) => item.place.momentId).filter(Boolean) as string[],
      profileIds: followedTravelers.map((item) => item.original.id),
    })
      .then((response) => {
        setSavedFollowingPlaceIds(response.bookmarkedPlaceIds);
        setVibedFollowingPlaceIds([...response.vibedPlaceIds, ...response.vibedMomentIds]);
        setFollowingVibinCounts({ ...response.placeVibinCounts, ...response.momentVibinCounts });
        setFollowingCommentCounts({ ...response.placeCommentCounts, ...response.momentCommentCounts });
      })
      .catch(() => undefined);
  }, [isAuthenticated, followingFeedItems.length, mockReviewData]);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-28 pt-12 text-white">
      {isPeopleSearchOpen ? (
        <div className="min-h-screen">
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsPeopleSearchOpen(false)}
              className="rounded-full bg-white/8 p-3 text-white transition hover:bg-white/12"
            >
              <ArrowRight size={18} className="rotate-180" />
            </button>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Search people</div>
            <div className="w-11" />
          </div>

          <div className="relative mb-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people by name, @username, or taste..."
              className="w-full rounded-[22px] border border-white/10 bg-white/6 py-3.5 pl-11 pr-4 text-sm font-medium text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-white/10"
              autoFocus
            />
          </div>

          <div className="space-y-4">
            {normalizedSearchQuery.length === 0 ? null : isSearchLoading ? (
              <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5 text-sm font-medium text-white/60">
                Searching people...
              </div>
            ) : displayedSearchResults.length === 0 ? (
              <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5 text-sm font-medium text-white/60">
                No people matched that search yet. Try a name, username, or bio.
              </div>
            ) : (
              displayedSearchResults.map(({ original, card }) => (
                <div key={original.id}>
                  <SearchTravelerListCard
                    traveler={original}
                    card={card}
                    onOpenTraveler={() => onSelectTraveler(original)}
                    onToggleFollow={async () => {
                      if (!isAuthenticated) {
                        onRequireAuth('Log in to follow people whose taste you want to keep up with.', () => undefined);
                        return;
                      }
                      try {
                        const response = await api.toggleFollow({ targetUserId: original.id });
                        setDiscoveryTravelers((current) => ({
                          followedTravelers: response.active
                            ? current.followedTravelers.some((traveler) => traveler.id === original.id)
                              ? current.followedTravelers
                              : [original, ...current.followedTravelers]
                            : current.followedTravelers.filter((traveler) => traveler.id !== original.id),
                          similarTravelers: current.similarTravelers,
                          feedSavedDrops: current.feedSavedDrops,
                        }));
                        showFollowingToast(response.active ? 'Followed traveler' : 'Unfollowed traveler');
                      } catch {
                        showFollowingToast('Could not update follow right now');
                      }
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Feed</div>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">
                Get inspired
              </h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
                Keep up with people that has same vibes with yours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPeopleSearchOpen(true)}
              className="shrink-0 rounded-full border border-white/10 bg-white/6 p-3 text-white transition hover:bg-white/10"
              aria-label="Search people"
            >
              <Search size={18} />
            </button>
          </div>

      {!isAuthenticated ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
            Feed
          </div>
          <div className="mt-2 text-lg font-black text-white">Log in to unlock your people feed.</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
            We only unlock following activity and taste-based people suggestions once your profile is attached to an account.
          </p>
          <button
            type="button"
            onClick={() => onRequireAuth('Log in to unlock your people feed and follow matching taste.', () => undefined)}
            className="mt-4 rounded-full bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-white/90"
          >
            Log in to continue
          </button>
        </div>
      ) : null}

      {!isSuggestedDismissed ? (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              Suggested people
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSuggestedDismissed(true);
              }}
              className="rounded-full border border-white/10 bg-white/6 p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss suggested people"
            >
              <X size={14} />
            </button>
          </div>
          {displayedSuggestedTravelers.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5 text-sm font-medium text-white/60">
              We are still lining up people worth following for you.
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {displayedSuggestedTravelers.map(({ original, card }) => (
                <div key={original.id}>
                  <SuggestedTravelerRailCard
                    traveler={original}
                    card={card}
                    onOpenTraveler={() => onSelectTraveler(original)}
                    onToggleFollow={async () => {
                      if (!isAuthenticated) {
                        onRequireAuth('Log in to follow people whose taste you want to keep up with.', () => undefined);
                        return;
                      }
                      try {
                        const response = await api.toggleFollow({ targetUserId: original.id });
                        setDiscoveryTravelers((current) => ({
                          followedTravelers: response.active
                            ? current.followedTravelers.some((traveler) => traveler.id === original.id)
                              ? current.followedTravelers
                              : [original, ...current.followedTravelers]
                            : current.followedTravelers.filter((traveler) => traveler.id !== original.id),
                          similarTravelers: current.similarTravelers,
                          feedSavedDrops: current.feedSavedDrops,
                        }));
                        showFollowingToast(response.active ? 'Followed traveler' : 'Unfollowed traveler');
                      } catch {
                        showFollowingToast('Could not update follow right now');
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {isAuthenticated && hasFollowingFeed ? (
        <div className="mb-6">
          <div className="mb-5">
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              People you follow
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {displayedFollowedTravelers.map(({ original }) => (
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

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              Following activity
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/25">
              Latest from your people
            </div>
          </div>
          <div className="space-y-4">
            {mergedFollowingFeedItems.map((item) => (
              <div key={item.id}>
                <FollowingFeedCard
                  item={item}
                  vibed={item.type !== 'collection'
                    ? vibedFollowingPlaceIds.includes(getPlaceInteractionTargetId(item.place))
                    : Boolean(item.collectionId && vibedFollowingCollectionIds.includes(item.collectionId))}
                  vibinCount={item.type !== 'collection'
                    ? followingVibinCounts[getPlaceInteractionTargetId(item.place)] || 0
                    : (item.collectionId ? followingCollectionVibinCounts[item.collectionId] || 0 : 0)}
                  commentsCount={item.type !== 'collection'
                    ? followingCommentsTarget?.targetType !== 'COLLECTION' && followingCommentsTarget?.targetId === getPlaceInteractionTargetId(item.place)
                      ? followingComments.length || followingCommentCounts[getPlaceInteractionTargetId(item.place)] || 0
                      : followingCommentCounts[getPlaceInteractionTargetId(item.place)] || 0
                    : (item.collectionId
                        ? (followingCommentsTarget?.targetType === 'COLLECTION' && followingCommentsTarget.targetId === item.collectionId
                          ? followingComments.length || followingCollectionCommentCounts[item.collectionId] || 0
                          : followingCollectionCommentCounts[item.collectionId] || 0)
                        : 0)}
                  onOpenPlace={item.type !== 'collection' ? () => onSelectPlace(item.place, 'discover-travelers') : undefined}
                  onOpenCollection={item.type === 'collection' && item.collectionId ? () => {
                    const travelerCollections = item.traveler.recentCollections ?? [];
                    const collection = travelerCollections.find((entry) => entry.id === item.collectionId);
                    if (!collection) return;
                    onSelectCollection(collection, item.traveler);
                  } : undefined}
                  onOpenTraveler={() => onSelectTraveler(item.traveler)}
                  onToggleVibin={item.type !== 'collection'
                    ? async () => {
                        if (!isAuthenticated) {
                          onRequireAuth('Log in to send vibin to places from people you follow.', () => undefined);
                          return;
                        }
                        const targetId = getPlaceInteractionTargetId(item.place);
                        const isActive = vibedFollowingPlaceIds.includes(targetId);
                        try {
                          const response = await api.toggleVibin(getPlaceInteractionPayload(item.place));
                          setVibedFollowingPlaceIds((prev) =>
                            isActive ? prev.filter((entry) => entry !== targetId) : [...prev, targetId],
                          );
                          setFollowingVibinCounts((prev) => ({ ...prev, [targetId]: response.count }));
                          showFollowingToast(isActive ? 'Removed vibin' : 'Sent vibin');
                        } catch {
                          showFollowingToast('Could not update vibin right now');
                        }
                      }
                    : item.collectionId
                      ? async () => {
                          if (!isAuthenticated) {
                            onRequireAuth('Log in to send vibin to collections from people you follow.', () => undefined);
                            return;
                          }
                          const isActive = vibedFollowingCollectionIds.includes(item.collectionId);
                          try {
                            const response = await api.toggleVibin({
                              targetType: 'COLLECTION',
                              targetId: item.collectionId,
                              receiverUserId: item.traveler.id,
                            });
                            setVibedFollowingCollectionIds((prev) =>
                              isActive ? prev.filter((entry) => entry !== item.collectionId) : [...prev, item.collectionId],
                            );
                            setFollowingCollectionVibinCounts((prev) => ({ ...prev, [item.collectionId]: response.count }));
                            showFollowingToast(response.active ? 'Sent vibin' : 'Removed vibin');
                          } catch {
                            showFollowingToast('Could not update vibin right now');
                          }
                        }
                      : undefined}
                  onOpenComments={item.type !== 'collection'
                    ? () => setFollowingCommentsTarget({
                        targetType: getPlaceInteractionTargetType(item.place),
                        targetId: getPlaceInteractionTargetId(item.place),
                        name: item.place.name,
                        momentId: item.place.momentId,
                      })
                    : item.collectionId
                      ? () => setFollowingCommentsTarget({
                          targetType: 'COLLECTION',
                          targetId: item.collectionId,
                          name: item.collectionName,
                        })
                      : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      ) : isAuthenticated ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
            Following activity
          </div>
          <div className="mt-2 text-lg font-black text-white">Your following feed is still quiet.</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
            Follow a few people so this feed starts filling with real saves and check-ins from taste you want to track.
          </p>
        </div>
      ) : null}

        </>
      )}

      <AnimatePresence>
        {followingCommentsTarget ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFollowingCommentsTarget(null)}
              className="fixed inset-0 z-[70] bg-black/60"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-[80] mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pb-8 pt-4"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              <div className="mt-4 text-center text-lg font-black text-white">Comments on {followingCommentsTarget.name}</div>
              <div className="mt-5 space-y-4">
                {followingComments.length > 0 ? (
                  followingComments.map((comment) => (
                    <div key={comment.id} className="rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm text-white/72">
                      <span className="font-black text-white">@{comment.user}</span> {comment.body}
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
                  value={followingCommentDraft}
                  onChange={(event) => setFollowingCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  className="input-apple flex-1"
                />
                <button
                  className="rounded-full bg-accent px-4 py-3 text-sm font-black text-dark"
                  onClick={async () => {
                    if (!followingCommentsTarget || !followingCommentDraft.trim()) return;
                    if (!isAuthenticated) {
                      onRequireAuth('Log in to comment on places from travelers you follow.', () => undefined);
                      return;
                    }
                    try {
                      const response = await api.createComment({
                        targetType: followingCommentsTarget.targetType,
                        targetId: followingCommentsTarget.targetId,
                        body: followingCommentDraft.trim(),
                        momentId: followingCommentsTarget.targetType === 'COLLECTION' ? undefined : followingCommentsTarget.momentId,
                      });
                      setFollowingComments((prev) => [response.comment, ...prev]);
                      if (followingCommentsTarget.targetType === 'COLLECTION') {
                        setFollowingCollectionCommentCounts((prev) => ({
                          ...prev,
                          [followingCommentsTarget.targetId]: response.count,
                        }));
                      } else {
                        setFollowingCommentCounts((prev) => ({
                          ...prev,
                          [followingCommentsTarget.targetId]: response.count,
                        }));
                      }
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
  isBookmarkedPlacesLoading = false,
  collections,
  onSelectPlace,
  onCreateCollection,
  onOpenCollection,
}: {
  bookmarkedPlaces: Place[],
  isBookmarkedPlacesLoading?: boolean,
  collections: PlaceCollection[],
  onSelectPlace: (p: Place) => void,
  onCreateCollection: () => void,
  onOpenCollection: (collection: PlaceCollection) => void,
}) {
  const [activeTab, setActiveTab] = useState<'places' | 'collections'>('places');
  const [expandedCities, setExpandedCities] = useState<string[]>([]);
  const groupedPlaces = bookmarkedPlaces.reduce<Record<string, Place[]>>((acc, place) => {
    const city = place.location.split(',')[0]?.trim() ?? place.location;
    acc[city] = [...(acc[city] ?? []), place];
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-28 pt-12 text-white">
      <div className="mb-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
          Saved
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">
          Saved places
        </h1>
        <p className="mt-2 text-sm font-medium text-white/55">
          Save standouts fast, then turn them into collections when a trip or theme starts coming together.
        </p>
      </div>

      <div className="mb-6">
        <div className="inline-flex rounded-full border border-white/10 bg-white/6 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('places')}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === 'places' ? 'bg-white text-black' : 'text-white/65'}`}
          >
            Saved places
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('collections')}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === 'collections' ? 'bg-white text-black' : 'text-white/65'}`}
          >
            Collections
          </button>
        </div>
      </div>

      {activeTab === 'places' ? (
        isBookmarkedPlacesLoading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
            <div className="text-lg font-black text-white">Loading saved places...</div>
            <p className="mt-2 text-sm font-medium text-white/60">
              Pulling the latest places you saved.
            </p>
          </div>
        ) : bookmarkedPlaces.length === 0 ? (
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
              <button
                type="button"
                onClick={() => setExpandedCities((prev) => prev.includes(city) ? prev.filter((item) => item !== city) : [...prev, city])}
                className="mb-4 flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-left transition hover:bg-white/8"
              >
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">{city}</h2>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                    {places.length} saved
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-white/55 transition-transform ${expandedCities.includes(city) ? 'rotate-180' : ''}`}
                />
              </button>

              {expandedCities.includes(city) ? (
                <div className="space-y-4">
                  {places.map((place, index) => (
                    <div key={place.id}>
                      <PlaceCard
                        data={mapPlaceToCardData(place, index)}
                        showFullHook
                        showFullRecommendation
                        hideRecommendationSection
                        onClick={() => onSelectPlace(place)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
        )
      ) : collections.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-lg font-black text-white">No collections yet.</div>
          <p className="mt-2 text-sm font-medium text-white/60">
            Start one for a trip, mood, or short list of places you want to keep together.
          </p>
          <button
            type="button"
            onClick={onCreateCollection}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-accent/40 bg-accent/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-accent"
          >
            <Plus size={12} />
            New collection
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={onCreateCollection}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-accent/40 bg-accent/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-accent"
          >
            <Plus size={12} />
            New collection
          </button>
          {collections.map((collection) => (
            <button
              key={collection.label}
              type="button"
              onClick={() => onOpenCollection(collection)}
              className="w-full rounded-[28px] border border-white/10 bg-white/6 p-5 text-left transition hover:bg-white/8"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-white">{collection.label}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                    {collection.places.length} places
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {collection.places.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPlace(place);
                    }}
                    className="w-40 shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-zinc-900 text-left"
                  >
                    <img src={place.image} alt={place.name} className="aspect-[4/5] w-full object-cover" referrerPolicy="no-referrer" />
                    <div className="p-3">
                      <div className="line-clamp-2 text-xs font-black text-white">{place.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- PLACE DETAIL SCREEN ---
function PlaceDetail({
  place,
  hasCompatibilityScore = true,
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
  onShare,
  onRequestDeviceLocation,
  onSelectPlace,
  onSelectTraveler,
  onExploreTravelers,
  onExplorePlaces,
}: {
  place: Place,
  hasCompatibilityScore?: boolean,
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
  },
  onBack: () => void,
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>,
  onMarkBeenThere: () => void,
  onShare: () => void,
  onRequestDeviceLocation: () => void,
  onSelectPlace: (p: Place) => void,
  onSelectTraveler: (travelerId: string) => void,
  onExploreTravelers: () => void,
  onExplorePlaces: () => void,
}) {
  const [city, country] = place.location.split(',').map((part) => part.trim());
  const activeLocation = savedLocations.find((item) => item.id === activeLocationId) ?? savedLocations[0];
  const distanceFromUserMiles = calculateDistanceMiles(
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
    distanceFromUserMiles,
    address: place.address ?? `${place.name}, ${place.location}`,
    category: getDisplayPlaceCategory(place),
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
    matchScore: hasCompatibilityScore ? place.similarityStat : undefined,
    similarityPercentage: hasCompatibilityScore ? place.similarityStat : undefined,
    recommendationReason: place.recommendationReason ?? buildPlaceRecommendationReason(place, travelerMoments.length),

    // Social / behavioral context
    similarTravelerCount: travelerMoments.length > 0 ? travelerMoments.length : undefined,
    travelerMoments,
    fallbackTravelers: fallbackTravelers
      .filter((traveler) => (traveler.matchScore ?? 0) >= 80)
      .map((traveler) => ({
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
      locationPermission={deviceLocationPermission}
      onBack={onBack}
      onSave={() => onSavePlace(place, !interactionState.isSaved)}
      onBeenThere={onMarkBeenThere}
      onShare={() => onShare()}
      onRequestLocation={onRequestDeviceLocation}
      onOpenMaps={(url) => {
        void openExternalUrl(url);
      }}
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
  hasCompatibilityScore,
  isSaved,
  onBack,
  onSave,
  onShare,
}: {
  event: EventItem;
  hasCompatibilityScore: boolean;
  isSaved: boolean;
  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
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
  const visibleTags = event.tags
    .filter((tag): tag is string => Boolean(tag && tag.trim() && tag.trim().toLowerCase() !== 'undefined'))
    .slice(0, 5);

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
            {hasCompatibilityScore ? (
              <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark shadow-lg">
                {event.compatibilityScore}% match
              </span>
            ) : null}
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
        {(event.hook || event.category) ? (
          <section className="space-y-3">
            <h2 className="text-[2rem] font-black leading-[0.95] tracking-[-0.06em] text-white">
              {event.hook || event.category}
            </h2>
            {event.venueName ? (
              <p className="max-w-[34rem] text-base font-medium leading-relaxed text-white/68">
                {event.venueName} {event.description ? `is hosting this live event with a stronger timing fit for your current profile.` : 'is hosting this live pick right when it fits your current profile best.'}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[28px] border border-accent/25 bg-[radial-gradient(circle_at_top_left,rgba(211,255,72,0.22),rgba(211,255,72,0.08),rgba(24,24,27,0.94))] p-5 text-white shadow-[0_18px_40px_rgba(120,160,20,0.18)]">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-accent">
            <Sparkles size={14} />
            Why this is showing up for you
          </div>
          <p className="mt-3 text-base font-medium leading-relaxed tracking-[-0.01em] text-white/88">
            {event.compatibilityReason}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {hasCompatibilityScore ? renderChip(`${event.compatibilityScore}% event match`) : null}
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
              <div className="mt-2 text-sm font-black text-white">{getDisplayEventCategory(event)}</div>
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
            void openExternalUrl(event.ticketUrl);
          }
        }}
        secondaryDisabled={!event.ticketUrl}
      />
    </div>
  );
}

function CollectionDetailScreen({
  collection,
  owner,
  canEdit = false,
  onEdit,
  onShare,
  onBack,
  onSelectPlace,
}: {
  collection: PlaceCollection;
  owner?: Pick<User, 'avatar' | 'username' | 'displayName'> | null;
  canEdit?: boolean;
  onEdit?: () => void;
  onShare?: () => void;
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
        <div className="flex items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full border border-white/10 bg-white/8 p-2.5 text-white/80 transition hover:bg-white/12"
              aria-label="Edit collection"
            >
              <PencilLine size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onShare}
            className="rounded-full border border-white/10 bg-white/8 p-2.5 text-white/80 transition hover:bg-white/12"
            aria-label="Share collection"
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>
      {owner ? (
        <div className="mb-5 flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
          <img
            src={owner.avatar}
            alt={owner.username}
            className="h-12 w-12 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(event) => handleAvatarImageError(event, owner.username)}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">{owner.displayName ?? owner.username}</div>
            <div className="truncate text-xs font-medium text-white/45">@{owner.username}</div>
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        {collection.places.map((place, index) => (
          <div key={place.id}>
            <PlaceCard
              data={mapPlaceToCardData(place, index)}
              showFullHook
              hideRecommendationSection
              onClick={() => onSelectPlace(place)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
