import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served at https://charliepolito.com/trajectory/ — absolute base so asset
  // URLs resolve correctly under the subpath regardless of trailing slash.
  base: '/trajectory/',
  build: {
    // Emit into dist/trajectory so the served asset paths (/trajectory/...)
    // match the Worker route. dist/ root holds only _headers (see postbuild).
    outDir: 'dist/trajectory',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
