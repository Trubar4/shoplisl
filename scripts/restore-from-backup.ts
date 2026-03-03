/**
 * RESTORE SCRIPT: Restore Firestore from Full Backup
 *
 * This script restores data from a full backup JSON file.
 *
 * Usage:
 *   npm run restore:backup -- backups/latest.json --dry-run
 *   npm run restore:backup -- backups/latest.json --execute
 *   npm run restore:backup -- backups/firestore-backup-2026-01-17.json --execute
 *
 * Safety:
 *   - Dry-run by default
 *   - Shows what will be restored
 *   - Can restore specific users only
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const backupFile = args.find(arg => !arg.startsWith('--'));
// npm intercepts --execute and sets npm_config_execute instead of passing it through.
// Check both so the flag works whether invoked via npm run or npx tsx directly.
const executeArg = args.includes('--execute') || process.env['npm_config_execute'] !== undefined;
const DRY_RUN = !executeArg;

if (!backupFile) {
  console.error('❌ Missing backup file argument');
  console.error('\nUsage:');
  console.error('  npm run restore:backup -- backups/latest.json --dry-run');
  console.error('  npm run restore:backup -- backups/latest.json --execute');
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

/**
 * Recursively convert every ISO-8601 string back to a Firestore Timestamp.
 * This is the inverse of deepConvertTimestamps() in the backup script, and
 * ensures itemStates — including history[].timestamp, addedAt, checkedAt —
 * are restored as proper Firestore Timestamps, not plain strings.
 */
function deepConvertToTimestamps(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // ISO-8601 date string produced by the backup script
  if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
    const d = new Date(obj);
    if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertToTimestamps(item));
  }

  if (typeof obj === 'object') {
    const out: any = {};
    for (const key of Object.keys(obj)) {
      out[key] = deepConvertToTimestamps(obj[key]);
    }
    return out;
  }

  return obj;
}

async function main() {
  console.log('='.repeat(80));
  console.log('🔄 RESTORE: Restore Firestore from Backup');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  EXECUTE (will make changes)'}`);
  console.log(`Backup File: ${backupFile}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Load backup file
  const backupPath = path.isAbsolute(backupFile)
    ? backupFile
    : path.join(__dirname, '..', backupFile);

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

  if (DRY_RUN) {
    console.log('💡 DRY RUN MODE - Showing what would be restored:\n');

    Object.entries(backup.users).forEach(([userId, userData]) => {
      console.log(`👤 User: ${userId}`);
      console.log(`   📋 Lists: ${userData.lists.length}`);
      console.log(`   📄 Articles: ${userData.articles.length}`);

      if (userData.lists.length > 0 && userData.lists.length <= 5) {
        console.log('   List names:');
        userData.lists.forEach(list => {
          console.log(`      - ${list.name} (${list.id})`);
        });
      }
      console.log();
    });

    console.log('💡 To execute this restore, run with: --execute\n');
    return;
  }

  // Execute restore
  console.log('⚠️  EXECUTING RESTORE...\n');

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

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

  for (const [userId, userData] of Object.entries(backup.users)) {
    console.log(`👤 Restoring user: ${userId}`);

    // Restore lists
    for (const list of userData.lists) {
      const listRef = db.doc(`users-v2/${userId}/lists/${list.id}`);

      // Deep-convert all ISO strings back to Firestore Timestamps (covers
      // createdAt, updatedAt, and all nested timestamps in itemStates/history)
      const { id: _id, ...listFields } = list;
      const listData = deepConvertToTimestamps(listFields);

      await listRef.set(listData, { merge: true });
      restoredLists++;
    }

    console.log(`   ✅ Restored ${userData.lists.length} lists`);

    // Restore articles
    for (const article of userData.articles) {
      const articleRef = db.doc(`users-v2/${userId}/articles/${article.id}`);

      const { id: _id, ...articleFields } = article;
      const articleData = deepConvertToTimestamps(articleFields);

      await articleRef.set(articleData, { merge: true });
      restoredArticles++;
    }

    console.log(`   ✅ Restored ${userData.articles.length} articles\n`);
  }

  console.log('='.repeat(80));
  console.log('📊 RESTORE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Users restored: ${Object.keys(backup.users).length}`);
  console.log(`Lists restored: ${restoredLists}`);
  console.log(`Articles restored: ${restoredArticles}`);
  console.log('='.repeat(80));
  console.log('\n✅ Restore complete!\n');
}

// Run the restore
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
