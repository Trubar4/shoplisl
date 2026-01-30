// src/app/core/services/list-upload.service.ts
import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';
import { Article, ShoppingList } from '../models';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class ListUploadService {
  private firestore: any;
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';

  constructor(private logger: LoggerService) {
    // Initialize Firebase directly (same as other services)
    const firebaseConfig = {
      projectId: 'shoplisl',
      apiKey: 'AIzaSyADgZN2cKD43ABoVmaCX3UfCbmkcrbYslg',
      authDomain: 'shoplisl.firebaseapp.com',
      storageBucket: 'shoplisl.appspot.com', 
      messagingSenderId: '238499687274',
      appId: '1:238499687274:web:c54bad5031d5531be8d313'
    };

    try {
      const app = initializeApp(firebaseConfig);
      this.firestore = getFirestore(app);
      this.logger.debug('upload', '✅ ListUploadService: Firebase initialized successfully');
    } catch (error) {
      this.logger.error('upload', '❌ ListUploadService: Firebase initialization failed:', error);
      throw error;
    }
  }

  async createSparListWithArticles(): Promise<void> {
    const articleNames = [
      'Ahornsirup', 'Amertini Soft', 'Antipasti', 'Anzünder', 'Äpfel', 'Artischocke', 'Aubergine', 'Auberginen', 'Avocado', 'Bananen', 'Bananen reif', 'Basilikum', 'Bergkäse gerieben', 'Bio Zitronen', 'Birne', 'Blumen', 'Bohnen', 'Bresaola', 'Briketts', 'Brot', 'Brot, Toast', 'Brot?', 'Brotchen', 'Brötchen', 'Buns', 'Buns 3x', 'Burrata 4x', 'Butter', 'Butter Meersalz', 'Butter weich', 'Ca 2.400g Rahm', 'Ca 3000g Huhn geschnitten', 'Camembert/Brie', 'Cantucini', 'Cheddar', 'Cheddar 3x', 'Chorizo', 'Cola', 'Cotto/5-10dag', 'Creme fraiche', 'Creme fraiche 2x', 'Creme friache', 'Crudo/Bresaola', 'Currypulver', 'Datteln steinlos', 'Eis diverse', 'Eis für Kinder', 'Eiswaffeln', 'Erbsen', 'Erdbeeren', 'Erdnuss Öl', 'Essigreiniger 2x', 'Fertig Salat', 'Feta', 'Filet', 'Fischstäbchen', 'Flammkuchenteig', 'Fleisch Rind oder Schwein', 'Fohren Weizen Radler alkoholfrei', 'Frühlingszwiebel', 'Gemüse?', 'Gestückelte Tomaten', 'Ginger Beer', 'Gorgo', 'Gorgonzola', 'Gouda', 'Grilled Zeugs', 'Grissini', 'Guinnes', 'Hackfleisch', 'Hackfleisch Rind', 'Hafer Drink 1-2x und Pfand', 'Haferdrink Tetra 1x', 'Haferflocken', 'Haloumni', 'Hefe', 'Honig', 'Huhn Geschnetzeltes ca. 0,5kg', 'Ingwer Shots', 'Ingwersaft?', 'Ingwershots', 'Joghurt Skyr Vegan', 'Kaki', 'Kapern', 'Karotten', 'Karotten kleiner Pack', 'Kartoffeln', 'Kartoffeln feste', 'Kartoffelnpüree fertig', 'Käse', 'Kichererbsen', 'Kindereis?', 'Kiwi', 'Klopapier', 'Knoblauch', 'Kohl', 'Kohl?', 'Kokosmilch', 'Kokosraspel', 'Kräuter Saitlinge', 'Kräuterbaguette', 'Kräuterbutter Baguette', 'Krautsalat', 'Kroketten', 'Kuchenmehl', 'Küchenrolle', 'Laugenbrötle', 'Lepinja', 'Limette', 'Limetten', 'Limo', 'Linsen', 'Löffelbiskuit', 'Mandarinen', 'Mandelblöttchen', 'Martini', 'Mascarpone', 'Mayo', 'Mayonnaise', 'Mediterrane Tonic', 'Melone', 'Milch', 'Mini Magnum', 'Mortadella', 'Mozzarella', 'Mozzi gerieben', 'Mozzi gerieben', 'Mozzibällchen', 'Nachos', 'Nachos 2x', 'Non Stick Spray', 'Nussmix', 'Obs', 'Obst', 'Obst (Bananen)', 'Oliven Cracker', 'Oliven schwarz', 'Olivenöl', 'Orange', 'Parmesan', 'Petersilie', 'Pfeffermühle klein', 'Pinsa', 'Pistazien', 'Pizzateig', 'Pomito', 'Preiselbeeren', 'Preiselbeeren Marmelade', 'Pudding vegan 3x', 'Pulled Pork', 'Raclette', 'Raclette 2x Natur, 1x Pfeffer', 'Raclette Käse', 'Rahm', 'Rahm 4x', 'Ricotta', 'Rind', 'Rinder-Bouillon', 'Rindsfilet', 'Rohschinkenscheiben', 'Rostbrat Würstle', 'Rotwein?', 'Rucola', 'Rucola/Basilikum', 'Rusticana', 'Salami', 'Salami', 'Salat gemischt', 'Salat gewaschen', 'Salz', 'Salzmühle', 'Sauce Holländisch', 'Sauerrahm', 'Sauerrahm 2x', 'Schinken', 'Schokolade', 'Schokostückchen 2-3x', 'Schübling', 'Schwämme', 'Schwein', 'Scudetto', 'Spargel', 'Spargel grün TK? Glas?', 'Speck', 'Speck/Prosciutto', 'Süßes', 'Süsskartoffeln', 'Süsskartoffelpommes', 'Tempeh Teryaki', 'Tischbombe oder ähnliches', 'TK Brokkoli', 'TK Himbeere', 'TK Himbeeren', 'TK Spargel grün', 'Toast', 'Tofu o Sojaschnetzel', 'Tomaten', 'Tomaten gestückelt', 'Tomaten Rustica', 'Tomatensoße?', 'Tomatensugo Glas', 'Tomatoes Klein', 'Tonic', 'Tonic Water', 'Tramezzini', 'Vanille', 'Vanille Eis', 'Vanille Extrakt', 'Vanilleeis', 'Vanillepudding', 'Vanillezucker', 'Waffles', 'Wienerle', 'Wienerle etc', 'Wirsing', 'Würstl', 'Ziegenfrischkäse', 'Zitrone', 'Zitronen', 'Zitronensaft', 'Zopf', 'Zucchini', 'Zucker braun', 'Zwiebel'
    ];

    await this.createListWithArticles('Spar', '🏪', '#f44336', articleNames);
  }

  async createSutterluettyListWithArticles(): Promise<void> {
    const articleNames = [
      'Absolute Vodka', 'Adventskalender oder Füllung?', 'Alkoholfreies Bier (Erdinger, Franziskaner, Fohren)', 'Antipasti', 'Anzünder Ofen', 'Äpfel', 'Avocado', 'Backpulver', 'Baileys', 'Basmati', 'Beeren für Mousse', 'Bergkäse gerieben 2x', 'Bio Rostbratwürstle kleine', 'Birne', 'Bohnen', 'Braune Linsen', 'Brauner Zucker', 'Brie', 'Brot', 'Brot Serbische', 'Burger Buns', 'Burrata', 'Butter', 'Butter 2x', 'Butter streichen', 'Cantuccini', 'Chiasamen (Bipa)', 'Chips für Samstags', 'Chorizo', 'Conny Erdveere', 'Cornflakes', 'Corny blaue Riegel', 'Creme fraiche', 'Datteln', 'Dessert', 'Dinkel Tetra 2', 'Dinkeldrink Tetra', 'Erdbeeren', 'Erdnussbutter', 'Fischstäbchen', 'Fladenbrot für Döner', 'Fondue', 'Garam Masal?', 'Geburtstag/Gutscheinkarte 2x', 'geräuchertes Paprikapulver', 'Geschirrspülersalz', 'Ginger Ale', 'Ginger Beer', 'Ginger Beer?', 'Grissini', 'Guinness', 'Gurke', 'Gurken', 'Haferdrink Flasche 1', 'Haferflocken', 'Haferjoghurt 1x', 'Halloween Süßes', 'Himbeer TK', 'Hotdog Brot', 'Huhn Filet Bio Wald', 'Ingwersaft', 'Ingwershot 2x', 'Kaffee?', 'Karotte 🥕', 'Kichererbsen', 'Kichererbsen?', 'Kidney Bohnen', 'Kiwi Beeren', 'Kiwibeeren', 'Kleine Bananen', 'Kleine Kaminwurzen', 'Knick Nacs wenn Angebot', 'Kokosmilch Alnatura 4x', 'Leinsamen', 'Limetten', 'Linsen', 'Linsen?', 'Maiskolben', 'Mandarinen', 'Marillen Marmelade', 'Marmelade Himbeer', 'Mascarpone', 'Mayo', 'Mayonnaise', 'Mehl', 'Melone 🍉', 'Milchreis', 'Mojito Soda/Limo', 'Mozzarella', 'Müllsäcke', 'Nacho\'s', 'Non Stick spray', 'Obst Birnen', 'Obst?', 'Oliven', 'Oliven Cracker', 'Olivenöl', 'Orangen Saft', 'Parmesan', 'passiert Tomaten 2x', 'Pesto?', 'Philadelphia 2-3', 'Pilze? Kühlregal', 'Pistazien', 'Pommes', 'Prosecco', 'Raclette Käse', 'Raclette Käse 2', 'Raclette Käse mit Pfeffer 2', 'Rahm', 'Rahmkäsle', 'Räuchertofu', 'Reis', 'Riegel Corny Schoko zuckerfrei', 'Rinder Bouillon', 'Risotto Reis Alnatura', 'Risotto Reis geg. Mexikanisch', 'Rucola', 'Salami', 'Salanetti', 'Schinken', 'Schokolade Guss', 'Schokolade Stücken 200g', 'Schwein Filet', 'Schweineschnitzel', 'Soletti', 'Soletti. Racker', 'Sonnenblumenhack Sonnenblumenkerne', 'Spargel grün', 'Speck', 'Suppennudeln', 'Süß Pommes', 'Süsskartoffel', 'Teig', 'Teres Major', 'Toast', 'Toblerone', 'Toffefee', 'Tomaten', 'Tomatensauce Billa Bio (https://shop.billa.at/produkte/billa-bio-sugo-kraeuter-00517710', 'Vanille Zucker', 'Vegan Pudding 5x', 'Wienerle', 'Zopf', 'Zucchini'
    ];

    await this.createListWithArticles('Sutterlütty', '🛍️', '#e91e63', articleNames);
  }

  private async createListWithArticles(
    listName: string, 
    listIcon: string, 
    listColor: string, 
    articleNames: string[]
  ): Promise<void> {
    this.logger.debug('upload', `🛒 Starting ${listName} list creation...`);
    this.logger.debug('upload', `📋 Processing ${articleNames.length} article names`);

    try {
      // Step 1: Get all existing articles from Firebase
      this.logger.debug('upload', '📦 Fetching existing articles...');
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      
      const existingArticles: Article[] = [];
      articlesSnapshot.forEach(doc => {
        const data = doc.data();
        existingArticles.push({
          id: doc.id,
          name: data['name'],
          amount: data['amount'],
          notes: data['notes'],
          icon: data['icon'],
          departmentId: data['departmentId'],
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          ownerId: data['ownerId'] || this.SHARED_USER_ID  // Phase 8: Include ownerId
        });
      });

      this.logger.debug('upload', `✅ Found ${existingArticles.length} existing articles`);

      // Step 2: Match article names with existing articles
      const matchedArticles: { articleId: string; name: string; originalName: string }[] = [];
      const unmatchedArticles: string[] = [];

      for (const originalName of articleNames) {
        const matchedArticle = this.findMatchingArticle(originalName, existingArticles);
        
        if (matchedArticle) {
          matchedArticles.push({
            articleId: matchedArticle.id,
            name: matchedArticle.name,
            originalName: originalName
          });
          this.logger.debug('upload', `✅ Matched: "${originalName}" → "${matchedArticle.name}"`);
        } else {
          unmatchedArticles.push(originalName);
          this.logger.debug('upload', `❌ No match found for: "${originalName}"`);
        }
      }

      // Step 3: Create the list
      this.logger.debug('upload', `${listIcon} Creating ${listName} list...`);
      const newList = {
        name: listName,
        color: listColor,
        icon: listIcon,
        shopId: '',
        articleIds: matchedArticles.map(m => m.articleId),
        itemStates: {} as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Step 4: Create item states (all checked/completed)
      matchedArticles.forEach(match => {
        newList.itemStates[match.articleId] = {
          articleId: match.articleId,
          isChecked: true, // Mark as completed (striked through)
          checkedAt: new Date()
        };
      });

      // Step 5: Upload the list to Firebase
      const listsCollection = collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`);
      const docRef = await addDoc(listsCollection, newList);

      // Step 6: Summary
      this.logger.debug('upload', `🎉 ${listName} list created successfully!`);
      this.logger.debug('upload', `📊 Summary:`);
      this.logger.debug('upload', `   📋 List ID: ${docRef.id}`);
      this.logger.debug('upload', `   ✅ Matched articles: ${matchedArticles.length}`);
      this.logger.debug('upload', `   ❌ Unmatched articles: ${unmatchedArticles.length}`);
      this.logger.debug('upload', `   ${listIcon} All articles marked as completed (striked through)`);

      if (unmatchedArticles.length > 0) {
        this.logger.debug('upload', '');
        this.logger.debug('upload', '❌ UNMATCHED ARTICLES:');
        unmatchedArticles.forEach(name => {
          this.logger.debug('upload', `   • ${name}`);
        });
        this.logger.debug('upload', '');
        this.logger.debug('upload', '💡 These articles were not found in your database. You may need to:');
        this.logger.debug('upload', '   1. Create them manually, or');
        this.logger.debug('upload', '   2. Check if they exist under different names');
      }

      if (matchedArticles.length > 0) {
        this.logger.debug('upload', '');
        this.logger.debug('upload', '✅ MATCHED ARTICLES:');
        matchedArticles.forEach(match => {
          if (match.originalName !== match.name) {
            this.logger.debug('upload', `   • "${match.originalName}" → "${match.name}"`);
          } else {
            this.logger.debug('upload', `   • ${match.name}`);
          }
        });
      }

    } catch (error) {
      this.logger.error('upload', `❌ Error creating ${listName} list:`, error);
      throw error;
    }
  }

  private findMatchingArticle(searchName: string, existingArticles: Article[]): Article | null {
    // Clean the search name
    const cleanedSearchName = this.cleanArticleName(searchName);
    
    // Strategy 1: Exact match
    let match = existingArticles.find(article => 
      article.name.toLowerCase() === cleanedSearchName.toLowerCase()
    );
    if (match) return match;

    // Strategy 2: Partial match (existing name contains search name or vice versa)
    match = existingArticles.find(article => {
      const articleName = article.name.toLowerCase();
      const searchLower = cleanedSearchName.toLowerCase();
      return articleName.includes(searchLower) || searchLower.includes(articleName);
    });
    if (match) return match;

    // Strategy 3: Fuzzy matches for common variations
    const fuzzyMatches = this.getFuzzyMatches();
    for (const [pattern, replacement] of fuzzyMatches) {
      if (pattern.test(cleanedSearchName.toLowerCase())) {
        match = existingArticles.find(article => 
          article.name.toLowerCase().includes(replacement.toLowerCase())
        );
        if (match) return match;
      }
    }

    // Strategy 4: Word-based matching (split by spaces and match significant words)
    const searchWords = cleanedSearchName.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    if (searchWords.length > 0) {
      match = existingArticles.find(article => {
        const articleWords = article.name.toLowerCase().split(/\s+/);
        return searchWords.some(searchWord => 
          articleWords.some(articleWord => 
            articleWord.includes(searchWord) || searchWord.includes(articleWord)
          )
        );
      });
      if (match) return match;
    }

    return null;
  }

  private cleanArticleName(name: string): string {
    return name
      .replace(/\?$/, '') // Remove trailing question marks
      .replace(/\s*\d+x\s*$/, '') // Remove quantity indicators like "2x", "3x"
      .replace(/\s*\d+\s*$/, '') // Remove trailing numbers
      .replace(/\s*ca\.\s*[\d.,]+\s*g?\s*/i, '') // Remove "ca. 2.400g" patterns
      .replace(/\s*und\s*pfand\s*$/i, '') // Remove "und Pfand"
      .replace(/\s*\/.*$/, '') // Remove everything after first slash
      .replace(/\s*\(.*?\)\s*/, ' ') // Remove content in parentheses
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  private getFuzzyMatches(): [RegExp, string][] {
    return [
      // Common variations from both lists
      [/^hackfleisch\s*rind/i, 'hackfleisch (100% rind)'],
      [/^hackfleisch$/i, 'hackfleisch (100% rind)'],
      [/^creme\s*friache/i, 'creme fraiche'],
      [/^cantucini/i, 'cantuccini'],
      [/^guinnes/i, 'guinness'],
      [/^haloumni/i, 'haloumi'],
      [/^kaki/i, 'kakis'],
      [/^lepinja/i, 'brot serbisch lepinja'],
      [/^mayo$/i, 'mayonnaise'],
      [/^limo$/i, 'limonade'],
      [/^obs$/i, 'obstbecher'],
      [/^nachos$/i, 'nacho\'s'],
      [/^salat\s*gemischt/i, 'salat fertig gemischt'],
      [/^tk\s*brokkoli/i, 'brokkoli'],
      [/^tk\s*himbeere/i, 'himbeer tk'],
      [/^vanilleeis/i, 'vanille eis'],
      [/^vanillepudding/i, 'pudding vegan'],
      [/^vanillezucker/i, 'vanille zucker'],
      [/^zitronen$/i, 'zitrone'],
      [/^süsskartoffelpommes/i, 'süßkartoffel pommes'],
      [/^sauce\s*holländisch/i, 'sauce hollandaise'],
      [/^rostbrat\s*würstle/i, 'rostbratwürstle kleine bio'],
      [/^huhn\s*geschnetzeltes/i, 'huhn geschnitten'],
      [/^haferdrink\s*tetra/i, 'hafer drink tetra'],
      [/^essigreiniger/i, 'essigreiniger'],
      [/^anzünder$/i, 'anzünder ofen'],
      [/^briketts$/i, 'briketts für oma'],
      [/^schwämme$/i, 'schwämme zum abwaschen'],
      [/^datteln\s*steinlos/i, 'datteln'],
      [/^mandelblöttchen/i, 'mandelblättchen'],
      [/^preiselbeeren\s*marmelade/i, 'preiselbeer marmelade'],
      [/^spargel\s*grün/i, 'spargel grün'],
      [/^wienerle\s*etc/i, 'wienerle'],
      [/^würstl$/i, 'wienerle'],
      
      // Additional Sutterlütty-specific matches
      [/^absolute\s*vodka/i, 'absolute vodka'],
      [/^anzünder\s*ofen/i, 'anzünder ofen'],
      [/^basmati/i, 'reis basmati'],
      [/^brie$/i, 'käse brie'],
      [/^brot\s*serbische/i, 'brot serbisch lepinja'],
      [/^burger\s*buns/i, 'buns für burger'],
      [/^brauner\s*zucker/i, 'zucker braun'],
      [/^braune\s*linsen/i, 'linsen'],
      [/^corny\s*blaue\s*riegel/i, 'corny riegel'],
      [/^dinkel\s*tetra/i, 'dinkeldrink tetra'],
      [/^erdnussbutter/i, 'erdnussmus'],
      [/^fondue/i, 'käse-fondue'],
      [/^garam\s*masal/i, 'garam masala'],
      [/^geräuchertes\s*paprikapulver/i, 'geräuchertes paprikapulver'],
      [/^guinness$/i, 'bier guinness (4 dosen)'],
      [/^gurke$/i, 'gurken'],
      [/^haferdrink\s*flasche/i, 'hafer drink flasche'],
      [/^ingwershot/i, 'ingwer shots'],
      [/^karotte/i, 'karotten'],
      [/^kidney\s*bohnen/i, 'bohnen'],
      [/^kleine\s*kaminwurzen/i, 'würste kaminwurzen klein'],
      [/^kokosmilch\s*alnatura/i, 'kokosmilch'],
      [/^leinsamen$/i, 'leinsamen schrot'],
      [/^limetten$/i, 'limette'],
      [/^marillen\s*marmelade/i, 'marmelade marillen'],
      [/^mehl$/i, 'kuchenmehl'],
      [/^milchreis/i, 'reis'],
      [/^obst\s*birnen/i, 'birne'],
      [/^olivenöl/i, 'erdnuss öl'],
      [/^passiert\s*tomaten/i, 'passiert tomaten 500g'],
      [/^philadelphia/i, 'philadelphia'],
      [/^pilze.*kühlregal/i, 'pilze'],
      [/^rinder\s*bouillon/i, 'rinder-bouillon'],
      [/^risotto\s*reis\s*alnatura/i, 'risotto reis alnatura'],
      [/^schokolade\s*guss/i, 'schokolade'],
      [/^schokolade\s*stücken/i, 'schokolade'],
      [/^schwein\s*filet/i, 'schweinefleisch'],
      [/^schweineschnitzel/i, 'schweinefleisch'],
      [/^soletti.*racker/i, 'soletti'],
      [/^sonnenblumenhack\s*sonnenblumenkerne/i, 'sonnenblumenhack'],
      [/^süß\s*pommes/i, 'süßkartoffel pommes'],
      [/^süsskartoffel$/i, 'süsskartoffeln'],
      [/^teig$/i, 'pizzateig'],
      [/^teres\s*major/i, 'rindsfleisch (filet, teres major, flat iron)'],
      [/^toast$/i, 'brot'],
      [/^tomatensauce\s*billa\s*bio/i, 'tomatensauce billa bio'],
      [/^vegan\s*pudding/i, 'pudding vegan']
    ];
  }
}