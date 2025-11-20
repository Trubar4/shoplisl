# Multi-Select Feature Documentation

## Overview

The multi-select feature allows users to select multiple articles in shopping mode and perform batch operations on them. This feature was implemented with careful attention to race condition prevention and proper change detection in Angular's OnPush strategy.

## Features

### User Actions

1. **Verschieben** (Move): Copy selected articles to another list (unchecked) and mark them as checked in the source list
2. **Erledigt** (Mark as Done): Mark selected articles as checked with 5-second undo behavior
3. **Löschen** (Delete): Remove selected articles from the current list

### UI Components

- **"Auswählen" Button**: Enters selection mode (visible only in shopping mode, next to search field)
- **Selection Checkboxes**: Appear on each article when in selection mode
- **"Alle auswählen" Checkbox**: Selects/deselects all visible articles (respects current filter)
- **Action Bar**: Bottom bar with three action buttons (only enabled when articles are selected)
- **Filter FAB**: Hidden during selection mode

## Architecture

### Component Hierarchy

```
list-detail (container)
  └── shopping-mode
      ├── article-list
      │   └── article-item (with selection checkbox)
      └── selection-action-bar (bottom action buttons)
```

### Services

#### ArticleSelectionService

**Purpose**: Manages selection state using RxJS observables

**Location**: `src/app/features/lists/list-detail/services/article-selection.service.ts`

**Key Methods**:
- `enterSelectionMode()` / `exitSelectionMode()`: Toggle selection mode
- `toggleArticle(articleId)`: Toggle individual article selection
- `selectAll(articleIds)` / `deselectAll(articleIds)`: Bulk selection
- `toggleAll(articleIds)`: Toggle all (select if none/some selected, deselect if all selected)
- `areAllSelected(articleIds)`: Check if all articles in array are selected
- `areSomeSelected(articleIds)`: Check if some (but not all) are selected

**Observables**:
- `isSelectionMode$`: Current selection mode state
- `selectedArticleIds$`: Set of selected article IDs
- `selectedCount$`: Count of selected articles
- `hasSelection$`: Boolean indicating if any articles are selected

#### DataService & ListsRepositoryService

**Batch Operation Methods** (to prevent race conditions):
- `addMultipleArticlesToList(listId, articleIds)`: Add all articles in a single Firebase update
- `markMultipleArticlesAsChecked(listId, articleIds)`: Mark all articles in a single Firebase update
- `removeMultipleArticlesFromList(listId, articleIds)`: Remove all articles in a single Firebase update

## Critical Implementation Details

### Race Condition Prevention

#### The Problem

When multiple articles need to be updated in Firebase, a naive approach using parallel operations causes race conditions:

```typescript
// ❌ WRONG - Causes race condition
const operations = articleIds.map(id =>
  this.updateArticle(listId, id) // Each reads same initial state
);
return forkJoin(operations); // All write back, overwriting each other
```

**What happens**:
1. Operation 1: Read list state `[A, B]`, add C, write `[A, B, C]`
2. Operation 2: Read list state `[A, B]` *(same initial state!)*, add D, write `[A, B, D]` ← overwrites C!
3. Operation 3: Read list state `[A, B]` *(same initial state!)*, add E, write `[A, B, E]` ← overwrites D!
4. **Result**: Only E remains (last write wins)

#### The Solution

Use batch operations that read once, update all, write once:

```typescript
// ✅ CORRECT - No race condition
return this.firebaseData.getList(listId).pipe(
  map(list => {
    // Read ONCE
    const newArticleIds = [...list.articleIds, ...articleIds];
    const newItemStates = { ...list.itemStates };

    // Update ALL articles
    articleIds.forEach(id => {
      newItemStates[id] = { articleId: id, isChecked: false, amount: '' };
    });

    // Write ONCE
    this.firebaseData.updateListInFirebase(listId, {
      articleIds: newArticleIds,
      itemStates: newItemStates,
      updatedAt: Timestamp.now()
    });

    return true;
  })
);
```

**Key Principle**: One read → Process all items → One write

### Change Detection Strategy

The components use `ChangeDetectionStrategy.OnPush` for performance. This requires special handling to ensure UI updates when selection changes.

#### The Problem

With OnPush, Angular only checks for changes when:
1. Input references change
2. Events occur in the component
3. Observables used with async pipe emit

Calling `selectionService.isArticleSelected(id)` in a template won't trigger change detection when the service's internal state changes.

#### The Solution

**Signal-based Propagation**:

1. `shopping-mode` component subscribes to `selectionService.selectedArticleIds$`
2. When selection changes, update a signal: `selectedArticleIdsSet.set(newSet)`
3. Pass the signal value as an Input down the component tree
4. Child components use the Input, which triggers change detection

```typescript
// In shopping-mode.component.ts
private setupSelectionTracking(): void {
  this.selectionService.selectedArticleIds$.pipe(
    takeUntil(this.destroy$)
  ).subscribe(selectedIds => {
    this.selectedCount.set(selectedIds.size);
    this.selectedArticleIdsSet.set(selectedIds); // Signal update triggers change detection
    this.cdr.markForCheck();
  });
}

// In article-item.component.ts
isArticleSelected(): boolean {
  // Prefer using the input Set for better change detection
  if (this.selectedArticleIds) {
    return this.selectedArticleIds.has(this.article.id);
  }
  return this.selectionService?.isArticleSelected(this.article.id) || false;
}
```

## Testing

### Unit Tests

#### ArticleSelectionService (`article-selection.service.spec.ts`)

