# Shoplisl Refactoring Plan
**Last Updated:** 2025-10-31
**Current Phase:** Quick Wins + Test Foundation
**Next Major Features:** History Function, Multi-User with Real-Time Collaboration

---

## 🎯 Project Context

### Upcoming Features
1. **History Function**: Track when articles are ticked off (timestamp, user who ticked)
2. **Multi-User Real-Time Collaboration**:
   - Google OAuth authentication
   - Shared lists with real-time sync
   - Shared articles within lists
   - User isolation for non-shared data

### Current State
- **Angular 20** standalone components
- **Firebase** for backend (Firestore + Auth)
- **35 services**, 20+ components
- **17 test files** (~30% coverage)
- **3 large files** need splitting:
  - `voice-ai-assistant.component.ts` (1,667 lines)
  - `simplified-disambiguation.service.ts` (1,237 lines)
  - `list-detail.ts` (884 lines)

### Decisions Made
- ✅ Add NgRx for state management (needed for real-time collaboration)
- ✅ Breaking changes OK during refactoring
- ✅ Testing strategy: 70% unit, 25% integration, 5% E2E
- ✅ Tests BEFORE refactoring (safety net)

---

## 📋 Refactoring Phases

### Phase 0: Quick Wins (1-2 days) - ⏳ IN PROGRESS
**Goal:** Low-effort improvements, establish patterns

- [ ] **Quick Win 1**: Extract `department-icon-mapping.service.ts` to pure utility functions
  - Move to `src/app/core/utils/department-mapping.utils.ts`
  - Remove service, update imports in ~10 files
  - Add unit tests for pure functions

- [ ] **Quick Win 2**: Consolidate AI response services
  - Merge `ai-response.service.ts` + `error-handler.service.ts`
  - Create `ai-messaging.service.ts`
  - Update imports in AI services

- [ ] **Quick Win 3**: Add JSDoc comments
  - Document public APIs in large services
  - Add @param, @returns, @example tags
  - Focus on: `ai.service.ts`, `disambiguation.service.ts`, `list-detail.ts`

- [ ] **Quick Win 4**: Set up test coverage reporting
  ```bash
  npm run test:coverage
  ```
  - Establish baseline metrics
  - Add coverage thresholds to `vitest.config.ts`
  - Document coverage goals: 70% overall

**Resume Point After Phase 0:**
> "We completed quick wins. Department mapping is now utilities, AI responses are consolidated, JSDoc added, and coverage baseline is set at X%. Ready to add comprehensive tests before refactoring."

---

### Phase 1: Test Foundation (3-5 days) - ⏳ IN PROGRESS
**Goal:** Add comprehensive tests for large files before splitting

#### Phase 1A: Test simplified-disambiguation.service.ts ✅ COMPLETED
**File:** `src/app/core/services/ai/simplified-disambiguation.service.spec.ts`
**Completion Date:** 2025-10-31

**Test Coverage Added:**
1. ✅ Article similarity calculation (Levenshtein) - EXISTS
2. ✅ Multi-item sequential processing - ADDED (6 tests)
3. ✅ List selection options - ADDED (5 tests)
4. ✅ Recipe handling - ADDED (3 tests)
5. ✅ Skip option handling - ADDED (3 tests)
6. ✅ Circuit breaker integration - EXISTS

**Tests to Add:**
```typescript
describe('SimplifiedDisambiguationService', () => {
  describe('List Selection', () => {
    it('should convert lists to disambiguation options');
    it('should handle single list selection automatically');
    it('should prompt for multi-list selection');
  });

  describe('Recipe Processing', () => {
    it('should process multi-item recipes sequentially');
    it('should preserve context during recipe processing');
    it('should handle skip for recipe items');
  });

  describe('Circuit Breaker Integration', () => {
    it('should use fallback when circuit opens');
    it('should retry failed operations');
  });
});
```

**Time Estimate:** 1 day

---

#### Phase 1B: Test list-detail.component.ts
**File:** `src/app/features/lists/list-detail/list-detail.spec.ts`

**Test Coverage Needed:**
1. ❌ Shopping mode filters (offen/erledigt/alle)
2. ❌ Edit mode filters (gelistet/fehlend/alle)
3. ❌ Search with auto-filter switching
4. ❌ Article toggle with undo
5. ❌ Celebration animation trigger
6. ❌ Department grouping

