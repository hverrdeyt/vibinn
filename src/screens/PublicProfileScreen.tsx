import { type ReactNode } from 'react';
import { type User } from '../types';

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
  onOpenApp,
  displayFlags,
  publicMomentsCount,
  renderMomentCard,
}: {
  user: User;
  onOpenApp: () => void;
  displayFlags: string[];
  publicMomentsCount: number;
  renderMomentCard: (place: User['travelHistory'][number]['places'][number], index: number) => ReactNode;
}) {
  const publicMoments = user.travelHistory.flatMap((item) => item.places ?? []);
  const travelerSummary = `${publicMomentsCount} places • ${user.stats.cities} cities • ${user.stats.countries} countries`;

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
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tighter">{user.displayName ?? user.username}</h1>
                <p className="text-sm font-black text-white/60">@{user.username}</p>
                <p className="mt-1 font-medium leading-tight text-white/65">{user.bio}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{travelerSummary}</p>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {displayFlags.map((flag, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-lg shadow-sm">
                  {flag}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {user.badges?.slice(0, 3).map((badge) => (
                <span key={badge} className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {user.descriptor ? (
            <div className="mt-6 rounded-[1.5rem] border border-accent/25 bg-accent/10 px-4 py-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent/80">
                Travel taste
              </div>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-accent">
                {user.descriptor}
              </p>
            </div>
          ) : null}

          <div className="mt-6 rounded-[2rem] bg-white/8 p-4 backdrop-blur-sm">
            <p className="text-sm font-semibold leading-relaxed text-white/80">
              A public snapshot of this traveler&apos;s taste graph, moments, and saved places.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{publicMomentsCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">moments</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{user.stats.cities}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">cities</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-3">
              <div className="text-lg font-black text-white">{user.stats.countries}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">countries</div>
            </div>
          </div>
        </div>

        <div className="mb-8 mt-8">
          <section className="mb-8">
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
              Travel identity
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {user.travelHistory.map((item) => (
                <div
                  key={item.country}
                  className="min-w-56 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left"
                >
                  <div className="text-base font-black text-white">{item.country}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.cities.map((city) => (
                      <span key={city} className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/72">
                        {city}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {publicMoments.length > 0 ? (
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black tracking-tighter text-white">Recent moments</h2>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                  Public highlights
                </span>
              </div>
              <div className="space-y-5">
                {publicMoments.slice(0, 6).map((place, index) => (
                  <div key={`${place.id}-${place.momentId ?? index}`}>
                    {renderMomentCard(place, index)}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black p-6 text-center">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-accent/12 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/12 blur-3xl" />
            <div className="relative z-10">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
                See the full graph
              </div>
              <h3 className="mt-2 text-2xl font-black tracking-tighter text-white">
                Open Vibinn to go deeper.
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
                Explore places, moments, and compatibility layers inside the app.
              </p>
              <button
                type="button"
                onClick={onOpenApp}
                className="mt-5 rounded-[1.25rem] bg-accent px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:brightness-105"
              >
                Open the app
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
