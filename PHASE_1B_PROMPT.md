# Phase 1B: Test list-detail.component.ts

I'm continuing the Shoplisl refactoring project.

**Status:**
- ✅ Phase 0 complete (Quick Wins 1-4 merged)
- ✅ Phase 1A complete (simplified-disambiguation.service.ts at 83.87% coverage)
- 🔜 Phase 1B: Test list-detail.component.ts

**Current Coverage Baseline:**
- Overall: 15.07% lines | 59.71% functions | 74.69% branches
- `list-detail.ts`: **4.09% coverage** (884 lines)

**Git branch:** (will be created for Phase 1B)

**Objective:**
Add comprehensive tests for `list-detail.component.ts` to achieve **70% coverage** before splitting this large file in Phase 3.

**Key areas to test:**
1. **Shopping mode filters** - offen/erledigt/alle
2. **Edit mode filters** - gelistet/fehlend/alle
3. **Search with auto-filter switching**
4. **Article toggle with 5-second undo**
5. **Celebration animation trigger**
6. **Department grouping**

**Files to focus on:**
- `src/app/features/lists/list-detail/list-detail.ts` (884 lines, 4.09% coverage)
- `src/app/features/lists/list-detail/list-detail.spec.ts` (if exists, or create)

Please read `/home/user/shoplisl/REFACTORING_PLAN.md` and `/home/user/shoplisl/COVERAGE.md` for full context, then:

1. Review Phase 1B requirements in the plan
2. Check current test coverage for list-detail
3. Create comprehensive test suite following the plan
4. Aim for 70% coverage
5. Run tests and verify coverage
6. Commit and push changes

**Testing approach from REFACTORING_PLAN.md:**
```typescript
describe('ListDetailComponent', () => {
  describe('Shopping Mode', () => {
    it('should filter to open items by default');
    it('should show undo hint for 5 seconds after checking');
    it('should trigger celebration when all items checked');
    it('should not celebrate if already in "erledigt" filter');
  });

  describe('Edit Mode', () => {
    it('should show all articles in "alle" filter');
    it('should show only listed articles in "gelistet" filter');
    it('should toggle article in/out of list');
  });

  describe('Search', () => {
    it('should auto-switch to "alle" filter when no results');
    it('should restore previous filter after adding item');
    it('should show disambiguation for similar articles');
  });
});
```

**Expected outcome:**
- list-detail.ts coverage: 4.09% → 70%+
- All critical flows tested
- Edge cases covered
- Tests passing
- Ready for Phase 3 splitting

Let's start Phase 1B!
