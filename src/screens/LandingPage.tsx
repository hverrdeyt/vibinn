import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';
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
  icon?: React.ReactNode;
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
  avatar: string;
  rating: string;
};

const sectionOneStickers: StickerConfig[] = [
  {
    src: `${ASSET_BASE}/Untitled-9.png`,
    alt: 'Pastry sticker',
    left: '-5%',
    top: '4%',
    width: '17%',
    rotate: -10,
    floatDuration: 6.8,
    floatDistance: 14,
    driftX: -24,
    driftY: 140,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-10.png`,
    alt: 'Croissant sticker',
    left: '79%',
    top: '3%',
    width: '15%',
    rotate: 10,
    floatDuration: 6.9,
    floatDistance: 12,
    driftX: 28,
    driftY: 160,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-17.png`,
    alt: 'Doodle sticker',
    left: '62%',
    top: '15%',
    width: '11%',
    rotate: 7,
    floatDuration: 6.2,
    floatDistance: 10,
    driftX: 22,
    driftY: 120,
    zIndex: 1,
  },
  {
    src: `${ASSET_BASE}/Untitled-20.png`,
    alt: 'Coffee cup sticker',
    left: '68%',
    top: '20%',
    width: '28%',
    rotate: 8,
    floatDuration: 7.3,
    floatDistance: 16,
    driftX: 34,
    driftY: 180,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-22.png`,
    alt: 'Cafe interior sticker',
    left: '-4%',
    top: '24%',
    width: '24%',
    rotate: -8,
    floatDuration: 6.5,
    floatDistance: 14,
    driftX: -30,
    driftY: 170,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-11.png`,
    alt: 'Friends hanging out',
    left: '6%',
    top: '63%',
    width: '28%',
    rotate: -8,
    floatDuration: 7.1,
    floatDistance: 14,
    driftX: -22,
    driftY: 150,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-14.png`,
    alt: 'Storefront sticker',
    left: '69%',
    top: '64%',
    width: '25%',
    rotate: 6,
    floatDuration: 7.2,
    floatDistance: 14,
    driftX: 28,
    driftY: 160,
    zIndex: 2,
  },
  {
    src: `${ASSET_BASE}/Untitled-3.png`,
    alt: 'Matcha sticker',
    left: '38%',
    top: '74%',
    width: '17%',
    rotate: -6,
    floatDuration: 6.4,
    floatDistance: 10,
    driftX: 0,
    driftY: 110,
    zIndex: 1,
  },
];

const sectionFourStickers: StickerConfig[] = [
  {
    src: `${ASSET_BASE}/Untitled-23.png`,
    alt: 'Latte art',
    left: '4%',
    top: '10%',
    width: '18%',
    rotate: -5,
    floatDuration: 6.5,
    floatDistance: 10,
    zIndex: 1,
  },
  {
    src: `${ASSET_BASE}/Untitled-21.png`,
    alt: 'Cafe scene',
    left: '77%',
    top: '15%',
    width: '18%',
    rotate: 7,
    floatDuration: 7.1,
    floatDistance: 12,
    zIndex: 1,
  },
];

const sectionThreeStickers: StickerConfig[] = [
  {
    src: `${ASSET_BASE}/Untitled-18.png`,
    alt: 'Cheesecake sticker',
    left: '58%',
    top: '7%',
    width: '11%',
    rotate: -10,
    floatDuration: 6.4,
    floatDistance: 10,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-23.png`,
    alt: 'Latte art sticker',
    left: '78%',
    top: '17%',
    width: '13%',
    rotate: 8,
    floatDuration: 6.8,
    floatDistance: 11,
    zIndex: 3,
  },
  {
    src: `${ASSET_BASE}/Untitled-17.png`,
    alt: 'Doodle sticker',
    left: '69%',
    top: '33%',
    width: '9%',
    rotate: -7,
    floatDuration: 5.9,
    floatDistance: 8,
    zIndex: 2,
  },
] as const;

const moodCompanions = ['Alone', 'Friends', 'Date', 'Work'];
const moodFeels = ['Chill', 'Quiet', 'Social', 'Lowkey'];
const sectionTwoAccentPills = [
  { label: 'Friends', top: '34%', left: '4%', rotate: -11, dark: false },
  { label: 'Quick', top: '16%', left: '75%', rotate: 10, dark: true },
  { label: 'Date', top: '72%', left: '68%', rotate: 8, dark: false },
] as const;

