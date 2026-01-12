#!/usr/bin/env ts-node
/**
 * List Consistency Validation Script
 *
 * Validates that articleIds and itemStates are properly synchronized across
 * all lists in the database. Detects:
 * - Articles in articleIds but not in itemStates
 * - Articles in itemStates but not in articleIds
 * - Temporary article IDs that shouldn't exist
 *
 * This helps identify data inconsistencies that could cause issues in the UI.
 *
 * Usage:
 *   npm run validate:lists
 *
 * Options:
 *   --user=<id>  Only validate lists for specific user
 *   --fix        Automatically repair inconsistencies (removes orphaned entries)
 *   --verbose    Show details for all lists (not just problematic ones)
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface ValidationIssue {
  listId: string;
  userId: string;
  listName: string;
  issues: string[];
  orphanedInArticleIds: string[];
  orphanedInItemStates: string[];
  tempArticles: string[];
}

interface ValidationResult {
  listsScanned: number;
  listsWithIssues: number;
  totalIssues: number;
  issuesByType: {
    orphanedArticleIds: number;
    orphanedItemStates: number;
    tempArticles: number;
  };
  issues: ValidationIssue[];
}

interface ValidationOptions {
  userId?: string;
  fix: boolean;
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ValidationOptions {
  const args = process.argv.slice(2);
  const options: ValidationOptions = {
    fix: false,
    verbose: false,
  };

  args.forEach(arg => {
    if (arg.startsWith('--user=')) {
      options.userId = arg.split('=')[1];
    }
    if (arg === '--fix') {
      options.fix = true;
    }
    if (arg === '--verbose') {
      options.verbose = true;
    }
  });

  return options;
}

/**
 * Validate a single list for consistency
 */
function validateList(
  listId: string,
  userId: string,
  listData: admin.firestore.DocumentData
): ValidationIssue | null {
  const articleIds = new Set(listData.articleIds || []);
  const itemStateKeys = new Set(Object.keys(listData.itemStates || {}));

  const issues: string[] = [];
  const orphanedInArticleIds: string[] = [];
  const orphanedInItemStates: string[] = [];
  const tempArticles: string[] = [];

  // Check for articleIds not in itemStates
  for (const articleId of articleIds) {
    if (!itemStateKeys.has(articleId)) {
      issues.push(`Article ${articleId} in articleIds but not in itemStates`);
      orphanedInArticleIds.push(articleId);
    }
  }

  // Check for itemStates not in articleIds
  for (const articleId of itemStateKeys) {
    if (!articleIds.has(articleId)) {
      issues.push(`Article ${articleId} in itemStates but not in articleIds`);
      orphanedInItemStates.push(articleId);
    }
  }

  // Check for temp articles (shouldn't exist in production)
  for (const articleId of articleIds) {
    if (articleId.startsWith('temp_')) {
      issues.push(`Temp article ${articleId} found in articleIds`);
      if (!tempArticles.includes(articleId)) {
        tempArticles.push(articleId);
      }
    }
  }

  for (const articleId of itemStateKeys) {
    if (articleId.startsWith('temp_')) {
      issues.push(`Temp article ${articleId} found in itemStates`);
      if (!tempArticles.includes(articleId)) {
        tempArticles.push(articleId);
      }
    }
  }

  if (issues.length > 0) {
    return {
      listId,
      userId,
      listName: listData.name || 'Unnamed List',
      issues,
      orphanedInArticleIds,
      orphanedInItemStates,
      tempArticles,
    };
  }

  return null;
}

/**
 * Fix consistency issues in a list
 */
