// src/app/core/services/ai/disambiguation.service.ts - ENHANCED SUGGESTIONS VERSION
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take, timeout } from 'rxjs/operators';
import {
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ProcessedItem, 
  AIExecutionResult,
  ListSelectionOption,
  isMultiItemPendingAction,
  DISAMBIGUATION_THRESHOLD,
  MIN_SIMILARITY_THRESHOLD,
  DisambiguationError
} from './ai-models';
import { Article, ShoppingList } from '../../models';
import { DataService } from '../data.service';
import { DepartmentService } from '../department.service';
import { SmartSuggestionsService } from './smart-suggestions.service'; 
import { LoggerService } from '../logger.service';


@Injectable({
  providedIn: 'root'
})
export class DisambiguationService {

  constructor(
    private dataService: DataService,
    private departmentService: DepartmentService,
    private smartSuggestions: SmartSuggestionsService,
    private logger: LoggerService
  ) {}

  // ========================================
  // MAIN DISAMBIGUATION METHODS - ENHANCED
  // ========================================

  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    console.log('🔍 Getting disambiguation options for:', itemName);
    
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const options: DisambiguationOption[] = [];

      if (!articles) return options;

      const searchTerm = itemName.toLowerCase().trim();

      const similarArticles = articles
        .filter(article => article.id !== excludeId)
        .map(article => {
          const articleName = article.name.toLowerCase();
          
          const exactMatch = articleName === searchTerm ? 1.0 : 0;
          const containsMatch = articleName.includes(searchTerm) || searchTerm.includes(articleName) ? 0.8 : 0;
          const levenshteinSim = this.calculateSimilarity(searchTerm, articleName);
          
          const similarity = Math.max(exactMatch, containsMatch, levenshteinSim);
          
          return { article, similarity };
        })
        .filter(item => item.similarity >= MIN_SIMILARITY_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

      // Add existing articles as options
      for (const item of similarArticles) {
        options.push({
          id: `existing_${item.article.id}`,
          displayName: item.article.name,
          type: 'existing',
          article: item.article,
          confidence: item.similarity,
          department: item.article.departmentId,
          icon: item.article.icon
        });
      }

      // ENHANCED: Add "create new" option with smart suggestions
      const hasExactMatch = similarArticles.some(item => 
        item.article.name.toLowerCase().trim() === searchTerm
      );
      
      console.log('🎯 Exact match check:', { searchTerm, hasExactMatch, similarCount: similarArticles.length });

      if (!hasExactMatch) {
        console.log('🎯🤖 Getting smart suggestions for disambiguation...');
        
        // Get smart suggestions from the dedicated service  
        const suggestions = await this.smartSuggestions.getSmartSuggestions(itemName);
        
        let suggestedDepartmentId = 'miscellaneous';
        let suggestedIcon = '📦';
        
        if (suggestions) {
          suggestedDepartmentId = suggestions.departmentId;
          suggestedIcon = suggestions.icon;
          console.log('✅ Smart suggestions for disambiguation:', {
            item: itemName,
            department: suggestedDepartmentId,
            icon: suggestedIcon
          });
        } else {
          // Fallback to manual suggestions
          suggestedDepartmentId = await this.smartSuggestions.suggestDepartment(itemName);
          suggestedIcon = await this.smartSuggestions.suggestIcon(itemName);
          console.log('📦 Fallback suggestions:', {
            item: itemName,
            department: suggestedDepartmentId,
            icon: suggestedIcon
          });
        }
        
        const departmentName = this.departmentService.getDepartmentName(suggestedDepartmentId, 'german');
        
        options.push({
          id: 'new_article',
          displayName: `"${itemName}" (neu erstellen)`,
          type: 'new',
          confidence: 1.0,
          icon: suggestedIcon,
          department: departmentName,
          suggestedDepartmentId: suggestedDepartmentId,
          preview: `${departmentName} ${suggestedIcon}`
        });
        
        console.log('✅ Added create new option with smart suggestions:', {
          icon: suggestedIcon,
          department: departmentName,
          departmentId: suggestedDepartmentId
        });
      } else {
        console.log('⏭️ Skipped create new option - exact match exists');
      }

      return options;
      
    } catch (error) {
      console.error('Error getting disambiguation options:', error);
      throw new DisambiguationError('Failed to get disambiguation options', { itemName, error });
    }
  }

  // Helper method to get AI suggestions (simplified interface)
private async getAISuggestions(itemName: string, type: 'department' | 'icon'): Promise<string | null> {
  try {
    // This would ideally call the AI service's smart suggestions
    // For now, we'll implement a simple version that can be enhanced
    
    // Mock API call - replace with actual AI service call
    const result = await this.callSimpleAISuggestion(itemName, type);
    return result;
    
  } catch (error) {
    console.error(`🎯 AI ${type} suggestion failed:`, error);
    return null;
  }
}

