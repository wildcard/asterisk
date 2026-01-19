import { defineConfig } from 'vite';
import { resolve } from 'path';

// Chrome MV3 extension build config
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't delete public assets
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.ts'),
        background: resolve(__dirname, 'src/background.ts'),
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
