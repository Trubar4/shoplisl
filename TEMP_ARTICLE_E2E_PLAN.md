# Temporary Article Cleanup & E2E Testing Implementation Plan

## Executive Summary

This plan addresses two critical data consistency issues and establishes automated E2E testing infrastructure:

1. **Temporary Article Cleanup**: Remove stale `temp_*` article IDs from Firebase lists after offline sync
2. **ArticleIds/ItemStates Synchronization**: Ensure these two arrays stay consistent across all operations
3. **E2E Testing Infrastructure**: Set up Firebase Emulator Suite + Playwright for automated testing

## Problem Analysis

### Problem 1: Temporary Articles in Firebase

**Current State:**
- When users add articles offline, temporary IDs (`temp_${timestamp}_${random}`) are created
- Upon online sync, articles get real IDs but Firebase lists still contain temp IDs
- Current workaround: Client-side filtering (lists-overview.ts:101-110)

**Impact:**
- Participants see inflated article counts for shared lists
- Wasted Firebase storage with orphaned references
- Data integrity issues

**Root Cause:**
- `articles-repository.service.ts:139` calls `updateLocalLists()` which only updates in-memory state
- Firebase lists never get updated with the real IDs

### Problem 2: ArticleIds/ItemStates Desynchronization

**Current State:**
- `ShoppingList` has two related arrays:
  - `articleIds: string[]` - list of article IDs
  - `itemStates: { [articleId: string]: ListItemState }` - state for each article
- These can get out of sync when:
  - Temp articles exist in one but not the other
  - Articles are deleted but references remain
  - Articles are added/removed inconsistently

**Impact:**
- UI shows incorrect article counts
- Broken state management
- Null reference errors

**Root Cause:**
- Multiple code paths update these arrays separately
- No validation to ensure consistency
- No cleanup on article deletion

### Problem 3: No E2E Testing Infrastructure

**Current State:**
- Only unit tests with Vitest
- No way to test real Firebase operations
- No way to test multi-user scenarios (owner/participant)
- Manual testing required for every change

**Impact:**
- Risk of regressions
- Time-consuming manual testing
- Cannot verify sharing/permissions scenarios
- Cannot test offline/online sync flows

## Solution Architecture

### Phase 1: E2E Testing Infrastructure

Set up Firebase Emulator Suite + Playwright to enable automated testing.

#### 1.1 Firebase Emulator Configuration

**Enhance `firebase.json`:**
```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "functions": {
      "port": 5001
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

**Benefits:**
- Auth emulator for creating test users
- Firestore emulator for real database operations
- Functions emulator for triggers (if needed)
- UI for debugging tests

#### 1.2 Playwright Setup

**Install Playwright:**
```bash
npm install -D @playwright/test @firebase/rules-unit-testing
```

**Create `playwright.config.ts`:**
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### 1.3 E2E Test Utilities

**Create `e2e/utils/firebase-emulator.ts`:**
```typescript
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

export async function setupEmulators() {
  testEnv = await initializeTestEnvironment({
    projectId: 'shoplisl-test',
    firestore: {
      host: 'localhost',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
  return testEnv;
}

export async function clearEmulators() {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
}

export async function createTestUser(userId: string, email: string) {
  // Use Auth emulator REST API
  const response = await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'testPassword123',
      returnSecureToken: true,
    }),
  });
  return response.json();
}

export async function seedTestData(userId: string, data: any) {
  const firestore = testEnv.authenticatedContext(userId).firestore();
  // Add test data
}
```

**Create `e2e/utils/test-helpers.ts`:**
```typescript
import { Page } from '@playwright/test';

