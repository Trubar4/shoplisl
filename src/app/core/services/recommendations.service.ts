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
 * 1. "Häufig gekaufte Artikel"  — articles present on ≥ 4/10 of all shopping days
 * 2. "Schon lange nicht mehr gekauft" — articles with ≥ 3 checks whose time since
 *    last check falls within a dynamic window based on average purchase interval:
 *    window = [avgInterval × 0.8, avgInterval × 2]
 *
 * Candidate rules (applied by applyExclusionFilter before returning):
 * - The article must exist in the user's catalog.
 * - Articles that are on the list AND currently unchecked are excluded — they are already
 *   visible as active items and do not need a recommendation.
 * - Articles NOT on the list (removed but with history) ARE recommended — they can be added back.
 * - Articles on the list AND checked off (hidden in "offen" view) ARE recommended — they can be unchecked.
 * - Tapping a recommendation either unchecks the article (if on list) or adds it back (if not on list).
 *
 * NOTE: The two category rules are NOT mutually exclusive — an article can mathematically
 * satisfy both. getRecommendations() enforces exclusion: "Häufig" takes priority, and any
 * article already there is removed from "Schon lange nicht mehr gekauft".
 *
 * Logging: enable with  logger.setTopics('recommendations'); logger.setLevel('debug')
 */
@Injectable({
  providedIn: 'root'
})
export class RecommendationsService {

  private readonly logger = inject(LoggerService);

  // Rule A — "Häufig gekaufte Artikel"
  private readonly MIN_ARTICLES_PER_SHOPPING_DAY = 1; // minimum unique articles to count a day as a shopping day
  private readonly FREQUENT_MIN_RATIO = 4 / 10;       // article must appear on ≥ 40% of shopping days

  // Rule B — "Schon lange nicht mehr gekauft"
  private readonly MIN_CHECKS_FOR_LONG_NOT_BOUGHT = 3; // minimum check events required
  // Dynamic window: time since last check must be within [avgInterval × INNER, avgInterval × OUTER]
  private readonly LONG_NOT_BOUGHT_WINDOW_INNER = 1 - 1 / 5; // 0.8 — lower bound (80% of avg interval)
  private readonly LONG_NOT_BOUGHT_WINDOW_OUTER = 2;          // 2.0 — upper bound (200% of avg interval)

  /**
   * Computes both recommendation categories with mutual exclusion:
   * an article appears in at most one category. "Häufig" takes priority —
   * articles already in frequentArticles are removed from longNotBoughtArticles.
   */
  getRecommendations(
    list: ShoppingList,
    catalog: Article[]
  ): { frequentArticles: Article[]; longNotBoughtArticles: Article[] } {
    const frequentArticles = this.getFrequentArticles(list, catalog);
    const frequentIds = new Set(frequentArticles.map(a => a.id));

    const allLongNotBought = this.getLongNotBoughtArticles(list, catalog);
    const dedupRemoved = allLongNotBought.filter(a => frequentIds.has(a.id));
    const longNotBoughtArticles = allLongNotBought.filter(a => !frequentIds.has(a.id));

    if (dedupRemoved.length > 0) {
      this.logger.debug('recommendations',
        `[dedup] removed ${dedupRemoved.length} article(s) from longNotBought ` +
        `(already in frequent): ${dedupRemoved.map(a => `"${a.name}" (${a.id})`).join(', ')}`
      );
    }

    return { frequentArticles, longNotBoughtArticles };
  }

