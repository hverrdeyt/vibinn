import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { trackEvent, trackMetaPixelEvent } from '../lib/analytics';

type LandingPageProps = {
  onHeaderTryNow: () => void;
  onFloatingTryNow: () => void;
  onOpenFounderLetter?: () => void;
  analyticsContext?: Record<string, unknown>;
};

type HeadlineLine = {
  text: string;
  accent?: boolean;
  // Complete Tailwind font-size classes (mobile + lg), kept per line so each line can be tuned alone.
  sizeClass: string;
  // Forces the line onto one row; the size classes are tuned so it still fits down to a 320px screen.
  nowrap?: boolean;
};

const HEADLINE_SIZE = {
  homeRegular: 'text-[clamp(1.5rem,7.6vw,2.4rem)] lg:text-[clamp(2rem,3.7vw,2.75rem)]',
  homeAccent: 'text-[clamp(1.2rem,6.4vw,2.1rem)] lg:text-[clamp(1.8rem,3.2vw,2.4rem)]',
  featureRegular: 'text-[clamp(1.35rem,6.8vw,2.2rem)] lg:text-[clamp(2rem,3.4vw,2.6rem)]',
  featureAccent: 'text-[clamp(1.596rem,6.888vw,2.184rem)] lg:text-[clamp(2.352rem,3.864vw,3.864rem)]',
  // "your food": ~10.7em wide in BBH, so it needs a smaller size than the single-word accents to stay on one row.
  featureAccentWide: 'text-[clamp(1.35rem,6.888vw,2.184rem)] lg:text-[clamp(2rem,3.7vw,2.8rem)]',
  featureAccentOneLine: 'text-[clamp(0.9rem,4.6vw,1.7rem)] lg:text-[clamp(1.3rem,2.4vw,1.75rem)]',
};

type StickerSpec = {
  file: string;
  // Positioned relative to the phone (percentages of its width), so stickers hug the device at every size.
  className: string;
  rotate: number;
};

type SectionTone = 'light' | 'dark';

type LandingSection = {
  id: string;
  headline: HeadlineLine[];
  subheadline: string;
  demoSrc: string;
  tone: SectionTone;
  surfaceClass: string;
  accentClass: string;
  subClass: string;
  stickers: StickerSpec[];
};

// Mouse/trackpad devices: after the user stops scrolling, settle onto the next section if they moved at all.
// Native scroll is never intercepted (see the effect below). Set to false to use plain scroll-snap on desktop.
const DESKTOP_SECTION_ASSIST = true;

// Social icons and the founder-letter link under the homepage CTA. Hidden for now; flip to bring them back.
const SHOW_HOME_SOCIALS = false;

// Screen recordings live in public/landing-assets/demo/ (GIFs here; an .mp4 or .webp path works too,
// see PhoneDemo). Until a file exists the phone shows a placeholder screen.
const DEMO_BASE = '/landing-assets/demo';

