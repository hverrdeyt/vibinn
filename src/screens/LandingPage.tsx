import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimationFrame, useMotionValue } from 'motion/react';
import { FileText, Heart, Smile, Sparkles, ThumbsDown } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { api, resolveApiAssetUrl } from '../lib/api';
import { MOCK_REVIEW_SCENARIO } from '../mockReviewData';

type LandingPageProps = {
  onHeaderTryNow: () => void;
  onFloatingTryNow: () => void;
  onOpenFounderLetter: () => void;
  analyticsContext?: Record<string, unknown>;
};

type FloatingPostConfig = {
  image: string;
  avatar: string;
  rating: 'disliked' | 'not_bad' | 'liked' | 'recommended';
  x: number;
  y: number;
  width: number;
  rotation: number;
  delay?: number;
};

type LandingPublicPost = {
  id: string;
  imageUrl: string;
  avatarUrl: string;
  ratingLabel: 'disliked' | 'not_bad' | 'liked' | 'recommended';
};

type IconButtonProps = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
};

type SocialLink = {
  href: string;
  label: string;
  icon: ReactNode;
};

const fallbackLandingPosts: LandingPublicPost[] = [
  ...MOCK_REVIEW_SCENARIO.followedTravelers,
  ...MOCK_REVIEW_SCENARIO.similarTravelers,
]
  .flatMap((traveler) => (traveler.travelHistory ?? []).flatMap((trip) =>
    (trip.places ?? []).map((place) => ({
      id: place.momentId ?? `${traveler.id}-${place.id}`,
      imageUrl: place.momentMedia?.[0]?.url ?? place.image,
      avatarUrl: traveler.avatar,
      ratingLabel:
        (place.momentRatingLabel as LandingPublicPost['ratingLabel'] | undefined)
        ?? ((place.momentRating ?? 5) >= 5 ? 'recommended' : 'liked'),
    })),
  ))
  .slice(0, 24);

const landingCardSeeds: Array<Omit<FloatingPostConfig, 'image' | 'avatar' | 'rating'>> = Array.from(
  { length: 24 },
  (_, index) => {
    const laneIndex = index % 4;
    const laneSlot = Math.floor(index / 4);
    const widthOptions = [68, 71, 73, 74, 77, 79, 82, 83];
    const rotationOptions = [-16, -12, -8, -7, 6, 10, 14, 16];
    const horizontalX = 28 + (laneSlot % 6) * 210 + (laneIndex % 2) * 22;
    const verticalY = 58 + (laneSlot % 6) * 166 + (laneIndex % 2) * 18;

    switch (laneIndex) {
      case 0:
        return {
          x: horizontalX,
          y: 44 + laneSlot * 10,
          width: widthOptions[index % widthOptions.length],
          rotation: rotationOptions[index % rotationOptions.length],
          delay: index * 0.08,
        };
      case 1:
        return {
          x: 1120 + (laneSlot % 2) * 42,
          y: verticalY,
          width: widthOptions[(index + 2) % widthOptions.length],
          rotation: rotationOptions[(index + 3) % rotationOptions.length],
          delay: index * 0.08,
        };
      case 2:
        return {
          x: 94 + (laneSlot % 6) * 188,
          y: 900 + laneSlot * 12,
          width: widthOptions[(index + 4) % widthOptions.length],
          rotation: rotationOptions[(index + 5) % rotationOptions.length],
          delay: index * 0.08,
        };
      default:
        return {
          x: 22 + (laneSlot % 2) * 28,
          y: 170 + laneSlot * 148,
          width: widthOptions[(index + 1) % widthOptions.length],
          rotation: rotationOptions[(index + 6) % rotationOptions.length],
          delay: index * 0.08,
        };
    }
  },
);

const LANDING_POST_REFERENCE_WIDTH = 132;

type LandingViewport = {
  width: number;
  height: number;
};

type LandingHeroSafeZone = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LandingRoamLane = 'top' | 'right' | 'bottom' | 'left';

