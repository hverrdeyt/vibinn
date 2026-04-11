import UIKit
import SwiftUI
import AVKit
import MapKit
import CoreLocation
import AuthenticationServices
import Capacitor
import GoogleSignIn
import os
import SafariServices

private let useNativeIOSShell = true
private let nativeDiscoveryLayoutDebugMode = false
private let nativeTodayRecommendationDebugMode = false
private let nativeDiscoveryScoreDebugMode = true
private let nativeTodayRecommendationScoreDebugMode = true
private let nativeTravelerScoreDebugMode = true
private let nativeAccent = Color(red: 211 / 255, green: 1, blue: 72 / 255)
private let nativeBorder = Color.white.opacity(0.08)
private let nativeSurface = Color.white.opacity(0.06)
private let nativeSurfaceStrong = Color.white.opacity(0.09)
private let nativeProfileHeaderFill = Color(red: 16 / 255, green: 16 / 255, blue: 19 / 255).opacity(0.98)
private let nativeLogger = Logger(subsystem: "club.vibinn.app", category: "NativeShell")
private let nativeLocationOptions = [
    NativeLocationOption(id: "boston", label: "Boston"),
    NativeLocationOption(id: "new-york", label: "New York"),
    NativeLocationOption(id: "tokyo", label: "Tokyo"),
    NativeLocationOption(id: "jakarta", label: "Jakarta"),
]

private let nativeTravelerProfileHorizontalPadding: CGFloat = 22
private let nativeGoogleClientID = "937557434052-dj8h3e2pr7s85dmv4o4b2nttfjh40ma4.apps.googleusercontent.com"

private struct NativePreferenceSwipeCard: Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let imageURL: String
}

private let nativeInterestSwipeCards: [NativePreferenceSwipeCard] = [
    NativePreferenceSwipeCard(id: "cafe", title: "Cafe hopping", description: "good coffee, good light, and better neighborhood energy.", imageURL: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "culture", title: "Culture", description: "museums, old streets, and places with a story to tell.", imageURL: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "nature", title: "Nature days", description: "touch grass, reset the brain, keep the camera ready.", imageURL: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "party", title: "Nightlife & music", description: "city lights, live sets, and plans that start after dark.", imageURL: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "shopping", title: "Shopping & markets", description: "concept stores, local markets, and receipts worth keeping.", imageURL: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80"),
]

private let nativeVibeSwipeCards: [NativePreferenceSwipeCard] = [
    NativePreferenceSwipeCard(id: "aesthetic", title: "Aesthetic", description: "camera-roll worthy and low effort to love.", imageURL: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "solo", title: "Solo", description: "quiet, low-pressure wandering with no group chat chaos.", imageURL: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "spontaneous", title: "Spontaneous", description: "last-minute pivots, easy detours, and stories you did not plan.", imageURL: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "luxury", title: "Luxury", description: "good taste, soft sheets, and not pretending otherwise.", imageURL: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"),
    NativePreferenceSwipeCard(id: "budget", title: "Budget", description: "great finds without burning the whole wallet.", imageURL: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=800&q=80"),
]

private enum NativePostAuthAction {
    case openPreferenceSetup
    case openTodayRecommendation
}

final class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }
}

@MainActor
private func nativeTopViewController(
    base: UIViewController? = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first(where: \.isKeyWindow)?
        .rootViewController
) -> UIViewController? {
    if let navigationController = base as? UINavigationController {
        return nativeTopViewController(base: navigationController.visibleViewController)
    }
    if let tabBarController = base as? UITabBarController {
        return nativeTopViewController(base: tabBarController.selectedViewController)
    }
    if let presentedViewController = base?.presentedViewController {
        return nativeTopViewController(base: presentedViewController)
    }
    return base
}

private struct NativeAppleSignInPayload {
    let idToken: String
    let email: String?
    let givenName: String?
    let familyName: String?
}

@MainActor
private enum NativeGoogleSignInCoordinator {
    static func signIn(clientID: String) async throws -> String {
        guard let presentingViewController = nativeTopViewController() else {
            throw NSError(domain: "NativeGoogleSignIn", code: 1, userInfo: [NSLocalizedDescriptionKey: "No presenting view controller available."])
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)

        guard let idToken = result.user.idToken?.tokenString, !idToken.isEmpty else {
            throw NSError(domain: "NativeGoogleSignIn", code: 2, userInfo: [NSLocalizedDescriptionKey: "Google did not return an ID token."])
        }

        return idToken
    }

    static func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }
}

private final class NativeAppleSignInCoordinator: NSObject {
    private var continuation: CheckedContinuation<NativeAppleSignInPayload, Error>?
    private weak var presentationAnchor: ASPresentationAnchor?

    @MainActor
    func signIn() async throws -> NativeAppleSignInPayload {
        guard let presentingViewController = nativeTopViewController(),
              let window = presentingViewController.view.window ?? UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) else {
            throw NSError(domain: "NativeAppleSignIn", code: 1, userInfo: [NSLocalizedDescriptionKey: "No presenting view controller available."])
        }

        presentationAnchor = window

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension NativeAppleSignInCoordinator: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            continuation?.resume(throwing: NSError(domain: "NativeAppleSignIn", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple did not return a valid credential."]))
            continuation = nil
            return
        }

        guard
            let tokenData = credential.identityToken,
            let token = String(data: tokenData, encoding: .utf8),
            !token.isEmpty
        else {
            continuation?.resume(throwing: NSError(domain: "NativeAppleSignIn", code: 3, userInfo: [NSLocalizedDescriptionKey: "Apple did not return an identity token."]))
            continuation = nil
            return
        }

        continuation?.resume(returning: NativeAppleSignInPayload(
            idToken: token,
            email: credential.email,
            givenName: credential.fullName?.givenName,
            familyName: credential.fullName?.familyName
        ))
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

extension NativeAppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        presentationAnchor ?? ASPresentationAnchor()
    }
}

@main
private struct VibinnNativeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            if useNativeIOSShell {
                NativeVibinnRootView()
            } else {
                Color.black
                    .ignoresSafeArea()
            }
        }
    }
}

private enum NativeTab: Hashable {
    case discover
    case feed
    case checkIn
    case saved
    case profile
}

private struct NativeAuthUser: Codable {
    let id: String
    let displayName: String?
    let username: String
    let email: String?
    let hasCompletedTastePreferences: Bool?
}

private struct NativeAuthSessionResponse: Decodable {
    let user: NativeAuthUser
}

private struct NativeEmptyResponse: Decodable {}

private struct NativeLoginResponse: Decodable {
    let token: String
    let user: NativeAuthUser
}

private typealias NativeRegisterResponse = NativeLoginResponse

private struct NativePlace: Decodable, Identifiable {
    let id: String
    let name: String
    let location: String
    let address: String?
    let category: String?
    let description: String?
    let hook: String?
    let image: String?
    let images: [String]?
    let tags: [String]?
    let attitudeLabel: String?
    let bestTime: String?
    let similarityStat: Int?
    let whyYoullLikeIt: [String]?
    let recommendationReason: String?
    let rating: Double?
    let priceLevel: Int?
    let openingHours: [String]?
    let mapsUrl: String?
    let latitude: Double?
    let longitude: Double?
    let priceRange: String?
    let momentId: String?
    let ownerUserId: String?
    let visitedDate: String?
    let visitedAtIso: String?
    let momentCaption: String?
    let momentWouldRevisit: String?
    let momentRating: Int?
}

private struct NativePlaceDetailResponse: Decodable {
    let place: NativePlace
    let relatedPlaces: [NativePlace]?
    let travelerMoments: [NativePlaceTravelerMoment]?
    let interactionState: NativePlaceInteractionState?
}

private struct NativePlaceTravelerMoment: Decodable, Identifiable {
    let id: String
    let travelerUsername: String
    let travelerAvatar: String?
    let mediaUrl: String?
    let mediaType: String
    let caption: String?
}

private struct NativePlaceInteractionState: Decodable {
    let bookmarkedPlaceIds: [String]
    let beenTherePlaceIds: [String]
}

private struct NativePlaceDetailBundleResponse: Decodable {
    let place: NativePlace
    let relatedPlaces: [NativePlace]
    let travelerMoments: [NativePlaceTravelerMoment]
    let interactionState: NativePlaceInteractionState
}

private struct NativeDiscoveryPlacesResponse: Decodable {
    let places: [NativePlace]
    let pagination: NativeDiscoveryPagination?
}

private struct NativeTodayRecommendationResponse: Decodable {
    let place: NativePlace
    let compatibilityScore: Int
    let distanceMiles: Double
    let todayReason: String
}

private struct NativeTodayRecommendationDebugResponse: Decodable {
    let criteria: NativeTodayRecommendationDebugCriteria
    let profileContext: NativeTodayRecommendationDebugProfileContext
    let poolSummary: NativeTodayRecommendationDebugPoolSummary
    let selectedCandidate: NativeTodayRecommendationDebugCandidate?
    let topCandidates: [NativeTodayRecommendationDebugCandidate]
}

private struct NativeTodayRecommendationDebugCriteria: Decodable {
    let minScore: Int
    let preferredDistanceMiles: Double
    let fallbackDistanceMiles: Double
    let allowedClassifications: [String]
    let excludesVisited: Bool
}

private struct NativeTodayRecommendationDebugProfileContext: Decodable {
    let selectedInterests: [String]
    let selectedVibe: String?
    let bookmarkedCount: Int
    let visitedCount: Int
    let followedPlacesCount: Int
    let socialKeywordCount: Int
}

private struct NativeTodayRecommendationDebugPoolSummary: Decodable {
    let totalAreaCandidates: Int
    let rankedCandidates: Int
    let nearbyCandidates: Int
    let fallbackCandidates: Int
}

private struct NativeTodayRecommendationDebugCandidate: Decodable, Identifiable {
    let placeId: String
    let placeName: String
    let distanceMiles: Double
    let score: Int?
    let classification: String
    let reason: String?
    let isVisited: Bool?
    let persistedSourceVersion: String?
    let persistedUpdatedAt: String?
    let bestTime: String?
    let selectionBucket: String?
    let todayReason: String?

    var id: String { placeId }
}

private struct NativeTravelerScoreDebugResponse: Decodable {
    let travelerId: String
    let travelerUsername: String
    let effectiveScore: Int
    let persistedScore: Int?
    let persistedReason: String?
    let persistedUpdatedAt: String?
    let descriptor: String?
    let calculation: NativeTravelerScoreCalculation
    let overlaps: NativeTravelerScoreOverlaps
    let reasoning: NativeTravelerScoreReasoning
    let viewerContext: NativeTravelerScoreViewerContext
}

private struct NativeTravelerScoreCalculation: Decodable {
    let baseScore: Int
    let overlapPlaces: Int
    let overlapPlacesDelta: Int
    let overlapKeywords: Int
    let overlapKeywordsDelta: Int
    let isFollowing: Bool
    let followingDelta: Int
    let interactionCount: Int
    let interactionBoost: Int
    let interactionDelta: Int
    let computedScore: Int
}

private struct NativeTravelerScoreOverlaps: Decodable {
    let sharedPlaceNames: [String]
    let sharedTasteKeywords: [String]
}

private struct NativeTravelerScoreReasoning: Decodable {
    let computedReason: String
    let persistedReason: String?
}

private struct NativeTravelerScoreViewerContext: Decodable {
    let selectedInterests: [String]
    let selectedVibe: String?
    let tasteKeywords: [String]
}

private struct NativePlaceScoreDebugResponse: Decodable {
    let placeId: String
    let placeName: String
    let effectiveScore: Int?
    let effectiveClassification: String
    let persistedScore: NativePlaceScorePersistedSnapshot?
    let calculation: NativePlaceScoreCalculation
    let interactions: NativePlaceScoreInteractions
    let availableSignals: NativePlaceScoreSignals
    let history: NativePlaceScoreHistory
}

private struct NativePlaceScorePersistedSnapshot: Decodable {
    let matchScore: Int?
    let similarityPercentage: Int?
    let recommendationReason: String?
    let distanceKm: Double?
    let sourceVersion: String?
    let updatedAt: String?
}

private struct NativePlaceScoreCalculation: Decodable {
    let finalScore: Int
    let classification: String
    let unclampedScore: Int
    let baseScore: Int
    let diversitySeed: Int
    let baseSimilarityInput: Int?
    let selectedInterests: [String]
    let selectedVibe: String?
    let matchedInterestCount: Int
    let matchedVibe: Bool
    let noisePenalty: Int
    let momentOverlapCount: Int
    let bookmarkOverlapCount: Int
    let socialOverlapCount: Int
    let contributions: [NativePlaceScoreContribution]
}

private struct NativePlaceScoreContribution: Decodable, Identifiable {
    let key: String
    let label: String
    let delta: Int
    let note: String?

    var id: String { "\(key)-\(label)-\(delta)" }
}

private struct NativePlaceScoreInteractions: Decodable {
    let isBookmarked: Bool
    let isVisited: Bool
    let isVibed: Bool
    let isCommented: Bool
    let isRecent: Bool
    let followedPlaceMatch: Bool
    let momentRating: Int?
}

private struct NativePlaceScoreSignals: Decodable {
    let bookmarkKeywords: [String]
    let momentKeywords: [String]
    let socialKeywords: [String]
    let tasteKeywords: [String]
}

private struct NativePlaceScoreHistory: Decodable {
    let persistedUpdatedAt: String?
    let sourceVersion: String?
    let persistedReason: String?
}

private struct NativeDiscoveryPagination: Decodable {
    let page: Int
    let limit: Int
    let total: Int
    let hasMore: Bool
}

private struct NativeCollection: Decodable, Identifiable {
    let id: String
    let label: String
    let createdAt: String?
    let places: [NativePlace]
}

private struct NativeTravelerSavedEntry: Decodable {
    let place: NativePlace
    let savedAtLabel: String
    let savedAtIso: String?
}

private struct NativeTravelHistoryGroup: Decodable {
    let country: String?
    let cities: [String]
    let places: [NativePlace]
}

private struct NativeTravelerSummary: Decodable, Identifiable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let bio: String?
    let descriptor: String?
    let matchScore: Int?
    let followersCount: Int?
    let recentSavedPlaces: [NativeTravelerSavedEntry]?
    let recentCollections: [NativeCollection]?
    let travelHistory: [NativeTravelHistoryGroup]
    let visitedPlacesCount: Int?
    let savedPlacesCount: Int?
    let collectionsCount: Int?
}

private struct NativeFeedSavedDrop: Decodable, Identifiable {
    let id: String
    let travelerId: String
    let place: NativePlace
    let caption: String
    let savedAtLabel: String
    let savedAtIso: String?
}

private struct NativeTravelerDiscoveryResponse: Decodable {
    let followedTravelers: [NativeTravelerSummary]
    let similarTravelers: [NativeTravelerSummary]
    let feedSavedDrops: [NativeFeedSavedDrop]?
}

private struct NativeFeedResponse: Decodable {
    let followedTravelers: [NativeTravelerSummary]
    let suggestedTravelers: [NativeTravelerSummary]
    let items: [NativeServerFeedItem]
}

private struct NativeServerFeedItem: Decodable, Identifiable {
    let id: String
    let type: String
    let traveler: NativeTravelerSummary
    let timestampLabel: String
    let sortTimestamp: String?
    let place: NativePlace?
    let collection: NativeCollection?
    let caption: String?
}

private struct NativeTravelerSearchResponse: Decodable {
    let travelers: [NativeTravelerSummary]
}

private struct NativeFollowerListItem: Decodable, Identifiable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let matchScore: Int?
}

private struct NativeTravelerFollowersResponse: Decodable {
    let travelers: [NativeFollowerListItem]
}

private struct NativeBlockedUser: Decodable, Identifiable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let blockedAt: String
    let reason: String?
}

private struct NativeBlockedUsersResponse: Decodable {
    let users: [NativeBlockedUser]
}

private struct NativeModerationActionResponse: Decodable {
    let ok: Bool
    let reportId: String?
    let blockedUserId: String?
}

private struct NativeTravelerProfileResponse: Decodable {
    let traveler: NativeTravelerSummary
    let bookmarks: [NativePlace]
    let collections: [NativeCollection]
}

private struct NativePlaceLookupResponse: Decodable {
    let places: [NativePlace]
}

private struct NativeMomentResponse: Decodable {
    let moment: NativeCreatedMoment
}

private enum NativeReportReason: String, CaseIterable, Identifiable {
    case spam = "Spam or scam"
    case harassment = "Harassment or bullying"
    case hate = "Hate or abusive content"
    case sexual = "Sexual or inappropriate content"
    case violence = "Violence or dangerous behavior"
    case other = "Other"

    var id: String { rawValue }
}

private struct NativeCreatedMoment: Decodable {
    let id: String
    let placeId: String
    let visitedDate: String
    let visitedAtIso: String?
    let caption: String?
    let place: NativePlace?
}

private struct NativeMoment: Decodable, Identifiable {
    let id: String
    let visitedDate: String
    let visitedAtIso: String?
    let caption: String?
    let rating: Int?
    let wouldRevisit: String?
    let place: NativePlace
}

private struct NativeMomentsResponse: Decodable {
    let moments: [NativeMoment]
}

struct NativeComment: Decodable, Identifiable {
    let id: String
    let user: String
    let body: String
    let createdAt: String
}

private enum NativeFeedActivityType {
    case saved
    case visited
    case collection
}

private struct NativeFeedItem: Identifiable {
    let id: String
    let type: NativeFeedActivityType
    let traveler: NativeTravelerSummary
    let title: String
    let timestampLabel: String
    let sortTimestamp: Date
    let place: NativePlace?
    let collection: NativeCollection?
    let caption: String?
}

private struct NativeProfileResponse: Decodable {
    let user: NativeAuthUser
    let bookmarks: [NativePlace]
    let collections: [NativeCollection]
}

private struct NativeBookmarksResponse: Decodable {
    let bookmarks: [NativePlace]
}

private struct NativeCollectionsResponse: Decodable {
    let collections: [NativeCollection]
}

private struct NativeCreateCollectionResponse: Decodable {
    let collection: NativeCollection
}

private struct NativeLocationOption: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
}

private struct NativeLocationLookupResponse: Decodable {
    let locations: [NativeLocationOption]
}

private enum NativeProfileSection: String, CaseIterable, Identifiable {
    case feed = "Feed"
    case saved = "Saved"
    case visited = "Visited"
    case collections = "Collections"

    var id: String { rawValue }
}

private enum NativeSavedSection: String, CaseIterable, Identifiable {
    case places = "Saved places"
    case collections = "Collections"

    var id: String { rawValue }
}

private struct NativeMoodBadgeMeta {
    let label: String
    let icon: String
    let foreground: Color
    let background: Color
}

