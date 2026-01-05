# Real-Time Sync - Code Refactoring Plan (Phase 3)

**Date:** January 5, 2026
**Branch:** TBD (will be created after Phase 2 completion)
**Status:** 📋 PLANNING
**Related:** REALTIME_SYNC_HANDOFF.md, REALTIME_SYNC_FIX_SUMMARY.md

---

## Executive Summary

Phase 1 successfully fixed all real-time synchronization issues through incremental patches. While functional, the fixes introduced technical debt and code duplication. Phase 3 will refactor this code to improve maintainability, reduce duplication, and establish patterns for future development.

**Prerequisites:**
- ✅ Phase 1: All real-time sync fixes deployed to production
- 🔄 Phase 2a: Integration tests (in progress)
- 🔄 Phase 2b: Unit tests for Phase 1 code (planned)

**Why Refactor?**
- Phase 2 tests provide safety net for refactoring
- Current code has duplication between online/offline paths
- Temp ID logic scattered across multiple files
- Change detection workarounds need consolidation
- Future features will benefit from cleaner architecture

---

## Code Smells Identified

### 1. Optimistic Update Duplication
**Location:** `lists-repository.service.ts:167-172`, `articles-repository.service.ts:101-104`

**Current State:**
```typescript
// In updateList() - ONLINE mode
const currentLists = this.firebaseData.getCurrentLists();
const updatedLists = currentLists.map(list =>
  list.id === id ? { ...list, ...updates, updatedAt: new Date() } : list
);
this.firebaseData.updateLocalLists(updatedLists);

// In createArticle() - OFFLINE mode
const current = this.firebaseData.getCurrentArticles();
current.push(article);
this.firebaseData.updateOwnedArticles(current);
```

**Problem:**
- Same pattern repeated in multiple places
- Subtle differences between online/offline implementations
- No shared abstraction for optimistic updates
- Easy to miss one path when making changes

**Impact:**
- High maintenance burden
- Risk of inconsistency between online/offline behavior
- Difficult to test comprehensively

---

### 2. Temp ID Logic Scattered
**Location:** `articles-repository.service.ts:109-141`, `lists-repository.service.ts:146-158`

**Current State:**
```typescript
// Temp ID generation (in createArticle)
const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Temp ID replacement (after sync)
currentArticles[index] = { ...currentArticles[index], id: realId };

// List articleIds update
if (list.articleIds.includes(tempId)) {
  list.articleIds[list.articleIds.indexOf(tempId)] = realId;
}

// itemStates key replacement
if (list.itemStates[tempId]) {
  list.itemStates[realId] = {
    ...list.itemStates[tempId],
    articleId: realId
  };
  delete list.itemStates[tempId];
}
```

**Problem:**
- Temp ID logic in 3 different places (generation, article replacement, list updates)
- No single source of truth for temp ID format
- Manual coordination required across services
- Risk of missing a replacement point

**Impact:**
- Hard to maintain and test
- Easy to introduce bugs when adding new temp ID references
- No clear ownership of temp ID lifecycle

---

### 3. Change Detection Workarounds
**Location:** `list-detail.ts:990-997`, `list-detail.ts:946-950`

**Current State:**
```typescript
// In multiple places
this.cdr.markForCheck();
setTimeout(() => this.cdr.detectChanges(), 0);
setTimeout(() => this.cdr.detectChanges(), 50);
setTimeout(() => this.cdr.detectChanges(), 100);
```

**Problem:**
- Multiple `setTimeout` calls with magic numbers (0, 50, 100ms)
- Duplicated across component methods
- No explanation for why multiple timings needed
- OnPush strategy fighting against async updates

**Impact:**
- Unclear why this is necessary
- Performance impact of redundant change detection
- Maintenance burden when adding new async operations
- May hide underlying architectural issues

---

### 4. Queued Operations Capture Stale Data
**Location:** `lists-repository.service.ts:146-158`

**Current State (BEFORE FIX):**
```typescript
// ❌ WRONG: Captured updateData in closure
const updateData = { articleIds, itemStates };
this.offlineSync.queueOperation(async () => {
  await this.firebaseData.updateListInFirebase(id, updateData); // Stale data!
});
```

