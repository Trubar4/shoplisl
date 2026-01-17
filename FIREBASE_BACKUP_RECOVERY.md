# Firebase Backup Recovery Guide

## Data Loss Incident - January 17, 2026

### Affected Lists
All owned by user: `HYqET9vr40eDju4nQCTnJTV0qJo2`

1. `bwG4wE8gqjn78pRsOwic` (DM/Bipa)
2. `bDJAexAC29O1oujEf3eq` (Messepark)
3. `Krvv5jHvgKeRAZTR6uDH` (Birgit Urlaub Como)
4. `FoIhdc4QqfgUx57JeRLD` (Hofer) - ~8 articles
5. `CemqHIYJ868O89362x9V` (Sutterlüty)
6. `62PhcxI5ivkgfhdlNbaR` (Lädele)

### Data Loss Timeline
- **Date of Loss:** January 16, 2026
- **Cause:** Bug in `quickCleanupOrphanedReferences()` that silently failed to load articles from collaborators, treating all their articles as "orphaned" and removing them

### Recovery Time Target
- **Restore Point:** January 15, 2026 23:59 (before data loss)

---

## Option 1: Firebase Point-in-Time Recovery (RECOMMENDED)

Firebase Firestore supports Point-in-Time Recovery (PITR) for restoring data to a specific timestamp.

### Step 1: Access Firebase Console
1. Go to https://console.firebase.google.com
2. Select your project (shoplisl)
3. Navigate to **Firestore Database**

### Step 2: Check if Point-in-Time Recovery is Available
1. Click on the **"︙" menu** (three dots) in Firestore
2. Look for **"Import/Export"** or **"Point-in-Time Recovery"**
3. If available, note the retention period (usually 7 days for free tier, longer for paid)

### Step 3: Restore Specific Documents

If PITR is available, you can restore specific documents:

```bash
# Using gcloud CLI to export data from Jan 15, 2026
gcloud firestore export gs://[YOUR_BUCKET_NAME]/pitr-recovery-jan15 \
  --async \
  --collection-ids=lists \
  --restore-timestamp=2026-01-15T23:59:59Z

# Then import only the affected lists
gcloud firestore import gs://[YOUR_BUCKET_NAME]/pitr-recovery-jan15 \
  --async \
  --collection-ids=lists
```

### Step 4: Manual Document Recovery

Alternatively, use Firebase Console to manually restore:

1. Go to **Firestore Database** → **Data**
2. Navigate to:
   ```
   users-v2/{HYqET9vr40eDju4nQCTnJTV0qJo2}/lists/{listId}
   ```
3. For each affected list, view the **Document history** (if available)
4. Select the version from **January 15, 2026**
5. Copy the `articleIds` and `itemStates` fields
6. Restore them to the current document

### Affected List Paths

```
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/bwG4wE8gqjn78pRsOwic
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/bDJAexAC29O1oujEf3eq
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/Krvv5jHvgKeRAZTR6uDH
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/FoIhdc4QqfgUx57JeRLD
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/CemqHIYJ868O89362x9V
users-v2/HYqET9vr40eDju4nQCTnJTV0qJo2/lists/62PhcxI5ivkgfhdlNbaR
```

---

## Option 2: Manual Recovery Using Known Data

If backups are not available, we can manually reconstruct using:
1. User's memory of what was on the lists
2. Browser cache (if available)
3. Export data from Firebase Admin SDK

### Step 1: Inspect Current State

Use the inspection script to see what's currently in Firebase:

```bash
npm run inspect-lists
```

### Step 2: Gather Article Data

For each list, collect:
- Article names
- Whether they were checked/unchecked
- Amounts (if any)

### Step 3: Run Recovery Script

Use the recovery script to restore articleIds and itemStates:

```bash
npm run recover-lists -- --list-id=FoIhdc4QqfgUx57JeRLD --execute
```

---

## Option 3: Browser DevTools Local Storage Recovery

If users had the app open recently, their browser might have cached data:

### Step 1: Access Browser Storage
1. Open Chrome DevTools (F12)
2. Go to **Application** → **IndexedDB** or **Local Storage**
3. Look for Firebase cache or offline persistence data

### Step 2: Export Cached Data
1. Look for keys containing the affected list IDs
2. Copy the data (it will be in JSON format)
3. Send to recovery script

---

## Prevention: Fixing the Bug

**File:** `src/app/core/services/data-migration.service.ts:377-384`

**Current Code (BUGGY):**
```typescript
for (const userId of allUserIds) {
  try {
    const userArticles = await this.firebaseData.getArticlesForUser(userId);
    userArticles.forEach(article => validArticleIds.add(article.id));
  } catch (error: any) {
    this.logger.error('data', `Failed to load articles for user ${userId}: ${error.message}`);
    // ❌ Continues even if loading failed - causes data loss!
  }
}
```

**Fixed Code:**
```typescript
for (const userId of allUserIds) {
  try {
    const userArticles = await this.firebaseData.getArticlesForUser(userId);
    userArticles.forEach(article => validArticleIds.add(article.id));
  } catch (error: any) {
    const errorMsg = `Failed to load articles for user ${userId}: ${error.message}`;
    this.logger.error('data', errorMsg);

    // ❌ ABORT cleanup - don't risk data loss
    throw new Error(`Cannot safely cleanup - ${errorMsg}`);
  }
}
```

**Why This Fix Works:**
- If loading articles fails for ANY user, the entire cleanup aborts
- No data loss can occur
- User sees error and can investigate permissions/network issues
- Cleanup only runs when ALL data is successfully loaded

---

## Next Steps

1. ✅ Choose recovery option (PITR recommended)
2. ⏳ Execute recovery for all 6 lists
3. ⏳ Test that recovered data is correct
4. ⏳ Apply the bug fix to prevent future occurrences
5. ⏳ Add monitoring to detect failed article loads

---

## Questions?

Contact: Claude Code on branch `claude/fix-shoplist-data-loss-It5bA`
