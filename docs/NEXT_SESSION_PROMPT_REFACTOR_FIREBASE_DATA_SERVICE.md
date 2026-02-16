# Next Session Prompt: Continue Refactoring FirebaseDataService

**Copy and paste this prompt to start the next Claude Code session**

---

## Session Prompt

```
Continue refactoring FirebaseDataService — break up the 1,842-line monolith.

## CONTEXT

### What has been done (all merged to main)

Refactoring of `firebase-data.service.ts` is underway. Several sub-services have
already been extracted:

| Service | Lines | Responsibility |
|---------|-------|----------------|
| `firebase-crud.service.ts` | 287 | Firestore CRUD primitives (create/read/update/delete) |
| `firebase-merge.service.ts` | 352 | Pure merge logic (mergeArticleIds, mergeItemStates) |
| `firebase-transaction.service.ts` | 223 | Firestore transactions (updateListItemWithTransaction, updateItemStatesWithTransaction) |
| `firebase-write.service.ts` | 61 | writeMergedStateToFirestore |
| `firebase-article-loader.service.ts` | 545 | Article batch loading (getAllArticlesFromFirebase, getArticlesForUser, loadAllOwnedArticles) |

`firebase-data.service.ts` itself is still **1,842 lines** — the real-time listener
infrastructure has not yet been extracted.

### Recent bug fixes (also merged to main)

Three bugs in the article-deletion flow were fixed on the last branch:
1. `noStatesAtAll` triggered migration mode on genuinely empty lists → fixed in
   `firebase-merge.service.ts`
2. Deleted article IDs were resurrected by the listener firing on stale local state
   → fixed in `articles-repository.service.ts` (`removeArticleFromAllLists`)
3. Pre-Phase-8 articles (no `ownerId` field) could not be deleted due to a strict
   Firestore rule → fixed in `firestore.rules` using `.get()` with a safe default

See `docs/REFACTOR_SESSION_BUG_FIXES_SUMMARY.md` for full details.

### Key architectural rule

`firebase-data.service.ts` acts as the **facade** — all other services call it, not
each other.  New sub-services are injected into `FirebaseDataService`, which
delegates to them and exposes the result.

---

## GOAL FOR THIS SESSION

Extract the real-time listener infrastructure from `firebase-data.service.ts` into
one or more focused services, reducing the facade to a thin coordinator.

### Suggested extraction targets (assess and adjust as needed)

1. **`FirebaseListenerService`** (~500–700 lines from the facade)
   Owns all `onSnapshot` listeners: `setupRealtimeListeners`,
   `setupSingleOwnedListListener`, `setupSingleSharedListListener`,
   `setupOwnedListRealtimeListeners`, `setupSharedListRealtimeListeners`,
   `setupLazyListenerForList`, `setupActiveListListener`,
   `cleanupOwnedListListeners`, `cleanupSharedListListeners`,
   `cleanupLazyListeners`, `cleanupListeners`.

2. **`FirebaseDataLoaderService`** (~200 lines)
   First-load data fetching: `loadFreshData`, `loadCachedData`,
   `loadDataEmergency`, `refreshData`, `ensureOwnedArticlesFromCache`.

3. **`FirebaseListMergeCoordinatorService`** (or fold into existing merge service)
   The `mergeLists` / `executeMergeLists` / `mergeArticles` debounce+write
   pipeline (currently ~60 lines, but tightly coupled to listener state).

### Constraints
- Keep `firebase-data.service.ts` as the public API — no changes to any caller.
- All `BehaviorSubject`s (`articlesSubject`, `listsSubject`, etc.) must remain in
  the facade or be passed in — sub-services must NOT own the canonical state.
- The `updateLocalLists` / `updateLocalArticles` pattern (synchronous local-state
  update after Firestore write, used to prevent resurrection) must be preserved.
- Run `npm run test` and `npm run test:firestore` after extraction; maintain or
  improve the 126-pass baseline.

---

## IMPORTANT NOTES

### Test baseline
- Unit: 758 pass / 171 fail (the 171 failures are all pre-existing — context-
  management service, integration specs marked as FAIL intentionally, e2e files
  that need the emulator).
- E2E (with emulator): 126 pass / 10 known failures (admin 3-segment path tests).
- Run `npm run test:firestore` — it starts the emulator automatically.

### Firestore rules deployment
Any change to `firestore.rules` must also be deployed:
  firebase deploy --only firestore:rules

### Debug log channels
- `this.logger.info('data', ...)` — always visible
- `this.logger.debug('data', ...)` — may be filtered; use `info` for diagnostics

### Injection context warning
`onSnapshot` calls outside Angular injection context generate a console warning
but do not block functionality.  This is a known and accepted trade-off.
```