**Current State (AFTER FIX):**
```typescript
// ✅ FIXED: Read current state when executing
this.offlineSync.queueOperation(async () => {
  const currentLists = this.firebaseData.getCurrentLists();
  const currentList = currentLists.find(l => l.id === id);
  if (currentList) {
    const syncData = {
      articleIds: currentList.articleIds,  // Fresh data!
      itemStates: currentList.itemStates,
      updatedAt: Timestamp.now()
    };
    await this.firebaseData.updateListInFirebase(id, syncData);
  }
});
```

**Problem:**
- Pattern exists elsewhere but may not be consistently applied
- No abstraction to enforce "read current state" pattern
- Easy to make the same mistake again
- No type-level protection

**Impact:**
- Potential for data loss or inconsistency
- Hard to review code for this pattern
- Risk of regression

---

### 5. Type Safety Gaps
**Location:** Various service files

**Current State:**
```typescript
// Generic update types
updateList(id: string, updates: Partial<ShoppingList>): Promise<void>

// No distinction between online/offline modes
// No type safety for temp IDs vs real IDs
```

**Problem:**
- No TypeScript discrimination between online/offline operations
- Temp IDs are just strings (same type as real IDs)
- No compile-time guarantees about operation safety

**Impact:**
- Runtime errors instead of compile-time errors
- Harder to reason about code correctness
- IDE can't help prevent mistakes

---

### 6. Debug Logging Inconsistency
**Location:** All modified service files

**Current State:**
```typescript
console.log('📱 DATA: ✅ Article created:', article);
console.log('📱 DATA: ➕ Optimistically added article');
console.log('💾 Cached', lists.length, 'lists');
```

**Problem:**
- Mix of emojis and text
- No log levels (info, debug, warn, error)
- No way to disable verbose logs in production
- Inconsistent format across files

**Impact:**
- Noisy console in production
- Hard to filter relevant logs
- Performance impact of excessive logging

---

## Refactoring Opportunities

### Opportunity 1: Unified Optimistic Update Pattern

**Goal:** Create single, well-tested abstraction for optimistic updates

**Before (Duplicated):**
```typescript
// lists-repository.service.ts
const currentLists = this.firebaseData.getCurrentLists();
const updatedLists = currentLists.map(list =>
  list.id === id ? { ...list, ...updates, updatedAt: new Date() } : list
);
this.firebaseData.updateLocalLists(updatedLists);

// articles-repository.service.ts
const current = this.firebaseData.getCurrentArticles();
current.push(article);
this.firebaseData.updateOwnedArticles(current);
```

**After (Unified):**
```typescript
// New: optimistic-updates.service.ts
export class OptimisticUpdatesService {
  updateEntity<T extends { id: string }>(
    entityType: 'lists' | 'articles',
    id: string,
    updates: Partial<T>
  ): void {
    const current = this.getCurrent(entityType);
    const updated = current.map(entity =>
      entity.id === id
        ? { ...entity, ...updates, updatedAt: new Date() }
        : entity
    );
    this.updateLocal(entityType, updated);
  }

  addEntity<T>(
    entityType: 'lists' | 'articles',
    entity: T
  ): void {
    const current = this.getCurrent(entityType);
    current.push(entity);
    this.updateLocal(entityType, current);
  }
}

// Usage
this.optimisticUpdates.updateEntity('lists', id, updates);
this.optimisticUpdates.addEntity('articles', article);
```

**Benefits:**
- ✅ Single source of truth for optimistic update logic
- ✅ Consistent behavior across online/offline modes
- ✅ Easy to test in isolation
- ✅ Reduces code duplication by ~40 lines
- ✅ Clear API for future developers

**Testing Strategy:**
- Unit tests for `OptimisticUpdatesService`
- Integration tests verify behavior matches current implementation
- No manual testing needed (covered by Phase 2 tests)

---

### Opportunity 2: Temp ID Lifecycle Manager

**Goal:** Centralize all temp ID operations in single service

**Before (Scattered):**
```typescript
// Generation in articles-repository
const tempId = `temp_${Date.now()}_${Math.random()...}`;

// Replacement in multiple places
currentArticles[index] = { ...currentArticles[index], id: realId };
if (list.articleIds.includes(tempId)) {
  list.articleIds[list.articleIds.indexOf(tempId)] = realId;
}
if (list.itemStates[tempId]) {
  list.itemStates[realId] = { ...list.itemStates[tempId], articleId: realId };
  delete list.itemStates[tempId];
}
```

