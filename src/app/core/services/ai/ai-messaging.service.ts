// src/app/core/services/ai/ai-messaging.service.ts
import { Injectable } from '@angular/core';
import { Observable, throwError, of } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import {
  DepartmentMapping,
  ColorMapping,
  AIExecutionResult,
  AIServiceError
} from './ai-models';
import { environment } from '../../../../environments/environment';
import { LoggerService } from '../logger.service';

// ========================================
// ERROR HANDLING TYPES
// ========================================

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  operation: string;
  input?: any;
  metadata?: Record<string, any>;
  userId?: string;
  timestamp: Date;
}

export interface ErrorHandlingConfig {
  retryAttempts: number;
  retryDelay: number;
  timeoutMs: number;
  fallbackEnabled: boolean;
  logLevel: ErrorSeverity;
}

export interface ValidationRule {
  validator: (input: any) => boolean;
  message: string;
}

/**
 * Consolidated AI Messaging Service
 *
 * Combines message generation and error handling responsibilities:
 * - Success, error, help, and status messages
 * - Department, color, and icon suggestions
 * - Error handling with retry logic
 * - Error logging and context tracking
 * - Input validation
 */
@Injectable({
  providedIn: 'root'
})
export class AIMessagingService {

  // ========================================
  // ERROR HANDLING CONFIG
  // ========================================

  private readonly defaultConfig: ErrorHandlingConfig = {
    retryAttempts: 2,
    retryDelay: 1000,
    timeoutMs: 10000,
    fallbackEnabled: true,
    logLevel: ErrorSeverity.MEDIUM
  };

  // ========================================
  // DEPARTMENT MAPPINGS
  // ========================================

  private readonly DEPARTMENT_KEYWORDS: DepartmentMapping = {
    'bread': ['brot', 'brötchen', 'baguette', 'toast', 'weißbrot', 'vollkornbrot', 'semmel'],
    'fruit-vegetables': ['apfel', 'banana', 'banane', 'orange', 'tomate', 'salat', 'karotte', 'zwiebel', 'obst', 'gemüse', 'gurke', 'paprika', 'zitrone'],
    'dairy-products': ['milch', 'butter', 'joghurt', 'käse', 'sahne', 'quark', 'frischkäse', 'mozzarella'],
    'meat': ['fleisch', 'wurst', 'schinken', 'hähnchen', 'rind', 'schwein', 'hackfleisch'],
    'fish': ['fisch', 'lachs', 'thunfisch', 'garnelen', 'forelle'],
    'beverages-alcohol': ['wasser', 'saft', 'bier', 'wein', 'cola', 'kaffee', 'tee', 'mineralwasser'],
    'frozen-goods': ['tiefkühl', 'eis', 'pizza', 'pommes', 'spinat'],
    'sweet-salty': ['schokolade', 'chips', 'kekse', 'süßigkeiten', 'nüsse', 'bonbons'],
    'cleaning-agents': ['spülmittel', 'waschmittel', 'putzmittel', 'reiniger'],
    'body-care': ['shampoo', 'zahnpasta', 'seife', 'duschgel', 'deo'],
    'household-goods': ['toilettenpapier', 'küchenrolle', 'müllbeutel', 'servietten']
  };

  // ========================================
  // COLOR MAPPINGS FOR LISTS
  // ========================================

  private readonly STORE_COLORS: ColorMapping = {
    'spar': '#00A651',
    'billa': '#FF6B00',
    'hofer': '#E30613',
    'merkur': '#0066CC',
    'interspar': '#00A651',
    'lidl': '#0050AA',
    'penny': '#E30613',
    'adeg': '#FFD700'
  };

  private readonly DEFAULT_COLORS = [
    '#1a9edb', '#4CAF50', '#FF9800', '#9C27B0', '#F44336'
  ];

  // ========================================
  // ICON MAPPINGS
  // ========================================

