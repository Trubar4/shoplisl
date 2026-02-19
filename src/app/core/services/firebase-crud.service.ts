import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs
} from '@angular/fire/firestore';

import { Article, ShoppingList } from '../models';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { QuotaMonitorService } from './quota-monitor.service';
import { FirebaseMergeService } from './firebase-merge.service';

/**
 * Context provided by FirebaseDataService so that FirebaseCrudService can
 * access shared mutable state and trigger UI updates without holding direct
 * references to FirebaseDataService instance variables.
 */
export interface CrudServiceContext {
  /** Returns the current merged list of all (owned + shared) lists. */
  getCurrentLists(): ShoppingList[];
  /**
   * Pushes a newly created article into the owned-articles array.
   * Used for optimistic updates so the UI reflects the new article
   * before the Firestore listener fires.
   */
  pushOwnedArticle(article: Article): void;
  /** Returns whether an article with the given id is already in ownedArticles. */
  hasOwnedArticle(articleId: string): boolean;
  /** Triggers a merge of owned + shared articles and emits on articlesSubject. */
  mergeArticles(): void;
  /**
   * Records the timestamp of a write to a list so that the listener can
   * recognise its own write and suppress infinite-loop write-backs.
   */
  markMergeWrite(listId: string): void;
  /**
   * Pushes a newly created list into the owned-lists array.
   * Used for optimistic updates so the UI reflects the new list immediately,
   * even when the collection listener has already been cleaned up.
   */
  pushOwnedList(list: ShoppingList): void;
  /** Triggers a debounced merge of owned + shared lists and emits on listsSubject. */
  mergeLists(): void;
}

