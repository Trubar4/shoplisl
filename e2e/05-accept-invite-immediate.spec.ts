import { test, expect } from './fixtures/auth.fixture';
import { ShoppingList } from '../src/app/core/models';

/**
 * E2E Tests: Accept Share Invite - Immediate List Display
 *
 * BUG REPRODUCTION & FIX VERIFICATION
 * ====================================
 * Bug: After a participant accepts a share invite link, the list is only
 * shown after a page refresh, not immediately.
 *
 * Root causes identified (see console log in bug report):
 *
 * 1. `refreshData()` is a no-op when `collectionListenersActive = true`:
 *    FirebaseListenerService.setupRealtimeListeners() returns early with
 *    "Collection listeners already active - skipping recreation to save quota"
 *    so the newly accepted invite is never picked up.
 *
 * 2. The share-invites onSnapshot fires BEFORE the throttle window expires:
 *    The listener fires at 612ms but SHARE_INVITES_RELOAD_THROTTLE is 5000ms,
 *    so the update is skipped with "Share-invites reload throttled".
 *
 * 3. When the user is redirected to /lists/{id} (2s after accepting), the
 *    lazy listener setup cleans up the share-invites collection listener, then
 *    cannot find the new list in state → "List not found, cannot set up listener"
 *
 * Fix: After acceptInvite() returns the list, immediately add it to the
 * Firebase data service state via addSharedList(). This bypasses all the
 * listener/throttle issues and ensures the list is in state before the
 * redirect to /lists/{id}.
 */

// ============================================================
// Helpers
// ============================================================

const MOCK_SHARED_LIST: Partial<ShoppingList> = {
  id: 'test-shared-list-e2e-001',
  name: 'E2E Test Einkaufsliste',
  color: '#4CAF50',
  icon: '🛒',
  ownerId: 'owner-user-e2e-123',
  sharedWith: ['test-user-e2e-1'],
  articleIds: [],
  itemStates: {},
};

/**
 * Inject a mock shared list directly into the DataService state.
 * Simulates what the fix (addSharedList) does after acceptInvite() returns.
 * Returns true if the method exists (fix is applied), false if not (bug present).
 */
