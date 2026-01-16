# Legacy Temp ID Cleanup Script

## Overview

This script scans all Firebase lists for legacy temporary article IDs (created before the temp article cleanup feature was implemented) and removes them from both `articleIds` arrays and `itemStates` objects.

## Problem Background

Before the temp article cleanup feature was implemented, when users added articles while offline, temporary IDs like `temp_1767598193035_zpks0kgri` were created. After syncing online, the local app received real Firebase IDs, but the Firebase lists still contained these old temp IDs in:
- `articleIds` arrays
- `itemStates` object keys

This script performs a one-time cleanup to remove these legacy temp IDs from Firebase.

## Usage

### Dry-run (Default)
Shows what would be cleaned without making any changes:
```bash
npm run cleanup:temp-ids
```

### Execute Cleanup
Actually performs the cleanup:
```bash
npm run cleanup:temp-ids -- --execute
```

### Execute with Backup
Creates a JSON backup file before cleanup:
```bash
npm run cleanup:temp-ids -- --execute --backup
```

### Target Specific User
Only process lists for a specific user:
```bash
npm run cleanup:temp-ids -- --execute --user-id=HYqET9vr40eDju4nQCTnJTV0qJo2
```

## Options

- `--execute` - Actually perform the cleanup (default: dry-run only)
- `--backup` - Create backup JSON file before cleanup
- `--user-id=<userId>` - Only process lists for specific user

## Output Example

### Dry-run Output
```
🧹 Legacy Temp ID Cleanup Script

Mode: 👁️  DRY-RUN

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
💾 To execute with backup, run: npm run cleanup:temp-ids -- --execute --backup
```

### Execute Output
```
🧹 Legacy Temp ID Cleanup Script

Mode: 🔧 EXECUTE
Backup: ✅ Enabled

📊 Scanning Firebase for legacy temp IDs...

[... scan results ...]

💾 Creating backup...
   ✅ Backup saved to: /path/to/temp-id-cleanup-backup-2026-01-16T10-30-00.json
   📦 Lists backed up: 1

🔧 Executing cleanup...

   Cleaning list: "Skifahren" (oY4HD6LzubC9PO9E0Vbi)
   - User: HYqET9vr40eDju4nQCTnJTV0qJo2
   - Removing 3 temp IDs
   ✅ Cleaned successfully

✅ Cleanup completed!
   - Successfully cleaned: 1 lists
```

## What It Does

1. **Scans all users** in the `users-v2` collection
2. **For each user**, scans all lists in `users-v2/{userId}/lists`
3. **Identifies temp IDs** - any ID starting with `temp_`
4. **In dry-run mode**, displays what would be cleaned
5. **In execute mode**:
   - Optionally creates a backup JSON file
   - Removes temp IDs from `articleIds` arrays
   - Removes temp ID keys from `itemStates` objects
   - Updates the `updatedAt` timestamp
   - Writes back to Firebase

## Temp ID Format

Temp IDs follow this pattern:
```
temp_{timestamp}_{random}
```

Example: `temp_1767598193035_zpks0kgri`

This pattern is defined in `src/app/core/services/articles-repository.service.ts:89`.

## Safety Features

1. **Dry-run by default** - Must explicitly use `--execute` to make changes
2. **3-second warning** - After starting execute mode, waits 3 seconds before making changes
3. **Backup option** - Can create JSON backup of all affected lists
4. **Idempotent** - Safe to run multiple times (won't break if temp IDs already removed)
5. **Error handling** - Catches and logs errors, continues with remaining lists
6. **Detailed logging** - Shows exactly what's being changed

## Firebase Authentication

The script supports two authentication methods:

### Production (with Service Account)
If `serviceAccountKey.json` exists in the project root:
```bash
# Automatically uses service account
npm run cleanup:temp-ids -- --execute
```

### Development (Application Default Credentials)
If no service account file:
```bash
# Set up Application Default Credentials first
gcloud auth application-default login

# Then run the script
npm run cleanup:temp-ids -- --execute
```

## Backup File Format

When using `--backup`, the script creates a JSON file with:
```json
{
  "timestamp": "2026-01-16T10:30:00.000Z",
  "scanResult": {
    "totalUsers": 5,
    "totalLists": 87,
    "listsWithTempIds": 1,
    "totalTempIds": 3,
    "issues": [...]
  },
  "listData": [
    {
      "userId": "HYqET9vr40eDju4nQCTnJTV0qJo2",
      "listId": "oY4HD6LzubC9PO9E0Vbi",
      "listName": "Skifahren",
      "articleIds": ["real_id_1", "temp_...", "real_id_2"],
      "itemStates": {...}
    }
  ]
}
```

## Exit Codes

- `0` - Success (dry-run completed or cleanup successful)
- `1` - Error (Firebase initialization failed, cleanup failed)

## Related Files

- Script: `scripts/cleanup-legacy-temp-ids.ts`
- Temp ID format: `src/app/core/services/articles-repository.service.ts:89`
- List structure: `src/app/core/models/index.ts`
- Firebase paths: `src/app/core/services/firebase-data.service.ts`

## Verification

After running the cleanup, verify in Firebase Console:

1. Navigate to: `users-v2/{userId}/lists/{listId}`
2. Check `articleIds` array - should have no `temp_` IDs
3. Check `itemStates` object - should have no `temp_` keys
4. Check `updatedAt` timestamp - should be recent

## Notes

- This is a **one-time cleanup** for legacy data
- New temp IDs are automatically cleaned by the feature implemented in the main app
- Safe to run multiple times (won't error if no temp IDs exist)
- Does not affect real article data
- Updates `updatedAt` timestamp when making changes
