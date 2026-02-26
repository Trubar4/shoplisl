import { Injectable, inject } from '@angular/core';
import { Article, ShoppingList } from '../models';
import { LoggerService } from './logger.service';

/**
 * RecommendationsService
 *
 * Computes article recommendations for the "Vorschläge" feature in shopping mode.
 * All computation is purely local — no Firestore reads, no side effects.
 * Data source: ListItemState.history[] (CheckEvent arrays, 365-day retention).
 *
 * Two recommendation categories:
 * 1. "Häufig gekaufte Artikel"  — articles present in ≥1/3 of all shopping days
 * 2. "Schon lange nicht mehr gekauft" — articles with ≥2 checks and last check 14–90 days ago
 *
 * Note: "Removed articles" (in itemStates but no longer in catalog) are intentionally
 * excluded from MVP recommendations — see PLAN.md for future iteration idea.
 *
 * Logging: enable with  logger.setTopics('recommendations'); logger.setLevel('debug')
 */
@Injectable({
  providedIn: 'root'
})
export class RecommendationsService {

  private readonly logger = inject(LoggerService);

  private readonly MIN_ARTICLES_PER_SHOPPING_DAY = 1; // TEST: production value is 3
  private readonly FREQUENT_MIN_RATIO = 1 / 10;       // TEST: production value is 1 / 3
  private readonly MIN_CHECKS_FOR_LONG_NOT_BOUGHT = 1; // TEST: production value is 2
  private readonly LONG_NOT_BOUGHT_MIN_DAYS = 0;       // TEST: production value is 14
  private readonly LONG_NOT_BOUGHT_MAX_DAYS = 365;     // TEST: production value is 90
  private readonly RECENTLY_CHECKED_MINUTES = 60;