const LANDING_SAFE_ZONE = {
  leftRatio: 0.21,
  rightRatio: 0.79,
  topRatio: 0.19,
  bottomRatio: 0.76,
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function buildHeroSafeZone(viewport: LandingViewport): LandingHeroSafeZone {
  return {
    left: viewport.width * LANDING_SAFE_ZONE.leftRatio,
    right: viewport.width * LANDING_SAFE_ZONE.rightRatio,
    top: viewport.height * LANDING_SAFE_ZONE.topRatio,
    bottom: viewport.height * LANDING_SAFE_ZONE.bottomRatio,
  };
}

function intersectsSafeZone(x: number, y: number, size: number, safeZone: LandingHeroSafeZone) {
  return (
    x < safeZone.right &&
    x + size > safeZone.left &&
    y < safeZone.bottom &&
    y + size > safeZone.top
  );
}

function determineLane(
  point: { x: number; y: number },
  viewport: LandingViewport,
  safeZone: LandingHeroSafeZone,
): LandingRoamLane {
  const centerX = point.x / Math.max(viewport.width, 1);
  const centerY = point.y / Math.max(viewport.height, 1);

  if (centerY < LANDING_SAFE_ZONE.topRatio) return 'top';
  if (centerY > LANDING_SAFE_ZONE.bottomRatio) return 'bottom';
  if (centerX < LANDING_SAFE_ZONE.leftRatio) return 'left';
  if (centerX > LANDING_SAFE_ZONE.rightRatio) return 'right';

  const distances = [
    { lane: 'top' as const, value: Math.abs(point.y - safeZone.top) },
    { lane: 'bottom' as const, value: Math.abs(point.y - safeZone.bottom) },
    { lane: 'left' as const, value: Math.abs(point.x - safeZone.left) },
    { lane: 'right' as const, value: Math.abs(point.x - safeZone.right) },
  ];

  return distances.sort((first, second) => first.value - second.value)[0].lane;
}

function getLaneBounds(
  lane: LandingRoamLane,
  viewport: LandingViewport,
  size: number,
) {
  const safeZone = buildHeroSafeZone(viewport);
  const padding = 18;
  const leftMin = padding;
  const leftMax = Math.max(padding, safeZone.left - size - padding);
  const rightMin = Math.min(Math.max(padding, safeZone.right + padding), viewport.width - size - padding);
  const rightMax = Math.max(rightMin, viewport.width - size - padding);
  const topMin = padding;
  const topMax = Math.max(padding, safeZone.top - size - padding);
  const bottomMin = Math.min(Math.max(padding, safeZone.bottom + padding), viewport.height - size - padding);
  const bottomMax = Math.max(bottomMin, viewport.height - size - padding);

  switch (lane) {
    case 'top':
      return {
        minX: padding,
        maxX: Math.max(padding, viewport.width - size - padding),
        minY: padding,
        maxY: topMax,
      };
    case 'bottom':
      return {
        minX: padding,
        maxX: Math.max(padding, viewport.width - size - padding),
        minY: bottomMin,
        maxY: bottomMax,
      };
    case 'left':
      return {
        minX: leftMin,
        maxX: leftMax,
        minY: padding,
        maxY: Math.max(padding, viewport.height - size - padding),
      };
    case 'right':
      return {
        minX: rightMin,
        maxX: rightMax,
        minY: padding,
        maxY: Math.max(padding, viewport.height - size - padding),
      };
  }
}

const socialLinks: SocialLink[] = [
  {
    href: 'https://www.tiktok.com/@vibinnfood',
    label: 'TikTok',
    icon: <TikTokIcon />,
  },
  {
    href: 'https://www.instagram.com/vibinnfood',
    label: 'Instagram',
    icon: <InstagramIcon />,
  },
  {
    href: 'https://www.threads.com/@vibinnfood',
    label: 'Threads',
    icon: <ThreadsIcon />,
  },
];

export default function LandingPage({
  onFloatingTryNow,
  onOpenFounderLetter,
  analyticsContext,
}: LandingPageProps) {
  const analyticsContextRef = useRef<Record<string, unknown> | undefined>(analyticsContext);
  const [landingPosts, setLandingPosts] = useState<LandingPublicPost[]>(fallbackLandingPosts);
  const [viewport, setViewport] = useState<LandingViewport | null>(null);

  useEffect(() => {
    analyticsContextRef.current = analyticsContext;
  }, [analyticsContext]);

  useEffect(() => {
    trackEvent('Visit landing page', analyticsContextRef.current);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const previousThemeColor = themeColorMeta?.getAttribute('content');

    html.classList.add('landing-shell');
    body.classList.add('landing-shell');
    root?.classList.add('landing-shell');
    themeColorMeta?.setAttribute('content', '#D3FF48');

    return () => {
      html.classList.remove('landing-shell');
      body.classList.remove('landing-shell');
      root?.classList.remove('landing-shell');
      if (previousThemeColor) {
        themeColorMeta?.setAttribute('content', previousThemeColor);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/public/landing-posts', {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ posts?: LandingPublicPost[] }>;
      })
      .then((payload) => {
        if (!payload?.posts?.length) return;
        setLandingPosts(payload.posts);
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const animatedLandingCards = useMemo(() => {
    return landingCardSeeds.map((template, index) => {
      const source = landingPosts[index % landingPosts.length] ?? fallbackLandingPosts[index % fallbackLandingPosts.length];
      return {
        ...template,
        image: resolveApiAssetUrl(source?.imageUrl ?? fallbackLandingPosts[0].imageUrl),
        avatar: resolveApiAssetUrl(source?.avatarUrl ?? fallbackLandingPosts[0].avatarUrl),
        rating: source?.ratingLabel ?? 'liked',
      } satisfies FloatingPostConfig;
    });
  }, [landingPosts]);

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#D3FF48] text-black">
      <LandingHeader onOpenFounderLetter={onOpenFounderLetter} />

      <section className="relative min-h-[100svh] overflow-hidden px-6 pb-12 pt-28 sm:px-10 sm:pt-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.36),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(0,0,0,0.08),_transparent_38%)]" />
          {animatedLandingCards.map((card, index) => (
            <LandingRoamingPost
              key={`${card.image}-${index}`}
              card={card}
              viewport={viewport}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-6xl flex-col items-center justify-center">
          <div className="max-w-3xl text-center">
            <h1 className="mx-auto mt-5 max-w-[12ch] text-balance text-[2.8rem] font-black leading-[0.9] tracking-[-0.08em] text-white sm:text-[4.6rem]">
              <span className="block text-black font-medium">A social</span>
              <span className="block h-3 sm:h-4" />
              <span className="landing-bbh-bartle block text-[0.82em] leading-[0.82] text-black">
                Food
              </span>
              <span className="landing-bbh-bartle block text-[0.82em] leading-[0.82] text-black">
                diary
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg font-semibold leading-relaxed text-black/72 sm:text-[1.55rem]">
              <span className="block">Save every meal you eat.</span>
              <span className="block">Share with closest friends.</span>
            </p>

            <div className="mt-9 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  trackEvent('Landing CTA tapped', {
                    source: 'hero_primary',
                    ...(analyticsContextRef.current ?? {}),
                  });
                  onFloatingTryNow();
                }}
                className="inline-flex transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
                aria-label="Download on the App Store"
              >
                <img
                  src="/landing-assets/app-store-download.avif"
                  alt="Download on the App Store"
                  className="h-[56px] w-auto rounded-[14px] object-contain shadow-[0_16px_40px_rgba(0,0,0,0.42)] sm:h-[64px]"
                  draggable={false}
                />
              </button>
            </div>
          </div>

          <LandingFooter />
        </div>
      </section>
    </div>
  );
}

function LandingHeader({ onOpenFounderLetter }: { onOpenFounderLetter: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6">
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
        <IconButton
          label="A letter from founder"
          onClick={onOpenFounderLetter}
          className="h-11 w-11 rounded-full border-black/12 bg-white/70 text-black hover:bg-white/86"
          icon={<FileText size={17} />}
        />
      </div>
    </div>
  );
}

function LandingFooter() {
  return (
    <div className="pointer-events-auto mt-14 flex items-center gap-3">
      {socialLinks.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-black bg-white/75 text-black shadow-[3px_3px_0_#000] transition-transform duration-200 hover:-translate-y-0.5"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, icon, className = '' }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${className}`}
    >
      {icon}
    </button>
  );
}

function LandingRoamingPost({
  card,
  viewport,
}: {
  card: FloatingPostConfig;
  viewport: LandingViewport | null;
}) {
  const x = useMotionValue(card.x);
  const y = useMotionValue(card.y);
  const rotate = useMotionValue(card.rotation);
  const scale = useMotionValue(1);
  const motionConfigRef = useRef({
    lane: 'top' as LandingRoamLane,
    orbitSpeed: 0.00022,
    driftSpeed: 0.00011,
    amplitudeX: 40,
    amplitudeY: 20,
    rotationAmplitude: 8,
    phase: 0,
    driftPhase: 0,
    centerX: card.x,
    centerY: card.y,
    minX: 18,
    maxX: 18,
    minY: 18,
    maxY: 18,
  });

  useEffect(() => {
    if (!viewport) return;
    const safeZone = buildHeroSafeZone(viewport);
    const lane = determineLane({ x: card.x, y: card.y }, viewport, safeZone);
    const bounds = getLaneBounds(lane, viewport, card.width);
    const clampedX = Math.min(Math.max(card.x, bounds.minX), bounds.maxX);
    const clampedY = Math.min(Math.max(card.y, bounds.minY), bounds.maxY);

    motionConfigRef.current = {
      lane,
      orbitSpeed: randomBetween(0.00014, 0.00026),
      driftSpeed: randomBetween(0.00006, 0.00014),
      amplitudeX: 20,
      amplitudeY: 20,
      rotationAmplitude: randomBetween(5, 11),
      phase: randomBetween(0, Math.PI * 2),
      driftPhase: randomBetween(0, Math.PI * 2),
      centerX: clampedX,
      centerY: clampedY,
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
    };

    const horizontalRoom = Math.max(0, (bounds.maxX - bounds.minX) * 0.5);
    const verticalRoom = Math.max(0, (bounds.maxY - bounds.minY) * 0.5);
    motionConfigRef.current.amplitudeX = Math.min(
      lane === 'left' || lane === 'right' ? Math.max(10, horizontalRoom * 0.7) : Math.max(24, horizontalRoom * 0.82),
      140,
    );
    motionConfigRef.current.amplitudeY = Math.min(
      lane === 'top' || lane === 'bottom' ? Math.max(10, verticalRoom * 0.72) : Math.max(24, verticalRoom * 0.82),
      96,
    );

    x.set(clampedX);
    y.set(clampedY);
    rotate.set(card.rotation);
    scale.set(randomBetween(0.985, 1.03));
  }, [card.rotation, card.width, card.x, card.y, rotate, scale, viewport, x, y]);

  useAnimationFrame((time) => {
    if (!viewport) return;
    const config = motionConfigRef.current;
    const orbit = time * config.orbitSpeed + config.phase;
    const drift = time * config.driftSpeed + config.driftPhase;
    const nextX = config.centerX
      + Math.cos(orbit) * config.amplitudeX
      + Math.cos(drift) * Math.min(18, config.amplitudeX * 0.18);
    const nextY = config.centerY
      + Math.sin(orbit * 1.08) * config.amplitudeY
      + Math.sin(drift * 1.3) * Math.min(12, config.amplitudeY * 0.16);

    x.set(Math.min(config.maxX, Math.max(config.minX, nextX)));
    y.set(Math.min(config.maxY, Math.max(config.minY, nextY)));
    rotate.set(card.rotation + Math.sin(orbit * 0.9) * config.rotationAmplitude);
    scale.set(1 + Math.sin(orbit * 0.7 + config.phase) * 0.018);
  });

  return (
    <motion.div
      className="landing-floating-post absolute left-0 top-0 select-none"
      initial={false}
      style={{ width: `${card.width}px`, x, y, rotate, scale }}
    >
      <LandingFloatingPostCard
        image={card.image}
        avatar={card.avatar}
        rating={card.rating}
        width={card.width}
      />
    </motion.div>
  );
}

function LandingFloatingPostCard({
  image,
  avatar,
  rating,
  width,
}: {
  image: string;
  avatar: string;
  rating: 'disliked' | 'not_bad' | 'liked' | 'recommended';
  width: number;
}) {
  const ratingMeta = {
    disliked: { Icon: ThumbsDown },
    not_bad: { Icon: Smile },
    liked: { Icon: Heart },
    recommended: { Icon: Sparkles },
  }[rating];
  const RatingIcon = ratingMeta.Icon;
  const scaleRatio = width / LANDING_POST_REFERENCE_WIDTH;
  const outerRadius = Math.max(14, Math.round(22 * scaleRatio));
  const innerRadius = Math.max(12, Math.round(20 * scaleRatio));
  const framePadding = Math.max(2, 0.5 * scaleRatio);
  const avatarOffset = Math.max(6, 10 * scaleRatio);
  const avatarFrameRadius = Math.max(7, Math.round(10 * scaleRatio));
  const avatarImageRadius = Math.max(6, Math.round(8 * scaleRatio));
  const avatarSize = Math.max(16, Math.round(28 * scaleRatio));
  const avatarShadowY = Math.max(4, Math.round(6 * scaleRatio));
  const avatarShadowBlur = Math.max(10, Math.round(14 * scaleRatio));
  const ratingSize = Math.max(21, Math.round(36 * scaleRatio));
  const ratingIconSize = Math.max(10, Math.round(16 * scaleRatio));
  const ratingShadowY = Math.max(5, Math.round(8 * scaleRatio));
  const ratingShadowBlur = Math.max(10, Math.round(16 * scaleRatio));
  const cardShadowY = Math.max(12, Math.round(18 * scaleRatio));
  const cardShadowBlur = Math.max(20, Math.round(32 * scaleRatio));

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        borderRadius: `${outerRadius}px`,
        padding: `${framePadding}px`,
        boxShadow: `0 ${cardShadowY}px ${cardShadowBlur}px rgba(0,0,0,0.2)`,
      }}
    >
      <div className="relative overflow-hidden" style={{ borderRadius: `${innerRadius}px` }}>
        <img
          src={image}
          alt=""
          className="aspect-square w-full object-cover"
          draggable={false}
          referrerPolicy="no-referrer"
        />
        <div
          className="absolute overflow-hidden bg-black"
          style={{
            left: `${avatarOffset}px`,
            top: `${avatarOffset}px`,
            borderRadius: `${avatarFrameRadius}px`,
            boxShadow: `0 ${avatarShadowY}px ${avatarShadowBlur}px rgba(0,0,0,0.28)`,
          }}
        >
          <img
            src={avatar}
            alt=""
            className="object-cover"
            style={{
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
              borderRadius: `${avatarImageRadius}px`,
            }}
            draggable={false}
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex items-center justify-center rounded-full bg-[#CCFF00] text-black"
            style={{
              width: `${ratingSize}px`,
              height: `${ratingSize}px`,
              boxShadow: `0 ${ratingShadowY}px ${ratingShadowBlur}px rgba(0,0,0,0.28)`,
            }}
          >
            <RatingIcon size={ratingIconSize} className={rating === 'liked' ? 'fill-current' : ''} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true">
      <path d="M14.6 3c.3 2 1.5 3.7 3.4 4.5.9.4 1.8.6 2.7.6v3.1a8.1 8.1 0 0 1-4-1V15a6 6 0 1 1-6-6c.4 0 .8 0 1.2.1v3.2a3 3 0 1 0 1.7 2.7V3h3Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.2" cy="6.8" r="1" className="fill-current stroke-none" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true">
      <path d="M15.7 11.2c-.1-.1-.2-.2-.2-.3-.7-1.1-1.9-1.7-3.6-1.8-2.1-.1-3.8 1-4.4 2.8l2.2.8c.3-.9 1.1-1.4 2.2-1.4.8 0 1.4.2 1.8.6-.9.1-1.8.3-2.6.5-2.3.7-3.5 2-3.5 3.9 0 2.2 1.8 3.8 4.4 3.8 2.3 0 4-.9 4.9-2.6.7-1.2.8-2.7.4-4.1.7.4 1.2 1 1.4 1.7.4 1.3.2 2.7-.7 3.9-1 1.3-2.7 2-4.9 2-3.6 0-6.1-2.4-6.1-6 0-3.8 2.6-6.3 6.4-6.3 3 0 5.1 1.4 5.9 3.7.3.9.4 1.8.3 2.8h-2.4c0-.5 0-1-.1-1.2-.1-.6-.4-1-.8-1.4Zm-1.5 3c-.6-.1-1.4-.1-2.1.1-1.4.3-2.2.9-2.2 1.9 0 .9.8 1.5 2 1.5 1.8 0 2.7-1.1 2.5-3.5Z" />
    </svg>
  );
}
