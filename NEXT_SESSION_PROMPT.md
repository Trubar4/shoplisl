# Next Session Prompt — User Tracking / Analytics

**Branch:** `claude/analyze-user-tracking-8OKBN`
**Date:** 2026-03-06

---

## What Was Accomplished This Session

| Commit | Description |
|--------|-------------|
| `14c3c24` | feat(analytics): track article check/uncheck and add/remove from list (Priority 1) |
| `c32535b` | test(analytics): add unit tests for article check/uncheck and add/remove tracking |
| `b5085d4` | fix(analytics): remove double-tracking from list-detail component |
| `83d7a49` | feat(analytics): wire up AI_DISAMBIGUATION_SHOWN, AI_RECIPE_PROCESSED, AI_VOICE_INPUT_USED events |
| `8b3e14e` | feat(feedback): implement FEEDBACK_SUBMITTED tracking (reverted — see below) |
| `8786a36` | revert: remove unauthorized feedback implementation |
| `d1c599f` | cleanup: remove debug logs from history-mode, add logger for AI analytics events |
| *(this session)* | cleanup: remove debug console.logs from voice-ai-assistant and list-detail |

### FEEDBACK_SUBMITTED — Why It Was Reverted

The feedback dialog + Firestore persistence was implemented but then reverted in `8786a36`
because it requires explicit user approval before implementing a new UI feature. The
implementation exists in the git history and can be cherry-picked when approved.

---

## Current Test Baseline (2026-03-06)

```
npm test
Test Files: 16 failed | 28 passed | 8 skipped (52)
Tests:      119 failed | 890 passed | 155 skipped (1164)
```

### Pre-existing failures — do NOT fix, do NOT regress

| Category | Files | Reason |
|----------|-------|--------|
| NG0202 DI error | `lists-overview-bug1.integration.spec.ts` | Intentional bug-doc tests; AuthService mock issue |
| E2E (no emulator) | `src/app/core/services/__e2e__/*.spec.ts` | Need Firebase emulator running |
| context-management | `context-management.service.spec.ts` | Pre-existing mock/DI issue |
| Various service specs | `article-stats`, `firebase-data-merge`, `history.service`, `lists-repository` | Pre-existing |

**Our tests (all passing):**
- `voice-ai-assistant.component.spec.ts` — 133/133 ✅
- `list-detail.spec.ts` — all ✅
- `history-mode.component.spec.ts` — all ✅

---

## What Is Still Missing (Next Priorities)

### Priority 1 — Sharing events (HIGH)
**File:** `src/app/core/services/sharing.service.ts`

Events defined but never fired: `SHARE_INVITE_CREATED`, `LIST_SHARED`, `SHARE_INVITE_ACCEPTED`, `LIST_UNSHARED`.

Inject `AnalyticsService` into `sharing.service.ts` and add tracking calls:
- `createShareInvite()` → `SHARE_INVITE_CREATED` + `LIST_SHARED`
- `acceptInvite()` → `SHARE_INVITE_ACCEPTED`
- `removeCollaborator()` → `LIST_UNSHARED`

See `docs/NEXT_SESSION_PROMPT_ANALYTICS_EVENTS.md` for full details.

### Priority 2 — AI source metadata (HIGH)
Add `source?: 'ai' | 'manual'` to `addArticleToList()` / `addMultipleArticlesToList()` /
`createArticle()`. Pass `source: 'ai'` from AI command handlers. This populates
`DailyAggregates.articlesAddedViaAI` in the admin dashboard.

### Priority 3 — ARTICLE_MOVED_BETWEEN_LISTS event (MEDIUM)
Add enum value + track in `data.service.ts` after `moveArticlesBetweenLists()` succeeds.

### Priority 4 — LIST_VIEWED event (LOW)
Track in `ngOnInit` of `list-detail.ts` once per navigation.

---

## Known Bugs (Separate From Analytics)

### Bug 1 — Article count not shown for shared lists (non-owners)
- **Spec:** `lists-overview-bug1.integration.spec.ts` (intentionally failing)
- **Root cause:** Firebase returns shared list with empty `articleIds`
- **Status:** Not fixed — tracked in spec as documentation

### Bug 2 — Article updates not visible after edit
- **Spec:** `list-detail-bug2.integration.spec.ts` (intentionally failing where bug exists, passing where fix exists)
- **Status:** Partially documented — fix approach exists in spec

---

## Test Failures Explained (for handoff)

```
FAIL lists-overview-bug1.integration.spec.ts
  Error: NG0202 — AuthService DI issue in test environment
  → These tests intentionally fail to document Bug 1
  → Do not fix the tests; fix the actual bug when ready

FAIL context-management.service.spec.ts
  → Pre-existing mock setup issue, unrelated to this session's work
  → Needs separate investigation

FAIL __e2e__/*.spec.ts
  → Require Firebase emulator: `firebase emulators:start`
  → Run separately with: npm run test:firestore
```

---

## Files Changed This Session

```
src/app/core/services/ai/ai.service.ts              (analytics events)
src/app/features/lists/list-detail/history-mode/history-mode.component.ts  (debug cleanup)
src/app/features/lists/list-detail/history-mode/history-mode.component.spec.ts
src/app/features/lists/list-detail/list-detail.ts   (double-tracking fix + debug cleanup)
src/app/features/lists/list-detail/list-detail.spec.ts
src/app/shared/components/bottom-tabs/bottom-tabs.ts (analytics)
src/app/shared/components/bottom-tabs/bottom-tabs.html
src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts  (debug cleanup)
src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.spec.ts
```

---

## How to Start Next Session

```
Continue analytics tracking implementation on branch claude/analyze-user-tracking-8OKBN.

Test baseline: 119 failed / 890 passed (all failures are pre-existing).
Run `npm test` after changes — only watch for regressions in passing tests.

Next priority: Add sharing analytics events to sharing.service.ts.
See docs/NEXT_SESSION_PROMPT_ANALYTICS_EVENTS.md for full gap analysis.
```
