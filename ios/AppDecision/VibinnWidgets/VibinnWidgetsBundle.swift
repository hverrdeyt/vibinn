import WidgetKit
import SwiftUI
import UIKit
import os

private let nativeWidgetAppGroupIdentifier = "group.club.vibinn.ios"
private let nativeWidgetSnapshotFileName = "vibinn-widget-snapshot.json"
private let nativeWidgetLogger = Logger(subsystem: "club.vibinn.ios.widgets", category: "Widget")

private struct NativeWidgetMemorySnapshot: Codable {
    let id: String
    let mediaURL: String?
    let localMediaPath: String?
    let caption: String?
    let avatarURL: String?
    let localAvatarPath: String?
    let avatarFallbackName: String?
}

private func nativeWidgetAvatarInitials(from raw: String?) -> String {
    guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "?" }
    let tokens = raw.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
    if tokens.count >= 2 {
        return (String(tokens[0].prefix(1)) + String(tokens[1].prefix(1))).uppercased()
    }
    if let first = tokens.first {
        return String(first.prefix(1)).uppercased()
    }
    return "?"
}

private struct NativeWidgetSnapshot: Codable {
    let generatedAt: Date
    let myMemories: [NativeWidgetMemorySnapshot]
    let feedMemory: NativeWidgetMemorySnapshot?
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
        if snapshot == nil {
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
    let myMemoryIndex: Int
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

/// Memories rotate within a single timeline instead of triggering repeated reloads: WidgetKit
/// lets a provider hand back several dated entries in one `getTimeline` call, and the system
/// switches between them locally at each entry's date for free, with no extra refresh-budget
/// cost. Rotating hourly keeps the last few memories visible over a normal day without ever
/// needing the app to refresh the snapshot mid-rotation.
private let nativeWidgetMemoryRotationInterval: TimeInterval = 60 * 60

private struct VibinnWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> VibinnWidgetEntry {
        VibinnWidgetEntry(
            date: Date(),
            snapshot: NativeWidgetSnapshot(
                generatedAt: Date(),
                myMemories: [
                    NativeWidgetMemorySnapshot(
                        id: "sample-my-memory",
                        mediaURL: nil,
                        localMediaPath: nil,
                        caption: "Best ramen in town",
                        avatarURL: nil,
                        localAvatarPath: nil,
                        avatarFallbackName: nil
                    )
                ],
                feedMemory: NativeWidgetMemorySnapshot(
                    id: "sample-feed-memory",
                    mediaURL: nil,
                    localMediaPath: nil,
                    caption: "Sunday brunch spot",
                    avatarURL: nil,
                    localAvatarPath: nil,
                    avatarFallbackName: "Vibinn Traveler"
                )
            ),
            myMemoryIndex: 0
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (VibinnWidgetEntry) -> Void) {
        Task {
            let snapshot = loadSnapshot()
            completion(VibinnWidgetEntry(date: Date(), snapshot: snapshot, myMemoryIndex: 0))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VibinnWidgetEntry>) -> Void) {
        Task {
            let snapshot = loadSnapshot()
            let memoryCount = max(snapshot?.myMemories.count ?? 0, 1)
            let now = Date()
            let entries = (0..<memoryCount).map { index in
                VibinnWidgetEntry(
                    date: now.addingTimeInterval(Double(index) * nativeWidgetMemoryRotationInterval),
                    snapshot: snapshot,
                    myMemoryIndex: index
                )
            }
            let nextRefresh = now.addingTimeInterval(Double(memoryCount) * nativeWidgetMemoryRotationInterval)
            completion(Timeline(entries: entries, policy: .after(nextRefresh)))
        }
    }

    private func loadSnapshot() -> NativeWidgetSnapshot? {
        let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: nativeWidgetAppGroupIdentifier)
        print("[VIBINN-WIDGET-DIAGNOSTIC] containerURL=\(String(describing: containerURL))")
        let snapshot = NativeWidgetSnapshotStore.load()
        print("[VIBINN-WIDGET-DIAGNOSTIC] myMemoriesCount=\(snapshot?.myMemories.count ?? 0) feedMemoryExists=\(snapshot?.feedMemory != nil)")
        nativeWidgetLogger.log(
            "timeline entry myMemoriesCount=\(snapshot?.myMemories.count ?? 0) feedMemoryExists=\(snapshot?.feedMemory != nil)"
        )
        return snapshot
    }
}

private struct VibinnRemoteWidgetImage: View {
    let urlString: String?
    let localRelativePath: String?

