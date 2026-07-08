import { createVuetify } from 'vuetify'

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1f6feb',
          secondary: '#52616b',
          background: '#f6f8fa',
          surface: '#ffffff',
          info: '#0ea5a4',
          warning: '#f59e0b',
          error: '#dc2626',
          success: '#16a34a',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      variant: 'flat',
    },
    VCard: {
      rounded: 'lg',
      elevation: 1,
    },
    VTextField: {
      density: 'comfortable',
      variant: 'outlined',
    },
    VTextarea: {
      density: 'comfortable',
      variant: 'outlined',
    },
    VSelect: {
      density: 'comfortable',
      variant: 'outlined',
    },
  },
})
