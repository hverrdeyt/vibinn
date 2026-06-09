import crypto from 'node:crypto';
import { prismaV2 } from './prismaV2';
import { APP_ENV } from './env';

const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;
const VONAGE_VERIFY_BRAND = process.env.VONAGE_VERIFY_BRAND || 'Vibinn';
const VONAGE_VERIFY_CODE_LENGTH = Number(process.env.VONAGE_VERIFY_CODE_LENGTH || 4);
const VONAGE_VERIFY_PIN_EXPIRY_SECONDS = Number(process.env.VONAGE_VERIFY_PIN_EXPIRY_SECONDS || 300);
const VONAGE_VERIFY_WORKFLOW_ID = Number(process.env.VONAGE_VERIFY_WORKFLOW_ID || 1);
const V2_SESSION_TTL_MS = Number(process.env.V2_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30);
const STAGING_FIXED_OTP_CODE = String(process.env.V2_STAGING_FIXED_OTP_CODE || '1234').trim();
const USE_STAGING_FIXED_OTP = APP_ENV === 'staging';
const APP_REVIEW_MODE_ENABLED = String(
  process.env.APP_REVIEW_MODE_ENABLED ?? (APP_ENV === 'production' ? 'true' : 'false'),
).toLowerCase() === 'true';
const APP_REVIEW_PHONE_RAW = String(process.env.APP_REVIEW_PHONE || '+16172345678').trim();
const APP_REVIEW_OTP_CODE = String(process.env.APP_REVIEW_OTP_CODE || '1247').trim();

type AuthPurpose = 'SIGN_UP' | 'SIGN_IN';

type RequestOtpInput = {
  phoneNumber: string;
  purpose: AuthPurpose;
  inviteCode?: string;
};

type VerifyOtpInput = {
  otpRequestId: string;
  code: string;
  inviteCode?: string;
  displayName?: string;
};

type GenerateInviteCodeInput = {
  ownerUserId: string;
  maxRedemptions: number;
  label?: string;
};

type UpdateProfileInput = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
};

type UpdateCityInput = {
  userId: string;
  cityLabel: string;
  cityLatitude?: number | null;
  cityLongitude?: number | null;
  citySource?: string | null;
};

type UpdateOnboardingStateInput = {
  userId: string;
  currentStep?: 'WELCOME' | 'INVITE_CONFIRMED' | 'PHONE_VERIFICATION' | 'PROFILE' | 'LOCATION_PERMISSION' | 'CONTACTS_PERMISSION' | 'FRIENDS' | 'FIRST_PLACE' | 'INVITE_SHARE' | 'COMPLETED';
  completedStep?: string;
  skippedStep?: string;
};

type DebugOnboardingJumpStep =
  | 'WELCOME'
  | 'PROFILE'
  | 'LOCATION_PERMISSION'
  | 'CONTACTS_PERMISSION'
  | 'FRIENDS'
  | 'FIRST_PLACE'
  | 'INVITE_SHARE'
  | 'COMPLETED';

const VALID_ONBOARDING_STEPS = new Set([
  'WELCOME',
  'INVITE_CONFIRMED',
  'PHONE_VERIFICATION',
  'PROFILE',
  'LOCATION_PERMISSION',
  'CONTACTS_PERMISSION',
  'FRIENDS',
  'FIRST_PLACE',
  'INVITE_SHARE',
  'COMPLETED',
]);

export class AuthV2Error extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type JoinWaitlistInput = {
  phoneNumber: string;
  source?: string;
};

type MatchContactsInput = {
  userId: string;
  phoneNumbers: string[];
};

type V2UserRecord = {
  id: string;
  phoneNumberE164: string;
  displayName: string | null;
  username: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  cityLabel?: string | null;
  cityLatitude?: number | null;
  cityLongitude?: number | null;
  citySource?: string | null;
  status: 'PENDING_PROFILE' | 'ACTIVE' | 'SUSPENDED';
  onboardingCompleted: boolean;
};

type VonageVerifyStartResponse = {
  request_id?: string;
  status?: string;
  error_text?: string;
};

type VonageVerifyCheckResponse = {
  request_id?: string;
  status?: string;
  error_text?: string;
};

function ensureVonageConfig() {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
    throw new AuthV2Error('VONAGE_NOT_CONFIGURED', 'Vonage Verify is not configured');
  }
}

function getVonageBasicAuthHeader() {
  ensureVonageConfig();
  return `Basic ${Buffer.from(`${VONAGE_API_KEY}:${VONAGE_API_SECRET}`).toString('base64')}`;
}

export function normalizePhoneNumberE164(input: string) {
  const trimmed = input.trim();
  const normalized = trimmed.replace(/[\s\-().]/g, '');
  const candidate = normalized.startsWith('00') ? `+${normalized.slice(2)}` : normalized;

  if (!/^\+?[1-9]\d{7,14}$/.test(candidate)) {
    throw new AuthV2Error('PHONE_INVALID_FORMAT', 'Phone number must be in E.164 format');
  }

  return candidate.startsWith('+') ? candidate : `+${candidate}`;
}

