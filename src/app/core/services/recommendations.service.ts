import { Injectable } from '@angular/core';
import { Article, ShoppingList, ListItemState, CheckEvent } from '../models';

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
 */
@Injectable({
  providedIn: 'root'
})
export class RecommendationsService {

  private readonly MIN_ARTICLES_PER_SHOPPING_DAY = 3;
  private readonly FREQUENT_MIN_RATIO = 1 / 3;
  private readonly LONG_NOT_BOUGHT_MIN_DAYS = 14;
  private readonly LONG_NOT_BOUGHT_MAX_DAYS = 90;
  private readonly RECENTLY_CHECKED_MINUTES = 60;

  /**
   * Returns articles that were checked on at least 1/3 of all shopping days.
   * A "shopping day" is a calendar day on which ≥3 unique articles were checked.
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

    // Step 3: Keep only shopping days (≥3 unique articles checked)
    const shoppingDays = Array.from(articlesByDay.entries())
      .filter(([, articles]) => articles.size >= this.MIN_ARTICLES_PER_SHOPPING_DAY);

    if (shoppingDays.length === 0) {
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

    // Step 5: Collect candidates where ratio ≥ 1/3
    const candidates: string[] = [];
    for (const [articleId, count] of articleDayCount.entries()) {
      if (count / totalShoppingDays >= this.FREQUENT_MIN_RATIO) {
        candidates.push(articleId);
      }
    }

    return this.applyExclusionFilter(candidates, list, catalog, catalogSet);
  }

  /**
   * Returns articles that have ≥2 checks in this list's history and whose last
   * check was between 14 and 90 days ago — indicating a recurring but overdue item.
   */
  getLongNotBoughtArticles(list: ShoppingList, catalog: Article[]): Article[] {
    const itemStates = list.itemStates || {};
    const catalogSet = new Set(catalog.map(a => a.id));
    const now = Date.now();
    const msPerDay = 86_400_000;

    const candidates: string[] = [];

    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) continue;

      const checkedEvents = state.history.filter(e => e.action === 'checked');
      if (checkedEvents.length < 2) continue;

      // history is stored most-recent-first (see HistoryService.addEventToHistory)
      const lastCheckedDate = this.toDate(checkedEvents[0].timestamp);
      const daysSinceLast = (now - lastCheckedDate.getTime()) / msPerDay;

      if (daysSinceLast >= this.LONG_NOT_BOUGHT_MIN_DAYS &&
          daysSinceLast <= this.LONG_NOT_BOUGHT_MAX_DAYS) {
        candidates.push(articleId);
      }
    }

    return this.applyExclusionFilter(candidates, list, catalog, catalogSet);
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
    catalogSet: Set<string>
  ): Article[] {
    const onListSet = new Set(list.articleIds || []);
    const now = Date.now();
    const recentlyCheckedMs = this.RECENTLY_CHECKED_MINUTES * 60 * 1000;
    const catalogById = new Map(catalog.map(a => [a.id, a]));

    return candidateIds
      .filter(id => {
        if (!catalogSet.has(id)) return false;
        if (onListSet.has(id)) return false;

        const state = list.itemStates[id];
        if (state?.isChecked && state.checkedAt) {
          const checkedAt = this.toDate(state.checkedAt).getTime();
          if (now - checkedAt < recentlyCheckedMs) return false;
        }

        return true;
      })
      .map(id => catalogById.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Normalises Firestore Timestamp objects and plain Date/string values to Date. */
  private toDate(value: Date | { toDate(): Date } | string | number): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'object' && 'toDate' in value) return value.toDate();
    return new Date(value as string | number);
  }
}