  private readonly ICON_MAP: { [key: string]: string } = {
    'banane': '🍌', 'banana': '🍌',
    'apfel': '🍎', 'apple': '🍎',
    'brot': '🍞', 'bread': '🍞',
    'milch': '🥛', 'milk': '🥛',
    'käse': '🧀', 'cheese': '🧀',
    'fleisch': '🥩', 'meat': '🥩',
    'fisch': '🐟', 'fish': '🐟',
    'ei': '🥚', 'egg': '🥚',
    'wasser': '💧', 'water': '💧',
    'bier': '🍺', 'beer': '🍺',
    'salat': '🥗', 'lettuce': '🥬',
    'tomate': '🍅', 'tomato': '🍅',
    'pizza': '🍕',
    'pasta': '🍝',
    'reis': '🍚', 'rice': '🍚',
    'kaffee': '☕', 'coffee': '☕',
    'tee': '🍵', 'tea': '🍵',
    'schokolade': '🍫', 'chocolate': '🍫',
    'kuchen': '🍰', 'cake': '🍰',
    'wein': '🍷', 'wine': '🍷'
  };

  constructor(private logger: LoggerService) {}

  // ========================================
  // SUGGESTION METHODS
  // ========================================

  /**
   * 🏪 Suggest department based on article name
   */
  suggestDepartment(articleName: string): string {
    const normalized = articleName.toLowerCase();

    for (const [departmentId, keywords] of Object.entries(this.DEPARTMENT_KEYWORDS)) {
      if (keywords.some(keyword =>
        normalized.includes(keyword) || keyword.includes(normalized)
      )) {
        return departmentId;
      }
    }

    return 'miscellaneous';
  }

  /**
   * 🎨 Suggest icon based on article name
   */
  suggestIcon(articleName: string): string {
    const normalized = articleName.toLowerCase();

    for (const [keyword, icon] of Object.entries(this.ICON_MAP)) {
      if (normalized.includes(keyword)) {
        return icon;
      }
    }

    return '📦';
  }

  /**
   * 🌈 Suggest list color based on list name
   */
  suggestListColor(listName: string): string {
    const normalized = listName.toLowerCase();

    // Check for store names first
    for (const [shop, color] of Object.entries(this.STORE_COLORS)) {
      if (normalized.includes(shop)) {
        return color;
      }
    }

    // Return random default color
    return this.DEFAULT_COLORS[Math.floor(Math.random() * this.DEFAULT_COLORS.length)];
  }

  // ========================================
  // HELP MESSAGES
  // ========================================

  public getEnhancedHelpMessage(hasApiKey: boolean): string {
    if (hasApiKey) {
      return '🤖 <strong>ShopLisl AI Assistent</strong><br><br>' +
        '✅ <strong>Verfügbare Befehle:</strong><br>' +
        '<table style="border-collapse: collapse; margin: 0; padding: 0; width: 100%;">' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">➕ "Füge [Artikel] hinzu" oder +[Artikel]<br><em>Mehrere Formate: Komma-getrennt, Mengen mit Leerzeichen, oder "und" verbunden</em></td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">🆕 "Erstelle Liste [Name] in [Farbe]"</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">🍽️ "Rezept: [Zutatenliste]"</td></tr>' +
        '</table><br>' +
        '<strong>🔄 Beispiele:</strong><br>' +
        '<table style="border-collapse: collapse; margin: 0; padding: 0; width: 100%;">' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">➕ "+Brot"</td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">➕ "Füge Milch, Brot, Bananen hinzu"</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">➕ "Füge 500g Mehl 2 Eier 250ml Milch hinzu"</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">➕ "Milch, Brot und Käse"</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">🍽️ "Rezept: 500g Mehl, 2 Eier, 250ml Milch"</td></tr>' +
        '</table>';
    } else {
      return '🤖 <strong>ShopLisl AI Assistent</strong><br><br>' +
        '⚙️ <strong>Basis-Funktionen:</strong><br>' +
        '<table style="border-collapse: collapse; margin: 0; padding: 0; width: 100%;">' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">"Füge [Artikel] hinzu" - alle Formate</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">"Erstelle Liste [Name]"</td></tr>' +
        '</table><br>' +
        '<strong>🔄 Beispiele:</strong><br>' +
        '<table style="border-collapse: collapse; margin: 0; padding: 0; width: 100%;">' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">"Füge Milch, Brot hinzu"</td></tr>' +
        '<tr><td style="height: 1px !important; background-color: #e0e0e0 !important; padding: 0 !important; line-height: 0 !important; font-size: 0 !important;"></td></tr>' +
        '<tr><td style="vertical-align: top !important; line-height: 1.2 !important; padding: 8px 0;">"Füge 2kg Bananen 500g Mehl hinzu"</td></tr>' +
        '</table>';
    }
  }

