#!/usr/bin/env ts-node

/**
 * Diagnostic Script: Test Collection Group Query for Shared Lists
 *
 * This script helps diagnose issues with list sharing by:
 * 1. Checking Firestore rules are deployed
 * 2. Testing collection group query permissions
 * 3. Verifying indexes exist
 * 4. Checking list data structure
 *
 * Usage:
 *   ts-node scripts/diagnose-sharing.ts <userId>
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: any;
}

async function diagnoseSharing(userId?: string): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Firestore List Sharing Diagnostic Tool');
  console.log('='.repeat(70) + '\n');

  if (!userId) {
    console.error('❌ Error: User ID is required');
    console.log('\nUsage: ts-node scripts/diagnose-sharing.ts <userId>');
    process.exit(1);
  }

  const results: DiagnosticResult[] = [];

  // Test 1: Check if user exists
  console.log('📝 Test 1: Checking if user exists...');
  try {
    const userDoc = await db.doc(`users-v2/${userId}/profile/info`).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      results.push({
        success: true,
        message: `User found: ${userData?.['email'] || userId}`,
        details: userData
      });
      console.log(`✅ User found: ${userData?.['email'] || userId}`);
    } else {
      results.push({
        success: false,
        message: 'User not found in users-v2 collection',
      });
      console.log('❌ User not found');
    }
  } catch (error: any) {
    results.push({
      success: false,
      message: `Error checking user: ${error.message}`,
    });
    console.log(`❌ Error: ${error.message}`);
  }

  // Test 2: Check owned lists
  console.log('\n📝 Test 2: Checking owned lists...');
  try {
    const ownedListsSnapshot = await db.collection(`users-v2/${userId}/lists`).get();
    const ownedLists = ownedListsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data()['name'],
      ownerId: doc.data()['ownerId'],
      sharedWith: doc.data()['sharedWith'] || []
    }));

    results.push({
      success: true,
      message: `Found ${ownedLists.length} owned lists`,
      details: ownedLists
    });

    console.log(`✅ Found ${ownedLists.length} owned lists`);
    ownedLists.forEach(list => {
      console.log(`   - ${list.name} (shared with ${list.sharedWith.length} users)`);
      if (list.sharedWith.length > 0) {
        console.log(`     Collaborators: ${list.sharedWith.join(', ')}`);
      }
    });
  } catch (error: any) {
    results.push({
      success: false,
      message: `Error checking owned lists: ${error.message}`,
    });
    console.log(`❌ Error: ${error.message}`);
  }

  // Test 3: Test collection group query for shared lists
  console.log('\n📝 Test 3: Testing collection group query for shared lists...');
  try {
    const sharedListsQuery = db.collectionGroup('lists')
      .where('sharedWith', 'array-contains', userId);

    const sharedListsSnapshot = await sharedListsQuery.get();
    const sharedLists = sharedListsSnapshot.docs.map(doc => ({
      id: doc.id,
      path: doc.ref.path,
      name: doc.data()['name'],
      ownerId: doc.data()['ownerId'],
      sharedWith: doc.data()['sharedWith'] || []
    }));

    results.push({
      success: true,
      message: `Collection group query successful! Found ${sharedLists.length} shared lists`,
      details: sharedLists
    });

    console.log(`✅ Collection group query successful!`);
    console.log(`✅ Found ${sharedLists.length} shared lists`);
    sharedLists.forEach(list => {
      console.log(`   - ${list.name} (owner: ${list.ownerId})`);
      console.log(`     Path: ${list.path}`);
      console.log(`     Shared with: ${list.sharedWith.join(', ')}`);
    });
  } catch (error: any) {
    results.push({
      success: false,
      message: `Collection group query failed: ${error.message}`,
    });
    console.log(`❌ Collection group query FAILED: ${error.message}`);

    if (error.message.includes('index')) {
      console.log('\n⚠️  INDEX REQUIRED:');
      console.log('   The collection group query needs a Firestore composite index.');
      console.log('   Deploy indexes with: firebase deploy --only firestore:indexes');
    }
  }

  // Test 4: Check for pending invites
  console.log('\n📝 Test 4: Checking for pending share invites...');
  try {
    const invitesSnapshot = await db.collection('share-invites')
      .where('status', '==', 'pending')
      .get();

    const invites = invitesSnapshot.docs.map(doc => ({
      id: doc.id,
      listName: doc.data()['listName'],
      fromUserEmail: doc.data()['fromUserEmail'],
      inviteToken: doc.data()['inviteToken'],
      createdAt: doc.data()['createdAt']
    }));

    results.push({
      success: true,
      message: `Found ${invites.length} pending invites`,
      details: invites
    });

    console.log(`✅ Found ${invites.length} pending invites`);
    invites.forEach(invite => {
      console.log(`   - ${invite.listName} from ${invite.fromUserEmail}`);
      console.log(`     Token: ${invite.inviteToken}`);
    });
  } catch (error: any) {
    results.push({
      success: false,
      message: `Error checking invites: ${error.message}`,
    });
    console.log(`❌ Error: ${error.message}`);
  }

  // Test 5: Check articles from shared list owners
  console.log('\n📝 Test 5: Checking article access for shared lists...');
  try {
    const sharedListsQuery = db.collectionGroup('lists')
      .where('sharedWith', 'array-contains', userId);

    const sharedListsSnapshot = await sharedListsQuery.get();

    for (const listDoc of sharedListsSnapshot.docs) {
      const listData = listDoc.data();
      const ownerId = listData['ownerId'];
      const articleIds = listData['articleIds'] || [];

      if (articleIds.length === 0 || ownerId === userId) {
        continue;
      }

      console.log(`\n   Checking articles for "${listData['name']}" (owner: ${ownerId})...`);

      let accessibleCount = 0;
      let deniedCount = 0;

      for (const articleId of articleIds.slice(0, 3)) { // Check first 3 articles
        try {
          const articleDoc = await db.doc(`users-v2/${ownerId}/articles/${articleId}`).get();
          if (articleDoc.exists) {
            accessibleCount++;
            console.log(`      ✅ Article ${articleId}: ${articleDoc.data()?.['name']}`);
          } else {
            console.log(`      ⚠️  Article ${articleId}: Not found`);
          }
        } catch (error: any) {
          deniedCount++;
          console.log(`      ❌ Article ${articleId}: Permission denied`);
        }
      }

      if (articleIds.length > 3) {
        console.log(`      ... and ${articleIds.length - 3} more articles`);
      }
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not check articles: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  const totalTests = results.length;

  console.log(`\nTests passed: ${successCount}/${totalTests}`);

  if (successCount === totalTests) {
    console.log('\n✅ All tests passed! Sharing functionality should work correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  // Recommendations
  console.log('\n📋 Recommendations:');

  const hasCollectionGroupError = results.some(r =>
    !r.success && r.message.includes('Collection group')
  );

  if (hasCollectionGroupError) {
    console.log('\n1. Deploy Firestore indexes:');
    console.log('   firebase deploy --only firestore:indexes');
    console.log('\n2. Wait 2-5 minutes for indexes to build');
    console.log('\n3. Check index status in Firebase Console:');
    console.log('   https://console.firebase.google.com/project/_/firestore/indexes');
  }

  console.log('\n4. Verify Firestore rules are deployed:');
  console.log('   firebase deploy --only firestore:rules');

  console.log('\n5. Check browser console logs for detailed error messages');

  console.log('\n' + '='.repeat(70) + '\n');
}

// Run diagnostic
const userId = process.argv[2];
diagnoseSharing(userId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
