export interface ShoppingList {
  id: string;
  name: string;
  shopId?: string;
  items: ListItem[];
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  checkedCount: number;
  sortOrder: 'alphabetical' | 'shop-layout' | 'custom';
  color?: string;
}

export interface ListItem {
  id: string;
  articleId: string;
  articleName: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  url?: string;
  isChecked: boolean;
  isAvailableInShop: boolean;
  isStrikethrough: boolean;
  checkedBy?: string;
  checkedAt?: Date;
  addedBy?: string;
  addedAt: Date;
  categoryId?: string;
}

export interface Article {
  id: string;
  name: string;
  nameTranslations: { [locale: string]: string };
  categoryId: string;
  icon?: string;
  notes?: string;
  defaultUnit?: string;
  availableInShops: string[];
  unavailableInShops: string[];
  lastUsed?: Date;
  lastUsedBy?: string;
  createdAt: Date;
  usageCount: number;
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

export interface User {
  id: string;
  name: string;
  email?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  language: 'en' | 'de';
  defaultShop?: string;
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
}
