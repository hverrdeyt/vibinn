import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ExternalLink } from 'lucide-react';
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

const homepageStickers: StickerConfig[] = [
  { src: '/homepage-stickers/auth-sticker-6.png', alt: 'Food sticker 6', x: 13, y: 2, width: 151, height: 100, rotation: -9, floatDuration: 6.6, floatDistance: 12 },
  { src: '/homepage-stickers/auth-sticker-2.png', alt: 'Food sticker 2', x: 213, y: 0, width: 137, height: 92, rotation: 8, floatDuration: 7.2, floatDistance: 12 },
  { src: '/homepage-stickers/auth-sticker-4.png', alt: 'Food sticker 4', x: -10, y: 126, width: 178, height: 118, rotation: -7, floatDuration: 6.8, floatDistance: 14 },
  { src: '/homepage-stickers/auth-sticker-5.png', alt: 'Food sticker 5', x: 4, y: 310, width: 148, height: 104, rotation: -7, floatDuration: 6.4, floatDistance: 11 },
  { src: '/homepage-stickers/auth-sticker-3.png', alt: 'Food sticker 3', x: 288, y: 104, width: 118, height: 82, rotation: 7, floatDuration: 7.1, floatDistance: 10 },
  { src: '/homepage-stickers/auth-sticker-7.png', alt: 'Food sticker 7', x: 244, y: 286, width: 160, height: 108, rotation: 6, floatDuration: 6.9, floatDistance: 13 },
];

const referenceFrame = { width: 402, height: 871 };

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
            <HomepageSticker key={sticker.src} sticker={sticker} />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-6xl items-center justify-center">
          <div className="max-w-3xl text-center">
            <span className="inline-flex rotate-[-4deg] rounded-full border-2 border-black/85 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0_#000]">
              your food diary
            </span>
            <h1 className="mx-auto mt-5 max-w-[11ch] text-balance text-[2.7rem] font-black leading-[0.9] tracking-[-0.08em] text-black sm:text-[4.6rem]">
              Every meal.{' '}
              <span className="landing-bbh-bartle inline-block rotate-[5deg]">
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
                icon={<ExternalLink size={15} />}
                className="bg-transparent"
              />
            </div>
          </div>
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

function HomepageSticker({ sticker }: { sticker: StickerConfig }) {
  return (
    <motion.img
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
