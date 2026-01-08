#!/usr/bin/env node
/**
 * Article IDs Recovery Script (CommonJS version)
 *
 * Recovers articleIds from old database location and sets all articles to CHECKED state
 *
 * Usage:
 *   npm run recover:articles -- --dry-run
 *   npm run recover:articles -- --force
 *   npm run recover:articles -- --list=<listId>
 */

const admin = require('firebase-admin');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Service account key not found: serviceAccountKey.json');
    console.error('\n📝 To get the service account key:');
    console.error('  1. Go to https://console.firebase.google.com/project/shoplisl/settings/serviceaccounts/adminsdk');
    console.error('  2. Click "Generate new private key"');
    console.error('  3. Save as serviceAccountKey.json in project root\n');
    process.exit(1);
  }

  console.log('✅ Found service account key, initializing...\n');
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'shoplisl'
  });
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK');
  console.error('\nError:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    listId: args.find(arg => arg.startsWith('--list='))?.split('=')[1]
  };
}

// Get all lists from old location
async function getListsFromOldLocation() {
  console.log('📖 Reading lists from OLD location: users/shared-shoplisl-user/lists\n');

  const listsRef = db.collection('users').doc('shared-shoplisl-user').collection('lists');
  const snapshot = await listsRef.get();

  const lists = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    lists.push({
      id: doc.id,
      name: data.name || 'Unnamed',
      ownerId: data.ownerId
    });
  });

  return lists;
}

// Get list data from old location
async function getOldListData(listId) {
  const docRef = db.collection('users').doc('shared-shoplisl-user').collection('lists').doc(listId);
  const doc = await docRef.get();
  return doc.exists ? doc.data() : null;
}

// Get list data from new location
async function getNewListData(ownerId, listId) {
  const docRef = db.collection('users-v2').doc(ownerId).collection('lists').doc(listId);
  const doc = await docRef.get();
  return doc.exists ? doc.data() : null;
}

// Find ownerId by searching users-v2
async function findOwnerIdForList(listId, listName) {
  console.log(`   🔍 Searching for list "${listName}" in users-v2...`);

  const usersSnapshot = await db.collection('users-v2').get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const listRef = db.collection('users-v2').doc(userId).collection('lists').doc(listId);
    const listDoc = await listRef.get();

    if (listDoc.exists) {
      console.log(`   ✅ Found list in users-v2/${userId}/lists/${listId}`);
      return userId;
    }
  }

  console.log(`   ❌ List not found in any user's collection in users-v2`);
  return null;
}

