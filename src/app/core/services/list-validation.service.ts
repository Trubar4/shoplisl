import { Injectable } from '@angular/core';
import { ShoppingList } from '../models';
import { LoggerService } from './logger.service';

/**
 * Result of list validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * List Validation Service
 *
 * Validates that articleIds and itemStates arrays stay synchronized.
 * Provides repair functionality to fix inconsistencies automatically.
 *
 * Use cases:
 * - Pre-save validation to prevent inconsistent data in Firebase
 * - Post-load validation to detect and repair corrupted data
 * - Development debugging to identify sync issues
 */
@Injectable({
  providedIn: 'root'
})
export class ListValidationService {
  constructor(private logger: LoggerService) {}

  /**
   * Validate that articleIds and itemStates are in sync
   *
   * Checks:
   * - All articleIds have corresponding itemStates
   * - All itemStates have corresponding articleIds
   * - No temporary article IDs (warnings only)
   *
   * @param list The list to validate
   * @returns Validation result with errors and warnings
   */
  validateList(list: ShoppingList): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const articleIds = new Set(list.articleIds || []);
    const itemStateKeys = new Set(Object.keys(list.itemStates || {}));

    // Check for articleIds not in itemStates (orphaned in articleIds)
    for (const articleId of articleIds) {
      if (!itemStateKeys.has(articleId)) {
        result.errors.push(`Article ${articleId} in articleIds but missing from itemStates`);
        result.isValid = false;
      }
    }

    // Check for itemStates not in articleIds (orphaned in itemStates)
    for (const articleId of itemStateKeys) {
      if (!articleIds.has(articleId)) {
        result.errors.push(`Article ${articleId} in itemStates but missing from articleIds`);
        result.isValid = false;
      }
    }

    // Check for temp articles (warning only, not an error)
    const tempArticlesInIds: string[] = [];
    const tempArticlesInStates: string[] = [];

    for (const articleId of articleIds) {
      if (articleId.startsWith('temp_')) {
        tempArticlesInIds.push(articleId);
      }
    }

    for (const articleId of itemStateKeys) {
      if (articleId.startsWith('temp_') && !tempArticlesInIds.includes(articleId)) {
        tempArticlesInStates.push(articleId);
      }
    }

    if (tempArticlesInIds.length > 0) {
      result.warnings.push(`Found ${tempArticlesInIds.length} temporary article(s) in articleIds: ${tempArticlesInIds.join(', ')}`);
    }

    if (tempArticlesInStates.length > 0) {
      result.warnings.push(`Found ${tempArticlesInStates.length} temporary article(s) in itemStates: ${tempArticlesInStates.join(', ')}`);
    }

    // Log results
    if (!result.isValid) {
      this.logger.error('validation', `List validation FAILED for "${list.name}" (${list.id}):`, {
        errors: result.errors,
        warnings: result.warnings,
        articleIds: list.articleIds,
        itemStateKeys: Object.keys(list.itemStates)
      });
    } else if (result.warnings.length > 0) {
      this.logger.warn('validation', `List validation warnings for "${list.name}" (${list.id}):`, result.warnings);
    } else {
      this.logger.debug('validation', `List validation passed for "${list.name}" (${list.id})`);
    }

    return result;
  }

  /**
   * Fix inconsistencies in a list
   *
   * Strategy:
   * - Remove temporary articles from both arrays
   * - Keep only articles that exist in both articleIds and itemStates
   * - For articles in articleIds but not itemStates: create default itemState
   * - For articles in itemStates but not articleIds: remove from itemStates
   *
   * @param list The list to repair
   * @returns Repaired list with consistent articleIds and itemStates
   */
  repairList(list: ShoppingList): ShoppingList {
    const articleIds = new Set(list.articleIds || []);
    const itemStateKeys = new Set(Object.keys(list.itemStates || {}));

    this.logger.info('validation', `Repairing list "${list.name}" (${list.id})`);
    this.logger.debug('validation', `  Before: ${articleIds.size} articleIds, ${itemStateKeys.size} itemStates`);

    // Create repaired versions
    const repairedArticleIds: string[] = [];
    const repairedItemStates: typeof list.itemStates = {};

    // Include articles that are valid (not temp) and in articleIds
    for (const articleId of articleIds) {
      // Skip temp articles
      if (articleId.startsWith('temp_')) {
        this.logger.debug('validation', `  Removing temp article: ${articleId}`);
        continue;
      }

      repairedArticleIds.push(articleId);

      if (itemStateKeys.has(articleId)) {
        // Article has itemState, keep it
        repairedItemStates[articleId] = list.itemStates[articleId];
      } else {
        // Article missing itemState, create default
        this.logger.warn('validation', `  Creating default itemState for orphaned article: ${articleId}`);
        repairedItemStates[articleId] = {
          articleId,
          isChecked: false,
          addedAt: new Date(),
        };
      }
    }

    // Log orphaned itemStates (will be removed)
    for (const articleId of itemStateKeys) {
      if (!articleIds.has(articleId) || articleId.startsWith('temp_')) {
        this.logger.debug('validation', `  Removing orphaned itemState: ${articleId}`);
      }
    }

    this.logger.info('validation', `  After: ${repairedArticleIds.length} articleIds, ${Object.keys(repairedItemStates).length} itemStates`);

    return {
      ...list,
      articleIds: repairedArticleIds,
      itemStates: repairedItemStates,
      updatedAt: new Date(), // Mark as updated
    };
  }

  /**
   * Validate multiple lists at once
   *
   * Useful for batch validation operations
   *
   * @param lists Array of lists to validate
   * @returns Array of validation results (same order as input)
   */
  validateLists(lists: ShoppingList[]): ValidationResult[] {
    return lists.map(list => this.validateList(list));
  }

  /**
   * Get statistics about validation results
   *
   * @param results Array of validation results
   * @returns Summary statistics
   */
  getValidationStatistics(results: ValidationResult[]): {
    total: number;
    valid: number;
    invalid: number;
    withWarnings: number;
    totalErrors: number;
    totalWarnings: number;
  } {
    return {
      total: results.length,
      valid: results.filter(r => r.isValid).length,
      invalid: results.filter(r => !r.isValid).length,
      withWarnings: results.filter(r => r.warnings.length > 0).length,
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    };
  }
}
