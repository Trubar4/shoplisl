#!/usr/bin/env ts-node
/**
 * Legacy Temp Article ID Cleanup Script
 *
 * Scans all Firebase lists for legacy temporary article IDs (created before the cleanup feature)
 * and removes them from both articleIds arrays and itemStates objects.
 *
 * Usage:
 *   npm run cleanup:temp-ids                                  # Dry-run (shows what would be cleaned)
 *   npm run cleanup:temp-ids -- --execute                     # Actually execute the cleanup
 *   npm run cleanup:temp-ids -- --execute --backup            # Execute with backup
 *   npm run cleanup:temp-ids -- --execute --user-id=<userId>  # Execute for specific user only
 *
 * Options:
 *   --execute              Actually perform the cleanup (default: dry-run only)
 *   --backup               Create backup JSON file before cleanup
 *   --user-id=<userId>     Only process lists for specific user
 */

import admin from 'firebase-admin';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');

if (existsSync(serviceAccountPath)) {
  // Production: Use service account
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔑 Initialized with service account\n');
  } catch (error) {
    console.error('Failed to initialize with service account:', error);
    process.exit(1);
  }
} else {
  // Development: Use Application Default Credentials
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;

    if (projectId) {
      admin.initializeApp({ projectId });
      console.log(`🔑 Initialized with Application Default Credentials (Project: ${projectId})\n`);
    } else {
      admin.initializeApp();
      console.log('🔑 Initialized with Application Default Credentials\n');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    console.error('\nTo fix this, either:');
    console.error('1. Place serviceAccountKey.json in the project root, OR');
    console.error('2. Set FIREBASE_PROJECT_ID environment variable, OR');
    console.error('3. Run: gcloud auth application-default login && gcloud config set project YOUR_PROJECT_ID');
    process.exit(1);
  }
}

const db = admin.firestore();

interface CleanupOptions {
  execute: boolean;
  backup: boolean;
  userId?: string;
}

interface ListIssue {
  listId: string;
  listName: string;
  userId: string;
  articleIdsTempCount: number;
  itemStatesTempCount: number;
  tempIds: string[];
}

interface ScanResult {
  totalUsers: number;
  totalLists: number;
  listsWithTempIds: number;
  totalTempIds: number;
  issues: ListIssue[];
}

interface BackupData {
  timestamp: string;
  scanResult: ScanResult;
  listData: Array<{
    userId: string;
    listId: string;
    listName: string;
    articleIds: string[];
    itemStates: any;
  }>;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    execute: false,
    backup: false
  };

  args.forEach(arg => {
    if (arg === '--execute') {
      options.execute = true;
    }
    if (arg === '--backup') {
      options.backup = true;
    }
    if (arg.startsWith('--user-id=')) {
      options.userId = arg.split('=')[1];
    }
  });

  return options;
}

/**
 * Check if an ID is a temporary ID
 */
function isTempId(id: string): boolean {
  return id.startsWith('temp_');
}

/**
 * Get all user IDs from the users-v2 collection
 */
async function getAllUserIds(specificUserId?: string): Promise<string[]> {
  if (specificUserId) {
    return [specificUserId];
  }

  const usersSnapshot = await db.collection('users-v2').listDocuments();
  return usersSnapshot.map(doc => doc.id);
}

/**
 * Scan a single list for temp IDs
 */
async function scanList(
  userId: string,
  listId: string
): Promise<ListIssue | null> {
  try {
    const listRef = db.doc(`users-v2/${userId}/lists/${listId}`);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return null;
    }

    const listData = listDoc.data();
    if (!listData) {
      return null;
    }

    const articleIds: string[] = listData['articleIds'] || [];
    const itemStates: { [key: string]: any } = listData['itemStates'] || {};

    // Find temp IDs in articleIds
    const tempArticleIds = articleIds.filter(id => isTempId(id));

    // Find temp IDs in itemStates keys
    const tempItemStateKeys = Object.keys(itemStates).filter(key => isTempId(key));

    // Combine all temp IDs (remove duplicates)
    const allTempIds = Array.from(new Set([...tempArticleIds, ...tempItemStateKeys]));

    if (allTempIds.length === 0) {
      return null;
    }

    return {
      listId,
      listName: listData['name'] || 'Unnamed List',
      userId,
      articleIdsTempCount: tempArticleIds.length,
      itemStatesTempCount: tempItemStateKeys.length,
      tempIds: allTempIds
    };
  } catch (error) {
    console.error(`   ❌ Error scanning list ${listId}:`, error);
    return null;
  }
}

