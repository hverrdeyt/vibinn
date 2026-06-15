import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, FileText } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

type LandingPageProps = {
  onHeaderTryNow: () => void;
  onFloatingTryNow: () => void;
  onOpenFounderLetter: () => void;
  analyticsContext?: Record<string, unknown>;
};

type StickerConfig = {
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  floatDuration?: number;
  floatDistance?: number;
};

type CTAButtonProps = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  className?: string;
};

type SocialLink = {
  href: string;
  label: string;
  icon: ReactNode;
};

const LANDING_STICKER_VERSION = '20260615b';

function withStickerVersion(path: string) {
  return `${path}?v=${LANDING_STICKER_VERSION}`;
}

const homepageStickers: StickerConfig[] = [
  { src: withStickerVersion('/homepage-stickers/auth-sticker-6.png'), alt: 'Food sticker 6', x: 12, y: 32, width: 104, height: 72, rotation: -10, floatDuration: 6.6, floatDistance: 10 },
  { src: withStickerVersion('/homepage-stickers/auth-sticker-2.png'), alt: 'Food sticker 2', x: 294, y: 18, width: 92, height: 68, rotation: 11, floatDuration: 7.2, floatDistance: 11 },
  { src: withStickerVersion('/homepage-stickers/auth-sticker-4.png'), alt: 'Food sticker 4', x: -8, y: 224, width: 132, height: 92, rotation: -8, floatDuration: 6.8, floatDistance: 12 },
  { src: withStickerVersion('/homepage-stickers/auth-sticker-5.png'), alt: 'Food sticker 5', x: 286, y: 256, width: 124, height: 96, rotation: 6, floatDuration: 6.4, floatDistance: 10 },
  { src: withStickerVersion('/homepage-stickers/auth-sticker-3.png'), alt: 'Food sticker 3', x: 28, y: 612, width: 94, height: 72, rotation: -7, floatDuration: 7.1, floatDistance: 9 },
  { src: withStickerVersion('/homepage-stickers/auth-sticker-7.png'), alt: 'Food sticker 7', x: 284, y: 638, width: 96, height: 86, rotation: 8, floatDuration: 6.9, floatDistance: 11 },
];

const referenceFrame = { width: 402, height: 871 };

const socialLinks: SocialLink[] = [
  {
    href: 'https://www.tiktok.com/@vibinnapp',
    label: 'TikTok',
    icon: <TikTokIcon />,
  },
  {
    href: 'https://www.instagram.com/vibinnapp',
    label: 'Instagram',
    icon: <InstagramIcon />,
  },
  {
    href: 'https://www.threads.com/@vibinnapp',
    label: 'Threads',
    icon: <ThreadsIcon />,
  },
];

export default function LandingPage({
  onHeaderTryNow,
  onFloatingTryNow,
  onOpenFounderLetter,
  analyticsContext,
}: LandingPageProps) {
  const analyticsContextRef = useRef<Record<string, unknown> | undefined>(analyticsContext);

  useEffect(() => {
    analyticsContextRef.current = analyticsContext;
  }, [analyticsContext]);

  useEffect(() => {
    trackEvent('Visit landing page', analyticsContextRef.current);
  }, []);

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#D3FF48] text-black">
      <LandingHeader onCta={onHeaderTryNow} />

      <section className="relative min-h-[100svh] overflow-hidden px-6 pb-12 pt-28 sm:px-10 sm:pt-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.36),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(0,0,0,0.08),_transparent_38%)]" />
          {homepageStickers.map((sticker) => (
            <motion.img
              key={sticker.src}
              src={sticker.src}
              alt={sticker.alt}
              draggable={false}
              className="landing-sticker absolute select-none object-contain"
              style={{
                left: `${(sticker.x / referenceFrame.width) * 100}%`,
                top: `${(sticker.y / referenceFrame.height) * 100}%`,
                width: `${(sticker.width / referenceFrame.width) * 100}%`,
                maxWidth: `${sticker.width}px`,
                transform: `rotate(${sticker.rotation}deg)`,
                filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.18))',
              }}
              animate={{
                y: [0, -(sticker.floatDistance ?? 12), 0],
                rotate: [sticker.rotation, sticker.rotation + 1.4, sticker.rotation],
              }}
              transition={{
                duration: sticker.floatDuration ?? 6.8,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-6xl flex-col items-center justify-center">
          <div className="max-w-3xl text-center">
            <span className="inline-flex rotate-[-4deg] rounded-full border-2 border-black/85 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0_#000]">
              your food diary
            </span>
            <h1 className="mx-auto mt-5 max-w-[11ch] text-balance text-[2.7rem] font-black leading-[0.92] tracking-[-0.08em] text-black sm:text-[4.3rem]">
              Every meal.{' '}
              <span className="landing-bbh-bartle inline-block text-[0.8em]">
                Remembered
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-relaxed text-black/72 sm:text-2xl">
              Snap, rate, save — your entire food journey in one place.
            </p>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:items-center">
              <CTAButton
                label="Start your food diary"
                onClick={() => {
                  trackEvent('Landing CTA tapped', {
                    source: 'hero_primary',
                    ...(analyticsContextRef.current ?? {}),
                  });
                  onFloatingTryNow();
                }}
                icon={<span className="text-base leading-none"></span>}
              />
              <CTAButton
                label="A letter from founder"
                onClick={() => {
                  trackEvent('Landing CTA tapped', {
                    source: 'hero_founder_letter',
                    ...(analyticsContextRef.current ?? {}),
                  });
                  onOpenFounderLetter();
                }}
                variant="secondary"
                icon={<FileText size={15} />}
                className="bg-transparent"
              />
            </div>
          </div>

          <LandingFooter />
        </div>
      </section>
    </div>
  );
}

function LandingHeader({ onCta }: { onCta: () => void }) {
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

function CTAButton({ label, onClick, variant = 'primary', icon, className = '' }: CTAButtonProps) {
  const base = variant === 'primary'
    ? 'border-black bg-black text-[#D3FF48]'
    : 'border-black bg-white/78 text-black';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 text-sm font-black tracking-[-0.03em] shadow-[4px_4px_0_#000] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${base} ${className}`}
    >
      {icon ?? <ArrowRight size={16} />}
      <span>{label}</span>
    </button>
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
