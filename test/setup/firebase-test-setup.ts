/**
 * Firebase Emulator Test Setup
 *
 * Provides utilities for connecting to Firebase Emulator Suite in tests
 * Uses @firebase/rules-unit-testing for proper security rules testing
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Firestore } from 'firebase/firestore';

/**
 * Firebase Emulator configuration
 * Must match values in firebase.json
 */
const EMULATOR_CONFIG = {
  projectId: 'test-project-id',
  firestore: {
    host: 'localhost',
    port: 8081, // Updated from 8080 to avoid conflict with PWA
  },
};

/**
 * Active test environment instance
 * Stored globally to allow cleanup
 */
let testEnv: RulesTestEnvironment | null = null;

/**
 * Initialize Firebase test environment with security rules
 *
 * @returns Test environment with Firestore and Auth
 */
export async function initializeTestFirebase(): Promise<{
  env: RulesTestEnvironment;
  firestore: Firestore;
  getAuthContext: (userId: string) => RulesTestContext;
  getUnauthContext: () => RulesTestContext;
}> {
  // Clean up existing instance if any
  if (testEnv) {
    await testEnv.cleanup();
  }

  // Load security rules from firestore.rules
  const rulesPath = resolve(__dirname, '../../firestore.rules');
  const rules = readFileSync(rulesPath, 'utf8');

  // Initialize test environment
  testEnv = await initializeTestEnvironment({
    projectId: EMULATOR_CONFIG.projectId,
    firestore: {
      host: EMULATOR_CONFIG.firestore.host,
      port: EMULATOR_CONFIG.firestore.port,
      rules,
    },
  });

  // Get unauthenticated context for initial setup
  const unauthContext = testEnv.unauthenticatedContext();

  return {
    env: testEnv,
    firestore: unauthContext.firestore() as unknown as Firestore,
    getAuthContext: (userId: string) => testEnv!.authenticatedContext(userId),
    getUnauthContext: () => testEnv!.unauthenticatedContext(),
  };
}

/**
 * Clean up Firebase test environment
 * Should be called in afterAll
 */
export async function cleanupTestFirebase(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * Clear all data from Firestore emulator
 * Useful for ensuring clean state between tests
 */
export async function clearFirestoreData(): Promise<void> {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
}

/**
 * Get authenticated Firestore instance for a specific user
 *
 * @param userId User ID to authenticate as
 * @returns Firestore instance with auth context
 */
export function getAuthenticatedFirestore(userId: string): Firestore {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initializeTestFirebase() first.');
  }

  const context = testEnv.authenticatedContext(userId);
  return context.firestore() as unknown as Firestore;
}

/**
 * Get unauthenticated Firestore instance
 * Useful for testing security rules that should block unauthenticated access
 *
 * @returns Firestore instance without auth context
 */
export function getUnauthenticatedFirestore(): Firestore {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initializeTestFirebase() first.');
  }

  const context = testEnv.unauthenticatedContext();
  return context.firestore() as unknown as Firestore;
}

/**
 * Wait for Firestore listener to receive updates
 * Useful for testing real-time sync behavior
 *
 * @param ms Milliseconds to wait (default: 500ms)
 */
export function waitForFirestoreSync(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if Firebase emulator is running
 * Attempts to connect and returns boolean
 */
export async function isEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `http://${EMULATOR_CONFIG.firestore.host}:${EMULATOR_CONFIG.firestore.port}`
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get Firestore emulator URL for debugging
 */
export function getEmulatorUrl(): string {
  return `http://${EMULATOR_CONFIG.firestore.host}:${EMULATOR_CONFIG.firestore.port}`;
}

/**
 * Export assertion helpers for security rules testing
 */
export { assertSucceeds, assertFails };
