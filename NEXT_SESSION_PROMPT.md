# Next Session Prompt

Use this prompt to continue work on the temp article cleanup project in a fresh conversation:

---

## Prompt for Next Session:

I'm continuing work on the ShopLisl temp article cleanup project. Please read the following context:

### Current Branch
`claude/fix-shared-list-articles-ZjaQa`

### What's Been Completed

#### ✅ Phase 1: Integration Tests (COMPLETE)
- Created E2E testing infrastructure with Firebase Emulator Suite + Vitest
- **11/11 integration tests passing (100%)**
- Files: `e2e/integration/temp-articles.integration.spec.ts`, `e2e/integration/list-consistency.integration.spec.ts`
- All tests validate temp article cleanup and articleIds/itemStates consistency

#### ✅ Phase 2: Database Cleanup Scripts (COMPLETE - WITH NOTES)
- Created `scripts/cleanup-temp-articles.ts` - removes temp articles from production
- Created `scripts/validate-list-consistency.ts` - validates list consistency
- **Scripts compile successfully** but require Firebase Admin credentials to run
- Added 4 npm scripts: `cleanup:temp-articles`, `cleanup:temp-articles:dry-run`, `validate:lists`, `validate:lists:fix`
- **Note:** Scripts need to be tested against production database by user with credentials

#### ✅ Phase 3: Core Sync Bug Fix (COMPLETE)
- Fixed critical bug in `src/app/core/services/articles-repository.service.ts` (lines 143-157)
- Temp article ID replacements now persist to Firebase (not just local state)
- This was the root cause of article count discrepancies

#### ✅ Phase 4: Validation Service (COMPLETE)
- Created `src/app/core/services/list-validation.service.ts` with `validateList()` and `repairList()` methods
- Created `list-validation.service.spec.ts` with 12 passing unit tests
- Service ready for integration into list operations

### What Remains To Be Done

#### ❌ Phase 5: Playwright E2E Browser Tests (NOT STARTED)
**This is what needs to be done next:**
- Create browser-based Playwright tests for UI flows
- Test complete user journeys (offline → online → sync)
- Test shared list scenarios from UI perspective
- Requires Playwright browser automation
- User will run these locally (requires installed browsers)

#### ❌ Phase 6: CI/CD Integration (NOT STARTED)
- Add integration tests to CI pipeline
- Automate testing on every PR
- Configure CI environment for Firebase emulators

### Current State of Tests

**Integration Tests (Node environment):** ✅ 11/11 passing
- Can be run with: `npm run emulators:start` + `npm run test:integration`

**Unit Tests:** ✅ 12/12 passing
- `list-validation.service.spec.ts`

**Playwright E2E Tests:** ❌ Not created yet

### Your Task

Please continue with **Phase 5**: Create Playwright E2E browser tests.

1. **Read the original plan:** `TEMP_ARTICLE_E2E_PLAN.md` (lines 720-900 have Phase 5 details)

2. **Create browser-based E2E tests** that test the full user experience:
   - Offline article creation (generates temp IDs)
   - Going back online
   - Article sync to Firebase
   - Temp ID replacement
   - Shared list scenarios (owner vs participant view)

3. **Test files to create:**
   - `e2e/temp-articles.spec.ts` - Playwright tests for temp article flows
   - `e2e/shared-lists.spec.ts` - Playwright tests for shared list scenarios
   - Use the existing `e2e/utils/firebase-emulator.ts` for test helpers

4. **Configuration:**
   - `playwright.config.ts` already exists
   - Target: `http://localhost:4200` (Angular dev server)
   - Use Firebase emulators on ports 9099 (Auth) and 8080 (Firestore)

### Important Notes

- **Do NOT claim phases are complete if they're not done**
- Playwright tests are DIFFERENT from the integration tests (those use Vitest/Node, Playwright uses real browsers)
- The user will run these tests locally with `npm run test:e2e`
- Focus on testing the actual user experience, not just backend logic

### Reference Documents

- `TEMP_ARTICLE_E2E_PLAN.md` - Original 6-phase plan
- `SESSION_HANDOFF_E2E_TESTING.md` - Previous session context
- Integration tests in `e2e/integration/` - Use as reference for test data patterns

---

**Ready to start?** Yes, let's create the Playwright E2E browser tests for Phase 5.
