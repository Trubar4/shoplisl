import { Injectable, inject } from '@angular/core';
import { Firestore, collection, getDocs, doc, updateDoc, writeBatch, DocumentReference } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { ShoppingList, ListItemState } from '../models';

interface CleanupResult {
  listId: string;
  listName: string;
  totalItemStates: number;
  orphanedItemStates: number;
  fixedItemStates: number;
  removedItemStates: number;
  errors: string[];
}

interface CleanupSummary {
  totalLists: number;
  listsWithIssues: number;
  totalOrphaned: number;
  totalFixed: number;
  totalRemoved: number;
  results: CleanupResult[];
}

/**
 * ItemStateCleanupService
 *
 * Utility service to diagnose and fix corrupted itemStates in shopping lists.
 * Corrupted itemStates have empty articleName fields, typically caused by
 * race conditions or bugs in the article addition flow.
 *
 * Usage from browser console:
 *   // Inject and run
 *   const cleanup = window.ng.getComponent(document.querySelector('app-root')).injector.get(ItemStateCleanupService);
 *
 *   // Or use the global helper (if registered)
 *   itemStateCleanup.analyze();     // Dry run - just report issues
 *   itemStateCleanup.fix();         // Fix issues by fetching article names
 *   itemStateCleanup.removeOrphans(); // Remove itemStates for non-existent articles
 */
