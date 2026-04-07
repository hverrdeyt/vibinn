import { memo, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BookOpen, ChevronDown, Coffee, Footprints, Landmark, MoonStar, Music2, Search, ShoppingBag, Trees, Waves, X, type LucideIcon } from 'lucide-react';
import { type EventItem, type Interest, type Place, type Vibe } from '../types';

interface SavedLocationOption {
  id: string;
  label: string;
  type: 'city' | 'province' | 'country';
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
}

function calculateDistanceMiles(
  from?: { latitude?: number; longitude?: number } | null,
  to?: { latitude?: number; longitude?: number } | null,
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
  const distanceKm = earthRadiusKm * c;
  return Math.round(distanceKm * 0.621371 * 10) / 10;
}

type DiscoveryFeedItem =
  | { type: 'place'; id: string; place: Place }
  | { type: 'event'; id: string; event: EventItem };

function getDiscoveryTileHeightClass(sequenceIndex: number) {
  return sequenceIndex % 4 === 0
    ? 'h-[20.5rem]'
    : sequenceIndex % 4 === 1
      ? 'h-[26rem]'
      : sequenceIndex % 4 === 2
        ? 'h-[18rem]'
        : 'h-[22.5rem]';
}

function getDiscoveryTileEstimatedHeight(sequenceIndex: number) {
  return sequenceIndex % 4 === 0
    ? 328
    : sequenceIndex % 4 === 1
      ? 416
      : sequenceIndex % 4 === 2
        ? 288
        : 360;
}

function buildBalancedColumns(items: DiscoveryFeedItem[]) {
  const left: Array<DiscoveryFeedItem & { renderIndex: number; sourceIndex: number }> = [];
  const right: Array<DiscoveryFeedItem & { renderIndex: number; sourceIndex: number }> = [];
  let leftHeight = 0;
  let rightHeight = 0;

  items.forEach((item, sourceIndex) => {
    const estimatedHeight = getDiscoveryTileEstimatedHeight(sourceIndex);
    if (leftHeight <= rightHeight) {
      const renderIndex = left.length;
      left.push({ ...item, renderIndex, sourceIndex });
      leftHeight += estimatedHeight;
      return;
    }

    const renderIndex = right.length;
    right.push({ ...item, renderIndex, sourceIndex });
    rightHeight += estimatedHeight;
  });

  return { left, right };
}

function getLocationPromptCopy(permission: 'unknown' | 'granted' | 'denied' | 'unsupported') {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Location on iPhone needs HTTPS, so local network previews will not show the Safari prompt.';
  }

  if (permission === 'denied') {
    return 'Turn location back on in your browser so we can show distance in miles.';
  }

  return 'Turn on location so we can show the distance from you in miles.';
}

type MoodBadgeMeta = {
  label: string;
  className: string;
  iconClassName: string;
  Icon: LucideIcon;
};

const PLACE_MOOD_BADGES: MoodBadgeMeta[] = [
  {
    label: 'After dark',
    className: 'border border-fuchsia-300/35 bg-fuchsia-500/18 text-fuchsia-100 backdrop-blur-md',
    iconClassName: 'text-fuchsia-200/90',
    Icon: MoonStar,
  },
  {
    label: 'Scenic',
    className: 'border border-sky-300/35 bg-sky-500/18 text-sky-100 backdrop-blur-md',
    iconClassName: 'text-sky-200/90',
    Icon: Waves,
  },
  {
    label: 'Walkable',
    className: 'border border-emerald-300/35 bg-emerald-500/18 text-emerald-100 backdrop-blur-md',
    iconClassName: 'text-emerald-200/90',
    Icon: Footprints,
  },
  {
    label: 'Browsey',
    className: 'border border-amber-300/35 bg-amber-500/18 text-amber-100 backdrop-blur-md',
    iconClassName: 'text-amber-200/90',
    Icon: ShoppingBag,
  },
  {
    label: 'Cozy',
    className: 'border border-rose-300/35 bg-rose-500/18 text-rose-100 backdrop-blur-md',
    iconClassName: 'text-rose-200/90',
    Icon: BookOpen,
  },
  {
    label: 'Cultural',
    className: 'border border-violet-300/35 bg-violet-500/18 text-violet-100 backdrop-blur-md',
    iconClassName: 'text-violet-200/90',
    Icon: Landmark,
  },
  {
    label: 'Chill',
    className: 'border border-lime-300/35 bg-lime-500/18 text-lime-100 backdrop-blur-md',
    iconClassName: 'text-lime-200/90',
    Icon: Coffee,
  },
  {
    label: 'Outdoorsy',
    className: 'border border-teal-300/35 bg-teal-500/18 text-teal-100 backdrop-blur-md',
    iconClassName: 'text-teal-200/90',
    Icon: Trees,
  },
];

