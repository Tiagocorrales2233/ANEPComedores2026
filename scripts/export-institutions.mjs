import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, 'edumap.db');
const publicDir = path.join(rootDir, 'public');
const outputPath = path.join(publicDir, 'institutions.json');

const db = new Database(dbPath, { readonly: true });

try {
  const rows = db
    .prepare('SELECT * FROM institutions ORDER BY id')
    .all()
    .map((row) => ({
      ...row,
      images: JSON.parse(row.images || '[]'),
      hasDiningRoom: Boolean(row.hasDiningRoom)
    }));

  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

  console.log(`Exported ${rows.length} institutions to ${outputPath}`);
} finally {
  db.close();
}