  /**
   * 🗣️ Get context-aware help message
   */
  getContextualHelpMessage(isWaitingForArticles: boolean, listName?: string): string {
    if (isWaitingForArticles && listName) {
      return `🗣️ Du befindest dich gerade in einer Unterhaltung!\n\n` +
        `📝 Ich warte darauf, dass du Artikel zu "${listName}" hinzufügst.\n\n` +
        `💡 Du kannst einfach sagen:\n` +
        `• "Milch" - Einfacher Artikelname\n` +
        `• "2kg Bananen" - Mit Menge\n` +
        `• "Joghurt Menge 500g" - Mit Menge-Syntax\n\n` +
        `🛑 Oder sage "Nein" / "Fertig" um die Unterhaltung zu beenden.\n\n` +
        `📋 Normale Befehle funktionieren auch weiterhin.`;
    }

    return this.getEnhancedHelpMessage(true);
  }

  /**
   * 🔑 Get API key guidance message
   */
  getNoApiKeyGuidance(): string {
    return '💡 Für intelligente Features:\n\n1️⃣ Groq API Key kostenlos erstellen:\n🔗 https://console.groq.com/keys\n\n2️⃣ Hier eingeben:\n"set api key: gsk_YOUR_KEY_HERE"\n\n✨ Dann verfügbar:\n• Smart Disambiguation\n• Mengen-Erkennung\n• Intelligente Artikel-Vorschläge\n• Automatische Listen-Auswahl\n• Mehrere Artikel gleichzeitig';
  }

  /**
   * 📊 Get system status message
   */
  getSystemStatusMessage(hasApiKey: boolean): string {
    const source = localStorage.getItem('groq-api-key') ? 'localStorage' :
                  environment?.groqApiKey ? 'environment.ts' : 'none';

    return `✅ AI Service funktioniert!\n\nAPI Key: ${hasApiKey ? '✅ Konfiguriert' : '❌ Nicht gefunden'}\nQuelle: ${source}\n\n🎯 Enhanced Features:\n• Smart Disambiguation: ${hasApiKey ? '✅' : '❌'}\n• Quantity Extraction: ${hasApiKey ? '✅' : '❌'}\n• Multi-Item Parsing: ${hasApiKey ? '✅' : '❌'}\n• List Selection: ✅\n• Fuzzy Matching: ${hasApiKey ? '✅' : '❌'}\n\n${!hasApiKey ? this.getNoApiKeyGuidance() : '🚀 Alle Systeme bereit für intelligente Verarbeitung!'}`;
  }

  // ========================================
  // API KEY RESPONSE MESSAGES
  // ========================================

  /**
   * 🔑 Get API key setup success message
   */
  getApiKeySuccessMessage(): string {
    return '🔑 API Key erfolgreich gespeichert!\n\n✅ Groq API Key konfiguriert\n🎯 Smart Disambiguation aktiviert\n🎯 Multi-Item Parsing aktiviert\n🚀 Alle AI-Features verfügbar\n\n💡 Du kannst jetzt sagen:\n"Füge 2kg Bananen, Würste, 1L Milch hinzu"';
  }

  /**
   * 🔑 Get API key error message
   */
  getApiKeyErrorMessage(): string {
    return '❌ Ungültiger API Key!\n\nGroq API Keys:\n• Beginnen mit "gsk_"\n• Sind länger als 20 Zeichen\n\n📋 Format:\nset api key: gsk_YOUR_KEY_HERE\n\n🔗 Key erstellen:\nhttps://console.groq.com/keys';
  }

