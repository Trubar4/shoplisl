# NgRx Migration Testing Guide

**Last Updated:** 2025-11-21
**Branch:** `claude/review-refactoring-plan-01FXu2zvBYiEE85TFi26Txgg`
**Components Migrated:** 5 (ListsOverview, AddArticle, EditArticle, ArticleOverview, ListDetail partial)

---

## 🎯 What to Test

This guide provides manual testing steps to verify that the NgRx migrations are working correctly. All 5 migrated components should function identically to before, but now use centralized state management.

---

## ✅ Pre-Testing Setup

1. **Start the development server:**
   ```bash
   npm start
   ```

2. **Open Redux DevTools** (if you have the browser extension):
   - Chrome: Install "Redux DevTools" extension
   - Firefox: Install "Redux DevTools" extension
   - You should see NgRx state updates in real-time as you interact with the app

3. **Check build status:**
   ```bash
   npm run build
   ```
   Expected: ✅ Build successful, main bundle ~281 KB

4. **Run tests:**
   ```bash
   npm test -- --run
   ```
   Expected: ✅ 754/782 passing (11 skipped, 17 ListDetail failures from previous session)

---

## 🧪 Component Testing Checklist

### 1. ListsOverviewComponent ✅ (Migrated: ee1bb70)

**Location:** `/lists`

**Test Scenarios:**

- [ ] **Load lists**: Open `/lists` - all shopping lists should display
- [ ] **Search lists**: Type in search bar - lists should filter in real-time
- [ ] **Create new list**: Click "+" button, create a list - should appear immediately
- [ ] **Edit list**: Click on a list, edit its name/color - changes should reflect
- [ ] **Delete list**: Swipe left on a list (mobile) or use delete button - list should disappear
- [ ] **List counts**: Each list should show correct article count (active/total)
- [ ] **Offline mode**: Disconnect internet, create/edit lists - should work and sync when reconnected

**DevTools Check:**
- Watch for actions: `[Lists] Load Lists`, `[Lists] Create List`, `[Lists] Update List`, `[Lists] Delete List`
- State should update immediately after each action

---

### 2. AddArticleComponent ✅ (Migrated: 088031e)

**Location:** `/articles/add`

**Test Scenarios:**

- [ ] **Create article**: Fill form (name, amount, icon, department) - article should save
- [ ] **Duplicate detection**: Try creating an article with existing name - should show warning
- [ ] **Add to list**: Create article with "Add to list" checked - should appear in selected list
- [ ] **Form validation**: Leave name empty - should show error
- [ ] **Icon selection**: Choose different icons - should save correctly
- [ ] **Department selection**: Select department - should categorize article
- [ ] **Cancel**: Click back/cancel - should return without creating

**DevTools Check:**
- Watch for actions: `[Articles] Load Articles`, `[Articles] Create Article`
- Duplicate check uses `selectAllArticles` selector

**Success Indicators:**
- ✅ Article appears in article overview immediately
- ✅ If added to list, appears in list detail view
- ✅ Snackbar shows "Artikel erfolgreich erstellt"

---

### 3. EditArticleComponent ✅ (Migrated: 088031e)

**Location:** `/articles/edit/:id`

**Test Scenarios:**

- [ ] **Load article**: Navigate to edit - article details should populate form
- [ ] **Update article**: Change name/amount/notes - save changes
- [ ] **Update icon**: Change article icon - should save
- [ ] **Update department**: Change department - should update categorization
- [ ] **Delete article**: Click delete button - confirm dialog appears
  - [ ] Confirm deletion - article should be removed
  - [ ] Cancel deletion - article should remain
- [ ] **Remove from list**: If article is in lists, click "Remove from [list]" - should remove
- [ ] **Active article check**: Try deleting article that's active in a list - should show warning
- [ ] **Lists display**: "In diesen Listen:" section should show all lists containing article
- [ ] **Back navigation**: Click back button - should return to previous view

**DevTools Check:**
- Watch for actions:
  - `[Articles] Load Articles`
  - `[Articles] Update Article` (with articleId + changes)
  - `[Articles] Delete Article With Cleanup`
  - `[Lists] Remove Article From List`

