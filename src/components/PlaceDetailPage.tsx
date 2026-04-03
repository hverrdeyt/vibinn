import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock3,
  MapPin,
  Share2,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import DetailActionBar from './DetailActionBar';

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

export interface PlaceDetailData {
  id: string;

  // Google Places API: structured place identity and factual business metadata.
  name: string;
  city: string;
  country: string;
  distanceFromUserKm?: number;
  address?: string;
  category: string;
  images: string[];
  media?: {
    type: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
  }[];
  rating?: number;
  priceLevel?: number;
  openingHours?: string[];
  mapsUrl?: string;

  // AI processing: editorialized tone, vibe classification, and personalized copy.
  hook: string;
  description?: string;
  vibeTags: string[];
  whyYoullLike: string[];
  bestTime?: string;
  attitudeLabel?: string;

  // Internal recommendation engine: signals that explain relevance for this user.
  matchScore?: number;
  similarityPercentage?: number;
  recommendationReason: string;

  // Social / behavioral context.
  similarTravelerCount?: number;
  travelerMoments?: {
    id: string;
    travelerUsername: string;
    travelerAvatar: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }[];
  fallbackTravelers?: {
    id: string;
    username: string;
    avatarUrl: string;
    matchScore?: number;
    recentLocation?: string;
  }[];

  // Related content for feed-style exploration.
  relatedPlaces?: {
    id: string;
    name: string;
    imageUrl: string;
  }[];
  mapsEmbedUrl?: string;
}

interface PlaceDetailPageProps {
  data: PlaceDetailData;
  isSaved?: boolean;
  isBeenThere?: boolean;
  isVibed?: boolean;
  locationPermission?: 'unknown' | 'granted' | 'denied' | 'unsupported';
  onBack?: () => void;
  onSave?: (place: PlaceDetailData) => void;
  onBeenThere?: (place: PlaceDetailData) => void;
  onShare?: (place: PlaceDetailData) => void;
  onVibe?: (place: PlaceDetailData) => void;
  onRequestLocation?: () => void;
  onSelectRelatedPlace?: (placeId: string) => void;
  onSelectFallbackTraveler?: (travelerId: string) => void;
  onExploreMoreLikeThis?: () => void;
  onExploreTravelers?: () => void;
}

const priceLevelMap: Record<number, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/82 shadow-sm">
      {children}
    </span>
  );
}

