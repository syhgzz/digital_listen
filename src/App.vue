<script setup lang="ts">
import { onMounted, watch } from 'vue'
import ModuleTabs from './components/ModuleTabs.vue'
import PracticePanel from './components/PracticePanel.vue'
import PracticeSettings from './components/PracticeSettings.vue'
import SpeechSettings from './components/SpeechSettings.vue'
import { useGlobalShortcuts } from './composables/useGlobalShortcuts'
import { usePracticeSession } from './composables/usePracticeSession'
import { useTts } from './composables/useTts'
import { readPersistedSettings, updatePersistedSettings } from './utils/settingsStorage'

const persisted = readPersistedSettings()

const {
  engineStatus,
  error: ttsError,
  hasLocalVoice,
  isPreparing,
  needsGesture,
  notice,
  prepareProgress,
  selectedRatePreset,
  selectedVoiceKey,
  speak,
  speaking,
  testVoice,
  voiceOptions,
} = useTts({
  initialVoiceKey: persisted.tts?.voiceKey,
  initialRatePreset: persisted.tts?.ratePreset,
})

const {
  activeModule,
  currentItem,
  hasNextItem,
  moduleError,
  progressLabel,
  settings,
  showAnswers,
  nextItem,
  repeatCurrent,
  restartSession,
  startSession,
  switchModule,
} = usePracticeSession({ onSpeak: (text) => void speak(text) })

watch([selectedVoiceKey, selectedRatePreset], () => {
  updatePersistedSettings({
    tts: {
      voiceKey: selectedVoiceKey.value,
      ratePreset: selectedRatePreset.value,
    },
  })
})

useGlobalShortcuts({
  onRepeat: repeatCurrent,
  onNext: nextItem,
  onRestart: restartSession,
})

onMounted(() => {
  startSession()
})
</script>

<template>
  <main class="app">
    <h1 class="app-title">数字听力训练</h1>

    <ModuleTabs :model-value="activeModule" @update:model-value="switchModule" />

    <div class="settings-columns">
      <PracticeSettings :module="activeModule" :settings="settings" />

      <SpeechSettings
        :voice-options="voiceOptions"
        :selected-voice-key="selectedVoiceKey"
        :rate-preset="selectedRatePreset"
        :engine-status="engineStatus"
        :prepare-progress="prepareProgress"
        :is-preparing="isPreparing"
        :error="ttsError"
        :has-local-voice="hasLocalVoice"
        :can-test="voiceOptions.length > 0"
        @update:selected-voice-key="selectedVoiceKey = $event"
        @update:rate-preset="selectedRatePreset = $event"
        @test="testVoice"
      />
    </div>

    <PracticePanel
      :current-item="currentItem"
      :progress-label="progressLabel"
      :has-next-item="hasNextItem"
      :speaking="speaking"
      :show-answers="showAnswers"
      :module-error="moduleError"
      :tts-error="ttsError"
      :notice="notice"
      :needs-gesture="needsGesture"
      @restart="restartSession"
      @repeat="repeatCurrent"
      @next="nextItem"
      @update:show-answers="showAnswers = $event"
    />
  </main>
</template>
