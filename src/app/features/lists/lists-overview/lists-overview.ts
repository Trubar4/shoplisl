import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { Store } from '@ngrx/store';

import { ShoppingList } from '../../../core/models';
import { AppState } from '../../../state/app.state';
import * as ListsActions from '../../../state/lists/lists.actions';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { ConnectionService } from '../../../core/services/connection.service';
import { AuthService } from '../../../core/services/auth.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';

@Component({
  selector: 'app-lists-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatChipsModule
  ],
  templateUrl: './lists-overview.html',
  styleUrls: ['./lists-overview.scss']
})
export class ListsOverviewComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('listsContainer', { read: ElementRef }) listsContainer?: ElementRef;
  
  lists$: Observable<ShoppingList[]>;
  
  // Swipe state management
  swipeStates: { [listId: string]: { 
    isSwipeActive: boolean; 
    swipeDistance: number;
    startX: number;
    currentX: number;
  } } = {};
  
  searchQuery$ = new BehaviorSubject<string>('');
  searchQuery = '';

  // FAB and sorting functionality
  isFabExpanded = false;
  currentSortMode: 'lastChanged' | 'alphabetical' = this.loadSortPreference();
  private sortMode$ = new BehaviorSubject<'lastChanged' | 'alphabetical'>(this.loadSortPreference());

  private readonly SWIPE_THRESHOLD = 100; // Minimum distance for delete action
  private readonly MAX_SWIPE_DISTANCE = 120; // Maximum swipe distance

  // Phase 8: Sharing indicators
  currentUserId: string | null = null;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private snackBar: MatSnackBar,
    private connectionService: ConnectionService,
    private authService: AuthService,
    private listUtils: ListUtilsService
  ) {
    this.currentUserId = this.authService.getCurrentUserId();
    // Setup filtered and sorted lists observable WITH validation
    // Now using NgRx store selectors instead of DataService
    this.lists$ = combineLatest([
      this.store.select(selectAllLists),
      this.store.select(selectAllArticles), // Add articles to get valid IDs
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()),
      this.sortMode$
    ]).pipe(
      map(([lists, articles, query, sortMode]) => {
        // CRITICAL FIX: Don't filter articleIds in list overview
        // Due to lazy listener optimization, we only have articles for the active list
        // Filtering here would show wrong counts (1/1 instead of 5/26)
        // Just use lists as-is - counts show total articleIds, validation happens when viewing list
        const cleanedLists = lists;

        // Apply search filter
        let filteredLists = cleanedLists;
        if (query?.trim()) {
          filteredLists = cleanedLists.filter(list =>
            list.name.toLowerCase().includes(query.toLowerCase())
          );
        }

        // Finally apply sorting
        switch (sortMode) {
          case 'alphabetical':
            return [...filteredLists].sort((a, b) => a.name.localeCompare(b.name));
          case 'lastChanged':
          default:
            return [...filteredLists].sort((a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
        }
      })
    );
  }

  ngOnInit(): void {
    // Load data from NgRx store (effects will call Firebase services)
    // Only dispatch load actions when online - preserve offline changes when offline
    if (this.connectionService?.isOnline()) {
      this.store.dispatch(ListsActions.loadLists());
      this.store.dispatch(ArticlesActions.loadArticles());
    }

    // Fix viewport height issues on mobile
    this.fixMobileViewport();

    // Set theme color for iPhone/mobile browsers
    this.listUtils.updateThemeColors('#1a9edb');
  }

  ngOnDestroy(): void {
    // Reset theme color when leaving lists overview
    this.listUtils.resetToDefaultTheme();
  }
  

  ngAfterViewInit(): void {
    // Ensure scroll container is properly initialized
    this.initializeScrollContainer();
  }

  // Fix for mobile viewport height issues
  private fixMobileViewport(): void {
    // Set CSS custom property for viewport height that accounts for mobile browsers
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    
    // Re-calculate on resize (when mobile browser UI shows/hides)
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => {
      setTimeout(setVH, 100); // Delay to ensure orientation change is complete
    });
  }

  // Initialize scroll container for better mobile performance
  private initializeScrollContainer(): void {
    if (this.listsContainer) {
      const container = this.listsContainer.nativeElement;
      
      // Add passive touch listeners for better scroll performance
      container.addEventListener('touchstart', this.onContainerTouchStart.bind(this), { passive: true });
      container.addEventListener('touchmove', this.onContainerTouchMove.bind(this), { passive: false });
      
      // Ensure container is scrollable
      container.style.webkitOverflowScrolling = 'touch';
      container.style.transform = 'translateZ(0)'; // Force hardware acceleration
    }
  }

  // Handle container touch events for better scrolling
  private onContainerTouchStart(event: TouchEvent): void {
    // Allow normal scrolling when not swiping on items
    const target = event.target as HTMLElement;
    if (!target.closest('.list-item-container')) {
      // Normal scroll behavior
      return;
    }
  }

  private onContainerTouchMove(event: TouchEvent): void {
    // Only prevent default if we're actively swiping on an item
    const target = event.target as HTMLElement;
    const listContainer = target.closest('.list-item-container');
    
    if (listContainer) {
      const listId = listContainer.getAttribute('data-list-id');
      if (listId && this.swipeStates[listId]?.isSwipeActive) {
        event.preventDefault(); // Prevent scrolling while swiping
      }
    }
  }


  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onListClick(list: ShoppingList): void {
    // Only navigate if not swiping
    if (!this.swipeStates[list.id]?.isSwipeActive) {
      this.router.navigate(['/lists', list.id]);
    }
  }

  onAddList(): void {
    this.router.navigate(['/lists/add']);
  }

  // === SWIPE GESTURE HANDLERS ===
  
  onTouchStart(event: TouchEvent, listId: string): void {
    const touch = event.touches[0];
    this.swipeStates[listId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: touch.clientX,
      currentX: touch.clientX
    };
  }

  onTouchMove(event: TouchEvent, listId: string): void {
    if (!this.swipeStates[listId]) return;
    
    const touch = event.touches[0];
    const swipeState = this.swipeStates[listId];
    
    swipeState.currentX = touch.clientX;
    const deltaX = swipeState.startX - swipeState.currentX;
    
    // Only allow left swipe (positive deltaX)
    if (deltaX > 10) {
      swipeState.isSwipeActive = true;
      swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
      
      // Prevent page scrolling when actively swiping
      event.preventDefault();
      
      // Update the visual position
      this.updateSwipePosition(listId, swipeState.swipeDistance);
    } else if (deltaX < -10) {
      // Right swipe - reset
      this.resetSwipe(listId);
    }
  }

  onTouchEnd(event: TouchEvent, listId: string): void {
    if (!this.swipeStates[listId]) return;
    
    const swipeState = this.swipeStates[listId];
    
    if (swipeState.swipeDistance > this.SWIPE_THRESHOLD) {
      // Trigger delete action
      this.onSwipeDelete(listId);
    } else {
      // Reset swipe
      this.resetSwipe(listId);
    }
  }

  // Mouse events for desktop testing
  onMouseDown(event: MouseEvent, listId: string): void {
    event.preventDefault();
    this.swipeStates[listId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: event.clientX,
      currentX: event.clientX
    };
    
    // Add mouse move and up listeners
    const onMouseMove = (e: MouseEvent) => this.onMouseMove(e, listId);
    const onMouseUp = (e: MouseEvent) => {
      this.onMouseUp(e, listId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  onMouseMove(event: MouseEvent, listId: string): void {
    if (!this.swipeStates[listId]) return;
    
    const swipeState = this.swipeStates[listId];
    swipeState.currentX = event.clientX;
    const deltaX = swipeState.startX - swipeState.currentX;
    
    // Only allow left swipe (positive deltaX)
    if (deltaX > 10) {
      swipeState.isSwipeActive = true;
      swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
      
      // Update the visual position
      this.updateSwipePosition(listId, swipeState.swipeDistance);
    } else if (deltaX < -10) {
      // Right swipe - reset
      this.resetSwipe(listId);
    }
  }

  onMouseUp(event: MouseEvent, listId: string): void {
    this.onTouchEnd(event as any, listId);
  }

  private updateSwipePosition(listId: string, distance: number): void {
    const element = document.querySelector(`[data-list-id="${listId}"]`) as HTMLElement;
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

  private resetSwipe(listId: string): void {
    const element = document.querySelector(`[data-list-id="${listId}"]`) as HTMLElement;
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
      if (this.swipeStates[listId]) {
        this.swipeStates[listId].isSwipeActive = false;
        this.swipeStates[listId].swipeDistance = 0;
      }
    }, 300);
  }

  private onSwipeDelete(listId: string): void {
    // Find the list to get its name from NgRx store
    this.store.select(selectAllLists).subscribe(lists => {
      const list = lists.find(l => l.id === listId);
      if (!list) return;

      // Show confirmation snackbar with undo option
      const snackBarRef = this.snackBar.open(
        `Liste "${list.name}" löschen?`,
        'LÖSCHEN',
        {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        }
      );

      // Reset swipe immediately
      this.resetSwipe(listId);

      // Handle delete confirmation
      snackBarRef.onAction().subscribe(() => {
        this.confirmDeleteList(listId, list.name);
      });

      // Auto-reset if no action taken
      snackBarRef.afterDismissed().subscribe((info) => {
        if (!info.dismissedByAction) {
          // User didn't confirm, reset is already done
        }
      });
    }).unsubscribe(); // Unsubscribe immediately after getting the value
  }

  private confirmDeleteList(listId: string, listName: string): void {
    // Dispatch NgRx action to delete list (effect will handle Firebase call)
    this.store.dispatch(ListsActions.deleteList({ listId }));

    // Show optimistic success message (effect will handle errors)
    this.snackBar.open(`Liste "${listName}" gelöscht`, '', {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  // === UTILITY METHODS ===

  /**
   * Count active (non-checked) articles in a list - FIXED to exclude orphaned references
   */
  getActiveItemCount(list: ShoppingList): number {
    if (!list || !list.articleIds || list.articleIds.length === 0) {
      return 0;
    }
  
    return list.articleIds.filter(articleId => {
      const itemState = list.itemStates?.[articleId];
      return !itemState?.isChecked;
    }).length;
  }

  /**
   * Get display text for list info: "X/Y" format - FIXED to exclude orphaned references
   */
  getListInfoText(list: ShoppingList): string {
    const activeCount = this.getActiveItemCount(list);
    const totalCount = list.articleIds.length;
    
    if (totalCount === 0) return '';
    return `${activeCount}/${totalCount} Artikel`;
  }

  /**
   * Get badge content - either active count or check icon
   */
  getBadgeContent(list: ShoppingList): { text: string; isCompleted: boolean } {
    const activeCount = this.getActiveItemCount(list);
    const totalCount = list.articleIds.length;
    
    if (totalCount === 0) {
      return { text: '', isCompleted: false };
    }
    
    if (activeCount === 0) {
      return { text: '', isCompleted: true }; // Show check icon
    }
    
    return { text: activeCount.toString(), isCompleted: false };
  }

  /**
   * Check if badge should be shown
   */
  shouldShowBadge(list: ShoppingList): boolean {
    return list.articleIds.length > 0;
  }

  getListColorClass(list: ShoppingList): string {
    // Return CSS class based on list color
    if (list.color === '#9c27b0') return 'purple';
    if (list.color === '#f44336') return 'red';
    if (list.color === '#4caf50') return 'green';
    if (list.color === '#2196f3') return 'blue';
    return 'default';
  }

  getLightColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Create a lighter version by blending with white (similar to list-detail)
    const lightR = Math.round(r + (255 - r) * 0.85);
    const lightG = Math.round(g + (255 - g) * 0.85);
    const lightB = Math.round(b + (255 - b) * 0.85);
    
    return `rgb(${lightR}, ${lightG}, ${lightB})`;
  }

  // Add to constructor or ngOnInit
  private handleVisibilityChange(): void {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Page became visible, refresh data from NgRx store
        setTimeout(() => {
          this.store.dispatch(ListsActions.loadLists());
        }, 100);
      }
    });
  }

  // FAB and sorting methods
  toggleFab(): void {
    this.isFabExpanded = !this.isFabExpanded;
  }

  closeFab(): void {
    this.isFabExpanded = false;
  }

  setSortMode(mode: 'lastChanged' | 'alphabetical'): void {
    this.currentSortMode = mode;
    this.sortMode$.next(mode);
    this.saveSortPreference(mode);
    this.isFabExpanded = false;
  }

  private loadSortPreference(): 'lastChanged' | 'alphabetical' {
    const saved = localStorage.getItem('shoplisl-sort-preference');
    return (saved === 'alphabetical') ? 'alphabetical' : 'lastChanged';
  }
  
  private saveSortPreference(mode: 'lastChanged' | 'alphabetical'): void {
    localStorage.setItem('shoplisl-sort-preference', mode);
  }

  // === PHASE 8: SHARING HELPER METHODS ===

  /**
   * Check if the current user is the owner of the list
   */
  isListOwner(list: ShoppingList): boolean {
    return this.currentUserId !== null && list.ownerId === this.currentUserId;
  }

  /**
   * Check if the list is shared (has collaborators)
   */
  isListShared(list: ShoppingList): boolean {
    return !!(list.sharedWith && list.sharedWith.length > 0);
  }

  /**
   * Get the sharing status text for a list
   * Returns "geteilt" if user is collaborator, or "Geteilt mit X" if user is owner
   */
  getSharingStatusText(list: ShoppingList): string {
    if (!this.currentUserId) return '';

    const isOwner = this.isListOwner(list);
    const isShared = this.isListShared(list);

    if (!isOwner) {
      // User is collaborator (list is shared with them)
      return 'geteilt';
    } else if (isOwner && isShared) {
      // User is owner and has shared the list
      const count = list.sharedWith?.length || 0;
      return `Geteilt mit ${count}`;
    }

    return '';
  }

  /**
   * Determine which type of sharing chip to show
   */
  getSharingChipType(list: ShoppingList): 'collaborator' | 'owner' | null {
    if (!this.currentUserId) return null;

    const isOwner = this.isListOwner(list);
    const isShared = this.isListShared(list);

    if (!isOwner) {
      // User is collaborator (not owner, so list was shared with them)
      return 'collaborator';
    } else if (isOwner && isShared) {
      // User is owner sharing with others
      return 'owner';
    }

    return null;
  }

}