@Injectable({
  providedIn: 'root'
})
export class ItemStateCleanupService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(LoggerService);

  constructor() {
    // Register global helper for console access
    if (typeof window !== 'undefined') {
      (window as any).itemStateCleanup = this;
    }
  }

  /**
   * Analyze all lists for corrupted itemStates (dry run)
   */
  async analyze(): Promise<CleanupSummary> {
    this.logger.info('data', '[Cleanup] Starting analysis of all lists...');
    console.log('🔍 Analyzing lists for corrupted itemStates...');

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      console.error('❌ User not authenticated');
      throw new Error('User not authenticated');
    }

    const summary: CleanupSummary = {
      totalLists: 0,
      listsWithIssues: 0,
      totalOrphaned: 0,
      totalFixed: 0,
      totalRemoved: 0,
      results: []
    };

    try {
      // Get all lists for the user
      const listsRef = collection(this.firestore, `users/${userId}/lists`);
      const listsSnapshot = await getDocs(listsRef);

      // Get all articles for the user (to check existence)
      const articlesRef = collection(this.firestore, `users/${userId}/articles`);
      const articlesSnapshot = await getDocs(articlesRef);
      const articlesMap = new Map<string, { id: string; name: string }>();
      articlesSnapshot.forEach(doc => {
        const data = doc.data();
        articlesMap.set(doc.id, { id: doc.id, name: data['name'] || '' });
      });

      console.log(`📦 Found ${listsSnapshot.size} lists and ${articlesMap.size} articles`);

      for (const listDoc of listsSnapshot.docs) {
        const listData = listDoc.data() as ShoppingList;
        const result = await this.analyzeList(listDoc.id, listData, articlesMap);

        summary.results.push(result);
        summary.totalLists++;

        if (result.orphanedItemStates > 0) {
          summary.listsWithIssues++;
          summary.totalOrphaned += result.orphanedItemStates;
        }
      }

      // Print summary
      console.log('\n📊 ANALYSIS SUMMARY');
      console.log('═══════════════════════════════════════');
      console.log(`Total lists analyzed: ${summary.totalLists}`);
      console.log(`Lists with issues: ${summary.listsWithIssues}`);
      console.log(`Total orphaned itemStates: ${summary.totalOrphaned}`);
      console.log('');

      if (summary.listsWithIssues > 0) {
        console.log('🔴 LISTS WITH ISSUES:');
        summary.results
          .filter(r => r.orphanedItemStates > 0)
          .forEach(r => {
            console.log(`  - "${r.listName}" (${r.listId}): ${r.orphanedItemStates} orphaned`);
          });
        console.log('');
        console.log('To fix these issues, run:');
        console.log('  itemStateCleanup.fix()         - Fill in missing articleNames');
        console.log('  itemStateCleanup.removeOrphans() - Remove itemStates for deleted articles');
      } else {
        console.log('✅ No issues found!');
      }

      return summary;

    } catch (error) {
      console.error('❌ Error during analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze a single list for issues
   */
  private async analyzeList(
    listId: string,
    listData: ShoppingList,
    articlesMap: Map<string, { id: string; name: string }>
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      listId,
      listName: listData.name || '(unnamed)',
      totalItemStates: 0,
      orphanedItemStates: 0,
      fixedItemStates: 0,
      removedItemStates: 0,
      errors: []
    };

    const itemStates = listData.itemStates || {};
    result.totalItemStates = Object.keys(itemStates).length;

    for (const [articleId, itemState] of Object.entries(itemStates)) {
      const state = itemState as ListItemState;

      // Check if articleName is missing
      if (!state.articleName) {
        result.orphanedItemStates++;

        // Check if article exists
        const article = articlesMap.get(articleId);
        if (article) {
          this.logger.debug('data', `[Cleanup] "${result.listName}": itemState ${articleId} missing name, article exists: "${article.name}"`);
        } else {
          this.logger.warn('data', `[Cleanup] "${result.listName}": itemState ${articleId} missing name, article NOT FOUND (ghost entry)`);
        }
      }
    }

    return result;
  }

  /**
   * Fix corrupted itemStates by fetching article names
   */
  async fix(): Promise<CleanupSummary> {
    this.logger.info('data', '[Cleanup] Starting fix operation...');
    console.log('🔧 Fixing corrupted itemStates...');

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      console.error('❌ User not authenticated');
      throw new Error('User not authenticated');
    }

    const summary: CleanupSummary = {
      totalLists: 0,
      listsWithIssues: 0,
      totalOrphaned: 0,
      totalFixed: 0,
      totalRemoved: 0,
      results: []
    };

    try {
      // Get all lists and articles
      const listsRef = collection(this.firestore, `users/${userId}/lists`);
      const listsSnapshot = await getDocs(listsRef);

      const articlesRef = collection(this.firestore, `users/${userId}/articles`);
      const articlesSnapshot = await getDocs(articlesRef);
      const articlesMap = new Map<string, { id: string; name: string }>();
      articlesSnapshot.forEach(doc => {
        const data = doc.data();
        articlesMap.set(doc.id, { id: doc.id, name: data['name'] || '' });
      });

      console.log(`📦 Found ${listsSnapshot.size} lists and ${articlesMap.size} articles`);

      for (const listDoc of listsSnapshot.docs) {
        const listData = listDoc.data() as ShoppingList;
        const result = await this.fixList(listDoc.id, listData, articlesMap, userId);

        summary.results.push(result);
        summary.totalLists++;

        if (result.orphanedItemStates > 0) {
          summary.listsWithIssues++;
          summary.totalOrphaned += result.orphanedItemStates;
          summary.totalFixed += result.fixedItemStates;
        }
      }

      // Print summary
      console.log('\n📊 FIX SUMMARY');
      console.log('═══════════════════════════════════════');
      console.log(`Total lists processed: ${summary.totalLists}`);
      console.log(`Lists with issues: ${summary.listsWithIssues}`);
      console.log(`Total orphaned itemStates: ${summary.totalOrphaned}`);
      console.log(`Total fixed: ${summary.totalFixed}`);
      console.log('');

      if (summary.totalFixed > 0) {
        console.log('✅ Fixed itemStates by adding missing articleNames');
      }

      const unfixable = summary.totalOrphaned - summary.totalFixed;
      if (unfixable > 0) {
        console.log(`⚠️ ${unfixable} itemStates could not be fixed (articles don't exist)`);
        console.log('Run itemStateCleanup.removeOrphans() to remove these ghost entries');
      }

      return summary;

    } catch (error) {
      console.error('❌ Error during fix:', error);
      throw error;
    }
  }

  /**
   * Fix a single list
   */
  private async fixList(
    listId: string,
    listData: ShoppingList,
    articlesMap: Map<string, { id: string; name: string }>,
    userId: string
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      listId,
      listName: listData.name || '(unnamed)',
      totalItemStates: 0,
      orphanedItemStates: 0,
      fixedItemStates: 0,
      removedItemStates: 0,
      errors: []
    };

    const itemStates = { ...(listData.itemStates || {}) };
    result.totalItemStates = Object.keys(itemStates).length;

    let hasChanges = false;

    for (const [articleId, itemState] of Object.entries(itemStates)) {
      const state = itemState as ListItemState;

      // Check if articleName is missing
      if (!state.articleName) {
        result.orphanedItemStates++;

        // Try to get article name
        const article = articlesMap.get(articleId);
        if (article && article.name) {
          // Fix it!
          itemStates[articleId] = {
            ...state,
            articleName: article.name
          };
          result.fixedItemStates++;
          hasChanges = true;
          console.log(`  ✅ Fixed "${result.listName}": ${articleId} → "${article.name}"`);
        } else {
          console.log(`  ⚠️ Cannot fix "${result.listName}": ${articleId} (article not found)`);
        }
      }
    }

    // Save changes if any
    if (hasChanges) {
      try {
        const listRef = doc(this.firestore, `users/${userId}/lists/${listId}`);
        await updateDoc(listRef, { itemStates });
        console.log(`  💾 Saved changes to "${result.listName}"`);
      } catch (error) {
        result.errors.push(`Failed to save: ${error}`);
        console.error(`  ❌ Failed to save "${result.listName}":`, error);
      }
    }

    return result;
  }

  /**
   * Remove itemStates for articles that no longer exist
   */
  async removeOrphans(): Promise<CleanupSummary> {
    this.logger.info('data', '[Cleanup] Starting orphan removal...');
    console.log('🗑️ Removing orphaned itemStates (articles that no longer exist)...');

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      console.error('❌ User not authenticated');
      throw new Error('User not authenticated');
    }

    const summary: CleanupSummary = {
      totalLists: 0,
      listsWithIssues: 0,
      totalOrphaned: 0,
      totalFixed: 0,
      totalRemoved: 0,
      results: []
    };

    try {
      // Get all lists and articles
      const listsRef = collection(this.firestore, `users/${userId}/lists`);
      const listsSnapshot = await getDocs(listsRef);

      const articlesRef = collection(this.firestore, `users/${userId}/articles`);
      const articlesSnapshot = await getDocs(articlesRef);
      const articleIds = new Set<string>();
      articlesSnapshot.forEach(doc => articleIds.add(doc.id));

      console.log(`📦 Found ${listsSnapshot.size} lists and ${articleIds.size} articles`);

      for (const listDoc of listsSnapshot.docs) {
        const listData = listDoc.data() as ShoppingList;
        const result = await this.removeOrphansFromList(listDoc.id, listData, articleIds, userId);

        summary.results.push(result);
        summary.totalLists++;

        if (result.removedItemStates > 0) {
          summary.listsWithIssues++;
          summary.totalRemoved += result.removedItemStates;
        }
      }

      // Print summary
      console.log('\n📊 REMOVAL SUMMARY');
      console.log('═══════════════════════════════════════');
      console.log(`Total lists processed: ${summary.totalLists}`);
      console.log(`Lists cleaned: ${summary.listsWithIssues}`);
      console.log(`Total orphaned itemStates removed: ${summary.totalRemoved}`);

      return summary;

    } catch (error) {
      console.error('❌ Error during removal:', error);
      throw error;
    }
  }

  /**
   * Remove orphans from a single list
   */
  private async removeOrphansFromList(
    listId: string,
    listData: ShoppingList,
    validArticleIds: Set<string>,
    userId: string
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      listId,
      listName: listData.name || '(unnamed)',
      totalItemStates: 0,
      orphanedItemStates: 0,
      fixedItemStates: 0,
      removedItemStates: 0,
      errors: []
    };

    const itemStates = { ...(listData.itemStates || {}) };
    const articleIds = [...(listData.articleIds || [])];
    result.totalItemStates = Object.keys(itemStates).length;

    const orphanedIds: string[] = [];

    // Find orphaned itemStates (no corresponding article)
    for (const articleId of Object.keys(itemStates)) {
      if (!validArticleIds.has(articleId)) {
        orphanedIds.push(articleId);
      }
    }

    if (orphanedIds.length === 0) {
      return result;
    }

    result.orphanedItemStates = orphanedIds.length;

    // Remove orphaned itemStates and articleIds
    for (const orphanId of orphanedIds) {
      delete itemStates[orphanId];
      const idxInArticleIds = articleIds.indexOf(orphanId);
      if (idxInArticleIds !== -1) {
        articleIds.splice(idxInArticleIds, 1);
      }
      result.removedItemStates++;
      console.log(`  🗑️ Removed orphan from "${result.listName}": ${orphanId}`);
    }

    // Save changes
    try {
      const listRef = doc(this.firestore, `users/${userId}/lists/${listId}`);
      await updateDoc(listRef, {
        itemStates,
        articleIds
      });
      console.log(`  💾 Saved changes to "${result.listName}"`);
    } catch (error) {
      result.errors.push(`Failed to save: ${error}`);
      console.error(`  ❌ Failed to save "${result.listName}":`, error);
    }

    return result;
  }
}
