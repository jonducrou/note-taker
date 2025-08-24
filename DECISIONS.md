# Note Taker App - Architecture & Implementation Decisions

## 🚀 Technology Stack Decisions

### **Electron + React + TypeScript** ✅ CHOSEN
**Why**: Perfect balance of development speed, native integration, and maintainability
- **Pros**: Hot reload, component architecture, strong typing, cross-platform potential
- **Cons**: Larger bundle size than native Swift
- **Alternative Considered**: Swift + SwiftUI (rejected due to development complexity)

### **Monaco Editor** ✅ CHOSEN  
**Why**: Provides rich text editing with custom language support
- **Pros**: Syntax highlighting, autocompletion, familiar VS Code experience
- **Cons**: Larger than simple textarea
- **Alternative Considered**: CodeMirror (rejected due to less TypeScript support)

### **Local Markdown Storage** ✅ CHOSEN
**Why**: User-owned, version-controllable, human-readable
- **Pros**: No vendor lock-in, works offline, familiar format
- **Cons**: No built-in collaboration
- **Alternative Considered**: SQLite (rejected due to opacity and complexity)

## 🎨 Design Decisions

### **Text-First Interface** ✅ CHOSEN
**Why**: Minimises cognitive overhead and maximises writing space
- **Implementation**: 95% text area, minimal UI chrome
- **Rationale**: Note-taking should feel like thinking, not software operation
- **Alternative Considered**: Traditional form-based UI (rejected as too complex)

### **Inline Metadata with `@tags`** ✅ CHOSEN
**Why**: Keeps structure visible and editable within content
- **Format**: `@group:Product @audience:Sarah,DevTeam`
- **Benefit**: No separate fields to fill, visible in exported text
- **Alternative Considered**: Separate metadata fields (rejected as disruptive)

### **Click-to-Complete Interactions** ✅ CHOSEN
**Why**: Makes static text interactive without complex UI
- **Implementation**: Click `[]` to toggle `[x]`, click `->` to toggle `-x>`
- **Rationale**: Natural interaction model, visual feedback
- **Alternative Considered**: Keyboard shortcuts only (rejected as less discoverable)

## 🔧 Technical Implementation Decisions

### **Custom Monaco Language ('notes')** ✅ CHOSEN
**Why**: Enables syntax highlighting and intelligent autocompletion
- **Features**: Colour-coded actions, connections, metadata
- **Benefit**: Visual distinction without UI complexity
- **Alternative Considered**: Plain markdown (rejected due to limited highlighting)

### **IPC Communication Pattern** ✅ CHOSEN
**Why**: Clean separation between UI and file operations
- **Implementation**: Electron IPC with typed handlers
- **Benefit**: Type safety, testable storage layer
- **Alternative Considered**: Direct file access from renderer (rejected for security)

### **Auto-save with Debouncing** ✅ CHOSEN
**Why**: Never lose work without performance impact
- **Implementation**: 1-second delay after typing stops
- **Rationale**: Balance between safety and performance
- **Alternative Considered**: Manual save (rejected as error-prone)

## 🎯 User Experience Decisions

### **Always-on-Top with Auto-Hide** ✅ CHOSEN
**Why**: Available when needed, invisible when not
- **Behaviour**: Show on hotkey, hide on focus loss
- **Rationale**: Reduces context switching while avoiding distraction
- **Alternative Considered**: Normal window (rejected as less accessible)

### **Global Hotkey (Cmd+Shift+N)** ✅ CHOSEN
**Why**: Instant access from any application
- **Choice**: Standard modifier pattern, 'N' for Notes
- **Rationale**: Muscle memory for quick access
- **Alternative Considered**: Menu bar only (rejected as slower)

### **Text Commands (Cmd+K)** ✅ CHOSEN
**Why**: Keyboard-driven navigation without menu complexity
- **Implementation**: Command palette with `/` prefixed commands
- **Benefit**: Fast, discoverable, extensible
- **Alternative Considered**: Traditional menus (rejected as mouse-dependent)

## 📁 File Organisation Decisions

### **Date-First Naming: `YYYY-MM-DD_Group_HHMM.md`** ✅ CHOSEN
**Why**: Chronological sorting while maintaining context grouping
- **Benefit**: Natural ordering, unique names, context visible
- **Rationale**: Time is primary organising principle for meeting notes
- **Alternative Considered**: Group-first naming (rejected due to poor chronological sorting)

### **YAML Frontmatter + Markdown** ✅ CHOSEN
**Why**: Structured metadata with human-readable content
- **Format**: Standard Jekyll/Hugo pattern
- **Benefit**: Parseable by many tools, clean separation
- **Alternative Considered**: JSON metadata (rejected as less readable)

### **~/Documents/Notes Directory** ✅ CHOSEN
**Why**: User-accessible, standard location, easy backup
- **Rationale**: Users should own their data in familiar location
- **Alternative Considered**: Application data directory (rejected as hidden)

## 🔄 What Didn't Work - Lessons Learned

### **Initial Complex UI Approach** ❌ REJECTED
**Attempted**: Traditional form-based interface with separate fields
**Problem**: Disrupted writing flow, felt like software not thinking
**Solution**: Pivoted to text-first design with inline metadata

### **Separate Command Window** ❌ REJECTED  
**Attempted**: Dedicated command window for navigation
**Problem**: Added complexity, broke single-window simplicity
**Solution**: Modal command palette overlay

### **Rich Text Formatting** ❌ REJECTED
**Attempted**: Bold, italic, colours in text editor
**Problem**: Complexity without clear benefit for note-taking use case  
**Solution**: Focus on structural highlighting (actions, connections)

### **Multiple Window Support** ❌ REJECTED
**Attempted**: Allow multiple notes open simultaneously
**Problem**: Violated simplicity principle, increased cognitive load
**Solution**: Single window with fast switching via commands

## 🎯 Key Success Factors

### **Ruthless Simplicity**
Every feature decision asked: "Does this make note-taking faster or better?" If not, it was removed or simplified.

### **Text as Primary Interface**
Treating text content as the main interaction surface rather than building complex UI reduced both development time and user cognitive overhead.

### **Performance First**
Optimising for immediate availability (< 1 second from hotkey to typing) shaped all architecture decisions including storage format and UI complexity.

### **User Data Ownership**
Choosing local markdown files over proprietary formats ensures user control and tool longevity.

## 🔮 Future Architecture Considerations

### **Cloud Sync Abstraction** 
Storage interface designed for easy extension to Dropbox, iCloud, or custom sync without UI changes.

### **Plugin Architecture**
Monaco language system and IPC handlers structured to allow future extensions (templates, integrations, export formats).

### **Performance Monitoring**
Built-in telemetry hooks for understanding real-world usage patterns and performance bottlenecks.

### **Cross-Platform Potential**  
Electron foundation enables future Windows/Linux versions with minimal changes to core functionality.