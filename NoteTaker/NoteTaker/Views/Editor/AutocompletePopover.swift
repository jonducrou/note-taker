import SwiftUI
import AppKit

/// Popover for tag autocompletion
struct AutocompletePopover: View {
    let suggestions: [String]
    let onSelect: (String) -> Void
    @State private var selectedIndex = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(suggestions.enumerated()), id: \.offset) { index, suggestion in
                HStack {
                    Text(suggestion)
                        .font(.system(size: 12, design: .monospaced))
                    Spacer()
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(index == selectedIndex ? Color.accentColor.opacity(0.2) : Color.clear)
                .onTapGesture {
                    onSelect(suggestion)
                }
            }
        }
        .frame(minWidth: 120)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(6)
        .shadow(radius: 4)
    }

    func moveUp() {
        if selectedIndex > 0 {
            selectedIndex -= 1
        }
    }

    func moveDown() {
        if selectedIndex < suggestions.count - 1 {
            selectedIndex += 1
        }
    }

    func selectCurrent() {
        guard selectedIndex < suggestions.count else { return }
        onSelect(suggestions[selectedIndex])
    }
}

/// Controller for managing autocomplete popover
class AutocompleteController: NSObject {
    private var popover: NSPopover?
    private var suggestions: [String] = []
    private var onSelect: ((String) -> Void)?
    private var triggerType: TriggerType = .group
    private var triggerLocation: Int = 0

    enum TriggerType {
        case group   // #
        case audience // @
    }

    var isVisible: Bool {
        popover?.isShown ?? false
    }

    func show(
        suggestions: [String],
        triggerType: TriggerType,
        triggerLocation: Int,
        at rect: NSRect,
        in view: NSView,
        onSelect: @escaping (String) -> Void
    ) {
        hide()

        guard !suggestions.isEmpty else { return }

        self.suggestions = suggestions
        self.triggerType = triggerType
        self.triggerLocation = triggerLocation
        self.onSelect = onSelect

        let popover = NSPopover()
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 150, height: min(CGFloat(suggestions.count * 24), 200))

        let hostingController = NSHostingController(
            rootView: AutocompletePopover(
                suggestions: suggestions,
                onSelect: { [weak self] suggestion in
                    self?.handleSelection(suggestion)
                }
            )
        )
        popover.contentViewController = hostingController

        popover.show(relativeTo: rect, of: view, preferredEdge: .maxY)
        self.popover = popover
    }

    func hide() {
        popover?.close()
        popover = nil
        suggestions = []
    }

    private func handleSelection(_ suggestion: String) {
        onSelect?(suggestion)
        hide()
    }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        guard isVisible else { return false }

        switch event.keyCode {
        case 125:  // Down arrow
            // Would need to communicate with SwiftUI view
            return true
        case 126:  // Up arrow
            return true
        case 36:   // Enter
            // Select current
            if let first = suggestions.first {
                handleSelection(first)
            }
            return true
        case 53:   // Escape
            hide()
            return true
        default:
            return false
        }
    }
}

// MARK: - Suggestion Fetcher

class SuggestionFetcher {
    static let shared = SuggestionFetcher()

    private let defaultGroups = ["eng", "product", "prodtech", "external"]
    private let defaultAudience = ["team", "manager", "client"]

    func fetchGroupSuggestions(prefix: String) async -> [String] {
        // Try to fetch from storage
        let suggestions = (try? await FileStorageService.shared.getGroupSuggestions()) ?? []

        if suggestions.isEmpty {
            return defaultGroups.filter { $0.lowercased().hasPrefix(prefix.lowercased()) }
        }

        return suggestions.filter { $0.lowercased().hasPrefix(prefix.lowercased()) }
    }

    func fetchAudienceSuggestions(prefix: String) async -> [String] {
        // Try to fetch from storage
        let suggestions = (try? await FileStorageService.shared.getAudienceSuggestions()) ?? []

        if suggestions.isEmpty {
            return defaultAudience.filter { $0.lowercased().hasPrefix(prefix.lowercased()) }
        }

        return suggestions.filter { $0.lowercased().hasPrefix(prefix.lowercased()) }
    }
}
