#!/usr/bin/env node
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.log('❌ Service account key not found - cannot check database');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'shoplisl'
});

const db = admin.firestore();

async function checkState() {
  // Check one list to see its current state
  const usersSnapshot = await db.collection('users-v2').get();

  if (usersSnapshot.empty) {
    console.log('No users found in users-v2');
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  console.log('Checking user:', userId);

  const listsSnapshot = await db.collection('users-v2').doc(userId).collection('lists').limit(1).get();

  if (listsSnapshot.empty) {
    console.log('No lists found');
    return;
  }

  const listDoc = listsSnapshot.docs[0];
  const data = listDoc.data();

  console.log('\n=== LIST STATE ===');
  console.log('List name:', data.name || listDoc.id);
  console.log('ArticleIds count:', (data.articleIds || []).length);
  console.log('ItemStates present:', !!data.itemStates);
  console.log('ItemStates count:', data.itemStates ? Object.keys(data.itemStates).length : 0);

  if (data.itemStates) {
    const states = Object.values(data.itemStates);
    const checkedCount = states.filter(s => s.checked === true).length;
    const uncheckedCount = states.filter(s => s.checked === false).length;
    console.log('Checked articles:', checkedCount);
    console.log('Unchecked articles:', uncheckedCount);

    console.log('\nFirst 3 itemStates:');
    Object.entries(data.itemStates).slice(0, 3).forEach(([id, state]) => {
      console.log(`  ${id}: checked=${state.checked}`);
    });
  }

  console.log('\n=== RECOVERY METADATA ===');
  console.log('RecoveredAt:', data.recoveredAt ? data.recoveredAt.toDate().toISOString() : 'not set');
  console.log('RecoveredFrom:', data.recoveredFrom || 'not set');
  console.log('RecoveredCount:', data.recoveredCount || 'not set');
}

checkState()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
