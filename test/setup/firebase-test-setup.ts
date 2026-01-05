/**
 * Firebase Emulator Test Setup
 *
 * Provides utilities for connecting to Firebase Emulator Suite in tests
 */

import { initializeApp, FirebaseApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
  collection,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';

/**
 * Firebase Emulator configuration
 * Must match values in firebase.json
 */
const EMULATOR_CONFIG = {
  firestore: {
    host: 'localhost',
    port: 8081, // Updated from 8080 to avoid conflict with PWA
  },
  auth: {
    host: 'localhost',
    port: 9099,
  },
};

/**
 * Test Firebase configuration
 * Uses fake project ID for emulator testing
 */
const TEST_FIREBASE_CONFIG = {
  apiKey: 'test-api-key',
  authDomain: 'test-project.firebaseapp.com',
  projectId: 'test-project-id',
  storageBucket: 'test-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef123456',
};

/**
 * Active Firebase app instance
 * Stored globally to allow cleanup
 */
let testApp: FirebaseApp | null = null;
let testFirestore: Firestore | null = null;
let testAuth: Auth | null = null;

/**
 * Initialize Firebase app connected to emulator
 *
 * @param appName Optional unique name for the app instance
 * @returns Object with initialized Firebase services
 */
export function initializeTestFirebase(appName = `test-app-${Date.now()}`): {
  app: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
} {
  // Clean up existing instance if any
  if (testApp) {
    deleteApp(testApp);
  }

  // Initialize new app
  testApp = initializeApp(TEST_FIREBASE_CONFIG, appName);

  // Initialize Firestore and connect to emulator
  testFirestore = getFirestore(testApp);
  connectFirestoreEmulator(
    testFirestore,
    EMULATOR_CONFIG.firestore.host,
    EMULATOR_CONFIG.firestore.port
  );

  // Initialize Auth and connect to emulator
  testAuth = getAuth(testApp);
  connectAuthEmulator(
    testAuth,
    `http://${EMULATOR_CONFIG.auth.host}:${EMULATOR_CONFIG.auth.port}`,
    { disableWarnings: true }
  );

  return {
    app: testApp,
    firestore: testFirestore,
    auth: testAuth,
  };
}

/**
 * Clean up Firebase app instance
 * Should be called in afterEach or afterAll
 */
export async function cleanupTestFirebase(): Promise<void> {
  if (testApp) {
    await deleteApp(testApp);
    testApp = null;
    testFirestore = null;
    testAuth = null;
  }
}

/**
 * Clear all data from Firestore emulator
 * Useful for ensuring clean state between tests
 *
 * @param firestore Firestore instance to clear
 * @param collections Array of collection names to clear
 */
export async function clearFirestoreData(
  firestore: Firestore,
  collections: string[]
): Promise<void> {
  const deletePromises: Promise<void>[] = [];

  for (const collectionName of collections) {
    const collectionRef = collection(firestore, collectionName);
    const snapshot = await getDocs(collectionRef);

    snapshot.docs.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
  }

  await Promise.all(deletePromises);
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
