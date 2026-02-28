# Plan: Article Recommendations in Shopping Mode ("Vorschläge")

## Overview

Add a "Vorschläge" button at the bottom of the shopping mode view. Clicking it opens an Angular Material Bottom Sheet with two sections of article recommendations derived from the list's existing `CheckEvent` history — no new data model or Firestore reads needed.

---

## Algorithms

### 1. "Häufig gekaufte Artikel" — Same-day grouping

**Input:** `ShoppingList.itemStates` + `Article[]` catalog

1. Gather all `CheckEvent`s with `action === 'checked'` from **every** article in `list.itemStates` (including articles no longer in `articleIds`, but only those still in the user's catalog — see filter below)
2. Group events by calendar date: `event.timestamp.toDateString()`
3. Keep only days where ≥ 3 **unique** articles were checked → these are "shopping days"
4. For each article in `itemStates`:
   - Count how many shopping days it appeared in
   - If `count / totalShoppingDays >= 1/3` → candidate
5. Apply exclusion filter (see below)

> **Note for future:** Removed articles (in `itemStates` but not in catalog) could also be candidates — documented here for a later iteration.

### 2. "Schon lange nicht mehr gekauft" — Interval heuristic

**Input:** `ShoppingList.itemStates` + `Article[]` catalog

1. For each article in `itemStates`:
   - Collect all `checked` events from `history`
   - If fewer than 2 checked events → skip (no pattern to detect)
   - Get date of most recent `checked` event
   - Calculate `daysSinceLastCheck = (now - lastCheckedDate) / 86_400_000`
   - If `14 ≤ daysSinceLastCheck ≤ 90` → candidate
2. Apply exclusion filter (see below)

### Exclusion filter (applied to both sections)

An article is excluded from recommendations if **any** of these are true:
- Not in the user's article catalog (`articles` array doesn't contain its `id`)
- Already in `list.articleIds` (currently on the list)
- `list.itemStates[id].isChecked === true` AND `list.itemStates[id].checkedAt` is within the last 60 minutes

### Button visibility

`hasRecommendations` is a boolean derived from whether either array is non-empty. Computed as a `combineLatest` observable in `list-detail.ts` and passed as `@Input()` to `shopping-mode`. The "Vorschläge" button is hidden (`*ngIf`) when `false`.

---

## Files to Create

### `src/app/core/services/recommendations.service.ts`

Injectable service with two pure methods:

```typescript
getFrequentArticles(list: ShoppingList, catalog: Article[]): Article[]
getLongNotBoughtArticles(list: ShoppingList, catalog: Article[]): Article[]
```

Both return filtered `Article[]` sorted alphabetically. No Firestore calls — pure computation on data already in the store.

### `src/app/features/lists/list-detail/recommendations-bottom-sheet/recommendations-bottom-sheet.component.ts`

Angular Material Bottom Sheet component. Receives via `MAT_BOTTOM_SHEET_DATA`:

```typescript
interface RecommendationsData {
  listId: string;
  frequentArticles: Article[];
  longNotBoughtArticles: Article[];
}
```

- Injects `DataService` to call `addArticleToList(listId, articleId)` on tap
- Removes article from local displayed list immediately after tap (optimistic UI)
- Closes automatically when both lists become empty
- Shows "Noch keine Daten" empty state message if a section has no items (section header is hidden entirely if empty, not shown with empty state — to keep it clean)

### `src/app/features/lists/list-detail/recommendations-bottom-sheet/recommendations-bottom-sheet.component.html`

Bottom sheet with drag handle, two sections (each hidden if empty), scrollable list of article tiles. Each tile shows icon + name, tappable.

### `src/app/features/lists/list-detail/recommendations-bottom-sheet/recommendations-bottom-sheet.component.scss`

Styling: drag handle, section headers, article tiles with tap feedback.

---

## Files to Modify

### `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.ts`

Add:
- `@Input() hasRecommendations: boolean = false`
- `@Output() openRecommendations = new EventEmitter<void>()`
- `onOpenRecommendations()` method that emits the event

### `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.html`

Add "Vorschläge" button at the bottom of `.shopping-mode`, above the celebration overlay:

```html
<div class="suggestions-bar" *ngIf="hasRecommendations && !isSelectionMode">
  <button mat-button (click)="onOpenRecommendations()">Vorschläge</button>
</div>
```

### `src/app/features/lists/list-detail/shopping-mode/shopping-mode.component.scss`

Style `.suggestions-bar` — centered, subtle, sticky at the bottom.

### `src/app/features/lists/list-detail/list-detail.ts`

Add:
- `MatBottomSheet` injection
- `RecommendationsService` injection
- `hasRecommendations$` observable combining `list$` + `articles$` + `RecommendationsService`
- `onOpenRecommendations()` handler that opens the bottom sheet with computed data

### `src/app/features/lists/list-detail/list-detail.html`

- Pass `[hasRecommendations]="hasRecommendations$ | async"` to `<app-shopping-mode>`
- Bind `(openRecommendations)="onOpenRecommendations()"` on `<app-shopping-mode>`

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Session detection | Same-day grouping | Much simpler than 10-min window, practically equivalent |
| "Not bought" detection | 14–90 day range, min 2 checks | Avoids interval math, directly encodes spec |
| Overlay style | MatBottomSheet | Standard mobile UX, not yet used in app |
| Article pool | Only catalog articles (not removed) | MVP scope; removed-article recommendations noted for later |
| Data source | `ListItemState.history` only | `Article.numberOfChecks` / `lastCheckedDate` are not maintained |
| Where to compute | `RecommendationsService` (pure) | Testable, no side effects, reusable |
| Add article action | `DataService.addArticleToList()` | Reuses existing ownership/copy logic |
