/**
 * Firebase Emulator Test Utilities
 *
 * These utilities are for integration tests that directly test Firebase operations
 * without needing a browser. These tests can be run by Claude automatically.
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment | null = null;

/**
 * Initialize Firebase emulator test environment
 */
export async function setupEmulators(): Promise<RulesTestEnvironment> {
  if (testEnv) {
    return testEnv;
  }

  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'shoplisl-test',
    firestore: {
      host: 'localhost',
      port: 8080,
      rules,
    },
  });

  return testEnv;
}

/**
 * Clear all data from emulators (reset state)
 */
export async function clearEmulators(): Promise<void> {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
}

/**
 * Cleanup and close emulator connections
 */
export async function cleanupEmulators(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * Get authenticated context for a user
 */
export function getAuthenticatedContext(userId: string) {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call setupEmulators() first.');
  }
  return testEnv.authenticatedContext(userId);
}

/**
 * Get unauthenticated context
 */
export function getUnauthenticatedContext() {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call setupEmulators() first.');
  }
  return testEnv.unauthenticatedContext();
}

/**
 * Create a test user in Auth emulator via REST API
 */
export async function createTestUser(email: string, password: string = 'testPassword123'): Promise<any> {
  const response = await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create test user: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Sign in test user via Auth emulator REST API
 */
export async function signInTestUser(email: string, password: string = 'testPassword123'): Promise<any> {
  const response = await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sign in test user: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete all users from Auth emulator
 */
export async function clearAuthUsers(): Promise<void> {
  const response = await fetch('http://localhost:9099/emulator/v1/projects/shoplisl-test/accounts', {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear auth users: ${response.statusText}`);
  }
}
