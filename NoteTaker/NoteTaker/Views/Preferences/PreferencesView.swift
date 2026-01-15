import SwiftUI

struct PreferencesView: View {
    @State private var endpoint: String = ""
    @State private var apiKey: String = ""
    @State private var model: String = ""
    @State private var statusMessage: String = ""
    @State private var statusColor: Color = .secondary
    @State private var isTesting: Bool = false
    @State private var connectionVerified: Bool = false
    @State private var originalEndpoint: String = ""
    @State private var originalApiKey: String = ""
    @State private var originalModel: String = ""
    @State private var debugLoggingEnabled: Bool = false

    private let defaults = UserDefaults.standard

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("LLM Configuration")
                .font(.headline)

            Text("Configure the LLM API for action extraction from transcripts.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Divider()

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 12) {
                GridRow {
                    Text("Endpoint:")
                        .frame(width: 80, alignment: .trailing)
                    TextField("https://api.openai.com/v1/chat/completions", text: $endpoint)
                        .textFieldStyle(.roundedBorder)
                }

                GridRow {
                    Text("API Key:")
                        .frame(width: 80, alignment: .trailing)
                    SecureField("Enter your API key", text: $apiKey)
                        .textFieldStyle(.roundedBorder)
                }

                GridRow {
                    Text("Model:")
                        .frame(width: 80, alignment: .trailing)
                    TextField("gpt-4o-mini", text: $model)
                        .textFieldStyle(.roundedBorder)
                }
            }

            Divider()

            // Status area
            HStack {
                if isTesting {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Testing connection...")
                        .foregroundColor(.secondary)
                } else if !statusMessage.isEmpty {
                    Image(systemName: statusColor == .green ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundColor(statusColor)
                    Text(statusMessage)
                        .foregroundColor(statusColor)
                } else if apiKey.isEmpty {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text("Enter API key to test connection")
                        .foregroundColor(.orange)
                } else if needsVerification {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(.blue)
                    Text("Click 'Test Connection' to verify settings")
                        .foregroundColor(.blue)
                }
                Spacer()
            }
            .frame(height: 24)

            Divider()

            // Debug Logging Section
            VStack(alignment: .leading, spacing: 8) {
                Text("Debug Logging")
                    .font(.headline)

                Toggle(isOn: $debugLoggingEnabled) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Enable debug logging")
                        Text("Logs saved to ~/Library/Logs/NoteTaker/")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .onChange(of: debugLoggingEnabled) { newValue in
                    defaults.set(newValue, forKey: "debug_logging_enabled")
                }
            }

            Spacer()

            // Buttons
            HStack {
                Spacer()

                Button("Test Connection") {
                    testConnection()
                }
                .disabled(isTesting || endpoint.isEmpty || apiKey.isEmpty)

                Button("Save") {
                    saveSettings()
                }
                .buttonStyle(.borderedProminent)
                .disabled(needsVerification || isTesting)
            }
        }
        .padding(20)
        .frame(width: 500, height: 400)
        .onAppear {
            loadSettings()
        }
    }

    private var hasChanges: Bool {
        endpoint != originalEndpoint || apiKey != originalApiKey || model != originalModel
    }

    private var needsVerification: Bool {
        if apiKey.isEmpty { return true }
        if hasChanges && !connectionVerified { return true }
        return false
    }

    private func loadSettings() {
        endpoint = defaults.string(forKey: "llm_endpoint") ?? "https://api.openai.com/v1/chat/completions"
        apiKey = defaults.string(forKey: "llm_api_key") ?? ""
        model = defaults.string(forKey: "llm_model") ?? "gpt-4o-mini"
        debugLoggingEnabled = defaults.bool(forKey: "debug_logging_enabled")

        originalEndpoint = endpoint
        originalApiKey = apiKey
        originalModel = model

        if !apiKey.isEmpty {
            connectionVerified = true
        }
    }

    private func testConnection() {
        isTesting = true
        statusMessage = ""

        Task {
            do {
                try await testLLMEndpoint()
                await MainActor.run {
                    statusMessage = "Connection successful"
                    statusColor = .green
                    connectionVerified = true
                    isTesting = false
                }
            } catch {
                await MainActor.run {
                    statusMessage = error.localizedDescription
                    statusColor = .red
                    connectionVerified = false
                    isTesting = false
                }
            }
        }
    }

    private func testLLMEndpoint() async throws {
        guard let url = URL(string: endpoint) else {
            throw TestError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let testModel = model.isEmpty ? "gpt-4o-mini" : model
        let body: [String: Any] = [
            "model": testModel,
            "messages": [
                ["role": "user", "content": "Say 'OK' and nothing else."]
            ],
            "max_tokens": 5
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw TestError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorJson["error"] as? [String: Any],
               let message = error["message"] as? String {
                throw TestError.apiError(message)
            }
            throw TestError.httpError(httpResponse.statusCode)
        }
    }

    private func saveSettings() {
        let modelToSave = model.isEmpty ? "gpt-4o-mini" : model

        defaults.set(endpoint, forKey: "llm_endpoint")
        defaults.set(apiKey, forKey: "llm_api_key")
        defaults.set(modelToSave, forKey: "llm_model")

        originalEndpoint = endpoint
        originalApiKey = apiKey
        originalModel = modelToSave
        model = modelToSave

        Task {
            await ActionExtractionService.shared.loadConfiguration()
        }

        statusMessage = "Settings saved"
        statusColor = .green
    }
}

enum TestError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(Int)
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .httpError(let code):
            return "HTTP \(code)"
        case .apiError(let message):
            return message
        }
    }
}

#Preview {
    PreferencesView()
}
