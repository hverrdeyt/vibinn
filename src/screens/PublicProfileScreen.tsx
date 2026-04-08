import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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

export default function PublicProfileScreen({
  user,
  bookmarkedPlaces,
  customCollections,
  onOpenApp,
  onOpenCollection,
  displayFlags,
  publicMomentsCount,
  feedItems,
  renderFeedEntryCard,
  renderSavedPlaceCard,
  renderMomentCard,
}: {
  user: User;
  bookmarkedPlaces: Place[];
  customCollections: PlaceCollection[];
  onOpenApp: () => void;
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
  const [activeTab, setActiveTab] = useState<'feed' | 'saved' | 'visited' | 'collections'>('feed');
  const [expandedSavedCities, setExpandedSavedCities] = useState<string[]>([]);

  const safeBookmarkedPlaces = bookmarkedPlaces ?? [];
  const safeCollections = customCollections ?? [];
  const diaryPlaces = (user.travelHistory ?? []).flatMap((history) => history.places || []);
  const uniqueBookmarkedPlaces = safeBookmarkedPlaces
    .filter((place, index, places) => places.findIndex((candidate) => candidate.id === place.id) === index);
  const travelerSummary = `${uniqueBookmarkedPlaces.length} saved • ${diaryPlaces.length} visited • ${user.stats.cities} cities`;
  const groupedSavedPlaces = uniqueBookmarkedPlaces.reduce<Record<string, Place[]>>((acc, place) => {
    const city = place.location.split(',')[0]?.trim() ?? place.location;
    acc[city] = [...(acc[city] ?? []), place];
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-white">
      <div className="px-4 pb-10 pt-3">
        <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
          <div className="px-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
            Public profile
          </div>
          <button
            type="button"
            onClick={onOpenApp}
            className="rounded-full bg-accent px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-black transition hover:brightness-105"
          >
            Open app
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="line-clamp-2 pr-2 text-2xl font-black leading-tight tracking-tighter">{user.username}</h1>
                  <p className="text-sm font-black text-white/60">@{user.username}</p>
                  <p className="mt-1 font-medium leading-tight text-white/65">{user.bio}</p>
                </div>
                {user.matchScore ? (
                  <div className="mt-1 shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark">
                    {user.matchScore}% match
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{travelerSummary}</p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {displayFlags.map((flag, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-lg shadow-sm">{flag}</span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {user.badges?.slice(0, 3).map((badge) => (
                <span key={badge} className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">{badge}</span>
              ))}
            </div>
          </div>

          {user.descriptor ? (
            <div className="mt-6 rounded-[1.6rem] border border-accent/25 bg-accent/10 px-4 py-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent/80">Travel taste</div>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-accent">{user.descriptor}</p>
            </div>
          ) : user.matchScore ? (
            <div className="mt-6 rounded-[2rem] bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold leading-relaxed text-white/80">{user.matchScore}% match</p>
            </div>
          ) : null}

          <div className="mt-5">
            <button
              type="button"
              onClick={onOpenApp}
              className="w-full rounded-[1.25rem] bg-accent px-5 py-4 text-sm font-black text-dark transition hover:brightness-105"
            >
              Open app
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{uniqueBookmarkedPlaces.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">saved places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{publicMomentsCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">visited places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{safeCollections.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">collections</div>
            </div>
          </div>
        </div>

        <div className="mb-8 mt-8">
          <div className="mb-8 inline-flex rounded-full border border-white/10 bg-white/6 p-1">
            {[
              { id: 'feed', label: 'feed' },
              { id: 'saved', label: 'saved' },
              { id: 'visited', label: 'visited' },
              { id: 'collections', label: 'collections' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'feed' | 'saved' | 'visited' | 'collections')}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === tab.id ? 'bg-white text-black' : 'text-white/65'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tighter">
              {activeTab === 'feed'
                ? 'Taste activity'
                : activeTab === 'saved'
                  ? 'Places shaping their taste'
                  : activeTab === 'visited'
                    ? 'Places they actually checked into'
                    : 'Collections they have made'}
            </h2>
          </div>

          {activeTab === 'feed' ? (
            feedItems.length > 0 ? (
              <div className="space-y-4">
                {feedItems.map((item, index) => (
                  <div key={`${item.type}-${index}-${item.activityDate}`}>
                    {renderFeedEntryCard(item, index)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                No public activity yet.
              </div>
            )
          ) : activeTab === 'saved' ? (
            <div className="space-y-4">
              {uniqueBookmarkedPlaces.length > 0 ? (
                Object.entries(groupedSavedPlaces).map(([city, places]) => (
                  <section key={city}>
                    <button
                      type="button"
                      onClick={() => setExpandedSavedCities((prev) => prev.includes(city) ? prev.filter((item) => item !== city) : [...prev, city])}
                      className="mb-4 flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-left transition hover:bg-white/8"
                    >
                      <div>
                        <h3 className="text-lg font-black text-white">{city}</h3>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                          {places.length} saved
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-white/55 transition-transform ${expandedSavedCities.includes(city) ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {expandedSavedCities.includes(city) ? (
                      <div className="space-y-4">
                        {places.map((place, index) => (
                          <div key={`${place.id}-${index}`}>{renderSavedPlaceCard(place, index)}</div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                  No saved places to show yet.
                </div>
              )}
            </div>
          ) : activeTab === 'visited' ? (
            diaryPlaces.length > 0 ? (
              <div className="space-y-4">
                {diaryPlaces.map((place, index) => (
                  <div key={`${place.id}-${place.momentId ?? index}`}>
                    {renderMomentCard(place, index)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                No public visits to show yet.
              </div>
            )
          ) : (
            <div className="space-y-4">
              {safeCollections.length > 0 ? (
                safeCollections.map((collection) => (
                  <button
                    key={collection.id ?? collection.label}
                    type="button"
                    onClick={() => onOpenCollection(collection)}
                    className="w-full rounded-[24px] border border-white/10 bg-white/6 p-4 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-white">{collection.label}</div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">{collection.places.length} places</div>
                      </div>
                      <div className="flex -space-x-2">
                        {collection.places.slice(0, 3).map((place) => (
                          <img
                            key={`${collection.label}-${place.id}`}
                            src={place.image}
                            alt={place.name}
                            className="h-10 w-10 rounded-full border border-zinc-950 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                  No collections to show yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
