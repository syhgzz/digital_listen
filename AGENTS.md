# Digital Listen — Agent Instructions

## Project Overview

**数字听力训练 (Digital Listening Training)** — A Vue 3 + TypeScript + Vite SPA for practicing English listening. See [README.md](./README.md) for full description and TTS engine configuration.

## Quick Start

```bash
npm install     # install dependencies
npm run setup:models  # download Piper voice models to public/models/ (once, ~190MB)
npm run dev     # start dev server
npm run build   # type-check + production build (vue-tsc -b && vite build)
npm run preview # preview production build
```

> No test framework is installed. There are no test commands.

## Architecture

- **Single-page app** — no router, no state management library (Pinia/Vuex). Module switching uses `v-if`/`v-show` in `App.vue`.
- **All UI in one file** — `src/App.vue` (~500 lines) contains tabs, settings, controls, and question display, organized into grouped panels (练习设置 / 语音设置 / 播放控制 / 题目卡片).
- **TTS composable** — `src/composables/useTts.ts` wraps the bundled Piper WASM engine (`@mintplex-labs/piper-tts-web`): fully client-side synthesis, identical voices on every browser/OS. Models download from HuggingFace on first use and are cached in OPFS.
- **Pure utility functions** — `src/utils/practiceGenerators.ts` generates practice items (phone numbers, dates, numbers). `src/utils/numberToWords.ts` converts integers to English words (one billion ...) for the number module.
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
- **Keyboard shortcuts**: Global `window.keydown` listeners for `Space` (repeat), `→` (next), `R` (restart). `isInteractiveTarget()` only blocks real text inputs (`input, textarea, select, [contenteditable]`) so shortcuts keep working while a button holds focus; action buttons also blur themselves on click.
- **TTS engine**: Piper WASM only — no Web Speech API, no HTTP engines. `TtsSession` is a singleton that keeps the first-loaded model, so `useTts` resets `TtsSession._instance` when switching voices. A `window.fetch` wrapper in `useTts.ts` serves model files from local `public/models/` first, falling back to HuggingFace (or `VITE_HF_MIRROR`) — keep it intact if touching TTS code.
- **Async safety**: `useTts` uses a `speakGeneration` counter to cancel stale async operations — always respect this when adding new async TTS logic.

## Known Issues / Cleanup Opportunities

- No mobile responsiveness testing done.
- Voice models (~63MB each) are not committed; run `npm run setup:models` once before `npm run dev`. `public/models/` is gitignored.

## TypeScript Configuration

- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- `erasableSyntaxOnly` — non-const `enum` and `namespace` are disallowed
- TypeScript ~6.0.2 — very modern; some older patterns may be incompatible
