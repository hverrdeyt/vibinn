import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

const APP_STORE_URL = 'https://apps.apple.com/us/app/vibinn/id6762061149';
const ASSET_BASE = '/landing-assets/Floating asset';

type LandingPageProps = {
  onHeaderTryNow: () => void;
  onFloatingTryNow: () => void;
  analyticsContext?: Record<string, unknown>;
};

type StickerConfig = {
  src: string;
  alt: string;
  left: string;
  top: string;
  width: string;
  rotate?: number;
  floatDuration?: number;
  floatDistance?: number;
  driftX?: number;
  driftY?: number;
  zIndex?: number;
};

type SectionProps = {
  className?: string;
  children: React.ReactNode;
};

type CTAButtonProps = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
};

type MoodPillProps = {
  label: string;
  top: string;
  left: string;
  rotate?: number;
  dark?: boolean;
};

type RecommendationCardProps = {
  image: string;
  name: string;
  distance: string;
  vibe: string;
};

type FeedCardProps = {
  image: string;
  user: string;
  place: string;
  review: string;
  time: string;
};

const sectionOneStickers: StickerConfig[] = [
  {
    src: `${ASSET_BASE}/Untitled-11.png`,
    alt: 'Friends hanging out',
    left: '-4%',
    top: '8%',
    width: '36%',
    rotate: -9,
    floatDuration: 7.2,
    floatDistance: 18,
    driftX: -56,
    driftY: 240,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-14.png`,
    alt: 'Coffee storefront',
    left: '62%',
    top: '10%',
    width: '32%',
    rotate: 7,
    floatDuration: 8,
    floatDistance: 14,
    driftX: 52,
    driftY: 220,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-2.png`,
    alt: 'Iced latte sticker',
    left: '8%',
    top: '31%',
    width: '23%',
    rotate: -12,
    floatDuration: 6.6,
    floatDistance: 20,
    driftX: -70,
    driftY: 260,
    zIndex: 4,
  },
  {
    src: `${ASSET_BASE}/Untitled-4.png`,
    alt: 'Cafe interior sticker',
    left: '70%',
    top: '34%',
    width: '28%',
    rotate: -6,
    floatDuration: 7.6,
    floatDistance: 16,
    driftX: 68,
    driftY: 210,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-18.png`,
    alt: 'Cheesecake sticker',
    left: '2%',
    top: '66%',
    width: '18%',
    rotate: -8,
    floatDuration: 5.8,
    floatDistance: 12,
    driftX: -24,
    driftY: 110,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-1.png`,
    alt: 'Latte sticker',
    left: '75%',
    top: '70%',
    width: '19%',
    rotate: 8,
    floatDuration: 7,
    floatDistance: 10,
    driftX: 34,
    driftY: 120,
    zIndex: 2,
  },
];

const sectionFourStickers: StickerConfig[] = [
  {
    src: `${ASSET_BASE}/Untitled-23.png`,
    alt: 'Latte art',
    left: '6%',
    top: '12%',
    width: '20%',
    rotate: -6,
    floatDuration: 6.6,
    floatDistance: 12,
    zIndex: 1,
  },
  {
    src: `${ASSET_BASE}/Untitled-21.png`,
    alt: 'Cafe table',
    left: '72%',
    top: '16%',
    width: '22%',
    rotate: 7,
    floatDuration: 7.4,
    floatDistance: 16,
    zIndex: 1,
  },
];

const moodCompanions = ['Alone', 'Friends', 'Date', 'Work'];
const moodFeels = ['Chill', 'Quiet', 'Social', 'Lowkey'];

