import Foundation

/// Service for extracting actionable items from transcripts using an LLM
actor ActionExtractionService {
    static let shared = ActionExtractionService()

    // MARK: - Pending Extraction Tracking

    private var pendingExtractions: Int = 0

    /// Check if any extractions are in progress
    var hasPendingExtractions: Bool {
        pendingExtractions > 0
    }

    /// Wait for all pending extractions to complete (with timeout)
    func waitForPendingExtractions(timeout: TimeInterval = 30) async {
        let deadline = Date().addingTimeInterval(timeout)
        while pendingExtractions > 0 && Date() < deadline {
            try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms
        }
    }

    // MARK: - Configuration (shared with TranscriptCleanupService)

    private var endpoint: String = "https://api.openai.com/v1/chat/completions"
    private var apiKey: String = ""
    private var model: String = "gpt-4o-mini"

    func configure(endpoint: String, apiKey: String, model: String = "gpt-4o-mini") {
        self.endpoint = endpoint
        self.apiKey = apiKey
        self.model = model
    }

    var isConfigured: Bool {
        !apiKey.isEmpty
    }

    /// Load configuration from UserDefaults (same keys as TranscriptCleanupService)
    func loadConfiguration() {
        let defaults = UserDefaults.standard
        if let endpoint = defaults.string(forKey: "llm_endpoint"),
           let apiKey = defaults.string(forKey: "llm_api_key") {
            configure(
                endpoint: endpoint,
                apiKey: apiKey,
                model: defaults.string(forKey: "llm_model") ?? "gpt-4o-mini"
            )
        }
    }

    // MARK: - Action Extraction

    /// Process a transcript and note content to extract actionable items
    func extractActions(
        transcript: String,
        noteContent: String,
        noteId: String,
        tags: [String]
    ) async throws -> [ExtractedAction] {
        guard isConfigured else {
            throw ExtractionError.notConfigured
        }

        // Track pending extraction
        pendingExtractions += 1

        defer {
            pendingExtractions -= 1
        }

        let prompt = buildPrompt(transcript: transcript, noteContent: noteContent)
        let response = try await callLLM(prompt: prompt)
        var actions = parseResponse(response)

        // Add metadata to each action
        for i in actions.indices {
            actions[i].noteId = noteId
            actions[i].tags = tags
            actions[i].extractedAt = Date()
        }

        return actions
    }

    /// Save extracted actions to a file
    func saveActions(_ actions: [ExtractedAction], for noteId: String) async throws {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let actionsPath = notesDir.appendingPathComponent("\(noteId).actions")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let data = try encoder.encode(actions)
        try data.write(to: actionsPath)
    }

    /// Load extracted actions for a note
    func loadActions(for noteId: String) async throws -> [ExtractedAction] {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let actionsPath = notesDir.appendingPathComponent("\(noteId).actions")

        guard FileManager.default.fileExists(atPath: actionsPath.path) else {
            return []
        }

        let data = try Data(contentsOf: actionsPath)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        return try decoder.decode([ExtractedAction].self, from: data)
    }

    /// Find all extracted actions matching any of the given tags
    func findActions(matchingTags tags: [String], days: Int = 30) async throws -> [ExtractedAction] {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let lowercaseTags = Set(tags.map { $0.lowercased() })

        var matchingActions: [ExtractedAction] = []

        let files = try FileManager.default.contentsOfDirectory(at: notesDir, includingPropertiesForKeys: nil)

        for file in files where file.pathExtension == "actions" {
            guard let data = try? Data(contentsOf: file) else { continue }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            guard let actions = try? decoder.decode([ExtractedAction].self, from: data) else { continue }

            for action in actions {
                // Check if action is recent enough
                guard let extractedAt = action.extractedAt, extractedAt >= cutoff else { continue }

                // Check if any tags match
                let actionTags = Set(action.tags.map { $0.lowercased() })
                guard !lowercaseTags.isDisjoint(with: actionTags) else { continue }

                matchingActions.append(action)
            }
        }

        // Sort by importance (business first), then by date
        return matchingActions.sorted { a, b in
            if a.importance != b.importance {
                return a.importance.rawValue > b.importance.rawValue
            }
            return (a.extractedAt ?? .distantPast) > (b.extractedAt ?? .distantPast)
        }
    }

    // MARK: - Private

    private func buildPrompt(transcript: String, noteContent: String) -> String {
        """
        You are an action extraction assistant. Analyse the following transcript and note content to extract:

        1. **Key Actions** - Tasks, decisions, or next steps that need to be taken
           - Prioritise BUSINESS actions over personal ones
           - Include who is responsible if mentioned
           - Include any deadlines or timeframes mentioned

        2. **Commitments** - Promises or agreements made by anyone in the discussion
           - What was promised
           - Who made the commitment
           - To whom it was made
           - Any timeline mentioned

        3. **Expectations** - Things people are expecting to happen or be delivered
           - What is expected
           - Who set the expectation
           - Any implied deadlines

        Rate each item's importance as:
        - "critical" - Business-critical, time-sensitive, or high-impact
        - "high" - Important business matter
        - "medium" - Standard follow-up item
        - "low" - Nice-to-have or personal matter

        Return the extracted items in this JSON format:
        {
            "actions": [
                {
                    "text": "Description of the action/commitment/expectation",
                    "type": "action" | "commitment" | "expectation",
                    "importance": "critical" | "high" | "medium" | "low",
                    "owner": "Person responsible (if known)",
                    "deadline": "Any mentioned deadline or timeframe",
                    "context": "Brief context about why this matters"
                }
            ]
        }

        If no actionable items are found, return: {"actions": []}

        ---
        TRANSCRIPT:
        \(transcript)

        ---
        NOTE CONTENT:
        \(noteContent)
        ---
        """
    }

    private func callLLM(prompt: String) async throws -> String {
        guard let url = URL(string: endpoint) else {
            throw ExtractionError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": model,
            "messages": [
                ["role": "system", "content": "You are a precise action extraction assistant. Extract actionable items from discussions."],
                ["role": "user", "content": prompt]
            ],
            "temperature": 0.2,
            "response_format": ["type": "json_object"]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ExtractionError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorJson["error"] as? [String: Any],
               let message = error["message"] as? String {
                throw ExtractionError.apiError(message)
            }
            throw ExtractionError.apiError("HTTP \(httpResponse.statusCode)")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw ExtractionError.parseError
        }

        return content
    }

    // Internal for testing
    func parseResponse(_ response: String) -> [ExtractedAction] {
        guard let data = response.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let actionsArray = json["actions"] as? [[String: Any]] else {
            return []
        }

        return actionsArray.compactMap { dict -> ExtractedAction? in
            guard let text = dict["text"] as? String else { return nil }

            let typeString = dict["type"] as? String ?? "action"
            let type: ExtractedAction.ActionType = {
                switch typeString {
                case "commitment": return .commitment
                case "expectation": return .expectation
                default: return .action
                }
            }()

            let importanceString = dict["importance"] as? String ?? "medium"
            let importance: ExtractedAction.Importance = {
                switch importanceString {
                case "critical": return .critical
                case "high": return .high
                case "low": return .low
                default: return .medium
                }
            }()

            return ExtractedAction(
                text: text,
                type: type,
                importance: importance,
                owner: dict["owner"] as? String,
                deadline: dict["deadline"] as? String,
                context: dict["context"] as? String,
                noteId: "",
                tags: [],
                extractedAt: nil
            )
        }
    }
}

// MARK: - Data Models

struct ExtractedAction: Codable, Identifiable {
    var id: UUID = UUID()
    let text: String
    let type: ActionType
    let importance: Importance
    let owner: String?
    let deadline: String?
    let context: String?
    var noteId: String
    var tags: [String]
    var extractedAt: Date?

    enum ActionType: String, Codable {
        case action
        case commitment
        case expectation
    }

    enum Importance: Int, Codable, Comparable {
        case low = 0
        case medium = 1
        case high = 2
        case critical = 3

        static func < (lhs: Importance, rhs: Importance) -> Bool {
            lhs.rawValue < rhs.rawValue
        }
    }
}

// MARK: - Errors

enum ExtractionError: LocalizedError {
    case notConfigured
    case invalidEndpoint
    case invalidResponse
    case parseError
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Action extraction not configured. Please set API endpoint and key."
        case .invalidEndpoint:
            return "Invalid API endpoint URL"
        case .invalidResponse:
            return "Invalid response from API"
        case .parseError:
            return "Failed to parse API response"
        case .apiError(let message):
            return "API error: \(message)"
        }
    }
}
