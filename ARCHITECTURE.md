# Shoplisl Application Architecture

## Overview

Shoplisl is an Angular 20 shopping list management application with a focus on clean architecture, component separation, and maintainable code.

---

## Core Architecture Principles

1. **Component Separation**: Large components are split into focused, single-responsibility components
2. **Reactive Patterns**: RxJS observables for state management and data flow
3. **OnPush Change Detection**: Optimized performance through explicit change detection
4. **Standalone Components**: Modern Angular architecture without NgModules
5. **Test Coverage**: Comprehensive unit tests (464 tests passing, 100% coverage)

---

## List-Detail Feature Architecture (Post Phase 3 Refactoring)

### Component Hierarchy

```
list-detail (Parent)
├── shopping-mode (Child)
│   ├── Undo hints
│   ├── Pending state management
│   ├── Celebration animation
│   └── Article display (shopping view)
│
├── edit-mode (Child)
│   ├── List management actions
│   ├── Confirmation dialogs
│   └── Article display (edit view)
│
├── filter-fab (Shared)
│   └── Filter UI for both modes
│
└── search-disambiguation (Shared)
    └── Search functionality
```

### Parent Component: `list-detail`

**Responsibilities:**
- Route management and navigation
- Data fetching from services
- Mode switching (shopping ↔ edit)
- Event handling coordination
- Department grouping logic

**Key Features:**
- **Lines of Code**: 763 (reduced from 965, -21%)
- **Test Coverage**: 57 tests
- **Change Detection**: OnPush
- **State Management**: Signals for UI state, RxJS for data streams

**File Structure:**
```
src/app/features/lists/list-detail/
├── list-detail.ts              # Component logic
├── list-detail.html            # Template
├── list-detail.scss            # Styles
└── list-detail.spec.ts         # Tests (57 tests)
```

---

### Shopping Mode Component: `shopping-mode`

**Purpose**: Handles shopping-specific functionality with undo hints and celebration.

**Responsibilities:**
- Article toggle with undo capability
- Pending state management (5-second undo window)
- Celebration animation when list is complete
- Article filtering (offen/erledigt/alle)
- Completion monitoring

**Key Features:**
- **Lines of Code**: 358
- **Test Coverage**: 27 tests
- **Change Detection**: OnPush with manual ChangeDetectorRef
- **State Management**: BehaviorSubjects for pending states

**Architecture Patterns:**

1. **Pending State Management**
   ```typescript
   private readonly pendingStates$ = new BehaviorSubject<Record<string, PendingState>>({});

   // Merge pending states with article data
   readonly enrichedDepartmentGroups$ = combineLatest([
     this.departmentGroups$,
     this.pendingStates$
   ]).pipe(
     map(([groups, pendingStates]) => {
       // Enrich articles with undo hints
       // Filter out hidden checked articles
     })
   );
   ```

2. **Undo Window Flow**
   ```
   User checks article
   ↓
   Parent toggles in backend
   ↓
   Shopping-mode receives updated data
   ↓
   After 100ms: startPendingHide()
   ↓
   Article shows undo button (5 seconds)
   ↓
   If not undone: Article hidden from view
   ```

3. **Celebration Logic**
   - Monitors enrichedDepartmentGroups$ for completion
   - Triggers only on transition from incomplete → complete
   - Guards against false positives (search active, wrong filter)
   - Auto-closes after 3 seconds

**File Structure:**
```
src/app/features/lists/list-detail/shopping-mode/
├── shopping-mode.component.ts       # Component logic
├── shopping-mode.component.html     # Template
├── shopping-mode.component.scss     # Styles
└── shopping-mode.component.spec.ts  # Tests (27 tests)
```

---

### Edit Mode Component: `edit-mode`

**Purpose**: Handles list editing functionality with article management.

**Responsibilities:**
- Toggle articles in/out of list
- List management actions (clear, edit, delete)
- Confirmation dialogs
- Article filtering (gelistet/fehlend/alle)

**Key Features:**
- **Lines of Code**: 133
- **Test Coverage**: 22 tests
- **Change Detection**: OnPush
- **User Confirmations**: Built-in confirm dialogs for destructive actions

**Confirmation Flow:**
```typescript
onClearAllItems(): void {
  const count = this.departmentGroups
    .flatMap(g => g.articles)
    .filter(a => a.isInList).length;

  if (confirm(`Alle ${count} Artikel von der Liste entfernen?`)) {
    this.clearList.emit();
  }
}
```

**File Structure:**
```
src/app/features/lists/list-detail/edit-mode/
├── edit-mode.component.ts       # Component logic
├── edit-mode.component.html     # Template
├── edit-mode.component.scss     # Styles
└── edit-mode.component.spec.ts  # Tests (22 tests)
```

