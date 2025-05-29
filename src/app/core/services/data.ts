import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ShoppingList, ListItem } from '../models';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Mock data for testing - matches your screenshots
  private mockLists: ShoppingList[] = [
    {
      id: '1',
      name: 'Apotheke',
      itemCount: 2,
      checkedCount: 0,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      sortOrder: 'alphabetical'
    },
    {
      id: '2', 
      name: 'Lebensmittel',
      itemCount: 11,
      checkedCount: 0,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      sortOrder: 'alphabetical'
    },
    {
      id: '3',
      name: 'Täglich', 
      itemCount: 0,
      checkedCount: 0,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      sortOrder: 'alphabetical'
    }
  ];

  constructor() { }

  getLists(): Observable<ShoppingList[]> {
    return of(this.mockLists);
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    return of(this.mockLists.find(l => l.id === id));
  }

  updateListItem(itemId: string, updates: Partial<ListItem>): void {
    console.log('Updating item:', itemId, updates);
  }

  getShopCategories(): Observable<any[]> {
    return of([
      { id: '1', name: 'Obst & Gemüse', icon: '🍎', order: 1 },
      { id: '2', name: 'Frischware', icon: '🥛', order: 2 },
      { id: '3', name: 'Fleisch & Wurst', icon: '🥩', order: 3 }
    ]);
  }
}