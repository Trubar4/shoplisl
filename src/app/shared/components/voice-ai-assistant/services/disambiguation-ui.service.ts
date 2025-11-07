/**
 * Disambiguation UI Service
 *
 * Handles UI formatting and helpers for disambiguation options in the voice assistant.
 * Provides methods for formatting options, icons, descriptions, and progress tracking.
 *
 * @responsibility Disambiguation UI formatting and helpers
 * @pattern Service-based architecture for UI utilities
 */

import { Injectable } from '@angular/core';
import { DisambiguationOption } from '../../../../core/services/ai';

@Injectable({
  providedIn: 'root'
})
export class DisambiguationUIService {

  // ========================================
  // RECIPE PROCESSING
  // ========================================

  /**
   * Check if the pending action is from recipe processing
   */
  public isRecipeProcessing(pendingAction: any): boolean {
    if (!pendingAction) return false;
    return pendingAction.isFromRecipe ||
           pendingAction.isMultiItemSequential ||
           (pendingAction.originalInput && pendingAction.originalInput.toLowerCase().includes('rezept')) ||
           (pendingAction.allItems && pendingAction.allItems.length > 3);
  }

  /**
   * Check if processing sequential recipe items
   */
  public isSequentialRecipeProcessing(pendingAction: any): boolean {
    return pendingAction?.isMultiItemSequential &&
           pendingAction?.items &&
           Array.isArray(pendingAction.items) &&
           typeof pendingAction?.currentItemIndex === 'number' &&
           pendingAction.currentItemIndex < pendingAction.items.length;
  }

  /**
   * Get current item index in sequential processing
   */
  public getCurrentItemIndex(pendingAction: any): number {
    return pendingAction?.currentItemIndex || 0;
  }

  /**
   * Get total number of items to process
   */
  public getTotalItems(pendingAction: any): number {
    return pendingAction?.allItems?.length || pendingAction?.items?.length || 1;
  }

  /**
   * Calculate progress percentage for sequential processing
   */
  public getProgressPercentage(pendingAction: any): number {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return 0;
    const current = this.getCurrentItemIndex(pendingAction) + 1;
    const total = this.getTotalItems(pendingAction);
    return Math.round((current / total) * 100);
  }

  /**
   * Check if "Skip All" option should be available
   * Returns true if there are 3 or more items remaining
   */
  public canSkipAll(pendingAction: any): boolean {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return false;
    const current = this.getCurrentItemIndex(pendingAction);
    const total = this.getTotalItems(pendingAction);
    return (total - current) >= 3;
  }

  // ========================================
  // DISAMBIGUATION HEADER
  // ========================================

