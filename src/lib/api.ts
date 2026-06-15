import { isNativeApp } from './native';

export interface AuthPayload {
  name?: string;
  email?: string;
  password?: string;
}

export interface V2UserPayload {
  id: string;
  phoneNumber?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  cityLabel?: string;
}

export interface V2OnboardingPayload {
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  inviteCodeValidated: boolean;
  inviteCodeValidatedAt?: string;
  phoneVerifiedAt?: string;
  profileCompletedAt?: string;
  locationDecisionAt?: string;
  contactsDecisionAt?: string;
  firstPlaceLoggedAt?: string;
  inviteShareSeenAt?: string;
  updatedAt: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const AUTH_TOKEN_KEY = 'vibecheck_auth_token';
const DEFAULT_NATIVE_API_BASE_URL = 'https://api.vibinn.club';
function isPrivateLanHost(hostname: string) {
  return /^(10|127)\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    || hostname === 'localhost';
}

const API_BASE_URL = (() => {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window !== 'undefined' && isNativeApp()) {
    return DEFAULT_NATIVE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && isPrivateLanHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return '';
})();

export function resolveApiAssetUrl(url?: string | null) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

function getAuthToken() {
  return typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
}

function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const errorPayload = await response.json() as { error?: string };
      if (errorPayload.error) {
        message = errorPayload.error;
      }
    } catch {
      // Ignore JSON parsing failure and keep the fallback message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getStoredAuthToken() {
    return getAuthToken();
  },
  clearAuthToken() {
    setAuthToken(null);
  },
  getAuthSession() {
    return request<{ user: { id: string; displayName?: string; username: string; email?: string } }>('/api/auth/session');
  },
  getV2AuthConfig() {
    return request<{ otpProvider: string; enabled: boolean; inviteRequired: boolean; codeLength: number; fixedCodeEnabled: boolean }>('/api/v2/auth/config');
  },
  validateV2InviteCode(code: string) {
    return request<{
      valid: true;
      inviteCode: {
        code: string;
        status: string;
        usageCount: number;
        usageLimit?: number;
        remainingUses?: number;
        expiresAt?: string;
        inviter?: { name?: string; avatarUrl?: string };
      };
    }>(`/api/v2/invite-codes/validate?code=${encodeURIComponent(code)}`);
  },
  joinV2Waitlist(payload: { phoneNumber: string; source?: string }) {
    return request<{ entry: { id: string; phoneNumber: string; source?: string; createdAt: string } }>('/api/v2/waitlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  requestV2Otp(payload: { phoneNumber: string; purpose: 'SIGN_UP' | 'SIGN_IN'; inviteCode?: string }) {
    return request<{ otpRequestId: string; phoneNumber: string; expiresAt: string }>('/api/v2/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  verifyV2Otp(payload: { otpRequestId: string; code: string; inviteCode?: string; displayName?: string }) {
    return request<{ token: string; user: V2UserPayload }>('/api/v2/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((response) => {
      setAuthToken(response.token);
      return response;
    });
  },
  getV2AuthSession() {
    return request<{ user: V2UserPayload }>('/api/v2/auth/session');
  },
  logoutV2() {
    return request<void>('/api/v2/auth/logout', {
      method: 'POST',
    }).finally(() => {
      setAuthToken(null);
    });
  },
  getV2Onboarding() {
    return request<{ onboarding: V2OnboardingPayload }>('/api/v2/onboarding');
  },
  updateV2Onboarding(payload: { currentStep?: string; completedStep?: string; skippedStep?: string }) {
    return request<{ onboarding: V2OnboardingPayload }>('/api/v2/onboarding', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  getV2Profile() {
    return request<{ user: V2UserPayload }>('/api/v2/profile/me');
  },
  updateV2Profile(payload: { displayName: string; username: string; avatarUrl?: string | null }) {
    return request<{ user: V2UserPayload; onboarding: V2OnboardingPayload }>('/api/v2/profile/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  updateV2Location(payload: { cityLabel: string; cityLatitude?: number | null; cityLongitude?: number | null; citySource?: string | null }) {
    return request<{ user: V2UserPayload; onboarding: V2OnboardingPayload }>('/api/v2/profile/location', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  matchV2Contacts(payload: { phoneNumbers: string[] }) {
    return request<{
      matches: {
        totalContactsSubmitted: number;
        matchedCount: number;
        matchedUsers: V2UserPayload[];
      };
      onboarding: V2OnboardingPayload;
    }>('/api/v2/contacts/match', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getProfileMe() {
    return request<{
      user: any;
      bookmarks: any[];
      collections: Array<{ id: string; label: string; places: any[]; createdAt?: string }>;
      moments: any[];
    }>('/api/profile/me');
  },
  joinWaitlist(payload: { email: string; source?: string }) {
    return request<{ entry: { id: string; email: string; source?: string | null } }>('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getPublicProfile(username: string) {
    return request<{
      user: any;
      bookmarks: any[];
      collections: Array<{ id: string; label: string; places: any[]; createdAt?: string }>;
      moments: any[];
    }>(`/api/profiles/${encodeURIComponent(username)}/public`);
  },
  login(payload: AuthPayload) {
    return request<{ token: string; user: { id: string; displayName?: string; username: string; email?: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((response) => {
      setAuthToken(response.token);
      return response;
    });
  },
  register(payload: Required<Pick<AuthPayload, 'name' | 'email' | 'password'>>) {
    return request<{ token: string; user: { id: string; displayName?: string; username: string; email?: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((response) => {
      setAuthToken(response.token);
      return response;
    });
  },
  googleAuth(payload: { idToken: string }) {
    return request<{ token: string; user: { id: string; displayName?: string; username: string; email?: string } }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((response) => {
      setAuthToken(response.token);
      return response;
    });
  },
  logout() {
    return request<void>('/api/auth/logout', {
      method: 'POST',
    }).finally(() => {
      setAuthToken(null);
    });
  },
  getNotifications() {
    return request<{ notifications: any[] }>('/api/notifications');
  },
  markNotificationRead(id: string) {
    return request<void>(`/api/notifications/${id}/read`, {
      method: 'POST',
    });
  },
  markAllNotificationsRead() {
    return request<void>('/api/notifications/read-all', {
      method: 'POST',
    });
  },
  getAccountSettings() {
    return request<{ profileDetails: { displayName?: string; username: string; bio: string }; signIn: { email?: string; providers: string[] } }>('/api/settings/account');
  },
  getNotificationSettings() {
    return request<{ pushEnabled: boolean; emailEnabled: boolean; recommendationEnabled: boolean }>('/api/settings/notifications');
  },
  updateNotificationSettings(payload: { pushEnabled: boolean; emailEnabled: boolean; recommendationEnabled: boolean }) {
    return request('/api/settings/notifications', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  getPrivacySettings() {
    return request<{ profileVisibility: 'public' | 'followers'; momentVisibility: 'public' | 'private' }>('/api/settings/privacy');
  },
  updatePrivacySettings(payload: { profileVisibility: 'public' | 'followers'; momentVisibility: 'public' | 'private' }) {
    return request('/api/settings/privacy', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  getSupport() {
    return request<{ faqs: string[] }>('/api/support');
  },
  lookupPlaces(query: string) {
    return request<{ places: any[] }>(`/api/lookups/places?q=${encodeURIComponent(query)}`);
  },
  lookupLocations(query: string) {
    return request<{ locations: Array<{ id: string; label: string; type: 'city' | 'province' | 'country'; googlePlaceId?: string }> }>(
      `/api/lookups/locations?q=${encodeURIComponent(query)}`,
    );
  },
  getSavedLocations() {
    return request<{ locations: Array<{ id: string; label: string; type: 'city' | 'province' | 'country'; googlePlaceId?: string; latitude?: number; longitude?: number }>; activeLocationId: string | null }>(
      '/api/saved-locations',
    );
  },
  addSavedLocation(payload: { label: string; type: 'city' | 'province' | 'country'; googlePlaceId?: string; isDefault?: boolean }) {
    return request<{ locations: Array<{ id: string; label: string; type: 'city' | 'province' | 'country'; googlePlaceId?: string; latitude?: number; longitude?: number }>; activeLocationId: string | null }>(
      '/api/saved-locations',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  setDefaultSavedLocation(locationId: string) {
    return request<{ activeLocationId: string }>(`/api/saved-locations/${locationId}/default`, {
      method: 'PATCH',
    });
  },
  getPlaceDetails(id: string) {
    return request<{ place: any }>(`/api/lookups/places/${id}`);
  },
  getPlaceDetailBundle(id: string) {
    return request<{
      place: any;
      relatedPlaces: Array<{ id: string; name: string; imageUrl: string }>;
      travelerMoments: Array<{
        id: string;
        travelerUsername: string;
        travelerAvatar: string;
        mediaUrl: string;
        mediaType: 'image' | 'video';
        caption: string;
      }>;
      interactionState: {
        bookmarkedPlaceIds: string[];
        beenTherePlaceIds: string[];
      };
    }>(`/api/lookups/places/${id}/bundle`);
  },
  getDiscoveryPlaces(
    location: string,
    type?: string,
    preferences?: { selectedInterests?: string[]; selectedVibe?: string | null },
    pagination?: { page?: number; limit?: number; refresh?: boolean; query?: string; seed?: string },
  ) {
    const params = new URLSearchParams({ location });
    if (type) params.set('type', type);
    if (preferences?.selectedInterests?.length) {
      params.set('interests', preferences.selectedInterests.join(','));
    }
    if (preferences?.selectedVibe) {
      params.set('vibe', preferences.selectedVibe);
    }
    if (pagination?.page) params.set('page', String(pagination.page));
    if (pagination?.limit) params.set('limit', String(pagination.limit));
    if (pagination?.refresh) params.set('refresh', '1');
    if (pagination?.query?.trim()) params.set('q', pagination.query.trim());
    if (pagination?.seed?.trim()) params.set('seed', pagination.seed.trim());
    return request<{ places: any[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } }>(`/api/discovery/places?${params.toString()}`);
  },
  getDiscoveryEvents(
    location: string,
    type?: string,
    preferences?: { selectedInterests?: string[]; selectedVibe?: string | null },
    pagination?: { page?: number; limit?: number; query?: string },
  ) {
    const params = new URLSearchParams({ location });
    if (type) params.set('type', type);
    if (preferences?.selectedInterests?.length) {
      params.set('interests', preferences.selectedInterests.join(','));
    }
    if (preferences?.selectedVibe) {
      params.set('vibe', preferences.selectedVibe);
    }
    if (pagination?.page) params.set('page', String(pagination.page));
    if (pagination?.limit) params.set('limit', String(pagination.limit));
    if (pagination?.query?.trim()) params.set('q', pagination.query.trim());
    return request<{ events: any[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } }>(`/api/discovery/events?${params.toString()}`);
  },
  getTravelerDiscovery() {
    return request<{
      followedTravelers: any[];
      similarTravelers: any[];
      feedSavedDrops?: Array<{
        id: string;
        travelerId: string;
        place: any;
        caption: string;
        savedAtLabel: string;
        savedAtIso?: string;
      }>;
    }>('/api/discovery/travelers');
  },
  searchPublicTravelers(query: string) {
    return request<{ travelers: any[] }>(`/api/discovery/travelers/public-search?q=${encodeURIComponent(query)}`);
  },
  getPublicTravelerSuggestions(limit = 12) {
    return request<{ travelers: any[] }>(`/api/discovery/travelers/public-suggestions?limit=${encodeURIComponent(String(limit))}`);
  },
  getTravelerProfile(id: string) {
    return request<{
      traveler: any;
      bookmarks: any[];
      collections: Array<{ id: string; label: string; places: any[]; createdAt?: string }>;
    }>(`/api/travelers/${id}`);
  },
  getPlaceTravelerMoments(id: string) {
    return request<{ travelerMoments: Array<{
      id: string;
      travelerUsername: string;
      travelerAvatar: string;
      mediaUrl: string;
      mediaType: 'image' | 'video';
      caption: string;
    }> }>(`/api/places/${id}/travelers`);
  },
  getRelatedPlaces(id: string) {
    return request<{ places: Array<{ id: string; name: string; imageUrl: string }> }>(`/api/places/${id}/related`);
  },
  getPersonalizationSignals() {
    return request<{
      bookmarkedPlaceIds: string[];
      dismissedPlaceIds: string[];
      selectedInterests: string[];
      selectedVibe: string | null;
    }>('/api/me/signals');
  },
  getInteractionState(payload?: { placeIds?: string[]; profileIds?: string[]; momentIds?: string[] }) {
    const params = new URLSearchParams();
    if (payload?.placeIds?.length) params.set('placeIds', payload.placeIds.join(','));
    if (payload?.profileIds?.length) params.set('profileIds', payload.profileIds.join(','));
    if (payload?.momentIds?.length) params.set('momentIds', payload.momentIds.join(','));
    return request<{
      bookmarkedPlaceIds: string[];
      beenTherePlaceIds: string[];
      vibedPlaceIds: string[];
      vibedMomentIds: string[];
      placeCommentCounts: Record<string, number>;
      placeVibinCounts: Record<string, number>;
      momentCommentCounts: Record<string, number>;
      momentVibinCounts: Record<string, number>;
      followedUserIds: string[];
      vibedProfileIds: string[];
      profileFollowerCounts: Record<string, number>;
      profileVibinCounts: Record<string, number>;
    }>(`/api/me/interaction-state${params.toString() ? `?${params.toString()}` : ''}`);
  },
  savePreferences(payload: { selectedInterests: string[]; selectedVibe: string | null; skippedPreferences?: boolean; onboardingCompleted?: boolean }) {
    return request('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  bookmarkPlace(payload: {
    placeId: string;
    place?: {
      name?: string;
      location?: string;
      address?: string;
      category?: string;
      image?: string;
      images?: string[];
      tags?: string[];
      description?: string;
      hook?: string;
      attitudeLabel?: string;
      bestTime?: string;
      rating?: number;
      priceLevel?: number;
      latitude?: number;
      longitude?: number;
    };
  }) {
    return request<{ bookmarkedPlaceIds: string[] }>('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBookmarks() {
    return request<{ bookmarks: any[] }>('/api/bookmarks');
  },
  removeBookmarkPlace(placeId: string) {
    return request<{ bookmarkedPlaceIds: string[] }>(`/api/bookmarks/${placeId}`, {
      method: 'DELETE',
    });
  },
  dismissPlace(payload: { placeId: string; reason?: string }) {
    return request<{ dismissedPlaceIds: string[] }>('/api/dismissed-places', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  markBeenThere(payload: { placeId: string; visitedAt?: string }) {
    return request<{ created: boolean; momentId: string; placeId: string }>('/api/been-there', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  toggleFollow(payload: { targetUserId: string }) {
    return request<{ active: boolean; followersCount: number }>('/api/follows/toggle', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  toggleVibin(payload: { targetType: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION'; targetId: string; receiverUserId?: string; momentId?: string }) {
    return request<{ active: boolean; count: number }>('/api/vibins/toggle', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getComments(payload: { targetType: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION'; targetId: string }) {
    const params = new URLSearchParams(payload);
    return request<{ comments: Array<{ id: string; user: string; body: string; createdAt: string }> }>(`/api/comments?${params.toString()}`);
  },
  createComment(payload: { targetType: 'PROFILE' | 'MOMENT' | 'PLACE' | 'PLACE_VISIT' | 'COLLECTION'; targetId: string; body: string; momentId?: string }) {
    return request<{ comment: { id: string; user: string; body: string; createdAt: string }; count: number }>('/api/comments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateProfile(payload: { displayName: string; username: string; bio: string; avatarUrl?: string }) {
    return request<{ user: { displayName?: string; username: string; bio: string; avatar: string } }>('/api/profile/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  createCollection(payload: { label: string; placeIds: string[] }) {
    return request<{ collection: { id: string; label: string; places: any[]; createdAt?: string } }>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCollections() {
    return request<{ collections: Array<{ id: string; label: string; places: any[]; createdAt?: string }> }>('/api/collections');
  },
  getPublicCollection(id: string) {
    return request<{
      collection: { id: string; label: string; places: any[]; createdAt?: string };
      owner: { id: string; username: string; displayName?: string; avatar: string };
    }>(`/api/collections/${encodeURIComponent(id)}/public`);
  },
  getMoments() {
    return request<{ moments: any[] }>('/api/moments');
  },
  createMoment(payload: Record<string, unknown>) {
    return request<{ moment: any }>('/api/moments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  uploadMomentMedia(payload: { files: Array<{ fileName: string; mimeType: string; dataUrl: string }> }) {
    return request<{ files: Array<{ url: string; fileName: string; mediaType: 'image' | 'video' }> }>('/api/uploads/media', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMoment(id: string, payload: Record<string, unknown>) {
    return request<{ moment: any }>(`/api/moments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
