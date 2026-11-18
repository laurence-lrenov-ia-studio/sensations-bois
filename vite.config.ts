import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/sensations-bois/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webmanifest}']
      },
      manifest: {
        name: 'Sensations Bois',
        short_name: 'Sensations Bois',
        description: 'Application métier Sensations Bois',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#100c09',
        theme_color: '#100c09',
        icons: [
          {
            src: `${base}pwa-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: `${base}pwa-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: `${base}pwa-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})
