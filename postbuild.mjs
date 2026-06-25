// Workers Static Assets reads _headers from the assets-directory root (dist/),
// but Vite emits the site into dist/trajectory/. Copy it up after each build.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('_headers', 'dist/_headers');
console.log('postbuild: _headers -> dist/_headers');