async function fixList(issue: ValidationIssue): Promise<void> {
  const listRef = db.doc(`users-v2/${issue.userId}/lists/${issue.listId}`);
  const listDoc = await listRef.get();

  if (!listDoc.exists) {
    console.log(`     ⚠️  List no longer exists, skipping`);
    return;
  }

  const listData = listDoc.data()!;
  const articleIds = new Set(listData.articleIds || []);
  const itemStates = { ...(listData.itemStates || {}) };

  // Remove orphaned entries
  for (const articleId of issue.orphanedInArticleIds) {
    articleIds.delete(articleId);
  }

  for (const articleId of issue.orphanedInItemStates) {
    delete itemStates[articleId];
  }

  // Remove temp articles
  for (const articleId of issue.tempArticles) {
    articleIds.delete(articleId);
    delete itemStates[articleId];
  }

  // Keep only valid articles (exist in both)
  const validArticleIds = Array.from(articleIds).filter(id =>
    Object.keys(itemStates).includes(id) && !id.startsWith('temp_')
  );

  const validItemStates: any = {};
  for (const articleId of validArticleIds) {
    validItemStates[articleId] = itemStates[articleId];
  }

  await listRef.update({
    articleIds: validArticleIds,
    itemStates: validItemStates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`     ✅ Fixed`);
}

/**
 * Main validation function
 */
async function validateListConsistency(options: ValidationOptions): Promise<ValidationResult> {
  const result: ValidationResult = {
    listsScanned: 0,
    listsWithIssues: 0,
    totalIssues: 0,
    issuesByType: {
      orphanedArticleIds: 0,
      orphanedItemStates: 0,
      tempArticles: 0,
    },
    issues: [],
  };

  console.log('\n🔍 Starting List Consistency Validation');
  console.log('========================================\n');

  if (options.fix) {
    console.log('🔧 FIX MODE - Issues will be automatically repaired\n');
  }

  try {
    // Get users to process
    let userIds: string[] = [];

    if (options.userId) {
      userIds = [options.userId];
      console.log(`Validating single user: ${options.userId}\n`);
    } else {
      const usersSnapshot = await db.collection('users-v2').get();
      userIds = usersSnapshot.docs.map(doc => doc.id);
      console.log(`Found ${userIds.length} users\n`);
    }

    // Process each user
    for (const userId of userIds) {
      try {
        const listsSnapshot = await db.collection(`users-v2/${userId}/lists`).get();

        if (listsSnapshot.empty) {
          if (options.verbose) {
            console.log(`👤 User ${userId}: No lists found`);
          }
          continue;
        }

        let userHasIssues = false;

        for (const listDoc of listsSnapshot.docs) {
          result.listsScanned++;

          const issue = validateList(listDoc.id, userId, listDoc.data());

          if (issue) {
            if (!userHasIssues) {
              console.log(`\n👤 User: ${userId}`);
              userHasIssues = true;
            }

            result.listsWithIssues++;
            result.totalIssues += issue.issues.length;
            result.issuesByType.orphanedArticleIds += issue.orphanedInArticleIds.length;
            result.issuesByType.orphanedItemStates += issue.orphanedInItemStates.length;
            result.issuesByType.tempArticles += issue.tempArticles.length;
            result.issues.push(issue);

            console.log(`\n  📋 List: ${issue.listName} (${issue.listId})`);
            console.log(`     Issues found: ${issue.issues.length}`);
            issue.issues.forEach(iss => {
              console.log(`     - ${iss}`);
            });

            if (options.fix) {
              await fixList(issue);
            }
          } else if (options.verbose) {
            console.log(`  ✅ List: ${listDoc.data().name || listDoc.id} - OK`);
          }
        }
      } catch (error) {
        console.error(`\n❌ Error processing user ${userId}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error}`);
    throw error;
  }

  return result;
}

/**
 * Print validation summary
 */
function printSummary(result: ValidationResult, options: ValidationOptions) {
  console.log('\n\n📊 Validation Summary');
  console.log('=====================');
  console.log(`Lists scanned:               ${result.listsScanned}`);
  console.log(`Lists with issues:           ${result.listsWithIssues}`);
  console.log(`Total issues:                ${result.totalIssues}`);
  console.log(`\nIssues by type:`);
  console.log(`  Orphaned in articleIds:    ${result.issuesByType.orphanedArticleIds}`);
  console.log(`  Orphaned in itemStates:    ${result.issuesByType.orphanedItemStates}`);
  console.log(`  Temp articles:             ${result.issuesByType.tempArticles}`);

  if (result.listsWithIssues === 0) {
    console.log('\n✨ All lists are consistent!');
  } else if (options.fix) {
    console.log('\n✅ All issues have been repaired!');
  } else {
    console.log('\n⚠️  Issues detected. Run with --fix to repair automatically.');
  }
}

// Run validation
const options = parseArgs();

validateListConsistency(options)
  .then(result => {
    printSummary(result, options);
    process.exit(result.listsWithIssues > 0 && !options.fix ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  });
