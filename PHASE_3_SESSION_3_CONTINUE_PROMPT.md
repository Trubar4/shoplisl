# Phase 3: Split List Detail Component - Continue Prompt (Session 3)

## Context

I'm continuing the Shoplisl refactoring project - Phase 3 (Session 3).

**Project Status:**

- Phase 1A: ✅ COMPLETE - simplified-disambiguation.service.ts (83.87% coverage)
- Phase 1B: ✅ COMPLETE - list-detail.component.ts (86.6% coverage)
- Phase 1C: ✅ COMPLETE - voice-ai-assistant.component.ts (84.3% coverage)
- Phase 2: ✅ COMPLETE - Disambiguation Service Split (2025-11-01)
- **Phase 3: 🔄 IN PROGRESS - List Detail Component Split (Session 3 - ~60% complete)**

## Phase 3 Completed Work (Sessions 1 & 2)

### ✅ Session 1: Filter Service Extraction
**Created:**
- `src/app/features/lists/list-detail/services/list-filter.service.ts` (196 lines)
- `src/app/features/lists/list-detail/services/list-filter.service.spec.ts` (24 tests, 100% coverage)

**Features:**
- Shopping/edit filter state management
- Search query state management
- Auto-switch to "alle" when no results
- Previous filter restoration
- Clean reactive API with observables

**Commit:** `cba3d03` - Filter service extraction

### ✅ Session 2 Part 1: Filter Service Integration
**Changed:**
- Integrated ListFilterService into list-detail.component.ts
- Removed duplicate BehaviorSubjects (shoppingFilter$, editFilter$, searchQuery$)
- Updated all filter methods to use service
- All 78 tests passing ✓

**Commit:** `30f1b9b` - Filter service integration
**Impact:** list-detail.ts: 965 → 960 lines

### ✅ Session 2 Part 2: Shopping Mode Component Extraction
**Created:**
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.ts` (320 lines)
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.html` (42 lines)
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.scss` (192 lines)
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.spec.ts` (27 tests, 100%)

**Features Extracted:**
- Article toggle with undo hints (5-second undo window)
- Pending state management (pendingStates$, undoHintTimeouts)
- Celebration animation on completion
- Completion monitoring (wasIncompleteLastCheck tracking)
- Shopping-specific filtering (shouldHideArticle)
- GIF loading with fallback handling

**Parent Changes:**
- Reduced from 960 to 772 lines (-188 lines, -19.6%)
- Removed: showCelebrationAnimation signal, pendingStates$, celebration methods
- Removed: 10+ shopping-specific private methods
- Simplified: onArticleToggle, createUnifiedObservable, mapToArticleItemData
- Updated template to use <app-shopping-mode> child component

**Commit:** `7a667cf` - Shopping-mode component extraction
**Test Status:** 27 shopping-mode tests passing, parent tests need updates

## Remaining Phase 3 Work

### 1. Fix Parent Component Tests (Priority 1 - IMMEDIATE)
**Task:** Update list-detail.spec.ts to remove/adapt shopping-specific tests

**Tests to Remove/Update:**
- ❌ "Celebration Animation" tests (5 tests) → Now in shopping-mode.spec.ts
- ❌ "Pending State Management" tests (3 tests) → Now in shopping-mode.spec.ts
- ❌ "Utility Methods > shouldHideArticle" tests (3 tests) → Now in shopping-mode.spec.ts
- ❌ "Component Cleanup > clear timeouts" test → Now in shopping-mode.spec.ts
- ❌ "Component Cleanup > complete observables" test → Remove pendingStates$ check
- ❌ "Edge Cases > celebration on empty list" test → Now in shopping-mode.spec.ts
- ✅ Keep integration tests that verify parent-child communication
- ✅ Keep filter tests, navigation tests, search tests

**Expected Result:** All list-detail.spec.ts tests passing after cleanup