  /**
   * 🔑 Get API key setup instructions
   */
  public getApiKeyInstructions(hasKey: boolean): string {
    if (hasKey) {
      return '🔑 <strong>API Key Status:</strong> ✅ Konfiguriert<br><br>' +
        'Erweiterte Features sind verfügbar!';
    } else {
      return '🔑 <strong>API Key nicht gesetzt</strong><br><br>' +
        'Für Rezept-Features und erweiterte Funktionen:<br>' +
        '"set api key: gsk_YOUR_GROQ_KEY"<br><br>' +
        '💡 Groq API Key kostenlos auf groq.com';
    }
  }

  // ========================================
  // ERROR MESSAGES
  // ========================================

  /**
   * ❌ Get generic error message
   */
  public getGenericErrorMessage(details?: string): string {
    return `❌ <strong>Fehler aufgetreten</strong><br><br>` +
      `${details ? `Details: ${details}<br><br>` : ''}` +
      `💡 Versuche es mit "Hilfe" für verfügbare Befehle`;
  }

  /**
   * ❌ Get parsing error message
   */
  getParsingErrorMessage(input: string, errors: string[]): string {
    let message = `❌ Konnte "${input}" nicht vollständig verarbeiten.\n\n`;

    if (errors.length > 0) {
      message += '🔍 Probleme:\n';
      errors.forEach(error => {
        message += `• ${error}\n`;
      });
      message += '\n';
    }

    message += '💡 Beispiele:\n';
    message += '• "Füge Bananen hinzu"\n';
    message += '• "Füge 2kg Bananen, Würste, 1L Milch zu Spar hinzu"\n';
    message += '• "Erstelle Liste REWE mit Milch"';

    return message;
  }

  /**
   * ❌ Get no lists found message
   */
  public getNoListsFoundMessage(): string {
    return '📋 <strong>Keine Listen vorhanden</strong><br><br>' +
      '💡 Erstelle deine erste Liste:<br>' +
      '"Erstelle Liste [Name]"';
  }

  // ========================================
  // SUCCESS MESSAGES
  // ========================================

  /**
   * ✅ Get item added message
   */
  getItemAddedMessage(itemName: string, quantity: string | undefined, listName: string): string {
    const quantityText = quantity ? ` (${quantity})` : '';
    return `✅ "${itemName}"${quantityText} wurde zur Liste "${listName}" hinzugefügt.`;
  }

  /**
   * ✅ Get contextual item added message with continuation prompt
   */
  getContextualItemAddedMessage(itemName: string, quantity: string | undefined, listName: string): string {
    const quantityText = quantity ? ` (${quantity})` : '';
    const baseMessage = `✅ "${itemName}"${quantityText} wurde zu "${listName}" hinzugefügt.`;
    const continuationMessage = `\n\n💡 Du kannst weitere Artikel eingeben oder "Fertig" sagen.`;
    return baseMessage + continuationMessage;
  }

  /**
   * ✅ Get list created message
   */
  getListCreatedMessage(listName: string, itemName?: string, quantity?: string, color?: string): string {
    const colorText = color ? ` in ${color}` : '';
    const itemText = itemName ? ` mit "${itemName}"${quantity ? ` (${quantity})` : ''}` : '';
    return `✅ Liste "${listName}"${colorText} wurde${itemText} erstellt.`;
  }

  /**
   * ✅ Get multi-item success message
   */
  getMultiItemSuccessMessage(count: number, items: Array<{itemName: string, quantity?: string}>, listName?: string): string {
    const itemSummary = items
      .map(item => `"${item.itemName}"${item.quantity ? ` (${item.quantity})` : ''}`)
      .join(', ');

    if (listName) {
      return `✅ ${count} Artikel zur Liste "${listName}" hinzugefügt:\n${itemSummary}`;
    } else {
      return `✅ Liste wurde mit ${count} Artikeln erstellt:\n${itemSummary}`;
    }
  }

  // ========================================
  // DISAMBIGUATION MESSAGES
  // ========================================

  /**
   * 🎯 Get disambiguation message for single item
   */
  getDisambiguationMessage(itemName: string): string {
    return `🎯 Ich habe ähnliche Artikel für "${itemName}" gefunden. Welchen möchtest du verwenden?`;
  }

