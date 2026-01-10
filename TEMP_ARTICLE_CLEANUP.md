# Temporary Article Cleanup - Technical Documentation

## Problem Summary

When users add articles **while offline**, the app creates temporary IDs (e.g., `temp_1767542748274_hrnlkevvy`) so the article can be displayed immediately in the UI. Once back online, these articles are synced to Firebase with **real IDs**, and the local client replaces the temp IDs. However, **Firebase still contains the old temp_ IDs** in list data, causing discrepancies between owner and participant views of shared lists.

## Current State

### What Happens Now

1. **Offline Article Creation** (`src/app/core/services/articles-repository.service.ts:89`)
   - User adds article while offline
   - Temporary ID generated: `temp_${timestamp}_${random}`
   - Article added to local state with temp ID
   - Temp ID added to list's `articleIds` and `itemStates`

2. **Online Sync** (`src/app/core/services/articles-repository.service.ts:109-142`)
   - Article synced to Firebase, gets real ID
   - Local client updates:
     - Articles: `temp_xxx` → `real_id` ✅
     - Lists in memory: `temp_xxx` → `real_id` ✅
     - **BUT** Firebase lists: Still has `temp_xxx` ❌

3. **The Problem**
   - Owner's local client has cleaned up temp IDs
   - Firebase still has stale temp IDs in list data
   - Participants loading from Firebase see inflated article counts

### Current Workaround (Implemented)

**Location**: `src/app/features/lists/lists-overview/lists-overview.ts:101-110`

```typescript
// Filter out temp_ articles before displaying
const filterTempArticles = (articleIds: string[]): string[] =>
  articleIds.filter(id => !id.startsWith('temp_'));

const filterTempFromItemStates = (itemStates: { [articleId: string]: ListItemState }): { [articleId: string]: ListItemState } =>
  Object.fromEntries(
    Object.entries(itemStates || {})
      .filter(([articleId]) => !articleId.startsWith('temp_'))
  ) as { [articleId: string]: ListItemState };
```

**Why This Works**: Client-side filtering hides temp articles from display for all users.

**Limitation**: Temp IDs remain in Firebase, wasting storage and potentially causing issues elsewhere in the app.

---

## Proper Solution: Clean Up Firebase

### Where to Fix

**File**: `src/app/core/services/articles-repository.service.ts`
**Method**: Lines 109-142 (offline sync callback)

### Current Code (Lines 109-142)

```typescript
this.offlineSync.queueOperation(async () => {
  this.logger.info('data', `🔄 Syncing offline article: ${article.name} (temp ID: ${tempId})`);

  // Create article in Firebase and get real ID
  const realId = await this.firebaseData.createArticleInFirebase(articleData);
  this.logger.info('data', `✅ Article synced with real ID: ${realId}`);

  // CRITICAL: Replace temp ID with real ID in all local state and lists
  const currentArticles = this.firebaseData.getCurrentArticles();
  const updatedArticles = currentArticles.map(a =>
    a.id === tempId ? { ...a, id: realId } : a
  );
  this.firebaseData.updateLocalArticles(updatedArticles);

  // Update all lists that reference the temp ID
  const currentLists = this.firebaseData.getCurrentLists();
  const updatedLists = currentLists.map(list => {
    if (list.articleIds.includes(tempId)) {
      return {
        ...list,
        articleIds: list.articleIds.map(id => id === tempId ? realId : id),
        itemStates: Object.fromEntries(
          Object.entries(list.itemStates).map(([key, value]) =>
            key === tempId ? [realId, { ...value, articleId: realId }] : [key, value]
          )
        )
      };
    }
    return list;
  });
  this.firebaseData.updateLocalLists(updatedLists);  // ❌ ONLY UPDATES LOCAL MEMORY

  this.logger.info('data', `🔄 Replaced temp ID ${tempId} with real ID ${realId} in local state`);
}, `Create article: ${article.name}`);
```

### Problem

**Line 139**: `this.firebaseData.updateLocalLists(updatedLists)`

This method only updates **local memory**, not Firebase:

```typescript
// src/app/core/services/firebase-data.service.ts:2619
updateLocalLists(lists: ShoppingList[]): void {
  this.listsSubject.next(lists);        // ✅ Updates local BehaviorSubject
  this.cacheService.cacheLists(lists);  // ✅ Updates IndexedDB cache
  // ❌ DOES NOT update Firebase
}
```

### Required Changes

#### Step 1: Update Lists in Firebase

After replacing temp IDs in local state, **persist the changes to Firebase** for each affected list.

**Add after line 139**:

```typescript
// CRITICAL: Update Firebase with cleaned list data (remove temp IDs)
for (const list of updatedLists) {
  if (list.articleIds.some(id => id === realId) ||
      Object.keys(list.itemStates).some(key => key === realId)) {

    // Only update lists that were modified
    try {
      await this.firebaseData.updateListInFirebase(list.id, {
        articleIds: list.articleIds,
        itemStates: list.itemStates,
        updatedAt: Timestamp.now()
      });

      this.logger.info('data', `✅ Updated list ${list.id} in Firebase: replaced temp ID ${tempId} with ${realId}`);
    } catch (error) {
      this.logger.error('data', `❌ Failed to update list ${list.id} in Firebase:`, error);
    }
  }
}
```

#### Step 2: Add updateListInFirebase Method

**File**: `src/app/core/services/firebase-data.service.ts`

**Add method** (around line 2400, after other update methods):