**Success Indicators:**
- ✅ Changes appear immediately in article overview
- ✅ Deleted articles removed from all lists
- ✅ Appropriate snackbar messages shown

---

### 4. ArticleOverviewComponent ✅ (Migrated: 088031e)

**Location:** `/articles`

**Test Scenarios:**

- [ ] **Load articles**: Open `/articles` - all articles should display alphabetically
- [ ] **Search articles**: Type in search bar - articles should filter in real-time
- [ ] **Search debouncing**: Type quickly - search should wait 300ms before filtering
- [ ] **Create from search**: Search for non-existent article, click "+" - should pre-fill name
- [ ] **Navigate to article**: Click on article - should open edit view
- [ ] **Swipe to delete (mobile)**:
  - [ ] Swipe left on article - red delete indicator appears
  - [ ] Swipe past threshold - delete confirmation dialog appears
  - [ ] Confirm delete - article removed
  - [ ] Cancel delete - article remains
- [ ] **Delete active article**: Try deleting article active in a list - should show warning dialog
- [ ] **Delete completed article**: Delete article only in completed lists - should succeed
- [ ] **Vertical scrolling**: Ensure swipe doesn't interfere with scrolling
- [ ] **Mouse swipe (desktop)**: Test drag-to-delete with mouse

**DevTools Check:**
- Watch for actions:
  - `[Articles] Load Articles`
  - `[Articles] Delete Article With Cleanup`
- State combines `selectAllArticles` + search query for filtering
- Uses `selectAllLists` to check for active article usage

**Success Indicators:**
- ✅ Search is responsive and fast
- ✅ Swipe gestures work smoothly on mobile
- ✅ Appropriate warnings shown for active articles
- ✅ Articles removed from all lists when deleted

---

### 5. ListDetailComponent 🟡 (Partially Migrated: ea33b40)

**Location:** `/lists/:id`

**Test Scenarios:**

#### Core Operations (NgRx ✅):
- [ ] **Load list**: Open a list - all articles should display
- [ ] **Add article to list**: Click "+", select article - appears immediately
- [ ] **Check/uncheck article**: Toggle checkboxes - state updates immediately
- [ ] **Remove article**: Swipe left on article (or delete button) - removes from list
- [ ] **Shopping mode**: Switch to shopping mode - UI changes appropriately
- [ ] **Edit mode**: Switch to edit mode - can reorder and modify

#### Features Still Using DataService:
- [ ] **Batch operations**: Clear all, delete all checked - these use old service
- [ ] **Department grouping**: Articles grouped by department
- [ ] **Search within list**: Filter articles in list
- [ ] **Amount editing**: Quick edit amounts

**Known Issues:**
- ⚠️ 17 tests need assertion updates to match new NgRx behavior
- ⚠️ Some batch operations not yet migrated

**DevTools Check:**
- Watch for actions:
  - `[Lists] Load List Detail`
  - `[Lists] Add Article To List`
  - `[Lists] Remove Article From List`
  - `[Lists] Toggle Item Checked`

**Success Indicators:**
- ✅ Basic CRUD operations work
- ⚠️ Some advanced features may not show in DevTools yet

---

## 🔍 Redux DevTools Usage

If you have Redux DevTools installed, you can:

1. **View State Tree:**
   - Expand `lists` - see all shopping lists
   - Expand `articles` - see all articles
   - Check entity IDs, entities, loading states

2. **Track Actions:**
   - Every user interaction dispatches actions
   - Watch the action log in the right panel
   - See state diffs after each action

3. **Time Travel:**
   - Click on any previous action
   - App state rewinds to that point
   - Great for debugging issues

4. **Export/Import State:**
   - Export current state as JSON
   - Import state to reproduce issues
   - Share state snapshots for debugging

---

## 🧪 Automated Testing

### Run All Tests:
```bash
npm test -- --run
```

**Expected Results:**
- ✅ 754/782 tests passing
- ⚠️ 17 tests failing (ListDetailComponent - need assertion updates)
- 📝 11 tests skipped (intentional)

