import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

// Direct Firebase imports (more reliable in StackBlitz)
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';

import { Article, ArticleCategory, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private firestore: any;
  private userId!: string; // Add definite assignment assertion
  
  // Reactive subjects for real-time updates
  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);
  
  // Unsubscribe functions for real-time listeners
  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;

  constructor() {
    console.log('🔥 Initializing Firebase directly...');
    
    // Initialize Firebase directly (bypasses AngularFire issues in StackBlitz)
    try {
      const app = initializeApp(environment.firebase);
      this.firestore = getFirestore(app);
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      return;
    }
    
    // Generate or retrieve anonymous user ID
    this.userId = this.getOrCreateUserId();
    console.log('👤 Anonymous User ID:', this.userId);
    
    // Set up real-time listeners
    this.setupRealtimeListeners();
    
    // Initialize with default data if user is new
    this.initializeDefaultData();
  }

  private getOrCreateUserId(): string {
    const stored = localStorage.getItem('shoplisl-user-id');
    if (stored) {
      return stored;
    }
    
    // Generate new anonymous user ID
    const newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('shoplisl-user-id', newId);
    return newId;
  }

  private setupRealtimeListeners(): void {
    if (!this.firestore) {
      console.error('Firestore not initialized');
      return;
    }

    try {
      // Articles real-time listener
      const articlesRef = collection(this.firestore, `users/${this.userId}/articles`);
      const articlesQuery = query(articlesRef, orderBy('name'));
      
      this.articlesUnsubscribe = onSnapshot(articlesQuery, 
        (snapshot) => {
          console.log('📱 Articles updated:', snapshot.size);
          const articles: Article[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            articles.push({
              id: doc.id,
              name: data['name'],
              amount: data['amount'],
              notes: data['notes'],
              icon: data['icon'],
              categoryId: data['categoryId'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              availableInShops: data['availableInShops'] || [],
              usageCount: data['usageCount'] || 0
            });
          });
          this.articlesSubject.next(articles);
        },
        (error) => {
          console.error('Articles listener error:', error);
        }
      );

      // Lists real-time listener  
      const listsRef = collection(this.firestore, `users/${this.userId}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));
      
      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          console.log('📋 Lists updated:', snapshot.size);
          const lists: ShoppingList[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            lists.push({
              id: doc.id,
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              articleIds: data['articleIds'] || [],
              itemStates: data['itemStates'] || {},
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            });
          });
          this.listsSubject.next(lists);
        },
        (error) => {
          console.error('Lists listener error:', error);
        }
      );
    } catch (error) {
      console.error('Error setting up listeners:', error);
    }
  }

  private async initializeDefaultData(): Promise<void> {
    if (!this.firestore) return;

    try {
      // Check if user already has data
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.userId}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.userId}/lists`));
      
      // If no data exists, create defaults
      if (articlesSnapshot.empty && listsSnapshot.empty) {
        console.log('🆕 New user - creating default data');
        await this.createDefaultArticles();
        await this.createDefaultLists();
      }
    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }

  private async createDefaultArticles(): Promise<void> {
    const defaultArticles = [
      {
        name: 'Erdbeeren',
        amount: '', // Add empty string instead of undefined
        icon: '🍓',
        categoryId: '1',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        name: 'Kiwi Beeren',
        amount: '', // Add empty string instead of undefined
        icon: '🥝',
        categoryId: '1',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        name: 'Chorizo',
        amount: '3 Stück', // Add some example amount
        icon: '🌭', 
        categoryId: '2',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }
    ];

    const articlesRef = collection(this.firestore, `users/${this.userId}/articles`);
    for (const article of defaultArticles) {
      await addDoc(articlesRef, article);
    }
  }

  private async createDefaultLists(): Promise<void> {
    // First create articles and get their IDs
    const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.userId}/articles`));
    const articleIds: string[] = [];
    articlesSnapshot.forEach(doc => articleIds.push(doc.id));

    const defaultLists = [
      {
        name: 'Apotheke',
        color: '#9c27b0',
        icon: '💊',
        articleIds: [],
        itemStates: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        name: 'Lebensmittel',
        color: '#f44336', 
        icon: '🛒',
        articleIds: articleIds,
        itemStates: articleIds.reduce((acc, id) => {
          acc[id] = { articleId: id, isChecked: false };
          return acc;
        }, {} as any),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }
    ];

    const listsRef = collection(this.firestore, `users/${this.userId}/lists`);
    for (const list of defaultLists) {
      await addDoc(listsRef, list);
    }
  }

  // === PUBLIC METHODS (Same interface as before) ===
  
  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    return from(getDoc(doc(this.firestore, `users/${this.userId}/articles/${id}`))).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data['name'],
            amount: data['amount'],
            notes: data['notes'],
            icon: data['icon'],
            categoryId: data['categoryId'],
            createdAt: data['createdAt']?.toDate() || new Date(),
            updatedAt: data['updatedAt']?.toDate() || new Date(),
            availableInShops: data['availableInShops'] || [],
            usageCount: data['usageCount'] || 0
          } as Article;
        }
        return undefined;
      }),
      catchError(error => {
        console.error('Error getting article:', error);
        return of(undefined);
      })
    );
  }

  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<Article> {
    const articleData = {
      name: article.name,
      amount: article.amount || '', // Ensure never undefined
      notes: article.notes || '', // Ensure never undefined
      icon: article.icon || '📦', // Ensure never undefined
      categoryId: article.categoryId || '',
      availableInShops: article.availableInShops || [],
      usageCount: article.usageCount || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    return from(addDoc(collection(this.firestore, `users/${this.userId}/articles`), articleData)).pipe(
      map(docRef => ({
        id: docRef.id,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        createdAt: new Date(),
        updatedAt: new Date()
      } as Article)),
      catchError(error => {
        console.error('Error creating article:', error);
        throw error;
      })
    );
  }

  updateArticle(id: string, updates: Partial<Article>): Observable<Article | undefined> {
    // Clean up undefined values before saving to Firestore
    const updateData: any = {
      updatedAt: Timestamp.now()
    };
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.amount !== undefined) updateData.amount = updates.amount || '';
    if (updates.notes !== undefined) updateData.notes = updates.notes || '';
    if (updates.icon !== undefined) updateData.icon = updates.icon || '📦';
    if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId || '';
    if (updates.availableInShops !== undefined) updateData.availableInShops = updates.availableInShops || [];
    if (updates.usageCount !== undefined) updateData.usageCount = updates.usageCount || 0;

    return from(updateDoc(doc(this.firestore, `users/${this.userId}/articles/${id}`), updateData)).pipe(
      map(() => {
        // Return updated article - real-time listener will update the subject
        const currentArticles = this.articlesSubject.value;
        const article = currentArticles.find(a => a.id === id);
        return article ? { ...article, ...updates, updatedAt: new Date() } : undefined;
      }),
      catchError(error => {
        console.error('Error updating article:', error);
        return of(undefined);
      })
    );
  }

  deleteArticle(id: string): Observable<boolean> {
    return from(deleteDoc(doc(this.firestore, `users/${this.userId}/articles/${id}`))).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error deleting article:', error);
        return of(false);
      })
    );
  }

  // === LISTS METHODS ===

  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    return from(getDoc(doc(this.firestore, `users/${this.userId}/lists/${id}`))).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data['name'],
            color: data['color'],
            icon: data['icon'],
            shopId: data['shopId'],
            articleIds: data['articleIds'] || [],
            itemStates: data['itemStates'] || {},
            createdAt: data['createdAt']?.toDate() || new Date(),
            updatedAt: data['updatedAt']?.toDate() || new Date()
          } as ShoppingList;
        }
        return undefined;
      }),
      catchError(error => {
        console.error('Error getting list:', error);
        return of(undefined);
      })
    );
  }

  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt'>): Observable<ShoppingList> {
    const listData = {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    return from(addDoc(collection(this.firestore, `users/${this.userId}/lists`), listData)).pipe(
      map(docRef => ({
        id: docRef.id,
        ...list,
        createdAt: new Date(),
        updatedAt: new Date()
      } as ShoppingList)),
      catchError(error => {
        console.error('Error creating list:', error);
        throw error;
      })
    );
  }

  updateList(id: string, updates: Partial<ShoppingList>): Observable<ShoppingList | undefined> {
    const updateData = {
      ...updates,
      updatedAt: Timestamp.now()
    };

    return from(updateDoc(doc(this.firestore, `users/${this.userId}/lists/${id}`), updateData)).pipe(
      map(() => {
        // Return updated list - real-time listener will update the subject
        const currentLists = this.listsSubject.value;
        const list = currentLists.find(l => l.id === id);
        return list ? { ...list, ...updates, updatedAt: new Date() } : undefined;
      }),
      catchError(error => {
        console.error('Error updating list:', error);
        return of(undefined);
      })
    );
  }

  deleteList(id: string): Observable<boolean> {
    return from(deleteDoc(doc(this.firestore, `users/${this.userId}/lists/${id}`))).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error deleting list:', error);
        return of(false);
      })
    );
  }

  // === LIST ITEM METHODS ===

  toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const currentState = list.itemStates[articleId]?.isChecked || false;
        const newItemStates = {
          ...list.itemStates,
          [articleId]: {
            ...list.itemStates[articleId],
            articleId,
            isChecked: !currentState,
            checkedAt: new Date()
          }
        };

        // Update in Firebase
        updateDoc(doc(this.firestore, `users/${this.userId}/lists/${listId}`), {
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });

        return true;
      }),
      catchError(error => {
        console.error('Error toggling item:', error);
        return of(false);
      })
    );
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.includes(articleId) 
          ? list.articleIds 
          : [...list.articleIds, articleId];
          
        const newItemStates = {
          ...list.itemStates,
          [articleId]: { articleId, isChecked: false }
        };

        // Update in Firebase
        updateDoc(doc(this.firestore, `users/${this.userId}/lists/${listId}`), {
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });

        return true;
      }),
      catchError(error => {
        console.error('Error adding article to list:', error);
        return of(false);
      })
    );
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.filter(id => id !== articleId);
        const newItemStates = { ...list.itemStates };
        delete newItemStates[articleId];

        // Update in Firebase
        updateDoc(doc(this.firestore, `users/${this.userId}/lists/${listId}`), {
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });

        return true;
      }),
      catchError(error => {
        console.error('Error removing article from list:', error);
        return of(false);
      })
    );
  }

  updateListItemAmount(listId: string, articleId: string, amount: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newItemStates = {
          ...list.itemStates,
          [articleId]: {
            ...list.itemStates[articleId],
            articleId,
            amount: amount.trim()
          }
        };

        // Update in Firebase
        updateDoc(doc(this.firestore, `users/${this.userId}/lists/${listId}`), {
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });

        return true;
      }),
      catchError(error => {
        console.error('Error updating item amount:', error);
        return of(false);
      })
    );
  }

  clearAllItemsFromList(listId: string): Observable<boolean> {
    return from(updateDoc(doc(this.firestore, `users/${this.userId}/lists/${listId}`), {
      articleIds: [],
      itemStates: {},
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error clearing list:', error);
        return of(false);
      })
    );
  }

  // === CLEANUP ===
  
  ngOnDestroy(): void {
    if (this.articlesUnsubscribe) {
      this.articlesUnsubscribe();
    }
    if (this.listsUnsubscribe) {
      this.listsUnsubscribe();
    }
  }
}