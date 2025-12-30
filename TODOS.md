# Outstanding TODOs

## 🐛 Known Bugs (Postponed)

### User Names Not Displaying on Checked Articles
**Status:** Postponed
**Priority:** Medium
**Reported:** 2025-12-27

**Description:**
In list shop mode with "filter erledigt" (filter completed), user names are not showing on articles that other users have checked.

**Details:**
- This feature was working before
- Currently not working in main version either
- Affects collaborative shopping experience
- Users can't see who checked which items

**Location to investigate:**
- List detail component (shop mode view)
- Item state display logic
- User profile lookup/display

**Expected behavior:**
When viewing checked items in shop mode, should display the name/email of the user who checked each article.

**Notes:**
- Data is likely already in itemStates (checkedBy field)
- Issue is probably in the UI rendering, not data layer
- May be related to user profile preloading

---

## 🎯 Future Enhancements

### Smart Presence-Based Sync
**Status:** Idea
**Priority:** Low

**Description:**
Detect when multiple users are actively viewing the same shared list and automatically increase sync frequency.

**Implementation ideas:**
1. Use Firebase Presence API to track active users per list
2. If 2+ users are active in same list, reduce polling interval to 10-15 seconds
3. When users leave, revert to normal 1-minute/5-minute intervals

**Benefits:**
- Better real-time collaboration when needed
- Minimal quota impact when not needed
- Automatic without user intervention

---

## ✅ Recently Completed

### Sync Bug - ItemStates Race Condition
**Completed:** 2025-12-27
**Fix:** Smart merge function that preserves changes from all users based on timestamps

### Firestore Quota Optimizations
**Completed:** 2025-12-27
**Improvements:**
- 95% reduction in polling reads (5-minute intervals)
- Smart polling (skips hidden tabs)
- Analytics query limits (500 instead of 10,000)
- Removed debug verification reads
- Added quota monitoring dashboard
