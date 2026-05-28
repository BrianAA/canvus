import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [
        // Allow serving files from the demo-electron directory
        '.',
        // Allow serving files from the parent directory (like SDK dist files)
        '..'
      ]
    }
  }
});
