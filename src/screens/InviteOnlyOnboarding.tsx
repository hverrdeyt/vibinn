import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, MapPin, Smartphone, Upload, Users } from 'lucide-react';
import { ApiError, api, resolveApiAssetUrl, type V2UserPayload } from '../lib/api';
import { getCurrentDevicePosition, isNativeApp } from '../lib/native';

type InviteValidation = {
  code: string;
  inviterName?: string;
  inviterAvatarUrl?: string;
};

type Step =
  | 'welcome'
  | 'code-confirmed'
  | 'phone'
  | 'otp'
  | 'profile'
  | 'location'
  | 'contacts'
  | 'friends'
  | 'first-place-placeholder';

export default function InviteOnlyOnboarding({
  isAuthenticated,
  onAuthenticated,
  onComplete,
  onShowToast,
}: {
  isAuthenticated: boolean;
  onAuthenticated: (payload: V2UserPayload) => void | Promise<void>;
  onComplete: () => void | Promise<void>;
  onShowToast: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>('welcome');
  const [inviteCode, setInviteCode] = useState('');
  const [validatedInvite, setValidatedInvite] = useState<InviteValidation | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [cityLabel, setCityLabel] = useState('');
  const [cityLatitude, setCityLatitude] = useState<number | null>(null);
  const [cityLongitude, setCityLongitude] = useState<number | null>(null);
  const [contactPhoneNumbers, setContactPhoneNumbers] = useState('');
  const [matchedUsers, setMatchedUsers] = useState<V2UserPayload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void api.getV2Onboarding()
      .then((response) => {
        if (response.onboarding.currentStep === 'PROFILE') setStep('profile');
        else if (response.onboarding.currentStep === 'LOCATION_PERMISSION') setStep('location');
        else if (response.onboarding.currentStep === 'CONTACTS_PERMISSION') setStep('contacts');
        else if (response.onboarding.currentStep === 'FRIENDS') setStep('friends');
        else if (response.onboarding.currentStep === 'FIRST_PLACE') setStep('first-place-placeholder');
      })
      .catch(() => undefined);
  }, [isAuthenticated]);

  const parsedContactPhoneNumbers = useMemo(
    () => contactPhoneNumbers.split(/[\n,]+/g).map((value) => value.trim()).filter(Boolean),
    [contactPhoneNumbers],
  );

  async function runStep(action: () => Promise<void>) {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Invite-only onboarding</div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Vibinn</h1>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/70 p-5 shadow-2xl">
          {step === 'welcome' ? (
            <div className="space-y-4">
              <p className="text-lg font-black tracking-[-0.03em]">Vibinn is currently invite-only.</p>
              <p className="text-sm font-medium text-white/60">Have an invite code?</p>
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="Enter your code"
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-base font-semibold text-white outline-none"
              />
              <button
                type="button"
                disabled={!inviteCode.trim() || isSubmitting}
                onClick={() => {
                  void runStep(async () => {
                    const response = await api.validateV2InviteCode(inviteCode);
                    setValidatedInvite({
                      code: response.inviteCode.code,
                      inviterName: response.inviteCode.inviter?.name,
                      inviterAvatarUrl: response.inviteCode.inviter?.avatarUrl,
                    });
                    setStep('code-confirmed');
                  });
                }}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                {isSubmitting ? 'Checking code...' : 'Enter your code'}
              </button>
              <button
                type="button"
                disabled={isSubmitting || !phoneNumber.trim()}
                onClick={() => {
                  void runStep(async () => {
                    await api.joinV2Waitlist({
                      phoneNumber,
                      source: 'invite-gate',
                    });
                    onShowToast('Early access requested');
                  });
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-black text-white"
              >
                Request early access
              </button>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="Phone number for early access"
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-semibold text-white outline-none"
              />
            </div>
          ) : null}

          {step === 'code-confirmed' ? (
            <div className="space-y-5 text-center">
              <div className="text-2xl font-black">You&apos;re in.</div>
              {validatedInvite?.inviterAvatarUrl ? (
                <img src={resolveApiAssetUrl(validatedInvite.inviterAvatarUrl)} alt={validatedInvite.inviterName ?? 'Inviter'} className="mx-auto h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
                  <Check size={24} />
                </div>
              )}
              <p className="text-sm font-medium text-white/70">Invited by: {validatedInvite?.inviterName ?? 'Vibinn member'}</p>
              <button type="button" onClick={() => setStep('phone')} className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black">
                Continue
              </button>
            </div>
          ) : null}

          {step === 'phone' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-white/70"><Smartphone size={16} /> Enter phone number</div>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+1 (___) ___-____"
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-base font-semibold text-white outline-none"
              />
              <button
                type="button"
                disabled={!phoneNumber.trim() || isSubmitting}
                onClick={() => {
                  void runStep(async () => {
                    const response = await api.requestV2Otp({
                      phoneNumber,
                      purpose: 'SIGN_UP',
                      inviteCode: validatedInvite?.code,
                    });
                    setOtpRequestId(response.otpRequestId);
                    setStep('otp');
                  });
                }}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                {isSubmitting ? 'Sending code...' : 'Send verification code'}
              </button>
            </div>
          ) : null}

          {step === 'otp' ? (
            <div className="space-y-4">
              <div className="text-sm font-black text-white/70">OTP verification</div>
              <input
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D+/g, '').slice(0, 4))}
                placeholder="_ _ _ _"
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-center text-2xl font-black tracking-[0.6em] text-white outline-none"
              />
              <button
                type="button"
                disabled={otpCode.length !== 4 || !otpRequestId || isSubmitting}
                onClick={() => {
                  void runStep(async () => {
                    const response = await api.verifyV2Otp({
                      otpRequestId: otpRequestId!,
                      code: otpCode,
                      inviteCode: validatedInvite?.code,
                    });
                    await onAuthenticated(response.user);
                    setStep('profile');
                  });
                }}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                {isSubmitting ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          ) : null}

          {step === 'profile' ? (
            <div className="space-y-4">
              <div className="text-sm font-black text-white/70">Create profile</div>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name" className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-base font-semibold text-white outline-none" />
              <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="username" className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-base font-semibold text-white outline-none" />
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="Profile photo URL (optional)" className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-semibold text-white outline-none" />
              <button
                type="button"
                disabled={!displayName.trim() || !username.trim() || isSubmitting}
                onClick={() => {
                  void runStep(async () => {
                    const response = await api.updateV2Profile({
                      displayName,
                      username,
                      avatarUrl: avatarUrl.trim() || null,
                    });
                    await onAuthenticated(response.user);
                    setStep('location');
                  });
                }}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 'location' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-white/70"><MapPin size={16} /> Vibinn works best knowing your city.</div>
              <input value={cityLabel} onChange={(event) => setCityLabel(event.target.value)} placeholder="City" className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-base font-semibold text-white outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    void runStep(async () => {
                      const position = await getCurrentDevicePosition();
                      setCityLatitude(position.latitude);
                      setCityLongitude(position.longitude);
                      onShowToast('Location captured, add your city name to continue');
                    });
                  }}
                  className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-black text-white"
                >
                  Allow location
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !cityLabel.trim()}
                onClick={() => {
                  void runStep(async () => {
                    const response = await api.updateV2Location({
                      cityLabel,
                      cityLatitude,
                      cityLongitude,
                      citySource: cityLatitude !== null && cityLongitude !== null ? 'device' : 'manual',
                    });
                    await onAuthenticated(response.user);
                    setStep('contacts');
                  });
                }}
                  className="rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
                >
                  Set manually
                </button>
              </div>
            </div>
          ) : null}

          {step === 'contacts' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-white/70"><Users size={16} /> See which friends are already on Vibinn.</div>
              <p className="text-sm font-medium text-white/55">We never store your contact list. For now, paste phone numbers separated by commas or new lines.</p>
              <textarea
                value={contactPhoneNumbers}
                onChange={(event) => setContactPhoneNumbers(event.target.value)}
                placeholder="+15551234567, +6281234567890"
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-semibold text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    void runStep(async () => {
                      await api.updateV2Onboarding({
                        skippedStep: 'CONTACTS_PERMISSION',
                        currentStep: 'FRIENDS',
                      });
                      setMatchedUsers([]);
                      setStep('friends');
                    });
                  }}
                  className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm font-black text-white"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    void runStep(async () => {
                      const response = await api.matchV2Contacts({
                        phoneNumbers: parsedContactPhoneNumbers,
                      });
                      setMatchedUsers(response.matches.matchedUsers);
                      setStep('friends');
                    });
                  }}
                  className="rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
                >
                  Check contacts
                </button>
              </div>
            </div>
          ) : null}

          {step === 'friends' ? (
            <div className="space-y-4">
              <div className="text-xl font-black">{matchedUsers.length > 0 ? `${matchedUsers.length} of your contacts are already on Vibinn.` : 'Find friends later'}</div>
              {matchedUsers.length > 0 ? (
                <div className="space-y-3">
                  {matchedUsers.map((match) => (
                    <div key={match.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                      <div className="h-11 w-11 overflow-hidden rounded-full bg-white/10">
                        {match.avatarUrl ? <img src={resolveApiAssetUrl(match.avatarUrl)} alt={match.displayName ?? match.username ?? 'User'} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div>
                        <div className="text-sm font-black text-white">{match.displayName ?? match.username ?? 'Vibinn member'}</div>
                        <div className="text-xs font-medium text-white/50">@{match.username ?? 'member'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-white/55">No matches yet, or you chose to skip contacts for now.</p>
              )}
              <button
                type="button"
                onClick={() => setStep('first-place-placeholder')}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 'first-place-placeholder' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
                <Upload size={24} />
              </div>
              <div className="text-xl font-black">First place logging is next.</div>
              <p className="text-sm font-medium text-white/60">
                We&apos;ve wired invite, OTP, profile, location, and contact matching. Photo-based first place logging is the next onboarding milestone.
              </p>
              <button
                type="button"
                onClick={() => {
                  onShowToast('Onboarding core is connected. First place flow comes next.');
                  void onComplete();
                }}
                className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-black text-black"
              >
                Continue to app for now
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-white/35">
            <span>Step</span>
            <span>{step.replace(/-/g, ' ')}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-white/35">
          <ArrowRight size={12} />
          <span>{isNativeApp() ? 'Native app mode' : 'Web/dev mode'}</span>
        </div>
      </div>
    </div>
  );
}