const NORMALIZED_APP_REVIEW_PHONE = (() => {
  try {
    return normalizePhoneNumberE164(APP_REVIEW_PHONE_RAW);
  } catch {
    return null;
  }
})();

function isAppReviewOtpPhone(phoneNumberE164: string) {
  return APP_REVIEW_MODE_ENABLED
    && Boolean(NORMALIZED_APP_REVIEW_PHONE)
    && NORMALIZED_APP_REVIEW_PHONE === phoneNumberE164;
}

function sanitizeInviteCode(input: string) {
  return input.trim().toUpperCase();
}

function assertInviteCodeFormat(code: string) {
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new AuthV2Error('INVITE_CODE_INVALID', 'Invite code must be 6 uppercase alphanumeric characters');
  }
}

function normalizeInviteCodeLabel(input?: string) {
  const value = input?.trim();
  return value ? value.slice(0, 80) : null;
}

function normalizeDisplayName(input: string) {
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 60) {
    throw new AuthV2Error('DISPLAY_NAME_INVALID', 'Display name must be between 2 and 60 characters');
  }
  return value;
}

function normalizeUsername(input: string) {
  const value = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(value)) {
    throw new AuthV2Error('USERNAME_INVALID', 'Username must be 3-20 characters using lowercase letters, numbers, or underscores');
  }
  return value;
}

function normalizeAvatarUrl(input?: string | null) {
  const value = input?.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    throw new AuthV2Error('AVATAR_URL_INVALID', 'Avatar URL must be a valid http or https URL');
  }
  return value.slice(0, 500);
}

function normalizeBio(input?: string | null) {
  const value = input?.trim();
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ');
  if (normalized.length > 280) {
    throw new AuthV2Error('BIO_INVALID', 'Bio must be 280 characters or fewer');
  }
  return normalized;
}

function normalizeCityLabel(input: string) {
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 120) {
    throw new AuthV2Error('CITY_LABEL_INVALID', 'City label must be between 2 and 120 characters');
  }
  return value;
}

function normalizeCoordinate(input: number | null | undefined, field: 'latitude' | 'longitude') {
  if (input === null || input === undefined) return null;
  if (!Number.isFinite(input)) {
    throw new AuthV2Error('CITY_COORDINATES_INVALID', `${field} must be a valid number`);
  }
  if (field === 'latitude' && (input < -90 || input > 90)) {
    throw new AuthV2Error('CITY_COORDINATES_INVALID', 'latitude must be between -90 and 90');
  }
  if (field === 'longitude' && (input < -180 || input > 180)) {
    throw new AuthV2Error('CITY_COORDINATES_INVALID', 'longitude must be between -180 and 180');
  }
  return input;
}

function normalizeCitySource(input?: string | null) {
  const value = input?.trim();
  if (!value) return null;
  return value.slice(0, 40);
}

function normalizeMaxRedemptions(input: number) {
  if (!Number.isInteger(input) || input < 1 || input > 9999) {
    throw new AuthV2Error('INVALID_MAX_REDEMPTIONS', 'maxRedemptions must be an integer between 1 and 9999');
  }
  return input;
}

async function getActiveInviteCodeOrThrow(
  rawCode: string,
  client: Pick<typeof prismaV2, 'inviteCode'> = prismaV2
) {
  const code = sanitizeInviteCode(rawCode);
  assertInviteCodeFormat(code);
  const inviteCode = await client.inviteCode.findUnique({
    where: { code },
  });

  if (!inviteCode) {
    throw new AuthV2Error('INVITE_CODE_NOT_FOUND', 'Invite code does not exist');
  }
  if (inviteCode.status === 'PAUSED') {
    throw new AuthV2Error('INVITE_CODE_PAUSED', 'Invite code is paused');
  }
  if (inviteCode.status === 'EXHAUSTED') {
    throw new AuthV2Error('INVITE_CODE_LIMIT_REACHED', 'Invite code has reached its limit');
  }
  if (inviteCode.status !== 'ACTIVE') {
    throw new AuthV2Error('INVITE_CODE_INVALID', 'Invite code is not active');
  }
  if (inviteCode.expiresAt && inviteCode.expiresAt <= new Date()) {
    throw new AuthV2Error('INVITE_CODE_EXPIRED', 'Invite code has expired');
  }
  if (inviteCode.maxRedemptions !== null && inviteCode.redeemedCount >= inviteCode.maxRedemptions) {
    throw new AuthV2Error('INVITE_CODE_LIMIT_REACHED', 'Invite code has reached its limit');
  }

  return inviteCode;
}