export class TestHelper {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    // Navigate to login and authenticate
  }

  async createList(name: string) {
    // Create a new list
  }

  async addArticleToList(listId: string, articleName: string) {
    // Add article to list
  }

  async shareList(listId: string, participantEmail: string) {
    // Share list with another user
  }

  async goOffline() {
    await this.page.context().setOffline(true);
  }

  async goOnline() {
    await this.page.context().setOffline(false);
  }
}
```

#### 1.4 Test Data Management

**Create `e2e/fixtures/test-data.ts`:**
```typescript
export const TEST_USERS = {
  owner: {
    uid: 'test-owner-uid',
    email: 'owner@test.com',
    password: 'testPassword123',
  },
  participant: {
    uid: 'test-participant-uid',
    email: 'participant@test.com',
    password: 'testPassword123',
  },
};

export const TEST_LISTS = {
  shopping: {
    id: 'test-list-1',
    name: 'Test Shopping List',
    articleIds: [],
    itemStates: {},
  },
};

export const TEST_ARTICLES = {
  milk: {
    id: 'test-article-1',
    name: 'Milk',
    icon: '🥛',
  },
};
```

### Phase 2: Database Cleanup Script

Create a script to clean existing temp articles from the database.

#### 2.1 Cleanup Script

**Create `scripts/cleanup-temp-articles.ts`:**
```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';

interface CleanupResult {
  listsProcessed: number;
  tempArticlesRemoved: number;
  errors: string[];
}

async function cleanupTempArticles(): Promise<CleanupResult> {
  const result: CleanupResult = {
    listsProcessed: 0,
    tempArticlesRemoved: 0,
    errors: [],
  };

  const db = getFirestore();

  // Get all users
  const usersSnapshot = await getDocs(collection(db, 'users-v2'));

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`Processing user: ${userId}`);

    // Get all lists for this user
    const listsSnapshot = await getDocs(collection(db, `users-v2/${userId}/lists`));

    const batch = writeBatch(db);
    let batchCount = 0;

    for (const listDoc of listsSnapshot.docs) {
      const listData = listDoc.data();
      const listId = listDoc.id;

      // Check for temp articles
      const originalArticleIds = listData.articleIds || [];
      const originalItemStates = listData.itemStates || {};

      const cleanedArticleIds = originalArticleIds.filter(
        (id: string) => !id.startsWith('temp_')
      );

      const cleanedItemStates: any = {};
      for (const [key, value] of Object.entries(originalItemStates)) {
        if (!key.startsWith('temp_')) {
          cleanedItemStates[key] = value;
        }
      }

      const tempArticlesCount = originalArticleIds.length - cleanedArticleIds.length;

      if (tempArticlesCount > 0) {
        console.log(`  List ${listId}: Removing ${tempArticlesCount} temp articles`);

        const listRef = doc(db, `users-v2/${userId}/lists/${listId}`);
        batch.update(listRef, {
          articleIds: cleanedArticleIds,
          itemStates: cleanedItemStates,
          updatedAt: new Date(),
        });

        result.tempArticlesRemoved += tempArticlesCount;
        batchCount++;

        // Commit batch every 500 operations (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      }

      result.listsProcessed++;
    }

    // Commit remaining batch operations
    if (batchCount > 0) {
      await batch.commit();
    }
  }

  return result;
}

