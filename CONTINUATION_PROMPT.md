# Continuation Prompt for Fresh Session

Copy and paste this prompt to continue the bug fix in a new Claude Code session:

---

## Context

I'm working on fixing a critical bug introduced during a refactoring session. The code is on branch `claude/analyze-refactoring-plan-SpN6w` and has NOT been merged to main.

**IMPORTANT**: Before starting, you need to:
1. Checkout branch `claude/analyze-refactoring-plan-SpN6w`
2. Read `REFACTORING_STATUS.md` for full context

## The Bug

After extracting services from `firebase-data.service.ts` (Phase 1 refactoring), list sharing is broken:
- Owner sees 10/15 articles (should see 15/15)
- Participant sees 4/15 articles (should see 15/15)
- This worked correctly on main branch before refactoring

## Key Insight

The bug is NOT in Firestore rules, permissions, or the database. The code on main branch works fine. Something in the refactoring broke the article loading/merging logic.

## What Changed in Refactoring

Three services were extracted from `firebase-data.service.ts`:
1. `FirebaseMergeService` - merge logic for itemStates/articleIds
2. `FirebaseArticleLoaderService` - batch article loading
3. `FirebaseListenerStateService` - listener lifecycle management

## Prime Suspect

The `mergeArticleIds()` function in `firebase-merge.service.ts` has a "migration mode" that does a UNION of local and server articleIds. This may be preserving stale local articleIds that shouldn't be there.

For shared lists:
- The SERVER (owner's data) should be the source of truth
- The participant's local cache should NOT be merged - it should be replaced with server data
- Current code merges them, which may include stale IDs from cache

## Files to Focus On

1. `src/app/core/services/firebase-data.service.ts`
   - Lines 1054-1221: `setupSingleSharedListListener()`
   - Lines 1100-1106: Where local and server articleIds are merged

2. `src/app/core/services/firebase-merge.service.ts`
   - Lines 98-157: `mergeArticleIds()` function
   - Check if migration mode is incorrectly triggered

3. Compare with main branch behavior - the inline merge code that was there before extraction

## Suggested Approach

1. First, read `REFACTORING_STATUS.md` for full context
2. Compare `mergeArticleIds()` in the extracted service vs the original inline code on main
3. Consider: For SHARED lists (participant view), should we even merge local articleIds? Or just use server's articleIds?
4. Add targeted logging to see exact values being merged
5. Test with: Owner creates list with 15 articles, shares with participant, both should see 15/15

## Commits Already Made (on this branch)

- 170f4a1: Remove stale article load - let listeners handle fresh data
- 3f29590: Detect and load missing articles after listener fires
- fe76172: Improve diagnostic logging
- 93d3b24: Handle shared list not found in sharedLists array
- 7d5d1a7: Shared list listeners now use mergeService
- bc52777: Consistent usage of mergeService and listenerState

None of these fully fixed the issue.

## To Enable Debug Logging

In browser console: `window.logger.enableTopic('data')`

Look for:
- `LOADED IDS:` vs `LIST EXPECTS:` - if different, wrong articles loaded
- `MISMATCH:` warnings

---

Please start by reading `REFACTORING_STATUS.md` and then investigate why the merge logic is causing wrong articleIds to be used.
