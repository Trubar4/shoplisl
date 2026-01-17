/**
 * RECOVERY SCRIPT: Restore Article Data to Affected Lists
 *
 * This script helps recover lost data by:
 * 1. Adding article IDs back to the articleIds array
 * 2. Restoring itemStates with correct checked/unchecked status
 * 3. Validating that articles exist before adding
 *
 * Usage:
 *   npm run recover-lists -- --list-id=FoIhdc4QqfgUx57JeRLD --dry-run
 *   npm run recover-lists -- --list-id=FoIhdc4QqfgUx57JeRLD --execute
 *
 * Input:
 *   recovery-data.json - Contains article IDs and states to restore
 *
 * Safety:
 *   - Dry-run mode by default (use --execute to apply changes)
 *   - Creates backup before making changes
 *   - Validates all articles exist before adding
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const listIdArg = args.find(arg => arg.startsWith('--list-id='));
const executeArg = args.includes('--execute');

if (!listIdArg) {
  console.error('❌ Missing required argument: --list-id');
  console.error('\nUsage:');
  console.error('  npm run recover-lists -- --list-id=FoIhdc4QqfgUx57JeRLD --dry-run');
  console.error('  npm run recover-lists -- --list-id=FoIhdc4QqfgUx57JeRLD --execute');
  process.exit(1);
}

const LIST_ID = listIdArg.split('=')[1];
const DRY_RUN = !executeArg;
const OWNER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

interface RecoveryData {
  listId: string;
  listName: string;
  articles: Array<{
    articleId: string;
    articleName?: string;
    isChecked: boolean;
    amount?: string;
  }>;
}

interface ListItemState {
  articleId: string;
  isChecked: boolean;
  amount?: string;
  checkedAt?: Date;
}

async function main() {
  console.log('='.repeat(80));
  console.log('🔧 RECOVERY: Restore Shopping List Data');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  EXECUTE (will make changes)'}`);
  console.log(`List ID: ${LIST_ID}`);
  console.log(`Owner: ${OWNER_ID}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    console.error(`   Expected at: ${serviceAccountPath}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  // Load recovery data
  const recoveryDataPath = path.join(__dirname, '..', 'recovery-data.json');

  if (!fs.existsSync(recoveryDataPath)) {
    console.log('⚠️  No recovery-data.json found. Creating template...\n');
    createRecoveryTemplate(recoveryDataPath);
    console.log('📝 Please edit recovery-data.json with the correct article data');
    console.log('   Then run this script again.\n');
    process.exit(0);
  }

  const allRecoveryData: RecoveryData[] = JSON.parse(fs.readFileSync(recoveryDataPath, 'utf8'));
  const recoveryData = allRecoveryData.find(r => r.listId === LIST_ID);

  if (!recoveryData) {
    console.error(`❌ ERROR: No recovery data found for list ${LIST_ID}`);
    console.error('   Available lists in recovery-data.json:');
    allRecoveryData.forEach(r => console.error(`      - ${r.listId} (${r.listName})`));
    process.exit(1);
  }

  console.log(`📋 Recovering List: ${recoveryData.listName}`);
  console.log(`   Articles to restore: ${recoveryData.articles.length}\n`);

  // Step 1: Get current list state
  const listRef = db.doc(`users-v2/${OWNER_ID}/lists/${LIST_ID}`);
  const listDoc = await listRef.get();

  if (!listDoc.exists) {
    console.error('❌ ERROR: List not found in Firebase');
    process.exit(1);
  }

  const currentListData = listDoc.data();
  const currentArticleIds = currentListData?.articleIds || [];
  const currentItemStates = currentListData?.itemStates || {};

  console.log(`📊 Current State:`);
  console.log(`   Article IDs: ${currentArticleIds.length}`);
  console.log(`   Item States: ${Object.keys(currentItemStates).length}\n`);

  // Step 2: Validate articles exist
  console.log(`🔍 Validating articles exist in Firebase...\n`);

  const validArticles: typeof recoveryData.articles = [];
  const invalidArticles: typeof recoveryData.articles = [];
  const articlesToCreate: typeof recoveryData.articles = [];

  for (const article of recoveryData.articles) {
    if (!article.articleId) {
      if (!article.articleName) {
        console.error(`   ❌ Article missing both ID and name - skipping`);
        invalidArticles.push(article);
        continue;
      }

      // Article doesn't have ID - we'll need to search or create
      console.log(`   ⚠️  Article "${article.articleName}" has no ID - will search/create`);
      articlesToCreate.push(article);
      continue;
    }

    // Check if article exists
    const articleRef = db.doc(`users-v2/${OWNER_ID}/articles/${article.articleId}`);
    const articleDoc = await articleRef.get();

    if (articleDoc.exists) {
      const articleData = articleDoc.data();
      console.log(`   ✅ Found: ${articleData?.name || 'Unknown'} (${article.articleId})`);
      validArticles.push(article);
    } else {
      // Article doesn't exist - check if we have the name to recreate it
      if (article.articleName) {
        console.log(`   ⚠️  Not found: ${article.articleName} (${article.articleId}) - will create`);
        articlesToCreate.push(article);
      } else {
        console.log(`   ❌ Not found and no name provided: ${article.articleId}`);
        invalidArticles.push(article);
      }
    }
  }

  console.log();

  // Step 3: Search for articles by name if needed
  if (articlesToCreate.length > 0) {
    console.log(`🔍 Searching for articles by name...\n`);

    for (const article of articlesToCreate) {
      if (!article.articleName) continue;

      // Search in owner's articles
      const articlesRef = db.collection(`users-v2/${OWNER_ID}/articles`);
      const querySnapshot = await articlesRef.where('name', '==', article.articleName).get();

      if (!querySnapshot.empty) {
        const foundDoc = querySnapshot.docs[0];
        const foundArticleId = foundDoc.id;
        console.log(`   ✅ Found by name: "${article.articleName}" → ${foundArticleId}`);

        // Update the article object with the found ID
        article.articleId = foundArticleId;
        validArticles.push(article);
      } else {
        console.log(`   ⚠️  Not found by name: "${article.articleName}" - will create new`);

        if (!DRY_RUN) {
          // Create new article
          const newArticleRef = await db.collection(`users-v2/${OWNER_ID}/articles`).add({
            name: article.articleName,
            ownerId: OWNER_ID,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            usageCount: 0,
            availableInShops: []
          });

          article.articleId = newArticleRef.id;
          console.log(`      ✅ Created new article: ${article.articleId}`);
          validArticles.push(article);
        }
      }
    }

    console.log();
  }

  // Step 4: Build new articleIds and itemStates
  console.log(`🔧 Building recovery data...\n`);

  const newArticleIds = [...currentArticleIds]; // Preserve existing
  const newItemStates = { ...currentItemStates }; // Preserve existing

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const article of validArticles) {
    if (!article.articleId) {
      skippedCount++;
      continue;
    }

    // Add to articleIds if not already there
    if (!newArticleIds.includes(article.articleId)) {
      newArticleIds.push(article.articleId);
      addedCount++;
      console.log(`   + Adding: ${article.articleName || article.articleId}`);
    } else {
      console.log(`   = Already exists: ${article.articleName || article.articleId}`);
      skippedCount++;
    }

    // Update itemState
    const existingState = newItemStates[article.articleId];
    const newState: ListItemState = {
      articleId: article.articleId,
      isChecked: article.isChecked,
      amount: article.amount,
      checkedAt: article.isChecked ? new Date() : undefined
    };

    if (existingState) {
      console.log(`   ↻ Updating state: ${article.articleName || article.articleId} → ${article.isChecked ? 'checked' : 'unchecked'}`);
      updatedCount++;
    }

    newItemStates[article.articleId] = newState;
  }

  console.log();
  console.log(`📊 Recovery Summary:`);
  console.log(`   ✅ Valid articles: ${validArticles.length}`);
  console.log(`   ❌ Invalid articles: ${invalidArticles.length}`);
  console.log(`   + Articles to add: ${addedCount}`);
  console.log(`   ↻ States to update: ${updatedCount}`);
  console.log(`   = Already exists: ${skippedCount}`);
  console.log();
  console.log(`   Total articleIds: ${currentArticleIds.length} → ${newArticleIds.length}`);
  console.log(`   Total itemStates: ${Object.keys(currentItemStates).length} → ${Object.keys(newItemStates).length}`);
  console.log();

  // Step 5: Apply changes
  if (DRY_RUN) {
    console.log('💡 This was a DRY RUN - no changes were made');
    console.log('   To apply these changes, run with: --execute\n');
  } else {
    console.log('⚠️  Applying changes to Firebase...\n');

    // Create backup
    const backupPath = path.join(__dirname, '..', `backup-${LIST_ID}-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      listId: LIST_ID,
      timestamp: new Date().toISOString(),
      originalData: currentListData
    }, null, 2));
    console.log(`   💾 Backup created: ${backupPath}`);

    // Update list
    await listRef.update({
      articleIds: newArticleIds,
      itemStates: newItemStates,
      updatedAt: Timestamp.now()
    });

    console.log(`   ✅ List updated successfully!`);
    console.log();
  }

  console.log('='.repeat(80));
}

function createRecoveryTemplate(filePath: string) {
  const template = [
    {
      listId: 'FoIhdc4QqfgUx57JeRLD',
      listName: 'Hofer',
      articles: [
        {
          articleId: '', // Leave empty if unknown - will search by name
          articleName: 'Milk',
          isChecked: false,
          amount: '2L'
        },
        {
          articleId: '',
          articleName: 'Bread',
          isChecked: false
        },
        // Add more articles here
      ]
    },
    {
      listId: 'bwG4wE8gqjn78pRsOwic',
      listName: 'DM/Bipa',
      articles: [
        // Add articles here
      ]
    },
    {
      listId: 'bDJAexAC29O1oujEf3eq',
      listName: 'Messepark',
      articles: [
        // Add articles here
      ]
    },
    {
      listId: 'Krvv5jHvgKeRAZTR6uDH',
      listName: 'Birgit Urlaub Como',
      articles: [
        // Add articles here
      ]
    },
    {
      listId: 'CemqHIYJ868O89362x9V',
      listName: 'Sutterlüty',
      articles: [
        // Add articles here
      ]
    },
    {
      listId: '62PhcxI5ivkgfhdlNbaR',
      listName: 'Lädele',
      articles: [
        // Add articles here
      ]
    }
  ];

  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  console.log(`✅ Created recovery template: ${filePath}\n`);
  console.log('📝 Edit this file to add article data:');
  console.log('   - articleId: Firebase article ID (if known)');
  console.log('   - articleName: Name of article (required if no ID)');
  console.log('   - isChecked: true/false (was it checked off?)');
  console.log('   - amount: Optional amount (e.g., "2L", "500g")');
}

// Run the recovery
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