private let nativePlaceMoodBadges: [NativeMoodBadgeMeta] = [
    NativeMoodBadgeMeta(label: "After dark", icon: "moon.stars.fill", foreground: Color(red: 251 / 255, green: 191 / 255, blue: 255 / 255), background: Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255).opacity(0.26)),
    NativeMoodBadgeMeta(label: "Scenic", icon: "water.waves", foreground: Color(red: 186 / 255, green: 230 / 255, blue: 253 / 255), background: Color(red: 14 / 255, green: 165 / 255, blue: 233 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Walkable", icon: "figure.walk", foreground: Color(red: 187 / 255, green: 247 / 255, blue: 208 / 255), background: Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Browsey", icon: "bag.fill", foreground: Color(red: 253 / 255, green: 230 / 255, blue: 138 / 255), background: Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Cozy", icon: "book.closed.fill", foreground: Color(red: 254 / 255, green: 205 / 255, blue: 211 / 255), background: Color(red: 244 / 255, green: 63 / 255, blue: 94 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Cultural", icon: "building.columns.fill", foreground: Color(red: 221 / 255, green: 214 / 255, blue: 254 / 255), background: Color(red: 139 / 255, green: 92 / 255, blue: 246 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Chill", icon: "cup.and.saucer.fill", foreground: Color(red: 217 / 255, green: 249 / 255, blue: 157 / 255), background: Color(red: 132 / 255, green: 204 / 255, blue: 22 / 255).opacity(0.24)),
    NativeMoodBadgeMeta(label: "Outdoorsy", icon: "tree.fill", foreground: Color(red: 153 / 255, green: 246 / 255, blue: 228 / 255), background: Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255).opacity(0.24)),
]

private struct NativeCompatibilityBadgeMeta {
    let label: String
    let foreground: Color
    let background: Color
}

@MainActor
private final class NativeAppState: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var isBootstrapping = true
    @Published var currentUser: NativeAuthUser?
    @Published var activeTab: NativeTab = .discover
    @Published var selectedLocation = NativeLocationOption(id: "boston", label: "Boston")
    @Published var selectedInterests: [String] = []
    @Published var selectedVibe: String?
    @Published var hasCompletedOnboarding = false
    @Published var isDiscoveryLoading = false
    @Published var isDiscoveryLoadingMore = false
    @Published var discoveryPlaces: [NativePlace] = []
    @Published var discoveryPage = 1
    @Published var discoveryHasMore = false
    @Published var todayRecommendation: NativeTodayRecommendationResponse?
    @Published var isTodayRecommendationLoading = false
    @Published var todayRecommendationErrorMessage: String?
    @Published var savedPlaces: [NativePlace] = []
    @Published var collections: [NativeCollection] = []
    @Published var myMoments: [NativeMoment] = []
    @Published var ownFeedItemsCache: [NativeFeedItem] = []
    @Published var followedTravelers: [NativeTravelerSummary] = []
    @Published var suggestedTravelers: [NativeTravelerSummary] = []
    @Published var feedItems: [NativeFeedItem] = []
    @Published var blockedTravelerIds: Set<String> = []
    @Published var showFloatingTabBar = true
    @Published var currentCoordinate: CLLocationCoordinate2D?
    @Published var profileErrorMessage: String?
    @Published var discoveryErrorMessage: String?
    @Published var feedErrorMessage: String?
    @Published var savedErrorMessage: String?
    @Published var showAuthSheet = false
    @Published var authSheetReason: String?
    @Published var showPreferenceSetupSheet = false

    private let api = NativeAPIClient()
    private let authTokenKey = "vibinn_native_auth_token"
    private let onboardingKey = "vibinn_native_onboarding_completed"
    private let locationKey = "vibinn_native_location_label"
    private let selectedInterestsKey = "vibinn_native_selected_interests"
    private let selectedVibeKey = "vibinn_native_selected_vibe"
    private let locationManager = CLLocationManager()
    private var floatingTabBarHideDepth = 0
    private var followStateOverrides: [String: Bool] = [:]
    private var pendingPostAuthAction: NativePostAuthAction?

    var shouldShowUnlockVibeCTA: Bool {
        if let currentUser {
            return currentUser.hasCompletedTastePreferences != true
        }
        return true
    }

    override init() {
        super.init()
        let storedLocation = UserDefaults.standard.string(forKey: locationKey) ?? "Boston"
        self.selectedLocation = NativeLocationOption(id: storedLocation.lowercased(), label: storedLocation)
        self.hasCompletedOnboarding = UserDefaults.standard.bool(forKey: onboardingKey)
        self.selectedInterests = UserDefaults.standard.stringArray(forKey: selectedInterestsKey) ?? []
        self.selectedVibe = UserDefaults.standard.string(forKey: selectedVibeKey)
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        if locationManager.authorizationStatus == .authorizedAlways || locationManager.authorizationStatus == .authorizedWhenInUse {
            locationManager.startUpdatingLocation()
        } else if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        nativeLogger.log("NativeAppState init. location=\(self.selectedLocation.label, privacy: .public) onboarding=\(self.hasCompletedOnboarding, privacy: .public)")
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        Task { @MainActor in
            self.currentCoordinate = coordinate
        }
    }

    func pushFloatingTabBarHidden() {
        floatingTabBarHideDepth += 1
        showFloatingTabBar = floatingTabBarHideDepth <= 0
    }

    func popFloatingTabBarHidden() {
        floatingTabBarHideDepth = max(0, floatingTabBarHideDepth - 1)
        showFloatingTabBar = floatingTabBarHideDepth <= 0
    }

    func bootstrap() async {
        nativeLogger.log("bootstrap start")
        defer { isBootstrapping = false }
        guard let token = authToken else { return }

        do {
            let session = try await api.getAuthSession(token: token)
            currentUser = session.user
            await syncLocalTastePreferencesIfNeeded()
            nativeLogger.log("bootstrap session ok user=\(session.user.username, privacy: .public)")
        } catch {
            nativeLogger.error("bootstrap failed: \(error.localizedDescription, privacy: .public)")
            clearSession()
        }
    }

    func login(email: String, password: String) async throws {
        nativeLogger.log("login start email=\(email, privacy: .public)")
        let response = try await api.login(email: email, password: password)
        authToken = response.token
        currentUser = response.user
        await syncLocalTastePreferencesIfNeeded()
        nativeLogger.log("login success user=\(response.user.username, privacy: .public)")
    }

    func register(name: String, email: String, password: String) async throws {
        nativeLogger.log("register start email=\(email, privacy: .public)")
        let response = try await api.register(name: name, email: email, password: password)
        authToken = response.token
        currentUser = response.user
        await syncLocalTastePreferencesIfNeeded()
        nativeLogger.log("register success user=\(response.user.username, privacy: .public)")
    }

    func loginWithGoogle() async throws {
        nativeLogger.log("google login start")
        let idToken = try await NativeGoogleSignInCoordinator.signIn(clientID: nativeGoogleClientID)
        let response = try await api.googleAuth(idToken: idToken)
        authToken = response.token
        currentUser = response.user
        await syncLocalTastePreferencesIfNeeded()
        nativeLogger.log("google login success user=\(response.user.username, privacy: .public)")
    }

    func loginWithApple() async throws {
        nativeLogger.log("apple login start")
        let coordinator = NativeAppleSignInCoordinator()
        let payload = try await coordinator.signIn()
        let response = try await api.appleAuth(
            idToken: payload.idToken,
            email: payload.email,
            givenName: payload.givenName,
            familyName: payload.familyName
        )
        authToken = response.token
        currentUser = response.user
        await syncLocalTastePreferencesIfNeeded()
        nativeLogger.log("apple login success user=\(response.user.username, privacy: .public)")
    }

    func loadPlaceScoreDebug(for placeId: String) async throws -> NativePlaceScoreDebugResponse {
        try await api.getPlaceScoreDebug(
            placeId: placeId,
            selectedInterests: selectedInterests,
            selectedVibe: selectedVibe,
            token: authToken
        )
    }

    func loadTodayRecommendationDebug() async throws -> NativeTodayRecommendationDebugResponse {
        guard let token = authToken else {
            throw NSError(domain: "NativeTodayRecommendationDebug", code: 1, userInfo: [NSLocalizedDescriptionKey: "Login required"])
        }
        guard let coordinate = currentCoordinate else {
            throw NSError(domain: "NativeTodayRecommendationDebug", code: 2, userInfo: [NSLocalizedDescriptionKey: "Location required"])
        }
        return try await api.getTodayRecommendationDebug(
            token: token,
            location: selectedLocation.label,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )
    }

    func loadTravelerScoreDebug(for travelerId: String) async throws -> NativeTravelerScoreDebugResponse {
        try await api.getTravelerScoreDebug(id: travelerId, token: authToken)
    }

    func logout() {
        NativeGoogleSignInCoordinator.signOut()
        clearSession()
        discoveryPlaces = []
        discoveryPage = 1
        discoveryHasMore = false
        todayRecommendation = nil
        isTodayRecommendationLoading = false
        todayRecommendationErrorMessage = nil
        savedPlaces = []
        collections = []
        myMoments = []
        ownFeedItemsCache = []
        followedTravelers = []
        suggestedTravelers = []
        feedItems = []
        profileErrorMessage = nil
        discoveryErrorMessage = nil
        feedErrorMessage = nil
        savedErrorMessage = nil
        authSheetReason = nil
        showPreferenceSetupSheet = false
        pendingPostAuthAction = nil
    }

    func presentAuthGate(reason: String, postAuthAction: NativePostAuthAction? = nil) {
        authSheetReason = reason
        pendingPostAuthAction = postAuthAction
        showAuthSheet = true
    }

    func dismissAuthGate() {
        showAuthSheet = false
        authSheetReason = nil
    }

    func presentPreferenceSetup() {
        showPreferenceSetupSheet = true
    }

    func dismissPreferenceSetup() {
        showPreferenceSetupSheet = false
    }

    func performPendingPostAuthActionIfNeeded() {
        guard let action = pendingPostAuthAction else { return }
        pendingPostAuthAction = nil
        switch action {
        case .openPreferenceSetup:
            showPreferenceSetupSheet = true
        case .openTodayRecommendation:
            Task { await loadTodayRecommendation() }
        }
    }

    func updateTastePreferences(selectedInterests: [String], selectedVibe: String?) async {
        self.selectedInterests = selectedInterests
        self.selectedVibe = selectedVibe
        UserDefaults.standard.set(selectedInterests, forKey: selectedInterestsKey)
        UserDefaults.standard.set(selectedVibe, forKey: selectedVibeKey)

        guard let token = authToken else { return }

        do {
            try await api.savePreferences(
                token: token,
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe,
                skippedPreferences: selectedInterests.isEmpty && selectedVibe == nil,
                onboardingCompleted: true
            )
            if let currentUser {
                self.currentUser = NativeAuthUser(
                    id: currentUser.id,
                    displayName: currentUser.displayName,
                    username: currentUser.username,
                    email: currentUser.email,
                    hasCompletedTastePreferences: true
                )
            }
        } catch {
            nativeLogger.error("savePreferences failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func completeOnboarding(with location: NativeLocationOption, selectedInterests: [String] = [], selectedVibe: String? = nil) async {
        selectedLocation = location
        UserDefaults.standard.set(true, forKey: onboardingKey)
        UserDefaults.standard.set(location.label, forKey: locationKey)
        hasCompletedOnboarding = true
        await updateTastePreferences(selectedInterests: selectedInterests, selectedVibe: selectedVibe)
        Task { await self.refreshDiscovery() }
        Task { await self.refreshFeed() }
    }

    func updateLocation(to location: NativeLocationOption) async {
        guard selectedLocation != location else { return }
        selectedLocation = location
        UserDefaults.standard.set(location.label, forKey: locationKey)
        discoveryPlaces = []
        discoveryPage = 1
        discoveryHasMore = false
        todayRecommendation = nil
        todayRecommendationErrorMessage = nil
        await refreshDiscovery()
    }

    func loadTodayRecommendation() async {
        guard let token = authToken else {
            presentAuthGate(
                reason: "Log in to get today's recommendation.",
                postAuthAction: .openTodayRecommendation
            )
            return
        }

        guard let currentCoordinate else {
            todayRecommendationErrorMessage = "Enable location to get today's recommendation."
            return
        }

        isTodayRecommendationLoading = true
        todayRecommendationErrorMessage = nil
        defer { isTodayRecommendationLoading = false }

        do {
            let recommendation = try await api.getTodayRecommendation(
                token: token,
                location: selectedLocation.label,
                latitude: currentCoordinate.latitude,
                longitude: currentCoordinate.longitude
            )
            todayRecommendation = recommendation
        } catch {
            if error is CancellationError {
                return
            }
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                return
            }
            nativeLogger.error("loadTodayRecommendation failed: \(error.localizedDescription, privacy: .public)")
            todayRecommendation = nil
            todayRecommendationErrorMessage = "Could not get today's recommendation right now."
        }
    }

    func refreshDiscovery() async {
        nativeLogger.log("refreshDiscovery start location=\(self.selectedLocation.label, privacy: .public)")
        isDiscoveryLoading = true
        discoveryErrorMessage = nil
        defer { isDiscoveryLoading = false }
        do {
            let response = try await api.getDiscoveryPlaces(
                location: selectedLocation.label,
                page: 1,
                limit: 18,
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe,
                token: authToken
            )
            discoveryPlaces = response.places
            discoveryPage = response.pagination?.page ?? 1
            discoveryHasMore = response.pagination?.hasMore ?? false
            nativeLogger.log("refreshDiscovery success count=\(self.discoveryPlaces.count, privacy: .public)")
        } catch {
            if error is CancellationError {
                nativeLogger.log("refreshDiscovery cancelled")
                return
            }
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                nativeLogger.log("refreshDiscovery cancelled")
                return
            }
            nativeLogger.error("refreshDiscovery failed: \(error.localizedDescription, privacy: .public)")
            if discoveryPlaces.isEmpty {
                discoveryPlaces = nativeFallbackDiscoveryPlaces(for: selectedLocation.label)
                discoveryPage = 1
                discoveryHasMore = false
            }
            discoveryErrorMessage = "Could not refresh discovery right now."
        }
    }

    func loadMoreDiscoveryIfNeeded(currentPlaceId: String) async {
        guard discoveryHasMore, !isDiscoveryLoading, !isDiscoveryLoadingMore else { return }
        guard discoveryPlaces.last?.id == currentPlaceId else { return }

        isDiscoveryLoadingMore = true
        defer { isDiscoveryLoadingMore = false }

        do {
            let nextPage = discoveryPage + 1
            let response = try await api.getDiscoveryPlaces(
                location: selectedLocation.label,
                page: nextPage,
                limit: 18,
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe,
                token: authToken
            )
            let existingIds = Set(discoveryPlaces.map(\.id))
            let nextPlaces = response.places.filter { !existingIds.contains($0.id) }
            discoveryPlaces.append(contentsOf: nextPlaces)
            discoveryPage = response.pagination?.page ?? nextPage
            discoveryHasMore = response.pagination?.hasMore ?? false
        } catch {
            if error is CancellationError {
                nativeLogger.log("loadMoreDiscovery cancelled")
                return
            }
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                nativeLogger.log("loadMoreDiscovery cancelled")
                return
            }
            nativeLogger.error("loadMoreDiscovery failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func nativeFallbackDiscoveryPlaces(for location: String) -> [NativePlace] {
        let matchingSaved = savedPlaces.filter { $0.location.localizedCaseInsensitiveContains(location) }
        let matchingMoments = myMoments
            .map(\.place)
            .filter { $0.location.localizedCaseInsensitiveContains(location) }
        let seededPlaces = matchingSaved + matchingMoments
        var seen = Set<String>()
        return seededPlaces.filter { place in
            if seen.contains(place.id) { return false }
            seen.insert(place.id)
            return true
        }
    }

    func refreshProfile() async {
        nativeLogger.log("refreshProfile start")
        profileErrorMessage = nil
        guard let token = authToken else { return }

        do {
            async let profileTask = api.getProfile(token: token)
            async let momentsTask = api.getMoments(token: token)
            let (response, moments) = try await (profileTask, momentsTask)
            let uniqueBookmarks = Array(
                Dictionary(response.bookmarks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values
            )
            let uniqueCollections = Array(
                Dictionary(response.collections.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values
            )
            let uniqueMoments = Array(
                Dictionary(moments.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values
            )
            currentUser = response.user
            savedPlaces = uniqueBookmarks
            collections = uniqueCollections
            myMoments = uniqueMoments
            rebuildOwnFeedItems()
            nativeLogger.log("refreshProfile success bookmarks=\(self.savedPlaces.count, privacy: .public) collections=\(self.collections.count, privacy: .public) moments=\(self.myMoments.count, privacy: .public)")
        } catch {
            nativeLogger.error("refreshProfile failed: \(error.localizedDescription, privacy: .public)")
            profileErrorMessage = "Could not load your profile right now."
        }
    }

    func refreshSavedContent() async {
        nativeLogger.log("refreshSavedContent start")
        savedErrorMessage = nil
        guard let token = authToken else { return }

        var didLoadAnyData = false

        do {
            let bookmarks = try await api.getBookmarks(token: token)
            let uniqueBookmarks = Array(
                Dictionary(bookmarks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values
            )
            savedPlaces = uniqueBookmarks
            didLoadAnyData = true
        } catch {
            nativeLogger.error("refreshSavedContent bookmarks failed: \(error.localizedDescription, privacy: .public)")
        }

        do {
            let collectionsResponse = try await api.getCollections(token: token)
            let uniqueCollections = Array(
                Dictionary(collectionsResponse.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values
            )
            collections = uniqueCollections
            didLoadAnyData = true
        } catch {
            nativeLogger.error("refreshSavedContent collections failed: \(error.localizedDescription, privacy: .public)")
        }

        if didLoadAnyData {
            savedErrorMessage = nil
            rebuildOwnFeedItems()
            nativeLogger.log("refreshSavedContent success bookmarks=\(self.savedPlaces.count, privacy: .public) collections=\(self.collections.count, privacy: .public)")
        } else {
            savedErrorMessage = "Could not load your saved places right now."
        }
    }

    private func syncLocalTastePreferencesIfNeeded() async {
        guard let token = authToken else { return }
        guard (!selectedInterests.isEmpty || selectedVibe != nil) else { return }
        guard currentUser?.hasCompletedTastePreferences != true else { return }

        do {
            try await api.savePreferences(
                token: token,
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe,
                skippedPreferences: false,
                onboardingCompleted: true
            )
            if let currentUser {
                self.currentUser = NativeAuthUser(
                    id: currentUser.id,
                    displayName: currentUser.displayName,
                    username: currentUser.username,
                    email: currentUser.email,
                    hasCompletedTastePreferences: true
                )
            }
        } catch {
            nativeLogger.error("syncLocalTastePreferences failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func createCollection(label: String, placeIds: [String]) async throws {
        guard let token = authToken else {
            throw URLError(.userAuthenticationRequired)
        }

        let collection = try await api.createCollection(token: token, label: label, placeIds: placeIds)
        collections.insert(collection, at: 0)
        rebuildOwnFeedItems()
    }

    func refreshFeed() async {
        nativeLogger.log("refreshFeed start")
        feedErrorMessage = nil
        guard let token = authToken else { return }

        do {
            let response = try await api.getFeed(token: token)
            followedTravelers = response.followedTravelers
            suggestedTravelers = response.suggestedTravelers
            feedItems = response.items.compactMap { item in
                let type: NativeFeedActivityType
                switch item.type {
                case "saved":
                    type = .saved
                case "visited":
                    type = .visited
                case "collection":
                    type = .collection
                default:
                    return nil
                }

                return NativeFeedItem(
                    id: item.id,
                    type: type,
                    traveler: item.traveler,
                    title: "",
                    timestampLabel: item.timestampLabel,
                    sortTimestamp: NativeAppState.date(from: item.sortTimestamp) ?? NativeAppState.feedSortDate(iso: item.sortTimestamp, label: item.timestampLabel) ?? .distantPast,
                    place: item.place,
                    collection: item.collection,
                    caption: item.caption
                )
            }
            nativeLogger.log("refreshFeed success followed=\(self.followedTravelers.count, privacy: .public) suggested=\(self.suggestedTravelers.count, privacy: .public) items=\(self.feedItems.count, privacy: .public)")
        } catch {
            if error is CancellationError {
                nativeLogger.log("refreshFeed cancelled")
                return
            }
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                nativeLogger.log("refreshFeed cancelled")
                return
            }
            nativeLogger.error("refreshFeed primary failed: \(error.localizedDescription, privacy: .public)")
            if feedItems.isEmpty {
                feedItems = ownFeedItemsCache
            }
            feedErrorMessage = "Could not refresh feed right now."
        }
    }

    func loadActiveTabIfNeeded() async {
        switch activeTab {
        case .discover:
            if discoveryPlaces.isEmpty {
                await refreshDiscovery()
            }
        case .feed:
            if feedItems.isEmpty {
                await refreshFeed()
            }
        case .checkIn:
            break
        case .saved:
            if savedPlaces.isEmpty && collections.isEmpty {
                await refreshSavedContent()
            }
        case .profile:
            break
        }
    }

    func lookupPlaces(query: String) async throws -> [NativePlace] {
        try await api.lookupPlaces(query: query, token: authToken)
    }

    func lookupLocations(query: String) async throws -> [NativeLocationOption] {
        try await api.lookupLocations(query: query)
    }

    func searchTravelers(query: String) async throws -> [NativeTravelerSummary] {
        try await api.searchPublicTravelers(query: query)
    }

    func submitCheckIn(
        place: NativePlace,
        rating: Int,
        wouldRevisit: String,
        note: String
    ) async throws {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to save your check-ins.")
            throw URLError(.userAuthenticationRequired)
        }

        let createdMoment = try await api.createMoment(
            token: token,
            placeId: place.id,
            visitedDate: Self.todayString,
            caption: note,
            rating: rating,
            wouldRevisit: wouldRevisit
        )

        let resolvedPlace = createdMoment.place ?? place
        myMoments.insert(
            NativeMoment(
                id: createdMoment.id,
                visitedDate: createdMoment.visitedDate,
                visitedAtIso: createdMoment.visitedAtIso,
                caption: createdMoment.caption,
                rating: rating,
                wouldRevisit: wouldRevisit,
                place: resolvedPlace
            ),
            at: 0
        )
        rebuildOwnFeedItems()

        async let profileTask = refreshProfile()
        async let feedTask = refreshFeed()
        async let discoveryTask = refreshDiscovery()
        _ = await (profileTask, feedTask, discoveryTask)
    }

    func fetchPlaceDetail(id: String) async throws -> NativePlaceDetailResponse {
        try await api.getPlaceDetail(id: id, token: authToken)
    }

    func fetchPlaceDetailBundle(id: String) async throws -> NativePlaceDetailBundleResponse {
        try await api.getPlaceDetailBundle(id: id, token: authToken)
    }

    func fetchTravelerProfile(id: String) async throws -> NativeTravelerProfileResponse {
        guard let token = authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        return try await api.getTravelerProfile(id: id, token: token)
    }

    func fetchTravelerFollowers(id: String) async throws -> [NativeFollowerListItem] {
        guard let token = authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        return try await api.getTravelerFollowers(id: id, token: token)
    }

    func isBookmarked(_ placeId: String) -> Bool {
        savedPlaces.contains(where: { $0.id == placeId })
    }

    func isVisited(_ placeId: String) -> Bool {
        myMoments.contains(where: { $0.place.id == placeId })
    }

    func dismissDiscoveryPlace(_ placeId: String) {
        discoveryPlaces.removeAll { $0.id == placeId }
    }

    func toggleBookmark(for place: NativePlace) async throws {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to save places.")
            throw URLError(.userAuthenticationRequired)
        }

        if isBookmarked(place.id) {
            _ = try await api.removeBookmarkPlace(token: token, placeId: place.id)
            savedPlaces.removeAll { $0.id == place.id }
        } else {
            _ = try await api.bookmarkPlace(token: token, place: place)
            savedPlaces.insert(place, at: 0)
        }
        rebuildOwnFeedItems()
    }

    func isFollowing(_ travelerId: String) -> Bool {
        if let override = followStateOverrides[travelerId] {
            return override
        }
        return followedTravelers.contains(where: { $0.id == travelerId })
    }

    func isBlocked(_ travelerId: String) -> Bool {
        blockedTravelerIds.contains(travelerId)
    }

    func toggleFollowQuietly(for traveler: NativeTravelerSummary) async throws -> NativeAPIClient.NativeToggleFollowResponse {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to follow travelers.")
            throw URLError(.userAuthenticationRequired)
        }

        let result = try await api.toggleFollow(token: token, targetUserId: traveler.id)
        followStateOverrides[traveler.id] = result.active
        return result
    }

    func toggleFollow(for traveler: NativeTravelerSummary, refreshFeedAfter: Bool = true) async throws -> NativeAPIClient.NativeToggleFollowResponse {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to follow travelers.")
            throw URLError(.userAuthenticationRequired)
        }

        let result = try await api.toggleFollow(token: token, targetUserId: traveler.id)

        if result.active {
            if !followedTravelers.contains(where: { $0.id == traveler.id }) {
                followedTravelers.insert(traveler, at: 0)
            }
            suggestedTravelers.removeAll(where: { $0.id == traveler.id })
        } else {
            followedTravelers.removeAll(where: { $0.id == traveler.id })
            if !suggestedTravelers.contains(where: { $0.id == traveler.id }) {
                suggestedTravelers.insert(traveler, at: 0)
            }
        }

        feedItems = buildFeedItems(
            followedTravelers: followedTravelers,
            savedDrops: []
        )
        if refreshFeedAfter {
            await refreshFeed()
        }
        return result
    }

    func reportTarget(
        targetType: String,
        targetId: String,
        targetUserId: String?,
        reason: NativeReportReason
    ) async throws {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to report content.")
            throw URLError(.userAuthenticationRequired)
        }

        _ = try await api.reportTarget(
            token: token,
            targetType: targetType,
            targetId: targetId,
            targetUserId: targetUserId,
            reason: reason.rawValue
        )
    }

    func blockTraveler(_ traveler: NativeTravelerSummary) async throws {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to block accounts.")
            throw URLError(.userAuthenticationRequired)
        }

        _ = try await api.blockUser(token: token, targetUserId: traveler.id)
        blockedTravelerIds.insert(traveler.id)
        followStateOverrides[traveler.id] = false
        followedTravelers.removeAll { $0.id == traveler.id }
        suggestedTravelers.removeAll { $0.id == traveler.id }
        feedItems.removeAll { $0.traveler.id == traveler.id }
    }

    func fetchBlockedUsers() async throws -> [NativeBlockedUser] {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to manage blocked accounts.")
            throw URLError(.userAuthenticationRequired)
        }

        return try await api.getBlockedUsers(token: token)
    }

    func unblockUser(_ userId: String) async throws {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to manage blocked accounts.")
            throw URLError(.userAuthenticationRequired)
        }

        _ = try await api.unblockUser(token: token, targetUserId: userId)
        blockedTravelerIds.remove(userId)
    }

    func fetchComments(targetType: String, targetId: String) async throws -> [NativeComment] {
        guard let token = authToken else { return [] }
        return try await api.getComments(token: token, targetType: targetType, targetId: targetId)
    }

    func createComment(targetType: String, targetId: String, body: String, momentId: String?) async throws -> NativeComment {
        guard let token = authToken else {
            presentAuthGate(reason: "Log in to comment on posts.")
            throw URLError(.userAuthenticationRequired)
        }
        let response = try await api.postComment(
            token: token,
            targetType: targetType,
            targetId: targetId,
            body: body,
            momentId: momentId
        )
        return response.comment
    }

    private func buildFeedItems(
        followedTravelers: [NativeTravelerSummary],
        savedDrops: [NativeFeedSavedDrop]
    ) -> [NativeFeedItem] {
        var items: [NativeFeedItem] = []
        let travelerMap = Dictionary(uniqueKeysWithValues: followedTravelers.map { ($0.id, $0) })

        for drop in savedDrops {
            guard let traveler = travelerMap[drop.travelerId] else { continue }
            items.append(
                NativeFeedItem(
                    id: drop.id,
                    type: .saved,
                    traveler: traveler,
                    title: "\(traveler.displayName ?? traveler.username) saved a place",
                    timestampLabel: drop.savedAtLabel,
                    sortTimestamp: Self.feedSortDate(iso: drop.savedAtIso, label: drop.savedAtLabel) ?? .distantPast,
                    place: drop.place,
                    collection: nil,
                    caption: nil
                )
            )
        }

        for traveler in followedTravelers {
            for history in traveler.travelHistory {
                for place in history.places where place.visitedDate != nil {
                    items.append(
                        NativeFeedItem(
                            id: "visited-\(traveler.id)-\(place.momentId ?? place.id)",
                            type: .visited,
                            traveler: traveler,
                            title: "\(traveler.displayName ?? traveler.username) visited a place",
                            timestampLabel: Self.relativeLabel(from: place.visitedDate),
                            sortTimestamp: Self.feedSortDate(iso: place.visitedAtIso ?? place.visitedDate, label: Self.relativeLabel(from: place.visitedDate)) ?? .distantPast,
                            place: place,
                            collection: nil,
                            caption: place.momentCaption
                        )
                    )
                }
            }

            for collection in traveler.recentCollections ?? [] {
                items.append(
                    NativeFeedItem(
                        id: "collection-\(traveler.id)-\(collection.id)",
                        type: .collection,
                        traveler: traveler,
                        title: "\(traveler.displayName ?? traveler.username) created a collection",
                        timestampLabel: Self.relativeLabel(from: collection.createdAt),
                        sortTimestamp: Self.date(from: collection.createdAt) ?? .distantPast,
                        place: nil,
                        collection: collection,
                        caption: nil
                    )
                )
            }
        }

        return items.sorted { $0.sortTimestamp > $1.sortTimestamp }
    }

    private static var todayString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: Date())
    }

    static func date(from raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let isoFormatter = ISO8601DateFormatter()
        if let value = isoFormatter.date(from: raw) {
            return value
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.date(from: raw)
    }

    static func relativeLabel(from raw: String?) -> String {
        guard let date = date(from: raw) else { return "Recently" }
        let now = Date()
        let diff = Int(now.timeIntervalSince(date))
        if diff < 60 { return "just now" }
        let hour = 60 * 60
        let day = 24 * hour
        let week = 7 * day
        let month = 30 * day
        let year = 365 * day

        if diff < day {
            let hours = max(1, diff / hour)
            return "\(hours)h ago"
        }
        if diff < week {
            let days = max(1, diff / day)
            return "\(days)d ago"
        }
        if diff < month {
            let weeks = max(1, diff / week)
            return "\(weeks)wk ago"
        }
        if diff < year {
            let months = max(1, diff / month)
            return "\(months)mo ago"
        }
        let years = max(1, diff / year)
        return "\(years)y ago"
    }

    static func feedSortDate(iso: String?, label: String?) -> Date? {
        if let direct = date(from: iso) {
            return direct
        }
        guard let label else { return nil }
        let normalized = label
            .lowercased()
            .replacingOccurrences(of: ".", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized == "just now" { return Date() }
        if normalized == "recently" { return Date().addingTimeInterval(-60) }
        let match = normalized.range(of: #"^(\d+)\s*(h|d|wk|w|mo|y)\s*ago$"#, options: .regularExpression)
        guard let match else { return nil }
        let token = String(normalized[match])
        let parts = token.split(separator: " ")
        guard let first = parts.first, let value = Int(first) else { return nil }
        if token.contains("wk") || token.contains(" w") {
            return Date().addingTimeInterval(TimeInterval(-value * 7 * 24 * 60 * 60))
        }
        if token.contains("mo") {
            return Date().addingTimeInterval(TimeInterval(-value * 30 * 24 * 60 * 60))
        }
        if token.contains("y") {
            return Date().addingTimeInterval(TimeInterval(-value * 365 * 24 * 60 * 60))
        }
        if token.contains("d") {
            return Date().addingTimeInterval(TimeInterval(-value * 24 * 60 * 60))
        }
        if token.contains("h") {
            return Date().addingTimeInterval(TimeInterval(-value * 60 * 60))
        }
        return nil
    }

    private var authToken: String? {
        get { UserDefaults.standard.string(forKey: authTokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: authTokenKey) }
    }

    private func clearSession() {
        authToken = nil
        currentUser = nil
    }

    private func rebuildOwnFeedItems() {
        guard let user = currentUser else {
            ownFeedItemsCache = []
            return
        }
        let traveler = NativeTravelerSummary(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: nil,
            bio: nil,
            descriptor: nil,
            matchScore: nil,
            followersCount: nil,
            recentSavedPlaces: savedPlaces.prefix(4).map { place in
                NativeTravelerSavedEntry(
                    place: place,
                    savedAtLabel: "Saved",
                    savedAtIso: nil
                )
            },
            recentCollections: collections,
            travelHistory: [],
            visitedPlacesCount: myMoments.count,
            savedPlacesCount: savedPlaces.count,
            collectionsCount: collections.count
        )

        let savedBaseDate = Date()

        var items: [NativeFeedItem] = savedPlaces.prefix(4).enumerated().map { index, place in
            NativeFeedItem(
                id: "own-saved-\(place.id)",
                type: .saved,
                traveler: traveler,
                title: "",
                timestampLabel: "Saved",
                sortTimestamp: savedBaseDate.addingTimeInterval(TimeInterval(-(index * 90))),
                place: place,
                collection: nil,
                caption: nil
            )
        }

        items.append(contentsOf: myMoments.map { moment in
            NativeFeedItem(
                id: "own-visited-\(moment.id)",
                type: .visited,
                traveler: traveler,
                title: "",
                timestampLabel: Self.relativeLabel(from: moment.visitedDate),
                sortTimestamp: Self.feedSortDate(iso: moment.visitedAtIso ?? moment.visitedDate, label: Self.relativeLabel(from: moment.visitedDate)) ?? .distantPast,
                place: NativePlace(
                    id: moment.place.id,
                    name: moment.place.name,
                    location: moment.place.location,
                    address: moment.place.address,
                    category: moment.place.category,
                    description: moment.place.description,
                    hook: moment.place.hook,
                    image: moment.place.image,
                    images: moment.place.images,
                    tags: moment.place.tags,
                    attitudeLabel: moment.place.attitudeLabel,
                    bestTime: moment.place.bestTime,
                    similarityStat: moment.place.similarityStat,
                    whyYoullLikeIt: moment.place.whyYoullLikeIt,
                    recommendationReason: moment.place.recommendationReason,
                    rating: moment.place.rating,
                    priceLevel: moment.place.priceLevel,
                    openingHours: moment.place.openingHours,
                    mapsUrl: moment.place.mapsUrl,
                    latitude: moment.place.latitude,
                    longitude: moment.place.longitude,
                    priceRange: moment.place.priceRange,
                    momentId: moment.id,
                    ownerUserId: moment.place.ownerUserId,
                    visitedDate: moment.visitedDate,
                    visitedAtIso: moment.visitedAtIso,
                    momentCaption: moment.caption,
                    momentWouldRevisit: moment.wouldRevisit,
                    momentRating: moment.rating
                ),
                collection: nil,
                caption: moment.caption
            )
        })

        items.append(contentsOf: collections.map { collection in
            NativeFeedItem(
                id: "own-collection-\(collection.id)",
                type: .collection,
                traveler: traveler,
                title: "",
                timestampLabel: Self.relativeLabel(from: collection.createdAt),
                sortTimestamp: Self.date(from: collection.createdAt) ?? .distantPast,
                place: nil,
                collection: collection,
                caption: nil
            )
        })

        ownFeedItemsCache = items.sorted { $0.sortTimestamp > $1.sortTimestamp }
    }
}

private struct NativeAPIClient {
    private let baseURL = URL(string: "https://api.vibinn.club")!

    private struct LoginBody: Encodable {
        let email: String
        let password: String
    }

    private struct RegisterBody: Encodable {
        let name: String
        let email: String
        let password: String
    }

    private struct GoogleAuthBody: Encodable {
        let idToken: String
    }

    private struct AppleAuthBody: Encodable {
        let idToken: String
        let email: String?
        let givenName: String?
        let familyName: String?
    }

    private struct PlaceScoreDebugBody: Encodable {
        let placeId: String
        let selectedInterests: [String]
        let selectedVibe: String?
    }

    func login(email: String, password: String) async throws -> NativeLoginResponse {
        try await request(
            path: "/api/auth/login",
            method: "POST",
            token: nil,
            body: LoginBody(email: email, password: password)
        )
    }

    func register(name: String, email: String, password: String) async throws -> NativeRegisterResponse {
        try await request(
            path: "/api/auth/register",
            method: "POST",
            token: nil,
            body: RegisterBody(name: name, email: email, password: password)
        )
    }

    func getAuthSession(token: String) async throws -> NativeAuthSessionResponse {
        try await request(path: "/api/auth/session", method: "GET", token: token)
    }

    func googleAuth(idToken: String) async throws -> NativeLoginResponse {
        try await request(
            path: "/api/auth/google",
            method: "POST",
            token: nil,
            body: GoogleAuthBody(idToken: idToken)
        )
    }

    func appleAuth(
        idToken: String,
        email: String?,
        givenName: String?,
        familyName: String?
    ) async throws -> NativeLoginResponse {
        try await request(
            path: "/api/auth/apple",
            method: "POST",
            token: nil,
            body: AppleAuthBody(
                idToken: idToken,
                email: email,
                givenName: givenName,
                familyName: familyName
            )
        )
    }

    func getDiscoveryPlaces(
        location: String,
        page: Int,
        limit: Int,
        selectedInterests: [String],
        selectedVibe: String?,
        token: String?
    ) async throws -> NativeDiscoveryPlacesResponse {
        let encodedLocation = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        let encodedInterests = selectedInterests
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0 }
            .joined(separator: ",")
        let encodedVibe = selectedVibe?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        var path = "/api/discovery/places?location=\(encodedLocation)&type=city&page=\(page)&limit=\(limit)"
        if !encodedInterests.isEmpty {
            path += "&interests=\(encodedInterests)"
        }
        if !encodedVibe.isEmpty {
            path += "&vibe=\(encodedVibe)"
        }
        return try await request(
            path: path,
            method: "GET",
            token: token
        )
    }

    func getTodayRecommendation(
        token: String,
        location: String,
        latitude: Double,
        longitude: Double
    ) async throws -> NativeTodayRecommendationResponse {
        let encodedLocation = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        return try await request(
            path: "/api/recommendations/today?location=\(encodedLocation)&type=city&latitude=\(latitude)&longitude=\(longitude)",
            method: "GET",
            token: token
        )
    }

    func getPlaceScoreDebug(
        placeId: String,
        selectedInterests: [String],
        selectedVibe: String?,
        token: String?
    ) async throws -> NativePlaceScoreDebugResponse {
        try await request(
            path: "/api/debug/place-score",
            method: "POST",
            token: token,
            body: PlaceScoreDebugBody(
                placeId: placeId,
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe
            )
        )
    }

    func getTodayRecommendationDebug(
        token: String,
        location: String,
        latitude: Double,
        longitude: Double
    ) async throws -> NativeTodayRecommendationDebugResponse {
        let encodedLocation = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        return try await request(
            path: "/api/debug/today-recommendation?location=\(encodedLocation)&type=city&latitude=\(latitude)&longitude=\(longitude)",
            method: "GET",
            token: token
        )
    }

    func getTravelerScoreDebug(id: String, token: String?) async throws -> NativeTravelerScoreDebugResponse {
        try await request(
            path: "/api/debug/travelers/\(id)",
            method: "GET",
            token: token
        )
    }

    private struct SavePreferencesBody: Encodable {
        let selectedInterests: [String]
        let selectedVibe: String?
        let skippedPreferences: Bool
        let onboardingCompleted: Bool
    }

    func savePreferences(
        token: String,
        selectedInterests: [String],
        selectedVibe: String?,
        skippedPreferences: Bool,
        onboardingCompleted: Bool
    ) async throws {
        let _: NativeEmptyResponse = try await request(
            path: "/api/preferences",
            method: "PATCH",
            token: token,
            body: SavePreferencesBody(
                selectedInterests: selectedInterests,
                selectedVibe: selectedVibe,
                skippedPreferences: skippedPreferences,
                onboardingCompleted: onboardingCompleted
            )
        )
    }

    func getProfile(token: String) async throws -> NativeProfileResponse {
        try await request(path: "/api/profile/me", method: "GET", token: token)
    }

    func getBookmarks(token: String) async throws -> [NativePlace] {
        let response: NativeBookmarksResponse = try await request(path: "/api/bookmarks", method: "GET", token: token)
        return response.bookmarks
    }

    func getCollections(token: String) async throws -> [NativeCollection] {
        let response: NativeCollectionsResponse = try await request(path: "/api/collections", method: "GET", token: token)
        return response.collections
    }

    func getBlockedUsers(token: String) async throws -> [NativeBlockedUser] {
        let response: NativeBlockedUsersResponse = try await request(path: "/api/users/blocks", method: "GET", token: token)
        return response.users
    }

    private struct CreateCollectionBody: Encodable {
        let label: String
        let placeIds: [String]
    }

    func createCollection(token: String, label: String, placeIds: [String]) async throws -> NativeCollection {
        let response: NativeCreateCollectionResponse = try await request(
            path: "/api/collections",
            method: "POST",
            token: token,
            body: CreateCollectionBody(label: label, placeIds: placeIds)
        )
        return response.collection
    }

    func getMoments(token: String) async throws -> [NativeMoment] {
        let response: NativeMomentsResponse = try await request(path: "/api/moments", method: "GET", token: token)
        return response.moments
    }

    func getPlaceDetail(id: String, token: String?) async throws -> NativePlaceDetailResponse {
        try await request(
            path: "/api/lookups/places/\(id)",
            method: "GET",
            token: token
        )
    }

    func getPlaceDetailBundle(id: String, token: String?) async throws -> NativePlaceDetailBundleResponse {
        try await request(
            path: "/api/lookups/places/\(id)/bundle",
            method: "GET",
            token: token
        )
    }

    func getTravelerDiscovery(token: String) async throws -> NativeTravelerDiscoveryResponse {
        try await request(path: "/api/discovery/travelers", method: "GET", token: token)
    }

    func getFeed(token: String) async throws -> NativeFeedResponse {
        try await request(path: "/api/feed", method: "GET", token: token)
    }

    func searchPublicTravelers(query: String) async throws -> [NativeTravelerSummary] {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let response: NativeTravelerSearchResponse = try await request(
            path: "/api/discovery/travelers/public-search?q=\(encodedQuery)",
            method: "GET",
            token: nil
        )
        return response.travelers
    }

    func getTravelerProfile(id: String, token: String) async throws -> NativeTravelerProfileResponse {
        try await request(path: "/api/travelers/\(id)", method: "GET", token: token)
    }

    func getTravelerFollowers(id: String, token: String) async throws -> [NativeFollowerListItem] {
        let response: NativeTravelerFollowersResponse = try await request(
            path: "/api/travelers/\(id)/followers",
            method: "GET",
            token: token
        )
        return response.travelers
    }

    private struct NativeCommentsResponse: Decodable {
        let comments: [NativeComment]
    }

    private struct NativeCreateCommentBody: Encodable {
        let targetType: String
        let targetId: String
        let body: String
        let momentId: String?
    }

    struct NativeCreateCommentResponse: Decodable {
        let comment: NativeComment
        let count: Int
    }

    func getComments(token: String, targetType: String, targetId: String) async throws -> [NativeComment] {
        let response: NativeCommentsResponse = try await request(
            path: "/api/comments?targetType=\(targetType)&targetId=\(targetId)",
            method: "GET",
            token: token
        )
        return response.comments
    }

    func postComment(token: String, targetType: String, targetId: String, body: String, momentId: String?) async throws -> NativeCreateCommentResponse {
        try await request(
            path: "/api/comments",
            method: "POST",
            token: token,
            body: NativeCreateCommentBody(
                targetType: targetType,
                targetId: targetId,
                body: body,
                momentId: momentId
            )
        )
    }

    func lookupPlaces(query: String, token: String?) async throws -> [NativePlace] {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let response: NativePlaceLookupResponse = try await request(
            path: "/api/lookups/places?q=\(encodedQuery)",
            method: "GET",
            token: token
        )
        return response.places
    }

    func lookupLocations(query: String) async throws -> [NativeLocationOption] {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let response: NativeLocationLookupResponse = try await request(
            path: "/api/lookups/locations?q=\(encodedQuery)",
            method: "GET",
            token: nil
        )
        return response.locations
    }

    private struct BookmarkBody: Encodable {
        let placeId: String
        let place: BookmarkSnapshot?
    }

    private struct BookmarkSnapshot: Encodable {
        let name: String?
        let location: String?
        let address: String?
        let category: String?
        let image: String?
        let images: [String]
        let tags: [String]
        let description: String?
        let hook: String?
        let attitudeLabel: String?
        let bestTime: String?
        let rating: Double?
        let priceLevel: Int?
        let latitude: Double?
        let longitude: Double?
    }

    func bookmarkPlace(token: String, place: NativePlace) async throws -> [String] {
        let payload = BookmarkBody(
            placeId: place.id,
            place: BookmarkSnapshot(
                name: place.name,
                location: place.location,
                address: place.address,
                category: place.category,
                image: place.image,
                images: place.images ?? place.image.map { [$0] } ?? [],
                tags: place.tags ?? [],
                description: place.description,
                hook: place.hook,
                attitudeLabel: place.attitudeLabel,
                bestTime: place.bestTime,
                rating: place.rating,
                priceLevel: place.priceLevel,
                latitude: place.latitude,
                longitude: place.longitude
            )
        )
        let result: NativeBookmarkedPlaceIdsResponse = try await request(
            path: "/api/bookmarks",
            method: "POST",
            token: token,
            body: payload
        )
        return result.bookmarkedPlaceIds
    }

    func removeBookmarkPlace(token: String, placeId: String) async throws -> [String] {
        let result: NativeBookmarkedPlaceIdsResponse = try await request(
            path: "/api/bookmarks/\(placeId)",
            method: "DELETE",
            token: token
        )
        return result.bookmarkedPlaceIds
    }

    private struct NativeToggleFollowBody: Encodable {
        let targetUserId: String
    }

    struct NativeToggleFollowResponse: Decodable {
        let active: Bool
        let followersCount: Int
    }

    func toggleFollow(token: String, targetUserId: String) async throws -> NativeToggleFollowResponse {
        try await request(
            path: "/api/follows/toggle",
            method: "POST",
            token: token,
            body: NativeToggleFollowBody(targetUserId: targetUserId)
        )
    }

    private struct NativeReportBody: Encodable {
        let targetType: String
        let targetId: String
        let targetUserId: String?
        let reason: String
        let details: String?
    }

    func reportTarget(
        token: String,
        targetType: String,
        targetId: String,
        targetUserId: String?,
        reason: String
    ) async throws -> NativeModerationActionResponse {
        try await request(
            path: "/api/reports",
            method: "POST",
            token: token,
            body: NativeReportBody(
                targetType: targetType,
                targetId: targetId,
                targetUserId: targetUserId,
                reason: reason,
                details: nil
            )
        )
    }

    private struct NativeBlockBody: Encodable {
        let reason: String?
    }

    func blockUser(token: String, targetUserId: String) async throws -> NativeModerationActionResponse {
        try await request(
            path: "/api/users/\(targetUserId)/block",
            method: "POST",
            token: token,
            body: NativeBlockBody(reason: "Blocked from native iOS app")
        )
    }

    func unblockUser(token: String, targetUserId: String) async throws -> NativeModerationActionResponse {
        try await request(
            path: "/api/users/\(targetUserId)/block",
            method: "DELETE",
            token: token
        )
    }

    private struct CreateMomentBody: Encodable {
        let placeId: String
        let visitedDate: String
        let caption: String
        let uploadedMedia: [String]
        let rating: Int
        let budgetLevel: String
        let visitType: String
        let timeOfDay: String
        let privacy: String
        let wouldRevisit: String
        let vibeTags: [String]
    }

    private struct NativeBookmarkedPlaceIdsResponse: Decodable {
        let bookmarkedPlaceIds: [String]
    }

    func createMoment(
        token: String,
        placeId: String,
        visitedDate: String,
        caption: String,
        rating: Int,
        wouldRevisit: String
    ) async throws -> NativeCreatedMoment {
        let response: NativeMomentResponse = try await request(
            path: "/api/moments",
            method: "POST",
            token: token,
            body: CreateMomentBody(
                placeId: placeId,
                visitedDate: visitedDate,
                caption: caption,
                uploadedMedia: [],
                rating: rating,
                budgetLevel: "$$",
                visitType: "solo",
                timeOfDay: "afternoon",
                privacy: "public",
                wouldRevisit: wouldRevisit,
                vibeTags: []
            )
        )
        return response.moment
    }

    private func request<T: Decodable, B: Encodable>(
        path: String,
        method: String,
        token: String?,
        body: B?
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let responseText = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            nativeLogger.error("API request failed path=\(path, privacy: .public) status=\(httpResponse.statusCode, privacy: .public) body=\(responseText, privacy: .public)")
            let sanitizedMessage: String
            if responseText.lowercased().contains("<!doctype html") || responseText.lowercased().contains("<html") {
                sanitizedMessage = "Request failed (\(httpResponse.statusCode))"
            } else {
                sanitizedMessage = responseText.isEmpty
                    ? "Request failed (\(httpResponse.statusCode))"
                    : responseText
            }
            throw NSError(
                domain: "NativeAPI",
                code: httpResponse.statusCode,
                userInfo: [
                    NSLocalizedDescriptionKey: sanitizedMessage,
                ]
            )
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        token: String?
    ) async throws -> T {
        try await request(path: path, method: method, token: token, body: Optional<String>.none)
    }
}

private struct NativeVibinnRootView: View {
    @StateObject private var appState = NativeAppState()

    var body: some View {
        Group {
            if appState.isBootstrapping {
                NativeLoadingScreen()
            } else if !appState.hasCompletedOnboarding {
                NativeOnboardingScreen()
                    .environmentObject(appState)
            } else {
                NativeMainTabView()
                    .environmentObject(appState)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $appState.showAuthSheet) {
            NativeAuthScreen(allowsDismissal: true, promptReason: appState.authSheetReason)
                .environmentObject(appState)
        }
        .sheet(isPresented: $appState.showPreferenceSetupSheet) {
            NativePreferenceSetupScreen()
                .environmentObject(appState)
        }
        .task {
            nativeLogger.log("RootView task bootstrap")
            await appState.bootstrap()
        }
        .onChange(of: appState.isBootstrapping) { value in
            nativeLogger.log("RootView isBootstrapping changed=\(value, privacy: .public)")
        }
        .onChange(of: appState.currentUser?.id) { value in
            nativeLogger.log("RootView currentUser changed hasUser=\(value != nil, privacy: .public)")
            if value != nil, appState.showAuthSheet {
                appState.dismissAuthGate()
                appState.performPendingPostAuthActionIfNeeded()
            }
        }
        .onChange(of: appState.hasCompletedOnboarding) { value in
            nativeLogger.log("RootView onboarding changed=\(value, privacy: .public)")
        }
    }
}

private struct NativeLoadingScreen: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .tint(nativeAccent)
                Text("Loading Vibinn")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }
}

