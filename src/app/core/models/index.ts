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
  // Phase 6: History feature - usage statistics
  lastCheckedDate?: Date;      // Most recent check across all lists
  lastAddedToListDate?: Date;  // Most recent addition to any list
  numberOfChecks?: number;     // Total check count across all lists
  // Phase 8: List sharing - ownership
  ownerId: string;             // User who created this article (required for access control)
  copiedFrom?: string;         // Phase 8.2: ID of original article if this is a local copy
  sharedFrom?: string;         // Phase 8.2: User ID of participant who created this (when copied to owner's collection for shared lists)
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

/**
 * Represents a single check/uncheck event in the history
 * Phase 6: History feature
 */
export interface CheckEvent {
  timestamp: Date;           // When the action occurred
  userId: string;            // User ID ('shared-shoplisl-user' for now, real ID in Phase 7)
  userName: string;          // Cached display name ('Du' for now, real name in Phase 7)
  action: 'checked' | 'unchecked';  // What action was performed
  amount?: string;           // Amount at time of action
}

/**
 * Represents the state of an article within a specific list
 * Phase 6: Extended with history tracking
 */
export interface ListItemState {
  articleId: string;
  articleName?: string;      // Snapshot of article name (for display after article deletion)
  isChecked: boolean;
  amount?: string;           // List-specific amount (editable by all collaborators)
  notes?: string;            // Phase 8.2: List-specific notes (editable by all collaborators)
  addedAt?: Date;            // When article was added to this list
  checkedAt?: Date;          // ✅ Already exists! When last checked
  checkedBy?: string;        // Phase 6: User ID who last checked (default: 'shared-shoplisl-user')
  history?: CheckEvent[];    // Phase 6: Full check/uncheck history (365 days retention)
}

// UPDATED: Added departmentOrder field (Phase 5) and sharing fields (Phase 8)
export interface ShoppingList {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  shopId?: string;
  articleIds: string[];
  itemStates: { [articleId: string]: ListItemState };
  departmentOrder?: string[]; // Phase 5: Custom department order for this list
  createdAt: Date;
  updatedAt: Date;
  // Phase 8: List sharing - ownership and collaboration
  ownerId: string;              // User who created this list (required for access control)
  sharedWith?: string[];        // Array of user IDs who have edit access to this list
                                // Note: All shares have edit access (no view-only permissions)
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

/**
 * Phase 8: Share invite for list collaboration
 * Represents a shareable link for inviting users to collaborate on a list
 */
export interface ShareInvite {
  id: string;                    // Firestore document ID
  listId: string;                // ID of the list being shared
  listName: string;              // Denormalized for quick display
  fromUserId: string;            // Owner who created the invite
  fromUserEmail: string;         // Owner's email for display
  inviteToken: string;           // Secure token used in shareable link
  status: 'pending' | 'accepted' | 'expired';
  createdAt: Date;
  acceptedAt?: Date;             // When invite was accepted
  acceptedByUserId?: string;     // User ID who accepted (for tracking)
  // Note: Links never expire unless owner removes user from sharedWith
  // Multi-use: Same link can be used by multiple users
}

/**
 * Phase 8: Notification when user is removed from a shared list
 * Stored in users-v2/{userId}/unshare-notifications/
 */
export interface UnshareNotification {
  id: string;
  listId: string;
  listName: string;              // Name of list user was removed from
  ownerUserId: string;           // User who owned/shared the list
  ownerEmail: string;            // Owner's email for display
  removedUserId: string;         // User who was removed (should match current user)
  createdAt: Date;
  seen: boolean;                 // Whether user has seen this notification
  action?: 'keep_copy' | 'delete'; // User's choice when they see the notification
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

export interface ConversationContext {
  lastAction?: {
    type: 'list_created' | 'article_added';
    listId: string;
    listName: string;
    articleName?: string;
    timestamp: Date;
  };
  waitingForArticles?: {
    listId: string;
    listName: string;
    prompt: string;
  };
  pendingRecipe?: {
    content: string;
    targetListName?: string;
    targetListId?: string;
  };
  forceLocalParsing?: boolean;
}