private async callSimpleAISuggestion(itemName: string, type: 'department' | 'icon'): Promise<string | null> {
  // This is a placeholder - in practice, you'd either:
  // 1. Inject the AI service and call its methods
  // 2. Make a direct API call here
  // 3. Use a shared service for AI suggestions
  
  // For now, return null to use fallback
  return null;
}

  // Helper methods to check AI service availability
  private hasAIService(): boolean {
    // This would need to be injected or accessed somehow
    // For now, return false to use fallback
    return false;
  }

  private getAIService(): any {
    // This would return the injected AI service
    // For now, return null
    return null;
  }


  // ========================================
  // ENHANCED SUGGESTION METHODS
  // ========================================

  /**
   * 🎯 ENHANCED: Comprehensive German food department mapping
   */
  public suggestDepartment(itemName: string): string {
    const lowerName = itemName.toLowerCase().trim();
    
    // 🥬 FRUIT & VEGETABLES
    const fruitsVegetables = [
      'apfel', 'äpfel', 'birne', 'banane', 'bananen', 'orange', 'orangen', 'zitrone', 'zitronen',
      'gurke', 'gurken', 'tomate', 'tomaten', 'karotte', 'karotten', 'möhre', 'möhren',
      'zwiebel', 'zwiebeln', 'knoblauch', 'paprika', 'salat', 'kopfsalat', 'eisbergsalat',
      'spinat', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'kartoffel', 'kartoffeln',
      'süßkartoffel', 'radieschen', 'rettich', 'sellerie', 'lauch', 'porree', 'petersilie',
      'schnittlauch', 'dill', 'basilikum', 'rucola', 'feldsalat', 'champignon', 'pilze',
      'avocado', 'mango', 'ananas', 'kiwi', 'trauben', 'erdbeeren', 'himbeeren', 'blaubeeren',
      'kirschen', 'pfirsich', 'aprikose', 'pflaume', 'melone', 'wassermelone', 'limette',
      'ingwer', 'chili', 'jalapeño', 'paprikaschote', 'rote paprika', 'gelbe paprika',
      'grüne paprika', 'süßpaprika', 'spitzpaprika', 'romana', 'rucola', 'mangold',
      'grünkohl', 'rosenkohl', 'weißkohl', 'rotkohl', 'wirsing', 'chinakohl', 'fenchel',
      'artischocke', 'spargel', 'rhabarber', 'kürbis', 'hokkaido', 'butternut'
    ];
    
    if (fruitsVegetables.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'fruit-vegetables';
    }
    
    // 🥛 DAIRY PRODUCTS
    const dairy = [
      'milch', 'butter', 'sahne', 'schlagsahne', 'saure sahne', 'schmand', 'crème fraîche',
      'joghurt', 'jogurt', 'skyr', 'quark', 'magerquark', 'frischkäse', 'hüttenkäse',
      'ricotta', 'mascarpone', 'mozzarella', 'feta', 'ziegenkäse', 'schafskäse',
      'buttermilch', 'kondensmilch', 'sahnejoghurt', 'naturjoghurt', 'griechischer joghurt',
      'kefir', 'ayran', 'dickmilch', 'sauermilch'
    ];
    
    if (dairy.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'dairy-products';
    }
    
    // 🧀 SAUSAGE & CHEESE COUNTER  
    const sausageCheese = [
      'käse', 'gouda', 'emmentaler', 'edamer', 'cheddar', 'parmesan', 'pecorino',
      'gorgonzola', 'roquefort', 'camembert', 'brie', 'tilsiter', 'limburger',
      'wurst', 'salami', 'schinken', 'speck', 'leberwurst', 'mettwurst', 'bratwurst',
      'wiener', 'frankfurter', 'bockwurst', 'weißwurst', 'blutwurst', 'teewurst',
      'mortadella', 'chorizo', 'serrano', 'prosciutto', 'coppa', 'pancetta',
      'bergkäse', 'alpenkäse', 'hartkäse', 'weichkäse', 'schnittkäse'
    ];
    
    if (sausageCheese.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'sausage-cheese-counter';
    }
    
    // 🥩 FRIDGE MEAT
    const meat = [
      'fleisch', 'rind', 'rindfleisch', 'schwein', 'schweinefleisch', 'hähnchen', 'hühnchen',
      'pute', 'putenfleisch', 'truthahn', 'lamm', 'lammfleisch', 'kalb', 'kalbfleisch',
      'hackfleisch', 'hack', 'mett', 'tartar', 'schnitzel', 'steak', 'filet', 'gulasch',
      'braten', 'kotelett', 'rippchen', 'spare ribs', 'entenbrust', 'gänsebrust',
      'wild', 'hirsch', 'reh', 'wildschwein', 'kaninchen', 'hase'
    ];
    
    if (meat.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'fridge-meat';
    }
    
    // 🐟 FISH
    const fish = [
      'fisch', 'lachs', 'forelle', 'thunfisch', 'kabeljau', 'seelachs', 'pangasius',
      'scholle', 'zander', 'hecht', 'karpfen', 'makrele', 'hering', 'sardine',
      'garnele', 'garnelen', 'shrimp', 'scampi', 'muschel', 'muscheln', 'tintenfisch',
      'oktopus', 'krake', 'krebs', 'hummer', 'languste', 'krabben', 'meeresfrüchte',
      'räucherlachs', 'geräucherter lachs', 'matjes', 'rollmops'
    ];
    
    if (fish.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'fish';
    }
    
    // 🍞 BREAD
    const bread = [
      'brot', 'brötchen', 'semmel', 'baguette', 'ciabatta', 'vollkornbrot', 'weißbrot',
      'schwarzbrot', 'roggenbrot', 'dinkelbre', 'mehrkornbrot', 'toast', 'toastbrot',
      'bagel', 'pumpernickel', 'knäckebrot', 'fladenbrot', 'pita', 'naan',
      'brezel', 'laugenbrezeln', 'croissant', 'hörnchen'
    ];
    
    if (bread.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'bread';
    }
    
    // 🍝 NOODLES & RICE
    const noodlesRice = [
      'nudeln', 'pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'rigatoni',
      'linguine', 'fettuccine', 'lasagne', 'gnocchi', 'ravioli', 'tortellini',
      'reis', 'basmati', 'jasmin reis', 'risotto', 'arborio', 'wildreis', 'naturreis',
      'parboiled', 'sushi reis', 'milchreis', 'quinoa', 'bulgur', 'couscous',
      'spätzle', 'schupfnudeln', 'maultaschen'
    ];
    
    if (noodlesRice.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'noodles-rice';
    }
    
    // 🥫 TINS & JARS
    const tinsJars = [
      'bohnen', 'kidneybohnen', 'weiße bohnen', 'schwarze bohnen', 'kichererbsen',
      'linsen', 'mais', 'zuckermais', 'erbsen', 'karotten konserve', 'tomaten dose',
      'passierte tomaten', 'geschälte tomaten', 'tomatenmark', 'tomatensauce',
      'oliven', 'kapern', 'cornichons', 'gewürzgurken', 'essiggurken', 'sauerkraut',
      'rotkraut', 'marmelade', 'konfitüre', 'honig', 'nutella', 'erdnussbutter',
      'senf', 'ketchup', 'mayo', 'mayonnaise', 'barbecue sauce', 'worcester',
      'thunfisch dose', 'sardinen', 'anchonis'
    ];
    
    if (tinsJars.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'tins-jars';
    }
    
    // 🧂 SPICES & OILS
    const spicesOils = [
      'salz', 'pfeffer', 'paprika pulver', 'curry', 'kurkuma', 'kümmel', 'kreuzkümmel',
      'koriander', 'zimt', 'muskat', 'nelken', 'lorbeer', 'thymian', 'rosmarin',
      'oregano', 'majoran', 'estragon', 'salbei', 'bohnenkraut', 'kerbel',
      'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'sesamöl', 'kokosöl', 'erdnussöl',
      'essig', 'balsamico', 'weißweinessig', 'rotweinessig', 'apfelessig',
      'vanille', 'vanillezucker', 'backpulver', 'natron', 'hefe', 'trockenhefe'
    ];
    
    if (spicesOils.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'spices-oils';
    }
    
    // 🥤 BEVERAGES & ALCOHOL
    const beverages = [
      'wasser', 'sprudel', 'mineralwasser', 'limonade', 'cola', 'fanta', 'sprite',
      'saft', 'orangensaft', 'apfelsaft', 'traubensaft', 'cranberrysaft',
      'bier', 'weißbier', 'pils', 'weizen', 'radler', 'wein', 'rotwein', 'weißwein',
      'rosé', 'sekt', 'champagner', 'prosecco', 'schnaps', 'vodka', 'gin', 'rum',
      'whiskey', 'cognac', 'likör', 'aperitif', 'kaffee', 'espresso', 'cappuccino',
      'tee', 'grüner tee', 'schwarzer tee', 'früchtetee', 'kräutertee', 'energy drink',
      'isotonisch', 'smoothie'
    ];
    
    if (beverages.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'beverages-alcohol';
    }
    
    // 🧊 FROZEN GOODS
    const frozen = [
      'tiefkühl', 'gefror', 'eis', 'eiscreme', 'sorbet', 'frozen', 'tk-',
      'tiefkühlpizza', 'tiefkühlgemüse', 'tiefkühlfisch', 'fish sticks',
      'pommes', 'kroketten', 'chicken nuggets', 'frühlingsrollen'
    ];
    
    if (frozen.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'frozen-goods';
    }
    
    // 🍰 PASTRIES
    const pastries = [
      'kuchen', 'torte', 'muffin', 'keks', 'plätzchen', 'cookie', 'stollen',
      'lebkuchen', 'donut', 'berliner', 'hefezopf', 'streuselkuchen'
    ];
    
    if (pastries.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'pastries';
    }
    
    // 🍭 SWEET & SALTY
    const sweetSalty = [
      'süß', 'schokolade', 'gummibär', 'bonbon', 'lutscher', 'chips', 'snack',
      'nüsse', 'erdnüsse', 'mandeln', 'cashew', 'haselnüsse', 'walnüsse',
      'salzstangen', 'cracker', 'reiswaffeln', 'müsliriegel', 'energieriegel'
    ];
    
    if (sweetSalty.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'sweet-salty';
    }
    
    // 🧻 HOUSEHOLD GOODS
    const household = [
      'klopapier', 'toilettenpapier', 'küchenrolle', 'zewa', 'tempo', 'serviette',
      'müllbeutel', 'gefrierbeutel', 'frischhaltefolie', 'alufolie', 'backpapier',
      'staubsauger', 'batterien', 'glühbirne', 'kerzen'
    ];
    
    if (household.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'household-goods';
    }
    
    // 🧴 BODY CARE
    const bodyCare = [
      'shampoo', 'duschgel', 'seife', 'zahnbürste', 'zahnpasta', 'mundspülung',
      'deo', 'deodorant', 'parfum', 'creme', 'bodylotion', 'sonnencreme',
      'rasierer', 'rasierschaum', 'aftershave', 'damenhygiene', 'binden'
    ];
    
    if (bodyCare.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'body-care';
    }
    
    // 🧽 CLEANING AGENTS
    const cleaning = [
      'spülmittel', 'waschmittel', 'weichspüler', 'allzweckreiniger', 'badreiniger',
      'wc reiniger', 'glasreiniger', 'entkalker', 'scheuermilch', 'schwamm'
    ];
    
    if (cleaning.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'cleaning-agents';
    }
    
    // 🥣 BREAKFAST
    const breakfast = [
      'müsli', 'cornflakes', 'haferflocken', 'porridge', 'ei', 'eier',
      'spiegelei', 'rührei', 'omelett', 'frühstück'
    ];
    
    if (breakfast.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'breakfast';
    }
    
    // 🌍 INTERNATIONAL
    const international = [
      'sushi', 'wasabi', 'sojasauce', 'teriyaki', 'miso', 'ramen', 'udon',
      'kimchi', 'sriracha', 'fish sauce', 'oyster sauce', 'tacos', 'tortilla',
      'salsa', 'guacamole', 'jalapenos', 'hummus', 'tahini', 'harissa',
      'couscous', 'baklava', 'falafel', 'tzatziki', 'gyros', 'paella'
    ];
    
    if (international.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'international';
    }
    
    // 🐕 PET SUPPLIES
    const petSupplies = [
      'hundefutter', 'katzenfutter', 'tierfutter', 'leckerli', 'katzenstreu',
      'vogelfutter', 'fischfutter'
    ];
    
    if (petSupplies.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'pet-supplies';
    }
    
    // 👶 BABY
    const baby = [
      'windel', 'babybrei', 'babymilch', 'schnuller', 'babycreme', 'feuchttücher'
    ];
    
    if (baby.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'baby';
    }
    
    // 💊 MEDICINE
    const medicine = [
      'aspirin', 'ibuprofen', 'paracetamol', 'hustensaft', 'nasenspray',
      'tabletten', 'medikament', 'arznei', 'tropfen', 'salbe'
    ];
    
    if (medicine.some(item => lowerName.includes(item) || item.includes(lowerName))) {
      return 'medicine';
    }
    
    // Default fallback
    return 'miscellaneous';
  }

  /**
 * 🎯 ENHANCED: Comprehensive emoji mapping for German foods
 */
