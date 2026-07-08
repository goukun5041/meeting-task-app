<template>
  <v-chip :color="color" size="small" variant="tonal" label>
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { IssuePriority, IssueStatus } from '../types/issue'

const props = defineProps<{
  label: IssueStatus | IssuePriority
  kind: 'status' | 'priority'
}>()

const color = computed(() => {
  if (props.kind === 'priority') {
    return (
      {
        緊急: 'error',
        高: 'warning',
        中: 'info',
        低: 'secondary',
      } satisfies Record<IssuePriority, string>
    )[props.label as IssuePriority]
  }

  return (
    {
      未着手: 'secondary',
      対応中: 'primary',
      レビュー待ち: 'warning',
      完了: 'success',
      保留: 'info',
    } satisfies Record<IssueStatus, string>
  )[props.label as IssueStatus]
})
</script>