private struct NativeScreenHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 34, weight: .black))
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.58))
        }
    }
}

private struct NativeGuestPromptCard: View {
    @EnvironmentObject private var appState: NativeAppState
    let eyebrow: String
    let title: String
    let message: String
    let cta: String

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(eyebrow)
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(.white.opacity(0.35))
                    .textCase(.uppercase)
                Text(title)
                    .font(.system(size: 22, weight: .black))
                    .foregroundStyle(.white)
                Text(message)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    appState.presentAuthGate(reason: message)
                } label: {
                    Text(cta)
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(nativeAccent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private func nativeDiscoveryMoodBadge(for place: NativePlace) -> NativeMoodBadgeMeta {
    let haystack = [
        place.name,
        place.category,
        place.hook,
        place.description,
    ]
    .compactMap { $0?.lowercased() }
    .joined(separator: " ")
    .replacingOccurrences(of: "_", with: " ")
    .replacingOccurrences(of: "-", with: " ")

    func matches(_ terms: [String]) -> Bool {
        terms.contains { haystack.contains($0) }
    }

    if matches(["after dark", "late night", "nightlife", "cocktail", "bar", "vinyl", "live music", "dj"]) {
        return nativePlaceMoodBadges[0]
    }
    if matches(["walk", "stroll", "wander", "loop", "street", "neighborhood", "city walk", "brownstones", "trail"]) {
        return nativePlaceMoodBadges[2]
    }
    if matches(["market", "design", "shopping", "browse", "makers", "concept store", "stall"]) {
        return nativePlaceMoodBadges[3]
    }
    if matches(["bookstore", "bookshop", "cozy", "soft light", "warm", "intimate", "quiet corner", "shelves"]) {
        return nativePlaceMoodBadges[4]
    }
    if matches(["museum", "science", "history", "cultural", "culture", "mosque", "islamic center", "gallery", "exhibit"]) {
        return nativePlaceMoodBadges[5]
    }
    if matches(["park", "garden", "green", "nature", "grass", "trees"]) {
        return nativePlaceMoodBadges[7]
    }
    if matches(["view", "lookout", "waterfront", "harbor", "skyline", "sunset", "scenic", "lake", "river", "reflecting pool"]) {
        return nativePlaceMoodBadges[1]
    }
    return nativePlaceMoodBadges[6]
}

private func nativeCompatibilityBadge(for match: Int?) -> NativeCompatibilityBadgeMeta? {
    guard let match else { return nil }
    if match >= 85 {
        return NativeCompatibilityBadgeMeta(label: "Must visit", foreground: .black, background: nativeAccent)
    }
    if match >= 70 {
        return NativeCompatibilityBadgeMeta(label: "Fits you", foreground: nativeAccent, background: Color.black.opacity(0.58))
    }
    if match >= 55 {
        return NativeCompatibilityBadgeMeta(label: "Worth a look", foreground: .white, background: Color.black.opacity(0.6))
    }
    return NativeCompatibilityBadgeMeta(label: "Maybe", foreground: Color.white.opacity(0.78), background: Color.black.opacity(0.55))
}

private func nativeDiscoveryTileHeight(for index: Int) -> CGFloat {
    switch index % 4 {
    case 0: return 328
    case 1: return 416
    case 2: return 288
    default: return 360
    }
}

private struct NativeDiscoveryColumnItem: Identifiable {
    let id: String
    let index: Int
    let place: NativePlace
}

private struct NativePositionedDiscoveryItem: Identifiable {
    let id: String
    let item: NativeDiscoveryColumnItem
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
}

private struct NativeDiscoveryTileLink: View {
    @EnvironmentObject private var appState: NativeAppState
    let item: NativeDiscoveryColumnItem
    let columnWidth: CGFloat
    let onDebugTap: (() -> Void)?

    var body: some View {
        Group {
            if nativeDiscoveryLayoutDebugMode {
                NativeDiscoveryPlaceCard(
                    place: item.place,
                    width: columnWidth,
                    height: nativeDiscoveryTileHeight(for: item.index),
                    isBookmarked: appState.isBookmarked(item.place.id),
                    isVisited: appState.isVisited(item.place.id),
                    onSaveSwipe: {
                        Task { try? await appState.toggleBookmark(for: item.place) }
                    },
                    onSkipSwipe: {
                        appState.dismissDiscoveryPlace(item.place.id)
                    },
                    onDebugTap: onDebugTap
                )
                .frame(width: columnWidth, height: nativeDiscoveryTileHeight(for: item.index))
            } else {
                NavigationLink {
                    NativePlaceDetailScreen(initialPlace: item.place)
                } label: {
                    NativeDiscoveryPlaceCard(
                        place: item.place,
                        width: columnWidth,
                        height: nativeDiscoveryTileHeight(for: item.index),
                        isBookmarked: appState.isBookmarked(item.place.id),
                        isVisited: appState.isVisited(item.place.id),
                        onSaveSwipe: {
                            Task { try? await appState.toggleBookmark(for: item.place) }
                        },
                        onSkipSwipe: {
                            appState.dismissDiscoveryPlace(item.place.id)
                        },
                        onDebugTap: onDebugTap
                    )
                    .frame(width: columnWidth, height: nativeDiscoveryTileHeight(for: item.index))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(width: columnWidth, height: nativeDiscoveryTileHeight(for: item.index))
        .contentShape(Rectangle())
        .onAppear {
            Task { await appState.loadMoreDiscoveryIfNeeded(currentPlaceId: item.place.id) }
        }
    }
}

private struct NativeDiscoveryMasonryView: View {
    let leftItems: [NativeDiscoveryColumnItem]
    let rightItems: [NativeDiscoveryColumnItem]
    let containerWidth: CGFloat
    let onDebugTap: (NativePlace) -> Void
    private let columnGap: CGFloat = 12

    private var columnWidth: CGFloat {
        floor((containerWidth - columnGap) / 2)
    }

    private var containerHeight: CGFloat {
        let leftHeight = leftItems.map { nativeDiscoveryTileHeight(for: $0.index) }.reduce(0, +)
            + CGFloat(max(0, leftItems.count - 1)) * 14
        let rightHeight = rightItems.map { nativeDiscoveryTileHeight(for: $0.index) }.reduce(0, +)
            + CGFloat(max(0, rightItems.count - 1)) * 14
            + 24
        return max(leftHeight, rightHeight)
    }

    private var positionedItems: [NativePositionedDiscoveryItem] {
        var result: [NativePositionedDiscoveryItem] = []
        var leftY: CGFloat = 0
        var rightY: CGFloat = 24

        for item in leftItems {
            let tileHeight = nativeDiscoveryTileHeight(for: item.index)
            result.append(
                NativePositionedDiscoveryItem(
                    id: "left-\(item.id)",
                    item: item,
                    x: 0,
                    y: leftY,
                    width: columnWidth,
                    height: tileHeight
                )
            )
            leftY += tileHeight + 14
        }

        for item in rightItems {
            let tileHeight = nativeDiscoveryTileHeight(for: item.index)
            result.append(
                NativePositionedDiscoveryItem(
                    id: "right-\(item.id)",
                    item: item,
                    x: columnWidth + columnGap,
                    y: rightY,
                    width: columnWidth,
                    height: tileHeight
                )
            )
            rightY += tileHeight + 14
        }

        return result
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(positionedItems) { positioned in
                NativeDiscoveryTileLink(
                    item: positioned.item,
                    columnWidth: positioned.width,
                    onDebugTap: nativeDiscoveryScoreDebugMode ? { onDebugTap(positioned.item.place) } : nil
                )
                .offset(x: positioned.x, y: positioned.y)
            }
        }
        .frame(width: containerWidth, height: containerHeight, alignment: .topLeading)
    }
}

private func buildNativeBalancedDiscoveryColumns(places: [NativePlace]) -> (left: [NativeDiscoveryColumnItem], right: [NativeDiscoveryColumnItem]) {
    var left: [NativeDiscoveryColumnItem] = []
    var right: [NativeDiscoveryColumnItem] = []
    var leftHeight: CGFloat = 0
    var rightHeight: CGFloat = 0

    for (index, place) in places.enumerated() {
        let item = NativeDiscoveryColumnItem(id: place.id, index: index, place: place)
        let estimatedHeight = nativeDiscoveryTileHeight(for: index)
        if leftHeight <= rightHeight {
            left.append(item)
            leftHeight += estimatedHeight
        } else {
            right.append(item)
            rightHeight += estimatedHeight
        }
    }

    return (left, right)
}

private struct NativeSectionTitle: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.system(size: 12, weight: .black))
            .foregroundStyle(.white.opacity(0.42))
            .textCase(.uppercase)
    }
}

private struct NativeProfileTabs: View {
    @Binding var activeSection: NativeProfileSection

    private let items: [(section: NativeProfileSection, icon: String)] = [
        (.feed, "square.grid.2x2"),
        (.saved, "bookmark"),
        (.visited, "mappin.and.ellipse"),
        (.collections, "square.stack.3d.up")
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.section) { item in
                let isActive = activeSection == item.section
                Button {
                    activeSection = item.section
                } label: {
                    VStack(spacing: 10) {
                        Image(systemName: item.icon)
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(isActive ? .white : .white.opacity(0.45))

                        Rectangle()
                            .fill(isActive ? Color.white : Color.clear)
                            .frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 6)
        .padding(.bottom, 2)
        .background(nativeProfileHeaderFill)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 1)
        }
    }
}

private struct NativeSavedTabs: View {
    @Binding var activeSection: NativeSavedSection

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(NativeSavedSection.allCases) { section in
                    Button {
                        activeSection = section
                    } label: {
                        Text(section.rawValue)
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(activeSection == section ? .black : .white.opacity(0.72))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                            .background(activeSection == section ? nativeAccent : nativeSurface)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct NativeLocationPickerSheet: View {
    @EnvironmentObject private var appState: NativeAppState
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [NativeLocationOption] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var isSearchFieldFocused: Bool
    let selectedLocation: NativeLocationOption
    let availableLocations: [NativeLocationOption]
    let suggestedLocations: [NativeLocationOption]
    let onSelect: (NativeLocationOption) -> Void

    private var filteredLocations: [NativeLocationOption] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return suggestedLocations }
        if trimmed.count < 3 {
            return []
        }
        return results
    }

    var body: some View {
        NavigationView {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Choose area")
                                .font(.system(size: 30, weight: .black))
                                .foregroundStyle(.white)

                            Text("Switch the city, then jump back into discovery.")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white.opacity(0.58))
                        }
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white.opacity(0.8))
                                .frame(width: 38, height: 38)
                                .background(nativeSurface)
                                .overlay(Circle().stroke(nativeBorder, lineWidth: 1))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }

                    TextField("Type a city", text: $query)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($isSearchFieldFocused)
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 15)
                        .background(nativeSurfaceStrong)
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(nativeBorder, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                    if let errorMessage {
                        NativeInlineError(message: errorMessage)
                    }

                    if query.trimmingCharacters(in: .whitespacesAndNewlines).count > 0 && query.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 {
                        Text("Type at least 3 letters to search locations.")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.58))
                    }

                    if isSearching {
                        HStack {
                            ProgressView()
                                .tint(nativeAccent)
                            Text("Searching areas...")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    } else if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 && filteredLocations.isEmpty && errorMessage == nil {
                        Text("No locations found.")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.58))
                    } else if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Suggested")
                            .font(.system(size: 11, weight: .black))
                            .foregroundStyle(.white.opacity(0.35))
                            .textCase(.uppercase)
                    }

                    VStack(spacing: 12) {
                        ForEach(filteredLocations) { location in
                            Button {
                                onSelect(location)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(location.label)
                                            .font(.system(size: 18, weight: .black))
                                            .foregroundStyle(.white)
                                        Text("City")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(.white.opacity(0.42))
                                    }
                                    Spacer()
                                    if location == selectedLocation {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 20))
                                            .foregroundStyle(nativeAccent)
                                    }
                                }
                                .padding(18)
                                .background(
                                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                                        .fill(location == selectedLocation ? nativeAccent.opacity(0.18) : nativeSurface)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                                .stroke(location == selectedLocation ? nativeAccent.opacity(0.55) : nativeBorder, lineWidth: 1)
                                        )
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
        .preferredColorScheme(.dark)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                isSearchFieldFocused = true
            }
        }
        .onChange(of: query) { _ in
            searchTask?.cancel()
            let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.count >= 3 else {
                results = []
                errorMessage = nil
                return
            }
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }
                await performSearch()
            }
        }
    }

    private func performSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            results = []
            errorMessage = nil
            return
        }
        guard trimmed.count >= 3 else {
            results = []
            errorMessage = nil
            return
        }

        isSearching = true
        errorMessage = nil
        defer { isSearching = false }

        do {
            let lookedUp = try await appState.lookupLocations(query: trimmed)
            let normalizedPairs: [(String, NativeLocationOption)] = lookedUp.map { option in
                let matchedLocation = availableLocations.first { candidate in
                    candidate.label.caseInsensitiveCompare(option.label) == .orderedSame
                }
                let normalized = matchedLocation ?? option
                return (normalized.label.lowercased(), normalized)
            }
            let deduped = Dictionary(normalizedPairs, uniquingKeysWith: { first, _ in first })
            let merged = Array(deduped.values)
                .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
            results = merged
        } catch {
            results = []
            errorMessage = "Could not search locations right now."
        }
    }
}

private struct NativeDiscoverySearchSheet: View {
    @EnvironmentObject private var appState: NativeAppState
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [NativePlace] = []
    @State private var isSearching = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                NativeScreenHeader(
                    title: "Search places",
                    subtitle: "Search within the current city, just like discovery on the web."
                )

                NativeSurfaceCard {
                    VStack(spacing: 14) {
                        HStack(spacing: 12) {
                            TextField("Search places", text: $query)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                                .font(.system(size: 17, weight: .medium))
                                .foregroundStyle(.white)

                            Button {
                                Task { await performSearch() }
                            } label: {
                                if isSearching {
                                    ProgressView()
                                        .tint(.black)
                                        .frame(width: 18, height: 18)
                                } else {
                                    Image(systemName: "magnifyingglass")
                                        .font(.system(size: 16, weight: .black))
                                        .foregroundStyle(.black)
                                }
                            }
                            .buttonStyle(.plain)
                            .frame(width: 40, height: 40)
                            .background(nativeAccent)
                            .clipShape(Circle())
                            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSearching)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 16)
                        .background(nativeSurfaceStrong)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                        if let errorMessage {
                            NativeInlineError(message: errorMessage)
                        }

                        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSearching && results.isEmpty && errorMessage == nil {
                            Text("No places found.")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.58))
                        }

                        if !results.isEmpty {
                            VStack(spacing: 12) {
                                ForEach(results) { place in
                                    NavigationLink {
                                        NativePlaceDetailScreen(initialPlace: place)
                                    } label: {
                                        HStack(spacing: 12) {
                                            NativeRemoteImage(url: place.image)
                                                .frame(width: 72, height: 72)
                                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                                            VStack(alignment: .leading, spacing: 6) {
                                                Text(place.name)
                                                    .font(.system(size: 16, weight: .black))
                                                    .foregroundStyle(.white)
                                                    .multilineTextAlignment(.leading)
                                                Text(place.location)
                                                    .font(.system(size: 13, weight: .medium))
                                                    .foregroundStyle(.white.opacity(0.58))
                                                    .lineLimit(2)
                                                if let category = place.category, !category.isEmpty {
                                                    Text(category.uppercased())
                                                        .font(.system(size: 10, weight: .black))
                                                        .foregroundStyle(.white.opacity(0.45))
                                                }
                                            }
                                            Spacer(minLength: 0)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Close") {
                    dismiss()
                }
                .foregroundStyle(.white)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func performSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            results = []
            errorMessage = nil
            return
        }

        errorMessage = nil
        isSearching = true
        defer { isSearching = false }

        do {
            results = try await appState.lookupPlaces(query: trimmed)
        } catch {
            errorMessage = "Could not search places right now."
        }
    }
}

private struct NativePlaceholderSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let message: String

    var body: some View {
        NavigationView {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    NativeScreenHeader(title: title, subtitle: message)
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundStyle(.white)
                }
            }
        }
        .navigationViewStyle(.stack)
        .preferredColorScheme(.dark)
    }
}

private struct NativeSurfaceCard<Content: View>: View {
    var fill: AnyShapeStyle = AnyShapeStyle(
        LinearGradient(
            colors: [
                Color(red: 18 / 255, green: 18 / 255, blue: 20 / 255).opacity(0.98),
                Color(red: 27 / 255, green: 27 / 255, blue: 31 / 255).opacity(0.94)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    )
    var stroke: Color = nativeBorder
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(18)
        .background(fill)
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(stroke, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.28), radius: 18, x: 0, y: 10)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct NativeInlineError: View {
    let message: String

    var body: some View {
        NativeSurfaceCard {
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.red.opacity(0.92))
        }
    }
}

private struct NativeSuccessMessage: View {
    let message: String

    var body: some View {
        NativeSurfaceCard {
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(nativeAccent)
        }
    }
}

private struct NativeAuthScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    let allowsDismissal: Bool
    let promptReason: String?
    @State private var mode: AuthMode = .login
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private enum AuthMode: String, CaseIterable, Identifiable {
        case login = "Log in"
        case register = "Register"
        var id: String { rawValue }
    }

