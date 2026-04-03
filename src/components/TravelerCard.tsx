import { MapPinned, Sparkles } from 'lucide-react';

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

export interface TravelerCardData {
  id: string;

  // User data: direct identity and aggregate travel stats from the user's profile.
  username: string;
  avatarUrl: string;
  bio?: string;
  countriesCount: number;
  citiesCount: number;
  countryFlags: string[];
  placesCount?: number;
  vibinCount?: number;

  // AI processing: generated from travel history, saved places, and behavior patterns.
  badges: string[];
  descriptor: string;
  relevanceReason: string;

  // Internal recommendation engine: similarity score between current user and this traveler.
  matchScore: number;

  // Optional contextual signals for richer discovery cards.
  recentLocation?: string;
  previewPlaces?: {
    id: string;
    imageUrl: string;
  }[];

  // Social state from the app.
  isFollowing?: boolean;
}

interface TravelerCardProps {
  data: TravelerCardData;
  onClick?: (traveler: TravelerCardData) => void;
  className?: string;
}

function getMatchTone(score: number) {
  if (score >= 90) {
    return 'bg-accent text-dark';
  }

  if (score >= 80) {
    return 'bg-white text-dark';
  }

  return 'bg-white/12 text-white';
}

export default function TravelerCard({
  data,
  onClick,
  className = '',
}: TravelerCardProps) {
  const heroImage = data.previewPlaces?.[0]?.imageUrl ?? data.avatarUrl;
  const previewPlaces = data.previewPlaces?.slice(0, 4) ?? [];

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
          <div className="h-12 w-12 overflow-hidden rounded-full border border-white/10">
            <img
              src={data.avatarUrl}
              alt={data.username}
              className="h-full w-full object-cover"
              onError={(event) => handleAvatarImageError(event, data.username)}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black tracking-[-0.03em] text-white">@{data.username}</h3>
            {data.descriptor ? (
              <p className="truncate text-xs font-semibold text-white/70">{data.descriptor}</p>
            ) : null}
          </div>
        </div>
        <div className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-black ${getMatchTone(data.matchScore)}`}>
          {data.matchScore}%
        </div>
      </div>

      <div className="mt-4 relative -mx-4 overflow-x-auto px-4 pb-1 no-scrollbar">
        <div className="flex gap-3">
          {(previewPlaces.length > 0 ? previewPlaces : [{ id: data.id, imageUrl: heroImage }]).map((place, index) => (
            <div
              key={`${place.id}-${index}`}
              className={`relative shrink-0 overflow-hidden rounded-[22px] ${index === 0 ? 'w-[78%]' : 'w-28'} h-56`}
            >
              <img src={place.imageUrl} alt="" className="h-full w-full object-cover" aria-hidden="true" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 text-white/78">
          <div className="flex items-center gap-2 text-xs font-bold">
            <MapPinned size={14} />
            <span>{data.recentLocation ?? 'recent travel'}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 text-xs font-bold text-white/58">
        <span>{data.placesCount ?? 0} places</span>
        <span>{data.countriesCount} countries</span>
        <span>{data.vibinCount ?? 0} vibin</span>
      </div>

      {data.relevanceReason ? (
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/80">
          <Sparkles size={15} className="text-accent" />
          <span className="line-clamp-1">{data.relevanceReason}</span>
        </div>
      ) : null}

      {data.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.badges.slice(0, 2).map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold text-white/72"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
