<template>
  <v-container fluid class="py-6">
    <div class="content-wrap">
      <div class="toolbar-row mb-4">
        <div>
          <h1 class="text-h5 font-weight-bold mb-1">課題一覧</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">
            ステータス、優先度、期限を見ながら課題を管理できます。
          </p>
        </div>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
          新規課題
        </v-btn>
      </div>

      <div class="summary-grid mb-4">
        <div class="summary-tile">
          <div class="summary-label">全課題</div>
          <div class="summary-value">{{ issueStore.summary.total }}</div>
        </div>
        <div class="summary-tile">
          <div class="summary-label">未完了</div>
          <div class="summary-value">{{ issueStore.summary.active }}</div>
        </div>
        <div class="summary-tile">
          <div class="summary-label">完了</div>
          <div class="summary-value">{{ issueStore.summary.done }}</div>
        </div>
        <div class="summary-tile">
          <div class="summary-label">緊急</div>
          <div class="summary-value">{{ issueStore.summary.urgent }}</div>
        </div>
      </div>

      <IssueFilterBar
        v-model:keyword="filters.keyword"
        v-model:priority="filters.priority"
        v-model:status="filters.status"
        class="mb-4"
        @clear="clearFilters"
      />

      <IssueTable
        :issues="filteredIssues"
        @delete="confirmDelete"
        @edit="openEditDialog"
        @show-detail="openDetailDialog"
      />
    </div>

    <IssueFormDialog v-model="formDialog" :issue="editingIssue" @save="saveIssue" />
    <IssueDetailDialog v-model="detailDialog" :issue="selectedIssue" @edit="editFromDetail" />

    <v-dialog v-model="deleteDialog" max-width="460">
      <v-card>
        <v-card-title>課題削除</v-card-title>
        <v-card-text>
          「{{ deletingIssue?.title }}」を削除します。この操作は元に戻せません。
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="tonal" @click="deleteDialog = false">キャンセル</v-btn>
          <v-btn color="error" prepend-icon="mdi-trash-can-outline" @click="deleteSelectedIssue">
            削除
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" color="primary" timeout="2200">
      {{ snackbar.message }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import IssueDetailDialog from '../components/IssueDetailDialog.vue'
import IssueFilterBar, { type FilterValue } from '../components/IssueFilterBar.vue'
import IssueFormDialog from '../components/IssueFormDialog.vue'
import IssueTable from '../components/IssueTable.vue'
import { useIssueStore } from '../stores/issueStore'
import type { Issue, IssueFormInput } from '../types/issue'

const issueStore = useIssueStore()

const filters = reactive<{
  keyword: string
  status: FilterValue
  priority: FilterValue
}>({
  keyword: '',
  status: null,
  priority: null,
})

const formDialog = ref(false)
const detailDialog = ref(false)
const deleteDialog = ref(false)
const editingIssue = ref<Issue | null>(null)
const selectedIssueId = ref<string | null>(null)
const deletingIssue = ref<Issue | null>(null)
const snackbar = reactive({
  show: false,
  message: '',
})

const filteredIssues = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return issueStore.sortedIssues.filter((issue) => {
    const matchesKeyword =
      !keyword ||
      issue.title.toLowerCase().includes(keyword) ||
      issue.description.toLowerCase().includes(keyword)

    const matchesStatus = !filters.status || issue.status === filters.status
    const matchesPriority = !filters.priority || issue.priority === filters.priority

    return matchesKeyword && matchesStatus && matchesPriority
  })
})

const selectedIssue = computed(() =>
  selectedIssueId.value ? (issueStore.getIssueById(selectedIssueId.value) ?? null) : null,
)

onMounted(() => {
  issueStore.load()
})

function clearFilters(): void {
  filters.keyword = ''
  filters.status = null
  filters.priority = null
}

function openCreateDialog(): void {
  editingIssue.value = null
  formDialog.value = true
}

function openEditDialog(issue: Issue): void {
  editingIssue.value = issue
  formDialog.value = true
}

function openDetailDialog(issue: Issue): void {
  selectedIssueId.value = issue.id
  detailDialog.value = true
}

function editFromDetail(issue: Issue): void {
  detailDialog.value = false
  openEditDialog(issue)
}

function saveIssue(input: IssueFormInput): void {
  if (editingIssue.value) {
    issueStore.updateIssue(editingIssue.value.id, input)
    showMessage('課題を更新しました。')
  } else {
    issueStore.createIssue(input)
    showMessage('課題を登録しました。')
  }
  editingIssue.value = null
}

function confirmDelete(issue: Issue): void {
  deletingIssue.value = issue
  deleteDialog.value = true
}

function deleteSelectedIssue(): void {
  if (!deletingIssue.value) return

  issueStore.deleteIssue(deletingIssue.value.id)
  if (selectedIssueId.value === deletingIssue.value.id) {
    selectedIssueId.value = null
    detailDialog.value = false
  }

  deletingIssue.value = null
  deleteDialog.value = false
  showMessage('課題を削除しました。')
}

function showMessage(message: string): void {
  snackbar.message = message
  snackbar.show = true
}
</script>
