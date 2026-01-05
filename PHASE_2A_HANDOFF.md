# Phase 2a: Integration Test Infrastructure - Handoff Document

**Date:** January 5, 2026
**Branch:** `claude/plan-phase-2-3-e59zD`
**Status:** ✅ **INFRASTRUCTURE COMPLETE - TESTS READY FOR LOCAL EXECUTION**

---

## Executive Summary

Phase 2a infrastructure is **complete**. All test files, setup helpers, and configuration are ready. Integration tests are written and validated logically, but require **local execution** with Firebase Emulator due to containerized environment limitations.

**Completed:**
- ✅ Test infrastructure created (setup helpers, data factories)
- ✅ 4 integration tests written (3 critical + 1 bonus)
- ✅ NPM scripts configured
- ✅ Documentation complete
- ✅ Phase 3 refactoring plan documented

**Next:** Execute tests locally, validate all pass, then proceed to Phase 2b.

---

## What Was Completed

### 1. Test Infrastructure ✅

**Created Files:**
- `test/setup/firebase-test-setup.ts` - Firebase emulator connection helpers
- `test/helpers/test-data-factory.ts` - Test data factories for users, articles, lists
- `test/integration/README.md` - Comprehensive setup and troubleshooting guide

**Key Features:**
- Firebase Emulator connection with configurable ports
- Data cleanup between tests
- Real-time listener helpers
- Test data factories matching actual data models

### 2. Integration Tests Created ✅

**File:** `test/integration/realtime-sync.spec.ts`

**Tests:**

1. **Test 1: Participant Adds Article (Online)** ✅
   - Validates PRIMARY FIX from Phase 1
   - Verifies optimistic list update for ONLINE mode
   - Expected: Article visible immediately, syncs within 2s

2. **Test 2: Rapid Addition of 3 Articles** ✅
   - Validates rapid operations handling
   - Verifies all 3 articles appear immediately
   - Expected: All sync within 2s

3. **Test 3: Offline Article Creation** ✅
   - Validates OFFLINE FIXES from Phase 1
   - Verifies temp ID generation and replacement
   - Expected: Temp ID → Real ID, all references updated

4. **Test 4: mergeArticles Always Called** ✅ (Bonus)
   - Validates SECONDARY FIX from Phase 1
   - Verifies optimistic articles merge correctly
   - Expected: Articles visible even when batch query empty

**Test Characteristics:**
- Uses real Firebase Firestore operations (via emulator)
- Tests actual service behavior (not mocked)
- Validates real-time sync timing (< 2 seconds)
- Comprehensive assertions for all fix points

### 3. Configuration Updates ✅

**package.json Scripts:**
```json
"test:integration": "firebase emulators:exec 'vitest run test/integration'",
"test:integration:watch": "firebase emulators:exec 'vitest watch test/integration'",
"test:integration:ui": "firebase emulators:exec 'vitest --ui test/integration'",
"test:unit": "vitest run src",
"test:all": "npm run test:unit && npm run test:integration"
```

**firebase.json:**
- Firestore emulator port: 8081 (fixed conflict with PWA port 8080)
- UI enabled on port 4000
- Hosting emulator on port 5000

**Dependencies Added:**
- `firebase-admin@^13.6.0` - For admin SDK operations
- `@firebase/rules-unit-testing@^4.0.1` - For emulator testing

### 4. Documentation ✅

**REALTIME_SYNC_REFACTORING_PLAN.md**
- Identifies 6 refactoring opportunities for Phase 3
- Includes before/after code examples
- Testing strategy for safe refactoring
- 3-week implementation plan (3a, 3b, 3c, 3d)

**test/integration/README.md**
- Setup instructions
- Troubleshooting guide
- Development workflow recommendations
- CI/CD integration guidance

---

## Known Issue: Firebase Emulator in Container

### Problem

Firebase Emulator fails to download JAR file in containerized environment:

```
Error: TypeError: Converting circular structure to JSON
    --> starting at object with constructor 'ProxyAgent'
```