    init(allowsDismissal: Bool = false, promptReason: String? = nil) {
        self.allowsDismissal = allowsDismissal
        self.promptReason = promptReason
    }

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    colors: [Color(red: 9 / 255, green: 9 / 255, blue: 11 / 255), .black],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack {
                            Text(mode == .login ? "Log in" : "Register")
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(.white)
                            Spacer()
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(Color.black.opacity(0.75))
                        .overlay(
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .stroke(nativeBorder, lineWidth: 1)
                        )
                        .clipShape(Capsule())

                        VStack(alignment: .leading, spacing: 10) {
                            Text(mode == .login ? "Pick up where your taste graph left off." : "Make your travel graph yours.")
                                .font(.system(size: 34, weight: .black))
                                .foregroundStyle(.white)
                            Text(mode == .login
                                 ? "Use Google or your email to continue natively."
                                 : "Start with Google or create your account natively.")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white.opacity(0.58))
                            if let promptReason, !promptReason.isEmpty {
                                Text(promptReason)
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(nativeAccent)
                            }
                        }

                        VStack(spacing: 14) {
                            Button {
                                Task {
                                    await submitApple()
                                }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSubmitting {
                                        ProgressView().tint(.white)
                                    } else {
                                        Label(
                                            mode == .login ? "Continue with Apple" : "Sign up with Apple",
                                            systemImage: "apple.logo"
                                        )
                                        .font(.system(size: 16, weight: .bold))
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 16)
                                .background(Color.white)
                                .foregroundStyle(.black)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                            }
                            .disabled(isSubmitting)

                            Button {
                                Task {
                                    await submitGoogle()
                                }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSubmitting {
                                        ProgressView().tint(.white)
                                    } else {
                                    Text(mode == .login ? "Continue with Google" : "Sign up with Google")
                                        .font(.system(size: 16, weight: .bold))
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 16)
                                .background(Color.white.opacity(0.08))
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                            }
                            .disabled(isSubmitting)

                            HStack(spacing: 12) {
                                Rectangle().fill(nativeBorder).frame(height: 1)
                                Text("OR")
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundStyle(.white.opacity(0.35))
                                Rectangle().fill(nativeBorder).frame(height: 1)
                            }

                            Picker("Mode", selection: $mode) {
                                ForEach(AuthMode.allCases) { item in
                                    Text(item.rawValue).tag(item)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        NativeSurfaceCard {
                            VStack(spacing: 16) {
                                if mode == .register {
                                    NativeInputField(title: "Name", text: $name, keyboard: .default, secure: false)
                                }
                                NativeInputField(title: "Email", text: $email, keyboard: .emailAddress, secure: false)
                                NativeInputField(title: "Password", text: $password, keyboard: .default, secure: true)
                                if mode == .register {
                                    NativeInputField(title: "Repeat password", text: $confirmPassword, keyboard: .default, secure: true)
                                }

                                if mode == .register && !confirmPassword.isEmpty && password != confirmPassword {
                                    Text("Passwords need to match.")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(.red.opacity(0.9))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }

                                if let errorMessage {
                                    Text(errorMessage)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.red.opacity(0.9))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }

                                Button {
                                    Task {
                                        await submit()
                                    }
                                } label: {
                                    HStack {
                                        Spacer()
                                        if isSubmitting {
                                            ProgressView().tint(.black)
                                        } else {
                                            Text(mode.rawValue)
                                                .font(.system(size: 17, weight: .black))
                                        }
                                        Spacer()
                                    }
                                    .padding(.vertical, 16)
                                    .background(nativeAccent)
                                    .foregroundStyle(.black)
                                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                                }
                                .disabled(!canSubmit)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 28)
                }
            }
        }
        .navigationViewStyle(.stack)
        .overlay(alignment: .topTrailing) {
            if allowsDismissal {
                Button("Close") {
                    appState.dismissAuthGate()
                }
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
    }

    private var canSubmit: Bool {
        guard !isSubmitting else { return false }
        switch mode {
        case .login:
            return !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !password.isEmpty
        case .register:
            return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !password.isEmpty
                && password == confirmPassword
        }
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            if mode == .login {
                try await appState.login(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
            } else {
                try await appState.register(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
            }
        } catch {
            errorMessage = mode == .login
                ? "Could not log in right now."
                : "Could not create your account right now."
        }
    }

    private func submitGoogle() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await appState.loginWithGoogle()
        } catch {
            errorMessage = "Could not continue with Google right now."
        }
    }

    private func submitApple() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await appState.loginWithApple()
        } catch {
            errorMessage = "Could not continue with Apple right now."
        }
    }
}

private struct NativeOnboardingScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var selectedLocation = NativeLocationOption(id: "boston", label: "Boston")
    @State private var showLocationPicker = false

    private var onboardingSuggestedLocations: [NativeLocationOption] {
        nativeLocationOptions.filter { $0.id != "boston" }
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 9 / 255, green: 9 / 255, blue: 11 / 255), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            areaStage
        }
        .onAppear {
            selectedLocation = appState.selectedLocation
        }
        .sheet(isPresented: $showLocationPicker) {
            NativeLocationPickerSheet(
                selectedLocation: selectedLocation,
                availableLocations: nativeLocationOptions,
                suggestedLocations: onboardingSuggestedLocations
            ) { location in
                selectedLocation = location
                showLocationPicker = false
            }
        }
    }

    private var areaStage: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer(minLength: 32)

            VStack(alignment: .leading, spacing: 14) {
                Text("Where do you want to explore?")
                    .font(.system(size: 40, weight: .black))
                    .foregroundStyle(.white)
            }

            NativeSurfaceCard {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Area")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white.opacity(0.35))
                        .textCase(.uppercase)

                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(selectedLocation.label)
                                .font(.system(size: 24, weight: .black))
                                .foregroundStyle(.white)
                            Text("City")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white.opacity(0.45))
                        }

                        Spacer()

                        Button {
                            showLocationPicker = true
                        } label: {
                            Text("Change")
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(nativeAccent)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Spacer()

            Button {
                Task {
                    await appState.completeOnboarding(with: selectedLocation, selectedInterests: [], selectedVibe: nil)
                }
            } label: {
                HStack {
                    Spacer()
                    Text("Start Explore")
                        .font(.system(size: 17, weight: .black))
                    Spacer()
                }
                .padding(.vertical, 18)
                .background(nativeAccent)
                .foregroundStyle(.black)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
    }
}

private struct NativePreferenceSetupScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @Environment(\.dismiss) private var dismiss
    @State private var swipeStep: SwipeStep = .interests
    @State private var currentCardIndex = 0
    @State private var selectedInterests: [String] = []
    @State private var selectedVibe: String?

    private enum SwipeStep {
        case interests
        case vibes
    }

    private var currentCards: [NativePreferenceSwipeCard] {
        swipeStep == .interests ? nativeInterestSwipeCards : nativeVibeSwipeCards
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        HStack(spacing: 6) {
                            Capsule()
                                .fill(nativeAccent)
                                .frame(width: 44, height: 6)
                            Capsule()
                                .fill(swipeStep == .vibes ? nativeAccent : Color.white.opacity(0.18))
                                .frame(width: 44, height: 6)
                        }
                        Spacer()
                        Text(swipeStep == .interests ? "Step 1 of 2" : "Step 2 of 2")
                            .font(.system(size: 10, weight: .black, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.46))
                            .textCase(.uppercase)
                    }

                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(swipeStep == .interests ? "Swipe your vibe." : "Pick the vibe that feels most like you.")
                                .font(.system(size: 28, weight: .black))
                                .foregroundStyle(.white)
                            Text("Swipe right to keep it. Left to skip.")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white.opacity(0.4))
                                .textCase(.uppercase)
                        }

                        Spacer()

                        Button {
                            dismiss()
                            appState.dismissPreferenceSetup()
                        } label: {
                            Text("Close")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white.opacity(0.36))
                                .textCase(.uppercase)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 18)

                ZStack {
                    ForEach(Array(currentCards.enumerated().dropFirst(currentCardIndex).prefix(2).reversed()), id: \.element.id) { offset, card in
                        let isTop = offset == currentCardIndex
                        NativeSwipePreferenceCardView(
                            card: card,
                            isTop: isTop,
                            onSwipe: { direction in
                                handlePreferenceSwipe(direction: direction, cardId: card.id)
                            }
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, 40)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.top, 20)
            }
        }
        .onAppear {
            selectedInterests = appState.selectedInterests
            selectedVibe = appState.selectedVibe
        }
    }

    private func handlePreferenceSwipe(direction: NativeSwipeDirection, cardId: String) {
        let keep = direction == .right

        if keep && swipeStep == .interests && !selectedInterests.contains(cardId) {
            selectedInterests = Array((selectedInterests + [cardId]).suffix(3))
        }

        if keep && swipeStep == .vibes {
            selectedVibe = cardId
        }

        if currentCardIndex < currentCards.count - 1 {
            currentCardIndex += 1
            return
        }

        if swipeStep == .interests {
            swipeStep = .vibes
            currentCardIndex = 0
            return
        }

        Task {
            await appState.updateTastePreferences(selectedInterests: selectedInterests, selectedVibe: selectedVibe)
            dismiss()
            appState.dismissPreferenceSetup()
            await appState.refreshDiscovery()
        }
    }
}

private enum NativeSwipeDirection {
    case left
    case right
}

private struct NativeSwipePreferenceCardView: View {
    let card: NativePreferenceSwipeCard
    let isTop: Bool
    let onSwipe: (NativeSwipeDirection) -> Void

    @State private var dragOffset: CGSize = .zero
    @State private var hasExited = false

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let x = dragOffset.width
            let rotation = Angle(degrees: Double(x / 18))

            ZStack(alignment: .bottomLeading) {
                AsyncImage(url: URL(string: card.imageURL)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty:
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                    case .failure:
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                            .overlay(
                                Image(systemName: "sparkles")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundStyle(nativeAccent.opacity(0.85))
                            )
                    @unknown default:
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()

                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.18), Color.black.opacity(0.86)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        if x < -30 {
                            NativeSwipeHintBadge(label: "Skip", foreground: .white, background: Color.black.opacity(0.42))
                        }
                        Spacer()
                        if x > 30 {
                            NativeSwipeHintBadge(label: "Keep", foreground: .black, background: nativeAccent)
                        }
                    }

                    Spacer()

                    VStack(alignment: .leading, spacing: 8) {
                        Text(card.title)
                            .font(.system(size: 34, weight: .black))
                            .foregroundStyle(.white)
                        Text(card.description)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.82))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(26)
            }
            .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.34), radius: 28, y: 20)
            .scaleEffect(isTop ? 1 : 0.95)
            .offset(x: hasExited ? (dragOffset.width >= 0 ? width + 220 : -width - 220) : dragOffset.width, y: isTop ? 0 : 12)
            .rotationEffect(isTop ? rotation : .zero)
            .allowsHitTesting(isTop)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        guard isTop else { return }
                        dragOffset = value.translation
                    }
                    .onEnded { value in
                        guard isTop else { return }
                        let shouldSwipeRight = value.translation.width > 110 || value.predictedEndTranslation.width > 240
                        let shouldSwipeLeft = value.translation.width < -110 || value.predictedEndTranslation.width < -240

                        if shouldSwipeRight || shouldSwipeLeft {
                            let direction: NativeSwipeDirection = shouldSwipeRight ? .right : .left
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) {
                                hasExited = true
                                dragOffset.width = shouldSwipeRight ? width + 220 : -width - 220
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                                onSwipe(direction)
                            }
                        } else {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.78)) {
                                dragOffset = .zero
                            }
                        }
                    }
            )
            .animation(.spring(response: 0.28, dampingFraction: 0.88), value: dragOffset)
        }
    }
}

private struct NativeSwipeHintBadge: View {
    let label: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .black))
            .foregroundStyle(foreground)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(background)
            .clipShape(Capsule())
    }
}

private struct NativeMainTabView: View {
    @EnvironmentObject private var appState: NativeAppState

    var body: some View {
        TabView(selection: $appState.activeTab) {
            NavigationView {
                NativeDiscoverScreen()
            }
            .navigationViewStyle(.stack)
            .tabItem { Label("Discover", systemImage: "safari") }
            .tag(NativeTab.discover)

            NavigationView {
                NativeFeedScreen()
            }
            .navigationViewStyle(.stack)
            .tabItem { Label("Feed", systemImage: "bolt.horizontal.fill") }
            .tag(NativeTab.feed)

            NavigationView {
                NativeCheckInScreen()
            }
            .navigationViewStyle(.stack)
            .tabItem { Label("Check in", systemImage: "plus.circle.fill") }
            .tag(NativeTab.checkIn)

            NavigationView {
                NativeSavedScreen()
            }
            .navigationViewStyle(.stack)
            .tabItem { Label("Saved", systemImage: "bookmark.fill") }
            .tag(NativeTab.saved)

            NavigationView {
                NativeProfileScreen()
            }
            .navigationViewStyle(.stack)
            .tabItem { Label("Profile", systemImage: "person.fill") }
            .tag(NativeTab.profile)
        }
        .tint(nativeAccent)
        .safeAreaInset(edge: .bottom) {
            if appState.showFloatingTabBar {
                NativeFloatingTabBar(activeTab: $appState.activeTab)
            }
        }
        .onAppear {
            UITabBar.appearance().isHidden = true
        }
        .task(id: appState.activeTab) {
            await appState.loadActiveTabIfNeeded()
        }
    }
}

private struct NativeProfilePlaceholderScreen: View {
    @EnvironmentObject private var appState: NativeAppState

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if let user = appState.currentUser {
                    NativeScreenHeader(
                        title: user.displayName ?? user.username,
                        subtitle: "@\(user.username)"
                    )
                } else {
                    NativeScreenHeader(
                        title: "Profile",
                        subtitle: "Not signed in"
                    )
                }

                NativeSurfaceCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Profile debug mode")
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(.white)
                        Text("This placeholder bypasses the native profile screen and skips auto profile refresh so we can isolate the crash source.")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white.opacity(0.68))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            nativeLogger.log("NativeProfilePlaceholderScreen appear")
        }
    }
}

private struct NativeSavedPlaceholderScreen: View {
    @EnvironmentObject private var appState: NativeAppState

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                NativeScreenHeader(
                    title: "Saved places",
                    subtitle: "Placeholder screen"
                )

                NativeSurfaceCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Saved debug mode")
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(.white)
                        Text("This placeholder bypasses the native saved screen and skips auto profile refresh so we can isolate the crash source.")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white.opacity(0.68))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if !appState.savedPlaces.isEmpty {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Saved")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(nativeAccent.opacity(0.92))
                                .textCase(.uppercase)
                            Text("\(appState.savedPlaces.count) places ready")
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(.white)
                        }
                    }
                }

                if !appState.collections.isEmpty {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Collections")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(nativeAccent.opacity(0.92))
                                .textCase(.uppercase)
                            Text("\(appState.collections.count) lists ready")
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(.white)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Saved places")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            nativeLogger.log("NativeSavedPlaceholderScreen appear saved=\(appState.savedPlaces.count, privacy: .public) collections=\(appState.collections.count, privacy: .public)")
        }
    }
}

private struct NativeFloatingTabBar: View {
    @EnvironmentObject private var appState: NativeAppState
    @Binding var activeTab: NativeTab

    private let sideTabs: [(tab: NativeTab, icon: String)] = [
        (.discover, "safari"),
        (.feed, "person.2"),
        (.saved, "bookmark"),
        (.profile, "person"),
    ]

    var body: some View {
        HStack(spacing: 18) {
            ForEach(Array(sideTabs.prefix(2)), id: \.tab) { item in
                navItem(for: item)
            }

            Button {
                select(tab: .checkIn)
            } label: {
                ZStack {
                    Circle()
                        .fill(nativeAccent)
                        .frame(width: 60, height: 60)
                    Image(systemName: "plus")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.black)
                }
            }
            .buttonStyle(.plain)
            .offset(y: -4)

            ForEach(Array(sideTabs.suffix(2)), id: \.tab) { item in
                navItem(for: item)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial.opacity(0.92))
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func navItem(for item: (tab: NativeTab, icon: String)) -> some View {
        Button {
            select(tab: item.tab)
        } label: {
            ZStack {
                if activeTab == item.tab {
                    Circle()
                        .fill(Color.white.opacity(0.12))
                        .frame(width: 50, height: 50)
                }

                Image(systemName: item.icon)
                    .font(.system(size: 21, weight: item.tab == .feed ? .bold : .semibold))
                    .foregroundStyle(activeTab == item.tab ? .white : .white.opacity(0.58))
            }
            .frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.plain)
    }

    private func select(tab: NativeTab) {
        let requiresAuthTabs: Set<NativeTab> = [.feed, .saved, .profile, .checkIn]
        if appState.currentUser == nil && requiresAuthTabs.contains(tab) {
            let reason: String
            switch tab {
            case .feed:
                reason = "Log in to see your people feed."
            case .saved:
                reason = "Log in to view your saved places and collections."
            case .profile:
                reason = "Log in to open your profile."
            case .checkIn:
                reason = "Log in to save your check-ins."
            case .discover:
                reason = "Log in to continue."
            }
            appState.presentAuthGate(reason: reason)
            return
        }
        activeTab = tab
    }
}

private struct NativeDiscoverScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var showLocationSheet = false
    @State private var showSearchSheet = false
    @State private var showNotificationsSheet = false
    @State private var showDiscoveryScoreDebug = nativeDiscoveryScoreDebugMode
    @State private var showTodayRecommendationDebug = false
    @State private var selectedDebugPlace: NativePlace?

    private var balancedColumns: (left: [NativeDiscoveryColumnItem], right: [NativeDiscoveryColumnItem]) {
        buildNativeBalancedDiscoveryColumns(places: appState.discoveryPlaces)
    }

    private var discoveryScoreCounts: (mustVisit: Int, fitsYou: Int, worthALook: Int, maybe: Int, unscored: Int) {
        appState.discoveryPlaces.reduce(into: (0, 0, 0, 0, 0)) { result, place in
            guard let badge = nativeCompatibilityBadge(for: place.similarityStat) else {
                result.4 += 1
                return
            }
            switch badge.label {
            case "Must visit":
                result.0 += 1
            case "Fits you":
                result.1 += 1
            case "Worth a look":
                result.2 += 1
            default:
                result.3 += 1
            }
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let contentWidth = proxy.size.width - 32

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(alignment: .top, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Your vibe picks in")
                                .font(.system(size: 26, weight: .black))
                                .tracking(-1.3)
                                .foregroundStyle(.white)

                            Button {
                                showLocationSheet = true
                            } label: {
                                HStack(spacing: 6) {
                                    Text(appState.selectedLocation.label)
                                        .font(.system(size: 26, weight: .black))
                                        .tracking(-1.3)
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 16, weight: .black))
                                }
                                .foregroundStyle(nativeAccent)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.06))
                                .overlay(
                                    Capsule().stroke(nativeBorder, lineWidth: 1)
                                )
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)

                        }
                        Spacer(minLength: 0)
                        HStack(spacing: 8) {
                            Button {
                                showSearchSheet = true
                            } label: {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 44, height: 44)
                                    .background(nativeSurface)
                                    .overlay(
                                        Circle().stroke(nativeBorder, lineWidth: 1)
                                    )
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)

                            Button {
                                showNotificationsSheet = true
                            } label: {
                                Image(systemName: "bell")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 44, height: 44)
                                    .background(nativeSurface)
                                    .overlay(
                                        Circle().stroke(nativeBorder, lineWidth: 1)
                                    )
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if let discoveryErrorMessage = appState.discoveryErrorMessage {
                        NativeInlineError(message: discoveryErrorMessage)
                    }

                    Button {
                        Task { await appState.loadTodayRecommendation() }
                    } label: {
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Today recommendation")
                                    .font(.system(size: 19, weight: .black))
                                    .foregroundStyle(.black)
                                Text("Get one strong pick for today near you.")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Color.black.opacity(0.72))
                            }
                            Spacer(minLength: 0)
                            Group {
                                if appState.isTodayRecommendationLoading {
                                    ProgressView()
                                        .tint(.black)
                                } else {
                                    Image(systemName: "die.face.5.fill")
                                        .font(.system(size: 18, weight: .black))
                                        .foregroundStyle(.black)
                                }
                            }
                            .frame(width: 36, height: 36)
                            .background(Color.black.opacity(0.08))
                            .clipShape(Circle())
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            nativeAccent,
                                            Color(red: 176 / 255, green: 1, blue: 72 / 255),
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                        .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    }
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.plain)

                    if let todayRecommendationErrorMessage = appState.todayRecommendationErrorMessage {
                        NativeInlineError(message: todayRecommendationErrorMessage)
                    }

                    if let todayRecommendation = appState.todayRecommendation {
                        NavigationLink {
                            NativePlaceDetailScreen(initialPlace: todayRecommendation.place)
                        } label: {
                            NativeTodayRecommendationCard(
                                recommendation: todayRecommendation,
                                containerWidth: contentWidth,
                                onDebugTap: nativeTodayRecommendationScoreDebugMode ? {
                                    showTodayRecommendationDebug = true
                                } : nil
                            )
                        }
                        .frame(width: contentWidth, alignment: .leading)
                        .overlay(
                            Group {
                                if nativeTodayRecommendationDebugMode {
                                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                                        .stroke(Color.red, lineWidth: 2)
                                        .overlay(alignment: .topTrailing) {
                                            NativeLayoutDebugBadge(title: "LINK")
                                                .padding(10)
                                        }
                                }
                            }
                        )
                        .buttonStyle(.plain)
                    }

                    if appState.isDiscoveryLoading && appState.discoveryPlaces.isEmpty {
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Cooking your picks")
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundStyle(nativeAccent.opacity(0.9))
                                    .textCase(.uppercase)
                                Text("We're cooking places for you in \(appState.selectedLocation.label).")
                                    .font(.system(size: 20, weight: .black))
                                    .foregroundStyle(.white)
                                Text("Lining up the first places that fit your current taste.")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.58))
                            }
                        }
                    } else if appState.discoveryPlaces.isEmpty {
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("No places yet for \(appState.selectedLocation.label).")
                                    .font(.system(size: 20, weight: .black))
                                    .foregroundStyle(.white)
                                Text("Pull to refresh to try again.")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.58))
                            }
                        }
                    } else {
                        NativeDiscoveryMasonryView(
                            leftItems: balancedColumns.left,
                            rightItems: balancedColumns.right,
                            containerWidth: contentWidth,
                            onDebugTap: { place in
                                selectedDebugPlace = place
                            }
                        )

                        if appState.isDiscoveryLoadingMore {
                            HStack {
                                Spacer()
                                ProgressView()
                                    .tint(nativeAccent)
                                Spacer()
                            }
                            .padding(.top, 8)
                        }
                    }
                }
                .frame(width: contentWidth, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 18)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .overlay(alignment: .bottomTrailing) {
            if showDiscoveryScoreDebug {
                NativeDiscoveryScoreDebugPanel(
                    totalLoaded: appState.discoveryPlaces.count,
                    mustVisitCount: discoveryScoreCounts.mustVisit,
                    fitsYouCount: discoveryScoreCounts.fitsYou,
                    worthALookCount: discoveryScoreCounts.worthALook,
                    maybeCount: discoveryScoreCounts.maybe,
                    unscoredCount: discoveryScoreCounts.unscored,
                    onToggle: {
                        showDiscoveryScoreDebug.toggle()
                    }
                )
                .padding(.trailing, 16)
                .padding(.bottom, appState.showFloatingTabBar ? (appState.shouldShowUnlockVibeCTA ? 184 : 100) : 22)
            } else if nativeDiscoveryScoreDebugMode {
                Button {
                    showDiscoveryScoreDebug.toggle()
                } label: {
                    Image(systemName: "ladybug.fill")
                        .font(.system(size: 17, weight: .black))
                        .foregroundStyle(.black)
                        .frame(width: 46, height: 46)
                        .background(nativeAccent)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, 16)
                .padding(.bottom, appState.showFloatingTabBar ? (appState.shouldShowUnlockVibeCTA ? 184 : 100) : 22)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if appState.shouldShowUnlockVibeCTA {
                HStack {
                    Spacer()
                    Button {
                        if appState.currentUser == nil {
                            appState.presentAuthGate(
                                reason: "Log in to unlock your vibe and personalize discovery.",
                                postAuthAction: .openPreferenceSetup
                            )
                        } else {
                            appState.presentPreferenceSetup()
                        }
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Unlock your vibe")
                                    .font(.system(size: 15, weight: .black))
                                    .foregroundStyle(.white)
                                Text("Let AI understand your vibes & taste")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.58))
                            }
                            Spacer(minLength: 0)
                            Text("Start")
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(nativeAccent)
                                .clipShape(Capsule())
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(Color(red: 19 / 255, green: 19 / 255, blue: 22 / 255).opacity(0.96))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                                        .stroke(nativeBorder, lineWidth: 1)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, appState.showFloatingTabBar ? 96 : 18)
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showLocationSheet) {
            NativeLocationPickerSheet(
                selectedLocation: appState.selectedLocation,
                availableLocations: nativeLocationOptions,
                suggestedLocations: nativeLocationOptions,
                onSelect: { location in
                    showLocationSheet = false
                    Task { await appState.updateLocation(to: location) }
                }
            )
        }
        .sheet(isPresented: $showSearchSheet) {
            NavigationView {
                NativeDiscoverySearchSheet()
            }
            .navigationViewStyle(.stack)
        }
        .sheet(isPresented: $showNotificationsSheet) {
            NativePlaceholderSheet(
                title: "Notifications",
                message: "Notifications will plug into the native app once the rest of the discovery shell is locked in."
            )
        }
        .sheet(item: $selectedDebugPlace) { place in
            NavigationView {
                NativePlaceScoreDebugSheet(place: place)
            }
            .navigationViewStyle(.stack)
        }
        .sheet(isPresented: $showTodayRecommendationDebug) {
            NavigationView {
                NativeTodayRecommendationDebugSheet()
            }
            .navigationViewStyle(.stack)
        }
        .refreshable {
            await appState.refreshDiscovery()
        }
    }
}

private struct NativeTodayRecommendationCard: View {
    let recommendation: NativeTodayRecommendationResponse
    let containerWidth: CGFloat
    let onDebugTap: (() -> Void)?
    @State private var showConfetti = false

    private var contentWidth: CGFloat {
        max(containerWidth - 44, 0)
    }

    private var badge: NativeCompatibilityBadgeMeta? {
        nativeCompatibilityBadge(for: recommendation.compatibilityScore)
    }

    private var distanceLabel: String {
        if recommendation.distanceMiles < 0.2 {
            return "Walkable now"
        }
        return String(format: "%.1f mi away", recommendation.distanceMiles)
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            NativeRemoteImage(url: recommendation.place.image ?? recommendation.place.images?.first)
                .frame(width: containerWidth)
                .frame(height: 300)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .overlay(
                    LinearGradient(
                        colors: [.clear, Color.black.opacity(0.16), Color.black.opacity(0.84)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                )

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    Text("Today recommendation")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.white.opacity(0.96))
                        .clipShape(Capsule())
                    Spacer()
                    if let badge {
                        Text(badge.label)
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(badge.foreground)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(badge.background)
                            .clipShape(Capsule())
                    }
                }
                .frame(width: contentWidth, alignment: .leading)

                Spacer()

                VStack(alignment: .leading, spacing: 8) {
                    Text(recommendation.place.name)
                        .font(.system(size: 30, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: contentWidth, alignment: .leading)
                        .multilineTextAlignment(.leading)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        Text("\(recommendation.compatibilityScore)% match")
                        Text("•")
                        Text(distanceLabel)
                    }
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(nativeAccent)
                    .frame(width: contentWidth, alignment: .leading)

                    Text(recommendation.todayReason)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.82))
                        .frame(width: contentWidth, alignment: .leading)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(width: contentWidth, alignment: .leading)
            }
            .padding(22)
            .frame(width: containerWidth, alignment: .leading)
        }
        .frame(width: containerWidth)
        .frame(height: 300)
        .clipped()
        .contentShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(nativeAccent.opacity(0.95), lineWidth: 2)
        )
        .overlay {
            if showConfetti {
                NativeConfettiBurstView()
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .topTrailing) {
            if let onDebugTap, nativeTodayRecommendationScoreDebugMode {
                Button(action: onDebugTap) {
                    Image(systemName: "ladybug.fill")
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(.black)
                        .frame(width: 34, height: 34)
                        .background(nativeAccent)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(14)
            }
        }
        .overlay(
            Group {
                if nativeTodayRecommendationDebugMode {
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .stroke(Color.blue, lineWidth: 2)
                        .overlay(alignment: .topLeading) {
                            NativeLayoutDebugBadge(title: "CARD")
                                .padding(10)
                        }
                }
            }
        )
        .shadow(color: nativeAccent.opacity(0.22), radius: 20, y: 12)
        .onAppear {
            showConfetti = false
            withAnimation(.spring(response: 0.5, dampingFraction: 0.78)) {
                showConfetti = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                withAnimation(.easeOut(duration: 0.35)) {
                    showConfetti = false
                }
            }
        }
    }
}

private struct NativeDiscoveryScoreDebugPanel: View {
    let totalLoaded: Int
    let mustVisitCount: Int
    let fitsYouCount: Int
    let worthALookCount: Int
    let maybeCount: Int
    let unscoredCount: Int
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("Discovery debug")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(.white)
                Spacer(minLength: 0)
                Button(action: onToggle) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white.opacity(0.72))
                        .frame(width: 24, height: 24)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Loaded \(totalLoaded)")
                Text("Must visit \(mustVisitCount)")
                Text("Fits you \(fitsYouCount)")
                Text("Worth a look \(worthALookCount)")
                Text("Maybe \(maybeCount)")
                if unscoredCount > 0 {
                    Text("Unscored \(unscoredCount)")
                }
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.84))
        }
        .padding(14)
        .frame(width: 176, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.black.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(nativeAccent.opacity(0.5), lineWidth: 1)
                )
        )
    }
}

