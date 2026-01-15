import AppKit
import Carbon.HIToolbox

/// Manager for global keyboard shortcuts
class HotkeyManager {
    private var eventHandler: EventHandlerRef?
    private var hotkeyRef: EventHotKeyRef?
    private var callback: (() -> Void)?

    private static var sharedInstance: HotkeyManager?

    init() {
        HotkeyManager.sharedInstance = self
    }

    deinit {
        unregister()
    }

    /// Register a global hotkey
    /// - Parameters:
    ///   - keyCode: The key code (e.g., 45 for 'N')
    ///   - modifiers: The modifier keys
    ///   - callback: The action to perform when triggered
    func register(keyCode: UInt32, modifiers: NSEvent.ModifierFlags, callback: @escaping () -> Void) {
        self.callback = callback

        Logger.info("Registering global hotkey (keyCode: \(keyCode))", log: Logger.general)

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let status = InstallEventHandler(
            GetApplicationEventTarget(),
            { (_, _, _) -> OSStatus in
                HotkeyManager.sharedInstance?.callback?()
                return noErr
            },
            1,
            &eventType,
            nil,
            &eventHandler
        )

        guard status == noErr else {
            Logger.error("Failed to install event handler: \(status)", log: Logger.general)
            return
        }

        var carbonModifiers: UInt32 = 0
        if modifiers.contains(.command) {
            carbonModifiers |= UInt32(cmdKey)
        }
        if modifiers.contains(.shift) {
            carbonModifiers |= UInt32(shiftKey)
        }
        if modifiers.contains(.option) {
            carbonModifiers |= UInt32(optionKey)
        }
        if modifiers.contains(.control) {
            carbonModifiers |= UInt32(controlKey)
        }

        let hotkeyID = EventHotKeyID(
            signature: OSType(0x4E544B52),  // "NTKR" - Note Taker
            id: 1
        )

        let registerStatus = RegisterEventHotKey(
            keyCode,
            carbonModifiers,
            hotkeyID,
            GetApplicationEventTarget(),
            0,
            &hotkeyRef
        )

        if registerStatus == noErr {
            Logger.info("Global hotkey registered successfully", log: Logger.general)
        } else {
            Logger.error("Failed to register global hotkey: \(registerStatus)", log: Logger.general)
        }
    }

    /// Unregister the global hotkey
    func unregister() {
        if let hotkeyRef = hotkeyRef {
            UnregisterEventHotKey(hotkeyRef)
            self.hotkeyRef = nil
        }

        if let eventHandler = eventHandler {
            RemoveEventHandler(eventHandler)
            self.eventHandler = nil
        }

        callback = nil
    }
}

// MARK: - Key Codes

extension HotkeyManager {
    /// Common key codes for reference
    enum KeyCode: UInt32 {
        case n = 45
        case space = 49
        case escape = 53
    }
}