public suggestIcon(itemName: string): string {
  const lowerName = itemName.toLowerCase().trim();
  
  // CRITICAL FIX: Better beverage detection first
  if (lowerName.includes('sekt') || lowerName.includes('champagner') || lowerName.includes('prosecco')) return '🍾';
  if (lowerName.includes('bier')) return '🍺';
  if (lowerName.includes('wein')) return '🍷';
  if (lowerName.includes('whiskey') || lowerName.includes('vodka') || lowerName.includes('gin') || lowerName.includes('rum')) return '🥃';
  if (lowerName.includes('kaffee') || lowerName.includes('espresso')) return '☕';
  if (lowerName.includes('tee')) return '🍵';
  if (lowerName.includes('wasser') || lowerName.includes('sprudel') || lowerName.includes('mineralwasser')) return '💧';
  if (lowerName.includes('saft') || lowerName.includes('orangensaft') || lowerName.includes('apfelsaft')) return '🧃';
  if (lowerName.includes('cola') || lowerName.includes('limonade') || lowerName.includes('fanta') || lowerName.includes('sprite')) return '🥤';
  if (lowerName.includes('milch')) return '🥛';
  
  // Fruits & Vegetables
  if (lowerName.includes('gurke')) return '🥒';
  if (lowerName.includes('tomate')) return '🍅';
  if (lowerName.includes('karotte') || lowerName.includes('möhre')) return '🥕';
  if (lowerName.includes('zwiebel')) return '🧅';
  if (lowerName.includes('knoblauch')) return '🧄';
  if (lowerName.includes('paprika')) return '🌶️';
  if (lowerName.includes('salat')) return '🥗';
  if (lowerName.includes('spinat')) return '🥬';
  if (lowerName.includes('brokkoli')) return '🥦';
  if (lowerName.includes('kartoffel')) return '🥔';
  if (lowerName.includes('pilz') || lowerName.includes('champignon')) return '🍄';
  if (lowerName.includes('avocado')) return '🥑';
  if (lowerName.includes('mais')) return '🌽';
  if (lowerName.includes('aubergine')) return '🍆';
  
  if (lowerName.includes('apfel') || lowerName.includes('äpfel')) return '🍎';
  if (lowerName.includes('banane')) return '🍌';
  if (lowerName.includes('orange')) return '🍊';
  if (lowerName.includes('zitrone')) return '🍋';
  if (lowerName.includes('erdbeere')) return '🍓';
  if (lowerName.includes('traube')) return '🍇';
  if (lowerName.includes('kirsche')) return '🍒';
  if (lowerName.includes('pfirsich')) return '🍑';
  if (lowerName.includes('ananas')) return '🍍';
  if (lowerName.includes('mango')) return '🥭';
  if (lowerName.includes('kiwi')) return '🥝';
  if (lowerName.includes('melone')) return '🍉';
  
  // Dairy & Eggs  
  if (lowerName.includes('butter')) return '🧈';
  if (lowerName.includes('käse')) return '🧀';
  if (lowerName.includes('joghurt') || lowerName.includes('jogurt')) return '🥛';
  if (lowerName.includes('ei') && !lowerName.includes('fleisch') && !lowerName.includes('wein')) return '🥚';
  
  // Meat & Fish
  if (lowerName.includes('fleisch') || lowerName.includes('steak') || lowerName.includes('schnitzel')) return '🥩';
  if (lowerName.includes('hähnchen') || lowerName.includes('hühnchen') || lowerName.includes('chicken')) return '🍗';
  if (lowerName.includes('speck') || lowerName.includes('bacon')) return '🥓';
  if (lowerName.includes('wurst') || lowerName.includes('salami')) return '🌭';
  if (lowerName.includes('schinken')) return '🍖';
  if (lowerName.includes('fisch') || lowerName.includes('lachs')) return '🐟';
  if (lowerName.includes('garnele') || lowerName.includes('shrimp')) return '🦐';
  
  // Bread & Baked goods
  if (lowerName.includes('brot')) return '🍞';
  if (lowerName.includes('brötchen') || lowerName.includes('semmel')) return '🥖';
  if (lowerName.includes('croissant')) return '🥐';
  if (lowerName.includes('bagel')) return '🥯';
  if (lowerName.includes('brezel')) return '🥨';
  if (lowerName.includes('kuchen') || lowerName.includes('torte')) return '🍰';
  if (lowerName.includes('muffin')) return '🧁';
  if (lowerName.includes('donut')) return '🍩';
  if (lowerName.includes('keks') || lowerName.includes('cookie')) return '🍪';
  
  // Noodles & Rice
  if (lowerName.includes('nudeln') || lowerName.includes('pasta') || lowerName.includes('spaghetti')) return '🍝';
  if (lowerName.includes('reis')) return '🍚';
  if (lowerName.includes('ramen')) return '🍜';
  
  // Sweets & Snacks
  if (lowerName.includes('schokolade')) return '🍫';
  if (lowerName.includes('bonbon') || lowerName.includes('süßigkeit')) return '🍬';
  if (lowerName.includes('gummibär')) return '🐻';
  if (lowerName.includes('eis') && (lowerName.includes('creme') || lowerName.includes('cream'))) return '🍦';
  if (lowerName.includes('chips')) return '🍟';
  if (lowerName.includes('nuss') || lowerName.includes('nüsse')) return '🥜';
  if (lowerName.includes('popcorn')) return '🍿';
  
  // Spices & Condiments
  if (lowerName.includes('salz')) return '🧂';
  if (lowerName.includes('pfeffer')) return '🌶️';
  if (lowerName.includes('öl')) return '🫒';
  if (lowerName.includes('honig')) return '🍯';
  if (lowerName.includes('senf')) return '🥨';
  if (lowerName.includes('ketchup')) return '🍅';
  
  // Household
  if (lowerName.includes('klopapier') || lowerName.includes('toilettenpapier')) return '🧻';
  if (lowerName.includes('seife')) return '🧼';
  if (lowerName.includes('zahnbürste')) return '🪥';
  if (lowerName.includes('shampoo') || lowerName.includes('duschgel')) return '🧴';
  if (lowerName.includes('kerze')) return '🕯️';
  if (lowerName.includes('batterie')) return '🔋';
  
  // Baby & Pet
  if (lowerName.includes('windel')) return '👶';
  if (lowerName.includes('hundefutter') || lowerName.includes('katzenfutter')) return '🐕';
  
  // Default fallback
  return '📦';
}

  // ========================================
  // REST OF THE CLASS REMAINS UNCHANGED
  // ========================================

  // [All other methods remain exactly the same as before...]
  
  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING MULTI-ITEM SEQUENTIALLY - FIXED VERSION');
    console.log(`🎯 Processing item ${action.currentItemIndex + 1}/${action.items.length}`);
    

    // SAFETY: Prevent infinite recursion
    if (!action.items || action.items.length === 0) {
      console.error('🎯 SAFETY: No items to process');
      return { success: false, message: '❌ Keine Artikel zu verarbeiten.' };
    }
    
    // SAFETY: Prevent processing more than 20 items
    if (action.currentItemIndex > 20) {
      console.error('🎯 SAFETY: Too many iterations - stopping to prevent infinite loop');
      return this.executeMultiItemFinalAction(action);
    }
    
    // CRITICAL FIX: Check completion condition first
    if (action.currentItemIndex >= action.items.length) {
      console.log('🎯 All items processed - executing final action');
      return this.executeMultiItemFinalAction(action);
    }
  
    const currentItem = action.items[action.currentItemIndex];
    if (!currentItem) {
      console.log('🎯 No current item found - executing final action');
      return this.executeMultiItemFinalAction(action);
    }
  
    console.log(`🎯 PROCESSING ITEM ${action.currentItemIndex + 1}/${action.items.length}:`, currentItem);
  
    try {
      // Get disambiguation options for current item
      const disambiguationOptions = await this.getDisambiguationOptions(currentItem.itemName);
          
      // Check if disambiguation is needed (existing articles found)
      const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
      
      if (existingOptions.length > 0) {
        console.log('🎯 Disambiguation needed for:', currentItem.itemName);
        
        // CRITICAL: Mark as sequential processing for UI
        (action as any).isMultiItemSequential = true;
        (action as any).isFromRecipe = true;
        
        // FIXED: Update itemName to current item
        action.itemName = currentItem.itemName;
        
        // Generate simplified message for sequential processing
        const message = `"${currentItem.itemName}" Ich habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;
        
        return {
          success: true,
          message,
          needsUserInput: true,
          disambiguationOptions,
          pendingAction: action
        };
      }
  
      // No disambiguation needed - create new article and continue automatically
      console.log('🎯 No disambiguation needed - creating new article and continuing');
      return this.processCurrentItemAndContinue(action, null);
      
    } catch (error) {
      console.error('🎯 Error in sequential processing:', error);
      
      // Add failed item and continue
      const failedItem: ProcessedItem = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };
      
      action.processedItems.push(failedItem);
      action.currentItemIndex++;
      
      // SAFETY: Use setTimeout to prevent stack overflow
      return new Promise((resolve) => {
        setTimeout(() => {
          this.processMultiItemSequentially(action).then(resolve);
        }, 0);
      });
    }
  }

  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null
  ): Promise<AIExecutionResult> {
    const currentItem = action.items[action.currentItemIndex];
    
    if (!currentItem) {
      action.currentItemIndex++;
      return this.executeMultiItemFinalAction(action);
    }
  
    // Get confirmed target list
    const targetListId = (action as any).confirmedTargetListId;
    const targetListName = (action as any).confirmedTargetListName;
    
    if (!targetListId || !targetListName) {
      return {
        success: false,
        message: '❌ Fehler: Keine Zielliste bestätigt.'
      };
    }
  
    try {
      let articleId: string;
      
      if (selectedArticle) {
        articleId = selectedArticle.id;
        // REMOVED: Don't update article amount here - just use the selected article
      } else {
        // SIMPLIFIED: Use basic suggestions instead of async smart suggestions
        const articleData = {
          name: currentItem.itemName,
          amount: currentItem.quantity || '',
          departmentId: this.suggestDepartment(currentItem.itemName), // Use sync method
          icon: this.suggestIcon(currentItem.itemName) // Use sync method
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        if (!newArticle) {
          throw new Error(`Failed to create article: ${currentItem.itemName}`);
        }
        articleId = newArticle.id;
      }
  
      // SIMPLIFIED: Add to list without fetching the full list first
      const success = await this.dataService.addArticleToList(targetListId, articleId).toPromise();
      
      if (!success) {
        throw new Error(`Failed to add article to list: ${targetListName}`);
      }
  
      // SIMPLIFIED: Set amount separately if needed
      if (currentItem.quantity) {
        await this.dataService.updateListItemAmount(targetListId, articleId, currentItem.quantity).toPromise();
      }
  
      const processedItem: any = {
        item: currentItem,
        articleId,
        disambiguationResolved: true,
        quantity: currentItem.quantity,
        originalText: currentItem.itemName,
        addedToList: true,
        addedToListId: targetListId,
        addedToListName: targetListName
      };
      
      action.processedItems.push(processedItem);
      action.currentItemIndex++;
  
      // IMMEDIATE: Continue to next item without setTimeout
      return this.processMultiItemSequentially(action);
  
    } catch (error) {
      const failedItem: any = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };
      
      action.processedItems.push(failedItem);
      action.currentItemIndex++;
      
      // IMMEDIATE: Continue even on error
      return this.processMultiItemSequentially(action);
    }
  }

  private async executeMultiItemFinalAction(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    const processedItems = action.processedItems.filter(p => p.articleId && !p.skipped && !p.failed);
    const skippedItems = action.processedItems.filter(p => p.skipped);
    const failedItems = action.processedItems.filter(p => p.failed);
    const addedItems = action.processedItems.filter(p => (p as any).addedToList);
    
    if (addedItems.length === 0 && processedItems.length === 0 && skippedItems.length === 0) {
      return { success: false, message: '❌ Keine Artikel konnten verarbeitet werden.' };
    }
  
    const targetListId = (action as any).confirmedTargetListId;
    const targetListName = (action as any).confirmedTargetListName;
    
    let message = '';
    
    if (addedItems.length > 0) {
      const addedSummary = addedItems.map(p => 
        `"${p.item.itemName}"${p.quantity ? ` (${p.quantity})` : ''}`
      );
      message += `✅ ${addedItems.length} Artikel erfolgreich zu "${targetListName || 'Liste'}" hinzugefügt:\n${addedSummary.join(', ')}`;
    }
    
    if (skippedItems.length > 0) {
      const skippedSummary = skippedItems.map(p => `"${p.originalText || p.item.itemName}"`);
      message += `${message ? '\n\n' : ''}⏭️ ${skippedItems.length} Artikel übersprungen:\n${skippedSummary.join(', ')}`;
    }
    
    if (failedItems.length > 0) {
      const failedSummary = failedItems.map(p => `"${p.originalText || p.item.itemName}"`);
      message += `${message ? '\n\n' : ''}❌ ${failedItems.length} Artikel fehlgeschlagen:\n${failedSummary.join(', ')}`;
    }
  
    let conversationContext: any = undefined;
    let followUpPrompt: string | undefined = undefined;
  
    if (targetListId && targetListName && addedItems.length > 0) {
      conversationContext = {
        lastAction: {
          type: 'article_added' as const,
          listId: targetListId,
          listName: targetListName,
          articleName: `${addedItems.length} Artikel`,
          timestamp: new Date()
        },
        waitingForArticles: {
          listId: targetListId,
          listName: targetListName,
          prompt: 'Multi-item processing completed'
        }
      };
      
      followUpPrompt = `Möchtest du noch weitere Artikel zu "${targetListName}" hinzufügen?`;
    }
  
    return {
      success: true,
      message: message,
      listId: targetListId,
      conversationContext,
      followUpPrompt
    };
  }

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });
  
    try {
      // CRITICAL: Handle SKIP option first
      if (selectedOption.type === 'skip') {
        console.log('⏭️ Processing skip option');
        return this.handleSkipOption(pendingAction, selectedOption);
      }

      if ((pendingAction as any).type === 'select_list_for_multi_items') {
        console.log('🎯 Handling list selection for multi-items');
        return this.handleListSelectionForMultiItems(pendingAction, selectedOption);
      }
  
      // CRITICAL FIX: Handle multi-item sequential processing
      if (isMultiItemPendingAction(pendingAction)) {
        console.log('🎯 Handling multi-item disambiguation choice');
        return this.handleMultiItemDisambiguationChoice(pendingAction, selectedOption);
      }
  
      // Handle single-item cases
      if (pendingAction.type === 'select_list') {
        return this.handleListSelection(pendingAction, selectedOption);
      }
  
      // Handle article disambiguation for single items
      if (selectedOption.type === 'existing' && selectedOption.article) {
        return this.executeActionWithArticle(pendingAction, selectedOption.article);
      } else {
        return this.executeActionWithNewArticle(pendingAction);
      }
  
    } catch (error) {
      console.error('Error handling disambiguation choice:', error);
      return {
        success: false,
        message: `❌ Fehler beim Verarbeiten der Auswahl: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  private async handleMultiItemDisambiguationChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 HANDLING MULTI-ITEM DISAMBIGUATION CHOICE');
    console.log('🎯 Current item index:', pendingAction.currentItemIndex);
    console.log('🎯 Selected option type:', selectedOption.type);

    let selectedArticle: Article | null = null;
    
    if (selectedOption.type === 'existing' && selectedOption.article) {
      selectedArticle = selectedOption.article;
      console.log('🎯 Using existing article:', selectedArticle.name);
    } else {
      console.log('🎯 Will create new article');
    }

    // CRITICAL FIX: Process current item and continue to next
    return this.processCurrentItemAndContinue(pendingAction, selectedArticle);
  }

  private async handleSkipOption(
    pendingAction: PendingAction | MultiItemPendingAction, 
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('⏭️ Processing skip for action:', pendingAction);
  
    // Handle multi-item sequential skip
    if (isMultiItemPendingAction(pendingAction)) {
      return this.handleSequentialSkip(pendingAction, selectedOption);
    }
  
    // Handle regular single-item skip
    const itemName = pendingAction.itemName;
    let message = `⏭️ "${itemName}" übersprungen`;
    
    if (selectedOption.skipReason) {
      message += ` (${selectedOption.skipReason})`;
    }
    
    return {
      success: true,
      message: message
    };
  }
  
  private async handleSequentialSkip(
    action: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('⏭️ Handling sequential skip for item:', action.items[action.currentItemIndex]);
    
    const currentItem = action.items[action.currentItemIndex];
    
    // CRITICAL FIX: Add current item to processed items as skipped
    const skippedItem: ProcessedItem = {
      item: currentItem,
      skipped: true,
      skipReason: selectedOption.skipReason || 'Übersprungen',
      originalText: currentItem.itemName
    };
    
    action.processedItems.push(skippedItem);
    console.log(`⏭️ Skipped "${currentItem.itemName}", total processed:`, action.processedItems.length);
  
    // Move to next item
    action.currentItemIndex++;
    console.log(`⏭️ Moving to next item: ${action.currentItemIndex + 1}/${action.items.length}`);
    
    // CRITICAL FIX: Continue processing with next item
    return this.processMultiItemSequentially(action);
  }

  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const lists = await this.dataService.getLists().pipe(
        take(1),
        timeout(5000)
      ).toPromise();
      
      const targetList = lists?.find(list => list.id === listId);
  
      if (!targetList) {
        return {
          success: false,
          message: '❌ Ausgewählte Liste nicht gefunden.'
        };
      }
  
      const articleData = pendingAction.articleToAdd!;
  
      // Handle multiple articles
      const multipleArticleIds = (pendingAction as any).multipleArticleIds;
      if (multipleArticleIds && Array.isArray(multipleArticleIds)) {
        const updatedArticleIds = [...targetList.articleIds];
        const updatedItemStates = { ...targetList.itemStates };
        
        for (const articleId of multipleArticleIds) {
          if (!updatedArticleIds.includes(articleId)) {
            updatedArticleIds.push(articleId);
          }
          
          updatedItemStates[articleId] = {
            articleId: articleId,
            isChecked: false,
            amount: ''
          };
        }
  
        // CRITICAL FIX: Add timeout and proper error handling
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).pipe(
          take(1),
          timeout(5000)
        ).toPromise();
  
        if (updateResult) {
          const processedItems = (pendingAction as any).processedItems || [];
          const itemSummary = processedItems
            .map((p: any) => `"${p.item?.itemName || p.originalText}"${p.item?.quantity ? ` (${p.item.quantity})` : ''}`)
            .join(', ');
  
          return {
            success: true,
            message: `✅ ${multipleArticleIds.length} Artikel zur Liste "${targetList.name}" hinzugefügt:\n${itemSummary}`,
            listId: targetList.id
          };
        } else {
          return {
            success: false,
            message: '❌ Fehler beim Hinzufügen der Artikel zur Liste.'
          };
        }
      }
  
      // Single article handling
      let articleId = articleData.id;
      if (!articleId) {
        const newArticle = await this.dataService.createArticle({
          name: articleData.name,
          amount: articleData.amount || '',
          departmentId: articleData.departmentId || 'miscellaneous',
          icon: articleData.icon || '📦'
        }).pipe(
          take(1),
          timeout(5000)
        ).toPromise();
        
        if (!newArticle) {
          return {
            success: false,
            message: '❌ Fehler beim Erstellen des Artikels.'
          };
        }
        articleId = newArticle.id;
      }
  
      // Add article to selected list
      const updatedArticleIds = [...targetList.articleIds];
      if (!updatedArticleIds.includes(articleId)) {
        updatedArticleIds.push(articleId);
      }
  
      const updatedItemStates = { ...targetList.itemStates };
      updatedItemStates[articleId] = {
        articleId: articleId,
        isChecked: false,
        amount: articleData.amount || ''
      };
  
      // CRITICAL FIX: Add timeout and proper error handling
      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).pipe(
        take(1),
        timeout(5000)
      ).toPromise();
  
      if (updateResult) {
        return {
          success: true,
          message: `✅ "${articleData.name}"${articleData.amount ? ` (${articleData.amount})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      } else {
        return {
          success: false,
          message: '❌ Fehler beim Hinzufügen zur ausgewählten Liste.'
        };
      }
  
    } catch (error) {
      console.error('List selection error:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen zur Liste: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      if (!lists) return [];

      return lists.map(list => ({
        id: list.id,
        name: list.name,
        color: list.color || '#1a9edb',
        icon: list.icon || '🛒',
        itemCount: list.articleIds?.length || 0
      }));
    } catch (error) {
      console.error('Error getting list selection options:', error);
      return [];
    }
  }

  convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return listOptions.map(list => ({
      id: `list_${list.id}`,
      displayName: list.name,
      type: 'existing' as const,
      confidence: 1.0,
      department: `${list.itemCount} ${list.itemCount === 1 ? 'Artikel' : 'Artikel'}`,
      icon: list.icon
    }));
  }

  private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    
    console.log('🎯 DEBUGGING executeActionWithArticle:', {
      actionListName: action.listName,
      conversationListId: (action as any).conversationListId,
      actionType: action.type
    });
    
    try {
      let targetListName = action.listName;
      let targetListId: string | undefined;
      
      // CRITICAL FIX: Check conversation list ID from pending action
      if ((action as any).conversationListId) {
        targetListId = (action as any).conversationListId;
        console.log('🎯 Using conversation list ID from pending action:', targetListId);
        
        // Find list by ID to get the name
        const lists = await this.dataService.getLists().pipe(
          take(1),
          timeout(5000)
        ).toPromise();
        const conversationList = lists?.find(list => list.id === targetListId);
        if (conversationList) {
          targetListName = conversationList.name;
          console.log('🎯 Found conversation list by ID:', targetListName);
        }
      }
      
      // FALLBACK: If still no target list, try to get from conversation context
      if (!targetListName && !targetListId) {
        console.log('🎯 No target list found in action, checking conversation context...');
        
        try {
          const lists = await this.dataService.getLists().pipe(
            take(1),
            timeout(5000)
          ).toPromise();
          if (lists && lists.length === 1) {
            // Only one list available - use it as fallback
            targetListName = lists[0].name;
            targetListId = lists[0].id;
            console.log('🎯 Using only available list as fallback:', targetListName);
          }
        } catch (error) {
          console.error('🎯 Error getting fallback list:', error);
        }
      }
      
      if (targetListName) {
        let targetList: any;
        
        // Try to find by ID first, then by name
        if (targetListId) {
          const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
          targetList = lists?.find(list => list.id === targetListId);
          console.log('🎯 Found target list by ID:', targetList?.name);
        }
        
        if (!targetList) {
          targetList = await this.findListByName(targetListName);
          console.log('🎯 Found target list by name:', targetList?.name);
        }
        
        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${targetListName}" nicht gefunden.`
          };
        }
        
        // Add existing article to the list
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(article.id)) {
          updatedArticleIds.push(article.id);
        }
  
        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[article.id] = {
          articleId: article.id,
          isChecked: false, // ACTIVE state
          amount: action.extractedQuantity || article.amount || ''
        };
  
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).pipe(
          timeout(5000) // CRITICAL: Add timeout
        ).toPromise();
        
        if (updateResult) {
          const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
          
          // CRITICAL FIX: Return conversation context to maintain the flow
          const conversationContext = {
            lastAction: {
              type: 'article_added' as const,
              listId: targetList.id,
              listName: targetList.name,
              articleName: article.name,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: targetList.id,
              listName: targetList.name,
              prompt: 'Conversation mode maintained'
            }
          };
          
          return {
            success: true,
            message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id,
            conversationContext: conversationContext,
            followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
          };
        } else {
          return {
            success: false,
            message: `❌ Fehler beim Hinzufügen von "${article.name}" zur Liste "${targetList.name}".`
          };
        }
        
      } else {
        // No target list - ask for selection
        const listOptions = await this.getListSelectionOptions();
        
        if (listOptions.length === 0) {
          return {
            success: false,
            message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
          };
        }
  
        if (listOptions.length === 1) {
          // Use the only available list
          const singleList = listOptions[0];
          const targetList = await this.findListByName(singleList.name);
          
          if (targetList) {
            const updatedArticleIds = [...targetList.articleIds];
            if (!updatedArticleIds.includes(article.id)) {
              updatedArticleIds.push(article.id);
            }
  
            const updatedItemStates = { ...targetList.itemStates };
            updatedItemStates[article.id] = {
              articleId: article.id,
              isChecked: false,
              amount: action.extractedQuantity || article.amount || ''
            };
  
            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
              
              // CRITICAL FIX: Return conversation context for single list case too
              const conversationContext = {
                lastAction: {
                  type: 'article_added' as const,
                  listId: targetList.id,
                  listName: targetList.name,
                  articleName: article.name,
                  timestamp: new Date()
                },
                waitingForArticles: {
                  listId: targetList.id,
                  listName: targetList.name,
                  prompt: 'Conversation mode maintained'
                }
              };
              
              return {
                success: true,
                message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
                listId: targetList.id,
                conversationContext: conversationContext,
                followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
              };
            }
          }
        }
  
        // Multiple lists - ask user to choose
        const listSelectionAction: PendingAction = {
          type: 'select_list',
          originalInput: action.originalInput,
          itemName: article.name,
          extractedQuantity: action.extractedQuantity,
          listName: undefined,
          suggestedDepartment: action.suggestedDepartment,
          articleToAdd: {
            id: article.id,
            name: article.name,
            amount: action.extractedQuantity || article.amount || '',
            departmentId: article.departmentId || 'miscellaneous',
            icon: article.icon || '📦'
          }
        };
  
        const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
        return {
          success: true,
          message: `🎯 Zu welcher Liste soll "${article.name}"${quantityText} hinzugefügt werden?`,
          needsUserInput: true,
          disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
          pendingAction: listSelectionAction
        };
      }
      
    } catch (error) {
      console.error('🎯 Error executing action with existing article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${article.name}".`
      };
    }
  }

  private async executeActionWithNewArticle(pendingAction: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 EXECUTING ACTION WITH NEW ARTICLE:', pendingAction);
    
    try {
      // Create new article with enhanced suggestions
      const articleData = {
        name: pendingAction.itemName,
        amount: pendingAction.extractedQuantity || '',
        departmentId: pendingAction.suggestedDepartment || this.suggestDepartment(pendingAction.itemName),
        icon: this.suggestIcon(pendingAction.itemName)
      };
      
      console.log('🎯 Creating new article with enhanced suggestions:', articleData);
      
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      
      if (!newArticle) {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
        };
      }
      
      console.log('✅ Created new article:', newArticle);
      
      // CRITICAL FIX: Handle target list with conversation context
      let targetListName = pendingAction.listName;
      let targetListId: string | undefined;
      
      // Check conversation list ID from pending action
      if ((pendingAction as any).conversationListId) {
        targetListId = (pendingAction as any).conversationListId;
        console.log('🎯 Using conversation list ID from pending action:', targetListId);
        
        // Find list by ID to get the name
        const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
        const conversationList = lists?.find(list => list.id === targetListId);
        if (conversationList) {
          targetListName = conversationList.name;
          console.log('🎯 Found conversation list by ID:', targetListName);
        }
      }
      
      // Add to list if specified or found through conversation context
      if (targetListName) {
        let targetList: any;
        
        // Try to find by ID first, then by name
        if (targetListId) {
          const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
          targetList = lists?.find(list => list.id === targetListId);
          console.log('🎯 Found target list by ID:', targetList?.name);
        }
        
        if (!targetList) {
          targetList = await this.findListByName(targetListName);
          console.log('🎯 Found target list by name:', targetList?.name);
        }
        
        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${targetListName}" nicht gefunden.`
          };
        }
        
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(newArticle.id)) {
          updatedArticleIds.push(newArticle.id);
        }
  
        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[newArticle.id] = {
          articleId: newArticle.id,
          isChecked: false,
          amount: pendingAction.extractedQuantity || ''
        };
  
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (updateResult) {
          const quantityText = pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : '';
          
          // CRITICAL FIX: Return conversation context to maintain the flow
          const conversationContext = {
            lastAction: {
              type: 'article_added' as const,
              listId: targetList.id,
              listName: targetList.name,
              articleName: newArticle.name,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: targetList.id,
              listName: targetList.name,
              prompt: 'Conversation mode maintained'
            }
          };
          
          return {
            success: true,
            message: `✅ "${newArticle.name}"${quantityText} wurde erstellt und zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id,
            conversationContext: conversationContext,
            followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
          };
        } else {
          return {
            success: false,
            message: `❌ Fehler beim Hinzufügen von "${newArticle.name}" zur Liste "${targetList.name}".`
          };
        }
        
      } else {
        // No target list - ask for selection
        const listOptions = await this.getListSelectionOptions();
        
        if (listOptions.length === 0) {
          return {
            success: false,
            message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
          };
        }
  
        if (listOptions.length === 1) {
          // Use the only available list
          const singleList = listOptions[0];
          const targetList = await this.findListByName(singleList.name);
          
          if (targetList) {
            const updatedArticleIds = [...targetList.articleIds];
            if (!updatedArticleIds.includes(newArticle.id)) {
              updatedArticleIds.push(newArticle.id);
            }
  
            const updatedItemStates = { ...targetList.itemStates };
            updatedItemStates[newArticle.id] = {
              articleId: newArticle.id,
              isChecked: false,
              amount: pendingAction.extractedQuantity || ''
            };
  
            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              const quantityText = pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : '';
              
              // CRITICAL FIX: Return conversation context for single list case too
              const conversationContext = {
                lastAction: {
                  type: 'article_added' as const,
                  listId: targetList.id,
                  listName: targetList.name,
                  articleName: newArticle.name,
                  timestamp: new Date()
                },
                waitingForArticles: {
                  listId: targetList.id,
                  listName: targetList.name,
                  prompt: 'Conversation mode maintained'
                }
              };
              
              return {
                success: true,
                message: `✅ "${newArticle.name}"${quantityText} wurde erstellt und zur Liste "${targetList.name}" hinzugefügt.`,
                listId: targetList.id,
                conversationContext: conversationContext,
                followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
              };
            }
          }
        }
  
        // Multiple lists - ask user to choose
        const listSelectionAction: PendingAction = {
          type: 'select_list',
          originalInput: pendingAction.originalInput,
          itemName: newArticle.name,
          extractedQuantity: pendingAction.extractedQuantity,
          listName: undefined,
          suggestedDepartment: pendingAction.suggestedDepartment,
          articleToAdd: {
            id: newArticle.id,
            name: newArticle.name,
            amount: pendingAction.extractedQuantity || '',
            departmentId: newArticle.departmentId || 'miscellaneous',
            icon: newArticle.icon || '📦'
          }
        };
  
        const quantityText = pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : '';
        return {
          success: true,
          message: `🎯 Artikel "${newArticle.name}" wurde erstellt.\n\nZu welcher Liste soll er${quantityText} hinzugefügt werden?`,
          needsUserInput: true,
          disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
          pendingAction: listSelectionAction
        };
      }
      
    } catch (error) {
      console.error('🎯 Error executing action with new article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
      };
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      // CRITICAL FIX: Add timeout to prevent hanging
      const lists = await this.dataService.getLists().pipe(
        take(1),
        timeout(5000) // 5 second timeout
      ).toPromise();
      
      if (!lists) return null;
      
      const normalizedQuery = listName.toLowerCase().trim();
      
      // Exact match first
      let match = lists.find(list => 
        list.name.toLowerCase() === normalizedQuery
      );
      
      if (match) return match;
      
      // Partial match
      match = lists.find(list => 
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );
      
      return match || null;
    } catch (error) {
      console.error('Error finding list by name:', error);
      return null;
    }
  }

  async handleListSelectionForMultiItems(
    pendingAction: PendingAction | MultiItemPendingAction,  // FIX: Accept both types
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const lists = await this.dataService.getLists().pipe(take(1), timeout(5000)).toPromise();
      const targetList = lists?.find(list => list.id === listId);
  
      if (!targetList) {
        return { success: false, message: '❌ Ausgewählte Liste nicht gefunden.' };
      }
  
      const multiItemData = (pendingAction as any).multiItemData;
      if (!multiItemData || !multiItemData.items) {
        return { success: false, message: '❌ Fehler: Multi-Item Daten nicht gefunden.' };
      }
  
      const multiAction: any = {
        type: multiItemData.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
        originalInput: multiItemData.originalInput,
        itemName: multiItemData.items[0]?.itemName || '',
        extractedQuantity: multiItemData.items[0]?.quantity || '',
        items: multiItemData.items,
        listName: targetList.name,
        currentItemIndex: 0,
        processedItems: [],
        suggestedDepartment: this.suggestDepartment(multiItemData.items[0]?.itemName || ''),
        conversationListId: targetList.id,
        confirmedTargetListId: targetList.id,
        confirmedTargetListName: targetList.name
      };
  
      return this.processMultiItemSequentially(multiAction);
    } catch (error) {
      return {
        success: false,
        message: `❌ Fehler bei der Listenauswahl: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }
  
  private async findListById(listId: string): Promise<any> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1), timeout(5000)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      return null;
    }
  }

}