import { Heart, MapPin, Sparkles } from 'lucide-react';

function getAvatarFallbackUrl() {
  return 'https://placehold.co/400x400/111111/D3FF48?text=V';
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }) {
  const fallbackUrl = getAvatarFallbackUrl();
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

export interface PlaceCardData {
  id: string;

  // Google Places API: canonical place identity and display content.
  name: string;
  city: string;
  country: string;
  category: string;
  imageUrl: string;
  rating?: number;
  priceLevel?: number;

  // AI processing: derived from reviews, photos, and category context.
  hook: string;
  vibeTags: string[];
  attitudeLabel?: string;

  // Internal recommendation system: generated from user taste and cohort behavior.
  matchScore?: number;
  similarityPercentage?: number;
  recommendationReason: string;

  // Optional context to help the card feel more editorial.
  bestTime?: string;

  // Internal social graph: followed travelers who have been here.
  visitedByFollowingAvatars?: string[];
  contextNote?: string;
}

interface PlaceCardProps {
  data: PlaceCardData;
  onClick?: (place: PlaceCardData) => void;
  className?: string;
  priority?: boolean;
}

const priceLevelMap: Record<number, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

export function PlaceCard({
  data,
  onClick,
  className = '',
  priority = false,
}: PlaceCardProps) {
  const vibeTags = data.vibeTags.slice(0, 2);
  const priceLabel = data.priceLevel ? priceLevelMap[data.priceLevel] : undefined;
  const locationLabel = [data.city, data.country].filter(Boolean).join(', ');
  const primaryMatchLabel = data.matchScore ? `${data.matchScore}% match` : undefined;
  const metaItems = [
    ...vibeTags,
    priceLabel,
    data.bestTime ? `best at ${data.bestTime}` : undefined,
    typeof data.rating === 'number' ? `${data.rating.toFixed(1)} rating` : undefined,
  ].filter(Boolean) as string[];
  const followedAvatars = (data.visitedByFollowingAvatars ?? []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onClick?.(data)}
      className={[
        'group w-full text-left',
        'overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]',
        'transition duration-300 ease-out active:scale-[0.985] hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(0,0,0,0.34)]',
        'focus:outline-none focus:ring-2 focus:ring-white/10',
        className,
      ].join(' ')}
      aria-label={`Open ${data.name}`}
    >
      <div className="relative overflow-hidden">
        {/* Google Places API photo becomes the visual anchor so the card feels editorial, not map-heavy. */}
        <img
          src={data.imageUrl}
          alt={data.name}
          loading={priority ? 'eager' : 'lazy'}
          className="h-72 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          {data.attitudeLabel ? (
            // AI processing can label the place with social language like "hidden gem".
            <span className="rounded-full bg-white/14 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white backdrop-blur-md">
              {data.attitudeLabel}
            </span>
          ) : (
            <span />
          )}

          {primaryMatchLabel ? (
            // Internal recommendation score matters more than raw ratings in discovery mode.
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-black text-dark shadow-lg">
              <Heart size={13} className="fill-current" />
              {primaryMatchLabel}
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-4 bottom-4">
          {/* AI-generated hook is the loudest line because it sells the vibe in a single scroll-stopping beat. */}
          <p className="truncate text-[1.35rem] font-black leading-tight tracking-[-0.04em] text-white">
            {data.hook}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-4">
        <div className="space-y-1">
          {/* Google Places API name/location stay secondary so the feed remains emotional first. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black tracking-[-0.03em] text-white">
                {data.name}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white/55">
                <MapPin size={14} />
                <span className="truncate">{locationLabel}</span>
              </div>
            </div>

            <span className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
              {data.category}
            </span>
          </div>
        </div>

        <div className="rounded-[20px] bg-white/6 px-4 py-3">
          {/* Recommendation is compressed into one fast-scanning line for list view clarity. */}
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
            <Sparkles size={13} />
            For your vibe
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold leading-snug text-white">
            {data.recommendationReason}
          </p>
        </div>

        {metaItems.length > 0 ? (
          <div className="truncate text-xs font-bold text-white/55">
            {/* Metadata is intentionally flattened to one line to keep the card compact across every screen. */}
            {metaItems.join(' • ')}
          </div>
        ) : null}

        {data.contextNote ? (
          <div className="truncate text-xs font-bold text-white/55">
            {data.contextNote}
          </div>
        ) : followedAvatars.length > 0 ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              {followedAvatars.map((avatar, index) => (
                <div
                  key={`${avatar}-${index}`}
                  className={`h-7 w-7 overflow-hidden rounded-full border-2 border-zinc-900 bg-white/10 ${
                    index === 0 ? '' : '-ml-2'
                  }`}
                >
                  <img
                    src={avatar}
                    alt=""
                    className="h-full w-full object-cover"
                    aria-hidden="true"
                    onError={handleAvatarImageError}
                  />
                </div>
              ))}
            </div>
            <div className="truncate text-xs font-bold text-white/55">
              visited by travelers you follow
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default PlaceCard;
