# Debugging Guide - Firestore Reads Monitoring

**Date:** 2026-01-23
**Purpose:** Guide for monitoring and debugging Firestore read operations after optimization fixes

---

## Quick Start - Testing the Fixes

### 1. Open Browser Console

All quota monitoring logs appear in the browser console. Open it with:
- Chrome/Edge: `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (Mac)
- Firefox: `F12` or `Ctrl+Shift+K`
- Safari: `Cmd+Option+C`

### 2. Test Scenario: Single User Session

**Steps:**
1. Clear browser console
2. Open the app (lists overview)
3. Open any list detail page
4. Toggle 5 articles
5. Switch filters 2-3 times
6. Add 1-2 articles
7. Navigate back to lists overview
8. Open another list

**Expected Console Output:**

#### On App Start (Lists Overview):
```
📊 QUOTA: Articles Collection Listener (+N reads) | Session: N
📊 QUOTA: Lists Collection Listener (+M reads) | Session: N+M
📊 QUOTA: Share-Invites Listener (+K reads) | Session: N+M+K
🔔 Share-invites listener FIRED: K accepted invites
📊 This listener should be cleaned up when first list detail is opened
```

#### When Opening First List Detail:
```
🚀 QUOTA OPTIMIZATION: Cleaning up collection listeners
📍 articlesUnsubscribe exists: true, listsUnsubscribe exists: true, sharedListsUnsubscribe exists: true
✅ Articles collection listener unsubscribed (saves ~450 reads per change!)
✅ Lists collection listener unsubscribe (saves ~13 reads per change!)
✅ Share-invites listener unsubscribed (saves 200-400 reads per session!)
✅ All collection listeners cleanup complete - quota usage should drop by ~80%!
📊 QUOTA: Owned List Listener (+1 reads) | Session: X
```

#### After This Point:
- ❌ You should **NOT** see "Share-invites listener FIRED" again
- ❌ You should **NOT** see "Articles Collection Listener" again
- ❌ You should **NOT** see "Lists Collection Listener" again
- ✅ You **SHOULD** only see "Owned List Listener" or "Shared List Listener" for the active list

**Total Expected Reads:** ~50-100 reads for entire session

---

## Debugging Commands

### Run These in Browser Console

#### 1. Check Overall Quota Status
```javascript
// Get the quota monitor service
const monitor = document.querySelector('app-root')?._debugContext?.component?.quotaMonitor
               || window['ng']?.probe(document.querySelector('app-root'))?.injector?.get('QuotaMonitorService');

// Get current status
console.log(monitor.getQuotaStatus());
```

**Expected Output:**
```javascript
{
  sessionReads: 73,           // Should be 50-150 for normal session
  estimatedDailyReads: 73,
  dailyLimit: 50000,
  usagePercent: 0.146,        // Should be < 1% for single session
  remaining: 49927,
  status: 'healthy'           // Should be 'healthy'
}
```

#### 2. Get Detailed Breakdown
```javascript
monitor.logDetailedBreakdown();
```

**Expected Output:**
```
📊 ===== QUOTA BREAKDOWN (Last 100 Operations) =====
Total Session Reads: 73
Estimated Daily Reads: 73

Reads by Operation Type:
  Owned List Listener: 25 reads (15 times, 34.2%)
  Batch Article Load: 20 reads (2 times, 27.4%)
  Lists Collection Listener: 10 reads (1 times, 13.7%)
  Share-Invites Listener: 8 reads (1 times, 11.0%)
  Articles Collection Listener: 5 reads (1 times, 6.8%)
  Shared List Initial Load: 5 reads (5 times, 6.8%)
==================================================
```

**What to Look For:**
- ✅ **Good:** Share-Invites Listener fires 1-2 times only
- ❌ **Bad:** Share-Invites Listener fires 10+ times
- ✅ **Good:** Collection Listeners fire 1 time each
- ❌ **Bad:** Collection Listeners fire multiple times

#### 3. Check Share-Invites Listener Health
```javascript
const health = monitor.checkShareInvitesListenerHealth();
console.log(health);
```

**Expected Output (Healthy):**
```javascript
{
  isHealthy: true,
  message: "✅ Share-invites listener is healthy (fired 1 times, 2 reads)",
  fireCount: 1,
  totalReads: 2
}
```

**Expected Output (Unhealthy - Fix Not Working):**
```javascript
{
  isHealthy: false,
  message: "⚠️ Share-invites listener fired 15 times! Should be cleaned up after first list detail visit. Check cleanup logs.",
  fireCount: 15,
  totalReads: 30
}
```

#### 4. Export Full Report for Analysis
```javascript
const data = monitor.exportData();
console.log(data);

