#!/usr/bin/env ts-node
/**
 * Article IDs Recovery Script
 *
 * Recovers articleIds from old database location (users/shared-shoplisl-user/lists)
 * to new database location (users-v2/{ownerId}/lists)
 *
 * Usage:
 *   npx ts-node scripts/recover-article-ids.ts [--dry-run] [--force]
 *
 * Options:
 *   --dry-run    Preview without writing to Firestore
 *   --force      Skip confirmation prompt
 *   --list=<id>  Recover only specific list by ID (for testing)
 */

import * as admin from 'firebase-admin';
import * as readline from 'readline';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface RecoveryOptions {
  dryRun: boolean;
  force: boolean;
  listId?: string;
}

interface ListInfo {
  id: string;
  name: string;
  ownerId?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): RecoveryOptions {
  const args = process.argv.slice(2);
  const options: RecoveryOptions = {
    dryRun: false,
    force: false
  };

  args.forEach(arg => {
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
    if (arg === '--force') {
      options.force = true;
    }
    if (arg.startsWith('--list=')) {
      options.listId = arg.split('=')[1];
    }
  });

  return options;
}

/**
 * Get all lists from old location
 */
async function getListsFromOldLocation(): Promise<ListInfo[]> {
  console.log('📖 Reading lists from OLD location: users/shared-shoplisl-user/lists\n');

  const listsRef = db.collection('users').doc('shared-shoplisl-user').collection('lists');
  const snapshot = await listsRef.get();

  const lists: ListInfo[] = [];

  snapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const data = doc.data();
    lists.push({
      id: doc.id,
      name: data.name || 'Unnamed',
      ownerId: data.ownerId
    });
  });

  return lists;
}

/**
 * Get list details from old location
 */
async function getOldListData(listId: string): Promise<any> {
  const docRef = db.collection('users').doc('shared-shoplisl-user').collection('lists').doc(listId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data();
}

/**
 * Get list details from new location
 */
async function getNewListData(ownerId: string, listId: string): Promise<any> {
  const docRef = db.collection('users-v2').doc(ownerId).collection('lists').doc(listId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data();
}

/**
 * Find the ownerId for a list by checking all users-v2
 */
async function findOwnerIdForList(listId: string, listName: string): Promise<string | null> {
  console.log(`   🔍 Searching for list "${listName}" in users-v2...`);

  // Get all users from users-v2
  const usersSnapshot = await db.collection('users-v2').get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const listRef = db.collection('users-v2').doc(userId).collection('lists').doc(listId);
    const listDoc = await listRef.get();

    if (listDoc.exists()) {
      console.log(`   ✅ Found list in users-v2/${userId}/lists/${listId}`);
      return userId;
    }
  }

  console.log(`   ❌ List not found in any user's collection in users-v2`);
  return null;
}

/**
 * Recover articleIds for a single list
 */
async function recoverList(list: ListInfo, dryRun: boolean): Promise<boolean> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📦 Processing: ${list.name} (${list.id})`);
  console.log(`${'─'.repeat(70)}`);

  try {
    // Step 1: Read from OLD location
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

    // Step 2: Determine ownerId
    let ownerId = list.ownerId || oldData.ownerId;

    if (!ownerId) {
      console.log(`   ⚠️  No ownerId found in old data, searching users-v2...`);
      ownerId = await findOwnerIdForList(list.id, list.name);

      if (!ownerId) {
        console.log(`   ❌ Cannot determine ownerId - skipping this list`);
        return false;
      }
    }

    console.log(`   👤 Owner ID: ${ownerId}`);

    // Step 3: Read from NEW location
    const newPath = `users-v2/${ownerId}/lists/${list.id}`;
    console.log(`   📖 Reading from NEW: ${newPath}`);

    const newData = await getNewListData(ownerId, list.id);

    if (!newData) {
      console.log(`   ❌ List not found in new location: ${newPath}`);
      console.log(`   ℹ️  You may need to migrate the entire list structure first`);
      return false;
    }

    const currentArticleIds = newData.articleIds || [];
    console.log(`   📊 Current articles in new location: ${currentArticleIds.length}`);

    // Step 4: Show recovery plan
    console.log(`\n   📋 RECOVERY PLAN:`);
    console.log(`      OLD location has: ${oldArticleIds.length} articles`);
    console.log(`      NEW location has: ${currentArticleIds.length} articles`);

    if (currentArticleIds.length > 0 && currentArticleIds.length !== oldArticleIds.length) {
      console.log(`      ⚠️  NEW location has different number of articles!`);
    }

    // Step 5: Write to new location
    if (!dryRun) {
      console.log(`\n   💾 Writing ${oldArticleIds.length} articleIds to: ${newPath}`);

      const docRef = db.collection('users-v2').doc(ownerId).collection('lists').doc(list.id);

      await docRef.update({
        articleIds: oldArticleIds,
        recoveredAt: admin.firestore.FieldValue.serverTimestamp(),
        recoveredFrom: `users/shared-shoplisl-user/lists/${list.id}`,
        recoveredCount: oldArticleIds.length
      });

      console.log(`   ✅ SUCCESS: Restored ${oldArticleIds.length} articles to ${list.name}`);
    } else {
      console.log(`\n   🔍 DRY RUN: Would write ${oldArticleIds.length} articleIds to: ${newPath}`);
    }

    return true;

  } catch (error: any) {
    console.error(`   ❌ ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Confirm recovery operation
 */
async function confirmRecovery(lists: ListInfo[], dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    return true; // No confirmation needed for dry run
  }

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
    console.log('\n⚠️  This will overwrite articleIds in the NEW location!\n');

    rl.question('Continue with recovery? (yes/no): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Main recovery function
 */
async function recover(): Promise<void> {
  console.log('🚀 Starting Article IDs Recovery...\n');
  console.log('This script will:');
  console.log('1. Read articleIds from OLD location: users/shared-shoplisl-user/lists');
  console.log('2. Write articleIds to NEW location: users-v2/{ownerId}/lists');
  console.log('3. Preserve original data in OLD location (no deletion)\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be written\n');
  }

  // Get lists to recover
  let listsToRecover: ListInfo[];

  if (options.listId) {
    // Recover specific list only
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
    // Recover all lists
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

  // Confirm recovery (unless --force or --dry-run)
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRecovery(listsToRecover, options.dryRun);
    if (!confirmed) {
      console.log('\n❌ Recovery cancelled by user');
      process.exit(0);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('STARTING RECOVERY');
  console.log('='.repeat(70));

  // Recover each list
  const results = {
    success: 0,
    failed: 0,
    skipped: 0
  };

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
