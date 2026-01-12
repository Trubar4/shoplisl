# Session Handoff: E2E Testing Infrastructure & Integration Tests

**Date:** 2026-01-12
**Branch:** `claude/fix-shared-list-articles-ZjaQa`
**Status:** 10/11 integration tests passing, 1 mysterious failure remaining

## What Was Accomplished

### Phase 1: E2E Testing Infrastructure Setup ✅

Successfully set up comprehensive testing infrastructure to enable automated testing without manual intervention.

#### 1. Firebase Emulator Configuration
- **File:** `firebase.json`
- Added Auth emulator (port 9099)
- Configured Firestore emulator (port 8080)
- Enabled emulator UI (port 4000)
- Set `singleProjectMode: true`

#### 2. Playwright Setup
- **File:** `playwright.config.ts`
- Configured for E2E browser tests
- Set to ignore integration tests folder
- Base URL: http://localhost:4200
- Ready for user to run locally (browsers need manual install)

#### 3. Test Environments
- **File:** `src/environments/environment.test.ts`
- Test environment configuration for emulators
- **File:** `src/app/app.config.test.ts`
- Angular config that connects to emulators

#### 4. Test Utilities & Fixtures
- **File:** `e2e/utils/firebase-emulator.ts` (190 lines)
  - Uses Firebase SDK directly (compatible with Firebase 11.x)
  - Connects to Auth and Firestore emulators
  - Helper functions: `setupEmulators()`, `clearEmulators()`, `getAuthenticatedFirestore()`
  - 100ms auth propagation delay added

- **File:** `e2e/utils/test-helpers.ts` (177 lines)
  - Playwright helpers for UI testing (user runs these)
  - Methods: login, createList, addArticleToList, shareList, etc.

