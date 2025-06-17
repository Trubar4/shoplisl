// src/app/core/services/ai/index.ts - Barrel Export
// This file allows clean imports: import { AIService, AIExecutionResult } from '../ai'

// Main service
export { AIService } from './ai.service';

// Sub-services
export { QuantityExtractionService } from './quantity-extraction.service';
export { CommandParserService } from './command-parser.service';
export { DisambiguationService } from './disambiguation.service';
export { AIResponseService } from './ai-response.service';

// All types and interfaces
export * from './ai-models';

// Re-export commonly used types for backwards compatibility
export type {
  AIExecutionResult,
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ParsedItem,
  QuantityExtraction,
  CommandIntent,
  ColorExtraction,
  ListSelectionOption,
  ChatMessage,
  DisambiguationState,
  ApiKeyStatus
} from './ai-models';