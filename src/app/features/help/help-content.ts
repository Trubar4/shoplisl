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
    steps: [
      {
        image: '/help/liste-erstellen-1.jpg',
        explanation: '<p>Um eine Liste zu erstellen:</p><ul><li>Öffne den <strong>Listen-Tab</strong></li><li>Tippe auf das <strong>Plus-Symbol</strong> unten rechts</li></ul>'
      },
      {
        image: '/help/liste-erstellen-2.jpg',
        explanation: '<p>Gib deiner neuen Liste einen Namen und wähle optional:</p><ul><li>Eine Farbe</li><li>Ein Icon</li></ul>'
      },
      {
        image: '/help/liste-erstellen-3.jpg',
        explanation: '<p>Bestätige mit <strong>"Erstellen"</strong>.</p><p>Deine neue Liste erscheint nun in der Übersicht und ist sofort einsatzbereit.</p>'
      }
    ]
  },
  {
    id: 'artikel-anlegen',
    title: 'Artikel anlegen',
    steps: [
      {
        image: '/help/artikel-anlegen-1.jpg',
        explanation: 'Wechsle zum Artikel-Tab (Einkaufswagen-Symbol) und tippe auf das Plus-Symbol.'
      },
      {
        image: '/help/artikel-anlegen-2.jpg',
        explanation: 'Gib den Namen des Artikels ein. Du kannst auch eine Kategorie, Notizen und ein Bild hinzufügen.'
      },
      {
        image: '/help/artikel-anlegen-3.jpg',
        explanation: 'Speichere den Artikel. Er steht nun zur Verfügung und kann zu Listen hinzugefügt werden.'
      }
    ]
  },
  {
    id: 'artikel-zur-liste-hinzufuegen',
    title: 'Artikel zu Liste hinzufügen',
    steps: [
      {
        image: '/help/artikel-hinzufuegen-1.jpg',
        explanation: 'Öffne eine Liste und tippe auf "Artikel hinzufügen" oder das Plus-Symbol.'
      },
      {
        image: '/help/artikel-hinzufuegen-2.jpg',
        explanation: 'Wähle einen oder mehrere Artikel aus der Liste aus. Du kannst auch nach Artikeln suchen.'
      },
      {
        image: '/help/artikel-hinzufuegen-3.jpg',
        explanation: 'Die ausgewählten Artikel werden zur Liste hinzugefügt und erscheinen in der Listenansicht.'
      }
    ]
  },
  {
    id: 'artikel-menge-anpassen',
    title: 'Artikel Menge anpassen',
    steps: [
      {
        image: '/help/menge-anpassen-1.jpg',
        explanation: 'In der Listenansicht siehst du die Menge jedes Artikels. Tippe auf die Plus- oder Minus-Buttons.'
      },
      {
        image: '/help/menge-anpassen-2.jpg',
        explanation: 'Die Menge wird sofort angepasst. Du kannst auch direkt auf die Zahl tippen, um einen Wert einzugeben.'
      }
    ]
  },
  {
    id: 'artikel-verschieben',
    title: 'Artikel auf andere Liste verschieben',
    steps: [
      {
        image: '/help/artikel-verschieben-1.jpg',
        explanation: 'Öffne eine Liste und tippe lange auf den Artikel, den du verschieben möchtest, oder nutze das Menü-Symbol.'
      },
      {
        image: '/help/artikel-verschieben-2.jpg',
        explanation: 'Wähle "Verschieben" aus dem Menü.'
      },
      {
        image: '/help/artikel-verschieben-3.jpg',
        explanation: 'Wähle die Ziel-Liste aus. Der Artikel wird verschoben und aus der aktuellen Liste entfernt.'
      }
    ]
  },
  {
    id: 'liste-teilen',
    title: 'Liste mit anderen teilen',
    steps: [
      {
        image: '/help/liste-teilen-1.jpg',
        explanation: 'Öffne eine Liste und tippe auf das Teilen-Symbol in der oberen rechten Ecke.'
      },
      {
        image: '/help/liste-teilen-2.jpg',
        explanation: 'Gib die E-Mail-Adresse der Person ein, mit der du die Liste teilen möchtest.'
      },
      {
        image: '/help/liste-teilen-3.jpg',
        explanation: 'Die Person erhält eine Einladung und kann nach Annahme die Liste sehen und bearbeiten.'
      }
    ]
  },
  {
    id: 'einkaufsmodus',
    title: 'Einkaufsmodus nutzen',
    steps: [
      {
        image: '/help/einkaufsmodus-1.jpg',
        explanation: 'Öffne eine Liste und wechsle mit dem Toggle oben von "Bearbeiten" zu "Einkaufen".'
      },
      {
        image: '/help/einkaufsmodus-2.jpg',
        explanation: 'Im Einkaufsmodus kannst du Artikel abhaken. Erledigte Artikel werden automatisch nach unten verschoben.'
      },
      {
        image: '/help/einkaufsmodus-3.jpg',
        explanation: 'Tippe erneut auf einen Artikel, um ihn wieder als unerledigt zu markieren.'
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
export function getHelpTopicTitles(): Array<{id: string, title: string}> {
  return HELP_TOPICS.map(topic => ({
    id: topic.id,
    title: topic.title
  }));
}
