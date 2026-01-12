/**
 * Firebase Emulator Test Utilities
 *
 * These utilities are for integration tests that directly test Firebase operations
 * without needing a browser. These tests can be run automatically.
 *
 * Uses the regular Firebase SDK with emulator connection (compatible with Firebase 11.x)
 */

import { initializeApp, FirebaseApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

let testApp: FirebaseApp | null = null;
let testAuth: Auth | null = null;
let testFirestore: Firestore | null = null;

const TEST_CONFIG = {
  apiKey: 'fake-api-key',
  authDomain: 'localhost',
  projectId: 'shoplisl-test',
  storageBucket: 'shoplisl-test.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:test'
};

/**
 * Initialize Firebase emulator test environment
 */
export async function setupEmulators(): Promise<{ app: FirebaseApp; auth: Auth; firestore: Firestore }> {
  if (testApp && testAuth && testFirestore) {
    return { app: testApp, auth: testAuth, firestore: testFirestore };
  }

  // Initialize Firebase app
  testApp = initializeApp(TEST_CONFIG, 'test-app');

  // Initialize Auth and connect to emulator
  testAuth = getAuth(testApp);
  connectAuthEmulator(testAuth, 'http://localhost:9099', { disableWarnings: true });

  // Initialize Firestore and connect to emulator
  testFirestore = getFirestore(testApp);
  connectFirestoreEmulator(testFirestore, 'localhost', 8080);

  return { app: testApp, auth: testAuth, firestore: testFirestore };
}

/**
 * Clear all data from Firestore emulator
 */
export async function clearFirestore(): Promise<void> {
  try {
    const response = await fetch('http://localhost:8080/emulator/v1/projects/shoplisl-test/databases/(default)/documents', {
      method: 'DELETE'
    });

    if (!response.ok) {
      console.warn('Failed to clear Firestore emulator:', response.statusText);
    }
  } catch (error) {
    console.warn('Error clearing Firestore emulator:', error);
  }
}

/**
 * Clear all users from Auth emulator
 */
export async function clearAuth(): Promise<void> {
  try {
    const response = await fetch('http://localhost:9099/emulator/v1/projects/shoplisl-test/accounts', {
      method: 'DELETE'
    });

    if (!response.ok) {
      console.warn('Failed to clear Auth emulator:', response.statusText);
    }
  } catch (error) {
    console.warn('Error clearing Auth emulator:', error);
  }
}

/**
 * Clear all data from emulators (reset state)
 */
export async function clearEmulators(): Promise<void> {
  await Promise.all([
    clearFirestore(),
    clearAuth()
  ]);
}

/**
 * Cleanup and close emulator connections
 */
export async function cleanupEmulators(): Promise<void> {
  if (testApp) {
    await deleteApp(testApp);
    testApp = null;
    testAuth = null;
    testFirestore = null;
  }
}

/**
 * Get Firestore instance for testing
 */
export function getTestFirestore(): Firestore {
  if (!testFirestore) {
    throw new Error('Test environment not initialized. Call setupEmulators() first.');
  }
  return testFirestore;
}

/**
 * Get Auth instance for testing
 */
export function getTestAuth(): Auth {
  if (!testAuth) {
    throw new Error('Test environment not initialized. Call setupEmulators() first.');
  }
  return testAuth;
}

/**
 * Create a test user in Auth emulator
 */
export async function createTestUser(email: string, password: string = 'testPassword123'): Promise<any> {
  const auth = getTestAuth();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      localId: userCredential.user.uid,
    };
  } catch (error: any) {
    // If user already exists, sign them in instead
    if (error.code === 'auth/email-already-in-use') {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        localId: userCredential.user.uid,
      };
    }
    throw error;
  }
}

/**
 * Sign in test user
 */
export async function signInTestUser(email: string, password: string = 'testPassword123'): Promise<any> {
  const auth = getTestAuth();
  const userCredential = await signInWithEmailAndPassword(auth, email, password);

  return {
    uid: userCredential.user.uid,
    email: userCredential.user.email,
    localId: userCredential.user.uid,
  };
}

/**
 * Sign out current user
 */
export async function signOutTestUser(): Promise<void> {
  const auth = getTestAuth();
  await auth.signOut();
}

/**
 * Helper to get a Firestore reference with authentication context
 * This simulates having a user authenticated when accessing Firestore
 */
export async function getAuthenticatedFirestore(email: string, password: string = 'testPassword123'): Promise<{ db: Firestore; userId: string }> {
  const auth = getTestAuth();
  const db = getTestFirestore();

  // Create or sign in user (this sets the auth state)
  const user = await createTestUser(email, password);

  // Wait a moment for auth state to propagate to Firestore
  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    db,
    userId: user.uid
  };
}
