# Analytics Verification Guide

## How to Check if Analytics Events Are Being Tracked

### Method 1: Check Browser Console

1. Open your app in the browser
2. Open Developer Tools (F12) → Console tab
3. Perform actions (login, create list, check articles)
4. Look for console messages:
   ```
   📈 Analytics: Event tracked (user_login) - Buffer: 1/50
   📈 Analytics: Event tracked (list_created) - Buffer: 2/50
   ```

If you see these messages, analytics tracking is working!

### Method 2: Force Immediate Flush (Testing)

**Temporary change for testing:**

Edit `src/app/core/services/analytics.service.ts`:

```typescript
// BEFORE (Production settings)
private readonly BATCH_SIZE = 50;
private readonly FLUSH_INTERVAL = 300000; // 5 minutes

// AFTER (Testing settings)
private readonly BATCH_SIZE = 1;  // Flush after every event
private readonly FLUSH_INTERVAL = 5000;   // Flush every 5 seconds
```

**After testing, REVERT to production settings!**

### Method 3: Check Firestore Console

1. Go to Firebase Console → Firestore Database
2. Navigate to `analytics/events/items/`
3. Look for documents with recent timestamps
4. Check the `Usage` tab to see read/write counts

### Method 4: Use Admin Dashboard

1. Login as admin (philipp.thurnher@gmail.com)
2. Navigate to `/admin`
3. Click "Refresh Data"
4. Check if metrics update (especially "Active Users" and "AI Inputs")

### Method 5: Manual Flush Test

Add this temporary button to test flushing:

```typescript
// In analytics.service.ts, make flush() public temporarily:
public async testFlush(): Promise<void> {
  await this.flush();
}

// In any component:
import { AnalyticsService } from './core/services/analytics.service';

constructor(private analytics: AnalyticsService) {}

testAnalytics() {
  this.analytics.testFlush();
  console.log('Manual flush triggered!');
}
```

## Expected Behavior Timeline

### When You Perform Actions

```
Action: User logs in
↓
📈 Event tracked: user_login (Buffer: 1/50)
↓
[NO WRITE YET - buffered in memory]
↓
... continue using app ...
↓
Action: Create 49 more lists/articles/AI commands
↓
📈 Event tracked: list_created (Buffer: 50/50)
↓
🚀 Buffer full, triggering flush
↓
📊 Writing 50 events (write #1)
↓
[WRITE TO FIRESTORE NOW]
↓
✅ Write #1 successful
```

### Alternative: Time-based Flush

```
Action: User logs in
↓
📈 Event tracked: user_login (Buffer: 1/50)
↓
[Wait 5 minutes...]
↓
⏰ Flush timer triggered
↓
📊 Writing 1 event (write #1)
↓
[WRITE TO FIRESTORE NOW]
↓
✅ Write #1 successful
```

### Page Unload Flush

```
Action: User closes tab
↓
beforeunload event triggered
↓
📊 Writing remaining events
↓
[WRITE TO FIRESTORE NOW]
↓
(may be lost if page closes too fast)
```

## Common Issues & Solutions

### Issue 1: "I don't see any console logs"

**Possible causes:**
- Analytics service not imported/injected
- Events only tracked for authenticated users (check `userId`)
- Console filter hiding logs (check filter settings)

**Solution:**
1. Ensure you're logged in
2. Check browser console filter (show "All" or "Info")
3. Verify `analyticsService` is injected in services

### Issue 2: "Events buffered but never written"

**Possible causes:**
- Not reaching 50 events threshold
- 5-minute timer not firing
- Firestore write permission issue

**Solution:**
1. Lower BATCH_SIZE to 1 for testing
2. Check Firestore rules are deployed
3. Check browser Network tab for failed requests

### Issue 3: "Admin dashboard shows 0 for all metrics"

**Possible causes:**
- No events written to Firestore yet
- Cache showing old data
- Firestore rules blocking reads

**Solution:**
1. Click "Refresh Data" to bypass cache
2. Check Firestore console for events
3. Verify admin user ID matches in guard and rules

