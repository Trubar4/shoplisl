# Firebase Authentication Setup for E2E Tests

## 🚀 Quick Setup (5 minutes)

### Step 1: Enable Email/Password Authentication

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Select your **shoplisl** project

2. **Navigate to Authentication**
   - Click **"Authentication"** in left sidebar
   - Click **"Get Started"** (if first time)
   - OR click **"Sign-in method"** tab

3. **Enable Email/Password**
   - Find **"Email/Password"** in the providers list
   - Click on it
   - Toggle to **"Enable"** (should turn blue/green)
   - Click **"Save"**

✅ **You should now see "Email/Password" marked as "Enabled"**

---

### Step 2: Create Test Users

1. **Still in Firebase Console**
   - Click the **"Users"** tab (next to "Sign-in method")

2. **Add First Test User**
   - Click **"Add User"** button (top right)
   - Fill in:
     - **Email**: `test-user-1@shoplisl.test`
     - **Password**: `TestPassword123!`
   - Click **"Add User"**

3. **Add Second Test User**
   - Click **"Add User"** again
   - Fill in:
     - **Email**: `test-user-2@shoplisl.test`
     - **Password**: `TestPassword123!`
   - Click **"Add User"**

✅ **You should now see 2 users in the Users list**

---

### Step 3: Verify Setup

You should see something like:

```
Users (2)
┌─────────────────────────────────────────────────┬──────────┬──────────────┐
│ Email                         │ Provider │ Created      │
├─────────────────────────────────────────────────┼──────────┼──────────────┤
│ test-user-1@shoplisl.test    │ password │ Just now     │
│ test-user-2@shoplisl.test    │ password │ Just now     │
└─────────────────────────────────────────────────┴──────────┴──────────────┘
```

---

## ✅ Done! Now Run Tests

```bash
# Terminal 1: Start dev server
npm run start

# Terminal 2: Run E2E tests
npm run test:e2e:ui
```

---

## 📝 Notes

### About the "Dynamic Links" Warning
If you see a warning about **"Firebase Dynamic Links shutting down"**, you can ignore it. This only affects:
- Email link authentication for mobile apps
- Cordova OAuth support

Your **Email/Password** authentication will work perfectly! ✅

### Alternative: Use Your Own Test Accounts
Don't want to create new users? Just update the credentials in:
- File: `e2e/fixtures/auth.fixture.ts`
- Lines: 16-27
- Replace with your existing test account emails/passwords

---

## 🎯 What You'll Be Able to Test

Once setup is complete, you can run **25 E2E tests** that cover:
- ✅ Lists management (create, edit, delete)
- ✅ Articles management (add, check, remove)
- ✅ **Offline scenarios** (temp article cleanup)
- ✅ Shared lists (multi-user collaboration)

---

## 🆘 Troubleshooting

### Can't Find "Authentication" in Firebase Console?
Make sure you selected the correct project at the top.

### "Add User" Button is Grayed Out?
Make sure Email/Password sign-in method is enabled (Step 1).

### Still Having Issues?
Try using your existing Firebase users:
1. Open `e2e/fixtures/auth.fixture.ts`
2. Update lines 16-27 with your real test account credentials
3. Save and run tests

---

**That's it!** Setup complete in just 3 steps. 🎉

See `TESTING_GUIDE.md` for how to run the tests.
