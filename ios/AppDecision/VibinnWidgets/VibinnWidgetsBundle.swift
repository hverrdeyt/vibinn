import WidgetKit
import SwiftUI
import UIKit
import os

private let nativeWidgetAppGroupIdentifier = "group.club.vibinn.ios"
private let nativeWidgetSnapshotFileName = "vibinn-widget-snapshot.json"
private let nativeWidgetImageCacheDirectoryName = "widget-image-cache"
private let nativeWidgetLogger = Logger(subsystem: "club.vibinn.ios.widgets", category: "Widget")

private struct NativeWidgetGallerySnapshot: Codable {
    let id: String
    let username: String
    let displayName: String?
    let avatarURL: String?
    let mediaURL: String?
    let localMediaPath: String?
    let postedLabel: String
}

private struct NativeWidgetRecommendationSnapshot: Codable {
    let placeId: String
    let placeName: String
    let backgroundImageURL: String?
    let localBackgroundImagePath: String?
    let distanceLabel: String
    let hasGeneratedRecommendation: Bool
}

private struct NativeWidgetSnapshot: Codable {
    let generatedAt: Date
    let hasFriends: Bool
    let gallery: NativeWidgetGallerySnapshot?
    let recommendation: NativeWidgetRecommendationSnapshot?
}

private enum NativeWidgetSnapshotStore {
    private static var fileURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: nativeWidgetAppGroupIdentifier)?
            .appendingPathComponent(nativeWidgetSnapshotFileName)
    }

    static func load() -> NativeWidgetSnapshot? {
        guard let fileURL else { return nil }
        guard let data = try? Data(contentsOf: fileURL) else {
            nativeWidgetLogger.error("snapshot load failed: file missing")
            return nil
        }
        let snapshot = try? JSONDecoder().decode(NativeWidgetSnapshot.self, from: data)
        if let snapshot {
            nativeWidgetLogger.log(
                "snapshot loaded galleryLocal=\(snapshot.gallery?.localMediaPath ?? "nil", privacy: .public) galleryURL=\(snapshot.gallery?.mediaURL ?? "nil", privacy: .public) recoLocal=\(snapshot.recommendation?.localBackgroundImagePath ?? "nil", privacy: .public)"
            )
        } else {
            nativeWidgetLogger.error("snapshot decode failed")
        }
        return snapshot
    }

    static func localFileURL(for relativePath: String?) -> URL? {
        guard let relativePath else { return nil }
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: nativeWidgetAppGroupIdentifier
        ) else { return nil }
        return containerURL.appendingPathComponent(relativePath)
    }
}

private func nativeResolvedWidgetImageURL(_ url: String?) -> String? {
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

private struct VibinnWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: NativeWidgetSnapshot?
}

private extension View {
    @ViewBuilder
    func vibinnWidgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) {
                Color.black
            }
        } else {
            self.background(Color.black)
        }
    }
}

private struct VibinnCoffeeFallbackBackground: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        ZStack {
            if UIImage(named: "good_coffee") != nil {
                Image("good_coffee")
                    .resizable()
                    .scaledToFill()
            } else {
                VibinnRemoteWidgetImage(
                    urlString: entry.snapshot?.gallery?.mediaURL,
                    localRelativePath: entry.snapshot?.gallery?.localMediaPath
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .blur(radius: 18)
        .overlay(Color.black.opacity(0.45))
        .clipped()
    }
}

private struct VibinnWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> VibinnWidgetEntry {
        VibinnWidgetEntry(
            date: Date(),
            snapshot: NativeWidgetSnapshot(
                generatedAt: Date(),
                hasFriends: true,
                gallery: NativeWidgetGallerySnapshot(
                    id: "sample",
                    username: "fauzan",
                    displayName: "Fauzan",
                    avatarURL: nil,
                    mediaURL: nil,
                    localMediaPath: nil,
                    postedLabel: "2h ago"
                ),
                recommendation: NativeWidgetRecommendationSnapshot(
                    placeId: "sample-place",
                    placeName: "Gracenote Coffee",
                    backgroundImageURL: nil,
                    localBackgroundImagePath: nil,
                    distanceLabel: "6 mins away",
                    hasGeneratedRecommendation: true
                )
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (VibinnWidgetEntry) -> Void) {
        Task {
            completion(await loadEntry())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VibinnWidgetEntry>) -> Void) {
        Task {
            let entry = await loadEntry()
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date().addingTimeInterval(300)
            completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
        }
    }

    private func loadEntry() async -> VibinnWidgetEntry {
        let snapshot = NativeWidgetSnapshotStore.load()
        nativeWidgetLogger.log(
            "timeline entry galleryExists=\(snapshot?.gallery != nil) recoExists=\(snapshot?.recommendation != nil)"
        )
        return VibinnWidgetEntry(date: Date(), snapshot: snapshot)
    }
}

private struct VibinnRemoteWidgetImage: View {
    let urlString: String?
    let localRelativePath: String?

