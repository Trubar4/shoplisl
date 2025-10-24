/**
 * Recipe Parsing Test Harness
 *
 * This tool helps debug and analyze recipe parsing by:
 * 1. Showing Groq API raw output
 * 2. Showing final parsed items
 * 3. Running test cases
 * 4. Analyzing results and identifying issues
 *
 * Usage:
 *   npx ts-node scripts/recipe-test-harness.ts
 */

interface TestCase {
  name: string;
  input: string;
  expectedItems: {
    itemName: string;
    quantity?: string;
  }[];
}

interface ParsedItem {
  itemName: string;
  quantity?: string;
  originalText: string;
  confidence: 'high' | 'medium' | 'low';
}

interface TestResult {
  testName: string;
  passed: boolean;
  groqOutput?: string;
  parsedItems: ParsedItem[];
  expectedItems: { itemName: string; quantity?: string }[];
  issues: string[];
  suggestions: string[];
}

// ========================================
// TEST CASES
// ========================================

const TEST_CASES: TestCase[] = [
  {
    name: 'User\'s Problematic Recipe - Decimal Commas & Product Specs',
    input: `Rezept:
Für den Teig:
500g Weizenmehl Type 405
2 mittelgroße Eier
400ml Vollmilch 3,5%
1 TL Salz,
------ Für die Soße: ------
* 200g Tomaten (gehackt)
⦁ - •• 1 Zwiebel •••
>>> 2 EL Öl <
75g weiche Butter (nicht flüssig)
Honig 0,5l`,
    expectedItems: [
      { itemName: 'Weizenmehl Type 405', quantity: '500 g' },
      { itemName: 'mittelgroße Eier', quantity: '2 Stück' },
      { itemName: 'Vollmilch 3,5%', quantity: '400 ml' }, // CRITICAL: Keep "3,5%"
      { itemName: 'Salz', quantity: '1 TL' }, // CRITICAL: Not "3,5 TL"
      { itemName: 'Tomaten gehackt', quantity: '200 g' },
      { itemName: 'Zwiebel', quantity: '1 Stück' },
      { itemName: 'Öl', quantity: '2 EL' },
      { itemName: 'weiche Butter', quantity: '75 g' },
      { itemName: 'Honig', quantity: '0,5 l' } // CRITICAL: Not "5 l" or article "0"
    ]
  },
  {
    name: 'Reverted Test - 11 Ingredients',
    input: `Rezept: Für den Teig: 500g Weizenmehl Type 405 3 mittelgroße Eier 400ml Vollmilch 3,5%
1 TL Salz 2 EL Zucker Für die Füllung: 300g Hackfleisch, gemischt 1 große Zwiebel, gewürfelt
200g Gouda, gerieben 2 EL Olivenöl extra virgin Zum Würzen: Pfeffer nach Geschmack
1 Bund frische Petersilie`,
    expectedItems: [
      { itemName: 'Weizenmehl Type 405', quantity: '500 g' },
      { itemName: 'mittelgroße Eier', quantity: '3 Stück' },
      { itemName: 'Vollmilch 3,5%', quantity: '400 ml' },
      { itemName: 'Salz', quantity: '1 TL' },
      { itemName: 'Zucker', quantity: '2 EL' },
      { itemName: 'Hackfleisch gemischt', quantity: '300 g' },
      { itemName: 'große Zwiebel', quantity: '1 Stück' },
      { itemName: 'Gouda gerieben', quantity: '200 g' },
      { itemName: 'Olivenöl extra virgin', quantity: '2 EL' },
      { itemName: 'Pfeffer', quantity: '1 Prise' },
      { itemName: 'frische Petersilie', quantity: '1 Bund' }
    ]
  },
  {
    name: 'Simple Recipe - Basic Test',
    input: `Rezept:
2 Äpfel
500g Mehl
1l Milch`,
    expectedItems: [
      { itemName: 'Äpfel', quantity: '2 Stück' },
      { itemName: 'Mehl', quantity: '500 g' },
      { itemName: 'Milch', quantity: '1 l' }
    ]
  },
  {
    name: 'Complex Multi-Item (Not Recipe) - Mixed Formatting',
    input: `500g bio Mehl, 2 frische Eier
* 1l Milch 3,5%
>>> 0,5kg Butter <<<
Honig 250ml`,
    expectedItems: [
      { itemName: 'bio Mehl', quantity: '500 g' },
      { itemName: 'frische Eier', quantity: '2 Stück' },
      { itemName: 'Milch 3,5%', quantity: '1 l' },
      { itemName: 'Butter', quantity: '0,5 kg' },
      { itemName: 'Honig', quantity: '250 ml' }
    ]
  }
];

