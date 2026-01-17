# Migration Guide: Restore from Old Backup

This guide explains how to restore the 6 affected shopping lists from the old backup location.

## Quick Summary

**What happened:** The cleanup script deleted articleIds from 6 shared lists on Jan 16, 2026.

**Solution:** Migrate data from old backup location (`users/shared-shoplisl-user/lists/`) to new location (`users-v2/{ownerId}/lists/`) with all articles marked as CHECKED.

**Affected Lists:**
- `FoIhdc4QqfgUx57JeRLD` (Hofer)
- `bwG4wE8gqjn78pRsOwic` (DM/Bipa)
- `bDJAexAC29O1oujEf3eq` (Messepark)
- `Krvv5jHvgKeRAZTR6uDH` (Birgit Urlaub Como)
- `CemqHIYJ868O89362x9V` (Sutterlüty)
- `62PhcxI5ivkgfhdlNbaR` (Lädele)

---

## Prerequisites

1. **Firebase Admin Credentials:**
   - Download service account key from Firebase Console
   - Save as `firebase-credentials.json` in project root
   - Make sure it has Firestore read/write permissions

2. **Node.js Dependencies:**
   ```bash
   npm install
   ```

---

## Step-by-Step Migration

### Step 1: Preview Migration (Dry Run)

First, run in dry-run mode to see what will happen:

```bash
npm run migrate:old-backup
```

This will:
- ✅ Read articleIds from old location
- ✅ Show how many articles will be restored
- ✅ Preview the changes
- ❌ **NOT make any changes** (safe to run)

**Expected Output:**
```
📋 Processing: Hofer
   ✅ Found 8 articles in old backup
   📊 Current state: 0 articles, 0 states
   ✅ Migration data ready:
      + Articles to add: 8
      ✓ All 8 articles marked as CHECKED
      📊 Total: 0 → 8 articles
```

### Step 2: Execute Migration

If the dry run looks good, execute the migration:

```bash
npm run migrate:old-backup:execute
```

This will:
- ✅ Create backups before making changes
- ✅ Restore articleIds from old location
- ✅ Mark all articles as CHECKED (isChecked: true)
- ✅ Update Firebase

**Why mark as CHECKED?**
- Articles marked as checked appear as "done" in the app
- They won't show up as active items to buy
- Users can see what was on the list and uncheck what they need

---

## Troubleshooting

### Error: `host.fileExists is not a function`

This is a ts-node compatibility issue on Windows. Fix options:

**Option 1: Use npx tsx instead**
```bash
npx tsx scripts/migrate-from-old-backup.ts --dry-run
npx tsx scripts/migrate-from-old-backup.ts --execute
```

**Option 2: Compile TypeScript first**
```bash
npx tsc scripts/migrate-from-old-backup.ts --lib es2020 --module commonjs --esModuleInterop
node scripts/migrate-from-old-backup.js --dry-run
node scripts/migrate-from-old-backup.js --execute
```

**Option 3: Update ts-node**
```bash
npm install -D ts-node@latest
npm run migrate:old-backup
```

### Error: `firebase-credentials.json not found`

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save the downloaded file as `firebase-credentials.json` in project root

### Error: `Old list not found`

This means the list doesn't exist in the old backup location. Possible causes:
- List was created after the migration to users-v2
- List ID is incorrect
- Old data was already deleted

Check Firebase Console:
```
Firestore → users → shared-shoplisl-user → lists → {listId}
```

### Error: `New list not found`

This means the list doesn't exist in the new location. The list might have been deleted.

Check Firebase Console:
```
Firestore → users-v2 → HYqET9vr40eDju4nQCTnJTV0qJo2 → lists → {listId}
```

---

## Verification

After migration, verify the results:

1. **Check Firebase Console:**
   - Go to affected list documents
   - Verify `articleIds` array is populated
   - Verify `itemStates` has entries with `isChecked: true`

2. **Check in the App:**
   - Open the affected list
   - All restored articles should show as checked ✓
   - Uncheck items you actually need to buy

3. **Review Backups:**
   - Migration creates backups in project root
   - Files named: `backup-{listId}-{timestamp}.json`
   - Keep these backups for at least a week

---

## What the Migration Does

### Before:
```json
{
  "articleIds": [],
  "itemStates": {}
}
```

### After:
```json
{
  "articleIds": ["abc123", "def456", "ghi789"],
  "itemStates": {
    "abc123": {
      "articleId": "abc123",
      "isChecked": true,
      "checkedAt": "2026-01-17T..."
    },
    "def456": {
      "articleId": "def456",
      "isChecked": true,
      "checkedAt": "2026-01-17T..."
    },
    "ghi789": {
      "articleId": "ghi789",
      "isChecked": true,
      "checkedAt": "2026-01-17T..."
    }
  }
}
```

---

## Safety Features

✅ **Dry-run by default** - Must explicitly use `--execute`
✅ **Creates backups** - Saves original state before changes
✅ **Preserves existing data** - Adds to current articleIds, doesn't replace
✅ **All checked** - Won't disrupt active shopping lists

---

## Questions?

If you have any issues or questions, refer to:
- `FIREBASE_BACKUP_RECOVERY.md` - Alternative recovery methods
- Firebase Console for manual verification
- Backup files created during migration

---

## Next Steps After Migration

1. ✅ Verify all 6 lists are restored
2. ✅ Test in the app - make sure lists show articles
3. ✅ Users can uncheck items they need to buy again
4. ✅ The bug is fixed so this won't happen again

The fix in `data-migration.service.ts` ensures cleanup will abort if any user's articles fail to load, preventing future data loss.
