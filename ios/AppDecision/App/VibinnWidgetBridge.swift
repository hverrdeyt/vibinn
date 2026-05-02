import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

let nativeWidgetAppGroupIdentifier = "group.club.vibinn.ios"
let nativeWidgetSnapshotFileName = "vibinn-widget-snapshot.json"
let nativePendingWidgetDeepLinkUserDefaultsKey = "vibinn_native_pending_widget_deep_link"
let nativeWidgetDeepLinkNotification = Notification.Name("NativeWidgetDeepLinkOpened")

struct NativeWidgetGallerySnapshot: Codable {
    let id: String
    let username: String
    let displayName: String?
    let avatarURL: String?
    let mediaURL: String?
    let postedLabel: String
}

struct NativeWidgetRecommendationSnapshot: Codable {
    let placeId: String
    let placeName: String
    let backgroundImageURL: String?
    let distanceLabel: String
    let hasGeneratedRecommendation: Bool
}

struct NativeWidgetSnapshot: Codable {
    let generatedAt: Date
    let hasFriends: Bool
    let gallery: NativeWidgetGallerySnapshot?
    let recommendation: NativeWidgetRecommendationSnapshot?
}

enum NativeWidgetSnapshotStore {
    private static var fileURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: nativeWidgetAppGroupIdentifier)?
            .appendingPathComponent(nativeWidgetSnapshotFileName)
    }

    static func load() -> NativeWidgetSnapshot? {
        guard let fileURL else { return nil }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(NativeWidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: NativeWidgetSnapshot) {
        guard let fileURL else { return }
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }

    static func clear() {
        guard let fileURL else { return }
        try? FileManager.default.removeItem(at: fileURL)
    }
}

extension NativeAppState {
    func refreshWidgetSnapshot() {
        let snapshot = NativeWidgetSnapshot(
            generatedAt: Date(),
            hasFriends: !followedTravelers.isEmpty,
            gallery: nativeWidgetGallerySnapshot,
            recommendation: nativeWidgetRecommendationSnapshot
        )
        NativeWidgetSnapshotStore.save(snapshot)
#if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
#endif
    }

    func clearWidgetSnapshot() {
        NativeWidgetSnapshotStore.clear()
#if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
#endif
    }

    private var nativeWidgetGallerySnapshot: NativeWidgetGallerySnapshot? {
        let sourceItem: NativeFeedItem?
        if !followedTravelers.isEmpty {
            sourceItem = feedItems.first ?? fallbackFeedItems.first
        } else {
            sourceItem = suggestedFeedItems.first
        }

        guard let item = sourceItem else { return nil }
        let mediaURL =
            item.uploadedMediaUrls?.first(where: { !$0.isEmpty })
            ?? item.place?.userMediaUrls?.first(where: { !$0.isEmpty })
            ?? item.place?.momentMedia?.first?.url
            ?? item.place?.image
            ?? item.place?.images?.first

        return NativeWidgetGallerySnapshot(
            id: item.id,
            username: item.traveler.username,
            displayName: item.traveler.displayName,
            avatarURL: item.traveler.avatar,
            mediaURL: mediaURL,
            postedLabel: item.timestampLabel
        )
    }

    private var nativeWidgetRecommendationSnapshot: NativeWidgetRecommendationSnapshot? {
        guard let recommendation = todayRecommendation else {
            return NativeWidgetRecommendationSnapshot(
                placeId: "",
                placeName: "Pick for me",
                backgroundImageURL: nil,
                distanceLabel: "Generate today’s pick",
                hasGeneratedRecommendation: false
            )
        }

        let imageURL =
            recommendation.place.image
            ?? recommendation.place.images?.first
            ?? recommendation.place.userMediaUrls?.first
            ?? recommendation.place.momentMedia?.first?.url

        let distanceLabel: String
        if let travelTime = recommendation.place.travelTimeLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
           !travelTime.isEmpty {
            distanceLabel = travelTime
        } else if recommendation.distanceMiles < 0.2 {
            distanceLabel = "Nearby"
        } else {
            distanceLabel = String(format: "%.1f mi away", recommendation.distanceMiles)
        }

        return NativeWidgetRecommendationSnapshot(
            placeId: recommendation.place.id,
            placeName: recommendation.place.name,
            backgroundImageURL: imageURL,
            distanceLabel: distanceLabel,
            hasGeneratedRecommendation: true
        )
    }
}
