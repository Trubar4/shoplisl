# C4 Model Documentation for Shoplisl

## Overview

This directory contains C4 architecture diagrams for the Shoplisl application using **Mermaid** syntax, which is free and open-source.

## Available Diagrams

### 1. System Context Diagram (Level 1)
**File:** `c4-system-context.md`

Shows the big picture: Shoplisl system, users, and external systems it interacts with.

**What you'll see:**
- Shopping List Users, Collaborators, Administrators
- Shoplisl Web App (main system)
- Firebase Platform (authentication, database, hosting)
- Groq AI API (AI-powered features)
- Web Browser (PWA runtime)

**Use this when:**
- Explaining the system to stakeholders
- Understanding external dependencies
- Planning integrations
- Security boundary analysis

### 2. Container Diagram (Level 2)
**File:** `c4-container-diagram.md`

Shows the internal structure of Shoplisl: Angular app, services, data stores.

**What you'll see:**
- Angular Web Application
- Service Worker (PWA)
- NgRx State Store
- Core Services Layer (Firebase, AI, Offline, Analytics)
- Firebase Platform containers (Firestore, Auth, Hosting)
- Data flow and interactions

**Use this when:**
- Understanding the technical architecture
- Planning refactoring or new features
- Onboarding developers
- System design reviews

## How to View the Diagrams

### Option 1: Online (Easiest)
1. Go to **Mermaid Live Editor**: https://mermaid.live/
2. Copy the mermaid code block from the `.md` file
3. Paste into the editor
4. View/export as PNG or SVG

### Option 2: GitHub/GitLab
- Just open the markdown files in GitHub or GitLab
- Diagrams render automatically

### Option 3: VS Code
1. Install extension: "Markdown Preview Mermaid Support"
2. Open the `.md` file
3. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)
4. Diagrams render in preview pane

### Option 4: Command Line
Install mermaid-cli:
```bash
npm install -g @mermaid-js/mermaid-cli
```

Generate PNG:
```bash
mmdc -i docs/c4-system-context.md -o docs/c4-system-context.png
mmdc -i docs/c4-container-diagram.md -o docs/c4-container-diagram.png
```

Generate SVG:
```bash
mmdc -i docs/c4-system-context.md -o docs/c4-system-context.svg
mmdc -i docs/c4-container-diagram.md -o docs/c4-container-diagram.svg
```

### Option 5: Documentation Sites
- **Docusaurus**: Built-in Mermaid support
- **MkDocs**: Install `mkdocs-mermaid2-plugin`
- **Confluence**: Use Mermaid macro
- **Notion**: Code block with type "mermaid"

## C4 Model Levels Explained

The C4 model has 4 levels of detail:

1. **System Context** (Level 1) - ✅ Created
   - Shows the system and its users/external systems
   - Audience: Everyone (technical and non-technical)
   - Abstraction: Highest

2. **Container** (Level 2) - ✅ Created
   - Shows the major technical building blocks
   - Audience: Technical people inside/outside dev team
   - Abstraction: High

3. **Component** (Level 3) - ⬜ Not created yet
   - Shows components inside each container
   - Would show: Lists module, Articles module, AI services, etc.
   - Audience: Developers

4. **Code** (Level 4) - ⬜ Not created yet
   - Shows class diagrams, ERDs
   - Would show: TypeScript classes, interfaces, data models
   - Audience: Developers (detailed implementation)

## Creating Additional Diagrams

If you need Component or Code level diagrams:

### Component Diagram Example
Shows the internal structure of the Angular application:
- Features: Lists, Articles, Shops, Admin, Help
- Shared components
- Routing structure

### Code Diagram Example
Shows actual TypeScript classes:
- `FirebaseDataService` class methods
- `Article`, `ShoppingList`, `ListItemState` interfaces
- Service dependencies

Let me know if you need these!

## Why Mermaid?

We chose Mermaid for C4 diagrams because:

✅ **Free and open-source**
✅ **Text-based** (easy to version control with Git)
✅ **Widely supported** (GitHub, GitLab, VS Code, documentation tools)
✅ **Easy to update** (just edit text, no drawing tools needed)
✅ **Renders beautifully** (automatic layout)
✅ **Supports C4 notation** (native C4Context, C4Container syntax)

## Alternatives Considered

| Tool | Pros | Cons | Cost |
|------|------|------|------|
| **Structurizr** | Official C4 tool, DSL | Learning curve, separate tool | Free tier limited |
| **PlantUML** | Text-based, powerful | Syntax more complex | Free |
| **Draw.io** | Visual, easy | Not version-controlled | Free |
| **Lucidchart** | Professional, collaborative | Not text-based | Paid |
| **Mermaid** | ✅ Best balance | Limited styling | ✅ Free |

## Maintenance

Update these diagrams when:
- Adding new external system integrations
- Adding major new features/modules
- Changing authentication/authorization
- Migrating to new services (e.g., switching from Firebase)
- Architectural refactoring

## Questions?

For questions about:
- **C4 Model**: https://c4model.com/
- **Mermaid**: https://mermaid.js.org/
- **Shoplisl Architecture**: See `ARCHITECTURE.md`

## Next Steps

Consider creating:
1. Component diagram for Angular application structure
2. Deployment diagram showing CI/CD pipeline
3. Data model diagram (ERD) for Firestore collections
4. Sequence diagrams for key user flows (login, share list, voice command)

---

**Created:** 2026-01-17
**Author:** Claude Code
**Branch:** claude/c4-model-shoplist-jOUfM
