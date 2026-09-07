import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync, mkdirSync, cpSync } from 'node:fs';

// Compass is the canonical product path. The legacy /trajectory entry is kept
// as a mirrored shell whose assets resolve from /compass/.
const BASE = '/compass/';

const CF_HEADERS = `/trajectory/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/compass/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;

function cloudflareHeaders() {
  return {
    name: 'write-cf-headers',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/_headers', CF_HEADERS);
      // Mirror the canonical build under the legacy path for old bookmarks.
      cpSync('dist/compass', 'dist/trajectory', { recursive: true });
      console.log('cf-headers: wrote dist/_headers');
      console.log('cf-mirror: copied dist/compass → dist/trajectory');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflareHeaders()],
  base: BASE,
  build: {
    outDir: 'dist/compass',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