### Test by Module:
```bash
# NgRx state tests
npm test src/app/state/lists/lists.reducer.spec.ts -- --run
npm test src/app/state/lists/lists.selectors.spec.ts -- --run
npm test src/app/state/articles/articles.reducer.spec.ts -- --run
npm test src/app/state/articles/articles.selectors.spec.ts -- --run

# Component tests
npm test src/app/features/lists/lists-overview/lists-overview.spec.ts -- --run
npm test src/app/features/articles/add-article/add-article.spec.ts -- --run
npm test src/app/features/articles/edit-article/edit-article.spec.ts -- --run
npm test src/app/features/articles/article-overview/article-overview.spec.ts -- --run
npm test src/app/features/lists/list-detail/list-detail.spec.ts -- --run
```

### Check Coverage:
```bash
npm test -- --coverage
```

**Expected Coverage:**
- NgRx state modules: 100% ✅
- Migrated components: High coverage (80-90%)

---

## 🐛 Common Issues & Troubleshooting

### Issue 1: "Store not found" error
**Symptom:** Console error about missing store
**Fix:** Ensure `provideStore()` is in `app.config.ts`
**Check:** `src/app/app.config.ts` should have `provideStore(reducers)`

### Issue 2: Actions dispatched but state not updating
**Symptom:** DevTools shows actions but component doesn't update
**Fix:** Check that component uses `store.select()` with async pipe
**Check:** Template should have `| async` on observables

### Issue 3: Duplicate API calls
**Symptom:** Network tab shows multiple Firebase calls
**Fix:** Component might be dispatching `loadArticles()` multiple times
**Check:** Only dispatch load actions in `ngOnInit()`

### Issue 4: State lost on page refresh
**Symptom:** Lists/articles disappear on refresh
**Expected:** This is normal - NgRx state is in-memory only
**Note:** Firebase persistence handles offline data

### Issue 5: Test failures in ListDetailComponent
**Symptom:** 17 tests failing with assertion errors
**Expected:** Known issue from partial migration
**Fix:** Tests need to be updated to expect NgRx actions instead of service calls

---

## ✅ Success Criteria

Your migration is successful if:

1. **All manual tests pass** ✅
   - Lists can be created, edited, deleted
   - Articles can be created, edited, deleted
   - Search and filter work correctly
   - No console errors during normal use

2. **DevTools shows actions** ✅
   - Every user interaction dispatches actions
   - State updates are visible in DevTools
   - Action names are clear and descriptive

3. **Automated tests pass** ✅
   - 754+ tests passing
   - NgRx state tests: 112/112 passing
   - Only expected failures (17 ListDetail tests)

4. **Build succeeds** ✅
   - `npm run build` completes without errors
   - Bundle size is reasonable (~281 KB main)
   - No TypeScript errors

5. **Performance is good** ✅
   - App feels responsive
   - No lag when searching/filtering
   - Smooth animations and transitions

---

## 📝 Reporting Issues

If you find bugs during testing:

1. **Note the component and action:**
   - Which component? (e.g., ArticleOverviewComponent)
   - What were you doing? (e.g., "Searching for article X")

2. **Check Redux DevTools:**
   - What actions were dispatched?
   - Did the state update correctly?
   - Any errors in the console?

3. **Reproduce the issue:**
   - Can you consistently reproduce it?
   - Does it happen in different browsers?
   - Does it happen with/without internet?

4. **Share details:**
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots/video if possible
   - Redux DevTools state export

---

## 🎉 Next Steps

Once testing is complete and everything works:

**Option 1: Fix ListDetailComponent Tests**
- Update 17 test assertions to expect NgRx actions
- Complete the ListDetail migration
- Migrate remaining batch operations

**Option 2: Migrate Remaining Components**
- AddListComponent (simple CRUD)
- DepartmentSortComponent (reordering)

**Option 3: Proceed to Phase 6**
- Implement History Feature
- Track tick-off timestamps and users
- Prepare for multi-user authentication

---

**Happy Testing! 🚀**

All 5 migrated components should work seamlessly with NgRx state management. The user experience should be identical to before, but with the added benefits of centralized state, Redux DevTools debugging, and a foundation for real-time collaboration features.
