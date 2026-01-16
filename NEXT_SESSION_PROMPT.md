# Prompt for Next Session: Fix Cleanup Script to Load Collaborator Articles

## Context

**Branch:** `claude/fix-article-count-inconsistency-Xh3SN` (already pushed)

**Problem:** Cleanup script to remove orphaned article IDs cannot run safely because it only loads the current user's articles, not collaborators' articles. It would incorrectly delete valid articles owned by list participants.

**Read first:** `ARTICLE_COUNT_FIX_SUMMARY.md` for full context.

---

## The Task

Fix the cleanup script (`cleanup-orphaned-article-ids.ts`) to load articles from ALL collaborators before determining which article IDs are truly orphaned.

---

## Why Current Approach Doesn't Work

**Current code** (`cleanup-orphaned-article-ids.ts:128-132`):
```typescript
// Step 2: Load all accessible articles (owned + shared)
const allArticles = await this.firebaseData.getAllArticlesFromFirebase();
const validArticleIds = new Set<string>(allArticles.map((article: Article) => article.id));
```

**Problem:**
- `getAllArticlesFromFirebase()` only loads current user's articles
- Doesn't load articles from list collaborators
- Example: Frisch list has 1 article from User B, but User A's cleanup can't see it
- Would mark User B's article as "orphaned" and delete it ❌

---

## Reference: How List Detail Does It Correctly

**Location:** `firebase-data.service.ts:284-360` (`loadArticlesForList`)

**What it does:**
1. Identifies all collaborators: `[list.ownerId, ...list.sharedWith, currentUserId]`
2. Loads articles from each user's collection
3. Merges all articles into store
4. Result: Complete set of valid article IDs ✅

**Key code** (lines 312-329):
```typescript
const ownerIds = [list.ownerId];
if (list.sharedWith && list.sharedWith.length > 0) {
  list.sharedWith.forEach((userId: string) => {
    if (!ownerIds.includes(userId)) {
      ownerIds.push(userId);
    }
  });
}
const newArticles = await this.batchLoadArticles(articlesToLoad, ownerIds, currentUserId);
```

---

## Solution: Load Articles from All Collaborators

Replace Step 2 in cleanup script (`cleanup-orphaned-article-ids.ts:126-132`) with:

```typescript
// Step 2: Collect all collaborator user IDs
const allUserIds = new Set<string>();
lists.forEach((list: ShoppingList) => {
  allUserIds.add(list.ownerId);
  if (list.sharedWith) {
    list.sharedWith.forEach((userId: string) => allUserIds.add(userId));
  }
});

// Step 3: Load articles from ALL collaborators
const validArticleIds = new Set<string>();
for (const userId of allUserIds) {
  try {
    const userArticles = await loadArticlesForUser(userId);
    userArticles.forEach((article: Article) => validArticleIds.add(article.id));
  } catch (error) {
    this.logger.error('data', `Failed to load articles for user ${userId}: ${error}`);
  }
}
```

**Need to implement:** `loadArticlesForUser(userId: string)` in FirebaseDataService or expose existing method.

---

## Files to Study

1. **firebase-data.service.ts:284-360** - How `loadArticlesForList()` loads from collaborators
2. **firebase-data.service.ts:batchLoadArticles** - Method that loads articles from multiple users
3. **cleanup-orphaned-article-ids.ts:126-132** - Current broken logic to replace

---

## Testing

1. Run cleanup preview as User A
2. Check console: Should show 12 orphaned for Frisch (not 13)
3. Verify User B's article NOT flagged as orphaned
4. Execute cleanup
5. Verify articleIds in Firestore: 17→5, 12→11
6. Check both users see correct counts

---

## Success Criteria

- ✅ Cleanup loads articles from all collaborators
- ✅ Frisch: 12 orphaned (not 13 - excludes User B's article)
- ✅ Can execute safely without deleting valid articles  
- ✅ After cleanup: Firestore matches reality (5 and 11 articles)
- ✅ Both users see correct counts in overview