const SECTIONS: LandingSection[] = [
  {
    id: 'home',
    headline: [
      { text: 'More than a', sizeClass: HEADLINE_SIZE.homeRegular },
      { text: 'food photo', accent: true, nowrap: true, sizeClass: HEADLINE_SIZE.homeAccent },
    ],
    subheadline: 'vibinn turns your food photos into memories worth keeping.',
    demoSrc: `${DEMO_BASE}/home.gif`,
    tone: 'light',
    surfaceClass: 'bg-[#D3FF48] text-black',
    accentClass: 'text-black',
    subClass: 'text-black/70',
    stickers: [
      { file: 'matcha', className: 'left-[-24%] top-[8%] w-[34%]', rotate: -12 },
      { file: 'cheesecake', className: 'right-[-30%] top-[24%] w-[50%]', rotate: 9 },
      { file: 'croissant', className: 'left-[-28%] top-[58%] w-[46%]', rotate: -14 },
      { file: 'latte-pour', className: 'right-[-26%] bottom-[6%] w-[44%]', rotate: 7 },
    ],
  },
  {
    id: 'memories',
    headline: [
      { text: 'Add memories to', sizeClass: HEADLINE_SIZE.featureRegular },
      { text: 'your food', accent: true, nowrap: true, sizeClass: HEADLINE_SIZE.featureAccentWide },
    ],
    subheadline: 'Pick a photo, rate it, say it in three words. Your month in food, summed up.',
    demoSrc: `${DEMO_BASE}/feature-memories.gif`,
    tone: 'dark',
    surfaceClass: 'bg-[#0B0B0B] text-white',
    accentClass: 'text-[#D3FF48]',
    subClass: 'text-white/70',
    stickers: [
      { file: 'receipt', className: 'left-[-24%] top-[16%] w-[38%]', rotate: -8 },
      { file: 'map-pin', className: 'right-[-26%] top-[52%] w-[46%]', rotate: 8 },
      { file: 'croissant', className: 'left-[-22%] bottom-[6%] w-[40%]', rotate: -12 },
    ],
  },
  {
    id: 'gallery',
    headline: [
      { text: 'Your gallery, filtered for', nowrap: true, sizeClass: HEADLINE_SIZE.featureRegular },
      { text: 'food', accent: true, sizeClass: HEADLINE_SIZE.featureAccent },
    ],
    subheadline: 'vibinn detects food photos in your camera roll. Just tap to log.',
    demoSrc: `${DEMO_BASE}/feature-gallery.gif`,
    tone: 'light',
    surfaceClass: 'bg-[#F5F1E8] text-black',
    accentClass: 'text-black',
    subClass: 'text-black/65',
    stickers: [
      { file: 'cheesecake', className: 'left-[-28%] top-[14%] w-[46%]', rotate: -9 },
      { file: 'matcha', className: 'right-[-22%] top-[42%] w-[34%]', rotate: 10 },
      { file: 'latte', className: 'left-[-26%] bottom-[8%] w-[40%]', rotate: -6 },
    ],
  },
  {
    id: 'friends',
    headline: [
      { text: 'Not for everyone.', sizeClass: HEADLINE_SIZE.featureRegular },
      { text: 'Just for them.', accent: true, nowrap: true, sizeClass: HEADLINE_SIZE.featureAccentOneLine },
    ],
    subheadline: 'See where your friends are eating. No public posts, no pressure.',
    demoSrc: `${DEMO_BASE}/feature-friends.gif`,
    tone: 'light',
    surfaceClass: 'bg-[#D3FF48] text-black',
    accentClass: 'text-black',
    subClass: 'text-black/70',
    stickers: [
      { file: 'friends', className: 'left-[-28%] top-[60%] w-[62%]', rotate: -5 },
      { file: 'latte-pour', className: 'right-[-26%] top-[10%] w-[44%]', rotate: 9 },
      { file: 'matcha', className: 'right-[-20%] bottom-[8%] w-[32%]', rotate: -8 },
    ],
  },
];

const socialLinks: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: 'https://www.tiktok.com/@vibinnfood', label: 'TikTok', icon: <TikTokIcon /> },
  { href: 'https://www.instagram.com/vibinnfood', label: 'Instagram', icon: <InstagramIcon /> },
  { href: 'https://www.threads.com/@vibinnfood', label: 'Threads', icon: <ThreadsIcon /> },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export default function LandingPage({
  onHeaderTryNow,
  onFloatingTryNow,
  onOpenFounderLetter,
  analyticsContext,
}: LandingPageProps) {
  const analyticsContextRef = useRef<Record<string, unknown> | undefined>(analyticsContext);
  const sentinelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);

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

  // Sections are sticky and stack on top of each other, so a section stays "in view" after the next
  // one slides over it. Sentinels laid out in normal flow (one viewport tall each) tell us which
  // section the user is actually on: the one whose slot covers more than half of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio < 0.5) return;
          const index = Number((entry.target as HTMLElement).dataset.landingIndex);
          if (Number.isNaN(index)) return;
          setActiveIndex(index);
          setFurthestIndex((current) => Math.max(current, index));
        });
      },
      { threshold: [0.5] },
    );

    sentinelRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  // Desktop paging that leaves scrolling entirely to the browser (passive listeners only, nothing is ever
  // preventDefault'ed, so it stays on the fast threaded path). Once the user has stopped for a moment, a
  // section is chosen from where the page last rested: moved a little (>= 5% of a section) -> next/previous
  // section, at most one section per wheel/trackpad gesture; a big non-wheel jump (scrollbar drag, Home/End)
  // -> nearest section. The glide is a scripted rAF animation instead of scrollTo({behavior:'smooth'}):
  // Safari cancels native smooth scrolls whenever a trailing momentum event arrives. "Stopped" means no
  // scroll AND no wheel event for 160ms, so the momentum tail has finished. Native mandatory snap is
  // switched off on these devices (.landing-assist in index.css) so the two don't fight; touch-first
  // devices keep native snap.
  useEffect(() => {
    if (!DESKTOP_SECTION_ASSIST) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const html = document.documentElement;
    html.classList.add('landing-assist');

    const lastIndex = SECTIONS.length - 1;
    const clampIndex = (value: number) => Math.min(lastIndex, Math.max(0, value));
    const sectionHeight = () => sentinelRefs.current[0]?.offsetHeight || window.innerHeight;

    // Where the page last came to rest. The gesture's starting point comes from here, never from reading
    // scrollY inside an input handler: with threaded scrolling the page can already have moved by then.
    let restY = Math.round(window.scrollY / sectionHeight()) * sectionHeight();
    let lastAnimatedY = restY;
    let timer: number | undefined;
    let frame = 0;
    let animating = false;
    let usedWheelOrTouch = false;

    const stopAnimation = () => {
      if (animating) restY = lastAnimatedY;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      animating = false;
    };

    const animateTo = (top: number) => {
      stopAnimation();
      const from = window.scrollY;
      const distance = top - from;
      if (Math.abs(distance) < 1) {
        restY = top;
        return;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.scrollTo(0, top);
        restY = top;
        return;
      }

      const duration = Math.min(700, 320 + Math.abs(distance) * 0.25);
      const startedAt = performance.now();
      animating = true;
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        lastAnimatedY = from + distance * (1 - Math.pow(1 - progress, 3));
        window.scrollTo(0, lastAnimatedY);
        if (progress < 1) {
          frame = window.requestAnimationFrame(step);
        } else {
          frame = 0;
          animating = false;
          restY = top;
        }
      };
      frame = window.requestAnimationFrame(step);
    };

    const settle = () => {
      const height = sectionHeight();
      const y = window.scrollY;
      const startY = restY;
      const moved = y - startY;
      const wheelGesture = usedWheelOrTouch;
      usedWheelOrTouch = false;

      let target: number;
      if (!wheelGesture && Math.abs(moved) >= height * 1.5) {
        target = Math.round(y / height);
      } else if (moved >= height * 0.05) {
        target = Math.min(Math.ceil(y / height - 0.001), Math.floor(startY / height + 0.001) + 1);
      } else if (moved <= -height * 0.05) {
        target = Math.max(Math.floor(y / height + 0.001), Math.ceil(startY / height - 0.001) - 1);
      } else {
        target = Math.round(y / height);
      }
      animateTo(clampIndex(target) * height);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 160);
    };

    const onUserInput = (viaWheelOrTouch: boolean) => {
      stopAnimation();
      if (viaWheelOrTouch) usedWheelOrTouch = true;
      schedule();
    };
    const onWheel = () => onUserInput(true);
    const onTouchStart = () => onUserInput(true);
    const onKeyDown = () => onUserInput(false);
    const onScroll = () => {
      if (animating) return;
      schedule();
    };
    const onResize = () => {
      restY = window.scrollY;
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      stopAnimation();
      html.classList.remove('landing-assist');
    };
  }, []);

  const trackCta = (source: string) => {
    trackEvent('Landing CTA tapped', {
      source,
      ...(analyticsContextRef.current ?? {}),
    });
    trackMetaPixelEvent('Lead', { source });
  };

  return (
    <div className="relative bg-[#D3FF48] text-black">
      <LandingHeader
        onDownload={() => {
          trackCta('header');
          onHeaderTryNow();
        }}
      />

      <main className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col">
          {SECTIONS.map((section, index) => (
            <div
              key={`${section.id}-slot`}
              ref={(node) => {
                sentinelRefs.current[index] = node;
              }}
              data-landing-index={index}
              className="landing-section landing-snap-slot w-full shrink-0"
            />
          ))}
        </div>

        {SECTIONS.map((section, index) => (
          <LandingSectionView
            key={section.id}
            section={section}
            index={index}
            isActive={activeIndex === index}
            shouldLoadDemo={index <= furthestIndex + 1}
          >
            {index === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    trackCta('hero_primary');
                    onFloatingTryNow();
                  }}
                  className="mt-9 inline-flex transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 lg:mt-12"
                  aria-label="Download on the App Store"
                >
                  <img
                    src="/landing-assets/app-store-download.avif"
                    alt="Download on the App Store"
                    className="h-[52px] w-auto rounded-[14px] object-contain shadow-[0_16px_40px_rgba(0,0,0,0.42)] sm:h-[60px]"
                    draggable={false}
                  />
                </button>
                {SHOW_HOME_SOCIALS ? <LandingFooter onOpenFounderLetter={onOpenFounderLetter} /> : null}
              </>
            ) : null}
          </LandingSectionView>
        ))}
      </main>
    </div>
  );
}

