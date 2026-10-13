const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // Fallback to current directory .env

let pool = null;
let pgliteInstance = null;
let activeEngine = 'unknown';

const SNAPSHOT_FILE = path.resolve(__dirname, '../../data/snapshot.json');
const TABLES = [
  'users',
  'courses',
  'registrations',
  'registration_requests',
  'audit_logs',
  'simulation_courses',
  'simulation_registrations',
];

async function getPgPool() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    return null;
  }

  const { Pool } = require('pg');
  const testPool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[DB] Connected to PostgreSQL / Supabase successfully.');
    return testPool;
  } catch (err) {
    await testPool.end().catch(() => {});
    throw new Error(
      `DATABASE_URL is configured, but failed to connect to PostgreSQL / Supabase: ${err.message}. ` +
      `Check your database server status, connection string, and credentials.`
    );
  }
}

async function getPgliteInstance() {
  const { PGlite } = require('@electric-sql/pglite');
  console.log('[DB] DATABASE_URL is not configured. Initializing PostgreSQL (PGlite WASM engine) for local development.');
  const db = new PGlite();
  return db;
}

async function saveSnapshot() {
  if (!pgliteInstance) return;
  try {
    const snapshotData = {};
    for (const table of TABLES) {
      try {
        const res = await pgliteInstance.query(`SELECT * FROM ${table}`);
        snapshotData[table] = res.rows || [];
      } catch (e) {
        snapshotData[table] = [];
      }
    }

    const dataDir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshotData, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Could not save snapshot:', err.message);
  }
}

async function restoreSnapshot() {
  if (!pgliteInstance || !fs.existsSync(SNAPSHOT_FILE)) return;
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    const snapshotData = JSON.parse(raw);

    for (const table of TABLES) {
      const rows = snapshotData[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        const columns = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => row[k]);

        // Insert with ON CONFLICT DO NOTHING to preserve consistency
        try {
          await pgliteInstance.query(
            `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
        } catch (insertErr) {
          // If conflict clause is not applicable or row already exists
        }
      }
    }
    console.log('[DB] Restored snapshot successfully from local data store.');
  } catch (err) {
    console.warn('[DB] Failed to restore snapshot:', err.message);
  }
}

async function runMigrations() {
  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(schemaSql);
      await client.query('COMMIT');
      console.log('[DB] Migrations applied successfully to PostgreSQL.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DB] Migration error on PostgreSQL:', err);
      throw err;
    } finally {
      client.release();
    }
  } else if (pgliteInstance) {
    try {
      await pgliteInstance.exec(schemaSql);
      console.log('[DB] Migrations applied successfully to PGlite (PostgreSQL WASM).');
      await restoreSnapshot();
    } catch (err) {
      console.error('[DB] Migration error on PGlite:', err);
      throw err;
    }
  }
}

async function initDatabase() {
  if (pool || pgliteInstance) {
    return;
  }

  pool = await getPgPool();
  if (pool) {
    activeEngine = 'PostgreSQL';
  } else {
    pgliteInstance = await getPgliteInstance();
    activeEngine = 'PGlite (PostgreSQL WASM)';
  }

  console.log(`[DB] Active database engine: ${activeEngine}`);
  await runMigrations();
}

async function query(text, params = []) {
  if (!pool && !pgliteInstance) {
    await initDatabase();
  }

  let res;
  if (pool) {
    res = await pool.query(text, params);
  } else {
    res = await pgliteInstance.query(text, params);
    const upper = text.trim().toUpperCase();
    if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
      saveSnapshot().catch(() => {});
    }
  }
  return res;
}

class PGliteConnectionMutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }
  acquire() {
    return new Promise(resolve => {
      if (!this._locked) {
        this._locked = true;
        resolve(this._release.bind(this));
      } else {
        this._queue.push(resolve);
      }
    });
  }
  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next(this._release.bind(this));
    } else {
      this._locked = false;
    }
  }
}
const pgliteConnMutex = new PGliteConnectionMutex();

async function getClient() {
  if (!pool && !pgliteInstance) {
    await initDatabase();
  }

  if (pool) {
    const client = await pool.connect();
    return {
      query: (text, params) => client.query(text, params),
      release: () => client.release(),
    };
  } else {
    const releaseLock = await pgliteConnMutex.acquire();
    let inTransaction = false;
    return {
      query: async (text, params) => {
        const trimmed = text.trim().toUpperCase();
        if (trimmed === 'BEGIN') {
          inTransaction = true;
          return await pgliteInstance.query('BEGIN');
        } else if (trimmed === 'COMMIT') {
          inTransaction = false;
          const r = await pgliteInstance.query('COMMIT');
          saveSnapshot().catch(() => {});
          return r;
        } else if (trimmed === 'ROLLBACK') {
          inTransaction = false;
          return await pgliteInstance.query('ROLLBACK');
        }
        return await pgliteInstance.query(text, params);
      },
      release: () => {
        if (inTransaction) {
          pgliteInstance.query('ROLLBACK').catch(() => {});
          inTransaction = false;
        }
        releaseLock();
      },
    };
  }
}

process.on('SIGINT', async () => {
  if (pgliteInstance) {
    await saveSnapshot();
  }
  process.exit(0);
});

module.exports = {
  initDatabase,
  query,
  getClient,
  getActiveEngine: () => activeEngine,
  saveSnapshot,
};