**After (Centralized):**
```typescript
// New: temp-id-manager.service.ts
export class TempIdManager {
  private tempIdMap = new Map<TempId, RealId>();

  generate(): TempId {
    const id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return id as TempId; // Branded type
  }

  isTempId(id: string): id is TempId {
    return id.startsWith('temp_');
  }

  registerMapping(tempId: TempId, realId: RealId): void {
    this.tempIdMap.set(tempId, realId);
  }

  replaceInArticles(articles: Article[]): Article[] {
    return articles.map(article => {
      if (this.isTempId(article.id)) {
        const realId = this.tempIdMap.get(article.id as TempId);
        return realId ? { ...article, id: realId } : article;
      }
      return article;
    });
  }

  replaceInList(list: ShoppingList): ShoppingList {
    const articleIds = list.articleIds.map(id =>
      this.isTempId(id) ? (this.tempIdMap.get(id as TempId) || id) : id
    );

    const itemStates = Object.entries(list.itemStates).reduce((acc, [key, value]) => {
      const newKey = this.isTempId(key) ? (this.tempIdMap.get(key as TempId) || key) : key;
      acc[newKey] = { ...value, articleId: newKey };
      return acc;
    }, {} as Record<string, ItemState>);

    return { ...list, articleIds, itemStates };
  }
}

// Types (branded types for safety)
type TempId = string & { __brand: 'TempId' };
type RealId = string & { __brand: 'RealId' };
```

**Benefits:**
- ✅ Single source of truth for temp ID logic
- ✅ Type safety: can't confuse temp IDs with real IDs
- ✅ Centralized mapping for debugging
- ✅ Easy to add new temp ID use cases
- ✅ Clear lifecycle management

**Testing Strategy:**
- Unit tests for all replacement scenarios
- Integration tests verify offline → online sync
- Phase 2 tests ensure no regression

---

### Opportunity 3: Change Detection Helper Service

**Goal:** Encapsulate OnPush change detection strategy

**Before (Duplicated):**
```typescript
// In list-detail.ts and other components
this.cdr.markForCheck();
setTimeout(() => this.cdr.detectChanges(), 0);
setTimeout(() => this.cdr.detectChanges(), 50);
setTimeout(() => this.cdr.detectChanges(), 100);
```

**After (Centralized):**
```typescript
// New: change-detection.service.ts
export class ChangeDetectionService {
  /**
   * Trigger change detection with multiple timings to handle async edge cases.
   *
   * Why multiple timings?
   * - 0ms: Immediate check for sync operations
   * - 50ms: Angular zone stabilization
   * - 100ms: Firestore listener updates
   */
  triggerForAsync(cdr: ChangeDetectorRef): void {
    cdr.markForCheck();

    const timings = [0, 50, 100];
    timings.forEach(ms => {
      setTimeout(() => cdr.detectChanges(), ms);
    });
  }

  /**
   * Trigger change detection once for sync operations
   */
  trigger(cdr: ChangeDetectorRef): void {
    cdr.markForCheck();
    cdr.detectChanges();
  }
}

// Usage in components
constructor(
  private cdr: ChangeDetectorRef,
  private changeDetection: ChangeDetectionService
) {}

// Instead of manual triggers:
this.changeDetection.triggerForAsync(this.cdr);
```

**Benefits:**
- ✅ Documented explanation for multiple timings
- ✅ Consistent behavior across components
- ✅ Easy to optimize later (e.g., reduce timings if not needed)
- ✅ Single place to add logging/debugging

**Testing Strategy:**
- Mock tests to verify timings
- Integration tests ensure UI updates correctly
- Phase 2 tests catch any regressions

---

### Opportunity 4: Queued Operation Helper

**Goal:** Enforce "read current state" pattern for queued operations

**Before (Error-prone):**
```typescript
// Easy to capture stale data
const updateData = { ... }; // ❌ Captured in closure!
this.offlineSync.queueOperation(async () => {
  await this.firebaseData.updateListInFirebase(id, updateData);
});
```