  /**
   * 🎯 Get disambiguation message for multi-item
   */
  getMultiItemDisambiguationMessage(itemName: string, currentIndex: number, totalCount: number): string {
    return `🎯 Artikel ${currentIndex + 1}/${totalCount}: "${itemName}"\n\nIch habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;
  }

  /**
   * 🎯 Get list selection message
   */
  getListSelectionMessage(itemName: string, quantity?: string): string {
    return `Bitte wähle eine Liste.`;
  }

  /**
   * 🎯 Get multi-item list selection message
   */
  getMultiItemListSelectionMessage(count: number): string {
    return `Bitte wähle eine Liste.`;
  }

  // ========================================
  // CONVERSATIONAL PROMPTS
  // ========================================

  /**
   * 🗣️ Get follow-up prompt after list creation
   */
  getListCreatedFollowUpPrompt(listName: string): string {
    const prompts = [
      `Möchtest du jetzt Artikel zu "${listName}" hinzufügen?`,
      `Soll ich dir dabei helfen, "${listName}" mit Artikeln zu füllen?`,
      `Magst du gleich ein paar Artikel zu "${listName}" hinzufügen?`,
      `Welche Artikel brauchst du für "${listName}"?`
    ];

    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  getArticleAddedFollowUpPrompt(articleName: string, listName: string): string {
    const prompts = [
      `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`,
      `Brauchst du noch etwas anderes für "${listName}"?`,
      `Soll ich noch mehr Artikel zu "${listName}" hinzufügen?`,
      `Was brauchst du noch für "${listName}"?`,
      `Noch weitere Artikel für "${listName}"?`,
      `Sonst noch etwas für deine "${listName}"-Liste?`
    ];

    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  getMultipleArticlesAddedFollowUpPrompt(count: number, listName: string): string {
    return `Perfekt! ${count} Artikel hinzugefügt. Brauchst du noch weitere Artikel für "${listName}"?`;
  }

  /**
   * 🗣️ Get conversation ended message
   */
  getConversationEndedMessage(): string {
    return '👍 Verstanden! Du kannst jederzeit neue Befehle eingeben.\n\n💡 Sage "Hilfe" für verfügbare Befehle oder "Zeige Listen" um deine Listen zu sehen.';
  }

  /**
   * 🗣️ Get message when user tries complex command while in simple mode
   */
  getComplexCommandInSimpleModeMessage(): string {
    return '💡 Du kannst auch vollständige Befehle verwenden!\n\nIch verstehe sowohl:\n• "Milch" (einfach)\n• "Füge Milch hinzu" (vollständig)\n\nBeide funktionieren gleich gut.';
  }

  /**
   * 🗣️ Get encouragement message for continued conversation
   */
  getEncouragementMessage(listName: string, itemCount: number): string {
    if (itemCount === 1) {
      return `🎯 Super! "${listName}" hat jetzt 1 Artikel.\n\nWas soll noch dazu?`;
    } else {
      return `🎯 Großartig! "${listName}" hat jetzt ${itemCount} Artikel.\n\nSoll noch etwas dazu?`;
    }
  }

  /**
   * 🗣️ Get suggestion when user seems unsure
   */
  getUnsureUserSuggestion(listName: string): string {
    return `🤔 Nicht sicher was du hinzufügen möchtest?\n\n💡 Häufige Artikel:\n• Milch\n• Brot\n• Bananen\n• Joghurt\n• Käse\n\nOder sage "Fertig" wenn "${listName}" vollständig ist.`;
  }

  /**
   * 🗣️ Get pattern reminder for users
   */
  getPatternReminder(): string {
    return `💡 Erinnerung: Du kannst Artikel ganz einfach hinzufügen:\n\n` +
      `✨ Einfach:\n• "Milch"\n• "Brot"\n• "Äpfel"\n\n` +
      `⚖️ Mit Menge:\n• "2kg Bananen"\n• "500ml Milch"\n• "Käse Menge 200g"\n\n` +
      `🛑 Oder sage "Nein" / "Fertig" wenn du fertig bist.`;
  }

  /**
   * 🗣️ Get simple article pattern examples
   */
  getSimpleArticlePatterns(): string[] {
    return [
      'Milch',
      '2kg Bananen',
      'Joghurt Menge 500g',
      '1L Orangensaft',
      'Brot Menge 1 Stück',
      '200g Käse',
      'Tomaten',
      '500ml Sahne'
    ];
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * 🎨 Get available colors list
   */
  getAvailableColors(): string[] {
    return ['rot', 'grün', 'blau', 'gelb', 'orange', 'lila', 'rosa', 'schwarz', 'grau', 'weiß', 'türkis', 'braun'];
  }

  /**
   * 🏪 Get department name in German
   */
  getDepartmentDisplayName(departmentId: string): string {
    const departmentNames: { [key: string]: string } = {
      'bread': 'Brot & Backwaren',
      'fruit-vegetables': 'Obst & Gemüse',
      'dairy-products': 'Milchprodukte',
      'meat': 'Fleisch & Wurst',
      'fish': 'Fisch & Meeresfrüchte',
      'beverages-alcohol': 'Getränke',
      'frozen-goods': 'Tiefkühlkost',
      'sweet-salty': 'Süß & Salziges',
      'cleaning-agents': 'Reinigungsmittel',
      'body-care': 'Körperpflege',
      'household-goods': 'Haushaltswaren',
      'miscellaneous': 'Sonstiges'
    };

    return departmentNames[departmentId] || 'Unbekannt';
  }

  /**
   * 📊 Format stats for display
   */
  formatStats(stats: any): string {
    return `📊 Statistiken:\n• Artikel: ${stats.itemCount || 0}\n• Listen: ${stats.listCount || 0}\n• Befehle verarbeitet: ${stats.commandCount || 0}`;
  }

  /**
   * 🕒 Format timestamp for messages
   */
  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 🎯 Get confidence display text
   */
  getConfidenceText(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (percentage >= 90) return `${percentage}% - Exakte Übereinstimmung`;
    if (percentage >= 70) return `${percentage}% - Sehr ähnlich`;
    if (percentage >= 50) return `${percentage}% - Ähnlich`;
    return `${percentage}% - Entfernt ähnlich`;
  }

  /**
   * 🌟 Get feature availability message
   */
  getFeatureAvailabilityMessage(hasApiKey: boolean): string {
    if (hasApiKey) {
      return '🌟 Alle Premium-Features verfügbar:\n• Smart Disambiguation ✅\n• Multi-Item Parsing ✅\n• Quantity Extraction ✅\n• Fuzzy Matching ✅';
    } else {
      return '⚙️ Basis-Features verfügbar:\n• Einfache Befehle ✅\n• Listen erstellen ✅\n• Artikel hinzufügen ✅\n\n💡 Für Premium-Features: API Key einrichten';
    }
  }

  // ========================================
  // ERROR HANDLING METHODS
  // ========================================

  /**
   * Handle errors with automatic retry and fallback
   */
  handleWithRetry<T>(
    operation: () => Observable<T>,
    context: ErrorContext,
    config?: Partial<ErrorHandlingConfig>
  ): Observable<T> {
    const finalConfig = { ...this.defaultConfig, ...config };

    return operation().pipe(
      timeout(finalConfig.timeoutMs),
      retry(finalConfig.retryAttempts),
      catchError(error => {
        this.logError(error, context, ErrorSeverity.MEDIUM);

        if (finalConfig.fallbackEnabled) {
          return this.provideFallback<T>(context);
        }

        return throwError(() => this.createAIServiceError(error, context));
      })
    );
  }

  /**
   * Handle errors and convert to AI execution result
   */
  handleAsExecutionResult(
    error: any,
    context: ErrorContext,
    fallbackMessage?: string
  ): AIExecutionResult {
    this.logError(error, context, ErrorSeverity.MEDIUM);

    const userMessage = this.getUserFriendlyMessage(error, fallbackMessage);

    return {
      success: false,
      message: userMessage,
      error: this.sanitizeErrorForUser(error)
    };
  }

  /**
   * Wrap async operations with error handling
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallback?: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logError(error, context, ErrorSeverity.MEDIUM);

      if (fallback !== undefined) {
        return fallback;
      }

      throw this.createAIServiceError(error, context);
    }
  }

  /**
   * Create standardized AI service error
   */
  createAIServiceError(originalError: any, context: ErrorContext): AIServiceError {
    const errorCode = this.determineErrorCode(originalError, context);
    const message = this.getErrorMessage(originalError, context);

    return new AIServiceError(message, errorCode, {
      originalError,
      context,
      timestamp: new Date()
    });
  }

  /**
   * Log error with context
   */
  logError(error: any, context: ErrorContext, severity: ErrorSeverity): void {
    const message = `${severity.toUpperCase()} Error in ${context.operation}: ${error.message || 'Unknown error'}`;
    const logData = {
      error: this.serializeError(error),
      context,
      severity,
      timestamp: new Date()
    };

    // Use LoggerService for all error logging
    if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
      this.logger.error('ai', message, logData);
    } else if (severity === ErrorSeverity.MEDIUM) {
      this.logger.warn('ai', message, logData);
    } else {
      this.logger.info('ai', message, logData);
    }
  }

  /**
   * Validate input and throw descriptive error if invalid
   */
  validateInput(input: any, rules: ValidationRule[], context: ErrorContext): void {
    for (const rule of rules) {
      if (!rule.validator(input)) {
        const error = new Error(rule.message);
        this.logError(error, context, ErrorSeverity.LOW);
        throw this.createAIServiceError(error, context);
      }
    }
  }

  /**
   * Create timeout wrapper for operations
   */
  withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    context: ErrorContext
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error(`Operation timed out after ${timeoutMs}ms`);
          reject(this.createAIServiceError(timeoutError, context));
        }, timeoutMs);
      })
    ]);
  }

  // ========================================
  // SPECIFIC ERROR HANDLING PATTERNS
  // ========================================

  /**
   * Handle disambiguation errors
   */
  handleDisambiguationError(error: any, itemName: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'disambiguation',
      input: { itemName },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler beim Verarbeiten von "${itemName}". Bitte versuche es erneut.`
    );
  }

  /**
   * Handle multi-item processing errors
   */
  handleMultiItemError(error: any, items: any[], currentIndex: number): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'multi_item_processing',
      input: { items, currentIndex },
      metadata: { totalItems: items.length },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler beim Verarbeiten der Artikel. ${currentIndex} von ${items.length} wurden verarbeitet.`
    );
  }

  /**
   * Handle list operation errors
   */
  handleListOperationError(error: any, operation: string, listId?: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: `list_${operation}`,
      input: { listId },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler bei der Listen-Operation. Bitte versuche es erneut.`
    );
  }

  /**
   * Handle API errors (network, timeout, etc.)
   */
  handleAPIError(error: any, endpoint: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'api_call',
      input: { endpoint },
      timestamp: new Date()
    };

    if (this.isNetworkError(error)) {
      return this.handleAsExecutionResult(
        error,
        context,
        '🌐 Netzwerkfehler. Bitte überprüfe deine Internetverbindung.'
      );
    }

    if (this.isTimeoutError(error)) {
      return this.handleAsExecutionResult(
        error,
        context,
        '⏱️ Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.'
      );
    }

    return this.handleAsExecutionResult(
      error,
      context,
      '❌ Service-Fehler. Bitte versuche es später erneut.'
    );
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private provideFallback<T>(context: ErrorContext): Observable<T> {
    switch (context.operation) {
      case 'disambiguation':
        return of([] as any);

      case 'suggestions':
        return of({
          departmentId: 'miscellaneous',
          icon: '📦',
          confidence: 0,
          source: 'fallback'
        } as any);

      case 'list_selection':
        return of([] as any);

      default:
        return throwError(() => this.createAIServiceError(new Error('No fallback available'), context));
    }
  }

  private determineErrorCode(error: any, context: ErrorContext): string {
    if (error instanceof AIServiceError) {
      return error.code;
    }

    if (this.isNetworkError(error)) {
      return 'NETWORK_ERROR';
    }

    if (this.isTimeoutError(error)) {
      return 'TIMEOUT_ERROR';
    }

    if (this.isValidationError(error)) {
      return 'VALIDATION_ERROR';
    }

    if (this.isAuthError(error)) {
      return 'AUTH_ERROR';
    }

    return `${context.operation.toUpperCase()}_ERROR`;
  }

  private getErrorMessage(error: any, context: ErrorContext): string {
    if (error instanceof AIServiceError) {
      return error.message;
    }

    if (error.message) {
      return `Error in ${context.operation}: ${error.message}`;
    }

    return `Unknown error in ${context.operation}`;
  }

  private getUserFriendlyMessage(error: any, fallback?: string): string {
    if (fallback) {
      return fallback;
    }

    if (this.isNetworkError(error)) {
      return '🌐 Verbindungsfehler. Bitte überprüfe deine Internetverbindung.';
    }

    if (this.isTimeoutError(error)) {
      return '⏱️ Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.';
    }

    if (this.isValidationError(error)) {
      return '❌ Ungültige Eingabe. Bitte überprüfe deine Daten.';
    }

    if (this.isAuthError(error)) {
      return '🔐 Authentifizierungsfehler. Bitte melde dich erneut an.';
    }

    return '❌ Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.';
  }

  private sanitizeErrorForUser(error: any): string {
    if (error instanceof AIServiceError) {
      return error.code;
    }

    if (error.name) {
      return error.name;
    }

    return 'UnknownError';
  }

  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    if (typeof error === 'object') {
      return JSON.stringify(error);
    }

    return String(error);
  }

  private isNetworkError(error: any): boolean {
    return error.name === 'NetworkError' ||
           error.code === 'NETWORK_ERROR' ||
           error.message?.includes('network') ||
           error.message?.includes('fetch');
  }

  private isTimeoutError(error: any): boolean {
    return error.name === 'TimeoutError' ||
           error.code === 'TIMEOUT_ERROR' ||
           error.message?.includes('timeout') ||
           error.message?.includes('timed out');
  }

  private isValidationError(error: any): boolean {
    return error.name === 'ValidationError' ||
           error.code === 'VALIDATION_ERROR' ||
           error.message?.includes('validation') ||
           error.message?.includes('invalid input');
  }

  private isAuthError(error: any): boolean {
    return error.name === 'AuthenticationError' ||
           error.code === 'AUTH_ERROR' ||
           error.status === 401 ||
           error.status === 403;
  }
}

