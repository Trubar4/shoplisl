import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
import { map, catchError, mergeMap } from 'rxjs/operators'; // Add mergeMap here
// Direct Firebase imports (more reliable in StackBlitz)
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,     // <- Already there
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
  // Fixed shared user ID - all devices use the same one
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';
  
  // Reactive subjects for real-time updates
  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);
  
  // Unsubscribe functions for real-time listeners
  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;

  constructor() {
    console.log('🔥 Initializing Firebase with shared sync...');
    
    // Initialize Firebase directly (bypasses AngularFire issues in StackBlitz)
    try {
      const app = initializeApp(environment.firebase);
      this.firestore = getFirestore(app);
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      return;
    }
    
    console.log('👥 Using shared user ID:', this.SHARED_USER_ID);
    
    // Set up real-time listeners for shared data
    this.setupRealtimeListeners();
    
    // Check if we need to migrate from device-specific data
    this.handleDataMigration();
  }

  private async handleDataMigration(): Promise<void> {
    const oldUserId = localStorage.getItem('shoplisl-user-id');
    
    // If there's an old device-specific user ID, offer to migrate data
    if (oldUserId && oldUserId !== this.SHARED_USER_ID) {
      console.log('🔄 Found device-specific data, checking for migration...');
      
      try {
        // Check if old user has any data
        const oldArticlesSnapshot = await getDocs(collection(this.firestore, `users/${oldUserId}/articles`));
        const oldListsSnapshot = await getDocs(collection(this.firestore, `users/${oldUserId}/lists`));
        
        if (oldArticlesSnapshot.size > 0 || oldListsSnapshot.size > 0) {
          console.log(`📦 Found ${oldArticlesSnapshot.size} articles and ${oldListsSnapshot.size} lists to migrate`);
          
          // Check if shared user already has data
          const sharedArticlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
          const sharedListsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
          
          if (sharedArticlesSnapshot.size === 0 && sharedListsSnapshot.size === 0) {
            // Migrate data from old user to shared user
            await this.migrateUserData(oldUserId);
          } else {
            console.log('⚠️ Shared user already has data, skipping migration');
          }
        }
        
        // Update localStorage to use shared user ID
        localStorage.setItem('shoplisl-user-id', this.SHARED_USER_ID);
        
      } catch (error) {
        console.error('Error during migration check:', error);
      }
    } else {
      // Set shared user ID in localStorage
      localStorage.setItem('shoplisl-user-id', this.SHARED_USER_ID);
    }
  }

  private async migrateUserData(oldUserId: string): Promise<void> {
    console.log('🚚 Migrating data to shared user...');
    
    try {
      // Step 1: Migrate articles and build ID mapping
      const oldArticlesSnapshot = await getDocs(collection(this.firestore, `users/${oldUserId}/articles`));
      const sharedArticlesRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`);
      
      const articleIdMapping: { [oldId: string]: string } = {};
      
      for (const docSnap of oldArticlesSnapshot.docs) {
        const newDocRef = await addDoc(sharedArticlesRef, docSnap.data());
        articleIdMapping[docSnap.id] = newDocRef.id;
        console.log(`📦 Article migrated: ${docSnap.id} -> ${newDocRef.id}`);
      }
      
      // Step 2: Migrate lists and update article references
      const oldListsSnapshot = await getDocs(collection(this.firestore, `users/${oldUserId}/lists`));
      const sharedListsRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`);
      
      for (const docSnap of oldListsSnapshot.docs) {
        const listData = docSnap.data();
        
        // Update articleIds to reference new shared article IDs
        const updatedArticleIds = (listData['articleIds'] || []).map((oldId: string) => 
          articleIdMapping[oldId] || oldId
        );
        
        // Update itemStates to use new article IDs
        const oldItemStates = listData['itemStates'] || {};
        const updatedItemStates: any = {};
        
        for (const [oldArticleId, state] of Object.entries(oldItemStates)) {
          const newArticleId = articleIdMapping[oldArticleId] || oldArticleId;
          updatedItemStates[newArticleId] = {
            ...state as any,
            articleId: newArticleId
          };
        }
        
        // Create updated list data
        const updatedListData = {
          ...listData,
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        };
        
        await addDoc(sharedListsRef, updatedListData);
        console.log(`📋 List migrated: ${docSnap.id} with ${updatedArticleIds.length} articles`);
      }
      
      console.log('✅ Data migration completed successfully');
      console.log(`📊 Migrated ${Object.keys(articleIdMapping).length} articles and ${oldListsSnapshot.size} lists`);
      
      // Note: We're not deleting old data in case user wants to rollback
      // You could add cleanup logic here if needed
      
    } catch (error) {
      console.error('❌ Error during data migration:', error);
    }
  }

  private setupRealtimeListeners(): void {
    if (!this.firestore) {
      console.error('Firestore not initialized');
      return;
    }

    try {
      // Articles real-time listener - now using shared user
      const articlesRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`);
      const articlesQuery = query(articlesRef, orderBy('name'));
      
      this.articlesUnsubscribe = onSnapshot(articlesQuery, 
        (snapshot) => {
          console.log('📱 Shared articles updated:', snapshot.size);
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

      // Lists real-time listener - now using shared user
      const listsRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));
      
      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          console.log('📋 Shared lists updated:', snapshot.size);
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

  // === PUBLIC METHODS (Same interface as before but using shared user) ===
  
  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    return from(getDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`))).pipe(
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
      amount: article.amount || '',
      notes: article.notes || '',
      icon: article.icon || '📦',
      categoryId: article.categoryId || '',
      availableInShops: article.availableInShops || [],
      usageCount: article.usageCount || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    return from(addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`), articleData)).pipe(
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

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`), updateData)).pipe(
      map(() => {
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
    return from(deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`))).pipe(
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
    return from(getDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`))).pipe(
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

    return from(addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`), listData)).pipe(
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

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`), updateData)).pipe(
      map(() => {
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
    return from(deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`))).pipe(
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

        updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
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

        updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
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

        updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
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

        updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
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
    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
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

  // === UTILITY METHODS ===
  
  /**
   * Get the current shared user ID (useful for debugging)
   */
  getSharedUserId(): string {
    return this.SHARED_USER_ID;
  }

  /**
   * Force refresh data from server (useful for manual sync)
   */
  async refreshData(): Promise<void> {
    console.log('🔄 Manually refreshing shared data...');
    // Real-time listeners will automatically update, but we can force a check
    try {
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      console.log(`📊 Current shared data: ${articlesSnapshot.size} articles, ${listsSnapshot.size} lists`);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }

  /**
   * Fix broken article references in lists (run once after migration)
   */
  async repairListReferences(): Promise<void> {
    console.log('🔧 Repairing list-article references...');
    
    try {
      // Get all current articles and lists
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      
      // Build article name-to-ID mapping
      const articlesByName: { [name: string]: string } = {};
      articlesSnapshot.forEach(doc => {
        const data = doc.data();
        articlesByName[data['name']] = doc.id;
      });
      
      console.log(`📦 Found ${articlesSnapshot.size} articles:`, Object.keys(articlesByName));
      
      // Fix each list
      for (const listDoc of listsSnapshot.docs) {
        const listData = listDoc.data();
        const currentArticleIds = listData['articleIds'] || [];
        const currentItemStates = listData['itemStates'] || {};
        
        console.log(`📋 Checking list "${listData['name']}" with ${currentArticleIds.length} article refs`);
        
        // Find valid and invalid article references
        const validIds: string[] = [];
        const invalidIds: string[] = [];
        
        currentArticleIds.forEach((id: string) => {
          const articleExists = articlesSnapshot.docs.some(doc => doc.id === id);
          if (articleExists) {
            validIds.push(id);
          } else {
            invalidIds.push(id);
          }
        });
        
        if (invalidIds.length === 0) {
          console.log(`✅ List "${listData['name']}" has valid references`);
          continue;
        }
        
        console.log(`🔧 Fixing ${invalidIds.length} broken references in "${listData['name']}"`);
        
        // Try to match broken references by finding articles with same names in itemStates
        const fixedArticleIds = [...validIds];
        const fixedItemStates: any = {};
        
        // Copy valid itemStates
        validIds.forEach(id => {
          if (currentItemStates[id]) {
            fixedItemStates[id] = currentItemStates[id];
          }
        });
        
        // Try to recover broken references by name matching
        for (const [stateKey, stateValue] of Object.entries(currentItemStates)) {
          if (invalidIds.includes(stateKey)) {
            // This is a broken reference, try to find article by name
            // Look for article data in old collections to get the name
            // For now, we'll skip broken references
            console.log(`⚠️ Skipping broken reference: ${stateKey}`);
          }
        }
        
        // Update the list with fixed references
        await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listDoc.id}`), {
          articleIds: fixedArticleIds,
          itemStates: fixedItemStates,
          updatedAt: Timestamp.now()
        });
        
        console.log(`✅ Fixed list "${listData['name']}": ${currentArticleIds.length} -> ${fixedArticleIds.length} articles`);
      }
      
      console.log('🎉 List repair completed!');
      
    } catch (error) {
      console.error('❌ Error repairing list references:', error);
    }
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

   /**
   * Check if an article with the given name already exists
   */
   checkArticleNameExists(name: string, excludeId?: string): Observable<boolean> {
    return this.getArticles().pipe(
      map(articles => {
        const trimmedName = name.trim().toLowerCase();
        return articles.some(article => 
          article.id !== excludeId && 
          article.name.trim().toLowerCase() === trimmedName
        );
      })
    );
  }

  /**
   * Get all lists that contain a specific article
   */
  getListsContainingArticle(articleId: string): Observable<ShoppingList[]> {
    return this.getLists().pipe(
      map(lists => lists.filter(list => list.articleIds.includes(articleId)))
    );
  }

  /**
   * Get lists where the article is active (not checked off)
   */
  getListsWithActiveArticle(articleId: string): Observable<ShoppingList[]> {
    return this.getLists().pipe(
      map(lists => lists.filter(list => {
        const isInList = list.articleIds.includes(articleId);
        const itemState = list.itemStates[articleId];
        const isActive = isInList && (!itemState || !itemState.isChecked);
        return isActive;
      }))
    );
  }

  /**
   * Remove an article from all lists where it's inactive (checked off)
   * and delete the article itself
   */
  deleteArticleAndCleanupLists(articleId: string): Observable<{
    success: boolean;
    activeInLists?: string[];
    error?: string;
  }> {
    return this.getListsWithActiveArticle(articleId).pipe(
      mergeMap(activeInLists => {
        if (activeInLists.length > 0) {
          // Article is active in some lists, return warning
          return of({
            success: false,
            activeInLists: activeInLists.map(list => list.name)
          });
        }

        // Article is not active anywhere, safe to delete
        return this.getListsContainingArticle(articleId).pipe(
          mergeMap(allLists => {
            // Remove from all lists (these should only be lists where it's checked off)
            const removePromises = allLists.map(list => 
              this.removeArticleFromList(list.id, articleId).toPromise()
            );

            return from(Promise.all(removePromises)).pipe(
              mergeMap(() => {
                // Now delete the article itself
                return this.deleteArticle(articleId).pipe(
                  map(deleteSuccess => ({
                    success: deleteSuccess,
                    error: deleteSuccess ? undefined : 'Fehler beim Löschen des Artikels'
                  }))
                );
              })
            );
          })
        );
      }),
      catchError(error => {
        console.error('Error in deleteArticleAndCleanupLists:', error);
        return of({
          success: false,
          error: 'Unerwarteter Fehler beim Löschen'
        });
      })
    );
  }

  /**
   * Create article with duplicate name checking (FIXED VERSION)
   */
  createArticleWithDuplicateCheck(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    // Get current articles snapshot (not real-time) to avoid timing issues
    return from(getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`))).pipe(
      mergeMap(snapshot => {
        // Check for duplicates in the snapshot
        const trimmedName = article.name.trim().toLowerCase();
        const duplicate = snapshot.docs.some(doc => {
          const data = doc.data();
          return data['name'].trim().toLowerCase() === trimmedName;
        });

        if (duplicate) {
          return of({
            success: false,
            isDuplicate: true
          });
        }

        // No duplicate found, create the article
        return this.createArticle(article).pipe(
          map(createdArticle => ({
            success: true,
            article: createdArticle
          })),
          catchError(error => {
            console.error('Error creating article:', error);
            return of({
              success: false,
              error: 'Fehler beim Erstellen des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        console.error('Error checking duplicates:', error);
        return of({
          success: false,
          error: 'Fehler beim Prüfen auf Duplikate'
        });
      })
    );
  }

  /**
   * Update article with duplicate name checking (FIXED VERSION)
   */
  updateArticleWithDuplicateCheck(
    id: string, 
    updates: Partial<Article>
  ): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    // Only check for duplicates if name is being updated
    if (!updates.name) {
      return this.updateArticle(id, updates).pipe(
        map(updatedArticle => ({
          success: !!updatedArticle,
          article: updatedArticle || undefined,
          error: updatedArticle ? undefined : 'Fehler beim Aktualisieren'
        }))
      );
    }

    // Get current articles snapshot (not real-time) to avoid timing issues
    return from(getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`))).pipe(
      mergeMap(snapshot => {
        // Check for duplicates in the snapshot, excluding current article
        const trimmedName = updates.name!.trim().toLowerCase();
        const duplicate = snapshot.docs.some(doc => {
          const data = doc.data();
          return doc.id !== id && data['name'].trim().toLowerCase() === trimmedName;
        });

        if (duplicate) {
          return of({
            success: false,
            isDuplicate: true
          });
        }

        // No duplicate found, update the article
        return this.updateArticle(id, updates).pipe(
          map(updatedArticle => ({
            success: !!updatedArticle,
            article: updatedArticle || undefined,
            error: updatedArticle ? undefined : 'Fehler beim Aktualisieren'
          })),
          catchError(error => {
            console.error('Error updating article:', error);
            return of({
              success: false,
              error: 'Fehler beim Aktualisieren des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        console.error('Error checking duplicates:', error);
        return of({
          success: false,
          error: 'Fehler beim Prüfen auf Duplikate'
        });
      })
    );
  }
}