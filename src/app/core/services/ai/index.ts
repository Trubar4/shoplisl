// src/app/core/services/ai/index.ts - Barrel Export
// This file allows clean imports: import { AIService, AIExecutionResult } from '../ai'

// Main service
export { AIService } from './ai.service';

// Sub-services
export { QuantityExtractionService } from './quantity-extraction.service';
export { CommandParserService } from './command-parser.service';
export { AIMessagingService } from './ai-messaging.service';

// All types and interfaces
export * from './ai-models';
export * from './ai.service';
export * from './context-management.service';
export * from './groq-api.service';
export * from './recipe-processing.service';
export * from './continuation-handling.service';
export * from './command-processing.service';
// Keep existing exports
export * from './ai-messaging.service';
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

export { ArticleOperationsService } from './article-operations.service';
export { ListOperationsService } from './list-operations.service';
export { MultiItemProcessorService } from './multi-item-processor.service';
export { ActionExecutorService } from './action-executor.service';

// Department mapping utilities (migrated from service to pure functions)
export * from '../../utils/department-mapping.utils';

// Disambiguation services (refactored in Phase 2)
export * from './disambiguation';
export * from './caching.service';
// error-handler.service merged into ai-messaging.service
export * from './orchestration.service';
export * from './performance-monitor.service';

// Add only this line to index.ts:
export { CircuitBreakerService } from './circuit-breaker.service';
export type { CircuitState, CircuitBreakerConfig, CircuitBreakerMetrics } from './circuit-breaker.service';