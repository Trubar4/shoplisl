/**
 * CHECK LIST STATE: Inspect current state of specific lists in Firestore
 *
 * This script checks the current state of specific lists to diagnose data loss.
 *
 * Usage:
 *   npm run check:lists
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// SPECIFIC LIST IDs TO CHECK
const TARGET_LIST_IDS = [
  { id: 'bwG4wE8gqjn78pRsOwic', name: 'DM/Bipa' },
  { id: 'Krvv5jHvgKeRAZTR6uDH', name: 'Birgit Urlaub Como' },
  { id: 'FoIhdc4QqfgUx57JeRLD', name: 'Hofer' },
  { id: 'CemqHIYJ868O89362x9V', name: 'Sutterlüty' },
  { id: '62PhcxI5ivkgfhdlNbaR', name: 'Lädele' }
];

async function main() {
  console.log('='.repeat(80));
  console.log('🔍 CHECK LIST STATE: Inspect Current Firestore Data');
  console.log('='.repeat(80));
  console.log(`Checking ${TARGET_LIST_IDS.length} lists`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(process.cwd(), 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    console.error('Cannot connect to Firebase without credentials.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  // Known owner from backup analysis
  const OWNER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

  console.log(`👤 Owner ID: ${OWNER_ID}\n`);
  console.log('=' .repeat(80));

  for (const target of TARGET_LIST_IDS) {
    console.log(`\n📋 Checking: ${target.name} (${target.id})`);
    console.log('-'.repeat(80));

    try {
      const listRef = db.doc(`users-v2/${OWNER_ID}/lists/${target.id}`);
      const listDoc = await listRef.get();

      if (!listDoc.exists) {
        console.log('❌ LIST NOT FOUND IN FIRESTORE');
        console.log('   This list document does not exist.');
        continue;
      }

      const data = listDoc.data();
      if (!data) {
        console.log('❌ LIST EXISTS BUT HAS NO DATA');
        continue;
      }

      // Check critical fields
      const articleIds = data.articleIds || [];
      const itemStates = data.itemStates || {};
      const sharedWith = data.sharedWith || [];

      console.log(`✅ List exists in Firestore`);
      console.log(`   Name: ${data.name}`);
      console.log(`   ArticleIds: ${articleIds.length} items`);
      console.log(`   ItemStates: ${Object.keys(itemStates).length} items`);
      console.log(`   Shared with: ${sharedWith.length} users`);
      console.log(`   Created: ${data.createdAt?.toDate?.()?.toISOString() || 'N/A'}`);
      console.log(`   Updated: ${data.updatedAt?.toDate?.()?.toISOString() || 'N/A'}`);

      // Analyze data loss
      if (articleIds.length === 0 && Object.keys(itemStates).length === 0) {
        console.log('\n   ⚠️  DATA LOSS DETECTED:');
        console.log('   - Both articleIds and itemStates are empty');
        console.log('   - This indicates complete data loss for this list');
      } else if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
        console.log('\n   ⚠️  PARTIAL DATA LOSS:');
        console.log('   - articleIds is empty but itemStates has data');
        console.log('   - Bug 1 Fix should handle this case');
      } else if (articleIds.length > 0 && Object.keys(itemStates).length === 0) {
        console.log('\n   ⚠️  INCONSISTENT STATE:');
        console.log('   - articleIds has data but itemStates is empty');
        console.log('   - This is unusual and may indicate a problem');
      } else {
        console.log('\n   ✅ Data appears intact');
      }

      // Sample article IDs
      if (articleIds.length > 0) {
        console.log(`\n   Sample Article IDs (first 5):`);
        articleIds.slice(0, 5).forEach((id: string) => {
          console.log(`   - ${id}`);
        });
      }

      // Check if articles actually exist
      if (articleIds.length > 0) {
        console.log(`\n   Checking if articles exist in Firestore...`);
        let existingCount = 0;
        let missingCount = 0;

        // Check first 5 articles
        for (const articleId of articleIds.slice(0, 5)) {
          const articleRef = db.doc(`users-v2/${OWNER_ID}/articles/${articleId}`);
          const articleDoc = await articleRef.get();
          if (articleDoc.exists) {
            existingCount++;
          } else {
            missingCount++;
            console.log(`   ⚠️  Article ${articleId} NOT FOUND`);
          }
        }

        console.log(`   Results (sampled 5): ${existingCount} exist, ${missingCount} missing`);
      }

    } catch (error) {
      console.log(`❌ ERROR checking list: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log('Use npm run restore:specific to restore these lists from backup');
  console.log('='.repeat(80));
}

// Run the check
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
