#!/usr/bin/env ts-node
/**
 * Firestore Restore Script
 *
 * Restores Firestore data from JSON backup files.
 * Can restore to same or different Firebase project.
 *
 * Usage:
 *   npm run restore:firestore -- --backup=backups/2025-11-23T10-30-00
 *
 * Options:
 *   --backup=<path>         Path to backup directory (required)
 *   --project=<project-id>  Firebase project to restore to (default: current)
 *   --dry-run               Preview without writing to Firestore
 *   --force                 Skip confirmation prompt
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface RestoreOptions {
  backup: string;
  project?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface BackupMetadata {
  timestamp: string;
  project: string;
  collections: string[];
  totalDocuments: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): RestoreOptions {
  const args = process.argv.slice(2);
  const options: Partial<RestoreOptions> = {};

  args.forEach(arg => {
    if (arg.startsWith('--backup=')) {
      options.backup = arg.split('=')[1];
    }
    if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
    if (arg === '--force') {
      options.force = true;
    }
  });

  if (!options.backup) {
    console.error('❌ Error: --backup=<path> is required');
    process.exit(1);
  }

  return options as RestoreOptions;
}

/**
 * Load metadata from backup directory
 */
function loadMetadata(backupDir: string): BackupMetadata {
  const metadataPath = path.join(backupDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Metadata file not found: ${metadataPath}`);
  }

  const content = fs.readFileSync(metadataPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Confirm restore operation
 */
async function confirmRestore(metadata: BackupMetadata, targetProject: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    console.log('\n⚠️  RESTORE CONFIRMATION');
    console.log('━'.repeat(50));
    console.log(`Source backup: ${metadata.timestamp}`);
    console.log(`Source project: ${metadata.project}`);
    console.log(`Target project: ${targetProject}`);
    console.log(`Total documents: ${metadata.totalDocuments}`);
    console.log(`Collections: ${metadata.collections.length}`);
    console.log('━'.repeat(50));
    console.log('\n⚠️  WARNING: This will overwrite existing data!\n');

    rl.question('Continue with restore? (yes/no): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Convert ISO date strings back to Firestore Timestamps
 */
function convertToTimestamps(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if it's an ISO date string
  if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
    return admin.firestore.Timestamp.fromDate(new Date(obj));
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertToTimestamps(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      converted[key] = convertToTimestamps(obj[key]);
    }
    return converted;
  }

  return obj;
}

/**
 * Restore a single collection
 */
async function restoreCollection(
  collectionPath: string,
  backupDir: string,
  dryRun: boolean
): Promise<number> {
  const filename = `${collectionPath.replace(/\//g, '_')}.json`;
  const filepath = path.join(backupDir, filename);

  if (!fs.existsSync(filepath)) {
    console.log(`   ⚠️  Backup file not found: ${filename}, skipping`);
    return 0;
  }

  console.log(`📦 Restoring collection: ${collectionPath}`);

  const content = fs.readFileSync(filepath, 'utf-8');
  const documents = JSON.parse(content);

  if (documents.length === 0) {
    console.log(`   ℹ️  No documents to restore`);
    return 0;
  }

  let restored = 0;
  const batch = db.batch();
  const batchSize = 500; // Firestore batch limit

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const docRef = db.collection(collectionPath).doc(doc.id);

    // Convert ISO strings back to Timestamps
    const convertedData = convertToTimestamps(doc.data);

    if (!dryRun) {
      batch.set(docRef, convertedData);
      restored++;

      // Commit batch every 500 documents
      if ((i + 1) % batchSize === 0) {
        await batch.commit();
        console.log(`   ⏳ Committed ${i + 1}/${documents.length} documents...`);
      }
    }
  }

  // Commit remaining documents
  if (!dryRun && restored % batchSize !== 0) {
    await batch.commit();
  }

  if (dryRun) {
    console.log(`   🔍 DRY RUN: Would restore ${documents.length} documents`);
  } else {
    console.log(`   ✅ Restored ${restored} documents`);
  }

  return restored;
}

/**
 * Restore all collections for a user
 */
async function restoreUser(
  userId: string,
  backupDir: string,
  dryRun: boolean
): Promise<number> {
  console.log(`\n👤 Restoring user: ${userId}`);

  const userPath = `users/${userId}`;
  let totalDocs = 0;

  // Restore all subcollections
  const collections = ['articles', 'lists'];

  for (const collection of collections) {
    const collectionPath = `${userPath}/${collection}`;
    const count = await restoreCollection(collectionPath, backupDir, dryRun);
    totalDocs += count;
  }

  return totalDocs;
}

/**
 * Main restore function
 */
async function restore(): Promise<void> {
  console.log('🚀 Starting Firestore Restore...\n');

  const options = parseArgs();

  // Verify backup directory exists
  if (!fs.existsSync(options.backup)) {
    console.error(`❌ Backup directory not found: ${options.backup}`);
    process.exit(1);
  }

  // Load metadata
  const metadata = loadMetadata(options.backup);
  const targetProject = options.project || process.env.GCLOUD_PROJECT || 'shoplisl';

  console.log(`📂 Backup directory: ${options.backup}`);
  console.log(`📅 Backup date: ${metadata.timestamp}`);
  console.log(`📊 Total documents: ${metadata.totalDocuments}\n`);

  // Confirm restore (unless --force)
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRestore(metadata, targetProject);
    if (!confirmed) {
      console.log('\n❌ Restore cancelled by user');
      process.exit(0);
    }
  }

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - No data will be written\n');
  }

  // Restore default user
  const userId = 'shared-shoplisl-user';
  const totalDocuments = await restoreUser(userId, options.backup, options.dryRun || false);

  if (options.dryRun) {
    console.log(`\n🔍 DRY RUN COMPLETE`);
    console.log(`   Would restore: ${totalDocuments} documents`);
    console.log(`   Run without --dry-run to perform actual restore\n`);
  } else {
    console.log(`\n✅ Restore completed successfully!`);
    console.log(`   📊 Total documents restored: ${totalDocuments}`);
    console.log(`   🎯 Target project: ${targetProject}\n`);
  }
}

// Run restore
restore()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Restore failed:', error);
    process.exit(1);
  });
