import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ShoppingList } from '../../../core/models';
import { DataService } from '../../../core/services/data';

interface ListWithCount extends ShoppingList {
  itemCount: number;
}

@Component({
  selector: 'app-list-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './list-overview.html',
  styleUrls: ['./list-overview.scss']
})
export class ListOverviewComponent implements OnInit {
  listsWithCount$: Observable<ListWithCount[]>;

  constructor(
    private dataService: DataService,
    private router: Router
  ) {
    this.listsWithCount$ = this.dataService.getLists().pipe(
      map(lists => 
        lists.map(list => ({
          ...list,
          itemCount: list.articleIds ? list.articleIds.length : 0
        })).sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  }

  ngOnInit(): void {}

  onListClick(list: ShoppingList): void {
    this.router.navigate(['/lists', list.id]);
  }

  onAddList(): void {
    this.router.navigate(['/lists/add']);
  }
}