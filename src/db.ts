import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SEED_PARENT_ID } from './config.js';

export type Db = Database.Database;

export function createDatabase(filename: string): Db {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8'));
  seedDatabase(db);
  return db;
}

export function seedDatabase(db: Db): void {
  const societies = [
    ['society-prestige-shantiniketan', 'Prestige Shantiniketan', 'Bengaluru', 'Whitefield'],
    ['society-sobha-elan', 'Sobha Elan', 'Coimbatore', 'Singanallur'],
    ['society-dlf-phase-5', 'DLF Phase 5', 'Gurgaon', 'DLF City']
  ];
  const addSociety = db.prepare('INSERT OR IGNORE INTO societies (id, name, city, locality) VALUES (?, ?, ?, ?)');
  societies.forEach((society) => addSociety.run(...society));

  db.prepare('INSERT OR IGNORE INTO users (id, phone_number, active_society_id) VALUES (?, ?, ?)')
    .run('user-seed-parent-001', '9000000000', 'society-prestige-shantiniketan');
  db.prepare(`INSERT OR IGNORE INTO society_residents
    (id, user_id, society_id, flat_no, is_verified, verification_method, verification_status)
    VALUES (?, ?, ?, ?, 1, 'invite_code', 'verified_seed_parent')`)
    .run(SEED_PARENT_ID, 'user-seed-parent-001', 'society-prestige-shantiniketan', '404');

  const pods = [
    ['pod-greenwood-morning', 'society-prestige-shantiniketan', 'Greenwood High Morning Pod', 'Greenwood High', '07:30 AM', 4],
    ['pod-dps-sports', 'society-prestige-shantiniketan', 'DPS East Sports Routine', 'Delhi Public School', '03:40 PM', 4],
    ['pod-sobha-school-run', 'society-sobha-elan', 'Elan School Run', 'SSVM World School', '07:45 AM', 3],
    ['pod-dlf-morning', 'society-dlf-phase-5', 'Phase 5 Morning Pod', 'The Shri Ram School', '07:20 AM', 4]
  ];
  const addPod = db.prepare('INSERT OR IGNORE INTO pods (id, society_id, name, school_name, departure_time, max_capacity) VALUES (?, ?, ?, ?, ?, ?)');
  pods.forEach((pod) => addPod.run(...pod));
}

export const newId = (): string => randomUUID();
