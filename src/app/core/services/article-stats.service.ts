import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Article, ShoppingList, CheckEvent } from '../models';
import { selectAllLists } from '../../state/lists/lists.selectors';
import { AppState } from '../../state/app.state';

/**
 * Article Statistics Interface
 * Aggregated statistics for an article across all lists
 */
export interface ArticleStats {
  articleId: string;
  lastCheckedDate?: Date;
  lastAddedToListDate?: Date;
  numberOfChecks: number;
}

/**
 * Article Statistics Service
 *
 * Calculates article usage statistics by aggregating history data
 * from all lists in the system.
 *
 * Statistics include:
 * - Last checked date (most recent check across all lists)
 * - Last added to list date (most recent addition to any list)
 * - Total number of checks (sum across all lists)
 */
@Injectable({
  providedIn: 'root'
})
export class ArticleStatsService {
  constructor(private store: Store<AppState>) {}

  /**
   * Get statistics for a specific article
   */
  getArticleStats(articleId: string): Observable<ArticleStats> {
    return this.store.select(selectAllLists).pipe(
      map(lists => this.calculateArticleStats(articleId, lists))
    );
  }

  /**
   * Get statistics for all articles
   * Returns a map of articleId -> ArticleStats
   */
  getAllArticleStats(): Observable<Map<string, ArticleStats>> {
    return this.store.select(selectAllLists).pipe(
      map(lists => {
        const statsMap = new Map<string, ArticleStats>();

        // Collect all unique article IDs
        const articleIds = new Set<string>();
        lists.forEach(list => {
          list.articleIds.forEach(id => articleIds.add(id));
        });

        // Calculate stats for each article
        articleIds.forEach(articleId => {
          statsMap.set(articleId, this.calculateArticleStats(articleId, lists));
        });

        return statsMap;
      })
    );
  }

  /**
   * Calculate statistics for an article across all lists
   */
  private calculateArticleStats(articleId: string, lists: ShoppingList[]): ArticleStats {
    let lastCheckedDate: Date | undefined;
    let lastAddedToListDate: Date | undefined;
    let numberOfChecks = 0;

    lists.forEach(list => {
      // Check if article is in this list
      if (!list.articleIds.includes(articleId)) {
        return;
      }

      const itemState = list.itemStates[articleId];
      if (!itemState) {
        return;
      }

      // Track initial add to list using addedAt timestamp
      if (itemState.addedAt) {
        if (!lastAddedToListDate || itemState.addedAt > lastAddedToListDate) {
          lastAddedToListDate = itemState.addedAt;
        }
      }

      // Process history if available
      if (itemState.history && itemState.history.length > 0) {
        itemState.history.forEach((event: CheckEvent) => {
          if (event.action === 'checked') {
            numberOfChecks++;

            // Update lastCheckedDate
            if (!lastCheckedDate || event.timestamp > lastCheckedDate) {
              lastCheckedDate = event.timestamp;
            }
          } else if (event.action === 'unchecked') {
            // Track uncheck events as "adding to list" (put back on list)
            if (!lastAddedToListDate || event.timestamp > lastAddedToListDate) {
              lastAddedToListDate = event.timestamp;
            }
          }
        });
      } else {
        // Fallback: use checkedAt if no history available
        if (itemState.isChecked && itemState.checkedAt) {
          numberOfChecks++;
          if (!lastCheckedDate || itemState.checkedAt > lastCheckedDate) {
            lastCheckedDate = itemState.checkedAt;
          }
        }
      }
    });

    return {
      articleId,
      lastCheckedDate,
      lastAddedToListDate,
      numberOfChecks
    };
  }

  /**
   * Calculate statistics from history events
   */
  private calculateStatsFromHistory(history: CheckEvent[]): {
    totalChecks: number;
    lastCheckDate?: Date;
  } {
    let totalChecks = 0;
    let lastCheckDate: Date | undefined;

    history.forEach(event => {
      if (event.action === 'checked') {
        totalChecks++;
        if (!lastCheckDate || event.timestamp > lastCheckDate) {
          lastCheckDate = event.timestamp;
        }
      }
    });

    return { totalChecks, lastCheckDate };
  }
}
