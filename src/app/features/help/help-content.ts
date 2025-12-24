/**
 * Help Content Configuration
 *
 * IMAGE PATH INSTRUCTIONS:
 * - Place your screenshot images in: /public/help/
 * - Reference them as: /help/your-image-name.jpg
 * - Supported formats: .jpg, .jpeg, .png, .webp
 *
 * NAMING CONVENTION:
 * - Use descriptive names: liste-erstellen-1.jpg, liste-erstellen-2.jpg, etc.
 * - Keep filenames lowercase with hyphens
 *
 * Example:
 * File location: /public/help/liste-erstellen-1.jpg
 * Path in config: '/help/liste-erstellen-1.jpg'
 *
 * TEXT FORMATTING:
 * You can use HTML formatting in the explanation text:
 *
 * 1. Paragraphs / Line breaks:
 *    explanation: '<p>First paragraph</p><p>Second paragraph</p>'
 *
 * 2. Bullet points (unordered list):
 *    explanation: '<ul><li>First item</li><li>Second item</li></ul>'
 *
 * 3. Numbered lists:
 *    explanation: '<ol><li>Step one</li><li>Step two</li></ol>'
 *
 * 4. Bold text (appears in blue):
 *    explanation: 'This is <strong>important</strong> text'
 *
 * 5. Italic text:
 *    explanation: 'This is <em>emphasized</em> text'
 *
 * 6. Combined formatting:
 *    explanation: '<p>Um eine Liste zu erstellen:</p><ul><li>Tippe auf das <strong>Plus-Symbol</strong></li><li>Gib einen Namen ein</li></ul>'
 */

export interface HelpStep {
  image: string;      // Path to screenshot, e.g., '/help/liste-erstellen-1.jpg'
  explanation: string; // German explanation text - supports HTML formatting
}

export interface HelpTopic {
  id: string;          // Unique identifier (used in routing)
  title: string;       // Display title (shown in overview and detail)
  icon: string;        // Material icon name (e.g., 'list', 'grocery', 'smart_toy')
  steps: HelpStep[];   // Array of steps with images and explanations
}

