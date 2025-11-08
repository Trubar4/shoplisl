# Next Session: Fix Phase 4 Component Tests

I'm continuing the Shoplisl refactoring project - **Phase 4 completion (test fixes)**.

## Context
Phase 4 Day 5 (Voice Assistant Integration) is **functionally complete** and manually tested ✅:
- 4 services extracted and integrated (voice-input, voice-output, chat-ui, disambiguation-ui)
- Component reduced from 1,668 → 1,362 lines (-18%)
- All functionality working: voice I/O, scrolling, disambiguation
- **Tests:** 569/623 passing (91%)
  - Service tests: 165/165 passing (100%) ✅
  - Component tests: 54 need updates (test expectations, not functionality)

## Current Status
**Branch:** `claude/integrate-voice-services-011CUtefQqyeSfRxnQQ4ycWt`
**Files:** `/home/user/shoplisl/PHASE_4_PROGRESS.md` and `/home/user/shoplisl/REFACTORING_PLAN.md`

## Task
Fix the **54 failing component tests** in:
- `src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.spec.ts`

### Why Tests Are Failing
Tests expect direct method implementations but now the component delegates to services. Need to update test expectations to:
1. Verify service method calls (e.g., `expect(voiceOutputServiceMock.speak).toHaveBeenCalled()`)
2. Remove expectations for removed methods (e.g., old `scrollToBottom`, PWA methods)
3. Update mocks to match new service delegation pattern

### Test Categories Needing Updates
Based on failing test names, likely need to fix:
- Voice Output tests (should verify `voiceOutput.speak()` calls)
- Voice Input tests (should verify `voiceInput` observable subscriptions)
- Scrolling tests (should verify `chatUI.scrollToBottom()` calls)
- PWA viewport tests (should verify `chatUI.initializePWAViewport()`)
- Disambiguation UI helper tests (should verify `disambiguationUI.*` delegations)

## Steps
1. Read `/home/user/shoplisl/PHASE_4_PROGRESS.md` and `/home/user/shoplisl/REFACTORING_PLAN.md`
2. Run tests to see current failures: `npm test -- --run`
3. Fix tests one category at a time
4. Verify all 623 tests pass (100%)
5. Update progress documents
6. Commit with message: `test(voice): fix component tests for service delegation`
7. Push to branch

## After Tests Pass
Review REFACTORING_PLAN.md and confirm next phase:
- **Phase 5: Install NgRx** (2-3 days)
  - Add state management for real-time collaboration
  - Setup: store, effects, entities, devtools
  - This is the next major phase after test fixes

## Important Notes
- Functionality is proven working - this is ONLY test expectation updates
- Service tests are 100% passing - services work correctly
- Don't change component logic, only test expectations
- Use TodoWrite tool to track progress through test categories

Please read the context files, run tests to see failures, and begin fixing them systematically.
