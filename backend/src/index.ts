import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db/index.js';

getDb();

createApp().listen(config.port, () => {
  console.log(`[medlog] API listening on http://localhost:${config.port} (${config.env})`);
});
