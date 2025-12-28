import SwiftUI

struct HeaderView: View {
    let title: String
    let isRecording: Bool
    let isInitialising: Bool
    let isProcessingTranscript: Bool
    let onNewNote: () -> Void

    var body: some View {
        HStack {
            // Draggable area for window movement
            Color.clear
                .frame(width: 72)  // Space for traffic lights

            // Title and status
            HStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.primary.opacity(0.8))

                // Status indicator
                statusIndicator
            }

            Spacer()

            // New button
            Button(action: onNewNote) {
                Text("New")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary.opacity(0.7))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.primary.opacity(0.1))
                    .cornerRadius(4)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 12)
        }
        .frame(height: 32)
        .background(Color.clear)
    }

    @ViewBuilder
    private var statusIndicator: some View {
        if isInitialising {
            PulsingDot(color: .yellow)
        } else if isRecording {
            PulsingDot(color: .red)
        } else if isProcessingTranscript {
            PulsingDot(color: .blue)
        }
    }
}

struct PulsingDot: View {
    let color: Color
    @State private var isPulsing = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .scaleEffect(isPulsing ? 1.2 : 1.0)
            .opacity(isPulsing ? 0.4 : 1.0)
            .animation(
                .easeInOut(duration: 0.6)
                .repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear {
                isPulsing = true
            }
    }
}

#Preview {
    VStack(spacing: 20) {
        HeaderView(
            title: "Tue 26 Aug 14:31",
            isRecording: false,
            isInitialising: true,
            isProcessingTranscript: false,
            onNewNote: {}
        )
        HeaderView(
            title: "Wed 27 Aug 09:15",
            isRecording: true,
            isInitialising: false,
            isProcessingTranscript: false,
            onNewNote: {}
        )
        HeaderView(
            title: "Note Taker",
            isRecording: false,
            isInitialising: false,
            isProcessingTranscript: true,
            onNewNote: {}
        )
    }
    .frame(width: 300)
    .padding()
}
