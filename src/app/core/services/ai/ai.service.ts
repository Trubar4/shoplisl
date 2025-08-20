// src/app/core/services/ai/ai.service.ts
import { Injectable } from '@angular/core';
import {
  AIExecutionResult,
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ApiKeyStatus,
  ListSelectionOption,
  isMultiItemPendingAction,
  AIServiceError,
  ParsingError
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { CommandParserService } from './command-parser.service';
import { SimplifiedDisambiguationService } from './simplified-disambiguation.service';
import { DepartmentIconMappingService } from './department-icon-mapping.service';
import { AIResponseService } from './ai-response.service';
import { CommandProcessingService } from './command-processing.service';
import { RecipeProcessingService } from './recipe-processing.service';
import { ContextManagementService } from './context-management.service';
import { GroqApiService } from './groq-api.service';
import { ContinuationHandlingService } from './continuation-handling.service';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { ConversationContext } from '../../models';
import { AIOrchestrationService } from './orchestration.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  isAIHealthy = true;
  aiStatusMessage = '🟢 AI Ready';
  private healthCheckInterval: any;

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: SimplifiedDisambiguationService,
    private departmentIconMapping: DepartmentIconMappingService,
    private aiResponse: AIResponseService,
    private commandProcessing: CommandProcessingService,
    private recipeProcessing: RecipeProcessingService,
    private contextManager: ContextManagementService,
    private groqApi: GroqApiService,
    private continuationHandling: ContinuationHandlingService,
    private smartSuggestions: SmartSuggestionsService,
    private circuitBreaker: CircuitBreakerService,
    private orchestration: AIOrchestrationService
  ) {
    this.validateServiceDependencies();
    this.startHealthMonitoring();

    if (typeof window !== 'undefined') {
      (window as any).aiService = this;
    }
  }

  // ========================================
  // PUBLIC API - MAIN COMMAND EXECUTION
  // ========================================

  async executeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ EXECUTING COMMAND:', input);
    console.log('🗣️ Current context:', this.getConversationContext());

    try {
      return await this.routeCommand(input.trim());
    } catch (error) {
      return this.handleCommandError(error, input);
    }
  }

  // ========================================
  // COMMAND ROUTING
  // ========================================

  private async routeCommand(input: string): Promise<AIExecutionResult> {
    // Recipe commands
    if (this.isRecipeCommand(input)) {
      return this.handleRecipeCommand(input);
    }

    // Plus prefix commands
    if (this.isPlusCommand(input)) {
      return this.handlePlusCommand(input);
    }

    // Multi-item commands
    if (this.isMultiItemCommand(input)) {
      return this.handleMultiItemCommand(input);
    }

    // Continuation commands
    if (this.isContinuationCommand(input)) {
      return this.handleContinuationCommand(input);
    }

    // API key commands
    if (this.isApiKeyCommand(input)) {
      return this.handleApiKeyCommand(input);
    }

    // Help commands
    if (this.isHelpCommand(input)) {
      return this.handleHelpCommand();
    }

    // Test commands
    if (this.isTestCommand(input)) {
      return this.handleTestCommand();
    }

    // Show lists commands
    if (this.isShowListsCommand(input)) {
      return this.handleShowListsCommand();
    }

    // Negative responses
    if (this.isNegativeResponse(input)) {
      return this.handleNegativeResponse();
    }

    // Contextual commands
    if (this.isContextualCommand(input)) {
      return this.handleContextualCommand(input);
    }

    // Standard processing
    return this.handleStandardCommand(input);
  }

  // ========================================
  // COMMAND DETECTION METHODS
  // ========================================

  private isRecipeCommand(input: string): boolean {
    return this.recipeProcessing.isRecipeCommand(input);
  }

  private isPlusCommand(input: string): boolean {
    return input.startsWith('+');
  }

  private isMultiItemCommand(input: string): boolean {
    return this.quantityExtraction.hasMultipleItems(input);
  }

  private isContinuationCommand(input: string): boolean {
    return this.continuationHandling.isContinuationKeyword(input);
  }

  private isApiKeyCommand(input: string): boolean {
    return input.toLowerCase().includes('api key');
  }

  private isHelpCommand(input: string): boolean {
    const lower = input.toLowerCase();
    return lower.includes('hilfe') || lower.includes('help');
  }

  private isTestCommand(input: string): boolean {
    return input.toLowerCase().includes('test');
  }

  private isShowListsCommand(input: string): boolean {
    const lower = input.toLowerCase();
    return lower.includes('zeige') && lower.includes('liste');
  }

  private isNegativeResponse(input: string): boolean {
    return this.contextManager.isWaitingForArticles() && 
           this.continuationHandling.isNegativeResponse(input);
  }

  private isContextualCommand(input: string): boolean {
    return this.continuationHandling.shouldProcessAsContextual(input);
  }

  // ========================================
  // COMMAND HANDLERS
  // ========================================

  private async handleRecipeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 Recipe command detected');
    return await this.recipeProcessing.processRecipeCommand(
      input,
      (cmd) => this.commandProcessing.processEnhancedCommandWithMultiItems(cmd)
    );
  }

  private async handlePlusCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 Plus-prefix command detected');
    const itemText = input.substring(1).trim();
    
    if (!itemText) {
      return this.createPlusCommandErrorResult();
    }

    if (this.isMultiItemPlusCommand(itemText)) {
      return this.handleMultiItemPlusCommand(itemText);
    }

    return this.handleSingleItemPlusCommand(itemText);
  }

  private async handleMultiItemPlusCommand(itemText: string): Promise<AIExecutionResult> {
    console.log('🎯 Plus command with multiple items detected');
    const enhancedCommand = `Füge ${itemText} hinzu`;
    return await this.commandProcessing.processEnhancedCommandWithMultiItems(enhancedCommand);
  }

  private async handleSingleItemPlusCommand(itemText: string): Promise<AIExecutionResult> {
    console.log('🎯 Plus command with single item - checking lists first');
    
    const listOptions: ListSelectionOption[] = await this.disambiguation.getListSelectionOptions();
    
    if (listOptions.length === 0) {
      return this.createNoListsResult();
    }

    if (listOptions.length === 1) {
      return this.handleSingleListPlusCommand(itemText, listOptions[0].name);
    }

    return this.handleMultipleListsPlusCommand(itemText, listOptions);
  }

  private async handleSingleListPlusCommand(itemText: string, listName: string): Promise<AIExecutionResult> {
    const enhancedCommand = `Füge ${itemText} zu ${listName} hinzu`;
    console.log('🎯 Using only available list:', enhancedCommand);
    
    if (this.hasApiKey()) {
      return await this.commandProcessing.processEnhancedCommand(enhancedCommand);
    } else {
      return await this.commandProcessing.processBasicCommand(enhancedCommand);
    }
  }

  private handleMultipleListsPlusCommand(itemText: string, listOptions: ListSelectionOption[]): AIExecutionResult {
    const quantityExtraction = this.quantityExtraction.extractQuantity(itemText);
    
    const listSelectionAction: PendingAction = {
      type: 'select_list',
      originalInput: `+${itemText}`,
      itemName: quantityExtraction.itemName,
      extractedQuantity: quantityExtraction.quantity,
      listName: undefined,
      suggestedDepartment: this.departmentIconMapping.suggestDepartment(quantityExtraction.itemName),
      articleToAdd: {
        name: quantityExtraction.itemName,
        amount: quantityExtraction.quantity || '',
        departmentId: this.departmentIconMapping.suggestDepartment(quantityExtraction.itemName),
        icon: this.departmentIconMapping.suggestIcon(quantityExtraction.itemName)
      }
    };
    
    return {
      success: true,
      message: `🎯 Zu welcher Liste soll "${quantityExtraction.itemName}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} hinzugefügt werden?`,
      needsUserInput: true,
      disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
      pendingAction: listSelectionAction
    };
  }

  private async handleMultiItemCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 Multi-item detected');
    return await this.commandProcessing.processEnhancedCommandWithMultiItems(input);
  }

  private async handleContinuationCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ Continuation keyword detected');
    return await this.continuationHandling.handleContinuationCommand(
      input,
      (cmd) => this.commandProcessing.processEnhancedCommand(cmd)
    );
  }

  private handleApiKeyCommand(input: string): AIExecutionResult {
    const keyPattern = /(?:set\s+)?api\s+key[:\s]+([a-zA-Z0-9_-]+)/i;
    const match = input.match(keyPattern);
    
    if (match && match[1]) {
      const apiKey = match[1].trim();
      
      if (this.groqApi.validateApiKey(apiKey)) {
        this.setApiKey(apiKey);
        return {
          success: true,
          message: this.aiResponse.getApiKeySuccessMessage()
        };
      } else {
        return {
          success: false,
          message: this.aiResponse.getApiKeyErrorMessage()
        };
      }
    }
    
    const hasKey = this.hasApiKey();
    return {
      success: true,
      message: this.aiResponse.getApiKeyInstructions(hasKey)
    };
  }

  private handleHelpCommand(): AIExecutionResult {
    this.clearConversationContext();
    return {
      success: true,
      message: this.aiResponse.getEnhancedHelpMessage(this.hasApiKey())
    };
  }

  private handleTestCommand(): AIExecutionResult {
    return {
      success: true,
      message: this.aiResponse.getSystemStatusMessage(this.hasApiKey())
    };
  }

  private async handleShowListsCommand(): Promise<AIExecutionResult> {
    this.clearConversationContext();
    return await this.commandProcessing.handleShowListsCommand();
  }

  private handleNegativeResponse(): AIExecutionResult {
    return this.continuationHandling.handleNegativeResponse();
  }

  private async handleContextualCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ Processing simple article in context');
    return await this.continuationHandling.handleContextualArticleAddition(
      input,
      (extraction, listId, listName) => 
        this.commandProcessing.createArticleInConversationContext(extraction, listId, listName),
      (cmd) => this.commandProcessing.processEnhancedCommandWithMultiItems(cmd),
      (input) => this.quantityExtraction.extractQuantity(input)
    );
  }

  private async handleStandardCommand(input: string): Promise<AIExecutionResult> {
    this.clearConversationContext();
    
    if (this.hasApiKey()) {
      return await this.commandProcessing.processEnhancedCommand(input);
    } else {
      return await this.commandProcessing.processBasicCommand(input);
    }
  }

  // ========================================
  // ERROR HANDLING & TYPES
  // ========================================

  private handleCommandError(error: unknown, input: string): AIExecutionResult {
    console.error('AI Service error:', error);
    this.clearConversationContext();
    
    if (error instanceof AIServiceError) {
      return {
        success: false,
        message: `❌ ${error.message}`,
        error: error.code
      };
    }

    if (error instanceof ParsingError) {
      return {
        success: false,
        message: `❌ Parsing-Fehler: ${error.message}`,
        error: 'PARSING_ERROR'
      };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return {
      success: false,
      message: `❌ Ein Fehler ist aufgetreten: ${errorMessage}`,
      error: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
    };
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private isMultiItemPlusCommand(itemText: string): boolean {
    return itemText.includes(',');
  }

  private createPlusCommandErrorResult(): AIExecutionResult {
    return {
      success: false,
      message: '❌ Kein Artikel nach "+" angegeben.\n\n💡 Beispiel: "+Brot" fügt Brot zu einer Liste hinzu.'
    };
  }

  private createNoListsResult(): AIExecutionResult {
    return {
      success: false,
      message: this.aiResponse.getNoListsFoundMessage()
    };
  }

  // ========================================
  // SERVICE VALIDATION & INTERFACES
  // ========================================

  private validateServiceDependencies(): void {
    this.validateQuantityExtractionService();
    this.validateCommandParserService();
    this.validateOtherServices();
  }

  private validateQuantityExtractionService(): void {
    const service = this.quantityExtraction;
    
    if (typeof service.hasMultipleItems !== 'function') {
      throw new AIServiceError(
        'QuantityExtractionService missing hasMultipleItems method',
        'MISSING_METHOD'
      );
    }

    if (typeof service.parseMultipleItems !== 'function') {
      throw new AIServiceError(
        'QuantityExtractionService missing parseMultipleItems method',
        'MISSING_METHOD'
      );
    }

    if (typeof service.extractQuantity !== 'function') {
      throw new AIServiceError(
        'QuantityExtractionService missing extractQuantity method',
        'MISSING_METHOD'
      );
    }
  }

  private validateCommandParserService(): void {
    const service = this.commandParser;
    
    if (typeof service.parseIntent !== 'function') {
      throw new AIServiceError(
        'CommandParserService missing parseIntent method',
        'MISSING_METHOD'
      );
    }

    if (typeof service.extractColor !== 'function') {
      throw new AIServiceError(
        'CommandParserService missing extractColor method',
        'MISSING_METHOD'
      );
    }

    if (typeof service.cleanItemName !== 'function') {
      throw new AIServiceError(
        'CommandParserService missing cleanItemName method',
        'MISSING_METHOD'
      );
    }
  }

  private validateOtherServices(): void {
    const requiredServices: Array<{service: object; name: string}> = [
      { service: this.disambiguation, name: 'DisambiguationService' },
      { service: this.aiResponse, name: 'AIResponseService' },
      { service: this.commandProcessing, name: 'CommandProcessingService' },
      { service: this.recipeProcessing, name: 'RecipeProcessingService' },
      { service: this.contextManager, name: 'ContextManagementService' },
      { service: this.groqApi, name: 'GroqApiService' },
      { service: this.continuationHandling, name: 'ContinuationHandlingService' },
      { service: this.smartSuggestions, name: 'SmartSuggestionsService' }
    ];

    for (const { service, name } of requiredServices) {
      if (!service) {
        throw new AIServiceError(
          `${name} is not properly injected`,
          'SERVICE_INJECTION_ERROR'
        );
      }
    }
  }

  // ========================================
  // PUBLIC API - DISAMBIGUATION
  // ========================================

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice with conversation context');
    console.log('🎯 Pending action:', pendingAction);
    console.log('🎯 Selected option:', selectedOption);
    
    const result = await this.disambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
    
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      const messageMatch = result.message.match(/"([^"]+)" wurde (?:erstellt und )?zur Liste "([^"]+)" hinzugefügt/);
      const articleName = messageMatch?.[1] || pendingAction.itemName;
      const listName = messageMatch?.[2] || pendingAction.listName || 'Unbekannt';
      
      this.contextManager.updateContextForArticleAdded(result.listId, listName, articleName);
      
      result.conversationContext = this.getConversationContext();
      result.followUpPrompt = 'Du kannst direkt weitere Artikel zur letzt gewählten Liste hinzufügen (zB "Käse, Tomaten"). Wenn du damit fertig bist, kannst du rechts unten den ✅-Button klicken.';
    }
    
    return result;
  }

  async getDisambiguationOptions(itemName: string): Promise<DisambiguationOption[]> {
    return this.disambiguation.getDisambiguationOptions(itemName);
  }

  // ========================================
  // PUBLIC API - CONTEXT MANAGEMENT
  // ========================================

  setConversationContext(context: ConversationContext): void {
    this.contextManager.setConversationContext(context);
  }
  
  getConversationContext(): ConversationContext {
    return this.contextManager.getConversationContext();
  }
  
  clearConversationContext(): void {
    this.contextManager.clearConversationContext();
  }

  // ========================================
  // PUBLIC API - API KEY MANAGEMENT
  // ========================================

  setApiKey(apiKey: string): void {
    this.groqApi.setApiKey(apiKey);
  }

  hasApiKey(): boolean {
    return this.groqApi.hasApiKey();
  }

  getApiKeyStatus(): ApiKeyStatus {
    return this.groqApi.getApiKeyStatus();
  }

  public get quantityExtractionService(): QuantityExtractionService {
    return this.quantityExtraction;
  }
  
  public get aiResponseService(): AIResponseService {
    return this.aiResponse;
  }

