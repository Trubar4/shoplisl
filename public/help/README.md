# Help Screenshots Directory

This directory contains all screenshot images used in the help/tips feature.

## How to Add Screenshots

1. **Take screenshots** of your app's features
2. **Name them** according to the naming convention below
3. **Place them** in this directory (`/public/help/`)
4. **Update** the help content file if needed: `/src/app/features/help/help-content.ts`

## Naming Convention

Use descriptive, lowercase names with hyphens:

- `liste-erstellen-1.jpg` (first step of creating a list)
- `liste-erstellen-2.jpg` (second step of creating a list)
- `liste-erstellen-3.jpg` (third step of creating a list)
- `artikel-anlegen-1.jpg`
- `artikel-hinzufuegen-1.jpg`
- etc.

## Supported Formats

- `.jpg` / `.jpeg` (recommended for photos/screenshots)
- `.png` (recommended for UI with transparency)
- `.webp` (modern format, best compression)

## Image Guidelines

- **Resolution:** Use actual device screenshots (e.g., iPhone screenshots at native resolution)
- **File size:** Try to keep under 500KB per image (compress if needed)
- **Aspect ratio:** Mobile screenshots typically work best
- **Content:** Make sure sensitive data (names, emails, etc.) is blurred or replaced

## Currently Needed Images

Based on `/src/app/features/help/help-content.ts`, you need:

### Liste erstellen
- `liste-erstellen-1.png`
- `liste-erstellen-2.jpg`
- `liste-erstellen-3.jpg`

### Artikel anlegen
- `artikel-anlegen-1.jpg`
- `artikel-anlegen-2.jpg`
- `artikel-anlegen-3.jpg`

### Artikel zu Liste hinzufügen
- `artikel-hinzufuegen-1.jpg`
- `artikel-hinzufuegen-2.jpg`
- `artikel-hinzufuegen-3.jpg`

### Artikel Menge anpassen
- `menge-anpassen-1.jpg`
- `menge-anpassen-2.jpg`

### Artikel verschieben
- `artikel-verschieben-1.jpg`
- `artikel-verschieben-2.jpg`
- `artikel-verschieben-3.jpg`

### Liste teilen
- `liste-teilen-1.jpg`
- `liste-teilen-2.jpg`
- `liste-teilen-3.jpg`

### Einkaufsmodus
- `einkaufsmodus-1.jpg`
- `einkaufsmodus-2.jpg`
- `einkaufsmodus-3.jpg`

## Testing

Once you've added images, you can test them by:
1. Opening the app in development mode
2. Clicking "Hilfe/Tipps" in the user menu
3. Selecting a topic to view the screenshots

If images don't load, check:
- File name matches exactly (case-sensitive!)
- File is in `/public/help/` directory
- Path in help-content.ts is correct (starts with `/help/`)