// ========================================
// VALIDATION RULES
// ========================================

export const ValidationRules = {
  required: (fieldName: string): ValidationRule => ({
    validator: (input: any) => input != null && input !== '',
    message: `${fieldName} ist erforderlich`
  }),

  minLength: (fieldName: string, min: number): ValidationRule => ({
    validator: (input: any) => typeof input === 'string' && input.length >= min,
    message: `${fieldName} muss mindestens ${min} Zeichen lang sein`
  }),

  maxLength: (fieldName: string, max: number): ValidationRule => ({
    validator: (input: any) => typeof input === 'string' && input.length <= max,
    message: `${fieldName} darf maximal ${max} Zeichen lang sein`
  }),

  isArray: (fieldName: string): ValidationRule => ({
    validator: (input: any) => Array.isArray(input),
    message: `${fieldName} muss ein Array sein`
  }),

  notEmpty: (fieldName: string): ValidationRule => ({
    validator: (input: any) => Array.isArray(input) && input.length > 0,
    message: `${fieldName} darf nicht leer sein`
  }),

  isValidId: (fieldName: string): ValidationRule => ({
    validator: (input: any) => typeof input === 'string' && input.length > 0 && !input.includes(' '),
    message: `${fieldName} muss eine gültige ID sein`
  })
};

// ========================================
// ERROR HANDLING DECORATOR
// ========================================

export function HandleErrors(
  fallbackResult?: any,
  logLevel: ErrorSeverity = ErrorSeverity.MEDIUM
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const errorHandler = (this as any).messagingService || (this as any).aiMessaging;

      if (!errorHandler) {
        return originalMethod.apply(this, args);
      }

      const context: ErrorContext = {
        operation: `${this.constructor.name}.${propertyKey}`,
        input: args,
        timestamp: new Date()
      };

      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        errorHandler.logError(error, context, logLevel);

        if (fallbackResult !== undefined) {
          return fallbackResult;
        }

        throw errorHandler.createAIServiceError(error, context);
      }
    };

    return descriptor;
  };
}