/**
 * Scan all lists for a user
 */
async function scanUserLists(userId: string): Promise<{
  listsScanned: number;
  issues: ListIssue[];
}> {
  try {
    const listsRef = db.collection(`users-v2/${userId}/lists`);
    const listsSnapshot = await listsRef.get();

    const issues: ListIssue[] = [];

    for (const listDoc of listsSnapshot.docs) {
      const issue = await scanList(userId, listDoc.id);
      if (issue) {
        issues.push(issue);
      }
    }

    return {
      listsScanned: listsSnapshot.size,
      issues
    };
  } catch (error) {
    console.error(`   ❌ Error scanning user ${userId}:`, error);
    return {
      listsScanned: 0,
      issues: []
    };
  }
}

/**
 * Scan all users and lists for temp IDs
 */
async function scanAllLists(specificUserId?: string): Promise<ScanResult> {
  console.log('📊 Scanning Firebase for legacy temp IDs...\n');

  const userIds = await getAllUserIds(specificUserId);

  let totalLists = 0;
  const allIssues: ListIssue[] = [];

  for (const userId of userIds) {
    const { listsScanned, issues } = await scanUserLists(userId);
    totalLists += listsScanned;
    allIssues.push(...issues);
  }

  const totalTempIds = allIssues.reduce((sum, issue) => sum + issue.tempIds.length, 0);

  return {
    totalUsers: userIds.length,
    totalLists,
    listsWithTempIds: allIssues.length,
    totalTempIds,
    issues: allIssues
  };
}

/**
 * Clean temp IDs from a single list
 */
async function cleanList(issue: ListIssue): Promise<boolean> {
  try {
    const listRef = db.doc(`users-v2/${issue.userId}/lists/${issue.listId}`);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      console.error(`   ❌ List ${issue.listId} no longer exists`);
      return false;
    }

    const listData = listDoc.data();
    if (!listData) {
      return false;
    }

    // Clean articleIds - remove temp IDs
    const cleanedArticleIds = (listData['articleIds'] || []).filter(
      (id: string) => !isTempId(id)
    );

    // Clean itemStates - remove temp ID keys
    const cleanedItemStates = Object.fromEntries(
      Object.entries(listData['itemStates'] || {}).filter(
        ([key]) => !isTempId(key)
      )
    );

    // Update the document
    await listRef.update({
      articleIds: cleanedArticleIds,
      itemStates: cleanedItemStates,
      updatedAt: admin.firestore.Timestamp.now()
    });

    return true;
  } catch (error) {
    console.error(`   ❌ Error cleaning list ${issue.listId}:`, error);
    return false;
  }
}

/**
 * Create backup file with current state
 */
async function createBackup(scanResult: ScanResult): Promise<string> {
  console.log('\n💾 Creating backup...');

  const listData: BackupData['listData'] = [];

  for (const issue of scanResult.issues) {
    try {
      const listRef = db.doc(`users-v2/${issue.userId}/lists/${issue.listId}`);
      const listDoc = await listRef.get();

      if (listDoc.exists) {
        const data = listDoc.data();
        if (data) {
          listData.push({
            userId: issue.userId,
            listId: issue.listId,
            listName: issue.listName,
            articleIds: data['articleIds'] || [],
            itemStates: data['itemStates'] || {}
          });
        }
      }
    } catch (error) {
      console.error(`   ❌ Error backing up list ${issue.listId}:`, error);
    }
  }

  const backup: BackupData = {
    timestamp: new Date().toISOString(),
    scanResult,
    listData
  };

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupPath = join(process.cwd(), `temp-id-cleanup-backup-${timestamp}.json`);

  writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  console.log(`   ✅ Backup saved to: ${backupPath}`);
  console.log(`   📦 Lists backed up: ${listData.length}`);

  return backupPath;
}