// ========================================
  // HEALTH MONITORING METHODS
  // ========================================

  private startHealthMonitoring(): void {
    // Check AI health every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkAIHealth();
    }, 60000);
    
    // Initial health check
    this.checkAIHealth();
  }

  private checkAIHealth(): void {
    try {
      const metrics = this.circuitBreaker.getAllMetrics();
      const openCircuits = metrics.filter(m => m.state === 'open').length;
      const totalCircuits = metrics.length;
      
      if (totalCircuits === 0) {
        // No circuits yet - system starting up
        this.isAIHealthy = true;
        this.aiStatusMessage = '🟢 AI Ready';
        return;
      }
      
      if (openCircuits === 0) {
        this.isAIHealthy = true;
        this.aiStatusMessage = '🟢 AI Ready';
      } else if (openCircuits < totalCircuits / 2) {
        this.isAIHealthy = true;
        this.aiStatusMessage = '🟡 AI Limited';
      } else {
        this.isAIHealthy = false;
        this.aiStatusMessage = '🔴 AI Unavailable';
      }
      
      console.log(`🔍 AI Health Check: ${this.aiStatusMessage} (${openCircuits}/${totalCircuits} circuits open)`);
    } catch (error) {
      console.warn('Health monitoring error:', error);
      this.isAIHealthy = true; // Assume healthy if check fails
      this.aiStatusMessage = '🟢 AI Ready';
    }
  }

  // ========================================
  // PUBLIC API - HEALTH & TESTING
  // ========================================

  /**
   * Get current AI system status
   */
  getAIStatus(): {
    isHealthy: boolean;
    statusMessage: string;
    hasApiKey: boolean;
    circuitBreakers: any[];
  } {
    return {
      isHealthy: this.isAIHealthy,
      statusMessage: this.aiStatusMessage,
      hasApiKey: this.hasApiKey(),
      circuitBreakers: this.circuitBreaker.getAllMetrics()
    };
  }

  /**
   * Test circuit breaker functionality
   */
  async testCircuitBreaker(): Promise<{
    success: boolean;
    message: string;
    metrics: any[];
    statusReport: string;
  }> {
    console.log('🧪 Testing circuit breaker functionality...');
    
    try {
      // Get current metrics
      const metrics = this.circuitBreaker.getAllMetrics();
      
      // Generate status report
      const statusReport = this.circuitBreaker.generateStatusReport();
      
      // Test a simple service call
      await this.executeCommand('test');
      
      return {
        success: true,
        message: '✅ Circuit breaker test completed successfully',
        metrics,
        statusReport
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Circuit breaker test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metrics: [],
        statusReport: 'Test failed'
      };
    }
  }


