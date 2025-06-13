export interface Article {
  id: string;
  name: string;
  amount?: string;
  notes?: string;
  icon?: string;
  categoryId?: string;
  departmentId?: string; // Already there
  createdAt: Date;
  updatedAt: Date;
  // Future: shop availability, usage stats
  availableInShops?: string[];
  usageCount?: number;
}

// Keep your existing Department interface
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

// UPDATED: Added departmentOrder field
export interface ShoppingList {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  shopId?: string;
  articleIds: string[];
  itemStates: { [articleId: string]: ListItemState };
  departmentOrder?: string[]; // NEW: Custom department order for this list
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

// NEW: Default department order constant
export const DEFAULT_DEPARTMENT_ORDER = [
  'bread',
  'fruit-vegetables', 
  'sausage-cheese-counter',
  'fridge-meat',
  'fish',
  'dairy-products',
  'spices-oils',
  'noodles-rice',
  'tins-jars',
  'pastries',
  'beverages-alcohol',
  'frozen-goods',
  'sweet-salty',
  'international',
  'body-care',
  'cleaning-agents',
  'household-goods',
  'stationery',
  'breakfast',
  'baby',
  'pet-supplies',
  'miscellaneous',
  'season',
  'medicine',
  'drugstore'
];