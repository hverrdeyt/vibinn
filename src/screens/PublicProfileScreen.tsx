import { useMemo, useState, type ReactNode } from 'react';
import { Compass, Ellipsis, Grid2x2, MapPin, Share2 } from 'lucide-react';
import { type Place, type PlaceCollection, type User } from '../types';

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

function getMomentPreviewImage(place: Place) {
  return place.momentMedia?.find((media) => media.mediaType === 'image')?.url ?? place.image;
}

function getPlaceCity(place: Place) {
  return place.location.split(',')[0]?.trim() ?? place.location.trim();
}

function formatReview(place: Place) {
  if (place.momentCaption?.trim()) return place.momentCaption.trim();
  if (place.description?.trim()) return place.description.trim();
  return 'Part of their food diary';
}

function formatLocationLabel(place: Place) {
  if (place.address?.trim()) return place.address.trim();
  return place.location;
}

function parseDisplayDate(value?: string | null) {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  const rawDate = normalized.match(/^\d{4}-\d{2}-\d{2}$/)
    ? new Date(`${normalized}T12:00:00Z`)
    : new Date(normalized);
  return Number.isNaN(rawDate.getTime()) ? null : rawDate;
}

function mapCoordinate(value: number, min: number, max: number) {
  if (min === max) return 50;
  const percentage = ((value - min) / (max - min)) * 100;
  return Math.min(88, Math.max(12, percentage));
}

type FeedItem =
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

type GalleryGrouping = 'byDate' | 'byCity';
type ProfileMode = 'gallery' | 'posts' | 'map';

