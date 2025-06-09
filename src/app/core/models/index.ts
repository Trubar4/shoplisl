export interface Article {
  id: string;
  name: string;
  amount?: string;
  notes?: string;
  icon?: string;
  categoryId?: string;
  departmentId?: string; // NEW: Add this field
  createdAt: Date;
  updatedAt: Date;
  // Future: shop availability, usage stats
  availableInShops?: string[];
  usageCount?: number;
}

// NEW: Add this Department interface
export interface Department {
  id: string;
  nameGerman: string;
  nameEnglish: string;
  icon: string; // filename in /public/icons/
  color?: string; // optional color for UI theming
}

// Keep all your existing interfaces as they are:
export interface ArticleCategory {
  id: string;
  name: string;
  icon?: string;
  order: number;
  createdAt: Date;
}

export interface ListItemState {
  articleId: string;
  isChecked: boolean;
  amount?: string; // List-specific amount
  checkedAt?: Date;
}

export interface ShoppingList {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  shopId?: string;
  articleIds: string[];
  itemStates: { [articleId: string]: ListItemState };
  createdAt: Date;
  updatedAt: Date;
}

export interface Shop {
  id: string;
  name: string;
  displayName: string;
  address?: string;
  categories: ShopCategory[];
  createdAt: Date;
  isActive: boolean;
  isSelected?: boolean;
}

export interface ShopCategory {
  id: string;
  name: string;
  nameTranslations: { [locale: string]: string };
  order: number;
  icon: string;
  color?: string;
}

// Future: User accounts
export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: Date;
}

export interface UserPreferences {
  language: 'en' | 'de';
  defaultShop?: string;
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
}