**Tests to Add:**
```typescript
describe('ListDetailComponent', () => {
  describe('Shopping Mode', () => {
    it('should filter to open items by default');
    it('should show undo hint for 5 seconds after checking');
    it('should trigger celebration when all items checked');
    it('should not celebrate if already in "erledigt" filter');
  });

  describe('Edit Mode', () => {
    it('should show all articles in "alle" filter');
    it('should show only listed articles in "gelistet" filter');
    it('should toggle article in/out of list');
  });

  describe('Search', () => {
    it('should auto-switch to "alle" filter when no results');
    it('should restore previous filter after adding item');
    it('should show disambiguation for similar articles');
  });
});
```

**Time Estimate:** 1-2 days

---

#### Phase 1C: Test voice-ai-assistant.component.ts
**File:** `src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.spec.ts`

**Test Coverage Needed:**
1. ❌ Context synchronization (chat ↔ AI service)
2. ❌ Message handling (user input → AI → response)
3. ❌ Disambiguation flow
4. ❌ Recipe processing with context preservation

**Tests to Add:**
```typescript
describe('VoiceAIAssistantComponent', () => {
  describe('Context Synchronization', () => {
    it('should sync context bidirectionally on init');
    it('should preserve context during recipe processing');
    it('should clear context on explicit commands');
  });

  describe('Message Flow', () => {
    it('should prevent double execution with flag');
    it('should add user message then AI response');
    it('should scroll to bottom after messages');
  });

  describe('Disambiguation', () => {
    it('should show options and wait for selection');
    it('should preserve context after disambiguation');
  });
});
```

**Time Estimate:** 1 day

---

**Resume Point After Phase 1:**
> "Test foundation complete. We have X% coverage on the three large files. All critical flows have tests. Safe to start refactoring. Next: Split simplified-disambiguation.service.ts."

---

### Phase 2: Split Disambiguation Service (3-4 days)
**Goal:** Break down 1,237-line service into focused modules

#### New File Structure:
```
src/app/core/services/ai/
├── disambiguation/
│   ├── disambiguation.service.ts (300 lines)
│   │   └── Core: similarity, options, main API
│   ├── multi-item-processor.service.ts (400 lines)
│   │   └── Sequential processing, recipe handling
│   ├── list-selection.service.ts (200 lines)
│   │   └── List operations, list disambiguation
│   ├── article-matcher.service.ts (200 lines)
│   │   └── Levenshtein, fuzzy matching, scoring
│   └── index.ts (exports)
└── simplified-disambiguation.service.ts (DEPRECATED - delete after migration)
```

#### Migration Steps:
1. **Day 1**: Extract `article-matcher.service.ts`
   - Move Levenshtein distance calculation
   - Move similarity scoring
   - Add tests
   - Update disambiguation service to use it

2. **Day 2**: Extract `multi-item-processor.service.ts`
   - Move `processMultiItemSequentially`
   - Move `processCurrentItemAndContinue`
   - Move `executeMultiItemFinalAction`
   - Add tests
   - Update disambiguation service

3. **Day 3**: Extract `list-selection.service.ts`
   - Move `handleListSelection`
   - Move `getListSelectionOptions`
   - Move `convertListsToDisambiguationOptions`
   - Add tests

4. **Day 4**: Refactor core `disambiguation.service.ts`
   - Keep main API: `getDisambiguationOptions`, `handleDisambiguationChoice`
   - Delegate to new services
   - Update all imports in other files
   - Delete old `simplified-disambiguation.service.ts`

**Files to Update After Split:**
- `ai.service.ts` - Update imports
- `voice-ai-assistant.component.ts` - Update imports
- `list-detail.component.ts` - Update imports
- All test files - Update mocks

**Resume Point After Phase 2:**
> "Disambiguation service split complete. New services: article-matcher, multi-item-processor, list-selection, disambiguation (core). All tests passing. Coverage maintained at X%. Next: Split list-detail component."

---

### Phase 3: Split List Detail Component (3-4 days)
**Goal:** Separate shopping and edit modes into focused components

#### New File Structure:
```
src/app/features/lists/list-detail/
├── list-detail.component.ts (400 lines)
│   └── Parent: routing, mode switching, layout
├── shopping-mode/
│   ├── shopping-mode.component.ts (300 lines)
│   │   └── Shopping view, celebration, undo hints
│   ├── shopping-mode.component.html
│   └── shopping-mode.component.scss
├── edit-mode/
│   ├── edit-mode.component.ts (300 lines)
│   │   └── Edit view, article toggling
│   ├── edit-mode.component.html
│   └── edit-mode.component.scss
└── services/
    └── list-filter.service.ts (150 lines)
        └── Filter logic, search, auto-switching
```

