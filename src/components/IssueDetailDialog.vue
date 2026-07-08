<template>
  <v-dialog :model-value="modelValue" max-width="680" @update:model-value="close">
    <v-card v-if="issue">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>課題詳細</span>
        <v-btn icon="mdi-close" variant="text" @click="close(false)" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis">ID</div>
            <div class="font-weight-medium">{{ issue.id }}</div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis">期限</div>
            <div class="font-weight-medium">{{ formatDate(issue.dueDate) }}</div>
          </v-col>
          <v-col cols="12">
            <div class="text-caption text-medium-emphasis">タイトル</div>
            <div class="text-h6">{{ issue.title }}</div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">ステータス</div>
            <IssueStatusChip :label="issue.status" kind="status" />
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">優先度</div>
            <IssueStatusChip :label="issue.priority" kind="priority" />
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis">作成日時</div>
            <div>{{ formatDateTime(issue.createdAt) }}</div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis">更新日時</div>
            <div>{{ formatDateTime(issue.updatedAt) }}</div>
          </v-col>
          <v-col cols="12">
            <v-divider class="my-3" />
            <div class="text-caption text-medium-emphasis mb-1">内容</div>
            <p class="mb-0 text-body-1 white-space-pre-line">
              {{ issue.description || '内容は未入力です。' }}
            </p>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="tonal" @click="close(false)">閉じる</v-btn>
        <v-btn color="primary" prepend-icon="mdi-pencil-outline" @click="$emit('edit', issue)">
          編集
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Issue } from '../types/issue'
import { formatDate, formatDateTime } from '../utils/date'
import IssueStatusChip from './IssueStatusChip.vue'

defineProps<{
  modelValue: boolean
  issue: Issue | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  edit: [issue: Issue]
}>()

function close(value: boolean): void {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.white-space-pre-line {
  white-space: pre-line;
}
</style>