    var body: some View {
        if let localRelativePath,
           let fileURL = NativeWidgetSnapshotStore.localFileURL(for: localRelativePath),
           let uiImage = UIImage(contentsOfFile: fileURL.path) {
            let _ = nativeWidgetLogger.log("widget image local hit path=\(localRelativePath, privacy: .public)")
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .clipped()
        } else
        if let resolved = nativeResolvedWidgetImageURL(urlString), let url = URL(string: resolved) {
            let _ = nativeWidgetLogger.log("widget image remote fallback url=\(resolved, privacy: .public)")
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    let _ = nativeWidgetLogger.log("widget image remote success")
                    image
                        .resizable()
                        .scaledToFill()
                        .clipped()
                case .failure, .empty:
                    let _ = nativeWidgetLogger.error("widget image remote unavailable")
                    placeholder
                @unknown default:
                    placeholder
                }
            }
        } else {
            let _ = nativeWidgetLogger.error("widget image placeholder only localPath=\(localRelativePath ?? "nil", privacy: .public) url=\(urlString ?? "nil", privacy: .public)")
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Color(red: 18 / 255, green: 18 / 255, blue: 22 / 255)
            Image(systemName: "photo")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.18))
        }
    }
}

private extension View {
    func vibinnWidgetCard() -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(red: 18 / 255, green: 18 / 255, blue: 22 / 255))
            )
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct VibinnGalleryPanel: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            VibinnRemoteWidgetImage(
                urlString: entry.snapshot?.gallery?.mediaURL,
                localRelativePath: entry.snapshot?.gallery?.localMediaPath
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            LinearGradient(
                colors: [Color.black.opacity(0.0), Color.black.opacity(0.88)],
                startPoint: .center,
                endPoint: .bottom
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            VStack(alignment: .leading, spacing: 4) {
                if let gallery = entry.snapshot?.gallery {
                    Text(gallery.displayName ?? "@\(gallery.username)")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(gallery.postedLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.74))
                } else {
                    Text("No posts yet")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                    Text("Open Vibinn to see today.")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.74))
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
        .vibinnWidgetCard()
    }
}

private struct VibinnGalleryWidgetView: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        VibinnGalleryPanel(entry: entry)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "vibinn://feed"))
        .vibinnWidgetBackground()
    }
}

private struct VibinnRecommendationPanel: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            recommendationBackground
            LinearGradient(
                colors: [Color.black.opacity(0.12), Color.black.opacity(0.9)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 8) {
                Text("TODAY’S PICK")
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(Color(red: 211 / 255, green: 1, blue: 72 / 255))

                if let recommendation = entry.snapshot?.recommendation,
                   recommendation.hasGeneratedRecommendation {
                    Spacer(minLength: 0)
                    Text(recommendation.placeName)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text(recommendation.distanceLabel)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.76))
                } else {
                    Spacer(minLength: 0)
                    Text("Where to today?")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                    Text("Pick your vibe")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.76))
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
        .vibinnWidgetCard()
    }

    @ViewBuilder
    private var recommendationBackground: some View {
        if entry.snapshot?.recommendation?.hasGeneratedRecommendation == true {
            VibinnRemoteWidgetImage(
                urlString: entry.snapshot?.recommendation?.backgroundImageURL,
                localRelativePath: entry.snapshot?.recommendation?.localBackgroundImagePath
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            VibinnCoffeeFallbackBackground(entry: entry)
        }
    }
}

private struct VibinnRecommendationWidgetView: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        VibinnRecommendationPanel(entry: entry)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "vibinn://discover"))
        .vibinnWidgetBackground()
    }
}

private struct VibinnMediumComboWidgetView: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        GeometryReader { geometry in
            let panelWidth = max((geometry.size.width - 10) / 2, 0)

            HStack(spacing: 10) {
                Link(destination: URL(string: "vibinn://feed")!) {
                    VibinnGalleryPanel(entry: entry)
                        .frame(width: panelWidth, height: geometry.size.height)
                }
                .buttonStyle(.plain)

                Link(destination: URL(string: "vibinn://discover")!) {
                    VibinnRecommendationPanel(entry: entry)
                        .frame(width: panelWidth, height: geometry.size.height)
                }
                .buttonStyle(.plain)
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
        }
        .vibinnWidgetBackground()
    }
}

struct VibinnGalleryWidget: Widget {
    let kind = "VibinnGalleryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VibinnWidgetProvider()) { entry in
            VibinnGalleryWidgetView(entry: entry)
        }
        .configurationDisplayName("Gallery")
        .description("Latest friend or suggested moment.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

struct VibinnRecommendationWidget: Widget {
    let kind = "VibinnRecommendationWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VibinnWidgetProvider()) { entry in
            VibinnRecommendationWidgetView(entry: entry)
        }
        .configurationDisplayName("Recommendation")
        .description("Today’s pick or a quick CTA to generate one.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

struct VibinnComboWidget: Widget {
    let kind = "VibinnComboWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VibinnWidgetProvider()) { entry in
            VibinnMediumComboWidgetView(entry: entry)
        }
        .configurationDisplayName("Gallery + Recommendation")
        .description("A compact blend of your latest moment and today’s pick.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

@main
struct VibinnWidgetsBundle: WidgetBundle {
    var body: some Widget {
        VibinnGalleryWidget()
        VibinnRecommendationWidget()
        VibinnComboWidget()
    }
}
