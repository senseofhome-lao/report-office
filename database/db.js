const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    pool.on('error', (err) => console.error('PG pool error:', err.message));
  }
  return pool;
}

// Convert SQLite ? params → Postgres $1, $2, ...
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  const result = await getPool().query(toPostgres(sql), params);
  return result.rows;
}

async function run(sql, params = []) {
  const pgSql = toPostgres(sql).trim();
  const isInsert = pgSql.toUpperCase().startsWith('INSERT');
  const finalSql = isInsert ? pgSql + ' RETURNING id' : pgSql;
  const result = await getPool().query(finalSql, params);
  return { lastInsertRowid: isInsert && result.rows[0] ? Number(result.rows[0].id) : 0 };
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function initDB() {
  const db = getPool();

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    branch TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movement_date_start TEXT NOT NULL,
    movement_date_end TEXT NOT NULL,
    period INTEGER NOT NULL CHECK(period IN (1,2,3)),
    province TEXT NOT NULL,
    purpose TEXT DEFAULT '',
    lesson_good TEXT DEFAULT '',
    lesson_challenge TEXT DEFAULT '',
    lesson_solution TEXT DEFAULT '',
    location_score REAL DEFAULT 0,
    service_score REAL DEFAULT 0,
    staff_score REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS pending_items (
    id SERIAL PRIMARY KEY,
    movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    completed_at TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS report_files (
    id SERIAL PRIMARY KEY,
    movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    public_id TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
  )`);

  // Seed default users if none exist
  const existing = await getOne('SELECT id FROM users LIMIT 1');
  if (!existing) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    const userPass = bcrypt.hashSync('user123', 10);
    await run(`INSERT INTO users (username, password, full_name, role, branch) VALUES (?, ?, ?, ?, ?)`,
      ['admin', adminPass, 'ຜູ້ບໍລິຫານລະບົບ', 'admin', 'ສຳນັກງານໃຫຍ່']);
    await run(`INSERT INTO users (username, password, full_name, role, branch) VALUES (?, ?, ?, ?, ?)`,
      ['user1', userPass, 'ພະນັກງານທົດສອບ', 'user', 'ສາຂາວຽງຈັນ']);
    console.log('Seeded default users');
  }
}

module.exports = { initDB, query, run, getOne };
