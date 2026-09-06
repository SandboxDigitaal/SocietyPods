import { createDatabase } from './db.js';
import { config } from './config.js';

const db = createDatabase(config.databasePath);
db.close();
console.log(`Database seeded at ${config.databasePath}`);