private struct NativePlaceScoreDebugSheet: View {
    @EnvironmentObject private var appState: NativeAppState
    let place: NativePlace
    @State private var payload: NativePlaceScoreDebugResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(place.name)
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                    Text("Score audit")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(nativeAccent)
                        .textCase(.uppercase)
                }

                if isLoading {
                    NativeSurfaceCard {
                        HStack(spacing: 12) {
                            ProgressView().tint(nativeAccent)
                            Text("Loading score audit...")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.72))
                        }
                    }
                } else if let errorMessage {
                    NativeInlineError(message: errorMessage)
                } else if let payload {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Effective score")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            Text("\(payload.effectiveScore ?? payload.calculation.finalScore)%")
                                .font(.system(size: 28, weight: .black))
                                .foregroundStyle(.white)
                            Text(payload.effectiveClassification)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(nativeAccent)
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Calculation")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Final computed", value: "\(payload.calculation.finalScore)%")
                            NativeDebugRow(label: "Computed class", value: payload.calculation.classification)
                            NativeDebugRow(label: "Unclamped", value: "\(payload.calculation.unclampedScore)")
                            NativeDebugRow(label: "Base score", value: "\(payload.calculation.baseScore)")
                            NativeDebugRow(label: "Diversity seed", value: "\(payload.calculation.diversitySeed)")
                            NativeDebugRow(label: "Base similarity input", value: payload.calculation.baseSimilarityInput.map(String.init) ?? "nil")
                            NativeDebugRow(label: "Matched interests", value: "\(payload.calculation.matchedInterestCount)")
                            NativeDebugRow(label: "Matched vibe", value: payload.calculation.matchedVibe ? "yes" : "no")
                            NativeDebugRow(label: "Noise penalty", value: "\(payload.calculation.noisePenalty)")
                            NativeDebugRow(label: "Moment overlap", value: "\(payload.calculation.momentOverlapCount)")
                            NativeDebugRow(label: "Bookmark overlap", value: "\(payload.calculation.bookmarkOverlapCount)")
                            NativeDebugRow(label: "Social overlap", value: "\(payload.calculation.socialOverlapCount)")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Inputs")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Selected interests", value: payload.calculation.selectedInterests.isEmpty ? "none" : payload.calculation.selectedInterests.joined(separator: ", "))
                            NativeDebugRow(label: "Selected vibe", value: payload.calculation.selectedVibe ?? "none")
                            NativeDebugRow(label: "Bookmarked", value: payload.interactions.isBookmarked ? "yes" : "no")
                            NativeDebugRow(label: "Visited", value: payload.interactions.isVisited ? "yes" : "no")
                            NativeDebugRow(label: "Vibed", value: payload.interactions.isVibed ? "yes" : "no")
                            NativeDebugRow(label: "Commented", value: payload.interactions.isCommented ? "yes" : "no")
                            NativeDebugRow(label: "Recent", value: payload.interactions.isRecent ? "yes" : "no")
                            NativeDebugRow(label: "Followed place match", value: payload.interactions.followedPlaceMatch ? "yes" : "no")
                            NativeDebugRow(label: "Moment rating", value: payload.interactions.momentRating.map { "\($0)/5" } ?? "none")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Persisted snapshot")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Similarity %", value: payload.persistedScore?.similarityPercentage.map(String.init) ?? "nil")
                            NativeDebugRow(label: "Match score", value: payload.persistedScore?.matchScore.map(String.init) ?? "nil")
                            NativeDebugRow(label: "Distance km", value: payload.persistedScore?.distanceKm.map { String(format: "%.2f", $0) } ?? "nil")
                            NativeDebugRow(label: "Source version", value: payload.persistedScore?.sourceVersion ?? "nil")
                            NativeDebugRow(label: "Updated at", value: payload.persistedScore?.updatedAt ?? "nil")
                            NativeDebugRow(label: "Reason", value: payload.persistedScore?.recommendationReason ?? "nil")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Contributions")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            ForEach(payload.calculation.contributions) { contribution in
                                HStack(alignment: .top, spacing: 10) {
                                    Text(contribution.delta >= 0 ? "+\(contribution.delta)" : "\(contribution.delta)")
                                        .font(.system(size: 12, weight: .black))
                                        .foregroundStyle(contribution.delta >= 0 ? nativeAccent : .red.opacity(0.9))
                                        .frame(width: 44, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(contribution.label)
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundStyle(.white)
                                        if let note = contribution.note, !note.isEmpty {
                                            Text(note)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.56))
                                        }
                                    }
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Signals & history")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Bookmark keywords", value: nativeDebugListLabel(payload.availableSignals.bookmarkKeywords))
                            NativeDebugRow(label: "Moment keywords", value: nativeDebugListLabel(payload.availableSignals.momentKeywords))
                            NativeDebugRow(label: "Social keywords", value: nativeDebugListLabel(payload.availableSignals.socialKeywords))
                            NativeDebugRow(label: "Taste keywords", value: nativeDebugListLabel(payload.availableSignals.tasteKeywords))
                            NativeDebugRow(label: "History updatedAt", value: payload.history.persistedUpdatedAt ?? "nil")
                            NativeDebugRow(label: "History sourceVersion", value: payload.history.sourceVersion ?? "nil")
                            NativeDebugRow(label: "History reason", value: payload.history.persistedReason ?? "nil")
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Score debug")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: place.id) {
            await loadDebug()
        }
    }

    private func loadDebug() async {
        isLoading = true
        errorMessage = nil
        do {
            payload = try await appState.loadPlaceScoreDebug(for: place.id)
        } catch {
            errorMessage = "Could not load score audit right now."
        }
        isLoading = false
    }
}

private struct NativeTodayRecommendationDebugSheet: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var payload: NativeTodayRecommendationDebugResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Today recommendation")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                    Text("Selection debug")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(nativeAccent)
                        .textCase(.uppercase)
                }

                if isLoading {
                    NativeSurfaceCard {
                        HStack(spacing: 12) {
                            ProgressView().tint(nativeAccent)
                            Text("Loading today recommendation audit...")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.72))
                        }
                    }
                } else if let errorMessage {
                    NativeInlineError(message: errorMessage)
                } else if let payload {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Criteria")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Min score", value: "\(payload.criteria.minScore)%")
                            NativeDebugRow(label: "Preferred distance", value: String(format: "%.1f mi", payload.criteria.preferredDistanceMiles))
                            NativeDebugRow(label: "Fallback distance", value: String(format: "%.1f mi", payload.criteria.fallbackDistanceMiles))
                            NativeDebugRow(label: "Allowed classes", value: payload.criteria.allowedClassifications.joined(separator: ", "))
                            NativeDebugRow(label: "Exclude visited", value: payload.criteria.excludesVisited ? "yes" : "no")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Profile context")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Selected interests", value: nativeDebugListLabel(payload.profileContext.selectedInterests))
                            NativeDebugRow(label: "Selected vibe", value: payload.profileContext.selectedVibe ?? "none")
                            NativeDebugRow(label: "Bookmarked count", value: "\(payload.profileContext.bookmarkedCount)")
                            NativeDebugRow(label: "Visited count", value: "\(payload.profileContext.visitedCount)")
                            NativeDebugRow(label: "Followed places", value: "\(payload.profileContext.followedPlacesCount)")
                            NativeDebugRow(label: "Social keywords", value: "\(payload.profileContext.socialKeywordCount)")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Pool summary")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Area candidates", value: "\(payload.poolSummary.totalAreaCandidates)")
                            NativeDebugRow(label: "Ranked candidates", value: "\(payload.poolSummary.rankedCandidates)")
                            NativeDebugRow(label: "Nearby candidates", value: "\(payload.poolSummary.nearbyCandidates)")
                            NativeDebugRow(label: "Fallback candidates", value: "\(payload.poolSummary.fallbackCandidates)")
                        }
                    }

                    if let selected = payload.selectedCandidate {
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Selected candidate")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white.opacity(0.42))
                                    .textCase(.uppercase)
                                Text(selected.placeName)
                                    .font(.system(size: 20, weight: .black))
                                    .foregroundStyle(.white)
                                NativeDebugRow(label: "Classification", value: selected.classification)
                                NativeDebugRow(label: "Score", value: selected.score.map { "\($0)%" } ?? "nil")
                                NativeDebugRow(label: "Distance", value: String(format: "%.2f mi", selected.distanceMiles))
                                NativeDebugRow(label: "Bucket", value: selected.selectionBucket ?? "nil")
                                NativeDebugRow(label: "Base reason", value: selected.reason ?? "nil")
                                NativeDebugRow(label: "Today reason", value: selected.todayReason ?? "nil")
                                NativeDebugRow(label: "Best time", value: selected.bestTime ?? "nil")
                                NativeDebugRow(label: "Persisted version", value: selected.persistedSourceVersion ?? "nil")
                                NativeDebugRow(label: "Persisted updatedAt", value: selected.persistedUpdatedAt ?? "nil")
                            }
                        }
                    }

                    if !payload.topCandidates.isEmpty {
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Top candidates")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white.opacity(0.42))
                                    .textCase(.uppercase)
                                ForEach(payload.topCandidates) { candidate in
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(alignment: .top, spacing: 8) {
                                            Text(candidate.placeName)
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundStyle(.white)
                                            Spacer(minLength: 0)
                                            Text(candidate.score.map { "\($0)%" } ?? "nil")
                                                .font(.system(size: 13, weight: .black))
                                                .foregroundStyle(nativeAccent)
                                        }
                                        Text("\(candidate.classification) • \(String(format: "%.2f mi", candidate.distanceMiles))")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.72))
                                        if let todayReason = candidate.todayReason ?? candidate.reason {
                                            Text(todayReason)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.56))
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    if candidate.id != payload.topCandidates.last?.id {
                                        Divider().background(Color.white.opacity(0.08))
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Today debug")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadDebug()
        }
    }

    private func loadDebug() async {
        isLoading = true
        errorMessage = nil
        do {
            payload = try await appState.loadTodayRecommendationDebug()
        } catch {
            errorMessage = "Could not load today recommendation debug right now."
        }
        isLoading = false
    }
}

private struct NativeTravelerScoreDebugSheet: View {
    @EnvironmentObject private var appState: NativeAppState
    let traveler: NativeTravelerSummary
    @State private var payload: NativeTravelerScoreDebugResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(traveler.displayName ?? traveler.username)
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                    Text("Traveler score debug")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(nativeAccent)
                        .textCase(.uppercase)
                }

                if isLoading {
                    NativeSurfaceCard {
                        HStack(spacing: 12) {
                            ProgressView().tint(nativeAccent)
                            Text("Loading traveler score audit...")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.72))
                        }
                    }
                } else if let errorMessage {
                    NativeInlineError(message: errorMessage)
                } else if let payload {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Effective score")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            Text("\(payload.effectiveScore)%")
                                .font(.system(size: 28, weight: .black))
                                .foregroundStyle(.white)
                            if let persistedScore = payload.persistedScore {
                                NativeDebugRow(label: "Persisted score", value: "\(persistedScore)%")
                            }
                            NativeDebugRow(label: "Descriptor", value: payload.descriptor ?? "nil")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Calculation")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Base score", value: "\(payload.calculation.baseScore)")
                            NativeDebugRow(label: "Overlap places", value: "\(payload.calculation.overlapPlaces)")
                            NativeDebugRow(label: "Overlap places delta", value: "+\(payload.calculation.overlapPlacesDelta)")
                            NativeDebugRow(label: "Overlap keywords", value: "\(payload.calculation.overlapKeywords)")
                            NativeDebugRow(label: "Overlap keywords delta", value: "+\(payload.calculation.overlapKeywordsDelta)")
                            NativeDebugRow(label: "Following", value: payload.calculation.isFollowing ? "yes" : "no")
                            NativeDebugRow(label: "Following delta", value: payload.calculation.followingDelta == 0 ? "0" : "+\(payload.calculation.followingDelta)")
                            NativeDebugRow(label: "Interaction count", value: "\(payload.calculation.interactionCount)")
                            NativeDebugRow(label: "Interaction boost", value: "\(payload.calculation.interactionBoost)")
                            NativeDebugRow(label: "Interaction delta", value: payload.calculation.interactionDelta == 0 ? "0" : "+\(payload.calculation.interactionDelta)")
                            NativeDebugRow(label: "Computed score", value: "\(payload.calculation.computedScore)%")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Reasoning")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Computed reason", value: payload.reasoning.computedReason)
                            NativeDebugRow(label: "Persisted reason", value: payload.reasoning.persistedReason ?? "nil")
                            NativeDebugRow(label: "Persisted updatedAt", value: payload.persistedUpdatedAt ?? "nil")
                        }
                    }

                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Overlap with viewer")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.42))
                                .textCase(.uppercase)
                            NativeDebugRow(label: "Shared places", value: nativeDebugListLabel(payload.overlaps.sharedPlaceNames))
                            NativeDebugRow(label: "Shared taste keywords", value: nativeDebugListLabel(payload.overlaps.sharedTasteKeywords))
                            NativeDebugRow(label: "Viewer interests", value: nativeDebugListLabel(payload.viewerContext.selectedInterests))
                            NativeDebugRow(label: "Viewer vibe", value: payload.viewerContext.selectedVibe ?? "none")
                            NativeDebugRow(label: "Viewer taste keywords", value: nativeDebugListLabel(payload.viewerContext.tasteKeywords))
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Traveler debug")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: traveler.id) {
            await loadDebug()
        }
    }

    private func loadDebug() async {
        isLoading = true
        errorMessage = nil
        do {
            payload = try await appState.loadTravelerScoreDebug(for: traveler.id)
        } catch {
            errorMessage = "Could not load traveler score debug right now."
        }
        isLoading = false
    }
}

private struct NativeDebugRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white.opacity(0.42))
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct NativeLayoutDebugBadge: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("TODAY DEBUG")
                .font(.system(size: 11, weight: .black))
            Text(title)
                .font(.system(size: 11, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeConfettiBurstView: View {
    private let pieces: [(x: CGFloat, y: CGFloat, color: Color, rotation: Double, size: CGFloat)] = [
        (0.14, 0.06, nativeAccent, -18, 9),
        (0.22, 0.12, Color.white, 28, 7),
        (0.31, 0.08, Color(red: 120 / 255, green: 1, blue: 160 / 255), -34, 8),
        (0.68, 0.07, nativeAccent.opacity(0.9), 22, 9),
        (0.76, 0.13, Color.white.opacity(0.9), -20, 7),
        (0.84, 0.09, Color(red: 120 / 255, green: 1, blue: 160 / 255), 30, 8),
    ]

    @State private var animate = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(Array(pieces.enumerated()), id: \.offset) { index, piece in
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(piece.color)
                        .frame(width: piece.size, height: piece.size * 1.5)
                        .rotationEffect(.degrees(animate ? piece.rotation : 0))
                        .position(
                            x: proxy.size.width * piece.x,
                            y: proxy.size.height * (animate ? piece.y + 0.13 : piece.y)
                        )
                        .opacity(animate ? 0 : 1)
                        .animation(
                            .easeOut(duration: 0.9).delay(Double(index) * 0.03),
                            value: animate
                        )
                }
            }
            .onAppear {
                animate = false
                DispatchQueue.main.async {
                    animate = true
                }
            }
        }
        .allowsHitTesting(false)
    }
}