export default function LandingPage({
  onHeaderTryNow,
  onFloatingTryNow,
  analyticsContext,
}: LandingPageProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const analyticsContextRef = useRef<Record<string, unknown> | undefined>(analyticsContext);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(1);

  useEffect(() => {
    analyticsContextRef.current = analyticsContext;
  }, [analyticsContext]);

  useEffect(() => {
    trackEvent('Visit landing page', analyticsContextRef.current);
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportHeight(window.innerHeight || 1);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const handleScroll = () => setScrollTop(node.scrollTop);
    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const tracked = new Set<number>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number((entry.target as HTMLElement).dataset.sectionIndex ?? '-1');
        if (!entry.isIntersecting || tracked.has(index)) return;
        tracked.add(index);
        trackEvent(`Landing section ${index + 1} viewed`, analyticsContextRef.current);
      });
    }, {
      root: node,
      threshold: 0.64,
    });

    sectionRefs.current.forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  const sectionProgress = (index: number) => {
    const start = index * viewportHeight;
    return clamp((scrollTop - start) / viewportHeight, 0, 1);
  };

  const chaosProgress = sectionProgress(0);
  const moodProgress = sectionProgress(1);
  const clarityProgress = sectionProgress(2);

  const handleCta = (source: 'header' | 'section_3' | 'section_4') => {
    trackEvent('Landing CTA tapped', {
      source,
      ...(analyticsContextRef.current ?? {}),
    });
    if (source === 'header') {
      onHeaderTryNow();
    } else {
      onFloatingTryNow();
    }
    if (typeof window !== 'undefined') {
      window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
    }
  };

  const recommendationCards = useMemo<RecommendationCardProps[]>(() => [
    {
      image: `${ASSET_BASE}/Untitled-14.png`,
      name: 'Coffee & People',
      distance: '6 mins away',
      vibe: 'lowkey warm',
    },
    {
      image: `${ASSET_BASE}/Untitled-21.png`,
      name: 'Window Table',
      distance: '8 mins away',
      vibe: 'quiet soft light',
    },
    {
      image: `${ASSET_BASE}/Untitled-4.png`,
      name: 'Or This Spot',
      distance: '11 mins away',
      vibe: 'date easy yes',
    },
  ], []);

  const feedCards = useMemo<FeedCardProps[]>(() => [
    {
      image: `${ASSET_BASE}/Untitled-23.png`,
      user: 'Aulia',
      place: 'Blank Street',
      review: 'quiet soft light',
      time: '2h ago',
    },
    {
      image: `${ASSET_BASE}/Untitled-18.png`,
      user: 'Nadia',
      place: 'Coffee & People',
      review: 'sweet slow reset',
      time: '4h ago',
    },
    {
      image: `${ASSET_BASE}/Untitled-11.png`,
      user: 'Raka',
      place: 'Back Bay Table',
      review: 'friends no notes',
      time: '6h ago',
    },
  ], []);

  return (
    <div
      ref={scrollContainerRef}
      className="landing-snap-shell relative h-[100svh] overflow-y-auto overflow-x-hidden bg-[#D3FF48] text-black"
    >
      <Header onCta={() => handleCta('header')} />

      <Section
        className="bg-[#D3FF48]"
        refSetter={(node) => { sectionRefs.current[0] = node; }}
        index={0}
      >
        <div className="absolute inset-0 overflow-hidden">
          {sectionOneStickers.map((sticker, index) => (
            <Sticker
              key={sticker.src}
              sticker={sticker}
              sectionProgress={chaosProgress}
              intensity={1}
              delay={index * 0.12}
            />
          ))}
        </div>

        <motion.div
          className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-end px-6 pb-28 pt-28 text-center sm:px-10"
          style={{
            opacity: 1 - chaosProgress * 0.12,
            transform: `translateY(${chaosProgress * -18}px)`,
          }}
        >
          <span className="mb-4 inline-flex rotate-[-4deg] rounded-full border-2 border-black/85 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0_#000]">
            too many tabs open
          </span>
          <h1 className="max-w-[11ch] text-balance text-[3rem] font-black leading-[0.88] tracking-[-0.09em] text-black sm:text-[4.8rem]">
            Overthinking where to go?
          </h1>
          <p className="mt-4 text-lg font-semibold text-black/72 sm:text-2xl">
            Same.
          </p>
          <motion.div
            className="mt-8 flex items-center gap-2 rounded-full bg-black px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#D3FF48]"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span>Scroll</span>
            <ArrowRight size={12} className="rotate-90" />
          </motion.div>
        </motion.div>
      </Section>

      <Section
        className="bg-black text-white"
        refSetter={(node) => { sectionRefs.current[1] = node; }}
        index={1}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(211,255,72,0.2),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.12),_transparent_35%)]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-6 pb-16 pt-24 sm:px-10">
          <div className="text-center">
            <span className="inline-flex rounded-full border border-white/14 bg-white/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D3FF48]">
              mood first
            </span>
            <h2 className="mt-5 text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.08em] sm:text-[4.3rem]">
              Tell us the vibe.
            </h2>
            <p className="mt-3 text-lg font-semibold text-white/70 sm:text-2xl">
              Not the place.
            </p>
          </div>

          <div className="relative mt-12 h-[26rem] w-full max-w-4xl">
            {moodCompanions.map((label, index) => (
              <MoodPill
                key={label}
                label={label}
                top={`${12 + index * 18}%`}
                left={`${6 + (index % 2) * 10}%`}
                rotate={index % 2 === 0 ? -8 : 7}
              />
            ))}
            {moodFeels.map((label, index) => (
              <MoodPill
                key={label}
                label={label}
                top={`${15 + index * 17}%`}
                left={`${60 - (index % 2) * 8}%`}
                rotate={index % 2 === 0 ? 8 : -6}
                dark
              />
            ))}

            <motion.div
              className="absolute left-1/2 top-1/2 w-[16rem] -translate-x-1/2 -translate-y-1/2"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: [0, -8, 0],
              }}
              transition={{
                opacity: { duration: 0.5, ease: 'easeOut', delay: 0.18 },
                scale: { duration: 0.5, ease: 'easeOut', delay: 0.18 },
                y: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
              }}
              style={{
                transform: `translate(-50%, calc(-50% - ${moodProgress * 8}px))`,
              }}
            >
              <PhoneMockup className="rotate-[-4deg]">
                <div className="space-y-3 rounded-[1.6rem] bg-[#131313] p-4 text-left">
                  <div className="inline-flex rounded-full bg-[#D3FF48] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black">
                    vibinn
                  </div>
                  <div className="text-2xl font-black leading-[0.95] tracking-[-0.06em] text-white">
                    Alone
                    <br />
                    Lowkey
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-white/64">
                    <div className="rounded-2xl bg-white/6 px-3 py-3">Coffee</div>
                    <div className="rounded-2xl bg-white/6 px-3 py-3">Quiet</div>
                    <div className="rounded-2xl bg-white/6 px-3 py-3">6 mins</div>
                    <div className="rounded-2xl bg-white/6 px-3 py-3">No overthinking</div>
                  </div>
                </div>
              </PhoneMockup>
            </motion.div>
          </div>
        </div>
      </Section>

      <Section
        className="bg-white"
        refSetter={(node) => { sectionRefs.current[2] = node; }}
        index={2}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(211,255,72,0.5),_transparent_30%),linear-gradient(180deg,_#fff_0%,_#f6f6ef_100%)]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-6 py-24 sm:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="max-w-xl">
              <span className="inline-flex rounded-full border-2 border-black bg-[#D3FF48] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-black shadow-[4px_4px_0_#000]">
                clarity moment
              </span>
              <h2 className="mt-5 text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.09em] text-black sm:text-[4.4rem]">
                We give you 3.
              </h2>
              <p className="mt-3 text-lg font-semibold text-black/68 sm:text-2xl">
                You pick one and go.
              </p>
              <CTAButton
                label="Get Vibinn"
                onClick={() => handleCta('section_3')}
                className="mt-8"
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              style={{ transform: `translateY(${clarityProgress * -12}px)` }}
            >
              <PhoneMockup>
                <div className="space-y-3 rounded-[1.8rem] bg-[#0f0f0f] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D3FF48]">today’s picks</div>
                      <div className="mt-1 text-2xl font-black tracking-[-0.07em] text-white">Boston</div>
                    </div>
                    <div className="rounded-full bg-white/8 p-2 text-white/70">
                      <Sparkles size={16} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {recommendationCards.map((card) => (
                      <RecommendationCard key={card.name} {...card} />
                    ))}
                  </div>
                </div>
              </PhoneMockup>
            </motion.div>
          </div>
        </div>
      </Section>

      <Section
        className="bg-[#D3FF48]"
        refSetter={(node) => { sectionRefs.current[3] = node; }}
        index={3}
      >
        <div className="absolute inset-0 overflow-hidden">
          {sectionFourStickers.map((sticker, index) => (
            <Sticker
              key={sticker.src}
              sticker={sticker}
              sectionProgress={sectionProgress(3)}
              intensity={0.28}
              delay={index * 0.18}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-6 py-24 sm:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
            <motion.div
              initial={{ opacity: 0, x: -18, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <PhoneMockup className="rotate-[-2deg]">
                <div className="space-y-3 rounded-[1.8rem] bg-black p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D3FF48]">today feed</div>
                    <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">3 friends</div>
                  </div>
                  {feedCards.map((card) => (
                    <FeedCard key={`${card.user}-${card.place}`} {...card} />
                  ))}
                </div>
              </PhoneMockup>
            </motion.div>

            <div className="max-w-xl text-right lg:ml-auto">
              <span className="inline-flex rounded-full border-2 border-black bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-black shadow-[4px_4px_0_#000]">
                social layer
              </span>
              <h2 className="mt-5 text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.09em] text-black sm:text-[4.2rem]">
                See where your friends go
              </h2>
              <p className="mt-3 text-lg font-semibold text-black/70 sm:text-2xl">
                Today
              </p>
              <CTAButton
                label="Get Vibinn"
                onClick={() => handleCta('section_4')}
                variant="secondary"
                className="mt-8 ml-auto"
              />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Header({ onCta }: { onCta: () => void }) {
  return (
    <div className="pointer-events-none sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-black/10 bg-white/28 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#D3FF48]">
            Vibinn
          </div>
        </div>

        <CTAButton label="Get Vibinn" onClick={onCta} className="!px-4 !py-2.5 text-[12px]" />
      </div>
    </div>
  );
}

function Section({ className = '', children, refSetter, index }: SectionProps & {
  refSetter: (node: HTMLElement | null) => void;
  index: number;
}) {
  return (
    <section
      ref={refSetter}
      data-section-index={index}
      className={`landing-snap-section relative min-h-[100svh] snap-start overflow-hidden ${className}`}
    >
      {children}
    </section>
  );
}

function Sticker({
  sticker,
  sectionProgress,
  intensity,
  delay,
}: {
  sticker: StickerConfig;
  sectionProgress: number;
  intensity: number;
  delay: number;
}) {
  const driftX = (sticker.driftX ?? 0) * sectionProgress * intensity;
  const driftY = (sticker.driftY ?? 0) * sectionProgress * intensity;
  const rotate = (sticker.rotate ?? 0) + sectionProgress * (sticker.driftX ?? 18) * 0.04 * intensity;

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        left: sticker.left,
        top: sticker.top,
        width: sticker.width,
        zIndex: sticker.zIndex ?? 1,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -(sticker.floatDistance ?? 14), 0],
        rotate: [rotate, rotate + 1.6, rotate],
      }}
      transition={{
        opacity: { duration: 0.35, ease: 'easeOut', delay },
        scale: { duration: 0.35, ease: 'easeOut', delay },
        y: { duration: sticker.floatDuration ?? 6.8, ease: 'easeInOut', repeat: Infinity, delay },
        rotate: { duration: (sticker.floatDuration ?? 6.8) * 1.15, ease: 'easeInOut', repeat: Infinity, delay },
      }}
    >
      <div
        style={{
          transform: `translate(${driftX}px, ${driftY}px) rotate(${rotate}deg)`,
          willChange: 'transform',
        }}
      >
        <img
          src={sticker.src}
          alt={sticker.alt}
          className="landing-sticker block w-full select-none"
          draggable={false}
        />
      </div>
    </motion.div>
  );
}

function MoodPill({ label, top, left, rotate = 0, dark = false }: MoodPillProps) {
  return (
    <motion.div
      className="absolute"
      style={{ top, left }}
      animate={{ y: [0, -10, 0], rotate: [rotate, rotate + (dark ? -2 : 2), rotate] }}
      transition={{ duration: 5.6, ease: 'easeInOut', repeat: Infinity }}
    >
      <div
        className={`rounded-full border-2 px-5 py-3 text-sm font-black tracking-[-0.03em] shadow-[4px_4px_0_#000] ${
          dark
            ? 'border-white bg-black text-[#D3FF48]'
            : 'border-black bg-white text-black'
        }`}
      >
        {label}
      </div>
    </motion.div>
  );
}

function PhoneMockup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[22rem] rounded-[2.7rem] border-[3px] border-black bg-black p-3 shadow-[14px_18px_0_#000] ${className}`}>
      <div className="mb-3 mx-auto h-6 w-28 rounded-full bg-white/10" />
      <div className="overflow-hidden rounded-[2.1rem] bg-white">
        {children}
      </div>
    </div>
  );
}

function RecommendationCard({ image, name, distance, vibe }: RecommendationCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-[1.4rem] bg-white/7 p-2.5 text-white">
      <img src={image} alt={name} className="h-16 w-16 rounded-[1rem] object-cover" />
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-base font-black tracking-[-0.04em]">{name}</div>
        <div className="mt-1 text-xs font-semibold text-white/62">{distance}</div>
        <div className="mt-2 inline-flex rounded-full bg-[#D3FF48] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
          {vibe}
        </div>
      </div>
    </div>
  );
}

function FeedCard({ image, user, place, review, time }: FeedCardProps) {
  return (
    <div className="rounded-[1.45rem] border border-white/8 bg-white/6 p-3 text-white">
      <div className="flex items-center gap-3">
        <img src={image} alt={place} className="h-12 w-12 rounded-[0.9rem] object-cover" />
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm font-black">{user}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">{time}</div>
          </div>
          <div className="truncate text-[11px] font-semibold text-[#D3FF48]">{place}</div>
          <div className="truncate text-[11px] font-medium text-white/62">{review}</div>
        </div>
      </div>
    </div>
  );
}

function CTAButton({ label, onClick, variant = 'primary', className = '' }: CTAButtonProps) {
  const base = variant === 'primary'
    ? 'border-black bg-black text-[#D3FF48]'
    : 'border-black bg-white text-black';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 text-sm font-black tracking-[-0.03em] shadow-[4px_4px_0_#000] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${base} ${className}`}
    >
      <Download size={15} />
      <span>{label}</span>
    </button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
