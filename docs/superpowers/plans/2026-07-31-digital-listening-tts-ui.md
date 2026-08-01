# Digital Listening TTS and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inconsistent browser speech with a self-hosted Piper voice, correct the three module reading rules, and reorganize the app into the approved second layout with reliable keyboard shortcuts.

**Architecture:** The app will generate deterministic English `speakText` strings, send them to a Piper WASM worker, and play returned WAV data through one user-unlocked Web Audio channel. `App.vue` will retain session orchestration and persistence, while `useTts.ts` will own worker/audio state. The page will use the approved two-column desktop work area: settings on the left and training on the right, stacked on mobile.

**Tech Stack:** Vue 3, TypeScript, Vite, `@mintplex-labs/piper-tts-web`, `@diffusionstudio/piper-wasm`, ONNX Runtime Web, Web Worker, Web Audio API, Vitest, Vue Test Utils, happy-dom.

## Global Constraints

- Use one pinned MIT-licensed `en_US-lessac-medium` Piper model.
- Serve model and WASM runtime files from the application origin; do not depend on Web Speech API, OS voices, online TTS, or automatic engine fallback.
- The initial speech action must be an explicit user action; later repeat, next, restart, and module-switch actions may play automatically.
- Phone text is digit-by-digit; number integer text is one cardinal number; number decimals use `point` plus digit-by-digit fractional text; dates use month name, ordinal day, and full cardinal year.
- Use the approved second layout: practice settings and speech settings on the left, training/progress/actions/answer on the right.
- `Space`, `ArrowRight`, and `R` must remain active when a button has focus; editable controls suppress global shortcuts.
- Remove the requested subtitle, engine status, and current-module status strings.
- Preserve unrelated existing worktree changes, including deleted `public/favicon.svg` and `public/icons.svg`.

---

### Task 1: Add deterministic English number/date conversion tests

**Files:**
- Create: `src/utils/numberToWords.ts`
- Create: `src/utils/numberToWords.test.ts`
- Modify: `src/utils/practiceGenerators.ts`
- Create: `src/utils/practiceGenerators.test.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- `integerToEnglishWords(digits: string): string` returns American-English cardinal words for non-negative integer digit strings.
- `ordinalToEnglishWords(day: number): string` returns an English ordinal for days 1 through 31.
- `yearToEnglishWords(year: number): string` returns the full cardinal reading required for date speech.
- `createPhonePracticeItems`, `createDatePracticeItems`, and `createNumberPracticeItems` continue returning `PracticeItem[]` with unchanged answer fields and corrected `speakText` fields.

- [ ] **Step 1: Add the test command and test dependencies.**

Add these scripts and dev dependencies to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@vue/test-utils": "^2.4.6",
    "happy-dom": "^20.0.0",
    "vitest": "^3.2.4"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

- [ ] **Step 2: Write failing conversion tests.**

`src/utils/numberToWords.test.ts` must assert these exact values:

```ts
import { describe, expect, it } from 'vitest'
import { integerToEnglishWords, ordinalToEnglishWords, yearToEnglishWords } from './numberToWords'

describe('integerToEnglishWords', () => {
  it.each([
    ['0', 'zero'],
    ['19', 'nineteen'],
    ['20', 'twenty'],
    ['21', 'twenty-one'],
    ['105', 'one hundred five'],
    ['1000', 'one thousand'],
    ['1000000', 'one million'],
    ['1234567890', 'one billion, two hundred thirty-four million, five hundred sixty-seven thousand, eight hundred ninety'],
    ['999999999999', 'nine hundred ninety-nine billion, nine hundred ninety-nine million, nine hundred ninety-nine thousand, nine hundred ninety-nine'],
  ])('converts %s', (digits, expected) => {
    expect(integerToEnglishWords(digits)).toBe(expected)
  })
})

describe('ordinalToEnglishWords', () => {
  it.each([
    [1, 'first'], [2, 'second'], [3, 'third'], [4, 'fourth'],
    [11, 'eleventh'], [12, 'twelfth'], [13, 'thirteenth'],
    [21, 'twenty-first'], [31, 'thirty-first'],
  ])('converts day %s', (day, expected) => {
    expect(ordinalToEnglishWords(day)).toBe(expected)
  })
})

