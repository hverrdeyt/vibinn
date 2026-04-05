import { memo, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, ChevronDown, Search, X } from 'lucide-react';
import { type EventItem, type Interest, type Place, type Vibe } from '../types';

interface SavedLocationOption {
  id: string;
  label: string;
  type: 'city' | 'province' | 'country';
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
}

export default function PlaceDiscoveryScreen({
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
  isPreferenceTransitionLoading,
  isLoadingMore,
  isRefreshing,
  hasMore,
  hasError,
  hasEventsError,
  bookmarkedPlaceIds,
  showGestureDemo,
  onFinishGestureDemo,
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
  visiblePlaces: Place[];
  isLoading: boolean;
  isEventsLoading: boolean;
  isPreferenceTransitionLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  hasError: boolean;
  hasEventsError: boolean;
  bookmarkedPlaceIds: string[];
  showGestureDemo: boolean;
  onFinishGestureDemo: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onBookmarkPlace: (place: Place) => void;
  onDismissPlace: (place: Place) => void;
  onSelectPlace: (place: Place) => void;
  onSelectEvent: (event: EventItem) => void;
  getEditorialLabel: (place: Place, index?: number) => string | null;
  getPlacePreferenceDebugMatches: (place: Place, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
  getEventPreferenceDebugMatches: (event: EventItem, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
}) {
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(searchInput.trim().length > 0);
  const [pullDistance, setPullDistance] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const autoFillLoadMoreRafRef = useRef<number | null>(null);
  const loadMoreLockRef = useRef(false);
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const currentCity = activeLocation?.label ?? 'Boston';
  const isFilteringBySearch = searchQuery.length > 0;
  const displayPlaces = visiblePlaces;
  const bookmarkedPlaceIdSet = useMemo(() => new Set(bookmarkedPlaceIds), [bookmarkedPlaceIds]);
  const mixedDiscoveryItems = useMemo(() => {
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
  }, [displayPlaces, events]);
  const leftColumnItems = useMemo(
    () => mixedDiscoveryItems.filter((_, index) => index % 2 === 0),
    [mixedDiscoveryItems],
  );
  const rightColumnItems = useMemo(
    () => mixedDiscoveryItems.filter((_, index) => index % 2 === 1),
    [mixedDiscoveryItems],
  );

  const canLoadMore = hasMore && !isLoading && !isLoadingMore && !isRefreshing;

  const triggerLoadMore = () => {
    if (!canLoadMore || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    onLoadMore();
  };

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

      {isPreferenceTransitionLoading ? (
        <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent/80">
            Tuning your feed
          </div>
          <div className="mt-2 text-lg font-black text-white">
            Curating places and events around your picks...
          </div>
          <p className="mt-2 text-sm font-medium text-white/55">
            We&apos;re re-ranking this city around the interests and vibe you just chose.
          </p>
        </div>
      ) : isLoading ? (
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
              <AnimatePresence initial={false}>
                {leftColumnItems.map((item, columnIndex) => {
                  const index = columnIndex * 2;
                  return (
                    <div key={`${item.type}-${item.id}`} className={`min-w-0 ${showGestureDemo && index === 0 ? 'relative z-30' : ''}`}>
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                          gestureDemo={showGestureDemo && index === 0}
                          onGestureDemoComplete={onFinishGestureDemo}
                          onBookmark={() => onBookmarkPlace(item.place)}
                          onDismiss={() => onDismissPlace(item.place)}
                          onOpen={() => onSelectPlace(item.place)}
                          getEditorialLabel={getEditorialLabel}
                          getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          onOpen={() => onSelectEvent(item.event)}
                          getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                        />
                      )}
                    </div>
                  );
                })}
                {isLoadingMore ? (
                  <div key="left-loading-placeholder" className="min-w-0">
                    <div className="h-[21rem] w-full animate-pulse rounded-[28px] border border-white/10 bg-white/6" />
                  </div>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {rightColumnItems.map((item, columnIndex) => {
                  const index = columnIndex * 2 + 1;
                  return (
                    <div key={`${item.type}-${item.id}`} className={`min-w-0 ${showGestureDemo && index === 0 ? 'relative z-30' : ''}`}>
                      {item.type === 'place' ? (
                        <PlaceDiscoveryTile
                          place={item.place}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          isBookmarked={bookmarkedPlaceIdSet.has(item.place.id)}
                          gestureDemo={showGestureDemo && index === 0}
                          onGestureDemoComplete={onFinishGestureDemo}
                          onBookmark={() => onBookmarkPlace(item.place)}
                          onDismiss={() => onDismissPlace(item.place)}
                          onOpen={() => onSelectPlace(item.place)}
                          getEditorialLabel={getEditorialLabel}
                          getPlacePreferenceDebugMatches={getPlacePreferenceDebugMatches}
                        />
                      ) : (
                        <EventDiscoveryTile
                          event={item.event}
                          index={index}
                          selectedInterests={selectedInterests}
                          selectedVibe={selectedVibe}
                          onOpen={() => onSelectEvent(item.event)}
                          getEventPreferenceDebugMatches={getEventPreferenceDebugMatches}
                        />
                      )}
                    </div>
                  );
                })}
                {isLoadingMore ? (
                  <div key="right-loading-placeholder" className="min-w-0">
                    <div className="h-[24rem] w-full animate-pulse rounded-[28px] border border-white/10 bg-white/6" />
                  </div>
                ) : null}
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

const PlaceDiscoveryTile = memo(function PlaceDiscoveryTile({
  place,
  index,
  selectedInterests,
  selectedVibe,
  isBookmarked,
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
  isBookmarked: boolean;
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
  const hasCompatibilityScore = selectedInterests.length > 0 || !!selectedVibe;
  const match = hasCompatibilityScore ? Math.min(place.similarityStat ?? 74, 98) : null;
  const editorialLabel = getEditorialLabel(place, index);
  const preferenceDebugLabels = getPlacePreferenceDebugMatches(place, selectedInterests, selectedVibe);
  const tileHeightClass =
    index % 4 === 0
      ? 'h-[20.5rem]'
      : index % 4 === 1
        ? 'h-[26rem]'
        : index % 4 === 2
          ? 'h-[18rem]'
          : 'h-[22.5rem]';

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
      <CompatibilityBadge match={match} />
      {isBookmarked ? (
        <div className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
          Saved
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
          <p className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur-md">
            {editorialLabel}
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
  onOpen,
  getEventPreferenceDebugMatches,
}: {
  event: EventItem;
  index: number;
  selectedInterests: Interest[];
  selectedVibe: Vibe | null;
  onOpen: () => void;
  getEventPreferenceDebugMatches: (event: EventItem, selectedInterests: Interest[], selectedVibe: Vibe | null) => string[];
}) {
  const visualLabel = (event.tags?.[0] ?? getDisplayEventCategory(event)).toLowerCase();
  const preferenceDebugLabels = getEventPreferenceDebugMatches(event, selectedInterests, selectedVibe);
  const hasCompatibilityScore = selectedInterests.length > 0 || !!selectedVibe;
  const match = hasCompatibilityScore ? Math.min(event.compatibilityScore, 98) : null;
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
      <CompatibilityBadge match={match} />
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

function CompatibilityBadge({ match }: { match: number | null }) {
  return (
    <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-accent backdrop-blur-md">
      {typeof match === 'number' ? (
        `${match}%`
      ) : (
        <motion.span
          animate={{ opacity: [0.28, 1, 0.28] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex items-center gap-1"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </motion.span>
      )}
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
