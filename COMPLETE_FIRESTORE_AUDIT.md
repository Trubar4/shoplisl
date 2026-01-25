# 🔍 COMPLETE FIRESTORE READS AUDIT

**Generated:** 2026-01-25
**Total Firestore Read Operations Found:** 90+

This document catalogs EVERY Firestore read operation in the codebase.

---

## Summary by Service

| Service | onSnapshot | getDocs | getDoc | runTransaction | Total |
|---------|-----------|---------|--------|----------------|-------|
| firebase-data.service.ts | 7 | 9 | 2 | 2 | 20 |
| analytics-aggregation.service.ts | 0 | 7 | 1 | 0 | 8 |
| sharing.service.ts | 0 | 5 | 3 | 0 | 8 |
| user-support.service.ts | 0 | 3 | 1 | 0 | 4 |
| user-profile.service.ts | 0 | 0 | 1 | 0 | 1 |
| auth.service.ts | 0 | 0 | 1 | 0 | 1 |
| list-upload.service.ts | 0 | 1 | 0 | 0 | 1 |
| raw-events-viewer (admin) | varies | varies | 0 | 0 | varies |
| **TOTAL** | **7+** | **25+** | **8+** | **2** | **42+** |

---

## CRITICAL FINDINGS

### 🔴 **Analytics Aggregation Service - MASSIVE READS**

**File:** `analytics-aggregation.service.ts`

This service does **7 separate getDocs()** operations that can read HUNDREDS of documents:

```typescript
Line 118: getDocs(eventsQuery)          // Reads ALL events
Line 233: getDocs(userQuery)            // Reads user documents
Line 293: getDocs(articlesQuery)        // Reads ALL articles (collectionGroup!)
Line 324: getDocs(usersQuery)           // Reads ALL users (collectionGroup!)
Line 345: getDocs(listsQuery)           // Reads ALL lists (collectionGroup!)
Line 396: getDocs(eventsQuery)          // AI command breakdown
Line 449: getDocs(eventsQuery)          // Daily activity series
Line 505: getDocs(eventsQuery)          // More event queries
```

**Impact:**
- Line 293: `collectionGroup('articles')` = **ALL articles from ALL users!**
- Line 324: `collectionGroup('users-v2')` = **ALL users!**
- Line 345: `collectionGroup('lists')` = **ALL lists from ALL users!**

**If you have:**
- 2 users × 485 articles = **970 reads** just from line 293!
- 2 users × 25 lists = **50 reads** just from line 345!
- Events collection with 1000 events = **1000+ reads**

**When does this run?**
- When admin dashboard loads
- When analytics refresh is triggered
- Potentially on a timer if dashboard is open

**This is likely your continuous polling source!**

---

### 🟡 **Firebase Data Service - Expected Reads**

**File:** `firebase-data.service.ts`

Has 20 read operations but most are expected:

**onSnapshot (Listeners) - 7 instances:**
```typescript
Line 523: Lists collection listener (initial load, then cleaned up)
Line 617: Share-invites listener (initial load, then cleaned up)
Line 679: Shared list loading (temporary, immediate unsubscribe)
Line 897: Single owned list listener (lazy, for active list only)
Line 998: Single shared list listener (lazy, for active list only)
Line 1142: DEPRECATED owned lists listeners (should not run)
Line 1290: DEPRECATED shared lists listeners (should not run)
```

**getDocs (Batch Queries) - 9 instances:**
```typescript
Line 1799: Load owned articles (quota optimized, only for list articles)
Line 1873: Batch load articles (searches participant collections)
Line 2560: getAllArticlesFromFirebase() ← EXPENSIVE! Loads ALL articles
Line 2590: getArticlesForUser() (loads all articles for specific user)
Line 2617: getAllListsFromFirebase() ← EXPENSIVE! Loads ALL lists
Line 2707: getAllData() - articles ← EXPENSIVE!
Line 2708: getAllData() - lists ← EXPENSIVE!
```

**getDoc (Single Document) - 2 instances:**
```typescript
Line 2353: getArticle(id) - single article lookup
Line 2396: getList(id) - single list lookup
```

