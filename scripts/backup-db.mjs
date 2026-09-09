import fs from 'node:fs';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const source = path.resolve(process.env.POOLPOKER_DB_PATH || 'data/poolpoker.sqlite');
const destination = process.argv.slice(2).find((arg) => arg !== '--');
if (!destination) throw new Error('Usage: pnpm backup:db -- /path/to/backup.sqlite');
const target = path.resolve(destination);
if (target === source || fs.existsSync(target))
  throw new Error('Choose a new backup path; existing files are not overwritten');
fs.mkdirSync(path.dirname(target), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  console.log(`Backup saved: ${target}`);
} finally {
  db.close();
}