// Run cleanup
cleanupTempArticles()
  .then(result => {
    console.log('\n=== Cleanup Complete ===');
    console.log(`Lists processed: ${result.listsProcessed}`);
    console.log(`Temp articles removed: ${result.tempArticlesRemoved}`);
    if (result.errors.length > 0) {
      console.error('Errors:', result.errors);
    }
  })
  .catch(error => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
```

#### 2.2 ArticleIds/ItemStates Consistency Validation

**Create `scripts/validate-list-consistency.ts`:**
```typescript
interface ValidationIssue {
  listId: string;
  userId: string;
  listName: string;
  issues: string[];
}

async function validateListConsistency(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const db = getFirestore();

  const usersSnapshot = await getDocs(collection(db, 'users-v2'));

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const listsSnapshot = await getDocs(collection(db, `users-v2/${userId}/lists`));

    for (const listDoc of listsSnapshot.docs) {
      const listData = listDoc.data();
      const listIssues: string[] = [];

      const articleIds = new Set(listData.articleIds || []);
      const itemStateKeys = new Set(Object.keys(listData.itemStates || {}));

      // Check for articleIds not in itemStates
      for (const articleId of articleIds) {
        if (!itemStateKeys.has(articleId)) {
          listIssues.push(`Article ${articleId} in articleIds but not in itemStates`);
        }
      }

      // Check for itemStates not in articleIds
      for (const articleId of itemStateKeys) {
        if (!articleIds.has(articleId)) {
          listIssues.push(`Article ${articleId} in itemStates but not in articleIds`);
        }
      }

      // Check for temp articles
      for (const articleId of articleIds) {
        if (articleId.startsWith('temp_')) {
          listIssues.push(`Temp article ${articleId} found in articleIds`);
        }
      }

      for (const articleId of itemStateKeys) {
        if (articleId.startsWith('temp_')) {
          listIssues.push(`Temp article ${articleId} found in itemStates`);
        }
      }

      if (listIssues.length > 0) {
        issues.push({
          listId: listDoc.id,
          userId,
          listName: listData.name,
          issues: listIssues,
        });
      }
    }
  }

  return issues;
}
```

### Phase 3: Fix Temporary Article Sync

Implement proper Firebase updates when temp articles are synced.

#### 3.1 Add updateListInFirebase Method

**File:** `src/app/core/services/firebase-data.service.ts`

**Add method:**
```typescript
/**
 * Update specific fields of a list in Firebase
 * Used for cleaning up temp article IDs after offline sync
 */
async updateListInFirebase(
  listId: string,
  updates: Partial<ShoppingList>
): Promise<void> {
  const userId = this.authService.getCurrentUserId();
  if (!userId || !this.firestore) {
    throw new Error('User must be authenticated and Firestore must be initialized');
  }

  const basePath = this.getUserBasePath();
  const listRef = doc(this.firestore, `${basePath}/lists/${listId}`);

  // Convert itemStates to Firestore-compatible format
  if (updates.itemStates) {
    updates.itemStates = this.convertItemStatesToFirestore(updates.itemStates);
  }

  await updateDoc(listRef, {
    ...updates,
    updatedAt: Timestamp.now()
  });

  this.logger.debug('data', `Updated list ${listId} in Firebase`, updates);
}

/**
 * Update list in owner's Firebase (for shared lists)
 */
