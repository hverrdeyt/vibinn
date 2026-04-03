import { type ReactNode } from 'react';

interface DetailActionBarProps {
  primaryActive?: boolean;
  primaryLabel: string;
  primaryActiveLabel?: string;
  primaryIcon: ReactNode;
  onPrimary: () => void;
  secondaryLabel: string;
  secondaryIcon: ReactNode;
  onSecondary: () => void;
  secondaryDisabled?: boolean;
}

export default function DetailActionBar({
  primaryActive = false,
  primaryLabel,
  primaryActiveLabel,
  primaryIcon,
  onPrimary,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
  secondaryDisabled = false,
}: DetailActionBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-5 z-40 mx-auto w-[calc(100%-2rem)] max-w-[24rem] rounded-full border border-white/10 bg-black/88 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrimary}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition ${
            primaryActive
              ? 'border border-accent bg-accent text-dark hover:brightness-105'
              : 'bg-accent text-dark hover:brightness-105'
          }`}
        >
          {primaryIcon}
          {primaryActive ? (primaryActiveLabel ?? primaryLabel) : primaryLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          disabled={secondaryDisabled}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-black transition ${
            secondaryDisabled
              ? 'border border-white/10 bg-white/6 text-white/40'
              : 'border border-white/10 bg-white/8 text-white hover:bg-white/12'
          }`}
        >
          {secondaryIcon}
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
