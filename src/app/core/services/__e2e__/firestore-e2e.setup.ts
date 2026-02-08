/**
 * Firestore E2E Test Setup
 *
 * Helpers for connecting to the Firebase Emulator Suite and managing
 * test data. All tests run against local emulators (free, no cloud costs).
 *
 * Prerequisites:
 *   firebase emulators:start --only auth,firestore
 *
 * Or use the npm script:
 *   npm run test:firestore
 */
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Timestamp } from 'firebase/firestore';

// Emulator config (matches firebase.json)
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
export const FIRESTORE_EMULATOR_PORT = 8085;
export const AUTH_EMULATOR_HOST = '127.0.0.1';
export const AUTH_EMULATOR_PORT = 9099;

// Test user IDs
export const TEST_USERS = {
  alice: 'test-user-alice',
  bob: 'test-user-bob',
  charlie: 'test-user-charlie',
  admin: 'HYqET9vr40eDju4nQCTnJTV0qJo2', // matches firestore.rules isAdmin()
} as const;

// Shared test environment instance
let testEnv: RulesTestEnvironment;

/**
 * Initialize the test environment with your firestore.rules.
 * Call once in beforeAll().
 */
export async function setupTestEnvironment(): Promise<RulesTestEnvironment> {
  const rulesPath = resolve(process.cwd(), 'firestore.rules');
  const rules = readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'shoplisl-test',
    firestore: {
      rules,
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
  });

  return testEnv;
}

/**
 * Get an authenticated Firestore context for a test user.
 */
export function getAuthContext(userId: string): RulesTestContext {
  return testEnv.authenticatedContext(userId);
}

/**
 * Get an unauthenticated Firestore context.
 */
export function getUnauthContext(): RulesTestContext {
  return testEnv.unauthenticatedContext();
}

/**
 * Clear all Firestore data between tests.
 */
export async function clearFirestoreData(): Promise<void> {
  await testEnv.clearFirestore();
}

// ============================================================
// REST API helpers for odd-segment paths
// ============================================================
// Firestore SDK doc() requires even-segment paths (collection/doc pairs).
// Paths like admin/feature-flags/{flagId} have 3 segments and can't be
// referenced via doc(). We use the emulator REST API directly to test
// security rules for these paths.

const EMULATOR_BASE = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`;
const PROJECT_ID = 'shoplisl-test';

function restDocUrl(docPath: string): string {
  return `${EMULATOR_BASE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
}

function authHeader(userId: string | null): Record<string, string> {
  if (!userId) return {};
  return { Authorization: `Bearer ${userId}` };
}

/**
 * Write a document via REST API (works for any path depth).
 * Returns the response status for assertion.
 */
export async function restSet(
  docPath: string,
  data: Record<string, unknown>,
  userId: string | null
): Promise<{ ok: boolean; status: number }> {
  // Convert data to Firestore REST format
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }

  const url = restDocUrl(docPath);
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(userId),
    },
    body: JSON.stringify({ fields }),
  });
  return { ok: resp.ok, status: resp.status };
}

/**
 * Read a document via REST API (works for any path depth).
 */
export async function restGet(
  docPath: string,
  userId: string | null
): Promise<{ ok: boolean; status: number }> {
  const url = restDocUrl(docPath);
  const resp = await fetch(url, {
    method: 'GET',
    headers: authHeader(userId),
  });
  return { ok: resp.ok, status: resp.status };
}

/**
 * Delete a document via REST API (works for any path depth).
 */
export async function restDelete(
  docPath: string,
  userId: string | null
): Promise<{ ok: boolean; status: number }> {
  const url = restDocUrl(docPath);
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: authHeader(userId),
  });
  return { ok: resp.ok, status: resp.status };
}

/**
 * Update specific fields via REST API (PATCH with updateMask).
 */