**Files to Modify:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.spec.ts`

### 2. Extract Edit Mode Component (Priority 2)
**Goal:** Create focused component for edit view

**New Files:**
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.ts` (~250 lines)
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.html`
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.scss`
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.spec.ts`

**Logic to Extract from list-detail.ts:**
- Article toggle in/out of list (onToggleArticleInList, lines 257-269)
- Edit article amount (editArticleAmount, lines 680-691)
- List management actions (lines 357-420):
  - onClearAllItems
  - onDeleteList
  - onEditList
  - onDepartmentSort
  - onCreateNewArticle
- Edit-specific filtering (already handled by ListFilterService)

**Inputs:**
```typescript
@Input() list: ShoppingList | null;
@Input() departmentGroups: DepartmentGroup[];
@Input() searchQuery: string;
@Input() editFilter: EditFilter;
```

**Outputs:**
```typescript
@Output() toggleInList = new EventEmitter<ArticleItemData>();
@Output() articleInfo = new EventEmitter<ArticleItemData>();
@Output() editAmount = new EventEmitter<{article: ArticleItemData, event: Event}>();
@Output() createArticle = new EventEmitter<void>();
@Output() departmentSort = new EventEmitter<void>();
@Output() clearList = new EventEmitter<void>();
@Output() editList = new EventEmitter<void>();
@Output() deleteList = new EventEmitter<void>();
```

**Template Structure:**
```html
<div class="edit-mode">
  <!-- Add New Article and Department Sort Buttons -->
  <div class="add-button-container">
    <button (click)="onCreateArticle()">Neuer Artikel</button>
    <button (click)="onDepartmentSort()">Abteilungen</button>
  </div>

  <!-- Content Container for Articles -->
  <div class="content-container">
    <app-article-list
      [departmentGroups]="departmentGroups"
      [mode]="'edit'"
      [searchQuery]="searchQuery"
      (toggleInList)="onToggleInList($event)"
      (editAmount)="onEditAmount($event)"
      (articleInfo)="onArticleInfo($event)">
    </app-article-list>
  </div>

  <!-- Edit Mode Actions -->
  <div class="edit-actions">
    <button (click)="onClearAllItems()">Leeren</button>
    <button (click)="onDeleteList()">Löschen</button>
    <button (click)="onEditList()">Bearbeiten</button>
  </div>
</div>
```

**Expected Reduction:** ~150-200 lines from parent

### 3. Refactor Parent Component (Priority 3)
**Goal:** Reduce list-detail.component.ts to ~400-500 lines

**Keep in Parent:**
- Route parameter handling (listId extraction)
- Mode switching logic (switchToShoppingMode, switchToEditMode)
- Search disambiguation handling (setupSearchDisambiguation)
- Navigation (onBack)
- Theme color management (updateThemeColors)
- Coordination between child components
- Data streams (list$, departmentGroups$, departmentGroupsEdit$)
- Filter change handling (onFilterChange)
- Search management (onSearchQueryChange)

**Remove from Parent:**
- ✅ Shopping-specific logic → shopping-mode.component (DONE)
- ✅ Filter state management → ListFilterService (DONE)
- 🔄 Edit-specific logic → edit-mode.component (PENDING)
- 🔄 List management actions → edit-mode.component (PENDING)

**Final Template Structure:**
```html
<div class="list-detail">
  <!-- Header with mode toggle -->
  <mat-toolbar>...</mat-toolbar>

  <!-- Shopping Mode -->
  <div *ngIf="currentMode() === 'shopping'">
    <app-search-disambiguation>...</app-search-disambiguation>
    <app-shopping-mode
      [list]="currentList"
      [departmentGroups]="(departmentGroups$ | async) || []"
      [searchQuery]="searchQuery"
      [shoppingFilter]="currentShoppingFilter()"
      (articleToggle)="onArticleToggle($event)"
      (articleInfo)="onArticleInfo($event)"
      (editAmount)="onEditAmountFromList($event)"
      (undoCompletion)="onUndoArticleCompletion($event)">
    </app-shopping-mode>
  </div>

  <!-- Edit Mode -->
  <div *ngIf="currentMode() === 'edit'">
    <app-search-disambiguation>...</app-search-disambiguation>
    <app-edit-mode
      [list]="currentList"
      [departmentGroups]="(departmentGroupsEdit$ | async) || []"
      [searchQuery]="searchQuery"
      [editFilter]="currentEditFilter()"
      (toggleInList)="onToggleArticleInList($event)"
      (articleInfo)="onArticleInfo($event)"
      (editAmount)="onEditAmountFromList($event)"
      (createArticle)="onCreateNewArticle()"
      (departmentSort)="onDepartmentSort()"
      (clearList)="onClearAllItems()"
      (editList)="onEditList()"
      (deleteList)="onDeleteList()">
    </app-edit-mode>
  </div>

  <!-- FAB Filter Menu -->
  <app-filter-fab>...</app-filter-fab>