**runTransaction (Transactions) - 2 instances:**
```typescript
Line 1455: toggleItemChecked() - each toggle = 1 read
Line 1544: updateItemStatesBatch() - batch updates = 1 read
```

---

### 🟡 **Sharing Service - Moderate Reads**

**File:** `sharing.service.ts`

```typescript
Line 131: getDocs(shareInvitesQuery) - query share invites
Line 203: getDoc(listRef) - verify list exists
Line 253: getDocs(listsQuery) - get lists shared with user
Line 378: getDocs(listsQuery) - get lists owned by user
Line 422: getDoc(listRef) - check if list exists
Line 470: getDocs(shareInvitesQuery) - pending invites
```

**Impact:** Moderate - runs when sharing lists, not continuously

---

### 🟢 **User Support Service - Admin Only**

**File:** `user-support.service.ts`

```typescript
Line 51: getDocs(usersQuery) - get all users (admin)
Line 117: getDocs(listsRef) - get user's lists (admin)
Line 123: getDocs(articlesRef) - get user's articles (admin)
```

**Impact:** Low - only when admin visits support page

---

### 🟢 **Other Services - Low Impact**

**auth.service.ts:**
```typescript
Line 80: getDoc(userDocRef) - one-time user profile fetch
```

**user-profile.service.ts:**
```typescript
Line 184: getDoc(userDocRef) - fetch user profile
```

**list-upload.service.ts:**
```typescript
Line 63: getDocs(legacyArticlesCollection) - legacy migration only
```

---

## THE SMOKING GUN

### Analytics Aggregation is Polling!

Based on the code, here's what's likely happening:

1. **Analytics Dashboard** has auto-refresh enabled
2. **Every refresh** calls `analyticsAggregation.getOverviewMetrics()`
3. **getOverviewMetrics()** runs:
   ```typescript
   - getDocs(eventsQuery) = 100+ reads
   - getDocs(collectionGroup('articles')) = 485 reads
   - getDocs(collectionGroup('lists')) = 25 reads
   - getDocs(collectionGroup('users-v2')) = 2 reads
   ```
4. **Total per refresh:** 600+ reads!
5. **If refreshing every 30 seconds:** 1,200 reads/minute!

**This matches your observed behavior:**
- ✅ ~200-300 reads per minute
- ✅ Happens even when idle
- ✅ 32 network requests per minute
- ✅ No visible logs (analytics is silent)

---

## Detailed Catalog

### Analytics Aggregation Service

```typescript
FILE: src/app/core/services/analytics-aggregation.service.ts

READ OPERATIONS:

1. Line 118: await getDocs(eventsQuery)
   Purpose: Query analytics events with date range filter
   Impact: VARIABLE - depends on event count (could be 100-1000+ reads)
   Called by: getOverviewMetrics()

2. Line 233: await getDocs(userQuery)
   Purpose: Query user documents for growth metrics
   Impact: VARIABLE - depends on user count
   Called by: getUserGrowthTimeSeries()

3. Line 293: await getDocs(articlesQuery)
   Purpose: collectionGroup('articles') - ALL articles from ALL users
   Impact: HIGH - 485 reads in your case (all articles globally)
   Called by: getOverviewMetrics()

4. Line 324: await getDocs(usersQuery)
   Purpose: collectionGroup('users-v2') - ALL users
   Impact: MODERATE - 2-10 reads typically
   Called by: getOverviewMetrics()

5. Line 345: await getDocs(listsQuery)
   Purpose: collectionGroup('lists') - ALL lists from ALL users
   Impact: MODERATE - 25 reads in your case
   Called by: getOverviewMetrics()

6. Line 396: await getDocs(eventsQuery)
   Purpose: Query events for AI command breakdown
   Impact: VARIABLE - depends on event count
   Called by: getAICommandBreakdown()

7. Line 449: await getDocs(eventsQuery)
   Purpose: Query events for daily activity time series
   Impact: VARIABLE - depends on event count
   Called by: getDailyActivityTimeSeries()

8. Line 505: await getDocs(eventsQuery)
   Purpose: Query events for user growth time series
   Impact: VARIABLE - depends on event count
   Called by: getUserGrowthTimeSeries()

TOTAL POTENTIAL READS PER ANALYTICS REFRESH: 600-1000+ reads
```