export async function restUpdate(
  docPath: string,
  data: Record<string, unknown>,
  userId: string | null
): Promise<{ ok: boolean; status: number }> {
  const fields: Record<string, unknown> = {};
  const fieldPaths: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
    fieldPaths.push(key);
  }

  const mask = fieldPaths.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const url = `${restDocUrl(docPath)}?${mask}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(userId),
    },
    body: JSON.stringify({ fields }),
  });
  return { ok: resp.ok, status: resp.status };
}

/** Convert a JS value to Firestore REST API value format. */
function toFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Timestamp) {
    return { timestampValue: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const mapFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      mapFields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields: mapFields } };
  }
  return { stringValue: String(value) };
}

/**
 * Clean up the test environment. Call in afterAll().
 */
export async function teardownTestEnvironment(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
  }
}

/**
 * Seed a user document in users-v2/{userId}
 */
export async function seedUser(userId: string, data?: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users-v2/${userId}`).set({
      id: userId,
      name: `Test User ${userId}`,
      email: `${userId}@test.com`,
      createdAt: Timestamp.now(),
      ...data,
    });
  });
}

/**
 * Seed a shopping list in users-v2/{ownerId}/lists/{listId}
 */
export async function seedList(
  ownerId: string,
  listId: string,
  data?: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users-v2/${ownerId}/lists/${listId}`).set({
      id: listId,
      name: `Test List ${listId}`,
      ownerId: ownerId,
      articleIds: [],
      itemStates: {},
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

/**
 * Seed an article in users-v2/{ownerId}/articles/{articleId}
 */
export async function seedArticle(
  ownerId: string,
  articleId: string,
  data?: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users-v2/${ownerId}/articles/${articleId}`).set({
      id: articleId,
      name: `Test Article ${articleId}`,
      ownerId: ownerId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

/**
 * Seed a share invite in share-invites/{inviteId}
 */
export async function seedShareInvite(
  inviteId: string,
  data: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`share-invites/${inviteId}`).set({
      id: inviteId,
      status: 'pending',
      createdAt: Timestamp.now(),
      ...data,
    });
  });
}

/**
 * Read a document bypassing security rules (for assertions).
 */
export async function readDocAsAdmin(path: string): Promise<Record<string, unknown> | undefined> {
  let result: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const snap = await db.doc(path).get();
    result = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  });
  return result;
}

/**
 * Read all documents in a collection bypassing security rules (for assertions).
 */
export async function readCollectionAsAdmin(
  path: string
): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const snap = await db.collection(path).get();
    snap.docs.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() } as Record<string, unknown>);
    });
  });
  return results;
}

// ============================================================
// Debug & Logging Helpers
// ============================================================

const VERBOSE = process.env['FIRESTORE_E2E_VERBOSE'] === 'true';

/**
 * Log a debug message (only in verbose mode).
 */
export function debugLog(context: string, message: string, data?: unknown): void {
  if (VERBOSE) {
    const prefix = `  [${context}]`;
    if (data !== undefined) {
      console.log(prefix, message, JSON.stringify(data, null, 2));
    } else {
      console.log(prefix, message);
    }
  }
}

/**
 * Log a document snapshot for debugging failed assertions.
 * Always logs (not gated by VERBOSE) since it's meant for failure diagnostics.
 */
export function dumpDoc(label: string, doc: Record<string, unknown> | undefined): void {
  if (!doc) {
    console.log(`  DUMP [${label}]: document does not exist`);
    return;
  }
  console.log(`  DUMP [${label}]:`, JSON.stringify(doc, null, 2));
}

/**
 * Log a collection snapshot for debugging.
 */
export function dumpCollection(label: string, docs: Array<Record<string, unknown>>): void {
  console.log(`  DUMP [${label}]: ${docs.length} documents`);
  docs.forEach((doc, i) => {
    console.log(`    [${i}] id=${doc['id']}`, JSON.stringify(doc, null, 2));
  });
}

/**
 * Wrapper for assertFails that logs the operation details on unexpected success.
 */
export async function assertFailsWithLog(
  operation: Promise<unknown>,
  description: string
): Promise<void> {
  const { assertFails } = await import('@firebase/rules-unit-testing');
  try {
    await assertFails(operation);
  } catch (error) {
    console.error(`  SECURITY RULE VIOLATION: Expected DENY but got ALLOW`);
    console.error(`  Operation: ${description}`);
    throw error;
  }
}

/**
 * Wrapper for assertSucceeds that logs the operation details on unexpected failure.
 */
