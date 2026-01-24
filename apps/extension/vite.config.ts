import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// Chrome MV3 extension build config
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't delete public assets
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.ts'),
        background: resolve(__dirname, 'src/background.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        format: 'es',
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@asterisk/core': resolve(__dirname, '../../packages/core/src'),
    },
  },
});
