<template>
  <v-card>
    <v-data-table
      :headers="headers"
      :items="issues"
      :items-per-page="10"
      :row-props="rowProps"
      item-value="id"
    >
      <template #item.id="{ item }">
        <span class="text-caption text-medium-emphasis">{{ shortId(item.id) }}</span>
      </template>

      <template #item.title="{ item }">
        <div class="font-weight-medium">{{ item.title }}</div>
        <div v-if="item.description" class="text-caption text-medium-emphasis text-truncate">
          {{ item.description }}
        </div>
      </template>

      <template #item.status="{ item }">
        <IssueStatusChip :label="item.status" kind="status" />
      </template>

      <template #item.priority="{ item }">
        <IssueStatusChip :label="item.priority" kind="priority" />
      </template>

      <template #item.dueDate="{ item }">
        <span :class="{ 'text-error font-weight-medium': isOverdue(item.dueDate, item.status === '完了') }">
          {{ formatDate(item.dueDate) }}
        </span>
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex justify-end ga-2">
          <v-btn
            aria-label="詳細"
            icon="mdi-file-search-outline"
            size="small"
            variant="text"
            @click="$emit('showDetail', item)"
          />
          <v-btn
            aria-label="編集"
            icon="mdi-pencil-outline"
            size="small"
            variant="text"
            @click="$emit('edit', item)"
          />
          <v-btn
            aria-label="削除"
            color="error"
            icon="mdi-trash-can-outline"
            size="small"
            variant="text"
            @click="$emit('delete', item)"
          />
        </div>
      </template>

      <template #no-data>
        <div class="pa-8 text-center text-medium-emphasis">条件に一致する課題がありません。</div>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import type { Issue } from '../types/issue'
import { formatDate, isOverdue } from '../utils/date'
import IssueStatusChip from './IssueStatusChip.vue'

defineProps<{
  issues: Issue[]
}>()

defineEmits<{
  showDetail: [issue: Issue]
  edit: [issue: Issue]
  delete: [issue: Issue]
}>()

const headers = [
  { title: 'ID', key: 'id', width: 120 },
  { title: 'タイトル', key: 'title', minWidth: 260 },
  { title: 'ステータス', key: 'status', width: 150 },
  { title: '優先度', key: 'priority', width: 120 },
  { title: '期限', key: 'dueDate', width: 140 },
  { title: '操作', key: 'actions', width: 150, align: 'end', sortable: false },
]

function shortId(id: string): string {
  return id.startsWith('issue-') ? id.replace('issue-', '').slice(0, 8) : id.slice(0, 8)
}

function rowProps({ item }: { item: Issue }) {
  return {
    class: {
      'issue-complete': item.status === '完了',
      'issue-overdue': isOverdue(item.dueDate, item.status === '完了'),
    },
  }
}
</script>
