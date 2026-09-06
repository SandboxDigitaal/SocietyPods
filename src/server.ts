import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

const db = createDatabase(config.databasePath);
const app = createApp(db);
const server = app.listen(config.port, () => console.log(`Society Pods running at http://localhost:${config.port}`));

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
