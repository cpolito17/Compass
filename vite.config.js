import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync, mkdirSync } from 'node:fs';

// Served at https://charliepolito.com/trajectory/ — absolute base so asset URLs
// resolve correctly under the subpath regardless of trailing slash.
const BASE = '/trajectory/';

// Workers Static Assets reads _headers from the assets-directory ROOT (dist/),
// but the site itself is emitted into dist/trajectory/. This plugin writes the
// _headers file to dist/ after the build — no separate script or file needed.
const CF_HEADERS = `/trajectory/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
`;

function cloudflareHeaders() {
  return {
    name: 'write-cf-headers',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/_headers', CF_HEADERS);
      console.log('cf-headers: wrote dist/_headers');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflareHeaders()],
  base: BASE,
  build: {
    outDir: 'dist/trajectory',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
