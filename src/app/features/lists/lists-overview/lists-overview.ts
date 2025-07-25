import { Component, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
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

import { ShoppingList } from '../../../core/models';
import { DataService } from '../../../core/services/data';

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
    MatTooltipModule
  ],
  templateUrl: './lists-overview.html',
  styleUrls: ['./lists-overview.scss']
})
export class ListsOverviewComponent implements OnInit, AfterViewInit {
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
  
  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    // Setup filtered and sorted lists observable
    this.lists$ = combineLatest([
      this.dataService.getLists(),
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()),
      this.sortMode$
    ]).pipe(
      map(([lists, query, sortMode]) => {
        // First apply search filter
        let filteredLists = lists;
        if (query?.trim()) {
          filteredLists = lists.filter(list => 
            list.name.toLowerCase().includes(query.toLowerCase())
          );
        }
        
        // Then apply sorting
        switch (sortMode) {
          case 'alphabetical':
            return [...filteredLists].sort((a, b) => a.name.localeCompare(b.name));
          case 'lastChanged':
          default:
            // Sort by most recently updated first
            return [...filteredLists].sort((a, b) => 
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
        }
      })
    );
  }

  ngOnInit(): void {
    // Force refresh when component loads
    this.dataService.forceRefreshLists().subscribe();
  
    // Reset theme immediately and with multiple attempts for iPhone
    this.resetThemeColor();
    setTimeout(() => this.resetThemeColor(), 50);
    setTimeout(() => this.resetThemeColor(), 200);
    
    // Fix viewport height issues on mobile
    this.fixMobileViewport();
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


// Reset theme color to default blue
private resetThemeColor(): void {
  // Reset meta theme color
  let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.appendChild(themeColorMeta);
  }
  themeColorMeta.content = '#1a9edb';
  
  // Reset HTML background
  document.documentElement.style.backgroundColor = '#1a9edb';
  
  // IMPORTANT: Reset only the root level custom properties, don't force them
  const root = document.documentElement;
  root.style.setProperty('--list-primary-color', '#1a9edb');
  root.style.setProperty('--list-contrast-color', 'white');
  root.style.setProperty('--list-light-color', '#a8d4f0');
  root.style.setProperty('--list-dark-color', '#1976d2');
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
    // Find the list to get its name
    this.dataService.getLists().subscribe(lists => {
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
    });
  }

  private confirmDeleteList(listId: string, listName: string): void {
    this.dataService.deleteList(listId).subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open(`Liste "${listName}" gelöscht`, '', { 
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom'
          });
        } else {
          this.snackBar.open('Fehler beim Löschen', '', { 
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom'
          });
        }
      },
      error: (error) => {
        console.error('Error deleting list:', error);
        this.snackBar.open('Fehler beim Löschen', '', { 
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
      }
    });
  }

  // === UTILITY METHODS ===

  /**
   * Count active (non-checked) articles in a list
   */
  getActiveItemCount(list: ShoppingList): number {
    if (!list || !list.articleIds || list.articleIds.length === 0) {
      return 0;
    }
  
    return list.articleIds.filter(articleId => {
      const itemState = list.itemStates?.[articleId];
      // Only count as checked if itemState exists AND isChecked is explicitly true
      return !itemState?.isChecked;
    }).length;
  }

  /**
   * Get display text for list info: "X/Y" format
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
        // Page became visible, refresh data
        setTimeout(() => {
          this.dataService.forceRefreshLists().subscribe();
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

}