function getPlaceMoodBadge(place: Pick<Place, 'name' | 'category' | 'tags' | 'hook' | 'description' | 'bestTime' | 'whyYoullLikeIt'>): MoodBadgeMeta | null {
  const haystack = [
    place.name,
    place.category,
    place.hook,
    place.description,
    place.bestTime,
    ...(place.whyYoullLikeIt ?? []),
    ...(place.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const matches = (terms: string[]) => terms.some((term) => haystack.includes(term));

  if (matches(['after dark', 'late night', 'nightlife', 'cocktail', 'bar', 'vinyl', 'live music', 'dj'])) {
    return PLACE_MOOD_BADGES[0];
  }
  if (matches(['walk', 'stroll', 'wander', 'loop', 'street', 'neighborhood', 'city walk', 'brownstones'])) {
    return PLACE_MOOD_BADGES[2];
  }
  if (matches(['market', 'design', 'shopping', 'browse', 'makers', 'concept store', 'stall'])) {
    return PLACE_MOOD_BADGES[3];
  }
  if (matches(['bookstore', 'bookshop', 'cozy', 'soft light', 'warm', 'intimate', 'quiet corner', 'shelves'])) {
    return PLACE_MOOD_BADGES[4];
  }
  if (matches(['museum', 'science', 'history', 'cultural', 'culture', 'mosque', 'islamic center', 'gallery', 'exhibit'])) {
    return PLACE_MOOD_BADGES[5];
  }
  if (matches(['coffee', 'espresso', 'slow', 'calm', 'easy pause', 'chill', 'reset', 'low pressure', 'bakery', 'cafe'])) {
    return PLACE_MOOD_BADGES[6];
  }
  if (matches(['park', 'garden', 'green', 'nature', 'grass', 'trees'])) {
    return PLACE_MOOD_BADGES[7];
  }
  if (matches(['view', 'lookout', 'waterfront', 'harbor', 'skyline', 'sunset', 'scenic', 'lake', 'river', 'reflecting pool'])) {
    return PLACE_MOOD_BADGES[1];
  }
  if (matches(['trail'])) {
    return PLACE_MOOD_BADGES[2];
  }

  return PLACE_MOOD_BADGES[6];
}

const EVENT_MOOD_BADGES: MoodBadgeMeta[] = [
  {
    label: 'Live',
    className: 'border border-fuchsia-300/35 bg-fuchsia-500/18 text-fuchsia-100 backdrop-blur-md',
    iconClassName: 'text-fuchsia-200/90',
    Icon: Music2,
  },
  {
    label: 'After dark',
    className: 'border border-indigo-300/35 bg-indigo-500/18 text-indigo-100 backdrop-blur-md',
    iconClassName: 'text-indigo-200/90',
    Icon: MoonStar,
  },
  {
    label: 'Browsey',
    className: 'border border-amber-300/35 bg-amber-500/18 text-amber-100 backdrop-blur-md',
    iconClassName: 'text-amber-200/90',
    Icon: ShoppingBag,
  },
  {
    label: 'Cultural',
    className: 'border border-violet-300/35 bg-violet-500/18 text-violet-100 backdrop-blur-md',
    iconClassName: 'text-violet-200/90',
    Icon: Landmark,
  },
  {
    label: 'Night out',
    className: 'border border-rose-300/35 bg-rose-500/18 text-rose-100 backdrop-blur-md',
    iconClassName: 'text-rose-200/90',
    Icon: Music2,
  },
];

function getEventMoodBadge(event: Pick<EventItem, 'name' | 'category' | 'tags' | 'hook' | 'description'>): MoodBadgeMeta {
  const haystack = [
    event.name,
    event.category,
    event.hook,
    event.description,
    ...(event.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const matches = (terms: string[]) => terms.some((term) => haystack.includes(term));

  if (matches(['concert', 'music', 'live', 'tour', 'dj', 'band'])) return EVENT_MOOD_BADGES[0];
  if (matches(['night', 'late', 'club'])) return EVENT_MOOD_BADGES[1];
  if (matches(['market', 'expo', 'festival', 'fair'])) return EVENT_MOOD_BADGES[2];
  if (matches(['museum', 'art', 'culture', 'theater', 'comedy', 'lecture'])) return EVENT_MOOD_BADGES[3];
  return EVENT_MOOD_BADGES[4];
}

function DiscoveryLoadingPreview() {
  const previewCards = [
    {
      key: 'card-a',
      rotate: -7,
      translateX: -20,
      translateY: 10,
      gradient: 'from-[#1f2937] via-[#374151] to-[#111827]',
      accent: 'bg-[#d6ff72]',
      delay: 0,
    },
    {
      key: 'card-b',
      rotate: 3,
      translateX: 0,
      translateY: -6,
      gradient: 'from-[#0f172a] via-[#164e63] to-[#111827]',
      accent: 'bg-[#7be7ff]',
      delay: 0.08,
    },
    {
      key: 'card-c',
      rotate: 9,
      translateX: 24,
      translateY: 14,
      gradient: 'from-[#312e81] via-[#1f2937] to-[#111827]',
      accent: 'bg-[#ff8cc6]',
      delay: 0.16,
    },
  ];

  return (
    <div className="relative mx-auto mt-2 h-44 w-full max-w-[18rem]">
      {previewCards.map((card, index) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: [card.translateY, card.translateY - 8, card.translateY],
            rotate: [card.rotate, card.rotate + (index === 1 ? -2 : 2), card.rotate],
          }}
          transition={{
            duration: 2.6,
            delay: card.delay,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
          className="absolute left-1/2 top-1/2 h-40 w-28 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
          style={{
            transform: `translate(calc(-50% + ${card.translateX}px), calc(-50% + ${card.translateY}px)) rotate(${card.rotate}deg)`,
            zIndex: index + 1,
          }}
        >
          <div className={`h-full w-full bg-gradient-to-br ${card.gradient} p-3`}>
            <div className="flex h-full flex-col justify-between">
              <div className="space-y-2">
                <div className={`h-16 rounded-[18px] ${card.accent} opacity-85`} />
                <div className="h-2.5 w-16 rounded-full bg-white/75" />
                <div className="h-2.5 w-20 rounded-full bg-white/35" />
              </div>
              <div className="space-y-2">
                <div className="h-2 w-14 rounded-full bg-white/50" />
                <div className="h-2 w-10 rounded-full bg-white/25" />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default function PlaceDiscoveryScreen({
  selectedInterests,
  selectedVibe,
  activeLocation,
  savedLocations,
  deviceLocation,
  deviceLocationPermission,
  isRequestingDeviceLocation,
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
  onRequestDeviceLocation,
  visiblePlaces,
  isLoading,
  isEventsLoading,
  isPreferenceTransitionLoading,
  isLoadingMore,
  isRefreshing,
  hasMore,
  currentPage,
  hasError,
  hasEventsError,
  restorePlaceId,
  restoreViewportOffset,
  bookmarkedPlaceIds,
  visitedPlaceIds,
  showGestureDemo,
  onFinishGestureDemo,
  onRestorePlaceHandled,
  onRefresh,
  onLoadMore,
  onBookmarkPlace,
  onDismissPlace,
  onSelectPlace,
  onSelectEvent,
  getEditorialLabel,
  getPlacePreferenceDebugMatches,
  getEventPreferenceDebugMatches,
}: {
  selectedInterests: Interest[];
  selectedVibe: Vibe | null;
  activeLocation: SavedLocationOption;
  savedLocations: SavedLocationOption[];
  deviceLocation: { latitude: number; longitude: number } | null;
  deviceLocationPermission: 'unknown' | 'granted' | 'denied' | 'unsupported';
  isRequestingDeviceLocation: boolean;
  events: EventItem[];
  searchInput: string;
  searchQuery: string;
  onOpenPreferences: () => void;
  onOpenLocationManager: () => void;
  onOpenNotifications: () => void;
  onSearchInputChange: (value: string) => void;
  onClearSearch: () => void;
  onSelectLocation: (locationId: string) => void;
  onLocationSheetVisibilityChange: (isOpen: boolean) => void;
  onRequestDeviceLocation: () => void;
  visiblePlaces: Place[];
  isLoading: boolean;
  isEventsLoading: boolean;
  isPreferenceTransitionLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  currentPage: number;
  hasError: boolean;
  hasEventsError: boolean;
  restorePlaceId: string | null;
  restoreViewportOffset: number | null;
  bookmarkedPlaceIds: string[];
  visitedPlaceIds: string[];
  showGestureDemo: boolean;
  onFinishGestureDemo: () => void;
  onRestorePlaceHandled: () => void;
  onRefresh: () => void;
  onLoadMore: () => boolean | void;
  onBookmarkPlace: (place: Place, metadata?: { positionInFeed: number; currentPage: number }) => void;
  onDismissPlace: (place: Place, metadata?: { positionInFeed: number; currentPage: number }) => void;
  onSelectPlace: (place: Place, metadata?: { positionInFeed: number; currentPage: number }) => void;
  onSelectEvent: (event: EventItem) => void;
  getEditorialLabel: (place: Place, index?: number) => string | null;
  getPlacePreferenceDebugMatches: (place: Place, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
  getEventPreferenceDebugMatches: (event: EventItem, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
}) {
  const LOCATION_PROMO_DISMISSED_KEY = 'vibinn_location_prompt_dismissed';
  const VIBE_PROMO_DISMISSED_KEY = 'vibinn_vibe_prompt_dismissed';
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(searchInput.trim().length > 0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isLocationPromptDismissed, setIsLocationPromptDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(LOCATION_PROMO_DISMISSED_KEY) === '1';
  });
  const [isVibePromptDismissed, setIsVibePromptDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(VIBE_PROMO_DISMISSED_KEY) === '1';
  });
  const [showStickyVibePrompt, setShowStickyVibePrompt] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const autoFillLoadMoreRafRef = useRef<number | null>(null);
  const loadMoreLockRef = useRef(false);
  const hasPlayedInitialEntryMotionRef = useRef(false);
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const currentCity = activeLocation?.label ?? 'Boston';
  const isFilteringBySearch = searchQuery.length > 0;
  const dedupedVisiblePlaces = useMemo(
    () => visiblePlaces.filter((place, index, list) => list.findIndex((item) => item.id === place.id) === index),
    [visiblePlaces],
  );
  const displayPlaces = dedupedVisiblePlaces;
  const bookmarkedPlaceIdSet = useMemo(() => new Set(bookmarkedPlaceIds), [bookmarkedPlaceIds]);
  const mixedDiscoveryItems = useMemo(() => {
    const items: DiscoveryFeedItem[] = [];

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
  }, [displayPlaces, events]);
  const shouldShowSwipeHint = currentPage >= 2 && mixedDiscoveryItems.length > 8;
  const swipeHintInsertIndex = shouldShowSwipeHint
    ? Math.max(8, Math.min(16, mixedDiscoveryItems.length - 4))
    : -1;
  const leadingDiscoveryItems = shouldShowSwipeHint
    ? mixedDiscoveryItems.slice(0, swipeHintInsertIndex)
    : mixedDiscoveryItems;
  const trailingDiscoveryItems = shouldShowSwipeHint
    ? mixedDiscoveryItems.slice(swipeHintInsertIndex)
    : [];
  const leadingColumns = useMemo(
    () => buildBalancedColumns(leadingDiscoveryItems),
    [leadingDiscoveryItems],
  );
  const trailingColumns = useMemo(
    () => buildBalancedColumns(trailingDiscoveryItems),
    [trailingDiscoveryItems],
  );
  const shouldAnimateItemEntry = !hasPlayedInitialEntryMotionRef.current;

  const canLoadMore = hasMore && !isLoading && !isLoadingMore && !isRefreshing;

  const triggerLoadMore = () => {
    if (!canLoadMore || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    const didStartLoad = onLoadMore();
    if (didStartLoad === false) {
      loadMoreLockRef.current = false;
    }
  };

  useEffect(() => {
    onLocationSheetVisibilityChange(isLocationSheetOpen);
    return () => onLocationSheetVisibilityChange(false);
  }, [isLocationSheetOpen, onLocationSheetVisibilityChange]);

  useEffect(() => {
    if (deviceLocationPermission === 'granted' || deviceLocationPermission === 'unsupported') {
      setIsLocationPromptDismissed(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LOCATION_PROMO_DISMISSED_KEY);
      }
    }
  }, [deviceLocationPermission]);

  useEffect(() => {
    if (hasPreferences) {
      setShowStickyVibePrompt(false);
      setIsVibePromptDismissed(false);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(VIBE_PROMO_DISMISSED_KEY);
      }
      return;
    }

    const handleScroll = () => {
      if (isVibePromptDismissed) {
        setShowStickyVibePrompt(false);
        return;
      }
      setShowStickyVibePrompt(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasPreferences, isVibePromptDismissed]);

  useEffect(() => {
    if (searchInput.trim().length > 0) {
      setIsSearchOpen(true);
    }
  }, [searchInput]);

  useEffect(() => {
    if (!canLoadMore) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        triggerLoadMore();
      }
    }, { rootMargin: '240px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, visiblePlaces.length]);

  useEffect(() => {
    if (!canLoadMore) return;

    const handleWindowScroll = () => {
      if (!canLoadMore) return;
      const remaining = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);
      if (remaining < 520) {
        triggerLoadMore();
      }
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [canLoadMore]);

  useEffect(() => {
    if (!canLoadMore) return;
    if (mixedDiscoveryItems.length === 0) return;

    const attemptAutoFill = () => {
      const remaining = document.documentElement.scrollHeight - window.innerHeight;
      if (remaining < 220) {
        triggerLoadMore();
      }
    };

    autoFillLoadMoreRafRef.current = window.requestAnimationFrame(attemptAutoFill);

    return () => {
      if (autoFillLoadMoreRafRef.current !== null) {
        window.cancelAnimationFrame(autoFillLoadMoreRafRef.current);
        autoFillLoadMoreRafRef.current = null;
      }
    };
  }, [mixedDiscoveryItems.length, canLoadMore]);

  useEffect(() => {
    if (!isLoadingMore) {
      loadMoreLockRef.current = false;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    if (mixedDiscoveryItems.length > 0) {
      hasPlayedInitialEntryMotionRef.current = true;
    }
  }, [mixedDiscoveryItems.length]);

  useEffect(() => {
    if (!restorePlaceId || typeof window === 'undefined') return;

    let attemptCount = 0;
    let timeoutId: number | null = null;

    const tryRestore = () => {
      const anchorElement = document.querySelector<HTMLElement>(`[data-discovery-place-id="${CSS.escape(restorePlaceId)}"]`);
      if (anchorElement) {
        const fallbackOffset = Math.max(116, window.innerHeight * 0.18);
        const desiredOffset = restoreViewportOffset ?? fallbackOffset;
        const nextTop = Math.max(0, anchorElement.getBoundingClientRect().top + window.scrollY - desiredOffset);
        window.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = nextTop;
        document.body.scrollTop = nextTop;

        const actualTop = anchorElement.getBoundingClientRect().top;
        if (Math.abs(actualTop - desiredOffset) < 28 || attemptCount >= 12) {
          onRestorePlaceHandled();
          return;
        }
      }

      attemptCount += 1;
      if (attemptCount >= 12) {
        onRestorePlaceHandled();
        return;
      }

      timeoutId = window.setTimeout(tryRestore, 120);
    };

    const frameId = window.requestAnimationFrame(tryRestore);
    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [restorePlaceId, restoreViewportOffset, mixedDiscoveryItems.length, isLoading, isLoadingMore, onRestorePlaceHandled]);

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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[26px] font-black tracking-[-0.05em] text-white">
              Your vibe picks in
            </p>
            <button
              type="button"
              onClick={() => setIsLocationSheetOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[26px] font-black tracking-[-0.05em] text-accent transition hover:bg-white/10"
            >
              {currentCity}
              <ChevronDown size={18} className="text-accent/80" />
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold text-white/45">
            Ranked around your taste, not just what is popular nearby.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {!hasPreferences ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-[24px] border border-accent/20 bg-accent/8 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Unlock your vibe</div>
            <div className="text-xs text-white/65">Give AI your taste so these picks feel more you.</div>
          </div>
          <button
            type="button"
            onClick={onOpenPreferences}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-black text-black transition hover:bg-accent/90"
          >
            Start
          </button>
        </div>
      ) : null}

      {!hasPreferences && showStickyVibePrompt && !isVibePromptDismissed ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[25rem] items-center gap-3 rounded-[28px] border border-accent/20 bg-zinc-950/92 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">Unlock your vibe</div>
              <div className="text-xs text-white/65">Give AI your taste so these picks feel more you.</div>
            </div>
            <button
              type="button"
              onClick={onOpenPreferences}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-accent/90"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                setIsVibePromptDismissed(true);
                setShowStickyVibePrompt(false);
                if (typeof window !== 'undefined') {
                  window.sessionStorage.setItem(VIBE_PROMO_DISMISSED_KEY, '1');
                }
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss vibe prompt"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {deviceLocationPermission !== 'granted' && deviceLocationPermission !== 'unsupported' && !isLocationPromptDismissed ? (
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/6 px-4 py-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">See how far each place is</div>
              <div className="text-xs text-white/60">
                {getLocationPromptCopy(deviceLocationPermission)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLocationPromptDismissed(true);
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(LOCATION_PROMO_DISMISSED_KEY, '1');
                }
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss location prompt"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onRequestDeviceLocation}
              disabled={isRequestingDeviceLocation}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequestingDeviceLocation
                ? 'Checking...'
                : deviceLocationPermission === 'denied'
                  ? 'Allow Location'
                  : 'Allow Location'}
            </button>
          </div>
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

      {isPreferenceTransitionLoading ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent/80">
            Cooking your picks
          </div>
          <div className="mt-2 text-lg font-black text-white">
            We&apos;re cooking places around your vibe right now.
          </div>
          <p className="mt-2 text-sm font-medium text-white/55">
            Pulling together the first stops that feel the most you.
          </p>
          <DiscoveryLoadingPreview />
        </div>
      ) : isLoading ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent/80">
            Cooking your picks
          </div>
          <div className="mt-2 text-lg font-black text-white">
            {isFilteringBySearch ? `We&apos;re cooking search matches in ${currentCity}.` : `We&apos;re cooking places for you in ${currentCity}.`}
          </div>
          <p className="mt-2 text-sm font-medium text-white/55">
            {isFilteringBySearch
              ? 'Finding the best-fit spots for your search, then stacking them in the right order.'
              : 'Lining up the first places that fit your current taste.'}
          </p>
          <DiscoveryLoadingPreview />
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
          <div className="grid grid-cols-2 items-start gap-3 [overflow-anchor:none]">
            <div className="flex flex-col gap-3">
              {leadingColumns.left.map((item) => {
                const index = item.sourceIndex;
                return (
                  <div key={`${item.type}-${item.id}`} className={`min-w-0 ${showGestureDemo && index === 0 ? 'relative z-30' : ''}`}>
                    {item.type === 'place' ? (
                      <PlaceDiscoveryTile
                        place={item.place}
                        index={index}
                        selectedInterests={selectedInterests}
                        selectedVibe={selectedVibe}
                        hasPreferences={hasPreferences}
                        deviceLocation={deviceLocation}
                        shouldAnimateEntry={shouldAnimateItemEntry}
                        isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                        isVisited={visitedPlaceIds.includes(item.place.id)}
                        gestureDemo={showGestureDemo && index === 0}
                        onGestureDemoComplete={onFinishGestureDemo}
                        onBookmark={() => onBookmarkPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        onDismiss={() => onDismissPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        onOpen={() => onSelectPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        getEditorialLabel={getEditorialLabel}
                        getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                      />
                    ) : (
                      <EventDiscoveryTile
                        event={item.event}
                        index={index}
                        selectedInterests={selectedInterests}
                        selectedVibe={selectedVibe}
                        shouldAnimateEntry={shouldAnimateItemEntry}
                        onOpen={() => onSelectEvent(item.event)}
                        getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                      />
                    )}
                  </div>
                );
              })}
              {isLoadingMore ? (
                <div key="left-loading-placeholder" className="min-w-0 [overflow-anchor:none]">
                  <div className="h-[21rem] w-full animate-pulse rounded-[28px] border border-white/10 bg-white/6" />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 pt-6">
              {leadingColumns.right.map((item) => {
                const index = item.sourceIndex;
                return (
                  <div key={`${item.type}-${item.id}`} className={`min-w-0 ${showGestureDemo && index === 0 ? 'relative z-30' : ''}`}>
                    {item.type === 'place' ? (
                      <PlaceDiscoveryTile
                        place={item.place}
                        index={index}
                        selectedInterests={selectedInterests}
                        selectedVibe={selectedVibe}
                        hasPreferences={hasPreferences}
                        deviceLocation={deviceLocation}
                        shouldAnimateEntry={shouldAnimateItemEntry}
                        isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                        isVisited={visitedPlaceIds.includes(item.place.id)}
                        gestureDemo={showGestureDemo && index === 0}
                        onGestureDemoComplete={onFinishGestureDemo}
                        onBookmark={() => onBookmarkPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        onDismiss={() => onDismissPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        onOpen={() => onSelectPlace(item.place, { positionInFeed: item.sourceIndex + 1, currentPage })}
                        getEditorialLabel={getEditorialLabel}
                        getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                      />
                    ) : (
                      <EventDiscoveryTile
                        event={item.event}
                        index={index}
                        selectedInterests={selectedInterests}
                        selectedVibe={selectedVibe}
                        shouldAnimateEntry={shouldAnimateItemEntry}
                        onOpen={() => onSelectEvent(item.event)}
                        getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                      />
                    )}
                  </div>
                );
              })}
              {isLoadingMore ? (
                <div key="right-loading-placeholder" className="min-w-0 [overflow-anchor:none]">
                  <div className="h-[24rem] w-full animate-pulse rounded-[28px] border border-white/10 bg-white/6" />
                </div>
              ) : null}
            </div>
          </div>

          {shouldShowSwipeHint ? (
            <div className="mt-7 overflow-hidden rounded-[28px] border border-white/10 bg-white/6 px-4 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[26px] font-black tracking-[-0.05em] text-white">
                    Swipe right to save.
                  </p>
                  <p className="mt-1 text-[26px] font-black tracking-[-0.05em] text-white/76">
                    Swipe left to hide.
                  </p>
                  <p className="mt-2 text-xs font-semibold text-white/45">
                    The more you swipe, the sharper your next picks get.
                  </p>
                </div>
                <div className="relative h-20 w-24 shrink-0 self-end sm:h-24 sm:w-28 sm:self-auto">
                  <motion.div
                    animate={{ x: [0, 18, 0, 0, -18, 0], rotate: [0, 4, 0, 0, -4, 0] }}
                    transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.18, 0.36, 0.52, 0.72, 1] }}
                    className="absolute left-2 top-1.5 h-16 w-12 rounded-[18px] border border-white/10 bg-gradient-to-b from-white/18 to-white/6 shadow-[0_18px_40px_rgba(0,0,0,0.24)] sm:top-2 sm:h-20 sm:w-16 sm:rounded-[22px]"
                  >
                    <div className="mx-auto mt-2.5 h-7 w-8 rounded-[12px] bg-white/18 sm:mt-3 sm:h-9 sm:w-10 sm:rounded-[14px]" />
                    <div className="mx-auto mt-2 h-2 w-7 rounded-full bg-white/20 sm:mt-3 sm:w-8" />
                  </motion.div>
                  <div className="absolute bottom-1.5 right-0 rounded-full bg-accent/90 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-black sm:bottom-2 sm:text-[9px]">
                    Save / Hide
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {shouldShowSwipeHint && trailingDiscoveryItems.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 items-start gap-3 [overflow-anchor:none]">
              <div className="flex flex-col gap-3">
                {trailingColumns.left.map((item) => {
                  const index = item.sourceIndex;
                  return (
                    <div key={`${item.type}-${item.id}`} className="min-w-0">
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          hasPreferences={hasPreferences}
                          deviceLocation={deviceLocation}
                          shouldAnimateEntry={false}
                          isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                          isVisited={visitedPlaceIds.includes(item.place.id)}
                          onBookmark={() => onBookmarkPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          onDismiss={() => onDismissPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          onOpen={() => onSelectPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          getEditorialLabel={getEditorialLabel}
                          getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          shouldAnimateEntry={false}
                          onOpen={() => onSelectEvent(item.event)}
                          getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 pt-6">
                {trailingColumns.right.map((item) => {
                  const index = item.sourceIndex;
                  return (
                    <div key={`${item.type}-${item.id}`} className="min-w-0">
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          hasPreferences={hasPreferences}
                          deviceLocation={deviceLocation}
                          shouldAnimateEntry={false}
                          isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                          isVisited={visitedPlaceIds.includes(item.place.id)}
                          onBookmark={() => onBookmarkPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          onDismiss={() => onDismissPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          onOpen={() => onSelectPlace(item.place, { positionInFeed: swipeHintInsertIndex + item.sourceIndex + 1, currentPage })}
                          getEditorialLabel={getEditorialLabel}
                          getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          shouldAnimateEntry={false}
                          onOpen={() => onSelectEvent(item.event)}
                          getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div ref={loadMoreRef} className="h-8" />

          {isLoadingMore ? (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium text-white/60">
              {isFilteringBySearch ? `Loading more matches for "${searchQuery}"...` : `Loading more picks for ${currentCity}...`}
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

const PlaceDiscoveryTile = memo(function PlaceDiscoveryTile({
  place,
  index,
  selectedInterests,
  selectedVibe,
  hasPreferences,
  deviceLocation,
  shouldAnimateEntry,
  isBookmarked,
  isVisited,
  gestureDemo = false,
  onGestureDemoComplete,
  onBookmark,
  onDismiss,
  onOpen,
  getEditorialLabel,
  getPlacePreferenceDebugMatches,
}: {
  place: Place;
  index: number;
  selectedInterests: Interest[];
  selectedVibe: Vibe | null;
  hasPreferences: boolean;
  deviceLocation: { latitude: number; longitude: number } | null;
  shouldAnimateEntry: boolean;
  isBookmarked: boolean;
  isVisited: boolean;
  gestureDemo?: boolean;
  onGestureDemoComplete?: () => void;
  onBookmark: () => void;
  onDismiss: () => void;
  onOpen: () => void;
  getEditorialLabel: (place: Place, index?: number) => string | null;
  getPlacePreferenceDebugMatches: (place: Place, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
}) {
  const suppressClickRef = useRef(false);
  const gestureDemoFinishedRef = useRef(false);
  void selectedInterests;
  void selectedVibe;
  const match = Math.min(place.similarityStat ?? 74, 98);
  const editorialLabel = getEditorialLabel(place, index);
  const preferenceDebugLabels = getPlacePreferenceDebugMatches(place, selectedInterests, selectedVibe);
  const noPreferenceMood = hasPreferences ? null : getPlaceMoodBadge(place);
  const distanceMiles = calculateDistanceMiles(deviceLocation, {
    latitude: place.latitude,
    longitude: place.longitude,
  });
  const tileHeightClass = getDiscoveryTileHeightClass(index);

  useEffect(() => {
    if (!gestureDemo) {
      gestureDemoFinishedRef.current = false;
    }
  }, [gestureDemo]);

  const demoAnimation =
    gestureDemo
      ? {
          x: [0, 58, 0, 0, -58, 0],
          rotate: [0, 4, 0, 0, -4, 0],
        }
      : undefined;

  return (
    <motion.button
      data-discovery-place-id={place.id}
      type="button"
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
      initial={shouldAnimateEntry ? { opacity: 0, y: 18 } : false}
      animate={
        gestureDemo
          ? { opacity: 1, y: 0, ...(demoAnimation ?? {}) }
          : { opacity: 1, y: 0 }
      }
      transition={
        gestureDemo
          ? {
              opacity: { duration: 0.2 },
              y: { duration: 0.2 },
              x: { duration: 4.8, times: [0, 0.16, 0.36, 0.52, 0.76, 1], ease: 'easeInOut' },
              rotate: { duration: 4.8, times: [0, 0.16, 0.36, 0.52, 0.76, 1], ease: 'easeInOut' },
            }
          : undefined
      }
      onAnimationComplete={() => {
        if (gestureDemo && !gestureDemoFinishedRef.current) {
          gestureDemoFinishedRef.current = true;
          onGestureDemoComplete?.();
        }
      }}
      className={`group relative inline-block w-full overflow-hidden rounded-[28px] bg-zinc-900 text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${tileHeightClass}`}
    >
      <img
        src={place.image}
        alt={place.name}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
      <CompatibilityBadge match={match} hasPreferences={hasPreferences} noPreferenceMood={noPreferenceMood} />
      {isBookmarked || isVisited ? (
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {isBookmarked ? (
            <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
              Saved
            </div>
          ) : null}
          {isVisited ? (
            <div className="rounded-full bg-black/72 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
              Visited
            </div>
          ) : null}
        </div>
      ) : null}
      {gestureDemo ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 1, 0, 0, 0] }}
            transition={{ duration: 4.8, times: [0, 0.06, 0.18, 0.34, 0.42, 0.43, 1] }}
            className="pointer-events-none absolute right-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-accent px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[0_18px_40px_rgba(211,255,72,0.28)]"
          >
            Swipe right to save
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0, 0, 1, 1, 1, 0] }}
            transition={{ duration: 4.8, times: [0, 0.56, 0.57, 0.62, 0.72, 0.84, 0.92, 1] }}
            className="pointer-events-none absolute left-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-white/92 px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950 shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
          >
            Swipe left to skip
          </motion.div>
        </>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-4">
        {import.meta.env.DEV && preferenceDebugLabels.length > 0 ? (
          <div className={editorialLabel ? 'mb-2 flex flex-wrap gap-1.5' : 'flex flex-wrap gap-1.5'}>
            {preferenceDebugLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-accent/30 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-accent/90 backdrop-blur-md"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {editorialLabel ? (
          <div>
            <p className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur-md">
              {editorialLabel}
            </p>
            {typeof distanceMiles === 'number' ? (
              <p className="mt-1.5 px-1 text-[10px] font-semibold tracking-[0.04em] text-white/62">
                {distanceMiles} mi away
              </p>
            ) : null}
          </div>
        ) : typeof distanceMiles === 'number' ? (
          <p className="px-1 text-[10px] font-semibold tracking-[0.04em] text-white/62">
            {distanceMiles} mi away
          </p>
        ) : null}
      </div>
    </motion.button>
  );
});

const EventDiscoveryTile = memo(function EventDiscoveryTile({
  event,
  index,
  selectedInterests,
  selectedVibe,
  shouldAnimateEntry,
  onOpen,
  getEventPreferenceDebugMatches,
}: {
  event: EventItem;
  index: number;
  selectedInterests: Interest[];
  selectedVibe: Vibe | null;
  shouldAnimateEntry: boolean;
  onOpen: () => void;
  getEventPreferenceDebugMatches: (event: EventItem, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
}) {
  const visualLabel = (event.tags?.[0] ?? getDisplayEventCategory(event)).toLowerCase();
  const preferenceDebugLabels = getEventPreferenceDebugMatches(event, selectedInterests, selectedVibe);
  const match = Math.min(event.compatibilityScore, 98);
  const noPreferenceMood = selectedInterests.length > 0 || !!selectedVibe ? null : getEventMoodBadge(event);
  const tileHeightClass = getDiscoveryTileHeightClass(index);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={shouldAnimateEntry ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative inline-block w-full overflow-hidden rounded-[28px] bg-zinc-900 text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${tileHeightClass}`}
    >
      <img
        src={event.image || 'https://placehold.co/800x1000/111111/ffffff?text=Event'}
        alt={event.name}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
      <CompatibilityBadge
        match={match}
        hasPreferences={selectedInterests.length > 0 || !!selectedVibe}
        noPreferenceMood={noPreferenceMood}
      />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {import.meta.env.DEV && preferenceDebugLabels.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {preferenceDebugLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-accent/30 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-accent/90 backdrop-blur-md"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <p className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur-md">
          {visualLabel}
        </p>
      </div>
    </motion.button>
  );
});

function CompatibilityBadge({
  match,
  hasPreferences,
  noPreferenceMood,
}: {
  match: number | null;
  hasPreferences: boolean;
  noPreferenceMood: MoodBadgeMeta | null;
}) {
  if (typeof match !== 'number') return null;
  if (!hasPreferences && !noPreferenceMood) return null;

  const badgeMeta = hasPreferences
    ? match >= 85
      ? {
          label: 'Must visit',
          className:
            'bg-accent px-3.5 py-2 text-[11px] text-black shadow-[0_18px_40px_rgba(211,255,72,0.28)]',
        }
      : match >= 70
        ? {
            label: 'Fits you',
            className:
              'border border-accent/65 bg-black/58 px-3.5 py-2 text-[11px] text-accent backdrop-blur-md',
          }
        : match >= 55
          ? {
              label: 'Worth a look',
              className: 'bg-black/60 px-3.5 py-2 text-[11px] text-white backdrop-blur-md',
            }
          : {
              label: 'Maybe',
              className: 'bg-black/55 px-3.5 py-2 text-[11px] text-white/78 backdrop-blur-md',
            }
    : null;

  return (
    <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
      {hasPreferences && badgeMeta ? (
        <div className={`rounded-full font-black tracking-[0.12em] ${badgeMeta.className}`}>
          {badgeMeta.label}
        </div>
      ) : noPreferenceMood ? (
        <div className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-black tracking-[0.12em] ${noPreferenceMood.className}`}>
          <noPreferenceMood.Icon size={13} className={noPreferenceMood.iconClassName} />
          <span>{noPreferenceMood.label}</span>
        </div>
      ) : null}
      {hasPreferences ? (
        <div className="text-[10px] font-semibold tracking-[0.04em] text-white/68">
          {match}%
        </div>
      ) : null}
    </div>
  );
}

const LocationPickerSheet = memo(function LocationPickerSheet({
  locations,
  activeLocationId,
  onClose,
  onSelectLocation,
  onAddLocation,
}: {
  locations: SavedLocationOption[];
  activeLocationId: string;
  onClose: () => void;
  onSelectLocation: (locationId: string) => void;
  onAddLocation: () => void;
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
        className="safe-bottom-pad fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pt-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]"
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
});

function getDisplayEventCategory(event: EventItem) {
  if (event.category && event.category.trim().length > 0) {
    return event.category;
  }

  if (event.tags && event.tags.length > 0) {
    return event.tags[0];
  }

  return 'Live event';
}
