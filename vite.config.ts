import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src'),
              '@shared': resolve(__dirname, 'src/shared'),
              '@main': resolve(__dirname, 'src/main'),
              '@renderer': resolve(__dirname, 'src/renderer')
            }
          },
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron', 'serialport', 'electron-store', 'electron-log'],
              output: {
                format: 'cjs',
                entryFileNames: 'index.js'
              }
            }
          }
        }
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src'),
              '@shared': resolve(__dirname, 'src/shared'),
              '@main': resolve(__dirname, 'src/main'),
              '@renderer': resolve(__dirname, 'src/renderer')
            }
          },
          build: {
            outDir: 'dist/preload',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'index.js'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
});