private struct NativeSavedScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var activeSection: NativeSavedSection = .places
    @State private var expandedSavedCities: Set<String> = []
    @State private var showCreateCollectionSheet = false
    @State private var newCollectionName = ""
    @State private var selectedCollectionPlaceIds: Set<String> = []
    @State private var isCreatingCollection = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    NativeScreenHeader(
                        title: "Saved places",
                        subtitle: "Your shortlist and collections."
                    )

                    NativeSavedTabs(activeSection: $activeSection)

                    if appState.currentUser == nil {
                        NativeGuestPromptCard(
                            eyebrow: "Saved",
                            title: "Save places once you're signed in.",
                            message: "Log in to build your shortlist and create collections.",
                            cta: "Log in"
                        )
                    } else if let savedErrorMessage = appState.savedErrorMessage {
                        NativeInlineError(message: savedErrorMessage)
                    }

                    savedSectionContent
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 132)
            }
        }
        .navigationTitle("Saved places")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCreateCollectionSheet) {
            NavigationView {
                ZStack {
                    Color.black.ignoresSafeArea()

                    ScrollView(showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 18) {
                            Text("New collection")
                                .font(.system(size: 24, weight: .black))
                                .foregroundStyle(.white)

                            TextField("Collection name", text: $newCollectionName)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color.white.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Choose from your saved places")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white.opacity(0.42))
                                    .textCase(.uppercase)
                                Text("Pick the saved places you want to include in this collection.")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.6))
                            }

                            if appState.savedPlaces.isEmpty {
                                NativeSurfaceCard {
                                    Text("Save a few places first, then you can group them into a collection.")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.64))
                                }
                            } else {
                                LazyVStack(spacing: 10) {
                                    ForEach(appState.savedPlaces) { place in
                                        Button {
                                            toggleCollectionPlace(place.id)
                                        } label: {
                                            HStack(spacing: 12) {
                                                NativeRemoteImage(url: place.image ?? place.images?.first)
                                                    .frame(width: 56, height: 56)
                                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                                                VStack(alignment: .leading, spacing: 4) {
                                                    Text(place.name)
                                                        .font(.system(size: 15, weight: .bold))
                                                        .foregroundStyle(.white)
                                                        .multilineTextAlignment(.leading)
                                                    Text(place.location)
                                                        .font(.system(size: 12, weight: .medium))
                                                        .foregroundStyle(.white.opacity(0.56))
                                                        .lineLimit(2)
                                                }

                                                Spacer(minLength: 0)

                                                Image(systemName: selectedCollectionPlaceIds.contains(place.id) ? "checkmark.circle.fill" : "circle")
                                                    .font(.system(size: 22, weight: .bold))
                                                    .foregroundStyle(selectedCollectionPlaceIds.contains(place.id) ? nativeAccent : .white.opacity(0.28))
                                            }
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 12)
                                            .background(Color.white.opacity(0.05))
                                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            Button {
                                Task {
                                    await createCollection()
                                }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isCreatingCollection {
                                        ProgressView().tint(.black)
                                    } else {
                                        Text("Create collection")
                                            .font(.system(size: 15, weight: .black))
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 14)
                                .background(nativeAccent)
                                .foregroundStyle(.black)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(
                                isCreatingCollection ||
                                newCollectionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                selectedCollectionPlaceIds.isEmpty
                            )
                        }
                        .padding(20)
                    }
                }
                .navigationTitle("Add collection")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") {
                            showCreateCollectionSheet = false
                        }
                    }
                }
            }
            .navigationViewStyle(.stack)
        }
        .onAppear {
            if expandedSavedCities.isEmpty {
                expandedSavedCities = Set(savedCityGroups.map(\.city))
            }
            if appState.savedPlaces.isEmpty && appState.collections.isEmpty && appState.currentUser != nil {
                Task {
                    await appState.refreshSavedContent()
                    if expandedSavedCities.isEmpty {
                        expandedSavedCities = Set(savedCityGroups.map(\.city))
                    }
                }
            }
        }
        .refreshable {
            await appState.refreshSavedContent()
            if expandedSavedCities.isEmpty {
                expandedSavedCities = Set(savedCityGroups.map(\.city))
            }
        }
    }

    @ViewBuilder
    private var savedSectionContent: some View {
        switch activeSection {
        case .places:
            if appState.currentUser == nil {
                EmptyView()
            } else if appState.savedPlaces.isEmpty {
                NativeSurfaceCard {
                    Text("No saved places yet.")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                }
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(savedCityGroups, id: \.city) { group in
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 14) {
                                Button {
                                    toggleSavedCity(group.city)
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(group.city)
                                                .font(.system(size: 18, weight: .black))
                                                .foregroundStyle(.white)
                                            Text("\(group.places.count) places")
                                                .font(.system(size: 12, weight: .bold))
                                                .foregroundStyle(.white.opacity(0.45))
                                        }
                                        Spacer()
                                        Image(systemName: expandedSavedCities.contains(group.city) ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 14, weight: .black))
                                            .foregroundStyle(.white.opacity(0.7))
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .zIndex(2)

                                if expandedSavedCities.contains(group.city) {
                                    VStack(spacing: 12) {
                                        ForEach(group.places) { place in
                                            NavigationLink {
                                                NativePlaceDetailScreen(initialPlace: place)
                                            } label: {
                                                NativePlaceCard(place: place)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .zIndex(1)
                                }
                            }
                        }
                    }
                }
            }
        case .collections:
            VStack(alignment: .leading, spacing: 14) {
                if appState.currentUser != nil {
                    Button {
                        newCollectionName = ""
                        selectedCollectionPlaceIds = []
                        showCreateCollectionSheet = true
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .black))
                            Text("Add collection")
                                .font(.system(size: 14, weight: .black))
                        }
                        .foregroundStyle(.black)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(nativeAccent)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                if appState.currentUser == nil {
                    EmptyView()
                } else if appState.collections.isEmpty {
                    NativeSurfaceCard {
                        Text("No collections yet.")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                } else {
                LazyVStack(spacing: 14) {
                    ForEach(Array(appState.collections.prefix(30))) { collection in
                        NavigationLink {
                            NativeCollectionDetailScreen(collection: collection)
                        } label: {
                            NativeCollectionCard(collection: collection)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            }
        }
    }

    private var savedCityGroups: [(city: String, places: [NativePlace])] {
        let grouped = Dictionary(grouping: Array(appState.savedPlaces.prefix(60))) { place in
            place.location
                .split(separator: ",")
                .first
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown city"
        }

        return grouped
            .map { key, value in
                (
                    city: key,
                    places: value.sorted {
                        $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                    }
                )
            }
            .sorted { $0.city.localizedCaseInsensitiveCompare($1.city) == .orderedAscending }
    }

    private func toggleSavedCity(_ city: String) {
        if expandedSavedCities.contains(city) {
            expandedSavedCities.remove(city)
        } else {
            expandedSavedCities.insert(city)
        }
    }

    private func toggleCollectionPlace(_ placeId: String) {
        if selectedCollectionPlaceIds.contains(placeId) {
            selectedCollectionPlaceIds.remove(placeId)
        } else {
            selectedCollectionPlaceIds.insert(placeId)
        }
    }

    private func createCollection() async {
        let trimmedName = newCollectionName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !selectedCollectionPlaceIds.isEmpty else { return }

        isCreatingCollection = true
        defer { isCreatingCollection = false }

        do {
            try await appState.createCollection(
                label: trimmedName,
                placeIds: Array(selectedCollectionPlaceIds)
            )
            newCollectionName = ""
            selectedCollectionPlaceIds = []
            showCreateCollectionSheet = false
            activeSection = .collections
        } catch {
            appState.savedErrorMessage = "Could not create collection right now."
        }
    }
}

private struct NativeProfileScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var activeSection: NativeProfileSection = .feed
    @State private var expandedSavedCities: Set<String> = []
    @State private var showEditProfileSheet = false
    @State private var showSettingsSheet = false
    @State private var ownFollowersCount: Int?
    @State private var blockedUsers: [NativeBlockedUser] = []
    @State private var isBlockedUsersLoading = false

    private var currentTravelerSummary: NativeTravelerSummary? {
        guard let user = appState.currentUser else { return nil }
        return NativeTravelerSummary(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: nil,
            bio: user.email,
            descriptor: nil,
            matchScore: nil,
            followersCount: ownFollowersCount,
            recentSavedPlaces: appState.savedPlaces.prefix(4).map {
                NativeTravelerSavedEntry(place: $0, savedAtLabel: "Saved", savedAtIso: nil)
            },
            recentCollections: appState.collections,
            travelHistory: [],
            visitedPlacesCount: appState.myMoments.count,
            savedPlacesCount: appState.savedPlaces.count,
            collectionsCount: appState.collections.count
        )
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 16, pinnedViews: [.sectionHeaders]) {
                if let user = appState.currentUser {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .top, spacing: 14) {
                                NativeAvatarCircle(
                                    url: nil,
                                    fallbackText: user.displayName ?? user.username,
                                    size: 60,
                                    fontSize: 21
                                )

                                VStack(alignment: .leading, spacing: 6) {
                                    Text(user.displayName ?? user.username)
                                        .font(.system(size: 22, weight: .black))
                                        .foregroundStyle(.white)
                                        .fixedSize(horizontal: false, vertical: true)

                                    if let email = user.email, !email.isEmpty {
                                        Text(email)
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.56))
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                            }

                            HStack(spacing: 6) {
                                if let traveler = currentTravelerSummary {
                                    NavigationLink {
                                        NativeFollowersScreen(traveler: traveler)
                                    } label: {
                                        NativeProfileMetaPill(
                                            label: ownFollowersCount.map { "\($0) followers" } ?? "Followers",
                                            foreground: .white.opacity(0.84),
                                            background: Color.white.opacity(0.08)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            HStack(spacing: 12) {
                                Button {
                                    activeSection = .saved
                                } label: {
                                    NativeProfileMiniStat(label: "Saved", value: "\(appState.savedPlaces.count)")
                                }
                                .buttonStyle(.plain)

                                Button {
                                    activeSection = .visited
                                } label: {
                                    NativeProfileMiniStat(label: "Visited", value: "\(appState.myMoments.count)")
                                }
                                .buttonStyle(.plain)

                                Button {
                                    activeSection = .collections
                                } label: {
                                    NativeProfileMiniStat(label: "Lists", value: "\(appState.collections.count)")
                                }
                                .buttonStyle(.plain)
                            }
                            .frame(maxWidth: .infinity)

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Travel taste")
                                    .font(.system(size: 9, weight: .black))
                                    .foregroundStyle(nativeAccent.opacity(0.82))
                                    .textCase(.uppercase)
                                Text("Saved places shape the edges of your profile, while your check-ins keep the strongest signal.")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.72))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                nativeAccent.opacity(0.05),
                                                Color(red: 24 / 255, green: 26 / 255, blue: 31 / 255).opacity(0.86)
                                            ],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .stroke(nativeAccent.opacity(0.1), lineWidth: 1)
                            )

                            HStack(spacing: 10) {
                                Button {
                                    showEditProfileSheet = true
                                } label: {
                                    HStack {
                                        Spacer()
                                        Text("Edit profile")
                                            .font(.system(size: 14, weight: .black))
                                        Spacer()
                                    }
                                    .padding(.vertical, 12)
                                    .background(nativeAccent)
                                    .foregroundStyle(.black)
                                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                                .buttonStyle(.plain)

                                Button {
                                    UIPasteboard.general.string = "https://vibinn.club/u/\(user.username)"
                                } label: {
                                    Image(systemName: "square.and.arrow.up")
                                        .font(.system(size: 15, weight: .black))
                                        .foregroundStyle(.white)
                                        .frame(width: 44, height: 44)
                                        .background(Color.white.opacity(0.08))
                                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, nativeTravelerProfileHorizontalPadding)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                    .background(
                        Rectangle()
                            .fill(nativeProfileHeaderFill)
                    )
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        NativeGuestPromptCard(
                            eyebrow: "My Profile",
                            title: "Make this profile yours.",
                            message: "Log in to save places, follow travelers, and keep your own travel graph.",
                            cta: "Log in"
                        )
                    }
                    .padding(.horizontal, nativeTravelerProfileHorizontalPadding)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                    .background(
                        Rectangle()
                            .fill(nativeProfileHeaderFill)
                    )
                }

                Section {
                    VStack(alignment: .leading, spacing: 18) {
                        if let profileErrorMessage = appState.profileErrorMessage {
                            NativeInlineError(message: profileErrorMessage)
                        }

                        ownProfileSectionContent
                    }
                    .id(activeSection)
                    .padding(.horizontal, nativeTravelerProfileHorizontalPadding)
                    .padding(.top, 12)
                    .padding(.bottom, 140)
                } header: {
                    NativeProfileTabs(activeSection: $activeSection)
                }
            }
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showSettingsSheet = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showEditProfileSheet) {
            NativePlaceholderSheet(
                title: "Edit profile",
                message: "Native edit profile flow will plug in here next."
            )
        }
        .sheet(isPresented: $showSettingsSheet) {
            NavigationView {
                ZStack {
                    Color.black.ignoresSafeArea()

                    VStack(alignment: .leading, spacing: 16) {
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Settings")
                                    .font(.system(size: 18, weight: .black))
                                    .foregroundStyle(.white)
                                Text("Manage your account session and test native auth flows.")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.64))
                            }
                        }

                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Authentication")
                                    .font(.system(size: 15, weight: .black))
                                    .foregroundStyle(.white)

                                if let user = appState.currentUser {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(user.displayName ?? user.username)
                                            .font(.system(size: 15, weight: .heavy))
                                            .foregroundStyle(.white)
                                        Text("@\(user.username)")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.6))
                                    }

                                    Text("Use these actions to simulate logout and return to the native login screen.")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.62))

                                    VStack(spacing: 10) {
                                        Button {
                                            appState.logout()
                                            showSettingsSheet = false
                                        } label: {
                                            HStack {
                                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                                    .font(.system(size: 15, weight: .bold))
                                                Text("Log out")
                                                    .font(.system(size: 15, weight: .black))
                                                Spacer()
                                            }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 14)
                                            .frame(maxWidth: .infinity)
                                            .background(Color.white.opacity(0.08))
                                            .foregroundStyle(.white)
                                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        }

                                        Button {
                                            appState.logout()
                                            showSettingsSheet = false
                                            appState.presentAuthGate(reason: "Log in to keep building your travel graph.")
                                        } label: {
                                            HStack {
                                                Image(systemName: "person.crop.circle.badge.plus")
                                                    .font(.system(size: 15, weight: .bold))
                                                Text("Go to login")
                                                    .font(.system(size: 15, weight: .black))
                                                Spacer()
                                            }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 14)
                                            .frame(maxWidth: .infinity)
                                            .background(nativeAccent.opacity(0.14))
                                            .foregroundStyle(nativeAccent)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                    .stroke(nativeAccent.opacity(0.35), lineWidth: 1)
                                            )
                                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        }
                                    }
                                } else {
                                    Text("You are currently signed out. Return to the auth screen to sign in again.")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.62))

                                    Button {
                                        showSettingsSheet = false
                                        appState.presentAuthGate(reason: "Log in to personalize your profile.")
                                    } label: {
                                        HStack {
                                            Image(systemName: "person.crop.circle.badge.plus")
                                                .font(.system(size: 15, weight: .bold))
                                            Text("Go to login")
                                                .font(.system(size: 15, weight: .black))
                                            Spacer()
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 14)
                                        .frame(maxWidth: .infinity)
                                        .background(nativeAccent.opacity(0.14))
                                        .foregroundStyle(nativeAccent)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                .stroke(nativeAccent.opacity(0.35), lineWidth: 1)
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                    }
                                }
                            }
                        }

                        if appState.currentUser != nil {
                            NativeSurfaceCard {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text("Blocked accounts")
                                        .font(.system(size: 15, weight: .black))
                                        .foregroundStyle(.white)

                                    if isBlockedUsersLoading {
                                        HStack(spacing: 10) {
                                            ProgressView().tint(nativeAccent)
                                            Text("Loading blocked accounts...")
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.62))
                                        }
                                    } else if blockedUsers.isEmpty {
                                        Text("No blocked accounts yet.")
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.62))
                                    } else {
                                        VStack(spacing: 10) {
                                            ForEach(blockedUsers) { blockedUser in
                                                HStack(spacing: 12) {
                                                    NativeAvatarCircle(
                                                        url: blockedUser.avatar,
                                                        fallbackText: blockedUser.displayName ?? blockedUser.username,
                                                        size: 42,
                                                        fontSize: 15
                                                    )

                                                    VStack(alignment: .leading, spacing: 4) {
                                                        Text(blockedUser.displayName ?? blockedUser.username)
                                                            .font(.system(size: 14, weight: .black))
                                                            .foregroundStyle(.white)
                                                        Text("@\(blockedUser.username)")
                                                            .font(.system(size: 12, weight: .bold))
                                                            .foregroundStyle(.white.opacity(0.46))
                                                    }

                                                    Spacer(minLength: 0)

                                                    Button {
                                                        Task {
                                                            try? await appState.unblockUser(blockedUser.id)
                                                            blockedUsers.removeAll { $0.id == blockedUser.id }
                                                        }
                                                    } label: {
                                                        Text("Unblock")
                                                            .font(.system(size: 12, weight: .black))
                                                            .foregroundStyle(nativeAccent)
                                                            .padding(.horizontal, 12)
                                                            .padding(.vertical, 9)
                                                            .background(nativeAccent.opacity(0.12))
                                                            .clipShape(Capsule())
                                                    }
                                                    .buttonStyle(.plain)
                                                }
                                                if blockedUser.id != blockedUsers.last?.id {
                                                    Divider().background(Color.white.opacity(0.08))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Spacer()
                    }
                    .padding(20)
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") {
                            showSettingsSheet = false
                        }
                    }
                }
                .task {
                    guard appState.currentUser != nil else { return }
                    isBlockedUsersLoading = true
                    defer { isBlockedUsersLoading = false }
                    blockedUsers = (try? await appState.fetchBlockedUsers()) ?? []
                }
            }
            .navigationViewStyle(.stack)
        }
        .task {
            if appState.currentUser != nil && appState.savedPlaces.isEmpty && appState.collections.isEmpty {
                await appState.refreshSavedContent()
            } else if appState.ownFeedItemsCache.isEmpty {
                if appState.currentUser != nil {
                    await appState.refreshSavedContent()
                }
            }
            if let user = appState.currentUser,
               ownFollowersCount == nil,
               let response = try? await appState.fetchTravelerProfile(id: user.id) {
                ownFollowersCount = response.traveler.followersCount
            }
        }
        .onAppear {
            if expandedSavedCities.isEmpty {
                expandedSavedCities = Set(savedCityGroups.map(\.city))
            }
            nativeLogger.log("NativeProfileScreen appear saved=\(appState.savedPlaces.count, privacy: .public) collections=\(appState.collections.count, privacy: .public) moments=\(appState.myMoments.count, privacy: .public)")
        }
        .onAppear {
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(red: 16 / 255, green: 16 / 255, blue: 19 / 255, alpha: 0.98)
            appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
            appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
            UINavigationBar.appearance().compactAppearance = appearance
        }
        .refreshable {
            await appState.refreshProfile()
        }
    }

    @ViewBuilder
    private var ownProfileSectionContent: some View {
        if appState.currentUser == nil {
            EmptyView()
        } else {
            switch activeSection {
            case .feed:
                if appState.ownFeedItemsCache.isEmpty {
                    emptyOwnProfileBlock("Your latest activity will show up here.")
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(appState.ownFeedItemsCache) { item in
                            NativeFeedCard(item: item)
                        }
                    }
                }
            case .saved:
                if appState.savedPlaces.isEmpty {
                    emptyOwnProfileBlock("No saved places yet.")
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(savedCityGroups, id: \.city) { group in
                            NativeSurfaceCard {
                                VStack(alignment: .leading, spacing: 14) {
                                    Button {
                                        toggleSavedCity(group.city)
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(group.city)
                                                    .font(.system(size: 18, weight: .black))
                                                    .foregroundStyle(.white)
                                                Text("\(group.places.count) places")
                                                    .font(.system(size: 12, weight: .bold))
                                                    .foregroundStyle(.white.opacity(0.45))
                                            }
                                            Spacer()
                                            Image(systemName: expandedSavedCities.contains(group.city) ? "chevron.up" : "chevron.down")
                                                .font(.system(size: 14, weight: .black))
                                                .foregroundStyle(.white.opacity(0.7))
                                        }
                                    }
                                    .buttonStyle(.plain)

                                    if expandedSavedCities.contains(group.city) {
                                        VStack(spacing: 12) {
                                            ForEach(group.places) { place in
                                                NavigationLink {
                                                    NativePlaceDetailScreen(initialPlace: place)
                                                } label: {
                                                    NativePlaceCard(place: place)
                                                }
                                                .buttonStyle(.plain)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            case .visited:
                if ownVisitedFeedItems.isEmpty {
                    emptyOwnProfileBlock("No visited places yet.")
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(ownVisitedFeedItems) { item in
                            NativeFeedCard(item: item)
                        }
                    }
                }
            case .collections:
                if appState.collections.isEmpty {
                    emptyOwnProfileBlock("No collections yet.")
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(appState.collections) { collection in
                            NavigationLink {
                                NativeCollectionDetailScreen(collection: collection)
                            } label: {
                                NativeCollectionCard(collection: collection)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func emptyOwnProfileBlock(_ text: String) -> some View {
        NativeSurfaceCard {
            Text(text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    private var savedCityGroups: [(city: String, places: [NativePlace])] {
        let grouped = Dictionary(grouping: appState.savedPlaces) { place in
            place.location
                .split(separator: ",")
                .first
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown city"
        }

        return grouped
            .map { key, value in
                (
                    city: key,
                    places: value.sorted {
                        ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    }
                )
            }
            .sorted { $0.city.localizedCaseInsensitiveCompare($1.city) == .orderedAscending }
    }

    private var ownVisitedFeedItems: [NativeFeedItem] {
        appState.ownFeedItemsCache.filter { $0.type == .visited }
    }

    private func toggleSavedCity(_ city: String) {
        if expandedSavedCities.contains(city) {
            expandedSavedCities.remove(city)
        } else {
            expandedSavedCities.insert(city)
        }
    }
}

private struct NativeFeedScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var isSuggestedDismissed = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 14) {
                    Text("Feed")
                        .font(.system(size: 32, weight: .black))
                        .foregroundStyle(.white)
                    Spacer(minLength: 0)
                    NavigationLink {
                        NativePeopleSearchScreen()
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 46, height: 46)
                            .background(nativeSurface)
                            .overlay(
                                Circle().stroke(nativeBorder, lineWidth: 1)
                            )
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }

                if appState.currentUser == nil {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Feed")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(.white.opacity(0.35))
                                .textCase(.uppercase)
                            Text("Log in to unlock your people feed.")
                                .font(.system(size: 20, weight: .black))
                                .foregroundStyle(.white)
                            Text("We only unlock following activity and taste-based people suggestions once your profile is attached to an account.")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.6))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if !isSuggestedDismissed && !appState.suggestedTravelers.isEmpty {
                    HStack {
                        NativeSectionTitle("Suggested people")
                        Spacer()
                        Button {
                            isSuggestedDismissed = true
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white.opacity(0.55))
                                .frame(width: 30, height: 30)
                                .background(Color.white.opacity(0.06))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(appState.suggestedTravelers.prefix(6)) { traveler in
                                NavigationLink {
                                    NativeTravelerProfileScreen(initialTraveler: traveler)
                                } label: {
                                    NativeSuggestedTravelerCard(traveler: traveler)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                if !appState.followedTravelers.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        NativeSectionTitle("People you follow")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 16) {
                                ForEach(appState.followedTravelers) { traveler in
                                    NavigationLink {
                                        NativeTravelerProfileScreen(initialTraveler: traveler)
                                    } label: {
                                        VStack(spacing: 8) {
                                            NativeAvatarCircle(
                                                url: traveler.avatar,
                                                fallbackText: traveler.displayName ?? traveler.username,
                                                size: 64,
                                                fontSize: 20
                                            )
                                            Text("@\(traveler.username)")
                                                .font(.system(size: 12, weight: .black))
                                                .foregroundStyle(.white.opacity(0.72))
                                                .lineLimit(1)
                                        }
                                        .frame(width: 84)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }

                if let feedErrorMessage = appState.feedErrorMessage {
                    NativeInlineError(message: feedErrorMessage)
                }

                if appState.currentUser != nil {
                    NativeSectionTitle("Following activity")
                }

                if appState.feedItems.isEmpty {
                    NativeSurfaceCard {
                        Text("No activity yet.")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(appState.feedItems) { item in
                            NativeFeedCard(item: item)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 132)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Feed")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarHidden(true)
        .refreshable {
            await appState.refreshFeed()
        }
    }
}

private struct NativeAvatarCircle: View {
    let url: String?
    let fallbackText: String
    let size: CGFloat
    let fontSize: CGFloat

    private var initials: String {
        let parts = fallbackText.split(separator: " ").prefix(2)
        let joined = parts.compactMap { $0.first }.map { String($0) }.joined()
        return joined.isEmpty ? "V" : joined.uppercased()
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.08))

            let resolvedUrl = nativeResolvedImageURL(url) ?? nativeAvatarFallbackURL(for: fallbackText)
            if let imageURL = URL(string: resolvedUrl) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure(_), .empty:
                        Text(initials)
                            .font(.system(size: fontSize, weight: .black))
                            .foregroundStyle(.white)
                    @unknown default:
                        Text(initials)
                            .font(.system(size: fontSize, weight: .black))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                Text(initials)
                    .font(.system(size: fontSize, weight: .black))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .overlay(
            Circle().stroke(nativeBorder, lineWidth: 1)
        )
        .clipShape(Circle())
    }
}

private struct NativePlaceRow: View {
    let place: NativePlace

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(place.name)
                .font(.system(size: 17, weight: .black))
            Text(place.location)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.secondary)
            if let hook = place.hook, !hook.isEmpty {
                Text(hook)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct NativePlaceCard: View {
    let place: NativePlace
    var isSelected = false

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                NativeRemoteImage(url: place.image)
                    .frame(height: 172)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                Text(place.name)
                    .font(.system(size: 19, weight: .black))
                    .foregroundStyle(.white)
                Text(place.location)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.55))
                if let hook = place.hook, !hook.isEmpty {
                    Text(hook)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(isSelected ? nativeAccent.opacity(0.6) : .clear, lineWidth: 1.5)
        )
    }
}

private struct NativeDiscoveryPlaceCard: View {
    @EnvironmentObject private var appState: NativeAppState
    let place: NativePlace
    let width: CGFloat
    let height: CGFloat
    let isBookmarked: Bool
    let isVisited: Bool
    let onSaveSwipe: () -> Void
    let onSkipSwipe: () -> Void
    let onDebugTap: (() -> Void)?
    @State private var dragOffset: CGFloat = 0
    @State private var isHorizontalDrag = false

    init(
        place: NativePlace,
        width: CGFloat,
        height: CGFloat,
        isBookmarked: Bool,
        isVisited: Bool,
        onSaveSwipe: @escaping () -> Void,
        onSkipSwipe: @escaping () -> Void,
        onDebugTap: (() -> Void)? = nil
    ) {
        self.place = place
        self.width = width
        self.height = height
        self.isBookmarked = isBookmarked
        self.isVisited = isVisited
        self.onSaveSwipe = onSaveSwipe
        self.onSkipSwipe = onSkipSwipe
        self.onDebugTap = onDebugTap
    }

    private var moodBadge: NativeMoodBadgeMeta {
        nativeDiscoveryMoodBadge(for: place)
    }

    private var compatibilityBadge: NativeCompatibilityBadgeMeta? {
        guard appState.currentUser != nil else { return nil }
        return nativeCompatibilityBadge(for: place.similarityStat)
    }

    private var bottomLabel: String {
        if let category = place.category, !category.isEmpty {
            return category.uppercased()
        }
        return moodBadge.label.uppercased()
    }

    private var distanceLabel: String? {
        guard
            let origin = appState.currentCoordinate,
            let latitude = place.latitude,
            let longitude = place.longitude
        else {
            return nil
        }

        let miles = nativeDistanceBetweenMiles(
            (latitude: origin.latitude, longitude: origin.longitude),
            (latitude: latitude, longitude: longitude)
        )

        if miles < 0.2 {
            return "Walkable"
        }

        return String(format: "%.1f mi away", miles)
    }

    private var debugBorderColor: Color {
        switch Int(height) {
        case 328: return .red
        case 416: return .green
        case 288: return .blue
        default: return .orange
        }
    }

    var body: some View {
        ZStack {
            NativeRemoteImage(url: place.image)
                .frame(width: width, height: height)
                .overlay(
                    LinearGradient(
                        colors: [Color.black.opacity(0.08), Color.black.opacity(0.18), Color.black.opacity(0.8)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
        .frame(width: width, height: height)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            if nativeDiscoveryLayoutDebugMode {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(debugBorderColor, lineWidth: 3)
            }
        }
        .overlay(alignment: .topLeading) {
            Group {
                if let compatibilityBadge {
                    Text(compatibilityBadge.label)
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(compatibilityBadge.foreground)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(compatibilityBadge.background)
                        .clipShape(Capsule())
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: moodBadge.icon)
                            .font(.system(size: 12, weight: .bold))
                        Text(moodBadge.label)
                            .font(.system(size: 11, weight: .black))
                    }
                    .foregroundStyle(moodBadge.foreground)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(moodBadge.background)
                    .clipShape(Capsule())
                }
            }
            .padding(.top, 12)
            .padding(.leading, 12)
        }
        .overlay(alignment: .topTrailing) {
            VStack(alignment: .trailing, spacing: 6) {
                if appState.currentUser != nil, let score = place.similarityStat {
                    Text("\(score)%")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.68))
                }
                if isBookmarked {
                    Text("Saved")
                        .font(.system(size: 10, weight: .black))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(.white)
                        .clipShape(Capsule())
                }
                if isVisited {
                    Text("Visited")
                        .font(.system(size: 10, weight: .black))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.black.opacity(0.72))
                        .clipShape(Capsule())
                }
            }
            .padding(.top, 12)
            .padding(.trailing, 12)
        }
        .overlay(alignment: .center) {
            if nativeDiscoveryLayoutDebugMode {
                VStack(spacing: 2) {
                    Text(place.name)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                    Text("tile h \(Int(height))")
                }
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .overlay(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 6) {
                Text(bottomLabel)
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(.white.opacity(0.88))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Color.white.opacity(0.12))
                    .clipShape(Capsule())

                if let distanceLabel {
                    Text(distanceLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.62))
                        .padding(.leading, 2)
                }
            }
            .padding(16)
        }
        .overlay(alignment: .bottomTrailing) {
            if let onDebugTap, nativeDiscoveryScoreDebugMode {
                Button(action: onDebugTap) {
                    Image(systemName: "ladybug.fill")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(.black)
                        .frame(width: 32, height: 32)
                        .background(nativeAccent)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(16)
            }
        }
        .overlay(alignment: .trailing) {
            if !nativeDiscoveryLayoutDebugMode && isHorizontalDrag && dragOffset > 48 {
                Text("Save")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(nativeAccent)
                    .clipShape(Capsule())
                    .padding(.trailing, 14)
            }
        }
        .overlay(alignment: .leading) {
            if !nativeDiscoveryLayoutDebugMode && isHorizontalDrag && dragOffset < -48 {
                Text("Skip")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(.white)
                    .clipShape(Capsule())
                    .padding(.leading, 14)
            }
        }
        .offset(x: dragOffset)
        .rotationEffect(.degrees(isHorizontalDrag ? Double(dragOffset / 26) : 0))
        .simultaneousGesture(
            DragGesture(minimumDistance: 28)
                .onChanged { value in
                    guard !nativeDiscoveryLayoutDebugMode else { return }
                    let horizontal = value.translation.width
                    let vertical = value.translation.height
                    let shouldSwipe = abs(horizontal) > max(44, abs(vertical) * 1.8)
                    isHorizontalDrag = shouldSwipe
                    if shouldSwipe {
                        dragOffset = horizontal
                    } else if dragOffset != 0 {
                        dragOffset = 0
                    }
                }
                .onEnded { value in
                    guard !nativeDiscoveryLayoutDebugMode else { return }
                    let horizontal = value.translation.width
                    let vertical = value.translation.height
                    let shouldSwipe = abs(horizontal) > max(44, abs(vertical) * 1.8)
                    if shouldSwipe && horizontal > 118 {
                        onSaveSwipe()
                    } else if shouldSwipe && horizontal < -118 {
                        onSkipSwipe()
                    }
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        dragOffset = 0
                        isHorizontalDrag = false
                    }
                }
        )
        .shadow(color: .black.opacity(0.28), radius: 18, x: 0, y: 12)
    }
}

private struct NativeCollectionCard: View {
    let collection: NativeCollection

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(collection.label)
                    .font(.system(size: 19, weight: .black))
                    .foregroundStyle(.white)
                Text("\(collection.places.count) places")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.55))

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(collection.places.prefix(4).enumerated()), id: \.offset) { _, place in
                            NativeRemoteImage(url: place.image)
                                .frame(width: 120, height: 90)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
            }
        }
    }
}

private struct NativeFeedCard: View {
    @EnvironmentObject private var appState: NativeAppState
    let item: NativeFeedItem
    @State private var vibed = false
    @State private var vibinCount = 0
    @State private var vibinScale: CGFloat = 1
    @State private var vibinRotation: Double = 0
    @State private var vibinFlash = false
    @State private var comments: [NativeComment] = []
    @State private var showCommentSheet = false
    @State private var commentDraft = ""
    @State private var isCommentsLoading = false
    @State private var commentsErrorMessage: String?
    @State private var showReportPostDialog = false
    @State private var showReportAccountDialog = false
    @State private var showBlockAccountDialog = false
    @State private var moderationAlertMessage = ""
    @State private var showModerationAlert = false

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 10) {
                    NavigationLink {
                        NativeTravelerProfileScreen(initialTraveler: item.traveler)
                    } label: {
                        NativeAvatarCircle(
                            url: item.traveler.avatar,
                            fallbackText: item.traveler.displayName ?? item.traveler.username,
                            size: 42,
                            fontSize: 15
                        )
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 4) {
                        NavigationLink {
                            NativeTravelerProfileScreen(initialTraveler: item.traveler)
                        } label: {
                            (
                                Text(item.traveler.displayName ?? item.traveler.username)
                                    .font(.system(size: 14, weight: .black))
                                    .foregroundColor(.white)
                                +
                                Text(" \(activityLabel)")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white.opacity(0.78))
                            )
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        .buttonStyle(.plain)

                        Text("@\(item.traveler.username) • \(displayTimestampLabel)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.4))
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: 8) {
                        Image(systemName: activityIcon)
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(.white.opacity(0.65))
                            .frame(width: 28, height: 28)
                            .background(Color.white.opacity(0.06))
                            .clipShape(Circle())

                        if appState.currentUser?.id != item.traveler.id {
                            Menu {
                                Button("Report post") {
                                    showReportPostDialog = true
                                }
                                Button("Report account") {
                                    showReportAccountDialog = true
                                }
                                Button(role: .destructive) {
                                    showBlockAccountDialog = true
                                } label: {
                                    Text("Block account")
                                }
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 14, weight: .black))
                                    .foregroundStyle(.white.opacity(0.72))
                                    .frame(width: 28, height: 28)
                                    .background(Color.white.opacity(0.06))
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let caption = item.caption, !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.82))
                        .fixedSize(horizontal: false, vertical: true)
                }

                if item.type == .visited, item.place?.momentRating != nil || item.place?.momentWouldRevisit != nil {
                    HStack(spacing: 8) {
                        if let rating = item.place?.momentRating {
                            NativeFeedMetaPill(
                                label: "Rating \(rating)/5",
                                foreground: .white.opacity(0.88),
                                background: Color.white.opacity(0.08)
                            )
                        }
                        if let wouldRevisit = item.place?.momentWouldRevisit {
                            NativeFeedMetaPill(
                                label: nativeRevisitLabel(wouldRevisit),
                                foreground: wouldRevisit == "yes" ? nativeAccent : .white.opacity(0.82),
                                background: wouldRevisit == "yes" ? nativeAccent.opacity(0.16) : Color.white.opacity(0.08)
                            )
                        }
                        Spacer(minLength: 0)
                    }
                }

                if let place = item.place {
                    NativeFeedPlaceAttachment(place: place, activityType: item.type) {
                        NativePlaceDetailScreen(initialPlace: place)
                    }
                }

                if let collection = item.collection {
                    NavigationLink {
                        NativeCollectionDetailScreen(
                            collection: collection,
                            ownerDisplayName: item.traveler.displayName ?? item.traveler.username,
                            ownerUsername: item.traveler.username
                        )
                    } label: {
                        NativeFeedCollectionAttachment(collection: collection)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 22) {
                    Button {
                        guard appState.currentUser != nil else {
                            appState.presentAuthGate(reason: "Log in to vibin with posts.")
                            return
                        }
                        if vibed {
                            vibed = false
                            vibinCount = max(0, vibinCount - 1)
                        } else {
                            vibed = true
                            vibinCount += 1
                        }
                        withAnimation(.spring(response: 0.22, dampingFraction: 0.52)) {
                            vibinScale = 1.22
                            vibinRotation = -10
                            vibinFlash = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            withAnimation(.spring(response: 0.24, dampingFraction: 0.76)) {
                                vibinScale = 1
                                vibinRotation = 8
                            }
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                                vibinRotation = 0
                                vibinFlash = false
                            }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            ZStack {
                                if vibinFlash {
                                    Image(systemName: "bolt.fill")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(nativeAccent.opacity(0.28))
                                        .scaleEffect(1.9)
                                        .blur(radius: 1.5)
                                }

                                Image(systemName: vibed ? "bolt.fill" : "bolt")
                                    .font(.system(size: 14, weight: .bold))
                            }
                            Text("\(vibinCount)")
                                .font(.system(size: 13, weight: .black))
                        }
                        .foregroundStyle(vibed ? nativeAccent : .white.opacity(0.72))
                        .scaleEffect(vibinScale)
                        .rotationEffect(.degrees(vibinRotation))
                    }
                    .buttonStyle(.plain)

                    Button {
                        showCommentSheet = true
                        Task {
                            await loadComments()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "bubble.right")
                                .font(.system(size: 14, weight: .bold))
                            Text("\(comments.count)")
                                .font(.system(size: 13, weight: .black))
                        }
                        .foregroundStyle(.white.opacity(0.72))
                    }
                    .buttonStyle(.plain)

                    Spacer()
                }
            }
        }
        .sheet(isPresented: $showCommentSheet) {
            NativeCommentSheet(
                itemTitle: item.collection?.label ?? item.place?.name ?? "Post",
                commentDraft: $commentDraft,
                comments: $comments,
                isLoading: isCommentsLoading,
                errorMessage: commentsErrorMessage
            ) {
                Task {
                    await postComment()
                }
            }
        }
        .confirmationDialog("Report post", isPresented: $showReportPostDialog, titleVisibility: .visible) {
            ForEach(NativeReportReason.allCases) { reason in
                Button(reason.rawValue) {
                    Task { await reportPost(reason) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the reason that best describes this content.")
        }
        .confirmationDialog("Report account", isPresented: $showReportAccountDialog, titleVisibility: .visible) {
            ForEach(NativeReportReason.allCases) { reason in
                Button(reason.rawValue) {
                    Task { await reportAccount(reason) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the reason that best describes this account.")
        }
        .confirmationDialog("Block account?", isPresented: $showBlockAccountDialog, titleVisibility: .visible) {
            Button("Block \(item.traveler.username)", role: .destructive) {
                Task { await blockAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will no longer see posts or profile activity from this account.")
        }
        .alert("Done", isPresented: $showModerationAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(moderationAlertMessage)
        }
    }

    private var activityLabel: String {
        switch item.type {
        case .saved:
            return "saved a place"
        case .visited:
            return "visited a place"
        case .collection:
            return "created a collection"
        }
    }

    private var activityIcon: String {
        switch item.type {
        case .saved:
            return "bookmark"
        case .visited:
            return "mappin.and.ellipse"
        case .collection:
            return "square.stack.3d.up"
        }
    }

    private var displayTimestampLabel: String {
        item.timestampLabel.replacingOccurrences(of: ". ago", with: " ago")
    }

    private func nativeRevisitLabel(_ value: String) -> String {
        switch value {
        case "yes":
            return "Would revisit"
        case "not_sure":
            return "Maybe revisit"
        case "not_interested":
            return "No revisit"
        default:
            return value.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private var commentTargetType: String? {
        if item.collection != nil { return "COLLECTION" }
        guard let place = item.place else { return nil }
        return place.momentId != nil ? "MOMENT" : "PLACE"
    }

    private var commentTargetId: String? {
        if let collection = item.collection { return collection.id }
        guard let place = item.place else { return nil }
        return place.momentId ?? place.id
    }

    private func loadComments() async {
        guard let targetType = commentTargetType, let targetId = commentTargetId else { return }
        isCommentsLoading = true
        commentsErrorMessage = nil
        do {
            comments = try await appState.fetchComments(targetType: targetType, targetId: targetId)
        } catch {
            commentsErrorMessage = "Could not load comments right now."
        }
        isCommentsLoading = false
    }

    private func postComment() async {
        guard let targetType = commentTargetType, let targetId = commentTargetId else { return }
        let trimmed = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let newComment = try await appState.createComment(
                targetType: targetType,
                targetId: targetId,
                body: trimmed,
                momentId: item.place?.momentId
            )
            comments.insert(newComment, at: 0)
            commentDraft = ""
            commentsErrorMessage = nil
        } catch {
            commentsErrorMessage = "Could not post comment right now."
        }
    }

    private var reportPostTargetType: String? {
        if item.collection != nil { return "COLLECTION" }
        guard let place = item.place else { return nil }
        return place.momentId != nil ? "MOMENT" : "PLACE"
    }

    private var reportPostTargetId: String? {
        if let collection = item.collection { return collection.id }
        guard let place = item.place else { return nil }
        return place.momentId ?? place.id
    }

    private func reportPost(_ reason: NativeReportReason) async {
        guard let targetType = reportPostTargetType, let targetId = reportPostTargetId else { return }
        do {
            try await appState.reportTarget(
                targetType: targetType,
                targetId: targetId,
                targetUserId: item.traveler.id,
                reason: reason
            )
            moderationAlertMessage = "Thanks. This post has been reported."
            showModerationAlert = true
        } catch {
            moderationAlertMessage = "Could not report this post right now."
            showModerationAlert = true
        }
    }

    private func reportAccount(_ reason: NativeReportReason) async {
        do {
            try await appState.reportTarget(
                targetType: "PROFILE",
                targetId: item.traveler.id,
                targetUserId: item.traveler.id,
                reason: reason
            )
            moderationAlertMessage = "Thanks. This account has been reported."
            showModerationAlert = true
        } catch {
            moderationAlertMessage = "Could not report this account right now."
            showModerationAlert = true
        }
    }

    private func blockAccount() async {
        do {
            try await appState.blockTraveler(item.traveler)
            moderationAlertMessage = "This account has been blocked."
            showModerationAlert = true
        } catch {
            moderationAlertMessage = "Could not block this account right now."
            showModerationAlert = true
        }
    }
}

private struct NativeFeedMetaPill: View {
    let label: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(label)
            .font(.system(size: 11, weight: .black))
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(background)
            .clipShape(Capsule())
    }
}

private struct NativeCommentSheet: View {
    let itemTitle: String
    @Binding var commentDraft: String
    @Binding var comments: [NativeComment]
    let isLoading: Bool
    let errorMessage: String?
    let onPost: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Comment")
                            .font(.system(size: 20, weight: .black))
                            .foregroundStyle(.white)
                        Text(itemTitle)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white.opacity(0.45))
                            .lineLimit(1)
                    }
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(width: 30, height: 30)
                            .background(Color.white.opacity(0.08))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }

                if isLoading {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.04))
                        .overlay {
                            ProgressView()
                                .tint(nativeAccent)
                        }
                        .frame(height: 76)
                } else if let errorMessage {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.04))
                        .overlay {
                            Text(errorMessage)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.55))
                                .padding(.horizontal, 16)
                        }
                        .frame(height: 76)
                } else if comments.isEmpty {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.04))
                        .overlay {
                            Text("No comments yet.")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .frame(height: 76)
                } else {
                    ScrollView(showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(comments.enumerated()), id: \.offset) { _, comment in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("@\(comment.user)")
                                        .font(.system(size: 12, weight: .black))
                                        .foregroundStyle(.white)
                                    Text(comment.body)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.82))
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(NativeAppState.relativeLabel(from: comment.createdAt))
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.32))
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(Color.white.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                        }
                    }
                    .frame(maxHeight: 160)
                }

                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(nativeSurfaceStrong)
                    if commentDraft.isEmpty {
                        Text("Write a comment")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.35))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                    }
                    TextEditor(text: $commentDraft)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .frame(minHeight: 72, maxHeight: 72)
                        .background(Color.clear)
                }
                .frame(minHeight: 72, maxHeight: 72)

                HStack {
                    Spacer()
                    Button {
                        onPost()
                    } label: {
                        Text("Post")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(nativeAccent)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 12)
        }
    }
}