### Issue 4: "Permission denied errors"

**Error:** `Missing or insufficient permissions`

**Possible causes:**
- Firestore rules not deployed
- Admin user ID mismatch
- Not authenticated

**Solution:**
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Verify admin ID in firestore.rules matches admin.guard.ts
# Both should be: HYqET9vr40eDju4nQCTnJTV0qJo2
```

### Issue 5: "High Firestore quota usage"

**Symptoms:**
- Warning: "Quota exceeded"
- Slow dashboard loading

**Solution:**
1. Check `BATCH_SIZE` is 50 (not 1)
2. Check `FLUSH_INTERVAL` is 300000 (not 5000)
3. Verify cache is working (see "Returning cached metrics" logs)
4. Check Firebase Console → Usage tab

## Testing Checklist

Before declaring analytics "working":

- [ ] Console logs show "Event tracked" messages
- [ ] At least one event written to Firestore (check console)
- [ ] Admin dashboard shows non-zero metrics
- [ ] Failed AI commands appear in dashboard table
- [ ] "Refresh Data" button updates metrics
- [ ] No permission errors in console
- [ ] Firestore quota usage < 1,000 reads/day

## Recommended Testing Workflow

**Day 1: Verify Tracking**
1. Set BATCH_SIZE = 1, FLUSH_INTERVAL = 5000
2. Perform various actions (login, create list, AI commands)
3. Check console logs
4. Check Firestore console
5. Verify events are written

**Day 2: Verify Dashboard**
1. Keep test settings from Day 1
2. Login as admin
3. Navigate to `/admin`
4. Verify metrics show data
5. Test "Refresh Data" button
6. Check failed commands table

**Day 3: Production Settings**
1. Revert to BATCH_SIZE = 50, FLUSH_INTERVAL = 300000
2. Perform actions and wait 5 minutes
3. Check Firestore console
4. Verify batched writes work
5. Monitor quota usage

**Day 4: Long-term Monitoring**
1. Use app normally for a week
2. Check admin dashboard daily
3. Monitor Firestore quota
4. Verify cache is working
5. Check for any errors

## Debugging Commands

```typescript
// In browser console (while app is running):

// Check analytics service state
window.analytics = inject(AnalyticsService)
console.log('Buffer size:', window.analytics.eventBuffer?.length)
console.log('Session ID:', window.analytics.getSessionId())

// Force flush (if method is public)
await window.analytics.flush()

// Check cache state
window.aggregation = inject(AnalyticsAggregationService)
window.aggregation.clearCache()
```

## Success Indicators

You'll know analytics are working when you see:

1. ✅ Console logs: "Event tracked" messages
2. ✅ Firestore: Documents in `analytics/events/items/`
3. ✅ Dashboard: Non-zero metrics
4. ✅ Quota: < 1,000 reads/day
5. ✅ No errors: No permission denied messages
6. ✅ Cache: "Returning cached metrics" logs

## Still Having Issues?

If analytics still aren't working after following this guide:

1. Check `/debug-admin` page to verify admin access
2. Export your browser console logs
3. Check Firebase Console → Firestore → Usage tab
4. Verify Firestore rules are deployed
5. Review `ADMIN_ANALYTICS.md` troubleshooting section

## Quick Fix Script

Create a test script to verify analytics:

```typescript
// test-analytics.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, addDoc, collection } from 'firebase/firestore';
import { firebaseConfig } from './src/environments/environment';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testAnalyticsWrite() {
  try {
    const testEvent = {
      eventType: 'test_event',
      userId: 'test-user-123',
      timestamp: new Date(),
      sessionId: 'test-session',
      metadata: { test: true }
    };

    const docRef = await addDoc(
      collection(db, 'analytics/events/items'),
      testEvent
    );

    console.log('✅ Test event written successfully!', docRef.id);
  } catch (error) {
    console.error('❌ Failed to write test event:', error);
  }
}

testAnalyticsWrite();
```

Run: `npx tsx test-analytics.ts`
