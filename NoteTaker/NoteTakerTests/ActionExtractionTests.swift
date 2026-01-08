import XCTest
@testable import NoteTaker

final class ActionExtractionParseTests: XCTestCase {

    var service: ActionExtractionService!

    override func setUp() async throws {
        service = ActionExtractionService.shared
    }

    // MARK: - Valid Response Parsing

    func testParseValidResponse() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Follow up with design team",
                    "type": "action",
                    "importance": "high",
                    "owner": "Sarah",
                    "deadline": "Friday",
                    "context": "Discussed in product sync"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 1)
        XCTAssertEqual(actions[0].text, "Follow up with design team")
        XCTAssertEqual(actions[0].type, .action)
        XCTAssertEqual(actions[0].importance, .high)
        XCTAssertEqual(actions[0].owner, "Sarah")
        XCTAssertEqual(actions[0].deadline, "Friday")
        XCTAssertEqual(actions[0].context, "Discussed in product sync")
    }

    func testParseMultipleActions() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Review proposal",
                    "type": "action",
                    "importance": "critical"
                },
                {
                    "text": "Send report by Monday",
                    "type": "commitment",
                    "importance": "high"
                },
                {
                    "text": "Client expects delivery next week",
                    "type": "expectation",
                    "importance": "medium"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 3)

        XCTAssertEqual(actions[0].type, .action)
        XCTAssertEqual(actions[0].importance, .critical)

        XCTAssertEqual(actions[1].type, .commitment)
        XCTAssertEqual(actions[1].importance, .high)

        XCTAssertEqual(actions[2].type, .expectation)
        XCTAssertEqual(actions[2].importance, .medium)
    }

    // MARK: - Empty/Invalid Responses

    func testParseEmptyActions() async {
        let response = """
        {
            "actions": []
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertTrue(actions.isEmpty)
    }

    func testParseInvalidJSON() async {
        let response = "not valid json"

        let actions = await service.parseResponse(response)

        XCTAssertTrue(actions.isEmpty)
    }

    func testParseMissingActionsKey() async {
        let response = """
        {
            "items": [
                {"text": "Something"}
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertTrue(actions.isEmpty)
    }

    func testParseEmptyString() async {
        let actions = await service.parseResponse("")

        XCTAssertTrue(actions.isEmpty)
    }

    // MARK: - Partial Fields

    func testParseMinimalAction() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Just the text"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 1)
        XCTAssertEqual(actions[0].text, "Just the text")
        XCTAssertEqual(actions[0].type, .action)  // Default
        XCTAssertEqual(actions[0].importance, .medium)  // Default
        XCTAssertNil(actions[0].owner)
        XCTAssertNil(actions[0].deadline)
        XCTAssertNil(actions[0].context)
    }

    func testParseMissingText() async {
        let response = """
        {
            "actions": [
                {
                    "type": "action",
                    "importance": "high"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        // Should skip actions without text
        XCTAssertTrue(actions.isEmpty)
    }

    func testParseMixedValidInvalid() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Valid action"
                },
                {
                    "importance": "high"
                },
                {
                    "text": "Another valid action"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        // Should only include actions with text
        XCTAssertEqual(actions.count, 2)
        XCTAssertEqual(actions[0].text, "Valid action")
        XCTAssertEqual(actions[1].text, "Another valid action")
    }

    // MARK: - Type Parsing

    func testParseAllActionTypes() async {
        let response = """
        {
            "actions": [
                {"text": "Action item", "type": "action"},
                {"text": "Commitment item", "type": "commitment"},
                {"text": "Expectation item", "type": "expectation"},
                {"text": "Unknown type", "type": "unknown"}
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions[0].type, .action)
        XCTAssertEqual(actions[1].type, .commitment)
        XCTAssertEqual(actions[2].type, .expectation)
        XCTAssertEqual(actions[3].type, .action)  // Unknown defaults to action
    }

    // MARK: - Importance Parsing

    func testParseAllImportanceLevels() async {
        let response = """
        {
            "actions": [
                {"text": "Critical", "importance": "critical"},
                {"text": "High", "importance": "high"},
                {"text": "Medium", "importance": "medium"},
                {"text": "Low", "importance": "low"},
                {"text": "Unknown", "importance": "unknown"}
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions[0].importance, .critical)
        XCTAssertEqual(actions[1].importance, .high)
        XCTAssertEqual(actions[2].importance, .medium)
        XCTAssertEqual(actions[3].importance, .low)
        XCTAssertEqual(actions[4].importance, .medium)  // Unknown defaults to medium
    }

    // MARK: - Edge Cases

    func testParseWithWhitespace() async {
        let response = """

        {
            "actions": [
                {
                    "text": "  Trimmed text  ",
                    "owner": "  Sarah  "
                }
            ]
        }

        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 1)
        // Note: JSON parsing preserves whitespace in strings
        XCTAssertEqual(actions[0].text, "  Trimmed text  ")
        XCTAssertEqual(actions[0].owner, "  Sarah  ")
    }

    func testParseUnicodeContent() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Réunion avec l'équipe 日本語",
                    "owner": "José García"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 1)
        XCTAssertEqual(actions[0].text, "Réunion avec l'équipe 日本語")
        XCTAssertEqual(actions[0].owner, "José García")
    }

    func testParseSpecialCharacters() async {
        let response = """
        {
            "actions": [
                {
                    "text": "Fix bug in 'parser' module",
                    "context": "Issue #123 - needs \\"immediate\\" attention"
                }
            ]
        }
        """

        let actions = await service.parseResponse(response)

        XCTAssertEqual(actions.count, 1)
        XCTAssertEqual(actions[0].text, "Fix bug in 'parser' module")
        XCTAssertTrue(actions[0].context?.contains("immediate") ?? false)
    }
}

// MARK: - Configuration Tests

final class ActionExtractionConfigTests: XCTestCase {

    func testIsConfiguredWhenEmpty() async {
        let service = ActionExtractionService.shared
        // Note: Can't easily test without affecting shared state
        // Just verify the property exists and is accessible
        let _ = await service.isConfigured
    }
}
