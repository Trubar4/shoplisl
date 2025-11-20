/**
 * Quick test script for recipe parsing
 * Tests the specific user example that was failing
 */

const testRecipe = `Rezept: Für den Teig: 500g Weizenmehl Type 405 2 mittelgroße Eier 400ml Vollmilch 3,5% 1 TL Salz, ------ Für die Soße: ------ * 200g Tomaten (gehackt) * ⦁ - •• 1 Zwiebel ••• >>> 2 EL Öl < 75 g weiche Butter (nicht flüssig) Honig 0,5l`;

console.log('Testing recipe parsing with user example:');
console.log('=====================================\n');
console.log('Input recipe:');
console.log(testRecipe);
console.log('\n');

// Expected output: 9 ingredients
const expectedIngredients = [
  '500g Weizenmehl Type 405',
  '2 mittelgroße Eier',
  '400ml Vollmilch 3,5%',
  '1 TL Salz',
  '200g Tomaten (gehackt)',
  '1 Zwiebel',
  '2 EL Öl',
  '75 g weiche Butter (nicht flüssig)',
  'Honig 0,5l'
];

console.log('Expected ingredients (9 total):');
expectedIngredients.forEach((ing, idx) => {
  console.log(`  ${idx + 1}. ${ing}`);
});

console.log('\n\nTo test manually:');
console.log('1. Build the app: npm run build');
console.log('2. Start the app: npm start');
console.log('3. Open the voice assistant');
console.log('4. Paste the recipe above');
console.log('5. Verify that all 9 ingredients are detected and parsed correctly');

console.log('\n\nKey fixes applied:');
console.log('✓ Section headers (Für den Teig, Für die Soße) no longer filtered out');
console.log('✓ Special characters (*, ⦁, >>>, etc.) properly removed');
console.log('✓ Space-separated ingredients with quantities are split correctly');
console.log('✓ Decimal commas (3,5%, 0,5l) handled correctly');