```typescript
/**
 * Update specific fields of a list in Firebase
 * Used for cleaning up temp article IDs after offline sync
 */
async updateListInFirebase(
  listId: string,
  updates: Partial<ShoppingList>
): Promise<void> {
  const userId = this.authService.getCurrentUserId();
  if (!userId || !this.firestore) {
    throw new Error('User must be authenticated and Firestore must be initialized');
  }

  const basePath = this.getUserBasePath();
  const listRef = doc(this.firestore, `${basePath}/lists/${listId}`);

  // Convert itemStates to Firestore-compatible format
  if (updates.itemStates) {
    updates.itemStates = this.convertItemStatesToFirestore(updates.itemStates);
  }

  await updateDoc(listRef, updates);
  this.logger.debug('data', `Updated list ${listId} in Firebase`, updates);
}
```

#### Step 3: Handle Shared Lists

For **shared lists** (where user is not the owner), update the owner's Firebase path:

```typescript
// CRITICAL: For shared lists, update the owner's Firebase path
const list = currentLists.find(l => l.id === updatedList.id);
if (list && list.ownerId && list.ownerId !== userId) {
  // This is a shared list - update owner's Firebase
  const ownerListRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);

  try {
    await updateDoc(ownerListRef, {
      articleIds: updatedList.articleIds,
      itemStates: this.convertItemStatesToFirestore(updatedList.itemStates),
      updatedAt: Timestamp.now()
    });

    this.logger.info('data', `✅ Updated shared list ${list.id} in owner's Firebase`);
  } catch (error) {
    this.logger.error('data', `❌ Failed to update shared list ${list.id}:`, error);
  }
}
```

---

## Implementation Checklist

- [ ] Add `updateListInFirebase()` method to `firebase-data.service.ts`
- [ ] Update offline sync callback in `articles-repository.service.ts` to call `updateListInFirebase()`
- [ ] Handle shared lists by updating owner's Firebase path
- [ ] Add error handling for failed Firebase updates
- [ ] Test offline article creation and sync
- [ ] Verify temp IDs are removed from Firebase after sync
- [ ] Test with shared lists to ensure participant sees correct counts immediately
- [ ] Remove client-side `filterTempArticles()` workaround after confirming Firebase cleanup works

---

## Testing Procedure

### Test 1: Offline Article Creation (Owned List)

1. Go offline (disable network)
2. Add 3 articles to an owned list
3. Verify temp IDs appear in console/local storage
4. Go online
5. Wait for sync to complete
6. **Check Firebase**: Verify list's `articleIds` and `itemStates` contain real IDs, NOT temp_
7. **Check UI**: Verify article count is correct

### Test 2: Offline Article Creation (Shared List)

1. Owner goes offline
2. Owner adds 2 articles to shared list
3. Owner goes online, waits for sync
4. **Check owner's Firebase**: Verify temp IDs replaced
5. **Participant refreshes app**: Verify they see correct count immediately (not inflated)

### Test 3: Multiple Temp Articles

1. Go offline
2. Add 5 articles across 3 different lists
3. Go online
4. Verify all 3 lists updated in Firebase with real IDs
5. Check that no temp_ IDs remain in any list

---

## Alternative Approach: Firebase Cloud Function

If updating from the client fails due to permissions/security rules, consider a **Cloud Function**:

```typescript
// Firebase Cloud Function (functions/src/index.ts)
export const cleanupTempArticles = functions.https.onCall(async (data, context) => {
  const { userId, listId, tempId, realId } = data;

  // Verify user has access to the list
  const listRef = admin.firestore().doc(`users-v2/${userId}/lists/${listId}`);
  const listDoc = await listRef.get();

  if (!listDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'List not found');
  }

  const listData = listDoc.data();

  // Replace temp ID with real ID
  const updatedArticleIds = listData.articleIds.map(id => id === tempId ? realId : id);
  const updatedItemStates = {};

  for (const [key, value] of Object.entries(listData.itemStates)) {
    const newKey = key === tempId ? realId : key;
    updatedItemStates[newKey] = { ...value, articleId: realId };
  }

  // Update Firebase
  await listRef.update({
    articleIds: updatedArticleIds,
    itemStates: updatedItemStates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, message: `Replaced ${tempId} with ${realId}` };
});
```

Call from client:

```typescript
const cleanupTempArticles = httpsCallable(this.functions, 'cleanupTempArticles');
await cleanupTempArticles({ userId, listId, tempId, realId });
```

---

## Priority

**Medium-High**

- **Current workaround** (client-side filtering) prevents UI bugs
- **Firebase cleanup** should be implemented to:
  - Reduce storage waste
  - Prevent potential issues in other app areas
  - Improve data integrity
  - Allow removal of workaround code

---

## Related Files

- `src/app/core/services/articles-repository.service.ts` (Lines 86-145)
- `src/app/core/services/firebase-data.service.ts` (Line 2619, add new method)
- `src/app/features/lists/lists-overview/lists-overview.ts` (Lines 101-110, workaround)
- `src/app/core/services/offline-sync.service.ts` (Queue management)

---

## Notes

- Temp IDs follow format: `temp_${timestamp}_${random}`
- Only affects articles created while offline
- Does not affect articles created while online (they get real IDs immediately)
- Shared lists are more affected because participants can't access the owner's local cleanup

---

**Document Created**: 2026-01-10
**Issue Tracking**: Related to bug "Number of articles for shared lists don't load in overview for participants"
