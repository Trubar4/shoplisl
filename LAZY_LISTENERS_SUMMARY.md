# Lazy Listeners Implementation Summary

**Branch**: `claude/reduce-firestore-reads-EKLXB`
**Goal**: Reduce Firestore quota from 13,000+ reads to stay within Firebase free tier (~50k reads/day for 50 users)
**Status**: ✅ Real-time sync working, ⚠️ Quota still high (~10k reads), 🐛 Deletion conflicts

---

## What Was Implemented

### 1. Lazy Listeners (✅ Working)
**Files**:
- `src/app/core/services/active-list.service.ts` (NEW)
- `src/app/core/services/firebase-data.service.ts` (MODIFIED)
- `src/app/features/lists/list-detail/list-detail.ts` (MODIFIED)

**How it works**:
- Only sets up real-time listener for the **currently open list**
- Not for all 12-15 lists at once
- When user opens a list → `setActiveList(listId)` triggers listener setup
- When user navigates away → `clearActiveList()` cleans up listener

**Key fixes applied**:
1. ✅ Race condition where lists weren't loaded when listener tried to set up
2. ✅ Subscription destroyed on user login (needed to recreate it)
3. ✅ Both owner and collaborator listeners now fire correctly

**Result**: Real-time sync works perfectly for both owner and collaborator

---

### 2. Lazy Article Loading (✅ Implemented)
**Files**:
- `src/app/core/services/firebase-data.service.ts` (MODIFIED)

**How it works**:
- **Before**: Loaded ALL articles from ALL shared lists on startup (7,248 reads!)
- **After**: Loads articles ONLY for the list you're viewing
- `loadArticlesForList()` called when listener is set up
- Articles cached and reused if you reopen the same list

**Result**: Expected 99% quota reduction (7,248 → ~50 reads)

---

## Current Issues

### 🐛 Issue 1: Deletion Conflicts (NEW)
**Symptom**:
- User A unchecks article → User B deletes different article → User A's uncheck is lost

**Root cause**:
- Merge logic in `mergeArticleIds()` doesn't handle concurrent operations correctly
- When timestamps are close, wrong state is chosen

**Fix needed**:
- Apply same timestamp-based merge logic to `mergeArticleIds()` that we used for `mergeItemStates()`

---

### ⚠️ Issue 2: Quota Still Too High
**Expected**: ~50 reads per session
**Actual**: ~10,000 reads across multiple test sessions today

**Possible causes**:
1. Multiple test sessions adding up
2. Lazy article loading might still load too much
3. Cache might not be persisting properly
4. Trying to load 429 non-existent articles on startup (still happening?)

**Investigation needed**:
- Check quota monitor logs for what's consuming reads
- Verify lazy article loading is working correctly
- Check if cache is being used

---

## Architecture Overview

### Active List Flow
```
1. User opens list
   ↓
2. list-detail.ts calls activeListService.setActiveList(listId)
   ↓
3. ActiveListService emits change via BehaviorSubject
   ↓
4. firebase-data.service subscription receives change
   ↓
5. setupLazyListenerForList(listId) called
   ↓
6. Determines if owned or shared list
   ↓
7. Sets up appropriate listener (owned or shared)
   ↓
8. Loads articles for that specific list only
   ↓
9. Real-time updates flow through listener
```

### Cleanup Flow
```
1. User navigates away from list
   ↓
2. list-detail.ts ngOnDestroy calls activeListService.clearActiveList()
   ↓
3. ActiveListService emits null
   ↓
4. firebase-data.service subscription receives null
   ↓
5. cleanupLazyListeners() called
   ↓
6. All listeners unsubscribed
```

---

## Key Code Locations

### Subscription Setup
- **Constructor**: `firebase-data.service.ts:102` - Initial setup
- **After login**: `firebase-data.service.ts:119` - Re-setup after cleanup
- **Handler**: `firebase-data.service.ts:134-149` - Subscription callback

