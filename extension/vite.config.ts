import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  root: 'src',
  base: './',
  server: {
    https: true,
    port: 5173
  },
  plugins: [mkcert()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'src/index.html'
      }
    }
  }
});
