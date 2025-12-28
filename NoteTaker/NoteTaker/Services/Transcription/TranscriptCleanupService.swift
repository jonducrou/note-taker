import Foundation

/// Service for cleaning up raw transcripts using an LLM
actor TranscriptCleanupService {
    static let shared = TranscriptCleanupService()

    // MARK: - Configuration

    struct Config {
        var endpoint: String  // OpenAI-compatible API endpoint
        var apiKey: String
        var model: String
        var identifySpeakers: Bool

        static var `default`: Config {
            Config(
                endpoint: "https://api.openai.com/v1/chat/completions",
                apiKey: "",
                model: "gpt-4o-mini",
                identifySpeakers: true
            )
        }
    }

    private var config: Config = .default

    // MARK: - Configuration

    func configure(endpoint: String, apiKey: String, model: String = "gpt-4o-mini", identifySpeakers: Bool = true) {
        config = Config(
            endpoint: endpoint,
            apiKey: apiKey,
            model: model,
            identifySpeakers: identifySpeakers
        )
    }

    var isConfigured: Bool {
        !config.apiKey.isEmpty
    }

    // MARK: - Transcript Cleanup

    /// Clean up a raw transcript using the configured LLM
    func cleanupTranscript(_ rawTranscript: String) async throws -> CleanedTranscript {
        guard isConfigured else {
            throw CleanupError.notConfigured
        }

        let prompt = buildPrompt(for: rawTranscript)
        let response = try await callLLM(prompt: prompt)

        return parseResponse(response)
    }

    // MARK: - Private

    private func buildPrompt(for transcript: String) -> String {
        var prompt = """
        You are a transcript cleanup assistant. Clean up the following raw speech-to-text transcript.

        Your tasks:
        1. Fix obvious transcription errors and typos
        2. Add proper punctuation and capitalisation
        3. Remove filler words (um, uh, like, you know) unless they're meaningful
        4. Format into clear paragraphs
        """

        if config.identifySpeakers {
            prompt += """

        5. If you can identify different speakers based on context, label them as [Speaker 1], [Speaker 2], etc.
           Look for conversational patterns, topic changes, or back-and-forth exchanges.
        """
        }

        prompt += """

        Return the cleaned transcript in this JSON format:
        {
            "cleaned_text": "The cleaned transcript text",
            "speakers_identified": true/false,
            "speaker_count": 0,
            "summary": "Optional 1-2 sentence summary of the content"
        }

        Raw transcript:
        ---
        \(transcript)
        ---
        """

        return prompt
    }

    private func callLLM(prompt: String) async throws -> String {
        guard let url = URL(string: config.endpoint) else {
            throw CleanupError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": config.model,
            "messages": [
                ["role": "system", "content": "You are a helpful transcript cleanup assistant."],
                ["role": "user", "content": prompt]
            ],
            "temperature": 0.3,
            "response_format": ["type": "json_object"]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw CleanupError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorJson["error"] as? [String: Any],
               let message = error["message"] as? String {
                throw CleanupError.apiError(message)
            }
            throw CleanupError.apiError("HTTP \(httpResponse.statusCode)")
        }

        // Parse OpenAI response
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw CleanupError.parseError
        }

        return content
    }

    private func parseResponse(_ response: String) -> CleanedTranscript {
        guard let data = response.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return CleanedTranscript(
                cleanedText: response,
                speakersIdentified: false,
                speakerCount: 0,
                summary: nil
            )
        }

        return CleanedTranscript(
            cleanedText: json["cleaned_text"] as? String ?? response,
            speakersIdentified: json["speakers_identified"] as? Bool ?? false,
            speakerCount: json["speaker_count"] as? Int ?? 0,
            summary: json["summary"] as? String
        )
    }
}

// MARK: - Types

struct CleanedTranscript {
    let cleanedText: String
    let speakersIdentified: Bool
    let speakerCount: Int
    let summary: String?
}

enum CleanupError: LocalizedError {
    case notConfigured
    case invalidEndpoint
    case invalidResponse
    case parseError
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "LLM cleanup not configured. Please set API endpoint and key."
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

// MARK: - Settings Storage

extension TranscriptCleanupService {
    private static let endpointKey = "llm_endpoint"
    private static let apiKeyKey = "llm_api_key"
    private static let modelKey = "llm_model"
    private static let identifySpeakersKey = "llm_identify_speakers"

    /// Load configuration from UserDefaults
    func loadConfiguration() {
        let defaults = UserDefaults.standard

        if let endpoint = defaults.string(forKey: Self.endpointKey),
           let apiKey = defaults.string(forKey: Self.apiKeyKey) {
            configure(
                endpoint: endpoint,
                apiKey: apiKey,
                model: defaults.string(forKey: Self.modelKey) ?? "gpt-4o-mini",
                identifySpeakers: defaults.bool(forKey: Self.identifySpeakersKey)
            )
        }
    }

    /// Save configuration to UserDefaults
    func saveConfiguration() {
        let defaults = UserDefaults.standard
        defaults.set(config.endpoint, forKey: Self.endpointKey)
        defaults.set(config.apiKey, forKey: Self.apiKeyKey)
        defaults.set(config.model, forKey: Self.modelKey)
        defaults.set(config.identifySpeakers, forKey: Self.identifySpeakersKey)
    }
}
