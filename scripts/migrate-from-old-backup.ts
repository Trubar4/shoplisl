/**
 * MIGRATION SCRIPT: Restore Lists from Old Backup Location
 *
 * This script migrates data from the old shared-shoplisl-user location
 * to the new users-v2 location and marks all articles as CHECKED.
 *
 * Old Location: users/shared-shoplisl-user/lists/{listId}
 * New Location: users-v2/{ownerId}/lists/{listId}
 *
 * Usage:
 *   npm run migrate:old-backup -- --dry-run
 *   npm run migrate:old-backup -- --execute
 *
 * Safety:
 *   - Dry-run mode by default
 *   - Creates backup before changes
 *   - All articles marked as checked (isChecked: true)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const executeArg = args.includes('--execute');
const DRY_RUN = !executeArg;

// Configuration
const OLD_USER_ID = 'shared-shoplisl-user';
const NEW_OWNER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

const AFFECTED_LISTS = [
  { id: 'bwG4wE8gqjn78pRsOwic', name: 'DM/Bipa' },
  { id: 'bDJAexAC29O1oujEf3eq', name: 'Messepark' },
  { id: 'Krvv5jHvgKeRAZTR6uDH', name: 'Birgit Urlaub Como' },
  { id: 'FoIhdc4QqfgUx57JeRLD', name: 'Hofer' },
  { id: 'CemqHIYJ868O89362x9V', name: 'Sutterlüty' },
  { id: '62PhcxI5ivkgfhdlNbaR', name: 'Lädele' },
];

interface MigrationResult {
  listId: string;
  listName: string;
  success: boolean;
  oldArticleCount: number;
  newArticleCount: number;
  error?: string;
}

async function main() {
  console.log('='.repeat(80));
  console.log('🔄 MIGRATION: Restore from Old Backup Location');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  EXECUTE (will make changes)'}`);
  console.log(`Old Location: users/${OLD_USER_ID}/lists/`);
  console.log(`New Location: users-v2/${NEW_OWNER_ID}/lists/`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    console.error(`   Expected at: ${serviceAccountPath}`);
    console.error('\n📝 To fix:');
    console.error('   1. Download service account key from Firebase Console');
    console.error('   2. Save as firebase-credentials.json in project root');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  const results: MigrationResult[] = [];
  let totalArticlesRestored = 0;

  // Process each affected list
  for (const affectedList of AFFECTED_LISTS) {
    console.log('-'.repeat(80));
    console.log(`📋 Processing: ${affectedList.name}`);
    console.log(`   List ID: ${affectedList.id}\n`);

    const result: MigrationResult = {
      listId: affectedList.id,
      listName: affectedList.name,
      success: false,
      oldArticleCount: 0,
      newArticleCount: 0
    };

    try {
      // Step 1: Read from old backup location
      console.log(`   📖 Reading from old location...`);
      const oldListRef = db.doc(`users/${OLD_USER_ID}/lists/${affectedList.id}`);
      const oldListDoc = await oldListRef.get();

      if (!oldListDoc.exists) {
        console.error(`   ❌ Old list not found at: users/${OLD_USER_ID}/lists/${affectedList.id}`);
        result.error = 'Old list not found';
        results.push(result);
        console.log();
        continue;
      }

      const oldListData = oldListDoc.data();
      const oldArticleIds = oldListData?.articleIds || [];
      result.oldArticleCount = oldArticleIds.length;

      console.log(`   ✅ Found ${oldArticleIds.length} articles in old backup`);

      if (oldArticleIds.length === 0) {
        console.warn(`   ⚠️  No articles in old backup - skipping`);
        result.error = 'No articles in old backup';
        results.push(result);
        console.log();
        continue;
      }

      // Step 2: Read current state from new location
      console.log(`   📖 Reading current state from new location...`);
      const newListRef = db.doc(`users-v2/${NEW_OWNER_ID}/lists/${affectedList.id}`);
      const newListDoc = await newListRef.get();

      if (!newListDoc.exists) {
        console.error(`   ❌ New list not found at: users-v2/${NEW_OWNER_ID}/lists/${affectedList.id}`);
        result.error = 'New list not found';
        results.push(result);
        console.log();
        continue;
      }

      const currentData = newListDoc.data();
      const currentArticleIds = currentData?.articleIds || [];
      const currentItemStates = currentData?.itemStates || {};

      console.log(`   📊 Current state: ${currentArticleIds.length} articles, ${Object.keys(currentItemStates).length} states`);

      // Step 3: Build new articleIds and itemStates (all checked)
      console.log(`   🔧 Building migration data...`);

      // Start with current data to preserve any existing articles
      const newArticleIds = [...currentArticleIds];
      const newItemStates = { ...currentItemStates };

      let addedCount = 0;
      let skippedCount = 0;

      for (const articleId of oldArticleIds) {
        // Add to articleIds if not already there
        if (!newArticleIds.includes(articleId)) {
          newArticleIds.push(articleId);
          addedCount++;
          console.log(`      + Adding: ${articleId}`);
        } else {
          skippedCount++;
        }

        // Set itemState to CHECKED (isChecked: true)
        // This marks the article as "done" so it doesn't appear as active
        newItemStates[articleId] = {
          articleId: articleId,
          isChecked: true,  // ✓ Mark as checked
          checkedAt: Timestamp.now(),
          amount: undefined
        };
      }

      result.newArticleCount = newArticleIds.length;

      console.log(`   ✅ Migration data ready:`);
      console.log(`      + Articles to add: ${addedCount}`);
      console.log(`      = Already exists: ${skippedCount}`);
      console.log(`      ✓ All ${oldArticleIds.length} articles marked as CHECKED`);
      console.log(`      📊 Total: ${currentArticleIds.length} → ${newArticleIds.length} articles\n`);

      // Step 4: Apply changes (if not dry run)
      if (!DRY_RUN) {
        console.log(`   💾 Saving to Firebase...`);

        // Create backup
        const backupPath = path.join(__dirname, '..', `backup-${affectedList.id}-${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify({
          listId: affectedList.id,
          listName: affectedList.name,
          timestamp: new Date().toISOString(),
          beforeMigration: currentData,
          afterMigration: {
            articleIds: newArticleIds,
            itemStates: newItemStates
          }
        }, null, 2));
        console.log(`      💾 Backup created: ${path.basename(backupPath)}`);

        // Update Firebase
        await newListRef.update({
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });

        console.log(`      ✅ List updated successfully!`);
        result.success = true;
        totalArticlesRestored += addedCount;
      } else {
        console.log(`   💡 DRY RUN - no changes made`);
        result.success = true; // Mark as success in dry run mode
      }

      console.log();
      results.push(result);

    } catch (error: any) {
      console.error(`   ❌ ERROR: ${error.message}\n`);
      result.error = error.message;
      results.push(result);
    }
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total lists processed: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}\n`);

  if (successful.length > 0) {
    console.log('✅ Successful Migrations:');
    successful.forEach(r => {
      console.log(`   ${r.listName} (${r.listId})`);
      console.log(`      Old: ${r.oldArticleCount} articles → New: ${r.newArticleCount} articles`);
    });
    console.log();
  }

  if (failed.length > 0) {
    console.log('❌ Failed Migrations:');
    failed.forEach(r => {
      console.log(`   ${r.listName} (${r.listId}): ${r.error}`);
    });
    console.log();
  }

  if (DRY_RUN) {
    console.log('💡 This was a DRY RUN - no changes were made');
    console.log('   To apply these changes, run with: --execute\n');
  } else {
    console.log(`✅ Migration complete! ${totalArticlesRestored} articles restored`);
    console.log(`   All restored articles marked as CHECKED (not active on lists)\n`);
  }

  console.log('='.repeat(80));
}

// Run the migration
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