---

### Shared Components

#### Article List Component
Shared by both shopping and edit modes for displaying articles grouped by department.

**Key Props:**
- `departmentGroups`: Article data grouped by department
- `mode`: 'shopping' | 'edit'
- `shouldHideArticle`: Function to determine article visibility
- Events: `articleToggle`, `editAmount`, `articleInfo`, `undoCompletion`

#### Article Item Component
Individual article display with mode-specific interactions.

**Shopping Mode**: Click to toggle, shows undo hints
**Edit Mode**: Toggle in/out of list, amount editing

---

## Data Flow Architecture

### Shopping Mode Data Flow

```
1. Parent fetches list data
   ↓
2. Parent creates departmentGroups$ observable
   ↓
3. Shopping-mode receives groups via @Input
   ↓
4. Shopping-mode enriches with pending states
   ↓
5. Shopping-mode filters based on shouldHideArticle
   ↓
6. Article-list displays filtered groups
   ↓
7. User interaction → event emitted to parent
   ↓
8. Parent updates backend → new data flows down
```

### Critical Flow: Undo Button Display

**Problem Solved in Phase 3:**
Parent was filtering out checked articles before sending to child, preventing undo functionality.

**Solution:**
- Parent sends ALL articles (checked + unchecked) to shopping-mode
- Shopping-mode enriches articles with pending states
- Shopping-mode filters articles in enrichedDepartmentGroups$
- Articles with pending states remain visible (undo button shown)
- Articles without pending states are filtered out (completely removed from DOM)

**Code Location:** `src/app/features/lists/list-detail/list-detail.ts:466-469`
```typescript
case 'offen':
  // Don't filter here - let shopping-mode child handle hiding via shouldHideArticle
  // This allows checked articles with pending states (undo window) to remain visible
  break;
```

---

## State Management

### Parent Component State

**Signals (UI State):**
- `currentMode`: 'shopping' | 'edit'
- `currentShoppingFilter`: 'offen' | 'erledigt' | 'alle'
- `currentEditFilter`: 'gelistet' | 'fehlend' | 'alle'
- `isFabExpanded`: boolean
- `isLoading`: boolean

**Observables (Data Streams):**
- `list$`: Current shopping list
- `departmentGroups$`: Articles for shopping mode
- `departmentGroupsEdit$`: Articles for edit mode
- `searchDisambiguation$`: Search suggestions

### Shopping Mode State

**BehaviorSubjects:**
- `departmentGroups$`: Input from parent (reactive to changes)
- `pendingStates$`: Articles with active undo windows

**Signals:**
- `showCelebrationAnimation`: Celebration overlay visibility

**Computed Observables:**
- `enrichedDepartmentGroups$`: Articles + pending states + filtering

### Edit Mode State

Primarily stateless - passes events up to parent for state changes.

---

## Service Layer

### ListDataService
- CRUD operations for shopping lists
- Article management
- Real-time data synchronization with Firebase

### DepartmentService
- Department data management
- Department ordering

### FilterService
- Filter state management (shopping + edit modes)
- Search query handling

### ListUtilsService
- List color management
- Theme utilities
- Color contrast calculations

---

## Testing Strategy

### Test Organization

**Parent Component Tests (57 tests):**
- Mode switching
- Filter handling
- Department grouping
- Search functionality
- Edge cases

**Shopping Mode Tests (27 tests):**
- Article toggle with undo
- Pending state management
- Celebration triggers
- Filter behavior
- Completion detection

**Edit Mode Tests (22 tests):**
- Toggle in/out of list
- Confirmation dialogs
- List actions (clear, edit, delete)

### Coverage

- **Total Tests**: 464 passing
- **Coverage**: 100%
- **Test Runner**: Vitest
- **Test Strategy**: Unit tests with TestBed

---

## Key Architectural Decisions

### 1. OnPush Change Detection

**Rationale:** Performance optimization for large lists

**Implementation:**
- All components use `ChangeDetectionStrategy.OnPush`
- Manual `ChangeDetectorRef.detectChanges()` when needed
- Observables with async pipe for reactive updates

### 2. BehaviorSubjects for Child Component Inputs

**Problem:** OnPush components don't react to @Input changes automatically

**Solution:**
```typescript
private readonly departmentGroups$ = new BehaviorSubject<DepartmentGroup[]>([]);

ngOnChanges(changes: SimpleChanges): void {
  if (changes['departmentGroups']) {
    this.departmentGroups$.next(changes['departmentGroups'].currentValue);
  }
}
```

