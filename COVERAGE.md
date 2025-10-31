# Test Coverage Report & Goals

**Last Updated:** 2025-10-31 (After Quick Wins 1-3)
**Project:** Shoplisl Refactoring

---

## 📊 Current Coverage Baseline

| Metric      | Current | Target | Status |
|-------------|---------|--------|--------|
| **Lines**       | 15.07%  | 70%    | 🔴 Needs Improvement |
| **Functions**   | 59.71%  | 70%    | 🟡 Close to Target |
| **Branches**    | 74.69%  | 70%    | ✅ **Above Target!** |
| **Statements**  | 15.07%  | 70%    | 🔴 Needs Improvement |

### Key Observations

✅ **Strengths:**
- **Branch Coverage: 74.69%** - Already exceeds our 70% target!
- **Function Coverage: 59.71%** - Close to target, needs 10.29% improvement
- Existing tests for critical services:
  - `simplified-disambiguation.service.ts` - 83.87% lines, 88.5% functions
  - `context-management.service.ts` - 60.23% lines, 66.22% functions
  - `department-mapping.utils.ts` - 100% coverage ✨

🔴 **Gaps:**
- **Line/Statement Coverage: 15.07%** - Significant gap to 70% target
- Large files with 0% coverage:
  - `voice-ai-assistant.component.ts` (1,668 lines) - 0%
  - `list-detail.ts` (884 lines) - 4.09%
  - Many services in `core/services/ai/` - 0%

---

## 🎯 Coverage Goals & Strategy

### Short-Term Goals (Phase 0-1)

1. **Prevent Regression** ✅
   - Thresholds set at current baseline in `vitest.config.ts`
   - Any PR that decreases coverage will fail CI

2. **Test Large Files Before Splitting** (Phase 1)
   - `simplified-disambiguation.service.ts` - Already at 83.87% ✅
   - `list-detail.ts` - Target 70% before splitting
   - `voice-ai-assistant.component.ts` - Target 70% before splitting

   **Timeline:** Phase 1 (Days 1-5)

### Medium-Term Goals (Phase 2-4)

3. **Maintain Coverage During Refactoring**
   - As files are split, maintain or improve coverage
   - Each new service file should have >70% coverage

4. **Increase Thresholds Progressively**
   ```
   Phase 1 End: Lines 30%, Functions 65%, Branches 75%, Statements 30%
   Phase 2 End: Lines 45%, Functions 68%, Branches 75%, Statements 45%
   Phase 3 End: Lines 60%, Functions 70%, Branches 75%, Statements 60%
   Phase 4 End: Lines 70%, Functions 70%, Branches 75%, Statements 70% ✅
   ```

### Long-Term Goals (Phase 5+)

5. **Achieve 70% Across All Metrics** ✨
   - Lines: 70%
   - Functions: 70%
   - Branches: 75% (maintain current high level)
   - Statements: 70%

---

## 🔧 How to Run Coverage

### Generate Coverage Report

```bash
# Run tests with coverage
npm run test:coverage

# Coverage report saved to:
# - coverage/index.html (visual report)
# - coverage/lcov.info (for CI tools)
# - Terminal output (summary)
```

### View HTML Report