async updateSharedListInFirebase(
  ownerId: string,
  listId: string,
  updates: Partial<ShoppingList>
): Promise<void> {
  if (!this.firestore) {
    throw new Error('Firestore must be initialized');
  }

  const ownerListRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);

  // Convert itemStates to Firestore-compatible format
  if (updates.itemStates) {
    updates.itemStates = this.convertItemStatesToFirestore(updates.itemStates);
  }

  await updateDoc(ownerListRef, {
    ...updates,
    updatedAt: Timestamp.now()
  });

  this.logger.debug('data', `Updated shared list ${listId} in owner's Firebase`, updates);
}
```

#### 3.2 Update Offline Sync Callback

**File:** `src/app/core/services/articles-repository.service.ts`

**Modify lines 109-142:**
```typescript
this.offlineSync.queueOperation(async () => {
  this.logger.info('data', `🔄 Syncing offline article: ${article.name} (temp ID: ${tempId})`);

  // Create article in Firebase and get real ID
  const realId = await this.firebaseData.createArticleInFirebase(articleData);
  this.logger.info('data', `✅ Article synced with real ID: ${realId}`);

  // CRITICAL: Replace temp ID with real ID in all local state and lists
  const currentArticles = this.firebaseData.getCurrentArticles();
  const updatedArticles = currentArticles.map(a =>
    a.id === tempId ? { ...a, id: realId } : a
  );
  this.firebaseData.updateLocalArticles(updatedArticles);

  // Update all lists that reference the temp ID
  const currentLists = this.firebaseData.getCurrentLists();
  const updatedLists = currentLists.map(list => {
    if (list.articleIds.includes(tempId)) {
      return {
        ...list,
        articleIds: list.articleIds.map(id => id === tempId ? realId : id),
        itemStates: Object.fromEntries(
          Object.entries(list.itemStates).map(([key, value]) =>
            key === tempId ? [realId, { ...value, articleId: realId }] : [key, value]
          )
        )
      };
    }
    return list;
  });
  this.firebaseData.updateLocalLists(updatedLists);

  // NEW: Update Firebase for each affected list
  for (const list of updatedLists) {
    // Check if this list was modified
    const originalList = currentLists.find(l => l.id === list.id);
    if (originalList && originalList.articleIds.includes(tempId)) {
      try {
        const currentUserId = this.authService.getCurrentUserId();

        // Determine if this is a shared list
        if (list.ownerId && list.ownerId !== currentUserId) {
          // Shared list - update in owner's Firebase
          await this.firebaseData.updateSharedListInFirebase(
            list.ownerId,
            list.id,
            {
              articleIds: list.articleIds,
              itemStates: list.itemStates,
            }
          );
          this.logger.info('data', `✅ Updated shared list ${list.id} in owner's Firebase`);
        } else {
          // Own list - update in own Firebase
          await this.firebaseData.updateListInFirebase(list.id, {
            articleIds: list.articleIds,
            itemStates: list.itemStates,
          });
          this.logger.info('data', `✅ Updated list ${list.id} in Firebase`);
        }
      } catch (error) {
        this.logger.error('data', `❌ Failed to update list ${list.id} in Firebase:`, error);
      }
    }
  }

  this.logger.info('data', `🔄 Replaced temp ID ${tempId} with real ID ${realId} in local state and Firebase`);
}, `Create article: ${article.name}`);
```

### Phase 4: Add Consistency Validation

Add runtime validation to ensure articleIds and itemStates stay in sync.

#### 4.1 Create Validation Service

**Create `src/app/core/services/list-validation.service.ts`:**
```typescript
import { Injectable } from '@angular/core';
import { ShoppingList } from '../models';
import { LoggerService } from './logger.service';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ListValidationService {
  constructor(private logger: LoggerService) {}

  /**
   * Validate that articleIds and itemStates are in sync
   */
  validateList(list: ShoppingList): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const articleIds = new Set(list.articleIds || []);
    const itemStateKeys = new Set(Object.keys(list.itemStates || {}));

    // Check for articleIds not in itemStates
    for (const articleId of articleIds) {
      if (!itemStateKeys.has(articleId)) {
        result.errors.push(`Article ${articleId} in articleIds but missing from itemStates`);
        result.isValid = false;
      }
    }

    // Check for itemStates not in articleIds
    for (const articleId of itemStateKeys) {
      if (!articleIds.has(articleId)) {
        result.errors.push(`Article ${articleId} in itemStates but missing from articleIds`);
        result.isValid = false;
      }
    }

    // Check for temp articles (warning only)
    for (const articleId of articleIds) {
      if (articleId.startsWith('temp_')) {
        result.warnings.push(`Temporary article ${articleId} found in articleIds`);
      }
    }

    for (const articleId of itemStateKeys) {
      if (articleId.startsWith('temp_')) {
        result.warnings.push(`Temporary article ${articleId} found in itemStates`);
      }
    }

    if (!result.isValid || result.warnings.length > 0) {
      this.logger.error('validation', `List validation failed for ${list.id}:`, result);
    }

    return result;
  }

  /**
   * Fix inconsistencies in a list
   */
  repairList(list: ShoppingList): ShoppingList {
    const articleIds = new Set(list.articleIds || []);
    const itemStateKeys = new Set(Object.keys(list.itemStates || {}));

    // Create repaired versions
    const repairedArticleIds: string[] = [];
    const repairedItemStates: typeof list.itemStates = {};

    // Include articles that are in both OR create missing itemStates
    for (const articleId of articleIds) {
      if (!articleId.startsWith('temp_')) {
        repairedArticleIds.push(articleId);

        if (itemStateKeys.has(articleId)) {
          repairedItemStates[articleId] = list.itemStates[articleId];
        } else {
          // Create default itemState
          repairedItemStates[articleId] = {
            articleId,
            isChecked: false,
          };
        }
      }
    }

    // Include itemStates that are in articleIds (already handled above)
    // Skip itemStates that are not in articleIds (orphaned)

    return {
      ...list,
      articleIds: repairedArticleIds,
      itemStates: repairedItemStates,
    };
  }
}
```

#### 4.2 Add Validation to Critical Operations

**Update `lists-repository.service.ts`:**
```typescript
// Inject validation service
constructor(
  private firebaseData: FirebaseDataService,
  private logger: LoggerService,
  private validation: ListValidationService,
  // ... other dependencies
) {}