export default function PublicProfileScreen({
  user,
  bookmarkedPlaces,
  customCollections,
  onFollow,
  onOpenCollection,
  displayFlags,
  publicMomentsCount,
  feedItems,
  renderFeedEntryCard,
}: {
  user: User;
  bookmarkedPlaces: Place[];
  customCollections: PlaceCollection[];
  onFollow: () => void;
  onOpenCollection: (collection: PlaceCollection) => void;
  displayFlags: string[];
  publicMomentsCount: number;
  feedItems: FeedItem[];
  renderFeedEntryCard: (item: FeedItem, index: number) => ReactNode;
  renderSavedPlaceCard: (place: Place, index: number) => ReactNode;
  renderMomentCard: (place: User['travelHistory'][number]['places'][number], index: number) => ReactNode;
}) {
  const [activeMode, setActiveMode] = useState<ProfileMode>('gallery');
  const [galleryGrouping, setGalleryGrouping] = useState<GalleryGrouping>('byDate');
  const [activePostsCityFilter, setActivePostsCityFilter] = useState('All cities');

  const safeBookmarkedPlaces = bookmarkedPlaces ?? [];
  const safeCollections = customCollections ?? [];
  const diaryPlaces = useMemo(
    () => (user.travelHistory ?? []).flatMap((history) => history.places || []),
    [user.travelHistory],
  );
  const sortedMoments = useMemo(
    () => [...diaryPlaces].sort((left, right) => {
      const lhs = parseDisplayDate(left.visitedDate)?.getTime() ?? 0;
      const rhs = parseDisplayDate(right.visitedDate)?.getTime() ?? 0;
      return rhs - lhs;
    }),
    [diaryPlaces],
  );
  const uniqueBookmarkedPlaces = useMemo(
    () => safeBookmarkedPlaces.filter(
      (place, index, places) => places.findIndex((candidate) => candidate.id === place.id) === index,
    ),
    [safeBookmarkedPlaces],
  );
  const allCityValues = useMemo(
    () => Array.from(new Set(sortedMoments.map(getPlaceCity).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [sortedMoments],
  );
  const profileAvailableCities = useMemo(
    () => ['All cities', ...allCityValues],
    [allCityValues],
  );
  const filteredPostMoments = useMemo(
    () => (activePostsCityFilter === 'All cities'
      ? sortedMoments
      : sortedMoments.filter((moment) => getPlaceCity(moment) === activePostsCityFilter)),
    [activePostsCityFilter, sortedMoments],
  );
  const gallerySections = useMemo(() => {
    if (galleryGrouping === 'byCity') {
      return (user.travelHistory ?? [])
        .map((history) => ({
          key: `${history.country}-${history.cities[0] ?? history.country}`,
          title: history.cities[0] ?? history.country,
          moments: history.places ?? [],
        }))
        .filter((section) => section.moments.length > 0);
    }

    const grouped = sortedMoments.reduce<Record<string, Place[]>>((acc, place) => {
      const date = parseDisplayDate(place.visitedDate);
      const label = date
        ? date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
        : 'Earlier';
      acc[label] = [...(acc[label] ?? []), place];
      return acc;
    }, {});

    return Object.entries(grouped).map(([label, moments]) => ({
      key: label,
      title: label,
      moments,
    }));
  }, [galleryGrouping, sortedMoments, user.travelHistory]);
  const mapMoments = useMemo(
    () => sortedMoments.filter((moment) => typeof moment.latitude === 'number' && typeof moment.longitude === 'number').slice(0, 6),
    [sortedMoments],
  );
  const cityLabel = useMemo(() => {
    if (user.descriptor?.trim() && user.descriptor.trim().length <= 32) return user.descriptor.trim();
    return allCityValues[0] ?? null;
  }, [allCityValues, user.descriptor]);
  const uniquePlaceCount = useMemo(
    () => new Set(sortedMoments.map((moment) => moment.id)).size,
    [sortedMoments],
  );
  const mapBounds = useMemo(() => {
    if (mapMoments.length === 0) return null;
    const latitudes = mapMoments.map((moment) => moment.latitude as number);
    const longitudes = mapMoments.map((moment) => moment.longitude as number);
    return {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };
  }, [mapMoments]);

  const handleShareProfile = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    const message = `Check @${user.username}'s food diary profile on Vibinn: ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${user.username} on Vibinn`, text: message, url: shareUrl });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard?.writeText(message).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-black pb-24 text-white">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-6">
        <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-[#101013]/95 px-2 py-2 backdrop-blur-xl">
          <div className="px-4 text-[11px] font-black uppercase tracking-[0.2em] text-white/42">Vibinn profile</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleShareProfile}
              className="rounded-full p-3 text-white transition hover:bg-white/8"
              aria-label="Share profile"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={onFollow}
              className="rounded-full bg-accent px-5 py-3 text-sm font-black text-black transition hover:brightness-105"
            >
              Get the app
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[2rem] border border-white/10 bg-[#101013]/95 p-5">
            <div className="flex items-start gap-4">
              <div className="h-[68px] w-[68px] overflow-hidden rounded-[22px] border border-white/10 bg-white/5">
                <img
                  src={user.avatar}
                  alt={user.displayName ?? user.username}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-[24px] font-black leading-tight text-white">
                  {user.displayName ?? user.username}
                </h1>
                <p className="mt-1 text-sm font-bold text-white/55">@{user.username}</p>
                {cityLabel ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-[13px] font-bold text-accent">
                    <MapPin size={14} />
                    <span>{cityLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {user.bio?.trim() ? (
            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-medium leading-relaxed text-white/78">{user.bio.trim()}</p>
            </section>
          ) : null}

          <section className="grid grid-cols-3 gap-2.5">
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
              <div className="text-lg font-black text-white">{uniquePlaceCount}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Places</div>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
              <div className="text-lg font-black text-white">{user.stats.cities}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Cities</div>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
              <div className="text-lg font-black text-white">{safeCollections.length}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Lists</div>
            </div>
          </section>

          <section className="flex gap-2">
            <button
              type="button"
              onClick={onFollow}
              className="flex-1 rounded-[18px] bg-accent px-4 py-3 text-sm font-black text-black transition hover:brightness-105"
            >
              Get the app
            </button>
            <button
              type="button"
              onClick={handleShareProfile}
              className="h-12 w-12 rounded-[18px] bg-white/[0.08] text-white transition hover:bg-white/[0.12]"
              aria-label="Share profile"
            >
              <Share2 size={18} className="mx-auto" />
            </button>
            <button
              type="button"
              onClick={onFollow}
              className="h-12 w-12 rounded-[18px] bg-white/[0.08] text-white transition hover:bg-white/[0.12]"
              aria-label="More actions"
            >
              <Ellipsis size={18} className="mx-auto" />
            </button>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-black/90 pb-1">
            <div className="flex">
              {[
                { id: 'gallery' as const, label: 'Gallery', icon: Grid2x2 },
                { id: 'posts' as const, label: 'Posts', icon: Share2 },
                { id: 'map' as const, label: 'Map', icon: Compass },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setActiveMode(mode.id)}
                  className="group flex-1 px-2 pt-4"
                >
                  <div className={`flex items-center justify-center gap-2 text-sm font-black transition ${
                    activeMode === mode.id ? 'text-white' : 'text-white/56'
                  }`}>
                    <mode.icon size={13} />
                    <span>{mode.label}</span>
                  </div>
                  <div className={`mt-3 h-[3px] w-full transition ${
                    activeMode === mode.id ? 'bg-accent' : 'bg-white/12'
                  }`} />
                </button>
              ))}
            </div>
          </section>

          {activeMode === 'gallery' ? (
            <section className="space-y-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'byDate' as const, label: 'By date' },
                  { id: 'byCity' as const, label: 'By city' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setGalleryGrouping(filter.id)}
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold transition ${
                      galleryGrouping === filter.id ? 'bg-accent text-black' : 'bg-white/[0.06] text-white/72'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {gallerySections.length === 0 ? (
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-white/6 0">
                  No gallery yet.
                </div>
              ) : (
                <div className="space-y-5">
                  {gallerySections.map((section) => (
                    <section key={section.key}>
                      <h3 className="mb-3 text-[15px] font-black text-white">{section.title}</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {section.moments.map((moment) => (
                          <button
                            key={`${section.key}-${moment.id}-${moment.momentId ?? 'memory'}`}
                            type="button"
                            onClick={onFollow}
                            className="group overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] text-left"
                          >
                            <div className="relative aspect-square overflow-hidden">
                              <img
                                src={getMomentPreviewImage(moment)}
                                alt={moment.name}
                                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2">
                                <div className="text-[9px] font-black text-white/72">
                                  {moment.visitedDate ?? 'Recently'}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeMode === 'posts' ? (
            <section className="space-y-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {profileAvailableCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setActivePostsCityFilter(city)}
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold transition ${
                      activePostsCityFilter === city ? 'bg-accent text-black' : 'bg-white/[0.06] text-white/72'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              {filteredPostMoments.length === 0 ? (
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-white/60">
                  No posts in this city yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {feedItems
                    .filter((item) => (
                      activePostsCityFilter === 'All cities'
                        ? true
                        : item.type === 'collection'
                          ? item.collectionPlaces.some((place) => getPlaceCity(place) === activePostsCityFilter)
                          : getPlaceCity(item.place) === activePostsCityFilter
                    ))
                    .map((item, index) => (
                      <div key={`${item.type}-${index}-${item.activityDate}`}>
                        {renderFeedEntryCard(item, index)}
                      </div>
                    ))}
                </div>
              )}
            </section>
          ) : null}

          {activeMode === 'map' ? (
            <section className="space-y-3">
              {mapMoments.length === 0 || !mapBounds ? (
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-white/60">
                  No mapped posts yet.
                </div>
              ) : (
                <>
                  <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1013]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(211,255,72,0.16),transparent_55%)]" />
                    <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:48px_48px]" />
                    <div className="relative h-[620px] w-full">
                      {mapMoments.map((moment) => {
                        const left = mapCoordinate(moment.longitude as number, mapBounds.minLng, mapBounds.maxLng);
                        const top = mapCoordinate((mapBounds.maxLat - (moment.latitude as number)), 0, mapBounds.maxLat - mapBounds.minLat || 1);
                        return (
                          <button
                            key={`map-${moment.id}-${moment.momentId ?? 'entry'}`}
                            type="button"
                            onClick={onFollow}
                            className="absolute -translate-x-1/2 -translate-y-1/2 text-left"
                            style={{ left: `${left}%`, top: `${top}%` }}
                          >
                            <div className="space-y-1">
                              <div className="overflow-hidden rounded-[14px] border border-white/12 bg-black shadow-[0_22px_44px_rgba(0,0,0,0.28)]">
                                <img
                                  src={getMomentPreviewImage(moment)}
                                  alt={moment.name}
                                  className="h-[54px] w-[54px] object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="rounded-full bg-black/70 px-2 py-1 text-[9px] font-black text-white/88">
                                @{user.username}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="px-1 text-sm font-semibold text-white/58">
                    {mapMoments.length} mapped posts
                  </div>
                </>
              )}
            </section>
          ) : null}

          {displayFlags.length > 0 ? (
            <section className="flex flex-wrap gap-2 pt-2">
              {displayFlags.slice(0, 5).map((flag, index) => (
                <span
                  key={`${flag}-${index}`}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-lg"
                >
                  {flag}
                </span>
              ))}
            </section>
          ) : null}

          {safeCollections.length > 0 ? (
            <section className="space-y-3 pt-2">
              <div className="text-[12px] font-black uppercase tracking-[0.2em] text-white/38">Lists</div>
              <div className="grid gap-3 md:grid-cols-2">
                {safeCollections.slice(0, 4).map((collection) => (
                  <button
                    key={collection.id ?? collection.label}
                    type="button"
                    onClick={() => onOpenCollection(collection)}
                    className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-white">{collection.label}</div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                          {collection.places.length} places
                        </div>
                      </div>
                      <div className="flex -space-x-2">
                        {collection.places.slice(0, 3).map((place) => (
                          <img
                            key={`${collection.label}-${place.id}`}
                            src={place.image}
                            alt={place.name}
                            className="h-10 w-10 rounded-full border border-black object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