**After (Safe):**
```typescript
// New: queued-operation.helper.ts
export class QueuedOperationHelper {
  /**
   * Queue an operation that reads current state when executing.
   * Prevents stale data issues from closure capture.
   */
  queueWithFreshState<T>(
    offlineSync: OfflineSyncService,
    description: string,
    getCurrentState: () => T | undefined,
    operation: (state: T) => Promise<void>
  ): void {
    offlineSync.queueOperation(async () => {
      const currentState = getCurrentState();
      if (currentState) {
        await operation(currentState);
      } else {
        console.warn(`[QueuedOp] ${description}: State not found, skipping`);
      }
    }, description);
  }
}

// Usage
this.queuedOp.queueWithFreshState(
  this.offlineSync,
  `Update list: ${id}`,
  () => {
    const lists = this.firebaseData.getCurrentLists();
    return lists.find(l => l.id === id);
  },
  async (list) => {
    const syncData = {
      articleIds: list.articleIds,
      itemStates: list.itemStates,
      updatedAt: Timestamp.now()
    };
    await this.firebaseData.updateListInFirebase(id, syncData);
  }
);
```

**Benefits:**
- ✅ Impossible to capture stale data (enforced by API)
- ✅ Clear separation: what to read vs what to do
- ✅ Type-safe state access
- ✅ Consistent error handling

**Testing Strategy:**
- Unit tests for helper
- Integration tests for offline sync scenarios
- Phase 2 tests ensure offline → online works

---

### Opportunity 5: Improved Type Safety

**Goal:** Use TypeScript discriminated unions for online/offline modes

**Before (Weak Types):**
```typescript
updateList(id: string, updates: Partial<ShoppingList>): Promise<void> {
  if (this.connectionService.isOnline()) {
    // Online path
  } else {
    // Offline path
  }
}
```

**After (Strong Types):**
```typescript
// New types
type OnlineOperation<T> = {
  mode: 'online';
  data: T;
  optimistic: boolean;
};

type OfflineOperation<T> = {
  mode: 'offline';
  data: T;
  willQueue: true;
};

type RepositoryOperation<T> = OnlineOperation<T> | OfflineOperation<T>;

// Usage
async updateList(
  id: string,
  updates: Partial<ShoppingList>
): Promise<RepositoryOperation<ShoppingList>> {
  const isOnline = this.connectionService.isOnline();

  if (isOnline) {
    // TypeScript knows this is OnlineOperation
    return {
      mode: 'online',
      data: updates,
      optimistic: true
    };
  } else {
    // TypeScript knows this is OfflineOperation
    return {
      mode: 'offline',
      data: updates,
      willQueue: true
    };
  }
}

// Caller can discriminate
const result = await updateList(id, updates);
if (result.mode === 'online') {
  // TypeScript knows result.optimistic exists
  console.log('Optimistic update:', result.optimistic);
} else {
  // TypeScript knows result.willQueue exists
  console.log('Queued for sync:', result.willQueue);
}
```

**Benefits:**
- ✅ Compile-time guarantees about operation modes
- ✅ IDE autocomplete for mode-specific properties
- ✅ Impossible to mix up online/offline logic
- ✅ Self-documenting code

**Testing Strategy:**
- Type-level tests (tsd library)
- Unit tests for both modes
- Integration tests verify runtime behavior

---

### Opportunity 6: Structured Logging

**Goal:** Replace console.log with proper logging service

**Before (Inconsistent):**
```typescript
console.log('📱 DATA: ✅ Article created:', article);
console.log('💾 Cached', lists.length, 'lists');
```

**After (Structured):**
```typescript
// Already exists: logger.service.ts (just needs consistent usage)
this.logger.info('Article created', { articleId: article.id, mode: 'online' });
this.logger.debug('Cached lists', { count: lists.length });

// Configure log levels per environment
// Production: info, warn, error only
// Development: all levels including debug
```

**Benefits:**
- ✅ Filterable by log level
- ✅ Structured data for debugging
- ✅ Can disable verbose logs in production
- ✅ Easier to search logs

**Testing Strategy:**
- Unit tests verify logger called correctly
- Manual verification in dev/prod environments

---

## Implementation Plan

### Phase 3a: Infrastructure Refactoring (Week 1)

**Goals:** Create new services and helpers

**Tasks:**
1. Create `OptimisticUpdatesService`
   - Write unit tests first (TDD)
   - Implement service
   - Verify tests pass

2. Create `TempIdManager`
   - Write unit tests for all scenarios
   - Implement branded types
   - Verify tests pass

3. Create `ChangeDetectionService`
   - Write tests
   - Document timing rationale
   - Verify tests pass

4. Create `QueuedOperationHelper`
   - Write tests
   - Implement type-safe API
   - Verify tests pass

**Success Criteria:**
- All new services have >90% test coverage
- All unit tests pass
- Integration tests from Phase 2 still pass (no changes to existing code yet)

---

### Phase 3b: Migration to New Services (Week 2)