export default function PlaceDetailPage({
  data,
  isSaved = false,
  isBeenThere = false,
  isVibed = false,
  locationPermission = 'unknown',
  onBack,
  onSave,
  onBeenThere,
  onShare,
  onVibe,
  onRequestLocation,
  onSelectRelatedPlace,
  onSelectFallbackTraveler,
  onExploreMoreLikeThis,
  onExploreTravelers,
}: PlaceDetailPageProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const priceLabel = data.priceLevel ? priceLevelMap[data.priceLevel] : undefined;
  const visibleVibes = data.vibeTags.slice(0, 5);
  const mediaItems = (data.media?.length
    ? data.media
    : data.images.map((image) => ({ type: 'image' as const, url: image })))
    .slice()
    .sort((a, b) => Number(b.type === 'video') - Number(a.type === 'video'));
  const visibleReasons = data.whyYoullLike.slice(0, 4);
  const activeMedia = mediaItems[activeImageIndex] ?? mediaItems[0];
  const hasTravelerMoments = Boolean(data.travelerMoments?.length);

  return (
    <div className="min-h-screen bg-zinc-950 pb-32 text-white">
      <div className="sticky top-0 z-40 px-4 pt-6">
        {/* Sticky controls keep the page feeling app-like during long scrolling. */}
        <div className="flex items-center justify-between rounded-full bg-black/70 px-2 py-2 shadow-lg backdrop-blur-xl border border-white/10">
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
              onClick={() => onShare?.(data)}
              className="rounded-full p-3 text-white transition hover:bg-white/8"
              aria-label="Share place"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => onVibe?.(data)}
              className={`rounded-full p-3 transition ${
                isVibed ? 'bg-accent text-dark' : 'bg-white/8 text-white hover:bg-white/12'
              }`}
              aria-label="Vibe with this place"
            >
              <Zap size={18} />
            </button>
          </div>
        </div>
      </div>

      <section className="px-4 pt-4">
        <button
          type="button"
          onClick={() => setIsViewerOpen(true)}
          className="relative block w-full overflow-hidden rounded-[32px] shadow-[0_20px_50px_rgba(15,23,42,0.14)]"
        >
          {/* Google Places photos power the hero so the experience feels cinematic, not utilitarian. */}
          {activeMedia?.type === 'video' ? (
            <video
              src={activeMedia.url}
              poster={activeMedia.thumbnailUrl}
              autoPlay
              muted
              loop
              playsInline
              className="h-[29rem] w-full object-cover"
            />
          ) : (
            <img
              src={activeMedia?.url ?? data.images[0]}
              alt={data.name}
              className="h-[29rem] w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />

          <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
            {data.attitudeLabel ? (
              // AI can label the social identity of the place with phrases like "hidden gem".
              <span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-dark backdrop-blur-md">
                {data.attitudeLabel}
              </span>
            ) : (
              <span />
            )}

            {typeof data.matchScore === 'number' ? (
              // Internal match score is surfaced early because relevance matters more than raw facts here.
              <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark shadow-lg">
                {data.matchScore}% match
              </span>
            ) : null}
          </div>

          <div className="absolute inset-x-5 bottom-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/80">
                <MapPin size={14} />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">
                  {data.city}, {data.country}
                  {typeof data.distanceFromUserKm === 'number' ? ` • ${data.distanceFromUserKm} km away` : ''}
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-[-0.05em] text-white">
                {data.name}
              </h1>
            </div>
          </div>
        </button>

        {mediaItems.length > 1 ? (
          <div className="mt-4 flex justify-center gap-1.5 overflow-x-auto no-scrollbar">
            {mediaItems.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveImageIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  activeImageIndex === index ? 'w-8 bg-white' : 'w-2 bg-white/25'
                }`}
                aria-label={`View image ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      <main className="space-y-8 px-4 pt-6">
        {data.hook || data.description ? (
          <section className="space-y-3">
            {data.hook ? (
              <h2 className="text-[2rem] font-black leading-[0.95] tracking-[-0.06em] text-white">
                {data.hook}
              </h2>
            ) : null}
            {data.description ? (
              <p className="max-w-[34rem] text-base font-medium leading-relaxed text-white/68">
                {data.description}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[28px] bg-dark p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
          {/* This block intentionally stands out because the page's job is to explain relevance. */}
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-accent">
            <Sparkles size={14} />
            Why this is showing up for you
          </div>
          <p className="mt-3 text-lg font-black leading-tight tracking-[-0.03em]">
            {data.recommendationReason}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {typeof data.similarityPercentage === 'number' ? (
              <InfoChip>{data.similarityPercentage}% similar travelers visited</InfoChip>
            ) : null}
            {typeof data.similarTravelerCount === 'number' ? (
              <InfoChip>{data.similarTravelerCount}+ similar travelers saved this</InfoChip>
            ) : null}
            {typeof data.rating === 'number' ? (
              // Google Places rating is useful, but intentionally secondary to personalization.
              <InfoChip>
                <span className="inline-flex items-center gap-1">
              <Star size={12} className="fill-current text-accent" />
                  {data.rating.toFixed(1)}
                </span>
              </InfoChip>
            ) : null}
            {typeof data.distanceFromUserKm === 'number' ? (
              <InfoChip>{data.distanceFromUserKm} km away</InfoChip>
            ) : null}
            {data.bestTime ? <InfoChip>Best time: {data.bestTime}</InfoChip> : null}
          </div>
        </section>

        {hasTravelerMoments ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black tracking-[-0.03em] text-white">Travelers like you were here.</h3>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                their media
              </span>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 pb-2 no-scrollbar">
              <div className="flex gap-3">
                {data.travelerMoments.map((moment) => (
                  <div key={moment.id} className="w-40 shrink-0 overflow-hidden rounded-[24px] border border-white/10 bg-white/6">
                    <div className="relative h-48 overflow-hidden">
                      {moment.mediaType === 'video' ? (
                        <video src={moment.mediaUrl} className="h-full w-full object-cover" controls playsInline />
                      ) : (
                        <img src={moment.mediaUrl} alt={moment.caption} className="h-full w-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                        <div className="h-8 w-8 overflow-hidden rounded-full border border-white/15">
                          <img
                            src={moment.travelerAvatar}
                            alt={moment.travelerUsername}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(event) => handleAvatarImageError(event, moment.travelerUsername)}
                          />
                        </div>
                        <div className="truncate text-xs font-black text-white">@{moment.travelerUsername}</div>
                      </div>
                    </div>
                    <div className="p-3 text-xs font-semibold text-white/72">{moment.caption}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (data.fallbackTravelers?.length || onExploreTravelers || onExploreMoreLikeThis) ? (
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
              <Sparkles size={14} />
              Similar travelers
            </div>
            <h3 className="mt-3 text-lg font-black tracking-[-0.03em] text-white">
              We haven&apos;t matched traveler moments here yet.
            </h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/68">
              For now, this place is showing up because it fits your taste profile and the place signals we already trust.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {typeof data.rating === 'number' ? <InfoChip>{data.rating.toFixed(1)} rating</InfoChip> : null}
              {data.bestTime ? <InfoChip>Best at {data.bestTime}</InfoChip> : null}
              {visibleVibes.slice(0, 3).map((tag) => (
                <span
                  key={`fallback-${tag}`}
                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/82 shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>

            {data.fallbackTravelers?.length ? (
              <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-2 no-scrollbar">
                <div className="flex gap-3">
                  {data.fallbackTravelers.map((traveler) => (
                    <button
                      key={traveler.id}
                      type="button"
                      onClick={() => onSelectFallbackTraveler?.(traveler.id)}
                      className="w-40 shrink-0 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 p-3 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-white/10">
                          <img
                            src={traveler.avatarUrl}
                            alt={traveler.username}
                            className="h-full w-full object-cover"
                            onError={(event) => handleAvatarImageError(event, traveler.username)}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-white">@{traveler.username}</div>
                          {traveler.recentLocation ? (
                            <div className="truncate text-xs font-medium text-white/45">{traveler.recentLocation}</div>
                          ) : null}
                        </div>
                      </div>
                      {typeof traveler.matchScore === 'number' ? (
                        <div className="mt-3 inline-flex rounded-full bg-white/8 px-3 py-1 text-[11px] font-black text-white/80">
                          {traveler.matchScore}% match
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              {onExploreTravelers ? (
                <button
                  type="button"
                  onClick={onExploreTravelers}
                  className="rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/12"
                >
                  See travelers with this vibe
                </button>
              ) : null}
              {onExploreMoreLikeThis ? (
                <button
                  type="button"
                  onClick={onExploreMoreLikeThis}
                  className="rounded-full bg-dark px-4 py-3 text-sm font-black text-white transition hover:opacity-90"
                >
                  Explore similar places
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {visibleVibes.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-lg font-black tracking-[-0.03em] text-white">Vibe check.</h3>
            <div className="flex flex-wrap gap-2">
              {/* AI-generated vibe tags translate messy review data into quick identity signals. */}
              {visibleVibes.map((tag) => (
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

        {visibleReasons.length > 0 ? (
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-sm">
            <h3 className="text-lg font-black tracking-[-0.03em] text-white">Why you'll like this.</h3>
            <div className="mt-4 space-y-3">
              {/* AI produces these bullets so the user gets benefits framed in their language, not generic place copy. */}
              {visibleReasons.map((reason) => (
                <div key={reason} className="flex items-start gap-3">
                  <div className="mt-2 h-2.5 w-2.5 rounded-full bg-accent" />
                  <p className="text-sm font-semibold leading-relaxed text-white/72">{reason}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-lg font-black tracking-[-0.03em] text-white">Keep it practical.</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Category</div>
              <div className="mt-2 text-sm font-black text-white">{data.category}</div>
            </div>

            {priceLabel ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Price</div>
                <div className="mt-2 text-sm font-black text-white">{priceLabel}</div>
              </div>
            ) : null}
          </div>

          {(data.bestTime || data.address || data.openingHours?.length) ? (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/6 p-5">
              {data.bestTime ? (
                // Best time is usually inferred by AI from reviews, photos, and usage patterns.
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-accent/20 p-2 text-white">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Best time</div>
                    <div className="mt-1 text-sm font-semibold text-white">{data.bestTime}</div>
                  </div>
                </div>
              ) : null}

              {data.address ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-white/10 p-2 text-white">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Address</div>
                    <div className="mt-1 text-sm font-semibold leading-relaxed text-white">
                      {data.address}
                    </div>
                  </div>
                </div>
              ) : null}

              {data.mapsUrl ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-white/10 p-2 text-white">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Directions</div>
                    <a
                      href={data.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/12"
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              ) : null}

              {data.openingHours?.length ? (
                <div>
                  {/* Google Places opening hours stay tucked away to keep the page inspirational first. */}
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Opening hours</div>
                  <div className="mt-2 space-y-1">
                    {data.openingHours.slice(0, 7).map((item) => (
                      <div key={item} className="text-sm font-medium text-white/68">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {typeof data.distanceFromUserKm !== 'number' ? (
                <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Distance</div>
                  {locationPermission === 'denied' ? (
                    <p className="mt-2 text-sm font-medium leading-relaxed text-white/68">
                      Location access is off, so we can&apos;t estimate how far this place is from you.
                    </p>
                  ) : locationPermission === 'unsupported' ? (
                    <p className="mt-2 text-sm font-medium leading-relaxed text-white/68">
                      This browser doesn&apos;t support device location for distance estimates.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium leading-relaxed text-white/68">
                        Turn on your current location to see distance from where you are now.
                      </p>
                      {onRequestLocation ? (
                        <button
                          type="button"
                          onClick={onRequestLocation}
                          className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/12"
                        >
                          Use current location
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {data.mapsEmbedUrl ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black tracking-[-0.03em] text-white">Map.</h3>
              {data.mapsUrl ? (
                <a
                  href={data.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/12"
                >
                  Open in Maps
                </a>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6">
              <iframe
                src={data.mapsEmbedUrl}
                className="h-64 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${data.name} map`}
              />
            </div>
          </section>
        ) : null}

        {data.relatedPlaces?.length ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black tracking-[-0.03em] text-white">Keep the vibe going.</h3>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                related picks
              </span>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 pb-2 no-scrollbar">
              <div className="flex gap-3">
                {data.relatedPlaces.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => onSelectRelatedPlace?.(place.id)}
                    className="w-40 shrink-0 overflow-hidden rounded-[24px] border border-white/10 bg-white/6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <img src={place.imageUrl} alt={place.name} className="h-28 w-full object-cover" />
                    <div className="p-3">
                      <div className="text-sm font-black leading-tight tracking-[-0.03em] text-white">
                        {place.name}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {(onExploreMoreLikeThis || onExploreTravelers) ? (
          <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Keep exploring</div>
            <h3 className="mt-2 text-xl font-black leading-tight tracking-[-0.04em] text-white">
              Don&apos;t let the trail end at one save.
            </h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {onExploreMoreLikeThis ? (
                <button
                  type="button"
                  onClick={onExploreMoreLikeThis}
                  className="rounded-full bg-dark px-4 py-3 text-sm font-black text-white transition hover:opacity-90"
                >
                  See more places like this
                </button>
              ) : null}
              {onExploreTravelers ? (
                <button
                  type="button"
                  onClick={onExploreTravelers}
                  className="rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/12"
                >
                  See travelers with this vibe
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <DetailActionBar
        primaryActive={isSaved}
        primaryLabel="Save"
        primaryActiveLabel="Saved"
        primaryIcon={<Bookmark size={16} />}
        onPrimary={() => onSave?.(data)}
        secondaryLabel={isBeenThere ? 'Visited' : 'Been there'}
        secondaryIcon={<CheckCircle2 size={16} />}
        onSecondary={() => onBeenThere?.(data)}
      />

      {isViewerOpen ? (
        <div className="fixed inset-0 z-50 bg-black">
          <button
            type="button"
            onClick={() => setIsViewerOpen(false)}
            className="absolute right-4 top-6 z-10 rounded-full bg-black/60 p-3 text-white backdrop-blur-md"
            aria-label="Close full-screen media"
          >
            <X size={18} />
          </button>
          <div className="h-full overflow-y-auto snap-y snap-mandatory">
            {mediaItems.map((item, index) => (
              <div key={`${item.url}-${index}`} className="relative flex min-h-screen snap-start items-center justify-center bg-black px-3 py-20">
                {item.type === 'video' ? (
                  <video
                    src={item.url}
                    poster={item.thumbnailUrl}
                    autoPlay
                    muted
                    loop
                    controls
                    playsInline
                    className="max-h-full w-full rounded-[24px] object-contain"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={`${data.name} media ${index + 1}`}
                    className="max-h-full w-full rounded-[24px] object-contain"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
