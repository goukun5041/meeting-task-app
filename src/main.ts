import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import './style.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { vuetify } from './plugins/vuetify'

createApp(App).use(createPinia()).use(vuetify).mount('#app')
