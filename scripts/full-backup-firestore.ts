/**
 * FULL BACKUP SCRIPT: Export All Firestore Data
 *
 * This script creates a complete backup of all users, lists, and articles
 * from Firestore and saves it as a JSON file.
 *
 * Usage:
 *   npm run backup:full              # Creates timestamped backup
 *   npm run backup:full -- --latest  # Creates backup with 'latest' name
 *
 * Output:
 *   backups/firestore-backup-YYYY-MM-DD-HHmmss.json (or latest.json)
 *
 * GitHub Actions:
 *   This script is run automatically on every build via GitHub Actions
 *   and commits the backup to the repository for disaster recovery.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const useLatestName = args.includes('--latest');

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
 * Recursively convert every Firestore Timestamp in obj to an ISO-8601 string.
 * This ensures itemStates — including history[].timestamp, addedAt, checkedAt —
 * are human-readable in the JSON file and can be round-tripped by the restore script.
 */
function deepConvertTimestamps(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // Firestore Timestamp from Admin SDK: has toDate() and seconds/nanoseconds
  if (typeof obj === 'object' && typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertTimestamps(item));
  }

  if (typeof obj === 'object') {
    const out: any = {};
    for (const key of Object.keys(obj)) {
      out[key] = deepConvertTimestamps(obj[key]);
    }
    return out;
  }

  return obj;
}

async function main() {
  console.log('='.repeat(80));
  console.log('💾 FULL BACKUP: Export All Firestore Data');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    console.error(`   Expected at: ${serviceAccountPath}`);
    console.error('\n📝 To fix:');
    console.error('   1. Download service account key from Firebase Console');
    console.error('   2. Save as firebase-credentials.json in project root');
    console.error('   OR');
    console.error('   3. Set FIREBASE_SERVICE_ACCOUNT env var with JSON content');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  const backup: BackupData = {
    timestamp: new Date().toISOString(),
    users: {},
    stats: {
      totalUsers: 0,
      totalLists: 0,
      totalArticles: 0
    }
  };

  try {
    // Step 1: Get all users from users-v2 collection
    console.log('📦 Step 1: Loading all users from users-v2...\n');

    const usersSnapshot = await db.collection('users-v2').get();
    backup.stats.totalUsers = usersSnapshot.size;

    console.log(`   ✅ Found ${usersSnapshot.size} users\n`);

    // Step 2: For each user, export lists and articles
    console.log('📦 Step 2: Exporting data for each user...\n');

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`   👤 User: ${userId}`);

      backup.users[userId] = {
        lists: [],
        articles: []
      };

      // Export lists
      const listsSnapshot = await db.collection(`users-v2/${userId}/lists`).get();
      const lists: any[] = [];

      listsSnapshot.forEach(listDoc => {
        const listData = listDoc.data();
        lists.push({
          id: listDoc.id,
          ...deepConvertTimestamps(listData)
        });
      });

      backup.users[userId].lists = lists;
      backup.stats.totalLists += lists.length;
      console.log(`      📋 Lists: ${lists.length}`);

      // Export articles
      const articlesSnapshot = await db.collection(`users-v2/${userId}/articles`).get();
      const articles: any[] = [];

      articlesSnapshot.forEach(articleDoc => {
        const articleData = articleDoc.data();
        articles.push({
          id: articleDoc.id,
          ...deepConvertTimestamps(articleData)
        });
      });

      backup.users[userId].articles = articles;
      backup.stats.totalArticles += articles.length;
      console.log(`      📄 Articles: ${articles.length}`);
      console.log();
    }

    // Step 3: Also backup old shared-shoplisl-user data (for reference)
    console.log('📦 Step 3: Backing up legacy shared-shoplisl-user data...\n');

    try {
      const oldUserDoc = await db.doc('users/shared-shoplisl-user').get();

      if (oldUserDoc.exists) {
        const legacyLists: any[] = [];
        const legacyListsSnapshot = await db.collection('users/shared-shoplisl-user/lists').get();

        legacyListsSnapshot.forEach(listDoc => {
          const listData = listDoc.data();
          legacyLists.push({
            id: listDoc.id,
            ...deepConvertTimestamps(listData)
          });
        });

        backup.users['shared-shoplisl-user'] = {
          lists: legacyLists,
          articles: []
        };

        console.log(`   ✅ Backed up ${legacyLists.length} legacy lists\n`);
      }
    } catch (error) {
      console.log(`   ⚠️  No legacy data found (this is normal)\n`);
    }

    // Step 4: Save backup to file
    console.log('💾 Step 4: Saving backup to file...\n');

    // Create backups directory if it doesn't exist
    const backupsDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
      console.log(`   📁 Created backups directory: ${backupsDir}`);
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-mm-ss
    const filename = useLatestName
      ? 'latest.json'
      : `firestore-backup-${timestamp}.json`;
    const filepath = path.join(backupsDir, filename);

    // Write backup file
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    const fileSizeKB = (fs.statSync(filepath).size / 1024).toFixed(2);
    console.log(`   ✅ Backup saved: ${filename}`);
    console.log(`   📦 File size: ${fileSizeKB} KB\n`);

    // Step 5: Print summary
    console.log('='.repeat(80));
    console.log('📊 BACKUP SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Users: ${backup.stats.totalUsers}`);
    console.log(`Total Lists: ${backup.stats.totalLists}`);
    console.log(`Total Articles: ${backup.stats.totalArticles}`);
    console.log(`Backup File: ${filename}`);
    console.log(`File Size: ${fileSizeKB} KB`);
    console.log('='.repeat(80));

    // Step 6: Cleanup old backups (keep last 10 only to avoid repo bloat)
    if (!useLatestName) {
      console.log('\n🧹 Cleaning up old backups (keeping last 10)...\n');

      const allBackups = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('firestore-backup-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(backupsDir, f),
          mtime: fs.statSync(path.join(backupsDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (allBackups.length > 10) {
        const toDelete = allBackups.slice(10);
        toDelete.forEach(backup => {
          fs.unlinkSync(backup.path);
          console.log(`   🗑️  Deleted old backup: ${backup.name}`);
        });
        console.log(`\n   ✅ Deleted ${toDelete.length} old backups`);
      } else {
        console.log(`   ✅ No cleanup needed (${allBackups.length} backups total)`);
      }
    }

    console.log('\n✅ Backup complete!\n');

  } catch (error: any) {
    console.error('\n❌ BACKUP FAILED:', error.message);
    process.exit(1);
  }
}

// Run the backup
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
