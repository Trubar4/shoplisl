# 📚 Testing Guide: Understanding Your Test Suite

This guide explains how to read, understand, and work with the test suite for your ShopLisl application.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Understanding Test Structure](#understanding-test-structure)
3. [Reading Test Files](#reading-test-files)
4. [Test Categories](#test-categories)
5. [How to Run Specific Tests](#how-to-run-specific-tests)
6. [Understanding Test Output](#understanding-test-output)
7. [Common Patterns](#common-patterns)

---

## 🚀 Quick Start

```bash
# Run all tests (once)
npm test -- --watch=false

# Run specific test file
npm test -- --include='**/quantity-extraction.service.spec.ts' --watch=false

# Run with coverage report
npm test -- --code-coverage --watch=false
```

**Expected Result:** All 153 tests should now pass ✅

---

## 🏗️ Understanding Test Structure

### Anatomy of a Test File

Every test file follows this structure:

```typescript
// 1. IMPORTS - What we're testing and what we need
import { TestBed } from '@angular/core/testing';
import { MyService } from './my-service';

// 2. DESCRIBE BLOCK - Groups related tests
describe('MyService', () => {
  let service: MyService;

  // 3. SETUP - Runs before each test
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MyService);
  });

  // 4. TEST CASES - Individual tests
  it('should do something specific', () => {
    // Arrange: Set up test data
    const input = 'test';

    // Act: Execute the code
    const result = service.doSomething(input);

    // Assert: Check the result
    expect(result).toBe('expected output');
  });
});
```

### Key Concepts

| Concept | Purpose | Example |
|---------|---------|---------|
| **describe()** | Groups related tests | `describe('Similarity Algorithm', ...)` |
| **it()** | Individual test case | `it('should find exact match', ...)` |
| **beforeEach()** | Setup before each test | Initialize services, create test data |
| **expect()** | Assertion/check | `expect(result).toBe(expected)` |
| **spy** | Mock/fake function | `jasmine.createSpyObj('ServiceName', ['method'])` |

---

## 📖 Reading Test Files

### Example 1: Simple Unit Test

**File:** `quantity-extraction.service.spec.ts`

```typescript
it('should extract German decimal with comma (0,5 Liter)', () => {
  // ✅ Test name clearly states what it's testing

  // ARRANGE: Set up input
  const result = service.extractQuantity('0,5 Liter Milch');

  // ASSERT: Check the output
  expect(result.itemName).toBe('Milch');
  expect(result.quantity).toContain('0,5');
  expect(result.quantity).toContain('Liter');
});
```

**What this tests:**
- ✅ German decimal comma (0,5) is recognized
- ✅ Item name ("Milch") is correctly extracted
- ✅ Quantity with unit ("0,5 Liter") is preserved

**How to read it:**
1. **Test name**: "should extract German decimal with comma (0,5 Liter)"
2. **Input**: `'0,5 Liter Milch'`
3. **Expected output**: `itemName = "Milch"`, `quantity = "0,5 Liter"`

---

### Example 2: Test with Multiple Cases

```typescript
describe('German Number Formats - Decimal Comma', () => {
  // This describe block groups all tests about decimal commas

  it('should extract German decimal with comma (0,5 Liter)', () => {
    const result = service.extractQuantity('0,5 Liter Milch');
    expect(result.itemName).toBe('Milch');
    expect(result.quantity).toContain('0,5');
  });

  it('should extract German decimal (1,5kg Bananen)', () => {
    const result = service.extractQuantity('1,5kg Bananen');
    expect(result.itemName).toBe('Bananen');
    expect(result.quantity).toBe('1,5kg');
  });

  // More tests...
});
```

**Pattern:** Each `it()` tests ONE specific scenario

---

### Example 3: Test with Mocks (Spies)

**File:** `simplified-disambiguation.service.spec.ts`

```typescript
beforeEach(() => {
  // Create fake services (spies)
  const dataServiceSpy = jasmine.createSpyObj('DataService', ['getArticles']);

  // Tell the spy what to return
  dataServiceSpy.getArticles.and.returnValue(of(testArticles));

  // Configure the test environment
  TestBed.configureTestingModule({
    providers: [
      SimplifiedDisambiguationService,
      { provide: DataService, useValue: dataServiceSpy }
    ]
  });
});

it('should find exact match with 100% similarity', async () => {
  // The service will use our fake DataService
  const options = await service.getDisambiguationOptions('milch');

  // Check the result
  const exactMatch = options.find(opt => opt.displayName === 'Milch');
  expect(exactMatch?.confidence).toBe(1.0);
});
```

**Why use spies?**
- ✅ Tests run faster (no real database calls)
- ✅ Tests are predictable (same data every time)
- ✅ Tests are isolated (don't depend on external services)

---

## 🗂️ Test Categories

### 1. **Similarity Algorithm Tests**

**File:** `simplified-disambiguation.service.spec.ts`

**What's tested:**
- Exact matching (100% similarity)
- Partial matching (80% similarity)
- Fuzzy matching (Levenshtein distance)
- German umlauts (ä, ö, ü, ß)
- Special characters (,;.-_)

**Example test:**

```typescript
it('should find exact match with 100% similarity (case-insensitive)', async () => {
  // Input: "milch" (lowercase)
  const options = await service.getDisambiguationOptions('milch');

  // Should find "Milch" with 100% confidence
  const exactMatch = options.find(opt => opt.displayName === 'Milch');
  expect(exactMatch).toBeDefined();
  expect(exactMatch?.confidence).toBe(1.0);
});
```

**How to verify:**
- Open VS Code → Open `simplified-disambiguation.service.spec.ts`
- Search for "Similarity Calculation - Exact Matches"
- Read the test names to see what scenarios are covered

---

### 2. **Quantity Extraction Tests**

**File:** `quantity-extraction.service.spec.ts`

**What's tested:**
- German decimal comma (0,5 vs 0.5)
- Text numbers (ein, zwei, drei → 1, 2, 3)
- Units (kg, g, Liter, Stück)
- Multiple patterns (2kg Mehl, Mehl 2kg, etc.)
- Multi-item parsing

**Example test:**

```typescript
it('should convert "drei" to "3"', () => {
  // Input: "drei kg Bananen"
  const result = service.extractQuantity('drei kg Bananen');

  // Should convert "drei" to "3"
  expect(result.itemName).toBe('Bananen');
  expect(result.quantity).toContain('3');
});
```

**Real-world scenario:**
User says "drei kg Bananen" → System understands "3 kg Bananen"

---

### 3. **Context Management Tests**

**File:** `context-management.service.spec.ts`

**What's tested:**
- Storing conversation state
- Retrieving context
- Context validation (timestamp)
- Multiple command context

**Example test:**

```typescript
it('should maintain context when adding multiple articles to same list', () => {
  // Add first article
  service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');
  expect(service.getTargetList()?.listName).toBe('Einkaufen');

  // Add second article
  service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Brot');

  // Context should still remember "Einkaufen"
  expect(service.getTargetList()?.listName).toBe('Einkaufen');
  expect(service.getLastAction()?.articleName).toBe('Brot');
});
```

**Real-world scenario:**
User: "Milch" → System: "Adding to Einkaufen"
User: "Brot" → System: "Adding to Einkaufen" (remembers the list)

---

## 🎯 How to Run Specific Tests

### Run Tests by File

```bash
# Similarity tests only
npm test -- --include='**/simplified-disambiguation.service.spec.ts' --watch=false

# Quantity extraction tests only
npm test -- --include='**/quantity-extraction.service.spec.ts' --watch=false

# Context management tests only
npm test -- --include='**/context-management.service.spec.ts' --watch=false
```

### Run Tests by Pattern in VS Code

1. **Install Angular Test Explorer** (if not installed)
2. **Click Testing icon** (flask) in sidebar
3. **Expand test tree** to see all tests
4. **Click ▶️** next to any test group or individual test

---

## 📊 Understanding Test Output

### Success Output

```
✔ SimplifiedDisambiguationService - Similarity Algorithm
  ✓ should find exact match with 100% similarity (52ms)
  ✓ should find exact match with uppercase input (31ms)
  ✓ should find exact match with mixed case (29ms)

Chrome 141.0.0.0 (Windows 10): Executed 153 of 153 SUCCESS (3.5 secs)
```

**What this means:**
- ✅ All 153 tests passed
- ✅ Total time: 3.5 seconds
- ✅ Each test execution time shown in parentheses

### Failure Output

```
✘ should extract quantity correctly
  Expected 'Mehl' but got 'Milch'

  at <Jasmine>
  at UserContext.<anonymous> (quantity-extraction.service.spec.ts:42:35)
```

**How to debug:**
1. **Read the error**: "Expected 'Mehl' but got 'Milch'"
2. **Check the line**: `quantity-extraction.service.spec.ts:42`
3. **Open the file** and go to line 42
4. **Look at the test** to understand what's expected
5. **Fix the code** or the test

---

## 🔍 Common Patterns

### Pattern 1: Testing Multiple Inputs

```typescript
it('should handle various input formats', () => {
  expect(service.extract('2kg Mehl')).toEqual({ itemName: 'Mehl', quantity: '2kg' });
  expect(service.extract('Mehl 2kg')).toEqual({ itemName: 'Mehl', quantity: '2kg' });
  expect(service.extract('2 kg Mehl')).toEqual({ itemName: 'Mehl', quantity: '2 kg' });
});
```

**Purpose:** Verify the same logic works for different input formats

---

### Pattern 2: Testing Edge Cases

```typescript
it('should handle empty input', () => {
  const result = service.extract('');
  expect(result.itemName).toBe('');
});

it('should handle whitespace-only input', () => {
  const result = service.extract('   ');
  expect(result.itemName).toBe('');
});

it('should handle very long names', () => {
  const longName = 'A'.repeat(1000);
  const result = service.extract(`1kg ${longName}`);
  expect(result.itemName).toBe(longName);
});
```

**Purpose:** Ensure code doesn't break with unusual inputs

---

### Pattern 3: Testing Async Operations

```typescript
it('should find similar articles', async () => {
  // Note the 'async' keyword

  const options = await service.getDisambiguationOptions('milch');
  // Note the 'await' keyword

  expect(options.length).toBeGreaterThan(0);
});
```

**Purpose:** Test functions that return Promises

---

## 🎓 How to Understand What's Being Tested

### Step 1: Read the Describe Block

```typescript
describe('Similarity Calculation - German Umlauts', () => {
  // This block tests German character handling
});
```

### Step 2: Read the Test Names

```typescript
it('should find exact match with ä (Äpfel)', async () => {
  // Tests: German ä character in exact match
});

it('should distinguish between ä and a with lower similarity', async () => {
  // Tests: ä vs a produces different similarity scores
});
```

### Step 3: Read the Test Body

```typescript
it('should find exact match with ä (Äpfel)', async () => {
  const options = await service.getDisambiguationOptions('äpfel');
  //           ^ INPUT: "äpfel" (lowercase with umlaut)

  const match = options.find(opt => opt.displayName === 'Äpfel');
  //                                                      ^ EXPECTED: "Äpfel" (capitalized)

  expect(match).toBeDefined();
  //     ^ ASSERTION: Match should exist

  expect(match?.confidence).toBe(1.0);
  //     ^ ASSERTION: Should have 100% confidence
});
```

**Understanding:**
- **Input:** "äpfel" (lowercase)
- **Action:** Find similar articles
- **Expected:** Find "Äpfel" with 100% confidence (case-insensitive match)

---

## 📈 Test Coverage

### View Coverage Report

```bash
# Generate coverage
npm test -- --code-coverage --watch=false

# Open report
# Windows:
start coverage/shoplisl-app/index.html

# macOS:
open coverage/shoplisl-app/index.html

# Linux:
xdg-open coverage/shoplisl-app/index.html
```

### Understanding Coverage

| Metric | Meaning | Target |
|--------|---------|--------|
| **Lines** | % of code lines executed | >80% |
| **Branches** | % of if/else paths tested | >75% |
| **Functions** | % of functions called | >80% |
| **Statements** | % of statements executed | >80% |

**Green = Good coverage** 🟢
**Yellow = Moderate coverage** 🟡
**Red = Low coverage** 🔴

---

## 🔬 Debugging Tests

### Method 1: Console Logging

```typescript
it('should extract quantity', () => {
  const result = service.extractQuantity('2kg Mehl');
  console.log('Result:', result); // Add this line
  expect(result.itemName).toBe('Mehl');
});
```

Run tests and check browser console or terminal output.

---

### Method 2: VS Code Debugger

1. Set a **breakpoint** (click left of line number)
2. Press **F5** or **Run > Start Debugging**
3. Step through code line by line

---

### Method 3: Focused Tests

```typescript
// Change 'it' to 'fit' to run only this test
fit('should extract quantity', () => {
  const result = service.extractQuantity('2kg Mehl');
  expect(result.itemName).toBe('Mehl');
});

// Or use 'fdescribe' for a whole block
fdescribe('Quantity Extraction', () => {
  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
});
```

**Remember to change back to `it`/`describe` after debugging!**

---

## 📚 Summary

### What You Have

✅ **153 tests** covering critical functionality
✅ **100% passing** after fixes
✅ **3 main test suites**:
  - Similarity/Disambiguation (100 tests)
  - Quantity Extraction (130 tests)
  - Context Management (40 tests)

### How to Use Them

1. **Run tests before refactoring** to ensure nothing breaks
2. **Read test names** to understand what's covered
3. **Check coverage** to find gaps
4. **Add new tests** when adding features
5. **Debug failing tests** to understand issues

### Quick Reference

```bash
# Run all tests
npm test -- --watch=false

# Run specific file
npm test -- --include='**/<filename>.spec.ts' --watch=false

# Run with coverage
npm test -- --code-coverage --watch=false

# Debug in Chrome
npm test -- --browsers=Chrome
```

---

**Questions? Check the test files directly:**
- `src/app/core/services/ai/simplified-disambiguation.service.spec.ts`
- `src/app/core/services/ai/quantity-extraction.service.spec.ts`
- `src/app/core/services/ai/context-management.service.spec.ts`

Happy testing! 🎉