describe('yearToEnglishWords', () => {
  it('uses a full cardinal year', () => {
    expect(yearToEnglishWords(2026)).toBe('two thousand twenty-six')
  })
})
```

`src/utils/practiceGenerators.test.ts` must mock `Math.random` and assert:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createDatePracticeItems,
  createNumberPracticeItems,
  createPhonePracticeItems,
} from './practiceGenerators'

describe('practice speech text', () => {
  it('reads phone digits separately', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(createPhonePracticeItems(1, 5)[0].speakText).toBe('zero zero zero zero zero')
  })

  it('reads number integers as cardinal words', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    expect(createNumberPracticeItems(1, 10, 0)[0].speakText).toBe(
      'two billion, two hundred twenty-two million, two hundred twenty-two thousand, two hundred twenty-two',
    )
  })

  it('reads fractional digits independently after point', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const item = createNumberPracticeItems(1, 1, 3)[0]
    expect(item.speakText).toContain('point')
    expect(item.speakText.split('point')[1].trim().split(' ')).toHaveLength(3)
  })

  it('uses ordinal dates and a full English year', () => {
    const item = createDatePracticeItems(1, '2026-07-31', '2026-07-31')[0]
    expect(item.speakText).toBe('July thirty-first, two thousand twenty-six')
  })
})

afterEach(() => vi.restoreAllMocks())
```

- [ ] **Step 3: Run the focused tests and verify they fail for the current implementation.**

Run: `npm install && npm test -- src/utils/numberToWords.test.ts src/utils/practiceGenerators.test.ts`

Expected: FAIL because `numberToWords.ts` does not exist and number/date speech still maps numeric characters directly.

- [ ] **Step 4: Implement the pure converters.**

Implement `integerToEnglishWords` using below-twenty words, tens, three-digit chunks, and the scales `thousand`, `million`, and `billion`. Join non-empty scale groups with `, `. Return `zero` for an all-zero input. Implement `ordinalToEnglishWords` with explicit irregular values `first`, `second`, `third`, `fifth`, `eighth`, `ninth`, `twelfth`, and `-ieth` tens. Implement `yearToEnglishWords` as `integerToEnglishWords(String(year))`.

- [ ] **Step 5: Update practice generators and make date arithmetic timezone-stable.**

Use `integerToEnglishWords(integerPart)` for number integers, `point` followed by `digitsToSpeechWords(fractionPart)` for fractions, and `monthName`, `ordinalToEnglishWords(day)`, and `yearToEnglishWords(year)` for dates. Replace millisecond day-span arithmetic with a calendar-day loop based on local year/month/day values so DST does not change the number of selectable days. Keep `answerText` unchanged.

- [ ] **Step 6: Run focused tests and the type/build checks.**

Run: `npm test -- src/utils/numberToWords.test.ts src/utils/practiceGenerators.test.ts`

Expected: PASS with all conversion cases.

Run: `npm run build`

Expected: PASS with no TypeScript errors.

---

### Task 2: Integrate self-hosted Piper assets and worker TTS

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/copy-wasm.mjs`
- Create: `scripts/download-models.sh`
- Create: `src/workers/piper.worker.ts`
- Replace: `src/composables/useTts.ts`
- Delete after reference check: `src/composables/useSpeechSynthesis.ts`
- Modify: `.gitignore`
- Modify: `README.md`
- Create: `scripts/model-checksums.json`
- Create: `src/composables/useTts.test.ts`

**Interfaces:**
- `useTts(options?: { initialRatePreset?: SpeechRatePreset }): { supported, preparing, downloadProgress, selectedRatePreset, speaking, ttsError, speak, stop }`.
- `speak(text: string): Promise<void>` rejects only internally after setting `ttsError`; stale requests resolve without playback.
- `stop(): void` invalidates the current request, stops the audio source, and cancels pending worker playback.

- [ ] **Step 1: Add the Piper dependencies and asset scripts.**

Add `@mintplex-labs/piper-tts-web` to dependencies and `@diffusionstudio/piper-wasm` to dev dependencies. Add scripts:

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-wasm.mjs",
    "setup:models": "bash scripts/download-models.sh"
  }
}
```

`copy-wasm.mjs` copies the ONNX Runtime Web `.mjs` and `.wasm` files into `public/wasm/ort/`, and `piper_phonemize.data` and `piper_phonemize.wasm` into `public/wasm/piper/`. `scripts/model-checksums.json` stores the expected SHA-256 values for the two model files. `download-models.sh` downloads only `en_US-lessac-medium.onnx` and `en_US-lessac-medium.onnx.json` from the pinned Piper voices repository into `public/models/`, validates both files against that manifest, and exits non-zero on a mismatch. Do not add remote TTS fallback.