**Goals:** Replace old code with new services

**Tasks:**
1. Migrate `lists-repository.service.ts` to use:
   - `OptimisticUpdatesService`
   - `TempIdManager`
   - `QueuedOperationHelper`

2. Migrate `articles-repository.service.ts` to use:
   - `OptimisticUpdatesService`
   - `TempIdManager`

3. Migrate `list-detail.ts` to use:
   - `ChangeDetectionService`

4. Update all services to use:
   - `LoggerService` consistently

**Process for Each Migration:**
1. Make changes in small commits
2. Run unit tests after each commit
3. Run integration tests after each commit
4. If tests fail, rollback and adjust
5. No commit without passing tests

**Success Criteria:**
- All Phase 2 integration tests still pass
- All unit tests still pass
- Code coverage maintained or improved
- No duplicate code remains

---

### Phase 3c: Type Safety Improvements (Week 3)

**Goals:** Add TypeScript discriminated unions

**Tasks:**
1. Define operation types (`OnlineOperation`, `OfflineOperation`)
2. Update repository methods to return typed results
3. Update callers to handle discriminated unions
4. Add type-level tests

**Success Criteria:**
- TypeScript compilation succeeds
- No `any` types in refactored code
- IDE autocomplete works for all operation modes
- All tests still pass

---

### Phase 3d: Documentation and Cleanup (Week 3)

**Goals:** Document new patterns and remove old code

**Tasks:**
1. Add JSDoc comments to all new services
2. Create architecture decision record (ADR) for:
   - Optimistic update pattern
   - Temp ID management
   - Queued operation pattern
3. Remove debug console.log statements
4. Update REALTIME_SYNC_FIX_SUMMARY.md with refactoring notes

**Success Criteria:**
- All public methods have JSDoc
- ADR documents explain "why" not just "what"
- No console.log in production code (only via LoggerService)
- Documentation reviewed by team

---

## Testing Strategy

### Protection During Refactoring

**Phase 2 Integration Tests as Safety Net:**
- Run integration tests after EVERY commit
- If any test fails, rollback immediately
- No merge without all tests passing

**Unit Test Requirements:**
- Every new service must have >90% coverage
- Test both success and error paths
- Test online and offline modes
- Test edge cases (empty arrays, missing data, etc.)

**Manual Testing:**
- Run manual test suite from Phase 1 after major migrations
- Test on both online and offline modes
- Test rapid operations (stress test)

### Regression Prevention

**Before Refactoring:**
- Baseline: All Phase 2 tests passing
- Document current test coverage percentage
- Tag commit: `refactoring-baseline`

**During Refactoring:**
- Run tests after every migration
- Track test coverage (should not decrease)
- If coverage drops, add tests before continuing

**After Refactoring:**
- All tests must still pass
- Coverage should increase (due to new unit tests)
- Create tag: `refactoring-complete`

---

## Before/After Comparison

### Code Metrics

**Before Refactoring (Phase 1):**
- Total lines in modified files: ~450
- Duplicate code blocks: ~6
- Services with optimistic updates: 2
- Change detection triggers: 8+ scattered calls
- Type safety: Partial<T> only
- Test coverage: ~60% (estimated)

**After Refactoring (Phase 3):**
- Total lines in modified files: ~350 (-22%)
- Duplicate code blocks: 0 (-100%)
- Services with optimistic updates: 1 centralized
- Change detection triggers: 2-3 via service
- Type safety: Discriminated unions + branded types
- Test coverage: >80% (target)

### Maintainability Metrics

**Before:**
- Time to add new optimistic update: ~30 min (find pattern, copy, paste, adjust)
- Risk of temp ID bug: High (manual coordination)
- Onboarding time for new developer: ~2 hours (understand scattered patterns)

**After:**
- Time to add new optimistic update: ~5 min (call service method)
- Risk of temp ID bug: Low (centralized, type-safe)
- Onboarding time for new developer: ~30 min (read service docs)

---

## Success Metrics

### Code Quality
- [ ] Zero duplicate code for optimistic updates
- [ ] All temp ID logic in single service
- [ ] Change detection triggers in single service
- [ ] All queued operations use helper
- [ ] TypeScript strict mode enabled
- [ ] No `any` types in refactored code

### Testing
- [ ] All Phase 2 integration tests still pass
- [ ] New unit tests for all new services
- [ ] Test coverage >80%
- [ ] No manual test regressions

