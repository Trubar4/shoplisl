# Firestore Backup & Restore Scripts

**Purpose:** Safe backup and restore of Firestore data
**Location:** `/scripts`

---

## 📋 Overview

These scripts provide command-line tools to:
- ✅ Backup all Firestore data to JSON files
- ✅ Restore Firestore data from backups
- ✅ Migrate data between Firebase projects
- ✅ Create disaster recovery snapshots

---

## 🚀 Quick Start

### Prerequisites

1. **Install Firebase Admin SDK:**
   ```bash
   npm install --save-dev firebase-admin @types/node ts-node
   ```

2. **Set up Firebase credentials:**

   **Option A: Service Account (Recommended for production)**
   ```bash
   # Download service account key from Firebase Console
   # Project Settings → Service Accounts → Generate New Private Key

   # Save as: service-account-key.json (add to .gitignore!)

   # Set environment variable
   export GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"
   ```

   **Option B: Use Firebase CLI (For development)**
   ```bash
   firebase login
   # Authentication handled automatically
   ```

---

## 📦 Backup

### Basic Backup
```bash
# Backup current Firebase project
npx ts-node scripts/backup-firestore.ts
```

### Backup Specific Project
```bash
# Backup a specific Firebase project
npx ts-node scripts/backup-firestore.ts --project=shoplisl-dev
```

### Custom Output Directory
```bash
# Save to custom location
npx ts-node scripts/backup-firestore.ts --output=./my-backups
```

### Output Structure
```
backups/
└── 2025-11-23T14-30-00/
    ├── metadata.json
    ├── users_shared-shoplisl-user_articles.json
    └── users_shared-shoplisl-user_lists.json
```

### Metadata Format
```json
{
  "timestamp": "2025-11-23T14:30:00.000Z",
  "project": "shoplisl",
  "collections": [
    "users/shared-shoplisl-user/articles",
    "users/shared-shoplisl-user/lists"
  ],
  "totalDocuments": 312
}
```

---

## 🔄 Restore

### Dry Run (Preview Only)
```bash
# Check what would be restored (no writes to Firestore)
npx ts-node scripts/restore-firestore.ts --backup=backups/2025-11-23T14-30-00 --dry-run
```

### Interactive Restore
```bash
# Restore with confirmation prompt
npx ts-node scripts/restore-firestore.ts --backup=backups/2025-11-23T14-30-00
```

### Force Restore (No Confirmation)
```bash
# Skip confirmation (use with caution!)
npx ts-node scripts/restore-firestore.ts --backup=backups/2025-11-23T14-30-00 --force
```

### Restore to Different Project
```bash
# Restore to dev environment
npx ts-node scripts/restore-firestore.ts \
  --backup=backups/2025-11-23T14-30-00 \
  --project=shoplisl-dev
```

---

## 🔧 Common Use Cases

### 1. Daily Automated Backups

Create a cron job or GitHub Action:

```yaml
# .github/workflows/firestore-backup.yml
name: Daily Firestore Backup

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: Backup Firestore
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: npx ts-node scripts/backup-firestore.ts
      - name: Upload Backup
        uses: actions/upload-artifact@v3
        with:
          name: firestore-backup
          path: backups/
```

### 2. Pre-Deployment Backup

```bash
# Before deploying changes
npx ts-node scripts/backup-firestore.ts

# Deploy
npm run build
firebase deploy

# If something goes wrong, restore:
npx ts-node scripts/restore-firestore.ts --backup=backups/LATEST
```

### 3. Clone Production to Dev

```bash
# Step 1: Backup production
firebase use default
npx ts-node scripts/backup-firestore.ts --project=shoplisl

# Step 2: Restore to dev
firebase use dev
npx ts-node scripts/restore-firestore.ts \
  --backup=backups/LATEST \
  --project=shoplisl-dev \
  --force
```

### 4. Testing Migrations

```bash
# Backup before migration
npx ts-node scripts/backup-firestore.ts

# Run migration
npm run migrate:history

# If migration fails, restore
npx ts-node scripts/restore-firestore.ts --backup=backups/LATEST --force
```

---

## ⚠️ Important Notes

### Data Conversion

The scripts automatically handle:
- ✅ Firestore Timestamps → ISO strings (backup)
- ✅ ISO strings → Firestore Timestamps (restore)
- ✅ Nested objects and arrays
- ✅ Document references (as strings)

### Batch Limits

- Firestore allows 500 operations per batch
- Scripts automatically chunk large collections
- No manual intervention needed

### Existing Data

⚠️ **RESTORE OVERWRITES EXISTING DATA**

- Restore uses `set()` which replaces documents
- Existing documents with same ID are overwritten
- Documents not in backup remain unchanged
- Use `--dry-run` first to verify!

### Performance

- Backup: ~100 docs/sec
- Restore: ~500 docs/sec (batched)
- 300 documents ≈ 3 seconds to backup
- 300 documents ≈ 1 second to restore

---

## 🛠️ Troubleshooting

### Error: "Could not load the default credentials"

```bash
# Solution 1: Use service account
export GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"

# Solution 2: Login with Firebase CLI
firebase login
```

### Error: "Permission denied"

```bash
# Check Firebase project permissions
firebase projects:list

# Ensure you have "Editor" or "Owner" role
```

### Error: "Backup directory not found"

```bash
# Check path is correct
ls -la backups/

# Use absolute path
npx ts-node scripts/restore-firestore.ts --backup=/absolute/path/to/backup
```

### Error: "DEADLINE_EXCEEDED" during restore

```bash
# Firestore is rate-limited
# Wait a few minutes and try again

# Or restore in smaller batches (modify batchSize in script)
```

---

## 📊 Backup Strategy Recommendations

### Frequency
- **Production:** Daily automated backups
- **Development:** Before major changes
- **Pre-deploy:** Always backup before deployment

### Retention
- Keep last **7 days** of daily backups
- Keep last **4 weeks** of weekly backups
- Keep last **12 months** of monthly backups

### Storage
- **Local:** `backups/` directory (add to `.gitignore`)
- **Cloud:** Upload to Google Cloud Storage or S3
- **GitHub:** Use GitHub Actions artifacts (limited retention)

---

## 🔐 Security Considerations

### Service Account Keys

⚠️ **NEVER COMMIT SERVICE ACCOUNT KEYS TO GIT**

```bash
# Add to .gitignore
echo "service-account-key.json" >> .gitignore
echo "backups/" >> .gitignore
```

### Backup Encryption

For sensitive data, encrypt backups:

```bash
# Encrypt backup directory
tar -czf - backups/LATEST | gpg -c > backup-encrypted.tar.gz.gpg

# Decrypt
gpg -d backup-encrypted.tar.gz.gpg | tar -xzf -
```

### Access Control

- Limit who can run backups/restores
- Use separate service accounts for backup vs restore
- Monitor Firebase audit logs

---

## 📚 Additional Resources

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firestore Batch Operations](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

---

**Created:** 2025-11-23
**Last Updated:** 2025-11-23