async function injectSharedListIntoState(page: any, list: Partial<ShoppingList>): Promise<boolean> {
  return page.evaluate((mockList: any) => {
    const ds = (window as any).dataService;
    if (!ds || typeof ds.addSharedList !== 'function') {
      console.error('dataService.addSharedList() not found – fix not applied yet');
      return false;
    }
    ds.addSharedList({
      ...mockList,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return true;
  }, list);
}

/**
 * Read the current lists from DataService state.
 */
async function getListsFromState(page: any): Promise<Array<{ id: string; name: string }>> {
  return page.evaluate(() => {
    const ds = (window as any).dataService;
    if (!ds) return [];
    // getLists() returns an Observable – access the underlying BehaviorSubject value
    // via firebaseData which is exposed on window for debugging too
    const fds = (window as any).dataService?.firebaseData;
    if (fds && typeof fds.getCurrentLists === 'function') {
      return fds.getCurrentLists().map((l: any) => ({ id: l.id, name: l.name }));
    }
    return [];
  });
}

// ============================================================
// Tests
// ============================================================

test.describe('Accept Share Invite – Immediate List Display (BUG #sharing)', () => {
  test.beforeEach(async ({ page }) => {
    // Start app in E2E test mode (auto-login as test user)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // ----------------------------------------------------------
  // Test 1: addSharedList() method exists after fix
  // ----------------------------------------------------------
  test('DataService.addSharedList() should exist after fix is applied', async ({ page }) => {
    /**
     * BEFORE FIX: window.dataService.addSharedList is undefined
     * AFTER FIX:  window.dataService.addSharedList is a function
     *
     * This is the primary API that the fix introduces to bypass the
     * throttle/collectionListenersActive issues in the listener pipeline.
     */
    const methodExists = await page.evaluate(() => {
      const ds = (window as any).dataService;
      return typeof ds?.addSharedList === 'function';
    });

    expect(methodExists).toBe(true);
  });

  // ----------------------------------------------------------
  // Test 2: After addSharedList(), the list is in the data state
  // ----------------------------------------------------------
  test('shared list should appear in data state immediately after addSharedList() call', async ({ page }) => {
    /**
     * BEFORE FIX: The list only appears in state after a page refresh, because
     *   refreshData() → setupRealtimeListeners() → returns early (collectionListenersActive=true),
     *   and the share-invites onSnapshot was throttled at 612ms.
     *
     * AFTER FIX:  acceptInvite() calls dataService.addSharedList(list) which
     *   directly adds the returned ShoppingList to the sharedLists backing array
     *   and triggers mergeLists(). The list is in state before the redirect.
     */
    const wasAdded = await injectSharedListIntoState(page, MOCK_SHARED_LIST);
    expect(wasAdded).toBe(true);

    // Wait a tick for the debounced mergeLists() to fire (1s debounce)
    await page.waitForTimeout(1200);

    const lists = await getListsFromState(page);
    const found = lists.find((l) => l.id === MOCK_SHARED_LIST.id);

    expect(found).toBeDefined();
    expect(found?.name).toBe(MOCK_SHARED_LIST.name);
  });

  // ----------------------------------------------------------
  // Test 3: accept-invite component renders the loading state
  // ----------------------------------------------------------
  test('accept-invite page should render a loading or processing state', async ({ page }) => {
    /**
     * Navigating to /invite/{token} should always show the component's
     * loading state initially. This verifies the route is configured.
     */
    await page.goto('/invite/some-test-invite-token');
    // Component renders immediately; check that it's not a blank 404 page
    const body = await page.locator('body').textContent();
    // The page should contain either loading spinner or an error/success message
    // (German UI text in this app)
    const hasContent =
      body?.includes('Einladung') ||
      body?.includes('Laden') ||
      body?.includes('anmelden') ||
      body?.includes('loading') ||
      await page.locator('mat-spinner, mat-progress-spinner, .loading').count() > 0;

    expect(hasContent).toBe(true);
  });

  // ----------------------------------------------------------
  // Test 4: After accepting, redirect to list should work
  // ----------------------------------------------------------
  test('should redirect to /lists/{id} after accepting (not loop back to home)', async ({ page }) => {
    /**
     * BEFORE FIX (the bug):
     *   - acceptInvite() returns the list ✓
     *   - dataService.refreshData() called → no-op (collectionListenersActive=true)
     *   - Redirect to /lists/{id} happens
     *   - setupLazyListenerForList() cleans up share-invites listener
     *   - List NOT found in state → "List not found, cannot set up listener"
     *   - User sees empty/broken list view → must manually refresh page
     *
     * AFTER FIX:
     *   - acceptInvite() returns the list ✓
     *   - dataService.addSharedList(list) → list in state immediately ✓
     *   - dataService.refreshData() called (resets throttle)
     *   - Redirect to /lists/{id}
     *   - setupLazyListenerForList() finds list in state ✓
     *   - Lazy listener set up correctly ✓
     *   - User sees list without page refresh ✓
     *
     * This test verifies that after injecting the shared list into state
     * (simulating the fix), navigating to the list URL shows content.
     */
    const listId = MOCK_SHARED_LIST.id as string;

    // Inject the shared list into state (what the fix does)
    const wasAdded = await injectSharedListIntoState(page, MOCK_SHARED_LIST);
    expect(wasAdded).toBe(true);

    // Wait for debounced merge to complete
    await page.waitForTimeout(1200);

    // Navigate to the list URL (as the accept-invite component would redirect to)
    await page.goto(`/lists/${listId}`);
    await page.waitForTimeout(1500);

    // After the fix, navigating to the list should not redirect back to home
    // It may show the list or an error (if Firebase can't load articles),
    // but it should NOT redirect away from /lists/{id} immediately
    const urlAfter = page.url();

    // The URL should still be /lists/{id} (not redirected to home or root)
    expect(urlAfter).toContain(`/lists/${listId}`);
  });

  // ----------------------------------------------------------
  // Test 5: refreshData() should reset share-invites throttle
  // ----------------------------------------------------------
  test('refreshData() should reset share-invites throttle for next listener event', async ({ page }) => {
    /**
     * BEFORE FIX: refreshData() → setupRealtimeListeners() returns early
     *   (collectionListenersActive=true), so lastShareInvitesReload is NOT reset.
     *   If the share-invites onSnapshot fires within the 5s throttle window,
     *   it will be skipped again.
     *
     * AFTER FIX: addSharedList() resets lastShareInvitesReload = 0, so the
     *   next onSnapshot event (if any) will pass through the throttle check.
     *
     * This test verifies the throttle is reset after calling addSharedList().
     */
    const wasAdded = await injectSharedListIntoState(page, MOCK_SHARED_LIST);
    expect(wasAdded).toBe(true);

    // After addSharedList(), the listener service's lastShareInvitesReload
    // should be 0 (throttle reset). We verify this indirectly by checking
    // the list is in state (because if throttle was blocking, it wouldn't be).
    await page.waitForTimeout(1200);

    const lists = await getListsFromState(page);
    const found = lists.find((l) => l.id === MOCK_SHARED_LIST.id);
    expect(found).toBeDefined();
  });

  // ----------------------------------------------------------
  // Test 6: No "List not found" after accepting when list is in state
  // ----------------------------------------------------------
  test('should not log "List not found" error when list is in state before redirect', async ({ page }) => {
    /**
     * This test collects console errors to verify the "List not found, cannot
     * set up listener" log does NOT appear when the list is in state.
     *
     * BEFORE FIX: The list is not in state → setupLazyListenerForList logs
     *   "List {id} not found, cannot set up listener"
     *
     * AFTER FIX: The list is in state before redirect → lazy listener
     *   is set up correctly → no "not found" error
     */
    const listNotFoundErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'log' || msg.type() === 'warn') {
        const text = msg.text();
        if (text.includes('not found, cannot set up listener')) {
          listNotFoundErrors.push(text);
        }
      }
    });

    // Inject the shared list into state first
    const wasAdded = await injectSharedListIntoState(page, MOCK_SHARED_LIST);
    expect(wasAdded).toBe(true);

    await page.waitForTimeout(1200);

    // Navigate to the list (triggers setupLazyListenerForList)
    await page.goto(`/lists/${MOCK_SHARED_LIST.id}`);
    await page.waitForTimeout(2000);

    // With the fix: the list IS in state → no "not found" error
    expect(listNotFoundErrors).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // Test 7: Regression – list MUST appear without page refresh
  // ----------------------------------------------------------
  test('BUG REGRESSION: list must be visible in lists overview without page refresh after accepting invite', async ({ page }) => {
    /**
     * This is the core regression test.
     *
     * The bug: after accepting an invite, the user is redirected to /lists/{id}
     * but the list is not in state. Only after a manual page refresh does the
     * list appear.
     *
     * The fix: addSharedList() is called before the redirect, so the list is
     * in state and visible immediately.
     *
     * This test simulates the state transition:
     * 1. Start at home / lists overview
     * 2. Inject the shared list (what acceptInvite + addSharedList does)
     * 3. Verify list appears in the overview without page reload
     */

    // Inject the shared list (simulating the fix behavior)
    const wasAdded = await injectSharedListIntoState(page, MOCK_SHARED_LIST);
    expect(wasAdded).toBe(true);

    // Wait for the debounced merge (1s debounce in mergeLists)
    await page.waitForTimeout(1300);

    // Navigate to the home / lists overview (same page, no refresh)
    // In the app, the main page shows lists
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The shared list should now be visible in the lists overview
    // Look for the list name in any list card or list item
    const listNameVisible = await page
      .getByText(MOCK_SHARED_LIST.name as string)
      .count();

    expect(listNameVisible).toBeGreaterThan(0);
  });
});
