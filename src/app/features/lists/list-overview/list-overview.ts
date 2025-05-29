import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ShoppingList } from '../../../core/models';
import { DataService } from '../../../core/services/data';

@Component({
  selector: 'app-list-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './list-overview.html',
  styleUrls: ['./list-overview.scss']
})
export class ListOverviewComponent implements OnInit {
  lists$: Observable<ShoppingList[]>;
  
  constructor(
    private dataService: DataService,
    private router: Router
  ) {
    this.lists$ = this.dataService.getLists();
  }

  ngOnInit(): void {}

  onListClick(list: ShoppingList): void {
    this.router.navigate(['/lists', list.id]);
  }

  onCreateList(): void {
    this.router.navigate(['/lists/new']);
  }

  getItemCountText(list: ShoppingList): string {
    const remaining = list.itemCount - list.checkedCount;
    return remaining > 0 ? remaining.toString() : '';
  }

  getListColor(list: ShoppingList): string {
    const remaining = list.itemCount - list.checkedCount;
    if (remaining === 0) return 'success';
    if (remaining <= 3) return 'warn';
    return 'primary';
  }
}