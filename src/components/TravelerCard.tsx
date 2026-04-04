import { useRef, useState } from 'react';
import { Globe, MapPlus, Sparkles, Zap } from 'lucide-react';

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

function isRenderableAssetUrl(url?: string | null) {
  if (!url) return false;
  return /^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:');
}

export interface TravelerCardData {
  id: string;
  displayName?: string;
  username: string;
  avatarUrl: string;
  bio?: string;
  countriesCount: number;
  citiesCount: number;
  countryFlags: string[];
  placesCount?: number;
  vibinCount?: number;
  badges: string[];
  descriptor: string;
  relevanceReason: string;
  matchScore: number;
  recentLocation?: string;
  recentPlaceName?: string;
  previewPlaces?: {
    id: string;
    imageUrl: string;
    label?: string;
  }[];
  isFollowing?: boolean;
}

interface TravelerCardProps {
  data: TravelerCardData;
  onClick?: (traveler: TravelerCardData) => void;
  onToggleFollow?: (traveler: TravelerCardData) => void;
  className?: string;
}

function getMatchTone(score: number) {
  if (score >= 90) return 'bg-accent text-dark';
  if (score >= 80) return 'bg-white text-dark';
  return 'bg-white/12 text-white';
}

export default function TravelerCard({
  data,
  onClick,
  onToggleFollow,
  className = '',
}: TravelerCardProps) {
  const media = (data.previewPlaces ?? []).filter((item) => isRenderableAssetUrl(item.imageUrl)).slice(0, 5);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = () => {
    const container = scrollerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll('[data-traveler-slide="true"]')) as HTMLElement[];
    if (items.length === 0) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let nextIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.clientWidth / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextIndex = index;
      }
    });
    setActiveIndex(nextIndex);
  };

  return (
    <button
      type="button"
      onClick={() => onClick?.(data)}
      className={[
        'group w-full overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 p-4 text-left text-white',
        'shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(0,0,0,0.34)] active:scale-[0.985]',
        'focus:outline-none focus:ring-2 focus:ring-white/10',
        className,
      ].join(' ')}
      aria-label={`Open ${data.username}'s traveler profile`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-full border border-white/10">
            <img
              src={data.avatarUrl}
              alt={data.username}
              className="h-full w-full object-cover"
              onError={(event) => handleAvatarImageError(event, data.username)}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-black tracking-[-0.03em] text-white">
              {data.displayName || data.username}
            </div>
            <div className="truncate text-xs font-bold text-white/55">@{data.username}</div>
            {data.descriptor ? (
              <div className="mt-1 text-xs font-semibold text-white/78">{data.descriptor}</div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-black ${getMatchTone(data.matchScore)}`}>
            {data.matchScore}%
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow?.(data);
            }}
            className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
              data.isFollowing ? 'border border-white/10 bg-white/8 text-white hover:bg-white/12' : 'bg-accent text-dark hover:brightness-105'
            }`}
          >
            {data.isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>

      {data.relevanceReason ? (
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/76">
          <Sparkles size={14} className="shrink-0 text-accent" />
          <span className="line-clamp-2">{data.relevanceReason}</span>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/8 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-white/62">
          <span className="inline-flex items-center gap-1.5">
            <MapPlus size={13} />
            <span>{data.placesCount ?? 0} places</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe size={13} />
            <span>{data.countriesCount} countries</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap size={13} className="text-accent" />
            <span>{data.vibinCount ?? 0} vibin</span>
          </span>
        </div>
        {data.recentPlaceName || data.recentLocation ? (
          <div className="mt-3 text-sm font-semibold leading-relaxed text-white/72">
            <div>
              Last visited: {[data.recentPlaceName, data.recentLocation].filter(Boolean).join(', ')}
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            {data.countryFlags.slice(0, 6).map((flag) => (
              <span
                key={flag}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 px-2 text-sm"
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {media.length > 0 ? (
        <div className="mt-4 border-t border-white/8 pt-4">
          <div className="overflow-x-auto snap-x snap-mandatory no-scrollbar" ref={scrollerRef} onScroll={updateActiveIndex}>
            <div className="flex gap-0">
              {media.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  data-traveler-slide="true"
                  className="w-full shrink-0 snap-start snap-always overflow-hidden bg-white/6"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.label ?? `${data.username} recent media ${index + 1}`}
                    className="block max-h-[22rem] min-h-[12rem] w-full bg-black object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
          {media.length > 1 ? (
            <div className="mt-2 flex items-center gap-1">
              {media.map((item, index) => (
                <div
                  key={`${item.id}-progress-${index}`}
                  className={index === activeIndex ? 'h-0.5 w-4 rounded-full bg-white' : 'h-1.5 w-1.5 rounded-full bg-white/22'}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