```bash
# Open the visual coverage report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

### CI Integration

Coverage thresholds are enforced in `vitest.config.ts`. If coverage falls below thresholds, tests will fail:

```
ERROR: Coverage for lines (14%) does not meet threshold (15%)
```

---

## 📈 Interpreting Coverage Metrics

### Lines Coverage (15.07%)
- **What it measures:** Percentage of executable code lines that are run during tests
- **Why it's low:** Many large files have no tests yet (voice-ai-assistant, list operations)
- **Priority:** Focus on testing business logic in large services

### Functions Coverage (59.71%)
- **What it measures:** Percentage of functions/methods that are called in tests
- **Why it's good:** Many services have at least basic test coverage
- **Priority:** Test remaining public APIs and complex private methods

### Branches Coverage (74.69%) ✅
- **What it measures:** Percentage of conditional branches (if/else) tested
- **Why it's excellent:** Existing tests cover most decision paths
- **Priority:** Maintain this high level during refactoring

### Statements Coverage (15.07%)
- **What it measures:** Percentage of executable statements that run in tests
- **Why it's low:** Correlates with line coverage; many files untested
- **Priority:** Same as lines - test large untested files

---

## 🎯 Priority Testing Areas

Based on file size, complexity, and 0% coverage:

### Critical Priority (Phase 1)

1. **`list-detail.ts` (884 lines, 4.09% coverage)**
   - Current: 4.09% lines
   - Target: 70% by end of Phase 1B
   - Focus: Filter logic, search, celebration animation, undo functionality

2. **`voice-ai-assistant.component.ts` (1,668 lines, 0% coverage)**
   - Current: 0%
   - Target: 70% by end of Phase 1C
   - Focus: Context sync, message handling, disambiguation flow

3. **`simplified-disambiguation.service.ts` (1,236 lines, 83.87% coverage)** ✅
   - Current: 83.87% - **Already well-tested!**
   - Action: Add remaining edge case tests (get to 90%+)

### High Priority (Phase 1-2)

4. **AI Services with 0% Coverage:**
   - `ai.service.ts` (762 lines) - Main facade
   - `command-processing.service.ts` - Command routing
   - `recipe-processing.service.ts` - Recipe handling
   - `list-operations.service.ts` - List CRUD
   - `article-operations.service.ts` - Article CRUD

5. **Component Integration Tests:**
   - `article-list.component.ts` (36.17%)
   - `article-item.component.ts` (26.76%)
   - `filter-fab.component.ts` (21.68%)

### Medium Priority (Phase 3-4)

6. **Feature Modules:**
   - `lists-overview.ts` (0%)
   - `article-overview.ts` (13.1%)
   - `add-list.ts` (0%)
   - `add-article.ts` (0%)

---

## 📝 Testing Strategy

### Test Distribution (Target)

```
70% Unit Tests
  ├─ Services (pure logic)
  ├─ Utilities (pure functions) ✅ Already at 100%!
  └─ Component logic (non-UI)

25% Integration Tests
  ├─ Component + Service interactions
  ├─ Multi-service workflows
  └─ Data flow through app

5% E2E Tests
  ├─ Critical user journeys
  ├─ Shopping flow (add, check, complete)
  └─ List management
```

### What to Test First

1. **Business Logic** (High Value)
   - AI command processing
   - Disambiguation algorithms
   - List/article operations

2. **Complex Algorithms** (High Risk)
   - Levenshtein distance calculation ✅ (Already tested)
   - Multi-item sequential processing
   - Context synchronization

3. **User Workflows** (High Impact)
   - Add article to list
   - Search with disambiguation
   - Shopping mode with undo
   - Celebration on completion

4. **Edge Cases** (High Risk)
   - Empty lists
   - Network failures
   - Invalid input
   - Race conditions

### What to Test Later

1. **UI Components** (Low Risk)
   - Template rendering
   - Styling
   - Animations

2. **Configuration** (Low Risk)
   - Module definitions
   - Routing
   - Environment files

3. **Trivial Code** (Low Value)
   - Simple getters/setters
   - Constant definitions
   - Type definitions

---

## 🔄 Progressive Threshold Updates

Update `vitest.config.ts` thresholds as coverage improves:

```typescript
// Example progression
thresholds: {
  // Phase 1 End (After testing large files)
  lines: 30,
  functions: 65,
  branches: 74,
  statements: 30,

  // Phase 2 End (After disambiguation split)
  lines: 45,
  functions: 68,
  branches: 74,
  statements: 45,

  // Phase 3 End (After list-detail split)
  lines: 60,
  functions: 70,
  branches: 74,
  statements: 60,

  // Phase 4+ End (Final goal)
  lines: 70,
  functions: 70,
  branches: 74,
  statements: 70,
}
```

---

## 🚀 Quick Reference

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run specific test file
npm run test src/app/core/services/ai/ai-messaging.service.spec.ts

# Generate coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui
```

---

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Angular Services](https://angular.io/guide/testing-services)
- [Testing Angular Components](https://angular.io/guide/testing-components-basics)
- [Test Coverage Best Practices](https://martinfowler.com/bliki/TestCoverage.html)

---

## ✅ Coverage Checklist

Use this checklist when reviewing PRs:

- [ ] All new code has tests
- [ ] Coverage meets or exceeds branch baseline
- [ ] Large files (>500 lines) have >70% coverage
- [ ] Critical business logic has >90% coverage
- [ ] Edge cases are tested
- [ ] Integration tests exist for complex workflows
- [ ] Coverage report reviewed (no unexpected gaps)

---

**Note:** Coverage is a quality indicator, not a quality guarantee. Focus on meaningful tests over hitting arbitrary percentage goals.
