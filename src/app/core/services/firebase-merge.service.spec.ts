/**
 * Unit tests for FirebaseMergeService
 *
 * These tests target the specific merge bugs that cause shared list
 * article count mismatches after the Phase 1/2 refactoring.
 *
 * Bug summary:
 *   Owner sees 10/15 articles (missing 5 participant articles)
 *   Participant sees 4/15 articles (missing 11 articles)
 *
 * Root causes under test:
 *   1. mergeArticleIds() migration-mode triggers when stale local cache
 *      has MORE IDs than the server's itemStates → stale IDs leak into result
 *   2. mergeItemStates() preserves local-only states, which then cascade
 *      stale IDs back through mergeArticleIds()
 *
 * Run: npm run test -- firebase-merge
 * Or:  npx vitest run firebase-merge.service.spec.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirebaseMergeService } from './firebase-merge.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeService(): FirebaseMergeService {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return new FirebaseMergeService(mockLogger as any);
}

function makeStates(ids: string[], checkedIds: string[] = []): Record<string, any> {
  const states: Record<string, any> = {};
  ids.forEach(id => {
    states[id] = { articleId: id, isChecked: checkedIds.includes(id) };
  });
  return states;
}

function logMergeResult(label: string, input: {
  localIds: string[], serverIds: string[], itemStateKeys: string[]
}, result: string[]): void {
  // "extra" = IDs in result that aren't in server (may be valid local additions)
  const extraInResult = result.filter(id => !input.serverIds.includes(id));
  const missingFromResult = input.serverIds.filter(id => !result.includes(id));
  // "stale" = extra IDs that aren't in localIds either (truly orphaned)
  const staleInResult = extraInResult.filter(id => !input.localIds.includes(id));

  console.log(`\n── ${label} ──`);
  console.log(`  localIds (${input.localIds.length}):     [${input.localIds.join(', ')}]`);
  console.log(`  serverIds (${input.serverIds.length}):    [${input.serverIds.join(', ')}]`);
  console.log(`  itemStates (${input.itemStateKeys.length}): [${input.itemStateKeys.join(', ')}]`);
  console.log(`  result (${result.length}):      [${result.join(', ')}]`);
  if (extraInResult.length > 0) {
    console.log(`  ℹ️  extra (not on server): [${extraInResult.join(', ')}]`);
  }
  if (staleInResult.length > 0) {
    console.log(`  ❌ ORPHANED IDs (not in server or local): [${staleInResult.join(', ')}]`);
  }
  if (missingFromResult.length > 0) {
    console.log(`  ❌ MISSING server IDs from result: [${missingFromResult.join(', ')}]`);
  }
  if (extraInResult.length === 0 && missingFromResult.length === 0) {
    console.log(`  ✅ result matches server IDs exactly`);
  }
}

// ── mergeArticleIds ───────────────────────────────────────────────────────────

describe('FirebaseMergeService.mergeArticleIds', () => {
  let service: FirebaseMergeService;

  beforeEach(() => {
    service = makeService();
  });

  it('should return only server IDs when local has stale extra IDs', () => {
    // Core bug scenario:
    // Local cache from a previous session/state has IDs that are no longer on server.
    // mergeArticleIds() should trust server (which owns itemStates) and discard stale IDs.
    //
    // CURRENT BEHAVIOR (buggy):
    //   max(localIds=4, serverIds=3) = 4 > itemStates=3 → isMigrationState = true
    //   → returns UNION: ['a1', 'a2', 'a3', 'stale1', 'stale2']
    //
    // EXPECTED BEHAVIOR:
    //   isMigrationState should NOT trigger because server+itemStates is authoritative
    //   → returns server IDs only: ['a1', 'a2', 'a3']
    const localIds    = ['stale1', 'stale2', 'a1', 'a2'];   // 4 IDs (stale session cache)
    const serverIds   = ['a1', 'a2', 'a3'];                  // 3 IDs (what server actually has)
    const itemStates  = makeStates(['a1', 'a2', 'a3']);       // 3 states (matches server)

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('stale local IDs scenario', {
      localIds, serverIds, itemStateKeys: Object.keys(itemStates)
    }, result);

    expect(result, 'stale1 should NOT be in result').not.toContain('stale1');
    expect(result, 'stale2 should NOT be in result').not.toContain('stale2');
    expect(result.sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('should return all server IDs when local is empty (fresh session start)', () => {
    // Scenario: participant opens shared list for the first time in this session.
    // Local has no cached IDs; server has the full list.
    const localIds   = [];
    const serverIds  = ['a1', 'a2', 'a3', 'a4', 'a5'];
    const itemStates = makeStates(['a1', 'a2', 'a3', 'a4', 'a5'], ['a3', 'a5']);

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('empty local (fresh session)', {
      localIds, serverIds, itemStateKeys: Object.keys(itemStates)
    }, result);

    expect(result.sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('should include a locally-added article not yet synced to server', () => {
    // Scenario: user added 'newLocal' optimistically; server hasn't seen it yet.
    // This is valid and should be preserved.
    const localIds   = ['a1', 'a2', 'newLocal'];
    const serverIds  = ['a1', 'a2'];
    const itemStates = makeStates(['a1', 'a2', 'newLocal']); // local optimistic state included

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('local optimistic add', {
      localIds, serverIds, itemStateKeys: Object.keys(itemStates)
    }, result);

    expect(result).toContain('newLocal');
    expect(result).toContain('a1');
    expect(result).toContain('a2');
  });

  it('should NOT include a deleted article even if still in local cache', () => {
    // Scenario: another user deleted 'a2' from the list; local still has it.
    // Server articleIds and itemStates no longer include it.
    const localIds   = ['a1', 'a2', 'a3'];
    const serverIds  = ['a1', 'a3'];             // a2 was removed
    const itemStates = makeStates(['a1', 'a3']); // a2 not in itemStates either

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('deleted article (collab remove)', {
      localIds, serverIds, itemStateKeys: Object.keys(itemStates)
    }, result);

    expect(result, 'deleted article a2 should NOT appear').not.toContain('a2');
    expect(result.sort()).toEqual(['a1', 'a3']);
  });

  it('migration mode: should only trigger when itemStates are genuinely missing (legacy data)', () => {
    // VALID migration scenario: old docs before itemStates was introduced.
    // articleIds has entries but itemStates is empty → legitimate migration.
    const localIds   = ['a1', 'a2', 'a3'];
    const serverIds  = ['a1', 'a2', 'a3'];
    const itemStates = {};  // truly empty — pre-migration data

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('legitimate migration (empty itemStates)', {
      localIds, serverIds, itemStateKeys: []
    }, result);

    // Migration mode is OK here — we want all IDs preserved
    expect(result.sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('15-article shared list: participant with stale 4-article local cache', () => {
    // REPRODUCES THE REPORTED BUG:
    // - List has 15 articles total
    // - Participant's local state from previous session only had 4 articles
    // - Server now has all 15
    //
    // max(localIds=4, serverIds=15) = 15 NOT > itemStates=15 → should be normal mode ✓
    // BUT if localIds had MORE than 15... let's test the edge case too.

    const serverIds  = Array.from({ length: 15 }, (_, i) => `article${i + 1}`);
    const localIds   = ['article1', 'article2', 'article3', 'article4']; // stale 4-article cache
    const itemStates = makeStates(serverIds, ['article5', 'article10']); // 15 states

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('15-article list, participant with 4-article stale cache', {
      localIds, serverIds, itemStateKeys: serverIds
    }, result);

    expect(result.length, `expected 15 articles, got ${result.length}: [${result.join(', ')}]`).toBe(15);
  });

  it('15-article list: participant stale cache has MORE articles than server (regression)', () => {
    // HARDER BUG CASE:
    // Participant's old session had 20 articles (before some were deleted).
    // Server now has 15. Local cache has 20 (stale).
    // max(20, 15) = 20 > itemStates=15 → MIGRATION MODE → adds 5 stale IDs!
    const serverIds  = Array.from({ length: 15 }, (_, i) => `article${i + 1}`);
    const staleExtra = Array.from({ length: 5 }, (_, i) => `deleted${i + 1}`);
    const localIds   = [...serverIds, ...staleExtra]; // 20 IDs (15 current + 5 deleted)
    const itemStates = makeStates(serverIds);          // only 15 states

    const result = service.mergeArticleIds(localIds, serverIds, itemStates);

    logMergeResult('stale cache has MORE articles than server', {
      localIds, serverIds, itemStateKeys: serverIds
    }, result);

    const staleInResult = result.filter(id => id.startsWith('deleted'));
    console.log(`  Stale IDs leaked into result: ${staleInResult.length > 0 ? staleInResult.join(', ') : 'none'}`);

    expect(
      staleInResult.length,
      `Deleted articles should NOT appear in result. Got: [${staleInResult.join(', ')}]`
    ).toBe(0);
    expect(result.length, `Expected 15, got ${result.length}`).toBe(15);
  });
});

// ── mergeItemStates ───────────────────────────────────────────────────────────

describe('FirebaseMergeService.mergeItemStates', () => {
  let service: FirebaseMergeService;

  beforeEach(() => {
    service = makeService();
  });

  it('should preserve local-only state for optimistic updates (owned list)', () => {
    // Valid use case for owned lists: user just checked an article,
    // server hasn't confirmed yet. Local-only state must be kept.
    const localStates = {
      optimistic1: { articleId: 'optimistic1', isChecked: true, checkedAt: new Date() },
      a1: { articleId: 'a1', isChecked: false },
    };
    const serverStates = {
      a1: { articleId: 'a1', isChecked: false },
      // optimistic1 not on server yet
    };

    const result = service.mergeItemStates(localStates, serverStates);

    console.log('\n── optimistic update preserved ──');
    console.log('  merged keys:', Object.keys(result).join(', '));
    expect(Object.keys(result)).toContain('optimistic1');
    expect(Object.keys(result)).toContain('a1');
  });

  it('CASCADE BUG: local-only state from stale cache is preserved → causes stale articleIds', () => {
    // This documents the cascade:
    // 1. mergeItemStates preserves 'stale1' (local-only) in merged states
    // 2. mergeArticleIds in normal mode sees 'stale1' in itemStates
    // 3. mergeArticleIds adds 'stale1' back to articleIds
    // 4. Write-back to Firestore creates a loop
    //
    // For SHARED LISTS, the new code avoids mergeItemStates entirely (trusts server).
    // For OWNED LISTS, this cascade can still trigger.

    const localStates = {
      stale1: { articleId: 'stale1', isChecked: false }, // from stale session cache
      a1: { articleId: 'a1', isChecked: false },
    };
    const serverStates = {
      a1: { articleId: 'a1', isChecked: false },
      a2: { articleId: 'a2', isChecked: true },
    };

    const mergedStates = service.mergeItemStates(localStates, serverStates);
    console.log('\n── cascade: stale state → stale articleId ──');
    console.log('  mergedStates keys:', Object.keys(mergedStates).join(', '));

    const localIds  = ['stale1', 'a1'];
    const serverIds = ['a1', 'a2'];
    const mergedIds = service.mergeArticleIds(localIds, serverIds, mergedStates);
    console.log('  mergedArticleIds:', mergedIds.join(', '));
    console.log('  stale1 in result:', mergedIds.includes('stale1'));

    // Document the actual behavior so we can fix it
    const stalePreserved = mergedIds.includes('stale1');
    console.log(`  ${stalePreserved ? '❌ BUG CONFIRMED' : '✅ BUG NOT PRESENT'}: stale1 ${stalePreserved ? 'IS' : 'is NOT'} in merged articleIds`);

    // This assertion documents the BUG — flip to 'not' once the fix is applied:
    // expect(mergedIds).not.toContain('stale1');
  });
});

// ── hasArticleIdsChanged ──────────────────────────────────────────────────────

describe('FirebaseMergeService.hasArticleIdsChanged', () => {
  let service: FirebaseMergeService;

  beforeEach(() => {
    service = makeService();
  });

  it('should return false for identical arrays', () => {
    expect(service.hasArticleIdsChanged(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(false);
  });

  it('should return true when lengths differ', () => {
    expect(service.hasArticleIdsChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });

  it('should return true when same IDs but different order', () => {
    // Order matters in the current implementation — this is intentional
    expect(service.hasArticleIdsChanged(['a', 'b'], ['b', 'a'])).toBe(true);
  });
});
