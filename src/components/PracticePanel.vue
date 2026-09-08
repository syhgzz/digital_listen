<script setup lang="ts">
import type { PracticeItem } from '../types/practice'

defineProps<{
  currentItem: PracticeItem | null
  progressLabel: string
  hasNextItem: boolean
  speaking: boolean
  showAnswers: boolean
  moduleError: string
  ttsError: string
  notice: string
  needsGesture: boolean
}>()

const emit = defineEmits<{
  restart: []
  repeat: []
  next: []
  'update:showAnswers': [value: boolean]
}>()
</script>

<template>
  <section class="card practice-card" aria-labelledby="practice-panel-title">
    <h2 id="practice-panel-title" class="card-title">练习</h2>

    <div class="actions">
      <button type="button" class="primary" @click="emit('restart')">重新开始（R）</button>
      <button type="button" :disabled="!currentItem" @click="emit('repeat')">
        重复发音（空格）
      </button>
      <button type="button" :disabled="!hasNextItem" @click="emit('next')">下一个（→）</button>
    </div>

    <div class="status">
      <span>进度：{{ progressLabel }}</span>
      <span v-if="speaking">状态：朗读中…</span>
      <span v-if="currentItem">快捷键：空格重复，右箭头下一题，R 重新开始</span>
    </div>

    <p v-if="moduleError" class="error-text">{{ moduleError }}</p>
    <p v-if="ttsError" class="error-text">{{ ttsError }}</p>
    <p v-if="notice" class="notice-text">{{ notice }}</p>
    <p v-if="needsGesture" class="notice-text">
      浏览器需要一次交互才允许播放声音：点击页面任意位置即可继续。
    </p>

    <div v-if="currentItem" class="question-card">
      <div class="question-header">
        <p class="title">请听并写下你听到的内容</p>
        <label class="switch-field">
          <input
            class="switch-input"
            type="checkbox"
            :checked="showAnswers"
            @change="
              emit('update:showAnswers', ($event.target as HTMLInputElement).checked)
            "
          />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-text">{{ showAnswers ? '显示答案' : '隐藏答案' }}</span>
        </label>
      </div>

      <template v-if="showAnswers">
        <p class="answer">{{ currentItem.answerText }}</p>
        <p class="answer-reading">读法：{{ currentItem.speakText }}</p>
      </template>
      <p v-else class="masked">答案当前隐藏，可打开“显示答案”开关查看。</p>
    </div>

    <div v-else class="question-card empty">启动时会自动准备题目并朗读第一题。</div>
  </section>
</template>
