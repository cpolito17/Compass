import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync, mkdirSync, cpSync } from 'node:fs';

// Primary served path — asset URLs are absolute to this base.
// /compass/* also routes to this worker; assets still resolve since they're
// served at /trajectory/assets/... by the same worker regardless of entry path.
const BASE = '/trajectory/';

const CF_HEADERS = `/trajectory/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()

/compass/*
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
      // Mirror the built app under /compass so both routes have an index.html
      cpSync('dist/trajectory', 'dist/compass', { recursive: true });
      console.log('cf-headers: wrote dist/_headers');
      console.log('cf-mirror: copied dist/trajectory → dist/compass');
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