#### Migration Steps:
1. **Day 1**: Extract `list-filter.service.ts`
   - Move filter state management
   - Move search logic
   - Move auto-switch to "alle" logic
   - Add tests

2. **Day 2**: Create `shopping-mode.component.ts`
   - Move shopping-specific template
   - Move celebration logic
   - Move pending states (undo hints)
   - Use list-filter.service
   - Add tests

3. **Day 3**: Create `edit-mode.component.ts`
   - Move edit-specific template
   - Move article toggling logic
   - Use list-filter.service
   - Add tests

4. **Day 4**: Refactor parent `list-detail.component.ts`
   - Route to shopping/edit child components
   - Handle mode switching
   - Pass list data to children
   - Update navigation

**Resume Point After Phase 3:**
> "List detail split complete. New components: shopping-mode, edit-mode. New service: list-filter. Parent component reduced to 400 lines. All tests passing. Next: Split voice assistant component."

---

### Phase 4: Split Voice Assistant Component (4-5 days)
**Goal:** Extract voice I/O and UI concerns from AI logic

#### New File Structure:
```
src/app/shared/components/voice-ai-assistant/
├── voice-ai-assistant.component.ts (400 lines)
│   └── UI coordination, template bindings
├── services/
│   ├── voice-input.service.ts (200 lines)
│   │   └── Speech recognition, microphone
│   ├── voice-output.service.ts (150 lines)
│   │   └── Speech synthesis, audio feedback
│   ├── chat-ui.service.ts (200 lines)
│   │   └── Scrolling, animations, viewport
│   └── disambiguation-ui.service.ts (150 lines)
│       └── Option formatting, UI helpers
```

#### Migration Steps:
1. **Day 1**: Extract `voice-input.service.ts`
   - Move speech recognition setup
   - Move recording state management
   - Add tests

2. **Day 2**: Extract `voice-output.service.ts`
   - Move speech synthesis
   - Move audio feedback logic
   - Add tests

3. **Day 3**: Extract `chat-ui.service.ts`
   - Move scrolling logic
   - Move PWA viewport handling
   - Move celebration animation
   - Add tests

4. **Day 4**: Extract `disambiguation-ui.service.ts`
   - Move option formatting methods
   - Move UI helper methods
   - Add tests

5. **Day 5**: Refactor parent component
   - Use new services
   - Simplify template bindings
   - Update tests

**Resume Point After Phase 4:**
> "Voice assistant split complete. Component reduced from 1,667 to 400 lines. New services: voice-input, voice-output, chat-ui, disambiguation-ui. All tests passing. Ready for feature development."

---

### Phase 5: Install NgRx (2-3 days)
**Goal:** Add state management for real-time collaboration

#### Setup:
```bash
ng add @ngrx/store@latest
ng add @ngrx/effects@latest
ng add @ngrx/entity@latest
ng add @ngrx/store-devtools@latest
```

#### State Structure:
```
src/app/state/
├── lists/
│   ├── lists.actions.ts
│   ├── lists.reducer.ts
│   ├── lists.effects.ts
│   ├── lists.selectors.ts
│   └── lists.state.ts
├── articles/
│   ├── articles.actions.ts
│   ├── articles.reducer.ts
│   ├── articles.effects.ts
│   ├── articles.selectors.ts
│   └── articles.state.ts
├── auth/
│   ├── auth.actions.ts
│   ├── auth.reducer.ts
│   ├── auth.effects.ts
│   └── auth.selectors.ts
└── app.state.ts
```

**Why NgRx for Multi-User?**
- Centralized state makes real-time sync easier
- Effects handle Firebase real-time subscriptions
- Entity adapter simplifies CRUD operations
- DevTools help debug sync issues

**Resume Point After Phase 5:**
> "NgRx installed and configured. Store structure: lists, articles, auth. Effects connected to Firebase. Ready to migrate services to use store. Next: Add History feature models."

---

### Phase 6: Prepare for History Feature (2-3 days)
**Goal:** Add data models and services for tick-off history

#### Model Changes:
```typescript
// In src/app/core/models/index.ts

export interface ListItemState {
  articleId: string;
  isChecked: boolean;
  amount?: string;
  checkedAt?: Date;              // Already exists ✅
  checkedBy?: string;             // NEW: user ID
  tickedOffHistory?: TickEvent[]; // NEW: full history
}

export interface TickEvent {
  timestamp: Date;
  userId: string;
  userName: string;    // Cached for display
  action: 'checked' | 'unchecked';
}
```