// Add validation before saving lists
private async saveListWithValidation(list: ShoppingList): Promise<void> {
  const validationResult = this.validation.validateList(list);

  if (!validationResult.isValid) {
    this.logger.error('data', `List ${list.id} has validation errors. Attempting repair.`);
    const repairedList = this.validation.repairList(list);
    return this.firebaseData.updateListInFirebase(repairedList.id, {
      articleIds: repairedList.articleIds,
      itemStates: repairedList.itemStates,
    });
  }

  if (validationResult.warnings.length > 0) {
    this.logger.warn('data', `List ${list.id} has validation warnings:`, validationResult.warnings);
  }

  return this.firebaseData.updateListInFirebase(list.id, {
    articleIds: list.articleIds,
    itemStates: list.itemStates,
  });
}
```

### Phase 5: E2E Tests

Write comprehensive E2E tests to verify all scenarios.

#### 5.1 Temp Article Tests

**Create `e2e/temp-articles.spec.ts`:**
```typescript
import { test, expect } from '@playwright/test';
import { setupEmulators, clearEmulators, createTestUser } from './utils/firebase-emulator';
import { TestHelper } from './utils/test-helpers';

test.describe('Temporary Article Cleanup', () => {
  test.beforeAll(async () => {
    await setupEmulators();
  });

  test.beforeEach(async () => {
    await clearEmulators();
  });

  test('should replace temp IDs with real IDs after offline sync - owned list', async ({ page }) => {
    const helper = new TestHelper(page);

    // Setup: Create user and list
    await createTestUser('owner-uid', 'owner@test.com');
    await helper.login('owner@test.com', 'testPassword123');
    await helper.createList('Shopping List');

    // Go offline
    await helper.goOffline();

    // Add articles while offline
    await helper.addArticleToList('Shopping List', 'Milk');
    await helper.addArticleToList('Shopping List', 'Bread');

    // Verify temp IDs in local storage
    const localData = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('lists') || '[]');
    });

    const list = localData.find((l: any) => l.name === 'Shopping List');
    expect(list.articleIds.some((id: string) => id.startsWith('temp_'))).toBe(true);

    // Go online
    await helper.goOnline();

    // Wait for sync to complete
    await page.waitForTimeout(3000);

    // Verify Firebase has real IDs, no temp IDs
    const firebaseData = await page.evaluate(async () => {
      // Read from Firebase
      // This would use actual Firebase SDK calls
    });

    expect(firebaseData.articleIds.every((id: string) => !id.startsWith('temp_'))).toBe(true);
    expect(Object.keys(firebaseData.itemStates).every((id: string) => !id.startsWith('temp_'))).toBe(true);
  });

  test('should replace temp IDs in shared lists - participant view', async ({ page, context }) => {
    const helper = new TestHelper(page);

    // Setup: Create owner and participant
    await createTestUser('owner-uid', 'owner@test.com');
    await createTestUser('participant-uid', 'participant@test.com');

    // Owner creates and shares list
    await helper.login('owner@test.com', 'testPassword123');
    await helper.createList('Shared Shopping');
    await helper.shareList('Shared Shopping', 'participant@test.com');

    // Owner goes offline and adds articles
    await helper.goOffline();
    await helper.addArticleToList('Shared Shopping', 'Milk');

    // Owner goes online (sync happens)
    await helper.goOnline();
    await page.waitForTimeout(3000);

    // Switch to participant
    const participantPage = await context.newPage();
    const participantHelper = new TestHelper(participantPage);
    await participantHelper.login('participant@test.com', 'testPassword123');

    // Verify participant sees correct count (no temp articles)
    const listCount = await participantPage.locator('[data-testid="list-article-count"]').textContent();
    expect(listCount).toBe('1');
  });
});
```

#### 5.2 Consistency Tests

**Create `e2e/list-consistency.spec.ts`:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('ArticleIds/ItemStates Consistency', () => {
  test('should keep articleIds and itemStates in sync when adding articles', async ({ page }) => {
    // Test implementation
  });

  test('should keep articleIds and itemStates in sync when removing articles', async ({ page }) => {
    // Test implementation
  });

  test('should repair inconsistencies automatically', async ({ page }) => {
    // Test implementation
  });
});
```

