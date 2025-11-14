# Issue #14: Auto-Aggregate Related Todos by Audience Tag (SIMPLIFIED)

**GitHub Issue**: https://github.com/jonducrou/note_taker/issues/14
**Branch**: feature/issue-14-aggregate-todos-v2
**Priority**: LOW (Enhancement)
**Type**: Feature Enhancement

## Simplified Problem Statement

Users want to see all action items related to specific people/teams in one place. Instead of a text command, this will be an **automatic visual enhancement** triggered by audience tags.

## User Requirements (Simplified Approach)

When editing a note:

1. **Trigger**: First line is changed AND an `@audience:` tag is found
2. **Delimiter**: Automatically insert `--------` separator line
3. **Content Stripping**: Everything after the delimiter is **stripped before saving** (not persisted to .md file)
4. **Visual Treatment**: Text after delimiter is shadowed/greyed out in the editor
5. **Auto-Population**: Content after delimiter shows aggregated action items from related notes

### What Gets Aggregated

Show all action items (`[]`, `->`, `<-`, `[x]`, `-x>`, `<x-`) from:
- All notes in the **last 30 days**
- That contain **ANY** of the `@audience:` members from the current note
- Grouped by note with clear context (title/date)

## Visual Example

```
#Meeting @audience:Sarah,Bob

## Discussion Points
- Discussed Q4 roadmap
- Need to follow up on designs

--------
## Related Action Items

From "Project Planning" (2025-01-10):
[] Sarah: Draft requirements doc
[] Bob: Review API proposal

From "Design Review" (2025-01-08):
[x] Sarah: Create mockups
-> Bob needs to approve designs
```

**Important**: Everything from `--------` onwards is:
- Generated automatically
- NOT saved to the markdown file
- Greyed out in the UI
- Regenerated when first line changes

## Technical Approach

### Phase 1: Detect First Line Changes

**Location**: `src/renderer/App.tsx`

Monitor editor changes and detect:
1. First line modification (title/header change)
2. Presence of `@audience:` tag anywhere in content
3. Trigger aggregation when both conditions met

### Phase 2: Content Splitting & Stripping (SAFE DELIMITER HANDLING)

**Location**: `src/renderer/App.tsx`

**Critical**: Ensure only ONE delimiter exists at any time to prevent multiple appends.

1. **Before aggregation**: Split content at `--------` to extract user content only
2. **Rebuild content**: `userContent + '\n--------\n' + aggregatedContent`
3. **Before save**: Strip everything after delimiter (without updating view)
4. **Result**: Only user-written content persisted to .md file

This approach guarantees:
- ✅ Multiple aggregation updates safely replace (not append)
- ✅ User content always preserved
- ✅ Only ONE delimiter ever exists

### Phase 3: Query Related Notes

**Location**: `src/storage/FileStorage.ts`

New method: `getRelatedActionItems(audienceMembers: string[], days: number = 30)`

Logic:
```typescript
async getRelatedActionItems(audience: string[], days = 30): Promise<RelatedAction[]> {
  const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000)
  const allNotes = await this.getAllNotes()

  const relatedActions = []

  for (const note of allNotes) {
    // Skip notes older than 30 days
    if (new Date(note.metadata.created).getTime() < cutoffDate) continue

    // Check if ANY audience member matches
    const hasMatchingAudience = audience.some(member =>
      note.metadata.audience?.includes(member)
    )

    if (!hasMatchingAudience) continue

    // Extract all action items from this note
    const actions = this.parseActions(note.content)
    const connections = this.parseConnections(note.content)

    relatedActions.push({
      noteId: note.id,
      noteTitle: this.extractTitle(note.content),
      noteDate: note.metadata.created,
      actions,
      connections
    })
  }

  return relatedActions
}
```

### Phase 4: Format Aggregated Content

**Location**: New utility or App.tsx

Format the aggregated actions:
```typescript
function formatAggregatedActions(related: RelatedAction[]): string {
  let output = '\n--------\n## Related Action Items\n\n'

  for (const item of related) {
    output += `From "${item.noteTitle}" (${formatDate(item.noteDate)}):\n`

    // Format actions
    for (const action of item.actions) {
      output += `${action.completed ? '[x]' : '[]'} ${action.text}\n`
    }

    // Format connections
    for (const conn of item.connections) {
      const arrow = conn.completed ?
        (conn.direction === 'left' ? '<x-' : '-x>') :
        (conn.direction === 'left' ? '<-' : '->')
      output += `${arrow} ${conn.subject}\n`
    }

    output += '\n'
  }

  return output
}
```

### Phase 5: Monaco Editor Integration

**Location**: `src/renderer/App.tsx`

Monaco supports "read-only ranges" and decorations:

```typescript
// Set delimiter onwards as read-only
const delimiterLine = editor.getValue().indexOf('--------')
if (delimiterLine >= 0) {
  const model = editor.getModel()
  const startLine = model.getLineCount(delimiterLine)

  // Add grey background decoration
  editor.deltaDecorations([], [{
    range: new monaco.Range(startLine, 1, model.getLineCount(), 1),
    options: {
      isWholeLine: true,
      className: 'aggregated-content-readonly',
      inlineClassName: 'aggregated-content-readonly-inline'
    }
  }])
}
```