function buildInviteCodeSummary(inviteCode: {
  id: string;
  code: string;
  label: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'EXHAUSTED';
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const usageCount = inviteCode.redeemedCount;
  const usageLimit = inviteCode.maxRedemptions;
  const remainingUses = usageLimit === null ? null : Math.max(usageLimit - usageCount, 0);

  return {
    id: inviteCode.id,
    code: inviteCode.code,
    label: inviteCode.label ?? undefined,
    status: inviteCode.status,
    usageCount,
    usageLimit: usageLimit ?? undefined,
    remainingUses: remainingUses ?? undefined,
    expiresAt: inviteCode.expiresAt?.toISOString(),
    createdAt: inviteCode.createdAt.toISOString(),
    updatedAt: inviteCode.updatedAt.toISOString(),
  };
}

function buildInviterPreview(inviteCode: {
  owner: {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}) {
  return {
    id: inviteCode.owner.id,
    name: inviteCode.owner.displayName ?? inviteCode.owner.username ?? 'Vibinn member',
    username: inviteCode.owner.username ?? undefined,
    avatarUrl: inviteCode.owner.avatarUrl ?? undefined,
  };
}

export async function validateInviteCode(rawCode: string) {
  const code = sanitizeInviteCode(rawCode);
  assertInviteCodeFormat(code);
  const inviteCode = await prismaV2.inviteCode.findUnique({
    where: { code },
    include: {
      owner: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!inviteCode) {
    throw new AuthV2Error('INVITE_CODE_NOT_FOUND', 'Invite code does not exist');
  }
  if (inviteCode.status === 'PAUSED') {
    throw new AuthV2Error('INVITE_CODE_PAUSED', 'Invite code is paused');
  }
  if (inviteCode.status === 'EXHAUSTED') {
    throw new AuthV2Error('INVITE_CODE_LIMIT_REACHED', 'Invite code has reached its limit');
  }
  if (inviteCode.status !== 'ACTIVE') {
    throw new AuthV2Error('INVITE_CODE_INVALID', 'Invite code is not active');
  }
  if (inviteCode.expiresAt && inviteCode.expiresAt <= new Date()) {
    throw new AuthV2Error('INVITE_CODE_EXPIRED', 'Invite code has expired');
  }
  if (inviteCode.maxRedemptions !== null && inviteCode.redeemedCount >= inviteCode.maxRedemptions) {
    throw new AuthV2Error('INVITE_CODE_LIMIT_REACHED', 'Invite code has reached its limit');
  }

  return {
    code: inviteCode.code,
    status: inviteCode.status,
    usageCount: inviteCode.redeemedCount,
    usageLimit: inviteCode.maxRedemptions ?? undefined,
    remainingUses: inviteCode.maxRedemptions === null
      ? undefined
      : Math.max(inviteCode.maxRedemptions - inviteCode.redeemedCount, 0),
    expiresAt: inviteCode.expiresAt?.toISOString(),
    inviter: buildInviterPreview(inviteCode),
  };
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = crypto.randomBytes(6).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (code.length !== 6 || !/^[A-Z0-9]{6}$/.test(code)) {
      continue;
    }

    const existing = await prismaV2.inviteCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }

  throw new Error('Could not generate a unique invite code');
}

async function startVonageVerification(phoneNumberE164: string) {
  const body = new URLSearchParams({
    number: phoneNumberE164,
    brand: VONAGE_VERIFY_BRAND,
    code_length: String(VONAGE_VERIFY_CODE_LENGTH),
    pin_expiry: String(VONAGE_VERIFY_PIN_EXPIRY_SECONDS),
    workflow_id: String(VONAGE_VERIFY_WORKFLOW_ID),
  });

  const response = await fetch('https://api.nexmo.com/verify/json', {
    method: 'POST',
    headers: {
      Authorization: getVonageBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await response.json() as VonageVerifyStartResponse;
  if (!response.ok || payload.status !== '0' || !payload.request_id) {
    throw new AuthV2Error('OTP_REQUEST_FAILED', payload.error_text || 'Could not start phone verification');
  }

  return payload.request_id;
}

function createStagingOtpRequestId(phoneNumberE164: string) {
  const suffix = crypto.randomBytes(8).toString('hex');
  return `staging-${phoneNumberE164.replace(/\D+/g, '')}-${suffix}`;
}

function createAppReviewOtpRequestId(phoneNumberE164: string) {
  const suffix = crypto.randomBytes(8).toString('hex');
  return `review-${phoneNumberE164.replace(/\D+/g, '')}-${suffix}`;
}

async function checkVonageVerification(providerRequestId: string, code: string) {
  const body = new URLSearchParams({
    request_id: providerRequestId,
    code: code.trim(),
  });

  const response = await fetch('https://api.nexmo.com/verify/check/json', {
    method: 'POST',
    headers: {
      Authorization: getVonageBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await response.json() as VonageVerifyCheckResponse;
  if (!response.ok) {
    throw new AuthV2Error('OTP_VERIFY_FAILED', payload.error_text || 'Could not verify code');
  }

  return payload;
}

function checkStagingFixedVerification(code: string) {
  return {
    status: code.trim() === STAGING_FIXED_OTP_CODE ? '0' : '16',
    error_text: code.trim() === STAGING_FIXED_OTP_CODE ? undefined : 'OTP code is invalid',
  };
}

function checkAppReviewFixedVerification(code: string) {
  return {
    status: code.trim() === APP_REVIEW_OTP_CODE ? '0' : '16',
    error_text: code.trim() === APP_REVIEW_OTP_CODE ? undefined : 'OTP code is invalid',
  };
}

function createSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function mapUser(user: V2UserRecord) {
  return {
    id: user.id,
    phoneNumber: user.phoneNumberE164,
    displayName: user.displayName ?? undefined,
    username: user.username ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? undefined,
    cityLabel: user.cityLabel ?? undefined,
    cityLatitude: user.cityLatitude ?? undefined,
    cityLongitude: user.cityLongitude ?? undefined,
    citySource: user.citySource ?? undefined,
    status: user.status,
    onboardingCompleted: user.onboardingCompleted,
  };
}

export async function getV2SessionFromToken(token: string) {
  const tokenHash = hashSessionToken(token.trim());
  const session = await prismaV2.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          phoneNumberE164: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          cityLabel: true,
          cityLatitude: true,
          cityLongitude: true,
          citySource: true,
          status: true,
          onboardingCompleted: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    user: mapUser(session.user),
  };
}

export async function revokeV2Session(token: string) {
  const tokenHash = hashSessionToken(token.trim());
  await prismaV2.session.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function ensureUserOnboardingState(userId: string) {
  return prismaV2.userOnboardingState.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
    },
  });
}

function dedupeSteps(steps: string[], nextStep?: string) {
  if (!nextStep) return steps;
  if (!VALID_ONBOARDING_STEPS.has(nextStep)) {
    throw new AuthV2Error('ONBOARDING_STEP_INVALID', 'Onboarding step is invalid');
  }
  return Array.from(new Set([...steps, nextStep]));
}

function mapOnboardingState(state: {
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  inviteCodeValidated: boolean;
  inviteCodeValidatedAt: Date | null;
  phoneVerifiedAt: Date | null;
  profileCompletedAt: Date | null;
  locationDecisionAt: Date | null;
  contactsDecisionAt: Date | null;
  firstPlaceLoggedAt: Date | null;
  inviteShareSeenAt: Date | null;
  updatedAt: Date;
}) {
  return {
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    skippedSteps: state.skippedSteps,
    inviteCodeValidated: state.inviteCodeValidated,
    inviteCodeValidatedAt: state.inviteCodeValidatedAt?.toISOString(),
    phoneVerifiedAt: state.phoneVerifiedAt?.toISOString(),
    profileCompletedAt: state.profileCompletedAt?.toISOString(),
    locationDecisionAt: state.locationDecisionAt?.toISOString(),
    contactsDecisionAt: state.contactsDecisionAt?.toISOString(),
    firstPlaceLoggedAt: state.firstPlaceLoggedAt?.toISOString(),
    inviteShareSeenAt: state.inviteShareSeenAt?.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

function completedStepsForDebugJump(step: DebugOnboardingJumpStep) {
  switch (step) {
    case 'WELCOME':
      return [] as string[];
    case 'PROFILE':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION'];
    case 'LOCATION_PERMISSION':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE'];
    case 'CONTACTS_PERMISSION':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION'];
    case 'FRIENDS':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION', 'CONTACTS_PERMISSION'];
    case 'FIRST_PLACE':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION', 'CONTACTS_PERMISSION', 'FRIENDS'];
    case 'INVITE_SHARE':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION', 'CONTACTS_PERMISSION', 'FRIENDS', 'FIRST_PLACE'];
    case 'COMPLETED':
      return ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION', 'CONTACTS_PERMISSION', 'FRIENDS', 'FIRST_PLACE', 'INVITE_SHARE'];
  }
}

export async function getMyOnboardingState(userId: string) {
  const state = await ensureUserOnboardingState(userId);
  return mapOnboardingState(state);
}

export async function updateMyOnboardingState(input: UpdateOnboardingStateInput) {
  const current = await ensureUserOnboardingState(input.userId);
  const now = new Date();

  if (input.currentStep && !VALID_ONBOARDING_STEPS.has(input.currentStep)) {
    throw new AuthV2Error('ONBOARDING_STEP_INVALID', 'Onboarding step is invalid');
  }

  const state = await prismaV2.userOnboardingState.update({
    where: { userId: input.userId },
    data: {
      currentStep: input.currentStep ?? current.currentStep,
      completedSteps: dedupeSteps(current.completedSteps, input.completedStep),
      skippedSteps: dedupeSteps(current.skippedSteps, input.skippedStep),
      ...(input.completedStep === 'INVITE_CONFIRMED' ? { inviteCodeValidated: true, inviteCodeValidatedAt: current.inviteCodeValidatedAt ?? now } : {}),
      ...(input.completedStep === 'PHONE_VERIFICATION' ? { phoneVerifiedAt: current.phoneVerifiedAt ?? now } : {}),
      ...(input.completedStep === 'PROFILE' ? { profileCompletedAt: current.profileCompletedAt ?? now } : {}),
      ...(input.completedStep === 'LOCATION_PERMISSION' ? { locationDecisionAt: current.locationDecisionAt ?? now } : {}),
      ...(input.completedStep === 'CONTACTS_PERMISSION' ? { contactsDecisionAt: current.contactsDecisionAt ?? now } : {}),
      ...(input.completedStep === 'FIRST_PLACE' ? { firstPlaceLoggedAt: current.firstPlaceLoggedAt ?? now } : {}),
      ...(input.completedStep === 'INVITE_SHARE' ? { inviteShareSeenAt: current.inviteShareSeenAt ?? now } : {}),
    },
  });

  return mapOnboardingState(state);
}

export async function resetMyOnboardingStateForDebug(userId: string) {
  const state = await ensureUserOnboardingState(userId);
  const reset = await prismaV2.userOnboardingState.update({
    where: { userId },
    data: {
      currentStep: 'WELCOME',
      completedSteps: [],
      skippedSteps: [],
      inviteCodeValidated: false,
      inviteCodeValidatedAt: null,
      phoneVerifiedAt: null,
      profileCompletedAt: null,
      locationDecisionAt: null,
      contactsDecisionAt: null,
      firstPlaceLoggedAt: null,
      inviteShareSeenAt: null,
    },
  });

  await prismaV2.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: false,
      status: state.profileCompletedAt ? 'ACTIVE' : 'PENDING_PROFILE',
    },
  });

  return mapOnboardingState(reset);
}

export async function jumpMyOnboardingStateForDebug(userId: string, step: DebugOnboardingJumpStep) {
  const now = new Date();
  const completedSteps = completedStepsForDebugJump(step);
  const jumped = await prismaV2.userOnboardingState.upsert({
    where: { userId },
    update: {
      currentStep: step,
      completedSteps,
      skippedSteps: [],
      inviteCodeValidated: completedSteps.includes('INVITE_CONFIRMED'),
      inviteCodeValidatedAt: completedSteps.includes('INVITE_CONFIRMED') ? now : null,
      phoneVerifiedAt: completedSteps.includes('PHONE_VERIFICATION') ? now : null,
      profileCompletedAt: completedSteps.includes('PROFILE') ? now : null,
      locationDecisionAt: completedSteps.includes('LOCATION_PERMISSION') ? now : null,
      contactsDecisionAt: completedSteps.includes('CONTACTS_PERMISSION') ? now : null,
      firstPlaceLoggedAt: completedSteps.includes('FIRST_PLACE') ? now : null,
      inviteShareSeenAt: completedSteps.includes('INVITE_SHARE') ? now : null,
    },
    create: {
      userId,
      currentStep: step,
      completedSteps,
      skippedSteps: [],
      inviteCodeValidated: completedSteps.includes('INVITE_CONFIRMED'),
      inviteCodeValidatedAt: completedSteps.includes('INVITE_CONFIRMED') ? now : null,
      phoneVerifiedAt: completedSteps.includes('PHONE_VERIFICATION') ? now : null,
      profileCompletedAt: completedSteps.includes('PROFILE') ? now : null,
      locationDecisionAt: completedSteps.includes('LOCATION_PERMISSION') ? now : null,
      contactsDecisionAt: completedSteps.includes('CONTACTS_PERMISSION') ? now : null,
      firstPlaceLoggedAt: completedSteps.includes('FIRST_PLACE') ? now : null,
      inviteShareSeenAt: completedSteps.includes('INVITE_SHARE') ? now : null,
    },
  });

  await prismaV2.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: step === 'COMPLETED',
      status: completedSteps.includes('PROFILE') ? 'ACTIVE' : 'PENDING_PROFILE',
    },
  });

  return mapOnboardingState(jumped);
}

export async function getMyProfile(userId: string) {
  const user = await prismaV2.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phoneNumberE164: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      bio: true,
      cityLabel: true,
      cityLatitude: true,
      cityLongitude: true,
      citySource: true,
      status: true,
      onboardingCompleted: true,
    },
  });

  if (!user) {
    throw new AuthV2Error('USER_NOT_FOUND', 'User was not found');
  }

  return mapUser(user);
}

