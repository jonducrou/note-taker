import AppKit

/// Applies syntax highlighting to note content
class SyntaxHighlighter {
    // MARK: - Colours (matching Electron version)

    private let colours = Colours()

    struct Colours {
        let actionIncomplete = NSColor(red: 1.0, green: 0.231, blue: 0.188, alpha: 1.0)     // #FF3B30
        let actionComplete = NSColor(red: 0.204, green: 0.780, blue: 0.349, alpha: 1.0)     // #34C759
        let connectionIncomplete = NSColor(red: 1.0, green: 0.584, blue: 0.0, alpha: 1.0)   // #FF9500
        let connectionComplete = NSColor(red: 0.204, green: 0.780, blue: 0.349, alpha: 1.0) // #34C759
        let groupTag = NSColor(red: 0.0, green: 0.4, blue: 0.8, alpha: 1.0)                 // #0066CC
        let audienceTag = NSColor(red: 0.557, green: 0.267, blue: 0.678, alpha: 1.0)        // #8E44AD
        let aggregatedBackground = NSColor(white: 0.86, alpha: 0.3)                         // Light grey
    }

    // MARK: - Patterns

    private lazy var patterns: [(NSRegularExpression, NSColor, Bool)] = {
        // (regex, colour, isBold)
        var result: [(NSRegularExpression, NSColor, Bool)] = []

        // Complete action: [x] or [X] - green, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*\[[xX]\].*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.actionComplete, true))
        }

        // Incomplete action: [] - red, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*\[\s*\].*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.actionIncomplete, true))
        }

        // Complete connection: -/> or -\> - green, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*-[/\\]>.*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.connectionComplete, true))
        }

        // Complete connection: </- or <\- - green, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*<[/\\]-.*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.connectionComplete, true))
        }

        // Incomplete connection: -> - orange, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*->.*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.connectionIncomplete, true))
        }

        // Incomplete connection: <- - orange, whole line
        if let regex = try? NSRegularExpression(pattern: #"^.*<-.*$"#, options: .anchorsMatchLines) {
            result.append((regex, colours.connectionIncomplete, true))
        }

        // Group tag: #tag - blue
        if let regex = try? NSRegularExpression(pattern: #"#[a-zA-Z][a-zA-Z0-9_-]*"#) {
            result.append((regex, colours.groupTag, true))
        }

        // Audience tag: @name - purple
        if let regex = try? NSRegularExpression(pattern: #"@[a-zA-Z][a-zA-Z0-9_-]*"#) {
            result.append((regex, colours.audienceTag, true))
        }

        return result
    }()

    // MARK: - Highlighting

    func highlight(_ textStorage: NSTextStorage) {
        let text = textStorage.string
        let fullRange = NSRange(location: 0, length: textStorage.length)

        // First, check for aggregation separator
        let aggregatedRange = findAggregatedRange(in: text)

        // Apply patterns
        for (regex, colour, isBold) in patterns {
            let matches = regex.matches(in: text, range: fullRange)

            for match in matches {
                var attributes: [NSAttributedString.Key: Any] = [
                    .foregroundColor: colour
                ]

                if isBold {
                    if let currentFont = textStorage.attribute(.font, at: match.range.location, effectiveRange: nil) as? NSFont {
                        let boldFont = NSFontManager.shared.convert(currentFont, toHaveTrait: .boldFontMask)
                        attributes[.font] = boldFont
                    }
                }

                textStorage.addAttributes(attributes, range: match.range)
            }
        }

        // Apply grey background to aggregated section
        if let aggregatedRange = aggregatedRange {
            textStorage.addAttribute(.backgroundColor, value: colours.aggregatedBackground, range: aggregatedRange)
            textStorage.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: aggregatedRange)
        }
    }

    /// Find the range of aggregated content (after --------)
    private func findAggregatedRange(in text: String) -> NSRange? {
        let separator = "--------"
        guard let separatorRange = text.range(of: separator) else { return nil }

        let startLocation = text.distance(from: text.startIndex, to: separatorRange.lowerBound)
        let length = text.count - startLocation

        return NSRange(location: startLocation, length: length)
    }
}

// MARK: - Attributed String Generation

extension SyntaxHighlighter {
    /// Generate a highlighted attributed string (for preview/export)
    func attributedString(from text: String, font: NSFont = .monospacedSystemFont(ofSize: 12, weight: .regular)) -> NSAttributedString {
        let storage = NSTextStorage(string: text, attributes: [
            .font: font,
            .foregroundColor: NSColor.labelColor
        ])
        highlight(storage)
        return storage
    }
}
