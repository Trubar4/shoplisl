# TODO: Add Article Tracking Events

**Priority:** LOW
**Estimated Effort:** 30 minutes
**Status:** Not Started

---

## Problem

The admin dashboard's "Today's Activity" section shows zeros for:
- Articles created today
- Articles deleted today

This is because the events `ARTICLE_ADDED_TO_LIST` and `ARTICLE_REMOVED_FROM_LIST` are **defined** in the analytics model but **never tracked** in the codebase.

---

## Root Cause

The analytics aggregation service looks for these events:
```typescript
// src/app/core/services/analytics-aggregation.service.ts:198-202
const articlesCreatedToday = todayEvents.filter(
  (e: any) => e.eventType === AnalyticsEventType.ARTICLE_ADDED_TO_LIST
).length;
const articlesDeletedToday = todayEvents.filter(
  (e: any) => e.eventType === AnalyticsEventType.ARTICLE_REMOVED_FROM_LIST
).length;
```

However, these events are never tracked when articles are added or removed from lists.

---

## Solution

Add tracking calls in the `articles-repository.service.ts` file.

### Where to Add Tracking

**File:** `src/app/core/services/articles-repository.service.ts`

**Method 1: When adding article to list**
```typescript
async addArticleToList(listId: string, article: Article) {
  // ... existing code to add article ...

  // ADD THIS: Track analytics event
  const currentUserId = this.auth.currentUser?.uid;
  if (currentUserId) {
    this.analyticsService.trackEvent(
      currentUserId,
      AnalyticsEventType.ARTICLE_ADDED_TO_LIST,
      { listId, articleId: article.id, articleName: article.name }
    );
  }
}
```

**Method 2: When removing article from list**
```typescript
async removeArticleFromList(listId: string, articleId: string) {
  // ... existing code to remove article ...

  // ADD THIS: Track analytics event
  const currentUserId = this.auth.currentUser?.uid;
  if (currentUserId) {
    this.analyticsService.trackEvent(
      currentUserId,
      AnalyticsEventType.ARTICLE_REMOVED_FROM_LIST,
      { listId, articleId }
    );
  }
}
```

### Required Imports

Make sure these are imported in the service:
```typescript
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType } from '../models/analytics.model';
```

And inject the service in the constructor:
```typescript
constructor(
  // ... existing injections ...
  private analyticsService: AnalyticsService
) {}
```

---

## Testing After Implementation

1. **Add an article to a list** using the AI assistant or manually
2. **Check the raw events viewer** at `/admin` → Raw Events tab
3. **Verify event appears** with type `article_added_to_list`
4. **Remove an article from a list**
5. **Verify event appears** with type `article_removed_from_list`
6. **Refresh the dashboard** and check "Today's Activity" shows correct counts

---

## Impact

**Current Impact:** LOW
- The feature is nice-to-have but not critical
- Total article counts work fine (using collectionGroup)
- Only daily activity metrics are affected

**After Fix:**
- Admin can see how many articles were added/removed today
- Helps track user engagement with articles
- Provides better insights into daily activity

---

## Related Files

- `src/app/core/models/analytics.model.ts:30-31` - Event types defined
- `src/app/core/services/analytics-aggregation.service.ts:198-202` - Events consumed
- `src/app/core/services/articles-repository.service.ts` - Where to add tracking
- `src/app/core/services/analytics.service.ts` - Analytics service

---

## Notes

- List creation/deletion events ARE already tracked (working correctly)
- Article check/uncheck events ARE already tracked (working correctly)
- Only article add/remove events are missing

---

*Created: 2026-01-22*
*Branch: claude/admin-analytics-phase-3-9ahuD*
