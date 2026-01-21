/**
 * TARGETED RESTORE SCRIPT: Restore Specific Lists from Backup
 *
 * This script restores only specific lists and their articles from a backup.
 *
 * Usage:
 *   npm run restore:specific -- backups/latest.json --dry-run
 *   npm run restore:specific -- backups/latest.json --execute
 *
 * Safety:
 *   - Dry-run by default
 *   - Shows what will be restored
 *   - Only restores specified list IDs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const backupFile = args.find(arg => !arg.startsWith('--'));
const executeArg = args.includes('--execute');
const DRY_RUN = !executeArg;

// SPECIFIC LIST IDs TO RESTORE
const TARGET_LIST_IDS = [
  'bwG4wE8gqjn78pRsOwic',   // DM/Bipa
  'Krvv5jHvgKeRAZTR6uDH',   // Birgit Urlaub Como
  'FoIhdc4QqfgUx57JeRLD',   // Hofer
  'CemqHIYJ868O89362x9V',   // Sutterlüty
  '62PhcxI5ivkgfhdlNbaR'    // Lädele
];

if (!backupFile) {
  console.error('❌ Missing backup file argument');
  console.error('\nUsage:');
  console.error('  npm run restore:specific -- backups/latest.json --dry-run');
  console.error('  npm run restore:specific -- backups/latest.json --execute');
  process.exit(1);
}

interface BackupData {
  timestamp: string;
  users: {
    [userId: string]: {
      lists: any[];
      articles: any[];
    };
  };
  stats: {
    totalUsers: number;
    totalLists: number;
    totalArticles: number;
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('🎯 TARGETED RESTORE: Restore Specific Lists from Backup');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  EXECUTE (will make changes)'}`);
  console.log(`Backup File: ${backupFile}`);
  console.log(`Target Lists: ${TARGET_LIST_IDS.length}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Load backup file
  const backupPath = path.isAbsolute(backupFile)
    ? backupFile
    : path.join(process.cwd(), backupFile);

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ ERROR: Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  const backup: BackupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  console.log('📊 Backup Information:');
  console.log(`   Created: ${backup.timestamp}`);
  console.log(`   Users: ${backup.stats.totalUsers}`);
  console.log(`   Lists: ${backup.stats.totalLists}`);
  console.log(`   Articles: ${backup.stats.totalArticles}\n`);

  // Find target lists in backup
  const listsToRestore: Array<{ userId: string; list: any }> = [];
  const articleIdsNeeded = new Set<string>();

  for (const [userId, userData] of Object.entries(backup.users)) {
    for (const list of userData.lists) {
      if (TARGET_LIST_IDS.includes(list.id)) {
        listsToRestore.push({ userId, list });

        // Collect all article IDs from this list
        if (list.articleIds && Array.isArray(list.articleIds)) {
          list.articleIds.forEach((id: string) => articleIdsNeeded.add(id));
        }

        console.log(`✅ Found target list: ${list.name} (${list.id})`);
        console.log(`   Owner: ${userId}`);
        console.log(`   Articles: ${list.articleIds?.length || 0}`);
        console.log(`   ItemStates: ${Object.keys(list.itemStates || {}).length}`);
        console.log(`   Shared with: ${list.sharedWith?.length || 0} users\n`);
      }
    }
  }

  if (listsToRestore.length === 0) {
    console.error('❌ ERROR: No target lists found in backup');
    process.exit(1);
  }

  console.log(`\n📦 Need to restore ${articleIdsNeeded.size} articles for these lists\n`);

  // Find articles that belong to these lists
  const articlesToRestore: Array<{ userId: string; article: any }> = [];

  for (const [userId, userData] of Object.entries(backup.users)) {
    for (const article of userData.articles) {
      if (articleIdsNeeded.has(article.id)) {
        articlesToRestore.push({ userId, article });
      }
    }
  }

  console.log(`✅ Found ${articlesToRestore.length} articles in backup\n`);

  if (DRY_RUN) {
    console.log('💡 DRY RUN MODE - What would be restored:\n');

    console.log('📋 Lists:');
    listsToRestore.forEach(({ userId, list }) => {
      console.log(`   - ${list.name} (${list.id})`);
      console.log(`     Owner: ${userId}`);
      console.log(`     Path: users-v2/${userId}/lists/${list.id}`);
    });

    console.log('\n📄 Articles:');
    const articlesGrouped = new Map<string, any[]>();
    articlesToRestore.forEach(({ userId, article }) => {
      if (!articlesGrouped.has(userId)) {
        articlesGrouped.set(userId, []);
      }
      articlesGrouped.get(userId)!.push(article);
    });

    articlesGrouped.forEach((articles, userId) => {
      console.log(`   User ${userId}: ${articles.length} articles`);
    });

    console.log('\n💡 To execute this restore, run with: --execute\n');
    return;
  }

  // Execute restore
  console.log('⚠️  EXECUTING RESTORE...\n');

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(process.cwd(), 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  let restoredLists = 0;
  let restoredArticles = 0;

  // Restore lists
  console.log('📋 Restoring lists...');
  for (const { userId, list } of listsToRestore) {
    const listRef = db.doc(`users-v2/${userId}/lists/${list.id}`);

    // Convert ISO strings back to Firestore Timestamps
    const listData = {
      ...list,
      createdAt: list.createdAt ? Timestamp.fromDate(new Date(list.createdAt)) : Timestamp.now(),
      updatedAt: Timestamp.now()  // Update to now to mark as restored
    };

    delete listData.id; // Remove id from data (it's in the doc path)

    await listRef.set(listData, { merge: true });
    restoredLists++;
    console.log(`   ✅ Restored list: ${list.name}`);
  }

  // Restore articles
  console.log('\n📄 Restoring articles...');
  for (const { userId, article } of articlesToRestore) {
    const articleRef = db.doc(`users-v2/${userId}/articles/${article.id}`);

    const articleData = {
      ...article,
      createdAt: article.createdAt ? Timestamp.fromDate(new Date(article.createdAt)) : Timestamp.now(),
      updatedAt: article.updatedAt ? Timestamp.fromDate(new Date(article.updatedAt)) : Timestamp.now()
    };

    delete articleData.id;

    await articleRef.set(articleData, { merge: true });
    restoredArticles++;
  }
  console.log(`   ✅ Restored ${restoredArticles} articles`);

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESTORE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Lists restored: ${restoredLists}`);
  console.log(`Articles restored: ${restoredArticles}`);
  console.log('='.repeat(80));
  console.log('\n✅ Targeted restore complete!\n');
  console.log('💡 Tip: Refresh the app to see the restored data\n');
}

// Run the restore
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
