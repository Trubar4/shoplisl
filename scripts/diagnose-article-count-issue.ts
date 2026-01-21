/**
 * DIAGNOSTIC SCRIPT: Check Article Count Display Issue
 *
 * This script inspects the Firestore data for affected shared lists
 * to understand why article counts aren't displaying.
 *
 * Usage:
 *   npm run diagnose-counts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Affected list IDs from user report
const AFFECTED_LIST_IDS = [
  'bwG4wE8gqjn78pRsOwic', // DM/Bipa
  'Krvv5jHvgKeRAZTR6uDH', // Birgit Urlaub Como
  'FoIhdc4QqfgUx57JeRLD', // Hofer
  'CemqHIYJ868O89362x9V', // Sutterlüty
  '62PhcxI5ivkgfhdlNbaR', // Lädele
];

const OWNER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

interface ListDiagnostic {
  listId: string;
  listName: string;
  ownerId: string;
  sharedWith: string[];
  articleIdsCount: number;
  articleIds: string[];
  itemStatesCount: number;
  itemStateKeys: string[];
  mismatchDetected: boolean;
  issues: string[];
  articlesExist: { [articleId: string]: boolean };
  collaboratorArticleCounts: { [userId: string]: number };
}

async function main() {
  console.log('='.repeat(80));
  console.log('🔍 DIAGNOSTIC: Article Count Display Issue');
  console.log('='.repeat(80));
  console.log(`Checking ${AFFECTED_LIST_IDS.length} affected lists\n`);

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-credentials.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ ERROR: firebase-credentials.json not found');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  });

  const db = admin.firestore();

  const diagnostics: ListDiagnostic[] = [];

  for (const listId of AFFECTED_LIST_IDS) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 List ID: ${listId}`);
    console.log('='.repeat(80));

    // Get list data
    const listRef = db.doc(`users-v2/${OWNER_ID}/lists/${listId}`);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      console.log('❌ List not found in Firestore\n');
      continue;
    }

    const listData = listDoc.data();
    const articleIds = listData?.['articleIds'] || [];
    const itemStates = listData?.['itemStates'] || {};
    const sharedWith = listData?.['sharedWith'] || [];

    const diagnostic: ListDiagnostic = {
      listId,
      listName: listData?.['name'] || 'Unknown',
      ownerId: listData?.['ownerId'] || OWNER_ID,
      sharedWith,
      articleIdsCount: articleIds.length,
      articleIds,
      itemStatesCount: Object.keys(itemStates).length,
      itemStateKeys: Object.keys(itemStates),
      mismatchDetected: false,
      issues: [],
      articlesExist: {},
      collaboratorArticleCounts: {}
    };

    console.log(`Name: ${diagnostic.listName}`);
    console.log(`Owner: ${diagnostic.ownerId}`);
    console.log(`Shared with: ${sharedWith.length} users`);
    if (sharedWith.length > 0) {
      console.log(`  Users: ${sharedWith.join(', ')}`);
    }
    console.log();

    // Check article counts
    console.log('📊 Data Structure:');
    console.log(`  articleIds.length: ${diagnostic.articleIdsCount}`);
    console.log(`  itemStates keys: ${diagnostic.itemStatesCount}`);

    if (diagnostic.articleIdsCount === 0 && diagnostic.itemStatesCount === 0) {
      diagnostic.issues.push('BOTH articleIds AND itemStates are empty');
      console.log('  ⚠️  ISSUE: Both articleIds and itemStates are empty!');
    } else if (diagnostic.articleIdsCount === 0 && diagnostic.itemStatesCount > 0) {
      diagnostic.issues.push('articleIds empty but itemStates has data (Bug 1 scenario)');
      console.log(`  ⚠️  ISSUE: articleIds empty but itemStates has ${diagnostic.itemStatesCount} entries`);
      console.log('  📝 This should trigger Bug 1 Fix in the listener');
    } else if (diagnostic.articleIdsCount !== diagnostic.itemStatesCount) {
      diagnostic.issues.push(`Count mismatch: articleIds=${diagnostic.articleIdsCount}, itemStates=${diagnostic.itemStatesCount}`);
      console.log(`  ⚠️  WARNING: Count mismatch detected`);
      diagnostic.mismatchDetected = true;
    } else {
      console.log('  ✅ Counts match');
    }
    console.log();

    // Check if articles exist
    if (diagnostic.articleIdsCount > 0 || diagnostic.itemStatesCount > 0) {
      console.log('🔍 Checking if articles exist:');

      // Collect all unique article IDs
      const allArticleIds = new Set([...articleIds, ...Object.keys(itemStates)]);

      // Collect all potential owner user IDs
      const allUserIds = [diagnostic.ownerId, ...sharedWith];

      console.log(`  Checking ${allArticleIds.size} articles across ${allUserIds.length} users...`);

      for (const userId of allUserIds) {
        // Get all articles for this user
        const userArticlesRef = db.collection(`users-v2/${userId}/articles`);
        const userArticlesSnapshot = await userArticlesRef.get();
        diagnostic.collaboratorArticleCounts[userId] = userArticlesSnapshot.size;

        console.log(`  👤 User ${userId}: ${userArticlesSnapshot.size} articles`);
      }
      console.log();

      // Check each article
      let foundCount = 0;
      let notFoundCount = 0;

      for (const articleId of allArticleIds) {
        let found = false;

        for (const userId of allUserIds) {
          const articleRef = db.doc(`users-v2/${userId}/articles/${articleId}`);
          const articleDoc = await articleRef.get();

          if (articleDoc.exists) {
            found = true;
            diagnostic.articlesExist[articleId] = true;
            const articleData = articleDoc.data();
            console.log(`  ✅ ${articleData?.['name'] || articleId} (owned by ${userId})`);
            foundCount++;
            break;
          }
        }

        if (!found) {
          diagnostic.articlesExist[articleId] = false;
          console.log(`  ❌ Article ${articleId} NOT FOUND in any user collection`);
          diagnostic.issues.push(`Orphaned article ID: ${articleId}`);
          notFoundCount++;
        }
      }

      console.log();
      console.log(`📊 Article Check Summary:`);
      console.log(`  Found: ${foundCount}`);
      console.log(`  Not Found (orphaned): ${notFoundCount}`);
    }

    console.log();
    console.log('🔍 Root Cause Analysis:');

    if (diagnostic.issues.length === 0) {
      console.log('  ✅ No issues detected - list structure looks correct');
      console.log('  💡 If count still not showing, issue may be in frontend logic');
    } else {
      console.log('  ⚠️  Issues detected:');
      diagnostic.issues.forEach(issue => console.log(`     - ${issue}`));
    }

    diagnostics.push(diagnostic);
  }

  // Final summary
  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 SUMMARY: All Affected Lists');
  console.log('='.repeat(80));
  console.log();

  console.log('| List Name                | articleIds | itemStates | Match | Issues |');
  console.log('|--------------------------|------------|------------|-------|--------|');

  diagnostics.forEach(d => {
    const match = d.articleIdsCount === d.itemStatesCount ? '✅' : '⚠️';
    const issueCount = d.issues.length;
    console.log(`| ${d.listName.padEnd(24)} | ${String(d.articleIdsCount).padEnd(10)} | ${String(d.itemStatesCount).padEnd(10)} | ${match}    | ${issueCount}      |`);
  });

  console.log();

  // Common patterns
  const emptyBothCount = diagnostics.filter(d => d.articleIdsCount === 0 && d.itemStatesCount === 0).length;
  const emptyArticleIdsCount = diagnostics.filter(d => d.articleIdsCount === 0 && d.itemStatesCount > 0).length;
  const mismatchCount = diagnostics.filter(d => d.mismatchDetected).length;

  console.log('🔍 Pattern Analysis:');
  console.log(`  Lists with both empty: ${emptyBothCount}`);
  console.log(`  Lists with empty articleIds but data in itemStates: ${emptyArticleIdsCount}`);
  console.log(`  Lists with count mismatch: ${mismatchCount}`);
  console.log();

  if (emptyBothCount > 0) {
    console.log('🚨 PRIMARY ISSUE: Lists have no data in either articleIds or itemStates');
    console.log('   This means the recovery script may not have restored the data properly.');
    console.log('   Action: Check recovery-data.json and re-run recovery script if needed.');
  } else if (emptyArticleIdsCount > 0) {
    console.log('🚨 PRIMARY ISSUE: articleIds is empty but itemStates has data');
    console.log('   This should be handled by Bug 1 Fix in the shared list listener.');
    console.log('   Action: Check if Bug 1 Fix is working in setupSingleSharedListListener()');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('✅ Diagnostic complete!');
  console.log('='.repeat(80));

  // Save diagnostic report
  const reportPath = path.join(__dirname, '..', 'diagnostic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(diagnostics, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}\n`);
}

// Run diagnostic
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