### Listener Setup
- **Entry point**: `setupLazyListenerForList()` at line 158
- **Owned list**: `setupSingleOwnedListListener()` at line 488
- **Shared list**: `setupSingleSharedListListener()` at line 572
- **Article loading**: `loadArticlesForList()` at line 235

### Cleanup
- **Lazy listeners**: `cleanupLazyListeners()` at line 213
- **All listeners**: `cleanupListeners()` at line 1334
- **Subscription**: `activeListSubscription.unsubscribe()` at line 1351

### Merge Logic
- **Item states**: `mergeItemStates()` at line ~1360 (timestamp-based, ✅ working)
- **Article IDs**: `mergeArticleIds()` at line ~1330 (🐛 needs same fix)

---

## Test Results

### ✅ Working
- Real-time sync: Owner → Collaborator ✅
- Real-time sync: Collaborator → Owner ✅
- Check/uncheck persistence (when no deletions) ✅
- Lazy listener setup ✅
- Lazy listener cleanup ✅

### 🐛 Broken
- Uncheck + concurrent deletion from other user ❌
- Quota still too high (10k reads instead of ~50) ⚠️

---

## Next Steps

### Priority 1: Fix Deletion Conflicts
Apply timestamp-based merge to `mergeArticleIds()`:
```typescript
// Current buggy logic (simplified):
const merged = [...serverIds];
for (const localId of localIds) {
  if (!serverIds.includes(localId)) {
    merged.push(localId);
  }
}

// Needed: Compare timestamps like mergeItemStates() does
// Use updatedAt timestamps to determine which operation happened last
```

### Priority 2: Investigate Quota Usage
- Add quota tracking to `loadArticlesForList()`
- Verify lazy loading is actually lazy
- Check if cache is working
- Identify what's causing 10k reads

### Priority 3: Clean Up
- Remove deprecated methods (`setupOwnedListRealtimeListeners`, `setupSharedListRealtimeListeners`)
- Remove unused batch loading code
- Remove debug logs that are no longer needed

---

## Important Notes

### Firestore Security Rules
Make sure these allow:
- Owner can read/write their own lists
- Collaborators can read/write shared lists at `users-v2/{ownerId}/lists/{listId}`
- Collaborators can read articles at `users-v2/{ownerId}/articles/{articleId}`

### Critical Dependencies
- `AuthService.getCurrentUserId()` must return correct user ID
- `listsSubject.value` must have optimistic updates (not stale)
- `lastMergeWrite` map prevents infinite loops (2-second cooldown)

### Known Limitations
- Only works when lists are loaded (race condition handled with subscription)
- Requires user to be logged in (no anonymous support)
- Collaborators can't write back merge conflicts (only owner can)

---

## Commits on Branch

1. `feat: implement lazy listeners for 98% quota reduction` (2b8215e)
2. `fix: resolve race condition and logging in lazy listeners` (7d3a1ef)
3. `CRITICAL FIX: re-setup active list listener after user login` (867e8df)
4. `debug: add comprehensive logging to diagnose listener setup issues` (cd0983f, 71a9c85)
5. `feat: implement lazy article loading for massive quota reduction` (70ccc97)

---

## For Next Session

**Prompt to use**:
```
Continue implementing lazy listeners for Firestore quota reduction.

Current status:
- ✅ Real-time sync working (owner ↔ collaborator)
- ✅ Lazy listeners implemented (only listen to open list)
- ✅ Lazy article loading implemented
- 🐛 Deletion conflicts: When User A unchecks and User B deletes, uncheck is lost
- ⚠️ Quota still high: ~10k reads instead of expected ~50

Branch: claude/reduce-firestore-reads-EKLXB

See LAZY_LISTENERS_SUMMARY.md for full context.

Tasks:
1. Fix deletion conflicts in mergeArticleIds() (apply timestamp-based merge)
2. Investigate why quota is still 10k reads
3. Clean up deprecated code
```

**Files to review**:
- `LAZY_LISTENERS_SUMMARY.md` (this file)
- `src/app/core/services/firebase-data.service.ts` (main implementation)
- `src/app/core/services/active-list.service.ts` (tracks active list)
