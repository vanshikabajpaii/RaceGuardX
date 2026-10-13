const { query } = require('../config/database');

async function verifyTables() {
  try {
    const res = await query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name;`
    );
    console.log('[DB-Verify] Tables found in public schema:');
    res.rows.forEach(r => console.log('  -', r.table_name));

    const indexes = await query(
      `SELECT indexname, tablename 
       FROM pg_indexes 
       WHERE schemaname = 'public' 
       ORDER BY tablename, indexname;`
    );
    console.log('[DB-Verify] Custom Indexes found:');
    indexes.rows
      .filter(i => i.indexname.startsWith('idx_'))
      .forEach(i => console.log(`  - ${i.indexname} on ${i.tablename}`));

    process.exit(0);
  } catch (err) {
    console.error('[DB-Verify] Verification failed:', err.message);
    process.exit(1);
  }
}

verifyTables();
