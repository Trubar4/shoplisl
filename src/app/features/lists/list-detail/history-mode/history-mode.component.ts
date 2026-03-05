import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable, Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { map, takeUntil, tap } from 'rxjs/operators';

import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList, Article, ListItemState } from '../../../../core/models';
import { HistoryService } from '../../../../core/services/history.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UserProfileService } from '../../../../core/services/user-profile.service';
import { selectAllArticles } from '../../../../state/articles/articles.selectors';
import { selectCompletedArticlesFromList } from '../../../../state/lists/lists.selectors';

/**
 * History Mode Component
 *
 * Displays completed (checked) articles from the current list with their history
 * Features:
 * - Shows completed articles sorted by check date (most recent first)
 * - Displays check date and user for each completed article
 * - Click to restore (uncheck) functionality
 * - Search functionality to filter completed articles
 */
@Component({
  selector: 'app-history-mode',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history-mode.component.html',
  styleUrls: ['./history-mode.component.scss']
})
export class HistoryModeComponent implements OnInit, OnChanges, OnDestroy {
  // === INPUTS ===
  @Input() list: ShoppingList | null = null;
  @Input() searchQuery: string = '';

  // === OUTPUTS ===
  @Output() articleRestore = new EventEmitter<ArticleItemData>();
  @Output() articleInfo = new EventEmitter<ArticleItemData>();

  // === OBSERVABLES ===
  private destroy$ = new Subject<void>();
  private searchQuery$ = new BehaviorSubject<string>('');
  completedArticles$!: Observable<ArticleItemData[]>;
  articles$!: Observable<Article[]>;

  // === SIGNALS ===
  readonly completedCount = signal<number>(0);

  // === USER DISPLAY NAMES ===
  // Cache for user display names (userId -> displayName)
  private userDisplayNames = new Map<string, string>();

  constructor(
    private store: Store,
    private historyService: HistoryService,
    private authService: AuthService,
    private userProfileService: UserProfileService
  ) {}

  ngOnInit(): void {
    this.searchQuery$.next(this.searchQuery);
    this.setupObservables();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['list']) {
      const checkedCount = Object.values(this.list?.itemStates || {}).filter((s: any) => s.isChecked).length;
      console.log(`[ERLEDIGT] ngOnChanges — list: ${this.list?.id ?? 'null'}, isFirstChange: ${changes['list'].isFirstChange()}, checked in itemStates: ${checkedCount}`);
      if (this.list) {
        this.setupObservables();
      }
    }
    if (changes['searchQuery']) {
      this.searchQuery$.next(this.searchQuery);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    if (!this.list) {
      console.warn('[ERLEDIGT] setupObservables called with null list — skipping');
      return;
    }

    const checkedInStore = Object.values(this.list.itemStates || {}).filter((s: any) => s.isChecked).length;
    console.log(`[ERLEDIGT] setupObservables — listId: ${this.list.id}, checked items in input list: ${checkedInStore}`);

    this.articles$ = this.store.select(selectAllArticles);

    // Get completed articles from the list
    const completedItemStates$ = this.store.select(
      selectCompletedArticlesFromList(this.list.id)
    ).pipe(tap(s => console.log('[ERLEDIGT] src1 completedStates:', s.length)));

    const articles$ = this.articles$.pipe(
      tap(a => console.log('[ERLEDIGT] src2 articles:', a.length))
    );

    const searchQuery$ = this.searchQuery$.pipe(
      tap(q => console.log('[ERLEDIGT] src3 searchQuery:', JSON.stringify(q)))
    );

    // Combine with article details and search query
    this.completedArticles$ = combineLatest([
      completedItemStates$,
      articles$,
      searchQuery$
    ]).pipe(
      map(([completedStates, articles, searchQuery]) => {
        console.log(`[ERLEDIGT] selector emitted — completedStates: ${completedStates.length}, articles in store: ${articles.length}, query: "${searchQuery}"`);
        if (completedStates.length === 0) {
          // Re-check store list directly for comparison
          console.warn('[ERLEDIGT] Selector returned 0 completed states. Check NgRx store for isChecked values.');
        }
        const articlesMap = new Map(articles.map(a => [a.id, a]));

        // Collect all unique user IDs from completed articles
        const userIds = new Set<string>();
        completedStates.forEach(state => {
          if (state.checkedBy) {
            userIds.add(state.checkedBy);
          }
        });

        // Preload user profiles for all users
        this.preloadUserNames(Array.from(userIds));

        return completedStates
          .map(state => {
            const article = articlesMap.get(state.articleId);

            // If article doesn't exist but we have a stored name, use that
            if (!article && !state.articleName) return null;

            return {
              id: state.articleId,
              name: article?.name || state.articleName || 'Gelöschter Artikel',
              icon: article?.icon || '❓',
              departmentId: article?.departmentId,
              amount: state.amount || '',
              isChecked: state.isChecked,
              isInList: true,
              checkedAt: state.checkedAt,
              checkedBy: state.checkedBy,
              history: state.history || []
            } as ArticleItemData;
          })
          .filter((item): item is ArticleItemData => item !== null)
          .filter(item => {
            // Apply search filter if present
            if (!searchQuery) return true;
            return item.name.toLowerCase().includes(searchQuery.toLowerCase());
          });
      }),
      takeUntil(this.destroy$)
    );

    // Update completed count
    console.log('[ERLEDIGT] About to subscribe. destroy$.isStopped:', this.destroy$.isStopped);
    const sub = this.completedArticles$.subscribe({
      next: articles => {
        console.log('[ERLEDIGT] subscribe next — count:', articles.length);
        this.completedCount.set(articles.length);
      },
      error: err => console.error('[ERLEDIGT] subscribe error:', err),
      complete: () => console.log('[ERLEDIGT] subscribe complete — takeUntil fired immediately?')
    });
    console.log('[ERLEDIGT] Subscribed. closed:', sub.closed);
  }

  /**
   * Handle article click - restore (uncheck) the article
   */
  onArticleClick(article: ArticleItemData): void {
    this.articleRestore.emit(article);
  }

  /**
   * Handle article info click
   */
  onArticleInfo(article: ArticleItemData): void {
    this.articleInfo.emit(article);
  }

  /**
   * Format date for display
   */
  formatDate(date: Date | undefined): string {
    if (!date) return '';
    return this.historyService.formatDate(date);
  }

  /**
   * Format time for display
   */
  formatTime(date: Date | undefined): string {
    if (!date) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Preload user names for display
   * Optimized: Bulk fetch all users at once for better performance
   */
  private preloadUserNames(userIds: string[]): void {
    const currentUserId = this.authService.getCurrentUserId();

    // Filter out current user and already cached users
    const usersToFetch = userIds.filter(userId =>
      userId !== currentUserId && !this.userDisplayNames.has(userId)
    );

    if (usersToFetch.length === 0) {
      return;
    }

    // Bulk fetch all user profiles at once
    this.userProfileService.getUserProfiles(usersToFetch)
      .pipe(takeUntil(this.destroy$))
      .subscribe(profileMap => {
        // Cache all fetched names
        profileMap.forEach((profile, userId) => {
          this.userDisplayNames.set(userId, profile.name);
        });
      });
  }

  /**
   * Get display name for user
   */
  getUserDisplayName(userId: string | undefined): string {
    if (!userId) {
      return 'Du';
    }

    // Check if it's the current user
    const currentUserId = this.authService.getCurrentUserId();
    if (userId === currentUserId) {
      return 'Du';
    }

    // Return cached display name or fallback
    return this.userDisplayNames.get(userId) || 'Lädt...';
  }
}
