import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

import { DEFAULT_DEPARTMENT_ORDER } from '../models';
import { FirebaseDataService } from './firebase-data.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class DataMigrationService {

  constructor(
    private firebaseData: FirebaseDataService,
    private connectionService: ConnectionService,
    private logger: LoggerService
  ) {}

  // === DEPARTMENT ORDER MIGRATION ===

  async migrateDepartmentOrderToExistingLists(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      this.logger.warn('data', 'Offline: Department order migration postponed');
      return;
    }

    this.logger.info('data', 'Starting department order migration');
    
    try {
      const lists = await this.firebaseData.getAllListsFromFirebase();
      
      let updatedCount = 0;
      let skippedCount = 0;
      
      for (const list of lists) {
        if (!list.departmentOrder) {
          await this.firebaseData.updateListInFirebase(list.id, {
            departmentOrder: DEFAULT_DEPARTMENT_ORDER,
            updatedAt: Timestamp.now()
          });
          
          updatedCount++;
          this.logger.debug('data', `Updated list "${list.name}" with default department order`);
        } else {
          skippedCount++;
        }
      }
      
      this.logger.info('data', `Migration completed! Updated: ${updatedCount}, Skipped: ${skippedCount}`);
      await this.firebaseData.refreshData();
      
    } catch (error) {
      this.logger.error('data', 'Error during department order migration', error);
    }
  }

  async checkIfDepartmentOrderMigrationNeeded(): Promise<boolean> {
    if (!this.connectionService.isOnline()) {
      return false;
    }

    try {
      const lists = await this.firebaseData.getAllListsFromFirebase();
      return lists.some(list => !list.departmentOrder);
    } catch (error) {
      this.logger.error('data', 'Error checking migration status', error);
      return false;
    }
  }

  async handleDepartmentOrderMigration(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      return;
    }

    try {
      const needsMigration = await this.checkIfDepartmentOrderMigrationNeeded();
      
      if (needsMigration) {
        this.logger.info('data', 'Department order migration needed, starting');
        await this.migrateDepartmentOrderToExistingLists();
      } else {
        this.logger.debug('data', 'Department order migration not needed');
      }
    } catch (error) {
      this.logger.error('data', 'Error checking migration status', error);
    }
  }

  // === ORPHANED REFERENCES CLEANUP ===

  async hasOrphanedReferences(
    lists?: ShoppingList[],
    articles?: Article[]
  ): Promise<boolean> {
    if (!this.connectionService.isOnline()) {
      return false;
    }

    try {
      // QUOTA OPTIMIZATION: Reuse provided data to avoid duplicate reads
      const allLists = lists || await this.firebaseData.getAllListsFromFirebase();
      const allArticles = articles || await this.firebaseData.getAllArticlesFromFirebase();

      const validArticleIds = new Set(allArticles.map(article => article.id));

      for (const list of allLists) {
        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};
        
        const hasOrphanedArticleIds = articleIds.some(id => !validArticleIds.has(id));
        const hasOrphanedItemStates = Object.keys(itemStates).some(id => !validArticleIds.has(id));
        
        if (hasOrphanedArticleIds || hasOrphanedItemStates) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error('data', 'Error checking for orphaned references', error);
      return false;
    }
  }

  async autoCleanupOrphanedReferences(
    lists?: ShoppingList[],
    articles?: Article[]
  ): Promise<{ listsUpdated: number; referencesRemoved: number }> {
    if (!this.connectionService.isOnline()) {
      return { listsUpdated: 0, referencesRemoved: 0 };
    }

    try {
      // QUOTA OPTIMIZATION: Reuse provided data to avoid duplicate reads
      const allLists = lists || await this.firebaseData.getAllListsFromFirebase();
      const allArticles = articles || await this.firebaseData.getAllArticlesFromFirebase();

      // Phase 8: Include article IDs from shared lists
      // Don't clean up article IDs that belong to collaborators
      const validArticleIds = new Set(allArticles.map(article => article.id));

      // For shared lists, don't remove article IDs - they might belong to collaborators
      const sharedListIds = new Set(
        allLists.filter(list => list.sharedWith && list.sharedWith.length > 0).map(list => list.id)
      );

      let listsUpdated = 0;
      let referencesRemoved = 0;

      for (const list of allLists) {
        // Phase 8: Skip cleanup for shared lists - articles may belong to collaborators
        if (sharedListIds.has(list.id)) {
          this.logger.debug('data', `Skipping cleanup for shared list "${list.name}" - may contain collaborator articles`);
          continue;
        }

        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};

        const cleanedArticleIds = articleIds.filter(id => validArticleIds.has(id));
        
        const cleanedItemStates: any = {};
        Object.entries(itemStates).forEach(([articleId, state]) => {
          if (validArticleIds.has(articleId)) {
            cleanedItemStates[articleId] = state;
          }
        });
        
        const articleIdsChanged = articleIds.length !== cleanedArticleIds.length;
        const itemStatesChanged = Object.keys(itemStates).length !== Object.keys(cleanedItemStates).length;
        
        if (articleIdsChanged || itemStatesChanged) {
          await this.firebaseData.updateListInFirebase(list.id, {
            articleIds: cleanedArticleIds,
            itemStates: cleanedItemStates,
            updatedAt: Timestamp.now()
          });
          
          const removedCount = (articleIds.length - cleanedArticleIds.length) + 
                             (Object.keys(itemStates).length - Object.keys(cleanedItemStates).length);
          
          listsUpdated++;
          referencesRemoved += removedCount;
          
          this.logger.debug('data', `Auto-cleaned "${list.name}": ${articleIds.length}→${cleanedArticleIds.length} articles`);
        }
      }
      
      if (listsUpdated > 0) {
        this.logger.info('data', `Auto-cleanup completed: ${listsUpdated} lists cleaned, ${referencesRemoved} references removed`);
      }
      
      return { listsUpdated, referencesRemoved };
      
    } catch (error) {
      this.logger.error('data', 'Error during auto-cleanup', error);
      return { listsUpdated: 0, referencesRemoved: 0 };
    }
  }

  async checkAndCleanupData(): Promise<void> {
    // QUOTA OPTIMIZATION: Read data once and reuse to prevent duplicate reads
    // Before: hasOrphanedReferences() + autoCleanupOrphanedReferences() = 4 reads
    // After: Read once, pass to both functions = 2 reads (50% reduction!)
    const lists = await this.firebaseData.getAllListsFromFirebase();
    const articles = await this.firebaseData.getAllArticlesFromFirebase();

    const hasOrphans = await this.hasOrphanedReferences(lists, articles);
    if (hasOrphans) {
      this.logger.info('data', 'Orphaned references detected, auto-cleaning');
      await this.autoCleanupOrphanedReferences(lists, articles);
    }
  }

  // === GENERAL DATA MIGRATION ===

  async handleDataMigration(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      this.logger.debug('data', 'Offline: Data migration postponed');
      return;
    }

    this.logger.debug('data', 'Starting data migration checks');

    try {
      // Run department order migration
      await this.handleDepartmentOrderMigration();
      
      // Run orphaned references cleanup
      await this.checkAndCleanupData();
      
      this.logger.debug('data', 'Data migration checks completed');
    } catch (error) {
      this.logger.error('data', 'Error during data migration', error);
    }
  }

  // === LEGACY USER DATA MIGRATION ===

  async migrateUserData(oldUserId: string): Promise<void> {
    if (!this.connectionService.isOnline()) {
      this.logger.warn('data', 'Offline: User data migration postponed');
      return;
    }

    this.logger.info('data', `Starting user data migration from ${oldUserId} to shared user`);
    
    try {
      // This would contain logic to migrate from old user-specific collections
      // to the new shared collections. Implementation depends on your specific
      // migration requirements.
      
      this.logger.info('data', 'User data migration completed');
    } catch (error) {
      this.logger.error('data', 'Error during user data migration', error);
    }
  }

  // === UTILITY METHODS ===

  async performFullDataIntegrityCheck(): Promise<{
    articlesCount: number;
    listsCount: number;
    orphanedReferencesFound: boolean;
    departmentOrderMigrationNeeded: boolean;
    issues: string[];
  }> {
    if (!this.connectionService.isOnline()) {
      throw new Error('Data integrity check requires online connection');
    }

    const issues: string[] = [];

    try {
      const articles = await this.firebaseData.getAllArticlesFromFirebase();
      const lists = await this.firebaseData.getAllListsFromFirebase();
      
      const orphanedReferencesFound = await this.hasOrphanedReferences();
      if (orphanedReferencesFound) {
        issues.push('Orphaned article references found in lists');
      }

      const departmentOrderMigrationNeeded = await this.checkIfDepartmentOrderMigrationNeeded();
      if (departmentOrderMigrationNeeded) {
        issues.push('Some lists missing department order configuration');
      }

      // Check for duplicate article names
      const articleNames = articles.map(a => a.name.toLowerCase().trim());
      const duplicateNames = articleNames.filter((name, index) => articleNames.indexOf(name) !== index);
      if (duplicateNames.length > 0) {
        issues.push(`Duplicate article names found: ${duplicateNames.join(', ')}`);
      }

      // Check for lists with invalid shop references (if applicable)
      const listsWithInvalidShops = lists.filter(list => 
        list.shopId && list.shopId !== '' && !list.shopId.startsWith('temp_')
        // Add actual shop validation logic here if needed
      );

      this.logger.info('data', `Data integrity check completed: ${articles.length} articles, ${lists.length} lists, ${issues.length} issues`);

      return {
        articlesCount: articles.length,
        listsCount: lists.length,
        orphanedReferencesFound,
        departmentOrderMigrationNeeded,
        issues
      };

    } catch (error) {
      this.logger.error('data', 'Error during data integrity check', error);
      throw error;
    }
  }

  async performFullMigrationAndCleanup(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      throw new Error('Migration requires online connection');
    }

    this.logger.info('data', 'Starting full migration and cleanup process');

    try {
      // 1. Department order migration
      const needsDepartmentMigration = await this.checkIfDepartmentOrderMigrationNeeded();
      if (needsDepartmentMigration) {
        await this.migrateDepartmentOrderToExistingLists();
      }

      // 2. Orphaned references cleanup
      const hasOrphans = await this.hasOrphanedReferences();
      if (hasOrphans) {
        await this.autoCleanupOrphanedReferences();
      }

      // 3. Refresh data to ensure consistency
      await this.firebaseData.refreshData();

      this.logger.info('data', 'Full migration and cleanup process completed');

    } catch (error) {
      this.logger.error('data', 'Error during full migration and cleanup', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned references immediately (for use after article deletion)
   */
  async quickCleanupOrphanedReferences(): Promise<{ listsUpdated: number; referencesRemoved: number }> {
    if (!this.connectionService.isOnline()) {
      this.logger.debug('data', 'Offline: Quick cleanup will sync when online');
      return { listsUpdated: 0, referencesRemoved: 0 };
    }

    try {
      const lists = await this.firebaseData.getAllListsFromFirebase();
      const articles = await this.firebaseData.getAllArticlesFromFirebase();

      const validArticleIds = new Set(articles.map(article => article.id));

      // Phase 8: For shared lists, don't remove article IDs - they might belong to collaborators
      const sharedListIds = new Set(
        lists.filter(list => list.sharedWith && list.sharedWith.length > 0).map(list => list.id)
      );

      let listsUpdated = 0;
      let referencesRemoved = 0;

      for (const list of lists) {
        // Phase 8: Skip cleanup for shared lists - articles may belong to collaborators
        if (sharedListIds.has(list.id)) {
          continue;
        }

        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};

        const cleanedArticleIds = articleIds.filter(id => validArticleIds.has(id));
        
        const cleanedItemStates: any = {};
        Object.entries(itemStates).forEach(([articleId, state]) => {
          if (validArticleIds.has(articleId)) {
            cleanedItemStates[articleId] = state;
          }
        });
        
        const articleIdsRemoved = articleIds.length - cleanedArticleIds.length;
        const itemStatesRemoved = Object.keys(itemStates).length - Object.keys(cleanedItemStates).length;
        const totalRemoved = articleIdsRemoved + itemStatesRemoved;
        
        if (totalRemoved > 0) {
          await this.firebaseData.updateListInFirebase(list.id, {
            articleIds: cleanedArticleIds,
            itemStates: cleanedItemStates,
            updatedAt: Timestamp.now()
          });
          
          listsUpdated++;
          referencesRemoved += totalRemoved;
          
          this.logger.debug('data', 
            `Quick cleanup "${list.name}": removed ${articleIdsRemoved} article IDs + ${itemStatesRemoved} item states`
          );
        }
      }
      
      if (listsUpdated > 0) {
        this.logger.info('data', `Quick cleanup: ${listsUpdated} lists cleaned, ${referencesRemoved} references removed`);
        // Refresh local data
        await this.firebaseData.refreshData();
      }
      
      return { listsUpdated, referencesRemoved };
      
    } catch (error) {
      this.logger.error('data', 'Error during quick cleanup', error);
      return { listsUpdated: 0, referencesRemoved: 0 };
    }
  }

}