  /**
   * Get header color for disambiguation panel
   */
  public getDisambiguationHeaderColor(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return '#2196f3';
    }
    return '#ff9800';
  }

  /**
   * Get header icon for disambiguation panel
   */
  public getDisambiguationHeaderIcon(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return 'playlist_add';
    }
    return 'help_outline';
  }

  /**
   * Get header title for disambiguation panel
   */
  public getDisambiguationHeaderTitle(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return 'Liste auswählen';
    }

    // For article disambiguation, don't show "X Artikel" subtitle
    return 'Artikel auswählen';
  }

  // ========================================
  // ACTION DESCRIPTIONS & HINTS
  // ========================================

  /**
   * Get description for the pending action
   */
  public getActionDescription(pendingAction: any): string {
    if (!pendingAction) return 'Unbekannte Aktion';

    if ('items' in pendingAction && 'currentItemIndex' in pendingAction) {
      const items = pendingAction.items;
      const currentIndex = pendingAction.currentItemIndex;

      if (Array.isArray(items) && typeof currentIndex === 'number' && currentIndex < items.length) {
        const currentItem = items[currentIndex];
        if (currentItem && currentItem.itemName) {
          return `Artikel ${currentIndex + 1}/${items.length}: "${currentItem.itemName}" verarbeiten`;
        }
      }
      return `Mehrere Artikel verarbeiten`;
    } else {
      switch (pendingAction.type) {
        case 'add_item':
          return pendingAction.listName ?
            `Hinzufügen zu "${pendingAction.listName}"` :
            'Hinzufügen zur Liste';
        case 'create_list':
          return `Neue Liste "${pendingAction.listName}" erstellen`;
        case 'select_list':
          return 'Zur ausgewählten Liste hinzufügen';
        default:
          return 'Unbekannte Aktion';
      }
    }
  }

  /**
   * Get action hint text for an option
   */
  public getActionHint(option: any, pendingAction: any): string {
    if (!pendingAction) return 'Unbekannte Aktion';

    if (option.type === 'skip') {
      return 'Überspringen';
    }

    const isListSelection = pendingAction?.type === 'select_list';

    if (isListSelection) {
      if ('items' in pendingAction) {
        const items = pendingAction.items;
        if (Array.isArray(items) && items.length > 1) {
          return `${items.length} Artikel zu "${option.displayName}" hinzufügen`;
        }
      }
      return `Zu "${option.displayName}" hinzufügen`;
    }

    if (option.type === 'existing') {
      return 'Vorhandenen Artikel verwenden';
    } else {
      return 'Neuen Artikel erstellen';
    }
  }

  // ========================================
  // ICON HELPERS
  // ========================================

  /**
   * Get default icon based on option type
   */
  public getDefaultIcon(option: any): string {
    if (option.type === 'skip') return '⏭️';
    if (option.type === 'new') return '➕';
    if (option.type === 'existing') return '📦';
    return '📋';
  }

  /**
   * Get icon for an option (uses suggested icon if available)
   */
  public getOptionIcon(option: any): string {
    // Skip options get their specific icon
    if (option.type === 'skip') {
      return '⏭️';
    }

    // Use suggested icon if available
    if (option.icon && option.icon !== '✨') {
      return option.icon;
    }

    // Fallback to default
    return this.getDefaultIcon(option);
  }

  // ========================================
  // TEXT FORMATTING
  // ========================================

  /**
   * Get confidence text description
   */
  public getConfidenceText(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (percentage >= 90) return `${percentage}% - Exakte Übereinstimmung`;
    if (percentage >= 70) return `${percentage}% - Sehr ähnlich`;
    if (percentage >= 50) return `${percentage}% - Ähnlich`;
    return `${percentage}% - Entfernt ähnlich`;
  }

  /**
   * Get German name for department ID
   */
  public getDepartmentName(departmentId: string): string {
    const departmentNames: Record<string, string> = {
      'fruit-vegetables': 'Obst & Gemüse',
      'dairy-products': 'Milchprodukte',
      'sausage-cheese-counter': 'Wurst & Käse',
      'fridge-meat': 'Fleisch',
      'fish': 'Fisch',
      'bread': 'Brot & Backwaren',
      'noodles-rice': 'Nudeln & Reis',
      'tins-jars': 'Konserven',
      'spices-oils': 'Gewürze & Öle',
      'beverages-alcohol': 'Getränke',
      'frozen-goods': 'Tiefkühl',
      'pastries': 'Süßwaren',
      'sweet-salty': 'Süß & Salzig',
      'household-goods': 'Haushalt',
      'body-care': 'Körperpflege',
      'cleaning-agents': 'Reinigung',
      'breakfast': 'Frühstück',
      'international': 'International',
      'pet-supplies': 'Tierbedarf',
      'baby': 'Baby',
      'medicine': 'Medikamente',
      'miscellaneous': 'Sonstiges'
    };

    return departmentNames[departmentId] || departmentId;
  }

  /**
   * Generate choice text for user feedback
   */
  public generateChoiceText(option: DisambiguationOption, pendingAction: any): string {
    if (option.type === 'skip') {
      return `⏭️ "${pendingAction.itemName}" übersprungen`;
    }

    if (this.isSequentialRecipeProcessing(pendingAction)) {
      const current = this.getCurrentItemIndex(pendingAction) + 1;
      const total = this.getTotalItems(pendingAction);

      if (option.type === 'existing') {
        return `🍳 Zutat ${current}/${total}: ${option.displayName} gewählt`;
      } else {
        return `🍳 Zutat ${current}/${total}: "${pendingAction.itemName}" (neu erstellen)`;
      }
    }

    if (option.type === 'existing') {
      // If the pending action is a list selection (single or multi-item), reflect that in the message
      if (pendingAction && (pendingAction.type === 'select_list' || pendingAction.type === 'select_list_for_multi_items')) {
        return `Vorhandene Liste gewählt: ${option.displayName}`;
      }

      return `Vorhandener Artikel gewählt: ${option.displayName}`;
    }

    if (option.type === 'new') {
      return pendingAction.itemName ?
        `Neuer Artikel erstellt: ${pendingAction.itemName}` :
        'Neuer Artikel erstellt';
    }

    return option.displayName || 'Option gewählt';
  }

  /**
   * Track by function for option lists
   */
  public trackByOptionId(index: number, option: any): string {
    return option.id || index.toString();
  }
}