/**
 * Execute cleanup on all affected lists
 */
async function executeCleanup(scanResult: ScanResult, withBackup: boolean): Promise<void> {
  if (scanResult.issues.length === 0) {
    console.log('\n✨ No temp IDs found - nothing to clean!');
    return;
  }

  if (withBackup) {
    await createBackup(scanResult);
  }

  console.log('\n🔧 Executing cleanup...\n');

  let successCount = 0;
  let failureCount = 0;

  for (const issue of scanResult.issues) {
    console.log(`   Cleaning list: "${issue.listName}" (${issue.listId})`);
    console.log(`   - User: ${issue.userId}`);
    console.log(`   - Removing ${issue.tempIds.length} temp IDs`);

    const success = await cleanList(issue);
    if (success) {
      console.log(`   ✅ Cleaned successfully\n`);
      successCount++;
    } else {
      console.log(`   ❌ Failed to clean\n`);
      failureCount++;
    }
  }

  console.log(`\n✅ Cleanup completed!`);
  console.log(`   - Successfully cleaned: ${successCount} lists`);
  if (failureCount > 0) {
    console.log(`   - Failed to clean: ${failureCount} lists`);
  }
}

/**
 * Display scan results
 */
function displayResults(scanResult: ScanResult, isDryRun: boolean): void {
  if (scanResult.issues.length === 0) {
    console.log('\n✨ No legacy temp IDs found! All lists are clean.\n');
    return;
  }

  console.log('\nFound issues in:\n');

  // Group issues by user
  const issuesByUser = scanResult.issues.reduce((acc, issue) => {
    if (!acc[issue.userId]) {
      acc[issue.userId] = [];
    }
    acc[issue.userId].push(issue);
    return acc;
  }, {} as { [userId: string]: ListIssue[] });

  for (const [userId, userIssues] of Object.entries(issuesByUser)) {
    console.log(`- User: ${userId}`);

    for (const issue of userIssues) {
      console.log(`  - List: "${issue.listName}" (${issue.listId})`);
      console.log(`    - articleIds: ${issue.articleIdsTempCount} temp IDs found`);
      console.log(`    - itemStates: ${issue.itemStatesTempCount} temp ID keys found`);
      console.log(`    - Temp IDs: ${issue.tempIds.join(', ')}`);
    }
    console.log('');
  }

  console.log('📋 Summary:');
  console.log(`- Total users scanned: ${scanResult.totalUsers}`);
  console.log(`- Total lists scanned: ${scanResult.totalLists}`);
  console.log(`- Lists with temp IDs: ${scanResult.listsWithTempIds}`);
  console.log(`- Total temp IDs found: ${scanResult.totalTempIds}`);

  if (isDryRun) {
    console.log('\n🔧 To execute cleanup, run: npm run cleanup:temp-ids -- --execute');
    console.log('💾 To execute with backup, run: npm run cleanup:temp-ids -- --execute --backup');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🧹 Legacy Temp ID Cleanup Script\n');
  console.log(`Mode: ${options.execute ? '🔧 EXECUTE' : '👁️  DRY-RUN'}`);
  if (options.userId) {
    console.log(`Target: User ${options.userId}`);
  }
  if (options.backup && options.execute) {
    console.log('Backup: ✅ Enabled');
  }
  console.log('');

  // Scan for temp IDs
  const scanResult = await scanAllLists(options.userId);

  // Display results
  displayResults(scanResult, !options.execute);

  // Execute cleanup if requested
  if (options.execute) {
    if (scanResult.issues.length === 0) {
      console.log('\n✨ Nothing to clean!');
      return;
    }

    console.log('\n⚠️  WARNING: This will modify Firebase data!');
    console.log('Press Ctrl+C now to cancel, or wait 3 seconds to continue...\n');

    // Wait 3 seconds before executing
    await new Promise(resolve => setTimeout(resolve, 3000));

    await executeCleanup(scanResult, options.backup);
  }

  console.log('');
}

// Run the script
main()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
