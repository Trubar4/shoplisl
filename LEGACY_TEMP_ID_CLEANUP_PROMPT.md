# Legacy Temp Article ID Cleanup Script

**Context**: After implementing the temp article cleanup feature, we discovered legacy temp IDs in Firebase that were created before the fix. These need to be cleaned up manually.

## Problem

When users added articles while offline (before our fix), temporary IDs like `temp_1767598193035_zpks0kgri` were created. After syncing, the local app got real IDs, but Firebase lists still contain these old temp IDs in:
- `articleIds` arrays
- `itemStates` object keys

**Example from "Skifahren" list (ID: oY4HD6LzubC9PO9E0Vbi)**:
```
articleIds: [
  ...real IDs...,
  "temp_1767598193035_zpks0kgri",  // ❌ Legacy temp ID
  "temp_1767599444204_b4giove81",  // ❌ Legacy temp ID
  "temp_1767600047738_opqdodqbt"   // ❌ Legacy temp ID
]
```

## Task

Create a TypeScript script that:
1. Scans all lists in Firebase for temp IDs (IDs starting with `temp_`)
2. Removes temp IDs from both `articleIds` and `itemStates`
3. Logs what was cleaned
4. Runs safely with a dry-run mode first

## Requirements

### Script Location
Place in: `scripts/cleanup-legacy-temp-ids.ts`

### Features Needed

1. **Dry-run mode by default**
   - Show what would be cleaned without making changes
   - Require `--execute` flag to actually run

2. **Scan all user collections**
   - Query all documents in `users-v2/{userId}/lists`
   - For each user, check all their lists

3. **Identify temp IDs**
   - Check `articleIds` array for entries starting with `temp_`
   - Check `itemStates` object keys for entries starting with `temp_`

4. **Clean the data**
   - Remove temp IDs from `articleIds` array
   - Remove temp ID entries from `itemStates` object
   - Update `updatedAt` timestamp
   - Write back to Firebase

5. **Logging**
   ```
   📊 Scanning Firebase for legacy temp IDs...

   Found issues in:
   - User: HYqET9vr40eDju4nQCTnJTV0qJo2
     - List: "Skifahren" (oY4HD6LzubC9PO9E0Vbi)
       - articleIds: 3 temp IDs found
       - itemStates: 3 temp ID keys found
       - Temp IDs: temp_1767598193035_zpks0kgri, temp_1767599444204_b4giove81, temp_1767600047738_opqdodqbt

   📋 Summary:
   - Total users scanned: 5
   - Total lists scanned: 87
   - Lists with temp IDs: 1
   - Total temp IDs found: 3

   🔧 To execute cleanup, run: npm run cleanup:temp-ids -- --execute
   ```

6. **Safety checks**
   - Backup data before modification (optional: save to JSON file)
   - Verify user is authenticated
   - Confirm Firebase connection
   - Validate each update succeeded

### Command Usage

```bash
# Dry run (default) - just show what would be cleaned
npm run cleanup:temp-ids

# Actually execute the cleanup
npm run cleanup:temp-ids -- --execute

# With backup
npm run cleanup:temp-ids -- --execute --backup

# Specific user only
npm run cleanup:temp-ids -- --execute --user-id=HYqET9vr40eDju4nQCTnJTV0qJo2
```

### Add to package.json

```json
{
  "scripts": {
    "cleanup:temp-ids": "node --loader ts-node/esm scripts/cleanup-legacy-temp-ids.ts"
  }
}
```

## Technical Details

### Firebase Structure
```
users-v2/
  {userId}/
    lists/
      {listId}/
        articleIds: string[]          // May contain temp_ IDs
        itemStates: {
          [articleId: string]: {      // May have temp_ keys
            articleId: string,
            isChecked: boolean,
            // ...
          }
        }
        updatedAt: Timestamp
```

### Temp ID Pattern
```typescript
const isTempId = (id: string): boolean => {
  return id.startsWith('temp_');
};

// Format: temp_{timestamp}_{random}
// Example: temp_1767598193035_zpks0kgri
```

### Cleanup Logic
```typescript
// Remove from articleIds
const cleanedArticleIds = list.articleIds.filter(id => !isTempId(id));

// Remove from itemStates
const cleanedItemStates = Object.fromEntries(
  Object.entries(list.itemStates || {}).filter(([key]) => !isTempId(key))
);

// Only update if changes were made
if (cleanedArticleIds.length !== list.articleIds.length ||
    Object.keys(cleanedItemStates).length !== Object.keys(list.itemStates || {}).length) {
  await updateDoc(listRef, {
    articleIds: cleanedArticleIds,
    itemStates: cleanedItemStates,
    updatedAt: Timestamp.now()
  });
}
```

## Expected Behavior

**Before cleanup** (Firebase):
```json
{
  "articleIds": [
    "real_id_1",
    "temp_1767598193035_zpks0kgri",
    "real_id_2",
    "temp_1767599444204_b4giove81"
  ],
  "itemStates": {
    "real_id_1": { "isChecked": false },
    "temp_1767598193035_zpks0kgri": { "isChecked": true },
    "real_id_2": { "isChecked": false },
    "temp_1767599444204_b4giove81": { "isChecked": false }
  }
}
```

**After cleanup** (Firebase):
```json
{
  "articleIds": [
    "real_id_1",
    "real_id_2"
  ],
  "itemStates": {
    "real_id_1": { "isChecked": false },
    "real_id_2": { "isChecked": false }
  }
}
```

## Testing Plan

1. **Test with dry-run first**
   ```bash
   npm run cleanup:temp-ids
   ```
   - Verify it finds the known temp IDs in "Skifahren" list
   - Check output formatting is clear

2. **Backup before executing**
   ```bash
   npm run cleanup:temp-ids -- --execute --backup
   ```
   - Creates `temp-id-cleanup-backup-{timestamp}.json`

3. **Execute cleanup**
   ```bash
   npm run cleanup:temp-ids -- --execute
   ```
   - Verify temp IDs are removed from Firebase
   - Check that real articles remain
   - Confirm updatedAt timestamp is updated

4. **Verify in Firebase Console**
   - Navigate to: `users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/oY4HD6LzubC9PO9E0Vbi`
   - Confirm no temp_ IDs in articleIds
   - Confirm no temp_ keys in itemStates

## References

- **Temp ID format**: Defined in `src/app/core/services/articles-repository.service.ts:79`
- **List structure**: See `src/app/core/models/shopping-list.model.ts`
- **Firebase paths**: See `src/app/core/services/firebase-data.service.ts:2454-2467`
- **Similar script**: Look at `scripts/backup-firestore.ts` for Firebase query patterns

## Success Criteria

- ✅ Script runs without errors in dry-run mode
- ✅ Accurately identifies all temp IDs in Firebase
- ✅ Provides clear, detailed logging
- ✅ Has safety checks (dry-run by default, backup option)
- ✅ Successfully removes temp IDs when executed
- ✅ Preserves all real article data
- ✅ Can be run multiple times safely (idempotent)

## Notes

- This is a **one-time cleanup** for legacy data
- New temp IDs are now automatically cleaned by the feature we just implemented
- The script should be safe to run multiple times (won't break if temp IDs already removed)
- Consider adding this to documentation for future reference
