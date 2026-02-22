# Next Session Prompt: Fill Analytics Event Gaps

**Copy and paste the session prompt below to start the next Claude Code session.**

---

## Session Prompt

```
Add the missing analytics events identified in the gap analysis below.
Branch: claude/refactor-firebase-service-ieGPp
DO NOT merge to main — all work stays on this branch.

## CONTEXT

### What is already tracked (do NOT re-add)

| Event | Location |
|-------|----------|
| LIST_CREATED | lists-repository.service.ts (offline + online paths) |
| LIST_UPDATED | lists-repository.service.ts (offline + online paths) |
| LIST_DELETED | lists-repository.service.ts (offline + online paths) |
| ARTICLE_CREATED | articles-repository.service.ts |
| ARTICLE_UPDATED | articles-repository.service.ts |
| ARTICLE_DELETED | articles-repository.service.ts |
| ARTICLE_COPIED | articles-repository.service.ts |
| ARTICLE_ADDED_TO_LIST | lists-repository.service.ts (single + batch) |
| ARTICLE_REMOVED_FROM_LIST | lists-repository.service.ts (single + batch) |
| ARTICLE_CHECKED | lists-repository.service.ts (toggleItemChecked) |
| ARTICLE_UNCHECKED | lists-repository.service.ts (toggleItemChecked) |
| AI_COMMAND_EXECUTED | ai/ai.service.ts |
| AI_COMMAND_FAILED | ai/ai.service.ts |
| USER_SIGNUP / USER_LOGIN / USER_LOGOUT | auth.service.ts |

### Analytics infrastructure

- Service: `src/app/core/services/analytics.service.ts`
- Call pattern: `this.analyticsService.trackEvent(userId, AnalyticsEventType.XYZ, { ...metadata })`
- Event enum: `src/app/core/models/analytics.model.ts` → `AnalyticsEventType`
- The analytics service is already injected in lists-repository.service.ts and articles-repository.service.ts.
  For sharing.service.ts it must be injected fresh.

---

## GAPS TO FIX (priority order)

### GAP 1 — Sharing events (HIGH — event types defined but never fired)

**File:** `src/app/core/services/sharing.service.ts`

The sharing service currently does NOT import or inject `AnalyticsService`.
Add the injection, then track:

| Where | Event | Metadata |
|-------|-------|----------|
| `createShareInvite()` — after successful Firestore write | `SHARE_INVITE_CREATED` | `{ listId, invitedEmail, fromUserId }` |
| `createShareInvite()` — same call | `LIST_SHARED` | `{ listId, invitedEmail }` |
| `acceptInvite()` — after invite status updated to 'accepted' | `SHARE_INVITE_ACCEPTED` | `{ listId, inviteId, fromUserId }` |
| `removeCollaborator()` — after successful removal | `LIST_UNSHARED` | `{ listId, removedUserId }` |

**Important:** Get userId via `this.authService.getCurrentUserId()` (already injected in sharing.service.ts).

---

### GAP 2 — AI source metadata on article events (HIGH — needed for DailyAggregates.articlesAddedViaAI)

**Problem:** When the AI adds an article to a list (via `routeCommand → addArticleToList`), the
`ARTICLE_ADDED_TO_LIST` event fires in `lists-repository.service.ts` with NO indication it came
from AI. The `DailyAggregates` model has `articlesAddedViaAI` and `listsAddedViaAI` fields that
can never be populated correctly.

**Fix:** Add an optional `source?: 'ai' | 'manual'` parameter to:
- `addArticleToList()` in `lists-repository.service.ts`
- `addMultipleArticlesToList()` in `lists-repository.service.ts`
- `createArticle()` in `articles-repository.service.ts`

Pass `source: 'ai'` in the analytics metadata when `source === 'ai'`.

Then update the callers inside the AI service / AI command handlers to pass `source: 'ai'`.
To find the callers: grep for `addArticleToList\|addMultipleArticlesToList\|createArticle`
in `src/app/core/services/ai/` and `src/app/store/`.

Keep the parameter optional with default `'manual'` so no other callers need to change.

---

### GAP 3 — ARTICLE_MOVED_BETWEEN_LISTS (MEDIUM — new event type needed)

**Background:** `moveArticlesBetweenLists()` in `data.service.ts` (line ~195) moves
articles by calling:
1. `addMultipleArticlesToList(targetListId, articleIds)` → fires `ARTICLE_ADDED_TO_LIST`
2. `markMultipleArticlesAsChecked(sourceListId, articleIds)` → no event fired

So the add IS tracked, but there is no consolidated "move" event, and the source list
context is lost.

**Fix:**
1. Add `ARTICLE_MOVED_BETWEEN_LISTS = 'article_moved_between_lists'` to `AnalyticsEventType`
   in `src/app/core/models/analytics.model.ts`.
2. In `onMoveSelectedArticles()` in `list-detail.ts` (line ~359), after the
   `moveArticlesBetweenLists()` call succeeds, track:
   ```typescript
   this.analyticsService.trackEvent(userId, AnalyticsEventType.ARTICLE_MOVED_BETWEEN_LISTS, {
     sourceListId: this.listId,
     targetListId: selectedTargetListId,
     count: articleIds.length,
     articleIds
   });
   ```
   `AnalyticsService` is NOT currently injected in `list-detail.ts` — inject it.
   Alternatively, add a `moveArticlesBetweenLists()` tracking call inside `data.service.ts`
   after the pipeline succeeds (cleaner — keeps analytics out of the component).

   Recommended: track inside `data.service.ts` / `lists-repository.service.ts`, not the component.

---

### GAP 4 — LIST_VIEWED (LOW — noisy, but completes the defined event set)

**Event type:** already defined in `AnalyticsEventType`.

**Where to add:** `initializeComponent()` in `list-detail.ts` (line ~623), or the
`ngOnInit()` of `ListDetailComponent`. Track once per navigation to a list:

```typescript
this.analyticsService.trackEvent(userId, AnalyticsEventType.LIST_VIEWED, {
  listId: this.listId,
  listName: list?.name
});
```

This will fire every time the user opens a list detail view. It is intentionally
one event per navigation, not debounced.

---

## WHAT TO SKIP (not worth adding)

- **Department order changed** — too niche, no event type defined, low value
- **`markMultipleArticlesAsChecked` per-article ARTICLE_CHECKED** — would fire N times
  on every article move; the consolidated ARTICLE_MOVED event covers it

---

## KEY FILES

| File | What to touch |
|------|--------------|
| `src/app/core/models/analytics.model.ts` | Add ARTICLE_MOVED_BETWEEN_LISTS enum value |
| `src/app/core/services/sharing.service.ts` | Inject AnalyticsService, add 4 trackEvent calls |
| `src/app/core/services/lists-repository.service.ts` | Add optional source param, update ARTICLE_ADDED_TO_LIST metadata |
| `src/app/core/services/articles-repository.service.ts` | Add optional source param, update ARTICLE_CREATED metadata |
| `src/app/core/services/data.service.ts` OR `list-detail.ts` | Track ARTICLE_MOVED_BETWEEN_LISTS |
| `src/app/features/lists/list-detail/list-detail.ts` | Track LIST_VIEWED (+ inject AnalyticsService if tracking here) |
| `src/app/core/services/ai/ai.service.ts` (or AI command handlers) | Pass source: 'ai' when calling add/create operations |

---

## TEST BASELINE

- Unit: **769 pass / 171 fail** (pre-existing — do not regress)
- E2E: **147 pass / 10 fail** (pre-existing — do not regress)
- Run: `node_modules/.bin/vitest run` for unit tests
- Run: `npm run test:firestore` for e2e (starts emulator automatically)

The 171 unit failures are pre-existing (context-management specs, intentionally failing
integration specs, e2e specs needing emulator). Maintain the 769 passing count.

---

## GIT

Branch: `claude/refactor-firebase-service-ieGPp`
Push to: `origin claude/refactor-firebase-service-ieGPp`
Do NOT merge to main.
```
