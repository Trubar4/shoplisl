# Phase 3: Split List Detail Component - Continue Prompt

## Context

I'm continuing the Shoplisl refactoring project - Phase 3 (Session 2).

**Project Status:**

- Phase 1A: ✅ COMPLETE - simplified-disambiguation.service.ts (83.87% coverage)
- Phase 1B: ✅ COMPLETE - list-detail.component.ts (86.6% coverage)
- Phase 1C: ✅ COMPLETE - voice-ai-assistant.component.ts (84.3% coverage)
- Phase 2: ✅ COMPLETE - Disambiguation Service Split (2025-11-01)
- **Phase 3: 🔄 IN PROGRESS - List Detail Component Split (Session 2)**

## Phase 3 Completed Work (Session 1 - 2025-11-03)

### ✅ Filter Service Extraction
**Created:**
- `src/app/features/lists/list-detail/services/list-filter.service.ts` (196 lines)
- `src/app/features/lists/list-detail/services/list-filter.service.spec.ts` (24 tests, 100% coverage)

**Features Implemented:**
- Shopping filter state management (offen/erledigt/alle)
- Edit filter state management (gelistet/fehlend/alle)
- Search query state management
- Auto-switch to "alle" when search yields no results
- Previous filter restoration after adding items
- Clean API with observables for reactive updates

**Test Coverage:**
- 24 passing tests
- 100% coverage
- All functionality verified

**Git Status:**
- Branch: `claude/shoplisl-phase-3-split-list-detail-011CUktWzvBWoqpstLE1Xk9g`
- Commit: `cba3d03` - "feat(phase-3): extract list-filter service from list-detail component"
- Status: ✅ Committed and pushed

## Remaining Phase 3 Work

### 1. Integrate Filter Service (Priority 1)
**Task:** Replace internal filter state in list-detail.component.ts with ListFilterService

**Files to Modify:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.ts`

**Steps:**
1. Import ListFilterService
2. Inject service in constructor
3. Replace `shoppingFilter$`, `editFilter$`, `searchQuery$` BehaviorSubjects with service observables
4. Replace `setShoppingFilter()`, `setEditFilter()` with service methods
5. Update `autoSwitchToAllFilter()` logic to use service
6. Update `restorePreviousFilter()` to use service
7. Remove duplicate filter state management code
8. Test all filter functionality still works

**Lines to Reduce:** ~100 lines (filter state management)

### 2. Extract Shopping Mode Component (Priority 2)
**Goal:** Create focused component for shopping view

**New Files:**
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.ts` (~300 lines)
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.html`
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.scss`
- `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.spec.ts`

**Logic to Extract from list-detail.ts:**
- Article toggle with undo hints (lines 236-261, 286-292)
- Pending state management (lines 875-911)
- Celebration animation (lines 422-436, 756-832)
- Completion monitoring (lines 756-808)
- Shopping-specific filtering

**Inputs:**
```typescript
@Input() list: ShoppingList | null;
@Input() articles: Article[];
@Input() departments: Department[];
@Input() searchQuery: string;
```

**Outputs:**
```typescript
@Output() articleToggle = new EventEmitter<ArticleItemData>();
@Output() articleInfo = new EventEmitter<ArticleItemData>();
@Output() editAmount = new EventEmitter<{article: ArticleItemData, event: Event}>();
```

### 3. Extract Edit Mode Component (Priority 3)
**Goal:** Create focused component for edit view

**New Files:**
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.ts` (~300 lines)
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.html`
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.scss`
- `src/app/features/lists/list-detail/edit-mode/edit-mode.component.spec.ts`

**Logic to Extract:**
- Article toggle in/out of list (lines 267-284)
- Edit article amount (lines 688-698)
- List management actions (lines 357-420)
- Edit-specific filtering

**Inputs:**
```typescript
@Input() list: ShoppingList | null;
@Input() articles: Article[];
@Input() departments: Department[];
@Input() searchQuery: string;
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

### 4. Refactor Parent Component (Priority 4)
**Goal:** Reduce list-detail.component.ts to ~400 lines

**Keep in Parent:**
- Route parameter handling
- Mode switching logic
- Search disambiguation handling
- Navigation (back button)
- Theme color management
- Coordination between child components

**Remove from Parent:**
- Shopping-specific logic → shopping-mode.component
- Edit-specific logic → edit-mode.component
- Filter state management → Already in ListFilterService ✅
- Pending states → shopping-mode.component
- Celebration logic → shopping-mode.component

