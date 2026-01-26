import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, takeUntil, take, tap } from 'rxjs/operators';

// PERFORMANCE DEBUG - Set to true to enable timing logs (filter console with "⏱️ PERF:")
const DEBUG_PERFORMANCE = true;
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Store } from '@ngrx/store';

import { Article, ShoppingList } from '../../../core/models';
import { AppState } from '../../../state/app.state';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import * as ListsActions from '../../../state/lists/lists.actions';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { DateChipComponent } from '../../../shared/components/date-chip/date-chip.component';
import { CountChipComponent } from '../../../shared/components/count-chip/count-chip.component';
import { ArticleStatsService, ArticleStats } from '../../../core/services/article-stats.service';
import { AuthService } from '../../../core/services/auth.service';
import { MatChipsModule } from '@angular/material/chips';
import { ListUtilsService } from '../../../core/services/list-utils.service';

/** Article with statistics */
export interface ArticleWithStats extends Article {
  stats?: ArticleStats;
}

/** Article sort options */
export type ArticleSortOption = 'name' | 'checkCount' | 'lastChecked' | 'lastAdded';

/** Article filter options */
export type ArticleFilterOption = 'all' | 'owned' | 'shared';

@Component({
  selector: 'app-article-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatChipsModule,
    DateChipComponent,
    CountChipComponent
  ],
  templateUrl: './article-overview.html',
  styleUrls: ['./article-overview.scss']
})
export class ArticleOverviewComponent implements OnInit, OnDestroy {
  private readonly SORT_STORAGE_KEY = 'article-overview-sort-option';
  private readonly FILTER_STORAGE_KEY = 'article-overview-filter-option';

  searchQuery$ = new BehaviorSubject<string>('');
  sortOption$ = new BehaviorSubject<ArticleSortOption>(this.loadSavedSortOption());
  filterOption$ = new BehaviorSubject<ArticleFilterOption>(this.loadSavedFilterOption());
  filteredArticles$: Observable<ArticleWithStats[]>;
  searchQuery = '';
  sortOption: ArticleSortOption = this.loadSavedSortOption();
  filterOption: ArticleFilterOption = this.loadSavedFilterOption();

  // FAB state
  isFabExpanded = false;

  // Swipe state management (same as lists-overview)
  swipeStates: { [articleId: string]: {
    isSwipeActive: boolean;
    swipeDistance: number;
    startX: number;
    currentX: number;
    startY: number;
    currentY: number;
  } } = {};

  private readonly SWIPE_THRESHOLD = 100; // Minimum distance for delete action
  private readonly MAX_SWIPE_DISTANCE = 120; // Maximum swipe distance
  private destroy$ = new Subject<void>();

