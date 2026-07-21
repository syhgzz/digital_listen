# Digital Listen — Agent Instructions

## Project Overview

**数字听力训练 (Digital Listening Training)** — A Vue 3 + TypeScript + Vite SPA for practicing English listening. See [README.md](./README.md) for full description and TTS engine configuration.

## Quick Start

```bash
npm install     # install dependencies
npm run dev     # start dev server
npm run build   # type-check + production build (vue-tsc -b && vite build)
npm run preview # preview production build
```

> No test framework is installed. There are no test commands.

## Architecture

- **Single-page app** — no router, no state management library (Pinia/Vuex). Module switching uses `v-if`/`v-show` in `App.vue`.
- **All UI in one file** — `src/App.vue` (~500 lines) contains tabs, settings, controls, and question display.
- **Custom composables** — TTS logic is in `src/composables/useTts.ts` (multi-engine orchestrator). `src/composables/useSpeechSynthesis.ts` is a lower-level precursor — currently **not used** by `App.vue`.
- **Pure utility functions** — `src/utils/practiceGenerators.ts` generates practice items (phone numbers, dates, numbers).
- **CSS custom properties** — no CSS framework (Tailwind, etc.). Styling in `src/style.css` (~280 lines).

## Coding Conventions

| Convention | Rule |
|---|---|
| **Vue API** | `<script setup lang="ts">` (Composition API) |
| **File naming** | `kebab-case` for source files |
| **Components** | PascalCase for `.vue` component names |
| **Types** | PascalCase, use `import type { ... }` |
| **Constants** | `SCREAMING_SNAKE_CASE` |
| **UI language** | Labels in **Simplified Chinese** |
| **TTS language** | Always **English** (`en-US`) |

## Key Implementation Details

- **Settings persistence**: `localStorage` key `digital-listen:settings:v1`. Schema changes must handle backward compatibility with `readPersistedSettings()` type guards.
- **Keyboard shortcuts**: Global `window.keydown` listeners for `Space` (repeat), `→` (next), `R` (restart). `isInteractiveTarget()` guards against firing inside form inputs.
- **TTS engine fallback**: OS Web Speech API → local HTTP engine → online HTTP engine. Configured via `VITE_*` environment variables (see README.md).
- **Async safety**: `useTts` uses a `speakGeneration` counter to cancel stale async operations — always respect this when adding new async TTS logic.

## Known Issues / Cleanup Opportunities

- `src/components/HelloWorld.vue` — **orphaned** (default Vite scaffold, never imported).
- `src/composables/useSpeechSynthesis.ts` — **likely dead code** (superseded by `useTts.ts`). Verify before deleting.
- No mobile responsiveness testing done.

## TypeScript Configuration

- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- `erasableSyntaxOnly` — non-const `enum` and `namespace` are disallowed
- TypeScript ~6.0.2 — very modern; some older patterns may be incompatible
