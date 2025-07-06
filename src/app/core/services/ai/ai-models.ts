// src/app/core/services/ai/ai-models.ts
import { Article, ShoppingList } from '../../models';
import { ConversationContext } from '../../models';

// ========================================
// CORE AI INTERFACES
// ========================================

export interface AIResponse {
  action: 'ADD_ARTICLES' | 'CREATE_LIST' | 'DISAMBIGUATE' | 'HELP' | 'ERROR';
  message: string;
  listName?: string;
  articles?: string[];
  listColor?: string;
  listIcon?: string;
  needsDisambiguation?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  pendingAction?: PendingAction;
  followUpQuestion?: string;
}

export interface AIExecutionResult {
  success: boolean;
  message: string;
  error?: string;
  needsUserInput?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  pendingAction?: PendingAction | MultiItemPendingAction;
  listId?: string;
  suggestedAction?: string;
  suggestedData?: any;
  conversationContext?: ConversationContext;
  followUpPrompt?: string;
}

// ========================================
// DISAMBIGUATION INTERFACES
// ========================================

export interface DisambiguationOption {
  id: string;
  displayName: string;
  type: 'new' | 'existing' | 'skip';
  article?: Article;
  confidence: number;
  department?: string;
  icon?: string;
  skipReason?: string;
}

export interface PendingAction {
  type: 'add_item' | 'create_list' | 'select_list';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string;
  listName?: string;
  suggestedDepartment?: string;
  articleToAdd?: {
    id?: string;
    name: string;
    amount?: string;
    departmentId?: string;
    icon?: string;
  };
}

// ========================================
// QUANTITY EXTRACTION INTERFACES
// ========================================

export interface QuantityExtraction {
  itemName: string;
  quantity?: string;
  unit?: string;
}

export interface QuantityExtractionResult extends QuantityExtraction {
  unit?: string;
}

export type SkipReason = 'already_have' | 'not_needed' | 'user_choice';


// ========================================
// MULTI-ITEM PARSING INTERFACES
// ========================================

export interface ParsedItem {
  itemName: string;
  quantity?: string;
  unit?: string;
  originalText: string; // The original comma-separated part
  confidence: 'high' | 'medium' | 'low'; // Parsing confidence
}

export interface MultiItemParseResult {
  command: 'add_items' | 'create_list_with_items' | 'unrecognized';
  items: ParsedItem[];
  listName?: string;
  originalInput: string;
  parseErrors: string[]; // Any items that couldn't be parsed
}

export interface MultiItemPendingAction {
  type: 'add_multiple_items' | 'create_list_with_multiple_items';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string; // ADD this property
  items: ParsedItem[];
  listName?: string;
  currentItemIndex: number;
  processedItems: ProcessedItem[];
  suggestedDepartment?: string;
  
  // Recipe processing support
  isFromRecipe?: boolean;
  isMultiItemSequential?: boolean;
  conversationListId?: string;
  allItems?: string[];
}

// ========================================
// LIST SELECTION INTERFACES
// ========================================

export interface ListSelectionOption {
  id: string;
  name: string;
  color: string;
  icon: string;
  itemCount: number;
}

// ========================================
// COMMAND PARSING INTERFACES
// ========================================

export interface CommandIntent {
  type: 'add_item' | 'create_list' | 'show_lists' | 'help' | 'test' | 'api_key' | 'unrecognized';
  listName?: string;
  itemName?: string;
  originalInput: string;
  confidence: number;
}

export interface ColorExtraction {
  colorName?: string;
  colorHex?: string;
  cleanInput: string;
}

// ========================================
// PATTERN DEFINITIONS
// ========================================

export interface QuantityPattern {
  pattern: RegExp;
  type: string;
  itemGroup: number;
  quantityGroup: number;
  unitGroup?: number | null;
}

export interface CommandPattern {
  pattern: RegExp;
  type: 'add_items' | 'create_list_with_items';
  itemsGroup: number;
  listGroup: number | null;
}

// ========================================
// DEPARTMENT AND SUGGESTION INTERFACES
// ========================================

export interface DepartmentMapping {
  [departmentId: string]: string[];
}

export interface ColorMapping {
  [colorName: string]: string;
}

// ========================================
// API KEY INTERFACES
// ========================================

export interface ApiKeyStatus {
  configured: boolean;
  source: 'localStorage' | 'environment' | 'none';
  length: number;
}

// ========================================
// CHAT RELATED INTERFACES
// ========================================

export interface ChatMessage {
  text: string;
  type: 'user' | 'assistant' | 'error' | 'system';
  timestamp: Date;
  actionData?: any;
}

export interface DisambiguationState {
  message: string;
  options: DisambiguationOption[];
  pendingAction: PendingAction | MultiItemPendingAction;
}

// ========================================
// TYPE GUARDS
// ========================================

export function isMultiItemPendingAction(
  action: PendingAction | MultiItemPendingAction
): action is MultiItemPendingAction {
  return 'items' in action && 'currentItemIndex' in action && Array.isArray((action as any).items);
}

export function isPendingAction(
  action: PendingAction | MultiItemPendingAction
): action is PendingAction {
  return !isMultiItemPendingAction(action);
}

// ========================================
// CONSTANTS
// ========================================

export const QUANTITY_UNITS = [
  'kg', 'g', 'gramm',
  'liter', 'l', 'ml',
  'stück', 'stk',
  'pack', 'packung', 'paket', 'pakete',
  'dose', 'dosen', 'becher',
  'flasche', 'flaschen', 'tube',
  'schachtel', 'kasten', 'bund',
  'glas', 'gläser'
] as const;

export type QuantityUnit = typeof QUANTITY_UNITS[number];

export const DISAMBIGUATION_THRESHOLD = 0.6;
export const MIN_SIMILARITY_THRESHOLD = 0.3;

// ========================================
// ERROR TYPES
// ========================================

export class AIServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class ParsingError extends AIServiceError {
  constructor(message: string, public input: string, details?: any) {
    super(message, 'PARSING_ERROR', details);
  }
}

export class DisambiguationError extends AIServiceError {
  constructor(message: string, details?: any) {
    super(message, 'DISAMBIGUATION_ERROR', details);
  }
}

// Enhanced processed item for skip support (ADD this new interface)
export interface ProcessedItemWithSkip {
  item?: {
    itemName: string;
    quantity?: string;
  };
  article?: Article;
  articleId?: string;
  skipped?: boolean;
  reason?: SkipReason;
  originalText?: string;
  disambiguationResolved?: boolean;
}

export interface ProcessedItem {
  item: ParsedItem;
  articleId?: string;
  disambiguationResolved?: boolean;
  skipped?: boolean;
  failed?: boolean;
  skipReason?: string;
  error?: string;
  quantity?: string;
  originalText?: string;
}
