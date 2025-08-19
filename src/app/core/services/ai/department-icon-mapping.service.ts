// src/app/core/services/ai/department-icon-mapping.service.ts
import { Injectable } from '@angular/core';

interface DepartmentKeywords {
  [departmentId: string]: string[];
}

interface IconKeywords {
  [icon: string]: string[];
}

@Injectable({
  providedIn: 'root'
})
export class DepartmentIconMappingService {

  private readonly departmentKeywords: DepartmentKeywords = {
    'fruit-vegetables': [
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
    ],
    'dairy-products': [
      'milch', 'butter', 'sahne', 'schlagsahne', 'saure sahne', 'schmand', 'crème fraîche',
      'joghurt', 'jogurt', 'skyr', 'quark', 'magerquark', 'frischkäse', 'hüttenkäse',
      'ricotta', 'mascarpone', 'mozzarella', 'feta', 'ziegenkäse', 'schafskäse',
      'buttermilch', 'kondensmilch', 'sahnejoghurt', 'naturjoghurt', 'griechischer joghurt',
      'kefir', 'ayran', 'dickmilch', 'sauermilch'
    ],
    'sausage-cheese-counter': [
      'käse', 'gouda', 'emmentaler', 'edamer', 'cheddar', 'parmesan', 'pecorino',
      'gorgonzola', 'roquefort', 'camembert', 'brie', 'tilsiter', 'limburger',
      'wurst', 'salami', 'schinken', 'speck', 'leberwurst', 'mettwurst', 'bratwurst',
      'wiener', 'frankfurter', 'bockwurst', 'weißwurst', 'blutwurst', 'teewurst',
      'mortadella', 'chorizo', 'serrano', 'prosciutto', 'coppa', 'pancetta',
      'bergkäse', 'alpenkäse', 'hartkäse', 'weichkäse', 'schnittkäse'
    ],
    'fridge-meat': [
      'fleisch', 'rind', 'rindfleisch', 'schwein', 'schweinefleisch', 'hähnchen', 'hühnchen',
      'pute', 'putenfleisch', 'truthahn', 'lamm', 'lammfleisch', 'kalb', 'kalbfleisch',
      'hackfleisch', 'hack', 'mett', 'tartar', 'schnitzel', 'steak', 'filet', 'gulasch',
      'braten', 'kotelett', 'rippchen', 'spare ribs', 'entenbrust', 'gänsebrust',
      'wild', 'hirsch', 'reh', 'wildschwein', 'kaninchen', 'hase'
    ],
    'fish': [
      'fisch', 'lachs', 'forelle', 'thunfisch', 'kabeljau', 'seelachs', 'pangasius',
      'scholle', 'zander', 'hecht', 'karpfen', 'makrele', 'hering', 'sardine',
      'garnele', 'garnelen', 'shrimp', 'scampi', 'muschel', 'muscheln', 'tintenfisch',
      'oktopus', 'krake', 'krebs', 'hummer', 'languste', 'krabben', 'meeresfrüchte',
      'räucherlachs', 'geräucherter lachs', 'matjes', 'rollmops'
    ],
    'bread': [
      'brot', 'brötchen', 'semmel', 'baguette', 'ciabatta', 'vollkornbrot', 'weißbrot',
      'schwarzbrot', 'roggenbrot', 'dinkelbre', 'mehrkornbrot', 'toast', 'toastbrot',
      'bagel', 'pumpernickel', 'knäckebrot', 'fladenbrot', 'pita', 'naan',
      'brezel', 'laugenbrezeln', 'croissant', 'hörnchen'
    ],
    'noodles-rice': [
      'nudeln', 'pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'rigatoni',
      'linguine', 'fettuccine', 'lasagne', 'gnocchi', 'ravioli', 'tortellini',
      'reis', 'basmati', 'jasmin reis', 'risotto', 'arborio', 'wildreis', 'naturreis',
      'parboiled', 'sushi reis', 'milchreis', 'quinoa', 'bulgur', 'couscous',
      'spätzle', 'schupfnudeln', 'maultaschen'
    ],
    'tins-jars': [
      'bohnen', 'kidneybohnen', 'weiße bohnen', 'schwarze bohnen', 'kichererbsen',
      'linsen', 'mais', 'zuckermais', 'erbsen', 'karotten konserve', 'tomaten dose',
      'passierte tomaten', 'geschälte tomaten', 'tomatenmark', 'tomatensauce',
      'oliven', 'kapern', 'cornichons', 'gewürzgurken', 'essiggurken', 'sauerkraut',
      'rotkraut', 'marmelade', 'konfitüre', 'honig', 'nutella', 'erdnussbutter',
      'senf', 'ketchup', 'mayo', 'mayonnaise', 'barbecue sauce', 'worcester',
      'thunfisch dose', 'sardinen', 'anchonis'
    ],
    'spices-oils': [
      'salz', 'pfeffer', 'paprika pulver', 'curry', 'kurkuma', 'kümmel', 'kreuzkümmel',
      'koriander', 'zimt', 'muskat', 'nelken', 'lorbeer', 'thymian', 'rosmarin',
      'oregano', 'majoran', 'estragon', 'salbei', 'bohnenkraut', 'kerbel',
      'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'sesamöl', 'kokosöl', 'erdnussöl',
      'essig', 'balsamico', 'weißweinessig', 'rotweinessig', 'apfelessig',
      'vanille', 'vanillezucker', 'backpulver', 'natron', 'hefe', 'trockenhefe'
    ],
    'beverages-alcohol': [
      'wasser', 'sprudel', 'mineralwasser', 'limonade', 'cola', 'fanta', 'sprite',
      'saft', 'orangensaft', 'apfelsaft', 'traubensaft', 'cranberrysaft',
      'bier', 'weißbier', 'pils', 'weizen', 'radler', 'wein', 'rotwein', 'weißwein',
      'rosé', 'sekt', 'champagner', 'prosecco', 'schnaps', 'vodka', 'gin', 'rum',
      'whiskey', 'cognac', 'likör', 'aperitif', 'kaffee', 'espresso', 'cappuccino',
      'tee', 'grüner tee', 'schwarzer tee', 'früchtetee', 'kräutertee', 'energy drink',
      'isotonisch', 'smoothie'
    ],
    'frozen-goods': [
      'tiefkühl', 'gefror', 'eis', 'eiscreme', 'sorbet', 'frozen', 'tk-',
      'tiefkühlpizza', 'tiefkühlgemüse', 'tiefkühlfisch', 'fish sticks',
      'pommes', 'kroketten', 'chicken nuggets', 'frühlingsrollen'
    ],
    'pastries': [
      'kuchen', 'torte', 'muffin', 'keks', 'plätzchen', 'cookie', 'stollen',
      'lebkuchen', 'donut', 'berliner', 'hefezopf', 'streuselkuchen'
    ],
    'sweet-salty': [
      'süß', 'schokolade', 'gummibär', 'bonbon', 'lutscher', 'chips', 'snack',
      'nüsse', 'erdnüsse', 'mandeln', 'cashew', 'haselnüsse', 'walnüsse',
      'salzstangen', 'cracker', 'reiswaffeln', 'müsliriegel', 'energieriegel'
    ],
    'household-goods': [
      'klopapier', 'toilettenpapier', 'küchenrolle', 'zewa', 'tempo', 'serviette',
      'müllbeutel', 'gefrierbeutel', 'frischhaltefolie', 'alufolie', 'backpapier',
      'staubsauger', 'batterien', 'glühbirne', 'kerzen'
    ],
    'body-care': [
      'shampoo', 'duschgel', 'seife', 'zahnbürste', 'zahnpasta', 'mundspülung',
      'deo', 'deodorant', 'parfum', 'creme', 'bodylotion', 'sonnencreme',
      'rasierer', 'rasierschaum', 'aftershave', 'damenhygiene', 'binden'
    ],
    'cleaning-agents': [
      'spülmittel', 'waschmittel', 'weichspüler', 'allzweckreiniger', 'badreiniger',
      'wc reiniger', 'glasreiniger', 'entkalker', 'scheuermilch', 'schwamm'
    ],
    'breakfast': [
      'müsli', 'cornflakes', 'haferflocken', 'porridge', 'ei', 'eier',
      'spiegelei', 'rührei', 'omelett', 'frühstück'
    ],
    'international': [
      'sushi', 'wasabi', 'sojasauce', 'teriyaki', 'miso', 'ramen', 'udon',
      'kimchi', 'sriracha', 'fish sauce', 'oyster sauce', 'tacos', 'tortilla',
      'salsa', 'guacamole', 'jalapenos', 'hummus', 'tahini', 'harissa',
      'couscous', 'baklava', 'falafel', 'tzatziki', 'gyros', 'paella'
    ],
    'pet-supplies': [
      'hundefutter', 'katzenfutter', 'tierfutter', 'leckerli', 'katzenstreu',
      'vogelfutter', 'fischfutter'
    ],
    'baby': [
      'windel', 'babybrei', 'babymilch', 'schnuller', 'babycreme', 'feuchttücher'
    ],
    'medicine': [
      'aspirin', 'ibuprofen', 'paracetamol', 'hustensaft', 'nasenspray',
      'tabletten', 'medikament', 'arznei', 'tropfen', 'salbe'
    ]
  };

