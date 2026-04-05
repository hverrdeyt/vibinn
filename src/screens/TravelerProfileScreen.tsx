import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Bookmark, MessageCircle, PencilLine, Share2, Zap } from 'lucide-react';
import PlaceCard from '../components/PlaceCard';
import { api } from '../lib/api';
import { type Place, type User } from '../types';

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

export default function TravelerProfileScreen({
  user,
  displayFlags,
  onBack,
  onSavePlace,
  onSelectPlace,
  onOpenCollection,
  onShareProfile,
  renderMomentEntryCard,
  renderSavedPlaceCard,
}: {
  user: User;
  displayFlags: string[];
  onBack: () => void;
  onSavePlace: (place: Place, nextActive: boolean) => Promise<boolean>;
  onSelectPlace: (p: Place) => void;
  onOpenCollection: (collection: { label: string; places: Place[] }) => void;
  onShareProfile: () => void;
  renderMomentEntryCard: (args: { place: Place; contextNote: string; matchScore?: number; footer: ReactNode }) => ReactNode;
  renderSavedPlaceCard: (place: Place, index: number) => ReactNode;
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
  const [profileCommentCounts, setProfileCommentCounts] = useState<Record<string, number>>({});
  const [profileVibinCount, setProfileVibinCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [comments, setComments] = useState<Array<{ id: string; user: string; body: string; createdAt: string }>>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [profileToast, setProfileToast] = useState<string | null>(null);

  const diaryPlaces = user.travelHistory.flatMap((history) => history.places || []);
  const matchSummary = user.matchScore ? `${user.matchScore}% match` : '';
  const travelerSummary = `${diaryPlaces.length} places • ${user.stats.cities} cities • ${user.stats.countries} countries`;
  const momentCollections: Array<{ label: string; places: Place[] }> = [];
  const cityCollections = user.travelHistory.filter((history) => (history.places ?? []).length > 0);
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
        setProfileCommentCounts({ ...response.placeCommentCounts, ...response.momentCommentCounts });
        setIsFollowing(response.followedUserIds.includes(user.id));
        setProfileVibed(response.vibedProfileIds.includes(user.id));
        setFollowersCount(response.profileFollowerCounts[user.id] ?? 0);
        setProfileVibinCount(response.profileVibinCounts[user.id] ?? 0);
      })
      .catch(() => undefined);
  }, [diaryPlaces, user.id]);

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
          onClick={() => setCommentsPlace(place)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
            commentsPlace?.id === place.id
              ? 'border-accent bg-accent text-dark'
              : 'border-white/10 bg-white/8 text-white hover:bg-white/12'
          }`}
        >
          <MessageCircle size={14} />
          <span>
            {commentsPlace?.id === place.id
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
            {commentsPlace?.id === place.id
              ? comments.length || profileCommentCounts[getPlaceInteractionTargetId(place)] || 0
              : profileCommentCounts[getPlaceInteractionTargetId(place)] || 0} comments
          </div>
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tighter">{user.username}</h1>
                  <p className="text-sm font-black text-white/60">@{user.username}</p>
                  <p className="mt-1 font-medium leading-tight text-white/65">{user.bio}</p>
                  {user.descriptor ? (
                    <div className="mt-3 rounded-[1.25rem] border border-accent/25 bg-accent/10 px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent/80">Travel taste</div>
                      <p className="mt-1 max-w-[22rem] text-sm font-semibold leading-relaxed text-accent">{user.descriptor}</p>
                    </div>
                  ) : null}
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

          {!user.descriptor && matchSummary ? (
            <div className="mt-6 rounded-[2rem] bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold leading-relaxed text-white/80">{matchSummary}</p>
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
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Collections</div>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {momentCollections.map((collection) => (
                  <button
                    key={collection.label}
                    onClick={() => onOpenCollection(collection)}
                    className="min-w-44 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left"
                  >
                    <div className="text-base font-black text-white">{collection.label}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/35">{collection.places.length} places</div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mb-8 inline-flex rounded-full border border-white/10 bg-white/6 p-1">
            {['moments', 'saved', 'vibe'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as 'moments' | 'saved' | 'vibe')}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === tab ? 'bg-white text-black' : 'text-white/65'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center justify-between">
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
              {diaryPlaces.map((place, i) => (
                <div key={place.id + i} className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  {renderSavedPlaceCard(place, i)}
                  <div className="space-y-3 px-4 pb-4 pt-3">{renderInteractionFooter(place)}</div>
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
