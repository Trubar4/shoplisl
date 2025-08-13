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
export * from './ai.service';
export * from './context-management.service';
export * from './groq-api.service';
export * from './recipe-processing.service';
export * from './continuation-handling.service';
export * from './command-processing.service';
// Keep existing exports
export * from './ai-response.service';
export * from './disambiguation.service';
export * from './quantity-extraction.service';
export * from './command-parser.service';
export * from './smart-suggestions.service';

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