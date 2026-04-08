import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Bookmark, ChevronDown, MessageCircle, Share2, Zap } from 'lucide-react';
import { api } from '../lib/api';
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

type CommentsTarget =
  | { targetType: 'MOMENT' | 'PLACE'; targetId: string; name: string; momentId?: string }
  | { targetType: 'COLLECTION'; targetId: string; name: string };

export default function TravelerProfileScreen({
  user,
  bookmarkedPlaces,
  customCollections,
  displayFlags,
  onBack,
  onSavePlace,
  onSelectPlace,
  onOpenCollection,
  onShareProfile,
  renderMomentEntryCard,
  renderSavedPlaceCard,
  feedItems,
  renderFeedEntryCard,
}: {
  user: User;
  bookmarkedPlaces: Place[];
  customCollections: PlaceCollection[];
  displayFlags: string[];
  onBack: () => void;
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>;
  onSelectPlace: (p: Place) => void;
  onOpenCollection: (collection: PlaceCollection) => void;
  onShareProfile: () => void;
  renderMomentEntryCard: (args: { place: Place; contextNote: string; matchScore?: number; footer: ReactNode }) => ReactNode;
  renderSavedPlaceCard: (place: Place, index: number) => ReactNode;
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
    controls?: {
      vibed: boolean;
      vibinCount: number;
      commentsCount: number;
      onToggleVibin?: () => void;
      onOpenComments?: () => void;
    },
  ) => ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<'feed' | 'saved' | 'visited' | 'collections'>('feed');
  const [momentsFilter, setMomentsFilter] = useState<'city' | 'time'>('city');
  const [expandedSavedCities, setExpandedSavedCities] = useState<string[]>([]);
  const [commentsTarget, setCommentsTarget] = useState<CommentsTarget | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [vibedPlaceIds, setVibedPlaceIds] = useState<string[]>([]);
  const [vibedCollectionIds, setVibedCollectionIds] = useState<string[]>([]);
  const [savedProfilePlaceIds, setSavedProfilePlaceIds] = useState<string[]>([]);
  const [sharedPlaceIds, setSharedPlaceIds] = useState<string[]>([]);
  const [placeVibinCounts, setPlaceVibinCounts] = useState<Record<string, number>>({});
  const [profileCommentCounts, setProfileCommentCounts] = useState<Record<string, number>>({});
  const [collectionCommentCounts, setCollectionCommentCounts] = useState<Record<string, number>>({});
  const [collectionVibinCounts, setCollectionVibinCounts] = useState<Record<string, number>>({});
  const [followersCount, setFollowersCount] = useState(0);
  const [comments, setComments] = useState<Array<{ id: string; user: string; body: string; createdAt: string }>>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [profileToast, setProfileToast] = useState<string | null>(null);

  const safeBookmarkedPlaces = bookmarkedPlaces ?? [];
  const safeCollections = customCollections ?? [];
  const diaryPlaces = (user.travelHistory ?? []).flatMap((history) => history.places || []);
  const uniqueBookmarkedPlaces = safeBookmarkedPlaces
    .filter((place, index, places) => places.findIndex((candidate) => candidate.id === place.id) === index);
  const travelerSummary = `${uniqueBookmarkedPlaces.length} saved • ${diaryPlaces.length} visited • ${user.stats.cities} cities`;
  const momentCollections = safeCollections.filter((collection) => collection.places.length > 0);
  const cityCollections = (user.travelHistory ?? []).filter((history) => (history.places ?? []).length > 0);
  const groupedByTime = Object.values(
    diaryPlaces.reduce<Record<string, { label: string; places: Place[] }>>((acc, place) => {
      const date = place.visitedDate ? new Date(place.visitedDate) : null;
      if (!date || Number.isNaN(date.getTime())) return acc;
      const label = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (!acc[label]) {
        acc[label] = { label, places: [] };
      }
      acc[label].places.push(place);
      return acc;
    }, {}),
  ).filter((group) => group.places.length > 0);
  const groupedSavedPlaces = uniqueBookmarkedPlaces.reduce<Record<string, Place[]>>((acc, place) => {
    const city = place.location.split(',')[0]?.trim() ?? place.location;
    acc[city] = [...(acc[city] ?? []), place];
    return acc;
  }, {});
  const collectionIdByName = Object.fromEntries(momentCollections.map((collection) => [collection.label, collection.id]));
  const feedInteractionPlaces = feedItems
    .filter((item): item is Extract<typeof feedItems[number], { type: 'saved' | 'visited' }> => item.type !== 'collection')
    .map((item) => item.place);
  const feedPlaceIds = Array.from(new Set(feedInteractionPlaces.map((place) => place.id)));
  const feedMomentIds = Array.from(new Set(
    feedInteractionPlaces.map((place) => place.momentId).filter(Boolean) as string[],
  ));
  const feedInteractionKey = `${user.id}:${feedPlaceIds.join(',')}:${feedMomentIds.join(',')}`;

  const showProfileToast = (message: string) => {
    setProfileToast(message);
    window.setTimeout(() => {
      setProfileToast((current) => (current === message ? null : current));
    }, 1800);
  };

  useEffect(() => {
    if (!commentsTarget) return;
    void api.getComments({
      targetType: commentsTarget.targetType,
      targetId: commentsTarget.targetId,
    })
      .then((response) => {
        setComments(response.comments);
      })
      .catch(() => {
        setComments([]);
      });
  }, [commentsTarget]);

  useEffect(() => {
    let isCancelled = false;
    void api.getInteractionState({
      placeIds: feedPlaceIds,
      momentIds: feedMomentIds,
      profileIds: [user.id],
    })
      .then((response) => {
        if (isCancelled) return;
        setSavedProfilePlaceIds(response.bookmarkedPlaceIds);
        setVibedPlaceIds([...response.vibedPlaceIds, ...response.vibedMomentIds]);
        setPlaceVibinCounts({ ...response.placeVibinCounts, ...response.momentVibinCounts });
        setProfileCommentCounts({ ...response.placeCommentCounts, ...response.momentCommentCounts });
        setIsFollowing(response.followedUserIds.includes(user.id));
        setFollowersCount(response.profileFollowerCounts[user.id] ?? 0);
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [feedInteractionKey, user.id]);

  const renderInteractionFooter = (place: Place) => (
    <div className="space-y-3">
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
          onClick={() => setCommentsTarget({
            targetType: getPlaceInteractionTargetType(place),
            targetId: getPlaceInteractionTargetId(place),
            name: place.name,
            momentId: place.momentId,
          })}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
            commentsTarget?.targetType !== 'COLLECTION' && commentsTarget?.targetId === getPlaceInteractionTargetId(place)
              ? 'border-accent bg-accent text-dark'
              : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
          }`}
        >
          <MessageCircle size={14} />
          <span>
            {commentsTarget?.targetType !== 'COLLECTION' && commentsTarget?.targetId === getPlaceInteractionTargetId(place)
              ? comments.length || profileCommentCounts[getPlaceInteractionTargetId(place)] || 0
              : profileCommentCounts[getPlaceInteractionTargetId(place)] || 0}
          </span>
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
          <div className="text-xs font-black text-white/75">
            {commentsTarget?.targetType !== 'COLLECTION' && commentsTarget?.targetId === getPlaceInteractionTargetId(place)
              ? comments.length || profileCommentCounts[getPlaceInteractionTargetId(place)] || 0
              : profileCommentCounts[getPlaceInteractionTargetId(place)] || 0} comments
          </div>
          <button
            type="button"
            onClick={() => setCommentsTarget({
              targetType: getPlaceInteractionTargetType(place),
              targetId: getPlaceInteractionTargetId(place),
              name: place.name,
              momentId: place.momentId,
            })}
            className="text-xs font-black text-accent"
          >
            Write a comment
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {commentsTarget?.targetType !== 'COLLECTION' && commentsTarget?.targetId === getPlaceInteractionTargetId(place) && comments.length > 0 ? (
            comments.slice(0, 2).map((comment) => (
              <div key={comment.id} className="text-sm text-white/72">
                <span className="font-black text-white">@{comment.user}</span> {comment.body}
              </div>
            ))
          ) : (
            <div className="text-sm text-white/45">No comments yet.</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-white">
      <div className="px-4 pb-10 pt-3">
        <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
          <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
            <ArrowRight size={20} className="rotate-180" />
          </button>
          <button type="button" onClick={onShareProfile} className="rounded-full p-3 text-white transition hover:bg-white/8" aria-label="Share traveler profile">
            <Share2 size={18} />
          </button>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-black p-6 text-white shadow-2xl">
          <div className="flex items-start gap-3">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-[1.6rem] border border-white/10 bg-white">
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => handleAvatarImageError(event, user.displayName ?? user.username)}
                />
              </div>
            </motion.div>

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
              className={`w-full rounded-[1.25rem] px-5 py-4 text-sm font-black transition ${
                isFollowing ? 'border border-white/10 bg-white/8 text-white hover:bg-white/12' : 'bg-accent text-dark hover:brightness-105'
              }`}
            >
              {isFollowing ? 'Unfollow' : 'Follow'}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{uniqueBookmarkedPlaces.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">saved places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{diaryPlaces.length}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">visited places</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{momentCollections.length}</div>
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
                {feedItems.map((item, index) => {
                  const resolvedCollectionId = item.type === 'collection'
                    ? (item.collectionId ?? collectionIdByName[item.collectionName] ?? undefined)
                    : undefined;
                  const controls = item.type === 'collection'
                    ? {
                        vibed: resolvedCollectionId ? vibedCollectionIds.includes(resolvedCollectionId) : false,
                        vibinCount: resolvedCollectionId ? (collectionVibinCounts[resolvedCollectionId] ?? 0) : 0,
                        commentsCount: resolvedCollectionId
                          ? (
                              commentsTarget?.targetType === 'COLLECTION' && commentsTarget.targetId === resolvedCollectionId
                                ? comments.length || collectionCommentCounts[resolvedCollectionId] || 0
                                : collectionCommentCounts[resolvedCollectionId] || 0
                            )
                          : 0,
                        onToggleVibin: resolvedCollectionId
                          ? async () => {
                              const isActive = vibedCollectionIds.includes(resolvedCollectionId);
                              try {
                                const response = await api.toggleVibin({
                                  targetType: 'COLLECTION',
                                  targetId: resolvedCollectionId,
                                  receiverUserId: item.traveler.id,
                                });
                                setVibedCollectionIds((prev) => (
                                  isActive ? prev.filter((id) => id !== resolvedCollectionId) : [...prev, resolvedCollectionId]
                                ));
                                setCollectionVibinCounts((prev) => ({ ...prev, [resolvedCollectionId]: response.count }));
                                showProfileToast(response.active ? 'Sent vibin' : 'Removed vibin');
                              } catch {
                                showProfileToast('Could not update vibin right now');
                              }
                            }
                          : undefined,
                        onOpenComments: resolvedCollectionId
                          ? () => setCommentsTarget({
                              targetType: 'COLLECTION',
                              targetId: resolvedCollectionId,
                              name: item.collectionName,
                            })
                          : undefined,
                      }
                    : {
                        vibed: vibedPlaceIds.includes(getPlaceInteractionTargetId(item.place)),
                        vibinCount:
                          placeVibinCounts[getPlaceInteractionTargetId(item.place)]
                          ?? (vibedPlaceIds.includes(getPlaceInteractionTargetId(item.place)) ? 1 : 0),
                        commentsCount:
                          commentsTarget?.targetType !== 'COLLECTION' && commentsTarget?.targetId === getPlaceInteractionTargetId(item.place)
                            ? comments.length || profileCommentCounts[getPlaceInteractionTargetId(item.place)] || 0
                            : profileCommentCounts[getPlaceInteractionTargetId(item.place)] || 0,
                        onToggleVibin: async () => {
                          const targetId = getPlaceInteractionTargetId(item.place);
                          const isActive = vibedPlaceIds.includes(targetId);
                          try {
                            const response = await api.toggleVibin(getPlaceInteractionPayload(item.place));
                            setVibedPlaceIds((prev) => (
                              isActive ? prev.filter((id) => id !== targetId) : [...prev, targetId]
                            ));
                            setPlaceVibinCounts((prev) => ({ ...prev, [targetId]: response.count }));
                            showProfileToast(response.active ? 'Sent vibin' : 'Removed vibin');
                          } catch {
                            showProfileToast('Could not update vibin right now');
                          }
                        },
                        onOpenComments: () => setCommentsTarget({
                          targetType: getPlaceInteractionTargetType(item.place),
                          targetId: getPlaceInteractionTargetId(item.place),
                          name: item.place.name,
                          momentId: item.place.momentId,
                        }),
                      };
                  return (
                    <div key={`${item.type}-${index}-${item.activityDate}`}>
                      {renderFeedEntryCard(item, index, controls)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm font-medium text-white/55">
                No public activity yet.
              </div>
            )
          ) : activeTab === 'visited' ? (
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
                    {group.places.map((place) => (
                      <div key={`${group.key}-${place.id}`}>
                        {renderMomentEntryCard({
                          place,
                          contextNote: momentsFilter === 'city' ? `Visited on ${place.visitedDate ?? 'their trip'}` : `Visited in ${group.label}`,
                          matchScore: typeof place.similarityStat === 'number' ? Math.min(place.similarityStat, 98) : undefined,
                          footer: renderInteractionFooter(place),
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
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
          ) : (
            <div className="space-y-4">
              {momentCollections.length > 0 ? (
                momentCollections.map((collection) => (
                  <button
                    key={collection.label}
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

      <AnimatePresence>
        {commentsTarget ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentsTarget(null)}
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
              <div className="mt-4 text-center text-lg font-black text-white">Comments on {commentsTarget.name}</div>
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
                    if (!commentsTarget || !commentDraft.trim()) return;
                    try {
                      const response = await api.createComment({
                        targetType: commentsTarget.targetType,
                        targetId: commentsTarget.targetId,
                        body: commentDraft.trim(),
                        momentId: commentsTarget.targetType === 'COLLECTION' ? undefined : commentsTarget.momentId,
                      });
                      setComments((prev) => [response.comment, ...prev]);
                      if (commentsTarget.targetType === 'COLLECTION') {
                        setCollectionCommentCounts((prev) => ({
                          ...prev,
                          [commentsTarget.targetId]: response.count,
                        }));
                      } else {
                        setProfileCommentCounts((prev) => ({
                          ...prev,
                          [commentsTarget.targetId]: response.count,
                        }));
                      }
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