### Performance
- [ ] No increase in operation latency
- [ ] Reduced change detection triggers (measured)
- [ ] No increase in bundle size

### Documentation
- [ ] All services have JSDoc
- [ ] ADR documents created
- [ ] REALTIME_SYNC_FIX_SUMMARY.md updated
- [ ] Team review completed

---

## Risk Assessment

### Low Risk
- Creating new services (doesn't affect existing code)
- Adding type definitions (compile-time only)
- Adding JSDoc comments

### Medium Risk
- Migrating to `OptimisticUpdatesService` (widely used)
- Migrating to `TempIdManager` (critical for offline sync)

**Mitigation:**
- Phase 2 integration tests catch regressions
- Small commits with test validation
- Can rollback any single commit

### High Risk
- Changing type signatures (affects many callers)
- Modifying change detection logic (hard to test)

**Mitigation:**
- Do these last (after other migrations stable)
- Extra manual testing for UI updates
- Beta testing with real users
- Gradual rollout (feature flag if needed)

---

## Rollback Plan

### If Integration Tests Fail

**Step 1: Identify the breaking commit**
```bash
git log --oneline -10  # Find recent commits
```

**Step 2: Rollback to last known good state**
```bash
git revert <commit-hash>  # Revert specific commit
# OR
git reset --hard refactoring-baseline  # Nuclear option
```

**Step 3: Analyze and fix**
- Review what changed
- Add specific test for the failure
- Fix the issue
- Re-run tests before committing

### If Production Issues After Deployment

**Step 1: Immediate rollback**
```bash
# Deploy previous version
git checkout <previous-release-tag>
# Trigger deployment
```

**Step 2: Investigation**
- Check logs for errors
- Run manual tests
- Identify missing test coverage

**Step 3: Fix and redeploy**
- Add integration test for the issue
- Fix the code
- Verify all tests pass
- Re-deploy with extra monitoring

---

## Questions for Team Review

Before starting Phase 3, discuss:

1. **Timeline:** Is 3 weeks acceptable? Or should we split into smaller phases?

2. **Risk Tolerance:** Comfortable with medium-risk migrations? Or prefer more conservative approach?

3. **Type Safety:** Willing to use branded types (TempId, RealId)? Or prefer simpler approach?

4. **Change Detection:** Should we investigate root cause (why OnPush needs multiple triggers)? Or accept current workaround?

5. **Breaking Changes:** Okay with changing some service APIs? Or must maintain backward compatibility?

6. **Code Review:** Who will review architecture changes? Need approval before implementation?

---

## Appendix: Architecture Decision Records (Preview)

### ADR 001: Optimistic Update Pattern

**Context:** Need consistent optimistic updates across online/offline modes

**Decision:** Create centralized `OptimisticUpdatesService`

**Consequences:**
- ✅ Single source of truth
- ✅ Easier to test
- ❌ One more dependency to inject
- ❌ Slightly more verbose call sites

**Alternatives Considered:**
- Keep duplicated code (rejected: maintenance burden)
- Use RxJS operators (rejected: too complex for this use case)
- Shared utility functions (rejected: services better for DI and testability)

---

### ADR 002: Temp ID Management

**Context:** Temp IDs scattered across multiple services, easy to miss replacement points

**Decision:** Create `TempIdManager` service with branded types

**Consequences:**
- ✅ Type safety prevents mixing temp/real IDs
- ✅ Centralized mapping for debugging
- ❌ Requires TypeScript 4.5+ for branded types
- ❌ Learning curve for branded types pattern

**Alternatives Considered:**
- Keep current approach (rejected: too error-prone)
- Use classes instead of branded types (rejected: runtime overhead)
- String prefixes only (rejected: no type safety)

---

### ADR 003: Queued Operation Pattern

**Context:** Easy to capture stale data in closures for offline operations

**Decision:** Create helper that enforces "read current state" pattern

**Consequences:**
- ✅ Impossible to capture stale data
- ✅ Clear separation of concerns
- ❌ More boilerplate at call sites
- ❌ Requires understanding of closure scope

**Alternatives Considered:**
- Documentation only (rejected: easy to forget)
- Linter rule (rejected: hard to enforce)
- Immutable data structures (rejected: too large a change)

---

**Last Updated:** January 5, 2026
**Status:** 📋 DRAFT - Ready for team review
**Next Steps:** Review with team, get approval, start Phase 3a after Phase 2 completes
