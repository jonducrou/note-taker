# Note Taker App - Implementation Plan & Strategy

## 🎯 Project Vision
Create a minimalist, always-on-top note-taking app for Mac that prioritises text-first interaction, quick capture, and actionable follow-ups. The app should feel like a natural extension of the user's workflow without being intrusive.

## 📋 Implementation Strategy

### Phase 1: Foundation (✅ Completed)
**Objective**: Establish core architecture and basic functionality
- **Technology Choice**: Electron + React + TypeScript for cross-platform potential with native Mac feel
- **Window Management**: Always-on-top, compact window (300x400px) with system tray integration
- **Storage Strategy**: Local markdown files with abstract interface for future cloud sync
- **Development Approach**: Text-first design philosophy - minimal UI chrome, maximum writing space

### Phase 2: Smart Text Features (✅ Completed)
**Objective**: Make plain text intelligent and interactive
- **Syntax Highlighting**: Custom Monaco language for notes with colour-coded elements
- **Metadata Parsing**: Inline `@group:` and `@audience:` tags for organisation
- **Interactive Elements**: Click-to-complete for actions (`[]` ↔ `[x]`) and connections (`->` ↔ `-x>`)
- **Auto-completion**: Context-aware suggestions for groups and audience members

### Phase 3: Navigation & Search (✅ Completed)
**Objective**: Efficient note discovery and management
- **Text Commands**: Keyboard-driven navigation with `/today`, `/recent`, `/search:`, etc.
- **Command Palette**: Cmd+K shortcut for quick access to all functions
- **Cross-note Intelligence**: Aggregated view of incomplete items across all notes
- **Auto-save**: Seamless persistence without user intervention

### Phase 4: System Integration (✅ Completed)
**Objective**: Native Mac experience with always-available access
- **Global Hotkey**: Cmd+Shift+N for instant show/hide from any app
- **System Tray**: Persistent access with completion status badge
- **Window Behaviour**: Auto-hide on focus loss, always-on-top when visible
- **Performance**: Lightweight footprint, instant startup

### Phase 5: Menu Bar Enhancement (🔄 In Progress)
**Objective**: Improve system tray interaction with distinct click behaviours
- **Left Click**: Simple show/hide window toggle (no menu popup)
- **Right Click**: Contextual menu with hierarchical note access
- **Menu Structure**: Today/Yesterday/Previous Week with group/audience submenus
- **Incomplete Counters**: Show actionable items count per note group
- **Always Fresh**: Ensure run script always builds latest version

## 🏗️ Architecture Decisions

### **Text-First Philosophy**
- **95% text area**: Maximum space for content, minimal UI distractions
- **No traditional menus**: Everything accessible via text commands or keyboard shortcuts
- **Inline metadata**: Structure embedded in content rather than separate fields
- **Smart defaults**: Sensible behaviour without configuration

### **Storage Strategy**
- **Local-first**: Files stored in `~/Documents/Notes` for user control
- **Markdown + YAML**: Human-readable format with structured metadata
- **Abstract interface**: Easy to extend for cloud sync without architecture changes
- **File naming**: `YYYY-MM-DD_Group_HHMM.md` for chronological organisation

### **User Experience Design**
- **Immediate availability**: Global hotkey, system tray, always-on-top
- **Zero learning curve**: Familiar text editing with smart enhancements
- **Context switching**: Quick commands to jump between time periods, groups, people
- **Visual feedback**: Syntax highlighting and completion tracking without clutter

## 📊 Success Metrics

### **Usability Goals** (✅ Achieved)
- **< 1 second**: Time from hotkey to typing
- **Zero clicks**: Create new note and start typing immediately  
- **Keyboard-driven**: All functions accessible without mouse
- **Distraction-free**: No popups, notifications, or interruptions

### **Functionality Goals** (✅ Achieved)
- **Smart text**: Actions and connections are interactive
- **Cross-note tracking**: See incomplete items across all notes
- **Flexible organisation**: Group by context, audience, or time
- **Persistent state**: Never lose work, automatic saving

### **Technical Goals** (✅ Achieved)
- **Native feel**: Mac-specific window behaviour and shortcuts
- **Lightweight**: < 100MB distribution, instant startup
- **Maintainable**: Clean TypeScript codebase with abstractions
- **Extensible**: Storage and UI layers ready for future enhancements

## 🔮 Future Roadmap

### **Near-term Enhancements**
- **Cloud Sync**: Dropbox/iCloud integration using storage abstraction
- **iOS Companion**: Simple viewer/editor for mobile note access  
- **Export Options**: PDF, plain text, or formatted reports
- **Keyboard Shortcuts**: More hotkeys for power users

### **Advanced Features**
- **Audio Transcription**: Record meetings and extract action items
- **Team Integration**: Shared notes with collaborative editing
- **Smart Templates**: AI-suggested note structure based on context
- **Analytics**: Personal productivity insights from note patterns

## 🎨 Design Philosophy

### **Minimalism with Intelligence**
The app embodies "simple on the surface, powerful underneath" - appearing as just a text editor but understanding the structure and meaning of what's written. Every feature serves the core goal of quick, actionable note capture.

### **Text as Interface**
Rather than complex UI elements, the app treats text itself as the primary interface. Commands, metadata, and actions are all expressed through natural text patterns that become interactive through smart parsing.

### **Always Available, Never Intrusive**
The app should feel like an extension of the user's thought process - instantly available when needed but never demanding attention when not in use. Perfect for meeting notes, quick thoughts, and follow-up tracking.