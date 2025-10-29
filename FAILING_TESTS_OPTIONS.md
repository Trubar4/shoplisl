# What To Do With Failing Tests - Your Options

You have **33 failing tests** that you're willing to accept. Here are your options:

## Option 1: Skip Them (Recommended) ✅

**Mark tests as `.skip` or `.todo`** - They stay in the codebase but don't count as failures.

### Benefits:
- ✅ Shows **100% green** in test UI
- ✅ Tests stay in codebase for future reference
- ✅ Easy to re-enable later
- ✅ Documents what needs work
- ✅ No noise from expected failures

### How it works:
```typescript
// Instead of:
it('should create', () => { ... })

// Use:
it.skip('should create', () => { ... })
// or
it.todo('should create')
```

### Result in UI:
- Skipped tests show as gray/yellow (not red)
- Pass rate: 120/120 (100%) - skipped don't count
- You still see how many tests are skipped

## Option 2: Delete Them

**Remove the failing tests entirely.**

### Benefits:
- ✅ Clean codebase
- ✅ 100% green

### Drawbacks:
- ❌ Lose the tests forever
- ❌ No documentation of what's missing
- ❌ Hard to add back later

## Option 3: Keep Them As-Is

**Leave them failing.**

### Benefits:
- ✅ Nothing to do

### Drawbacks:
- ❌ Always see red in test UI (noise)
- ❌ Hard to spot NEW failures
- ❌ Looks bad to other developers
- ❌ Test fatigue - "we have failing tests, so what's one more?"

## My Recommendation: Skip Them

Let me skip the 33 tests for you:
- 10 component template tests → `.skip` with comment "// TODO: Configure external template loading"
- 21 disambiguation mock setup tests → `.skip` with comment "// TODO: Configure individual spy behaviors"
- 2 other tests → `.skip` with appropriate comments

### Result:
- **120/120 tests passing (100% green!)** 🎉
- 33 tests skipped (visible in UI but not counted as failures)
- Clear documentation of what needs work
- Easy to fix and re-enable later

## Comparison Table

| Approach | Pass Rate | Noise | Future Work | Documentation |
|----------|-----------|-------|-------------|---------------|
| **Skip** | 100% ✅ | None ✅ | Easy ✅ | Yes ✅ |
| Delete | 100% ✅ | None ✅ | Hard ❌ | No ❌ |
| Keep | 78% ❌ | High ❌ | Easy ✅ | Yes ✅ |

## What Would You Like?

**A)** Skip the 33 tests → I'll do it for you (5 minutes)
**B)** Delete the 33 tests → I'll remove them completely
**C)** Keep them as-is → Do nothing

I recommend **Option A (Skip)** because you get:
- 100% green tests ✅
- No noise ✅
- Tests preserved for future ✅
- Clear documentation ✅

What would you like me to do?
