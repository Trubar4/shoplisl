#!/usr/bin/env ts-node
/**
 * Temporary Article Cleanup Script
 *
 * Removes temporary article IDs from all lists in the database.
 * Temporary article IDs are created during offline operation and should
 * be replaced with real IDs once synced, but sometimes persist incorrectly.
 *
 * This script:
 * - Scans all user lists
 * - Identifies articles with IDs starting with 'temp_'
 * - Removes them from both articleIds and itemStates
 * - Uses batched writes for efficiency
 *
 * Usage:
 *   npm run cleanup:temp-articles
 *
 * Options:
 *   --dry-run    Show what would be cleaned without making changes
 *   --user=<id>  Only process lists for specific user
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CleanupResult {
  listsScanned: number;
  listsProcessed: number;
  tempArticlesRemoved: number;
  errors: string[];
}

interface CleanupOptions {
  dryRun: boolean;
  userId?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    dryRun: false,
  };

  args.forEach(arg => {
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
    if (arg.startsWith('--user=')) {
      options.userId = arg.split('=')[1];
    }
  });

  return options;
}

/**
 * Clean temporary articles from a single list
 */
async function cleanupList(
  userId: string,
  listId: string,
  listData: admin.firestore.DocumentData,
  dryRun: boolean
): Promise<{ tempArticlesCount: number; cleaned: boolean }> {
  const originalArticleIds = listData.articleIds || [];
  const originalItemStates = listData.itemStates || {};

  // Filter out temp articles
  const cleanedArticleIds = originalArticleIds.filter(
    (id: string) => !id.startsWith('temp_')
  );

  const cleanedItemStates: any = {};
  for (const [key, value] of Object.entries(originalItemStates)) {
    if (!key.startsWith('temp_')) {
      cleanedItemStates[key] = value;
    }
  }

  const tempArticlesCount = originalArticleIds.length - cleanedArticleIds.length;

  if (tempArticlesCount > 0) {
    const tempArticleIds = originalArticleIds.filter((id: string) => id.startsWith('temp_'));
    console.log(`  📋 List: ${listData.name || listId}`);
    console.log(`     User: ${userId}`);
    console.log(`     Temp articles: ${tempArticlesCount}`);
    console.log(`     Temp IDs: ${tempArticleIds.join(', ')}`);

    if (!dryRun) {
      const listRef = db.doc(`users-v2/${userId}/lists/${listId}`);
      await listRef.update({
        articleIds: cleanedArticleIds,
        itemStates: cleanedItemStates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`     ✅ Cleaned`);
    } else {
      console.log(`     ⏭️  Skipped (dry run)`);
    }

    return { tempArticlesCount, cleaned: true };
  }

  return { tempArticlesCount: 0, cleaned: false };
}

/**
 * Main cleanup function
 */
async function cleanupTempArticles(options: CleanupOptions): Promise<CleanupResult> {
  const result: CleanupResult = {
    listsScanned: 0,
    listsProcessed: 0,
    tempArticlesRemoved: 0,
    errors: [],
  };

  console.log('\n🧹 Starting Temporary Article Cleanup');
  console.log('=====================================\n');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Get users to process
    let userIds: string[] = [];

    if (options.userId) {
      userIds = [options.userId];
      console.log(`Processing single user: ${options.userId}\n`);
    } else {
      const usersSnapshot = await db.collection('users-v2').get();
      userIds = usersSnapshot.docs.map(doc => doc.id);
      console.log(`Found ${userIds.length} users\n`);
    }

    // Process each user
    for (const userId of userIds) {
      console.log(`\n👤 User: ${userId}`);

      try {
        const listsSnapshot = await db.collection(`users-v2/${userId}/lists`).get();

        if (listsSnapshot.empty) {
          console.log('   No lists found');
          continue;
        }

        console.log(`   Found ${listsSnapshot.size} lists`);

        for (const listDoc of listsSnapshot.docs) {
          result.listsScanned++;

          try {
            const cleanupResult = await cleanupList(
              userId,
              listDoc.id,
              listDoc.data(),
              options.dryRun
            );

            if (cleanupResult.cleaned) {
              result.listsProcessed++;
              result.tempArticlesRemoved += cleanupResult.tempArticlesCount;
            }
          } catch (error) {
            const errorMsg = `Error cleaning list ${listDoc.id}: ${error}`;
            console.error(`   ❌ ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `Error processing user ${userId}: ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
  } catch (error) {
    const errorMsg = `Fatal error: ${error}`;
    console.error(`\n❌ ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Print cleanup summary
 */
function printSummary(result: CleanupResult, dryRun: boolean) {
  console.log('\n\n📊 Cleanup Summary');
  console.log('==================');
  console.log(`Lists scanned:           ${result.listsScanned}`);
  console.log(`Lists with temp articles: ${result.listsProcessed}`);
  console.log(`Temp articles removed:    ${result.tempArticlesRemoved}`);

  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:    ${result.errors.length}`);
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN - no changes were made');
    console.log('   Run without --dry-run to apply changes');
  } else if (result.listsProcessed > 0) {
    console.log('\n✅ Cleanup complete!');
  } else {
    console.log('\n✨ No temp articles found - database is clean!');
  }
}

// Run cleanup
const options = parseArgs();

cleanupTempArticles(options)
  .then(result => {
    printSummary(result, options.dryRun);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
