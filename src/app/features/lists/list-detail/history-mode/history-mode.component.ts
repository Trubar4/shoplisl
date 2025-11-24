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
import { Observable, Subject, combineLatest } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList, Article, ListItemState } from '../../../../core/models';
import { HistoryService } from '../../../../core/services/history.service';
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
  completedArticles$!: Observable<ArticleItemData[]>;
  articles$!: Observable<Article[]>;

  // === SIGNALS ===
  readonly completedCount = signal<number>(0);

  constructor(
    private store: Store,
    private historyService: HistoryService
  ) {}

  ngOnInit(): void {
    this.setupObservables();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['list'] && this.list) {
      this.setupObservables();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    if (!this.list) return;

    this.articles$ = this.store.select(selectAllArticles);

    // Get completed articles from the list
    const completedItemStates$ = this.store.select(
      selectCompletedArticlesFromList(this.list.id)
    );

    // Combine with article details
    this.completedArticles$ = combineLatest([
      completedItemStates$,
      this.articles$
    ]).pipe(
      map(([completedStates, articles]) => {
        const articlesMap = new Map(articles.map(a => [a.id, a]));

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
            if (!this.searchQuery) return true;
            return item.name.toLowerCase().includes(this.searchQuery.toLowerCase());
          });
      }),
      takeUntil(this.destroy$)
    );

    // Update completed count
    this.completedArticles$.subscribe(articles => {
      this.completedCount.set(articles.length);
    });
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
   * Get display name for user
   */
  getUserDisplayName(userId: string | undefined): string {
    // For now, always return 'Du' as we're in single-user mode
    return 'Du';
  }
}
