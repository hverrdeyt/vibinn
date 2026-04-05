import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ChevronDown, Share2, Sparkles, Zap } from 'lucide-react';
import { MOCK_USER } from '../mockData';

export default function LandingPage({
  onHeaderTryNow,
  onFloatingTryNow,
}: {
  onHeaderTryNow: () => void;
  onFloatingTryNow: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showFloatingCta, setShowFloatingCta] = useState(false);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const handleScroll = () => {
      setShowFloatingCta(node.scrollTop > window.innerHeight * 0.45);
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, []);

  const screenshotPlaceCards = [
    {
      name: 'Extra Dirty Cocktail Club',
      label: 'Underrated',
      score: 92,
      image: 'https://lh3.googleusercontent.com/places/ANXAkqFxXALNQct0KbHOq0F_kBOcgVRTuisVkqa8mSyXTTnm0sPR5xmIUaQQDE5cz7x_j4O9QdrcjriYD5CPD3Ocmr5B10qxbf4omvU=s4800-w1200',
    },
    {
      name: 'Christopher Columbus Waterfront Park',
      label: 'Green Reset',
      score: 88,
      image: 'https://lh3.googleusercontent.com/place-photos/AL8-SNFfRe4_u6SxVhMXMAVfufUrLe2IeITrBV2mtcExWnHW1IrGrZykvcx9ggpMlk9oqHsqfYyZoPl5hI70p_09KBUvKRsXQ9hNnAjfrGYVjkapW9gEDkFznFbiEyKtgtkd4Kr_wMa0q10y6fmcdIPVElZ2=s4800-w1078',
    },
    {
      name: 'Good Dye Young presents',
      label: 'This week',
      score: 84,
      image: 'https://s1.ticketm.net/dam/a/8e0/a85aee98-50e5-471f-9824-e197069578e0_SOURCE',
    },
  ];

  const renderDashboardMasonryMock = (variant: 'hero' | 'ai') => (
    <div className="relative mx-auto w-full max-w-[18.8rem] rounded-[2.3rem] border border-white/10 bg-black/82 p-3 shadow-[0_25px_80px_rgba(0,0,0,0.5)]">
      <div className="rounded-[1.9rem] bg-zinc-950 p-2.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/72">
            <span>Boston</span>
            <ChevronDown size={12} />
          </div>
          <div className="rounded-full bg-white/8 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/45">
            for you
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            {[screenshotPlaceCards[0], screenshotPlaceCards[2]].map((card, index) => (
              <div key={card.name} className={`group relative overflow-hidden rounded-[1.45rem] bg-zinc-900 shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${index === 0 ? 'h-[12rem]' : 'h-[14rem]'}`}>
                <img src={card.image} alt={card.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
                <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-accent backdrop-blur-md">
                  {card.score}%
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="inline-flex whitespace-nowrap rounded-full bg-white/12 px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/88 backdrop-blur-md shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
                    {card.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className={`flex flex-col ${variant === 'hero' ? 'pt-5' : 'pt-3'} gap-2`}>
            <div className="group relative h-[16.5rem] overflow-hidden rounded-[1.45rem] bg-zinc-900 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
              <img src={screenshotPlaceCards[1].image} alt={screenshotPlaceCards[1].name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
              <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-accent backdrop-blur-md">
                {screenshotPlaceCards[1].score}%
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="inline-flex whitespace-nowrap rounded-full bg-white/12 px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/88 backdrop-blur-md shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
                  {screenshotPlaceCards[1].label}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPlaceDetailMock = () => (
    <div className="relative mx-auto w-full max-w-[18.8rem] rounded-[2.3rem] border border-white/10 bg-black/82 p-3 shadow-[0_25px_80px_rgba(0,0,0,0.5)]">
      <div className="overflow-hidden rounded-[1.9rem] bg-zinc-950">
        <div className="p-3">
          <div className="flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2">
            <button className="rounded-full p-2 text-white/80">
              <ArrowRight size={16} className="rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <button className="rounded-full bg-white/8 p-2 text-white/75">
                <Share2 size={14} />
              </button>
              <button className="rounded-full bg-accent p-2 text-black">
                <Zap size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="px-3">
          <div className="relative overflow-hidden rounded-[1.7rem]">
            <img
              src="https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1200&q=80"
              alt="Anime Zakka"
              className="h-[15rem] w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex items-start justify-between">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-950">
                Hidden gem
              </span>
              <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950">
                96% match
              </span>
            </div>
            <div className="absolute inset-x-4 bottom-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Boston, USA</div>
              <h3 className="mt-1 text-[1.8rem] font-black leading-[0.95] tracking-[-0.06em] text-white">Anime Zakka</h3>
            </div>
          </div>
        </div>
        <div className="space-y-4 px-4 pb-4 pt-5">
          <div>
            <h4 className="text-[1.55rem] font-black leading-[0.95] tracking-[-0.06em] text-white">
              Tiny shelves. Big collector energy.
            </h4>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/65">
              Figures, stationery, and small things you did not plan to love this much.
            </p>
          </div>
          <div className="rounded-[1.5rem] bg-white/6 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
              <Sparkles size={12} />
              Why this is showing up for you
            </div>
            <p className="mt-2 text-sm font-black leading-snug text-white">
              It matches the market-and-boutique side of your travel taste.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['gift shop', 'collector stop', 'tokyo-coded'].map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/78">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTravelerMomentMock = () => (
    <div className="relative mx-auto w-full max-w-[18.8rem] rounded-[2.3rem] border border-white/10 bg-black/82 p-3 shadow-[0_25px_80px_rgba(0,0,0,0.5)]">
      <div className="overflow-hidden rounded-[1.9rem] bg-zinc-950">
        <div className="p-3">
          <div className="flex items-center gap-3">
            <img src={MOCK_USER.avatar} alt={MOCK_USER.username} className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" />
            <div>
              <div className="text-sm font-black text-white">@{MOCK_USER.username}</div>
              <div className="text-[11px] font-medium text-white/45">posted a moment in Boston</div>
            </div>
          </div>
        </div>
        <div className="relative">
          <img
            src="https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80"
            alt="Traveler moment"
            className="h-[18rem] w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/10" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <div className="max-w-[12rem] rounded-[1.1rem] bg-black/55 px-3 py-3 backdrop-blur-md">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">Moment</div>
              <p className="mt-1 text-sm font-black leading-snug text-white">Gracenote is still one of the best spots to lock in with a coffee and get work done.</p>
            </div>
            <div className="landing-vibin-pop relative">
              <div className="landing-vibin-glow absolute inset-0 rounded-full bg-accent/35 blur-xl" />
              <div className="relative flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[0_18px_40px_rgba(211,255,72,0.28)]">
                <Zap size={15} strokeWidth={2.8} />
                <span>Vibin +1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const featureSections: Array<{ eyebrow: string; title: ReactNode; body: string; accent: string; screenshot: ReactNode }> = [
    {
      eyebrow: 'Find hidden gems',
      title: <>Find the place you were <span className="text-accent">supposed</span> to find.</>,
      body: 'Less tourist gravity. More real finds.',
      accent: 'from-lime-300/22 via-yellow-200/8 to-transparent',
      screenshot: renderPlaceDetailMock(),
    },
    {
      eyebrow: 'AI personalization',
      title: <>AI reads the vibe. <span className="text-accent">Then</span> it moves the feed.</>,
      body: 'Your saves, skips, and mood become the ranking system.',
      accent: 'from-sky-300/24 via-cyan-300/10 to-transparent',
      screenshot: renderDashboardMasonryMock('ai'),
    },
    {
      eyebrow: 'Get inspired',
      title: <>Meet the other travelers like <span className="text-accent">you</span>.</>,
      body: 'Taste overlap turns discovery into connection.',
      accent: 'from-orange-300/22 via-rose-300/10 to-transparent',
      screenshot: renderTravelerMomentMock(),
    },
  ];

  return (
    <div className="relative h-[100svh] overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-64 bg-[radial-gradient(circle_at_top,_rgba(210,255,92,0.16),_transparent_62%)]" />
      <div className="pointer-events-none absolute left-[-6rem] top-[18%] h-40 w-40 rounded-full bg-pink-400/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-5rem] top-[42%] h-44 w-44 rounded-full bg-sky-300/10 blur-3xl" />
      <div ref={scrollContainerRef} className="h-[100svh] snap-y snap-mandatory overflow-y-auto scroll-smooth">
        <section className="safe-top-pad relative flex min-h-[100svh] snap-start flex-col justify-between overflow-hidden px-6 pb-24 pt-8">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-accent">Vibinn</div>
            <button type="button" onClick={onHeaderTryNow} className="rounded-full bg-accent px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-black transition hover:brightness-105">
              Try now
            </button>
          </div>

          <div className="mx-auto grid w-full max-w-6xl gap-10 pb-10 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                Find your travel vibe
              </div>
              <h1 className="mt-6 max-w-3xl text-[2.9rem] font-black leading-[0.92] tracking-tighter text-white sm:text-[3.5rem] md:text-[4.3rem]">
                Find your next
                <span className="text-accent"> hidden gem</span>
                <br />
                before everyone else does.
              </h1>
              <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/68 sm:text-lg">
                AI-powered discovery for places, events, and travelers that actually match your vibe.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[21rem]">
              <div className="absolute -left-8 top-8 h-24 w-24 rounded-full bg-accent/12 blur-3xl" />
              <div className="absolute -right-10 bottom-10 h-28 w-28 rounded-full bg-fuchsia-300/12 blur-3xl" />
              {renderDashboardMasonryMock('hero')}
            </div>
          </div>
        </section>

        {featureSections.map((section) => (
          <section key={section.eyebrow} className="relative flex min-h-[100svh] snap-start items-center overflow-hidden px-6 py-16">
            <div className={`absolute inset-0 bg-gradient-to-b ${section.accent}`} />
            <div className="relative mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95, rotate: -1.5 }}
                whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                viewport={{ once: false, amount: 0.45 }}
                transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
                className="order-2 lg:order-1"
              >
                {section.screenshot}
              </motion.div>
              <div className="order-1 lg:order-2">
                <div className="inline-flex rounded-full border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/78">
                  {section.eyebrow}
                </div>
                <h2 className="mt-5 max-w-2xl text-4xl font-black leading-[0.96] tracking-tighter text-white sm:text-5xl">
                  {section.title}
                </h2>
                <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-white/68 sm:text-lg">
                  {section.body}
                </p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className={`pointer-events-none safe-bottom-pad fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 transition-opacity duration-200 ${showFloatingCta ? 'opacity-100' : 'opacity-0'}`}>
        <div className="pointer-events-auto flex w-full max-w-sm items-center justify-between rounded-full border border-white/10 bg-black/82 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Invite-only beta</div>
            <div className="truncate text-sm font-black text-white">Try Vibinn now</div>
          </div>
          <button type="button" onClick={onFloatingTryNow} className="rounded-full bg-accent px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-black transition hover:brightness-105">
            Try now
          </button>
        </div>
      </div>
    </div>
  );
}