export async function assertSucceedsWithLog(
  operation: Promise<unknown>,
  description: string
): Promise<void> {
  const { assertSucceeds } = await import('@firebase/rules-unit-testing');
  try {
    await assertSucceeds(operation);
  } catch (error) {
    console.error(`  UNEXPECTED DENY: Expected ALLOW but got DENY`);
    console.error(`  Operation: ${description}`);
    console.error(`  Error:`, error);
    throw error;
  }
}

// ============================================================
// Selector-equivalent computation helpers
// (Mirror the NgRx selector logic for E2E validation)
// ============================================================

interface ItemState {
  articleId: string;
  articleName?: string;
  isChecked: boolean;
  amount?: string;
  notes?: string;
  addedAt?: unknown;
  checkedAt?: unknown;
  checkedBy?: string;
}

interface ListData {
  id: string;
  name: string;
  ownerId: string;
  articleIds: string[];
  itemStates: Record<string, ItemState>;
  sharedWith?: string[];
  shopId?: string;
  departmentOrder?: string[];
  [key: string]: unknown;
}

interface ArticleData {
  id: string;
  name: string;
  ownerId: string;
  departmentId?: string;
  categoryId?: string;
  notes?: string;
  icon?: string;
  [key: string]: unknown;
}

/**
 * Compute list counts exactly like selectListsWithCounts selector.
 */
export function computeListCounts(list: ListData): {
  totalItems: number;
  checkedItems: number;
  uncheckedItems: number;
} {
  const totalItems = list.articleIds.length;
  const checkedItems = Object.values(list.itemStates).filter(
    (state) => state.isChecked
  ).length;
  return {
    totalItems,
    checkedItems,
    uncheckedItems: totalItems - checkedItems,
  };
}

/**
 * Classify lists exactly like the selectors do.
 */
export function classifyLists(lists: ListData[]): {
  incomplete: ListData[];
  completed: ListData[];
  empty: ListData[];
} {
  const withCounts = lists.map((list) => ({
    ...list,
    ...computeListCounts(list),
  }));

  return {
    incomplete: withCounts.filter((l) => l.checkedItems < l.totalItems),
    completed: withCounts.filter(
      (l) => l.totalItems > 0 && l.checkedItems === l.totalItems
    ),
    empty: withCounts.filter((l) => l.totalItems === 0),
  };
}

/**
 * Get checked and unchecked items from a list, like selectCompletedArticlesFromList
 * and selectUncompletedArticlesFromList.
 */
export function getCheckedUncheckedItems(list: ListData): {
  checked: ItemState[];
  unchecked: ItemState[];
} {
  const checked = Object.values(list.itemStates)
    .filter((s) => s.isChecked)
    .sort((a, b) => {
      const dateA = a.checkedAt ? (a.checkedAt as { seconds: number }).seconds || 0 : 0;
      const dateB = b.checkedAt ? (b.checkedAt as { seconds: number }).seconds || 0 : 0;
      return dateB - dateA;
    });

  const unchecked = Object.values(list.itemStates).filter((s) => !s.isChecked);

  return { checked, unchecked };
}

/**
 * Count articles by department, like selectArticleCountByDepartment.
 */
export function countArticlesByDepartment(
  articles: ArticleData[]
): Map<string, number> {
  const counts = new Map<string, number>();
  articles.forEach((article) => {
    const dept = article.departmentId || 'none';
    counts.set(dept, (counts.get(dept) || 0) + 1);
  });
  return counts;
}

/**
 * Count articles by category, like selectArticleCountByCategory.
 */
export function countArticlesByCategory(
  articles: ArticleData[]
): Map<string, number> {
  const counts = new Map<string, number>();
  articles.forEach((article) => {
    const cat = article.categoryId || 'none';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  });
  return counts;
}

/**
 * Search articles by name, like selectArticlesByNameSearch.
 */
export function searchArticlesByName(
  articles: ArticleData[],
  searchTerm: string
): ArticleData[] {
  if (!searchTerm || searchTerm.trim().length === 0) return articles;
  const term = searchTerm.toLowerCase().trim();
  return articles.filter((a) => a.name.toLowerCase().includes(term));
}
