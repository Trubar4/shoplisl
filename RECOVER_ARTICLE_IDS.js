/**
 * ARTICLE IDS RECOVERY SCRIPT
 *
 * This script restores articleIds from the old database location to the new location
 *
 * BEFORE RUNNING:
 * 1. Make sure you're logged into the app
 * 2. Open browser console (F12) on the app page
 * 3. Verify the list IDs below are correct (check Firestore console)
 *
 * TO RUN:
 * 1. Copy this entire script
 * 2. Paste into browser console
 * 3. Press Enter
 * 4. Follow the prompts
 */

async function recoverArticleIds() {
  console.log('🚨 ARTICLE IDS RECOVERY SCRIPT');
  console.log('='.repeat(70));
  console.log('\n⚠️  WARNING: This will modify your Firestore database!');
  console.log('Make sure you have a backup or can restore from the old location.\n');

  // STEP 1: Get Firestore instance
  const db = window['ng']?.probe?.(document.querySelector('app-root'))?.injector?.get?.(
    class { constructor() { this.name = 'Firestore'; } }
  );

  if (!db) {
    console.error('❌ Could not get Firestore instance. Make sure app is loaded.');
    return;
  }

  console.log('✅ Firestore instance obtained');

  // STEP 2: Define the lists that need recovery
  // UPDATE THESE WITH THE ACTUAL LIST IDS FROM FIRESTORE CONSOLE
  const listsToRecover = [
    {
      id: 'FoIhdc4QqfgUx57JeRLD',  // Hofer - confirmed ID
      name: 'Hofer',
      ownerId: null  // Will be determined from list data
    },
    {
      id: 'REPLACE_WITH_SUTTERLÜTY_ID',  // Sutterlüty
      name: 'Sutterlüty',
      ownerId: null
    },
    {
      id: 'REPLACE_WITH_LÄDELE_ID',  // Lädele
      name: 'Lädele',
      ownerId: null
    },
    {
      id: 'REPLACE_WITH_MESSEPARK_ID',  // Messepark
      name: 'Messepark',
      ownerId: null
    },
    {
      id: 'REPLACE_WITH_DM_BIPA_ID',  // DM/Bipa
      name: 'DM/Bipa',
      ownerId: null
    }
  ];

  console.log(`\n📋 Lists to recover: ${listsToRecover.length}`);
  listsToRecover.forEach(list => console.log(`   - ${list.name} (${list.id})`));

  // STEP 3: Import Firestore functions
  const { doc, getDoc, updateDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
  );

  // STEP 4: Get Firestore instance properly
  const { getFirestore } = await import(
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
  );
  const firestore = getFirestore();

  console.log('\n🔄 Starting recovery process...\n');

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const listInfo of listsToRecover) {
    if (listInfo.id.startsWith('REPLACE_WITH_')) {
      console.log(`⏭️  Skipping ${listInfo.name} - ID not set`);
      results.skipped.push(listInfo.name);
      continue;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📦 Processing: ${listInfo.name} (${listInfo.id})`);
    console.log(`${'─'.repeat(70)}`);

    try {
      // Read from OLD location
      const oldPath = `users/shared-shoplisl-user/lists/${listInfo.id}`;
      console.log(`   📖 Reading from OLD: ${oldPath}`);

      const oldRef = doc(firestore, 'users', 'shared-shoplisl-user', 'lists', listInfo.id);
      const oldDoc = await getDoc(oldRef);

      if (!oldDoc.exists()) {
        console.log(`   ❌ List not found in old location`);
        results.failed.push({ name: listInfo.name, error: 'Not found in old location' });
        continue;
      }

      const oldData = oldDoc.data();
      const oldArticleIds = oldData.articleIds || [];
      console.log(`   ✅ Found ${oldArticleIds.length} articles in old location`);

      if (oldArticleIds.length === 0) {
        console.log(`   ⚠️  No articles to recover (old location is also empty)`);
        results.skipped.push(listInfo.name);
        continue;
      }

      // Determine ownerId from old data or current list data
      let ownerId = oldData.ownerId;

      if (!ownerId) {
        // Try to get ownerId from current user
        const currentUserId = localStorage.getItem('currentUserId');
        if (currentUserId) {
          ownerId = currentUserId;
          console.log(`   ℹ️  Using current user as ownerId: ${ownerId}`);
        } else {
          console.log(`   ❌ Cannot determine ownerId`);
          results.failed.push({ name: listInfo.name, error: 'Cannot determine ownerId' });
          continue;
        }
      }

      // Read from NEW location
      const newPath = `users-v2/${ownerId}/lists/${listInfo.id}`;
      console.log(`   📖 Reading from NEW: ${newPath}`);

      const newRef = doc(firestore, 'users-v2', ownerId, 'lists', listInfo.id);
      const newDoc = await getDoc(newRef);

      if (!newDoc.exists()) {
        console.log(`   ❌ List not found in new location: ${newPath}`);
        results.failed.push({ name: listInfo.name, error: 'Not found in new location' });
        continue;
      }

      const newData = newDoc.data();
      const currentArticleIds = newData.articleIds || [];
      console.log(`   📊 Current articles in new location: ${currentArticleIds.length}`);

      // Show what will be restored
      console.log(`\n   📋 RECOVERY PLAN:`);
      console.log(`      OLD location has: ${oldArticleIds.length} articles`);
      console.log(`      NEW location has: ${currentArticleIds.length} articles`);
      console.log(`      Will restore: ${oldArticleIds.length} articles to NEW location`);

      // Update the new location with articleIds from old location
      console.log(`\n   💾 Writing ${oldArticleIds.length} articleIds to: ${newPath}`);

      await updateDoc(newRef, {
        articleIds: oldArticleIds,
        recoveredAt: new Date().toISOString(),
        recoveredFrom: oldPath
      });

      console.log(`   ✅ SUCCESS: Restored ${oldArticleIds.length} articles to ${listInfo.name}`);
      results.success.push(listInfo.name);

    } catch (error) {
      console.error(`   ❌ ERROR processing ${listInfo.name}:`, error.message);
      results.failed.push({ name: listInfo.name, error: error.message });
    }
  }

  // STEP 5: Print summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 RECOVERY SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Recovered: ${results.success.length} lists`);
  if (results.success.length > 0) {
    results.success.forEach(name => console.log(`   - ${name}`));
  }
  console.log(`\n❌ Failed: ${results.failed.length} lists`);
  if (results.failed.length > 0) {
    results.failed.forEach(item => console.log(`   - ${item.name}: ${item.error}`));
  }
  console.log(`\n⏭️  Skipped: ${results.skipped.length} lists`);
  if (results.skipped.length > 0) {
    results.skipped.forEach(name => console.log(`   - ${name}`));
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log('\n✨ Recovery complete! Refresh the page to see restored articles.\n');
}

// Auto-execute
recoverArticleIds().catch(error => {
  console.error('💥 Recovery script failed:', error);
});
