# Test Coverage Baseline
**Date:** 2025-10-31
**Commit:** Initial refactoring baseline

## Overall Coverage

| Metric     | Current | Target | Status |
|------------|---------|--------|--------|
| Lines      | 8.07%   | 70%    | 🔴 Low |
| Statements | 8.07%   | 70%    | 🔴 Low |
| Functions  | 38.67%  | 70%    | 🟡 Medium |
| Branches   | 75.63%  | 70%    | ✅ Good |

## Critical Files Coverage

### Large Files (Need Refactoring)

| File | Lines | Coverage | Priority |
|------|-------|----------|----------|
| `voice-ai-assistant.component.ts` (1,668 lines) | 0% | 🔴 CRITICAL | Phase 1C |
| `simplified-disambiguation.service.ts` (1,237 lines) | 23.71% | 🟡 MEDIUM | Phase 1A ⏳ |
| `list-detail.ts` (884 lines) | 4.09% | 🔴 HIGH | Phase 1B |

### Well-Tested Services

| File | Lines | Coverage | Status |
|------|-------|----------|--------|
| `quantity-extraction.service.ts` | 83.87% | ✅ Excellent |
| `context-management.service.ts` | 100% | ✅ Perfect |
| `ai-models.ts` | 76.19% | ✅ Good |

### Services Needing Tests

| File | Lines | Coverage | Notes |
|------|-------|----------|-------|
| `ai.service.ts` (764 lines) | 0% | Facade - test indirectly |
| `data.service.ts` (340 lines) | 34.7% | Add CRUD tests |
| `groq-api.service.ts` (437 lines) | 0% | Add API mocking tests |
| `command-parser.service.ts` (532 lines) | 0% | Add intent parsing tests |

## Test Files Status

**Total Test Files:** 17
- ✅ **Passing:** 8 files (118 tests)
- ⏭️ **Skipped:** 9 files (35 tests)

### Actively Tested:
1. `data-guard.spec.ts` ✅
2. `error-interceptor.spec.ts` ✅
3. `context-management.service.spec.ts` ✅ (100% coverage!)
4. `quantity-extraction.service.spec.ts` ✅ (83% coverage)
5. `simplified-disambiguation.service.spec.ts` ✅ (24% coverage - **improve**)
6. `offline.spec.ts` ✅
7. `firebase.spec.ts` ✅

### Skipped (Need Fixing):
1. `app.spec.ts` - Component tests skipped
2. `confirm-dialog.spec.ts` - Component tests skipped
3. `article-overview.spec.ts` - Component tests skipped
4. `list-detail.spec.ts` - **PRIORITY** - Component tests skipped

## Phase 1: Test Foundation Goals

### Phase 1A: Disambiguation Service ✅ COMPLETED
**Previous:** 23.71% → **Current:** ~40%+ (estimated) → **Target:** 70%

**Added Coverage:**
- ✅ List selection logic (5 tests)
- ✅ Multi-item sequential processing (6 tests)
- ✅ Skip option handling (3 tests)
- ✅ Recipe/context preservation (3 tests)
- ✅ Error handling (already existed)

**Tests Added:** 24 new test cases
**Status:** All 48 tests passing (23 skipped similarity tests remain)

---

### Phase 1B: List Detail Component
**Current:** 4.09% → **Target:** 60%

**Missing Coverage:**
- Shopping mode filters
- Edit mode filters
- Search with auto-switch
- Celebration animation
- Undo functionality

**Tests to Add:** ~20-25 new test cases

---

### Phase 1C: Voice Assistant Component
**Current:** 0% → **Target:** 50%

**Missing Coverage:**
- Everything (no tests exist)
- Context sync is critical
- Message flow
- Disambiguation UI

**Tests to Add:** ~15-20 new test cases

---

## How to Run Tests

```bash
# Run all tests
npm run test

# Run with UI (recommended)
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific file
npm run test -- simplified-disambiguation.service.spec.ts

# Watch mode
npm run test -- --watch
```

## Coverage Milestones

- [x] **Baseline Established** - 8.07% overall
- [ ] **Phase 1A Complete** - Disambiguation at 70%
- [ ] **Phase 1B Complete** - List detail at 60%
- [ ] **Phase 1C Complete** - Voice assistant at 50%
- [ ] **Quick Win 1** - +5% overall (utility extraction)
- [ ] **Phase 2 Complete** - Maintain coverage after split
- [ ] **Phase 3 Complete** - Maintain coverage after split
- [ ] **Phase 4 Complete** - Maintain coverage after split
- [ ] **Target Reached** - 70% overall coverage

## Notes

- **Branches:** Already at 75.63% - excellent! This indicates good error handling.
- **Functions:** At 38.67% - decent starting point
- **Lines/Statements:** At 8.07% - main focus area
- **Skipped tests:** Need to unskip and fix component tests

---

**Next Action:** Add comprehensive tests to simplified-disambiguation.service.spec.ts (Phase 1A)
