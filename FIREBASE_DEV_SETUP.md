# Firebase Development Environment Setup

**Purpose:** Create a separate Firebase project for safe development and testing
**Estimated Time:** 30 minutes
**Skill Level:** Intermediate

---

## 📋 Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Google account with Firebase access
- Firebase project admin rights (for production project)

---

## 🎯 Step-by-Step Setup

### Step 1: Create New Firebase Project

1. **Go to Firebase Console:**
   ```
   https://console.firebase.google.com/
   ```

2. **Click "Add Project"**

3. **Project Details:**
   - **Project Name:** `shoplisl-dev`
   - **Project ID:** `shoplisl-dev` (will be auto-suffixed with random characters)
   - **Enable Google Analytics:** No (optional for dev)

4. **Click "Create Project"** and wait for provisioning (~30 seconds)

---

### Step 2: Enable Required Services

1. **Enable Firestore Database:**
   - Navigate to: `Build → Firestore Database`
   - Click: "Create database"
   - **Location:** `europe-west3` (Frankfurt) or your preferred location
   - **Security rules:** Start in **production mode** (we'll update rules later)
   - Click: "Enable"

2. **Enable Firebase Hosting:**
   - Navigate to: `Build → Hosting`
   - Click: "Get started"
   - Follow the wizard (we'll configure via CLI later)

3. **Enable Authentication (for future):**
   - Navigate to: `Build → Authentication`
   - Click: "Get started"
   - Enable **Google** sign-in provider (for future multi-user feature)
   - Leave the rest for later

---

### Step 3: Configure Firebase CLI for Dev Project

1. **Login to Firebase (if not already):**
   ```bash
   firebase login
   ```

2. **Add Dev Project Alias:**
   ```bash
   cd /home/user/shoplisl
   firebase use --add
   ```

   - Select: `shoplisl-dev` (your new dev project)
   - **Alias:** `dev`

3. **Verify Aliases:**
   ```bash
   firebase use
   ```

   Expected output:
   ```
   Active project: shoplisl (default)

   Available projects:
   * shoplisl (default)
   * shoplisl-dev (dev)
   ```

4. **Switch to Dev Project:**
   ```bash
   firebase use dev
   ```

---

### Step 4: Deploy Initial Configuration

1. **Deploy Firestore Rules and Indexes:**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

2. **Verify Rules Deployed:**
   - Go to Firebase Console → Firestore Database → Rules
   - Check that rules are deployed

---

### Step 5: Copy Production Data (Optional)

⚠️ **IMPORTANT:** Only do this if you want dev environment to have a copy of production data

1. **Export Production Data:**
   ```bash
   # Switch to production
   firebase use default

   # Export data
   npm run backup:firestore
   ```

   (See BACKUP_SCRIPTS.md for backup script details)

2. **Import to Dev:**
   ```bash
   # Switch to dev
   firebase use dev

   # Import data
   npm run restore:firestore
   ```

---

### Step 6: Configure Local Development

1. **Update `environment.development.ts`:**
   ```typescript
   // src/environments/environment.development.ts
   export const environment = {
     production: false,
     useEmulator: false,  // Set to true for emulator
     firebase: {
       projectId: 'shoplisl-dev',
       apiKey: 'YOUR_DEV_API_KEY',          // Get from Firebase Console
       authDomain: 'shoplisl-dev.firebaseapp.com',
       storageBucket: 'shoplisl-dev.appspot.com',
       messagingSenderId: 'YOUR_DEV_SENDER_ID',
       appId: 'YOUR_DEV_APP_ID'
     }
   };
   ```

2. **Get Firebase Config from Console:**
   - Firebase Console → Project Settings → General
   - Scroll to "Your apps" → Web app
   - Copy the config values

3. **Add Dev Environment to Angular:**
   ```json
   // angular.json
   {
     "projects": {
       "shoplisl-app": {
         "architect": {
           "build": {
             "configurations": {
               "development": {
                 "fileReplacements": [
                   {
                     "replace": "src/environments/environment.ts",
                     "with": "src/environments/environment.development.ts"
                   }
                 ]
               }
             }
           }
         }
       }
     }
   }
   ```

4. **Serve with Dev Environment:**
   ```bash
   ng serve --configuration development
   ```

---

### Step 7: Set Up Firebase Emulator Suite (Recommended)

The Firebase Emulator Suite allows you to develop locally without touching any Firebase project.

1. **Initialize Emulators:**
   ```bash
   firebase init emulators
   ```

   Select:
   - ✅ Firestore
   - ✅ Authentication (for future)
   - ❌ Functions (not needed yet)
   - ❌ Hosting (not needed for emulator)

   Ports (defaults are fine):
   - Firestore: `8080`
   - Auth: `9099`
   - Emulator UI: `4000`

2. **Update `firebase.json`:**
   ```json
   {
     "firestore": {
       "rules": "firestore.rules",
       "indexes": "firestore.indexes.json"
     },
     "emulators": {
       "firestore": {
         "port": 8080
       },
       "auth": {
         "port": 9099
       },
       "ui": {
         "enabled": true,
         "port": 4000
       }
     }
   }
   ```

3. **Create Emulator Environment:**
   ```typescript
   // src/environments/environment.emulator.ts
   export const environment = {
     production: false,
     useEmulator: true,
     firebase: {
       projectId: 'demo-shoplisl',  // Demo project for emulator
       apiKey: 'demo-key',
       authDomain: 'localhost',
       storageBucket: '',
       messagingSenderId: '',
       appId: ''
     }
   };
   ```

4. **Update `app.config.ts` for Emulator:**
   ```typescript
   // src/app/app.config.ts
   import { environment } from '../environments/environment';
   import { getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';

   export const appConfig: ApplicationConfig = {
     providers: [
       // ... other providers
       provideFirebaseApp(() => initializeApp(environment.firebase)),
       provideFirestore(() => {
         const firestore = getFirestore();
         if (environment.useEmulator) {
           connectFirestoreEmulator(firestore, 'localhost', 8080);
         }
         return firestore;
       }),
     ]
   };
   ```

5. **Start Emulator:**
   ```bash
   firebase emulators:start
   ```

   Access Emulator UI at: `http://localhost:4000`

6. **Run App with Emulator:**
   ```bash
   # Terminal 1: Start emulator
   firebase emulators:start

   # Terminal 2: Start app
   ng serve --configuration emulator
   ```

---

## 🔄 Workflow: Development Best Practices

### Daily Development
```bash
# Option A: Use Emulator (Recommended)
firebase emulators:start     # Terminal 1
ng serve --configuration emulator  # Terminal 2

# Option B: Use Dev Project
firebase use dev
ng serve --configuration development
```

### Testing Features
```bash
# Always test on dev first
firebase use dev
npm run build
firebase deploy --only hosting

# Test at: https://shoplisl-dev.web.app
```

### Deploy to Production
```bash
# Only after thorough testing
firebase use default
npm run build --configuration production
firebase deploy
```

---

## 📊 Environment Summary

| Environment | Firebase Project | Usage | Data |
|------------|------------------|--------|------|
| **Emulator** | `demo-shoplisl` | Local development | Temporary (cleared on restart) |
| **Dev** | `shoplisl-dev` | Feature testing | Copy of production or test data |
| **Production** | `shoplisl` | Live app | Real user data ⚠️ |

---

## 🚨 Safety Checks

Before deploying to production:

1. ✅ Run all tests: `npm test`
2. ✅ Build succeeds: `npm run build --configuration production`
3. ✅ Verify on dev: Deploy to `shoplisl-dev` first
4. ✅ Manual testing on dev URL
5. ✅ Check Firebase usage/billing
6. ✅ Backup production data: `npm run backup:firestore`
7. ✅ Deploy to production: `firebase use default && firebase deploy`

---

## 🛠️ Troubleshooting

### Issue: "Project not found"
```bash
# Re-add project
firebase use --add
```

### Issue: "Insufficient permissions"
```bash
# Check you're logged in as the right user
firebase logout
firebase login
```

### Issue: "Emulator won't start"
```bash
# Kill any existing processes on port 8080
lsof -ti:8080 | xargs kill -9

# Try again
firebase emulators:start
```

### Issue: "Data not showing in emulator"
- Check that `environment.useEmulator` is `true`
- Check emulator is running (`http://localhost:4000`)
- Check browser console for errors

---

## 📚 Resources

- **Firebase CLI Reference**: https://firebase.google.com/docs/cli
- **Firebase Emulator Suite**: https://firebase.google.com/docs/emulator-suite
- **Firestore Security Rules**: https://firebase.google.com/docs/firestore/security/get-started

---

**Created:** 2025-11-23
**Last Updated:** 2025-11-23