export async function updateMyProfile(input: UpdateProfileInput) {
  const displayName = normalizeDisplayName(input.displayName);
  const username = normalizeUsername(input.username);
  const avatarUrl = normalizeAvatarUrl(input.avatarUrl);
  const bio = normalizeBio(input.bio);

  const existingUser = await prismaV2.user.findFirst({
    where: {
      username,
      id: { not: input.userId },
    },
    select: { id: true },
  });

  if (existingUser) {
    throw new AuthV2Error('USERNAME_TAKEN', 'Username is already taken');
  }

  const user = await prismaV2.user.update({
    where: { id: input.userId },
    data: {
      displayName,
      username,
      avatarUrl,
      bio,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      phoneNumberE164: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      bio: true,
      cityLabel: true,
      cityLatitude: true,
      cityLongitude: true,
      citySource: true,
      status: true,
      onboardingCompleted: true,
    },
  });

  await updateMyOnboardingState({
    userId: input.userId,
    currentStep: 'LOCATION_PERMISSION',
    completedStep: 'PROFILE',
  });

  return mapUser(user);
}

export async function updateMyCity(input: UpdateCityInput) {
  const cityLabel = normalizeCityLabel(input.cityLabel);
  const cityLatitude = normalizeCoordinate(input.cityLatitude, 'latitude');
  const cityLongitude = normalizeCoordinate(input.cityLongitude, 'longitude');
  const citySource = normalizeCitySource(input.citySource);

  const user = await prismaV2.user.update({
    where: { id: input.userId },
    data: {
      cityLabel,
      cityLatitude,
      cityLongitude,
      citySource,
    },
    select: {
      id: true,
      phoneNumberE164: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      cityLabel: true,
      cityLatitude: true,
      cityLongitude: true,
      citySource: true,
      status: true,
      onboardingCompleted: true,
    },
  });

  await updateMyOnboardingState({
    userId: input.userId,
    currentStep: 'CONTACTS_PERMISSION',
    completedStep: 'LOCATION_PERMISSION',
  });

  return mapUser(user);
}

