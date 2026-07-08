<template>
  <v-app>
    <v-layout class="app-shell">
      <v-app-bar color="surface" flat border>
        <div class="content-wrap toolbar-row">
          <div>
            <div class="text-h6 font-weight-bold">課題管理</div>
            <div class="text-caption text-medium-emphasis">個人・小規模チーム向け</div>
          </div>
        </div>
      </v-app-bar>

      <v-main>
        <IssueListView />
      </v-main>
    </v-layout>
  </v-app>
</template>

<script setup lang="ts">
import IssueListView from './views/IssueListView.vue'
</script>