  currentUserId: string | null = null;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private articleStatsService: ArticleStatsService,
    private authService: AuthService,
    private listUtils: ListUtilsService
  ) {
    this.currentUserId = this.authService.getCurrentUserId();
    // Combine articles with stats, search query, filter, and sort option for filtering using NgRx store
    this.filteredArticles$ = combineLatest([
      this.store.select(selectAllArticles).pipe(
        tap(articles => {
          if (DEBUG_PERFORMANCE && articles.length > 0) {
            console.log(`⏱️ PERF: [UI] NgRx selectAllArticles emitted ${articles.length} articles`);
          }
        })
      ),
      this.articleStatsService.getAllArticleStats().pipe(
        tap(statsMap => {
          if (DEBUG_PERFORMANCE && statsMap.size > 0) {
            console.log(`⏱️ PERF: [UI] ArticleStatsService emitted stats for ${statsMap.size} articles`);
          }
        })
      ),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ),
      this.filterOption$,
      this.sortOption$
    ]).pipe(
      map(([articles, statsMap, query, filterOption, sortOption]) => {
        // PERFORMANCE DEBUG: Log what we received
        if (DEBUG_PERFORMANCE) {
          console.log(`⏱️ PERF: [UI] combineLatest MAP: ${articles.length} articles, ${statsMap.size} stats, filter="${filterOption}", sort="${sortOption}", query="${query}"`);
        }

        // Merge articles with their stats
        let articlesWithStats: ArticleWithStats[] = articles.map(article => ({
          ...article,
          stats: statsMap.get(article.id)
        }));

        // Apply ownership filter
        const beforeFilter = articlesWithStats.length;
        articlesWithStats = this.applyFilter(articlesWithStats, filterOption);
        if (DEBUG_PERFORMANCE && beforeFilter !== articlesWithStats.length) {
          console.log(`⏱️ PERF: [UI] Filter "${filterOption}" reduced ${beforeFilter} → ${articlesWithStats.length} articles`);
        }

        // Filter by search query
        const filtered = query.trim()
          ? articlesWithStats.filter(article =>
              article.name.toLowerCase().includes(query.toLowerCase().trim())
            )
          : articlesWithStats;

        if (DEBUG_PERFORMANCE) {
          console.log(`⏱️ PERF: [UI] Final output: ${filtered.length} articles to render`);
        }

        // Apply sorting
        return this.sortArticles(filtered, sortOption);
      })
    );
  }

  // PERFORMANCE TIMING: Track when component initializes
  private componentInitTime = 0;
  private firstArticlesReceived = false;

  ngOnInit(): void {
    // PERFORMANCE TIMING: Mark component init
    this.componentInitTime = performance.now();
    if (DEBUG_PERFORMANCE) {
      console.log(`⏱️ PERF: [UI] ArticleOverviewComponent.ngOnInit() - dispatching loadArticles + loadLists`);
    }

    // Dispatch load actions to populate NgRx store with both articles and lists
    // Lists are needed for calculating article statistics (check counts, dates, etc.)
    this.store.dispatch(ArticlesActions.loadArticles());
    this.store.dispatch(ListsActions.loadLists());

    // PERFORMANCE TIMING: Track when first articles arrive at UI
    this.filteredArticles$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(articles => {
      if (DEBUG_PERFORMANCE) {
        console.log(`⏱️ PERF: [UI] filteredArticles$ SUBSCRIBE received ${articles.length} articles (firstArticlesReceived=${this.firstArticlesReceived})`);
      }
      if (!this.firstArticlesReceived && articles.length > 0) {
        this.firstArticlesReceived = true;
        const elapsed = Math.round(performance.now() - this.componentInitTime);
        if (DEBUG_PERFORMANCE) {
          console.log(`⏱️ PERF: [UI] 🎉 First ${articles.length} articles rendered at T+${elapsed}ms from ngOnInit`);
        }
      }
    });

    // Set theme color for article overview (iPhone header color)
    this.listUtils.updateThemeColors('#1a9edb');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Reset to default theme when leaving article overview
    this.listUtils.resetToDefaultTheme();
  }

  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onSortChange(sortOption: ArticleSortOption): void {
    this.sortOption = sortOption;
    this.sortOption$.next(sortOption);
    this.saveSortOption(sortOption);
    this.isFabExpanded = false;
  }

  onFilterChange(filterOption: ArticleFilterOption): void {
    this.filterOption = filterOption;
    this.filterOption$.next(filterOption);
    this.saveFilterOption(filterOption);
  }

  private loadSavedSortOption(): ArticleSortOption {
    try {
      const saved = localStorage.getItem(this.SORT_STORAGE_KEY);
      if (saved && ['name', 'checkCount', 'lastChecked', 'lastAdded'].includes(saved)) {
        return saved as ArticleSortOption;
      }
    } catch (error) {
      console.warn('Failed to load saved sort option:', error);
    }
    return 'name'; // Default fallback
  }

  private saveSortOption(sortOption: ArticleSortOption): void {
    try {
      localStorage.setItem(this.SORT_STORAGE_KEY, sortOption);
    } catch (error) {
      console.warn('Failed to save sort option:', error);
    }
  }

  private loadSavedFilterOption(): ArticleFilterOption {
    try {
      const saved = localStorage.getItem(this.FILTER_STORAGE_KEY);
      if (saved && ['all', 'owned', 'shared'].includes(saved)) {
        return saved as ArticleFilterOption;
      }
    } catch (error) {
      console.warn('Failed to load saved filter option:', error);
    }
    return 'all'; // Default fallback
  }

  private saveFilterOption(filterOption: ArticleFilterOption): void {
    try {
      localStorage.setItem(this.FILTER_STORAGE_KEY, filterOption);
    } catch (error) {
      console.warn('Failed to save filter option:', error);
    }
  }

  /**
   * Apply ownership filter to articles
   */
  private applyFilter(articles: ArticleWithStats[], filterOption: ArticleFilterOption): ArticleWithStats[] {
    if (!this.currentUserId) return articles;

    switch (filterOption) {
      case 'owned':
        return articles.filter(article => article.ownerId === this.currentUserId);
      case 'shared':
        return articles.filter(article => article.ownerId !== this.currentUserId);
      case 'all':
      default:
        return articles;
    }
  }

  // FAB methods
  toggleFab(): void {
    this.isFabExpanded = !this.isFabExpanded;
  }

  closeFab(): void {
    this.isFabExpanded = false;
  }

  /**
   * Phase 8.2: Check if article is shared (not owned by current user)
   */
  isSharedArticle(article: Article): boolean {
    return this.currentUserId !== null && article.ownerId !== this.currentUserId;
  }

  /**
   * Phase 8.2: Check if article is a local copy
   */
  isCopiedArticle(article: Article): boolean {
    return article.copiedFrom !== undefined && article.copiedFrom !== null;
  }

  private sortArticles(articles: ArticleWithStats[], sortOption: ArticleSortOption): ArticleWithStats[] {
    const sorted = [...articles];

    switch (sortOption) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));

      case 'checkCount':
        return sorted.sort((a, b) => {
          const countA = a.stats?.numberOfChecks ?? 0;
          const countB = b.stats?.numberOfChecks ?? 0;
          // Sort descending (most checks first)
          if (countA !== countB) {
            return countB - countA;
          }
          // If same count, sort by name
          return a.name.localeCompare(b.name);
        });

      case 'lastChecked':
        return sorted.sort((a, b) => {
          const dateA = a.stats?.lastCheckedDate?.getTime() ?? 0;
          const dateB = b.stats?.lastCheckedDate?.getTime() ?? 0;
          // Sort descending (most recent first)
          if (dateA !== dateB) {
            return dateB - dateA;
          }
          // If same date, sort by name
          return a.name.localeCompare(b.name);
        });

      case 'lastAdded':
        return sorted.sort((a, b) => {
          const dateA = a.stats?.lastAddedToListDate?.getTime() ?? 0;
          const dateB = b.stats?.lastAddedToListDate?.getTime() ?? 0;
          // Sort descending (most recent first)
          if (dateA !== dateB) {
            return dateB - dateA;
          }
          // If same date, sort by name
          return a.name.localeCompare(b.name);
        });

      default:
        return sorted;
    }
  }

  onArticleClick(article: Article): void {
    // Only navigate if not swiping (same as lists-overview)
    if (!this.swipeStates[article.id]?.isSwipeActive) {
      this.router.navigate(['/articles/edit', article.id])
    }
  }

  onAddArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onAddNewArticleFromSearch(): void {
    // If there's a search query, pre-fill the name
    if (this.searchQuery.trim()) {
      this.router.navigate(['/articles/add'], {
        queryParams: { name: this.searchQuery.trim() }
      });
    } else {
      this.router.navigate(['/articles/add']);
    }
  }

  // === SWIPE GESTURE HANDLERS (Same as lists-overview) ===
  
  onTouchStart(event: TouchEvent, articleId: string): void {
    const touch = event.touches[0];
    this.swipeStates[articleId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: touch.clientX,
      currentX: touch.clientX,
      startY: touch.clientY, // Add startY to track vertical movement
      currentY: touch.clientY
    };
  }
  
  onTouchMove(event: TouchEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const touch = event.touches[0];
    const swipeState = this.swipeStates[articleId];
    
    swipeState.currentX = touch.clientX;
    swipeState.currentY = touch.clientY;
    
    const deltaX = swipeState.startX - swipeState.currentX;
    const deltaY = Math.abs(swipeState.startY - swipeState.currentY);
    
    // Only prevent default if this is clearly a horizontal swipe
    // Allow vertical scrolling unless horizontal swipe is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      // This is a horizontal swipe - prevent scrolling
      event.preventDefault();
      
      // Only allow left swipe (positive deltaX)
      if (deltaX > 10) {
        swipeState.isSwipeActive = true;
        swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
        
        // Update the visual position
        this.updateSwipePosition(articleId, swipeState.swipeDistance);
      } else if (deltaX < -10) {
        // Right swipe - reset
        this.resetSwipe(articleId);
      }
    } else if (deltaY > 10) {
      // This is vertical scrolling - reset any active swipe and allow scrolling
      if (swipeState.isSwipeActive) {
        this.resetSwipe(articleId);
      }
      // Don't prevent default - allow natural scrolling
    }
  }
  
  onTouchEnd(event: TouchEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const swipeState = this.swipeStates[articleId];
    
    if (swipeState.swipeDistance > this.SWIPE_THRESHOLD) {
      // Trigger delete action
      this.onSwipeDelete(articleId);
    } else {
      // Reset swipe
      this.resetSwipe(articleId);
    }
  }

  // Mouse events for desktop testing
  onMouseDown(event: MouseEvent, articleId: string): void {
    event.preventDefault();
    this.swipeStates[articleId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: event.clientX,
      currentX: event.clientX,
      startY: event.clientY,    // Add this line
      currentY: event.clientY   // Add this line
    };
    
    // Add mouse move and up listeners
    const onMouseMove = (e: MouseEvent) => this.onMouseMove(e, articleId);
    const onMouseUp = (e: MouseEvent) => {
      this.onMouseUp(e, articleId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  onMouseMove(event: MouseEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const swipeState = this.swipeStates[articleId];
    swipeState.currentX = event.clientX;
    swipeState.currentY = event.clientY;  // Add this line
    const deltaX = swipeState.startX - swipeState.currentX;
    
    // Only allow left swipe (positive deltaX)
    if (deltaX > 10) {
      swipeState.isSwipeActive = true;
      swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
      
      // Update the visual position
      this.updateSwipePosition(articleId, swipeState.swipeDistance);
    } else if (deltaX < -10) {
      // Right swipe - reset
      this.resetSwipe(articleId);
    }
  }

  onMouseUp(event: MouseEvent, articleId: string): void {
    this.onTouchEnd(event as any, articleId);
  }

  private updateSwipePosition(articleId: string, distance: number): void {
    const element = document.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (element) {
      element.style.transform = `translateX(-${distance}px)`;
      element.style.transition = 'none';
      
      // Update delete indicator opacity
      const deleteIndicator = element.querySelector('.delete-indicator') as HTMLElement;
      if (deleteIndicator) {
        const opacity = Math.min(distance / this.SWIPE_THRESHOLD, 1);
        deleteIndicator.style.opacity = opacity.toString();
        deleteIndicator.style.transform = `translateX(${Math.max(0, this.MAX_SWIPE_DISTANCE - distance)}px)`;
      }
    }
  }

  private resetSwipe(articleId: string): void {
    const element = document.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (element) {
      element.style.transform = 'translateX(0)';
      element.style.transition = 'transform 0.3s ease';
      
      // Reset delete indicator
      const deleteIndicator = element.querySelector('.delete-indicator') as HTMLElement;
      if (deleteIndicator) {
        deleteIndicator.style.opacity = '0';
      }
    }
    
    // Reset swipe state after animation
    setTimeout(() => {
      if (this.swipeStates[articleId]) {
        this.swipeStates[articleId].isSwipeActive = false;
        this.swipeStates[articleId].swipeDistance = 0;
      }
    }, 300);
  }

  private onSwipeDelete(articleId: string): void {
    // Find the article from NgRx store
    this.store.select(selectAllArticles).pipe(take(1)).subscribe(articles => {
      const article = articles.find(a => a.id === articleId);
      if (!article) return;

      // Reset swipe immediately
      this.resetSwipe(articleId);

      // Check if article is active in any lists first
      // Get lists from store and filter for those with active article
      this.store.select(selectAllLists).pipe(take(1)).subscribe(lists => {
        const activeInLists = lists.filter(list => {
          // Check if article is in list and not checked
          const hasArticle = list.articleIds.includes(articleId);
          const isNotChecked = !list.itemStates?.[articleId]?.isChecked;
          return hasArticle && isNotChecked;
        });

        if (activeInLists.length > 0) {
          const listNames = activeInLists.map(list => list.name).join(', ');
          this.showActiveInListsDialog(article.name, listNames);
        } else {
          this.showDeleteConfirmation(article);
        }
      });
    });
  }

  private showActiveInListsDialog(articleName: string, listNames: string): void {
    const dialogData: ConfirmDialogData = {
      title: 'Artikel kann nicht gelöscht werden',
      message: `Der Artikel "${articleName}" ist noch aktiv in folgenden Listen: ${listNames}. Entfernen Sie den Artikel zuerst aus diesen Listen oder setzen Sie ihn auf "erledigt".`,
      confirmText: 'Verstanden',
      showCancel: false,
      isDestructive: false
    };

    this.dialog.open(ConfirmDialogComponent, {
      width: '90%',
      maxWidth: '400px',
      data: dialogData
    });
  }

  private showDeleteConfirmation(article: Article): void {
    const dialogData: ConfirmDialogData = {
      title: 'Artikel löschen',
      message: `Möchten Sie "${article.name}" wirklich löschen? Der Artikel wird auch aus allen Listen entfernt, in denen er als erledigt markiert ist.`,
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      showCancel: true,
      isDestructive: true
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '90%',
      maxWidth: '400px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.performDelete(article);
      }
    });
  }

  private performDelete(article: Article): void {
    // Dispatch NgRx action to delete article with cleanup
    this.store.dispatch(ArticlesActions.deleteArticleWithCleanup({ articleId: article.id }));

    // Optimistic UI update - show success message immediately
    // Effect will handle the actual deletion and any errors
    this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
  }
}