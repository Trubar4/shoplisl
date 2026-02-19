# Refactoring Session: Article Deletion Bug Fixes

**Branch merged:** `claude/refactor-firebase-data-service-azODg`
**Date:** 2026-02-16 / 2026-02-19
**Status:** ✅ All fixes verified working by user

---

## What Was Fixed

### Bug: Ghost article count after deletion

After deleting an article from the article-details page, the list overview still
showed a non-zero count (e.g., "1/1" instead of "0/0"), and the deleted article's
ID + `itemState` remained in Firestore.

Three separate root-causes were identified and fixed on the first session, and a
fourth root-cause was found and fixed on the second session.

---

### Fix 1 — `noStatesAtAll` migration trigger on genuinely empty lists

**File:** `src/app/core/services/firebase-merge.service.ts`

When all articles were deleted, the merge logic incorrectly entered "migration
mode" (which unions local IDs back into the server state), because
`noStatesAtAll = true` AND `serverIds.length === 0` both triggered the flag.

```typescript
// Before (buggy): treated an empty list the same as a pre-migration document
const isMigrationState = noStatesAtAll || sharedIdsLackingStates.length > 0;

// After (fixed): only enter migration when server still has articles
const isMigrationState = (noStatesAtAll && serverIds.length > 0) || sharedIdsLackingStates.length > 0;
```

---

### Fix 2 — Deleted article ID resurrected by the Firestore listener

**File:** `src/app/core/services/articles-repository.service.ts`
**Method:** `removeArticleFromAllLists()`

**Sequence causing resurrection:**
1. `removeArticleFromAllLists()` writes cleaned list to Firestore ✅
2. The owned-list `onSnapshot` listener fires immediately
3. Listener's `mergeItemStates(localState, serverState)` unions them — local cache
   still contains the deleted article's `itemState`
4. `mergeArticleIds()` normal mode uses itemStates as source of truth → adds
   deleted ID back
5. `writeMergedStateToFirestore()` writes 2 articles back ❌

**Fix:** After each successful `updateListInFirebase()`, also update the in-memory
`listsSubject` via `updateLocalLists()`, so the listener sees clean local state:

```typescript
// After successful Firestore write:
const currentLists = this.firebaseData.getCurrentLists();
const cleanedLists = currentLists.map(l =>
  l.id === list.id
    ? { ...l, articleIds: newArticleIds, itemStates: newItemStates }
    : l
);
this.firebaseData.updateLocalLists(cleanedLists);
```

---

### Fix 3 — "Missing or insufficient permissions" when deleting article document

**File:** `firestore.rules`

**Root cause:** Articles created before Phase 8 have no `ownerId` field in
Firestore. The delete rule checked `resource.data.ownerId == request.auth.uid`,
which evaluates to `null == uid` → **denied**.

**Fix:** Use `.get()` with a safe default so legacy documents can still be deleted
by the path owner:

```
// Before:
allow delete: if isAuthenticated() &&
                userId == request.auth.uid &&
                resource.data.ownerId == request.auth.uid;

// After:
allow delete: if isAuthenticated() &&
                userId == request.auth.uid &&
                resource.data.get('ownerId', request.auth.uid) == request.auth.uid;
```

`resource.data.get('ownerId', request.auth.uid)` returns the stored `ownerId` for
modern documents, or defaults to `request.auth.uid` for legacy ones.  The path
constraint (`userId == request.auth.uid`) still prevents any cross-user deletion.

> **Deploy reminder:** Firestore rules must be deployed via
> `firebase deploy --only firestore:rules`

---

### Fix 4 — Deleted article reappears in article overview after navigation

**File:** `src/app/core/services/firebase-data.service.ts`
**Method:** `updateLocalArticles()`

**Sequence causing resurrection:**
1. `deleteArticleAndCleanupLists()` calls `updateLocalArticles(filteredArticles)`
   → `articlesSubject` is updated correctly ✅
2. User navigates back to the list
3. `setupLazyListenerForList()` fires → list listener calls `mergeArticles()`
4. `mergeArticles()` = `[...ownedArticles, ...sharedArticles]`
   — `ownedArticles` was **stale** (still contained the deleted article)
5. Deleted article **restored** in `articlesSubject` → reappears in article overview ❌

**Root cause:** `updateLocalArticles()` updated `articlesSubject` directly but did
NOT update the `ownedArticles` / `sharedArticles` backing arrays.  When
`mergeArticles()` ran next (triggered by any list listener), it re-merged from the
stale backing arrays, overwriting the correct `articlesSubject` state.

**Fix:**

```typescript
// Before (buggy): only articlesSubject was kept in sync
updateLocalArticles(articles: Article[]): void {
  this.articlesSubject.next(articles);
  this.cacheService.cacheArticles(articles);
}

// After (fixed): backing arrays are pruned before updating articlesSubject
updateLocalArticles(articles: Article[]): void {
  const articleSet = new Set(articles.map(a => a.id));
  this.ownedArticles  = this.ownedArticles.filter(a => articleSet.has(a.id));
  this.sharedArticles = this.sharedArticles.filter(a => articleSet.has(a.id));
  this.articlesSubject.next(articles);
  this.cacheService.cacheArticles(articles);
}
```

---

## Debug Logging Added

`firebase-crud.service.ts` — `deleteArticleInFirebase`:
```
🗑️ deleteArticleInFirebase: DELETE users-v2/{uid}/articles/{id}
✅ deleteArticleInFirebase: success for {id}
```

`articles-repository.service.ts` — `removeArticleFromAllLists`:
```
🧹 Local list state updated for "{name}" — listener will see clean state (no resurrection)
```

---

## Tests Added

### `firebase-data-merge.spec.ts` — describe block (session 1)
Uses the **real** `FirebaseMergeService` (not inline copies) to document and
guard against the resurrection mechanism:
- Documents union behaviour of `mergeItemStates` (intentional for offline, source
  of resurrection when local is stale)
- Verifies `noStatesAtAll` edge cases (empty list vs. pre-migration document)
- Verifies clean merge path after the fix

### `articles-repository.service.spec.ts` — describe block (session 1)
Tests that `updateLocalLists` is called with a cleaned list immediately after
`updateListInFirebase` succeeds, preventing resurrection.

### `articles-crud.e2e.spec.ts` — new tests (session 1)
- Permission denial for cross-user article delete
- Clean list state after article removal
- Empty list state after last article deleted

### `firebase-data-merge.spec.ts` — describe block (session 2)
Documents and verifies Fix 4 (`ownedArticles` pruning):
- `[BUG DOCUMENTED]` — proves the article reappears without the fix when
  `mergeArticles()` runs after `updateLocalArticles()`
- `[FIX VERIFIED]` — proves the article stays gone with the fix
- `[FIX VERIFIED]` — surviving articles all preserved after `mergeArticles()`
- `[FIX VERIFIED]` — shared articles are also correctly pruned

---

## Commits

### Session 1 (2026-02-16)

| SHA | Message |
|-----|---------|
| `bb14ed7` | fix: prevent deleted article IDs from being resurrected in Firestore |
| `ac1cb73` | fix: update local list state after article cleanup to prevent resurrection |
| `085c883` | debug: add log lines for article deletion path and local state update |
| `d21f504` | fix: allow deletion of pre-Phase-8 articles that lack ownerId field |

### Session 2 (2026-02-19)

| SHA | Message |
|-----|---------|
| `9bde73e` | fix: sync ownedArticles/sharedArticles when updateLocalArticles is called |
