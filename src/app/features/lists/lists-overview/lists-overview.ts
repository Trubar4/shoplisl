import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
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
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule
  ],
  templateUrl: './lists-overview.html',
  styleUrls: ['./lists-overview.scss']
})
export class ListsOverviewComponent implements OnInit {
  lists$: Observable<ShoppingList[]>;
  
  // Swipe state management
  swipeStates: { [listId: string]: { 
    isSwipeActive: boolean; 
    swipeDistance: number;
    startX: number;
    currentX: number;
  } } = {};
  
  private readonly SWIPE_THRESHOLD = 100; // Minimum distance for delete action
  private readonly MAX_SWIPE_DISTANCE = 120; // Maximum swipe distance
  
  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.lists$ = this.dataService.getLists();
  }

  ngOnInit(): void {
    // Reset theme color to default blue when in lists overview
    this.resetThemeColor();
  }

  // Reset theme color to default blue
  private resetThemeColor(): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = '#1a9edb';
    
    // Also update HTML background
    document.documentElement.style.backgroundColor = '#1a9edb';
    
    // Reset CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color', '#1a9edb');
    root.style.setProperty('--list-contrast-color', 'white');
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
    
    event.preventDefault(); // Prevent scrolling while swiping
    const touch = event.touches[0];
    const swipeState = this.swipeStates[listId];
    
    swipeState.currentX = touch.clientX;
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

  getItemCountText(list: ShoppingList): string {
    const count = list.articleIds.length;
    return count > 0 ? count.toString() : '';
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
}