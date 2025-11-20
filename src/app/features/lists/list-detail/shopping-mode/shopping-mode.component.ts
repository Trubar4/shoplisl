import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ArticleListComponent, DepartmentGroup } from '../../../../shared/components/article-list/article-list.component';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList, Article, Department } from '../../../../core/models';
import { ArticleSelectionService } from '../services/article-selection.service';

/**
 * Shopping Mode Component
 *
 * Handles shopping-specific functionality:
 * - Article toggle with undo hints
 * - Pending state management (5-second undo window)
 * - Celebration animation when all items are checked
 * - Completion monitoring
 */

interface PendingState {
  pendingHideTimestamp?: number;
  showUndoHint?: boolean;
}

type ShoppingFilter = 'offen' | 'erledigt' | 'alle';

@Component({
  selector: 'app-shopping-mode',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCheckboxModule, ArticleListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopping-mode.component.html',
  styleUrls: ['./shopping-mode.component.scss']
})
export class ShoppingModeComponent implements OnInit, OnChanges, OnDestroy {
  // === INPUTS ===
  @Input() list: ShoppingList | null = null;
  @Input() departmentGroups: DepartmentGroup[] = [];
  @Input() searchQuery: string = '';
  @Input() shoppingFilter: ShoppingFilter = 'offen';
  @Input() isSelectionMode: boolean = false;
  @Input() selectionService!: ArticleSelectionService;

