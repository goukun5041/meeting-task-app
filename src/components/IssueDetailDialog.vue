<template>
  <v-dialog :model-value="modelValue" max-width="760" @update:model-value="close">
    <v-card v-if="issue">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>課題詳細</span>
        <v-btn icon="mdi-close" variant="text" @click="close(false)" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-row dense>
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
          <v-col cols="12">
            <v-divider class="my-3" />
            <div class="d-flex align-center justify-space-between mb-3">
              <div class="text-subtitle-1 font-weight-bold">対応履歴</div>
              <v-btn
                color="primary"
                prepend-icon="mdi-plus"
                size="small"
                variant="tonal"
                @click="openHistoryForm()"
              >
                追加
              </v-btn>
            </div>

            <div v-if="groupedHistories.length" class="history-groups">
              <div v-for="group in groupedHistories" :key="group.date" class="history-group">
                <div class="text-body-2 font-weight-bold mb-2">
                  {{ formatDate(group.date) }}
                </div>
                <v-list class="pa-0" density="compact">
                  <v-list-item
                    v-for="history in group.histories"
                    :key="history.id"
                    class="history-item px-0"
                  >
                    <template #prepend>
                      <span class="history-bullet">-</span>
                    </template>
                    <v-list-item-title class="history-content white-space-pre-line">
                      {{ history.content }}
                    </v-list-item-title>
                    <template #append>
                      <div class="history-actions">
                        <v-btn
                          aria-label="対応履歴を編集"
                          icon="mdi-pencil-outline"
                          size="small"
                          variant="text"
                          @click="openHistoryForm(history)"
                        />
                        <v-btn
                          aria-label="対応履歴を削除"
                          color="error"
                          icon="mdi-trash-can-outline"
                          size="small"
                          variant="text"
                          @click="deleteHistory(history.id)"
                        />
                      </div>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </div>
            <div v-else class="text-body-2 text-medium-emphasis">対応履歴はありません。</div>
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

    <v-dialog v-model="historyDialog" max-width="560" persistent>
      <v-card>
        <v-card-title>{{ editingHistoryId ? '対応履歴編集' : '対応履歴追加' }}</v-card-title>
        <v-divider />
        <v-form ref="historyFormRef" @submit.prevent="saveHistory">
          <v-card-text>
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="historyForm.date"
                  label="日付"
                  type="date"
                  :rules="requiredRules"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model.trim="historyForm.content"
                  auto-grow
                  label="内容"
                  rows="4"
                  :rules="contentRules"
                />
              </v-col>
            </v-row>
          </v-card-text>
          <v-divider />
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn variant="tonal" @click="historyDialog = false">キャンセル</v-btn>
            <v-btn
              color="primary"
              :disabled="!historyForm.content"
              prepend-icon="mdi-content-save-outline"
              type="submit"
            >
              保存
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { useIssueStore } from '../stores/issueStore'
import type { Issue, IssueHistory } from '../types/issue'
import { formatDate, formatDateTime } from '../utils/date'
import IssueStatusChip from './IssueStatusChip.vue'

const props = defineProps<{
  modelValue: boolean
  issue: Issue | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  edit: [issue: Issue]
}>()

const issueStore = useIssueStore()
const historyDialog = ref(false)
const editingHistoryId = ref<string | null>(null)
const historyFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const historyForm = reactive({
  date: getToday(),
  content: '',
})

const groupedHistories = computed(() => groupHistories(props.issue?.histories ?? []))

const requiredRules = [(value: string) => Boolean(value) || '必須です']
const contentRules = [(value: string) => Boolean(value) || '内容は必須です']

function close(value: boolean): void {
  emit('update:modelValue', value)
}

function openHistoryForm(history?: IssueHistory): void {
  editingHistoryId.value = history?.id ?? null
  historyForm.date = history?.date ?? getToday()
  historyForm.content = history?.content ?? ''
  historyDialog.value = true
}

async function saveHistory(): Promise<void> {
  if (!props.issue) return

  const result = await historyFormRef.value?.validate()
  if (!result?.valid) return

  const input = {
    date: historyForm.date,
    content: historyForm.content,
  }

  if (editingHistoryId.value) {
    issueStore.updateIssueHistory(props.issue.id, editingHistoryId.value, input)
  } else {
    issueStore.addIssueHistory(props.issue.id, input)
  }

  historyDialog.value = false
}

function deleteHistory(historyId: string): void {
  if (!props.issue) return

  issueStore.deleteIssueHistory(props.issue.id, historyId)
}

function groupHistories(histories: IssueHistory[]): { date: string; histories: IssueHistory[] }[] {
  const sortedHistories = [...histories].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date)
    if (dateDiff !== 0) return dateDiff

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  return sortedHistories.reduce<{ date: string; histories: IssueHistory[] }[]>((groups, history) => {
    const currentGroup = groups[groups.length - 1]
    if (currentGroup?.date === history.date) {
      currentGroup.histories.push(history)
      return groups
    }

    groups.push({ date: history.date, histories: [history] })
    return groups
  }, [])
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}
</script>

<style scoped>
.white-space-pre-line {
  white-space: pre-line;
}

.history-groups {
  display: grid;
  gap: 14px;
}

.history-group {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-top: 12px;
}

.history-group:first-child {
  border-top: 0;
  padding-top: 0;
}

.history-bullet {
  display: inline-block;
  min-width: 18px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.history-content {
  line-height: 1.55;
  white-space: pre-line;
}

.history-actions {
  display: flex;
  flex: 0 0 auto;
}
</style>