  /**
   * Returns articles that were checked on at least 40% of all shopping days.
   * A "shopping day" is a calendar day on which ≥ MIN_ARTICLES_PER_SHOPPING_DAY
   * unique articles were checked.
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

    // Step 3: Keep only shopping days (≥ MIN_ARTICLES_PER_SHOPPING_DAY unique articles checked)
    const shoppingDays = Array.from(articlesByDay.entries())
      .filter(([, articles]) => articles.size >= this.MIN_ARTICLES_PER_SHOPPING_DAY);

    if (shoppingDays.length === 0) {
      console.log(
        `[RECO][frequent] ${Object.keys(itemStates).length} states, ` +
        `${checkedEventsByArticle.size} with check history, 0 shopping days → no candidates`
      );
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

    console.log(
      `[RECO][frequent] ${Object.keys(itemStates).length} states, ` +
      `${checkedEventsByArticle.size} with check history, ` +
      `${shoppingDays.length} shopping days (of ${articlesByDay.size} days with activity), ` +
      `${candidates.length} pass rule A (≥${this.FREQUENT_MIN_RATIO * 100}%)`
    );
    this.logger.debug('recommendations',
      `[frequent] ${Object.keys(itemStates).length} states, ` +
      `${checkedEventsByArticle.size} with checks, ` +
      `${shoppingDays.length}/${articlesByDay.size} shopping days, ` +
      `${candidates.length} candidates`
    );

    return this.applyExclusionFilter(candidates, list, catalog, catalogSet, 'frequent');
  }

  /**
   * Returns articles with ≥ MIN_CHECKS_FOR_LONG_NOT_BOUGHT check events
   * whose time since last check falls within a dynamic window:
   *   windowMin = avgInterval × 0.8
   *   windowMax = avgInterval × 2
   * where avgInterval = (lastCheck − firstCheck) / (N − 1).
   *
   * Articles where avgInterval = 0 (all checks on the same timestamp) are skipped.
   *
   * Example: avg interval 5 weeks → suggest between 4 weeks and 10 weeks after last check.
   */
  getLongNotBoughtArticles(list: ShoppingList, catalog: Article[]): Article[] {
    const itemStates = list.itemStates || {};
    const catalogSet = new Set(catalog.map(a => a.id));
    const now = Date.now();
    const msPerDay = 86_400_000;

    const candidates: string[] = [];
    let skippedInsufficientChecks = 0;
    let skippedZeroInterval = 0;
    let skippedOutsideWindow = 0;

    for (const [articleId, state] of Object.entries(itemStates)) {
      if (!state.history) { skippedInsufficientChecks++; continue; }

      const checkedEvents = state.history.filter(e => e.action === 'checked');

      if (checkedEvents.length < this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT) {
        skippedInsufficientChecks++;
        continue;
      }

      // history is stored most-recent-first (see HistoryService.addEventToHistory)
      const lastCheckMs  = this.toDate(checkedEvents[0].timestamp).getTime();
      const firstCheckMs = this.toDate(checkedEvents[checkedEvents.length - 1].timestamp).getTime();

      const avgIntervalMs = (lastCheckMs - firstCheckMs) / (checkedEvents.length - 1);

      if (avgIntervalMs <= 0) {
        // All checks share the same timestamp — cannot compute a meaningful window
        skippedZeroInterval++;
        continue;
      }

      const daysSinceLast   = (now - lastCheckMs) / msPerDay;
      const avgIntervalDays = avgIntervalMs / msPerDay;
      const windowMin = avgIntervalDays * this.LONG_NOT_BOUGHT_WINDOW_INNER; // × 0.8
      const windowMax = avgIntervalDays * this.LONG_NOT_BOUGHT_WINDOW_OUTER; // × 2.0

      if (daysSinceLast >= windowMin && daysSinceLast <= windowMax) {
        candidates.push(articleId);
      } else {
        skippedOutsideWindow++;
      }
    }

    console.log(
      `[RECO][longNotBought] ${Object.keys(itemStates).length} states → ` +
      `${skippedInsufficientChecks} skipped (<${this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT} checks), ` +
      `${skippedZeroInterval} skipped (zero avg interval), ` +
      `${skippedOutsideWindow} skipped (outside window), ` +
      `${candidates.length} pass rule B`
    );
    this.logger.debug('recommendations',
      `[longNotBought] ${Object.keys(itemStates).length} states → ` +
      `${skippedInsufficientChecks} skipped (< ${this.MIN_CHECKS_FOR_LONG_NOT_BOUGHT} checks), ` +
      `${skippedZeroInterval} skipped (zero avg interval), ` +
      `${skippedOutsideWindow} skipped (outside dynamic window), ` +
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
   * - are NOT currently active on the list (i.e. NOT the combination: in articleIds AND isChecked = false)
   *   An active (unchecked) article is already visible to the user — no recommendation needed.
   *
   * Articles that pass:
   * - NOT on the list (removed but with history) — will be added when tapped
   * - On the list AND checked off (hidden) — will be unchecked when tapped
   *
   * Returns the matching Article objects sorted by name.
   * Logs article names and IDs for each passing article (useful for diagnosing duplicates).
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

    let notInCatalog = 0, alreadyActive = 0;

    const result = candidateIds
      .filter(id => {
        if (!catalogSet.has(id)) { notInCatalog++; return false; }
        // Exclude only if on list AND unchecked — those are already visible to the user
        if (onListSet.has(id) && !list.itemStates?.[id]?.isChecked) { alreadyActive++; return false; }
        return true;
      })
      .map(id => catalogById.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));

    const excluded: string[] = [];
    if (notInCatalog) excluded.push(`${notInCatalog} not in catalog`);
    if (alreadyActive) excluded.push(`${alreadyActive} already active on list`);

    console.log(
      `[RECO][filter:${logPrefix}] ${candidateIds.length} candidates → ${result.length} passed` +
      (excluded.length ? ` (excluded: ${excluded.join(', ')})` : '') +
      (result.length > 0
        ? ` — articles: ${result.map(a => `"${a.name}" (${a.id})`).join(', ')}`
        : '')
    );
    this.logger.debug('recommendations',
      `[${logPrefix}] ${candidateIds.length} candidates → ${result.length} passed` +
      (excluded.length ? ` (excluded: ${excluded.join(', ')})` : '') +
      (result.length > 0
        ? ` — articles: ${result.map(a => `"${a.name}" (${a.id})`).join(', ')}`
        : '')
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
