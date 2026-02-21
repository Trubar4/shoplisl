# Next Session Prompt: Continue on Firebase Refactor Branch

**Copy and paste the session prompt below to start the next Claude Code session.**

---

## Session Prompt

```
Continue work on branch `claude/refactor-firebase-service-K8o5z`.
DO NOT merge to main — all work stays on this branch.

## CONTEXT

### Branch state

Branch `claude/refactor-firebase-service-K8o5z` contains all changes from the
main refactor PLUS several critical bug fixes and feature additions. The branch
diverges from main at the extraction commit and includes these commits (newest
first):

| Commit | Description |
|--------|-------------|
| (pending) | fix: edit mode 'fehlend' filter + analytics for article add/remove/copy |
| 7ce4173 | fix: trigger mergeArticles on list changes + fix restore --execute flag |
| 5dbd963 | fix: remove dangerous quickCleanupOrphanedReferences + prune stale shared articles |
| bfcabc6 | feat(analytics): track ARTICLE_CREATED, ARTICLE_UPDATED, ARTICLE_DELETED |
| 3c37429 | fix(listener): keep shared-list listeners alive when participant navigates away |
| 35131f5 | fix: prune sharedArticles when owner deletes article from shared list |
| 09bd237 | refactor: extract FirebaseListenerService and FirebaseDataLoaderService |

### Architecture overview

`firebase-data.service.ts` is the **facade** — all BehaviorSubjects
(`articlesSubject`, `listsSubject`) and backing arrays (`ownedArticles`,
`sharedArticles`, `ownedLists`, `sharedLists`) live here. Sub-services are
injected into the facade and called via delegation.

Extracted sub-services:
- `firebase-crud.service.ts` — Firestore CRUD primitives
- `firebase-merge.service.ts` — Pure merge logic
- `firebase-transaction.service.ts` — Firestore transactions
- `firebase-write.service.ts` — writeMergedStateToFirestore
- `firebase-article-loader.service.ts` — Article batch loading
- `firebase-listener.service.ts` — Real-time onSnapshot listeners (NEW)
- `firebase-data-loader.service.ts` — First-load data fetching (NEW)

Key architectural rules:
- Facade is the public API — no caller changes when extracting
- BehaviorSubjects stay in the facade
- Sub-services use a Context interface to access facade state
- `updateLocalLists()` / `updateLocalArticles()` prune backing arrays to
  prevent resurrection of deleted items

### Lazy loading architecture

Articles are loaded **lazily** — only articles referenced by the currently
viewed list are fetched from Firestore. `loadAllOwnedArticles()` loads ALL
articles from owned lists but is only called explicitly (article overview,
edit mode).

This means:
- `selectAllArticles` from NgRx store only has lazily-loaded articles
- The edit mode 'fehlend' filter requires `loadAllOwnedArticles()` to show
  articles not yet on the current list (FIXED in this branch)

### Shared list listeners

When a participant navigates away from a shared list, only owned-list listeners
are cleaned up. Shared-list listeners stay alive so that deleted articles
are pruned via `mergeArticles()` when list data changes.

`setupSingleSharedListListener()` has a duplicate guard to prevent stacking
listeners when revisiting a shared list.

---

## WHAT WAS DONE IN LAST SESSION

### Bug fixes applied

1. **Shared list listener destroyed on navigation** (commit 3c37429)
   - `cleanupLazyListeners()` was killing shared list listeners
   - Fix: only clean up owned list listeners
   - Also added duplicate-listener guard in `setupSingleSharedListListener()`

2. **Mass article deletion by quickCleanupOrphanedReferences** (commit 5dbd963)
   - `quickCleanupOrphanedReferences()` used `getCurrentArticles()` which only
     returns lazily-loaded articles — everything not in memory was treated as
     orphaned and stripped from all lists
   - Fix: removed the call from both `deleteArticle()` and
     `deleteArticleAndCleanupLists()` in articles-repository.service.ts
   - Also upgraded `mergeArticles()` to prune orphaned shared articles

3. **mergeArticles not called when lists change** (commit 7ce4173)
   - `executeMergeLists()` didn't call `mergeArticles()` so pruning never
     triggered when shared list data updated
   - Fix: added `mergeArticles()` call in `executeMergeLists()` when
     `articlesLoadedFromFirestore === true`
   - Also added `mergeArticles()` in `loadAllOwnedArticles()` cache-hit path

4. **Edit mode 'fehlend' filter shows 0 articles** (latest commit)
   - Root cause: only list-specific articles loaded, all had isInList=true
   - Fix: call `loadAllOwnedArticles()` when switching to edit mode and when
     setting edit filter to 'fehlend' or 'alle'
   - Modified: `switchToEditMode()`, `initializeComponent()`, `setEditFilter()`
     in list-detail.ts; added `loadAllOwnedArticles()` passthrough to data.service.ts

5. **Restore script --execute flag eaten by npm** (commit 7ce4173)
   - npm intercepted `--execute` as config flag
   - Fix: also check `process.env['npm_config_execute']`

### Analytics events added

Events now tracked (across articles-repository.service.ts and
lists-repository.service.ts):
- ARTICLE_CREATED — in createArticle() online path
- ARTICLE_UPDATED — in updateArticle() online path
- ARTICLE_DELETED — in deleteArticleAndCleanupLists()
- ARTICLE_CHECKED — in toggleItemChecked() (was already present)
- ARTICLE_UNCHECKED — in toggleItemChecked() (was already present)
- ARTICLE_ADDED_TO_LIST — in addArticleToListInternal() + addMultipleArticlesToList()
- ARTICLE_REMOVED_FROM_LIST — in removeArticleFromList() + removeMultipleArticlesFromList()
- ARTICLE_COPIED — in createLocalCopy()

---

## REMAINING KNOWN ISSUES

1. **171 pre-existing test failures** — These are NOT from this branch. They
   include context-management specs, intentionally-failing integration specs,
   and e2e tests that need the Firebase emulator.

2. **list-detail.ts has dead code** — `originalOnUndoArticleCompletion_oldDataServiceCode`
   at line 311 is marked "DELETE AFTER TESTING". Can be removed.

3. **list-detail-bug2.integration.spec.ts** — Intentionally failing tests that
   demonstrate a race condition in article updates. The "after fix" scenario
   passes but the "before fix" scenarios fail by design.

---

## TEST BASELINE

- Unit: **769 pass / 171 fail** (pre-existing)
- E2E (with emulator): **147 pass / 10 fail** (pre-existing)
- Run: `npx vitest run` for unit tests
- Run: `npm run test:firestore` for e2e (starts emulator automatically)

---

## KEY FILES

| File | What it does |
|------|-------------|
| `src/app/core/services/firebase-data.service.ts` | Facade — BehaviorSubjects, mergeArticles(), executeMergeLists(), loadAllOwnedArticles() |
| `src/app/core/services/firebase-listener.service.ts` | onSnapshot listeners, cleanupLazyListeners() |
| `src/app/core/services/firebase-data-loader.service.ts` | First-load data fetching |
| `src/app/core/services/articles-repository.service.ts` | Article CRUD + analytics tracking |
| `src/app/core/services/lists-repository.service.ts` | List operations + analytics tracking |
| `src/app/core/services/data.service.ts` | DataService facade used by components |
| `src/app/features/lists/list-detail/list-detail.ts` | List detail component — shopping/edit mode |
| `src/app/core/models/analytics.model.ts` | AnalyticsEventType enum |
| `scripts/restore-from-backup.ts` | Firestore backup restore script |

---

## HOW TO PULL THIS BRANCH

```bash
git fetch origin claude/refactor-firebase-service-K8o5z
git checkout claude/refactor-firebase-service-K8o5z
git reset --hard FETCH_HEAD
```
```
