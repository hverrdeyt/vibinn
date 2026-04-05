import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { type Interest, type Vibe } from '../types';
import { api, ApiError } from '../lib/api';
import { trackEvent } from '../lib/analytics';

function handleOnboardingImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackLabel = (label?.trim() || 'Vibe').replace(/\s+/g, '+');
  const fallbackUrl = `https://placehold.co/1200x1600/111111/D3FF48?text=${encodeURIComponent(fallbackLabel)}`;
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

type OnboardingProps = {
  entryMode: 'invite' | 'preferences';
  inviteCode: string;
  setInviteCode: Dispatch<SetStateAction<string>>;
  isInviteValid: boolean;
  onInviteSubmit: () => void;
  selectedInterests: Interest[];
  setSelectedInterests: Dispatch<SetStateAction<Interest[]>>;
  selectedVibe: Vibe | null;
  setSelectedVibe: Dispatch<SetStateAction<Vibe | null>>;
  onComplete: (payload?: { selectedInterests?: Interest[]; selectedVibe?: Vibe | null }) => void;
  isValidInviteCode: (code: string) => boolean;
  unlockVisualPlaces: Array<{ id: string; image: string; name: string }>;
};

export default function Onboarding({
  entryMode,
  inviteCode,
  setInviteCode,
  isInviteValid,
  onInviteSubmit,
  selectedInterests,
  setSelectedInterests,
  selectedVibe,
  setSelectedVibe,
  onComplete,
  isValidInviteCode,
  unlockVisualPlaces,
}: OnboardingProps) {
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const choiceTitle = 'Can I get to know you first?';
  const [stage, setStage] = useState<'invite' | 'unlock' | 'choice' | 'swipe'>(
    entryMode === 'preferences' ? 'swipe' : isInviteValid ? 'choice' : 'invite',
  );
  const [step, setStep] = useState<'interests' | 'vibes'>('interests');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [typedChoiceTitle, setTypedChoiceTitle] = useState('');

  useEffect(() => {
    if (isInviteValid && stage === 'invite') {
      setStage('unlock');
    }
  }, [isInviteValid, stage]);

  useEffect(() => {
    if (stage !== 'unlock') return;
    const timeoutId = window.setTimeout(() => {
      setStage('choice');
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [stage]);

  useEffect(() => {
    if (entryMode !== 'preferences') return;
    setSelectedInterests([]);
    setSelectedVibe(null);
    setStage('swipe');
    setStep('interests');
    setCurrentCardIndex(0);
  }, [entryMode, setSelectedInterests, setSelectedVibe]);

  useEffect(() => {
    if (stage !== 'choice') {
      setTypedChoiceTitle('');
      return;
    }

    let currentIndex = 0;
    setTypedChoiceTitle('');

    const intervalId = window.setInterval(() => {
      currentIndex += 1;
      setTypedChoiceTitle(choiceTitle.slice(0, currentIndex));
      if (currentIndex >= choiceTitle.length) {
        window.clearInterval(intervalId);
      }
    }, 45);

    return () => window.clearInterval(intervalId);
  }, [choiceTitle, stage]);

  const swipeSteps = {
    interests: [
      { id: 'cafe' as Interest, title: 'Cafe hopping', desc: 'good coffee, good light, and better neighborhood energy.', img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80' },
      { id: 'culture' as Interest, title: 'Culture', desc: 'museums, old streets, and places with a story to tell.', img: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80' },
      { id: 'nature' as Interest, title: 'Nature days', desc: 'touch grass, reset the brain, keep the camera ready.', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80' },
      { id: 'party' as Interest, title: 'Nightlife & music', desc: 'city lights, live sets, and plans that start after dark.', img: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80' },
      { id: 'shopping' as Interest, title: 'Shopping & markets', desc: 'concept stores, local markets, and receipts worth keeping.', img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80' },
    ],
    vibes: [
      { id: 'aesthetic' as Vibe, title: 'Aesthetic', desc: 'camera-roll worthy and low effort to love.', img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80' },
      { id: 'solo' as Vibe, title: 'Solo', desc: 'quiet, low-pressure wandering with no group chat chaos.', img: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80' },
      { id: 'spontaneous' as Vibe, title: 'Spontaneous', desc: 'last-minute pivots, easy detours, and stories you did not plan.', img: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80' },
      { id: 'luxury' as Vibe, title: 'Luxury', desc: 'good taste, soft sheets, and not pretending otherwise.', img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80' },
      { id: 'budget' as Vibe, title: 'Budget', desc: 'great finds without burning the whole wallet.', img: 'https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=800&q=80' },
    ],
  };

  const currentCards = swipeSteps[step];
  const handleSwipe = (direction: 'right' | 'left', cardId: Interest | Vibe) => {
    const isRight = direction === 'right';
    const nextSelectedInterests = step === 'interests' && isRight
      ? (selectedInterests.includes(cardId as Interest) ? selectedInterests : [...selectedInterests, cardId as Interest].slice(-3))
      : selectedInterests;
    const nextSelectedVibe = step === 'vibes' && isRight ? cardId as Vibe : selectedVibe;

    if (isRight && step === 'interests') {
      setSelectedInterests(nextSelectedInterests);
    }

    if (isRight && step === 'vibes') {
      setSelectedVibe(nextSelectedVibe);
    }

    if (currentCardIndex < currentCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
      return;
    }

    if (step === 'interests') {
      setStep('vibes');
      setCurrentCardIndex(0);
      return;
    }

    onComplete({
      selectedInterests: nextSelectedInterests,
      selectedVibe: nextSelectedVibe,
    });
  };

  const startPreferenceFlow = () => {
    setSelectedInterests([]);
    setSelectedVibe(null);
    setStage('swipe');
    setStep('interests');
    setCurrentCardIndex(0);
  };

  if (stage === 'invite') {
    return (
      <div className="h-[100svh] overflow-y-auto bg-zinc-950 px-10 pb-10 pt-24 text-white">
        <div className="mb-12">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-lg">
            <Lock className="text-accent" size={28} />
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-[0.9] tracking-tighter">
            If you know, <br />you know.
          </h1>
          <p className="text-xl font-medium leading-snug text-white/60">
            We&apos;re still running a beta testing. If you have an invite, input the code below.
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="INVITE CODE"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.replace(/\s+/g, '').toUpperCase());
              setInviteError(null);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/6 px-5 py-5 text-xl font-mono uppercase tracking-widest text-white outline-none transition-all focus:ring-2 focus:ring-white/10"
          />
          <button
            onClick={() => {
              const normalizedInviteCode = inviteCode.trim().replace(/\s+/g, '').toUpperCase();
              if (!isValidInviteCode(normalizedInviteCode)) {
                setInviteError('That invite code does not look right.');
                return;
              }
              setInviteError(null);
              onInviteSubmit();
            }}
            disabled={!inviteCode}
            className="flex w-full items-center justify-center gap-2 py-5 text-lg btn-primary"
          >
            Verify Access <ArrowRight size={20} />
          </button>
          {inviteError ? (
            <div className="rounded-[1rem] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
              {inviteError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              trackEvent('Enter Waitlist', {
                action: showWaitlistForm ? 'hide' : 'show',
              });
              setShowWaitlistForm((current) => !current);
              setWaitlistError(null);
              setWaitlistMessage(null);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/6 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10 active:scale-[0.98]"
          >
            {showWaitlistForm ? 'Hide waitlist' : `Don't have a code? Join waitlist`}
          </button>

          {showWaitlistForm ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
              <div className="text-sm font-black text-white">Join the beta waitlist</div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-white/55">
                Drop your email and we&apos;ll reach out when we open more spots.
              </p>
              <input
                type="email"
                value={waitlistEmail}
                onChange={(event) => {
                  setWaitlistEmail(event.target.value.replace(/\s+/g, ''));
                  setWaitlistError(null);
                }}
                placeholder="you@email.com"
                className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
              />
              {waitlistError ? (
                <div className="mt-3 rounded-[1rem] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
                  {waitlistError}
                </div>
              ) : null}
              {waitlistMessage ? (
                <div className="mt-3 rounded-[1rem] border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
                  {waitlistMessage}
                </div>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  setIsJoiningWaitlist(true);
                  setWaitlistError(null);
                  setWaitlistMessage(null);
                  try {
                    await api.joinWaitlist({ email: waitlistEmail, source: 'invite-gate' });
                    trackEvent('Submit Waitlist', {
                      source: 'invite-gate',
                    });
                    setWaitlistMessage(`You're on the list.`);
                    setWaitlistEmail('');
                  } catch (error) {
                    setWaitlistError(
                      error instanceof ApiError && error.status === 404
                        ? 'Waitlist is not live yet. Try again after the local backend restarts.'
                        : error instanceof ApiError
                          ? error.message
                          : 'Could not join the waitlist right now.',
                    );
                  } finally {
                    setIsJoiningWaitlist(false);
                  }
                }}
                disabled={!waitlistEmail.trim() || isJoiningWaitlist}
                className={`mt-4 w-full rounded-xl px-5 py-4 text-sm font-black uppercase tracking-[0.14em] transition ${
                  waitlistEmail.trim() && !isJoiningWaitlist ? 'bg-accent text-dark hover:brightness-105' : 'bg-white/10 text-white/35'
                }`}
              >
                {isJoiningWaitlist ? 'Joining...' : 'Join waitlist'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (stage === 'choice') {
    const isChoiceIntroReady = typedChoiceTitle.length === choiceTitle.length;

    return (
      <div className="flex h-[100svh] flex-col bg-zinc-950 p-10 pt-32 text-white">
        <div className="mb-16">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-lg">
            <Sparkles className="text-accent" size={28} />
          </div>
          <h1 className="mb-6 min-h-[5.75rem] text-5xl font-extrabold leading-[0.9] tracking-tighter">
            {typedChoiceTitle}
            <span className="ml-1 inline-block h-[0.9em] w-[0.08em] animate-pulse bg-accent align-[-0.08em]" />
          </h1>
          <AnimatePresence>
            {isChoiceIntroReady ? (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="text-xl font-medium leading-snug text-white/60"
              >
                Just swipe a few picks and we&apos;ll recommend places and events that fit your vibe.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isChoiceIntroReady ? (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ delay: 0.05, duration: 0.28, ease: 'easeOut' }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={startPreferenceFlow}
                className="w-full py-5 text-lg btn-primary"
              >
                Start now
              </button>

              <button
                type="button"
                onClick={() => onComplete({ selectedInterests, selectedVibe })}
                className="w-full rounded-xl border border-white/10 bg-white/6 px-6 py-5 text-lg font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98]"
              >
                Skip
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  if (stage === 'unlock') {
    return (
      <div className="relative flex h-[100svh] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(211,255,72,0.22),_transparent_30%),linear-gradient(160deg,#120f1f_0%,#101820_42%,#071014_100%)] px-10 text-center text-white">
        <div className="pointer-events-none absolute -left-16 top-20 h-40 w-40 rounded-full bg-pink-400/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-24 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl" />
        <div className="pointer-events-none absolute bottom-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/12 blur-3xl" />

        {unlockVisualPlaces.map((item, index) => (
          <motion.div
            key={`unlock-place-${item.id}`}
            initial={{ opacity: 0, scale: 0.72, y: 24, rotate: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.22 + index * 0.18, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-none absolute ${
              [
                'left-[8%] top-[12%] w-22 -rotate-12',
                'right-[10%] top-[14%] w-24 rotate-12',
                'left-[12%] top-[34%] w-20 rotate-6',
                'right-[14%] top-[38%] w-24 -rotate-6',
                'left-[18%] bottom-[23%] w-24 -rotate-10',
                'right-[17%] bottom-[22%] w-22 rotate-9',
                'left-[38%] top-[8%] w-20 rotate-3',
                'right-[34%] bottom-[10%] w-20 -rotate-3',
              ][index] ?? 'left-[20%] top-[20%] w-20'
            }`}
          >
            <div className="overflow-hidden rounded-[1.4rem] border border-white/12 bg-black/35 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <img
                src={item.image}
                alt={item.name}
                className="h-28 w-full rounded-[1rem] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="relative z-10 rounded-[2rem] border border-accent/20 bg-accent/10 p-5 shadow-[0_20px_80px_rgba(194,243,104,0.12)]"
        >
          <Sparkles size={34} className="text-accent" />
        </motion.div>
        <motion.h1
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.16, duration: 0.36 }}
          className="relative z-10 mt-8 text-4xl font-black tracking-tighter sm:text-5xl"
        >
          Welcome to Vibinn!
        </motion.h1>
        <motion.p
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.36 }}
          className="relative z-10 mt-3 max-w-sm text-base font-medium leading-relaxed text-white/70"
        >
          Places are already bubbling up. Give us a second to open your beta flow.
        </motion.p>
      </div>
    );
  }

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden bg-dark">
      <div className="z-20 flex flex-col gap-4 p-6 pt-12">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {[0, 1].map((index) => (
              <div
                key={index}
                className={`h-1.5 w-12 rounded-full transition-all duration-500 ${
                  (step === 'interests' && index === 0) || step === 'vibes' ? 'bg-accent' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            {step === 'interests' ? 'Step 1 of 2' : 'Step 2 of 2'}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {step === 'interests' ? 'Swipe your vibe.' : 'Pick the vibe that feels most like you.'}
            </h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Swipe right to keep it. Left to skip.
            </p>
          </div>
          <button
            onClick={() => onComplete({ selectedInterests, selectedVibe })}
            className="pb-1 text-[10px] font-bold uppercase tracking-widest text-white/30 transition-colors hover:text-white"
          >
            Skip setup
          </button>
        </div>
      </div>

      <div className="relative mt-4 flex-1 px-4 pb-12">
        <AnimatePresence mode="popLayout">
          {currentCards.slice(currentCardIndex, currentCardIndex + 2).reverse().map((card, index) => {
            const isTop = index === 1 || currentCards.slice(currentCardIndex, currentCardIndex + 2).length === 1;
            return (
              <SwipeCard
                key={`${step}-${card.id}`}
                card={card}
                isTop={isTop}
                onSwipe={(dir) => handleSwipe(dir, card.id)}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SwipeCard({
  card,
  isTop,
  onSwipe,
}: {
  card: { title: string; desc: string; img: string };
  isTop: boolean;
  onSwipe: (dir: 'right' | 'left') => void;
  key?: string;
}) {
  const [exitX, setExitX] = useState(0);

  return (
    <motion.div
      style={{ x: exitX, zIndex: isTop ? 10 : 0 }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100) {
          setExitX(1000);
          onSwipe('right');
        } else if (info.offset.x < -100) {
          setExitX(-1000);
          onSwipe('left');
        }
      }}
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{
        scale: isTop ? 1 : 0.95,
        opacity: 1,
        y: isTop ? 0 : 10,
        rotate: 0,
      }}
      whileDrag={{ rotate: exitX > 0 ? 5 : -5 }}
      exit={{ x: exitX, opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      className="absolute inset-0 px-4 pb-12"
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] border border-white/10 shadow-2xl">
        <img
          src={card.img}
          alt={card.title}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={(event) => handleOnboardingImageError(event, card.title)}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        <div className="absolute bottom-0 left-0 w-full p-8 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="mb-2 text-4xl font-black leading-none tracking-tighter text-white">
              {card.title}
            </h3>
            <p className="text-lg font-medium leading-tight text-white/70">
              {card.desc}
            </p>
          </motion.div>
        </div>

        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          <div className="rounded-full border border-white/20 bg-white/10 p-3 text-white/30 backdrop-blur-md">
            <ArrowRight size={24} className="rotate-180" />
          </div>
        </div>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          <div className="rounded-full border border-accent/30 bg-accent/20 p-3 text-accent backdrop-blur-md">
            <ArrowRight size={24} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
