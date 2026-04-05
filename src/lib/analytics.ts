type MixpanelModule = typeof import('mixpanel-browser');
type MixpanelInstance = MixpanelModule['default'];

const MIXPANEL_TOKEN = (import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined)?.trim() || 'ce8a43e3dc710572335d8e1e597f86b3';
const isMixpanelEnabled = Boolean(MIXPANEL_TOKEN) && typeof window !== 'undefined';

let mixpanelPromise: Promise<MixpanelInstance | null> | null = null;
let hasInitialized = false;

type AnalyticsTask = (mixpanel: MixpanelInstance) => void;
const queuedTasks: AnalyticsTask[] = [];

function flushQueuedTasks(mixpanel: MixpanelInstance) {
  while (queuedTasks.length > 0) {
    const task = queuedTasks.shift();
    if (!task) continue;
    task(mixpanel);
  }
}

async function loadMixpanel() {
  if (!isMixpanelEnabled) return null;
  if (!mixpanelPromise) {
    mixpanelPromise = import('mixpanel-browser')
      .then((module) => {
        const mixpanel = module.default;

        if (!hasInitialized) {
          mixpanel.init(MIXPANEL_TOKEN as string, {
            autocapture: true,
            record_sessions_percent: 100,
          });
          hasInitialized = true;
        }

        flushQueuedTasks(mixpanel);
        return mixpanel;
      })
      .catch(() => null);
  }

  return mixpanelPromise;
}

function enqueueTask(task: AnalyticsTask) {
  if (!isMixpanelEnabled) return;
  queuedTasks.push(task);
  void loadMixpanel();
}

export function analyticsEnabled() {
  return isMixpanelEnabled;
}

export function initAnalytics() {
  if (!isMixpanelEnabled) return;
  if (typeof window === 'undefined') return;

  const scheduleLoad = () => {
    void loadMixpanel();
  };

  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number })
      .requestIdleCallback(scheduleLoad, { timeout: 1500 });
    return;
  }

  globalThis.setTimeout(scheduleLoad, 600);
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  enqueueTask((mixpanel) => {
    mixpanel.track(eventName, properties);
  });
}

export function trackScreenView(screen: string, properties?: Record<string, unknown>) {
  trackEvent('Screen Viewed', {
    screen,
    ...properties,
  });
}

export function identifyAnalyticsUser(user: {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
}) {
  enqueueTask((mixpanel) => {
    mixpanel.identify(user.id);
    mixpanel.people.set({
      $name: user.displayName ?? user.username,
      $email: user.email,
      username: user.username,
    });
  });
}

export function resetAnalyticsUser() {
  enqueueTask((mixpanel) => {
    mixpanel.reset();
  });
}