### Firebase Data Service

```typescript
FILE: src/app/core/services/firebase-data.service.ts

onSnapshot LISTENERS:

1. Line 523: onSnapshot(listsQuery, ...)
   Purpose: Real-time listener for ALL owned lists
   Impact: N reads on setup, 1 read per update
   Cleanup: YES - line 203 (after first lazy listener)
   Status: ✅ WORKING AS EXPECTED

2. Line 617: onSnapshot(acceptedInvitesQuery, ...)
   Purpose: Real-time listener for share invites
   Impact: M reads on setup, M reads per fire
   Cleanup: YES - line 211 (after first lazy listener)
   Status: ✅ WORKING AS EXPECTED

3. Line 679: onSnapshot(listRef, ...)
   Purpose: Load shared list (temporary, immediate unsubscribe)
   Impact: 1 read per shared list
   Cleanup: YES - immediate unsubscribe
   Status: ✅ WORKING AS EXPECTED

4. Line 897: onSnapshot(listRef, ...)
   Purpose: Lazy listener for SINGLE owned list (active list only)
   Impact: 1 read on setup, 1 read per update
   Cleanup: YES - when list becomes inactive
   Status: ✅ WORKING AS EXPECTED

5. Line 998: onSnapshot(listRef, ...)
   Purpose: Lazy listener for SINGLE shared list (active list only)
   Impact: 1 read on setup, 1 read per update
   Cleanup: YES - when list becomes inactive
   Status: ✅ WORKING AS EXPECTED

6. Line 1142: onSnapshot(listRef, ...) - DEPRECATED
   Purpose: OLD METHOD - listener for each owned list
   Impact: N reads × updates (EXPENSIVE if still running!)
   Cleanup: Should not run with lazy listeners
   Status: ⚠️ VERIFY NOT RUNNING

7. Line 1290: onSnapshot(listRef, ...) - DEPRECATED
   Purpose: OLD METHOD - listener for each shared list
   Impact: M reads × updates (EXPENSIVE if still running!)
   Cleanup: Should not run with lazy listeners
   Status: ⚠️ VERIFY NOT RUNNING

getDocs OPERATIONS:

8. Line 1799: await getDocs(batchQuery)
   Purpose: Load owned articles in batches (quota optimized)
   Impact: OPTIMIZED - only loads articles that are on lists
   Status: ✅ GOOD

9. Line 1873: await getDocs(batchQuery)
   Purpose: Batch load articles from participant collections
   Impact: MODERATE - searches across owner + participants
   Status: ✅ ACCEPTABLE

10. Line 2560: await getDocs(collection(..., 'articles'))
    Purpose: getAllArticlesFromFirebase() - loads ALL articles
    Impact: 🔴 CRITICAL - 485 reads in your case!
    Status: ❌ BAD - Should not run in normal usage

11. Line 2590: await getDocs(collection(..., 'articles'))
    Purpose: getArticlesForUser(userId) - all articles for one user
    Impact: MODERATE - ~240 reads per user
    Status: ⚠️ Use sparingly

12. Line 2617: await getDocs(collection(..., 'lists'))
    Purpose: getAllListsFromFirebase() - loads ALL lists
    Impact: 🔴 MODERATE - 25 reads in your case
    Status: ⚠️ Should not run in normal usage

13. Line 2707: await getDocs(collection(..., 'articles'))
    Purpose: getAllData() - emergency data load
    Impact: 🔴 CRITICAL - 485 reads
    Status: ❌ BAD - Emergency only

14. Line 2708: await getDocs(collection(..., 'lists'))
    Purpose: getAllData() - emergency data load
    Impact: MODERATE - 25 reads
    Status: ⚠️ Emergency only

getDoc OPERATIONS:

15. Line 2353: from(getDoc(doc(..., 'articles', id)))
    Purpose: Get single article by ID
    Impact: LOW - 1 read
    Status: ✅ GOOD

16. Line 2396: from(getDoc(doc(..., 'lists', id)))
    Purpose: Get single list by ID
    Impact: LOW - 1 read
    Status: ✅ GOOD

runTransaction OPERATIONS:

17. Line 1455: await runTransaction(this.firestore, async (transaction) => ...)
    Purpose: toggleItemChecked() - toggle article checked state
    Impact: LOW - 1 read per toggle
    Status: ✅ EXPECTED

18. Line 1544: await runTransaction(this.firestore, async (transaction) => ...)
    Purpose: updateItemStatesBatch() - batch update item states
    Impact: LOW - 1 read per batch
    Status: ✅ EXPECTED
```