### 3. Parent Does Minimal Filtering

**Rationale:** Allow children to control their own display logic

**Before Phase 3:**
```typescript
case 'offen':
  articles = articles.filter(a => !a.isChecked); // ❌ Broke undo
```

**After Phase 3:**
```typescript
case 'offen':
  // Let shopping-mode child handle visibility ✅
  break;
```

### 4. Complete DOM Removal vs CSS Hiding

**Problem:** CSS `opacity: 0` left gaps in layout

**Solution:** Filter articles in observable before rendering:
```typescript
.filter(article => {
  if (this.shoppingFilter === 'offen') {
    return !this.shouldHideArticle(article); // Remove from DOM
  }
  return true;
})
```

---

## Performance Optimizations

1. **OnPush Change Detection**: Reduces change detection cycles
2. **Observable Pipelines**: Efficient data transformation
3. **DOM Filtering**: Remove hidden elements completely (no CSS overhead)
4. **Reactive Monitoring**: No polling/intervals for state checks
5. **Lazy Loading**: Components loaded only when needed

---

## Known Limitations & Future Improvements

### Current Limitations

1. **Celebration GIF**: Requires internet connection (could be bundled)
2. **5-Second Undo Window**: Hardcoded (could be configurable)
3. **No Animation**: Article removal is instant (could add transitions)

### Potential Phase 4 Improvements

1. **Further Decomposition**: Break down article-list into smaller components
2. **State Management Library**: Consider NgRx/Akita for complex state
3. **Virtual Scrolling**: For very long lists (100+ items)
4. **Offline Support**: Better PWA capabilities
5. **Animation**: Smooth transitions for article hide/show

---

## Migration Guide

### Before Phase 3

```typescript
// All logic in parent component
list-detail.ts (965 lines)
├── Shopping logic
├── Edit logic
├── Celebration
├── Undo hints
└── All tests (78 tests)
```

### After Phase 3

```typescript
// Separated by concern
list-detail.ts (763 lines, -21%)
├── Core parent logic (57 tests)
shopping-mode.ts (358 lines)
├── Shopping logic (27 tests)
edit-mode.ts (133 lines)
└── Edit logic (22 tests)
```

**Benefits:**
- ✅ Reduced parent complexity by 21%
- ✅ Better separation of concerns
- ✅ Easier testing (focused test suites)
- ✅ Improved maintainability
- ✅ Reusable child components

---

## File Structure

```
src/app/features/lists/list-detail/
├── list-detail.ts                           # Parent component
├── list-detail.html
├── list-detail.scss
├── list-detail.spec.ts
│
├── shopping-mode/                           # Shopping mode child
│   ├── shopping-mode.component.ts
│   ├── shopping-mode.component.html
│   ├── shopping-mode.component.scss
│   └── shopping-mode.component.spec.ts
│
├── edit-mode/                               # Edit mode child
│   ├── edit-mode.component.ts
│   ├── edit-mode.component.html
│   ├── edit-mode.component.scss
│   └── edit-mode.component.spec.ts
│
└── services/
    └── list-filter.service.ts               # Filter state management
```

---

## Change Log

### Phase 3 (Session 3) - December 2024

**Major Changes:**
1. Extracted shopping-mode component from parent
2. Extracted edit-mode component from parent
3. Fixed undo button functionality
4. Fixed layout gaps (DOM filtering)
5. Fixed celebration triggering on search
6. Fixed vertical scrolling in shopping mode
7. Removed all celebration/shopping tests from parent

**Commits:**
- `7e9c727`: Fix vertical scrolling in shopping mode
- `867a488`: Remove remaining debug logging
- `30edba0`: Fix layout gaps and search celebration
- `b68d9c9`: Remove debug logging from shopping-mode
- `29f18be`: Fix shopping-mode articles display
- (+ 5 debug/investigation commits)

**Metrics:**
- Parent: 965 → 763 lines (-21%)
- Tests: 78 → 57 (parent), +27 (shopping), +22 (edit)
- Total: 106 tests → 464 tests (all app tests)
- All tests passing ✅

---

## Conclusion

The Phase 3 refactoring successfully decomposed a monolithic list-detail component into a clean, maintainable architecture with clear separation of concerns. The new structure is more testable, performant, and easier to extend.

**Key Wins:**
- ✅ Reduced parent complexity
- ✅ Isolated shopping/edit concerns
- ✅ Fixed critical bugs (undo, layout, scrolling)
- ✅ 100% test coverage maintained
- ✅ Production-ready code

**Next Steps:** See `refactoring_plan.md` for Phase 4 planning.