Add generated model/runtime assets to `.gitignore` only if the deployment setup script is documented and required before build; keep the checked-in model checksum manifest tracked. Keep the existing `.playwright-cli/` ignore rule.

- [ ] **Step 2: Add failing worker/composable tests with browser API mocks.**

Mock `Worker`, `AudioContext`, `AudioBufferSourceNode`, and `URL` in `src/composables/useTts.test.ts`. Assert that `speak('one hundred')` posts a request with a monotonically increasing request ID, `stop()` invalidates the ID and stops the source, a `progress` message updates `downloadProgress`, an `audio` message starts a source at the selected rate, and an error message populates `ttsError`.

- [ ] **Step 3: Run the focused TTS test and verify it fails.**

Run: `npm test -- src/composables/useTts.test.ts`

Expected: FAIL because the current composable exposes OS/HTTP engine state and has no Worker protocol.

- [ ] **Step 4: Implement the worker protocol and local asset resolution.**

Create `src/workers/piper.worker.ts` with these message shapes:

```ts
type PiperRequest = { type: 'speak'; requestId: number; text: string }
type PiperResponse =
  | { type: 'progress'; requestId: number; loaded: number; total: number }
  | { type: 'audio'; requestId: number; audio: Blob }
  | { type: 'error'; requestId: number; message: string }
```

Use a single `TtsSession` for `en_US-lessac-medium`, pass same-origin WASM paths based on `import.meta.env.BASE_URL`, and intercept only the package's model URL requests inside the worker so they resolve to `${BASE_URL}models/`. Never patch `window.fetch`. Post the audio Blob and progress/error events with the original request ID.

- [ ] **Step 5: Implement `useTts.ts` around the worker and Web Audio.**

Create one module Worker with `new Worker(new URL('../workers/piper.worker.ts', import.meta.url), { type: 'module' })`. Create one `AudioContext` lazily. On the first `speak` call, call `audioContext.resume()` while the caller is still handling the explicit user action. Decode returned WAV data with `decodeAudioData`, connect a buffer source to the destination, set `playbackRate` from the existing presets, and resolve on `onended`. Use a generation counter so stale results cannot play. Stop the current source before each new request and on unmount. Set `supported` false when Worker, WebAssembly, AudioContext, or required browser APIs are missing.

- [ ] **Step 6: Remove legacy speech code and update documentation.**

Delete `useSpeechSynthesis.ts` after searching for imports. Rewrite README TTS instructions to describe Piper model setup, `npm run setup:models`, browser storage caching, the explicit first-play action, and the supported browser matrix. Remove OS/local/online environment variables from the documented configuration.

- [ ] **Step 7: Run TTS tests and build.**

Run: `npm test -- src/composables/useTts.test.ts`

Expected: PASS with request IDs, progress, playback, stop, stale-result, and error cases.

Run: `npm run setup:models && npm run build`

Expected: the model setup validates both model files and Vite emits worker, WASM, and application assets without TypeScript errors.

---

### Task 3: Refactor session orchestration and keyboard behavior

**Files:**
- Modify: `src/App.vue`
- Create: `src/App.test.ts`

**Interfaces:**
- Preserve existing persisted setting keys for module values, rate preset, and answer visibility.
- Replace `activeEngineSource`, `allVoiceOptions`, and `anyEngineConfigured` usage with `supported`, `preparing`, and `downloadProgress` from `useTts`.
- Add `hasStarted: Ref<boolean>` to distinguish pre-gesture setup from an active session.

- [ ] **Step 1: Write failing component tests for shortcut focus behavior.**

Mount `App.vue` with `useTts` mocked so `speak`, `stop`, and state refs are deterministic. Focus each rendered action button, dispatch one `keydown` event for Space, ArrowRight, and `KeyR`, and assert the corresponding action runs once. Focus a number/date input and select, dispatch the same events, and assert no global action runs. Assert `preventDefault()` is called for handled button shortcuts.

- [ ] **Step 2: Write failing component tests for removed strings and B grouping.**

Assert the rendered text does not contain `基于 Vue 的数字听写练习工具`, `引擎：`, or `当前模块：`. Assert that a `practice-settings` group contains only active-module inputs, a `speech-settings` group contains rate/preparation status, and the answer toggle is inside the answer area.

- [ ] **Step 3: Run the component tests and verify the current app fails them.**

Run: `npm test -- src/App.test.ts`