private struct NativeFeedPlaceAttachment: View {
    let place: NativePlace
    let activityType: NativeFeedActivityType
    let destination: () -> NativePlaceDetailScreen

    private var mediaUrls: [String] {
        let urls = (place.images ?? []).filter { !$0.isEmpty }
        if !urls.isEmpty { return urls }
        if let image = place.image, !image.isEmpty { return [image] }
        return []
    }

    var body: some View {
        NavigationLink {
            destination()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                if activityType == .visited {
                    NativeFeedMediaScroller(urls: mediaUrls)
                } else {
                    NativeFeedSingleMedia(url: mediaUrls.first)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(place.name)
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(.white)
                                .fixedSize(horizontal: false, vertical: true)
                            if let category = place.category, !category.isEmpty {
                                Text(category.uppercased())
                                    .font(.system(size: 10, weight: .black))
                                    .foregroundStyle(.white.opacity(0.55))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.white.opacity(0.08))
                                    .clipShape(Capsule())
                            }
                        }
                        Spacer(minLength: 0)
                        if let score = place.similarityStat {
                            Text("\(score)%")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(nativeAccent)
                        }
                    }

                    if let hook = place.hook, !hook.isEmpty {
                        Text(hook)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 12)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct NativeFeedSingleMedia: View {
    let url: String?

    private var isVideoAsset: Bool {
        guard let url else { return false }
        let lowercased = url.lowercased()
        return lowercased.contains(".mov") || lowercased.contains(".mp4") || lowercased.contains(".m4v") || lowercased.contains(".webm")
    }

    var body: some View {
        Group {
            if isVideoAsset {
                NativeVideoPreview(url: url, isActive: true)
            } else {
                NativeRemoteImage(url: url)
            }
        }
        .frame(height: 190)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(nativeBorder, lineWidth: 1)
        )
    }
}

private struct NativeFeedMediaScroller: View {
    let urls: [String]
    @State private var activeIndex = 0

    var body: some View {
        VStack(spacing: 10) {
            TabView(selection: $activeIndex) {
                ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                    NativeFeedMediaSlide(url: url, isActive: activeIndex == index)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .tag(index)
                }
            }
            .frame(height: 300)
            .tabViewStyle(.page(indexDisplayMode: .never))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(nativeBorder, lineWidth: 1)
            )

            if urls.count > 1 {
                HStack(spacing: 6) {
                    ForEach(Array(urls.enumerated()), id: \.offset) { index, _ in
                        Capsule()
                            .fill(index == activeIndex ? Color.white : Color.white.opacity(0.18))
                            .frame(width: index == activeIndex ? 26 : 8, height: 4)
                            .animation(.easeInOut(duration: 0.2), value: activeIndex)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 2)
            }
        }
    }
}

private struct NativeFeedMediaSlide: View {
    let url: String
    let isActive: Bool

    private var isVideoAsset: Bool {
        let lowercased = url.lowercased()
        return lowercased.contains(".mov") || lowercased.contains(".mp4") || lowercased.contains(".m4v") || lowercased.contains(".webm")
    }

    var body: some View {
        Group {
            if isVideoAsset {
                NativeVideoPreview(url: url, isActive: isActive)
            } else {
                NativeFlexibleRemoteImage(url: url)
            }
        }
        .background(Color.black)
    }
}

private struct NativeFlexibleRemoteImage: View {
    let url: String?

    var body: some View {
        AsyncImage(url: nativeResolvedImageURL(url).flatMap(URL.init(string:))) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            case .failure(_):
                fallback
            case .empty:
                ZStack {
                    fallback
                    ProgressView().tint(nativeAccent)
                }
            @unknown default:
                fallback
            }
        }
    }

    private var fallback: some View {
        LinearGradient(
            colors: [Color.white.opacity(0.08), Color.white.opacity(0.03)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct NativeVideoPreview: View {
    let url: String?
    let isActive: Bool
    @State private var player: AVPlayer? = nil
    @State private var isMuted = true
    @State private var endObserver: NSObjectProtocol? = nil

    var body: some View {
        ZStack {
            if let resolved = nativeResolvedImageURL(url), let videoURL = URL(string: resolved) {
                NativeInlineVideoPlayer(player: player)
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
                    .onAppear {
                        if player == nil {
                            let avPlayer = AVPlayer(url: videoURL)
                            avPlayer.isMuted = isMuted
                            avPlayer.actionAtItemEnd = .none
                            endObserver = NotificationCenter.default.addObserver(
                                forName: .AVPlayerItemDidPlayToEndTime,
                                object: avPlayer.currentItem,
                                queue: .main
                            ) { _ in
                                avPlayer.seek(to: .zero)
                                avPlayer.playImmediately(atRate: 1.0)
                            }
                            if isActive {
                                avPlayer.playImmediately(atRate: 1.0)
                            }
                            player = avPlayer
                        } else {
                            player?.isMuted = isMuted
                            if isActive {
                                player?.playImmediately(atRate: 1.0)
                            } else {
                                player?.pause()
                            }
                        }
                    }
                    .onChange(of: isMuted) { newValue in
                        player?.isMuted = newValue
                    }
                    .onChange(of: isActive) { newValue in
                        if newValue {
                            player?.playImmediately(atRate: 1.0)
                        } else {
                            player?.pause()
                        }
                    }
                    .onDisappear {
                        player?.pause()
                        if let endObserver {
                            NotificationCenter.default.removeObserver(endObserver)
                            self.endObserver = nil
                        }
                    }
            } else {
                LinearGradient(
                    colors: [Color.white.opacity(0.08), Color.white.opacity(0.03)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

        }
        .overlay(alignment: .bottomTrailing) {
            if player != nil {
                Button {
                    isMuted.toggle()
                } label: {
                    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Color.black.opacity(0.6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(12)
            }
        }
        .clipped()
    }
}

private struct NativeInlineVideoPlayer: UIViewRepresentable {
    let player: AVPlayer?

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .black
        container.isUserInteractionEnabled = false

        let playerLayer = AVPlayerLayer()
        playerLayer.videoGravity = .resizeAspect
        playerLayer.player = player
        playerLayer.frame = container.bounds
        container.layer.addSublayer(playerLayer)

        context.coordinator.playerLayer = playerLayer
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.playerLayer?.player = player
        context.coordinator.playerLayer?.frame = uiView.bounds
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator {
        var playerLayer: AVPlayerLayer?
    }
}

private struct NativeShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct NativeFeedCollectionAttachment: View {
    let collection: NativeCollection

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GeometryReader { proxy in
                let width = proxy.size.width
                let tileGap: CGFloat = 6
                let tileWidth = max(0, (width - tileGap) / 2)

                VStack(spacing: tileGap) {
                    HStack(spacing: tileGap) {
                        collectionTile(at: 0, size: tileWidth)
                        collectionTile(at: 1, size: tileWidth)
                    }
                    HStack(spacing: tileGap) {
                        collectionTile(at: 2, size: tileWidth)
                        collectionTile(at: 3, size: tileWidth)
                    }
                }
            }
            .frame(height: 212)

            Text(collection.label)
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(collection.places.count) places")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    @ViewBuilder
    private func collectionTile(at index: Int, size: CGFloat) -> some View {
        if index < collection.places.count {
            NativeRemoteImage(url: collection.places[index].image)
                .frame(width: size, height: 103)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .frame(width: size, height: 103)
        }
    }
}

private struct NativeSuggestedTravelerCard: View {
    @EnvironmentObject private var appState: NativeAppState
    let traveler: NativeTravelerSummary

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    NativeAvatarCircle(
                        url: traveler.avatar,
                        fallbackText: traveler.displayName ?? traveler.username,
                        size: 52,
                        fontSize: 18
                    )

                    VStack(alignment: .leading, spacing: 3) {
                        Text(traveler.displayName ?? traveler.username)
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        Text("@\(traveler.username)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.45))
                            .lineLimit(1)
                    }
                }

                if let descriptor = traveler.descriptor, !descriptor.isEmpty {
                    Text(descriptor)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(3)
                }

                HStack {
                    Text("\(traveler.matchScore ?? 0)% match")
                        .font(.system(size: 10, weight: .black))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(nativeAccent)
                        .clipShape(Capsule())
                    Spacer()
                    Button {
                        Task { _ = try? await appState.toggleFollow(for: traveler) }
                    } label: {
                        Text(appState.isFollowing(traveler.id) ? "Following" : "Follow")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(appState.isFollowing(traveler.id) ? .white : .black)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(appState.isFollowing(traveler.id) ? Color.white.opacity(0.08) : Color.white)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 8) {
                    travelerStat(value: traveler.visitedPlacesCount ?? traveler.travelHistory.flatMap(\.places).count, label: "Visited")
                    travelerStat(value: traveler.savedPlacesCount ?? traveler.recentSavedPlaces?.count ?? 0, label: "Saved")
                    travelerStat(value: traveler.collectionsCount ?? traveler.recentCollections?.count ?? 0, label: "Lists")
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(previewImageUrls.prefix(5).enumerated()), id: \.offset) { _, url in
                            NativeRemoteImage(url: url)
                                .frame(width: 76, height: 94)
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                    }
                }
            }
            .frame(width: 304, height: 330, alignment: .topLeading)
        }
    }

    private var previewImageUrls: [String] {
        let visited = traveler.travelHistory
            .flatMap(\.places)
            .compactMap(\.image)
        let saved = (traveler.recentSavedPlaces ?? [])
            .compactMap { $0.place.image }
        var seen = Set<String>()
        return (visited + saved).filter { url in
            guard !url.isEmpty, !seen.contains(url) else { return false }
            seen.insert(url)
            return true
        }
    }

    @ViewBuilder
    private func travelerStat(value: Int, label: String) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 10, weight: .black))
                .foregroundStyle(.white.opacity(0.35))
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.2))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct NativePeopleSearchScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var query = ""
    @State private var results: [NativeTravelerSummary] = []
    @State private var isSearching = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                NativeScreenHeader(
                    title: "Search people",
                    subtitle: "Find people whose travel taste feels close to yours."
                )

                NativeSurfaceCard {
                    VStack(spacing: 12) {
                        TextField("Search username or name", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(size: 17, weight: .medium))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 16)
                            .background(nativeSurfaceStrong)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                        Button {
                            Task {
                                await performSearch()
                            }
                        } label: {
                            HStack {
                                Spacer()
                                if isSearching {
                                    ProgressView().tint(.black)
                                } else {
                                    Text("Search")
                                        .font(.system(size: 15, weight: .black))
                                }
                                Spacer()
                            }
                            .padding(.vertical, 14)
                            .background(nativeAccent)
                            .foregroundStyle(.black)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || isSearching)
                    }
                }

                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    if let errorMessage {
                        NativeInlineError(message: errorMessage)
                    } else if results.isEmpty && !isSearching {
                        NativeSurfaceCard {
                            Text("No people match that search yet.")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(results) { traveler in
                                NavigationLink {
                                    NativeTravelerProfileScreen(initialTraveler: traveler)
                                } label: {
                                    NativeTravelerSearchRow(traveler: traveler)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func performSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return }
        isSearching = true
        errorMessage = nil
        defer { isSearching = false }

        do {
            results = try await appState.searchTravelers(query: trimmed)
        } catch {
            errorMessage = "Could not search people right now."
        }
    }
}

private struct NativeTravelerSearchRow: View {
    let traveler: NativeTravelerSummary

    var body: some View {
        NativeSurfaceCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    Circle()
                        .fill(nativeSurfaceStrong)
                        .frame(width: 44, height: 44)
                        .overlay(
                            Text(String((traveler.displayName ?? traveler.username).prefix(1)).uppercased())
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(.white.opacity(0.82))
                        )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(traveler.displayName ?? traveler.username)
                            .font(.system(size: 17, weight: .black))
                            .foregroundStyle(.white)
                        Text("@\(traveler.username)")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white.opacity(0.5))
                    }

                    Spacer()

                    if let match = traveler.matchScore {
                        Text("\(match)%")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(nativeAccent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(nativeAccent.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }

                if let descriptor = traveler.descriptor, !descriptor.isEmpty {
                    Text(descriptor)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 12) {
                    Text("\(traveler.savedPlacesCount ?? 0) saved")
                    Text("\(traveler.collectionsCount ?? 0) lists")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white.opacity(0.42))
            }
        }
    }
}

private struct NativeFollowersScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    let traveler: NativeTravelerSummary
    @State private var followers: [NativeFollowerListItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    NativeInlineError(message: errorMessage)
                }

                if isLoading && followers.isEmpty {
                    NativeSurfaceCard {
                        HStack {
                            ProgressView().tint(nativeAccent)
                            Text("Loading followers")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.64))
                        }
                    }
                } else if followers.isEmpty {
                    NativeSurfaceCard {
                        Text("No followers visible right now.")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(followers) { follower in
                            NativeFollowerRow(follower: follower)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Followers")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            appState.pushFloatingTabBarHidden()
        }
        .onDisappear {
            appState.popFloatingTabBarHidden()
        }
        .task {
            guard !isLoading else { return }
            isLoading = true
            defer { isLoading = false }

            do {
                followers = try await appState.fetchTravelerFollowers(id: traveler.id)
            } catch {
                errorMessage = "Could not load followers right now."
            }
        }
    }
}

private struct NativeFollowerRow: View {
    @EnvironmentObject private var appState: NativeAppState
    let follower: NativeFollowerListItem
    @State private var isTogglingFollow = false

    private var isCurrentUser: Bool {
        appState.currentUser?.id == follower.id
    }

