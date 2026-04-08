import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { type Interest, type Vibe } from '../types';
import { api } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { isNativeApp } from '../lib/native';

type SavedLocationOption = {
  id: string;
  label: string;
  type: 'city' | 'province' | 'country';
  googlePlaceId?: string;
};

function handleOnboardingImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackLabel = (label?.trim() || 'Vibe').replace(/\s+/g, '+');
  const fallbackUrl = `https://placehold.co/1200x1600/111111/D3FF48?text=${encodeURIComponent(fallbackLabel)}`;
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

type OnboardingProps = {
  entryMode: 'area-first' | 'choice' | 'swipe-direct';
  selectedInterests: Interest[];
  setSelectedInterests: Dispatch<SetStateAction<Interest[]>>;
  selectedVibe: Vibe | null;
  setSelectedVibe: Dispatch<SetStateAction<Vibe | null>>;
  savedLocations: SavedLocationOption[];
  activeLocationId: string;
  onSelectInitialLocation: (locationId: string) => void;
  onAddInitialLocation: (location: SavedLocationOption) => void | Promise<void>;
  onComplete: (payload?: { selectedInterests?: Interest[]; selectedVibe?: Vibe | null; activeLocationId?: string }) => void;
  analyticsContext?: Record<string, unknown>;
};

