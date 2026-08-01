# Digital Listening TTS and UI Redesign

## Goal

Make the listening exercises predictable across supported browsers and operating systems, give each practice type the correct English reading rules, preserve global shortcuts after button clicks, and reorganize the interface around the user's training workflow.

## Scope

This change covers the existing phone, date, and number modules. It replaces operating-system speech synthesis with one embedded English Piper voice, reorganizes the existing controls, corrects spoken-text generation, fixes shortcut handling, and removes the three requested UI strings.

"All browsers and operating systems" means current and previous major releases of Chrome, Edge, Firefox, and Safari on desktop, Chrome on Android, and Safari on iOS. Browsers without WebAssembly, Web Workers, or browser audio playback are outside the supported matrix and receive an explicit compatibility error. Internet Explorer is not supported.

## Decisions

### Speech engine

- Use the MIT-licensed `@mintplex-labs/piper-tts-web` browser integration with the MIT-licensed Piper WASM runtime.
- Use one pinned `en_US-lessac-medium` model. A single voice keeps pronunciation consistent and avoids downloading several models that each consume tens of megabytes.
- Serve the model, model configuration, ONNX runtime, Piper phonemizer WASM, and phonemizer data from the application's own origin.
- Add a deterministic setup script that downloads the pinned model artifacts and verifies their checksums before a production build. Generated runtime and model assets remain deployment artifacts rather than hand-edited source files.
- Do not use Web Speech API, operating-system voices, online TTS, or automatic engine fallback. Falling back to an OS voice would reintroduce the cross-platform inconsistency this change is intended to remove.

### Speech execution

- Run Piper initialization and inference in a dedicated Web Worker so model work does not block Vue rendering or controls.
- The worker accepts typed requests carrying request IDs and emits download progress, ready, audio result, and error messages.
- Keep one initialized Piper session for the fixed voice. Cache model data through the browser storage used by the Piper library.
- The Vue composable owns worker lifecycle, current request identity, the reusable audio channel, playback rate, loading state, speaking state, progress, stop behavior, and user-facing errors.
- Ignore stale worker results when a newer question or stop action supersedes them. Synthesis that is already running may finish in the worker, but its result must never play.
- Unlock the reusable audio channel during the first explicit user action. The initial session is prepared without automatic playback; the user starts the first reading with the primary training action. Later repeats, next-question actions, restarts, and module switches may play normally.
- Keep the existing three rate presets. Apply playback speed on the audio element and request pitch preservation where the browser supports it.

## Spoken Text Rules

Spoken text must be generated as explicit English words before it reaches Piper. Display text remains numeric and is independent of spoken text.

### Phone module

Read every digit independently and preserve zeroes.

Example: `12005` becomes `one two zero zero five`.

### Number module

- Read the integer part as one English cardinal number.
- Support the existing range of 1 to 12 integer digits, which remains below JavaScript's safe-integer limit.
- Use American English wording without `and` inside cardinal numbers.
- For decimals, read `point` followed by each fractional digit independently so leading and trailing zeroes are preserved.

Examples:

- `1234567890` becomes `one billion, two hundred thirty-four million, five hundred sixty-seven thousand, eight hundred ninety`.
- `123.045` becomes `one hundred twenty-three, point, zero four five`.

### Date module

- Generate dates with timezone-stable calendar arithmetic rather than elapsed milliseconds, avoiding daylight-saving boundary errors.
- Read the English month name, the day as an ordinal word, and the year as a full cardinal number.
- Do not rely on `Intl.DateTimeFormat` output as speech input because its numeric tokens may be interpreted differently by different engines.

Example: `2026-07-31` becomes `July thirty-first, two thousand twenty-six`.

## Interface Layout

Use the approved "settings area plus training area" layout.

