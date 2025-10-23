import { RecipeProcessingService } from '../app/core/services/ai/recipe-processing.service';
import { GroqApiService } from '../app/core/services/ai/groq-api.service';
import { ContextManagementService } from '../app/core/services/ai/context-management.service';
import { ListOperationsService } from '../app/core/services/ai/list-operations.service';
import { SimplifiedDisambiguationService } from '../app/core/services/ai/simplified-disambiguation.service';

// Minimal mocks to satisfy constructor and interactions
// Minimal plain mock instead of extending GroqApiService to avoid browser globals
class MockGroq {
  hasApiKey(): boolean { return true; }
  async standardizeRecipeIngredients(raw: string): Promise<string> {
    return 'Füge 500 g Weizenmehl Type 405; 3 Stück mittelgroße Eier; 400 ml Vollmilch 3,5%; 1 TL Salz; 2 EL Zucker; 300 g Hackfleisch gemischt; 1 Stück große Zwiebel; 200 g Gouda gerieben; 2 EL Olivenöl extra virgin; 1 Prise Pfeffer; 1 Bund frische Petersilie hinzu';
  }
}

class MockContext {
  getConversationContext() { return {}; }
}

class MockListOps {
  async getListSelectionOptions() {
    return [{ id: 'list1', name: 'TestList', color: '#fff', icon: '🛒', itemCount: 0 }];
  }
}

class MockSimplifiedDisambiguation {
  convertListsToDisambiguationOptions(listOptions: any[]) {
    return listOptions.map((l: any) => ({ id: `list_${l.id}`, displayName: l.name, type: 'list', confidence: 1.0 } as any));
  }
  // minimal stub for methods used by processor if any
  async getDisambiguationOptions(name: string) { return []; }
}

async function runHarness() {
  console.log('HARNESS: Starting recipe harness test');

  const service = new RecipeProcessingService(new MockGroq() as any, new MockContext() as any, new MockListOps() as any, new MockSimplifiedDisambiguation() as any);

  const recipe = `Rezept: Für den Teig: 500g Weizenmehl Type 405 3 mittelgroße Eier 400ml Vollmilch 3,5% 1 TL Salz 2 EL Zucker Für die Füllung: 300g Hackfleisch, gemischt 1 große Zwiebel, gewürfelt 200g Gouda, gerieben 2 EL Olivenöl extra virgin Zum Würzen: Pfeffer nach Geschmack 1 Bund frische Petersilie`;

  // Mock processMultiItemsCallback to simulate successful batch additions
  const processedBatches: string[] = [];
  const processedStructuredItems: string[] = [];
  const callback = async (cmd: string) => {
    console.log('HARNESS: callback received command ->', cmd);
    processedBatches.push(cmd);

    // Extract the items from the command robustly here so we capture the true units
    try {
      let inside = cmd.replace(/^Füge\s+/i, '').replace(/\s+zu\s+.+$/i, '').replace(/\s+hinzu$/i, '').trim();
      // Normalize decimal commas only when the comma is immediately followed by a digit (e.g. '3,5%')
      // Do NOT normalize when the comma is followed by a space (e.g. '405, 3') to avoid merging separate items.
      inside = inside.replace(/(\d+),(?=\d)/g, '$1.');
      const parts = inside.split(/,\s*/).map(p => p.trim()).filter(Boolean);
      // push each parsed item
      for (const p of parts) processedStructuredItems.push(p);
    } catch (e) {
      console.warn('HARNESS: failed to parse batch command into items', e);
    }

    // Simulate success with listId so recipe processor continues
    return { success: true, message: 'SIMULATED: batch processed', listId: 'list1', conversationContext: { waitingForArticles: { listId: 'list1', listName: 'TestList', prompt: 'OK' } } } as any;
  };

  const res = await service.processRecipeCommand(recipe, callback);
  console.log('HARNESS: final result ->', { success: res.success, message: res.message });
  console.log('HARNESS: processed batches count =', processedBatches.length);

  // Expect batches: with batchSize 3 and 11 items -> 4 batches
  if (!res.success) {
    throw new Error('HARNESS: FAILED - processRecipeCommand returned failure');
  }

  // Use structured items collected during callbacks
  const itemsAdded = processedStructuredItems.length;
  console.log('HARNESS: estimated itemsAdded from structured callback parsing =', itemsAdded);

  // Use reported count from the service message if available for authoritative check
  const reportedMatch = (res.message || '').match(/(\d+)\s+Zutat/);
  const reportedCount = reportedMatch ? parseInt(reportedMatch[1], 10) : null;

  if (reportedCount !== null) {
    if (itemsAdded !== reportedCount) {
      throw new Error(`HARNESS: FAILED - reported ${reportedCount} items but batches counted ${itemsAdded}`);
    }
    console.log(`HARNESS: SUCCESS - ${reportedCount} items were processed across ${processedBatches.length} batches`);
  } else {
    // Fallback strict check against expected 11
    if (itemsAdded !== 11) {
      throw new Error(`HARNESS: FAILED - expected 11 items added via batches but got ${itemsAdded}`);
    }
    console.log('HARNESS: SUCCESS - 11 items were processed across', processedBatches.length, 'batches');
  }
}

runHarness().catch(err => {
  console.error('HARNESS: Exception', err);
  throw err;
});
