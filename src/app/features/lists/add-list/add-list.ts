import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { ShoppingList } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';

@Component({
  selector: 'app-add-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './add-list.html',
  styleUrls: ['./add-list.scss']
})
export class AddListComponent implements OnInit {
  list = {
    name: '',
    color: '#9c27b0', // Default to purple instead of blue (which is now main color)
    icon: '📋'
  };

  // Edit mode properties
  isEditMode = false;
  editListId: string | null = null;
  returnTo: string | null = null;
  originalList: ShoppingList | null = null;

  // Predefined colors for lists (removed blue #2196f3 since it's close to main color #1a9edb)
  colors = [
    { name: 'Rot', value: '#f44336' },
    { name: 'Lila', value: '#9c27b0' },
    { name: 'Grün', value: '#4caf50' },
    { name: 'Orange', value: '#ff9800' },
    { name: 'Türkis', value: '#009688' },
    { name: 'Pink', value: '#e91e63' },
    { name: 'Indigo', value: '#3f51b5' },
    { name: 'Amber', value: '#ffc107' },
    { name: 'Blaugrau', value: '#607d8b' },
    { name: 'Braun', value: '#795548' }
  ];

  // Common emojis for lists
  commonEmojis = [
    '📋', '📝', '🛒', '🏪', '💊', '🍎', '🧽', '🏠',
    '⚽', '👕', '🎁', '📚', '✈️', '🚗', '🎵', '📱'
  ];

  constructor(
    private dataService: DataService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Check if we're in edit mode
    this.route.queryParams.subscribe(params => {
      this.editListId = params['editId'] || null;
      this.returnTo = params['returnTo'] || '/lists';
      this.isEditMode = !!this.editListId;

      if (this.isEditMode && this.editListId) {
        this.loadListForEdit(this.editListId);
      }
    });
  }

  private loadListForEdit(listId: string): void {
    this.dataService.getList(listId).subscribe({
      next: (list) => {
        if (list) {
          this.originalList = list;
          this.list = {
            name: list.name,
            color: list.color || '#9c27b0',
            icon: list.icon || '📋'
          };
          console.log('✅ Loaded list for editing:', list.name);
        } else {
          console.error('❌ List not found for editing');
          this.snackBar.open('Liste nicht gefunden', '', { duration: 2000 });
          this.router.navigate(['/lists']);
        }
      },
      error: (error) => {
        console.error('❌ Error loading list for edit:', error);
        this.snackBar.open('Fehler beim Laden der Liste', '', { duration: 2000 });
        this.router.navigate(['/lists']);
      }
    });
  }

  /**
   * 🎯 NEW: Capitalize first letter of input
   */
  private capitalizeFirstLetter(text: string): string {
    if (!text || text.length === 0) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * 🎯 NEW: Handle input change to auto-capitalize first letter
   */
  onNameInput(event: any): void {
    const input = event.target.value;
    if (input && input.length === 1) {
      // Only capitalize when user types the first character
      this.list.name = this.capitalizeFirstLetter(input);
      // Update the input field to reflect the change
      event.target.value = this.list.name;
    } else {
      this.list.name = input;
    }
  }

  getTitle(): string {
    return this.isEditMode ? 'Liste bearbeiten' : 'Liste hinzufügen';
  }

  getSaveButtonText(): string {
    return this.isEditMode ? 'Aktualisieren' : 'Speichern';
  }

  onColorSelect(color: string): void {
    this.list.color = color;
  }

  onEmojiSelect(emoji: string): void {
    this.list.icon = emoji;
  }

  onSave(): void {
    if (!this.list.name.trim()) {
      this.snackBar.open('Name ist erforderlich', '', { duration: 3000 });
      return;
    }
  
    // 🎯 ENHANCED: Always capitalize first letter before saving
    const finalName = this.capitalizeFirstLetter(this.list.name.trim());
  
    if (this.isEditMode && this.editListId) {
      // Update existing list
      const updates = {
        name: finalName,
        color: this.list.color,
        icon: this.list.icon
      };
  
      this.dataService.updateList(this.editListId, updates).subscribe({
        next: (updatedList) => {
          if (updatedList) {
            this.snackBar.open('Liste erfolgreich aktualisiert', '', { duration: 2000 });
            // Navigate back to where we came from (preserving edit mode if specified)
            if (this.returnTo && this.returnTo !== '/lists') {
              this.router.navigateByUrl(this.returnTo);
            } else {
              this.router.navigate(['/lists']);
            }
          } else {
            this.snackBar.open('Fehler beim Aktualisieren', '', { duration: 2000 });
          }
        },
        error: (error) => {
          console.error('❌ Error updating list:', error);
          this.snackBar.open('Fehler beim Aktualisieren der Liste', '', { duration: 3000 });
        }
      });
    } else {
      // Create new list
      this.dataService.createList({
        name: finalName,
        color: this.list.color,
        icon: this.list.icon,
        articleIds: [],
        itemStates: {}
      }).subscribe({
        next: () => {
          this.snackBar.open('Liste erfolgreich hinzugefügt', '', { duration: 2000 });
          this.router.navigate(['/lists']);
        },
        error: (error) => {
          console.error('❌ Error creating list:', error);
          this.snackBar.open('Fehler beim Erstellen der Liste', '', { duration: 3000 });
        }
      });
    }
  }

  onCancel(): void {
    if (this.isEditMode && this.returnTo && this.returnTo !== '/lists') {
      // Return to where we came from
      this.router.navigateByUrl(this.returnTo);
    } else {
      // Default to lists overview
      this.router.navigate(['/lists']);
    }
  }

  onBack(): void {
    this.onCancel(); // Same behavior as cancel
  }

  hasChanges(): boolean {
    if (!this.isEditMode || !this.originalList) {
      return true; // In create mode, always consider as "has changes"
    }

    const currentName = this.capitalizeFirstLetter(this.list.name.trim());
    return (
      currentName !== this.originalList.name ||
      this.list.color !== this.originalList.color ||
      this.list.icon !== this.originalList.icon
    );
  }
}