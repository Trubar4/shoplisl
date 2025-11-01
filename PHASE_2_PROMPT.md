# Phase 2: Split Disambiguation Service

## 🎯 Goal
Break down the 1,237-line `simplified-disambiguation.service.ts` into focused, maintainable modules while preserving 83.87% test coverage.

## ✅ Prerequisites
- Phase 1 Complete: All three critical files have 70%+ test coverage
- Branch: `claude/phase-2-split-disambiguation-service-[SESSION_ID]`
- Current Coverage: 83.87% (78 passing tests)

## 📋 Current File Structure

### simplified-disambiguation.service.ts (1,237 lines)
Location: `src/app/core/services/ai/simplified-disambiguation.service.ts`

**Key Responsibilities:**
1. **Article Matching** (lines 50-300)
   - Levenshtein distance calculation
   - Similarity scoring
   - Fuzzy matching with thresholds

2. **List Selection** (lines 301-450)
   - Multi-list disambiguation
   - Auto-selection for single list
   - List option generation

3. **Multi-Item Processing** (lines 451-700)
   - Sequential recipe processing
   - Progress tracking
   - Skip/continue flow

4. **Disambiguation UI State** (lines 701-900)
   - Option formatting
   - Icon selection
   - Department mapping

5. **Choice Handling** (lines 901-1200)
   - User selection processing
   - Skip logic
   - Context preservation

## 🔧 Proposed Split

### 1. article-matcher.service.ts (~250 lines)
**Purpose:** Pure article matching logic
```typescript
export class ArticleMatcherService {
  calculateLevenshteinDistance(str1: string, str2: string): number;
  calculateSimilarity(input: string, article: Article): number;
  findBestMatches(input: string, articles: Article[]): DisambiguationOption[];
}
```

**Tests to Preserve:** 15 existing tests
- Levenshtein distance calculation
- Similarity scoring with different thresholds
- Best match selection

### 2. list-selector.service.ts (~150 lines)
**Purpose:** List selection logic
```typescript
export class ListSelectorService {
  convertListsToOptions(lists: ShoppingList[]): DisambiguationOption[];
  shouldAutoSelectList(lists: ShoppingList[]): boolean;
  handleListSelection(listId: string, context: ConversationContext): void;
}
```

**Tests to Preserve:** 5 existing tests
- Convert lists to options
- Auto-selection for single list
- Multi-list prompting

### 3. multi-item-processor.service.ts (~300 lines)
**Purpose:** Sequential multi-item processing
```typescript
export class MultiItemProcessorService {
  processItemsSequentially(items: ParsedItem[], listId: string): Promise<void>;
  handleSkipItem(pendingAction: MultiItemPendingAction): Promise<AIExecutionResult>;
  handleSkipAllRemaining(pendingAction: MultiItemPendingAction): Promise<AIExecutionResult>;
  getProgressInfo(pendingAction: MultiItemPendingAction): ProgressInfo;
}
```

**Tests to Preserve:** 10 existing tests
- Sequential processing
- Skip logic
- Progress tracking

### 4. disambiguation-formatter.service.ts (~150 lines)
**Purpose:** UI formatting and display
```typescript
export class DisambiguationFormatterService {
  formatOption(option: DisambiguationOption): FormattedOption;
  selectIcon(option: DisambiguationOption): string;
  getDepartmentInfo(departmentId: string): DepartmentInfo;
}
```

**Tests to Preserve:** 8 existing tests
- Option formatting
- Icon selection
- Department mapping

### 5. simplified-disambiguation.service.ts (~387 lines)
**Purpose:** Orchestration and public API
```typescript
export class SimplifiedDisambiguationService {
  constructor(
    private articleMatcher: ArticleMatcherService,
    private listSelector: ListSelectorService,
    private multiItemProcessor: MultiItemProcessorService,
    private formatter: DisambiguationFormatterService
  ) {}

  getDisambiguationOptions(input: string, context: ConversationContext): Promise<DisambiguationResult>;
  handleDisambiguationChoice(pendingAction: PendingAction, choice: DisambiguationOption): Promise<AIExecutionResult>;
}
```

**Tests to Preserve:** All 78 existing tests should continue passing

## 📝 Implementation Steps

### Step 1: Extract ArticleMatcherService (Day 1)
1. Create `src/app/core/services/ai/article-matcher.service.ts`
2. Move Levenshtein and similarity functions
3. Create `article-matcher.service.spec.ts` with existing tests
4. Update imports in `simplified-disambiguation.service.ts`
5. Run tests: Ensure all 78 tests still pass

### Step 2: Extract ListSelectorService (Day 1)
1. Create `src/app/core/services/ai/list-selector.service.ts`
2. Move list selection logic
3. Create `list-selector.service.spec.ts` with existing tests
4. Update imports
5. Run tests: Ensure all tests pass

### Step 3: Extract MultiItemProcessorService (Day 2)
1. Create `src/app/core/services/ai/multi-item-processor.service.ts`
2. Move sequential processing logic
3. Create `multi-item-processor.service.spec.ts` with existing tests
4. Update imports
5. Run tests: Ensure all tests pass

