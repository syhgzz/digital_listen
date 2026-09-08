<script setup lang="ts">
import { MODULE_LABELS, PRACTICE_MODULES } from '../composables/usePracticeSession'
import type { PracticeModule } from '../types/practice'

defineProps<{ modelValue: PracticeModule }>()
const emit = defineEmits<{ 'update:modelValue': [module: PracticeModule] }>()
</script>

<template>
  <nav class="tabs" role="tablist" aria-label="训练模块">
    <button
      v-for="module in PRACTICE_MODULES"
      :key="module"
      type="button"
      role="tab"
      :aria-selected="modelValue === module"
      :class="['tab-button', { active: modelValue === module }]"
      @click="emit('update:modelValue', module)"
    >
      {{ MODULE_LABELS[module] }}
    </button>
  </nav>
</template>
