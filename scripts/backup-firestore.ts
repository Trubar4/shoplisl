#!/usr/bin/env ts-node
/**
 * Firestore Backup Script
 *
 * Exports all Firestore data to JSON files for backup purposes.
 * Creates timestamped backup directory with complete data snapshot.
 *
 * Usage:
 *   npm run backup:firestore
 *
 * Options:
 *   --project=<project-id>  Firebase project to backup (default: current)
 *   --output=<path>         Output directory (default: backups/)
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface BackupOptions {
  project?: string;
  output?: string;
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
function parseArgs(): BackupOptions {
  const args = process.argv.slice(2);
  const options: BackupOptions = {};

  args.forEach(arg => {
    if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    }
    if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    }
  });

  return options;
}

/**
 * Create backup directory with timestamp
 */
function createBackupDirectory(baseDir: string): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupDir = path.join(baseDir, timestamp);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

/**
 * Backup a single collection
 */
async function backupCollection(
  collectionPath: string,
  outputDir: string
): Promise<number> {
  console.log(`📦 Backing up collection: ${collectionPath}`);

  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`   ℹ️  Empty collection, skipping`);
    return 0;
  }

  const documents: any[] = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();

    // Convert Firestore Timestamps to ISO strings
    const convertedData = convertTimestamps(data);

    documents.push({
      id: doc.id,
      data: convertedData
    });
  });

  // Save to JSON file
  const filename = `${collectionPath.replace(/\//g, '_')}.json`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(documents, null, 2));

  console.log(`   ✅ Saved ${documents.length} documents to ${filename}`);

  return documents.length;
}

/**
 * Convert Firestore Timestamps to ISO strings for JSON serialization
 */
function convertTimestamps(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof admin.firestore.Timestamp) {
    return obj.toDate().toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestamps(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      converted[key] = convertTimestamps(obj[key]);
    }
    return converted;
  }

  return obj;
}

/**
 * Backup all collections for a user
 */
async function backupUser(userId: string, outputDir: string): Promise<number> {
  console.log(`\n👤 Backing up user: ${userId}`);

  const userPath = `users/${userId}`;
  let totalDocs = 0;

  // Get all subcollections under this user
  const collections = ['articles', 'lists'];

  for (const collection of collections) {
    const collectionPath = `${userPath}/${collection}`;
    const count = await backupCollection(collectionPath, outputDir);
    totalDocs += count;
  }

  return totalDocs;
}

/**
 * Main backup function
 */
async function backup(): Promise<void> {
  console.log('🚀 Starting Firestore Backup...\n');

  const options = parseArgs();
  const outputBase = options.output || 'backups';
  const backupDir = createBackupDirectory(outputBase);

  console.log(`📁 Backup directory: ${backupDir}\n`);

  let totalDocuments = 0;
  const collections: string[] = [];

  // Backup default user (shared-shoplisl-user)
  const userId = 'shared-shoplisl-user';
  const userDocs = await backupUser(userId, backupDir);
  totalDocuments += userDocs;

  if (userDocs > 0) {
    collections.push(`users/${userId}/articles`, `users/${userId}/lists`);
  }

  // Create metadata file
  const metadata: BackupMetadata = {
    timestamp: new Date().toISOString(),
    project: options.project || process.env['GCLOUD_PROJECT'] || 'shoplisl',
    collections,
    totalDocuments
  };

  const metadataPath = path.join(backupDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`\n✅ Backup completed successfully!`);
  console.log(`   📊 Total documents: ${totalDocuments}`);
  console.log(`   📂 Location: ${backupDir}`);
  console.log(`   📝 Metadata: ${metadataPath}\n`);
}

// Run backup
backup()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  });