export default function LandingPage({
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
  const activeSection = clamp(
    Math.floor((scrollTop + viewportHeight * 0.45) / viewportHeight),
    0,
    3,
  );

  const handleCta = (source: 'header' | 'section_3' | 'section_4') => {
    trackEvent('Landing CTA tapped', {
      source,
      ...(analyticsContextRef.current ?? {}),
    });
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
      name: 'Back Bay Table',
      distance: '11 mins away',
      vibe: 'date easy yes',
    },
  ], []);

  const feedCards = useMemo<FeedCardProps[]>(() => [
    {
      image: '/landing-assets/section4-feed.png',
      avatar: `${ASSET_BASE}/Untitled-11.png`,
      user: 'Aulia',
      place: 'Blank Street',
      review: 'suprisingly nice matcha',
      time: '2h ago',
      rating: 'Not bad',
    },
    {
      image: `${ASSET_BASE}/Untitled-18.png`,
      avatar: `${ASSET_BASE}/Untitled-21.png`,
      user: 'Nadia',
      place: 'Coffee & People',
      review: 'sweet slow reset',
      time: '4h ago',
      rating: 'Liked',
    },
    {
      image: `${ASSET_BASE}/Untitled-1.png`,
      avatar: `${ASSET_BASE}/Untitled-14.png`,
      user: 'Raka',
      place: 'Back Bay Table',
      review: 'friends no notes',
      time: '6h ago',
      rating: 'Recommended',
    },
  ], []);

  const floatingCta = activeSection === 1
    ? { label: 'Start your diary', source: 'section_3' as const }
    : activeSection === 2
      ? { label: 'Find your friends', source: 'section_3' as const }
      : activeSection === 3
        ? { label: 'Explore your map', source: 'section_4' as const }
        : null;

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
              delay={index * 0.1}
              fall
            />
          ))}
        </div>

        <motion.div
          className="absolute inset-0 z-10 mx-auto flex w-full max-w-none flex-col items-center justify-center px-6 text-center sm:px-10"
          style={{
            opacity: 1 - chaosProgress * 0.12,
            transform: `translateY(${chaosProgress * -18}px)`,
          }}
        >
          <div className="flex max-w-6xl flex-col items-center">
            <span className="mb-4 inline-flex rotate-[-4deg] rounded-full border-2 border-black/85 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0_#000]">
              your food diary
            </span>
            <h1 className="max-w-[11ch] text-balance text-[3rem] font-black leading-[0.88] tracking-[-0.09em] text-black sm:text-[4.8rem]">
              Every meal. <span className="landing-bbh-bartle">Remembered</span>.
            </h1>
            <p className="mt-4 text-lg font-semibold text-black/72 sm:text-2xl">
              Snap, rate, save — your entire food journey in one place.
            </p>
            <motion.div
              className="mt-8 flex items-center gap-2 rounded-full bg-black px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#D3FF48]"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span>Scroll</span>
              <ArrowRight size={12} className="rotate-90" />
            </motion.div>
          </div>
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
              food diary
            </span>
            <h2 className="mt-5 text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.08em] sm:text-[4.3rem]">
              Every meal you&apos;ve eaten, finally organized.
            </h2>
            <p className="mt-3 text-lg font-semibold text-white/70 sm:text-2xl">
              Snap a photo, write 3 words, pick a rating. Done in seconds.
            </p>
          </div>

          <div className="relative mt-12 h-[30rem] w-full max-w-5xl">
            {moodCompanions.map((label, index) => (
              <MoodPill
                key={label}
                label={label}
                top={`${8 + index * 17}%`}
                left={`${3 + (index % 2) * 8}%`}
                rotate={index % 2 === 0 ? -8 : 7}
              />
            ))}
            {moodFeels.map((label, index) => (
              <MoodPill
                key={label}
                label={label}
                top={`${12 + index * 16}%`}
                left={`${72 - (index % 2) * 8}%`}
                rotate={index % 2 === 0 ? 8 : -6}
                dark
              />
            ))}
            {sectionTwoAccentPills.map((pill) => (
              <MoodPill
                key={`${pill.label}-${pill.top}-${pill.left}`}
                label={pill.label}
                top={pill.top}
                left={pill.left}
                rotate={pill.rotate}
                dark={pill.dark}
                className="z-20"
              />
            ))}
            <motion.div
              className="absolute left-1/2 top-1/2 z-10 w-[19rem] -translate-x-1/2 -translate-y-1/2"
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
              <div className="rounded-[1.8rem] bg-black p-4 text-left text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src="/brand/vibinn-logo-icon.png"
                        alt="Vibinn logo"
                        className="h-5 w-5 rotate-[-8deg] object-contain"
                        draggable={false}
                      />
                      <div className="landing-bbh-bartle text-[0.78rem] leading-none text-[#D3FF48]">Boston</div>
                    </div>
                    <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/72">
                      Let&apos;s go
                    </div>
                  </div>
                  <div className="mt-6 text-[2rem] font-black leading-[0.9] tracking-[-0.08em]">
                    Every meal,
                    <br />
                    remembered.
                  </div>
                  <div className="mt-6">
                    <MoodSelectorColumn
                      title="Feel"
                      items={['Chill', 'Quiet', 'Social', 'Lowkey']}
                      active="Quiet"
                    />
                  </div>
                  <div className="mt-5 rounded-full bg-[#D3FF48] px-4 py-3 text-center text-sm font-black text-black shadow-[4px_4px_0_#1a1a1a]">
                    Start your diary
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
        <div className="absolute inset-0 overflow-hidden">
          {sectionThreeStickers.map((sticker, index) => (
            <Sticker
              key={sticker.src}
              sticker={sticker}
              sectionProgress={clarityProgress}
              intensity={0.16}
              delay={index * 0.1}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-6 py-24 sm:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="max-w-xl">
              <span className="inline-flex rounded-full border-2 border-black bg-[#D3FF48] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-black shadow-[4px_4px_0_#000]">
                trusted circle
              </span>
              <h2 className="mt-5 text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.09em] text-black sm:text-[4.4rem]">
                Real reviews from people you actually trust.
              </h2>
              <p className="mt-3 text-lg font-semibold text-black/68 sm:text-2xl">
                When your friend says it&apos;s recommended, you know they mean it.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              style={{ transform: `translateY(${clarityProgress * -12}px)` }}
            >
              <PhoneMockup>
                <div className="rounded-[1.8rem] bg-[#0f0f0f] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D3FF48]">trusted reviews</div>
                      <div className="mt-1 text-2xl font-black tracking-[-0.07em] text-white">Boston</div>
                    </div>
                    <div className="rounded-full bg-white/8 p-2 text-white/70">
                      <Sparkles size={16} />
                    </div>
                  </div>
                  <div className="relative mt-5 h-[21rem]">
                    {recommendationCards.map((card, index) => (
                      <div
                        key={card.name}
                        className="absolute inset-x-0"
                        style={{
                          top: `${index * 3.2}rem`,
                          transform: `scale(${1 - index * 0.04}) rotate(${index === 0 ? -2 : index === 1 ? 1.5 : 4}deg)`,
                          zIndex: recommendationCards.length - index,
                        }}
                      >
                        <RecommendationCard {...card} />
                      </div>
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
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <div className="max-w-xl text-center">
              <span className="inline-flex rounded-full border-2 border-black bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-black shadow-[4px_4px_0_#000]">
                food map
              </span>
              <h2 className="mt-5 text-balance text-[2.8rem] font-normal leading-[0.9] tracking-[-0.09em] text-black sm:text-[4.2rem]">
                Your food journey, mapped.
              </h2>
              <p className="mt-3 text-lg font-semibold text-black/70 sm:text-2xl">
                See everywhere you&apos;ve eaten — and discover new spots hiding nearby.
              </p>
            </div>

            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <PhoneMockup className="max-w-[19rem] rotate-[-2deg]">
                <div className="rounded-[1.8rem] bg-black p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D3FF48]">your map</div>
                    <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">3 friends</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <FeedCard {...feedCards[0]} />
                  </div>
                </div>
              </PhoneMockup>
            </motion.div>
          </div>
        </div>
      </Section>

      {floatingCta ? (
        <FloatingSectionCTA
          label={floatingCta.label}
          onClick={() => handleCta(floatingCta.source)}
        />
      ) : null}
    </div>
  );
}

function Header({ onCta }: { onCta: () => void }) {
  return (
    <div className="pointer-events-none sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-black/10 bg-white/28 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/vibinn-logo-icon.png"
            alt="Vibinn logo"
            className="h-7 w-7 rotate-[-8deg] object-contain"
            draggable={false}
          />
          <div className="landing-bbh-bartle text-[0.92rem] leading-none text-black">
            Vibinn
          </div>
        </div>
        <CTAButton
          label="Download"
          onClick={onCta}
          className="!px-4 !py-2.5 text-[12px]"
          icon={<span className="text-base leading-none"></span>}
        />
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
  fall = false,
}: {
  sticker: StickerConfig;
  sectionProgress: number;
  intensity: number;
  delay: number;
  fall?: boolean;
}) {
  const easedProgress = fall ? Math.pow(sectionProgress, 1.15) : sectionProgress;
  const driftX = (sticker.driftX ?? 0) * easedProgress * intensity;
  const driftYBase = (sticker.driftY ?? 0) * easedProgress * intensity;
  const driftY = fall
    ? driftYBase + easedProgress * 220
    : driftYBase;
  const rotate = (sticker.rotate ?? 0) + easedProgress * (sticker.driftX ?? 18) * 0.04 * intensity + (fall ? easedProgress * 9 : 0);
  const scale = fall ? 1 - easedProgress * 0.08 : 1;

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
          transform: `translate(${driftX}px, ${driftY}px) rotate(${rotate}deg) scale(${scale})`,
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

function MoodPill({
  label,
  top,
  left,
  rotate = 0,
  dark = false,
  className = '',
}: {
  label: string;
  top: string;
  left: string;
  rotate?: number;
  dark?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={`absolute ${className}`}
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

function MoodSelectorColumn({
  title,
  items,
  active,
}: {
  title: string;
  items: string[];
  active: string;
}) {
  return (
    <div>
      <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/34">
        {title}
      </div>
      <div className="rounded-[2rem] border border-white/8 bg-white/[0.06] px-4 py-4">
        <div className="space-y-3 text-center">
          {items.map((item) => {
            const isActive = item === active;
            return (
              <div
                key={item}
                className={`rounded-full px-2 py-2 text-[1.05rem] font-black tracking-[-0.05em] ${
                  isActive
                    ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-white/34'
                }`}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ image, name, distance, vibe }: RecommendationCardProps) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#171717] text-white shadow-[0_18px_32px_rgba(0,0,0,0.24)]">
      <img src={image} alt={name} className="h-40 w-full object-cover" />
      <div className="space-y-3 p-4 text-left">
        <div className="inline-flex rounded-full bg-[#D3FF48] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
          {vibe}
        </div>
        <div>
          <div className="truncate text-[1.25rem] font-black tracking-[-0.05em]">{name}</div>
          <div className="mt-1 text-sm font-semibold text-white/62">{distance}</div>
        </div>
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/44">
          <span>one of 3</span>
          <span>swipe</span>
        </div>
      </div>
    </div>
  );
}

function FeedCard({ image, user, place, review, time, avatar, rating }: FeedCardProps) {
  return (
    <div className="overflow-hidden rounded-[1.65rem] border border-white/8 bg-[#151515] p-4 text-white">
      <div className="flex items-center gap-3">
        <img src={avatar} alt={user} className="h-11 w-11 rounded-[0.95rem] object-cover" />
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="truncate text-sm font-black">{user}</div>
              <div className="truncate text-[11px] font-semibold text-white/54">@vibinnfriend</div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">{time}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 inline-flex rounded-full bg-[#D3FF48] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
        {rating}
      </div>
      <div className="mt-3 text-lg font-black tracking-[-0.05em] text-white">
        {review}
      </div>
      <img src={image} alt={place} className="mt-4 aspect-square w-full rounded-[1.6rem] object-cover" />
      <div className="mt-4 text-left">
        <div className="text-xl font-black tracking-[-0.05em]">{place}</div>
        <div className="mt-1 text-sm font-medium text-white/58">Boston, United States</div>
      </div>
    </div>
  );
}

function CTAButton({ label, onClick, variant = 'primary', className = '', icon }: CTAButtonProps) {
  const base = variant === 'primary'
    ? 'border-black bg-black text-[#D3FF48]'
    : 'border-black bg-white text-black';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 text-sm font-black tracking-[-0.03em] shadow-[4px_4px_0_#000] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${base} ${className}`}
    >
      {icon ?? <span className="text-base leading-none">↓</span>}
      <span>{label}</span>
    </button>
  );
}

function FloatingSectionCTA({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <CTAButton
        label={label}
        onClick={onClick}
        variant="primary"
        className="pointer-events-auto !w-[17.5rem] justify-center !border-black !bg-[#D3FF48] !px-5 !py-3 !text-[13px] !text-black"
        icon={<span className="text-base leading-none"></span>}
      />
    </motion.div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
