#!/usr/bin/env ts-node

/**
 * Create Test Users for E2E Tests
 *
 * This script creates test users in Firebase Authentication
 * for use in Playwright E2E tests.
 *
 * Usage:
 *   ts-node scripts/create-test-users.ts
 */

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const testUsers = [
  {
    email: 'test-user-1@shoplisl.test',
    password: 'TestPassword123!',
    displayName: 'Test User 1',
  },
  {
    email: 'test-user-2@shoplisl.test',
    password: 'TestPassword123!',
    displayName: 'Test User 2',
  },
];

async function createTestUsers(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 Creating Test Users for E2E Tests');
  console.log('='.repeat(70) + '\n');

  for (const user of testUsers) {
    try {
      // Check if user already exists
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(user.email);
        console.log(`✅ User already exists: ${user.email}`);
        console.log(`   UID: ${userRecord.uid}`);
        console.log(`   Display Name: ${userRecord.displayName || 'Not set'}`);
        console.log('');
        continue;
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      // Create new user
      userRecord = await admin.auth().createUser({
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true, // Skip email verification for test users
      });

      console.log(`✅ Created user: ${user.email}`);
      console.log(`   UID: ${userRecord.uid}`);
      console.log(`   Display Name: ${userRecord.displayName}`);
      console.log('');
    } catch (error: any) {
      console.error(`❌ Failed to create user ${user.email}:`, error.message);
      console.log('');
    }
  }

  console.log('='.repeat(70));
  console.log('✅ Test User Setup Complete!');
  console.log('='.repeat(70));
  console.log('\n📝 Next Steps:');
  console.log('1. Update e2e/fixtures/auth.fixture.ts if you changed credentials');
  console.log('2. Run E2E tests: npm run test:e2e');
  console.log('3. Or run in UI mode: npm run test:e2e:ui\n');
}

// Run the script
createTestUsers()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
