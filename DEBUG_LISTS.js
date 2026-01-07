// DEBUG SCRIPT: Paste this in browser console when viewing a broken list
// This will help diagnose why articles aren't showing

console.log('🔍 Shoplisl List Debug Script');
console.log('================================\n');

// Get current user
const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      return user.uid;
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
    }
  }
  return 'unknown';
};

const currentUserId = getCurrentUser();
console.log(`Current User ID: ${currentUserId}\n`);

// Check lists in localStorage
const listsStr = localStorage.getItem('lists');
if (listsStr) {
  try {
    const lists = JSON.parse(listsStr);
    console.log(`Total lists found: ${lists.length}\n`);

    // Find broken lists
    const brokenListNames = ['Hofer', 'Lädele', 'Messepark', 'Sutterlütty', 'DM/Bipa'];

    brokenListNames.forEach(name => {
      const list = lists.find(l => l.name.toLowerCase().includes(name.toLowerCase()));
      if (list) {
        console.log(`📋 List: ${list.name}`);
        console.log(`   ID: ${list.id}`);
        console.log(`   Owner ID: ${list.ownerId || 'MISSING ❌'}`);
        console.log(`   Shared With: ${JSON.stringify(list.sharedWith || [])}`);
        console.log(`   Article IDs: ${list.articleIds ? `${list.articleIds.length} articles` : 'MISSING ❌'}`);
        console.log(`   Is Shared List: ${list.ownerId !== currentUserId ? 'YES ✅' : 'NO'}`);
        console.log(`   Is Shared Owned List: ${list.sharedWith && list.sharedWith.length > 0 ? 'YES ✅' : 'NO'}`);

        // Check if it would be skipped
        const isSharedList = list.ownerId !== currentUserId;
        const isSharedOwnedList = list.sharedWith && list.sharedWith.length > 0;
        if (!isSharedList && !isSharedOwnedList) {
          console.log(`   ⚠️ PROBLEM: This list would be SKIPPED for article loading!`);
        } else {
          console.log(`   ✅ This list should load articles`);
        }
        console.log('');
      } else {
        console.log(`📋 List "${name}" not found in localStorage\n`);
      }
    });

    // Summary
    console.log('\n📊 Summary:');
    const listsWithoutOwner = lists.filter(l => !l.ownerId);
    const listsWithoutSharedWith = lists.filter(l => !l.sharedWith);
    const listsWithoutArticleIds = lists.filter(l => !l.articleIds);

    if (listsWithoutOwner.length > 0) {
      console.log(`⚠️ ${listsWithoutOwner.length} lists missing ownerId:`, listsWithoutOwner.map(l => l.name));
    }
    if (listsWithoutSharedWith.length > 0) {
      console.log(`⚠️ ${listsWithoutSharedWith.length} lists missing sharedWith:`, listsWithoutSharedWith.map(l => l.name));
    }
    if (listsWithoutArticleIds.length > 0) {
      console.log(`⚠️ ${listsWithoutArticleIds.length} lists missing articleIds:`, listsWithoutArticleIds.map(l => l.name));
    }

  } catch (e) {
    console.error('Failed to parse lists from localStorage', e);
  }
} else {
  console.error('No lists found in localStorage');
}

console.log('\n================================');
console.log('Next steps:');
console.log('1. Check the warnings above');
console.log('2. If ownerId or sharedWith is missing, check Firestore data');
console.log('3. Look in browser console for "🔍 loadArticlesForList" logs');
console.log('4. Look for "⚠️ Skipping article load" warnings');
