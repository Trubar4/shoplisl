# Enable Firebase Email/Password Authentication

## Step-by-Step Guide

### 1. Open Firebase Console
1. Go to https://console.firebase.google.com/
2. Select your **shoplisl** project

### 2. Navigate to Authentication
1. In the left sidebar, click **"Authentication"**
2. Click the **"Get Started"** button (if you haven't set up authentication yet)
   - OR if already started, click the **"Sign-in method"** tab

### 3. Enable Email/Password
1. Find **"Email/Password"** in the list of sign-in providers
2. Click on it
3. Toggle **"Enable"** to ON (the switch should turn blue)
4. Click **"Save"**

### 4. Verify It's Enabled
You should see:
- Email/Password shows as **"Enabled"** in the sign-in methods list
- A green checkmark or "Enabled" badge next to it

### 5. Now Create Test Users

#### Option A - Using Firebase Console (Manual)
1. Click the **"Users"** tab at the top
2. Click **"Add User"** button
3. Create User 1:
   - Email: `test-user-1@shoplisl.test`
   - Password: `TestPassword123!`
   - Click "Add User"
4. Create User 2:
   - Email: `test-user-2@shoplisl.test`
   - Password: `TestPassword123!`
   - Click "Add User"

#### Option B - Using the Script (After Email/Password is enabled)
```bash
npm run create-test-users
```

## Common Issues

### "Dynamic Links shutting down" Warning
This warning is about a different feature (Dynamic Links). It won't affect your ability to:
- Use Email/Password authentication
- Create test users
- Run E2E tests

You can safely ignore this warning. It only affects:
- Email link authentication for mobile apps
- Cordova OAuth support

Your regular Email/Password sign-in will work fine! ✅

### "Add user is not possible"
This means Email/Password sign-in method is not enabled yet. Follow steps 1-3 above.

### After Enabling
Once Email/Password is enabled, you can:
1. ✅ Create users via Firebase Console
2. ✅ Create users via the script: `npm run create-test-users`
3. ✅ Sign in to your app with email/password
4. ✅ Run E2E tests that require authentication

## Screenshot Reference

When you enable Email/Password, you should see something like:

```
Sign-in providers:
✓ Email/Password        Enabled
  Google                Disabled
  Phone                 Disabled
  Anonymous             Disabled
```

## Next Steps After Enabling

1. ✅ Enable Email/Password authentication (follow steps above)
2. ✅ Create test users (manual or script)
3. ✅ Run E2E tests:
   ```bash
   npm run start          # Terminal 1
   npm run test:e2e:ui    # Terminal 2
   ```

---

**Need More Help?**
- Firebase Auth Docs: https://firebase.google.com/docs/auth/web/password-auth
- See `TESTING_GUIDE.md` for E2E test setup