CSS for greyed-out appearance:
```css
.aggregated-content-readonly {
  background-color: rgba(128, 128, 128, 0.1);
  opacity: 0.6;
}

.aggregated-content-readonly-inline {
  color: #888;
  font-style: italic;
}
```

## Implementation Steps

### Step 1: Add IPC Handler for Related Actions

**File**: `src/main/ipc-handlers.ts`

```typescript
ipcMain.handle('get-related-actions', async (_, audience: string[], days: number) => {
  return await storage.getRelatedActionItems(audience, days)
})
```

**File**: `src/main/preload.ts`

```typescript
getRelatedActions: (audience: string[], days?: number) =>
  ipcRenderer.invoke('get-related-actions', audience, days)
```

### Step 2: Implement FileStorage Method

**File**: `src/storage/FileStorage.ts`

Add `getRelatedActionItems()` method (see Phase 3 above)

### Step 3: Modify App.tsx Editor Logic

**File**: `src/renderer/App.tsx`

1. Track previous first line to detect changes
2. On first line change + @audience detected → fetch and append aggregated content
3. Apply Monaco decorations to grey out delimiter onwards
4. Before save: Strip everything after `--------`

### Step 4: Add CSS Styling

**File**: `src/renderer/App.css` (or inline styles)

Add styling for greyed-out aggregated content

## Edge Cases to Handle

1. **Multiple delimiters prevention**: Always split at `--------` and rebuild to ensure only ONE delimiter
2. **No matching notes**: Show "No related action items found" message
3. **Multiple @audience members**: Match ANY member (OR logic, not AND)
4. **Aggregated section is editable**: Content after delimiter can be edited but won't persist
5. **Performance**: Debounce first-line changes by 500ms to avoid excessive queries
6. **Save without view update**: Strip content after delimiter before IPC call, keep full content in editor

## Testing Strategy

### Manual Testing

1. **Basic Aggregation**:
   - Create Note A with `@audience:Sarah` and some action items
   - Create Note B with `@audience:Sarah,Bob`
   - Edit first line of Note B
   - Verify actions from Note A appear after `--------`

2. **Multiple Audience**:
   - Create notes with overlapping audience members
   - Verify all matching notes are aggregated

3. **Date Filtering**:
   - Create old note (>30 days) with `@audience:Sarah`
   - Create new note with `@audience:Sarah`
   - Verify old note is excluded

4. **Save Stripping**:
   - Create note with aggregated content
   - Save and reload
   - Verify aggregated content is NOT in the saved .md file

5. **Visual Styling**:
   - Verify aggregated content appears greyed out
   - Verify delimiter is visible and clear

6. **User Experience**:
   - Try to edit aggregated section (should be read-only or restricted)
   - Refresh by changing first line again
   - Verify smooth UX

### Unit Tests (Optional)

```typescript
describe('getRelatedActionItems', () => {
  it('should return actions from notes with matching audience')
  it('should filter notes older than 30 days')
  it('should match ANY audience member')
  it('should include both actions and connections')
})
```

## Success Criteria

- ✅ First line change + @audience tag triggers aggregation
- ✅ Delimiter `--------` is auto-inserted
- ✅ Aggregated content is greyed out in editor
- ✅ Everything after delimiter is stripped before save
- ✅ Related action items from last 30 days are shown
- ✅ Actions from notes with ANY matching audience member appear
- ✅ UI is clear and non-intrusive
- ✅ Performance is acceptable (debounced, efficient queries)

## Related Features

This enhancement pairs well with:
- Existing completion tracking (badge counts)
- @audience autocomplete
- Action item syntax highlighting

## Files to Modify

1. **src/storage/FileStorage.ts** - Add `getRelatedActionItems()` method
2. **src/main/ipc-handlers.ts** - Add IPC handler for related actions
3. **src/main/preload.ts** - Add preload API for related actions
4. **src/renderer/App.tsx** - Implement editor logic, decorations, save stripping
5. **src/renderer/App.css** - Add styling for greyed-out content
6. **src/types/index.ts** - Add `RelatedAction` interface if needed

## Type Definitions

```typescript
interface RelatedAction {
  noteId: string
  noteTitle: string
  noteDate: string
  actions: Action[]
  connections: Connection[]
}

interface Action {
  text: string
  completed: boolean
  lineNumber: number
}

interface Connection {
  subject: string
  direction: 'left' | 'right'
  completed: boolean
  lineNumber: number
}
```

## Performance Considerations

- **Debounce**: Only trigger on first-line changes, debounced by 500ms
- **Caching**: Consider caching parsed actions for frequently accessed notes
- **Lazy Loading**: Only aggregate when viewing notes with @audience tags
- **Limit Results**: Cap at 50 action items max to prevent overwhelming UI

## UI/UX Notes

- Keep the aggregated section **read-only** to prevent user confusion
- Use subtle greying (not too dark) to maintain readability
- Consider adding a "Refresh" button/icon near the delimiter
- Show count: "3 related notes found" or "No related items"
- Make it clear this content is auto-generated and ephemeral

## Alternative: Manual Refresh

If automatic triggering on first-line change is too aggressive:
- Add a slash command `/refresh-actions` to manually trigger aggregation
- Or add a "Refresh Related Actions" button in the UI

This gives users more control over when the aggregation happens.