// ========================================
// MOCK GROQ API (for testing without real API)
// ========================================

class MockGroqAPI {
  async standardizeRecipeIngredients(rawRecipeText: string): Promise<string> {
    console.log('🔄 MOCK: Simulating Groq API call...');

    // Simulate the CURRENT (buggy) behavior
    if (rawRecipeText.includes('Weizenmehl Type 405')) {
      return 'Füge 500 g Weizenmehl; 2 Eier; 400 ml Milch; 3,5 TL Salz; 200 g Tomaten; 1 Zwiebel; 2 EL Öl; 75 g Butter; 0,5 l Honig hinzu';
    }

    // Simulate ideal output
    return 'Füge 500 g Weizenmehl Type 405; 2 Stück mittelgroße Eier; 400 ml Vollmilch 3,5%; 1 TL Salz; 200 g Tomaten gehackt; 1 Zwiebel; 2 EL Öl; 75 g weiche Butter; 0,5 l Honig hinzu';
  }

  async standardizeComplexInput(rawInput: string): Promise<string> {
    console.log('🔄 MOCK: Simulating Groq complex input processing...');

    // Simple mock implementation
    const items = rawInput
      .replace(/[*•◦▪▫►▶→⦁>-]/g, '')
      .replace(/\n/g, '; ')
      .replace(/\s+/g, ' ')
      .trim();

    return `Füge ${items} hinzu`;
  }

  isComplexInput(input: string): boolean {
    const hasSpecialChars = /[•◦▪▫*►▶→⦁]{1,}|[-–—]{2,}|[>]{2,}/.test(input);
    const hasMultipleLines = (input.match(/\n/g) || []).length >= 2;
    const hasSectionHeaders = /für (den|die|das)|zum |zur |zubereitung|zutaten|portionen/i.test(input);
    const hasProductSpecs = /\d+,\d+%|type \d+|extra virgin|bio |frisch|mittelgroß|gebackt|gehackt/i.test(input);
    const hasDecimalCommas = /\d,\d+\s*(g|kg|ml|l|el|tl)/i.test(input);

    const complexityScore = [
      hasSpecialChars,
      hasMultipleLines,
      hasSectionHeaders,
      hasProductSpecs,
      hasDecimalCommas
    ].filter(Boolean).length;

    return complexityScore >= 2;
  }
}

// ========================================
// MOCK QUANTITY EXTRACTION (simplified)
// ========================================

class MockQuantityExtraction {
  parseMultipleItems(input: string): { items: ParsedItem[] } {
    const cleanInput = input
      .replace(/^(füge|hinzu|erstelle|liste|rezept:?)\s*/gi, '')
      .replace(/\s+(hinzu|zu|in)(\s+\w+)?\s*$/gi, '')
      .trim();

    // Use smart semicolon splitting
    const items = this.splitItems(cleanInput);

    return {
      items: items.map(item => this.parseItem(item))
    };
  }

  private splitItems(input: string): string[] {
    // Prefer semicolon splitting
    if (input.includes(';')) {
      return input.split(/\s*;\s*/).filter(i => i.trim().length > 0);
    }

    // Smart comma splitting (preserve decimal commas)
    if (input.includes(',')) {
      const items: string[] = [];
      const parts = input.split(',');

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();

        // Check if this is a decimal comma (e.g., "0" + "5 l Honig")
        const prevEndsWithDigit = i > 0 && /\d$/.test(parts[i - 1].trim());
        const currentStartsWithDigit = /^\d/.test(part);

        if (prevEndsWithDigit && currentStartsWithDigit && part.match(/^\d+\s*(g|kg|ml|l|el|tl)/)) {
          // This is a decimal comma - combine with previous
          const lastItem = items.pop();
          items.push(`${lastItem},${part}`);
        } else {
          items.push(part);
        }
      }

      return items.filter(i => i.trim().length > 0);
    }

