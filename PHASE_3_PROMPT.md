# Phase 3: Split List Detail Component - Start Prompt

## Context

I'm continuing the Shoplisl refactoring project - Phase 3.

**Current Status:**

- Phase 1A: ✅ COMPLETE - simplified-disambiguation.service.ts (83.87% coverage)
- Phase 1B: ✅ COMPLETE - list-detail.component.ts (86.6% coverage)
- Phase 1C: ✅ COMPLETE - voice-ai-assistant.component.ts (84.3% coverage)
- **Phase 2: ✅ COMPLETE - Disambiguation Service Split (2025-11-01)**
  - Created disambiguation/ directory with focused services
  - article-matcher.service.ts (155 lines) - Similarity calculations
  - list-selection.service.ts (173 lines) - List operations
  - disambiguation.service.ts (1,362 lines) - Core API with delegation
  - Updated all imports across 6 services + tests

## Phase 3 Goal

Split the 884-line list-detail.component.ts into focused components:
- **Parent component** (400 lines) - Routing, mode switching, layout
- **shopping-mode.component.ts** (300 lines) - Shopping view, celebration, undo
- **edit-mode.component.ts** (300 lines) - Edit view, article toggling
- **list-filter.service.ts** (150 lines) - Filter logic, search, auto-switching

## Tasks

1. Read `/home/user/shoplisl/REFACTORING_PLAN.md` section for Phase 3
2. Read `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.ts` to understand current structure
3. Extract list-filter.service.ts (filter state, search logic, auto-switch)
4. Create shopping-mode.component.ts (shopping template, celebration, pending states)
5. Create edit-mode.component.ts (edit template, article toggling)
6. Refactor parent list-detail.component.ts (route to children, mode switching)
7. Update tests
8. Update REFACTORING_PLAN.md
9. Create prompt for Phase 4

## Reference Files

- `/home/user/shoplisl/REFACTORING_PLAN.md` - Full refactoring plan
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.ts` - Component to split (884 lines)
- `/home/user/shoplisl/src/app/features/lists/list-detail/list-detail.spec.ts` - Tests (86.6% coverage)

## Git Branch

Work on branch: `claude/shoplisl-refactoring-phase-2-011CUhFZRV3B1NnCZazcA17Y`

## Instructions

Please:
1. Review Phase 3 details in REFACTORING_PLAN.md
2. Analyze list-detail.component.ts structure
3. Create a todo list with TodoWrite
4. Execute Phase 3 migration step by step
5. Update REFACTORING_PLAN.md when complete
6. Create PHASE_4_PROMPT.md for next session
7. Commit and push all changes

**Important:** Maintain test coverage and preserve all existing functionality.