- Keep the application title and the three module tabs at the top.
- On desktop, use a two-column work area. The narrower left column contains two visually distinct groups: practice settings and speech settings. The wider right column contains the listening prompt, progress and preparation state, playback actions, and answer area.
- Practice settings contain only the controls relevant to the active module.
- Speech settings contain the rate control and fixed-voice preparation progress. Do not show an engine selector when there is only one supported engine and voice.
- Place the answer visibility toggle directly beside the answer area rather than among generation settings.
- Keep actions in workflow order: start or restart, repeat, then next.
- Stack the two columns on mobile while preserving that order and ensuring controls use the available width.
- Retain accessible labels and `focus-visible` indicators. Mouse focus styling may be visually restrained, but focus is never programmatically removed.

Remove these strings from the rendered interface:

- `引擎：操作系统内部语音引擎`
- `基于 Vue 的数字听写练习工具：每个模块随机生成 30 题并自动朗读。`
- `当前模块：日期听力` and the corresponding dynamic current-module status for all modules

Progress and active speech/preparation status remain because they give actionable training feedback.

## Keyboard Behavior

- Keep `Space` for repeat, `ArrowRight` for next, and `R` for restart.
- Continue handling these shortcuts when a button retains focus after a mouse or keyboard activation.
- For handled keys, call `preventDefault()` so Space does not also activate the focused button.
- Suppress global shortcuts only when the event comes from an editable target: text/number/date input, textarea, select, or content-editable element. Modifier combinations and repeated keydown events remain ignored.
- Disabled actions remain no-ops when triggered by shortcuts.

## State and Error Handling

- Expose separate `preparing`, `speaking`, download-progress, and error states from the TTS composable.
- Disable conflicting playback actions while the first model preparation or speech synthesis is active, but keep stop/supersession behavior deterministic for module and session changes.
- Report unsupported capabilities, model download failure, worker initialization failure, synthesis failure, and audio playback rejection with concise recovery guidance.
- A later explicit playback action clears a previous transient TTS error and retries initialization or synthesis.
- Revoke object URLs and terminate the worker when the component unmounts. Stop current audio when switching module, restarting, or starting a newer utterance.

## Code Boundaries

- `src/utils/numberToWords.ts`: pure cardinal and ordinal English conversion.
- `src/utils/practiceGenerators.ts`: random item generation and module-specific `speakText` composition.
- `src/workers/piper.worker.ts`: Piper initialization, same-origin asset resolution, progress events, and synthesis.
- `src/composables/useTts.ts`: Vue-facing TTS state, worker requests, stale-result handling, and audio playback.
- `src/App.vue`: session orchestration, keyboard policy, persistence, and grouped interface markup.
- `src/style.css`: responsive two-column work area and grouped control styling.
- The unused `src/composables/useSpeechSynthesis.ts` is removed after all references are verified absent.

## Testing

### Unit tests

- Cardinal values: zero, teens, exact tens, hundreds, scale boundaries, the required `1234567890` example, and the 12-digit maximum.
- Ordinals: irregular values and all day suffix boundaries, including 1, 2, 3, 11, 12, 13, 21, and 31.
- Dates: the approved example, leap day, same-day ranges, and a daylight-saving transition.
- Decimals: leading and trailing fractional zeroes.
- Phone numbers: leading zeroes and independent digit reading.

### Component tests

- Focus each action button and verify Space, ArrowRight, and R still perform their global actions exactly once.
- Verify shortcuts do not fire while editing module inputs or selects.
- Verify the three requested strings are absent.
- Verify module-specific controls appear in the practice-settings group and the answer toggle appears with the answer.

### Browser verification

- Build and serve the production application.
- Exercise model preparation, first user-triggered playback, repeat, next, restart, module switching, speed presets, and errors in Chromium, Firefox, and WebKit.
- Capture desktop and mobile screenshots to check grouping, text fit, focus states, and absence of overlapping controls.

## Out of Scope

- Multiple downloadable voices or languages.
- Server-side or cloud TTS.
- User accounts, scoring, answer input, or exercise history.
- Compatibility with obsolete browsers lacking the required web platform APIs.
