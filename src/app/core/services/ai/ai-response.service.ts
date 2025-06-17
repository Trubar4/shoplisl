// src/app/core/services/ai/ai-response.service.ts
import { Injectable } from '@angular/core';
import {
  DepartmentMapping,
  ColorMapping,
  ApiKeyStatus
} from './ai-models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AIResponseService {

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

  // ========================================
  // DEPARTMENT SUGGESTIONS
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

  /**
   * 💡 Enhanced help guidance with color examples and quantity patterns
   */
  getEnhancedHelpMessage(hasApiKey: boolean): string {
    let helpMessage = '🤖 Shoplisl AI Assistant\n\n';
    
    if (hasApiKey) {
      helpMessage += '✅ Intelligente Features aktiv\n\n';
      helpMessage += '📝 Verfügbare Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu"\n  → Fragt nach der Liste\n\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n  → Direkt zur spezifizierten Liste\n\n';
      helpMessage += '⚖️ MENGEN-SYNTAX:\n';
      helpMessage += '• "Füge 2kg Bananen hinzu"\n';
      helpMessage += '• "Füge Schokolade Menge 2 Stück hinzu"\n';
      helpMessage += '• "Füge 500ml Milch zu Spar hinzu"\n';
      helpMessage += '• "Füge 3x Äpfel hinzu"\n\n';
      helpMessage += '🎯 MEHRERE ARTIKEL GLEICHZEITIG:\n';
      helpMessage += '• "Füge Bananen, Würste, Milch hinzu"\n';
      helpMessage += '• "Füge 2kg Bananen, Würste, 1L Milch zu Spar hinzu"\n';
      helpMessage += '• "Füge Bananen Menge 2kg, Würste, Milch Menge 1 Liter hinzu"\n\n';
      helpMessage += '• "Erstelle Liste [Name]"\n  → Neue Einkaufsliste\n\n';
      helpMessage += '• "Erstelle Liste [Name] mit [Artikel]"\n  → Liste mit erstem Artikel\n\n';
      helpMessage += '🎨 MIT FARBEN:\n';
      helpMessage += '• "Erstelle Liste Spar in rot"\n';
      helpMessage += '• "Erstelle Liste REWE in blau mit Milch"\n';
      helpMessage += '• Verfügbare Farben: rot, grün, blau, gelb, orange, lila, rosa, schwarz, grau, weiß, türkis, braun\n\n';
    } else {
      helpMessage += '⚙️ Basis-Funktionen verfügbar\n\n';
      helpMessage += '💡 Für intelligente Features:\n';
      helpMessage += '"set api key: gsk_YOUR_KEY_HERE"\n\n';
      helpMessage += '📝 Basis-Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu" - Fragt nach Liste\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      helpMessage += '⚖️ "Füge [Artikel] Menge [Anzahl] [Einheit] hinzu"\n';
      helpMessage += '🎯 "Füge Bananen, Würste, Milch hinzu" - Mehrere Artikel\n';
      helpMessage += '• "Erstelle Liste [Name]"\n';
      helpMessage += '🎨 "Erstelle Liste [Name] in [Farbe]"\n';
      helpMessage += '• "Zeige Listen" - Alle Listen anzeigen\n';
      helpMessage += '• "Test" - System-Status prüfen\n\n';
    }
    
    return helpMessage;
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
  getApiKeyInstructions(hasKey: boolean): string {
    return `🔑 API Key Setup\n\n${hasKey ? '✅ Bereits konfiguriert' : '❌ Nicht gefunden'}\n\n📝 So konfigurierst du deinen API Key:\n\n1️⃣ Schreibe: "set api key: gsk_YOUR_KEY_HERE"\n\n2️⃣ Groq API Key kostenlos erstellen:\n🔗 https://console.groq.com/keys\n\n${hasKey ? '🎯 Alle Features aktiviert!' : '⚠️ Ohne API Key sind nur Basis-Funktionen verfügbar'}`;
  }

  // ========================================
  // ERROR MESSAGES
  // ========================================

  /**
   * ❌ Get generic error message
   */
  getGenericErrorMessage(error?: string): string {
    return `❌ Ein Fehler ist aufgetreten${error ? `: ${error}` : '.'}\n\n💡 Versuche es mit:\n• "Hilfe" für verfügbare Befehle\n• "Test" für System-Status`;
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
  getNoListsFoundMessage(): string {
    return '❌ Keine Listen gefunden!\n\n💡 Erstelle zuerst eine Liste:\n• "Erstelle Liste [Name]"\n• "Erstelle Liste [Name] in [Farbe]"';
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
    const quantityText = quantity ? ` (${quantity})` : '';
    return `🎯 Zu welcher Liste soll "${itemName}"${quantityText} hinzugefügt werden?`;
  }

  /**
   * 🎯 Get multi-item list selection message
   */
  getMultiItemListSelectionMessage(count: number): string {
    return `🎯 Zu welcher Liste sollen die ${count} Artikel hinzugefügt werden?`;
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
}