// src/app/shared/components/voice-ai-assistant/services/voice-ai-result-handler.service.ts
import { Injectable } from '@angular/core';
import { ConversationContext } from '../../../../core/models';
import { AIExecutionResult, ActionButton } from '../../../../core/services/ai';
import { ChatPersistenceService } from '../../../../core/services/chat-persistence.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { VoiceAIContextService } from './voice-ai-context.service';

/**
 * VoiceAIResultHandlerService - Processes AI execution results
 *
 * Extracted from VoiceAIAssistantComponent (Phase 2 refactoring) to:
 * - Centralize AI result processing logic
 * - Handle context creation from results
 * - Manage follow-up prompts
 *
 * Key responsibilities:
 * - Process AI execution results
 * - Extract and create conversation contexts from results
 * - Determine follow-up prompts
 * - Handle disambiguation setup
 */
@Injectable({
  providedIn: 'root'
})
export class VoiceAIResultHandlerService {

  constructor(
    private chatPersistence: ChatPersistenceService,
    private contextService: VoiceAIContextService,
    private logger: LoggerService
  ) {}

  /**
   * Process AI result and extract context if needed
   * Returns the enhanced result with context and follow-up prompt
   */
  processResult(result: AIExecutionResult): AIExecutionResult {
    this.logger.debug('voice', '🤖 Processing AI result:', result);

    // Handle existing conversation context
    if (result.conversationContext) {
      this.logger.debug('voice', '🤖 Updating conversation context bidirectionally');
      this.contextService.setContext(result.conversationContext);
    }

    // Detect list creation and force context if missing
    if (result.success && result.listId &&
        (result.message.includes('Liste') && result.message.includes('erstellt'))) {
      result = this.handleListCreationResult(result);
    }

    // Detect article addition and ensure context
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      result = this.handleArticleAdditionResult(result);
    }

    return result;
  }

  /**
   * Handle list creation result - ensure context is set
   */
  private handleListCreationResult(result: AIExecutionResult): AIExecutionResult {
    this.logger.debug('voice', '🤖 List creation detected - forcing conversation context');

    const listNameMatch = result.message.match(/Liste "([^"]+)" wurde erstellt/);
    const listName = listNameMatch ? listNameMatch[1] : 'Neue Liste';

    if (!result.conversationContext) {
      const forcedContext = this.contextService.createListCreatedContext(result.listId!, listName);
      this.contextService.setContext(forcedContext);
      result.conversationContext = forcedContext;
      result.followUpPrompt = result.followUpPrompt ||
        `Möchtest du jetzt Artikel zu "${listName}" hinzufügen?`;
    }

    return result;
  }

  /**
   * Handle article addition result - ensure context is set
   */
  private handleArticleAdditionResult(result: AIExecutionResult): AIExecutionResult {
    this.logger.debug('voice', '🤖 Article addition detected - ensuring conversation context');

    if (!result.conversationContext) {
      const messageMatch = result.message.match(/"([^"]+)" wurde (?:erstellt und )?zur Liste "([^"]+)" hinzugefügt/);
      const articleName = messageMatch ? messageMatch[1] : 'Artikel';
      const listName = messageMatch ? messageMatch[2] : 'Liste';

      const forcedContext = this.contextService.createArticleAddedContext(
        result.listId!,
        listName,
        articleName
      );

      this.contextService.setContext(forcedContext);
      result.conversationContext = forcedContext;
      result.followUpPrompt = result.followUpPrompt ||
        'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.';
    }

    return result;
  }

  /**
   * Check if result needs disambiguation handling
   */
  needsDisambiguation(result: AIExecutionResult): boolean {
    return !!(result.needsUserInput && result.disambiguationOptions && result.pendingAction);
  }

  /**
   * Prepare disambiguation data for the UI
   */
  prepareDisambiguationData(result: AIExecutionResult): {
    message: string;
    options: any[];
    pendingAction: any;
  } | null {
    if (!this.needsDisambiguation(result)) {
      return null;
    }

    // Convert options for compatibility
    const compatibleOptions = result.disambiguationOptions!.map((option: any) => ({
      id: option.id,
      displayName: option.displayName,
      type: option.type,
      article: option.article,
      confidence: option.confidence,
      department: option.department,
      icon: option.icon
    }));

    return {
      message: `"${result.pendingAction!.itemName}" Welchen dieser ähnlichen Artikel möchtest du verwenden?`,
      options: compatibleOptions,
      pendingAction: result.pendingAction
    };
  }

  /**
   * Preserve context after disambiguation choice
   */
  preserveContextAfterDisambiguation(
    result: AIExecutionResult,
    pendingAction: any,
    currentContext: ConversationContext
  ): AIExecutionResult {
    // Preserve context if we were in an active conversation
    if (result.success && !result.conversationContext && currentContext.waitingForArticles) {
      const preservedContext = this.contextService.createArticleAddedContext(
        currentContext.waitingForArticles.listId,
        currentContext.waitingForArticles.listName,
        pendingAction.itemName
      );

      result.conversationContext = preservedContext;
      result.followUpPrompt = result.followUpPrompt ||
        `Möchtest du noch weitere Artikel zu "${currentContext.waitingForArticles.listName}" hinzufügen?`;
    }

    // Create context from result if we have a listId but no context
    if (result.listId && !result.conversationContext) {
      const listNameMatch = result.message.match(/zur Liste "([^"]+)" hinzugefügt/);
      const listName = listNameMatch ? listNameMatch[1] :
                      (currentContext.waitingForArticles?.listName || 'Liste');

      result.conversationContext = this.contextService.createArticleAddedContext(
        result.listId,
        listName,
        pendingAction.itemName
      );

      result.followUpPrompt = result.followUpPrompt ||
        `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`;
    }

    return result;
  }

  /**
   * Get action buttons from result
   */
  getActionButtons(result: AIExecutionResult): ActionButton[] {
    return result.actionButtons || [];
  }

  /**
   * Check if input is a recipe
   */
  isRecipeInput(input: string): boolean {
    const lowerInput = input.toLowerCase();
    const firstLine = lowerInput.split(/\r?\n/)[0].trim();

    const recipeKeywords = [
      'rezept:', 'rezept', 'zutaten:', 'zutaten',
      'ingredienzien:', 'ingredienzien', 'ingredients:',
      'einkaufsliste aus rezept'
    ];

    return recipeKeywords.some(keyword => {
      if (keyword.endsWith(':')) {
        return firstLine.startsWith(keyword);
      } else {
        return firstLine === keyword || firstLine.startsWith(keyword + ' ');
      }
    });
  }

  /**
   * Check if input is a system command
   */
  isSystemCommand(input: string): boolean {
    const lowerInput = input.toLowerCase();
    return lowerInput.includes('hilfe') ||
           lowerInput.includes('help') ||
           lowerInput.includes('test') ||
           lowerInput.includes('api key') ||
           lowerInput.includes('zeige liste');
  }

  /**
   * Check if input is a list creation command
   */
  isListCreationCommand(input: string): boolean {
    const lowerInput = input.toLowerCase();
    return lowerInput.includes('erstelle') && lowerInput.includes('liste');
  }

  /**
   * Check if input is an explicit add command
   */
  isExplicitAddCommand(input: string): boolean {
    const lowerInput = input.toLowerCase();
    return lowerInput.includes('füge') && lowerInput.includes('hinzu');
  }

  /**
   * Check if input is an end conversation command
   */
  isEndConversationCommand(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    return lowerInput === 'nein' ||
           lowerInput === 'fertig' ||
           lowerInput === 'stop' ||
           lowerInput === 'ende';
  }

  /**
   * Prepare recipe context preservation result
   */
  prepareRecipeContextPreservation(
    result: AIExecutionResult,
    targetListId: string | null,
    targetListName: string | null
  ): AIExecutionResult {
    if (targetListName && targetListId && !result.conversationContext) {
      this.logger.debug('voice', '🍳 Forcing context restoration after recipe processing');

      result.conversationContext = this.contextService.createRecipeContext(targetListId, targetListName);
      result.followUpPrompt = result.followUpPrompt ||
        `Möchtest du noch weitere Artikel zu "${targetListName}" hinzufügen?`;
    }

    return result;
  }
}