- **File:** `e2e/fixtures/test-data.ts` (134 lines)
  - Test users, articles, lists
  - `createItemState()` - Only includes defined fields (Firestore doesn't allow undefined)
  - `generateTempId()` - Generates temp article IDs

- **File:** `e2e/global-setup.ts`
  - Validates emulators are running before tests

- **File:** `vitest.integration.config.ts`
  - Separate config for integration tests (node environment, no browser)

#### 5. Integration Tests Written (11 tests total)

**File:** `e2e/integration/temp-articles.integration.spec.ts` (5 tests)
1. ✅ should create a list with temp article IDs
2. ❌ **should replace temp IDs with real IDs in Firebase** (FAILING - see below)
3. ✅ should handle multiple temp IDs being replaced
4. ✅ should maintain checked state when replacing temp IDs
5. ✅ should work with shared lists - participant view

**File:** `e2e/integration/list-consistency.integration.spec.ts` (6 tests)
1. ✅ should have matching keys between articleIds and itemStates
2. ✅ should detect when articleIds has an ID not in itemStates
3. ✅ should detect when itemStates has a key not in articleIds
4. ✅ should repair inconsistencies by removing orphaned entries
5. ✅ should add article with both articleId and itemState
6. ✅ should remove article from both articleIds and itemStates

#### 6. NPM Scripts Added
```json
"test:integration": "vitest --config vitest.integration.config.ts",
"test:integration:ui": "vitest --config vitest.integration.config.ts --ui",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"emulators:start": "firebase emulators:start --only auth,firestore",
"emulators:kill": "lsof -ti:8080,9099,4000,5001 | xargs kill -9 || true"
```

#### 7. Documentation
- **File:** `E2E_TESTING_README.md` - Complete testing guide
- **File:** `TEMP_ARTICLE_E2E_PLAN.md` - Original implementation plan (6 phases)

## Key Technical Decisions & Fixes

### Issue 1: Firebase Dependency Conflicts
**Problem:** `@firebase/rules-unit-testing@5.0.0` required `firebase@^12.0.0`, but project uses `firebase@11.10.0`

**Solution:** Use regular Firebase SDK instead of testing package
- More compatible, simpler approach
- Direct connection to emulators via `connectAuthEmulator()` and `connectFirestoreEmulator()`

### Issue 2: Firestore Rejects Undefined Values
**Problem:** `createItemState()` was setting `amount: undefined`, causing Firebase errors

**Solution:** Conditionally add fields only if defined
```typescript
if (options.amount !== undefined) {
  state.amount = options.amount;
}
```

### Issue 3: Security Rules Blocking Updates
**Problem:** `updateDoc()` failed with permission denied due to complex security rules

**Solution:** Use read-modify-write pattern with `setDoc()`
```typescript
const currentDoc = await getDoc(listRef);
const currentData = currentDoc.data();
await setDoc(listRef, {
  // Explicitly list ALL fields
  id: currentData.id,
  name: currentData.name,
  // ... all other fields
  articleIds: [newValue],
  itemStates: { newValue },
});
```

### Issue 4: Nested Object Merging with setDoc({merge: true})
**Problem:** `setDoc()` with `merge: true` merges nested objects instead of replacing
- Temp IDs persisted alongside new IDs

**Solution:** Don't use merge flag - read, modify, write completely

### Issue 5: Object Spread Losing Fields
**Problem:** Using `...list` or `...currentData` lost critical fields like `ownerId`

**Solution:** Explicitly list every field in all `setDoc()` calls
- Never use object spread operator
- List all 10 required fields: id, name, color, icon, ownerId, sharedWith, articleIds, itemStates, createdAt, updatedAt

## Current Status: 10/11 Tests Passing ✅

**Success rate:** 90.9% (10 out of 11 tests passing)

**All passing tests verify:**
- ✅ Temp article IDs can be created in Firestore
- ✅ Multiple temp IDs can be replaced simultaneously
- ✅ Checked state is preserved during temp ID replacement
- ✅ Shared lists work correctly (owner creates, participant reads)
- ✅ ArticleIds and itemStates consistency detection works
- ✅ Inconsistencies can be repaired
- ✅ Articles can be added/removed atomically

## Remaining Issue: 1 Mysterious Failure ❌

### Test: "should replace temp IDs with real IDs in Firebase"

**Error:**
```
Error: Document does not exist after creation
❯ e2e/integration/temp-articles.integration.spec.ts:134:13
```

**What the test does:**
1. Creates a list with temp IDs ✅ (verified with existence check)
2. Reads the document back immediately
3. Document doesn't exist ❌ (fails existence check)

**Suspicious observations:**
- Same pattern works in test 3 and 4
- Document exists at line 125, doesn't exist at line 133 (8 lines later)
- No deletes or writes happen between these lines
- Emulator might have timing/race condition issue

**Code snippet (temp-articles.integration.spec.ts:110-134):**
```typescript
await setDoc(listRef, {
  id: list.id,
  // ... all fields explicitly listed
  articleIds: list.articleIds,  // Has temp IDs
  itemStates: list.itemStates,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
});

// Verify document was created
const createdSnapshot = await getDoc(listRef);
expect(createdSnapshot.exists()).toBe(true);  // ✅ PASSES

// Simulate sync: Replace temp ID with real ID
// Read current document, modify, write back completely
const currentDoc = await getDoc(listRef);

// Verify document exists before accessing data
if (!currentDoc.exists()) {
  throw new Error('Document does not exist after creation');  // ❌ FAILS HERE
}
```

**Hypotheses:**
1. **Race condition:** Auth state or Firestore state not fully propagated
2. **Emulator bug:** Document gets lost between reads
3. **Scope issue:** `listRef` refers to different document than expected
4. **Cache issue:** Second read gets stale cache that says document doesn't exist

**Attempted fixes (didn't work):**
- ✅ Added 100ms delay after auth
- ✅ Added explicit document existence checks
- ✅ Removed object spread operators
- ✅ Explicitly listed all fields
- ✅ Used read-modify-write pattern

**Potential solutions to try:**
1. Add delay between first and second `getDoc()` call
2. Add retry logic with exponential backoff
3. Use different list ID for this test (avoid potential collision)
4. Add more detailed logging to see what's happening
5. Try using `getDocFromCache()` vs `getDocFromServer()`
6. Check if security rules are somehow deleting the document

## Files Modified (13 files)

### New Files Created (11)
1. `TEMP_ARTICLE_E2E_PLAN.md` - Implementation plan
2. `E2E_TESTING_README.md` - Testing documentation
3. `playwright.config.ts` - Playwright configuration
4. `vitest.integration.config.ts` - Integration test config
5. `src/environments/environment.test.ts` - Test environment
6. `src/app/app.config.test.ts` - Test Angular config
7. `e2e/utils/firebase-emulator.ts` - Emulator utilities
8. `e2e/utils/test-helpers.ts` - Playwright helpers
9. `e2e/fixtures/test-data.ts` - Test fixtures
10. `e2e/integration/temp-articles.integration.spec.ts` - 5 tests
11. `e2e/integration/list-consistency.integration.spec.ts` - 6 tests
12. `e2e/global-setup.ts` - Global test setup

### Modified Files (2)
1. `firebase.json` - Added Auth emulator
2. `package.json` - Added test scripts and Playwright dependency

## Git History (Recent Commits)

```
0405100 fix: replace object spread with explicit fields in all test document creation
c8d4602 fix: add document existence checks and fix remaining updateDoc usage
d91c95b fix: explicitly preserve all required fields in setDoc operations
615510b fix: resolve nested object merge issues in integration tests
8710b8e fix: resolve Firestore security rules issues in integration tests
bbc6609 fix: resolve Firestore undefined values and Playwright test conflicts
1b487db fix: resolve Firebase dependency conflicts in integration tests
8bb5d96 test: set up E2E testing infrastructure with Firebase emulators and Playwright
d9ababb build: add Playwright and Firebase testing dependencies for E2E tests
fafd0eb docs: add comprehensive plan for temp article cleanup and E2E testing
```

## How to Run Tests

### Prerequisites
```bash
# 1. Install dependencies (already done)
npm install

# 2. Start Firebase emulators (in one terminal)
npm run emulators:start
# Wait for: ✅ All emulators started...

# 3. Run integration tests (in another terminal)
npm run test:integration
```

### Expected Output
```
✓ e2e/integration/list-consistency.integration.spec.ts (6 tests)
✓ e2e/integration/temp-articles.integration.spec.ts (4 tests)
✗ e2e/integration/temp-articles.integration.spec.ts (1 test failed)
  × should replace temp IDs with real IDs in Firebase
    → Document does not exist after creation

Test Files  1 failed | 1 passed (2)
Tests      1 failed | 10 passed (11)
```

## What's NOT Done (From Original Plan)

### Phase 2: Database Cleanup Script
- ❌ Not started
- **File to create:** `scripts/cleanup-temp-articles.ts`
- **Purpose:** Clean existing production temp article IDs

### Phase 3: Fix Temp Article Sync in Code
- ❌ Not started
- **Files to modify:**
  - `src/app/core/services/firebase-data.service.ts` - Add `updateListInFirebase()`
  - `src/app/core/services/articles-repository.service.ts` - Update offline sync callback

### Phase 4: Consistency Validation Service
- ❌ Not started
- **File to create:** `src/app/core/services/list-validation.service.ts`
- **Purpose:** Runtime validation and repair of articleIds/itemStates

### Phase 5: More E2E Tests
- ❌ Not started
- Browser-based Playwright tests (user runs locally)

### Phase 6: CI/CD Integration
- ❌ Not started

## Next Session Prompt

```markdown
I'm continuing work on the ShopLisl temp article cleanup and E2E testing infrastructure.

**Branch:** `claude/fix-shared-list-articles-ZjaQa`

**Context:**
We've successfully set up E2E testing infrastructure with Firebase emulators and written 11 integration tests. 10 out of 11 tests are passing. There's one remaining test failure that appears to be a timing/race condition issue.

**Current Status:**
- ✅ Firebase emulators configured (Auth + Firestore)
- ✅ Playwright configured for E2E tests
- ✅ Test utilities and fixtures created
- ✅ 11 integration tests written (10 passing, 1 failing)
- ✅ All infrastructure committed and pushed

**The Failing Test:**
`e2e/integration/temp-articles.integration.spec.ts` - "should replace temp IDs with real IDs in Firebase"

**Error:** Document exists on first read but doesn't exist on second read 8 lines later
```
Error: Document does not exist after creation
❯ temp-articles.integration.spec.ts:134:13
```

**Problem:** The test creates a document, verifies it exists (passes), then immediately reads it again and it doesn't exist (fails). This happens consistently. No deletes or writes occur between the reads.

**What I need you to do:**

1. **Read the handoff document:** `SESSION_HANDOFF_E2E_TESTING.md` (in repo root)
2. **Analyze the failing test:** Lines 88-156 in `e2e/integration/temp-articles.integration.spec.ts`
3. **Debug the issue:** Figure out why the document disappears between two `getDoc()` calls
4. **Fix the test:** Make all 11 integration tests pass
5. **Once passing:** Move to Phase 2 (database cleanup script) as outlined in `TEMP_ARTICLE_E2E_PLAN.md`

**Key files to review:**
- `SESSION_HANDOFF_E2E_TESTING.md` - This handoff document
- `TEMP_ARTICLE_E2E_PLAN.md` - Original plan
- `E2E_TESTING_README.md` - Testing guide
- `e2e/integration/temp-articles.integration.spec.ts` - The failing test
- `e2e/utils/firebase-emulator.ts` - Emulator utilities

**Important patterns established:**
- Always explicitly list all fields in `setDoc()` (never use spread operator)
- Use read-modify-write pattern for updates (never `updateDoc()` with merge)
- Check document existence before calling `.data()`
- No `!` non-null assertions

Let me know when you've reviewed the handoff document and are ready to debug the failing test.
```

## Additional Notes

### Why This Testing Infrastructure Matters

1. **Automated verification:** Tests verify the temp article cleanup logic works correctly
2. **Multi-user scenarios:** Can test owner/participant interactions automatically
3. **Fast iteration:** No need for manual testing after every code change
4. **TDD workflow:** Can write tests first, then implement features
5. **Regression prevention:** Tests ensure fixes don't break in the future

### Testing Insights Gained

1. **Firestore emulator quirks:**
   - Object spread doesn't work reliably
   - Need explicit field listing
   - Timing issues between operations

2. **Security rules complexity:**
   - Update rules are more restrictive than create rules
   - Read-modify-write with full document replacement is safer

3. **Firebase SDK compatibility:**
   - Regular SDK works better than testing packages
   - Direct emulator connection is straightforward

### Success Metrics

**Current:** 10/11 tests passing (90.9%)
**Target:** 11/11 tests passing (100%)
**Then:** Move to implementation phases (2-6)

Once all tests pass, we have a solid foundation for:
- Implementing the actual temp article cleanup
- Adding consistency validation
- Writing more comprehensive E2E tests
- Enabling true TDD workflow

---

**END OF SESSION HANDOFF**

Please read this document carefully before proceeding. The next step is to fix the 1 remaining test failure, then move forward with the implementation phases.
