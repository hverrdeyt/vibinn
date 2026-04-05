import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { type Place, type User } from '../types';
import { api } from '../lib/api';

function getAvatarFallbackUrl(label?: string | null) {
  const initial = (label?.trim().charAt(0) || 'V').toUpperCase();
  return `https://placehold.co/400x400/111111/D3FF48?text=${encodeURIComponent(initial)}`;
}

function handleAvatarImageError(event: { currentTarget: HTMLImageElement }, label?: string | null) {
  const fallbackUrl = getAvatarFallbackUrl(label);
  if (event.currentTarget.src === fallbackUrl) return;
  event.currentTarget.src = fallbackUrl;
}

export function NotificationsScreen({
  onBack,
  onOpenPlace,
  onOpenTraveler,
}: {
  onBack: () => void;
  onOpenPlace: (place: Place) => void;
  onOpenTraveler: (traveler: User) => void;
}) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    api.getNotifications().then((response) => setNotifications(response.notifications));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Notifications</div>
        <button
          type="button"
          onClick={() => {
            if (unreadCount === 0) return;
            void api.markAllNotificationsRead()
              .then(() => {
                setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
              })
              .catch(() => undefined);
          }}
          className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
            unreadCount > 0 ? 'bg-white text-black' : 'text-white/30'
          }`}
        >
          Read all
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">What moved in your vibe graph.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Quick updates around places and people worth checking next.</p>
      </div>

      <div className="space-y-4">
        {notifications.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              void api.markNotificationRead(item.id).catch(() => undefined);
              setNotifications((current) =>
                current.map((notification) =>
                  notification.id === item.id
                    ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
                    : notification,
                ),
              );

              if (item.type === 'place' && item.place) {
                onOpenPlace(item.place);
                return;
              }

              if (item.traveler) {
                onOpenTraveler(item.traveler);
              }
            }}
            className={`w-full rounded-[24px] border p-4 text-left transition hover:bg-white/8 ${
              item.readAt ? 'border-white/10 bg-white/6' : 'border-accent/30 bg-accent/8'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10">
                <img
                  src={item.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => handleAvatarImageError(event, item.title)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {!item.readAt ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" /> : null}
                    <div className="text-sm font-black text-white">{item.title}</div>
                  </div>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{item.time}</span>
                </div>
                <div className="mt-2 text-sm font-medium leading-relaxed text-white/68">{item.body}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({
  user,
  onBack,
  onOpenSection,
  onOpenPreferences,
  onLogout,
}: {
  user: User;
  onBack: () => void;
  onOpenSection: (screen: 'settings-account' | 'settings-notifications' | 'settings-privacy' | 'support') => void;
  onOpenPreferences: () => void;
  onLogout: () => void;
}) {
  const sections = [
    {
      title: 'Account',
      screen: 'settings-account' as const,
      items: [
        { label: 'Profile details', description: user.username },
        { label: 'Email & sign in', description: 'Manage login method and account access' },
      ],
    },
    {
      title: 'Notifications',
      screen: 'settings-notifications' as const,
      items: [
        { label: 'Push notifications', description: 'Vibin, comments, follows, and recommendation updates' },
        { label: 'Email updates', description: 'Weekly recaps and important account alerts' },
      ],
    },
    {
      title: 'Privacy',
      screen: 'settings-privacy' as const,
      items: [
        { label: 'Profile visibility', description: 'Control who can view your profile and moments' },
        { label: 'Moment visibility', description: 'Choose default visibility for new moments and collections' },
      ],
    },
    {
      title: 'Help',
      screen: 'support' as const,
      items: [
        { label: 'Support', description: 'Help center, report an issue, and app info' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Settings</div>
        <div className="w-12" />
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-[-0.05em] text-white">Keep your profile simple.</h1>
        <p className="mt-2 text-sm font-medium text-white/55">Just the essentials for account, privacy, and notifications.</p>
      </div>

      <div className="space-y-6">
        <section>
          <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
            Personalization
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={onOpenPreferences}
              className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left transition hover:bg-white/8"
            >
              <div>
                <div className="text-sm font-black text-white">Travel preferences</div>
                <div className="mt-1 text-sm font-medium text-white/60">Update your interests and vibe to reshape discovery.</div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-white/35" />
            </button>
          </div>
        </section>

        {sections.map((section) => (
          <section key={section.title}>
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
              {section.title}
            </div>
            <div className="space-y-3">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onOpenSection(section.screen)}
                  className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left transition hover:bg-white/8"
                >
                  <div>
                    <div className="text-sm font-black text-white">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-white/60">{item.description}</div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-white/35" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-6 w-full rounded-[1.4rem] border border-white/10 bg-white/8 px-5 py-4 text-sm font-black text-white transition hover:bg-white/12"
      >
        Log out
      </button>
    </div>
  );
}

export function AccountSettingsScreen({
  user,
  onBack,
}: {
  user: User;
  onBack: () => void;
}) {
  const [accountData, setAccountData] = useState<{
    profileDetails: { displayName?: string; username: string; bio: string };
    signIn: { email?: string; providers: string[] };
  } | null>(null);

  useEffect(() => {
    api.getAccountSettings().then(setAccountData);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Account</div>
        <div className="w-12" />
      </div>

      <div className="space-y-4">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Profile details</div>
          <div className="mt-3 text-sm font-black text-white">{accountData?.profileDetails.displayName ?? user.displayName ?? user.username}</div>
          <div className="mt-1 text-sm font-medium text-white/60">@{accountData?.profileDetails.username ?? user.username}</div>
          <div className="mt-1 text-sm font-medium text-white/60">{accountData?.profileDetails.bio ?? user.bio}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Email & sign in</div>
          <div className="mt-3 text-sm font-medium text-white/60">{accountData?.signIn.email ?? 'alex@vibecheck.app'}</div>
          <div className="mt-1 text-sm font-medium text-white/60">Connected providers: {(accountData?.signIn.providers ?? ['manual', 'google']).join(', ')}</div>
        </div>
      </div>
    </div>
  );
}

export function NotificationSettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [recommendationEnabled, setRecommendationEnabled] = useState(true);

  useEffect(() => {
    api.getNotificationSettings().then((settings) => {
      setPushEnabled(settings.pushEnabled);
      setEmailEnabled(settings.emailEnabled);
      setRecommendationEnabled(settings.recommendationEnabled);
    });
  }, []);

  const ToggleRow = ({
    label,
    description,
    checked,
    onToggle,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onToggle: () => void;
  }) => (
    <button type="button" onClick={async () => { onToggle(); }} className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 text-left">
      <div>
        <div className="text-sm font-black text-white">{label}</div>
        <div className="mt-1 text-sm font-medium text-white/60">{description}</div>
      </div>
      <div className={`flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? 'bg-accent' : 'bg-white/15'}`}>
        <div className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Notifications</div>
        <div className="w-12" />
      </div>
      <div className="space-y-3">
        <ToggleRow label="Push notifications" description="Vibin, comments, follows, and saves." checked={pushEnabled} onToggle={() => {
          const next = !pushEnabled;
          setPushEnabled(next);
          void api.updateNotificationSettings({ pushEnabled: next, emailEnabled, recommendationEnabled });
        }} />
        <ToggleRow label="Email updates" description="Weekly roundups and account notices." checked={emailEnabled} onToggle={() => {
          const next = !emailEnabled;
          setEmailEnabled(next);
          void api.updateNotificationSettings({ pushEnabled, emailEnabled: next, recommendationEnabled });
        }} />
        <ToggleRow label="Recommendation updates" description="Fresh place and traveler matches." checked={recommendationEnabled} onToggle={() => {
          const next = !recommendationEnabled;
          setRecommendationEnabled(next);
          void api.updateNotificationSettings({ pushEnabled, emailEnabled, recommendationEnabled: next });
        }} />
      </div>
    </div>
  );
}

export function PrivacySettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers'>('public');
  const [momentVisibility, setMomentVisibility] = useState<'public' | 'private'>('public');

  useEffect(() => {
    api.getPrivacySettings().then((settings) => {
      setProfileVisibility(settings.profileVisibility);
      setMomentVisibility(settings.momentVisibility);
    });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Privacy</div>
        <div className="w-12" />
      </div>

      <div className="space-y-5">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Profile visibility</div>
          <div className="mt-3 flex gap-2">
            {(['public', 'followers'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setProfileVisibility(option);
                  void api.updatePrivacySettings({ profileVisibility: option, momentVisibility });
                }}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                  profileVisibility === option ? 'bg-accent text-dark' : 'bg-white/8 text-white/70'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Default moment visibility</div>
          <div className="mt-3 flex gap-2">
            {(['public', 'private'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMomentVisibility(option);
                  void api.updatePrivacySettings({ profileVisibility, momentVisibility: option });
                }}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                  momentVisibility === option ? 'bg-accent text-dark' : 'bg-white/8 text-white/70'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupportScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [faqs, setFaqs] = useState<string[]>([]);

  useEffect(() => {
    api.getSupport().then((response) => setFaqs(response.faqs));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 pb-10 pt-6 text-white">
      <div className="mb-5 flex items-center justify-between rounded-full border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-3 text-white transition hover:bg-white/8">
          <ArrowRight size={20} className="rotate-180" />
        </button>
        <div className="px-3 text-sm font-black text-white">Support</div>
        <div className="w-12" />
      </div>

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div key={faq} className="rounded-[24px] border border-white/10 bg-white/6 p-4">
            <div className="text-sm font-black text-white">{faq}</div>
            <div className="mt-1 text-sm font-medium text-white/60">This will connect to help articles and report flows later.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
