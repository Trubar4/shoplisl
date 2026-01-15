# ShopLisl Testing Guide

Complete guide for running all tests in the ShopLisl project.

---

## ✅ Quick Start (What to Do Now)

### 1. Setup Firebase Authentication (One-Time)

**IMPORTANT:** Before creating test users, you must enable Email/Password authentication!

#### Step 1a: Enable Email/Password Sign-In Method
1. Go to https://console.firebase.google.com/
2. Select your "shoplisl" project
3. Click **Authentication** > **Sign-in method** tab
4. Find **"Email/Password"** and click it
5. Toggle to **"Enable"** and click **"Save"**

#### Step 1b: Create Test Users Manually (Recommended)
1. Stay in Firebase Console, click **"Users"** tab
2. Click **"Add User"** button
3. Create user 1:
   - Email: `test-user-1@shoplisl.test`
   - Password: `TestPassword123!`
4. Click "Add User" again for user 2:
   - Email: `test-user-2@shoplisl.test`
   - Password: `TestPassword123!`

✅ **Done!** You should see 2 users in your Users list.

📖 **Detailed guide:** See `FIREBASE_SETUP_STEPS.md`

**Alternative - Use Your Existing Accounts:**
Edit `e2e/fixtures/auth.fixture.ts` (lines 16-27) with your real credentials.

---

### 2. Start the Development Server

In one terminal, start the Angular dev server:
```bash
npm run start
```

Wait until you see: `Local: http://localhost:4200/`

**Keep this terminal open!**

---

### 3. Run E2E Tests

In a **second terminal**, run the tests:

#### Interactive UI Mode (Recommended for First Time)
```bash
npm run test:e2e:ui
```

#### Run All E2E Tests
```bash
npm run test:e2e
```

#### Run Specific Test File
```bash
# Test temp article cleanup (most important!)
npx playwright test e2e/03-temp-article-cleanup.spec.ts
```

---

## 🎯 Expected Results (First Run)

### Before Firebase Cleanup Fix:
```
Tests: 24 passed, 1 failed, 25 total

✓ 01-lists.spec.ts (7/7) ✅
✓ 02-articles.spec.ts (6/6) ✅
✓ 03-temp-article-cleanup.spec.ts (5/6) ⚠️
  ✗ "should clean up temp IDs from Firebase" ❌ (EXPECTED!)
✓ 04-shared-lists.spec.ts (6/6) ✅
```

**This is EXPECTED!** One test is designed to fail until you implement the Firebase cleanup.

### After Implementing Firebase Cleanup:
```
Tests: 25 passed, 25 total ✅
```

---

## 📊 What Each Test Does

### 03-temp-article-cleanup.spec.ts ⭐ MOST IMPORTANT

#### Test 5: "should clean up temp IDs from Firebase"
This test verifies the critical fix from TEMP_ARTICLE_CLEANUP.md:

**What it tests:**
1. Creates article offline (gets temp_ ID)
2. Goes online and syncs
3. Refreshes page (forces load from Firebase)
4. Checks if temp_ IDs are removed from Firebase

**Expected behavior:**
- ⚠️ **FAILS** before implementing fix → temp IDs still in Firebase
- ✅ **PASSES** after implementing fix → temp IDs cleaned up

**To make this pass:**
Implement the fix in `TEMP_ARTICLE_CLEANUP.md`:
- Update `articles-repository.service.ts:109-142`
- Add `updateListInFirebase()` to `firebase-data.service.ts`

---

## 🚀 Quick Commands

```bash
# Setup (one time - do in Firebase Console)
# See FIREBASE_SETUP_STEPS.md for detailed instructions

# Testing
npm run start                # Terminal 1: Start dev server
npm run test:e2e:ui          # Terminal 2: Run tests (interactive)

# Debug
npm run test:e2e:debug       # Debug failing tests
npm run test:e2e:report      # View HTML report
npm run test:e2e             # Run all tests (headless)
```

---

## ✅ Success Checklist

You're ready when:
1. ✅ Email/Password auth enabled in Firebase Console
2. ✅ Test users created (see FIREBASE_SETUP_STEPS.md)
3. ✅ Dev server starts: `npm run start`
4. ✅ Tests run: `npm run test:e2e`
5. ✅ 24/25 tests pass (1 fails as expected)

**Perfect!** Now implement the Firebase cleanup to get all 25 passing.

See `TEMP_ARTICLE_CLEANUP.md` for implementation details.