// Or save to file
const blob = new Blob([data], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `quota-report-${new Date().toISOString()}.json`;
a.click();
```

---

## What the Fixes Do

### Fix #1: Share-Invites Listener Cleanup
**Location:** `firebase-data.service.ts:189-217`

**Before:**
- Share-invites listener ran for ENTIRE session
- Fired every time invites changed
- Each fire = 2M reads (M = number of shared lists)
- Example: 50 fires × 4 reads = **200 reads wasted**

**After:**
- Share-invites listener cleaned up when first list detail opens
- Only fires 1-2 times total
- Example: 1 fire × 2 reads = **2 reads** ✅

**How to Verify:**
1. Open list detail page
2. Check console for: `✅ Share-invites listener unsubscribed`
3. Navigate around app for 2-3 minutes
4. Run: `monitor.checkShareInvitesListenerHealth()`
5. Should show: `fireCount: 1` or `fireCount: 2` (max)

---

### Fix #2: Quota Tracking
**Location:** `firebase-data.service.ts:619-623`

**What It Does:**
- Logs every time share-invites listener fires
- Shows how many reads it consumed
- Includes message: "This listener should be cleaned up when first list detail is opened"

**How to Verify:**
1. Watch console during app usage
2. Search for: `🔔 Share-invites listener FIRED`
3. Should only appear 1-2 times total
4. After first list detail visit, should never appear again

---

### Fix #3: Shared List Loading Tracking
**Location:** `firebase-data.service.ts:667-671`

**What It Does:**
- Tracks each shared list load separately
- Helps identify if shared lists are being reloaded unnecessarily

**How to Verify:**
1. Check quota breakdown: `monitor.logDetailedBreakdown()`
2. Look for: `Shared List Initial Load: N reads`
3. Should match number of shared lists you have
4. Should only load once per session

---

### Fix #4: Duplicate Listener Prevention
**Location:** `firebase-data.service.ts:604-608`

**What It Does:**
- Prevents accidental duplicate share-invites listener setup
- Logs warning if duplicate detected

**How to Verify:**
1. Navigate around app (lists overview → list detail → back → repeat)
2. Check console for: `⚠️ Share-invites listener already active`
3. Should NOT see this warning (means no duplicate attempt)

---

### Fix #5: Rate Limiting
**Location:** `firebase-data.service.ts:626-631`

**What It Does:**
- Throttles share-invites reloads to max 1 per 5 seconds
- Prevents rapid-fire reloads if invites change quickly

**How to Verify:**
1. If share-invites changes rapidly
2. Check console for: `⏭️ Share-invites reload throttled`
3. Only 1 reload per 5 seconds should process

---

## Expected Read Counts

### Before Fixes (Broken):
| Session Activity | Reads |
|-----------------|-------|
| App start | 20 |
| Share-invites fires 50× | 200 |
| Collection listeners fire 10× | 130 |
| Open list details 3× | 60 |
| Toggle articles 10× | 20 |
| Add articles 5× | 20 |
| **TOTAL** | **~450 reads** |

### After Fixes (Working):
| Session Activity | Reads |
|-----------------|-------|
| App start | 20 |
| Share-invites fires 1× | 4 |
| Collection listeners fire 1× | 15 |
| Open list details 3× | 60 |
| Toggle articles 10× | 20 |
| Add articles 5× | 20 |
| **TOTAL** | **~140 reads** |

**Improvement:** 69% reduction (450 → 140 reads)

---

## Troubleshooting

### Problem: Session Reads Still High (300+ reads)

**Diagnosis:**
```javascript
monitor.logDetailedBreakdown();
```

**Look for:**
1. **Share-Invites Listener fires many times**
   - Check: `fireCount` should be 1-2
   - If high: Cleanup didn't work
   - Solution: Check console for "Share-invites listener unsubscribed"

2. **Collection Listeners fire multiple times**
   - Check: Should fire 1 time each
   - If high: Cleanup didn't work
   - Solution: Check console for "Collection listeners cleanup complete"

3. **Batch Article Load very high**
   - Check: Should be reasonable (< 50 reads)
   - If high: May have many shared lists with many articles
   - Solution: This is expected behavior for many shared lists

---

### Problem: "Share-invites listener already active" Warning

**What It Means:**
- Code tried to set up share-invites listener twice
- Safeguard prevented duplicate

**What to Do:**
- This is actually **good** - safeguard is working
- However, investigate why setup was called twice
- Check if `setupRealtimeListeners()` is being called multiple times

---

### Problem: Share-Invites Listener Never Gets Cleaned Up

**Symptoms:**
- `fireCount` is 10+ in health check
- Console shows repeated "Share-invites listener FIRED"
- Reads continue climbing

**Diagnosis:**
```javascript
// Check if cleanup happened
// Search console for: "Share-invites listener unsubscribed"

// If not found, check if lazy listener was set up
// Search console for: "QUOTA OPTIMIZATION: Cleaning up collection listeners"
```

**Possible Causes:**
1. User never opened list detail page (cleanup only happens on first list detail visit)
2. Error in cleanup code
3. `collectionListenersCleanedUp` flag got reset somehow

**Solution:**
- Open any list detail page
- Should trigger cleanup
- If still not working, check browser console for errors

---

### Problem: Real-Time Sync Not Working

**Symptoms:**
- Changes from other users don't appear
- Toggled articles don't sync between devices

**Diagnosis:**
```javascript
// Check if lazy listener is active
// Search console for: "Owned List Listener" or "Shared List Listener"
// Should appear when toggling articles
```

**Possible Causes:**
1. Lazy listener not set up for active list
2. `activeListService` not working

**Solution:**
- The fixes should NOT affect real-time sync
- Lazy listeners are still active for the current list
- Check `ActiveListService` is working

---

## Monitoring During Normal Use

### Automatic Console Logging

The fixes add detailed logging to help monitor quota usage:

**On App Start:**
```
📊 QUOTA: Articles Collection Listener (+5 reads) | Session: 5
📊 QUOTA: Lists Collection Listener (+3 reads) | Session: 8
🔔 Share-invites listener FIRED: 2 accepted invites
📊 QUOTA: Share-Invites Listener (+2 reads) | Session: 10
📊 QUOTA: Shared List Initial Load (+1 reads) | Session: 11
📊 QUOTA: Shared List Initial Load (+1 reads) | Session: 12
```

**On First List Detail Visit:**
```
🚀 QUOTA OPTIMIZATION: Cleaning up collection listeners
✅ Articles collection listener unsubscribed (saves ~450 reads per change!)
✅ Lists collection listener unsubscribed (saves ~13 reads per change!)
✅ Share-invites listener unsubscribed (saves 200-400 reads per session!)
✅ All collection listeners cleanup complete - quota usage should drop by ~80%!
📊 QUOTA: Owned List Listener (+1 reads) | Session: 13
```

**During Normal Use:**
```
📊 QUOTA: Owned List Listener (+1 reads) | Session: 14
📊 QUOTA: Owned List Listener (+1 reads) | Session: 15
📊 QUOTA: Batch Article Load (+5 reads) | Session: 20
```

---

## Admin Dashboard

The quota monitor component provides a visual dashboard:

**Location:** `/admin/quota`

**Features:**
- Real-time quota status
- Operation breakdown chart
- Recent operations log
- Optimization report
- Export functionality

**How to Access:**
1. Navigate to `/admin/quota` in the app
2. View real-time quota metrics
3. Export report for analysis

---

## Success Criteria

### ✅ Fixes Are Working If:
1. Share-invites listener fires 1-2 times total
2. Collection listeners fire 1 time each
3. Session reads < 150 for normal use
4. Console shows cleanup logs after first list detail visit
5. Real-time sync still works for active list

### ❌ Fixes Not Working If:
1. Share-invites listener fires 10+ times
2. Collection listeners fire multiple times
3. Session reads > 300 for normal use
4. No cleanup logs in console
5. Real-time sync broken

---

## Reporting Issues

If you find the fixes are not working:

1. **Capture Console Logs:**
   - Right-click in console → Save As
   - Include timestamp and session duration

2. **Run Diagnostics:**
   ```javascript
   const status = monitor.getQuotaStatus();
   const health = monitor.checkShareInvitesListenerHealth();
   const data = monitor.exportData();

   console.log('=== DIAGNOSTICS ===');
   console.log('Status:', status);
   console.log('Health:', health);
   console.log('Data:', data);
   ```

3. **Include Steps to Reproduce:**
   - What you were doing when reads spiked
   - Which pages you visited
   - Any errors in console

4. **Export Quota Report:**
   ```javascript
   const data = monitor.exportData();
   // Copy and paste the output
   ```

---

## Summary

The fixes add comprehensive monitoring and optimization to reduce Firestore reads by ~80%. Use the browser console to verify the fixes are working, and run diagnostic commands to troubleshoot any issues.

**Key Indicator:** After opening first list detail page, you should see the cleanup logs and share-invites listener should stop firing.
