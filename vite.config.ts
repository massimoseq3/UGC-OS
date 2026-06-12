import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Honor PORT when a tool (e.g. preview harness) assigns one; default 5173.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
})