    var body: some View {
        if let localRelativePath,
           let fileURL = NativeWidgetSnapshotStore.localFileURL(for: localRelativePath),
           let uiImage = UIImage(contentsOfFile: fileURL.path) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .clipped()
        } else if let resolved = nativeResolvedWidgetImageURL(urlString), let url = URL(string: resolved) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .clipped()
                case .failure, .empty:
                    placeholder
                @unknown default:
                    placeholder
                }
            }
        } else {
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

/// Blurred placeholder used behind empty states that should read as "an image is there,
/// just not loaded yet" rather than a flat empty tile.
private struct VibinnBlurredPlaceholderBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 20 / 255, green: 26 / 255, blue: 30 / 255),
                    Color(red: 92 / 255, green: 130 / 255, blue: 118 / 255),
                    Color(red: 58 / 255, green: 40 / 255, blue: 46 / 255)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(Color(red: 8 / 255, green: 10 / 255, blue: 14 / 255))
                .frame(width: 140, height: 140)
                .offset(x: -70, y: -90)
                .blur(radius: 36)
            Circle()
                .fill(Color(red: 132 / 255, green: 46 / 255, blue: 58 / 255))
                .frame(width: 130, height: 130)
                .offset(x: 50, y: 80)
                .blur(radius: 36)
        }
    }
}

/// Shared layout for both memory widgets: thumbnail fills the whole tile, an optional
/// square-rounded avatar sits top-leading (feed memory only), and the caption sits
/// bottom-leading, omitted entirely when the moment has no caption. When there's no
/// memory at all, `emptyTitle == nil` switches to the blurred-placeholder empty state
/// (feed widget); a non-nil title keeps the flat-background empty state (my-memory widget).
private struct VibinnMemoryPanel: View {
    let memory: NativeWidgetMemorySnapshot?
    let showsAvatar: Bool
    let emptyTitle: String?
    let emptySubtitle: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let memory {
                VibinnRemoteWidgetImage(
                    urlString: memory.mediaURL,
                    localRelativePath: memory.localMediaPath
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if showsAvatar {
                    Group {
                        if memory.avatarURL != nil || memory.localAvatarPath != nil {
                            VibinnRemoteWidgetImage(
                                urlString: memory.avatarURL,
                                localRelativePath: memory.localAvatarPath
                            )
                        } else {
                            ZStack {
                                Color.black
                                Text(nativeWidgetAvatarInitials(from: memory.avatarFallbackName))
                                    .font(.system(size: 13, weight: .black))
                                    .foregroundStyle(.white)
                            }
                        }
                    }
                    .frame(width: 32, height: 32)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(Color.black, lineWidth: 1.5)
                    )
                    .padding(12)
                }

                if let caption = memory.caption?.trimmingCharacters(in: .whitespacesAndNewlines), !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            } else if let emptyTitle {
                ZStack {
                    Color(red: 18 / 255, green: 18 / 255, blue: 22 / 255)
                    Rectangle()
                        .fill(.ultraThinMaterial)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 4) {
                    Spacer(minLength: 0)
                    Text(emptyTitle)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                    Text(emptySubtitle)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.6))
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            } else {
                VibinnBlurredPlaceholderBackground()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                HStack(alignment: .top, spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                    Text(emptySubtitle)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .multilineTextAlignment(.trailing)
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
        }
        .clipped()
    }
}

private struct VibinnMyMemoryWidgetView: View {
    let entry: VibinnWidgetEntry

    private var currentMemory: NativeWidgetMemorySnapshot? {
        guard let memories = entry.snapshot?.myMemories, !memories.isEmpty else { return nil }
        return memories[entry.myMemoryIndex % memories.count]
    }

    var body: some View {
        Link(destination: URL(string: "vibinn://diary")!) {
            VibinnMemoryPanel(
                memory: currentMemory,
                showsAvatar: false,
                emptyTitle: "No memories yet",
                emptySubtitle: "Log a meal to see it here."
            )
        }
        .buttonStyle(.plain)
        .vibinnWidgetBackground()
    }
}

private struct VibinnFeedMemoryWidgetView: View {
    let entry: VibinnWidgetEntry

    var body: some View {
        Link(destination: URL(string: "vibinn://feed")!) {
            VibinnMemoryPanel(
                memory: entry.snapshot?.feedMemory,
                showsAvatar: true,
                emptyTitle: nil,
                emptySubtitle: "Invite friends to see them here"
            )
        }
        .buttonStyle(.plain)
        .vibinnWidgetBackground()
    }
}

struct VibinnMyMemoryWidget: Widget {
    let kind = "VibinnMyMemoryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VibinnWidgetProvider()) { entry in
            VibinnMyMemoryWidgetView(entry: entry)
        }
        .configurationDisplayName("My Memory")
        .description("Your latest food diary memory.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

struct VibinnFeedMemoryWidget: Widget {
    let kind = "VibinnFeedMemoryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VibinnWidgetProvider()) { entry in
            VibinnFeedMemoryWidgetView(entry: entry)
        }
        .configurationDisplayName("Feed Memory")
        .description("The latest memory from people you follow.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

@main
struct VibinnWidgetsBundle: WidgetBundle {
    var body: some Widget {
        VibinnMyMemoryWidget()
        VibinnFeedMemoryWidget()
    }
}