### Root Cause

Network/proxy restrictions in GitHub Codespaces or Docker containers prevent Firebase CLI from downloading the Firestore emulator JAR file.

### Solution for Development

**Run tests locally (not in container):**

```bash
# Terminal 1: Start emulator
npx firebase emulators:start --only firestore

# Terminal 2: Run tests
npm run test:integration
```

**Requirements:**
- Java 11+ installed
- Firebase emulator JAR downloaded (~100MB, one-time)
- No network restrictions

### Alternative: Unit Tests

If emulator unavailable, Phase 2b will create unit tests that mock Firebase services and test the same logic without requiring the emulator.

---

## How to Run Tests Locally

### Prerequisites

1. **Install Java:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install openjdk-11-jre

   # macOS
   brew install openjdk@11

   # Windows
   # Download from https://www.oracle.com/java/technologies/downloads/
   ```

2. **Verify Java:**
   ```bash
   java -version  # Should show Java 11+
   ```

### Step-by-Step Execution

**Option 1: Automated (Recommended for CI/CD)**
```bash
npm run test:integration
```

**Option 2: Manual (Recommended for Development)**

```bash
# Terminal 1: Start emulator
npx firebase emulators:start --only firestore

# Wait for this message:
# ✔  All emulators ready! It is now safe to connect your app

# Terminal 2: Run tests
npm run test:integration

# Or watch mode:
npm run test:integration:watch

# Or UI mode:
npm run test:integration:ui
```

### Expected Output

```
✓ test/integration/realtime-sync.spec.ts (4)
  ✓ Real-Time Sync Integration Tests (4)
    ✓ Test 1: Participant Adds Article (Online)
      ✓ should show article immediately to participant and sync to owner
    ✓ Test 2: Rapid Addition of Multiple Articles
      ✓ should handle rapid addition of 3 articles
    ✓ Test 3: Offline Article Creation
      ✓ should create article with temp ID and replace after sync
    ✓ Test 4: mergeArticles Always Called
      ✓ should merge optimistic articles even when batch query is empty

Test Files  1 passed (1)
     Tests  4 passed (4)
  Start at  13:00:00
  Duration  2.34s
```

---

## Test Validation Checklist

When running tests locally, verify:

- [ ] All 4 tests pass
- [ ] No console errors
- [ ] Timing assertions pass (< 2 seconds for sync)
- [ ] Temp ID replacement works correctly
- [ ] Firestore emulator UI shows data: http://localhost:4000

If any test fails, check:
1. Emulator is running on correct port (8081)
2. No port conflicts (kill existing processes)
3. Java version is 11 or higher
4. Network connection is stable

---

## Next Steps

### Phase 2a Completion (Immediate)

1. **Run tests locally:**
   ```bash
   npx firebase emulators:start --only firestore  # Terminal 1
   npm run test:integration                        # Terminal 2
   ```

2. **Verify all tests pass** (should take ~10-15 seconds)

3. **Document results:**
   - Update this file with test results
   - Screenshot of passing tests
   - Any issues encountered

### Phase 2b: Unit Tests (Next)

Create unit tests for Phase 1 code:

1. **articles-repository.service.spec.ts**
   - Test createArticle() online mode
   - Test createArticle() offline mode
   - Test temp ID replacement logic

2. **lists-repository.service.spec.ts**
   - Test updateList() optimistic update (PRIMARY FIX)
   - Test updateList() online vs offline
   - Test list sync with current state (OFFLINE FIX #3)

3. **firebase-data.service.spec.ts**
   - Test mergeArticles() always called (SECONDARY FIX)
   - Test loadArticlesForList() behavior

**Estimated Time:** 2-4 hours
**Goal:** >80% coverage for modified services

### Phase 2c: CI/CD Integration (Optional)

Create GitHub Actions workflow:

1. **File:** `.github/workflows/test.yml`
2. **Triggers:** Pull requests, push to main
3. **Steps:**
   - Install Java
   - Cache Firebase emulator JAR
   - Run unit tests
   - Run integration tests
   - Upload coverage reports

---

## File Structure

```
/home/user/shoplisl/
├── firebase.json                           # Emulator config (port 8081)
├── package.json                            # Test scripts added
├── PHASE_2A_HANDOFF.md                    # This file
├── REALTIME_SYNC_REFACTORING_PLAN.md      # Phase 3 plan
├── REALTIME_SYNC_HANDOFF.md               # Phase 1 documentation
├── test/
│   ├── setup/
│   │   └── firebase-test-setup.ts         # Emulator connection helpers
│   ├── helpers/
│   │   └── test-data-factory.ts           # Test data factories
│   └── integration/
│       ├── README.md                       # Setup guide
│       └── realtime-sync.spec.ts          # 4 integration tests ✅
└── src/app/core/services/
    ├── articles-repository.service.ts     # Tests validate this
    ├── lists-repository.service.ts        # Tests validate this
    └── firebase-data.service.ts           # Tests validate this