    return [input];
  }

  private parseItem(item: string): ParsedItem {
    const trimmed = item.trim();

    // Try to extract quantity
    const patterns = [
      { regex: /^(\d+(?:,\d+)?)\s*(g|kg|ml|l|el|tl|stück|pack|dose|bund|prise)\s+(.+)$/i, qtyIdx: 1, unitIdx: 2, nameIdx: 3 },
      { regex: /^(\d+)\s+(.+)$/i, qtyIdx: 1, unitIdx: null, nameIdx: 2 },
      { regex: /^(.+?)\s+(\d+(?:,\d+)?)\s*(g|kg|ml|l|el|tl|stück|pack|dose|bund|prise)$/i, nameIdx: 1, qtyIdx: 2, unitIdx: 3 }
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        const itemName = match[pattern.nameIdx].trim();
        const quantity = pattern.unitIdx
          ? `${match[pattern.qtyIdx]} ${match[pattern.unitIdx]}`
          : match[pattern.qtyIdx];

        return {
          itemName,
          quantity,
          originalText: trimmed,
          confidence: 'high'
        };
      }
    }

    // No quantity found
    return {
      itemName: trimmed,
      originalText: trimmed,
      confidence: 'medium'
    };
  }
}

// ========================================
// ANALYZER
// ========================================