  /**
   * Returns articles that were checked on at least 1/3 of all shopping days.
   * A "shopping day" is a calendar day on which ≥3 unique articles were checked.
   */
  getFrequentArticles(list: ShoppingList, catalog: Article[]): Article[] {
    const itemStates = list.itemStates || {};
    const catalogSet = new Set(catalog.map(a => a.id));
    const allIds = Object.keys(itemStates);

    // Step 1: Collect all checked events keyed by article id
    const checkedEventsByArticle = new Map<string, Date[]>();
    let totalCheckedEvents = 0;
    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) continue;
      const checkedDates = state.history
        .filter(e => e.action === 'checked')
        .map(e => this.toDate(e.timestamp));
      if (checkedDates.length > 0) {
        checkedEventsByArticle.set(articleId, checkedDates);
        totalCheckedEvents += checkedDates.length;
      }
    }

    this.logger.debug('recommendations',
      `[getFrequent] itemStates: ${allIds.length} entries, ` +
      `${checkedEventsByArticle.size} with checked events, ` +
      `${totalCheckedEvents} total checked events`
    );

    // Step 2: Build a map of date-string → Set<articleId> for all checked events
    const articlesByDay = new Map<string, Set<string>>();
    for (const [articleId, dates] of checkedEventsByArticle.entries()) {
      for (const date of dates) {
        const day = date.toDateString();
        if (!articlesByDay.has(day)) {
          articlesByDay.set(day, new Set());
        }
        articlesByDay.get(day)!.add(articleId);
      }
    }

    // Step 3: Keep only shopping days (≥N unique articles checked)
    const shoppingDays = Array.from(articlesByDay.entries())
      .filter(([, articles]) => articles.size >= this.MIN_ARTICLES_PER_SHOPPING_DAY);

    this.logger.debug('recommendations',
      `[getFrequent] ${articlesByDay.size} calendar days with any check, ` +
      `${shoppingDays.length} qualify as shopping days (threshold: ≥${this.MIN_ARTICLES_PER_SHOPPING_DAY} article/day)`
    );

    if (shoppingDays.length === 0) {
      this.logger.debug('recommendations', '[getFrequent] no shopping days → result: 0 articles');
      return [];
    }

    const totalShoppingDays = shoppingDays.length;

    // Step 4: Count how many shopping days each article appeared in
    const articleDayCount = new Map<string, number>();
    for (const [, articles] of shoppingDays) {
      for (const articleId of articles) {
        articleDayCount.set(articleId, (articleDayCount.get(articleId) ?? 0) + 1);
      }
    }

    // Step 5: Collect candidates where ratio ≥ threshold
    const candidates: string[] = [];
    for (const [articleId, count] of articleDayCount.entries()) {
      const ratio = count / totalShoppingDays;
      if (ratio >= this.FREQUENT_MIN_RATIO) {
        candidates.push(articleId);
        this.logger.debug('recommendations',
          `[getFrequent] candidate: ${articleId} (${count}/${totalShoppingDays} days = ${(ratio * 100).toFixed(0)}%)`
        );
      }
    }

    this.logger.debug('recommendations',
      `[getFrequent] ${candidates.length} candidates before exclusion filter`
    );

    const result = this.applyExclusionFilter(candidates, list, catalog, catalogSet, 'getFrequent');
    this.logger.debug('recommendations', `[getFrequent] result: ${result.length} article(s)`);
    return result;
  }

  /**
   * Returns articles that have ≥N checks in this list's history and whose last
   * check was between MIN and MAX days ago — indicating a recurring but overdue item.
   */
  getLongNotBoughtArticles(list: ShoppingList, catalog: Article[]): Article[] {
    const itemStates = list.itemStates || {};
    const catalogSet = new Set(catalog.map(a => a.id));
    const now = Date.now();
    const msPerDay = 86_400_000;

    const candidates: string[] = [];

    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) {
        this.logger.debug('recommendations', `[getLongNotBought] skip "${articleId}" — no history`);
        continue;
      }

      const checkedEvents = state.history.filter(e => e.action === 'checked');

      if (checkedEvents.length < this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT) {
        this.logger.debug('recommendations',
          `[getLongNotBought] skip "${state.articleName ?? articleId}" — only ${checkedEvents.length} check(s), need ≥${this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT}`
        );
        continue;
      }

      // history is stored most-recent-first (see HistoryService.addEventToHistory)
      const lastCheckedDate = this.toDate(checkedEvents[0].timestamp);
      const daysSinceLast = (now - lastCheckedDate.getTime()) / msPerDay;

      if (daysSinceLast >= this.LONG_NOT_BOUGHT_MIN_DAYS &&
          daysSinceLast <= this.LONG_NOT_BOUGHT_MAX_DAYS) {
        candidates.push(articleId);
        this.logger.debug('recommendations',
          `[getLongNotBought] candidate: "${state.articleName ?? articleId}" — ` +
          `${checkedEvents.length} check(s), last ${daysSinceLast.toFixed(1)} days ago ` +
          `(window: ${this.LONG_NOT_BOUGHT_MIN_DAYS}–${this.LONG_NOT_BOUGHT_MAX_DAYS} days)`
        );
      } else {
        this.logger.debug('recommendations',
          `[getLongNotBought] skip "${state.articleName ?? articleId}" — ` +
          `last check ${daysSinceLast.toFixed(1)} days ago, outside window ` +
          `(${this.LONG_NOT_BOUGHT_MIN_DAYS}–${this.LONG_NOT_BOUGHT_MAX_DAYS} days)`
        );
      }
    }

    this.logger.debug('recommendations',
      `[getLongNotBought] ${candidates.length} candidates before exclusion filter`
    );

    const result = this.applyExclusionFilter(candidates, list, catalog, catalogSet, 'getLongNotBought');
    this.logger.debug('recommendations', `[getLongNotBought] result: ${result.length} article(s)`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Filters candidate article IDs to only those that:
   * - exist in the user's catalog
   * - are NOT already on the list (articleIds)
   * - are NOT checked within the last 60 minutes
   *
   * Returns the matching Article objects sorted by name.
   */
  private applyExclusionFilter(
    candidateIds: string[],
    list: ShoppingList,
    catalog: Article[],
    catalogSet: Set<string>,
    logPrefix: string
  ): Article[] {
    const onListSet = new Set(list.articleIds || []);
    const now = Date.now();
    const recentlyCheckedMs = this.RECENTLY_CHECKED_MINUTES * 60 * 1000;
    const catalogById = new Map(catalog.map(a => [a.id, a]));

    return candidateIds
      .filter(id => {
        const name = list.itemStates[id]?.articleName ?? id;

        if (!catalogSet.has(id)) {
          this.logger.debug('recommendations', `[${logPrefix}] exclude "${name}" — not in catalog`);
          return false;
        }
        if (onListSet.has(id)) {
          this.logger.debug('recommendations', `[${logPrefix}] exclude "${name}" — already on list`);
          return false;
        }

        const state = list.itemStates[id];
        if (state?.isChecked && state.checkedAt) {
          const checkedAt = this.toDate(state.checkedAt).getTime();
          if (now - checkedAt < recentlyCheckedMs) {
            this.logger.debug('recommendations',
              `[${logPrefix}] exclude "${name}" — checked within last ${this.RECENTLY_CHECKED_MINUTES} min`
            );
            return false;
          }
        }

        this.logger.debug('recommendations', `[${logPrefix}] ✓ include "${name}"`);
        return true;
      })
      .map(id => catalogById.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Normalises all timestamp formats that can appear after a Firestore → NgRx round-trip:
   * - native Date
   * - Firestore Timestamp (has toDate() method, from the SDK)
   * - { _seconds, _nanoseconds } plain object (NgRx strips class methods on serialisation)
   * - { seconds, nanoseconds } plain object (alternate Firestore serialisation)
   * - ISO string or Unix ms number
   */
  private toDate(value: any): Date {
    if (value instanceof Date) return value;
    if (value && typeof value === 'object') {
      if (typeof value.toDate === 'function') return value.toDate();
      if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    }
    return new Date(value as string | number);
  }
}
