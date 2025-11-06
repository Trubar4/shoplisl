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
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ArticleListComponent, DepartmentGroup } from '../../../../shared/components/article-list/article-list.component';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList, Article, Department } from '../../../../core/models';

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
  imports: [CommonModule, ArticleListComponent],
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

  // === OUTPUTS ===
  @Output() articleToggle = new EventEmitter<ArticleItemData>();
  @Output() articleInfo = new EventEmitter<ArticleItemData>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItemData; event: Event }>();
  @Output() undoCompletion = new EventEmitter<ArticleItemData>();

  // === SIGNALS ===
  readonly showCelebrationAnimation = signal<boolean>(false);

  // === OBSERVABLES ===
  private readonly destroy$ = new Subject<void>();
  private readonly pendingStates$ = new BehaviorSubject<Record<string, PendingState>>({});
  private readonly departmentGroups$ = new BehaviorSubject<DepartmentGroup[]>([]);

  // Enriched department groups with pending states - as observable for change detection
  readonly enrichedDepartmentGroups$ = combineLatest([
    this.departmentGroups$,
    this.pendingStates$
  ]).pipe(
    map(([groups, pendingStates]) => {
      const pendingCount = Object.keys(pendingStates).length;
      console.log('🔀 Enriching department groups:', {
        groupCount: groups.length,
        pendingStatesCount: pendingCount,
        pendingArticleIds: Object.keys(pendingStates)
      });

      const enriched = groups.map(group => ({
        ...group,
        articles: group.articles.map(article => {
          const hasPending = !!pendingStates[article.id];
          if (hasPending) {
            console.log('📦 Enriching article with pending state:', {
              articleId: article.id,
              articleName: article.name,
              isChecked: article.isChecked,
              pendingHideTimestamp: pendingStates[article.id]?.pendingHideTimestamp,
              showUndoHint: pendingStates[article.id]?.showUndoHint
            });
          }
          return {
            ...article,
            pendingHideTimestamp: pendingStates[article.id]?.pendingHideTimestamp,
            showUndoHint: pendingStates[article.id]?.showUndoHint
          };
        })
      }));

      return enriched;
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
      console.log('🔍 Shopping-mode ngOnChanges:', {
        hasValue: !!currentValue,
        groupCount: currentValue?.length || 0,
        totalArticles: currentValue?.flatMap((g: DepartmentGroup) => g.articles)?.length || 0
      });

      if (currentValue) {
        this.departmentGroups$.next(currentValue);
      }
    }
  }

  ngOnInit(): void {
    console.log('🔍 Shopping-mode ngOnInit:', {
      groupCount: this.departmentGroups?.length || 0,
      totalArticles: this.departmentGroups?.flatMap(g => g.articles)?.length || 0
    });

    // Initialize with current value
    this.departmentGroups$.next(this.departmentGroups);
    this.setupCompletionMonitoring();

    // Debug: Subscribe to enriched groups
    this.enrichedDepartmentGroups$.subscribe(groups => {
      console.log('🔍 Enriched groups emitted:', {
        groupCount: groups?.length || 0,
        totalArticles: groups?.flatMap(g => g.articles)?.length || 0
      });
    });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // === PUBLIC METHODS ===

  /**
   * Handles article toggle in shopping mode
   * If article has pending hide timestamp, undoes the completion
   * Otherwise, toggles the article and starts undo timer
   */
  onArticleToggle(article: ArticleItemData): void {
    console.log('🔄 onArticleToggle called:', {
      articleId: article.id,
      articleName: article.name,
      isChecked: article.isChecked,
      hasPendingHide: !!article.pendingHideTimestamp
    });

    if (article.isChecked && article.pendingHideTimestamp) {
      console.log('↩️ Undoing completion for:', article.name);
      this.undoCompletion.emit(article);
      this.removePendingState(article.id);
      return;
    }

    // Emit toggle event to parent
    this.articleToggle.emit(article);

    // If article was just checked, start pending hide
    if (!article.isChecked) {
      console.log('⏳ Article will be checked, scheduling pending hide in 100ms for:', article.name);
      setTimeout(() => {
        console.log('⏰ Timer fired, calling startPendingHide for:', article.name);
        this.startPendingHide(article);
        this.cdr.detectChanges();
      }, 100);
    } else {
      console.log('⚠️ Article is already checked, not scheduling pending hide');
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

  /**
   * Determines if an article should be hidden
   * Articles are hidden when they're checked and past the undo window
   */
  shouldHideArticle = (article: ArticleItemData): boolean => {
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
    const newStates = {
      ...currentStates,
      [article.id]: {
        pendingHideTimestamp: hideTime,
        showUndoHint: true
      }
    };

    console.log('🎯 startPendingHide:', {
      articleId: article.id,
      articleName: article.name,
      hideTime: new Date(hideTime).toISOString(),
      currentStatesCount: Object.keys(currentStates).length,
      newStatesCount: Object.keys(newStates).length
    });

    this.pendingStates$.next(newStates);

    this.clearTimeoutsForArticle(article.id);

    const completeTimeout = setTimeout(() => {
      console.log('⏰ Pending hide timeout expired for:', article.name);
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
    if (!articles?.length || this.shoppingFilter !== 'offen') {
      this.wasIncompleteLastCheck = false;
      return;
    }

    const uncheckedArticles = articles.filter(article => !article.isChecked);
    const isCurrentlyComplete = uncheckedArticles.length === 0;

    console.log('🎯 Completion check:', {
      totalArticles: articles.length,
      uncheckedArticles: uncheckedArticles.length,
      wasIncomplete: this.wasIncompleteLastCheck,
      isComplete: isCurrentlyComplete,
      shouldCelebrate: this.wasIncompleteLastCheck && isCurrentlyComplete
    });

    // Only celebrate on transition from incomplete to complete
    if (this.wasIncompleteLastCheck &&
        isCurrentlyComplete &&
        this.shoppingFilter === 'offen') {
      console.log('🎉 List just completed - triggering celebration!');
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
      console.log('❌ Celebration blocked:', {
        filter: this.shoppingFilter,
        alreadyShowing: this.showCelebrationAnimation()
      });
      return;
    }

    console.log('🎉 Showing celebration animation');
    this.showCelebrationAnimation.set(true);
    this.cdr.detectChanges();

    this.celebrationTimeout = setTimeout(() => {
      console.log('🎉 Auto-closing celebration animation');
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