</div>
```

### 4. Update Tests (Priority 4)
**Files to Update:**
- ✅ `shopping-mode.component.spec.ts` (27 tests) - DONE
- 🔄 `list-detail.spec.ts` - Update to remove shopping-specific tests
- 🔄 Create: `edit-mode.component.spec.ts` - Comprehensive edit mode tests

**Test Strategy:**
- Move edit-specific tests from list-detail.spec.ts to edit-mode.spec.ts
- Keep integration tests in list-detail.spec.ts
- Maintain 86.6% coverage or better

### 5. Update Documentation (Priority 5)
**Files to Update:**
- `/home/user/shoplisl/REFACTORING_PLAN.md` - Mark Phase 3 complete
- Create: `/home/user/shoplisl/PHASE_4_PROMPT.md` - Prompt for next phase (if needed)

## Reference Files

**Current Implementation:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.ts` (772 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.html` (153 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.scss` (540 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.spec.ts` (78 tests, 23 failing)

**Completed Services:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/services/list-filter.service.ts` ✅
- `/home/user/shoplisl/src/app/features/lists/list-detail/services/list-filter.service.spec.ts` ✅

**Completed Components:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.ts` ✅
- `/home/user/shoplisl/src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.html` ✅
- `/home/user/shoplisl/src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.scss` ✅
- `/home/user/shoplisl/src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.spec.ts` ✅

**Refactoring Plan:**
- `/home/user/shoplisl/REFACTORING_PLAN.md`

## Git Branch

**Current Branch:** `claude/shoplisl-phase-3-session-2-011CUm3psoMczbVQ6imJVPYq`

**Recent Commits:**
- `7a667cf` - feat(phase-3): extract shopping-mode component from list-detail
- `30f1b9b` - feat(phase-3): integrate ListFilterService into list-detail component
- `cba3d03` - feat(phase-3): extract list-filter service from list-detail component

**Git Workflow:**
```bash
# Verify current branch
git status

# After making changes
git add .
git commit -m "feat(phase-3): [description]"
git push -u origin claude/shoplisl-phase-3-session-2-011CUm3psoMczbVQ6imJVPYq
```

## Success Criteria

Phase 3 will be complete when:

- ✅ list-filter.service.ts extracted and tested (DONE)
- ✅ Filter service integrated into list-detail component (DONE)
- ✅ shopping-mode.component.ts created and tested (DONE)
- 🔄 Parent component tests updated (remove shopping-specific tests)
- 🔄 edit-mode.component.ts created and tested
- 🔄 Parent list-detail.component.ts reduced to ~400-500 lines
- 🔄 All tests passing
- 🔄 Test coverage maintained at 86.6% or better
- 🔄 REFACTORING_PLAN.md updated with completion status
- 🔄 Changes committed and pushed
- 🔄 Pull request created and reviewed

## Instructions for Next Session

Please:
1. **FIRST**: Fix parent component tests (remove shopping-specific tests that moved to child)
2. **VERIFY**: Run all tests to ensure they pass
3. Start Priority 2: Extract EditModeComponent
4. Create a TodoWrite list for remaining Phase 3 tasks
5. Execute the component extraction step-by-step
6. Run tests after each major change to verify functionality
7. Commit changes incrementally with clear commit messages
8. Update REFACTORING_PLAN.md when Phase 3 is complete

**Important:** Maintain test coverage and preserve all existing functionality throughout the refactoring.

## Current Test Status

**ShoppingModeComponent:** ✅ 27/27 tests passing (100% coverage)

**ListDetailComponent:** ⚠️ 55/78 tests passing
- 23 tests failing (expected - need to remove shopping-specific tests)
- Failing tests cover functionality moved to shopping-mode component:
  - Celebration animation tests
  - Pending state management tests
  - shouldHideArticle utility tests
  - Component cleanup tests (celebration/pending states)

## Estimated Time

**Immediate (Priority 1):**
- Fix parent tests: 30-45 minutes

**Phase 3 Remaining:**
- Edit mode component: 2-3 hours
- Parent refactor: 1-2 hours
- Testing and verification: 1-2 hours
- **Total: 4-7 hours** (1-2 sessions)

## Quick Reference: What Was Moved to Shopping-Mode

**Signals/Properties Removed:**
- `showCelebrationAnimation` signal
- `pendingStates$` BehaviorSubject
- `undoHintTimeouts` Map
- `celebrationTimeout` timeout handle
- `HIDE_DELAY_MS` constant
- `wasIncompleteLastCheck` boolean

**Methods Removed:**
- `setupCompletionMonitoring()`
- `checkForCompletion(articles)`
- `triggerCelebrationAnimation()`
- `closeCelebrationAnimation()`
- `onGifError(event)`
- `onGifLoad(event)`
- `startPendingHide(article)`
- `removePendingState(articleId)`
- `clearTimeoutsForArticle(articleId)`
- `clearCelebrationTimeout()`
- `shouldHideArticle(article)` - arrow function

**Methods Simplified:**
- `onArticleToggle()` - No longer manages pending states
- `createUnifiedObservable()` - Removed pendingStates$ parameter
- `getFilteredArticles()` - Removed pendingStates parameter
- `mapToArticleItemData()` - No pending state mapping
- `cleanup()` - No celebration/pending state cleanup

**Template Changes:**
- Removed celebration overlay
- Replaced article-list with shopping-mode component
- Moved shouldHideArticle logic to child

---

**Ready to continue Phase 3 refactoring!** 🚀

**Next Step:** Fix parent component tests, then extract edit-mode component.