  private readonly iconKeywords: IconKeywords = {
    // Beverages first (highest priority)
    '🍾': ['sekt', 'champagner', 'prosecco'],
    '🍺': ['bier'],
    '🍷': ['wein'],
    '🥃': ['whiskey', 'vodka', 'gin', 'rum'],
    '☕': ['kaffee', 'espresso'],
    '🍵': ['tee'],
    '💧': ['wasser', 'sprudel', 'mineralwasser'],
    '🧃': ['saft', 'orangensaft', 'apfelsaft'],
    '🥤': ['cola', 'limonade', 'fanta', 'sprite'],
    '🥛': ['milch'],
    
    // Fruits & Vegetables
    '🥒': ['gurke'],
    '🍅': ['tomate'],
    '🥕': ['karotte', 'möhre'],
    '🧅': ['zwiebel'],
    '🧄': ['knoblauch'],
    '🌶️': ['paprika', 'chili', 'pfeffer'],
    '🥗': ['salat'],
    '🥬': ['spinat'],
    '🥦': ['brokkoli'],
    '🥔': ['kartoffel'],
    '🍄': ['pilz', 'champignon'],
    '🥑': ['avocado'],
    '🌽': ['mais'],
    '🍆': ['aubergine'],
    '🍎': ['apfel', 'äpfel'],
    '🍌': ['banane'],
    '🍊': ['orange'],
    '🍋': ['zitrone'],
    '🍓': ['erdbeere'],
    '🍇': ['traube'],
    '🍒': ['kirsche'],
    '🍑': ['pfirsich'],
    '🍍': ['ananas'],
    '🥭': ['mango'],
    '🥝': ['kiwi'],
    '🍉': ['melone'],
    
    // Dairy & Eggs
    '🧈': ['butter'],
    '🧀': ['käse'],
    '🥚': ['ei'],
    
    // Meat & Fish
    '🥩': ['fleisch', 'steak', 'schnitzel'],
    '🍗': ['hähnchen', 'hühnchen', 'chicken'],
    '🥓': ['speck', 'bacon'],
    '🌭': ['wurst', 'salami'],
    '🍖': ['schinken'],
    '🐟': ['fisch', 'lachs'],
    '🦐': ['garnele', 'shrimp'],
    
    // Bread & Baked goods
    '🍞': ['brot'],
    '🥖': ['brötchen', 'semmel'],
    '🥐': ['croissant'],
    '🥯': ['bagel'],
    '🥨': ['brezel'],
    '🍰': ['kuchen', 'torte'],
    '🧁': ['muffin'],
    '🍩': ['donut'],
    '🍪': ['keks', 'cookie'],
    
    // Noodles & Rice
    '🍝': ['nudeln', 'pasta', 'spaghetti'],
    '🍚': ['reis'],
    '🍜': ['ramen'],
    
    // Sweets & Snacks
    '🍫': ['schokolade'],
    '🍬': ['bonbon', 'süßigkeit'],
    '🐻': ['gummibär'],
    '🍦': ['eis'],
    '🍟': ['chips'],
    '🥜': ['nuss', 'nüsse'],
    '🍿': ['popcorn'],
    
    // Spices & Condiments
    '🧂': ['salz'],
    '🫒': ['öl'],
    '🍯': ['honig'],
    
    // Household & Care
    '🧻': ['klopapier', 'toilettenpapier'],
    '🧼': ['seife'],
    '🪥': ['zahnbürste'],
    '🧴': ['shampoo', 'duschgel'],
    '🕯️': ['kerze'],
    '🔋': ['batterie'],
    '👶': ['windel'],
    '🐕': ['hundefutter', 'katzenfutter']
  };

