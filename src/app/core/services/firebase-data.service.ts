import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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

import { Article, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class FirebaseDataService {
  private firestore: any;
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';
  
  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);
  
  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService
  ) {
    this.initializeFirebase();
    this.initializeDataLoading();
  }

  private initializeFirebase(): void {
    try {
      const app = initializeApp(environment.firebase);
      this.firestore = getFirestore(app);
      this.logger.info('data', 'Firebase initialized successfully');
    } catch (error) {
      this.logger.error('data', 'Firebase initialization failed', error);
    }
  }

  private initializeDataLoading(): void {
    const currentStatus = this.connectionService.getCurrentStatus();
    
    if (currentStatus.isOnline) {
      this.logger.info('data', 'Initially online - loading fresh data');
      this.loadFreshData();
    } else {
      this.logger.info('data', 'Initially offline - loading cached data');
      this.loadCachedData();
    }
  
    this.connectionService.getConnectionStatus().subscribe(status => {
      const currentTime = Date.now();
      const statusChangeTime = status.lastOnlineAt?.getTime() || 0;
      
      if (Math.abs(currentTime - statusChangeTime) < 1000 && status.isOnline) {
        this.logger.info('data', 'Connection restored - refreshing data');
        this.loadFreshData();
      }
    });
  }

  private async loadFreshData(): Promise<void> {
    this.logger.debug('data', 'Loading fresh data from Firebase');
    
    try {
      this.setupRealtimeListeners();
    } catch (error) {
      this.logger.error('data', 'Failed to load fresh data, falling back to cache', error);
      this.loadCachedData();
    }
  }

  private loadCachedData(): void {
    this.logger.debug('cache', 'Loading data from cache');
    
    const currentArticles = this.articlesSubject.value;
    const currentLists = this.listsSubject.value;
    
    if (currentArticles.length === 0) {
      const articlesCache = this.cacheService.getCachedArticles();
      if (articlesCache.data) {
        this.logger.info('cache', `Loaded ${articlesCache.data.length} articles from cache (${this.cacheService.formatAge(articlesCache.status.age)})`);
        this.articlesSubject.next(articlesCache.data);
      } else {
        this.logger.warn('cache', 'No articles in cache');
        this.articlesSubject.next([]);
      }
    }
  
    if (currentLists.length === 0) {
      const listsCache = this.cacheService.getCachedLists();
      if (listsCache.data) {
        this.logger.info('cache', `Loaded ${listsCache.data.length} lists from cache (${this.cacheService.formatAge(listsCache.status.age)})`);
        this.listsSubject.next(listsCache.data);
      } else {
        this.logger.warn('cache', 'No lists in cache');
        this.listsSubject.next([]);
      }
    }
  }

  private setupRealtimeListeners(): void {
    if (!this.firestore) {
      this.logger.error('data', 'Firestore not initialized');
      return;
    }

    this.cleanupListeners();

    try {
      // Articles listener
      const articlesRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`);
      const articlesQuery = query(articlesRef, orderBy('name'));
      
      this.articlesUnsubscribe = onSnapshot(articlesQuery, 
        (snapshot) => {
          this.logger.debug('data', `Fresh articles received: ${snapshot.size}`);
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
              departmentId: data['departmentId'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              availableInShops: data['availableInShops'] || [],
              usageCount: data['usageCount'] || 0
            });
          });
          
          this.articlesSubject.next(articles);
          this.cacheService.cacheArticles(articles);
        },
        (error) => {
          this.logger.error('data', 'Articles listener error', error);
          this.loadCachedData();
        }
      );

      // Lists listener
      const listsRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));
      
      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          this.logger.debug('data', `Fresh lists received: ${snapshot.size}`);
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
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            });
          });
          
          this.listsSubject.next(lists);
          this.cacheService.cacheLists(lists);
        },
        (error) => {
          this.logger.error('data', 'Lists listener error', error);
          this.loadCachedData();
        }
      );
    } catch (error) {
      this.logger.error('data', 'Error setting up listeners', error);
      this.loadCachedData();
    }
  }

  private cleanupListeners(): void {
    if (this.articlesUnsubscribe) {
      this.articlesUnsubscribe();
      this.articlesUnsubscribe = undefined;
    }
    if (this.listsUnsubscribe) {
      this.listsUnsubscribe();
      this.listsUnsubscribe = undefined;
    }
  }

  // === PUBLIC API ===

  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    const currentArticles = this.articlesSubject.value;
    const localArticle = currentArticles.find(a => a.id === id);
    
    if (localArticle) {
      this.logger.debug('data', `Found article "${localArticle.name}" in local state`);
      return of(localArticle);
    }
  
    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.debug('data', `Article ${id} not in local state, fetching from Firebase`);
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
              departmentId: data['departmentId'], 
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              availableInShops: data['availableInShops'] || [],
              usageCount: data['usageCount'] || 0
            } as Article;
          }
          return undefined;
        }),
        catchError(error => {
          this.logger.error('data', 'Error getting article from Firebase', error);
          return of(undefined);
        })
      );
    }
  
    this.logger.warn('data', `Article ${id} not found (offline)`);
    return of(undefined);
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    const currentLists = this.listsSubject.value;
    const localList = currentLists.find(l => l.id === id);
    
    if (localList) {
      this.logger.debug('data', `Found list "${localList.name}" in local state`);
      return of(localList);
    }
  
    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.debug('data', `List ${id} not in local state, fetching from Firebase`);
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
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            } as ShoppingList;
          }
          return undefined;
        }),
        catchError(error => {
          this.logger.error('data', 'Error getting list from Firebase', error);
          return of(undefined);
        })
      );
    }
  
    this.logger.warn('data', `List ${id} not found (offline)`);
    return of(undefined);
  }

  // === FIREBASE OPERATIONS ===

  async createArticleInFirebase(articleData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const docRef = await addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`), articleData);
    return docRef.id;
  }

  async updateArticleInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`), updateData);
  }

  async deleteArticleInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    await deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`));
  }

  async createListInFirebase(listData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const docRef = await addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`), listData);
    return docRef.id;
  }

  async updateListInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`), updateData);
  }

  async deleteListInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    await deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`));
  }

  async getAllArticlesFromFirebase(): Promise<Article[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const snapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
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
        departmentId: data['departmentId'],
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date(),
        availableInShops: data['availableInShops'] || [],
        usageCount: data['usageCount'] || 0
      });
    });
    return articles;
  }

  async getAllListsFromFirebase(): Promise<ShoppingList[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const snapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
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
        departmentOrder: data['departmentOrder'],
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date()
      });
    });
    return lists;
  }

  // === EMERGENCY & UTILITY ===

  async loadDataEmergency(): Promise<void> {
    this.logger.warn('data', 'Emergency data loading triggered');
    
    this.logger.debug('data', 'Trying cached data first');
    this.loadCachedData();
    
    const cachedArticles = this.articlesSubject.value;
    const cachedLists = this.listsSubject.value;
    
    if (cachedArticles.length > 0 || cachedLists.length > 0) {
      this.logger.info('data', `Loaded from cache: ${cachedArticles.length} articles, ${cachedLists.length} lists`);
      return;
    }
    
    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.debug('data', 'Trying direct Firebase fetch');
      
      try {
        const articles = await this.getAllArticlesFromFirebase();
        const lists = await this.getAllListsFromFirebase();
        
        this.logger.info('data', `Direct Firebase fetch: ${articles.length} articles, ${lists.length} lists`);
        
        this.articlesSubject.next(articles);
        this.listsSubject.next(lists);
        
        this.cacheService.cacheArticles(articles);
        this.cacheService.cacheLists(lists);
        
        this.setupRealtimeListeners();
        
      } catch (error) {
        this.logger.error('data', 'Direct Firebase fetch failed', error);
      }
    }
  }

  async refreshData(): Promise<void> {
    this.logger.info('data', 'Manually refreshing shared data');
    
    if (!this.connectionService.isOnline()) {
      this.logger.warn('data', 'Offline: Cannot refresh, using cached data');
      this.loadCachedData();
      return;
    }

    try {
      this.setupRealtimeListeners();
      
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      this.logger.info('data', `Current shared data: ${articlesSnapshot.size} articles, ${listsSnapshot.size} lists`);
    } catch (error) {
      this.logger.error('data', 'Error refreshing data', error);
      this.loadCachedData();
    }
  }

  getCurrentArticles(): Article[] {
    return this.articlesSubject.value;
  }

  getCurrentLists(): ShoppingList[] {
    return this.listsSubject.value;
  }

  updateLocalArticles(articles: Article[]): void {
    this.articlesSubject.next(articles);
    this.cacheService.cacheArticles(articles);
  }

  updateLocalLists(lists: ShoppingList[]): void {
    this.listsSubject.next(lists);
    this.cacheService.cacheLists(lists);
  }

  getSharedUserId(): string {
    return this.SHARED_USER_ID;
  }

  isFirestoreReady(): boolean {
    return !!this.firestore;
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
  }
}