/**
 * FirebaseCrudService
 *
 * Handles all Firestore create / update / delete operations for articles and
 * lists, extracted from FirebaseDataService.
 *
 * Extracted methods:
 *   - createArticleInFirebase
 *   - updateArticleInFirebase
 *   - deleteArticleInFirebase
 *   - createListInFirebase
 *   - updateListInFirebase
 *   - deleteListInFirebase
 *   - getArticlesForUser
 *
 * Owned state: none — stateless; all shared state is accessed via context.
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseCrudService {

  private readonly SHARED_USER_ID = 'shared-shoplisl-user';
  private context!: CrudServiceContext;

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private logger: LoggerService,
    private quotaMonitor: QuotaMonitorService,
    private mergeService: FirebaseMergeService
  ) {}

  /** Called once by FirebaseDataService in its constructor. */
  setContext(ctx: CrudServiceContext): void {
    this.context = ctx;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private getUserBasePath(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No authenticated user, using shared user ID');
      return `users/${this.SHARED_USER_ID}`;
    }
    return `users-v2/${userId}`;
  }

  // ── Article CRUD ──────────────────────────────────────────────────────────

  async createArticleInFirebase(articleData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    // Phase 8: Articles are always created in the creator's collection
    const basePath = this.getUserBasePath();
    this.logger.info('data', `Creating article in creator's path: ${basePath}/articles`);

    const docRef = await addDoc(collection(this.firestore, `${basePath}/articles`), articleData);
    this.logger.info('data', `✅ Article created with ID: ${docRef.id}`);

    // CRITICAL FIX: Add article to ownedArticles immediately (optimistic update)
    // This prevents timing issues where listener fires before Firestore commits
    const currentUserId = this.authService.getCurrentUserId();
    this.logger.info('data', `🔍 Optimistic update check: currentUserId=${currentUserId}`);

    if (currentUserId) {
      const newArticle: Article = {
        id: docRef.id,
        name: articleData.name,
        amount: articleData.amount || '',
        notes: articleData.notes || '',
        icon: articleData.icon || '',
        categoryId: articleData.categoryId || '',
        departmentId: articleData.departmentId || '',
        createdAt: articleData.createdAt || new Date(),
        updatedAt: articleData.updatedAt || new Date(),
        availableInShops: articleData.availableInShops || [],
        usageCount: articleData.usageCount || 0,
        ownerId: currentUserId,
        copiedFrom: articleData.copiedFrom
      };

      const alreadyExists = this.context.hasOwnedArticle(docRef.id);
      this.logger.info('data', `🔍 Article already exists? ${alreadyExists}`);

      if (!alreadyExists) {
        this.context.pushOwnedArticle(newArticle);
        this.logger.info('data', `➕ Optimistically added article to ownedArticles: ${newArticle.name}`);

        // Trigger merge to update UI immediately
        this.context.mergeArticles();
        this.logger.info('data', `✅ mergeArticles() called - UI should update now`);
      } else {
        this.logger.warn('data', `⚠️ Article ${docRef.id} already in ownedArticles, skipping optimistic update`);
      }
    } else {
      this.logger.error('data', `❌ No currentUserId - optimistic update SKIPPED!`);
    }

    return docRef.id;
  }

  async updateArticleInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    await updateDoc(doc(this.firestore, `${basePath}/articles/${id}`), updateData);
  }

  async deleteArticleInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    this.logger.info('data', `🗑️ deleteArticleInFirebase: DELETE ${basePath}/articles/${id}`);
    await deleteDoc(doc(this.firestore, `${basePath}/articles/${id}`));
    this.logger.info('data', `✅ deleteArticleInFirebase: success for ${id}`);
  }

  // ── List CRUD ─────────────────────────────────────────────────────────────

  async createListInFirebase(listData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    // Convert itemStates from application format (Date objects) to Firestore format (Timestamps)
    const firestoreData = { ...listData };
    if (firestoreData.itemStates) {
      firestoreData.itemStates = this.mergeService.convertItemStatesToFirestore(firestoreData.itemStates);
    }

    const basePath = this.getUserBasePath();
    const docRef = await addDoc(collection(this.firestore, `${basePath}/lists`), firestoreData);

    // Optimistic update: add to ownedLists immediately so the UI shows the new list
    // without waiting for the collection listener (which may already be cleaned up).
    // Uses original listData (Date objects), not firestoreData (Timestamps).
    const newList: ShoppingList = {
      id: docRef.id,
      name: listData.name,
      color: listData.color,
      icon: listData.icon,
      shopId: listData.shopId,
      articleIds: listData.articleIds || [],
      itemStates: listData.itemStates || {},
      departmentOrder: listData.departmentOrder,
      createdAt: listData.createdAt instanceof Date ? listData.createdAt : new Date(),
      updatedAt: listData.updatedAt instanceof Date ? listData.updatedAt : new Date(),
      ownerId: listData.ownerId || this.authService.getCurrentUserId() || '',
      sharedWith: listData.sharedWith || []
    };
    this.context.pushOwnedList(newList);
    this.context.mergeLists();
    this.logger.info('data', `➕ Optimistically added list to ownedLists: ${newList.name} (${docRef.id})`);

    return docRef.id;
  }

  async updateListInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    try {
      // Convert itemStates from application format (Date objects) to Firestore format (Timestamps)
      // This is CRITICAL for persistence of history data
      const firestoreData = { ...updateData };
      if (firestoreData.itemStates) {
        this.logger.debug('data', `Converting ${Object.keys(firestoreData.itemStates).length} itemStates for Firebase write`);
        firestoreData.itemStates = this.mergeService.convertItemStatesToFirestore(firestoreData.itemStates);
      }

      // Phase 8: Use owner's path for shared lists
      // Find the list to get its ownerId
      const currentLists = this.context.getCurrentLists();
      const list = currentLists.find(l => l.id === id);

      let listPath: string;
      if (list && list.ownerId) {
        // Use the owner's path (works for both owned and shared lists)
        listPath = `users-v2/${list.ownerId}/lists/${id}`;
      } else {
        // Fallback to current user's path
        const basePath = this.getUserBasePath();
        listPath = `${basePath}/lists/${id}`;
      }

      this.logger.info('data', `Writing to Firebase: ${listPath}`);
      if (firestoreData.articleIds) {
        this.logger.info('data', `📝 articleIds being written: [${firestoreData.articleIds.join(', ')}] (${firestoreData.articleIds.length} total)`);
      }

      // Mark this write so listener knows to preserve optimistic updates
      this.context.markMergeWrite(id);

      await updateDoc(doc(this.firestore, listPath), firestoreData);
      this.logger.info('data', `✅ Firebase write SUCCESS for list ${id}`);
    } catch (error: any) {
      this.logger.error('data', `❌ Firebase write FAILED for list ${id}`, error);
      this.logger.error('data', `Error code: ${error.code}, message: ${error.message}`);
      throw error; // Re-throw so caller can handle
    }
  }

  async deleteListInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    await deleteDoc(doc(this.firestore, `${basePath}/lists/${id}`));
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /**
   * Load all articles for a specific user.
   * Used by cleanup scripts to load collaborator articles.
   */
  async getArticlesForUser(userId: string): Promise<Article[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const snapshot = await getDocs(collection(this.firestore, `users-v2/${userId}/articles`));
    this.quotaMonitor.trackRead('Get Articles For User', snapshot.size, { userId });
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
        usageCount: data['usageCount'] || 0,
        ownerId: data['ownerId'] || userId,
        copiedFrom: data['copiedFrom'] || undefined
      });
    });
    return articles;
  }
}
