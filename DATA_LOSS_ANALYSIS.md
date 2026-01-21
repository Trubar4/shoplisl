# Data Loss Analysis and Root Cause Investigation

## Issue Summary

**Date**: January 21, 2026
**Affected Lists**: 5 shared lists owned by user `HYqET9vr40eDju4nQCTnJTV0qJo2`
- bwG4wE8gqjn78pRsOwic (DM/Bipa) - 69 articles lost
- Krvv5jHvgKeRAZTR6uDH (Birgit Urlaub Como) - 41 articles lost
- FoIhdc4QqfgUx57JeRLD (Hofer) - 8 articles lost
- CemqHIYJ868O89362x9V (Sutterlüty) - 161 articles lost
- 62PhcxI5ivkgfhdlNbaR (Lädele) - 104 articles lost

**Total Articles Lost**: 383 articles
**Common Pattern**: All affected lists are shared lists that were recreated after previous data loss

## Potential Root Causes

### 1. ❌ Auto-Cleanup Function (RULED OUT)

**Location**: `src/app/core/services/data-migration.service.ts:127-201`

**Analysis**:
```typescript
for (const list of allLists) {
  // Phase 8: Skip cleanup for shared lists - articles may belong to collaborators
  if (sharedListIds.has(list.id)) {
    this.logger.debug('data', `Skipping cleanup for shared list...`);
    continue;  // ✅ SKIPS SHARED LISTS
  }
  // ... cleanup logic only runs for non-shared lists
}
```

**Conclusion**: This function explicitly skips shared lists, so it **cannot be the cause**.

### 2. ⚠️ Incomplete Article Loading for Shared Lists (HIGH PROBABILITY)

**Problem**: `getAllArticlesFromFirebase()` only loads articles from the current user:

```typescript
async getAllArticlesFromFirebase(): Promise<Article[]> {
  const basePath = this.getUserBasePath();  // users-v2/{currentUserId}/articles
  const snapshot = await getDocs(collection(this.firestore, `${basePath}/articles`));
  // ❌ Only loads current user's articles, NOT collaborators' articles
}
```

