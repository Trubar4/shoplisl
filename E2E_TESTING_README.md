# E2E Testing Setup

This document explains how to run the E2E and integration tests for ShopLisl.

## Overview

We have two types of tests:

### 1. Firebase Integration Tests (Claude can run these!)
- Test Firebase operations directly without a browser
- Run against Firebase emulators (Auth + Firestore)
- Fast and deterministic
- Located in `e2e/integration/`

### 2. Playwright E2E Tests (You run these locally)
- Test the full application with a real browser
- Test UI interactions and user flows
- Require Playwright browsers to be installed
- Located in `e2e/` (top level)

## Prerequisites

### For Integration Tests (Required for Claude)

1. **Firebase Emulators**
   ```bash
   # Already configured in firebase.json
   # Emulators will use these ports:
   # - Auth: 9099
   # - Firestore: 8080
   # - UI: 4000
   ```

### For E2E Tests (Required for Local Testing)

1. **Playwright Browsers**
   ```bash
   npx playwright install
   ```

## Running Tests

### Start Firebase Emulators

Before running any tests, start the emulators:

```bash
npm run emulators:start
```

This will start:
- Auth emulator on port 9099
- Firestore emulator on port 8080
- Emulator UI on port 4000

The emulator UI is available at: http://localhost:4000

### Run Integration Tests

**Claude can run these automatically!**

```bash
# Run all integration tests
npm run test:integration

# Run with UI (opens Vitest UI)
npm run test:integration:ui

# Run specific test file
npx vitest e2e/integration/temp-articles.integration.spec.ts
```

Integration tests include:
- ✅ `temp-articles.integration.spec.ts` - Temp article cleanup tests
- ✅ `list-consistency.integration.spec.ts` - ArticleIds/itemStates consistency tests

### Run E2E Tests (Browser)

**You need to run these locally** (Claude cannot run browser tests):

```bash
# Make sure emulators are running first!
npm run emulators:start

# In another terminal, run E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug
```

E2E tests will include (to be written):
- 📝 User login/logout flows
- 📝 List creation and sharing
- 📝 Offline article creation
- 📝 Real-time sync verification

## Test Structure

```
e2e/
├── integration/                    # Firebase integration tests (no browser)
│   ├── temp-articles.integration.spec.ts
│   └── list-consistency.integration.spec.ts
├── utils/                          # Test utilities
│   ├── firebase-emulator.ts        # Emulator setup helpers
│   └── test-helpers.ts             # Playwright helpers
├── fixtures/                       # Test data
│   └── test-data.ts                # Common test fixtures
└── global-setup.ts                 # Global test setup
```

## Writing Integration Tests

Integration tests are perfect for testing Firebase operations:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupEmulators,
  clearEmulators,
  cleanupEmulators,
  getAuthenticatedContext
} from '../utils/firebase-emulator';

describe('My Feature', () => {
  beforeAll(async () => {
    await setupEmulators();
  });

  beforeEach(async () => {
    await clearEmulators(); // Reset state before each test
  });

  afterAll(async () => {
    await cleanupEmulators();
  });

  it('should do something', async () => {
    const context = getAuthenticatedContext('test-user-id');
    const db = context.firestore();

    // Test Firebase operations...
  });
});
```

## Writing E2E Tests

E2E tests use Playwright to test the full application:

```typescript
import { test, expect } from '@playwright/test';
import { TestHelper } from './utils/test-helpers';

test.describe('My Feature', () => {
  test('should work correctly', async ({ page }) => {
    const helper = new TestHelper(page);

    await helper.login('user@test.com', 'password');
    await helper.createList('Shopping');
    await helper.addArticleToList('Shopping', 'Milk');

    expect(await helper.isArticleInList('Milk')).toBe(true);
  });
});
```

## Test Data

Use the fixtures in `e2e/fixtures/test-data.ts`:

```typescript
import { TEST_USERS, TEST_ARTICLES, TEST_LISTS } from '../fixtures/test-data';

// Use predefined test users
const owner = TEST_USERS.owner; // owner@test.com
const participant = TEST_USERS.participant; // participant@test.com

// Use predefined test articles
const milk = TEST_ARTICLES.milk; // { name: 'Milk', icon: '🥛', ... }

// Use predefined test lists
const shopping = TEST_LISTS.shopping; // { name: 'Weekly Shopping', ... }
```

## Debugging

### Integration Tests

1. **Check emulator logs**: The emulators print detailed logs
2. **Use Emulator UI**: Open http://localhost:4000 to inspect data
3. **Add console.log**: Integration tests run in Node, so console works

### E2E Tests

1. **Run in headed mode**: `npm run test:e2e:headed`
2. **Use debug mode**: `npm run test:e2e:debug`
3. **Check screenshots**: Failed tests save screenshots to `test-results/`
4. **View HTML report**: Run `npx playwright show-report`

## CI/CD Integration

Integration tests can run in CI since they don't require browser installation:

```yaml
# .github/workflows/test.yml
- name: Start Firebase Emulators
  run: npm run emulators:start &

- name: Wait for emulators
  run: sleep 5

- name: Run integration tests
  run: npm run test:integration
```

E2E tests require additional setup in CI to install browsers.

## Troubleshooting

### "Emulator not running" error

Make sure emulators are started:
```bash
npm run emulators:start
```

### Port already in use

Kill existing emulator processes:
```bash
npm run emulators:kill
```

### Playwright browser download fails

Install browsers manually:
```bash
npx playwright install chromium
```

If you're in a restricted environment, Playwright might not work. Use integration tests instead.

## What Claude Can Test Automatically

Claude can run all integration tests that:
- ✅ Test Firebase operations (Firestore, Auth)
- ✅ Test data consistency
- ✅ Test business logic
- ✅ Test multi-user scenarios
- ❌ Cannot test UI (no browser access)
- ❌ Cannot test visual appearance

This means Claude can verify **~90% of functionality** automatically, and you only need to verify UI/visual aspects manually when needed.

## Next Steps

1. ✅ Integration test infrastructure is ready
2. 📝 Write more integration tests as needed
3. 📝 Write E2E tests for critical user flows
4. 📝 Add tests to CI/CD pipeline
