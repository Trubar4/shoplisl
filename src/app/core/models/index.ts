export interface Article {
  id: string;
  name: string;
  notes?: string;
  icon?: string; // emoji or icon name
  categoryId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Future: shop availability, usage stats
  availableInShops?: string[];
  usageCount?: number;
}

export interface ArticleCategory {
  id: string;
  name: string;
  icon?: string;
  order: number;
  createdAt: Date;
}

export interface ShoppingList {
  id: string;
  name: string;
  color?: string; // header color
  icon?: string;
  shopId?: string; // for shop-based sorting
  articleIds: string[]; // references to articles
  createdAt: Date;
  updatedAt: Date;
  // Future: completion tracking
}

export interface ListItem {
  id: string;
  listId: string;
  articleId: string;
  isCompleted: boolean;
  completedAt?: Date;
  // Future: quantity, notes per list item
}

export interface Shop {
  id: string;
  name: string;
  categories: ShopCategory[];
  createdAt: Date;
}

export interface ShopCategory {
  id: string;
  name: string;
  order: number;
  icon?: string;
}

// Future: User accounts
export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: Date;
}