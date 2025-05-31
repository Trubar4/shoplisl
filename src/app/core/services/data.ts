import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Article, ArticleCategory, ShoppingList, ListItem } from '../models';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Simple mock articles for MVP
  private mockArticles: Article[] = [
    {
      id: '1',
      name: 'Erdbeeren',
      icon: '🍓',
      categoryId: '1',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      name: 'Kiwi Beeren',
      icon: '🥝',
      categoryId: '1',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '3',
      name: 'Chorizo',
      icon: '🌭',
      categoryId: '2',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  private mockCategories: ArticleCategory[] = [
    {
      id: '1',
      name: 'Obst & Gemüse',
      icon: '🍎',
      order: 1,
      createdAt: new Date()
    },
    {
      id: '2',
      name: 'Fleisch & Wurst',
      icon: '🥩',
      order: 2,
      createdAt: new Date()
    }
  ];

  // Simplified lists for MVP
  private mockLists: ShoppingList[] = [
    {
      id: '1',
      name: 'Apotheke',
      color: '#9c27b0',
      icon: '💊',
      articleIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2', 
      name: 'Lebensmittel',
      color: '#f44336',
      icon: '🛒',
      articleIds: ['1', '2', '3'],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  constructor() { }

  // Article methods for MVP
  getArticles(): Observable<Article[]> {
    return of(this.mockArticles);
  }

  getArticle(id: string): Observable<Article | undefined> {
    return of(this.mockArticles.find(a => a.id === id));
  }

  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<Article> {
    const newArticle: Article = {
      ...article,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.mockArticles.push(newArticle);
    return of(newArticle);
  }

  updateArticle(id: string, updates: Partial<Article>): Observable<Article | undefined> {
    const index = this.mockArticles.findIndex(a => a.id === id);
    if (index !== -1) {
      this.mockArticles[index] = {
        ...this.mockArticles[index],
        ...updates,
        updatedAt: new Date()
      };
      return of(this.mockArticles[index]);
    }
    return of(undefined);
  }

  deleteArticle(id: string): Observable<boolean> {
    const index = this.mockArticles.findIndex(a => a.id === id);
    if (index !== -1) {
      this.mockArticles.splice(index, 1);
      return of(true);
    }
    return of(false);
  }

  getArticleCategories(): Observable<ArticleCategory[]> {
    return of(this.mockCategories);
  }

  // List methods (simplified for now)
  getLists(): Observable<ShoppingList[]> {
    return of(this.mockLists);
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    return of(this.mockLists.find(l => l.id === id));
  }
}