function LandingHeader({ onDownload }: { onDownload: () => void }) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-black/10 bg-white/70 py-2 pl-4 pr-2 backdrop-blur-md sm:pl-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/vibinn-logo-icon.png"
            alt=""
            className="h-7 w-7 rotate-[-8deg] object-contain"
            draggable={false}
          />
          <div className="landing-bbh-bartle text-[0.92rem] leading-none text-black">Vibinn</div>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-full bg-black px-4 py-2.5 text-sm font-semibold leading-none text-white transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:px-5"
        >
          Download
        </button>
      </div>
    </header>
  );
}

function LandingSectionView({
  section,
  index,
  isActive,
  shouldLoadDemo,
  children,
}: {
  section: LandingSection;
  index: number;
  isActive: boolean;
  shouldLoadDemo: boolean;
  children?: ReactNode;
}) {
  const isHome = index === 0;
  const headingId = `landing-${section.id}-title`;
  const headlineText = section.headline.map((line) => line.text).join(' ');
  const HeadingTag = isHome ? 'h1' : 'h2';

  return (
    <section
      aria-labelledby={headingId}
      className={`landing-section sticky top-0 w-full overflow-hidden ${section.surfaceClass} ${
        isHome ? '' : 'rounded-t-[2rem] shadow-[0_-18px_40px_rgba(0,0,0,0.18)]'
      }`}
      style={{ zIndex: index + 1 }}
    >
      <div className="landing-section-inner mx-auto flex h-full w-full max-w-6xl flex-col gap-4 px-6 pt-[5.5rem] sm:px-10 lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-10 lg:pt-24">
        <div className="shrink-0 text-center lg:flex lg:flex-col lg:items-start lg:justify-center lg:text-left">
          <HeadingTag
            id={headingId}
            aria-label={headlineText}
            className={`font-extrabold tracking-[-0.03em] [word-spacing:0.08em] ${
              isHome ? 'leading-[0.94]' : 'leading-[1]'
            }`}
          >
            {section.headline.map((line, lineIndex) => (
              <span
                key={line.text}
                aria-hidden="true"
                className={`block ${lineIndex > 0 ? 'mt-2 lg:mt-3' : ''} ${line.nowrap ? 'whitespace-nowrap' : 'text-balance'} ${line.sizeClass} ${
                  line.accent
                    ? `landing-bbh-bartle font-normal leading-[0.92] tracking-normal ${section.accentClass}`
                    : ''
                }`}
              >
                {line.text}
              </span>
            ))}
          </HeadingTag>
          <p
            className={`mx-auto mt-3 max-w-md text-[0.98rem] font-medium leading-snug sm:text-lg lg:mx-0 lg:mt-5 lg:max-w-lg lg:text-xl ${section.subClass}`}
          >
            {section.subheadline}
          </p>
          {children ? <div className="flex flex-col items-center lg:items-start">{children}</div> : null}
        </div>

        <div className="relative flex min-h-0 flex-1 items-end justify-center lg:items-center">
          <PhoneDemo
            src={section.demoSrc}
            isActive={isActive}
            shouldLoad={shouldLoadDemo}
            tone={section.tone}
            stickers={section.stickers}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Animated image (GIF/WebP) that restarts from its first frame every time `animate` turns on, in every
 * browser. Browsers share the decoded animation between <img> elements that use the same URL, so
 * remounting the element does not reliably restart it (Safari in particular). Instead the file is fetched
 * once and each activation gets a brand-new object URL, which is always decoded from frame 0 without
 * downloading again. While inactive, a still of the first frame is shown, so nothing animates behind the
 * stacked sections and a section that is being revealed already shows its opening frame.
 */
function RestartingImage({
  src,
  animate,
  onReady,
  onError,
  className,
}: {
  src: string;
  animate: boolean;
  onReady: () => void;
  onError: () => void;
  className: string;
}) {
  const blobRef = useRef<Blob | null>(null);
  const [blobReady, setBlobReady] = useState(false);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdStill: string | null = null;

    (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        blobRef.current = blob;

        try {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          bitmap.close();
          const still = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
          if (still && !cancelled) {
            createdStill = URL.createObjectURL(still);
            setStillUrl(createdStill);
          }
        } catch {
          // No still available: the animation itself is shown instead whenever it is allowed to play.
        }
        if (!cancelled) setBlobReady(true);
      } catch {
        if (!cancelled) onError();
      }
    })();

    return () => {
      cancelled = true;
      if (createdStill) URL.revokeObjectURL(createdStill);
    };
    // onError only flips a flag in the parent; it must not restart the download.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (!animate || !blobReady || !blobRef.current) {
      setPlayUrl(null);
      return;
    }
    const url = URL.createObjectURL(blobRef.current);
    setPlayUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [animate, blobReady]);

  const shown = playUrl ?? stillUrl;
  if (!shown) return null;

  return <img src={shown} alt="" draggable={false} onLoad={onReady} onError={onError} className={className} />;
}