class ResultAnalyzer {
  analyze(result: TestResult): void {
    console.log('\n' + '='.repeat(80));
    console.log(`📊 TEST: ${result.testName}`);
    console.log('='.repeat(80));

    if (result.groqOutput) {
      console.log('\n🤖 GROQ OUTPUT:');
      console.log(result.groqOutput);
    }

    console.log('\n📝 PARSED ITEMS:');
    result.parsedItems.forEach((item, idx) => {
      const qtyStr = item.quantity ? `${item.quantity}` : 'no quantity';
      console.log(`  ${idx + 1}. ${item.itemName} (${qtyStr}) [${item.confidence}]`);
    });

    console.log('\n✅ EXPECTED ITEMS:');
    result.expectedItems.forEach((item, idx) => {
      const qtyStr = item.quantity ? `${item.quantity}` : 'no quantity';
      console.log(`  ${idx + 1}. ${item.itemName} (${qtyStr})`);
    });

    console.log('\n🔍 COMPARISON:');
    const comparison = this.compareResults(result.parsedItems, result.expectedItems);

    if (comparison.missing.length > 0) {
      console.log('\n❌ MISSING ITEMS:');
      comparison.missing.forEach(item => {
        console.log(`  - ${item.itemName} (${item.quantity || 'no quantity'})`);
      });
    }

    if (comparison.extra.length > 0) {
      console.log('\n⚠️  EXTRA ITEMS:');
      comparison.extra.forEach(item => {
        console.log(`  - ${item.itemName} (${item.quantity || 'no quantity'})`);
      });
    }

    if (comparison.quantityMismatches.length > 0) {
      console.log('\n⚠️  QUANTITY MISMATCHES:');
      comparison.quantityMismatches.forEach(mismatch => {
        console.log(`  - ${mismatch.itemName}: got "${mismatch.gotQuantity}" expected "${mismatch.expectedQuantity}"`);
      });
    }

    if (comparison.nameMismatches.length > 0) {
      console.log('\n⚠️  NAME MISMATCHES:');
      comparison.nameMismatches.forEach(mismatch => {
        console.log(`  - Got "${mismatch.got}" expected "${mismatch.expected}"`);
      });
    }

    console.log('\n📈 RESULT:', result.passed ? '✅ PASSED' : '❌ FAILED');

    if (result.issues.length > 0) {
      console.log('\n🐛 ISSUES:');
      result.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    if (result.suggestions.length > 0) {
      console.log('\n💡 SUGGESTIONS:');
      result.suggestions.forEach(suggestion => console.log(`  - ${suggestion}`));
    }

    console.log('\n');
  }

  private compareResults(parsed: ParsedItem[], expected: { itemName: string; quantity?: string }[]): {
    missing: { itemName: string; quantity?: string }[];
    extra: ParsedItem[];
    quantityMismatches: { itemName: string; gotQuantity?: string; expectedQuantity?: string }[];
    nameMismatches: { got: string; expected: string }[];
  } {
    const missing: { itemName: string; quantity?: string }[] = [];
    const extra: ParsedItem[] = [];
    const quantityMismatches: { itemName: string; gotQuantity?: string; expectedQuantity?: string }[] = [];
    const nameMismatches: { got: string; expected: string }[] = [];

    // Check for missing items
    expected.forEach(exp => {
      const found = parsed.find(p => this.normalizeItemName(p.itemName) === this.normalizeItemName(exp.itemName));
      if (!found) {
        missing.push(exp);
      } else {
        // Check quantity match
        if (this.normalizeQuantity(found.quantity) !== this.normalizeQuantity(exp.quantity)) {
          quantityMismatches.push({
            itemName: exp.itemName,
            gotQuantity: found.quantity,
            expectedQuantity: exp.quantity
          });
        }
      }
    });

    // Check for extra items
    parsed.forEach(p => {
      const found = expected.find(exp => this.normalizeItemName(p.itemName) === this.normalizeItemName(exp.itemName));
      if (!found) {
        extra.push(p);
      }
    });

    return { missing, extra, quantityMismatches, nameMismatches };
  }

  private normalizeItemName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private normalizeQuantity(qty?: string): string {
    if (!qty) return '';
    return qty.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}

// ========================================
// TEST RUNNER
// ========================================

class TestRunner {
  private groqApi = new MockGroqAPI();
  private quantityExtraction = new MockQuantityExtraction();
  private analyzer = new ResultAnalyzer();

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Recipe Parsing Test Harness\n');

    const results: TestResult[] = [];

    for (const testCase of TEST_CASES) {
      const result = await this.runTest(testCase);
      results.push(result);
      this.analyzer.analyze(result);
    }

    this.printSummary(results);
  }

  private async runTest(testCase: TestCase): Promise<TestResult> {
    const result: TestResult = {
      testName: testCase.name,
      passed: false,
      parsedItems: [],
      expectedItems: testCase.expectedItems,
      issues: [],
      suggestions: []
    };

    try {
      // Step 1: Check if input is complex
      const isComplex = this.groqApi.isComplexInput(testCase.input);
      console.log(`🔍 Complexity detection: ${isComplex ? 'COMPLEX' : 'SIMPLE'}`);

      // Step 2: Preprocess with Groq if complex or is a recipe
      let processedInput = testCase.input;
      if (isComplex || testCase.input.toLowerCase().includes('rezept')) {
        const groqOutput = await this.groqApi.standardizeRecipeIngredients(testCase.input);
        result.groqOutput = groqOutput;
        processedInput = groqOutput;
      }

      // Step 3: Parse items
      const parseResult = this.quantityExtraction.parseMultipleItems(processedInput);
      result.parsedItems = parseResult.items;

      // Step 4: Validate
      const validation = this.validateResult(result.parsedItems, testCase.expectedItems);
      result.passed = validation.passed;
      result.issues = validation.issues;
      result.suggestions = validation.suggestions;

    } catch (error) {
      result.issues.push(`Error during test: ${error}`);
    }

    return result;
  }

  private validateResult(parsed: ParsedItem[], expected: { itemName: string; quantity?: string }[]): {
    passed: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check item count
    if (parsed.length !== expected.length) {
      issues.push(`Item count mismatch: got ${parsed.length}, expected ${expected.length}`);
    }

    // Check for decimal comma issues
    parsed.forEach(item => {
      if (item.itemName === '0' || item.itemName.match(/^[0-9]$/)) {
        issues.push(`Found standalone number "${item.itemName}" - likely decimal comma parsing issue`);
        suggestions.push('Check decimal comma detection in quantity extraction');
      }

      if (item.quantity && item.quantity.includes(',')) {
        // Good - decimal comma preserved
      } else if (item.itemName.includes(',')) {
        issues.push(`Comma found in item name "${item.itemName}" - should be in quantity`);
        suggestions.push('Improve comma splitting logic');
      }
    });

    // Check for product spec preservation
    expected.forEach(exp => {
      if (exp.itemName.includes('%') || exp.itemName.includes('Type')) {
        const found = parsed.find(p => p.itemName.includes('%') || p.itemName.includes('Type'));
        if (!found) {
          issues.push(`Product specification lost: "${exp.itemName}"`);
          suggestions.push('Enhance Groq prompt to preserve product specifications like "%", "Type", etc.');
        }
      }
    });

    const passed = issues.length === 0 && parsed.length === expected.length;

    return { passed, issues, suggestions };
  }

  private printSummary(results: TestResult[]): void {
    console.log('='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));

    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`\nTotal tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Pass rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log('\n🐛 FAILED TESTS:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.testName}`);
      });
    }

    console.log('\n');
  }
}

// ========================================
// MAIN
// ========================================

async function main() {
  const runner = new TestRunner();
  await runner.runAllTests();
}

main().catch(console.error);
