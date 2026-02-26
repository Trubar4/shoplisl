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
 * Candidate rules:
 * - The article must still be on the list (in articleIds). Removed articles are never shown.
 * - The article must currently be checked off (isChecked = true). Unchecked articles are
 *   already visible as active items and need no separate recommendation.
 * - Tapping a recommendation unchecks the article so it re-appears as an active list item.
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

  /**
   * Returns articles that were checked on at least 1/3 of all shopping days.
   * A "shopping day" is a calendar day on which ≥N unique articles were checked.
   */
  getFrequentArticles(list: ShoppingList, catalog: Article[]): Article[] {
    const itemStates = list.itemStates || {};
    const catalogSet = new Set(catalog.map(a => a.id));

    // Step 1: Collect all checked events keyed by article id
    const checkedEventsByArticle = new Map<string, Date[]>();
    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) continue;
      const checkedDates = state.history
        .filter(e => e.action === 'checked')
        .map(e => this.toDate(e.timestamp));
      if (checkedDates.length > 0) {
        checkedEventsByArticle.set(articleId, checkedDates);
      }
    }

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

    if (shoppingDays.length === 0) {
      this.logger.debug('recommendations',
        `[frequent] ${Object.keys(itemStates).length} states, ` +
        `${checkedEventsByArticle.size} with checks, 0 shopping days → no candidates`
      );
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
      if (count / totalShoppingDays >= this.FREQUENT_MIN_RATIO) {
        candidates.push(articleId);
      }
    }

    this.logger.debug('recommendations',
      `[frequent] ${Object.keys(itemStates).length} states, ` +
      `${checkedEventsByArticle.size} with checks, ` +
      `${shoppingDays.length}/${articlesByDay.size} shopping days, ` +
      `${candidates.length} candidates`
    );

    return this.applyExclusionFilter(candidates, list, catalog, catalogSet, 'frequent');
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
    let skippedNoChecks = 0;
    let skippedOutsideWindow = 0;

    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) { skippedNoChecks++; continue; }

      const checkedEvents = state.history.filter(e => e.action === 'checked');

      if (checkedEvents.length < this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT) {
        skippedNoChecks++;
        continue;
      }

      // history is stored most-recent-first (see HistoryService.addEventToHistory)
      const daysSinceLast = (now - this.toDate(checkedEvents[0].timestamp).getTime()) / msPerDay;

      if (daysSinceLast >= this.LONG_NOT_BOUGHT_MIN_DAYS &&
          daysSinceLast <= this.LONG_NOT_BOUGHT_MAX_DAYS) {
        candidates.push(articleId);
      } else {
        skippedOutsideWindow++;
      }
    }

    this.logger.debug('recommendations',
      `[longNotBought] ${Object.keys(itemStates).length} states → ` +
      `${skippedNoChecks} skipped (insufficient checks), ` +
      `${skippedOutsideWindow} skipped (outside ${this.LONG_NOT_BOUGHT_MIN_DAYS}–${this.LONG_NOT_BOUGHT_MAX_DAYS}d window), ` +
      `${candidates.length} candidates`
    );

    return this.applyExclusionFilter(candidates, list, catalog, catalogSet, 'longNotBought');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Filters candidate article IDs to only those that:
   * - exist in the user's catalog
   * - are currently on the list (articleIds) — removed articles are never recommended
   * - are currently checked off (isChecked === true) — unchecked articles are already
   *   visible as active list items and do not need a recommendation
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
    const catalogById = new Map(catalog.map(a => [a.id, a]));

    let notInCatalog = 0, notOnList = 0, notChecked = 0;

    const result = candidateIds
      .filter(id => {
        if (!catalogSet.has(id)) { notInCatalog++; return false; }
        if (!onListSet.has(id)) { notOnList++; return false; }
        const state = list.itemStates[id];
        if (!state?.isChecked) { notChecked++; return false; }
        return true;
      })
      .map(id => catalogById.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));

    const excluded: string[] = [];
    if (notOnList) excluded.push(`${notOnList} not on list`);
    if (notInCatalog) excluded.push(`${notInCatalog} not in catalog`);
    if (notChecked) excluded.push(`${notChecked} not checked`);

    this.logger.debug('recommendations',
      `[${logPrefix}] ${candidateIds.length} candidates → ${result.length} passed` +
      (excluded.length ? ` (excluded: ${excluded.join(', ')})` : '')
    );

    return result;
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
