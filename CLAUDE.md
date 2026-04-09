# CLAUDE.md

This file provides guidance for working with code in this repository.

## Project Overview

**萌宠直播公司 (Lovely Pets)** - A Roguelike card game combining deck-building, auto-chess economy, and grid-based strategy. Players manage a pet streaming company, deploying pets and workers on a 3×6 grid while balancing income vs stress to survive 30 days and accumulate 1000 hearts.

**Tech Stack**: React 18 + TypeScript + Vite + Zustand + Tailwind CSS + **PixiJS v8** (all gameplay UI is Canvas/WebGL; no DOM game board).

## Development Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production (TypeScript check + Vite build)
npm run preview          # Preview production build
npm run type-check       # Run TypeScript type checking without building
npm run lint             # Run ESLint

# Game Configuration
npm run convert:cards    # Convert Excel (excel/cards.xlsx) to JSON configs
```

## Core Architecture

### Game State Management (Zustand)

The entire game state lives in `src/store/gameStore.ts` using Zustand with devtools middleware:

- **Grid System**: 3 rows × 6 columns (18 cells) storing `GridEntity | null`
- **Card System**: `deck`, `hand`, `discardPile` arrays managing card flow
- **Economy**: `cans` (currency), `interest`, `winStreak`, `loseStreak`
- **Phases**: `preparation` → `action` → `income` → `end`

Key actions: `placeEntity()`, `playCard()`, `drawCards()`, `endTurn()`, `triggerMeltdown()`

### Rendering: Pixi Layer (`src/game/`)

React only hosts a **canvas** and bootstraps the engine. All in-game visuals and pointer interaction are Pixi:

- **`bootstrapPixiGame(canvas)`** (`src/game/bootstrap.ts`) — creates `GameEngine`, registers `GameScene`, starts the ticker
- **`GameEngine`** — `Application.init()`, resize, `ticker` drives `SceneManager` + `InputManager`
- **`GameScene`** — grid (`GridCell`), hand (`CardSprite`), HUD text, phase button, Zustand subscription (hand refresh + grid sync)
- **`DragSystem`** — drag pet/worker cards to cells; **action cards** use click-to-play (no drag)
- **`CardSprite`** — card chrome + illustration via `assetLoader` / config `image` (SVG path resolution)

Entry from UI: `src/pages/GameBoard.tsx` → `bootstrapPixiGame`.

### Configuration-Driven Design

Game content is defined in JSON files under `/config`:
- `pets.json` - Pet cards (6 cards)
- `workers.json` - Worker cards (5 cards)
- `actions.json` - Action cards (8 cards)
- `synergies.json` - Synergy effects (8 synergies)

**Excel Workflow**: Designers edit `excel/cards.xlsx` → run `npm run convert:cards` → generates JSON configs. The script (`scripts/excel-to-json.js`) validates data and outputs TypeScript-compatible JSON.

### Asset Paths

**Key Pattern**: Config often references `.png`; repo may ship `.svg` at the same logical path. `CardSprite` and `assetLoader` align paths under `public/assets/` (`cards/`, `illustrations/`, `ui/icons/`).

```typescript
getCardAssetPaths(cardId, 'pets' | 'workers' | 'actions')
getIconAssetPaths('can')
```

### Type System

Core types in `src/types/card.ts`:
- `Card`: `id`, `name`, `type`, `cost`, `rarity`, optional `image`, `effects`, `tags`, `attributes`, etc.
- `CardEffect`, `CardAttributes` as above

`GridEntity` (in gameStore) extends card data with runtime state: `stress`, `position`, `isExhausted`

## Game Mechanics (Key Concepts)

### Economic System
- **Base salary**: 3 cans/turn
- **Interest**: +1 can per 5 cans held (max +2)
- **Win streak**: +1 can/turn after 3 consecutive wins
- **Lose streak**: +2 cans/turn after 2 consecutive losses

### Stress & Meltdown System
- Pets accumulate stress each turn
- When stress ≥ maxStress: 50% chance of **5× income burst** OR **complete meltdown** (destroy cell, -10 HP)
- Meltdown affects adjacent 4 cells (up/down/left/right)

### Synergy System
- Triggered when specific tag combinations are on the grid
- See `config/synergies.json` for definitions

## File Organization

```
src/
├── game/                 # Pixi runtime (all gameplay rendering)
│   ├── bootstrap.ts      # mount engine + GameScene
│   ├── index.ts          # public exports
│   ├── core/             # GameEngine, SceneManager, Scene, InputManager
│   ├── scenes/           # GameScene
│   ├── entities/         # GridCell, CardSprite
│   ├── systems/          # DragSystem
│   └── utils/            # Tween, etc.
├── store/
│   └── gameStore.ts      # Zustand store (single source of truth)
├── types/
│   └── card.ts
├── utils/
│   └── assetLoader.ts
├── pages/
│   └── GameBoard.tsx     # Canvas host + lifecycle
├── hooks/
│   └── useCardLoader.ts  # JSON → deck → initGame
├── App.tsx
└── main.tsx

config/                   # Game data (JSON)
docs/                     # Design documents (Chinese)
public/assets/            # Static assets
```

## Important Patterns

### Adding New Cards
1. Edit `excel/cards.xlsx` (or JSON in `config/`)
2. Run `npm run convert:cards` (if using Excel)
3. Add art under `public/assets/cards/` or `illustrations/` as appropriate
4. Ensure `Card` `id` / optional `image` match files

### Modifying Game State
Use Zustand actions from `useGameStore()` in React hooks, or `useGameStore.getState()` inside Pixi scenes. Never mutate `grid`, `hand`, `deck` directly.

### Changing In-Game UI
Edit Pixi classes under `src/game/` (especially `GameScene`, `CardSprite`, `GridCell`). React `App` shell is layout + title only.

## Design Documents

Chinese documentation in `/docs` (game design, technical choices).

## Development Notes

- **No backend**: Pure frontend
- **Deployment**: Vercel (`vercel.json`)
- **State persistence**: Not implemented yet
- **Testing**: No test suite currently
- **i18n**: Chinese-first; data-driven strings in JSON

## Common Tasks

**Adjust balance**: Edit `/config` JSON, refresh

**Add synergy**: `config/synergies.json` + detection in game loop (partially implemented)

**Change grid size**: `createEmptyGrid()` in `gameStore.ts` + grid layout in `GameScene`