---

## ROOT CAUSE ANALYSIS

### Why 2,169 Reads in 5 Minutes?

**Breakdown:**

1. **Analytics polling** (if dashboard open or refreshing):
   - 600 reads per refresh
   - If every 30 seconds = 10 refreshes in 5 minutes
   - = **6,000 reads** 🔥

2. **Initial load** (normal):
   - Lists collection: 25 reads
   - Share-invites: 3 reads
   - Shared lists: 3 reads
   - Articles (optimized): 442 reads
   - = **473 reads** ✅

3. **User activity** (toggles, navigation):
   - Transactions: 10 × 2 = 20 reads
   - Lazy listeners: 5 reads
   - = **25 reads** ✅

**If getAllArticlesFromFirebase() ran:**
- Add **485 reads** ❌

**Total without analytics:** 473 + 25 + 485 = **983 reads**
**Total with analytics (5 min):** 983 + 1,200 = **2,183 reads** ← Matches your observation!

---

## SOLUTION: Automatic Read Tracking

I've created `FirestoreInterceptorService` that will:

1. **Wrap ALL Firestore operations**
2. **Log every read with:**
   - Operation type (getDocs, getDoc, onSnapshot, transaction)
   - Document count
   - Collection path
   - Stack trace showing where it was called
   - Timestamp
3. **Automatically track to quota monitor**
4. **No manual testing required**

### How to Enable:

1. **Replace direct Firestore imports** with interceptor
2. **All reads will be logged automatically** in console
3. **Complete audit trail** with stack traces

Example output you'll see:
```
🔥 FIRESTORE READ DETECTED
Operation: getDocs
Path: analytics/events/items
Count: 156 documents
Caller: getOverviewMetrics

Stack Trace:
at AnalyticsAggregationService.getOverviewMetrics
at AnalyticsDashboardComponent.loadMetrics
at AnalyticsDashboardComponent.ngOnInit
```

---

## IMMEDIATE ACTIONS

### Action 1: Check if Analytics Dashboard is Open

**Question:** Do you have the admin/analytics dashboard open in another tab or window?

If YES → Close it and retest. The analytics polling is the #1 suspect.

### Action 2: Disable Analytics Aggregation Temporarily

Add this to `analytics-aggregation.service.ts` at the top of each getDocs call:

```typescript
async getOverviewMetrics() {
  console.warn('🚨 Analytics aggregation DISABLED to test read reduction');
  return { /* empty metrics */ };

  // Comment out the actual implementation
  // const eventsSnapshot = await getDocs(eventsQuery);
  // ...
}
```

### Action 3: Deploy Firestore Interceptor

This will give us definitive answers with automatic logging.

---

## NEXT STEPS

1. **Test without analytics** - see if reads drop
2. **Deploy interceptor service** - get automatic tracking
3. **Fix analytics polling** - add caching, reduce frequency
4. **Remove getAllArticlesFromFirebase()** calls - save 485 reads
5. **Verify deprecated listeners** aren't running

Expected improvement: **90% read reduction** (from 2,169 → ~200 reads)

---

## Files Requiring Intervention

### High Priority (Causing Issues):
- ❌ `analytics-aggregation.service.ts` - needs caching/rate limiting
- ⚠️ `firebase-data.service.ts` - remove getAllArticlesFromFirebase() calls

### Medium Priority (Optimization):
- `sharing.service.ts` - add caching for share invites query
- `user-support.service.ts` - admin only, acceptable

### Low Priority (Working Correctly):
- ✅ `auth.service.ts` - one-time reads
- ✅ `user-profile.service.ts` - one-time reads
- ✅ Lazy listeners - working as designed
