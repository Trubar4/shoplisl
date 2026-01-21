# How to Track Article Deletions with Analytics

## Current State

✅ **Analytics System is Already Set Up!**

The analytics system stores events in: `/analytics/events/items/`

Available event types for tracking deletions:
- `ARTICLE_DELETED` - When an article is permanently deleted
- `ARTICLE_REMOVED_FROM_LIST` - When an article is removed from a specific list

## Problem: Events Not Currently Tracked

The analytics events exist but are **not being tracked** in the code.

## Solution: Enable Analytics Tracking

### Step 1: Add Analytics to Articles Repository

Edit `/src/app/core/services/articles-repository.service.ts`:

```typescript
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType } from '../models/analytics.model';

@Injectable({
  providedIn: 'root'
})
export class ArticlesRepositoryService {
  // Add to constructor
  constructor(
    // ... existing services
    private analytics: AnalyticsService,
    private authService: AuthService
  ) {}

  // Update deleteArticle method to track analytics
  deleteArticle(id: string): Observable<boolean> {
    const userId = this.authService.getCurrentUserId();

    // Get article name before deleting for analytics
    const article = this.firebaseData.getCurrentArticles().find(a => a.id === id);

    if (!this.connectionService.isOnline()) {
      // ... existing offline logic

      // Track deletion event
      if (userId && article) {
        this.analytics.trackEvent(userId, AnalyticsEventType.ARTICLE_DELETED, {
          articleId: id,
          articleName: article.name,
          offline: true
        });
      }

      return of(true);
    }

    return from(this.removeArticleFromAllLists(id)).pipe(
      mergeMap(() => {
        // Track deletion event
        if (userId && article) {
          this.analytics.trackEvent(userId, AnalyticsEventType.ARTICLE_DELETED, {
            articleId: id,
            articleName: article.name,
            offline: false
          });
        }
        return from(this.firebaseData.deleteArticleInFirebase(id));
      }),
      // ... rest of method
    );
  }

  // Update removeArticleFromList to track removals
  private removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    const userId = this.authService.getCurrentUserId();
    const article = this.firebaseData.getCurrentArticles().find(a => a.id === articleId);
    const list = this.firebaseData.getCurrentLists().find(l => l.id === listId);

    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return false;

        // Track removal event
        if (userId && article && list) {
          this.analytics.trackEvent(userId, AnalyticsEventType.ARTICLE_REMOVED_FROM_LIST, {
            articleId,
            articleName: article.name,
            listId,
            listName: list.name
          });
        }

        // ... rest of method
      })
    );
  }
}
```

### Step 2: Query Analytics Events

You can query the analytics events from Firestore to see who deleted what and when:

```typescript
// Query article deletion events
const eventsCollection = collection(firestore, 'analytics/events/items');
const deletionQuery = query(
  eventsCollection,
  where('eventType', '==', 'article_deleted'),
  orderBy('timestamp', 'desc'),
  limit(100)
);

const snapshot = await getDocs(deletionQuery);
snapshot.forEach(doc => {
  const event = doc.data();
  console.log(`
    User: ${event.userId}
    Article: ${event.metadata.articleName} (${event.metadata.articleId})
    Time: ${event.timestamp.toDate()}
    Session: ${event.sessionId}
  `);
});
```

### Step 3: Create a Deletion Audit Script

I'll create a script to view all deletion events:

