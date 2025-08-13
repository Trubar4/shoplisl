// src/app/core/services/ai/command-processing.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  AIExecutionResult,
  PendingAction,
  MultiItemPendingAction,
  DisambiguationOption
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { CommandParserService } from './command-parser.service';
import { DisambiguationService } from './disambiguation.service';
import { AIResponseService } from './ai-response.service';
import { DataService } from '../data.service';
import { GroqApiService } from './groq-api.service';
import { ContextManagementService } from './context-management.service';
import { ShoppingList, Article } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class CommandProcessingService {
  
  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: DisambiguationService,
    private aiResponse: AIResponseService,
    private dataService: DataService,
    private groqApi: GroqApiService,
    private contextManager: ContextManagementService
  ) {}

  // ========================================
  // ENHANCED COMMAND PROCESSING
  // ========================================

  async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND:', input);
    
    // Extract quantity from input
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🎯 Quantity extraction result:', quantityExtraction);
  
    // Parse command intent
    const intent = this.commandParser.parseIntent(input, quantityExtraction.itemName);
    console.log('🎯 Parsed intent:', intent);
  
    // Check for unrecognized commands
    if (intent.itemName === 'UNRECOGNIZED_COMMAND' || 
        (intent as any).confidence !== undefined && (intent as any).confidence < 0.5) {
      console.log('🎯 Unrecognized or low confidence command, providing guidance');
      return {
        success: false,
        message: `❌ Unbekannter Befehl: "${input}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle`
      };
    }
  
    // Handle create list commands
    if (intent.type === 'create_list') {
      console.log('🎯 Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }
  
    // Handle add item commands
    if (intent.type === 'add_item') {
      console.log('🎯 Processing add item command');
      
      // Check conversation context for target list
      const conversationContext = this.contextManager.getConversationContext();
      let targetListName = intent.listName;
      let targetListId: string | undefined;
      
      // If no explicit list in command but we have conversation context, use it
      if (!targetListName && conversationContext.waitingForArticles) {
        targetListName = conversationContext.waitingForArticles.listName;
        targetListId = conversationContext.waitingForArticles.listId;
        console.log('🎯 Using target list from conversation context:', targetListName, targetListId);
      }
      
      const pendingAction: PendingAction = {
        type: intent.type,
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: targetListName,
        suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName)
      };
  
      // Store conversation list ID in pending action for disambiguation service
      if (targetListId) {
        (pendingAction as any).conversationListId = targetListId;
      }
  
      console.log('🎯 Created pending action with conversation context:', pendingAction);
  
      return await this.handleItemActionWithDisambiguation(pendingAction);
    }
  
    // Fallback to basic processing
    return this.processBasicCommand(input);
  }

  // ========================================
  // BASIC COMMAND PROCESSING
  // ========================================

  async processBasicCommand(input: string): Promise<AIExecutionResult> {
    console.log('🤖 PROCESSING BASIC COMMAND:', input);
    
    const lowerInput = input.toLowerCase();
    const originalInput = input.trim();
    
    // Extract quantity and item name
    const quantityExtraction = this.quantityExtraction.extractQuantity(originalInput);
    
    // Handle list creation
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return await this.handleListCreationWithColor(originalInput, quantityExtraction);
    }
    
    // Handle item addition
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      return await this.handleItemAdditionBasic(originalInput, quantityExtraction);
    }
    
    // Unrecognized command response
    return {
      success: false,
      message: `❌ Unbekannter Befehl: "${originalInput}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle${!this.groqApi.hasApiKey() ? '<br>🔑 Groq API Key nicht gesetzt' : ''}`
    };
  }

  // ========================================
  // MULTI-ITEM PROCESSING
  // ========================================

  async processEnhancedCommandWithMultiItems(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND WITH MULTI-ITEMS (LIST-FIRST):', input);
    
    const multiItemResult = this.quantityExtraction.parseMultipleItems(input);
  
    if (multiItemResult.command === 'unrecognized' || multiItemResult.items.length === 0) {
      console.log('🎯 No multi-items found, using single item processing');
      return this.processEnhancedCommand(input);
    }
  
    // Determine target list FIRST, before processing any articles
    let targetListId: string | undefined;
    let targetListName: string | undefined;
  
    // Step 1: Check conversation context for target list
    const existingContext = this.contextManager.getConversationContext();
    if (existingContext.waitingForArticles) {
      targetListName = existingContext.waitingForArticles.listName;
      targetListId = existingContext.waitingForArticles.listId;
      console.log('🎯 Using target list from context:', targetListName);
    }
  
    // Step 2: Check command for explicit list name
    if (!targetListName && multiItemResult.listName) {
      targetListName = multiItemResult.listName;
      console.log('🎯 Using target list from command:', targetListName);
    }
  
    // Step 3: If no target list identified, ask user to select one NOW
    if (!targetListName || !targetListId) {
      console.log('🎯 No target list identified - asking user to select first');
      
      const listOptions = await this.disambiguation.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }
  
      if (listOptions.length === 1) {
        // Use the only available list
        targetListName = listOptions[0].name;
        targetListId = listOptions[0].id;
        console.log('🎯 Using only available list:', targetListName);
      } else {
        // Ask for list selection BEFORE processing articles
        const listSelectionAction: PendingAction = {
          type: 'select_list_for_multi_items',
          originalInput: input,
          itemName: `${multiItemResult.items.length} Artikel`,
          extractedQuantity: '',
          listName: undefined,
          suggestedDepartment: 'miscellaneous',
          multiItemData: {
            items: multiItemResult.items,
            command: multiItemResult.command,
            originalInput: input
          }
        } as any;
  
        return {
          success: true,
          message: `🎯 ${multiItemResult.items.length} Artikel erkannt. Zu welcher Liste sollen sie hinzugefügt werden?`,
          needsUserInput: true,
          disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
          pendingAction: listSelectionAction
        };
      }
    }
  
    // Step 4: Now we have a confirmed target list - find it by name if needed
    if (targetListName && !targetListId) {
      const targetList = await this.findListByName(targetListName);
      if (targetList) {
        targetListId = targetList.id;
      } else {
        return {
          success: false,
          message: `❌ Liste "${targetListName}" nicht gefunden.`
        };
      }
    }
  
    // Step 5: Process articles one by one with confirmed target list
    const multiAction: MultiItemPendingAction = {
      type: multiItemResult.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
      originalInput: input,
      itemName: multiItemResult.items[0]?.itemName || '',
      extractedQuantity: multiItemResult.items[0]?.quantity || '',
      items: multiItemResult.items,
      listName: targetListName!,
      currentItemIndex: 0,
      processedItems: [],
      suggestedDepartment: this.disambiguation.suggestDepartment(multiItemResult.items[0]?.itemName || ''),
      conversationListId: targetListId!,
      confirmedTargetListId: targetListId!,
      confirmedTargetListName: targetListName!
    } as any;
  
    return this.disambiguation.processMultiItemSequentially(multiAction);
  }

  // ========================================
  // LIST OPERATIONS
  // ========================================

  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    const cleanInput = colorExtraction.cleanInput;
    
    // Parse list creation
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/i);
    
    if (!createMatch) {
      return {
        success: false,
        message: '❌ Unverständlicher Liste-Befehl.\n\n💡 Beispiele:\n• "Erstelle Liste Spar"\n• "Erstelle Liste REWE in rot"'
      };
    }
    
    const listName = createMatch[1].trim();
    const itemName = createMatch[2]?.trim();
    
    try {
      const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
      
      const listToCreate = {
        name: listName,
        color: listColor,
        icon: '🛒',
        articleIds: [] as string[],
        itemStates: {} as any
      };
      
      // Create article if specified
      if (itemName) {
        const articleData = {
          name: itemName,
          amount: quantityExtraction.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(itemName),
          icon: this.aiResponse.suggestIcon(itemName)
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        
        if (newArticle) {
          listToCreate.articleIds.push(newArticle.id);
          listToCreate.itemStates[newArticle.id] = {
            articleId: newArticle.id,
            isChecked: false,
            amount: quantityExtraction.quantity || ''
          };
        }
      }
      
      const newList = await this.dataService.createList(listToCreate).toPromise();
      
      if (newList) {
        this.contextManager.updateContextForListCreated(newList.id, newList.name);
        
        const message = itemName 
          ? `✅ Liste "${newList.name}" wurde mit "${itemName}" erstellt.`
          : `✅ Liste "${newList.name}" wurde erstellt.`;
        
        return {
          success: true,
          message: message,
          listId: newList.id,
          conversationContext: this.contextManager.getConversationContext(),
          followUpPrompt: 'Möchtest du jetzt Artikel hinzufügen?'
        };
      }
    } catch (error) {
      console.error('🎨 LIST CREATION ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Erstellen der Liste.'
      };
    }
    
    return {
      success: false,
      message: '❌ Unerwarteter Fehler beim Erstellen der Liste.'
    };
  }

  async handleShowListsCommand(): Promise<AIExecutionResult> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      
      if (!lists || lists.length === 0) {
        return {
          success: true,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }
      
      let message = '📋 Deine Listen:\n\n';
      
      for (const list of lists) {
        const itemCount = list.articleIds?.length || 0;
        const itemText = itemCount === 1 ? 'Artikel' : 'Artikel';
        message += `• ${list.name} (${itemCount} ${itemText})\n`;
      }
      
      message += '\n💡 Befehle:\n';
      message += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      message += '• "Erstelle Liste [Name]"\n';
      message += '• "Rezept: [Zutatenliste]" (mit API Key)\n';
      message += '• "und [Artikel]" - Fortsetzung nach Artikel-Hinzufügung';
      
      return {
        success: true,
        message: message
      };
      
    } catch (error) {
      console.error('📋 SHOW LISTS ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Laden der Listen.'
      };
    }
  }

  // ========================================
  // ITEM OPERATIONS
  // ========================================

  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Handling item action with disambiguation:', action);

    // Get disambiguation options
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(action.itemName);
    console.log('🎯 Disambiguation options:', disambiguationOptions.length);

    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🎯 Found existing options, showing disambiguation');
      
      const enhancedOptions = [
        ...disambiguationOptions,
        {
          id: 'skip_item',
          displayName: `"${action.itemName}" überspringen`,
          type: 'skip' as const,
          confidence: 1.0,
          icon: '⏭️'
        }
      ];
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(action.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: action
      };
    }

    // No existing items found - create new article directly
    console.log('🎯 No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  private async handleItemAdditionBasic(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🔍 HANDLING BASIC ITEM ADDITION:', input);
    
    const lowerInput = input.toLowerCase();
    
    // Parse add patterns
    const addMatch = lowerInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/);
    
    if (!addMatch) {
      return {
        success: false,
        message: `❌ Unverständlicher Hinzufügen-Befehl: "${input}"\n\n💡 Beispiele:\n• "Füge Bananen hinzu"\n• "Füge drei kg Bananen zu Spar hinzu"`
      };
    }
    
    // Extract list name from original input
    const originalAddMatch = input.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/i);
    const listName = originalAddMatch?.[2]?.trim();
    const finalItemName = quantityExtraction.itemName;
    
    // Create pending action
    const pendingAction: PendingAction = {
      type: listName ? 'add_item' : 'select_list',
      originalInput: input,
      itemName: finalItemName,
      extractedQuantity: quantityExtraction.quantity,
      listName: listName,
      suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName)
    };

    if (!listName) {
      // Ask for list selection
      const listOptions = await this.disambiguation.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }

      if (listOptions.length === 1) {
        // Use the only available list directly
        return this.executeActionWithNewArticleToList(pendingAction, listOptions[0].name);
      }

      // Multiple lists - ask user to choose
      pendingAction.type = 'select_list';
      pendingAction.articleToAdd = {
        name: finalItemName,
        amount: quantityExtraction.quantity || '',
        departmentId: this.aiResponse.suggestDepartment(finalItemName),
        icon: this.aiResponse.suggestIcon(finalItemName)
      };

      return {
        success: true,
        message: this.aiResponse.getListSelectionMessage(finalItemName, quantityExtraction.quantity),
        needsUserInput: true,
        disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
        pendingAction: pendingAction
      };
    }

    // List was specified - proceed with addition
    return this.executeActionWithNewArticleToList(pendingAction, listName);
  }

  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Executing action with new article:', action.itemName);
    
    try {
      if (action.type === 'create_list') {
        const articleData = {
          name: action.itemName,
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.aiResponse.suggestIcon(action.itemName)
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();

        if (!newArticle) {
          throw new Error('Failed to create article');
        }

        const listData = {
          name: action.listName!,
          color: this.aiResponse.suggestListColor(action.listName!),
          icon: '🛒',
          articleIds: [newArticle.id],
          itemStates: { 
            [newArticle.id]: { 
              articleId: newArticle.id, 
              isChecked: false,
              amount: action.extractedQuantity || ''
            } 
          }
        };

        const newList = await this.dataService.createList(listData).toPromise();

        if (newList) {
          this.contextManager.updateContextForListCreated(newList.id, newList.name);

          return {
            success: true,
            message: `✅ Liste "${newList.name}" wurde mit "${newArticle.name}" erstellt.`,
            listId: newList.id,
            conversationContext: this.contextManager.getConversationContext(),
            followUpPrompt: 'Möchtest du jetzt weitere Artikel hinzufügen?'
          };
        }
      } else {
        // Handle add item without list specified
        const listOptions = await this.disambiguation.getListSelectionOptions();
        
        if (listOptions.length === 0) {
          return {
            success: false,
            message: this.aiResponse.getNoListsFoundMessage()
          };
        }

        if (listOptions.length === 1) {
          return this.executeActionWithNewArticleToList(action, listOptions[0].name);
        }

        // Ask for list selection
        action.type = 'select_list';
        action.articleToAdd = {
          name: action.itemName,
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.aiResponse.suggestIcon(action.itemName)
        };

        return {
          success: true,
          message: this.aiResponse.getListSelectionMessage(action.itemName, action.extractedQuantity),
          needsUserInput: true,
          disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
          pendingAction: action
        };
      }
    } catch (error) {
      console.error('🎯 Error creating new article:', error);
      return {
        success: false,
        message: '❌ Fehler beim Erstellen des neuen Artikels.'
      };
    }

    return {
      success: false,
      message: '❌ Unerwarteter Fehler.'
    };
  }

  private async executeActionWithNewArticleToList(action: PendingAction, listName: string): Promise<AIExecutionResult> {
    console.log('🎯 Executing action with new article to list:', listName);
    
    try {
      const articleData = {
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: this.aiResponse.suggestDepartment(action.itemName),
        icon: this.aiResponse.suggestIcon(action.itemName)
      };

      const newArticle = await this.dataService.createArticle(articleData).toPromise();

      if (newArticle) {
        const targetList = await this.findListByName(listName);

        if (targetList) {
          const updatedArticleIds = [...targetList.articleIds];
          if (!updatedArticleIds.includes(newArticle.id)) {
            updatedArticleIds.push(newArticle.id);
          }

          const updatedItemStates = { ...targetList.itemStates };
          updatedItemStates[newArticle.id] = {
            articleId: newArticle.id,
            isChecked: false,
            amount: action.extractedQuantity || ''
          };

          const updateResult = await this.dataService.updateList(targetList.id, {
            articleIds: updatedArticleIds,
            itemStates: updatedItemStates
          }).toPromise();
          
          if (updateResult) {
            // Set conversation context for follow-up
            this.contextManager.updateContextForArticleAdded(
              targetList.id,
              targetList.name,
              newArticle.name
            );
          
            return {
              success: true,
              message: `✅ "${newArticle.name}" wurde zu "${targetList.name}" hinzugefügt.`,
              listId: targetList.id,
              conversationContext: this.contextManager.getConversationContext(),
              followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.'
            };
          } else {
            return {
              success: false,
              message: `❌ Fehler beim Hinzufügen von "${newArticle.name}" zur Liste "${targetList.name}".`
            };
          }
        } else {
          return {
            success: false,
            message: `❌ Liste "${listName}" nicht gefunden.`
          };
        }
      } else {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${action.itemName}".`
        };
      }
    } catch (error) {
      console.error('🔍 Error adding to list:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen des Artikels.'
      };
    }
  }

  async createArticleInConversationContext(
    quantityExtraction: any, 
    listId: string, 
    listName: string
  ): Promise<AIExecutionResult> {
    console.log('🗣️ Creating article in conversation context:', {
      itemName: quantityExtraction.itemName,
      quantity: quantityExtraction.quantity,
      listId,
      listName
    });
    
    // CRITICAL FIX: Check for disambiguation first, just like regular flow
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(quantityExtraction.itemName);
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🗣️ Found existing articles, showing disambiguation');
      
      // Create pending action with conversation context
      const pendingAction: PendingAction = {
        type: 'add_item',
        originalInput: quantityExtraction.itemName,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: listName,
        suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName),
        conversationListId: listId
      } as any;
      
      const enhancedOptions = [
        ...disambiguationOptions,
        {
          id: 'skip_item',
          displayName: `"${quantityExtraction.itemName}" überspringen`,
          type: 'skip' as const,
          confidence: 1.0,
          icon: '⏭️'
        }
      ];
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: pendingAction
      };
    }
    
    // No existing items found - create new article directly (original logic)
    console.log('🗣️ No disambiguation needed, creating new article');
    
    try {
      // Get suggestions properly
      const [departmentId, icon] = await Promise.all([
        this.suggestDepartment(quantityExtraction.itemName),
        this.suggestIcon(quantityExtraction.itemName)
      ]);
      
      console.log('🗣️ Using suggestions:', { departmentId, icon });
      
      const articleData = {
        name: quantityExtraction.itemName,
        amount: quantityExtraction.quantity || '',
        departmentId,
        icon
      };
      
      // Create the article
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      
      if (!newArticle) {
        throw new Error(`Failed to create article: ${quantityExtraction.itemName}`);
      }
      
      console.log('🗣️ Created article:', newArticle);
      
      // Use the optimized addArticleToList method
      const addSuccess = await this.dataService.addArticleToList(listId, newArticle.id).toPromise();
      
      if (!addSuccess) {
        // Fallback: Try to find the list and update manually
        console.warn('🗣️ Direct addArticleToList failed, trying manual update');
        
        const targetList = await this.findListById(listId);
        
        if (!targetList) {
          throw new Error(`Target list not found: ${listId}`);
        }
  
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(newArticle.id)) {
          updatedArticleIds.push(newArticle.id);
        }
  
        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[newArticle.id] = {
          articleId: newArticle.id,
          isChecked: false,
          amount: quantityExtraction.quantity || ''
        };
  
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (!updateResult) {
          throw new Error(`Failed to update list: ${listName}`);
        }
      } else {
        // Set the amount separately if needed
        if (quantityExtraction.quantity) {
          await this.dataService.updateListItemAmount(listId, newArticle.id, quantityExtraction.quantity).toPromise();
        }
      }
      
      console.log('🗣️ Successfully added article to list');
      
      // Maintain conversation context
      this.contextManager.updateContextForArticleAdded(listId, listName, newArticle.name);
  
      const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt(newArticle.name, listName);
      
      return {
        success: true,
        message: `✅ "${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} wurde zu "${listName}" hinzugefügt.`,
        listId: listId,
        conversationContext: this.contextManager.getConversationContext(),
        followUpPrompt
      };
      
    } catch (error) {
      console.error('🗣️ ERROR creating article in conversation context:', error);
      console.error('🗣️ Full context:', { 
        quantityExtraction, 
        listId, 
        listName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${quantityExtraction.itemName}": ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      console.log('🔍 Finding list by name:', listName);
      
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      if (!lists) {
        console.log('🔍 No lists found');
        return null;
      }
      
      console.log('🔍 Available lists:', lists.map(l => l.name));
      
      const normalizedQuery = listName.toLowerCase().trim();
      
      // Exact match first (case-insensitive)
      let match = lists.find(list => 
        list.name.toLowerCase() === normalizedQuery
      );
      
      if (match) {
        console.log('🔍 Found exact match:', match.name);
        return match;
      }
      
      // Partial match
      match = lists.find(list => 
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );
      
      if (match) {
        console.log('🔍 Found partial match:', match.name);
      } else {
        console.log('🔍 No match found for:', listName);
      }
      
      return match || null;
    } catch (error) {
      console.error('Error finding list by name:', error);
      return null;
    }
  }

  private async findListById(listId: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  }

  async suggestDepartment(itemName: string): Promise<string> {
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const suggestions = await this.groqApi.getSmartSuggestions(itemName, articles || []);
      if (suggestions?.departmentId) {
        console.log('✅🤖 AI department:', suggestions.departmentId);
        return suggestions.departmentId;
      }
    } catch (error) {
      console.log('🎯❌ AI failed, using fallback');
    }
    
    // Fallback
    const lowerName = itemName.toLowerCase();
    if (/milch|käse|joghurt/.test(lowerName)) return 'dairy-products';
    if (/brot|nudeln|reis/.test(lowerName)) return 'bread';
    if (/fleisch|wurst|fisch/.test(lowerName)) return 'meat-fish';
    if (/bier|wein|wasser|saft/.test(lowerName)) return 'beverages-alcohol';
    return 'miscellaneous';
  }
  
  async suggestIcon(itemName: string): Promise<string> {
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const suggestions = await this.groqApi.getSmartSuggestions(itemName, articles || []);
      if (suggestions?.icon) {
        console.log('✅🤖 AI icon:', suggestions.icon);
        return suggestions.icon;
      }
    } catch (error) {
      console.log('🎯❌ AI failed, using fallback');
    }
    
    // Fallback
    const lowerName = itemName.toLowerCase();
    if (/milch/.test(lowerName)) return '🥛';
    if (/brot/.test(lowerName)) return '🍞';
    if (/bier/.test(lowerName)) return '🍺';
    if (/käse/.test(lowerName)) return '🧀';
    return '📦';
  }
}