Tests for:
- ✅ Selection mode activation/deactivation
- ✅ Individual article selection/deselection
- ✅ Bulk selection operations
- ✅ Select all / toggle all functionality
- ✅ Observable emissions

#### ListsRepositoryService (`lists-repository.service.spec.ts`)

Tests for batch operations:
- ✅ `addMultipleArticlesToList`: Single Firebase call, all articles added
- ✅ `markMultipleArticlesAsChecked`: Single Firebase call, all articles checked
- ✅ `removeMultipleArticlesFromList`: Single Firebase call, all articles removed
- ✅ Race condition prevention (verify only 1 Firebase call per batch)
- ✅ Offline mode handling
- ✅ Error handling

#### DataService (`data.service.spec.ts`)

Tests for:
- ✅ `moveArticlesBetweenLists`: Uses batch operations, sequential execution
- ✅ `markMultipleArticlesAsDone`: Delegates to batch method
- ✅ `removeMultipleArticlesFromList`: Delegates to batch method
- ✅ Error handling at service layer

### Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## File Structure

```
src/app/
├── features/lists/list-detail/
│   ├── services/
│   │   ├── article-selection.service.ts
│   │   └── article-selection.service.spec.ts
│   ├── shopping-mode/
│   │   ├── shopping-mode.component.ts
│   │   ├── shopping-mode.component.html
│   │   ├── shopping-mode.component.scss
│   │   └── shopping-mode.component.spec.ts
│   ├── list-detail.ts
│   ├── list-detail.html
│   └── list-detail.scss
├── shared/components/
│   ├── article-item/
│   │   └── article-item.component.ts (selection checkbox)
│   ├── article-list/
│   │   └── article-list.component.ts (passes selection state)
│   └── list-picker-dialog/
│       └── list-picker-dialog.component.ts (for move operation)
└── core/services/
    ├── data.service.ts (batch operations)
    ├── data.service.spec.ts
    ├── lists-repository.service.ts (batch implementations)
    └── lists-repository.service.spec.ts
```

## Key Design Decisions

### 1. Why Service-Based State Management?

**Decision**: Use `ArticleSelectionService` instead of component-local state

**Reasoning**:
- Enables sharing selection state between components
- Provides observables for reactive updates
- Centralizes selection logic
- Easier to test in isolation

### 2. Why Signals for Change Detection?

**Decision**: Use Angular signals alongside observables

**Reasoning**:
- Signals trigger change detection automatically in OnPush components
- More ergonomic than manual `markForCheck()` calls everywhere
- Provides a clean bridge between RxJS observables and template bindings

### 3. Why Batch Operations?

**Decision**: Implement batch methods instead of parallel individual operations

**Reasoning**:
- **Correctness**: Prevents race conditions that cause data loss
- **Performance**: Single Firebase write instead of N writes
- **Atomicity**: All-or-nothing updates are more predictable
- **Network efficiency**: Reduced network calls

### 4. Why Two-Phase Move Operation?

**Decision**: Sequential phases (add all → check all) instead of parallel

**Reasoning**:
- Ensures articles are added to target before being marked in source
- Clearer error handling (know which phase failed)
- Matches user's mental model of the operation

## Common Issues & Solutions

### Issue: Checkboxes don't update visually

**Cause**: OnPush change detection not triggered

**Solution**: Ensure `selectedArticleIdsSet` signal is passed as Input and used in template

### Issue: Only one article processes instead of all selected

**Cause**: Race condition from parallel operations

**Solution**: Use batch operation methods (`addMultipleArticlesToList`, etc.)

### Issue: Action buttons stay disabled despite selection

**Cause**: `setupSelectionTracking()` called before `selectionService` is set

**Solution**: Call `setupSelectionTracking()` in both `ngOnInit` and `ngOnChanges` when service becomes available

## Performance Considerations

### Batch Size

The current implementation handles batch operations efficiently:
- Typical use case: 5-20 articles selected
- Firebase document size limit: 1MB (easily handles hundreds of article IDs)
- Single write reduces network overhead

### Change Detection

Using OnPush with signals minimizes unnecessary checks:
- Only re-render when selection actually changes
- Avoid checking entire component tree on every tick

## Future Enhancements

Potential improvements:

1. **Undo for Batch Operations**: Extend 5-second undo to batch operations
2. **Selection Persistence**: Remember selection across mode switches
3. **Keyboard Shortcuts**: Ctrl+A for select all, Delete for delete selected
4. **Drag & Drop**: Drag selected articles to different lists
5. **Smart Selection**: Select by department, by checked status, etc.

## Commit History

Key commits implementing this feature:

1. `feat: add multi-select functionality for shopping mode` - Initial implementation
2. `fix: resolve three critical bugs in multi-select functionality` - Select-all, button activation, batch move
3. `fix: vertically center 'Auswählen' button with search field` - UI alignment
4. `fix: resolve change detection issues in selection mode` - OnPush change detection fix
5. `fix: resolve race condition with batch article operations` - Batch add implementation
6. `fix: resolve race condition in marking articles as checked` - Batch check implementation
7. `fix: resolve race conditions in delete and mark done operations` - Batch delete and mark done

## References

- [Angular Change Detection Strategy](https://angular.dev/guide/components/advanced-configuration#changedetectionstrategy)
- [RxJS forkJoin](https://rxjs.dev/api/index/function/forkJoin)
- [Firebase Firestore Batch Writes](https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes)
- [Angular Signals](https://angular.dev/guide/signals)