export async function matchRegisteredContacts(input: MatchContactsInput) {
  const normalizedPhoneNumbers = Array.from(
    new Set(
      input.phoneNumbers
        .map((value) => {
          try {
            return normalizePhoneNumberE164(value);
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  if (normalizedPhoneNumbers.length === 0) {
    return { totalContactsSubmitted: 0, matchedUsers: [] };
  }

  const matchedUsers = await prismaV2.user.findMany({
    where: {
      phoneNumberE164: { in: normalizedPhoneNumbers },
      id: { not: input.userId },
    },
    select: {
      id: true,
      phoneNumberE164: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      cityLabel: true,
      cityLatitude: true,
      cityLongitude: true,
      citySource: true,
      status: true,
      onboardingCompleted: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return {
    totalContactsSubmitted: normalizedPhoneNumbers.length,
    matchedCount: matchedUsers.length,
    matchedUsers: matchedUsers.map(mapUser),
  };
}

export async function getMyInviteCode(ownerUserId: string) {
  const inviteCode = await prismaV2.inviteCode.findUnique({
    where: { ownerUserId },
  });

  return inviteCode ? buildInviteCodeSummary(inviteCode) : null;
}

export async function generateMyInviteCode(input: GenerateInviteCodeInput) {
  const existing = await prismaV2.inviteCode.findUnique({
    where: { ownerUserId: input.ownerUserId },
  });

  if (existing) {
    throw new AuthV2Error('INVITE_CODE_ALREADY_EXISTS', 'User already has an invite code');
  }

  const maxRedemptions = normalizeMaxRedemptions(input.maxRedemptions);
  const code = await createUniqueInviteCode();
  assertInviteCodeFormat(code);

  const inviteCode = await prismaV2.inviteCode.create({
    data: {
      ownerUserId: input.ownerUserId,
      code,
      label: normalizeInviteCodeLabel(input.label),
      maxRedemptions,
      status: 'ACTIVE',
    },
  });

  return buildInviteCodeSummary(inviteCode);
}

export async function joinPhoneWaitlist(input: JoinWaitlistInput) {
  const phoneNumberE164 = normalizePhoneNumberE164(input.phoneNumber);

  const existingUser = await prismaV2.user.findUnique({
    where: { phoneNumberE164 },
    select: { id: true },
  });
  if (existingUser) {
    throw new AuthV2Error('PHONE_ALREADY_REGISTERED', 'Phone number is already registered');
  }

  const entry = await prismaV2.waitlistEntry.upsert({
    where: { phoneNumberE164 },
    update: {
      source: input.source?.trim() ? input.source.trim().slice(0, 80) : undefined,
    },
    create: {
      phoneNumberE164,
      source: input.source?.trim() ? input.source.trim().slice(0, 80) : null,
    },
  });

  return {
    id: entry.id,
    phoneNumber: entry.phoneNumberE164,
    source: entry.source ?? undefined,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function requestOtp(input: RequestOtpInput) {
  const phoneNumberE164 = normalizePhoneNumberE164(input.phoneNumber);
  const requestedPurpose: AuthPurpose = input.purpose === 'SIGN_IN' ? 'SIGN_IN' : 'SIGN_UP';
  const existingUser = await prismaV2.user.findUnique({
    where: { phoneNumberE164 },
  });
  const effectivePurpose: AuthPurpose = requestedPurpose === 'SIGN_UP' && existingUser ? 'SIGN_IN' : requestedPurpose;

  if (effectivePurpose === 'SIGN_IN') {
    if (!existingUser) {
      throw new AuthV2Error('PHONE_NOT_REGISTERED', 'Phone number is not registered');
    }
  }

  if (requestedPurpose === 'SIGN_UP') {
    if (!input.inviteCode?.trim()) {
      throw new AuthV2Error('INVITE_CODE_REQUIRED', 'Invite code is required');
    }
    await getActiveInviteCodeOrThrow(input.inviteCode);
  }

  const now = new Date();
  await prismaV2.otpRequest.updateMany({
    where: {
      phoneNumberE164,
      purpose: effectivePurpose,
      status: 'PENDING',
      expiresAt: { lte: now },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  const activeRequest = await prismaV2.otpRequest.findFirst({
    where: {
      phoneNumberE164,
      purpose: effectivePurpose,
      status: 'PENDING',
      expiresAt: { gt: now },
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeRequest) {
    await prismaV2.otpRequest.update({
      where: { id: activeRequest.id },
      data: {
        resendCount: { increment: 1 },
      },
    });

    return {
      otpRequestId: activeRequest.id,
      phoneNumber: phoneNumberE164,
      expiresAt: activeRequest.expiresAt.toISOString(),
    };
  }

  const providerRequestId = isAppReviewOtpPhone(phoneNumberE164)
    ? createAppReviewOtpRequestId(phoneNumberE164)
    : USE_STAGING_FIXED_OTP
      ? createStagingOtpRequestId(phoneNumberE164)
      : await startVonageVerification(phoneNumberE164);
  const otpRequest = await prismaV2.otpRequest.create({
    data: {
      phoneNumberE164,
      purpose: effectivePurpose,
      provider: 'VONAGE_VERIFY',
      providerRequestId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + VONAGE_VERIFY_PIN_EXPIRY_SECONDS * 1000),
    },
  });

  return {
    otpRequestId: otpRequest.id,
    phoneNumber: phoneNumberE164,
    expiresAt: otpRequest.expiresAt.toISOString(),
  };
}

export async function verifyOtp(input: VerifyOtpInput) {
  const otpRequest = await prismaV2.otpRequest.findUnique({
    where: { id: input.otpRequestId.trim() },
  });

  if (!otpRequest) {
    throw new AuthV2Error('OTP_REQUEST_NOT_FOUND', 'OTP request was not found');
  }
  if (otpRequest.status !== 'PENDING') {
    throw new AuthV2Error('OTP_REQUEST_INACTIVE', 'OTP request is no longer active');
  }
  if (otpRequest.expiresAt <= new Date()) {
    await prismaV2.otpRequest.update({
      where: { id: otpRequest.id },
      data: { status: 'EXPIRED' },
    });
    throw new AuthV2Error('OTP_REQUEST_EXPIRED', 'OTP request has expired');
  }

  const verification = otpRequest.providerRequestId.startsWith('review-')
    ? checkAppReviewFixedVerification(input.code)
    : USE_STAGING_FIXED_OTP
      ? checkStagingFixedVerification(input.code)
      : await checkVonageVerification(otpRequest.providerRequestId, input.code);
  const now = new Date();

  if (verification.status !== '0') {
    await prismaV2.otpRequest.update({
      where: { id: otpRequest.id },
      data: {
        status: verification.status === '16' ? 'EXPIRED' : 'FAILED',
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });
    throw new AuthV2Error('OTP_CODE_INVALID', verification.error_text || 'OTP code is invalid');
  }

  const result = await prismaV2.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { phoneNumberE164: otpRequest.phoneNumberE164 },
    });
    let onboardingState:
      | {
          currentStep: string;
          completedSteps: string[];
          skippedSteps: string[];
          inviteCodeValidated: boolean;
          inviteCodeValidatedAt: Date | null;
          phoneVerifiedAt: Date | null;
          profileCompletedAt: Date | null;
          locationDecisionAt: Date | null;
          contactsDecisionAt: Date | null;
          firstPlaceLoggedAt: Date | null;
          inviteShareSeenAt: Date | null;
          updatedAt: Date;
        }
      | null = null;

    if (otpRequest.purpose === 'SIGN_UP') {
      if (!input.inviteCode?.trim()) {
        throw new AuthV2Error('INVITE_CODE_REQUIRED', 'Invite code is required');
      }
      if (user) {
        throw new AuthV2Error('PHONE_ALREADY_REGISTERED', 'Phone number is already registered');
      }

      const inviteCode = await getActiveInviteCodeOrThrow(input.inviteCode, tx);
      user = await tx.user.create({
        data: {
          phoneNumberE164: otpRequest.phoneNumberE164,
          displayName: input.displayName?.trim() || null,
          status: input.displayName?.trim() ? 'ACTIVE' : 'PENDING_PROFILE',
          onboardingCompleted: false,
          lastLoginAt: now,
        },
      });

      onboardingState = await tx.userOnboardingState.create({
        data: {
          userId: user.id,
          currentStep: input.displayName?.trim() ? 'LOCATION_PERMISSION' : 'PROFILE',
          completedSteps: ['INVITE_CONFIRMED', 'PHONE_VERIFICATION'],
          inviteCodeValidated: true,
          inviteCodeValidatedAt: now,
          phoneVerifiedAt: now,
        },
      });

      const nextRedeemedCount = inviteCode.redeemedCount + 1;
      const nextStatus = inviteCode.maxRedemptions !== null && nextRedeemedCount >= inviteCode.maxRedemptions
        ? 'EXHAUSTED'
        : inviteCode.status;

      await tx.inviteRedemption.create({
        data: {
          inviteCodeId: inviteCode.id,
          userId: user.id,
          phoneNumberE164: user.phoneNumberE164,
        },
      });

      await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: {
          redeemedCount: nextRedeemedCount,
          status: nextStatus,
        },
      });

      await tx.notification.create({
        data: {
          userId: inviteCode.ownerUserId,
          actorUserId: user.id,
          type: 'INVITE_REDEEMED',
          targetType: 'PROFILE',
          targetId: user.id,
          title: 'Someone joined with your invite',
          body: 'Your invite brought a new person into Vibinn.',
        },
      });
    } else {
      if (!user) {
        throw new AuthV2Error('PHONE_NOT_REGISTERED', 'Phone number is not registered');
      }

      user = await tx.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
        },
      });

      const existingState = await tx.userOnboardingState.findUnique({
        where: { userId: user.id },
      });

      if (existingState) {
        onboardingState = await tx.userOnboardingState.update({
          where: { userId: user.id },
          data: {
            completedSteps: {
              set: Array.from(new Set([...existingState.completedSteps, 'PHONE_VERIFICATION'])),
            },
            inviteCodeValidated: existingState.inviteCodeValidated || Boolean(input.inviteCode?.trim()),
            inviteCodeValidatedAt: existingState.inviteCodeValidatedAt ?? (input.inviteCode?.trim() ? now : null),
            phoneVerifiedAt: now,
          },
        });
      } else {
        const completedSteps = user.onboardingCompleted
          ? ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE', 'LOCATION_PERMISSION', 'CONTACTS_PERMISSION', 'FRIENDS', 'FIRST_PLACE', 'INVITE_SHARE']
          : (user.status === 'ACTIVE'
              ? ['INVITE_CONFIRMED', 'PHONE_VERIFICATION', 'PROFILE']
              : ['INVITE_CONFIRMED', 'PHONE_VERIFICATION']);
        const currentStep = user.onboardingCompleted
          ? 'COMPLETED'
          : (user.status === 'ACTIVE' ? 'FIRST_PLACE' : 'PROFILE');

        onboardingState = await tx.userOnboardingState.create({
          data: {
            userId: user.id,
            currentStep,
            completedSteps,
            inviteCodeValidated: Boolean(input.inviteCode?.trim()),
            inviteCodeValidatedAt: input.inviteCode?.trim() ? now : null,
            phoneVerifiedAt: now,
            profileCompletedAt: completedSteps.includes('PROFILE') ? now : null,
            locationDecisionAt: completedSteps.includes('LOCATION_PERMISSION') ? now : null,
            contactsDecisionAt: completedSteps.includes('CONTACTS_PERMISSION') ? now : null,
            firstPlaceLoggedAt: completedSteps.includes('FIRST_PLACE') ? now : null,
            inviteShareSeenAt: completedSteps.includes('INVITE_SHARE') ? now : null,
          },
        });
      }
    }

    await tx.otpRequest.update({
      where: { id: otpRequest.id },
      data: {
        status: 'VERIFIED',
        consumedAt: now,
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });

    const token = createSessionToken();
    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + V2_SESSION_TTL_MS),
      },
    });

    return { token, user, onboardingState, authPurpose: otpRequest.purpose };
  });

  return {
    token: result.token,
    user: mapUser(result.user),
    onboarding: result.onboardingState ? mapOnboardingState(result.onboardingState) : undefined,
    authPurpose: result.authPurpose,
    isExistingUser: result.authPurpose === 'SIGN_IN',
  };
}