### Step 4: Extract DisambiguationFormatterService (Day 2)
1. Create `src/app/core/services/ai/disambiguation-formatter.service.ts`
2. Move UI formatting logic
3. Create `disambiguation-formatter.service.spec.ts` with existing tests
4. Update imports
5. Run tests: Ensure all tests pass

### Step 5: Refactor Core Service (Day 3)
1. Update `simplified-disambiguation.service.ts` to use extracted services
2. Add dependency injection in constructor
3. Update all method implementations to delegate to sub-services
4. Run full test suite: All 78 tests must pass
5. Verify coverage remains at 83.87%

### Step 6: Update Dependent Services (Day 3-4)
1. Update `ai.service.ts` imports
2. Update `voice-ai-assistant.component.ts` imports
3. Update any other services using disambiguation
4. Run integration tests
5. Verify no breaking changes

## ✅ Success Criteria

1. **Test Coverage:** Maintain 83.87% coverage (all 78 tests passing)
2. **File Sizes:** No file exceeds 400 lines
3. **Separation of Concerns:** Each service has single responsibility
4. **No Breaking Changes:** All dependent services work without modification
5. **Type Safety:** Full TypeScript type coverage
6. **Documentation:** JSDoc comments on all public methods

## 🧪 Testing Strategy

### Unit Tests
- Each extracted service has its own spec file
- Tests moved from original spec file to new spec files
- No new tests needed (preserve existing 78 tests)

### Integration Tests
- Test that `SimplifiedDisambiguationService` orchestrates correctly
- Test end-to-end flows: article matching → disambiguation → selection
- Test recipe processing with multiple items

### Regression Tests
- Run full test suite after each extraction
- Verify coverage doesn't drop
- Test in browser with real data

## 📦 File Structure After Split

```
src/app/core/services/ai/
├── simplified-disambiguation.service.ts (387 lines) ✨ Orchestrator
├── simplified-disambiguation.service.spec.ts (78 tests)
├── article-matcher.service.ts (250 lines) ✨ NEW
├── article-matcher.service.spec.ts (15 tests) ✨ NEW
├── list-selector.service.ts (150 lines) ✨ NEW
├── list-selector.service.spec.ts (5 tests) ✨ NEW
├── multi-item-processor.service.ts (300 lines) ✨ NEW
├── multi-item-processor.service.spec.ts (10 tests) ✨ NEW
├── disambiguation-formatter.service.ts (150 lines) ✨ NEW
└── disambiguation-formatter.service.spec.ts (8 tests) ✨ NEW
```

## 🚨 Common Pitfalls to Avoid

1. **Breaking Dependency Injection:** Ensure all services are properly provided
2. **Circular Dependencies:** Watch for services importing each other
3. **State Management:** Keep services stateless where possible
4. **Test Coverage Drop:** Monitor coverage after each extraction
5. **Type Safety:** Don't use `any` - maintain strict typing

## 📚 Reference Files

- **Current Implementation:** `/home/user/shoplisl/src/app/core/services/ai/simplified-disambiguation.service.ts`
- **Current Tests:** `/home/user/shoplisl/src/app/core/services/ai/simplified-disambiguation.service.spec.ts`
- **Refactoring Plan:** `/home/user/shoplisl/REFACTORING_PLAN.md`
- **Phase 1C Example:** `/home/user/shoplisl/src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.spec.ts`

## 🎓 Key Learnings from Phase 1

1. **Test First:** Having 83.87% coverage gives us confidence to refactor
2. **Direct Instantiation:** Use component/service constructors directly in tests (no TestBed)
3. **Mock Everything:** All dependencies should be mocked for unit tests
4. **Keep Tests Fast:** Avoid real timers where possible (use vi.useFakeTimers())
5. **Async/Await:** Prefer async/await over done() callbacks

## 📊 Estimated Time

- **Day 1:** Extract ArticleMatcherService + ListSelectorService
- **Day 2:** Extract MultiItemProcessorService + DisambiguationFormatterService
- **Day 3:** Refactor core service + update dependencies
- **Day 4:** Integration testing + documentation
- **Total:** 3-4 days

## 🚀 Getting Started

```bash
# Create new branch
git checkout -b claude/phase-2-split-disambiguation-service-[SESSION_ID]

# Run existing tests to establish baseline
npm test -- src/app/core/services/ai/simplified-disambiguation.service.spec.ts

# Start with Step 1: Extract ArticleMatcherService
```

## 📝 Commit Message Template

```
feat(phase-2): extract [ServiceName] from disambiguation service

- Created new [ServiceName] with [X] methods
- Moved [X] tests to new spec file
- Updated imports in SimplifiedDisambiguationService
- All 78 tests passing
- Coverage maintained at 83.87%

Part of Phase 2: Split Disambiguation Service
```

## ✨ Success Metrics

At the end of Phase 2, you should have:
- ✅ 5 focused services (each < 400 lines)
- ✅ 78 passing tests (coverage ≥ 83.87%)
- ✅ Clear separation of concerns
- ✅ No breaking changes in dependent services
- ✅ Updated REFACTORING_PLAN.md with Phase 2 completion

Ready to start? Let's split that service! 🎯
