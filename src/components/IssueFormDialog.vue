<template>
  <v-dialog :model-value="modelValue" max-width="680" persistent @update:model-value="close">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ issue ? '課題編集' : '課題登録' }}</span>
        <v-btn icon="mdi-close" variant="text" @click="close(false)" />
      </v-card-title>

      <v-divider />

      <v-form ref="formRef" @submit.prevent="submit">
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                v-model.trim="form.title"
                counter="100"
                label="タイトル"
                :rules="titleRules"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model.trim="form.description"
                auto-grow
                counter="1000"
                label="内容"
                rows="4"
                :rules="descriptionRules"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.status"
                :items="ISSUE_STATUSES"
                label="ステータス"
                :rules="requiredRules"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.priority"
                :items="ISSUE_PRIORITIES"
                label="優先度"
                :rules="requiredRules"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="dueDateModel" label="期限日" type="date" />
            </v-col>
          </v-row>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="tonal" @click="close(false)">キャンセル</v-btn>
          <v-btn color="primary" prepend-icon="mdi-content-save-outline" type="submit">
            保存
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../constants/issueOptions'
import type { Issue, IssueFormInput, IssuePriority, IssueStatus } from '../types/issue'

const props = defineProps<{
  modelValue: boolean
  issue: Issue | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [input: IssueFormInput]
}>()

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const form = reactive<IssueFormInput>({
  title: '',
  description: '',
  status: '未着手',
  priority: '中',
  dueDate: null,
})

const dueDateModel = computed({
  get: () => form.dueDate ?? '',
  set: (value: string) => {
    form.dueDate = value || null
  },
})

const requiredRules = [(value: string) => Boolean(value) || '必須です']
const titleRules = [
  (value: string) => Boolean(value) || 'タイトルは必須です',
  (value: string) => value.length <= 100 || '100文字以内で入力してください',
]
const descriptionRules = [
  (value: string) => value.length <= 1000 || '1000文字以内で入力してください',
]

watch(
  () => [props.modelValue, props.issue] as const,
  ([isOpen, issue]) => {
    if (!isOpen) return

    form.title = issue?.title ?? ''
    form.description = issue?.description ?? ''
    form.status = (issue?.status ?? '未着手') as IssueStatus
    form.priority = (issue?.priority ?? '中') as IssuePriority
    form.dueDate = issue?.dueDate ?? null
  },
  { immediate: true },
)

function close(value: boolean): void {
  emit('update:modelValue', value)
}

async function submit(): Promise<void> {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  emit('save', { ...form })
  close(false)
}
</script>