Expected: FAIL because `isInteractiveTarget` excludes all buttons from global shortcuts and the current template contains the removed strings and flat settings grid.

- [ ] **Step 4: Change keyboard target filtering without removing focus.**

Change the interactive-target helper to return true only for content-editable elements and `input, textarea, select`. Remove `button`, `a`, `summary`, and `details` from the suppression selector. Keep modifier/repeat guards. When Space, ArrowRight, or R is handled, call `preventDefault()` before invoking the action. Do not call `.blur()` or programmatically move focus.

- [ ] **Step 5: Add explicit first-start session state.**

Initialize the first 30-item session only after the primary start action or a shortcut-triggered restart. Do not call `speak` from `onMounted`. `switchModule` changes the active module and clears the session before the first start; after start, switching modules creates a new session and speaks its first item. `restartSession` unlocks TTS through `speakCurrentItem`, rebuilds the active module, and preserves persisted controls. Disable repeat/next before a session exists.

- [ ] **Step 6: Run component tests and build.**

Run: `npm test -- src/App.test.ts`

Expected: PASS for button shortcuts, editable-control suppression, removed strings, and B grouping.

Run: `npm run build`

Expected: PASS with no unused imports or stale OS-engine references.

---

### Task 4: Implement the approved second layout and responsive states

**Files:**
- Modify: `src/App.vue`
- Modify: `src/style.css`

**Interfaces:**
- Use stable class names: `.workbench`, `.settings-column`, `.practice-settings`, `.speech-settings`, `.training-column`, `.training-stage`, `.answer-panel`, `.training-actions`.
- Keep labels and controls semantic HTML; no layout-only text may replace accessible labels.

- [ ] **Step 1: Replace the flat settings template.**

Render the existing module tabs first. Inside `.workbench`, render the left `.settings-column` with `.practice-settings` and `.speech-settings`. Render the right `.training-column` with progress/status, `.training-stage`, `.training-actions`, and `.answer-panel`. Show module-specific controls only inside `.practice-settings`. Show rate and Piper preparation progress only inside `.speech-settings`. Remove the subtitle, dynamic current-module status, and engine status.

- [ ] **Step 2: Add explicit preparation and first-start states.**

Show `开始训练` when `hasStarted` is false and `重新开始（R）` afterward. Show `语音准备中` with percentage while `preparing` is true, `朗读中` while `speaking` is true, and a concise retryable TTS error when `ttsError` is non-empty. Keep answer content hidden by default and place the `showAnswers` switch beside the answer text.

- [ ] **Step 3: Replace CSS with the B layout rules.**

Use a desktop grid with a fixed narrow settings track and a flexible training track, a single-column breakpoint at `max-width: 760px`, stable minimum widths for fields and action controls, max-width text wrapping, visible `:focus-visible` rings, and no negative letter-spacing. Keep card radii at or below 8px for framed repeated items. Ensure the action row stays in start/repeat/next order and does not overflow on a 320px viewport.

- [ ] **Step 4: Run component tests and build.**

Run: `npm test -- src/App.test.ts`

Expected: PASS with the approved groups and state labels.

Run: `npm run build`

Expected: PASS with a responsive production bundle.

---

### Task 5: End-to-end browser verification and cleanup

**Files:**
- Modify: `README.md` if setup or browser instructions need final corrections
- Modify: `docs/superpowers/specs/2026-07-31-digital-listening-tts-ui-design.md` only if implementation reveals a confirmed requirement correction

- [ ] **Step 1: Verify clean intended diff boundaries.**

Run: `git status --short` and confirm only implementation files, generated ignored assets, the design/plan docs, and the pre-existing deleted `public/favicon.svg` and `public/icons.svg` are present. Do not restore or edit the deleted public files.

- [ ] **Step 2: Run the full test and production build.**

Run: `npm test && npm run setup:models && npm run build`

Expected: all tests pass and the production build completes.

- [ ] **Step 3: Serve the production build and exercise the browser flow.**

Run: `npm run preview -- --host 127.0.0.1`

Use Playwright to verify desktop and mobile viewports, first-click model preparation, successful playback, repeat, next, restart, module switching, speed presets, answer toggle, errors, and button-focused shortcuts. Capture Chromium, Firefox, and WebKit screenshots. Check that all text fits, the two-column desktop layout stacks on mobile, and no controls overlap.

- [ ] **Step 4: Run the final static checks.**

Run: `npm run build && git diff --check`

Expected: PASS with no TypeScript errors and no whitespace errors.
