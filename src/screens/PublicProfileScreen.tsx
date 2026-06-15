import { type ReactNode, useMemo } from 'react';
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

function formatStat(value: number) {
  return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard' }).format(value);
}

function formatMemoryDate(value?: string | null) {
  if (!value?.trim()) return 'Recently';
  const normalized = value.trim();
  const parsed = normalized.match(/^\d{4}-\d{2}-\d{2}$/)
    ? new Date(`${normalized}T12:00:00Z`)
    : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return 'Recently';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildPreviewCells(places: Place[], startIndex: number) {
  const slice = places.slice(startIndex, startIndex + 3);
  if (slice.length === 3) return slice;

  const padded: Array<Place | null> = [...slice];
  while (padded.length < 3) padded.push(null);
  return padded;
}

export default function PublicProfileScreen({
  user,
  onFollow,
  publicMomentsCount,
}: {
  user: User;
  bookmarkedPlaces: Place[];
  customCollections: PlaceCollection[];
  onFollow: () => void;
  onOpenCollection: (collection: PlaceCollection) => void;
  displayFlags: string[];
  publicMomentsCount: number;
  feedItems: Array<unknown>;
  renderFeedEntryCard: (item: unknown, index: number) => ReactNode;
  renderSavedPlaceCard: (place: Place, index: number) => ReactNode;
  renderMomentCard: (place: User['travelHistory'][number]['places'][number], index: number) => ReactNode;
}) {
  const publicMemories = useMemo(
    () => (user.travelHistory ?? []).flatMap((history) => history.places || []),
    [user.travelHistory],
  );
  const firstRow = useMemo(() => buildPreviewCells(publicMemories, 0), [publicMemories]);
  const secondRow = useMemo(() => buildPreviewCells(publicMemories, 3), [publicMemories]);
  const totalMemories = publicMomentsCount || user.visitedPlacesCount || publicMemories.length;
  const followersCount = user.followersCount ?? 0;
  const followingCount = user.followingCount ?? 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-14 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-4 flex items-center justify-between rounded-full border border-white/10 bg-[#101013]/92 px-3 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 pl-1">
            <img
              src="/brand/vibinn-logo-icon.png"
              alt="Vibinn logo"
              className="h-8 w-8 rotate-[-8deg] object-contain"
              draggable={false}
            />
            <div className="landing-bbh-bartle text-[0.95rem] leading-none text-white">
              Vibinn
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFollow}
              className="rounded-full bg-accent px-4 py-2.5 text-sm font-black text-black transition hover:brightness-105"
            >
              Get the app
            </button>
          </div>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-[#101013]/94 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex items-start gap-4">
            <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04]">
              <img
                src={user.avatar}
                alt={user.displayName ?? user.username}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
              />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[1.6rem] font-black leading-tight text-white">
                {user.displayName ?? user.username}
              </h1>
              <div className="mt-1 text-base font-bold text-white/58">
                @{user.username}
              </div>
              {user.bio?.trim() ? (
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/78">
                  {user.bio.trim()}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              { label: 'Memories', value: totalMemories },
              { label: 'Following', value: followingCount },
              { label: 'Followers', value: followersCount },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3.5"
              >
                <div className="text-[1.15rem] font-black text-white">{formatStat(item.value)}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/36">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-[2rem] border border-white/10 bg-[#101013]/94 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <h2 className="landing-bbh-bartle mb-4 text-[1.9rem] leading-none text-accent">
            Food Memories
          </h2>

          {publicMemories.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center">
              <div className="text-base font-black text-white">No public memories yet</div>
              <p className="mt-2 text-sm text-white/60">
                Open Vibinn to see this profile when they start sharing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {firstRow.map((place, index) => (
                  <button
                    key={`public-visible-${place?.id ?? `empty-${index}`}`}
                    type="button"
                    onClick={onFollow}
                    className="group relative aspect-square overflow-hidden rounded-[1.45rem] border border-white/10 bg-white/[0.04] text-left"
                  >
                    {place ? (
                      <>
                        <img
                          src={getMomentPreviewImage(place)}
                          alt={place.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                          <div className="text-[11px] font-semibold tracking-[0.02em] text-white/74">
                            {formatMemoryDate(place.visitedDate)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full w-full bg-white/[0.03]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className="grid grid-cols-3 gap-3 blur-[3px] saturate-50">
                  {secondRow.map((place, index) => (
                    <div
                      key={`public-blurred-${place?.id ?? `empty-${index}`}`}
                      className="relative aspect-square overflow-hidden rounded-[1.45rem] border border-white/10 bg-white/[0.04]"
                    >
                      {place ? (
                        <img
                          src={getMomentPreviewImage(place)}
                          alt=""
                          className="h-full w-full object-cover opacity-65"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full w-full bg-white/[0.03]" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="absolute inset-0 rounded-[1.6rem] bg-black/48" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="pointer-events-auto text-center">
                    <div className="text-lg font-black text-white">See more in the app</div>
                    <button
                      type="button"
                      onClick={onFollow}
                      className="mt-3 rounded-full bg-accent px-5 py-3 text-sm font-black text-black transition hover:brightness-105"
                    >
                      See in app
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