#### 5.3 Permissions Tests

**Create `e2e/shared-list-permissions.spec.ts`:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Shared List Permissions', () => {
  test('owner can create list', async ({ page }) => {
    // Test implementation
  });

  test('participant cannot create list in owner path', async ({ page }) => {
    // Test implementation
  });

  test('participant can add articles to shared list', async ({ page }) => {
    // Test implementation
  });

  test('participant cannot change list owner', async ({ page }) => {
    // Test implementation
  });

  test('owner can unshare, participant loses access', async ({ page }) => {
    // Test implementation
  });
});
```

### Phase 6: NPM Scripts & CI Integration

#### 6.1 Add NPM Scripts

**Update `package.json`:**
```json
{
  "scripts": {
    "emulators:start": "firebase emulators:start",
    "emulators:kill": "lsof -ti:8080,9099,4000,5001 | xargs kill -9 || true",

    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",

    "test:e2e:emulators": "npm run emulators:kill && firebase emulators:exec --only auth,firestore 'npm run test:e2e'",

    "cleanup:temp-articles": "ts-node scripts/cleanup-temp-articles.ts",
    "validate:lists": "ts-node scripts/validate-list-consistency.ts"
  }
}
```

#### 6.2 Create Test Runner Script

**Create `scripts/run-e2e-tests.sh`:**
```bash
#!/bin/bash

set -e

echo "🧹 Cleaning up old emulator processes..."
lsof -ti:8080,9099,4000,5001 | xargs kill -9 || true

echo "🚀 Starting Firebase emulators..."
firebase emulators:start --only auth,firestore &
EMULATOR_PID=$!

# Wait for emulators to start
echo "⏳ Waiting for emulators to be ready..."
sleep 5

echo "🎭 Running Playwright tests..."
npx playwright test

TEST_EXIT_CODE=$?

echo "🛑 Stopping emulators..."
kill $EMULATOR_PID

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Tests failed!"
  exit $TEST_EXIT_CODE
