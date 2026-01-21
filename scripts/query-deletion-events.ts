/**
 * QUERY DELETION EVENTS: View analytics events for article deletions
 *
 * This script queries the analytics/events/items collection to show
 * all article deletion and removal events.
 *
 * Usage:
 *   npm run query:deletions
 *   npm run query:deletions -- --days 7
 *   npm run query:deletions -- --list-id bwG4wE8gqjn78pRsOwic
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const daysArg = args.find(arg => arg.startsWith('--days='));
const listIdArg = args.find(arg => arg.startsWith('--list-id='));
const days = daysArg ? parseInt(daysArg.split('=')[1]) : 30;
const targetListId = listIdArg ? listIdArg.split('=')[1] : null;

async function main() {
  console.log('='.repeat(80));
  console.log('🔍 QUERY DELETION EVENTS: Article Deletion History');
  console.log('='.repeat(80));
  console.log(`Date Range: Last ${days} days`);
  if (targetListId) {
    console.log(`Filtering: List ID ${targetListId}`);
  }
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

  // Calculate date threshold
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  console.log(`📊 Querying events since ${daysAgo.toISOString()}\n`);
  console.log('='.repeat(80));

  // Query deletion events
  const eventsRef = db.collection('analytics/events/items');

  // Get all events and filter in memory (Firestore free tier has limited query capabilities)
  const snapshot = await eventsRef
    .where('eventType', 'in', ['article_deleted', 'article_removed_from_list'])
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .get();

  console.log(`\n📥 Retrieved ${snapshot.size} events\n`);

  if (snapshot.empty) {
    console.log('ℹ️  No deletion events found.');
    console.log('\n💡 Note: Analytics events may not be enabled yet.');
    console.log('   See ENABLE_DELETION_TRACKING.md for setup instructions.\n');
    return;
  }

  // Process and display events
  let deletionCount = 0;
  let removalCount = 0;
  const userMap = new Map<string, number>();
  const listMap = new Map<string, { name: string; count: number }>();

  const events: any[] = [];

  snapshot.forEach(doc => {
    const event = doc.data();
    const timestamp = event.timestamp?.toDate?.() || new Date(event.timestamp);

    // Filter by date
    if (timestamp < daysAgo) {
      return;
    }

    // Filter by list ID if specified
    if (targetListId && event.metadata?.listId !== targetListId) {
      return;
    }

    events.push({
      id: doc.id,
      ...event,
      timestamp
    });

    // Count statistics
    if (event.eventType === 'article_deleted') {
      deletionCount++;
    } else if (event.eventType === 'article_removed_from_list') {
      removalCount++;
    }

    // Track users
    userMap.set(event.userId, (userMap.get(event.userId) || 0) + 1);

    // Track lists
    if (event.metadata?.listId && event.metadata?.listName) {
      const listId = event.metadata.listId;
      const existing = listMap.get(listId);
      if (existing) {
        existing.count++;
      } else {
        listMap.set(listId, { name: event.metadata.listName, count: 1 });
      }
    }
  });

  // Sort by timestamp (most recent first)
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Display events
  console.log('\n📋 DELETION EVENTS:\n');
  events.forEach((event, index) => {
    const eventNum = index + 1;
    const type = event.eventType === 'article_deleted' ? '🗑️  DELETED' : '➖ REMOVED FROM LIST';

    console.log(`${eventNum}. ${type}`);
    console.log(`   Article: ${event.metadata?.articleName || 'Unknown'} (${event.metadata?.articleId || 'Unknown'})`);
    console.log(`   User: ${event.userId}`);
    console.log(`   Time: ${event.timestamp.toISOString()}`);
    console.log(`   Session: ${event.sessionId}`);

    if (event.metadata?.listName) {
      console.log(`   List: ${event.metadata.listName} (${event.metadata.listId})`);
    }

    if (event.metadata?.offline) {
      console.log(`   📴 Offline: true`);
    }

    console.log('');
  });

  // Display statistics
  console.log('='.repeat(80));
  console.log('📊 STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total Events: ${events.length}`);
  console.log(`  - Article Deletions: ${deletionCount}`);
  console.log(`  - Article Removals from Lists: ${removalCount}\n`);

  console.log(`Unique Users: ${userMap.size}`);
  const sortedUsers = Array.from(userMap.entries()).sort((a, b) => b[1] - a[1]);
  sortedUsers.slice(0, 5).forEach(([userId, count]) => {
    console.log(`  - ${userId}: ${count} events`);
  });

  if (listMap.size > 0) {
    console.log(`\nAffected Lists: ${listMap.size}`);
    const sortedLists = Array.from(listMap.entries()).sort((a, b) => b[1].count - a[1].count);
    sortedLists.slice(0, 5).forEach(([listId, data]) => {
      console.log(`  - ${data.name} (${listId}): ${data.count} removals`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 TIP: Use --days=7 to see last 7 days, or --list-id=<id> to filter by list');
  console.log('='.repeat(80));
}

// Run the query
main().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