export default function Onboarding({
  entryMode,
  selectedInterests,
  setSelectedInterests,
  selectedVibe,
  setSelectedVibe,
  savedLocations,
  activeLocationId,
  onSelectInitialLocation,
  onAddInitialLocation,
  onComplete,
  analyticsContext,
}: OnboardingProps) {
  const nativeApp = isNativeApp();
  const hasPreferences = selectedInterests.length > 0 || !!selectedVibe;
  const choiceTitle = 'Can I get to know you first?';
  const areaTitle = 'Where are you planning to go?';
  const [stage, setStage] = useState<'area' | 'choice' | 'swipe'>(
    entryMode === 'swipe-direct' ? 'swipe' : entryMode === 'choice' ? 'choice' : 'area',
  );
  const [step, setStep] = useState<'interests' | 'vibes'>('interests');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [typedChoiceTitle, setTypedChoiceTitle] = useState('');
  const [typedAreaTitle, setTypedAreaTitle] = useState('');
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<SavedLocationOption[]>([]);
  const [isAreaSearching, setIsAreaSearching] = useState(false);
  const [isAreaPickerOpen, setIsAreaPickerOpen] = useState(false);
  const previousEntryModeRef = useRef(entryMode);
  const activeLocation = savedLocations.find((location) => location.id === activeLocationId) ?? null;
  const onboardingEventBase = {
    ...analyticsContext,
    entry_mode: entryMode,
    active_location_id: activeLocationId,
    active_location_label: activeLocation?.label ?? null,
    active_location_type: activeLocation?.type ?? null,
    selected_interests_count: selectedInterests.length,
    selected_vibe: selectedVibe,
  };

  useEffect(() => {
    if (previousEntryModeRef.current === entryMode) return;
    previousEntryModeRef.current = entryMode;
    setStage(entryMode === 'swipe-direct' ? 'swipe' : entryMode === 'choice' ? 'choice' : 'area');
    setStep('interests');
    setCurrentCardIndex(0);
  }, [entryMode]);

  useEffect(() => {
    if (stage !== 'area') {
      setTypedAreaTitle('');
      return;
    }

    let currentIndex = 0;
    setTypedAreaTitle('');

    const intervalId = window.setInterval(() => {
      currentIndex += 1;
      setTypedAreaTitle(areaTitle.slice(0, currentIndex));
      if (currentIndex >= areaTitle.length) {
        window.clearInterval(intervalId);
      }
    }, 45);

    return () => window.clearInterval(intervalId);
  }, [areaTitle, stage]);

  useEffect(() => {
    if (stage !== 'area') return;
    if (areaQuery.trim().length < 3) {
      setAreaResults([]);
      setIsAreaSearching(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsAreaSearching(true);
      void api.lookupLocations(areaQuery.trim())
        .then((response) => {
          const existingKeys = new Set(
            savedLocations.map((location) => `${location.type}:${location.label.trim().toLowerCase()}`),
          );
          setAreaResults(
            (response.locations as SavedLocationOption[]).filter((location) => (
              !existingKeys.has(`${location.type}:${location.label.trim().toLowerCase()}`)
            )),
          );
        })
        .catch(() => {
          setAreaResults([]);
        })
        .finally(() => {
          setIsAreaSearching(false);
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [areaQuery, savedLocations, stage]);

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
      activeLocationId,
    });
  };

  const startPreferenceFlow = () => {
    setSelectedInterests([]);
    setSelectedVibe(null);
    setStage('swipe');
    setStep('interests');
    setCurrentCardIndex(0);
  };

  if (stage === 'choice') {
    const isChoiceIntroReady = typedChoiceTitle.length === choiceTitle.length;

    return (
      <div className="app-viewport-screen flex flex-col overflow-hidden bg-zinc-950 p-10 pt-24 text-white">
        <div className="mb-12 shrink-0">
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
                transition={{ duration: nativeApp ? 0.18 : 0.28, ease: 'easeOut' }}
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
              transition={{ delay: nativeApp ? 0.02 : 0.05, duration: nativeApp ? 0.18 : 0.28, ease: 'easeOut' }}
              className="mt-auto space-y-4 pb-2"
            >
              <button
                type="button"
                onClick={() => {
                  trackEvent('Start preferences', onboardingEventBase);
                  startPreferenceFlow();
                }}
                className="w-full py-5 text-lg btn-primary"
              >
                Start now
              </button>

              <button
                type="button"
                onClick={() => {
                  trackEvent('Skip preferences', onboardingEventBase);
                  onComplete({ selectedInterests, selectedVibe, activeLocationId });
                }}
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

  if (stage === 'area') {
    const isAreaIntroReady = typedAreaTitle.length === areaTitle.length;

    return (
      <div className="app-viewport-screen flex flex-col overflow-hidden bg-zinc-950 p-10 pb-10 pt-24 text-white">
        <div className="mb-10 shrink-0">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-lg">
            <Sparkles className="text-accent" size={28} />
          </div>
          <h1 className="mb-6 min-h-[5.75rem] text-5xl font-extrabold leading-[0.9] tracking-tighter">
            {typedAreaTitle}
            <span className="ml-1 inline-block h-[0.9em] w-[0.08em] animate-pulse bg-accent align-[-0.08em]" />
          </h1>
          <AnimatePresence>
            {isAreaIntroReady ? (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: nativeApp ? 0.18 : 0.28, ease: 'easeOut' }}
                className="text-xl font-medium leading-snug text-white/60"
              >
                Pick the area first, then we&apos;ll shape the recommendations around where you&apos;re heading.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isAreaIntroReady ? (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ delay: nativeApp ? 0.02 : 0.05, duration: nativeApp ? 0.18 : 0.28, ease: 'easeOut' }}
              className="flex min-h-0 flex-1 flex-col space-y-5"
            >
              <div className="shrink-0">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Area</div>
                <div className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-white/10 bg-white/6 px-5 py-5">
                  <div className="min-w-0">
                    <div className="text-2xl font-black tracking-[-0.05em] text-accent">
                      {activeLocation?.label ?? 'Boston'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                      {activeLocation?.type ?? 'city'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAreaPickerOpen(true)}
                    className="shrink-0 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/12"
                  >
                    Change
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (entryMode === 'area-first') {
                    setSelectedInterests([]);
                    setSelectedVibe(null);
                    onComplete({ selectedInterests: [], selectedVibe: null, activeLocationId });
                    return;
                  }

                  setStage('choice');
                }}
                className="mt-auto w-full shrink-0 py-5 text-lg btn-primary"
              >
                {entryMode === 'area-first' ? 'Show picks' : 'Continue'}
              </button>

              <AnimatePresence>
                {isAreaPickerOpen ? (
                  <>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsAreaPickerOpen(false)}
                      className="fixed inset-0 z-40 bg-black/65"
                    />
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', stiffness: nativeApp ? 360 : 280, damping: nativeApp ? 36 : 30 }}
                      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[32px] border border-white/10 bg-zinc-900 px-4 pt-4 pb-8 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]"
                    >
                      <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
                      <div className="mt-5">
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
                          Change area
                        </div>
                        <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">
                          Pick where discovery starts.
                        </div>
                      </div>
                      <div className="relative mt-4">
                        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
                        <input
                          type="text"
                          value={areaQuery}
                          onChange={(event) => setAreaQuery(event.target.value)}
                          placeholder="Search Bandung, West Java, Japan..."
                          className="w-full rounded-xl border border-white/10 bg-black/20 py-4 pl-11 pr-4 text-base font-medium text-white outline-none transition placeholder:text-white/30 focus:ring-2 focus:ring-white/10"
                        />
                      </div>
                      <div className="mt-3 max-h-[50svh] space-y-2 overflow-y-auto pr-1">
                        {areaQuery.trim().length > 0 && areaQuery.trim().length < 3 ? (
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/55">
                            Type at least 3 letters to search locations.
                          </div>
                        ) : null}
                        {isAreaSearching ? (
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/55">
                            Searching locations...
                          </div>
                        ) : null}
                        {!isAreaSearching && areaQuery.trim().length >= 3 && areaResults.length === 0 ? (
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/55">
                            No location matched yet. Try another city, province, or country.
                          </div>
                        ) : null}
                        {areaQuery.trim().length >= 3 && areaResults.length > 0 ? (
                          <>
                            <div className="px-1 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                              Search results
                            </div>
                            {areaResults.map((location) => (
                              <button
                                key={location.id}
                                type="button"
                                onClick={async () => {
                                  await onAddInitialLocation(location);
                                  trackEvent('Change area onboarding', {
                                    ...onboardingEventBase,
                                    location_id: location.id,
                                    location_label: location.label,
                                    location_type: location.type,
                                  });
                                  setAreaQuery('');
                                  setAreaResults([]);
                                  setIsAreaPickerOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-left transition hover:bg-white/10"
                              >
                                <div>
                                  <div className="text-base font-black text-white">{location.label}</div>
                                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                                    {location.type}
                                  </div>
                                </div>
                                <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black">
                                  Select
                                </span>
                              </button>
                            ))}
                          </>
                        ) : null}
                        {areaQuery.trim().length < 3 ? (
                          <>
                            <div className="px-1 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                              Saved areas
                            </div>
                            {savedLocations.map((location) => {
                              const isActive = location.id === activeLocationId;
                              return (
                                <button
                                  key={location.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectInitialLocation(location.id);
                                    trackEvent('Change area onboarding', {
                                      ...onboardingEventBase,
                                      location_id: location.id,
                                      location_label: location.label,
                                      location_type: location.type,
                                    });
                                    setAreaQuery('');
                                    setIsAreaPickerOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${
                                    isActive
                                      ? 'border-accent bg-accent text-black'
                                      : 'border-white/10 bg-black/20 text-white hover:bg-white/10'
                                  }`}
                                >
                                  <div>
                                    <div className="text-base font-black">{location.label}</div>
                                    <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                      isActive ? 'text-black/60' : 'text-white/40'
                                    }`}>
                                      {location.type}
                                    </div>
                                  </div>
                                  {isActive ? (
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em]">Selected</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </>
                        ) : null}
                      </div>
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="app-viewport-screen flex flex-col overflow-hidden bg-dark">
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
              onClick={() => {
                trackEvent('Skip setup', {
                  ...onboardingEventBase,
                  swipe_step: step,
                });
                onComplete({ selectedInterests, selectedVibe, activeLocationId });
              }}
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
  const nativeApp = isNativeApp();
  const [exitDirection, setExitDirection] = useState<-1 | 0 | 1>(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const dragScale = useTransform(x, [-220, 0, 220], [0.98, 1, 0.98]);
  const swipeAffordanceOpacity = useTransform(x, [-180, -80, 0, 80, 180], [1, 0.45, 0, 0.45, 1]);
  const leftAffordanceScale = useTransform(x, [-180, -100, 0], [1.08, 1, 0.92]);
  const rightAffordanceScale = useTransform(x, [0, 100, 180], [0.92, 1, 1.08]);

  return (
    <motion.div
      style={{ x, rotate, scale: isTop ? dragScale : undefined, zIndex: isTop ? 10 : 0 }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.16}
      dragMomentum={false}
      dragTransition={{ bounceStiffness: 420, bounceDamping: 32 }}
      onDragEnd={(_, info) => {
        const shouldSwipeRight = info.offset.x > 110 || info.velocity.x > 650;
        const shouldSwipeLeft = info.offset.x < -110 || info.velocity.x < -650;

        if (shouldSwipeRight) {
          setExitDirection(1);
          onSwipe('right');
        } else if (shouldSwipeLeft) {
          setExitDirection(-1);
          onSwipe('left');
        }
      }}
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{
        scale: isTop ? 1 : 0.95,
        opacity: 1,
        y: isTop ? 0 : 10,
      }}
      whileDrag={isTop ? { cursor: 'grabbing' } : undefined}
      exit={{
        x: exitDirection === 1 ? 520 : exitDirection === -1 ? -520 : 0,
        rotate: exitDirection === 1 ? 12 : exitDirection === -1 ? -12 : 0,
        opacity: 0,
        scale: 0.92,
        transition: { duration: nativeApp ? 0.18 : 0.26, ease: 'easeOut' },
      }}
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
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/14 via-transparent to-accent/16"
          style={{ opacity: swipeAffordanceOpacity }}
        />

        <div className="absolute bottom-0 left-0 w-full p-8 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: nativeApp ? 0.08 : 0.2 }}
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
          <motion.div
            style={{ opacity: swipeAffordanceOpacity, scale: leftAffordanceScale }}
            className="rounded-full border border-white/20 bg-white/10 p-3 text-white/38 backdrop-blur-md"
          >
            <ArrowRight size={24} className="rotate-180" />
          </motion.div>
        </div>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          <motion.div
            style={{ opacity: swipeAffordanceOpacity, scale: rightAffordanceScale }}
            className="rounded-full border border-accent/30 bg-accent/20 p-3 text-accent backdrop-blur-md"
          >
            <ArrowRight size={24} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