#### New Services:
1. **history.service.ts** (200 lines)
   - `recordTickOff(listId, articleId, userId, action)`
   - `getArticleHistory(listId, articleId): TickEvent[]`
   - `getListHistory(listId): Map<articleId, TickEvent[]>`

2. **history-ui.component.ts** (NEW component)
   - Display timeline of tick events
   - Filter by user, date range
   - Export history as CSV

**Migration Plan:**
1. Update models
2. Modify `toggleItemChecked` in data.service.ts to record history
3. Create history.service.ts with NgRx integration
4. Add history panel to list-detail
5. Add tests

**Resume Point After Phase 6:**
> "History feature models added. ListItemState now tracks tickedOffHistory. history.service.ts created. UI shows tick timeline. Tests passing. Next: Multi-user authentication."

---

### Phase 7: Multi-User Authentication (1 week)
**Goal:** Add Google OAuth and user context

#### Firebase Setup:
```bash
# Enable Google Auth in Firebase Console
# Update firebase.json with auth emulator
```

#### New Services:
1. **auth.service.ts** (300 lines)
   - `signInWithGoogle()`
   - `signOut()`
   - `getCurrentUser(): Observable<User | null>`
   - Token refresh handling

2. **user.service.ts** (200 lines)
   - `getUserProfile(userId): Observable<UserProfile>`
   - `updateProfile(userId, data)`
   - Cache user profiles for display

3. **auth.interceptor.ts** (NEW)
   - Add Firebase ID token to requests
   - Handle 401 errors

#### Model Changes:
```typescript
export interface User {
  id: string;              // Firebase UID
  email: string;           // From Google
  displayName: string;     // From Google
  photoUrl?: string;       // From Google
  provider: 'google';
  createdAt: Date;
  lastLoginAt: Date;
}

export interface UserProfile {
  userId: string;
  preferences: UserPreferences;
  stats: {
    listsCreated: number;
    itemsAdded: number;
  };
}
```

#### NgRx Auth State:
```typescript
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}
```

**Migration Plan:**
1. Set up Firebase Auth with Google provider
2. Create auth.service.ts
3. Add auth NgRx state (actions, reducer, effects)
4. Add login/logout UI
5. Add AuthGuard to protect routes
6. Test in Firebase emulator

**Resume Point After Phase 7:**
> "Multi-user auth complete. Users can sign in with Google. AuthGuard protects routes. User context available in NgRx store. Next: Data scoping and sharing."

---

### Phase 8: Multi-User Data Scoping (1-2 weeks)
**Goal:** Isolate user data, enable sharing

#### Firebase Rules Update:
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Articles
    match /articles/{articleId} {
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.uid in resource.data.sharedWith
      );
      allow write: if request.auth != null &&
        resource.data.ownerId == request.auth.uid;
    }

    // Lists
    match /lists/{listId} {
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.uid in resource.data.sharedWith
      );
      allow write: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        (request.auth.uid in resource.data.shareSettings.canEdit)
      );
    }
  }
}
```

#### Model Changes:
```typescript
export interface Article {
  // ... existing fields
  ownerId: string;           // NEW: who created it
  sharedWith?: string[];     // NEW: user IDs with access
}

export interface ShoppingList {
  // ... existing fields
  ownerId: string;           // NEW
  sharedWith?: string[];     // NEW: user IDs with access
  shareSettings?: {          // NEW
    canEdit: string[];       // Can add/remove items
    canView: string[];       // Read-only
  };
}
```

#### New Services:
1. **sharing.service.ts** (300 lines)
   - `shareList(listId, userEmail, permission: 'view' | 'edit')`
   - `unshareList(listId, userId)`
   - `getSharedLists(): Observable<ShoppingList[]>`
   - `getListCollaborators(listId): Observable<User[]>`

2. **real-time-sync.service.ts** (400 lines)
   - Subscribe to Firestore real-time updates
   - Dispatch NgRx actions on changes
   - Handle conflict resolution
   - Offline queue management

#### NgRx Changes:
- Add `ownerId` and `sharedWith` to all entities
- Update effects to filter by current user
- Add real-time subscription effects

**Migration Plan:**
1. **Week 1: Data Model Migration**
   - Add ownerId to all existing articles/lists (migration script)
   - Update Firebase rules
   - Update data.service.ts to include ownerId on create
   - Test in emulator

2. **Week 2: Sharing UI**
   - Create sharing.service.ts
   - Add share dialog component
   - Add collaborator list UI
   - Create real-time-sync.service.ts
   - Test real-time updates between users

**Complex Scenarios to Handle:**
1. **Shared article changes**: If User A edits an article in a shared list, User B should see changes
2. **List item states**: Each user has their own checked/unchecked state OR shared state?
   - Recommendation: Shared state (true collaboration)
3. **Offline changes**: Queue changes, sync when online, handle conflicts
4. **Permission changes**: Handle when user loses access to list mid-session

**Resume Point After Phase 8:**
> "Multi-user data scoping complete. Users see only their own data. Sharing works for lists and articles. Real-time sync implemented with NgRx effects. Conflict resolution handles offline changes. All features tested with multiple users. Project ready for production."

---

## 🚀 Quick Start: Resume From Any Phase

### To Resume:
1. **Check current phase** in this document
2. **Run tests** to ensure baseline:
   ```bash
   npm run test
   npm run test:coverage
   ```
3. **Check git status** for uncommitted changes
4. **Read "Resume Point"** for context
5. **Continue with next task** in current phase

### Git Workflow:
```bash
# Start new phase
git checkout -b refactor/phase-X-description

