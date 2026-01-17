# Automated Firestore Backup System

## 🎯 Overview

This system provides **automatic, continuous backups** of all Firestore data, running on every push to the main branch via GitHub Actions.

### Why This Matters

After the data loss incident on January 16, 2026, we implemented this system to:
- ✅ **Prevent future data loss** - Always have a recent backup
- ✅ **Quick recovery** - Restore data in minutes, not hours
- ✅ **Audit trail** - Track changes over time via git history
- ✅ **No manual intervention** - Fully automated

---

## 🔄 How It Works

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   GitHub Actions Workflow Starts    │
│   (.github/workflows/firestore-     │
│    backup.yml)                       │
└────────┬────────────────────────────┘
         │
         ├─► Install Node.js & dependencies
         ├─► Setup Firebase credentials (from secret)
         ├─► Run backup script
         │   └─► Export all users
         │       └─► Export all lists
         │           └─► Export all articles
         │               └─► Save as backups/latest.json
         │
         ├─► Commit latest.json to git
         ├─► Push changes
         ├─► Upload as artifact (30 days)
         └─► Cleanup credentials
```

---

## 📁 Components

### 1. Backup Script
**File:** `scripts/full-backup-firestore.ts`

**What it does:**
- Connects to Firestore using service account
- Exports all data from `users-v2` collection
- Exports legacy `shared-shoplisl-user` data
- Converts Firestore Timestamps to ISO strings
- Saves as JSON file
- Cleans up old backups (keeps last 10 locally)

**Run manually:**
```bash
npm run backup:full              # Creates timestamped backup
npm run backup:full:latest       # Creates/updates latest.json
```

### 2. Restore Script
**File:** `scripts/restore-from-backup.ts`

**What it does:**
- Reads backup JSON file
- Shows preview of what will be restored (dry-run mode)
- Restores data to Firestore (with --execute flag)
- Uses merge mode to preserve existing data

**Run manually:**
```bash
npm run restore:backup -- backups/latest.json --dry-run
npm run restore:backup -- backups/latest.json --execute
```

### 3. GitHub Actions Workflow
**File:** `.github/workflows/firestore-backup.yml`

**Triggers:**
- Every push to `main` or `master` branch
- Manual trigger via Actions tab

**What it does:**
1. Checks out repository
2. Sets up Node.js
3. Installs dependencies
4. Creates Firebase credentials from GitHub Secret
5. Runs backup script
6. Commits `latest.json` (if changed)
7. Pushes to repository
8. Uploads backup as artifact
9. Cleans up credentials

**Commit message includes `[skip ci]`** to avoid infinite loops.

### 4. Backups Directory
**Location:** `backups/`

**Files:**
- `latest.json` - Most recent backup (tracked in git)
- `firestore-backup-YYYY-MM-DD-HHmmss.json` - Timestamped backups (local only)
- `README.md` - Documentation
- `.gitkeep` - Ensures directory exists

### 5. Git Configuration
**File:** `.gitignore`

```gitignore
# Keep only latest backup in git
backups/*
!backups/latest.json
!backups/README.md
!backups/.gitkeep

# Never commit credentials!
firebase-credentials.json
```

---

## ⚙️ Setup Instructions

### Step 1: Add Firebase Service Account to GitHub Secrets

1. **Download service account key:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Go to **Project Settings** → **Service Accounts**
   - Click **Generate New Private Key**
   - Save the JSON file

2. **Add to GitHub Secrets:**
   - Go to your repository on GitHub
   - **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: Paste the **entire** JSON content from step 1
   - Click **Add secret**

### Step 2: Verify Workflow Permissions

Make sure GitHub Actions can push commits:

1. Go to repository **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Check **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

### Step 3: Test the Workflow

Push a commit to main branch:

```bash
git add .
git commit -m "test: trigger backup workflow"
git push origin main
```

Then check:
1. Go to **Actions** tab in GitHub
2. You should see "Firestore Backup" workflow running
3. Wait for it to complete (usually 30-60 seconds)
4. Check if `backups/latest.json` was updated

---

## 📊 Backup Contents

Each backup is a JSON file containing:

```json
{
  "timestamp": "2026-01-17T15:30:00.000Z",
  "users": {
    "userId1": {
      "lists": [
        {
          "id": "listId1",
          "name": "Hofer",
          "ownerId": "userId1",
          "articleIds": ["article1", "article2"],
          "itemStates": {
            "article1": {
              "articleId": "article1",
              "isChecked": false,
              "amount": "2L"
            }
          },
          "createdAt": "2026-01-01T10:00:00.000Z",
          "updatedAt": "2026-01-17T14:00:00.000Z"
        }
      ],
      "articles": [
        {
          "id": "article1",
          "name": "Milk",
          "ownerId": "userId1",
          "createdAt": "2026-01-01T10:00:00.000Z",
          "updatedAt": "2026-01-01T10:00:00.000Z"
        }
      ]
    }
  },
  "stats": {
    "totalUsers": 5,
    "totalLists": 42,
    "totalArticles": 387
  }
}
```

**Everything is included:**
- All users, lists, and articles
- All metadata (timestamps, IDs, owners)
- Shared list information
- Article states (checked/unchecked, amounts)
- Legacy data from old location

---

## 🚨 Disaster Recovery Procedures

### Scenario 1: Recent Data Loss (Last Few Hours)

**Recovery time: ~2 minutes**

```bash
# 1. Pull latest backup from git
git pull origin main

# 2. Preview what will be restored
npm run restore:backup -- backups/latest.json --dry-run

# 3. Restore the data
npm run restore:backup -- backups/latest.json --execute
```

### Scenario 2: Data Loss from Yesterday

**Recovery time: ~5 minutes**

```bash
# 1. Go to GitHub Actions
# 2. Find the workflow run from yesterday
# 3. Download the backup artifact
# 4. Extract the JSON file

# 5. Restore from downloaded file
npm run restore:backup -- path/to/downloaded-backup.json --execute
```

### Scenario 3: Need Backup from Last Week

**Recovery time: ~10 minutes**

```bash
# 1. Find the commit from last week
git log --all --oneline backups/latest.json

# 2. Extract backup from that commit
git show <commit-hash>:backups/latest.json > backup-last-week.json

# 3. Restore from that backup
npm run restore:backup -- backup-last-week.json --execute
```

### Scenario 4: Partial Restore (Specific User Only)

```bash
# 1. Get latest backup
cp backups/latest.json temp-backup.json

# 2. Edit temp-backup.json
# Remove users you DON'T want to restore

# 3. Restore only selected users
npm run restore:backup -- temp-backup.json --execute
```

---

## 🔍 Monitoring and Verification

### Check Backup Status

**Via GitHub Actions:**
1. Go to repository **Actions** tab
2. Check "Firestore Backup" workflow runs
3. Green checkmark = successful backup
4. Red X = backup failed (check logs)

**Via Git:**
```bash
# Check when last backup was created
git log -1 backups/latest.json

# See backup size
ls -lh backups/latest.json

# View backup stats
cat backups/latest.json | jq '.stats'
```

### Verify Backup Integrity

```bash
# Check if JSON is valid
cat backups/latest.json | jq . > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"

# Check backup stats
cat backups/latest.json | jq '.stats'

# List all users in backup
cat backups/latest.json | jq '.users | keys'
```

---

## 🛡️ Safety Features

### 1. Multiple Backup Locations
- ✅ Git repository (latest.json)
- ✅ GitHub Actions artifacts (30 days)
- ✅ Git history (permanent)
- ✅ Local timestamped backups (last 10)

### 2. Automatic Cleanup
- Old timestamped backups deleted (keeps 10)
- GitHub Actions artifacts expire after 30 days
- Git only tracks one file (`latest.json`)

### 3. Restore Safety
- Dry-run mode by default
- Must explicitly use `--execute` flag
- Uses merge mode (doesn't delete existing data)
- Shows preview before restoration

### 4. No Infinite Loops
- Commits include `[skip ci]` flag
- Workflow doesn't trigger itself
- Credentials cleaned up after run

---

## 📈 Best Practices

### Daily Operations

✅ **Do:**
- Let GitHub Actions run automatically
- Check Actions tab occasionally for failures
- Keep `latest.json` in git (small file)
- Use restore with `--dry-run` first

❌ **Don't:**
- Commit `firebase-credentials.json` to git
- Disable the backup workflow
- Delete `backups/latest.json` from git
- Restore without dry-run preview

### Before Risky Operations

Always create a manual backup before:
- Running cleanup scripts
- Bulk data modifications
- Database migrations
- Testing new features

```bash
npm run backup:full  # Creates timestamped local backup
```

### After Data Loss

1. **Don't panic** - You have backups!
2. **Identify what was lost** - Which users? Which lists?
3. **Choose recovery method** - See disaster recovery above
4. **Dry-run first** - Always preview before restoring
5. **Verify after restore** - Check that data is correct

---

## 🔧 Troubleshooting

### Backup Workflow Fails

**Error: "firebase-credentials.json not found"**

→ Check that `FIREBASE_SERVICE_ACCOUNT` secret is set in GitHub

**Error: "Permission denied" when pushing**

→ Check workflow permissions in repository settings

**Error: "Failed to load articles for user..."**

→ Service account needs Firestore read permissions

### Restore Fails

**Error: "Backup file not found"**

→ Check file path (relative to project root)

**Error: "Permission denied" writing to Firestore**

→ Service account needs Firestore write permissions

**Error: "Invalid JSON"**

→ Backup file may be corrupted, try a different one

### Backup File Too Large

If `latest.json` becomes very large (>1MB):
- Consider monthly archives instead of daily
- Or compress the JSON (gzip)
- Or store in GitHub Releases instead

---

## 📚 Related Documentation

- `backups/README.md` - Backup directory documentation
- `FIREBASE_BACKUP_RECOVERY.md` - Manual recovery procedures
- `MIGRATION_GUIDE.md` - Migrating from old backups
- `.github/workflows/firestore-backup.yml` - Workflow configuration

---

## 🎉 Benefits

With this system in place:

✅ **Data loss incidents are now recoverable in minutes**
✅ **No manual backups needed** - fully automated
✅ **Complete history** - can restore from any point in time
✅ **Low overhead** - runs automatically on every deploy
✅ **Git-tracked** - backup changes are versioned
✅ **Multiple redundancies** - git, artifacts, local files

---

**System Status:** ✅ Active and Running
**Last Updated:** January 17, 2026
**Maintained By:** GitHub Actions