```

---

## Success Metrics

### Phase 2a (Current)
- [x] Test infrastructure created
- [x] 4 integration tests written
- [x] NPM scripts configured
- [x] Documentation complete
- [ ] **Tests executed and passing locally** ← Next action

### Phase 2 Overall (Target)
- [ ] Integration tests passing (Phase 2a)
- [ ] Unit tests created (Phase 2b)
- [ ] >80% coverage for modified services (Phase 2b)
- [ ] CI/CD workflow created (Phase 2c)
- [ ] All tests passing in CI (Phase 2c)

---

## CI/CD Investigation Results

**Found:** GitHub Actions workflows in `.github/workflows/`

1. **deploy.yml**
   - Triggers: Push to main
   - Steps: Build → Deploy to Firebase Hosting
   - **Missing:** No tests run before deployment

2. **setup-project.yml**
   - Triggers: Manual workflow dispatch
   - Purpose: Initial project setup

**Recommendation:** Create `.github/workflows/test.yml` for:
- Pull request validation
- Pre-deployment testing
- Coverage reporting

---

## Questions for Next Session

1. **Test Execution:** Were you able to run integration tests locally?
   - If yes: Did all 4 tests pass?
   - If no: What error occurred?

2. **Environment:** What's your local development environment?
   - macOS / Windows / Linux?
   - VSCode / WebStorm / Other?
   - Docker / Native?

3. **Priority:** Which should we focus on next?
   - A) Fix integration test execution issues
   - B) Create unit tests (Phase 2b)
   - C) Create CI/CD workflow (Phase 2c)
   - D) Start Phase 3 refactoring (with current manual testing)

4. **Timeline:** How much time available for Phase 2?
   - Phase 2a: ✅ Complete (infrastructure)
   - Phase 2b: ~4 hours (unit tests)
   - Phase 2c: ~2 hours (CI/CD)
   - **Total remaining:** ~6 hours

---

## Git Status

**Branch:** `claude/plan-phase-2-3-e59zD`
**Commits:**
- `aadcbed` - feat: Phase 2a setup - integration test infrastructure

**Uncommitted Files:**
- `test/integration/realtime-sync.spec.ts` (new)
- `test/integration/README.md` (new)
- `PHASE_2A_HANDOFF.md` (new)

**Ready to Commit:** Yes, after this review

---

## Summary

**Phase 2a Status:** ✅ **Infrastructure Complete**

**What Works:**
- Test files logically sound
- Data factories match models
- Setup helpers comprehensive
- Documentation thorough

**What Needs Validation:**
- Local test execution
- All 4 tests passing
- Timing assertions correct
- No edge cases missed

**Blocker:** Firebase Emulator download in container
**Solution:** Run tests locally (requires Java 11+)

**Next Action:** Execute tests locally and report results

---

**Last Updated:** January 5, 2026
**Status:** 📋 **READY FOR LOCAL EXECUTION**
**Next:** Run tests → Validate results → Phase 2b unit tests
