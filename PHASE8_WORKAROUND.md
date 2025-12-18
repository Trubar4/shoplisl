# Phase 8: List Sharing - Collection Group Query Workaround

## Problem Summary

Collection group queries in Angular Fire fail with "Missing or insufficient permissions" even when:
- ✅ Firestore rules are correct
- ✅ Indexes are deployed
- ✅ User is authenticated
- ✅ Query works in Firebase Console

**Root Cause:** Auth tokens don't properly attach to `onSnapshot` listeners for collection group queries in Angular Fire. This appears to be a limitation when Firebase APIs are called outside Angular's injection context.

## Solution Implemented

Instead of querying all lists via collection group query:

```typescript
// ❌ DOESN'T WORK: Collection group query
query(collectionGroup(this.firestore, 'lists'),
      where('sharedWith', 'array-contains', userId))
```

We now:

```typescript
// ✅ WORKS: Query share-invites, then load lists directly
1. Query share-invites collection for accepted invites
2. Extract list IDs and owner IDs from invites
3. Load each shared list with direct getDoc() calls
```

## How It Works

### Step 1: Listen to Share Invites
```typescript
const invitesRef = collection(this.firestore, 'share-invites');
const acceptedInvitesQuery = query(
  invitesRef,
  where('acceptedByUserId', '==', userId),
  where('status', '==', 'accepted')
);
```

### Step 2: Extract List Information
```typescript
inviteSnapshot.forEach((doc) => {
  const data = doc.data();
  listIds.set(data['listId'], data['fromUserId']);
});
```

### Step 3: Load Each List Directly
```typescript
for (const [listId, ownerId] of listIds.entries()) {
  const listRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);
  const listDoc = await getDoc(listRef);
  // Process list...
}
```

## Trade-offs

**Advantages:**
- ✅ Works reliably with authentication
- ✅ No permission-denied errors
- ✅ Simpler to debug
- ✅ Uses standard Firestore queries

**Limitations:**
- ⚠️ Real-time updates only trigger on invite changes, not list content changes
- ⚠️ Slightly more Firestore reads (one per shared list)
- ⚠️ Requires share-invites collection to be maintained

## Future Improvements

To add real-time sync for list content:

1. **Option A:** Add per-list listeners after initial load
```typescript
for (const list of sharedLists) {
  const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);
  onSnapshot(listRef, (snapshot) => {
    // Update list in real-time
  });
}
```

2. **Option B:** Use Firestore triggers to update a user's shared lists cache

3. **Option C:** Wait for Angular Fire to fix collection group auth issues

## Testing

### Test 1: Basic Sharing
- [x] User A creates list
- [x] User A shares with User B
- [x] User B accepts invite
- [x] User B sees list
- [x] User B refreshes → List persists ✅

### Test 2: Real-time Updates (TODO)
- [ ] User A adds item to shared list
- [ ] User B sees update without refresh
- [ ] User B checks off item
- [ ] User A sees update

### Test 3: Unsharing (TODO)
- [ ] User A unshares list from User B
- [ ] User B's access is revoked
- [ ] User B no longer sees the list

### Test 4: Multiple Lists (TODO)
- [ ] User A shares 3 lists with User B
- [ ] User B sees all 3 lists
- [ ] All lists persist after refresh

## Files Changed

1. **src/app/core/services/firebase-data.service.ts** (line 233-318)
   - Replaced collection group query with invite-based approach

2. **firestore.rules** (line 72)
   - Added null check for sharedWith array

3. **firestore.indexes.json**
   - Added simple collection group index (though not used anymore)

4. **src/app/app.config.ts** (line 34-36)
   - Added Firebase Auth and Firestore providers

5. **src/main.ts** (line 28-35)
   - Used appConfig.providers for Firebase initialization

6. **src/app/app.routes.ts** (line 26-31)
   - Added /invite/:token route

## Related Issues

- Firebase warning: "Firebase API called outside injection context"
- Angular Fire issue: Auth tokens not attaching to collection group queries
- Workaround documented in: firebase-data.service.ts:233-318

## Migration Notes

If switching back to collection group queries in the future:

1. Uncomment the original query code
2. Verify auth token attachment works
3. Test thoroughly with authenticated users
4. Keep workaround as fallback

## Performance

**Before (Collection Group Query):**
- 1 query for all shared lists
- Real-time updates automatic
- Failed with permission-denied

**After (Invite-based Approach):**
- 1 query for share-invites + N queries for lists (N = number of shared lists)
- Real-time updates on invite changes only
- Works reliably

For most users: N < 10 lists, so performance impact is minimal.