  /**
   * Suggests the most appropriate department for an item
   */
  suggestDepartment(itemName: string): string {
    const lowerName = itemName.toLowerCase().trim();
    
    for (const [departmentId, keywords] of Object.entries(this.departmentKeywords)) {
      if (keywords.some(keyword => lowerName.includes(keyword) || keyword.includes(lowerName))) {
        return departmentId;
      }
    }
    
    return 'miscellaneous';
  }

  /**
   * Suggests the most appropriate icon for an item
   */
  suggestIcon(itemName: string): string {
    const lowerName = itemName.toLowerCase().trim();
    
    for (const [icon, keywords] of Object.entries(this.iconKeywords)) {
      if (keywords.some(keyword => lowerName.includes(keyword))) {
        return icon;
      }
    }
    
    return '📦';
  }

  /**
   * Gets all available department IDs
   */
  getAllDepartmentIds(): string[] {
    return Object.keys(this.departmentKeywords);
  }

  /**
   * Gets keywords for a specific department
   */
  getDepartmentKeywords(departmentId: string): string[] {
    return this.departmentKeywords[departmentId] || [];
  }

  /**
   * Adds new keywords to a department (for customization)
   */
  addDepartmentKeywords(departmentId: string, keywords: string[]): void {
    if (!this.departmentKeywords[departmentId]) {
      this.departmentKeywords[departmentId] = [];
    }
    this.departmentKeywords[departmentId].push(...keywords);
  }

  /**
   * Gets all available icons
   */
  getAllIcons(): string[] {
    return Object.keys(this.iconKeywords);
  }
}