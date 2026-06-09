import { type ReactNode } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
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

function formatReview(place: Place) {
  if (place.momentCaption?.trim()) return place.momentCaption.trim();
  if (place.description?.trim()) return place.description.trim();
  return 'Part of their food diary';
}

function formatLocationLabel(place: Place) {
  if (place.address?.trim()) return place.address.trim();
  return place.location;
}

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
  feedItems: Array<
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
  renderFeedEntryCard: (
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
        },
    index: number,
  ) => ReactNode;
  renderSavedPlaceCard: (place: Place, index: number) => ReactNode;
  renderMomentCard: (place: User['travelHistory'][number]['places'][number], index: number) => ReactNode;
}) {
  const safeBookmarkedPlaces = bookmarkedPlaces ?? [];
  const safeCollections = customCollections ?? [];
  const diaryPlaces = (user.travelHistory ?? []).flatMap((history) => history.places || []);
  const uniqueBookmarkedPlaces = safeBookmarkedPlaces.filter(
    (place, index, places) => places.findIndex((candidate) => candidate.id === place.id) === index,
  );
  const recentMoments = diaryPlaces.slice(0, 6);
  const recentPlaces = [...recentMoments, ...uniqueBookmarkedPlaces]
    .filter((place, index, places) => places.findIndex((candidate) => candidate.id === place.id) === index)
    .slice(0, 5);
  const featuredCollections = safeCollections.slice(0, 3);
  const featuredActivity = feedItems.slice(0, 2);
  const heroName = user.displayName?.trim() || user.username;
  const shortBio = user.bio?.trim() || 'Sharing a personal food diary on Vibinn.';
  const cityLine = user.travelHistory.flatMap((entry) => entry.cities ?? []).filter(Boolean).slice(0, 3).join(' • ');

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:p-7">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(211,255,72,0.18),transparent_65%)]" />

          <div className="relative flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-[70%]">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-accent/80">Vibinn profile</div>
                <h1 className="mt-3 text-4xl font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-5xl">
                  {heroName}
                </h1>
                <p className="mt-2 text-sm font-bold text-white/50">@{user.username}</p>
              </div>

              <button
                type="button"
                onClick={onFollow}
                className="shrink-0 rounded-full bg-accent px-5 py-3 text-sm font-black text-black transition hover:brightness-105"
              >
                Get the app
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 sm:h-24 sm:w-24">
                    <img
                      src={user.avatar}
                      alt={heroName}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(event) => handleAvatarImageError(event, heroName)}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-relaxed text-white/80">{shortBio}</p>
                    {cityLine ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-white/55">
                        <MapPin size={14} className="shrink-0 text-accent" />
                        <span className="truncate">{cityLine}</span>
                      </div>
                    ) : null}
                    {user.descriptor ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-bold text-accent">
                        <Sparkles size={14} />
                        <span>{user.descriptor}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/40 p-3">
                    <div className="text-xl font-black text-white">{publicMomentsCount}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">memories</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/40 p-3">
                    <div className="text-xl font-black text-white">{uniqueBookmarkedPlaces.length}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">saved places</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/40 p-3">
                    <div className="text-xl font-black text-white">{safeCollections.length}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">lists</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Quick taste read</div>
                    <h2 className="mt-2 text-xl font-black tracking-tight text-white">A compact snapshot</h2>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {displayFlags.slice(0, 5).map((flag, index) => (
                    <span
                      key={`${flag}-${index}`}
                      className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-lg"
                    >
                      {flag}
                    </span>
                  ))}
                  {displayFlags.length === 0 ? (
                    <span className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                      Food diary
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Cities logged</div>
                    <div className="mt-2 text-2xl font-black text-white">{user.stats.cities}</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Public profile</div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-white/65">
                      See recent meals, favorite spots, and the places shaping their taste.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {recentMoments.length > 0 ? (
          <section className="mt-6 rounded-[2.3rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Recent diary</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Meals worth remembering</h2>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              {recentMoments.map((place, index) => (
                <article
                  key={`${place.id}-${place.momentId ?? index}`}
                  className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/40"
                >
                  <div className="aspect-[0.92] w-full overflow-hidden bg-white/5">
                    <img
                      src={getMomentPreviewImage(place)}
                      alt={place.name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-1 text-base font-black text-white">{place.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/65">{formatReview(place)}</p>
                    <p className="mt-2 line-clamp-1 text-xs font-semibold text-white/40">{formatLocationLabel(place)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {featuredActivity.length > 0 ? (
          <section className="mt-6">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Recent activity</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">A few highlights</h2>
            </div>

            <div className="mt-4 space-y-4">
              {featuredActivity.map((item, index) => (
                <div key={`${item.type}-${index}-${item.activityDate}`}>{renderFeedEntryCard(item, index)}</div>
              ))}
            </div>
          </section>
        ) : null}

        {featuredCollections.length > 0 ? (
          <section className="mt-6 rounded-[2.3rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Collections</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Saved into lists</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {featuredCollections.map((collection) => (
                <button
                  key={collection.id ?? collection.label}
                  type="button"
                  onClick={() => onOpenCollection(collection)}
                  className="rounded-[1.8rem] border border-white/10 bg-black/40 p-4 text-left transition hover:border-white/20 hover:bg-black/55"
                >
                  <div className="flex -space-x-2">
                    {collection.places.slice(0, 3).map((place) => (
                      <img
                        key={`${collection.label}-${place.id}`}
                        src={place.image}
                        alt={place.name}
                        className="h-12 w-12 rounded-full border border-zinc-950 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                  <h3 className="mt-4 line-clamp-1 text-lg font-black text-white">{collection.label}</h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                    {collection.places.length} places
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {recentPlaces.length > 0 ? (
          <section className="mt-6 rounded-[2.3rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Places in rotation</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Recent spots</h2>

            <div className="mt-5 flex flex-wrap gap-2">
              {recentPlaces.map((place) => (
                <span
                  key={`recent-place-${place.id}`}
                  className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/75"
                >
                  {place.name}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[2.5rem] border border-accent/20 bg-accent/[0.08] px-5 py-6 text-center sm:px-8">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent/80">Join Vibinn</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">See the full diary in the app.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/65">
            Follow friends, save places, and turn every meal into a food diary that actually feels personal.
          </p>
          <button
            type="button"
            onClick={onFollow}
            className="mt-5 rounded-full bg-accent px-6 py-3 text-sm font-black text-black transition hover:brightness-105"
          >
            Open Vibinn
          </button>
        </section>
      </div>
    </div>
  );
}
