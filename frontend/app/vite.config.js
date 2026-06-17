import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api':       'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/uploads':   'http://localhost:3001',
      '/assets':    'http://localhost:3001',
    },
  },
});
