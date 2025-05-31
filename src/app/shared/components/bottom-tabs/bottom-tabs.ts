import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    MatIconModule
  ],
  templateUrl: './bottom-tabs.html',
  styleUrls: ['./bottom-tabs.scss']
})
export class BottomTabsComponent {
  tabs = [
    { label: 'Listen', route: '/lists', icon: 'list' },
    { label: 'Artikel', route: '/articles', icon: 'inventory_2' },
    { label: 'Geschäfte', route: '/shops', icon: 'store' },
    { label: 'Rezepte', route: '/recipes', icon: 'restaurant_menu' }
  ];
}