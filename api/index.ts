import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { config } from '../src/config.js';

// Vercel serverless entry point. The SQLite database lives in /tmp on Vercel,
// so it is reset whenever an instance is recycled; use a managed database for production.
const database = createDatabase(config.databasePath);
const app = createApp(database);

export default app;
