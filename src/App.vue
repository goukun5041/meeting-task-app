<template>
  <v-app>
    <v-layout class="app-shell">
      <v-app-bar color="surface" flat border>
        <div class="content-wrap toolbar-row">
          <div>
            <div class="text-h6 font-weight-bold">課題管理</div>
            <div class="text-caption text-medium-emphasis">個人・小規模チーム向け</div>
          </div>
          <div v-if="authUser" class="auth-actions">
            <div class="text-body-2 text-medium-emphasis auth-user-name">
              {{ authUser.displayName || authUser.email }}
            </div>
            <v-btn variant="tonal" size="small" prepend-icon="mdi-logout" @click="logout">
              ログアウト
            </v-btn>
          </div>
        </div>
      </v-app-bar>

      <v-main>
        <div v-if="authLoading" class="auth-screen">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <div v-else-if="!authUser" class="auth-screen">
          <v-card class="auth-card" variant="flat" border>
            <v-card-title>ログイン</v-card-title>
            <v-card-text class="text-body-2 text-medium-emphasis">
              Googleアカウントでログインしてください。
            </v-card-text>
            <v-card-actions class="pa-4 pt-0">
              <v-btn color="primary" block prepend-icon="mdi-google" @click="loginWithGoogle">
                Googleでログイン
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>
        <IssueListView v-else />
      </v-main>
    </v-layout>
  </v-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import { authLoading, authUser, loginWithGoogle, logout, waitForAuthReady } from './auth/authService'
import IssueListView from './views/IssueListView.vue'

onMounted(() => {
  waitForAuthReady()
})
</script>
