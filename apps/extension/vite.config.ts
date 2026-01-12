import { defineConfig } from 'vite';
import { resolve } from 'path';

// Chrome MV3 extension build config
// Note: We build as ES modules since MV3 supports them
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.ts'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        // Use ES format for MV3 compatibility
        format: 'es',
      },
    },
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@asterisk/core': resolve(__dirname, '../../packages/core/src'),
    },
  },
});
