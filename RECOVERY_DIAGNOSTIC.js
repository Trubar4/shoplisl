/**
 * RECOVERY DIAGNOSTIC SCRIPT
 * Run this in the browser console to analyze the data loss
 *
 * Instructions:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire script
 * 3. Press Enter
 * 4. Review the output to understand what data exists where
 */

(async function diagnoseDataLoss() {
  console.log('🔍 Starting data loss diagnostic...');

  const { getFirestore, collection, doc, getDoc, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const db = getFirestore();

  console.log('\n📊 DIAGNOSTIC REPORT\n' + '='.repeat(60));

  // List IDs to check (the affected lists)
  const affectedLists = [
    { id: 'FoIhdc4QqfgUx57JeRLD', name: 'Hofer' },
    { id: 'vH8xwHnlKj5w7jGN1234', name: 'Sutterlüty' },  // Replace with actual ID
    { id: 'LädeleListId12345678', name: 'Lädele' },      // Replace with actual ID
    { id: 'MesseparkId123456789', name: 'Messepark' },   // Replace with actual ID
  ];

  for (const listInfo of affectedLists) {
    console.log(`\n\n🔍 Checking list: ${listInfo.name} (${listInfo.id})`);
    console.log('-'.repeat(60));

    try {
      // Check OLD location: users/shared-shoplisl-user/lists/{listId}
      console.log('\n📦 OLD LOCATION: users/shared-shoplisl-user/lists/' + listInfo.id);
      const oldRef = doc(db, 'users', 'shared-shoplisl-user', 'lists', listInfo.id);
      const oldDoc = await getDoc(oldRef);

      if (oldDoc.exists()) {
        const oldData = oldDoc.data();
        console.log('✅ FOUND in old location');
        console.log(`   - articleIds: ${oldData.articleIds?.length || 0} articles`);
        console.log(`   - Articles: ${JSON.stringify(oldData.articleIds || []).substring(0, 200)}...`);
        console.log(`   - name: ${oldData.name}`);
        console.log(`   - ownerId: ${oldData.ownerId || 'NOT SET'}`);
        console.log(`   - sharedWith: ${JSON.stringify(oldData.sharedWith || [])}`);
      } else {
        console.log('❌ NOT FOUND in old location');
      }

      // Try to find in NEW location - but we need to know the ownerId
      // Let's check the current user's lists
      console.log('\n📦 NEW LOCATION: Searching users-v2/*');

      // Get current user from localStorage
      const currentUserId = localStorage.getItem('currentUserId');
      if (currentUserId) {
        console.log(`   Current user: ${currentUserId}`);
        const newRef = doc(db, 'users-v2', currentUserId, 'lists', listInfo.id);
        const newDoc = await getDoc(newRef);

        if (newDoc.exists()) {
          const newData = newDoc.data();
          console.log('✅ FOUND in new location (current user)');
          console.log(`   - articleIds: ${newData.articleIds?.length || 0} articles`);
          console.log(`   - Articles: ${JSON.stringify(newData.articleIds || []).substring(0, 200)}...`);
          console.log(`   - name: ${newData.name}`);
          console.log(`   - ownerId: ${newData.ownerId || 'NOT SET'}`);
          console.log(`   - sharedWith: ${JSON.stringify(newData.sharedWith || [])}`);
        } else {
          console.log('❌ NOT FOUND in new location (current user)');
        }
      }

    } catch (error) {
      console.error(`❌ Error checking ${listInfo.name}:`, error.message);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📋 NEXT STEPS:');
  console.log('1. Review the output above');
  console.log('2. Note which lists have data in OLD location but not NEW location');
  console.log('3. Get the actual list IDs from Firestore console');
  console.log('4. Run the RECOVERY script to restore the data');
  console.log('='.repeat(60));
})();
