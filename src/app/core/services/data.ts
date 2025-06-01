import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { Article, ArticleCategory, ShoppingList, ListItem } from '../models';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Storage keys
  private readonly STORAGE_KEY = 'shoplisl-articles';
  private readonly LISTS_STORAGE_KEY = 'shoplisl-lists';

  // Reactive subjects for real-time updates
  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);
  
  // Default articles (fallback)
  private defaultArticles: Article[] = [
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

  // Default lists (fallback)
private defaultLists: ShoppingList[] = [
  {
    id: '1',
    name: 'Apotheke',
    color: '#9c27b0',
    icon: '💊',
    articleIds: [],
    itemStates: {},
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '2', 
    name: 'Lebensmittel',
    color: '#f44336',
    icon: '🛒',
    articleIds: ['1', '2', '3'],
    itemStates: {
      '1': { articleId: '1', isChecked: false },
      '2': { articleId: '2', isChecked: false },
      '3': { articleId: '3', isChecked: false }
    },
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

  constructor() {
    // Initialize with stored articles or defaults
    const storedArticles = this.getStoredArticles() || this.defaultArticles;
    if (!this.getStoredArticles()) {
      this.saveArticles(this.defaultArticles);
    }
    this.articlesSubject.next(storedArticles);
    
    // Initialize with stored lists or defaults
    const storedLists = this.getStoredLists() || this.defaultLists;
    if (!this.getStoredLists()) {
      this.saveLists(this.defaultLists);
    }
    this.listsSubject.next(storedLists);
  }

  // === ARTICLES STORAGE METHODS ===
  private getStoredArticles(): Article[] | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const articles = JSON.parse(stored);
        return articles.map((article: any) => ({
          ...article,
          createdAt: new Date(article.createdAt),
          updatedAt: new Date(article.updatedAt)
        }));
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    }
    return null;
  }

  private saveArticles(articles: Article[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(articles));
    } catch (error) {
      console.error('Error saving articles:', error);
    }
  }

  // === LISTS STORAGE METHODS ===
  private getStoredLists(): ShoppingList[] | null {
    try {
      const stored = localStorage.getItem(this.LISTS_STORAGE_KEY);
      if (stored) {
        const lists = JSON.parse(stored);
        return lists.map((list: any) => {
          // Migrate old lists that don't have itemStates
          if (!list.itemStates) {
            list.itemStates = {};
            // Create itemStates for existing articles
            if (list.articleIds && list.articleIds.length > 0) {
              list.articleIds.forEach((articleId: string) => {
                list.itemStates[articleId] = { articleId, isChecked: false };
              });
            }
          }
          
          return {
            ...list,
            createdAt: new Date(list.createdAt),
            updatedAt: new Date(list.updatedAt)
          };
        });
      }
    } catch (error) {
      console.error('Error loading lists:', error);
    }
    return null;
  }

  private saveLists(lists: ShoppingList[]): void {
    try {
      localStorage.setItem(this.LISTS_STORAGE_KEY, JSON.stringify(lists));
    } catch (error) {
      console.error('Error saving lists:', error);
    }
  }

  // === ARTICLES PUBLIC METHODS ===
  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    const articles = this.articlesSubject.value;
    return of(articles.find(a => a.id === id));
  }

  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<Article> {
    const articles = [...this.articlesSubject.value];
    const newArticle: Article = {
      ...article,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    articles.push(newArticle);
    this.saveArticles(articles);
    this.articlesSubject.next(articles); // Emit updated data
    return of(newArticle);
  }

  updateArticle(id: string, updates: Partial<Article>): Observable<Article | undefined> {
    const articles = [...this.articlesSubject.value];
    const index = articles.findIndex(a => a.id === id);
    if (index !== -1) {
      articles[index] = {
        ...articles[index],
        ...updates,
        updatedAt: new Date()
      };
      this.saveArticles(articles);
      this.articlesSubject.next(articles); // Emit updated data
      return of(articles[index]);
    }
    return of(undefined);
  }

  deleteArticle(id: string): Observable<boolean> {
    const articles = [...this.articlesSubject.value];
    const index = articles.findIndex(a => a.id === id);
    if (index !== -1) {
      articles.splice(index, 1);
      this.saveArticles(articles);
      this.articlesSubject.next(articles); // Emit updated data
      return of(true);
    }
    return of(false);
  }

  // === LISTS PUBLIC METHODS ===
  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    const lists = this.listsSubject.value;
    return of(lists.find(l => l.id === id));
  }

  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt'>): Observable<ShoppingList> {
    const lists = [...this.listsSubject.value];
    const newList: ShoppingList = {
      ...list,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    lists.push(newList);
    this.saveLists(lists);
    this.listsSubject.next(lists.sort((a, b) => a.name.localeCompare(b.name))); // Emit updated data
    return of(newList);
  }

  updateList(id: string, updates: Partial<ShoppingList>): Observable<ShoppingList | undefined> {
    const lists = [...this.listsSubject.value];
    const index = lists.findIndex(l => l.id === id);
    if (index !== -1) {
      lists[index] = {
        ...lists[index],
        ...updates,
        updatedAt: new Date()
      };
      this.saveLists(lists);
      this.listsSubject.next(lists.sort((a, b) => a.name.localeCompare(b.name))); // Emit updated data
      return of(lists[index]);
    }
    return of(undefined);
  }

  deleteList(id: string): Observable<boolean> {
    const lists = [...this.listsSubject.value];
    const index = lists.findIndex(l => l.id === id);
    if (index !== -1) {
      lists.splice(index, 1);
      this.saveLists(lists);
      this.listsSubject.next(lists); // Emit updated data
      return of(true);
    }
    return of(false);
  }

  toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
    const lists = [...this.listsSubject.value];
    const listIndex = lists.findIndex(l => l.id === listId);
    
    if (listIndex !== -1) {
      const list = lists[listIndex];
      if (!list.itemStates[articleId]) {
        list.itemStates[articleId] = { articleId, isChecked: false };
      }
      
      list.itemStates[articleId].isChecked = !list.itemStates[articleId].isChecked;
      list.itemStates[articleId].checkedAt = new Date();
      list.updatedAt = new Date();
      
      this.saveLists(lists);
      this.listsSubject.next(lists); // Emit updated data
      return of(true);
    }
    return of(false);
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    const lists = [...this.listsSubject.value];
    const listIndex = lists.findIndex(l => l.id === listId);
    
    if (listIndex !== -1) {
      const list = lists[listIndex];
      list.articleIds = list.articleIds.filter(id => id !== articleId);
      delete list.itemStates[articleId];
      list.updatedAt = new Date();
      
      this.saveLists(lists);
      this.listsSubject.next(lists); // Emit updated data
      return of(true);
    }
    return of(false);
  }

  clearAllItemsFromList(listId: string): Observable<boolean> {
    const lists = [...this.listsSubject.value];
    const listIndex = lists.findIndex(l => l.id === listId);
    
    if (listIndex !== -1) {
      lists[listIndex].articleIds = [];
      lists[listIndex].itemStates = {};
      lists[listIndex].updatedAt = new Date();
      
      this.saveLists(lists);
      this.listsSubject.next(lists); // Emit updated data
      return of(true);
    }
    return of(false);
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    const lists = [...this.listsSubject.value];
    const listIndex = lists.findIndex(l => l.id === listId);
    
    if (listIndex !== -1) {
      const list = lists[listIndex];
      if (!list.articleIds.includes(articleId)) {
        list.articleIds.push(articleId);
        if (!list.itemStates) {
          list.itemStates = {};
        }
        list.itemStates[articleId] = { articleId, isChecked: false };
        list.updatedAt = new Date();
        
        this.saveLists(lists);
        this.listsSubject.next(lists); // Emit updated data
        return of(true);
      }
    }
    return of(false);
  }
}