import { buildApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { migrate } from './db/migrate.js';
import { seedReviewMode } from './seed/reviewMode.js';

const db = openDatabase(config.DATABASE_PATH);
migrate(db);

// Judge Review Mode must work without any Ring token (spec sec. 19). The seed is
// idempotent, so this is safe on every boot against the persistent EBS volume.
if (seedReviewMode(db, config.DEMO_SESSION_WINDOW_SECONDS, config.CLOCK_SKEW_ALLOWANCE_SECONDS)) {
  console.log('Seeded the recorded Review Mode run.');
}

const app = buildApp({ db });
app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