**Impact**:
- When a participant (not owner) has their app open
- `checkAndCleanupData()` is called during initialization
- It loads lists (including shared lists with articles from owners/collaborators)
- It loads articles (but only participant's own articles)
- **BUT** the cleanup function skips shared lists, so this shouldn't cause data loss either

### 3. 🚨 Merge Logic Issues (LIKELY CAUSE)

**Location**: `firebase-data.service.ts:1915-1980` - `mergeArticleIds()` function

**Problem**: During real-time sync, the merge logic might incorrectly determine that articleIds should be empty:

```typescript
private mergeArticleIds(
  localArticleIds: string[],
  serverArticleIds: string[],
  mergedItemStates: { [articleId: string]: any }
): string[] {
  // If server has no article IDs but itemStates exist, this is Bug 1
  if (serverArticleIds.length === 0 && Object.keys(mergedItemStates).length > 0) {
    return Object.keys(mergedItemStates);  // ✅ Fixes Bug 1
  }

  // If local has articles but server doesn't, keep local
  if (localArticleIds.length > 0 && serverArticleIds.length === 0) {
    return localArticleIds;  // ✅ Preserves local data
  }

  // If server has articles but local doesn't, use server
  if (serverArticleIds.length > 0 && localArticleIds.length === 0) {
    return serverArticleIds;  // ⚠️ Could this be wrong?
  }

  // Union of both
  return Array.from(new Set([...localArticleIds, ...serverArticleIds]));
}
```

**Potential Issue**: If a race condition occurs where:
1. Local state is temporarily empty (during cache clear or initialization)
2. Server state is also empty (due to Bug 1)
3. itemStates is also empty (both lost simultaneously)
4. Merge returns empty array and writes it to Firebase

### 4. 🔥 Firebase Write from Empty State (CRITICAL RISK)

**Scenario**: A participant opens the app:
1. App initializes, local cache is empty
2. Loads shared list from Firebase
3. Server has empty `articleIds` and empty `itemStates` (data already lost)
4. App accepts this empty state as valid
5. Later, a sync operation writes this empty state back to Firebase
6. Owner's data is now overwritten with empty arrays

**Evidence**: This would explain why:
- Only shared lists are affected
- All affected lists were recreated after previous data loss
- Data loss happens without explicit cleanup operations

### 5. ⚠️ Bug 1 Fix Not Applied Everywhere

**Issue**: Bug 1 Fix (populating articleIds from itemStates) was NOT applied in `getAllListsFromFirebase()` until today's fix.

**Timeline**:
- Jan 17: Lists recreated with data in backup
- Jan 17-21: Lists loaded without Bug 1 Fix in `getAllListsFromFirebase()`
- Jan 21: Article counts not showing → Investigation reveals empty data
- Possible: The empty display wasn't just a UI bug, but actual data loss in Firebase

## Detection and Monitoring Solutions

### 1. Data Loss Detector Service ✅ IMPLEMENTED

**File**: `src/app/core/services/data-loss-detector.service.ts`

**Features**:
- Monitors all list updates for unexpected data loss (>90% reduction)
- Captures stack traces to identify which code caused the loss
- Stores events in memory and localStorage
- Provides statistics on data loss patterns
- Can export events for analysis

**Usage**:
```typescript
// Before update
this.dataLossDetector.snapshotList(listBefore);

// After update
this.dataLossDetector.checkForDataLoss(listBefore, listAfter, 'updateList');

// Get statistics
const stats = this.dataLossDetector.getStatistics();
```

### 2. Firebase Rules to Prevent Empty Writes (RECOMMENDED)

**Problem**: Firebase doesn't prevent writing empty arrays

**Solution**: Add Firestore security rules to prevent data loss:

```javascript
match /users-v2/{userId}/lists/{listId} {
  allow update: if
    // Prevent writing empty articleIds if it had data before
    (request.resource.data.articleIds.size() > 0 ||
     resource.data.articleIds.size() == 0) &&
    // Prevent writing empty itemStates if it had data before
    (request.resource.data.keys().hasAny(['itemStates']) == false ||
     request.resource.data.itemStates.size() > 0 ||
     resource.data.itemStates.size() == 0);
}
```

**Limitation**: Free Firebase plan doesn't support complex rules, but worth adding for safety.

### 3. Firestore Audit Logs (FREE PLAN LIMITATION)

**Ideal Solution**: Enable Firestore audit logs to see:
- Who wrote the empty data
- When it was written
- From which IP/device

**Problem**: Only available on Firebase Blaze (pay-as-you-go) plan.

**Free Alternative**:
- Add client-side logging before every Firebase write
- Log: timestamp, userId, listId, articleIds.length, itemStates.length
- Store in separate Firestore collection `/audit-logs`

### 4. Implement Write Guards

Add checks before every Firebase write:

```typescript
async updateListInFirebase(listId: string, updates: Partial<ShoppingList>) {
  // GUARD: Prevent accidental data loss
  if (updates.articleIds && updates.articleIds.length === 0) {
    const currentList = await this.getListFromFirebase(listId);
    if (currentList.articleIds.length > 0) {
      this.logger.error('data', '🚨 BLOCKED: Attempt to empty articleIds', {
        listId,
        listName: currentList.name,
        currentCount: currentList.articleIds.length
      });
      throw new Error('Prevented data loss: Cannot empty articleIds');
    }
  }

  // ... proceed with update
}
```

## Recovery Procedures

### Immediate Recovery (Restore from Backup)

1. **Check Current State**:
   ```bash
   npm run check:lists
   ```

2. **Dry-Run Restore**:
   ```bash
   npm run restore:specific -- backups/latest.json --dry-run
   ```

3. **Execute Restore**:
   ```bash
   npm run restore:specific -- backups/latest.json --execute
   ```

4. **Verify**:
   - Open app and check if article counts display
   - Verify all articles are present

### Long-term Prevention

1. **Deploy Bug 1 Fix Everywhere** ✅ DONE TODAY
   - Added to `getAllListsFromFirebase()`

2. **Implement Data Loss Detector** ✅ DONE TODAY
   - Integrate into firebase-data.service.ts
   - Monitor for data loss events

3. **Add Write Guards** ⏳ TODO
   - Prevent writing empty arrays when data exists

4. **Automated Backups** ✅ ALREADY IN PLACE
   - Daily backups via GitHub Actions
   - Keep last 7 days

5. **Client-Side Audit Logs** ⏳ TODO
   - Log all writes to shared lists
   - Store in `/audit-logs/{userId}/{timestamp}`

## Investigation Next Steps

To find the exact source:

1. **Enable Data Loss Detector**:
   - Integrate into all list update operations
   - Monitor for 1 week

2. **Check Browser Console Logs**:
   - Look for "Bug 1 Fix" log messages
   - Check if articleIds is being populated from itemStates
   - Look for merge operation logs

3. **Add Detailed Logging**:
   ```typescript
   // Before every Firebase write
   this.logger.info('firebase-write', 'Writing list to Firebase', {
     listId,
     listName,
     articleIds: articleIds.length,
     itemStates: Object.keys(itemStates).length,
     isShared: sharedWith.length > 0,
     stackTrace: new Error().stack
   });
   ```

4. **Monitor Firebase Console**:
   - Check "Usage" tab for spike in writes
   - Look at document history (if available in free plan)

## Recommendations

### High Priority
1. ✅ Apply Bug 1 Fix everywhere (DONE)
2. ⏳ Restore affected lists from backup (USER ACTION REQUIRED)
3. ⏳ Integrate Data Loss Detector into firebase-data.service
4. ⏳ Add write guards to prevent empty writes

### Medium Priority
5. ⏳ Implement client-side audit logging
6. ⏳ Review and test merge logic under race conditions
7. ⏳ Add unit tests for merge logic edge cases

### Low Priority
8. ⏳ Consider upgrading to Firebase Blaze plan for audit logs
9. ⏳ Implement stricter Firestore security rules

## Timeline

- **Jan 17, 2026**: Previous data loss, lists recreated from backup
- **Jan 17-21, 2026**: Lists operated with Bug 1 Fix only in listeners, not initial load
- **Jan 21, 2026**: Article counts not displaying, investigation reveals data loss
- **Jan 21, 2026**: Implemented Bug 1 Fix in `getAllListsFromFirebase()`
- **Jan 21, 2026**: Created targeted restore script and data loss detector

## Conclusion

The most likely cause is a **race condition or merge logic issue** where empty state from one source overwrites valid data. The Bug 1 Fix gap in `getAllListsFromFirebase()` may have contributed but likely wasn't the direct cause.

The Data Loss Detector will help identify the exact source by:
1. Capturing stack traces when data loss occurs
2. Showing which operations are causing the loss
3. Providing statistics on patterns

**Immediate Action**: Restore the affected lists using the targeted restore script.

**Next Session**: Integrate the Data Loss Detector and monitor for any new occurrences.