function PhoneDemo({
  src,
  isActive,
  shouldLoad,
  tone,
  stickers,
}: {
  src: string;
  isActive: boolean;
  shouldLoad: boolean;
  tone: SectionTone;
  stickers: StickerSpec[];
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isImage = /\.(gif|webp|apng)(\?.*)?$/i.test(src);

  // Restart from the first frame every time the section comes into view, pause while it isn't.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // loadeddata can fire before React has attached its listener (fast/cached files), so also
    // reconcile from the element's own state here and on canplay/playing below.
    if (video.readyState >= 2) setReady(true);
    if (isActive && !prefersReducedMotion) {
      video.muted = true;
      video.currentTime = 0;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive, prefersReducedMotion, shouldLoad, failed]);

  return (
    <div className="relative aspect-[9/19.5] h-full max-h-[min(46rem,134vw)]">
      <div
        className={`relative h-full w-full rounded-[17%/8%] bg-[#111] p-[3%] shadow-[0_30px_70px_rgba(0,0,0,0.35)] ring-[3px] ${
          tone === 'dark' ? 'ring-white/25' : 'ring-black'
        }`}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[14%/6.6%] bg-neutral-900">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-neutral-800 to-neutral-950 text-center">
            <img
              src="/brand/vibinn-logo-icon.png"
              alt=""
              className="h-[16%] w-auto rotate-[-8deg] object-contain opacity-90"
              draggable={false}
            />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/40">Demo</span>
          </div>

          {shouldLoad && !failed ? (
            isImage ? (
              <RestartingImage
                src={src}
                animate={isActive && !prefersReducedMotion}
                onReady={() => setReady(true)}
                onError={() => setFailed(true)}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  ready ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              <video
                ref={videoRef}
                src={src}
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                tabIndex={-1}
                aria-hidden="true"
                onLoadedData={() => setReady(true)}
                onCanPlay={() => setReady(true)}
                onPlaying={() => setReady(true)}
                onError={() => setFailed(true)}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  ready ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )
          ) : null}

          {/* Screen recordings from iPhones with a Dynamic Island include the expanded island with the red
              recording dot; the black pill grows to cover it. Without media it stays a normal-sized island. */}
          <div
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black transition-all duration-300 ${
              shouldLoad && ready && !failed ? 'top-[1.2%] h-[5%] w-[47%]' : 'top-[1.8%] h-[2.6%] w-[28%]'
            }`}
          />
        </div>
      </div>

      {stickers.map((sticker, index) => (
        <img
          key={`${sticker.file}-${sticker.className}`}
          src={`/landing-assets/stickers/${sticker.file}.png`}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className={`landing-sticker pointer-events-none absolute select-none drop-shadow-[0_14px_22px_rgba(0,0,0,0.25)] ${sticker.className}`}
          style={
            {
              '--r': `${sticker.rotate}deg`,
              '--fx': `${index % 2 === 0 ? 3 : -3}px`,
              '--fy': `${-(7 + (index % 3) * 2)}px`,
              '--fr': `${index % 2 === 0 ? 2 : -2}deg`,
              '--fd': `${5 + (index % 4) * 0.8}s`,
              '--fdelay': `${-index * 1.1}s`,
              // Sections stacked underneath the active one are not visible, so don't animate them.
              animationPlayState: isActive ? 'running' : 'paused',
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function LandingFooter({ onOpenFounderLetter }: { onOpenFounderLetter?: () => void }) {
  return (
    <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-3 lg:mt-7 lg:justify-start">
      {socialLinks.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-white/75 text-black shadow-[3px_3px_0_#000] transition-transform duration-200 hover:-translate-y-0.5 sm:h-11 sm:w-11"
        >
          {link.icon}
        </a>
      ))}
      {onOpenFounderLetter ? (
        <button
          type="button"
          onClick={onOpenFounderLetter}
          className="ml-1 text-sm font-semibold text-black/70 underline decoration-black/30 underline-offset-4 transition-colors hover:text-black"
        >
          A letter from the founder
        </button>
      ) : null}
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
