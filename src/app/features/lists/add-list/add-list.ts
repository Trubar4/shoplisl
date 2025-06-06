import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { ShoppingList } from '../../../core/models';
import { DataService } from '../../../core/services/data';

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
export class AddListComponent {
  list = {
    name: '',
    color: '#9c27b0', // Default to purple instead of blue (which is now main color)
    icon: '📋'
  };

  // Predefined colors for lists (removed blue #2196f3 since it's close to main color #1a9edb)
  colors = [
    { name: 'Rot', value: '#f44336' },
    { name: 'Lila', value: '#9c27b0' },
    { name: 'Grün', value: '#4caf50' },
    { name: 'Orange', value: '#ff9800' },
    { name: 'Türkis', value: '#009688' },
    { name: 'Pink', value: '#e91e63' },
    { name: 'Indigo', value: '#3f51b5' },
    { name: 'Amber', value: '#ffc107' }
  ];

  // Common emojis for lists
  commonEmojis = [
    '📋', '📝', '🛒', '🏪', '💊', '🍎', '🧽', '🏠',
    '⚽', '👕', '🎁', '📚', '✈️', '🚗', '🎵', '📱'
  ];

  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  onColorSelect(color: string): void {
    this.list.color = color;
  }

  onEmojiSelect(emoji: string): void {
    this.list.icon = emoji;
  }

  onSave(): void {
    if (!this.list.name.trim()) {
      this.snackBar.open('Name ist erforderlich', 'OK', { duration: 3000 });
      return;
    }
  
    this.dataService.createList({
      name: this.list.name.trim(),
      color: this.list.color,
      icon: this.list.icon,
      articleIds: [],
      itemStates: {}  // Add this line
    }).subscribe(() => {
      this.snackBar.open('Liste erfolgreich hinzugefügt', 'OK', { duration: 2000 });
      this.router.navigate(['/lists']);
    });
  }

  onCancel(): void {
    this.router.navigate(['/lists']);
  }

  onBack(): void {
    this.router.navigate(['/lists']);
  }
}