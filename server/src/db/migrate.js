const { initDatabase } = require('../config/database');

async function migrate() {
  try {
    console.log('[Migrate] Starting schema migration...');
    await initDatabase();
    console.log('[Migrate] Schema migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('[Migrate] Migration failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