    var body: some View {
        HStack(spacing: 12) {
            NavigationLink {
                NativeTravelerProfileScreen(
                    initialTraveler: NativeTravelerSummary(
                        id: follower.id,
                        username: follower.username,
                        displayName: follower.displayName,
                        avatar: follower.avatar,
                        bio: nil,
                        descriptor: nil,
                        matchScore: follower.matchScore,
                        followersCount: nil,
                        recentSavedPlaces: nil,
                        recentCollections: nil,
                        travelHistory: [],
                        visitedPlacesCount: nil,
                        savedPlacesCount: nil,
                        collectionsCount: nil
                    )
                )
            } label: {
                HStack(spacing: 12) {
                    NativeAvatarCircle(
                        url: follower.avatar,
                        fallbackText: follower.displayName ?? follower.username,
                        size: 46,
                        fontSize: 16
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(follower.displayName ?? follower.username)
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text("@\(follower.username)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.46))
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let matchScore = follower.matchScore {
                Text("\(matchScore)%")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(nativeAccent)
            }

            if !isCurrentUser {
                Button {
                    Task {
                        isTogglingFollow = true
                        _ = try? await appState.toggleFollowQuietly(
                            for: NativeTravelerSummary(
                                id: follower.id,
                                username: follower.username,
                                displayName: follower.displayName,
                                avatar: follower.avatar,
                                bio: nil,
                                descriptor: nil,
                                matchScore: follower.matchScore,
                                followersCount: nil,
                                recentSavedPlaces: nil,
                                recentCollections: nil,
                                travelHistory: [],
                                visitedPlacesCount: nil,
                                savedPlacesCount: nil,
                                collectionsCount: nil
                            )
                        )
                        isTogglingFollow = false
                    }
                } label: {
                    Text(appState.isFollowing(follower.id) ? "Unfollow" : "Follow")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(appState.isFollowing(follower.id) ? .white : .black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(appState.isFollowing(follower.id) ? Color.white.opacity(0.08) : nativeAccent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isTogglingFollow)
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct NativeTravelerProfileScreen: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: NativeAppState
    @State private var traveler: NativeTravelerSummary
    @State private var bookmarks: [NativePlace] = []
    @State private var collections: [NativeCollection] = []
    @State private var activeSection: NativeProfileSection = .feed
    @State private var expandedSavedCities: Set<String> = []
    @State private var isLoading = false
    @State private var isTogglingFollow = false
    @State private var showShareSheet = false
    @State private var showTravelerScoreDebug = false
    @State private var showReportAccountDialog = false
    @State private var showBlockAccountDialog = false
    @State private var moderationAlertMessage = ""
    @State private var showModerationAlert = false
    @State private var errorMessage: String?

    init(initialTraveler: NativeTravelerSummary) {
        _traveler = State(initialValue: initialTraveler)
        _bookmarks = State(initialValue: (initialTraveler.recentSavedPlaces ?? []).map(\.place))
        _collections = State(initialValue: initialTraveler.recentCollections ?? [])
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 16, pinnedViews: [.sectionHeaders]) {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 14) {
                            NativeAvatarCircle(
                                url: traveler.avatar,
                                fallbackText: traveler.displayName ?? traveler.username,
                                size: 60,
                                fontSize: 21
                            )

                        VStack(alignment: .leading, spacing: 6) {
                                Text(traveler.displayName ?? traveler.username)
                                    .font(.system(size: 22, weight: .black))
                                    .foregroundStyle(.white)
                                    .fixedSize(horizontal: false, vertical: true)

                                if let bio = traveler.bio, !bio.isEmpty {
                                    Text(bio)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.56))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }

                        HStack(spacing: 6) {
                            if let matchScore = traveler.matchScore {
                                NativeProfileMetaPill(
                                    label: "\(matchScore)% match",
                                    foreground: nativeAccent,
                                    background: nativeAccent.opacity(0.14)
                                )
                            }

                            if let followersCount = traveler.followersCount {
                                NavigationLink {
                                    NativeFollowersScreen(traveler: traveler)
                                } label: {
                                    NativeProfileMetaPill(
                                        label: "\(followersCount) followers",
                                        foreground: .white.opacity(0.84),
                                        background: Color.white.opacity(0.08)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    HStack(spacing: 12) {
                        Button {
                            activeSection = .saved
                        } label: {
                            NativeProfileMiniStat(label: "Saved", value: "\(traveler.savedPlacesCount ?? bookmarks.count)")
                        }
                        .buttonStyle(.plain)
                        Button {
                            activeSection = .visited
                        } label: {
                            NativeProfileMiniStat(
                                label: "Visited",
                                value: "\(traveler.visitedPlacesCount ?? traveler.travelHistory.flatMap(\.places).filter { $0.visitedDate != nil }.count)"
                            )
                        }
                        .buttonStyle(.plain)
                        Button {
                            activeSection = .collections
                        } label: {
                            NativeProfileMiniStat(label: "Lists", value: "\(traveler.collectionsCount ?? collections.count)")
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: .infinity)

                    if let descriptor = traveler.descriptor, !descriptor.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Travel taste")
                                .font(.system(size: 9, weight: .black))
                                .foregroundStyle(nativeAccent.opacity(0.82))
                                .textCase(.uppercase)
                            Text(descriptor)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white.opacity(0.72))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            nativeAccent.opacity(0.05),
                                            Color(red: 24 / 255, green: 26 / 255, blue: 31 / 255).opacity(0.86)
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(nativeAccent.opacity(0.1), lineWidth: 1)
                        )
                    }

                    HStack(spacing: 10) {
                        Button {
                            Task {
                                await toggleFollow()
                            }
                        } label: {
                            HStack {
                                Spacer()
                                if isTogglingFollow {
                                    ProgressView().tint(appState.isFollowing(traveler.id) ? .white : .black)
                                } else {
                                    Text(appState.isFollowing(traveler.id) ? "Unfollow" : "Follow")
                                        .font(.system(size: 14, weight: .black))
                                }
                                Spacer()
                            }
                            .padding(.vertical, 12)
                            .background(appState.isFollowing(traveler.id) ? Color.white.opacity(0.08) : nativeAccent)
                            .foregroundStyle(appState.isFollowing(traveler.id) ? .white : .black)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(isTogglingFollow)

                        Button {
                            showShareSheet = true
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 15, weight: .black))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(Color.white.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)

                        if nativeTravelerScoreDebugMode {
                            Button {
                                showTravelerScoreDebug = true
                            } label: {
                                Image(systemName: "ladybug.fill")
                                    .font(.system(size: 15, weight: .black))
                                    .foregroundStyle(.black)
                                    .frame(width: 44, height: 44)
                                    .background(nativeAccent)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }

                        Menu {
                            Button("Report account") {
                                showReportAccountDialog = true
                            }
                            Button(role: .destructive) {
                                showBlockAccountDialog = true
                            } label: {
                                Text("Block account")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 15, weight: .black))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(Color.white.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, nativeTravelerProfileHorizontalPadding)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(nativeProfileHeaderFill)

                Section {
                    VStack(alignment: .leading, spacing: 18) {
                        if let errorMessage {
                            NativeInlineError(message: errorMessage)
                        }

                        travelerSectionContent
                    }
                    .id(activeSection)
                    .padding(.horizontal, nativeTravelerProfileHorizontalPadding)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
                } header: {
                    NativeProfileTabs(activeSection: $activeSection)
                }
            }
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("@\(traveler.username)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadTravelerProfile()
        }
        .onAppear {
            appState.pushFloatingTabBarHidden()
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(red: 16 / 255, green: 16 / 255, blue: 19 / 255, alpha: 0.98)
            appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
            appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
            UINavigationBar.appearance().compactAppearance = appearance
        }
        .onDisappear {
            appState.popFloatingTabBarHidden()
        }
        .sheet(isPresented: $showShareSheet) {
            NativeShareSheet(items: ["https://vibinn.club/u/\(traveler.username)"])
        }
        .sheet(isPresented: $showTravelerScoreDebug) {
            NavigationView {
                NativeTravelerScoreDebugSheet(traveler: traveler)
            }
            .navigationViewStyle(.stack)
        }
        .confirmationDialog("Report account", isPresented: $showReportAccountDialog, titleVisibility: .visible) {
            ForEach(NativeReportReason.allCases) { reason in
                Button(reason.rawValue) {
                    Task { await reportAccount(reason) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the reason that best describes this account.")
        }
        .confirmationDialog("Block account?", isPresented: $showBlockAccountDialog, titleVisibility: .visible) {
            Button("Block \(traveler.username)", role: .destructive) {
                Task { await blockAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will no longer see this account or their feed activity.")
        }
        .alert("Done", isPresented: $showModerationAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(moderationAlertMessage)
        }
    }

    @ViewBuilder
    private var travelerSectionContent: some View {
        switch activeSection {
        case .feed:
            if travelerFeedItems.isEmpty {
                emptyTravelerBlock("Their latest activity will show up here.")
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(travelerFeedItems) { item in
                        NativeFeedCard(item: item)
                    }
                }
            }
        case .saved:
            if bookmarks.isEmpty {
                emptyTravelerBlock("No saved places are visible right now.")
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(savedCityGroups, id: \.city) { group in
                        NativeSurfaceCard {
                            VStack(alignment: .leading, spacing: 14) {
                                Button {
                                    toggleSavedCity(group.city)
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(group.city)
                                                .font(.system(size: 18, weight: .black))
                                                .foregroundStyle(.white)
                                            Text("\(group.places.count) places")
                                                .font(.system(size: 12, weight: .bold))
                                                .foregroundStyle(.white.opacity(0.45))
                                        }
                                        Spacer()
                                        Image(systemName: expandedSavedCities.contains(group.city) ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 14, weight: .black))
                                            .foregroundStyle(.white.opacity(0.7))
                                    }
                                }
                                .buttonStyle(.plain)

                                if expandedSavedCities.contains(group.city) {
                                    VStack(spacing: 12) {
                                        ForEach(group.places) { place in
                                            NavigationLink {
                                                NativePlaceDetailScreen(initialPlace: place)
                                            } label: {
                                                NativePlaceCard(place: place)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        case .visited:
            if travelerVisitedFeedItems.isEmpty {
                emptyTravelerBlock("No visited places are visible right now.")
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(travelerVisitedFeedItems) { item in
                        NativeFeedCard(item: item)
                    }
                }
            }
        case .collections:
            if collections.isEmpty {
                emptyTravelerBlock("No public collections yet.")
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(collections) { collection in
                        NavigationLink {
                            NativeCollectionDetailScreen(
                                collection: collection,
                                ownerDisplayName: traveler.displayName ?? traveler.username,
                                ownerUsername: traveler.username
                            )
                        } label: {
                            NativeCollectionCard(collection: collection)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func emptyTravelerBlock(_ text: String) -> some View {
        NativeSurfaceCard {
            Text(text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    private var travelerFeedItems: [NativeFeedItem] {
        var items: [NativeFeedItem] = []

        for saved in traveler.recentSavedPlaces ?? [] {
            items.append(
                NativeFeedItem(
                    id: "saved-\(traveler.id)-\(saved.place.id)",
                    type: .saved,
                    traveler: traveler,
                    title: "",
                    timestampLabel: saved.savedAtLabel,
                    sortTimestamp: NativeAppState.feedSortDate(iso: saved.savedAtIso, label: saved.savedAtLabel) ?? .distantPast,
                    place: saved.place,
                    collection: nil,
                    caption: nil
                )
            )
        }

        for history in traveler.travelHistory {
            for place in history.places where place.visitedDate != nil {
                items.append(
                    NativeFeedItem(
                        id: "visited-\(traveler.id)-\(place.momentId ?? place.id)",
                        type: .visited,
                        traveler: traveler,
                        title: "",
                        timestampLabel: NativeAppState.relativeLabel(from: place.visitedDate),
                        sortTimestamp: NativeAppState.feedSortDate(iso: place.visitedAtIso ?? place.visitedDate, label: NativeAppState.relativeLabel(from: place.visitedDate)) ?? .distantPast,
                        place: place,
                        collection: nil,
                        caption: place.momentCaption
                    )
                )
            }
        }

        for collection in collections {
            items.append(
                NativeFeedItem(
                    id: "collection-\(traveler.id)-\(collection.id)",
                    type: .collection,
                    traveler: traveler,
                    title: "",
                    timestampLabel: NativeAppState.relativeLabel(from: collection.createdAt),
                    sortTimestamp: NativeAppState.date(from: collection.createdAt) ?? .distantPast,
                    place: nil,
                    collection: collection,
                    caption: nil
                )
            )
        }

        return items.sorted { $0.sortTimestamp > $1.sortTimestamp }
    }

    private var travelerVisitedFeedItems: [NativeFeedItem] {
        travelerFeedItems.filter { $0.type == .visited }
    }

    private var savedCityGroups: [(city: String, places: [NativePlace])] {
        let grouped = Dictionary(grouping: bookmarks) { place in
            place.location
                .split(separator: ",")
                .first
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown city"
        }

        return grouped
            .map { key, value in
                (
                    city: key,
                    places: value.sorted {
                        ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    }
                )
            }
            .sorted { $0.city.localizedCaseInsensitiveCompare($1.city) == .orderedAscending }
    }

    private func loadTravelerProfile() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await appState.fetchTravelerProfile(id: traveler.id)
            traveler = response.traveler
            bookmarks = response.bookmarks
            collections = response.collections
        } catch {
            errorMessage = "Could not load this profile right now."
        }
    }

    private func toggleSavedCity(_ city: String) {
        if expandedSavedCities.contains(city) {
            expandedSavedCities.remove(city)
        } else {
            expandedSavedCities.insert(city)
        }
    }

    private func toggleFollow() async {
        errorMessage = nil
        isTogglingFollow = true
        defer { isTogglingFollow = false }

        do {
            let result = try await appState.toggleFollowQuietly(for: traveler)
            traveler = NativeTravelerSummary(
                id: traveler.id,
                username: traveler.username,
                displayName: traveler.displayName,
                avatar: traveler.avatar,
                bio: traveler.bio,
                descriptor: traveler.descriptor,
                matchScore: traveler.matchScore,
                followersCount: result.followersCount,
                recentSavedPlaces: traveler.recentSavedPlaces,
                recentCollections: traveler.recentCollections,
                travelHistory: traveler.travelHistory,
                visitedPlacesCount: traveler.visitedPlacesCount,
                savedPlacesCount: traveler.savedPlacesCount,
                collectionsCount: traveler.collectionsCount
            )
        } catch {
            errorMessage = "Could not update follow right now."
        }
    }

    private func reportAccount(_ reason: NativeReportReason) async {
        do {
            try await appState.reportTarget(
                targetType: "PROFILE",
                targetId: traveler.id,
                targetUserId: traveler.id,
                reason: reason
            )
            moderationAlertMessage = "Thanks. This account has been reported."
            showModerationAlert = true
        } catch {
            moderationAlertMessage = "Could not report this account right now."
            showModerationAlert = true
        }
    }

    private func blockAccount() async {
        do {
            try await appState.blockTraveler(traveler)
            dismiss()
        } catch {
            moderationAlertMessage = "Could not block this account right now."
            showModerationAlert = true
        }
    }
}

private struct NativeProfileMetaPill: View {
    let label: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .black))
            .foregroundStyle(foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(background)
            .clipShape(Capsule())
    }
}

private struct NativeProfileMiniStat: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.4))
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct NativePlaceDetailScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @Environment(\.openURL) private var openURL
    @State private var place: NativePlace
    @State private var travelerMoments: [NativePlaceTravelerMoment] = []
    @State private var relatedPlaces: [NativePlace] = []
    @State private var selectedMediaIndex = 0
    @State private var interactiveMapRegion = MKCoordinateRegion()
    @State private var isLoading = false
    @State private var isTogglingBookmark = false
    @State private var errorMessage: String?
    @State private var shareURL: URL?

    init(initialPlace: NativePlace) {
        _place = State(initialValue: initialPlace)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            resolvedPlaceContent
            .padding(20)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarHidden(false)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    if !compatibilityHeaderPrimary.isEmpty {
                        Text(compatibilityHeaderPrimary)
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(compatibilityHeaderColor)
                    }
                    if let secondary = compatibilityHeaderSecondary {
                        Text(secondary)
                            .font(.system(size: 10, weight: .regular))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .frame(maxWidth: .infinity)
                .id("\(place.id)-\(place.similarityStat ?? -1)-\(compatibilityHeaderPrimary)")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    shareURL = placeShareURL
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                Button {
                    appState.activeTab = .checkIn
                } label: {
                    HStack {
                        Spacer()
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 15, weight: .bold))
                            Text("Been Here")
                                .font(.system(size: 15, weight: .black))
                        }
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.white.opacity(0.1))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                Button {
                    Task {
                        await toggleBookmark()
                    }
                } label: {
                    HStack {
                        Spacer()
                        HStack(spacing: 8) {
                            Image(systemName: appState.isBookmarked(place.id) ? "bookmark.fill" : "bookmark")
                                .font(.system(size: 15, weight: .bold))
                            if isTogglingBookmark {
                                ProgressView().tint(.black)
                            } else {
                                Text(appState.isBookmarked(place.id) ? "Saved" : "Save")
                                    .font(.system(size: 15, weight: .black))
                            }
                        }
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(appState.isBookmarked(place.id) ? nativeAccent : Color.white.opacity(0.1))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(nativeAccent, lineWidth: 1.5)
                    )
                    .foregroundStyle(appState.isBookmarked(place.id) ? .black : nativeAccent)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .disabled(isTogglingBookmark)
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 10)
            .background(Color.black.opacity(0.94))
        }
        .onAppear {
            appState.pushFloatingTabBarHidden()
        }
        .onDisappear {
            appState.popFloatingTabBarHidden()
        }
        .task {
            await loadLatestPlace()
        }
        .sheet(isPresented: Binding(
            get: { shareURL != nil },
            set: { if !$0 { shareURL = nil } }
        )) {
            NativeShareSheet(items: shareURL.map { [$0] } ?? [])
        }
    }

    private var resolvedPlaceContent: some View {
        return VStack(alignment: .leading, spacing: 22) {
            ZStack(alignment: .topLeading) {
                TabView(selection: $selectedMediaIndex) {
                    ForEach(Array(mediaUrls.enumerated()), id: \.offset) { index, url in
                        NativeRemoteImage(url: url)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .clipped()
                            .tag(index)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 430)
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .overlay(alignment: .bottom) {
                    LinearGradient(
                        colors: [
                            Color.clear,
                            Color.black.opacity(0.12),
                            Color.black.opacity(0.55),
                            Color.black.opacity(0.96)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 118)
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                }

                HStack(alignment: .top) {
                    if let topTag = topTagLabel {
                        Text(topTag)
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(nativeAccent)
                            .clipShape(Capsule())
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)

                if mediaUrls.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(Array(mediaUrls.enumerated()), id: \.offset) { index, _ in
                            Capsule()
                                .fill(index == selectedMediaIndex ? nativeAccent : Color.white.opacity(0.14))
                                .frame(width: index == selectedMediaIndex ? 30 : 12, height: 4)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, 18)
                }

            }
            .frame(maxWidth: .infinity)
            .frame(height: 430)

            VStack(alignment: .leading, spacing: 12) {
                Text(place.name)
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(.white)

                HStack(spacing: 8) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.7))
                    Text(locationAndDistanceLine)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white.opacity(0.76))
                        .lineLimit(2)
                }

                if let bestVisitedAtLine {
                    Text(bestVisitedAtLine)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(nativeAccent)
                }

                if !secondaryTags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(secondaryTags, id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundStyle(.white.opacity(0.86))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(Color.white.opacity(0.08))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 14) {
                if highlightAboutExists {
                    VStack(alignment: .leading, spacing: 10) {
                        if let hook = place.hook, !hook.isEmpty {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 15, weight: .black))
                                    .foregroundStyle(nativeAccent)
                                    .padding(.top, 2)
                                Text(hook)
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        if let description = place.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white.opacity(0.68))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if whyThisShowsUpText != nil {
                    NativeSurfaceCard(fill: AnyShapeStyle(nativeAccent.opacity(0.12)), stroke: nativeAccent.opacity(0.36)) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Why this is showing up for you")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(nativeAccent)
                                .textCase(.uppercase)
                            Text(whyThisShowsUpText ?? "")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.88))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if !similarPlaceTravelers.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        NativeSectionTitle("Similar people")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(similarPlaceTravelers) { traveler in
                                    NavigationLink {
                                        NativeTravelerProfileScreen(
                                            initialTraveler: NativeTravelerSummary(
                                                id: traveler.id,
                                                username: traveler.username,
                                                displayName: traveler.displayName,
                                                avatar: traveler.avatar,
                                                bio: nil,
                                                descriptor: nil,
                                                matchScore: traveler.matchScore,
                                                followersCount: nil,
                                                recentSavedPlaces: nil,
                                                recentCollections: nil,
                                                travelHistory: [],
                                                visitedPlacesCount: nil,
                                                savedPlacesCount: nil,
                                                collectionsCount: nil
                                            )
                                        )
                                    } label: {
                                        VStack(alignment: .leading, spacing: 10) {
                                            HStack(alignment: .top, spacing: 10) {
                                                NativeAvatarCircle(
                                                    url: traveler.avatar,
                                                    fallbackText: traveler.displayName ?? traveler.username,
                                                    size: 46,
                                                    fontSize: 16
                                                )
                                                Spacer(minLength: 0)
                                                if let score = traveler.matchScore {
                                                    Text("\(score)%")
                                                        .font(.system(size: 11, weight: .black))
                                                        .foregroundStyle(.white.opacity(0.82))
                                                }
                                            }

                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(traveler.displayName ?? traveler.username)
                                                    .font(.system(size: 13, weight: .black))
                                                    .foregroundStyle(.white)
                                                    .lineLimit(2)
                                                Text("@\(traveler.username)")
                                                    .font(.system(size: 11, weight: .semibold))
                                                    .foregroundStyle(.white.opacity(0.58))
                                                    .lineLimit(1)
                                            }

                                            HStack(spacing: 6) {
                                                if traveler.isFollowing {
                                                    nativeMiniTag("Following", foreground: nativeAccent, background: nativeAccent.opacity(0.14))
                                                }
                                                if traveler.hasVisited {
                                                    nativeMiniTag("Visited this", foreground: .white.opacity(0.9), background: Color.white.opacity(0.08))
                                                }
                                                if traveler.hasSaved {
                                                    nativeMiniTag("Saved this", foreground: .white.opacity(0.9), background: Color.white.opacity(0.08))
                                                }
                                            }
                                        }
                                        .frame(width: 154, alignment: .leading)
                                        .padding(14)
                                        .background(nativeSurface)
                                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                NativeSectionTitle("Place details")
                NativeSurfaceCard {
                    VStack(alignment: .leading, spacing: 14) {
                        if let vibeCheck = place.attitudeLabel, !vibeCheck.isEmpty {
                            NativePlaceDetailRow(label: "Vibe check", value: vibeCheck)
                        }
                        if let category = place.category, !category.isEmpty {
                            NativePlaceDetailRow(label: "Place category", value: category)
                        }
                        if let budget = place.priceRange ?? (place.priceLevel.map { String(repeating: "$", count: $0) }), !budget.isEmpty {
                            NativePlaceDetailRow(label: "Budget", value: budget)
                        }
                        if let bestTime = place.bestTime, !bestTime.isEmpty {
                            NativePlaceDetailRow(label: "Best time", value: bestTime)
                        }
                        if let address = place.address, !address.isEmpty {
                            NativePlaceDetailRow(label: "Full address", value: address)
                        }
                    }
                }

                if let mapRegion {
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Maps overview")
                                .font(.system(size: 11, weight: .black))
                                .foregroundStyle(.white.opacity(0.45))
                                .textCase(.uppercase)
                            Map(coordinateRegion: $interactiveMapRegion, interactionModes: .all)
                                .frame(height: 190)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                                .onAppear {
                                    interactiveMapRegion = mapRegion
                                }
                        }
                    }

                    if let openInMapsURL {
                        Button {
                            openURL(openInMapsURL)
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "map")
                                    .font(.system(size: 15, weight: .bold))
                                Text("Open in Maps")
                                    .font(.system(size: 15, weight: .black))
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 14, weight: .bold))
                            }
                            .foregroundStyle(.black)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 16)
                            .background(nativeAccent)
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                } else if let openInMapsURL {
                    Button {
                        openURL(openInMapsURL)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "map")
                                .font(.system(size: 15, weight: .bold))
                            Text("Open in Maps")
                                .font(.system(size: 15, weight: .black))
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 14, weight: .bold))
                        }
                        .foregroundStyle(.black)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .background(nativeAccent)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }

                if !relatedPlaces.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        NativeSectionTitle("Nearby picks")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(relatedPlaces.prefix(6)) { relatedPlace in
                                    NavigationLink {
                                        NativePlaceDetailScreen(initialPlace: relatedPlace)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 8) {
                                            NativeRemoteImage(url: relatedPlace.image)
                                                .frame(width: 178, height: 118)
                                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                            Text(relatedPlace.name)
                                                .font(.system(size: 14, weight: .black))
                                                .foregroundStyle(.white)
                                                .lineLimit(2)
                                        }
                                        .frame(width: 178, alignment: .leading)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.red.opacity(0.9))
            }
        }
    }

    private var mediaUrls: [String] {
        let candidates = (place.images ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if !candidates.isEmpty { return candidates }
        return [place.image].compactMap { $0 }
    }

    private var compatibilityBadge: NativeCompatibilityBadgeMeta? {
        nativeCompatibilityBadge(for: place.similarityStat)
    }

    private var topTagLabel: String? {
        if let first = place.tags?.first, !first.isEmpty { return first }
        if let attitudeLabel = place.attitudeLabel, !attitudeLabel.isEmpty { return attitudeLabel }
        if let category = place.category, !category.isEmpty { return category }
        return nil
    }

    private var secondaryTags: [String] {
        var seen = Set<String>()
        return (place.tags ?? [])
            .filter { !$0.isEmpty }
            .filter { tag in
                let normalized = tag.lowercased()
                if seen.contains(normalized) { return false }
                seen.insert(normalized)
                return normalized != topTagLabel?.lowercased()
                    && normalized != compatibilityBadge?.label.lowercased()
            }
            .prefix(5)
            .map { $0 }
    }

    private var whyThisShowsUpText: String? {
        let genericPrefixes = [
            "it stands out more than most places nearby",
            "it is landing as one of the stronger fits",
            "it lines up with the slower",
            "it fits the reset-heavy side",
            "it reads like one of your stronger"
        ]
        let recommendation = place.recommendationReason?.trimmingCharacters(in: .whitespacesAndNewlines)
        if
            let recommendation,
            !recommendation.isEmpty,
            !genericPrefixes.contains(where: { recommendation.lowercased().hasPrefix($0) }),
            recommendation.lowercased() != place.description?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            recommendation.lowercased() != place.hook?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        {
            return recommendation
        }
        return place.whyYoullLikeIt?
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: {
                !$0.isEmpty
                && $0.lowercased() != place.description?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                && $0.lowercased() != place.hook?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                && !$0.lowercased().hasPrefix("best at ")
            })
    }

    private var shortLocationLine: String {
        let shortAddress = place.address?
            .split(separator: ",")
            .first
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        return shortAddress?.isEmpty == false ? shortAddress! : place.location
    }

    private var locationAndDistanceLine: String {
        if let distanceLabel {
            return "\(shortLocationLine)  •  \(distanceLabel)"
        }
        return shortLocationLine
    }

    private var bestVisitedAtLine: String? {
        guard let bestTime = place.bestTime?.trimmingCharacters(in: .whitespacesAndNewlines), !bestTime.isEmpty else {
            return nil
        }
        return "Best visited at \(bestTime)"
    }

    private var distanceLabel: String? {
        guard
            let latitude = place.latitude,
            let longitude = place.longitude,
            let origin = appState.currentCoordinate
        else { return nil }
        let destination = CLLocation(latitude: latitude, longitude: longitude)
        let source = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
        let miles = source.distance(from: destination) / 1609.344
        if miles < 0.1 {
            return String(format: "%.0f ft away", source.distance(from: destination) * 3.28084)
        }
        return String(format: "%.1f mi away", miles)
    }

    private var highlightAboutExists: Bool {
        let hasHook = !(place.hook?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasDescription = !(place.description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return hasHook || hasDescription
    }

    private var compatibilityHeaderPrimary: String {
        compatibilityBadge?.label ?? ""
    }

    private var compatibilityHeaderSecondary: String? {
        guard let score = place.similarityStat else { return nil }
        return "\(score)% match"
    }

    private var compatibilityHeaderColor: Color {
        guard let match = place.similarityStat else { return .white }
        if match >= 85 { return nativeAccent }
        if match >= 70 { return nativeAccent }
        return .white
    }

    private var placeShareURL: URL? {
        URL(string: "https://vibinn.club/app/place/\(place.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? place.id)")
    }

    private var mapRegion: MKCoordinateRegion? {
        guard let latitude = place.latitude, let longitude = place.longitude else { return nil }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
        )
    }

    private var similarPlaceTravelers: [NativeSimilarPlaceTraveler] {
        let followedAndSuggested = appState.followedTravelers + appState.suggestedTravelers
        let summariesByUsername = Dictionary(
            followedAndSuggested.map { ($0.username.lowercased(), $0) },
            uniquingKeysWith: { first, _ in first }
        )

        let visitedUsernames = Set(travelerMoments.map { $0.travelerUsername.lowercased() })
        let savedUsernames = Set(
            followedAndSuggested.compactMap { traveler -> String? in
                let hasSaved = traveler.recentSavedPlaces?.contains(where: { $0.place.id == place.id }) ?? false
                return hasSaved ? traveler.username.lowercased() : nil
            }
        )

        let candidateUsernames = Array(Set(visitedUsernames.union(savedUsernames)))

        return candidateUsernames.compactMap { username in
            let summary = summariesByUsername[username]
            let hasVisited = visitedUsernames.contains(username)
            let hasSaved = savedUsernames.contains(username)
            guard hasVisited || hasSaved else { return nil }
            let rawMoment = travelerMoments.first(where: { $0.travelerUsername.lowercased() == username })
            let resolvedId = summary?.id ?? "moment-\(username)"
            let resolvedUsername = summary?.username ?? rawMoment?.travelerUsername ?? username
            return NativeSimilarPlaceTraveler(
                id: resolvedId,
                username: resolvedUsername,
                displayName: summary?.displayName,
                avatar: summary?.avatar ?? rawMoment?.travelerAvatar,
                matchScore: summary?.matchScore,
                isFollowing: summary.map { appState.isFollowing($0.id) } ?? false,
                hasVisited: hasVisited,
                hasSaved: hasSaved
            )
        }
        .sorted { lhs, rhs in
            if lhs.isFollowing != rhs.isFollowing { return lhs.isFollowing && !rhs.isFollowing }
            if (lhs.matchScore ?? -1) != (rhs.matchScore ?? -1) { return (lhs.matchScore ?? -1) > (rhs.matchScore ?? -1) }
            if lhs.hasVisited != rhs.hasVisited { return lhs.hasVisited && !rhs.hasVisited }
            return lhs.username.localizedCaseInsensitiveCompare(rhs.username) == .orderedAscending
        }
        .prefix(10)
        .map { $0 }
    }

    private func nativeMiniTag(_ label: String, foreground: Color, background: Color) -> some View {
        Text(label)
            .font(.system(size: 10, weight: .black))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(background)
            .clipShape(Capsule())
    }

    private var openInMapsURL: URL? {
        if let latitude = place.latitude, let longitude = place.longitude {
            let name = place.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place.name
            return URL(string: "http://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(name)")
        }
        if let address = place.address?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            return URL(string: "http://maps.apple.com/?q=\(address)")
        }
        return place.mapsUrl.flatMap(URL.init(string:))
    }
    private func loadLatestPlace() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        nativeLogger.log(
            "place detail load start id=\(self.place.id, privacy: .public) initialScore=\(String(describing: self.place.similarityStat), privacy: .public)"
        )

        let resolvedPayload = try? await appState.fetchPlaceDetail(id: place.id)

        guard let resolvedPayload else {
            nativeLogger.error(
                "place detail load failed id=\(self.place.id, privacy: .public) error=No detail payload available"
            )
            errorMessage = "Could not refresh place details right now."
            return
        }

        nativeLogger.log(
            "place detail loaded id=\(self.place.id, privacy: .public) score=\(String(describing: resolvedPayload.place.similarityStat), privacy: .public)"
        )

        let nextPlace = mergedPlaceRetainingPresentation(place, with: resolvedPayload.place)
        travelerMoments = resolvedPayload.travelerMoments ?? []
        relatedPlaces = resolvedPayload.relatedPlaces ?? []
        place = nextPlace
        errorMessage = nil
        nativeLogger.log(
            "place detail final score id=\(self.place.id, privacy: .public) finalScore=\(String(describing: nextPlace.similarityStat), privacy: .public) headerPrimary=\(self.compatibilityHeaderPrimary, privacy: .public)"
        )
        if let mapRegion {
            interactiveMapRegion = mapRegion
        }
    }

    private func toggleBookmark() async {
        errorMessage = nil
        isTogglingBookmark = true
        defer { isTogglingBookmark = false }
        do {
            try await appState.toggleBookmark(for: place)
        } catch {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorUserAuthenticationRequired {
                errorMessage = nil
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct NativePlaceDetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(label)
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white.opacity(0.42))
                .frame(width: 96, alignment: .leading)
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.86))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }
}

private struct NativeSimilarPlaceTraveler: Identifiable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let matchScore: Int?
    let isFollowing: Bool
    let hasVisited: Bool
    let hasSaved: Bool
}

private func mergedPlaceRetainingPresentation(_ current: NativePlace, with next: NativePlace) -> NativePlace {
    NativePlace(
        id: next.id,
        name: next.name,
        location: next.location,
        address: next.address,
        category: next.category,
        description: next.description,
        hook: next.hook,
        image: next.image,
        images: next.images,
        tags: next.tags,
        attitudeLabel: next.attitudeLabel,
        bestTime: next.bestTime,
        similarityStat: current.similarityStat ?? next.similarityStat,
        whyYoullLikeIt: (next.whyYoullLikeIt?.isEmpty == false ? next.whyYoullLikeIt : current.whyYoullLikeIt),
        recommendationReason: {
            let candidate = next.recommendationReason?.trimmingCharacters(in: .whitespacesAndNewlines)
            return candidate?.isEmpty == false ? candidate : current.recommendationReason
        }(),
        rating: next.rating,
        priceLevel: next.priceLevel,
        openingHours: next.openingHours,
        mapsUrl: next.mapsUrl,
        latitude: next.latitude,
        longitude: next.longitude,
        priceRange: next.priceRange,
        momentId: next.momentId,
        ownerUserId: next.ownerUserId,
        visitedDate: next.visitedDate,
        visitedAtIso: next.visitedAtIso,
        momentCaption: next.momentCaption,
        momentWouldRevisit: next.momentWouldRevisit,
        momentRating: next.momentRating
    )
}

private struct NativeCollectionDetailScreen: View {
    let collection: NativeCollection
    var ownerDisplayName: String? = nil
    var ownerUsername: String? = nil
    @State private var copiedLink = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(collection.label)
                        .font(.system(size: 30, weight: .black))
                        .foregroundStyle(.white)

                    if let ownerDisplayName, let ownerUsername {
                        Text("By \(ownerDisplayName)  ·  @\(ownerUsername)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.65))
                    }

                    HStack(spacing: 10) {
                        Text("\(collection.places.count) places")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.55))

                        if let createdAt = collection.createdAt {
                            Text(NativeAppState.relativeLabel(from: createdAt))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                    }
                }

                if !collection.places.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(Array(collection.places.prefix(4).enumerated()), id: \.offset) { _, place in
                                NativeRemoteImage(url: place.image)
                                    .frame(width: 220, height: 140)
                                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                        }
                    }
                }

                ForEach(Array(collection.places.enumerated()), id: \.offset) { _, place in
                    NativePlaceCard(place: place)
                }

                if copiedLink {
                    NativeSuccessMessage(message: "Collection link copied.")
                }
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Collection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIPasteboard.general.string = "https://vibinn.club/lists/\(collection.id)"
                    copiedLink = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct NativeRemoteImage: View {
    let url: String?

    var body: some View {
        AsyncImage(url: nativeResolvedImageURL(url).flatMap(URL.init(string:))) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure(_):
                fallback
            case .empty:
                ZStack {
                    fallback
                    ProgressView().tint(nativeAccent)
                }
            @unknown default:
                fallback
            }
        }
    }

    private var fallback: some View {
        LinearGradient(
            colors: [Color.white.opacity(0.08), Color.white.opacity(0.03)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private func nativeResolvedImageURL(_ url: String?) -> String? {
    guard let raw = url?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
        return nil
    }
    if raw.hasPrefix("//") {
        return "https:\(raw)"
    }
    if raw.hasPrefix("http://api.vibinn.club") {
        return raw.replacingOccurrences(of: "http://api.vibinn.club", with: "https://api.vibinn.club")
    }
    if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
        return raw
    }
    let sanitized = raw.hasPrefix("/") ? raw : "/\(raw)"
    return "https://api.vibinn.club\(sanitized)"
}

private func nativeDistanceBetweenMiles(
    _ origin: (latitude: Double, longitude: Double),
    _ destination: (latitude: Double, longitude: Double)
) -> Double {
    let originLocation = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
    let destinationLocation = CLLocation(latitude: destination.latitude, longitude: destination.longitude)
    return originLocation.distance(from: destinationLocation) / 1609.344
}

private func nativeAvatarFallbackURL(for text: String) -> String {
    let initial = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased()
    let encoded = initial.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "V"
    return "https://placehold.co/400x400/111111/D3FF48?text=\(encoded)"
}

private func nativeDebugListLabel(_ values: [String]) -> String {
    let joined = values.joined(separator: ", ")
    return joined.isEmpty ? "none" : joined
}

private struct NativeCheckInScreen: View {
    @EnvironmentObject private var appState: NativeAppState
    @State private var query = ""
    @State private var results: [NativePlace] = []
    @State private var selectedPlace: NativePlace?
    @State private var note = ""
    @State private var rating = 4
    @State private var wouldRevisit = "yes"
    @State private var isSearching = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                NativeScreenHeader(
                    title: "Check in",
                    subtitle: "Rate the place, say if you would go back, then move on."
                )

                NativeSurfaceCard {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Search a place", text: $query)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .font(.system(size: 17, weight: .medium))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 16)
                            .background(nativeSurfaceStrong)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                        Button("Search") {
                            Task {
                                await performSearch()
                            }
                        }
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(nativeAccent)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || isSearching)
                    }
                }

                if isSearching {
                    NativeSurfaceCard {
                        HStack(spacing: 12) {
                            ProgressView().tint(nativeAccent)
                            Text("Searching places...")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white.opacity(0.72))
                        }
                    }
                }

                if !results.isEmpty {
                    NativeSectionTitle("Results")
                    LazyVStack(spacing: 12) {
                        ForEach(results) { place in
                            Button {
                                selectedPlace = place
                                successMessage = nil
                            } label: {
                                NativePlaceCard(place: place, isSelected: selectedPlace?.id == place.id)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let selectedPlace {
                    NativeSectionTitle("Check in")
                    NativeSurfaceCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text(selectedPlace.name)
                                .font(.system(size: 20, weight: .black))
                                .foregroundStyle(.white)

                            VStack(alignment: .leading, spacing: 10) {
                                Text("Rating")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white.opacity(0.45))
                                    .textCase(.uppercase)
                                HStack(spacing: 10) {
                                    ForEach(1...5, id: \.self) { value in
                                        Button {
                                            rating = value
                                        } label: {
                                            Text("\(value)")
                                                .font(.system(size: 16, weight: .black))
                                                .frame(maxWidth: .infinity)
                                                .padding(.vertical, 12)
                                                .background(rating == value ? nativeAccent : nativeSurfaceStrong)
                                                .foregroundStyle(rating == value ? .black : .white)
                                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            VStack(alignment: .leading, spacing: 10) {
                                Text("Would revisit")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white.opacity(0.45))
                                    .textCase(.uppercase)
                            Picker("Would revisit", selection: $wouldRevisit) {
                                Text("Yes").tag("yes")
                                Text("Not sure").tag("not_sure")
                                Text("No").tag("not_interested")
                            }
                            .pickerStyle(.segmented)
                            }

                            ZStack(alignment: .topLeading) {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(nativeSurfaceStrong)
                                if note.isEmpty {
                                    Text("Overall experience")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.35))
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 20)
                                }
                                TextEditor(text: $note)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 12)
                                    .frame(minHeight: 120)
                                    .background(Color.clear)
                            }
                            .frame(minHeight: 120)

                            Button {
                                Task {
                                    await submitCheckIn()
                                }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSubmitting {
                                        ProgressView().tint(.black)
                                    } else {
                                        Text("Save check-in")
                                            .font(.system(size: 16, weight: .black))
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 16)
                                .background(nativeAccent)
                                .foregroundStyle(.black)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }
                            .disabled(isSubmitting)
                        }
                    }
                }

                if let successMessage {
                    NativeSuccessMessage(message: successMessage)
                }

                if let errorMessage {
                    NativeInlineError(message: errorMessage)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Check in")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func performSearch() async {
        errorMessage = nil
        isSearching = true
        defer { isSearching = false }

        do {
            results = try await appState.lookupPlaces(query: query)
        } catch {
            errorMessage = "Could not search places right now."
        }
    }

    private func submitCheckIn() async {
        guard let currentPlace = selectedPlace else { return }
        errorMessage = nil
        successMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await appState.submitCheckIn(
                place: currentPlace,
                rating: rating,
                wouldRevisit: wouldRevisit,
                note: note
            )
            successMessage = "Check-in saved."
            query = ""
            results = []
            note = ""
            selectedPlace = nil
        } catch {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorUserAuthenticationRequired {
                errorMessage = nil
            } else {
                errorMessage = "Could not save this check-in."
            }
        }
    }
}

private struct NativeInputField: View {
    let title: String
    @Binding var text: String
    let keyboard: UIKeyboardType
    let secure: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white.opacity(0.45))
                .textCase(.uppercase)
            if secure {
                SecureField(title, text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .background(nativeSurfaceStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .keyboardType(keyboard)
            } else {
                TextField(title, text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .background(nativeSurfaceStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .keyboardType(keyboard)
            }
        }
    }
}

private struct NativeStatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value)
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white.opacity(0.45))
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(nativeSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