  // === OUTPUTS ===
  @Output() articleToggle = new EventEmitter<ArticleItemData>();
  @Output() articleInfo = new EventEmitter<ArticleItemData>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItemData; event: Event }>();
  @Output() undoCompletion = new EventEmitter<ArticleItemData>();
  @Output() moveSelectedArticles = new EventEmitter<string[]>();
  @Output() deleteSelectedArticles = new EventEmitter<string[]>();
  @Output() markSelectedAsDone = new EventEmitter<string[]>();

  // === SIGNALS ===
  readonly showCelebrationAnimation = signal<boolean>(false);

  /**
   * Signal tracking visible article IDs based on current filter
   * Used for select-all functionality
   */
  readonly visibleArticleIds = signal<string[]>([]);

  /**
   * Signal tracking the count of selected articles
   * Updated reactively for change detection
   */
  readonly selectedCount = signal<number>(0);

  /**
   * Checks if all visible articles are selected
   */
  get areAllVisibleSelected(): boolean {
    return this.selectionService?.areAllSelected(this.visibleArticleIds()) || false;
  }

  /**
   * Checks if some (but not all) visible articles are selected
   */
  get areSomeVisibleSelected(): boolean {
    return this.selectionService?.areSomeSelected(this.visibleArticleIds()) || false;
  }

  // === OBSERVABLES ===
  private readonly destroy$ = new Subject<void>();
  private readonly pendingStates$ = new BehaviorSubject<Record<string, PendingState>>({});
  private readonly departmentGroups$ = new BehaviorSubject<DepartmentGroup[]>([]);
  private readonly searchQuery$ = new BehaviorSubject<string>('');

  // Enriched department groups with pending states - as observable for change detection
  readonly enrichedDepartmentGroups$ = combineLatest([
    this.departmentGroups$,
    this.pendingStates$,
    this.searchQuery$
  ]).pipe(
    map(([groups, pendingStates, searchQuery]) => {
      return groups.map(group => ({
        ...group,
        articles: group.articles
          .map(article => ({
            ...article,
            pendingHideTimestamp: pendingStates[article.id]?.pendingHideTimestamp,
            showUndoHint: pendingStates[article.id]?.showUndoHint
          }))
          // Filter out articles that should be hidden (completely remove from DOM)
          .filter(article => {
            // When searching, always show matching articles regardless of filter
            if (searchQuery?.trim()) {
              return true;
            }
            // For 'offen' filter: hide checked articles that don't have pending state
            if (this.shoppingFilter === 'offen') {
              return !this.shouldHideArticle(article);
            }
            // For other filters, show all articles in the groups
            return true;
          })
      }))
      // Remove empty department groups
      .filter(group => group.articles.length > 0);
    }),
    takeUntil(this.destroy$)
  );

  // === PRIVATE PROPERTIES ===
  private readonly undoHintTimeouts = new Map<string, any>();
  private celebrationTimeout?: any;
  private readonly HIDE_DELAY_MS = 5000;
  private wasIncompleteLastCheck = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Update department groups observable when input changes
    if (changes['departmentGroups']) {
      const currentValue = changes['departmentGroups'].currentValue;
      if (currentValue) {
        this.departmentGroups$.next(currentValue);
      }
    }
    // Update search query observable when input changes
    if (changes['searchQuery']) {
      this.searchQuery$.next(changes['searchQuery'].currentValue || '');
    }
  }

  ngOnInit(): void {
    // Initialize with current values
    this.departmentGroups$.next(this.departmentGroups);
    this.searchQuery$.next(this.searchQuery || '');
    this.setupCompletionMonitoring();
    this.setupVisibleArticlesTracking();
    this.setupSelectionTracking();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // === PUBLIC METHODS ===

  /**
   * Handles article toggle in shopping mode
   * If article has pending hide timestamp, undoes the completion
   * Otherwise, toggles the article and starts undo timer
   * In selection mode, toggles article selection instead
   */
  onArticleToggle(article: ArticleItemData): void {
    // If in selection mode, toggle selection instead
    if (this.isSelectionMode && this.selectionService) {
      this.selectionService.toggleArticle(article.id);
      this.cdr.detectChanges();
      return;
    }

    if (article.isChecked && article.pendingHideTimestamp) {
      this.undoCompletion.emit(article);
      this.removePendingState(article.id);
      return;
    }

    // Emit toggle event to parent
    this.articleToggle.emit(article);

    // If article was just checked, start pending hide
    if (!article.isChecked) {
      setTimeout(() => {
        this.startPendingHide(article);
        this.cdr.detectChanges();
      }, 100);
    }
  }

  /**
   * Handles article info navigation
   */
  onArticleInfo(article: ArticleItemData): void {
    this.articleInfo.emit(article);
  }

  /**
   * Handles amount editing
   */
  onEditAmount(data: { article: ArticleItemData; event: Event }): void {
    this.editAmount.emit(data);
  }

  /**
   * Handles undo completion - removes pending state and emits to parent
   */
  onUndoCompletion(article: ArticleItemData): void {
    this.removePendingState(article.id);
    this.undoCompletion.emit(article);
  }

  /**
   * Closes the celebration animation
   */
  closeCelebrationAnimation(): void {
    this.clearCelebrationTimeout();
    this.showCelebrationAnimation.set(false);
    this.cdr.detectChanges();
  }

  /**
   * Handles GIF load error - shows fallback
   */
  onGifError(event: any): void {
    event.target.style.display = 'none';
    const fallback = event.target.nextElementSibling;
    if (fallback) fallback.style.display = 'flex';
  }

  /**
   * Handles GIF load success
   */
  onGifLoad(event: any): void {
    console.log('GIF loaded successfully');
  }

  // === SELECTION MODE METHODS ===

  /**
   * Toggles select-all for visible articles
   */
  onToggleSelectAll(): void {
    if (!this.selectionService) return;
    this.selectionService.toggleAll(this.visibleArticleIds());
    this.cdr.detectChanges();
  }

  /**
   * Gets selection state for an article
   */
  isArticleSelected(articleId: string): boolean {
    return this.selectionService?.isArticleSelected(articleId) || false;
  }

  /**
   * Handles "Verschieben" action - emits event to parent
   */
  onMoveSelectedArticles(): void {
    if (!this.selectionService) return;
    const selectedIds = Array.from(this.selectionService.selectedArticleIds);
    if (selectedIds.length > 0) {
      this.moveSelectedArticles.emit(selectedIds);
    }
  }

  /**
   * Handles "Erledigt" action - emits event to parent
   */
  onMarkSelectedAsDone(): void {
    if (!this.selectionService) return;
    const selectedIds = Array.from(this.selectionService.selectedArticleIds);
    if (selectedIds.length > 0) {
      this.markSelectedAsDone.emit(selectedIds);
    }
  }

  /**
   * Handles "Löschen" action - emits event to parent
   */
  onDeleteSelectedArticles(): void {
    if (!this.selectionService) return;
    const selectedIds = Array.from(this.selectionService.selectedArticleIds);
    if (selectedIds.length > 0) {
      this.deleteSelectedArticles.emit(selectedIds);
    }
  }

  /**
   * Determines if an article should be hidden
   * Articles are hidden when they're checked and past the undo window
   * However, during search, all matching articles are shown regardless of checked state
   */
  shouldHideArticle = (article: ArticleItemData): boolean => {
    // Don't hide articles when searching - user needs to see matching results
    if (this.searchQuery?.trim()) {
      return false;
    }
    return this.shoppingFilter === 'offen' &&
           article.isChecked &&
           !article.pendingHideTimestamp;
  };

  // === PRIVATE METHODS ===

  /**
   * Starts the pending hide timer for a checked article
   * Shows undo hint for 5 seconds
   */
  private startPendingHide(article: ArticleItemData): void {
    const now = Date.now();
    const hideTime = now + this.HIDE_DELAY_MS;

    const currentStates = this.pendingStates$.value;
    this.pendingStates$.next({
      ...currentStates,
      [article.id]: {
        pendingHideTimestamp: hideTime,
        showUndoHint: true
      }
    });

    this.clearTimeoutsForArticle(article.id);

    const completeTimeout = setTimeout(() => {
      this.removePendingState(article.id);
    }, this.HIDE_DELAY_MS);

    this.undoHintTimeouts.set(article.id, completeTimeout);
  }

  /**
   * Removes pending state for an article
   * Clears the undo hint and timeout
   */
  private removePendingState(articleId: string): void {
    const currentStates = this.pendingStates$.value;
    const { [articleId]: removed, ...remaining } = currentStates;

    this.pendingStates$.next(remaining);
    this.clearTimeoutsForArticle(articleId);
    this.cdr.detectChanges();
  }

  /**
   * Clears timeout for a specific article
   */
  private clearTimeoutsForArticle(articleId: string): void {
    const timeout = this.undoHintTimeouts.get(articleId);
    if (timeout) {
      clearTimeout(timeout);
      this.undoHintTimeouts.delete(articleId);
    }
  }

  /**
   * Sets up tracking of visible article IDs for select-all functionality
   * Updates signal whenever the filtered/enriched articles change
   */
  private setupVisibleArticlesTracking(): void {
    this.enrichedDepartmentGroups$.pipe(
      map(groups => groups.flatMap(g => g.articles.map(a => a.id))),
      takeUntil(this.destroy$)
    ).subscribe(articleIds => {
      this.visibleArticleIds.set(articleIds);
      this.cdr.markForCheck();
    });
  }

  /**
   * Sets up tracking of selection changes for action buttons
   * Updates signal whenever selection count changes
   */
  private setupSelectionTracking(): void {
    if (!this.selectionService) return;

    this.selectionService.selectedCount$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(count => {
      this.selectedCount.set(count);
      this.cdr.markForCheck();
    });
  }

  /**
   * Monitors list completion and triggers celebration
   * Tracks transition from incomplete to complete
   * Uses reactive approach to avoid infinite loops
   */
  private setupCompletionMonitoring(): void {
    // Subscribe to enriched department groups to reactively check completion
    // This triggers only when the data actually changes, not on a fixed interval
    this.enrichedDepartmentGroups$.pipe(
      map(groups => groups.flatMap(g => g.articles)),
      takeUntil(this.destroy$)
    ).subscribe(articles => {
      if (articles && articles.length > 0) {
        this.checkForCompletion(articles);
      }
    });
  }

  /**
   * Checks if all articles are completed
   * Triggers celebration on transition from incomplete to complete
   */
  private checkForCompletion(articles: ArticleItemData[]): void {
    // Don't check completion if:
    // - No articles in filtered view
    // - Not in 'offen' filter mode
    // - Search is active (filtered view doesn't represent true list state)
    if (!articles?.length ||
        this.shoppingFilter !== 'offen' ||
        this.searchQuery?.trim()) {
      // Reset state when conditions aren't met
      this.wasIncompleteLastCheck = false;
      return;
    }

    const uncheckedArticles = articles.filter(article => !article.isChecked);
    const isCurrentlyComplete = uncheckedArticles.length === 0;

    // Only celebrate on transition from incomplete to complete
    if (this.wasIncompleteLastCheck &&
        isCurrentlyComplete &&
        this.shoppingFilter === 'offen') {
      this.triggerCelebrationAnimation();
    }

    // Update state for next check
    this.wasIncompleteLastCheck = !isCurrentlyComplete;
  }

  /**
   * Triggers the celebration animation
   * Auto-closes after 3 seconds
   */
  private triggerCelebrationAnimation(): void {
    // Double-check conditions before showing animation
    if (this.shoppingFilter !== 'offen' || this.showCelebrationAnimation()) {
      return;
    }

    this.showCelebrationAnimation.set(true);
    this.cdr.detectChanges();

    this.celebrationTimeout = setTimeout(() => {
      this.showCelebrationAnimation.set(false);
      this.cdr.detectChanges();
    }, 3000);
  }

  /**
   * Clears the celebration timeout
   */
  private clearCelebrationTimeout(): void {
    if (this.celebrationTimeout) {
      clearTimeout(this.celebrationTimeout);
      this.celebrationTimeout = undefined;
    }
  }

  /**
   * Cleans up resources on component destruction
   */
  private cleanup(): void {
    this.undoHintTimeouts.forEach(timeout => clearTimeout(timeout));
    this.undoHintTimeouts.clear();

    this.clearCelebrationTimeout();

    this.destroy$.next();
    this.destroy$.complete();
    this.pendingStates$.complete();
  }
}
