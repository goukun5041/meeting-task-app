<template>
  <v-card class="pa-4">
    <v-row dense>
      <v-col cols="12" md="5">
        <v-text-field
          :model-value="keyword"
          clearable
          hide-details
          label="検索キーワード"
          prepend-inner-icon="mdi-magnify"
          @update:model-value="updateKeyword"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select
          :items="statusItems"
          :model-value="status"
          hide-details
          label="ステータス"
          @update:model-value="updateStatus"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select
          :items="priorityItems"
          :model-value="priority"
          hide-details
          label="優先度"
          @update:model-value="updatePriority"
        />
      </v-col>
      <v-col cols="12" md="1" class="d-flex align-center">
        <v-btn block color="secondary" variant="tonal" @click="$emit('clear')">
          クリア
        </v-btn>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../constants/issueOptions'

export type FilterValue = string | null

defineProps<{
  keyword: string
  status: FilterValue
  priority: FilterValue
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  'update:status': [value: FilterValue]
  'update:priority': [value: FilterValue]
  clear: []
}>()

const allItem = { title: 'すべて', value: null }
const statusItems = [allItem, ...ISSUE_STATUSES.map((value) => ({ title: value, value }))]
const priorityItems = [allItem, ...ISSUE_PRIORITIES.map((value) => ({ title: value, value }))]

function updateKeyword(value: unknown): void {
  emit('update:keyword', String(value ?? ''))
}

function updateStatus(value: unknown): void {
  emit('update:status', typeof value === 'string' ? value : null)
}

function updatePriority(value: unknown): void {
  emit('update:priority', typeof value === 'string' ? value : null)
}
</script>
