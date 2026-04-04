import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = (import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined)?.trim() || 'ce8a43e3dc710572335d8e1e597f86b3';
const isMixpanelEnabled = Boolean(MIXPANEL_TOKEN) && typeof window !== 'undefined';

let hasInitialized = false;

function ensureMixpanel() {
  if (!isMixpanelEnabled || hasInitialized) return;

  mixpanel.init(MIXPANEL_TOKEN as string, {
    autocapture: true,
    record_sessions_percent: 100,
  });

  hasInitialized = true;
}

export function analyticsEnabled() {
  return isMixpanelEnabled;
}

export function initAnalytics() {
  ensureMixpanel();
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!isMixpanelEnabled) return;
  ensureMixpanel();
  mixpanel.track(eventName, properties);
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
  if (!isMixpanelEnabled) return;
  ensureMixpanel();
  mixpanel.identify(user.id);
  mixpanel.people.set({
    $name: user.displayName ?? user.username,
    $email: user.email,
    username: user.username,
  });
}

export function resetAnalyticsUser() {
  if (!isMixpanelEnabled) return;
  ensureMixpanel();
  mixpanel.reset();
}
