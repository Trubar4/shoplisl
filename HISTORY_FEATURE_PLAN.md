# History Feature Implementation Plan

**Created:** 2025-11-23
**Status:** Ready for Implementation
**Estimated Duration:** 2-3 weeks
**Risk Level:** 🟢 LOW-MEDIUM (Additive changes, backward compatible)

---

## 📋 Table of Contents

1. [Feature Overview](#feature-overview)
2. [User Requirements](#user-requirements)
3. [Technical Specifications](#technical-specifications)
4. [Implementation Phases](#implementation-phases)
5. [Database Schema Changes](#database-schema-changes)
6. [UI/UX Design](#uiux-design)
7. [Testing Strategy](#testing-strategy)
8. [Migration Strategy](#migration-strategy)
9. [Future Enhancements](#future-enhancements)

---

## 🎯 Feature Overview

The History Feature allows users to:
- View all checked-off articles in a separate "Erledigte" (Completed) view
- See when articles were checked off and by whom
- Track article usage patterns (last checked, last added, number of checks)
- Restore articles from history by clicking them
- Sort and filter history by alphabet, check frequency, and dates

### Key Design Decisions

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Storage Location** | In `ListItemState.history[]` | Simpler implementation, per-list scope |
| **Retention Policy** | 365 days | Balance between usefulness and storage |
| **History Scope** | Per-list only | Matches user requirement, simpler queries |
| **Deleted Articles** | Restore with original ID | Firestore allows ID reuse, maintains consistency |
| **User Tracking** | Prepare fields now | Ready for future multi-user feature |

---

## 📖 User Requirements

### 1. "Erledigte" (Completed) View

**Location:** 4th FAB option in list details (shopping mode)

**Behavior:**
- ✅ Not a filter, but a different view mode
- ✅ Shows only checked-off articles
- ✅ No department grouping (flat list)
- ✅ Has search field at top
- ✅ Supports selection mode
- ✅ Exit by choosing another filter via FAB

**Display Per Article:**
- Article name
- Amount (at time of check-off)
- Date checked off (e.g., "22.11.2025")
- User who checked it off *(prepared for future, shows "Du" for now)*

**Interaction:**
- Click article → Restore to list (unchecked state)
- Search works across all history items
- Selection mode allows batch operations

### 2. Article Overview Enhancements

**New Chips Display:**
```
Article Name  -22.11.2025  +23.11.2025
              (last check) (last added)
```

**Placement:** Next to article name, similar to existing amount display

**Format:**
- `-DD.MM.YYYY` for last checked (from any list)
- `+DD.MM.YYYY` for last added (to any list)

### 3. Article Overview FAB (Search/Sort)

**New Sort Options:**
- 🔤 By alphabet (A-Z / Z-A)
- 🔢 By number of checks (most/least checked)
- 📅 By last checked date (newest/oldest)
- ➕ By last added date (newest/oldest)

### 4. Article Details Page

**New Editable Fields:**
- Last added date: `+` button to update
- Last checked date: `-` button to update
- Number of checks: `#` button to update

**Use Case:** Manual corrections or bulk imports

---

## 🔧 Technical Specifications

### Data Model Changes

#### 1. Extended `ListItemState` Interface

```typescript
// In src/app/core/models/index.ts

export interface ListItemState {
  articleId: string;
  isChecked: boolean;
  amount?: string;
  checkedAt?: Date;         // ✅ Already exists!
  checkedBy?: string;        // NEW: User ID (default: 'shared-shoplisl-user')
  history: CheckEvent[];     // NEW: Full check/uncheck history
}

export interface CheckEvent {
  timestamp: Date;           // When action occurred
  userId: string;            // Who performed action ('shared-shoplisl-user' for now)
  userName: string;          // Cached display name ('Du' for now)
  action: 'checked' | 'unchecked';
  amount?: string;           // Amount at time of action
}
```

#### 2. Extended `Article` Interface

```typescript
// In src/app/core/models/index.ts

export interface Article {
  // ... existing fields ...
  id: string;
  name: string;
  amount?: string;
  notes?: string;
  icon?: string;
  categoryId?: string;
  departmentId?: string;
  createdAt: Date;
  updatedAt: Date;
  availableInShops?: string[];
  usageCount?: number;

  // NEW fields for history tracking
  lastCheckedDate?: Date;    // NEW: Most recent check across all lists
  lastAddedToListDate?: Date; // NEW: Most recent addition to any list
  numberOfChecks?: number;   // NEW: Total check count across all lists
}
```

### Firebase Firestore Structure

```
users/
└── shared-shoplisl-user/
    ├── articles/
    │   └── {articleId}
    │       ├── name: "Milch"
    │       ├── lastCheckedDate: Timestamp (NEW)
    │       ├── lastAddedToListDate: Timestamp (NEW)
    │       ├── numberOfChecks: number (NEW)
    │       └── ...existing fields...
    │
    └── lists/
        └── {listId}
            ├── itemStates: {
            │   "article-123": {
            │     articleId: "article-123",
            │     isChecked: true,
            │     amount: "2L",
            │     checkedAt: Timestamp,
            │     checkedBy: "shared-shoplisl-user" (NEW),
            │     history: [                       (NEW)
            │       {
            │         timestamp: Timestamp,
            │         userId: "shared-shoplisl-user",
            │         userName: "Du",
            │         action: "checked",
            │         amount: "2L"
            │       },
            │       {
            │         timestamp: Timestamp,
            │         userId: "shared-shoplisl-user",
            │         userName: "Du",
            │         action: "unchecked",
            │         amount: "2L"
            │       }
            │     ]
            │   }
            │ }
            └── ...existing fields...
```

---

## 📅 Implementation Phases

### **Phase 6A: Data Model & History Tracking** (3 days)

#### Tasks:
1. ✅ Update TypeScript interfaces in `models/index.ts`
2. ✅ Create `HistoryService` for business logic
3. ✅ Update `ListsRepositoryService.toggleItemChecked()` to record history
4. ✅ Update NgRx actions/reducers for history
5. ✅ Write unit tests for history tracking

#### Files to Create/Modify:
```
src/app/core/
├── models/index.ts                          (UPDATE)
├── services/
│   └── history.service.ts                   (CREATE)
│   └── history.service.spec.ts              (CREATE)
└── services/lists-repository.service.ts     (UPDATE)

src/app/state/lists/
├── lists.actions.ts                         (UPDATE)
├── lists.reducer.ts                         (UPDATE)
└── lists.selectors.ts                       (UPDATE)
```

#### HistoryService API:
```typescript
@Injectable({ providedIn: 'root' })
export class HistoryService {
  /**
   * Record a check/uncheck event
   * @param listId - List ID
   * @param articleId - Article ID
   * @param userId - User ID (default: 'shared-shoplisl-user')
   * @param userName - Display name (default: 'Du')
   * @param action - 'checked' or 'unchecked'
   * @param amount - Amount at time of action
   * @returns Updated ListItemState
   */
  recordCheckEvent(
    listId: string,
    articleId: string,
    userId: string,
    userName: string,
    action: 'checked' | 'unchecked',
    amount?: string
  ): Observable<ListItemState>;

  /**
   * Get check history for an article in a specific list
   * @param listId - List ID
   * @param articleId - Article ID
   * @returns Observable of CheckEvent array
   */
  getArticleHistory(listId: string, articleId: string): Observable<CheckEvent[]>;

  /**
   * Get all completed articles in a list (with history)
   * @param listId - List ID
   * @returns Observable of ArticleItemData array
   */
  getCompletedArticles(listId: string): Observable<ArticleItemData[]>;

  /**
   * Cleanup history older than retention period (365 days)
   * @param listId - List ID
   * @returns Observable of cleanup result
   */
  cleanupOldHistory(listId: string): Observable<{ removed: number }>;

  /**
   * Update article global statistics
   * @param articleId - Article ID
   * @param operation - 'checked' | 'unchecked' | 'added_to_list'
   * @returns Observable of updated Article
   */
  updateArticleStats(
    articleId: string,
    operation: 'checked' | 'unchecked' | 'added_to_list'
  ): Observable<Article>;
}
```

#### Integration Points:
```typescript
// In lists-repository.service.ts
toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
  // 1. Toggle isChecked state
  // 2. Call HistoryService.recordCheckEvent()
  // 3. Call HistoryService.updateArticleStats()
  // 4. Update Firebase
}
```

---

### **Phase 6B: "Erledigte" UI Mode** (3 days)

#### Tasks:
1. ✅ Add 4th FAB option "Erledigte" in shopping mode
2. ✅ Create history view mode (flat list, no departments)
3. ✅ Implement search in history
4. ✅ Implement selection mode in history
5. ✅ Add click-to-restore functionality
6. ✅ Write component tests

#### Files to Create/Modify:
```
src/app/features/lists/list-detail/
├── list-detail.ts                           (UPDATE - add mode)
├── list-detail.html                         (UPDATE - FAB + history view)
├── history-mode/
│   ├── history-mode.component.ts            (CREATE)
│   ├── history-mode.component.html          (CREATE)
│   ├── history-mode.component.scss          (CREATE)
│   └── history-mode.component.spec.ts       (CREATE)
```

#### Component Structure:
```typescript
@Component({
  selector: 'app-history-mode',
  standalone: true,
  imports: [CommonModule, MatIconModule, ArticleListModule],
  templateUrl: './history-mode.component.html',
  styleUrls: ['./history-mode.component.scss']
})
export class HistoryModeComponent implements OnInit {
  @Input() listId!: string;
  @Output() articleRestore = new EventEmitter<ArticleItemData>();

  completedArticles$ = new Observable<ArticleItemData[]>();
  searchQuery$ = new BehaviorSubject<string>('');
  filteredArticles$ = new Observable<ArticleItemData[]>();

  onArticleClick(article: ArticleItemData): void {
    // Restore article (un-check it)
    this.articleRestore.emit(article);
  }

  onSearch(query: string): void {
    this.searchQuery$.next(query);
  }
}
```

#### UI Layout:
```
┌─────────────────────────────────────┐
│  🔍 Search...                      │
├─────────────────────────────────────┤
│  Milch              📅 22.11.2025  │
│    2L                 👤 Du         │
├─────────────────────────────────────┤
│  Brot               📅 22.11.2025  │
│    1 Stück            👤 Du         │
├─────────────────────────────────────┤
│  Äpfel              📅 21.11.2025  │
│    1kg                👤 Du         │
└─────────────────────────────────────┘
```

---

### **Phase 6C: Chips in Article Overview** (2 days)

#### Tasks:
1. ✅ Create chip component for dates
2. ✅ Add `-DD.MM.YYYY` and `+DD.MM.YYYY` chips
3. ✅ Update ArticleOverviewComponent template
4. ✅ Add NgRx selectors for article stats
5. ✅ Write component tests

#### Files to Create/Modify:
```
src/app/features/articles/
├── article-overview/
│   ├── article-overview.component.ts         (UPDATE)
│   ├── article-overview.component.html       (UPDATE)
│   ├── article-overview.component.scss       (UPDATE)
│   └── article-overview.component.spec.ts    (UPDATE)
│
└── components/
    ├── date-chip/
    │   ├── date-chip.component.ts            (CREATE)
    │   ├── date-chip.component.html          (CREATE)
    │   ├── date-chip.component.scss          (CREATE)
    │   └── date-chip.component.spec.ts       (CREATE)
```

#### DateChip Component:
```typescript
@Component({
  selector: 'app-date-chip',
  standalone: true,
  template: `
    <span class="date-chip" [class.checked]="type === 'checked'" [class.added]="type === 'added'">
      {{ prefix }}{{ formattedDate }}
    </span>
  `,
  styles: [`
    .date-chip {
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 12px;
      margin-left: 4px;

      &.checked {
        background: #e3f2fd;
        color: #1976d2;
      }

      &.added {
        background: #e8f5e9;
        color: #388e3c;
      }
    }
  `]
})
export class DateChipComponent {
  @Input() date: Date | undefined;
  @Input() type: 'checked' | 'added' = 'checked';

  get prefix(): string {
    return this.type === 'checked' ? '-' : '+';
  }

  get formattedDate(): string {
    if (!this.date) return '';
    return format(this.date, 'dd.MM.yyyy'); // Using date-fns
  }
}
```

#### Template Update:
```html
<!-- In article-overview.component.html -->
<div class="article-item">
  <span class="article-name">{{ article.name }}</span>

  @if (article.lastCheckedDate) {
    <app-date-chip [date]="article.lastCheckedDate" type="checked" />
  }

  @if (article.lastAddedToListDate) {
    <app-date-chip [date]="article.lastAddedToListDate" type="added" />
  }
</div>
```

---

### **Phase 6D: Sort/Filter FAB** (2 days)

#### Tasks:
1. ✅ Add FAB button in ArticleOverview
2. ✅ Create sort/filter dialog
3. ✅ Implement sorting logic
4. ✅ Add NgRx selectors for sorted articles
5. ✅ Write tests

#### Files to Create/Modify:
```
src/app/features/articles/
├── article-overview/
│   ├── article-overview.component.ts         (UPDATE)
│   ├── article-overview.component.html       (UPDATE)
│   └── dialogs/
│       ├── sort-filter-dialog/
│       │   ├── sort-filter-dialog.component.ts    (CREATE)
│       │   ├── sort-filter-dialog.component.html  (CREATE)
│       │   └── sort-filter-dialog.component.scss  (CREATE)
```

#### Sort Options:
```typescript
export type ArticleSortOption =
  | 'alphabet-asc'
  | 'alphabet-desc'
  | 'checks-most'
  | 'checks-least'
  | 'last-checked-newest'
  | 'last-checked-oldest'
  | 'last-added-newest'
  | 'last-added-oldest';

export interface ArticleSortConfig {
  option: ArticleSortOption;
  label: string;
  icon: string;
}

export const ARTICLE_SORT_OPTIONS: ArticleSortConfig[] = [
  { option: 'alphabet-asc', label: 'A → Z', icon: 'sort_by_alpha' },
  { option: 'alphabet-desc', label: 'Z → A', icon: 'sort_by_alpha' },
  { option: 'checks-most', label: 'Meiste Checks', icon: 'trending_up' },
  { option: 'checks-least', label: 'Wenigste Checks', icon: 'trending_down' },
  { option: 'last-checked-newest', label: 'Zuletzt abgehakt (neueste)', icon: 'schedule' },
  { option: 'last-checked-oldest', label: 'Zuletzt abgehakt (älteste)', icon: 'schedule' },
  { option: 'last-added-newest', label: 'Zuletzt hinzugefügt (neueste)', icon: 'add' },
  { option: 'last-added-oldest', label: 'Zuletzt hinzugefügt (älteste)', icon: 'add' },
];
```

---

### **Phase 6E: Article Detail Stats Update** (2 days)

#### Tasks:
1. ✅ Add editable fields to ArticleDetailComponent
2. ✅ Add update buttons (+, -, #)
3. ✅ Create dialog for manual date/count input
4. ✅ Update NgRx actions for manual updates
5. ✅ Write tests

#### Files to Modify:
```
src/app/features/articles/
└── article-detail/
    ├── article-detail.component.ts           (UPDATE)
    ├── article-detail.component.html         (UPDATE)
    ├── article-detail.component.scss         (UPDATE)
    └── article-detail.component.spec.ts      (UPDATE)
```

#### UI Design:
```
┌─────────────────────────────────────┐
│  Milch                              │
├─────────────────────────────────────┤
│  Letzte Verwendung:                 │
│    - 22.11.2025     [📝 Ändern]    │
│                                      │
│  Zuletzt hinzugefügt:               │
│    + 23.11.2025     [📝 Ändern]    │
│                                      │
│  Anzahl Checks:                     │
│    # 42             [📝 Ändern]    │
└─────────────────────────────────────┘
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// history.service.spec.ts
describe('HistoryService', () => {
  it('should record check event with correct timestamp');
  it('should record uncheck event');
  it('should add event to history array');
  it('should update checkedBy field');
  it('should update article global stats on check');
  it('should decrement stats on uncheck');
  it('should cleanup history older than 365 days');
  it('should handle missing article gracefully');
});

// history-mode.component.spec.ts
describe('HistoryModeComponent', () => {
  it('should load completed articles');
  it('should filter by search query');
  it('should restore article on click');
  it('should support selection mode');
  it('should display date and user for each article');
});

// date-chip.component.spec.ts
describe('DateChipComponent', () => {
  it('should format date as DD.MM.YYYY');
  it('should show - prefix for checked type');
  it('should show + prefix for added type');
  it('should apply correct CSS classes');
});
```

### Integration Tests

```typescript
// lists-repository.service.spec.ts (integration)
describe('HistoryService Integration', () => {
  it('should record history when toggling item');
  it('should update article stats when checking');
  it('should restore article from history');
  it('should cleanup old history on schedule');
});
```

### E2E Tests (Manual)

1. ✅ Check off article → verify appears in "Erledigte"
2. ✅ Click article in "Erledigte" → verify restored to main list
3. ✅ Search in "Erledigte" → verify filtering works
4. ✅ Check article multiple times → verify number of checks increments
5. ✅ View chips in article overview → verify dates display correctly
6. ✅ Sort articles by checks → verify order is correct
7. ✅ Manually update stats in article detail → verify saves to Firebase

---

## 📦 Migration Strategy

### Step 1: Add New Fields with Defaults

```typescript
// Migration script: migrate-history-fields.ts
export async function migrateHistoryFields(
  userId: string = 'shared-shoplisl-user'
): Promise<{ articles: number; lists: number }> {
  const firestore = getFirestore();
  let articlesUpdated = 0;
  let listsUpdated = 0;

  // 1. Migrate Articles
  const articlesRef = firestore.collection(`users/${userId}/articles`);
  const articlesSnapshot = await articlesRef.get();

  for (const doc of articlesSnapshot.docs) {
    const data = doc.data();

    // Only add fields if they don't exist
    const updates: any = {};
    if (!data.lastCheckedDate) updates.lastCheckedDate = null;
    if (!data.lastAddedToListDate) updates.lastAddedToListDate = null;
    if (!data.numberOfChecks) updates.numberOfChecks = 0;

    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      articlesUpdated++;
    }
  }

  // 2. Migrate Lists
  const listsRef = firestore.collection(`users/${userId}/lists`);
  const listsSnapshot = await listsRef.get();

  for (const doc of listsSnapshot.docs) {
    const data = doc.data();
    const itemStates = data.itemStates || {};
    let hasUpdates = false;

    for (const articleId in itemStates) {
      const state = itemStates[articleId];

      // Add history array if missing
      if (!state.history) {
        state.history = [];
        hasUpdates = true;
      }

      // Add checkedBy if missing
      if (!state.checkedBy && state.isChecked) {
        state.checkedBy = userId;
        hasUpdates = true;
      }

      // Backfill history from existing checkedAt
      if (state.history.length === 0 && state.checkedAt && state.isChecked) {
        state.history.push({
          timestamp: state.checkedAt,
          userId: userId,
          userName: 'Du',
          action: 'checked',
          amount: state.amount || ''
        });
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await doc.ref.update({ itemStates });
      listsUpdated++;
    }
  }

  return { articles: articlesUpdated, lists: listsUpdated };
}
```

### Step 2: Run Migration

```bash
# Run migration via Firebase Functions or local script
npm run migrate:history
```

### Step 3: Verify Migration

```typescript
// Verification script
export async function verifyMigration(): Promise<boolean> {
  // Check all articles have new fields
  // Check all list item states have history arrays
  // Check no data was lost
  return true;
}
```

### Step 4: Deploy New Code

```bash
# Deploy after successful migration
firebase deploy --only firestore:rules,hosting
```

---

## 🔮 Future Enhancements

### Multi-User Support (Phase 7)
- Replace `'shared-shoplisl-user'` with actual user IDs
- Update `userName` to real display names from Firebase Auth
- Add user avatars in history view

### Advanced Analytics
- Weekly/monthly check frequency reports
- Most frequently checked articles
- Seasonal patterns (e.g., "Glühwein" in December)

### Export Functionality
- Export history as CSV
- Export statistics as PDF report
- Share history via email

### Smart Suggestions
- "You usually buy this on Saturdays"
- "It's been 2 weeks since you last checked this"
- Auto-add frequently bought items to new lists

---

## ✅ Definition of Done

### Phase 6 is complete when:

- [ ] All TypeScript interfaces updated with new fields
- [ ] HistoryService fully implemented and tested
- [ ] "Erledigte" mode functional with search and selection
- [ ] Date chips display in article overview
- [ ] Sort/filter FAB works in article overview
- [ ] Article detail page allows manual stat updates
- [ ] All unit tests passing (>90% coverage)
- [ ] Manual E2E testing completed successfully
- [ ] Migration script tested on dev environment
- [ ] Firebase production data migrated successfully
- [ ] Documentation updated in REFACTORING_PLAN.md
- [ ] No regressions in existing features

---

## 📚 Resources

- **NgRx Documentation**: https://ngrx.io/guide/store
- **Firebase Firestore**: https://firebase.google.com/docs/firestore
- **Angular Material**: https://material.angular.io/
- **Date-fns**: https://date-fns.org/

---

**Last Updated:** 2025-11-23
**Next Review:** After Phase 6A completion
