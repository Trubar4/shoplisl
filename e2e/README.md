# ShopLisl E2E Tests

End-to-end tests for the ShopLisl shopping list application using Playwright.

## Overview

This test suite covers:
- **Lists Management** (`01-lists.spec.ts`) - Create, edit, delete, and navigate lists
- **Articles Management** (`02-articles.spec.ts`) - Add, check, remove articles
- **Temp Article Cleanup** (`03-temp-article-cleanup.spec.ts`) - Critical offline scenarios
- **Shared Lists** (`04-shared-lists.spec.ts`) - Multi-user collaboration

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

Or install all browsers:

```bash
npx playwright install
```

### 3. Set Up Test Users in Firebase

Create two test users in your Firebase project:

- **User 1**: `test-user-1@shoplisl.test` / `TestPassword123!`
- **User 2**: `test-user-2@shoplisl.test` / `TestPassword123!`

Update `e2e/fixtures/auth.fixture.ts` with your actual test credentials if different.

### 4. Configure Firebase for Testing

You may want to use Firebase Emulators for testing:

```bash
firebase emulators:start
```

Update `playwright.config.ts` `baseURL` if using emulators.

## Running Tests

### Run All Tests

```bash
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test e2e/01-lists.spec.ts
```

### Run Tests in UI Mode (Interactive)

```bash
npx playwright test --ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### Run Specific Test by Name

```bash
npx playwright test -g "should create a new shopping list"
```

### Run Tests for Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Debugging Tests

### Debug with Playwright Inspector

```bash
npx playwright test --debug
```

### Debug Specific Test

```bash
npx playwright test e2e/03-temp-article-cleanup.spec.ts --debug
```

### View Test Report

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Test Structure

### Fixtures (`fixtures/`)

- **auth.fixture.ts** - Authentication helpers and test user credentials

### Helpers (`helpers/`)

- **network.helper.ts** - Offline/online simulation, network mocking
- **storage.helper.ts** - IndexedDB and localStorage inspection

### Test Files

#### 01-lists.spec.ts
Tests basic list CRUD operations:
- Display lists overview
- Create new list
- Edit list name
- Delete list
- Navigate to list details
- Display article count

#### 02-articles.spec.ts
Tests article management:
- Add article to list
- Check/uncheck article
- Remove article
- Edit article amount
- Display article department
- Filter articles

#### 03-temp-article-cleanup.spec.ts
**Critical tests for offline article handling:**
- Create article with temp ID when offline
- Replace temp ID with real ID after going online
- Hide temp_ articles from UI (filterTempArticles workaround)
- Handle multiple offline articles
- Clean up temp IDs from Firebase (not just cache)
- Preserve article metadata during ID replacement

These tests verify the fix described in `TEMP_ARTICLE_CLEANUP.md`.

#### 04-shared-lists.spec.ts
Tests list sharing:
- Share list with another user
- Display shared lists for participants
- Show correct article count for shared lists
- Sync item check/uncheck between users
- Unshare a list
- Hide temp IDs from participants

## Important Notes

### Temp Article Cleanup Tests

The temp article cleanup tests (`03-temp-article-cleanup.spec.ts`) are critical for verifying the fix documented in `TEMP_ARTICLE_CLEANUP.md`:

**Problem**: When users add articles offline, temporary IDs (`temp_1767542748274_hrnlkevvy`) are created locally. After syncing to Firebase, the app should:
1. Replace temp IDs with real Firebase IDs in local state ✅
2. **Update Firebase** to remove temp IDs from list data ⚠️

**Current Workaround**: Client-side filtering hides temp_ articles from display.

**Proper Fix**: Update `articles-repository.service.ts` to clean up Firebase list data after offline sync.

The E2E tests verify both the workaround (temp articles are hidden) and the proper fix (Firebase cleanup).

### Shared Lists Tests

Shared list tests may require manual setup:
- Create test users in Firebase
- Share a list between users
- Some tests work better with two browser contexts (implement as needed)

### Firebase Security Rules

Ensure your Firestore rules allow:
- Test users to read/write their own data
- Shared list participants to read owner's list data
- Collection group queries for shared lists (if using that approach)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Configuration

### playwright.config.ts

Key settings:
- `testDir`: `./e2e` - Test directory
- `baseURL`: `http://localhost:4200` - Dev server URL
- `webServer`: Auto-starts Angular dev server before tests
- `projects`: Runs tests on multiple browsers/devices

### Customization

Edit `playwright.config.ts` to:
- Change base URL (for production/staging)
- Adjust timeouts
- Configure retries
- Change reporter (html, json, junit)
- Add more device configurations

## Best Practices

1. **Use data-testid attributes** in your Angular components for reliable selectors
2. **Wait for network idle** after navigation or user actions
3. **Use fixtures** for common setup (authentication, test data)
4. **Keep tests independent** - each test should work in isolation
5. **Clean up test data** - use beforeEach/afterEach hooks
6. **Mock external APIs** when possible to avoid flaky tests
7. **Test happy paths first**, then edge cases and error states

## Troubleshooting

### Tests Timeout

- Increase timeout in `playwright.config.ts`
- Check if dev server is running (`npm run start`)
- Ensure Firebase is accessible

### Authentication Fails

- Verify test user credentials in Firebase
- Check `e2e/fixtures/auth.fixture.ts` selectors match your login UI
- Ensure Firebase Auth is initialized

### Offline Tests Don't Work

- Check browser context offline mode is supported
- Verify service worker is registered (for PWA offline support)
- Test with `--headed` mode to see actual behavior

### Temp Article Tests Fail

This may indicate the Firebase cleanup fix from `TEMP_ARTICLE_CLEANUP.md` is not implemented. Check:
1. `articles-repository.service.ts:109-142` - Does it update Firebase after sync?
2. `firebase-data.service.ts` - Does `updateListInFirebase()` method exist?
3. Firebase rules - Can app update list `articleIds` and `itemStates`?

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Angular Testing Guide](https://angular.dev/guide/testing)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)

## Contributing

When adding new tests:
1. Follow the naming convention: `XX-feature.spec.ts`
2. Add test description comments
3. Use page objects for complex UI interactions
4. Update this README with new test coverage
5. Ensure tests pass on all configured browsers

## Contact

For questions about these tests, refer to:
- `TEMP_ARTICLE_CLEANUP.md` - Offline article handling documentation
- `HANDOFF_NEXT_SESSION.md` - Phase 8 shared lists implementation
- `PHASE_2_PROMPT.md` - Service refactoring context
