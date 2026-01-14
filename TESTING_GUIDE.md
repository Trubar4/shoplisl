# ShopLisl Testing Guide

Complete guide for running all tests in the ShopLisl project.

---

## ✅ Quick Start (What to Do Now)

### 1. Create Test Users in Firebase

**Option A - Using the Script (Easiest):**
```bash
npm run create-test-users
```

**Option B - Manually in Firebase Console:**
1. Go to https://console.firebase.google.com/
2. Select your "shoplisl" project
3. Go to Authentication > Users
4. Click "Add User" twice to create:
   - `test-user-1@shoplisl.test` / `TestPassword123!`
   - `test-user-2@shoplisl.test` / `TestPassword123!`

**Option C - Use Your Existing Test Accounts:**
Edit `e2e/fixtures/auth.fixture.ts` (lines 16-27) with your actual credentials.

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
# Setup (one time)
npm run create-test-users

# Testing
npm run start                # Terminal 1
npm run test:e2e:ui          # Terminal 2 (interactive)

# Debug
npm run test:e2e:debug       # Debug failing tests
npm run test:e2e:report      # View HTML report
```

---

## ✅ Success Checklist

You're ready when:
1. ✅ Dev server starts: `npm run start`
2. ✅ Test users created: `npm run create-test-users`
3. ✅ Tests run: `npm run test:e2e`
4. ✅ 24/25 tests pass (1 fails as expected)

**Perfect!** Now implement the Firebase cleanup to get all 25 passing.

See `TEMP_ARTICLE_CLEANUP.md` for implementation details.