# Commit frequently
git commit -m "refactor(phase-X): description"

# Finish phase
git push origin refactor/phase-X-description
# Create PR, review, merge

# Update this document's phase status
```

---

## 📊 Success Metrics

### Code Quality:
- [ ] Test coverage ≥ 70%
- [ ] No file > 500 lines
- [ ] Cyclomatic complexity < 10
- [ ] All public APIs documented

### Performance:
- [ ] List load time < 500ms
- [ ] Search response < 200ms
- [ ] Real-time sync latency < 1s

### User Experience:
- [ ] History visible in < 3 clicks
- [ ] Share list in < 5 clicks
- [ ] Real-time changes appear within 2s
- [ ] Offline mode works seamlessly

---

## 🔧 Tools & Commands

### Testing:
```bash
npm run test                     # Run all tests
npm run test:ui                  # Visual test UI
npm run test:coverage            # Coverage report
npm run test -- --watch          # Watch mode
```

### Build:
```bash
npm run build                    # Production build
npm run build -- --configuration development
```

### Firebase:
```bash
npm run firebase:emulator        # Start emulators
firebase deploy --only firestore:rules
firebase deploy --only functions
```

### Linting:
```bash
ng lint                          # Run ESLint
ng lint --fix                    # Auto-fix
```

---

## 📚 Key Files to Reference

### Models:
- `src/app/core/models/index.ts` - All data models

### Main Services:
- `src/app/core/services/data.service.ts` - Data layer
- `src/app/core/services/ai/ai.service.ts` - AI facade

### Large Components:
- `src/app/features/lists/list-detail/list-detail.ts`
- `src/app/shared/components/voice-ai-assistant/`

### Configuration:
- `vitest.config.ts` - Test configuration
- `angular.json` - Build configuration
- `firestore.rules` - Database security

---

## 🐛 Known Issues & Gotchas

1. **Context Sync Bug**: Voice assistant context can desync between chat and AI service
   - Workaround: Call `syncContextBidirectional()` before operations
   - Fix in Phase 4 refactor

2. **Filter State**: Search auto-switches to "alle" but doesn't restore previous filter
   - Fixed with `previousFilterBeforeSearch` tracking
   - Improves in Phase 3 with list-filter.service

3. **Celebration Animation**: Triggers incorrectly if switching filters rapidly
   - Fixed with `wasIncompleteLastCheck` flag
   - Better in Phase 3 with mode separation

4. **Multi-Item Processing**: Can create duplicate articles if network is slow
   - Need idempotency checks in Phase 2 refactor

---

## 💬 Prompt to Resume Next Session

**Copy-paste this prompt in a new conversation:**

```
I'm continuing the Shoplisl refactoring project. Please read `/home/user/shoplisl/REFACTORING_PLAN.md` to understand the full context.

Current Phase: [FILL IN FROM DOCUMENT]
Last Completed: [FILL IN]
Next Task: [FILL IN]

Please:
1. Review the current phase details
2. Check the resume point
3. Continue with the next task in the plan
4. Update the TODO list with TodoWrite
5. Update this document with progress

Git branch: [CURRENT BRANCH NAME]
```

---

## ✅ Phase Completion Checklist

Use this for each phase:

- [ ] All tasks completed
- [ ] Tests written and passing
- [ ] Coverage maintained or improved
- [ ] Documentation updated (JSDoc)
- [ ] This document updated (resume point)
- [ ] Git branch pushed
- [ ] PR created and reviewed
- [ ] Changes merged to main

---

**End of Refactoring Plan**
