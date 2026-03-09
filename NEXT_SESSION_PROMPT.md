# Next Session Prompt — Analytics Tracking (continued)

**Branch to create:** new `claude/` branch from main
**Date updated:** 2026-03-09

---

## What Was Done (This Session — analytics dashboard fixes)

| Commit | Description |
|--------|-------------|
| `db5b1fb` | feat(analytics): reduce buffer thresholds (50→10 events, 5min→30s timer), expose public flush() |
| `b2ce722` | feat(dashboard): add Flush Events button with badge, Feature Adoption and Retention cards |
| `a9e6761` | feat(analytics-aggregation): compute feature adoption rates and user retention metrics |
| `893b8c0` | fix(analytics): Today's Activity always zero (missing orderBy), double writes (dead forEach loop) |

### What is now working (tested and verified)
- Flush Events button — flushes buffer, shows badge count, success/empty notification
- Feature Adoption Rates card — AI Assistant, Sharing, Voice Input percentages
- User Retention card — Day 1 / Day 7 / Day 30 rates with colour coding (needs index, see below)
- Date range filter — affects all cards
- Today's Activity — now returns most recent events (was returning arbitrary 500 due to missing orderBy)

### Firestore index created this session
Composite index on `analytics/events/items`: `eventType ASC + timestamp ASC`
Required for the retention query (`where eventType == user_login + where timestamp >= ...`).
**Status when session ended: "Building..."** — will be "Enabled" within a few minutes.
Once enabled, User Retention will show real percentages instead of zeros.

---

## Test Checklist Before Starting Next Work

Run these quick checks to confirm the analytics dashboard is fully working:

1. **Today's Activity** — create a list and add an article as any user, wait 30s (auto-flush), then force-refresh the admin dashboard → counts should appear
2. **Retention card** — should show cohort size > 0 and colour-coded day tiles (once Firestore index finishes building)
3. **Flush Events button** — should be disabled when buffer is empty, show badge when events pending

---

## Test Baseline (last known good)

```
npm test
Test Files: 16 failed | 28 passed | 8 skipped (52)
Tests:      119 failed | 890 passed | 155 skipped (1164)
```

All failures are pre-existing. Do not fix them, do not regress passing tests.

**Our tests (all passing):**
- `voice-ai-assistant.component.spec.ts` — 133/133 ✅
- `list-detail.spec.ts` — all ✅
- `history-mode.component.spec.ts` — all ✅

---

## Next Priorities

### Priority 1 — Sharing events (HIGH)
**File:** `src/app/core/services/sharing.service.ts`

Events defined but never fired: `SHARE_INVITE_CREATED`, `LIST_SHARED`, `SHARE_INVITE_ACCEPTED`, `LIST_UNSHARED`.

Inject `AnalyticsService` into `sharing.service.ts` and add tracking calls:
- `createShareInvite()` → track `SHARE_INVITE_CREATED` + `LIST_SHARED`
- `acceptInvite()` → track `SHARE_INVITE_ACCEPTED`
- `removeCollaborator()` → track `LIST_UNSHARED`

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

## Known Bugs (separate from analytics)

### Bug — User names not shown on checked articles
- **Where:** List shop mode → "filter erledigt" (filter completed)
- **Symptom:** User names don't appear on articles checked by other users
- **Root cause:** Likely in UI rendering of `checkedBy` field in `itemStates`, not data layer
- **Files to check:** list-detail shop mode view, item state display, user profile lookup
- **Priority:** Medium — postponed

---

## How to Start Next Session

```
Continue analytics tracking implementation. Start a new claude/ branch from main.

Test baseline: 119 failed / 890 passed (all failures are pre-existing).
Run `npm test` after changes — only watch for regressions in passing tests.

Next priority: Add sharing analytics events to sharing.service.ts.
See docs/NEXT_SESSION_PROMPT_ANALYTICS_EVENTS.md for full gap analysis.
```