fi
```

## Implementation Checklist

### Phase 1: E2E Infrastructure
- [ ] Install Playwright and dependencies
- [ ] Create playwright.config.ts
- [ ] Update firebase.json with auth emulator
- [ ] Create e2e/utils/firebase-emulator.ts
- [ ] Create e2e/utils/test-helpers.ts
- [ ] Create e2e/fixtures/test-data.ts
- [ ] Test basic emulator setup

### Phase 2: Database Cleanup
- [ ] Create scripts/cleanup-temp-articles.ts
- [ ] Create scripts/validate-list-consistency.ts
- [ ] Run validation script on production data (read-only)
- [ ] Document findings
- [ ] Run cleanup script on production (with backup!)

### Phase 3: Fix Temp Article Sync
- [ ] Add updateListInFirebase() to firebase-data.service.ts
- [ ] Add updateSharedListInFirebase() to firebase-data.service.ts
- [ ] Update offline sync callback in articles-repository.service.ts
- [ ] Test offline article creation manually

### Phase 4: Add Consistency Validation
- [ ] Create list-validation.service.ts
- [ ] Add validation to lists-repository.service.ts
- [ ] Add validation to all list update operations
- [ ] Test validation with intentionally broken data

### Phase 5: E2E Tests
- [ ] Write e2e/temp-articles.spec.ts
- [ ] Write e2e/list-consistency.spec.ts
- [ ] Write e2e/shared-list-permissions.spec.ts
- [ ] All E2E tests passing

### Phase 6: Scripts & Automation
- [ ] Add NPM scripts to package.json
- [ ] Create run-e2e-tests.sh
- [ ] Make script executable
- [ ] Document how to run tests
- [ ] Test full workflow

## Testing Strategy

### Manual Testing Checklist

**Before Implementation:**
1. Document current behavior (take screenshots)
2. Note list article counts for shared lists
3. Export production data for backup

**After Implementation:**
1. Test offline article creation (owned list)
2. Test offline article creation (shared list)
3. Verify participant sees correct counts
4. Verify no temp_ IDs in Firebase
5. Test article deletion (verify both arrays updated)
6. Test article addition (verify both arrays updated)

### Automated Testing with E2E

**TDD Workflow:**
1. Write failing E2E test describing desired behavior
2. Run test, verify it fails
3. Implement feature
4. Run test, verify it passes
5. Refactor if needed
6. Re-run test to ensure still passing

**Example Gherkin:**
```gherkin
Feature: Temporary Article Cleanup

  Scenario: Owner adds articles offline then syncs
    Given I am logged in as the list owner
    And I have a list called "Shopping"
    When I go offline
    And I add "Milk" to "Shopping"
    And I add "Bread" to "Shopping"
    Then I should see 2 articles in local storage with temp IDs
    When I go online
    And I wait for sync to complete
    Then Firebase should contain 2 articles with real IDs
    And Firebase should contain 0 articles with temp IDs
    And articleIds and itemStates should be in sync

  Scenario: Participant sees correct count after owner syncs
    Given Owner has created and shared "Shopping" with Participant
    When Owner goes offline
    And Owner adds "Milk" to "Shopping"
    And Owner goes online
    And Participant refreshes their view
    Then Participant should see 1 article in "Shopping"
    And Participant should not see any temp articles
```

## Success Criteria

1. **Zero temp_ IDs in Firebase** after sync completes
2. **ArticleIds and itemStates always in sync** across all operations
3. **All E2E tests passing** including:
   - Temp article cleanup
   - Consistency validation
   - Shared list permissions
4. **Automated test workflow** that Claude can run without manual intervention
5. **Documentation** for running and writing E2E tests

## Timeline

- **Phase 1 (E2E Infrastructure)**: 2-3 hours
- **Phase 2 (Database Cleanup)**: 1 hour
- **Phase 3 (Fix Temp Article Sync)**: 2 hours
- **Phase 4 (Consistency Validation)**: 2 hours
- **Phase 5 (E2E Tests)**: 3-4 hours
- **Phase 6 (Scripts & Automation)**: 1 hour

**Total Estimated Time**: 11-13 hours of development work

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Production data loss during cleanup | High | Full backup before running cleanup |
| Firebase security rules block updates | High | Test with emulator first, verify rules |
| E2E tests flaky due to timing | Medium | Add proper wait conditions, retry logic |
| Emulator state persists between tests | Medium | Clear emulator data in beforeEach |
| Performance impact of validation | Low | Only validate in dev mode, async validation |

## Future Enhancements

1. **Firebase Cloud Function** for automatic cleanup
2. **Real-time validation** with Firestore triggers
3. **Monitoring dashboard** for data consistency metrics
4. **Automated nightly cleanup** job
5. **Integration with CI/CD** pipeline

## References

- [Firebase Emulator Suite Docs](https://firebase.google.com/docs/emulator-suite)
- [Playwright Testing Docs](https://playwright.dev/)
- [Firebase Rules Unit Testing](https://firebase.google.com/docs/rules/unit-tests)
- [ShopLisl TEMP_ARTICLE_CLEANUP.md](./TEMP_ARTICLE_CLEANUP.md)