**Template Update:**
```html
<!-- Parent template structure -->
<div class="list-detail">
  <mat-toolbar><!-- Header with mode toggle --></mat-toolbar>

  <app-shopping-mode
    *ngIf="currentMode() === 'shopping'"
    [list]="currentList"
    [searchQuery]="searchQuery"
    (articleToggle)="onArticleToggle($event)">
  </app-shopping-mode>

  <app-edit-mode
    *ngIf="currentMode() === 'edit'"
    [list]="currentList"
    [searchQuery]="searchQuery"
    (toggleInList)="onToggleArticleInList($event)">
  </app-edit-mode>

  <app-filter-fab></app-filter-fab>
</div>
```

### 5. Update Tests
**Files to Update:**
- `src/app/features/lists/list-detail/list-detail.spec.ts`
- Create: `shopping-mode.component.spec.ts`
- Create: `edit-mode.component.spec.ts`

**Test Strategy:**
- Move shopping-specific tests to shopping-mode.spec.ts
- Move edit-specific tests to edit-mode.spec.ts
- Keep integration tests in list-detail.spec.ts
- Maintain 86.6% coverage or better

### 6. Update Documentation
**Files to Update:**
- `/home/user/shoplisl/REFACTORING_PLAN.md` - Mark Phase 3 complete
- Create: `/home/user/shoplisl/PHASE_4_PROMPT.md` - Prompt for Voice Assistant split

## Reference Files

**Current Implementation:**
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.ts` (965 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.html` (185 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.scss` (540 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.spec.ts` (78 tests)

**New Service (Completed):**
- `/home/user/shoplisl/src/app/features/lists/list-detail/services/list-filter.service.ts` ✅
- `/home/user/shoplisl/src/app/features/lists/list-detail/services/list-filter.service.spec.ts` ✅

**Refactoring Plan:**
- `/home/user/shoplisl/REFACTORING_PLAN.md`

## Git Branch

**Current Branch:** `claude/shoplisl-phase-3-split-list-detail-011CUktWzvBWoqpstLE1Xk9g`

**Branch Status:**
- ✅ Filter service committed and pushed
- 🔄 Ready for integration and component extraction

**Git Workflow:**
```bash
# Verify current branch
git status

# Pull latest changes (if needed)
git pull origin claude/shoplisl-phase-3-split-list-detail-011CUktWzvBWoqpstLE1Xk9g

# After making changes
git add .
git commit -m "feat(phase-3): [description]"
git push -u origin claude/shoplisl-phase-3-split-list-detail-011CUktWzvBWoqpstLE1Xk9g
```

## Success Criteria

Phase 3 will be complete when:

- ✅ list-filter.service.ts extracted and tested (DONE)
- [ ] Filter service integrated into list-detail component
- [ ] shopping-mode.component.ts created and tested
- [ ] edit-mode.component.ts created and tested
- [ ] Parent list-detail.component.ts reduced to ~400 lines
- [ ] All 78 existing tests still passing
- [ ] Test coverage maintained at 86.6% or better
- [ ] REFACTORING_PLAN.md updated with completion status
- [ ] Changes committed and pushed
- [ ] Pull request created (optional, can be done after Phase 4)

## Instructions for Next Session

Please:
1. Review the completed filter service implementation
2. Start with Priority 1: Integrate ListFilterService into list-detail.component.ts
3. Create a TodoWrite list for remaining Phase 3 tasks
4. Execute the component extraction step-by-step
5. Run tests after each major change to verify functionality
6. Commit changes incrementally with clear commit messages
7. Update REFACTORING_PLAN.md when Phase 3 is complete
8. Create PHASE_4_PROMPT.md for the next refactoring phase

**Important:** Maintain test coverage and preserve all existing functionality throughout the refactoring.

## Estimated Time

- Filter service integration: 30-45 minutes
- Shopping mode component: 2-3 hours
- Edit mode component: 2-3 hours
- Parent refactor: 1-2 hours
- Testing and verification: 1-2 hours
- **Total: 7-11 hours** (spread across 2-3 sessions)

## Branch Cleanup Note

These branches need manual deletion via GitHub:

**Merged (safe to delete):**
- `claude/shoplisl-refactoring-phase-2-011CUhFZRV3B1NnCZazcA17Y`
- `claude/phase-1c-voice-ai-tests-011CUgurCcGwEuQaEFp5GYYJ`
- `claude/phase1b-list-detail-tests-011CUeuPEKCctVA9MMkXwYtW`
- `claude/quickwin1-extract-department-utils-011CUeuPEKCctVA9MMkXwYtW`
- `claude/setup-vitest-visual-011CUbUc9A5sS1GxdqQkb41o`
- `claude/analyze-refactoring-opportunities-011CUeuPEKCctVA9MMkXwYtW`

**Outdated/conflicting:**
- `claude/add-test-coverage-011CUXedetRhktheZeFoKiYB`
- `claude/quickwin2-consolidate-ai-services-011CUfKy6gJxHZ11yPQzVqKf`

---

**Ready to continue Phase 3 refactoring!** 🚀
