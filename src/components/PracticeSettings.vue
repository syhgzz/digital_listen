<script setup lang="ts">
import type { ModuleSettings, PracticeModule } from '../types/practice'

defineProps<{
  module: PracticeModule
  settings: ModuleSettings
}>()
</script>

<template>
  <section class="card" aria-labelledby="practice-settings-title">
    <h2 id="practice-settings-title" class="card-title">练习设置</h2>

    <div class="settings-grid">
      <template v-if="module === 'phone'">
        <label class="field">
          <span>电话号码位数</span>
          <input v-model.number="settings.phone.digitCount" type="number" min="3" max="20" />
          <small class="field-hint">每一位单独朗读，例如 five five five one two three。</small>
        </label>
      </template>

      <template v-else-if="module === 'date'">
        <label class="field">
          <span>开始日期</span>
          <input v-model="settings.date.startDate" type="date" />
        </label>
        <label class="field">
          <span>结束日期</span>
          <input v-model="settings.date.endDate" type="date" />
        </label>
        <small class="field-hint">朗读格式：September eighth, twenty twenty-five。</small>
      </template>

      <template v-else>
        <label class="field">
          <span>小数点前位数</span>
          <input
            v-model.number="settings.number.integerDigits"
            type="number"
            min="1"
            max="12"
          />
        </label>
        <label class="field">
          <span>小数点后位数</span>
          <input
            v-model.number="settings.number.fractionDigits"
            type="number"
            min="0"
            max="8"
          />
        </label>
        <small class="field-hint">
          整数部分按整体朗读，小数部分逐位朗读：one thousand two hundred thirty-four point five
          six。
        </small>
      </template>
    </div>
  </section>
</template>