/**
 * Get comprehensive system health report
 */
async getSystemHealthReport(): Promise<string> {
  try {
    // Since we're using regular orchestration, create a simple report
    const status = this.getAIStatus();
    const metrics = this.circuitBreaker.getAllMetrics();
    
    let report = `🚀 AI Service Health Report - ${new Date().toLocaleString()}\n`;
    report += `================================\n\n`;
    report += `📊 Status: ${status.statusMessage}\n`;
    report += `🔑 API Key: ${status.hasApiKey ? 'Configured' : 'Not configured'}\n`;
    report += `🔌 Circuit Breakers: ${metrics.length} active\n\n`;
    
    if (metrics.length > 0) {
      report += `Circuit Details:\n`;
      for (const metric of metrics) {
        report += `- ${metric.serviceName}: ${metric.state} (${metric.totalRequests} requests, ${(metric.failureRate * 100).toFixed(1)}% failure rate)\n`;
      }
    } else {
      report += `No circuit breaker metrics available yet.\n`;
    }
    
    return report;
  } catch (error) {
    return `❌ Failed to generate health report: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Trigger manual recovery of AI services
 */
async triggerManualRecovery(): Promise<{
  success: boolean;
  message: string;
  actions: string[];
}> {
  try {
    const actions: string[] = [];
    
    // Reset all circuits
    const metrics = this.circuitBreaker.getAllMetrics();
    for (const metric of metrics) {
      if (metric.state === 'open') {
        this.circuitBreaker.resetCircuit(metric.serviceName);
        actions.push(`Reset circuit: ${metric.serviceName}`);
      }
    }
    
    if (actions.length === 0) {
      actions.push('No circuits needed resetting');
    }
    
    // Force health check
    this.checkAIHealth();
    actions.push('Refreshed health status');
    
    return {
      success: true,
      message: 'Manual recovery completed successfully',
      actions
    };
  } catch (error) {
    return {
      success: false,
      message: `Manual recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      actions: []
    };
  }
}

  /**
   * Check if AI services show degradation warning
   */
  get showAIWarning(): boolean {
    return !this.isAIHealthy;
  }

  /**
   * Get user-friendly warning message
   */
  get aiWarningMessage(): string {
    if (this.isAIHealthy) return '';
    
    return `${this.aiStatusMessage} - Some AI features may be limited. You can still add items manually.`;
  }

  // ========================================
  // CLEANUP
  // ========================================
  ngOnDestroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

}