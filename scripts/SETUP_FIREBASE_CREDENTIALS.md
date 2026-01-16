# Firebase Credentials Setup Guide

This guide helps you set up Firebase credentials to run scripts like `cleanup-legacy-temp-ids.ts`.

## Quick Start (Recommended)

### Option 1: Service Account Key File

**Best for:** Scripts, automation, CI/CD

1. **Download the key file:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Click ⚙️ → **Project settings** → **Service accounts** tab
   - Click **Generate new private key** → **Generate key**

2. **Save the file:**
   ```bash
   # Save as serviceAccountKey.json in project root
   shoplisl/
   ├── serviceAccountKey.json  ← Place here
   ├── package.json
   └── ...
   ```

3. **Run your script:**
   ```bash
   npm run cleanup:temp-ids
   ```

**Security Note:** Never commit `serviceAccountKey.json` to git! It's already in `.gitignore`.

---

### Option 2: Environment Variable

**Best for:** Quick testing without downloading keys

1. **Find your project ID:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Project ID is shown in project settings

2. **Set the environment variable and run:**

   **Windows PowerShell:**
   ```powershell
   $env:FIREBASE_PROJECT_ID = "your-project-id"
   npm run cleanup:temp-ids
   ```

   **Windows CMD:**
   ```cmd
   set FIREBASE_PROJECT_ID=your-project-id
   npm run cleanup:temp-ids
   ```

   **Linux/Mac:**
   ```bash
   export FIREBASE_PROJECT_ID=your-project-id
   npm run cleanup:temp-ids
   ```

   **Or combine in one line (PowerShell):**
   ```powershell
   $env:FIREBASE_PROJECT_ID = "your-project-id"; npm run cleanup:temp-ids
   ```

---

### Option 3: Google Cloud CLI (gcloud)

**Best for:** Developers already using gcloud

1. **Install Google Cloud SDK:**
   - Download from: https://cloud.google.com/sdk/docs/install

2. **Authenticate:**
   ```bash
   # Login to your Google account
   gcloud auth application-default login

   # Set your project
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Run your script:**
   ```bash
   npm run cleanup:temp-ids
   ```

---

## Troubleshooting

### Error: "Unable to detect a Project Id"

**Solution:** Use one of the three methods above. The script now provides helpful error messages.

### Error: "Failed to initialize with service account"

**Check:**
- Is `serviceAccountKey.json` in the project root?
- Is the JSON file valid?
- Does the service account have the correct permissions?

### Error: "Permission denied"

**Fix:** Ensure your service account or user has these Firebase permissions:
- Cloud Datastore User (for reading/writing Firestore)
- Or custom role with `datastore.entities.*` permissions

---

## Finding Your Project ID

### Method 1: Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click ⚙️ → **Project settings**
4. Project ID is shown at the top

### Method 2: Check existing files
Your project ID might be in:
- `.firebaserc` file (if using Firebase hosting)
- `firebase.json`
- `environment.ts` or `environment.prod.ts`

### Method 3: Firebase CLI
```bash
firebase projects:list
```

---

## Which Method Should I Use?

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **Service Account** | Production, CI/CD, automation | Most reliable, works anywhere | Need to manage key file securely |
| **Environment Variable** | Quick testing, one-time runs | Fast setup, no files needed | Must set variable each time |
| **gcloud CLI** | Development, if already using GCP | Uses your own credentials | Requires gcloud installation |

**Recommendation:** Use **Service Account** for running the cleanup script, as it's a one-time administrative task.

---

## Security Best Practices

1. **Never commit service account keys** to version control
2. **Rotate keys regularly** (every 90 days recommended)
3. **Use least privilege** - only grant necessary permissions
4. **Delete old keys** from Firebase Console after rotation
5. **Store keys securely** - use secret managers in production

---

## Example: Running the Cleanup Script

Once credentials are set up:

```bash
# 1. Dry-run first (see what would be cleaned)
npm run cleanup:temp-ids

# 2. Review the output carefully

# 3. Execute with backup
npm run cleanup:temp-ids -- --execute --backup

# 4. Verify in Firebase Console
```

---

## Need Help?

- **Firebase Auth Docs:** https://firebase.google.com/docs/admin/setup
- **Service Account Guide:** https://cloud.google.com/iam/docs/service-accounts
- **gcloud CLI Docs:** https://cloud.google.com/sdk/docs
