/**
 * GET LIST IDS HELPER SCRIPT
 *
 * Run this in browser console to get the IDs of all your lists
 * This will help you update the recovery script with the correct IDs
 *
 * Instructions:
 * 1. Open the app and make sure you're logged in
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Press Enter
 * 5. Copy the list IDs and update RECOVER_ARTICLE_IDS.js
 */

(function getListIds() {
  console.log('📋 GETTING ALL LIST IDS');
  console.log('='.repeat(70));

  // Try to get lists from localStorage
  const listsJson = localStorage.getItem('lists');

  if (listsJson) {
    try {
      const lists = JSON.parse(listsJson);
      console.log(`\n✅ Found ${lists.length} lists in localStorage:\n`);

      lists.forEach((list, index) => {
        console.log(`${index + 1}. ${list.name || 'Unnamed'}`);
        console.log(`   ID: ${list.id}`);
        console.log(`   Owner: ${list.ownerId || 'NOT SET'}`);
        console.log(`   Articles: ${list.articleIds?.length || 0}`);
        console.log(`   Shared with: ${list.sharedWith?.length || 0} users`);
        console.log('');
      });

      console.log('='.repeat(70));
      console.log('\n📝 COPY THESE IDS TO RECOVERY SCRIPT:');
      console.log('\nconst listsToRecover = [');

      // Find the affected lists (the ones mentioned by the user)
      const affectedNames = ['hofer', 'sutterlüty', 'lädele', 'messepark', 'dm', 'bipa'];

      lists.forEach(list => {
        const listNameLower = (list.name || '').toLowerCase();
        const isAffected = affectedNames.some(name => listNameLower.includes(name));

        if (isAffected) {
          console.log(`  { id: '${list.id}', name: '${list.name}', ownerId: '${list.ownerId || 'UNKNOWN'}' },`);
        }
      });

      console.log('];');
      console.log('\n' + '='.repeat(70));

    } catch (error) {
      console.error('❌ Error parsing lists from localStorage:', error);
    }
  } else {
    console.log('❌ No lists found in localStorage');
    console.log('\n💡 Try this alternative method:');
    console.log('   1. Go to Firestore console');
    console.log('   2. Navigate to users-v2/{yourUserId}/lists');
    console.log('   3. Find each list and copy its ID');
  }
})();
