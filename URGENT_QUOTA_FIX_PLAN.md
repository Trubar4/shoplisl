# URGENT: Comprehensive Quota Fix Plan

## Current Status: 22,000+ Reads (CRITICAL)

### ROOT CAUSES FOUND:

1. **Analytics Dashboard** - NO LIMIT on AI events query
2. **List Upload Service** - Reads ALL shared articles
3. **Collection Group Queries** - Scan entire database
4. **Data Migration** - Still being called somewhere
5. **Share Invites Cascade** - Triggers batch loads

### IMMEDIATE ACTIONS REQUIRED:

## 1. DISABLE Analytics Dashboard Entirely (Temporary)
- Comment out analytics aggregation service
- Prevent ANY analytics queries until optimized

## 2. FIX List Upload Service
- Add local state check instead of reading ALL articles
- Add pagination/limits

## 3. REMOVE Collection Group Queries
- Replace with targeted queries
- Or disable features using them

## 4. VERIFY Data Migration is FULLY Disabled
- Check ALL entry points
- Remove from window object if exposed

## 5. ADD Read Budget/Circuit Breaker
- Track reads per session
- Stop after threshold (e.g., 100 reads)
- Alert user

### FILES TO MODIFY (Priority Order):

1. `analytics-aggregation.service.ts:236` - Add limit or disable
2. `list-upload.service.ts:63` - Use local state
3. `sharing.service.ts:253, 378` - Disable or fix queries
4. `firebase-data.service.ts:1442` - Remove emergency loader
5. All data-migration calls - Verify disabled

### EMERGENCY MEASURE:
If reads continue, add a GLOBAL read counter and throw error after 200 reads to prevent runaway quota usage.