/**
 * Main help topics configuration
 *
 * TODO: Replace placeholder images with your actual screenshots
 * TODO: Update German text explanations
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'liste-erstellen',
    title: 'Liste erstellen',
    icon: 'list',
    steps: [
      {
        image: '/help/liste-erstellen-1.png',
        explanation: '<p>Um eine Liste zu erstellen, tippe auf das Plus-Symbol unten rechts auf dem Listen-Tab.</p>'
      }
    ]
  },
  {
    id: 'artikel-anlegen',
    title: 'Artikel anlegen',
    icon: 'grocery',
    steps: [
      {
        image: '/help/artikel-anlegen-1.png',
        explanation: 'Wechsle zum Artikel-Tab (Einkaufswagen-Symbol) und tippe auf "Neuer Artikel" oder das Plus-Symbol.'
      },
      {
        image: '/help/artikel-anlegen-2.png',
        explanation: '<ul><li>Gib den Namen des Artikels ein. Du kannst auch eine Menge, Abteilung, Notizen und ein Icon hinzufügen.</li><li>Die Standard-Menge wird dir in jeder Liste vorgeschlagen, wenn du den Artikel hinzufügst. Du kannst sie aber mit dem Chip je Liste verändern.</li><li>Unter Notizen kannst du Hinweise eingeben, damit man das richtige Produkt findet.</li><li>Wähle eine Abteilung, damit der Artikel entsprechend deinem Gehweg im Geschäft richtig einsortiert wird.</li><li>Drücke "Erstellen", wenn du fertig bist.</li><li>Der Artikel steht nun zur Verfügung und kann zu Listen hinzugefügt werden.</li></ul>'
      },
      {
        image: '/help/artikel-anlegen-3.png',
        explanation: 'Über den AI Assistant und die Suchfunktion in Listen gibt es zusätzliche Möglichkeiten, Artikel zu erstllen und zu Listen hinzuzufügen. Dabei schlägt eine AI Icon und Abteilung vor.'
      }
    ]
  },
  {
    id: 'artikel-zur-liste-hinzufuegen',
    title: 'Artikel zu Liste hinzufügen',
    icon: 'add_shopping_cart',
    steps: [
      {
        image: '/help/artikel-hinzufuegen-1.png',
        explanation: 'Öffne eine Liste und tippe auf "Bearbeiten", um den Modus zu wechseln.'
      },
      {
        image: '/help/artikel-hinzufuegen-2.png',
        explanation: 'Nutze den Switch um Artikel auf diese Liste hinzuzufügen oder zu entfernen.<p>Im Shoppen-Mode können alle der Liste hinzugefügten Artikel auf offen oder erledigt gesetzt werden.</p>'
      },
      {
        image: '/help/artikel-hinzufuegen-3.png',
        explanation: 'Alternativ kannst du die Suche im Shoppen-Mode nutzen, um vorhandene Artikel zu durchsuchen oder neue automatisch erstellen zu lassen. Wähle einfach einen aus der Vorschlagsliste.'
      }
    ]
  },
  {
    id: 'pro-tipp-listen-anpassen',
    title: 'Pro-Tipp: Listen anpassen',
    icon: 'instant_mix',
    steps: [
      {
        image: '/help/listen-anpassen-1.png',
        explanation: 'Beim ersten erstellen der Liste können regelmäßig gekaufte Artikel über den Bearbeiten-Modus auf die Liste gesetzt werden, falls die Artikel vorher angelegt wurden.'
      },
      {
        image: '/help/listen-anpassen-2.png',
        explanation: 'Um bereits gekaufte (erledigte) Artikel wieder zu aktivieren, setze im Shopping-Modus den Filter auf „Alle“ oder "Erledigt".'
      },
      {
        image: '/help/listen-anpassen-3.png',
        explanation: 'Klicke auf durchgestrichene Artikel, damit sie wieder auf "offen" gesetzt werden.'
      },
      {
        image: '/help/listen-anpassen-4.png',
        explanation: '<p>Fehlende und neue Artikel kannst du im Suchfeld eingeben (1) und dann mit dem Vorschlagsmenü auswählen, damit sie direkt auf die Liste gesetzt werden.</p><p>(2a) Die oberen drei Vorschläge sind für existierende Artikel aus deiner Artikelübersicht</p><p>(2b) Der letzte Vorschlag ist mit "neu erstellen" beschriftet und ein neuer Artikel wird angelegt.</p>'
      }
    ]
  },
  {
    id: 'iPhone-pwa',
    title: 'iPhone: ShopLisl als Web App vom Home-Bildschirm nutzen',
    icon: 'ios',
    steps: [
      {
        image: '/help/iphone-pwa-1.png',
        explanation: 'Um Shoplisl auf den Home-Bildschirm zu setzen, öffne es in Safari und klicke auf die 3 Punkte rechts unten.'
      },
      {
        image: '/help/iphone-pwa-2.png',
        explanation: 'Wähle nun "Teilen" aus.'
      },
      {
        image: '/help/iphone-pwa-3.png',
        explanation: 'Scrolle etwas nach unten und klicke auf "Zum Home-Bildschirm".'
      },
      {
        image: '/help/iphone-pwa-4.png',
        explanation: 'Du kannst die Bezeichnung ändern oder einfach auf "Hinzufügen" klicken.'
      }
    ]
  },
  {
    id: 'Android-pwa',
    title: 'Android: ShopLisl als Web App vom Home-Bildschirm nutzen',
    icon: 'android',
    steps: [
      {
        image: '/help/android-pwa-1.png',
        explanation: 'Um Shoplisl auf den Home-Bildschirm zu setzen, öffne es in Chrome und klicke auf die 3 Punkte rechts oben.'
      },
      {
        image: '/help/android-pwa-2.png',
        explanation: 'Wähle "Zum Startbildschirm hinzufügen" oder "Installieren" aus'
      },
      {
        image: '/help/android-pwa-3.png',
        explanation: 'Im Popup kannst du den Namen anpassen. Tippe auf "Hinzufügen" oder "Installieren" und das Icon ist nun direkt auf dem Home-Bildschirm.'
      }
    ]
  },
  {
    id: 'artikel-menge-anpassen',
    title: 'Artikel Menge anpassen',
    icon: '1x_mobiledata_badge',
    steps: [
      {
        image: '/help/menge-anpassen-1.png',
        explanation: 'Im Shoppen-Mode siehst du die Menge jedes Artikels als Chip. Tippe darauf um sie anzupassen.'
      },
      {
        image: '/help/menge-anpassen-2.png',
        explanation: 'Du kannst hier beliebigen Text und eine passende Einheit eingeben.'
      }
    ]
  },
  {
    id: 'Liste-Abteilungen-anordnen',
    title: 'Liste Abteilungsreihenfolge an Weg anpassen',
    icon: 'format_list_numbered_rtl',
    steps: [
      {
        image: '/help/abteilungsreihenfolge-anpassen-1.png',
        explanation: 'Gehe in eine Liste und wechsle in den Bearbeitungs-Modus. Klicke dann links unten auf "Abteilungen".'
      },
      {
        image: '/help/abteilungsreihenfolge-anpassen-2.png',
        explanation: 'Nun kannst du die Abteilungen an den Gehweg im Geschäfts anpassen. Halte dazu die 4 Punkte rechts (1) und verschieb die Abteilung nach oben oder unten.<p>Nutzen (2) "Speichern", um die neue Reihenfolge für diese Liste zu sichern.</p>'
      }
    ]
  },
  {
    id: 'artikel-verschieben',
    title: 'Artikel auf andere Liste verschieben',
    icon: 'folder_match',
    steps: [
      {
        image: '/help/artikel-verschieben-1.png',
        explanation: 'Öffne eine Liste und klicke rechts oben auf "Auswählen".'
      },
      {
        image: '/help/artikel-verschieben-2.png',
        explanation: '<ol><li>Wähle die zu verschiebenden Artikel aus (zB Artikel, die in diesem Geschäfts ausverkauft waren und nun auf eine andere Liste sollen).</li><li>Klicke unten auf "Verschieben"</li></ol>'
      },
      {
        image: '/help/artikel-verschieben-3.png',
        explanation: 'Wähle die Ziel-Liste aus. Die Artikel werden nun verschoben und aus der aktuellen Liste entfernt.'
      }
    ]
  },
  {
    id: 'liste-teilen',
    title: 'Liste mit anderen teilen und Teilen beenden',
    icon: 'ios_share',
    steps: [
      {
        image: '/help/liste-teilen-1.png',
        explanation: 'Um eine Liste mit anderen zu Teilen, öffne die Liste und klicke auf das Teilen-Symbol.'
      },
      {
        image: '/help/liste-teilen-2.png',
        explanation: 'Gib die E-Mail-Adresse der Person ein, mit der du die Liste teilen möchtest und klicke auf das Plus-Symbol.'
      },
      {
        image: '/help/liste-teilen-3.png',
        explanation: 'Du kannst den Einladungslink nun kopieren und per Messenger, E-Mail oder anderen Wegen teilen.'
      },
      {
        image: '/help/teilen-beenden-1.png',
        explanation: 'Um das Teilen einer Liste zu beenden, öffne die Liste und klicke auf das Teilen-Symbol. Wähle dann das "Minus-Symbol" neben der entsprechnden Person.'
      },
      {
        image: '/help/teilen-beenden-2.png',
        explanation: 'Klicke auf "Entfernen", um das Teilen der Liste mit dieser Person zu beenden.'
      }
    ]
  },
  {
    id: 'liste-annehmen',
    title: 'Geteilte Liste annehmen und entfernen',
    icon: 'check',
    steps: [
      {
        image: '/help/liste-annehmen-1.png',
        explanation: '<p>Füge den empfangenen Einladungslink in deinem Browser ein, um die geteilte Liste anzunehmen. Beispiel: https://shoplisl.web.app/invite/4b517645-69c9-4e21-b650-319633ce06ad</p><p>Nach kurzer Zeit siehst du folgende Info und wirst dann direkt in die Liste umgeleitet. Die Liste steht nun überall für dich zur Verfügung (Webapp, Browser).</p>'
      },
      {
        image: '/help/liste-trennen-1.png',
        explanation: 'Um das Teilen einer Liste zu beenden, öffne die Liste und klicke auf das Teilen-Symbol.'
      },
      {
        image: '/help/liste-trennen-2.png',
        explanation: 'Wähle nun "Liste verlassen".'
      },
      {
        image: '/help/liste-trennen-3.png',
        explanation: 'Wäle ein letzes Mal "Verlassen" und die Liste ist für dich nicht mehr sichtbar.'
      }
    ]
  },
  {
    id: 'AI-Assistant-nutzen',
    title: 'AI Assistant nutzen',
    icon: 'smart_toy',
    steps: [
      {
        image: '/help/ai-assistant-1.png',
        explanation: '<ul><li>Wechsle auf das Tab "Assistent".</li><li>Solange du die Groq API nicht eingerichtet hast, erscheint die blaue Nachricht mit der Anleitung. Erst danach hast du volle AI-Funktionalität.</li><li>Mit dem Mülltonnen-Symbol kannst du den Chat-Verlauf leeren.</li><li>Mit dem Export-Symbol kannst du den Chat exportieren.</li></ul>'
      },
      {
        image: '/help/ai-assistant-2.png',
        explanation: 'Klicke auf das Hilfe-Symbol, um Beispiel-Prompts zu sehen. Das gleiche geht auch mit dem Essen-Symbol für Rezept-Handling'
      },
      {
        image: '/help/ai-assistant-3.png',
        explanation: 'Gib deinen Befehl in das Textfeld ein (1) und klicke auf das Senden-Symbol (2). Beispiele: <ul><li>""Füge 500g Mehl 2 Eier 250ml Milch hinzu" hinzu" - zuerst kommt das Vorschlagsmenü zur Artikelauswahl/Erstellung und dann kannst du die Zielliste wählen.</li><li>+[Artikel], [Artikel2] - gleiches Auswahl-Menü wie Punkt 1</li><li>"Erstelle Liste [Name] in [Farbe]" - Eine Liste wird direkt erstellt. Die Farbe kann auch weggelassen werden.</li><li>"Rezept: 500g Mehl, Eier 2 Stück, 250ml Milch" - Du kannst auch unformatierte Rezepte einfügen und die KI identifiziert alle Artikel. Im ersten Schritt wirst du nach der Zielliste gefragt. Du kannst einzelne Artikel überspringen, wenn du sie schon zuhause hast.</li></ul>'
      }
    ]
  },
  {
    id: 'Spracheingabe-mit-Siri',
    title: 'Spracheingabe mit Siri',
    icon: 'mic',
    steps: [
      {
        image: '/help/siri-1.jpg',
        explanation: 'Öffne diesen Link auf deinem iPhone und wähle hinzfügen. <p>https://www.icloud.com/shortcuts/8445a1ab74d248288e9fbb90beac0f85</p><p>Danach kannst du Siri verwenden, um Artikel zu deiner Einkaufsliste hinzuzufügen. Sage z.B.: "Hey Siri, füge Milch und Eier zu meiner Einkaufsliste hinzu."</p>'
      },
      {
        image: '/help/siri-2.jpg',
        explanation: '<ul><li>Drücke den Button um Siri zu aktivieren und sage laut und deutlich "Zur Einkaufsliste hinzufügen"</li><li>Siri fragt nun "Was möchtest du hinzufügen?"</li><li>Antworte bspw. "Gurken Komma Bananen"</li><li>Siri erkennt "Gurken, Bananen"</li><li>Nun öffnet Safari Shoplisl im Assistent-Tab und man kann die Liste auswählen.</li></ul>'
      },
      {
        image: '/help/siri-3.jpg',
        explanation: 'Zum Schluss werden die Artikel vorgeschlagen und man kann sie auswählen oder überspringen.<p>Tipp: Man kann auch nur die Spracheingabe machen bis Safari geöffnet wird. Später, wenn man Zeit hat, können die Liste und Artikel gewählt werden.</p><p>Am Ende kann man das Safari-Tab schließen. Die Artikel sind nun hinzugefügt.</p>'
      }
    ]
  }
];

/**
 * Helper function to get a specific topic by ID
 */
export function getHelpTopic(id: string): HelpTopic | undefined {
  return HELP_TOPICS.find(topic => topic.id === id);
}

/**
 * Helper function to get all topic titles for the overview
 */
export function getHelpTopicTitles(): Array<{ id: string, title: string, icon: string }> {
  return HELP_TOPICS.map(topic => ({
    id: topic.id,
    title: topic.title,
    icon: topic.icon
  }));
}