// Recover a single list
async function recoverList(list, dryRun) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📦 Processing: ${list.name} (${list.id})`);
  console.log(`${'─'.repeat(70)}`);

  try {
    // Read from OLD location
    console.log(`   📖 Reading from OLD: users/shared-shoplisl-user/lists/${list.id}`);
    const oldData = await getOldListData(list.id);

    if (!oldData) {
      console.log(`   ❌ List not found in old location`);
      return false;
    }

    const oldArticleIds = oldData.articleIds || [];
    console.log(`   ✅ Found ${oldArticleIds.length} articles in old location`);

    if (oldArticleIds.length === 0) {
      console.log(`   ⚠️  No articles to recover (old location is empty)`);
      return false;
    }

    // Determine ownerId
    let ownerId = list.ownerId || oldData.ownerId;

    if (!ownerId) {
      console.log(`   ⚠️  No ownerId found, searching users-v2...`);
      ownerId = await findOwnerIdForList(list.id, list.name);

      if (!ownerId) {
        console.log(`   ❌ Cannot determine ownerId - skipping`);
        return false;
      }
    }

    console.log(`   👤 Owner ID: ${ownerId}`);

    // Read from NEW location
    const newPath = `users-v2/${ownerId}/lists/${list.id}`;
    console.log(`   📖 Reading from NEW: ${newPath}`);

    const newData = await getNewListData(ownerId, list.id);

    if (!newData) {
      console.log(`   ❌ List not found in new location: ${newPath}`);
      return false;
    }

    const currentArticleIds = newData.articleIds || [];
    console.log(`   📊 Current articles in new location: ${currentArticleIds.length}`);

    // Create itemStates for all recovered articles (CHECKED state)
    const itemStates = {};
    const timestamp = admin.firestore.Timestamp.now();

    oldArticleIds.forEach(articleId => {
      itemStates[articleId] = {
        checked: true,  // Set all recovered articles to CHECKED
        addedAt: timestamp
      };
    });

    console.log(`   ✅ Created itemStates for ${oldArticleIds.length} articles (all CHECKED)`);

    // Show recovery plan
    console.log(`\n   📋 RECOVERY PLAN:`);
    console.log(`      OLD location has: ${oldArticleIds.length} articles`);
    console.log(`      NEW location has: ${currentArticleIds.length} articles`);
    console.log(`      Will set all recovered articles to: CHECKED ✓`);

    if (currentArticleIds.length > 0 && currentArticleIds.length !== oldArticleIds.length) {
      console.log(`      ⚠️  NEW location has different number of articles!`);
    }

    // Write to new location
    if (!dryRun) {
      console.log(`\n   💾 Writing ${oldArticleIds.length} articleIds with CHECKED state to: ${newPath}`);

      const docRef = db.collection('users-v2').doc(ownerId).collection('lists').doc(list.id);

      await docRef.update({
        articleIds: oldArticleIds,
        itemStates: itemStates,  // Set all articles to checked state
        recoveredAt: admin.firestore.FieldValue.serverTimestamp(),
        recoveredFrom: `users/shared-shoplisl-user/lists/${list.id}`,
        recoveredCount: oldArticleIds.length
      });

      console.log(`   ✅ SUCCESS: Restored ${oldArticleIds.length} articles to ${list.name} (all CHECKED)`);
    } else {
      console.log(`\n   🔍 DRY RUN: Would write ${oldArticleIds.length} articleIds (all CHECKED) to: ${newPath}`);
    }

    return true;

  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    return false;
  }
}

// Confirm recovery
async function confirmRecovery(lists) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    console.log('\n⚠️  RECOVERY CONFIRMATION');
    console.log('━'.repeat(50));
    console.log(`Lists to recover: ${lists.length}`);
    lists.forEach(list => {
      console.log(`   - ${list.name} (${list.id})`);
    });
    console.log('━'.repeat(50));
    console.log('\n⚠️  This will overwrite articleIds and itemStates in the NEW location!');
    console.log('✓  All recovered articles will be set to CHECKED state\n');

    rl.question('Continue with recovery? (yes/no): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

// Main recovery function
async function recover() {
  console.log('🚀 Starting Article IDs Recovery...\n');
  console.log('This script will:');
  console.log('1. Read articleIds from OLD location: users/shared-shoplisl-user/lists');
  console.log('2. Write articleIds to NEW location: users-v2/{ownerId}/lists');
  console.log('3. Set all recovered articles to CHECKED state');
  console.log('4. Preserve original data in OLD location (no deletion)\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be written\n');
  }

  // Get lists to recover
  let listsToRecover;

  if (options.listId) {
    console.log(`📌 Recovering specific list: ${options.listId}\n`);
    const oldData = await getOldListData(options.listId);

    if (!oldData) {
      console.error(`❌ List ${options.listId} not found in old location`);
      process.exit(1);
    }

    listsToRecover = [{
      id: options.listId,
      name: oldData.name || 'Unnamed',
      ownerId: oldData.ownerId
    }];
  } else {
    listsToRecover = await getListsFromOldLocation();

    if (listsToRecover.length === 0) {
      console.log('❌ No lists found in old location');
      process.exit(0);
    }

    console.log(`Found ${listsToRecover.length} lists in old location:\n`);
    listsToRecover.forEach((list, index) => {
      console.log(`${index + 1}. ${list.name} (${list.id})`);
    });
  }

  // Confirm recovery
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRecovery(listsToRecover);
    if (!confirmed) {
      console.log('\n❌ Recovery cancelled by user');
      process.exit(0);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('STARTING RECOVERY');
  console.log('='.repeat(70));

  // Recover each list
  const results = { success: 0, failed: 0 };

  for (const list of listsToRecover) {
    const success = await recoverList(list, options.dryRun);
    if (success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  // Print summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 RECOVERY SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Recovered: ${results.success} lists`);
  console.log(`❌ Failed: ${results.failed} lists`);
  console.log(`${'='.repeat(70)}\n`);

  if (options.dryRun) {
    console.log('🔍 DRY RUN COMPLETE');
    console.log('   Run without --dry-run to perform actual recovery\n');
  } else {
    console.log('✨ Recovery complete!');
    console.log('   All recovered articles are now in CHECKED state.');
    console.log('   Refresh your app to see restored articles.\n');
  }
}

// Run recovery
recover()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Recovery failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
