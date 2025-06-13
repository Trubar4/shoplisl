// src/app/core/services/article-upload.service.ts
import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { Article } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ArticleUploadService {
  private readonly COLLECTION = 'articles';
  private firestore: any;
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';

  constructor() {
    // Initialize Firebase directly (same as DataService)
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
      console.log('✅ ArticleUploadService: Firebase initialized successfully');
    } catch (error) {
      console.error('❌ ArticleUploadService: Firebase initialization failed:', error);
      throw error;
    }
  }

  async uploadArticles(): Promise<void> {
    const articles: Omit<Article, 'id'>[] = [
      { name: 'Absolute Vodka', amount: '', notes: '', icon: '🍸', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ahornsirup', amount: '', notes: '', icon: '🍯', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Amertini Soft', amount: '', notes: '', icon: '🍪', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Antipasti', amount: '', notes: '', icon: '🫒', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Anzünder Ofen', amount: '', notes: '', icon: '🔥', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Äpfel', amount: '', notes: '', icon: '🍎', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Artischocke', amount: '', notes: '', icon: '🌿', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Auberginen', amount: '', notes: '', icon: '🍆', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Avocado', amount: '', notes: '', icon: '🥑', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Backpulver', amount: '', notes: '', icon: '🧂', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Basilikum', amount: '', notes: '', icon: '🌿', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Basis-Müsli', amount: '', notes: '', icon: '🥣', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Bergkäse gerieben', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Bier Guinness (4 Dosen)', amount: '', notes: '', icon: '🍺', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Birne', amount: '', notes: '', icon: '🍐', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Blumen', amount: '', notes: '', icon: '🌸', departmentId: 'miscellaneous', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Briketts für Oma', amount: '', notes: '', icon: '🔥', departmentId: 'season', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Brot für Korma', amount: '', notes: '', icon: '🥖', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Brot Serbisch Lepinja', amount: '', notes: '', icon: '🥖', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Buns für Burger', amount: '', notes: '', icon: '🍔', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Butter Meersalz', amount: '', notes: '', icon: '🧈', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Cantuccini', amount: '', notes: '', icon: '🍪', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'CC Creme', amount: '', notes: '', icon: '💄', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Chiasamen (Bipa)', amount: '', notes: '', icon: '🌱', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Chorizo', amount: '', notes: '', icon: '🌶️', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Cola', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Compede Blasenpflaster', amount: '', notes: '', icon: '🩹', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Cornflakes', amount: '', notes: '', icon: '🥣', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Corny Riegel', amount: '', notes: '', icon: '🍫', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Creme fraiche', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Currypulver', amount: '', notes: '', icon: '🌶️', departmentId: 'spices-oils', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Datteln', amount: '', notes: '', icon: '🌰', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Deo Lavera Roll-on Natural & Sensitive', amount: '', notes: '', icon: '💨', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Dinkeldrink Tetra', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Duschgel Axe', amount: '', notes: '', icon: '🧴', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Eis', amount: '', notes: '', icon: '🍦', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Eiswaffeln', amount: '', notes: '', icon: '🧇', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Elmex orange Zahnpasta', amount: '', notes: '', icon: '🦷', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Erbsen', amount: '', notes: '', icon: '🟢', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Erdbeeren', amount: '', notes: '', icon: '🍓', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Erdnuss Öl', amount: '', notes: '', icon: '🛢️', departmentId: 'spices-oils', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Erdnussmus', amount: '', notes: '', icon: '🥜', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Essigreiniger', amount: '', notes: '', icon: '🧽', departmentId: 'cleaning-agents', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Feta', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Fischstäbchen', amount: '', notes: '', icon: '🐟', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Fladenbrot für Döner', amount: '', notes: '', icon: '🥖', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Flammkuchenteig', amount: '', notes: '', icon: '🥧', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Frühlingszwiebel', amount: '', notes: '', icon: '🧅', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Garam Masala', amount: '', notes: '', icon: '🌶️', departmentId: 'spices-oils', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Garnier Shampoo und Nachfüller', amount: '', notes: '', icon: '🧴', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Geräuchertes Paprikapulver', amount: '', notes: '', icon: '🌶️', departmentId: 'spices-oils', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Geschirrspülersalz', amount: '', notes: '', icon: '🧂', departmentId: 'cleaning-agents', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Gesichtsrasierer', amount: '', notes: '', icon: '🪒', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Gestückelte Tomaten', amount: '', notes: '', icon: '🍅', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ginger Ale', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ginger Beer', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Grill-Zeugs', amount: '', notes: '', icon: '🔥', departmentId: 'season', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Grissini', amount: '', notes: '', icon: '🥖', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Gurken', amount: '', notes: '', icon: '🥒', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Haargummis', amount: '', notes: '', icon: '💇', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Haarspray', amount: '', notes: '', icon: '💇', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Hackfleisch (100% Rind)', amount: '', notes: '', icon: '🥩', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Hafer Drink Flasche', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Hafer Drink Tetra', amount: '', notes: '', icon: '🥛', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Haferflocken Bio aus Österreich', amount: '', notes: '', icon: '🥣', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Himbeer Cashew Mus', amount: '', notes: '', icon: '🍓', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Himbeer TK', amount: '', notes: '', icon: '🍓', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Honig', amount: '', notes: '', icon: '🍯', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Hotdog Brot', amount: '', notes: '', icon: '🌭', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Huhn Filet Bio Wald', amount: '', notes: '', icon: '🐔', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Huhn geschnitten', amount: '', notes: '', icon: '🐔', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ingwer Shots', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ingwersaft', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Isländisch Moos Halstabletten', amount: '', notes: '', icon: '💊', departmentId: 'medicine', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Joghurt Skyr Vegan', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kakis', amount: '', notes: '', icon: '🍊', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kapern', amount: '', notes: '', icon: '🫒', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Karotten', amount: '', notes: '', icon: '🥕', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kartoffelnpüree fertig', amount: '', notes: '', icon: '🥔', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse Brie', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse Camembert', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse Cheddar', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse Gouda', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse Haloumni', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Käse-Fondue', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kichererbsen', amount: '', notes: '', icon: '🟤', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Klopapier', amount: '', notes: '', icon: '🧻', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Knick Nacs wenn Angebot', amount: '', notes: '', icon: '🍫', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Knoblauch', amount: '', notes: '', icon: '🧄', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kohl', amount: '', notes: '', icon: '🥬', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kokosmilch', amount: '', notes: '', icon: '🥥', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kokosraspel', amount: '', notes: '', icon: '🥥', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kräuter Saitlinge', amount: '', notes: '', icon: '🍄', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kräuterbaguette', amount: '', notes: '', icon: '🥖', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Krautsalat', amount: '', notes: '', icon: '🥬', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kroketten', amount: '', notes: '', icon: '🥔', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kuchenmehl', amount: '', notes: '', icon: '🌾', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Küchenrolle', amount: '', notes: '', icon: '🧻', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Laugenbrötle', amount: '', notes: '', icon: '🥖', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Leinsamen Schrot', amount: '', notes: '', icon: '🌱', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Limonade', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Linsen', amount: '', notes: '', icon: '🟤', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Linsenflüssigkeit', amount: '', notes: '', icon: '🥫', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Maiskolben', amount: '', notes: '', icon: '🌽', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mandarinen', amount: '', notes: '', icon: '🍊', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mandelblättchen', amount: '', notes: '', icon: '🌰', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Marmelade Himbeer', amount: '', notes: '', icon: '🍓', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Marmelade Marillen', amount: '', notes: '', icon: '🍑', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Martini', amount: '', notes: '', icon: '🍸', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mascara transparent', amount: '', notes: '', icon: '👁️', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mascarpone', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mayonnaise', amount: '', notes: '', icon: '🥄', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mediterrane Tonic', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Melone', amount: '', notes: '', icon: '🍈', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mini Magnum', amount: '', notes: '', icon: '🍦', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mojito Soda/Limo', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mortadella', amount: '', notes: '', icon: '🍖', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mozzibällchen', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Müllsäcke', amount: '', notes: '', icon: '🗑️', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Mundspülung Emma', amount: '', notes: '', icon: '🦷', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Müsli Crunchy', amount: '', notes: '', icon: '🥣', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Nacho\'s', amount: '', notes: '', icon: '🌶️', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Nagellackentferner', amount: '', notes: '', icon: '💅', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Nasensalz', amount: '', notes: '', icon: '💊', departmentId: 'medicine', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Nivea Sensitive After Shave Balsam', amount: '', notes: '', icon: '🪒', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Nussmix Hofer', amount: '', notes: '', icon: '🥜', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Obs', amount: '', notes: '', icon: '🍎', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Oliven Cracker', amount: '', notes: '', icon: '🫒', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Orangen Saft', amount: '', notes: '', icon: '🍊', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Passiert Tomaten 500g', amount: '', notes: '', icon: '🍅', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Petersilie', amount: '', notes: '', icon: '🌿', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Philadelphia', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pilze', amount: '', notes: '', icon: '🍄', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pinsa', amount: '', notes: '', icon: '🍕', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pistazien', amount: '', notes: '', icon: '🥜', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pizzateig', amount: '', notes: '', icon: '🍕', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pomito', amount: '', notes: '', icon: '🍅', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pommes', amount: '', notes: '', icon: '🍟', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Preiselbeer Marmelade', amount: '', notes: '', icon: '🍓', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Prosecco', amount: '', notes: '', icon: '🥂', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Proteinmüsli', amount: '', notes: '', icon: '🥣', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Proteinriegel Erdnuss', amount: '', notes: '', icon: '🥜', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pudding vegan', amount: '', notes: '', icon: '🍮', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Puder transparent mit Pad', amount: '', notes: '', icon: '💄', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pulled Pork', amount: '', notes: '', icon: '🐷', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rahm', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rahmkäsle', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Räuchertofu', amount: '', notes: '', icon: '🥩', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Reis', amount: '', notes: '', icon: '🍚', departmentId: 'noodles-rice', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Reis Basmati', amount: '', notes: '', icon: '🍚', departmentId: 'noodles-rice', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ricotta', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rinder-Bouillon', amount: '', notes: '', icon: '🥫', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rindsfleisch (Filet, Teres Major, Flat Iron)', amount: '', notes: '', icon: '🥩', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Risotto Reis Alnatura', amount: '', notes: '', icon: '🍚', departmentId: 'noodles-rice', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rostbratwürstle kleine Bio', amount: '', notes: '', icon: '🌭', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rotwein', amount: '', notes: '', icon: '🍷', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rouge cremig', amount: '', notes: '', icon: '💄', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Rucola', amount: '', notes: '', icon: '🥬', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Saaten Ganola', amount: '', notes: '', icon: '🌱', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Salanetti', amount: '', notes: '', icon: '🥨', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Salat fertig gemischt', amount: '', notes: '', icon: '🥗', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Salat gewaschen', amount: '', notes: '', icon: '🥗', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sauce Hollandaise', amount: '', notes: '', icon: '🥄', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sauerrahm', amount: '', notes: '', icon: '🥛', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Schokolade', amount: '', notes: '', icon: '🍫', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Schokomüsli glutenfrei', amount: '', notes: '', icon: '🥣', departmentId: 'breakfast', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Schübling', amount: '', notes: '', icon: '🌭', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Schwämme zum Abwaschen', amount: '', notes: '', icon: '🧽', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Schweinefleisch', amount: '', notes: '', icon: '🐷', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Shampoo Birgit', amount: '', notes: '', icon: '🧴', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Slipeinlagen', amount: '', notes: '', icon: '🩲', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Snacks für Emma Jause', amount: '', notes: '', icon: '🍪', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Soletti', amount: '', notes: '', icon: '🥨', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sonnenblumenhack', amount: '', notes: '', icon: '🌻', departmentId: 'international', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sonnenblumenkerne', amount: '', notes: '', icon: '🌻', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sonnenblumenkernmus', amount: '', notes: '', icon: '🌻', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Sonnencreme', amount: '', notes: '', icon: '☀️', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Spargel grün', amount: '', notes: '', icon: '🌿', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Spargel weiß', amount: '', notes: '', icon: '🌿', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Speck', amount: '', notes: '', icon: '🥓', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Suppennudeln', amount: '', notes: '', icon: '🍜', departmentId: 'noodles-rice', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Süßkartoffel Pommes', amount: '', notes: '', icon: '🍠', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Süsskartoffeln', amount: '', notes: '', icon: '🍠', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tagescreme', amount: '', notes: '', icon: '💄', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tempeh Teryaki', amount: '', notes: '', icon: '🥩', departmentId: 'fridge-meat', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tempos', amount: '', notes: '', icon: '🤧', departmentId: 'household-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TK Brokkoli', amount: '', notes: '', icon: '🥦', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Toblerone', amount: '', notes: '', icon: '🍫', departmentId: 'sweet-salty', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tofu o Sojaschnetzel', amount: '', notes: '', icon: '🥩', departmentId: 'international', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tomaten', amount: '', notes: '', icon: '🍅', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tomatensauce Billa Bio', amount: '', notes: '', icon: '🍅', departmentId: 'tins-jars', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tonic Water', amount: '', notes: '', icon: '🥤', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tramezzini', amount: '', notes: '', icon: '🥪', departmentId: 'bread', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Vanille Eis', amount: '', notes: '', icon: '🍦', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Vanille Extrakt', amount: '', notes: '', icon: '🌟', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Vanille Zucker', amount: '', notes: '', icon: '🌟', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Vegan Jackfruit', amount: '', notes: '', icon: '🍈', departmentId: 'international', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Waldbeeren', amount: '', notes: '', icon: '🍓', departmentId: 'frozen-goods', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Wärmepflaster Rücken', amount: '', notes: '', icon: '🩹', departmentId: 'medicine', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Wattepads', amount: '', notes: '', icon: '🧴', departmentId: 'drugstore', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Wienerle', amount: '', notes: '', icon: '🌭', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Wirsing', amount: '', notes: '', icon: '🥬', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Würste Kaminwurzen klein', amount: '', notes: '', icon: '🌭', departmentId: 'sausage-cheese-counter', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zahnpasta', amount: '', notes: '', icon: '🦷', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zahnseide Sticks', amount: '', notes: '', icon: '🦷', departmentId: 'body-care', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Ziegenfrischkäse', amount: '', notes: '', icon: '🧀', departmentId: 'dairy-products', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zitronensaft', amount: '', notes: '', icon: '🍋', departmentId: 'beverages-alcohol', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zopf', amount: '', notes: '', icon: '🥖', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zucchini', amount: '', notes: '', icon: '🥒', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zucker braun', amount: '', notes: '', icon: '🍯', departmentId: 'pastries', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Zwiebel', amount: '', notes: '', icon: '🧅', departmentId: 'fruit-vegetables', createdAt: new Date(), updatedAt: new Date() }
    ];

    console.log('Starting article upload...');
    let uploadedCount = 0;
    const batchSize = 10;

    try {
      const articlesCollection = collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`);
      
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        const promises = batch.map(async (article) => {
          return addDoc(articlesCollection, article);
        });

        await Promise.all(promises);
        uploadedCount += batch.length;
        console.log(`Uploaded ${uploadedCount}/${articles.length} articles`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`Successfully uploaded all ${articles.length} articles!`);
    } catch (error) {
      console.error('Error uploading articles:', error);
      throw error;
    }
  }
}