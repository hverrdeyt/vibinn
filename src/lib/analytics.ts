type MixpanelModule = typeof import('mixpanel-browser');
type MixpanelInstance = MixpanelModule['default'];

const MIXPANEL_TOKEN = (import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined)?.trim() || 'ce8a43e3dc710572335d8e1e597f86b3';
const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() || 'G-2KMTP559T7';
const isMixpanelEnabled = Boolean(MIXPANEL_TOKEN) && typeof window !== 'undefined';
const isGoogleAnalyticsEnabled = Boolean(GA_MEASUREMENT_ID) && typeof window !== 'undefined';

let mixpanelPromise: Promise<MixpanelInstance | null> | null = null;
let mixpanelInstance: MixpanelInstance | null = null;
let hasInitialized = false;
let hasInitializedGoogleAnalytics = false;

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
            autocapture: false,
            record_sessions_percent: 100,
          });
          hasInitialized = true;
        }

        mixpanelInstance = mixpanel;
        flushQueuedTasks(mixpanel);
        return mixpanel;
      })
      .catch(() => null);
  }

  return mixpanelPromise;
}

function enqueueTask(task: AnalyticsTask) {
  if (!isMixpanelEnabled) return;
  if (mixpanelInstance) {
    task(mixpanelInstance);
    return;
  }
  queuedTasks.push(task);
  void loadMixpanel();
}

function injectGoogleAnalyticsScript() {
  if (!isGoogleAnalyticsEnabled || typeof document === 'undefined') return;
  if (document.querySelector(`script[data-ga-id="${GA_MEASUREMENT_ID}"]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  script.dataset.gaId = GA_MEASUREMENT_ID;
  document.head.appendChild(script);
}

function ensureGoogleAnalytics() {
  if (!isGoogleAnalyticsEnabled || typeof window === 'undefined') return;
  if (hasInitializedGoogleAnalytics) return;

  injectGoogleAnalyticsScript();
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
  });
  hasInitializedGoogleAnalytics = true;
}

function normalizeGoogleAnalyticsEventName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'event';
}

function toGoogleAnalyticsProperties(properties?: Record<string, unknown>) {
  if (!properties) return undefined;

  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [
        key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40),
        Array.isArray(value) ? value.join(',') : value,
      ])
      .filter(([key, value]) => key && value !== undefined && value !== null),
  );
}

export function analyticsEnabled() {
  return isMixpanelEnabled || isGoogleAnalyticsEnabled;
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;

  ensureGoogleAnalytics();
  if (!isMixpanelEnabled) return;

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
  if (isGoogleAnalyticsEnabled && typeof window !== 'undefined') {
    ensureGoogleAnalytics();
    window.gtag?.('event', normalizeGoogleAnalyticsEventName(eventName), toGoogleAnalyticsProperties(properties));
  }

  enqueueTask((mixpanel) => {
    mixpanel.track(eventName, properties);
  });
}

export function trackPageView(path: string, title?: string) {
  if (!isGoogleAnalyticsEnabled || typeof window === 'undefined') return;
  ensureGoogleAnalytics();
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  });
}

export function identifyAnalyticsUser(user: {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
}) {
  if (isGoogleAnalyticsEnabled && typeof window !== 'undefined') {
    ensureGoogleAnalytics();
    window.gtag?.('set', 'user_properties', {
      username: user.username,
      display_name: user.displayName ?? user.username,
      email: user.email,
    });
  }

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
  if (isGoogleAnalyticsEnabled && typeof window !== 'undefined') {
    ensureGoogleAnalytics();
    window.gtag?.('set', 'user_properties', {
      username: undefined,
      display_name: undefined,
      email: undefined,
    });
  }

  enqueueTask((mixpanel) => {
    mixpanel.reset();
  });
}
