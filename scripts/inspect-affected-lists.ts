/**
 * INSPECTION SCRIPT: Check Current State of Affected Lists
 *
 * This script inspects the 6 affected shopping lists to understand
 * the current state and what data needs to be recovered.
 *
 * Usage:
 *   npm run inspect-lists
 *
 * Output:
 *   - Current articleIds count for each list
 *   - Current itemStates count for each list
 *   - List owner and collaborators
 *   - Article details (if any remain)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Affected lists and their details
const AFFECTED_LISTS = [
  { id: 'bwG4wE8gqjn78pRsOwic', name: 'DM/Bipa' },
  { id: 'bDJAexAC29O1oujEf3eq', name: 'Messepark' },
  { id: 'Krvv5jHvgKeRAZTR6uDH', name: 'Birgit Urlaub Como' },
  { id: 'FoIhdc4QqfgUx57JeRLD', name: 'Hofer', expectedArticles: 8 },
  { id: 'CemqHIYJ868O89362x9V', name: 'Sutterlüty' },
  { id: '62PhcxI5ivkgfhdlNbaR', name: 'Lädele' },
];

const OWNER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

interface ListData {
  id: string;
  name: string;
  ownerId: string;
  sharedWith?: string[];
  articleIds: string[];
  itemStates: { [articleId: string]: any };
  createdAt: any;
  updatedAt: any;
}

interface Article {
  id: string;
  name: string;
  ownerId: string;
  [key: string]: any;
}

async function main() {
  console.log('='.repeat(80));
  console.log('🔍 INSPECTION: Affected Shopping Lists');
  console.log('='.repeat(80));
  console.log(`Owner: ${OWNER_ID}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    console.error(`   Expected at: ${serviceAccountPath}`);
    console.error('\n📝 To fix:');
    console.error('   1. Download service account key from Firebase Console');
    console.error('   2. Save as firebase-credentials.json in project root');
    console.error('   3. Make sure it has Firestore read permissions');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  // Inspect each affected list
  for (const affectedList of AFFECTED_LISTS) {
    console.log('-'.repeat(80));
    console.log(`📋 List: ${affectedList.name}`);
    console.log(`   ID: ${affectedList.id}`);
    if (affectedList.expectedArticles) {
      console.log(`   Expected Articles: ${affectedList.expectedArticles}`);
    }
    console.log();

    try {
      // Get list document
      const listRef = db.doc(`users-v2/${OWNER_ID}/lists/${affectedList.id}`);
      const listDoc = await listRef.get();

      if (!listDoc.exists) {
        console.error('   ❌ LIST NOT FOUND in Firebase!');
        console.log();
        continue;
      }

      const listData = listDoc.data() as ListData;

      // Display list metadata
      console.log(`   📊 Current State:`);
      console.log(`      Owner: ${listData.ownerId}`);
      console.log(`      Shared With: ${listData.sharedWith?.length || 0} users`);
      if (listData.sharedWith && listData.sharedWith.length > 0) {
        listData.sharedWith.forEach(userId => {
          console.log(`         - ${userId}`);
        });
      }

      const articleIds = listData.articleIds || [];
      const itemStates = listData.itemStates || {};

      console.log(`      Article IDs: ${articleIds.length}`);
      console.log(`      Item States: ${Object.keys(itemStates).length}`);
      console.log(`      Created: ${listData.createdAt?.toDate?.()?.toISOString() || 'Unknown'}`);
      console.log(`      Updated: ${listData.updatedAt?.toDate?.()?.toISOString() || 'Unknown'}`);

      // Check if data was lost
      if (articleIds.length === 0 && Object.keys(itemStates).length === 0) {
        console.log(`\n   🔴 DATA LOSS CONFIRMED:`);
        console.log(`      ✗ articleIds array is EMPTY`);
        console.log(`      ✗ itemStates object is EMPTY`);

        if (affectedList.expectedArticles) {
          console.log(`      ✗ Expected ~${affectedList.expectedArticles} articles`);
        }
      } else {
        console.log(`\n   ⚠️  Partial data found:`);

        if (articleIds.length > 0) {
          console.log(`      Article IDs (${articleIds.length}):`);
          for (const articleId of articleIds) {
            // Try to load article details
            const articleRef = db.doc(`users-v2/${OWNER_ID}/articles/${articleId}`);
            const articleDoc = await articleRef.get();

            if (articleDoc.exists) {
              const article = articleDoc.data() as Article;
              const state = itemStates[articleId];
              const checkedStatus = state?.isChecked ? '✓' : '○';
              console.log(`         ${checkedStatus} ${article.name} (${articleId})`);
            } else {
              console.log(`         ⚠️  Orphaned: ${articleId} (article not found)`);
            }
          }
        }

        if (Object.keys(itemStates).length > 0) {
          console.log(`\n      Item States (${Object.keys(itemStates).length}):`);
          const uniqueStates = Object.keys(itemStates).filter(id => !articleIds.includes(id));
          if (uniqueStates.length > 0) {
            console.log(`         ${uniqueStates.length} states without matching articleIds`);
          }
        }
      }

      // Check for collaborator articles
      if (listData.sharedWith && listData.sharedWith.length > 0) {
        console.log(`\n   👥 Checking Collaborator Articles:`);

        const allUserIds = [OWNER_ID, ...listData.sharedWith];
        let totalArticlesFound = 0;

        for (const userId of allUserIds) {
          try {
            const articlesRef = db.collection(`users-v2/${userId}/articles`);
            const articlesSnapshot = await articlesRef.get();
            const articleCount = articlesSnapshot.size;
            totalArticlesFound += articleCount;

            console.log(`      User ${userId}: ${articleCount} articles`);

            if (articleCount > 0 && articleCount <= 20) {
              // Show article names for small collections
              articlesSnapshot.forEach(doc => {
                const article = doc.data() as Article;
                console.log(`         - ${article.name} (${doc.id})`);
              });
            }
          } catch (error: any) {
            console.error(`      ❌ Failed to load articles for ${userId}: ${error.message}`);
          }
        }

        if (totalArticlesFound === 0 && articleIds.length === 0) {
          console.log(`      🔴 WARNING: No articles found for ANY collaborator!`);
          console.log(`         This suggests articles were also deleted, not just list references`);
        }
      }

      console.log();

    } catch (error: any) {
      console.error(`   ❌ ERROR inspecting list: ${error.message}\n`);
    }
  }

  console.log('='.repeat(80));
  console.log('📊 INSPECTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total lists inspected: ${AFFECTED_LISTS.length}`);
  console.log(`\n💡 Next Steps:`);
  console.log(`   1. If all lists show EMPTY data → Use Firebase PITR to restore`);
  console.log(`   2. If some data exists → Use recovery script to fix remaining lists`);
  console.log(`   3. Check collaborator article collections for potential data`);
  console.log('='.repeat(80));
}

// Run the inspection
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
