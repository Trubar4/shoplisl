// src/app/core/services/ai/orchestration.service.ts
import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';
import {
  AIExecutionResult,
  PendingAction,
  MultiItemPendingAction,
  DisambiguationOption,
  EnhancedConversationContext,
  TargetListInfo
} from './ai-models';
import { SimplifiedDisambiguationService } from './simplified-disambiguation.service';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { AICachingService } from './caching.service';
import { AIErrorHandlerService, ErrorContext } from './error-handler.service';
import { suggestDepartment, suggestIcon } from '../../utils/department-mapping.utils';
import { LoggerService } from '../logger.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { CircuitBreakerService } from './circuit-breaker.service';


export interface OrchestrationConfig {
  enableCaching: boolean;
  enableParallelProcessing: boolean;
  maxConcurrentOperations: number;
  defaultTimeout: number;
}

export interface AIServiceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  cacheHitRate: number;
}

@Injectable({
  providedIn: 'root'
})
export class AIOrchestrationService {
  
  private readonly config: OrchestrationConfig = {
    enableCaching: true,
    enableParallelProcessing: true,
    maxConcurrentOperations: 5,
    defaultTimeout: 10000
  };

  private metrics: AIServiceMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    averageResponseTime: 0,
    cacheHitRate: 0
  };

  constructor(
    private disambiguationService: SimplifiedDisambiguationService,
    private smartSuggestions: SmartSuggestionsService,
    private cachingService: AICachingService,
    private errorHandler: AIErrorHandlerService,
    private performanceMonitor: PerformanceMonitorService,
    private logger: LoggerService,
    private circuitBreaker: CircuitBreakerService
  ) {}

  // ========================================
  // ORCHESTRATED OPERATIONS
  // ========================================

  /**
   * Complete item processing with all AI services
   */
  async processItemCompletely(
    itemName: string,
    targetList?: TargetListInfo,
    conversationContext?: EnhancedConversationContext
  ): Promise<AIExecutionResult> {
    const startTime = Date.now(); // ADD this line
    
    try {
      this.metrics.totalOperations++;
      this.performanceMonitor.startOperation('processItemCompletely');
  
      // Phase 1: Get all AI suggestions in parallel
      const suggestions = await this.getEnhancedSuggestionsParallel(itemName);
      
      // Phase 2: Check for disambiguations
      const disambiguationOptions = await this.disambiguationService.getDisambiguationOptions(itemName);
      
      // Phase 3: Process based on results
      let result: AIExecutionResult;
      
      if (disambiguationOptions.length > 0) {
        result = await this.handleDisambiguationFlow(itemName, disambiguationOptions, suggestions, targetList);
      } else {
        result = await this.handleDirectCreationFlow(itemName, suggestions, targetList, conversationContext);
      }
  
      // Update metrics and performance monitoring
      this.updateMetrics(startTime, true);
      this.performanceMonitor.endOperation('processItemCompletely', result.success);
      
      return result;
  
    } catch (error) {
      this.updateMetrics(startTime, false);
      this.performanceMonitor.endOperation('processItemCompletely', false, false, error instanceof Error ? error.message : 'Unknown error');
      
      // ADD this context definition:
      const context: ErrorContext = {
        operation: 'processItemCompletely',
        input: { itemName, targetList },
        timestamp: new Date()
      };
      
      return this.errorHandler.handleAsExecutionResult(error, context);
    }
  }

  /**
   * Process multiple items with optimized batch processing
   */
  async processMultipleItems(
    items: string[],
    targetList?: TargetListInfo,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<AIExecutionResult> {
    try {
      const result = await this.circuitBreaker.execute(
        'multi-item-processing',
        () => this.processMultipleItemsInternal(items, targetList, progressCallback),
        () => this.getFallbackMultipleItems(items),
        {
          failureThreshold: 5,
          successThreshold: 3,
          timeout: 30000,
          resetTimeout: 60000,
          retryAttempts: 1,
          retryDelay: 2000,
          enableFallback: true,
          enableMetrics: true
        }
      ).toPromise();
      
      return result || this.getFallbackMultipleItems(items);
    } catch (error) {
      return this.errorHandler.handleMultiItemError(error, items, 0);
    }
  }
  
  
  private async processMultipleItemsInternal(
    items: string[],
    targetList?: TargetListInfo,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<AIExecutionResult> {
    // MOVE your existing processMultipleItems logic here
    const context: ErrorContext = {
      operation: 'processMultipleItems',
      input: { items, targetList },
      metadata: { itemCount: items.length },
      timestamp: new Date()
    };
  
    try {
      const results: AIExecutionResult[] = [];
      const batchSize = Math.min(this.config.maxConcurrentOperations, items.length);
      
      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const batchPromises = batch.map(item => 
          this.processItemCompletely(item, targetList)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              message: `❌ Fehler beim Verarbeiten eines Artikels: ${result.reason?.message || 'Unbekannter Fehler'}`
            });
          }
        }
        
        // Report progress
        if (progressCallback) {
          progressCallback(Math.min(i + batchSize, items.length), items.length);
        }
      }
  
      return this.consolidateMultipleResults(results, items.length);
  
    } catch (error) {
      return this.errorHandler.handleMultiItemError(error, items, 0);
    }
  }
  
  private getFallbackMultipleItems(items: string[]): AIExecutionResult {
    return {
      success: false,
      message: `🔧 Batch processing temporarily unavailable for ${items.length} items.`,
      suggestedAction: 'Process items individually or try again later.'
    };
  }

  /**
   * Get comprehensive item analysis
   */
  async analyzeItem(itemName: string): Promise<{
    suggestions: any;
    similarItems: DisambiguationOption[];
    confidence: number;
    recommendations: string[];
  }> {
    const context: ErrorContext = {
      operation: 'analyzeItem',
      input: { itemName },
      timestamp: new Date()
    };
  
    try {
      // Get all data in parallel
      const [suggestions, disambiguationOptions] = await Promise.all([
        this.getEnhancedSuggestionsParallel(itemName),
        this.disambiguationService.getDisambiguationOptions(itemName)
      ]);
  
      const analysis = {
        suggestions,
        similarItems: disambiguationOptions.filter(opt => opt.type === 'existing'),
        confidence: this.calculateOverallConfidence(suggestions, disambiguationOptions),
        recommendations: this.generateRecommendations(itemName, suggestions, disambiguationOptions)
      };
  
      return analysis;
  
    } catch (error) {
      this.errorHandler.logError(error, context, 'medium' as any);
      throw this.errorHandler.createAIServiceError(error, context);
    }
  }

  /**
   * Optimize system performance
   */
  async optimizePerformance(): Promise<{
    cacheCleared: number;
    memoryFreed: string;
    recommendations: string[];
  }> {
    try {
      // Clear old cache entries
      const cacheCleared = this.cachingService.clearByPattern(/^(suggestions|disambiguation):.*/);
      
      // Get memory stats
      const cacheStats = this.cachingService.getStats();
      
      // Generate performance recommendations
      const recommendations = this.generatePerformanceRecommendations();

      return {
        cacheCleared,
        memoryFreed: cacheStats.memoryUsage,
        recommendations
      };

    } catch (error) {
        this.logger.error('general', 'Performance optimization failed', error);
      return {
        cacheCleared: 0,
        memoryFreed: '0KB',
        recommendations: ['Performance optimization failed']
      };
    }
  }

  // ========================================
  // ENHANCED SUGGESTION METHODS
  // ========================================

  private async getEnhancedSuggestionsParallel(itemName: string): Promise<any> {
    if (!this.config.enableParallelProcessing) {
      return this.getEnhancedSuggestionsSequential(itemName);
    }

    try {
      // Execute multiple AI services in parallel for faster response
      const [smartSuggestions, mappingSuggestions] = await Promise.allSettled([
        this.smartSuggestions.getSmartSuggestions(itemName),
        Promise.resolve({
          departmentId: suggestDepartment(itemName),
          icon: suggestIcon(itemName),
          source: 'mapping'
        })
      ]);

      // Combine results with priority to smart suggestions
      if (smartSuggestions.status === 'fulfilled' && smartSuggestions.value) {
        return {
          ...smartSuggestions.value,
          source: 'ai',
          fallback: mappingSuggestions.status === 'fulfilled' ? mappingSuggestions.value : null
        };
      }

      if (mappingSuggestions.status === 'fulfilled') {
        return mappingSuggestions.value;
      }

      // Ultimate fallback
      return {
        departmentId: 'miscellaneous',
        icon: '📦',
        source: 'fallback'
      };

    } catch (error) {
        this.logger.warn('ai', 'Parallel suggestions failed, falling back to sequential', error);
      return this.getEnhancedSuggestionsSequential(itemName);
    }
  }

  private async getEnhancedSuggestionsSequential(itemName: string): Promise<any> {
    try {
      // Try smart suggestions first
      const smartSuggestions = await this.smartSuggestions.getSmartSuggestions(itemName);
      if (smartSuggestions) {
        return { ...smartSuggestions, source: 'ai' };
      }
    } catch (error) {
      this.logger.warn('ai', 'Smart suggestions failed, using mapping service', error);
    }

    // Fallback to mapping service
    return {
      departmentId: suggestDepartment(itemName),
      icon: suggestIcon(itemName),
      source: 'mapping'
    };
  }

  // ========================================
  // FLOW HANDLING METHODS
  // ========================================

  private async handleDisambiguationFlow(
    itemName: string,
    options: DisambiguationOption[],
    suggestions: any,
    targetList?: TargetListInfo
  ): Promise<AIExecutionResult> {
    // Enhanced disambiguation with suggestions
    const enhancedOptions = options.map(option => {
      if (option.type === 'new') {
        return {
          ...option,
          icon: suggestions.icon,
          department: this.getDepartmentDisplayName(suggestions.departmentId),
          preview: `${this.getDepartmentDisplayName(suggestions.departmentId)} ${suggestions.icon}`
        };
      }
      return option;
    });

    return {
      success: true,
      message: `Für "${itemName}" habe ich ${options.length > 1 ? 'mehrere Optionen' : 'eine ähnliche Option'} gefunden. Welche möchtest du verwenden?`,
      needsUserInput: true,
      disambiguationOptions: enhancedOptions,
      pendingAction: this.createPendingAction(itemName, suggestions, targetList)
    };
  }

  private async handleDirectCreationFlow(
    itemName: string,
    suggestions: any,
    targetList?: TargetListInfo,
    conversationContext?: EnhancedConversationContext
  ): Promise<AIExecutionResult> {
    // Create new article directly with AI-enhanced suggestions
    const pendingAction = this.createPendingAction(itemName, suggestions, targetList);
    
    if (targetList?.listId && conversationContext) {
      (pendingAction as any).conversationListId = targetList.listId;
    }

    // Process directly without disambiguation
    return this.disambiguationService.handleDisambiguationChoice(
      pendingAction,
      {
        id: 'new_article',
        displayName: `"${itemName}" (neu erstellen)`,
        type: 'new',
        confidence: 1.0,
        icon: suggestions.icon,
        department: this.getDepartmentDisplayName(suggestions.departmentId)
      }
    );
  }

  private createPendingAction(
    itemName: string,
    suggestions: any,
    targetList?: TargetListInfo
  ): PendingAction {
    return {
      type: 'add_item',
      originalInput: itemName,
      itemName: itemName,
      extractedQuantity: '',
      listName: targetList?.listName,
      suggestedDepartment: suggestions.departmentId,
      articleToAdd: {
        name: itemName,
        amount: '',
        departmentId: suggestions.departmentId,
        icon: suggestions.icon
      }
    };
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private consolidateMultipleResults(results: AIExecutionResult[], totalItems: number): AIExecutionResult {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (successful === 0) {
      return {
        success: false,
        message: `❌ Alle ${totalItems} Artikel konnten nicht verarbeitet werden.`
      };
    }

    if (failed === 0) {
      return {
        success: true,
        message: `✅ Alle ${totalItems} Artikel wurden erfolgreich verarbeitet.`
      };
    }

    return {
      success: true,
      message: `✅ ${successful} von ${totalItems} Artikeln erfolgreich verarbeitet. ${failed} fehlgeschlagen.`
    };
  }

  private calculateOverallConfidence(suggestions: any, disambiguationOptions: DisambiguationOption[]): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on suggestion source
    if (suggestions.source === 'ai') {
      confidence += 0.3;
    } else if (suggestions.source === 'mapping') {
      confidence += 0.2;
    }

    // Reduce confidence if many similar items exist
    if (disambiguationOptions.length > 3) {
      confidence -= 0.2;
    } else if (disambiguationOptions.length > 0) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private generateRecommendations(
    itemName: string,
    suggestions: any,
    disambiguationOptions: DisambiguationOption[]
  ): string[] {
    const recommendations: string[] = [];

    if (disambiguationOptions.length > 0) {
      recommendations.push(`Ähnliche Artikel gefunden - Auswahl empfohlen`);
    }

    if (suggestions.source === 'ai') {
      recommendations.push(`KI-Vorschläge verfügbar - hohe Genauigkeit`);
    }

    if (suggestions.departmentId === 'miscellaneous') {
      recommendations.push(`Abteilung unbekannt - manuelle Überprüfung empfohlen`);
    }

    return recommendations;
  }

  private generatePerformanceRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.cacheHitRate < 0.5) {
      recommendations.push('Cache-Optimierung erforderlich');
    }

    if (this.metrics.averageResponseTime > 2000) {
      recommendations.push('Antwortzeiten verbessern');
    }

    if (this.metrics.failedOperations / this.metrics.totalOperations > 0.1) {
      recommendations.push('Fehlerbehandlung überprüfen');
    }

    return recommendations;
  }

  private getDepartmentDisplayName(departmentId: string): string {
    // This would typically use the department service
    const departmentNames: Record<string, string> = {
      'fruit-vegetables': 'Obst & Gemüse',
      'dairy-products': 'Molkereiprodukte',
      'bread': 'Brot & Backwaren',
      'meat': 'Fleisch & Wurst',
      'miscellaneous': 'Sonstiges'
    };

    return departmentNames[departmentId] || 'Sonstiges';
  }

  private updateMetrics(startTime: number, success: boolean): void {
    const responseTime = Date.now() - startTime;
    
    if (success) {
      this.metrics.successfulOperations++;
    } else {
      this.metrics.failedOperations++;
    }

    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalOperations - 1) + responseTime) / 
      this.metrics.totalOperations;
  }

  // ========================================
  // PUBLIC METRICS AND STATUS
  // ========================================

  getMetrics(): AIServiceMetrics {
    return { ...this.metrics };
  }

  getServiceStatus(): {
    health: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    lastError?: string;
  } {
    const errorRate = this.metrics.failedOperations / Math.max(1, this.metrics.totalOperations);
    
    let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (errorRate > 0.2) {
      health = 'unhealthy';
    } else if (errorRate > 0.1 || this.metrics.averageResponseTime > 5000) {
      health = 'degraded';
    }

    return {
      health,
      uptime: Date.now(), // Would track actual uptime in real implementation
      lastError: health !== 'healthy' ? 'High error rate detected' : undefined
    };
  }
}