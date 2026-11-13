'use strict';

// Fails clearly when the interface has not been built: it is produced by
// app/ (npm run build:desktop) into desktop/ui/ and packaged inside the app.

const fs = require('node:fs');
const path = require('node:path');

const index = path.join(__dirname, '..', 'ui', 'index.html');
if (!fs.existsSync(index)) {
  console.error('desktop/ui/index.html est introuvable : construisez d’abord l’interface.');
  console.error('  cd app && npm ci && npm run build:desktop   (ou : npm run build:ui dans desktop/)');
  process.exit(1);
}
console.log(`interface found: ${path.relative(process.cwd(), index)}`);
