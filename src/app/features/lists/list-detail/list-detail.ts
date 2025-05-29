// src/app/features/lists/list-detail/list-detail.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ShoppingList, ListItem, ShopCategory } from '../../../core/models';
import { DataService } from '../../../core/services/data';

type FilterType = 'all' | 'open' | 'missing';

@Component({
  selector: 'app-list-detail',
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.component.scss']
})
export class ListDetailComponent implements OnInit {
  list$: Observable<ShoppingList | undefined>;
  filteredItems$: Observable<ListItem[]>;
  categories$: Observable<ShopCategory[]>;
  
  private filterSubject = new BehaviorSubject<FilterType>('all');
  currentFilter$ = this.filterSubject.asObservable();
  
  showShopSelector = false;
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService
  ) {
    const listId = this.route.snapshot.paramMap.get('id');
    this.list$ = this.dataService.getList(listId!);
    this.categories$ = this.dataService.getShopCategories();
    
    // Combine list and filter to show filtered items
    this.filteredItems$ = combineLatest([
      this.list$,
      this.currentFilter$
    ]).pipe(
      map(([list, filter]) => {
        if (!list) return [];
        return this.filterItems(list.items, filter);
      })
    );
  }

  ngOnInit(): void {}

  private filterItems(items: ListItem[], filter: FilterType): ListItem[] {
    switch (filter) {
      case 'open':
        return items.filter(item => !item.isChecked);
      case 'missing':
        return items.filter(item => !item.isAvailableInShop);
      default:
        return items;
    }
  }

  onFilterChange(filter: FilterType): void {
    this.filterSubject.next(filter);
  }

  onItemToggle(item: ListItem): void {
    this.dataService.updateListItem(item.id, { 
      isChecked: !item.isChecked,
      checkedAt: new Date(),
      checkedBy: 'current-user' // TODO: Replace with actual user
    });
  }

  onItemInfo(item: ListItem): void {
    // Show item details/edit dialog
    console.log('Show info for item:', item);
  }

  onAddItem(): void {
    // Navigate to add item screen or show dialog
    console.log('Add new item');
  }

  onBack(): void {
    this.router.navigate(['/lists']);
  }

  onShopSelect(): void {
    this.showShopSelector = true;
  }

  getItemsByCategory(items: ListItem[]): { [categoryId: string]: ListItem[] } {
    return items.reduce((acc, item) => {
      const categoryId = item.categoryId || 'uncategorized';
      if (!acc[categoryId]) {
        acc[categoryId] = [];
      }
      acc[categoryId].push(item);
      return acc;
    }, {} as { [categoryId: string]: ListItem[] });
  }
}