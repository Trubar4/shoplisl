# Firestore Backups

This directory contains automated backups of all Firestore data.

## 🔄 Automatic Backups

**Automated via GitHub Actions:**
- Runs on every push to `main` or `master` branch
- Creates a complete backup of all users, lists, and articles
- Commits `latest.json` to the repository
- Also uploads backup as a GitHub Actions artifact (30 day retention)

**Workflow:** `.github/workflows/firestore-backup.yml`

## 📁 Files in This Directory

### `latest.json` (tracked in git)
- The most recent automated backup
- Updated by GitHub Actions on every build
- Safe to commit to git (only one file, reasonable size)
- Use this for quick disaster recovery

### `firestore-backup-YYYY-MM-DD-HHmmss.json` (ignored by git)
- Timestamped backups created locally
- Not committed to git (to avoid bloating the repository)
- Automatically cleaned up (keeps last 10)
- Generated when you run `npm run backup:full`

## 🚀 Usage

### Create a Manual Backup

```bash
# Create timestamped backup (kept locally)
npm run backup:full

# Create/update latest.json
npm run backup:full:latest
```

**Alternative (if ts-node fails):**
```bash
npx tsx scripts/full-backup-firestore.ts
npx tsx scripts/full-backup-firestore.ts --latest
```

### Restore from Backup

```bash
# Preview what will be restored (dry run)
npm run restore:backup -- backups/latest.json --dry-run

# Actually restore the data
npm run restore:backup -- backups/latest.json --execute

# Restore from specific timestamped backup
npm run restore:backup -- backups/firestore-backup-2026-01-17-143022.json --execute
```

**Alternative (if ts-node fails):**
```bash
npx tsx scripts/restore-from-backup.ts backups/latest.json --dry-run
npx tsx scripts/restore-from-backup.ts backups/latest.json --execute
```

## 📊 Backup Contents

Each backup contains:

```json
{
  "timestamp": "2026-01-17T14:30:22.123Z",
  "users": {
    "HYqET9vr40eDju4nQCTnJTV0qJo2": {
      "lists": [...],
      "articles": [...]
    },
    "shared-shoplisl-user": {
      "lists": [...],
      "articles": []
    }
  },
  "stats": {
    "totalUsers": 5,
    "totalLists": 42,
    "totalArticles": 387
  }
}
```

### Data Included:
- ✅ All users from `users-v2` collection
- ✅ All lists for each user (with `articleIds`, `itemStates`, etc.)
- ✅ All articles for each user
- ✅ Legacy data from `shared-shoplisl-user` (if exists)
- ✅ All metadata (timestamps, owners, sharing info)

### Data Format:
- Firestore Timestamps converted to ISO 8601 strings
- All document IDs preserved
- Ready for direct restore to Firestore

## 🛡️ Safety Features

### Automatic Cleanup
- Local timestamped backups: Keeps last 10 only
- Git-tracked backups: Only `latest.json` committed
- GitHub Actions artifacts: 30-day retention

### Restore Safety
- **Dry-run by default:** Must explicitly use `--execute`
- **Merge mode:** Uses `set({ merge: true })` to preserve existing data
- **Preview mode:** Shows what will be restored before execution

## ⚙️ GitHub Actions Setup

### Required Secret

Add `FIREBASE_SERVICE_ACCOUNT` to GitHub repository secrets:

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: Paste entire contents of `firebase-credentials.json`

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "...",
  "client_id": "...",
  ...
}
```

### Workflow Behavior

The backup workflow:
1. ✅ Runs on every push to main/master
2. ✅ Installs dependencies
3. ✅ Sets up Firebase credentials from secret
4. ✅ Creates `backups/latest.json`
5. ✅ Commits changes (if any)
6. ✅ Pushes to repository
7. ✅ Uploads backup as artifact
8. ✅ Cleans up credentials

**Note:** Commits include `[skip ci]` to avoid infinite loops.

## 🔍 Viewing Backups

### In Git History
```bash
# See when latest.json was last updated
git log -p backups/latest.json

# Show contents of latest backup
cat backups/latest.json | jq .
```

### In GitHub Actions
1. Go to repository **Actions** tab
2. Click on a workflow run
3. Download backup artifact (30-day retention)

## 📝 Best Practices

### When to Use Backups

✅ **Use automated backups for:**
- Disaster recovery
- Rolling back after bad deployments
- Investigating data loss incidents
- Auditing changes over time

✅ **Create manual backup before:**
- Running cleanup scripts
- Bulk data modifications
- Database migrations
- Testing new features

### Restoration Scenarios

**Scenario 1: Quick recovery (last few hours)**
```bash
npm run restore:backup -- backups/latest.json --execute
```

**Scenario 2: Restore from specific time**
1. Find the backup in GitHub Actions artifacts
2. Download it
3. Run restore with that file

**Scenario 3: Partial restore**
- Edit the JSON file to include only specific users
- Run restore with modified file

## 🚨 Disaster Recovery

If you lose all data:

1. **Check latest.json in git:**
   ```bash
   npm run restore:backup -- backups/latest.json --execute
   ```

2. **If latest.json is outdated, check GitHub Actions artifacts:**
   - Go to Actions tab
   - Find recent workflow run
   - Download backup artifact
   - Restore from downloaded file

3. **If all else fails, check git history:**
   ```bash
   git log --all --full-history backups/latest.json
   git show <commit-hash>:backups/latest.json > old-backup.json
   npm run restore:backup -- old-backup.json --execute
   ```

## 📚 Related Documentation

- `FIREBASE_BACKUP_RECOVERY.md` - Manual recovery procedures
- `MIGRATION_GUIDE.md` - Migrating from old backup location
- `.github/workflows/firestore-backup.yml` - Backup workflow configuration

## ❓ Troubleshooting

### Backup fails in GitHub Actions

**Check:**
1. `FIREBASE_SERVICE_ACCOUNT` secret is set correctly
2. Service account has Firestore read permissions
3. Workflow has permission to push commits

### Backup file is too large

Current strategy keeps only `latest.json` in git. If it becomes too large:
- Consider compressing the JSON
- Or store backups in GitHub Releases instead
- Or use external storage (S3, GCS)

### Restore fails with permission errors

Make sure:
1. `firebase-credentials.json` has write permissions
2. Service account has `Cloud Datastore User` role
3. Firestore is in correct project

---

**Last Updated:** January 17, 2026
**Maintained By:** Automated backup system
