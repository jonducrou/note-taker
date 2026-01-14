import SwiftUI

/// Tab view showing related actions from notes with matching audience
struct ActionsTabView: View {
    let relatedActions: [RelatedAction]
    let extractedInsights: [ExtractedAction]
    let globalActions: [RelatedAction]
    let showGlobalView: Bool
    let onToggleGlobalView: () -> Void
    let onNavigateToNote: (String) -> Void

    private var displayedActions: [RelatedAction] {
        showGlobalView ? globalActions : relatedActions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with mode toggle
            HStack {
                Image(systemName: "checklist")
                    .foregroundColor(.secondary)

                // Mode toggle buttons
                HStack(spacing: 4) {
                    Button(action: {
                        if showGlobalView { onToggleGlobalView() }
                    }) {
                        Text("Context")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(showGlobalView ? Color.clear : Color.accentColor.opacity(0.2))
                            .cornerRadius(4)
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(showGlobalView ? .secondary : .accentColor)

                    Button(action: {
                        if !showGlobalView { onToggleGlobalView() }
                    }) {
                        Text("All")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(showGlobalView ? Color.accentColor.opacity(0.2) : Color.clear)
                            .cornerRadius(4)
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(showGlobalView ? .accentColor : .secondary)
                }

                Spacer()
                Text("\(totalActionCount)")
                    .font(.caption)
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.accentColor)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            // Actions list
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    // Extracted insights section (from LLM) - only in context mode
                    if !showGlobalView && !extractedInsights.isEmpty {
                        ExtractedInsightsSection(
                            insights: extractedInsights,
                            onNavigateToNote: onNavigateToNote
                        )
                    }

                    // Note-based actions
                    ForEach(displayedActions, id: \.noteId) { related in
                        RelatedActionGroupView(
                            related: related,
                            onTap: { onNavigateToNote(related.noteId) }
                        )
                    }

                    // Empty state for global view
                    if showGlobalView && displayedActions.isEmpty {
                        Text("No incomplete actions")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var totalActionCount: Int {
        let noteActions = displayedActions.reduce(0) { $0 + $1.actions.count + $1.connections.count }
        return showGlobalView ? noteActions : noteActions + extractedInsights.count
    }
}

/// Group of actions from a single note
struct RelatedActionGroupView: View {
    let related: RelatedAction
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Note header
            Button(action: onTap) {
                HStack {
                    Text(related.noteTitle)
                        .font(.caption)
                        .fontWeight(.medium)
                    Text("(\(related.formattedDate))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.top, 8)

            // Actions
            ForEach(Array(related.actions.enumerated()), id: \.offset) { _, action in
                ActionItemView(text: action.text, isConnection: false)
                    .onTapGesture { onTap() }
            }

            // Connections
            ForEach(Array(related.connections.enumerated()), id: \.offset) { _, connection in
                ActionItemView(text: connection.subject, isConnection: true)
                    .onTapGesture { onTap() }
            }
        }
        .padding(.bottom, 8)

        Divider()
            .padding(.leading, 12)
    }
}

/// Single action item
struct ActionItemView: View {
    let text: String
    let isConnection: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if isConnection {
                Image(systemName: "arrow.right")
                    .font(.caption2)
                    .foregroundColor(.orange)
                    .frame(width: 14)
            } else {
                Image(systemName: "square")
                    .font(.caption2)
                    .foregroundColor(.blue)
                    .frame(width: 14)
            }
            Text(text)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(2)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

/// Section for LLM-extracted insights
struct ExtractedInsightsSection: View {
    let insights: [ExtractedAction]
    let onNavigateToNote: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Section header
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)
                Text("Insights from Discussions")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            // Group by importance
            ForEach(groupedInsights, id: \.0) { importance, items in
                ForEach(items) { insight in
                    ExtractedInsightRow(insight: insight) {
                        onNavigateToNote(insight.noteId)
                    }
                }
            }
        }
        .padding(.bottom, 8)

        Divider()
            .padding(.leading, 12)
    }

    private var groupedInsights: [(ExtractedAction.Importance, [ExtractedAction])] {
        let grouped = Dictionary(grouping: insights) { $0.importance }
        let order: [ExtractedAction.Importance] = [.critical, .high, .medium, .low]
        return order.compactMap { importance in
            guard let items = grouped[importance], !items.isEmpty else { return nil }
            return (importance, items)
        }
    }
}

/// Single extracted insight row
struct ExtractedInsightRow: View {
    let insight: ExtractedAction
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 6) {
                // Type icon
                Image(systemName: iconName)
                    .font(.caption2)
                    .foregroundColor(iconColor)
                    .frame(width: 14)

                VStack(alignment: .leading, spacing: 2) {
                    Text(insight.text)
                        .font(.caption)
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 4) {
                        // Importance badge
                        Text(importanceLabel)
                            .font(.system(size: 9))
                            .foregroundColor(importanceColor)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(importanceColor.opacity(0.15))
                            .cornerRadius(3)

                        // Owner if present
                        if let owner = insight.owner {
                            Text(owner)
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                        }

                        // Deadline if present
                        if let deadline = insight.deadline {
                            Text(deadline)
                                .font(.system(size: 9))
                                .foregroundColor(.orange)
                        }
                    }
                }

                Spacer()
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var iconName: String {
        switch insight.type {
        case .action: return "checkmark.circle"
        case .commitment: return "handshake"
        case .expectation: return "eye"
        }
    }

    private var iconColor: Color {
        switch insight.type {
        case .action: return .blue
        case .commitment: return .purple
        case .expectation: return .green
        }
    }

    private var importanceLabel: String {
        switch insight.importance {
        case .critical: return "CRITICAL"
        case .high: return "HIGH"
        case .medium: return "MED"
        case .low: return "LOW"
        }
    }

    private var importanceColor: Color {
        switch insight.importance {
        case .critical: return .red
        case .high: return .orange
        case .medium: return .blue
        case .low: return .secondary
        }
    }
}

#Preview {
    ActionsTabView(
        relatedActions: [
            RelatedAction(
                noteId: "2024-01-01_120000",
                noteTitle: "Team Meeting",
                noteDate: Date(),
                actions: [
                    Action(text: "Review proposal", isCompleted: false, lineNumber: 1),
                    Action(text: "Send follow-up email", isCompleted: false, lineNumber: 2)
                ],
                connections: []
            )
        ],
        extractedInsights: [
            ExtractedAction(
                text: "Follow up with design team about new mockups",
                type: .action,
                importance: .high,
                owner: "Sarah",
                deadline: "Friday",
                context: "Discussed in product sync",
                noteId: "2024-01-01_100000",
                tags: ["sarah", "design"],
                extractedAt: Date()
            ),
            ExtractedAction(
                text: "Mike committed to delivering API docs by EOW",
                type: .commitment,
                importance: .critical,
                owner: "Mike",
                deadline: "End of week",
                context: nil,
                noteId: "2024-01-01_090000",
                tags: ["mike", "api"],
                extractedAt: Date()
            )
        ],
        globalActions: [],
        showGlobalView: false,
        onToggleGlobalView: {},
        onNavigateToNote: { _ in }
    )
    .frame(width: 280, height: 400)
}
