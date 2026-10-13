const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, query, saveSnapshot } = require('../config/database');

async function seed() {
  console.log('[Seed] Initializing database connection for seeding...');
  await initDatabase();

  const studentDefaultPassword = process.env.SEED_STUDENT_PASSWORD || 'Student@Pass123';
  const adminDefaultPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@SecurePass123';

  const accountsToSeed = [
    {
      student_id: '620',
      name: 'VANSHIKA',
      email: 'vanshika620@raceguardx.edu',
      role: 'STUDENT',
      defaultPassword: studentDefaultPassword,
    },
    {
      student_id: '622',
      name: 'KHYATI',
      email: 'khyati622@raceguardx.edu',
      role: 'STUDENT',
      defaultPassword: studentDefaultPassword,
    },
    {
      student_id: '649',
      name: 'PALLAVI',
      email: 'pallavi649@raceguardx.edu',
      role: 'STUDENT',
      defaultPassword: studentDefaultPassword,
    },
    {
      student_id: null,
      name: 'System Administrator',
      email: 'admin@raceguardx.edu',
      role: 'ADMIN',
      defaultPassword: adminDefaultPassword,
    },
  ];

  console.log('[Seed] Checking existing user accounts...');

  for (const account of accountsToSeed) {
    // Check if account already exists by student_id or email
    const existing = await query(
      `SELECT id, name, student_id, email, role FROM users 
       WHERE (student_id = $1 AND student_id IS NOT NULL) OR email = $2`,
      [account.student_id, account.email]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      console.log(
        `[Seed] User ${user.name} (Student ID: ${user.student_id || 'N/A'}, Email: ${user.email}) already exists. Existing credentials preserved.`
      );
    } else {
      const id = uuidv4();
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(account.defaultPassword, salt);

      await query(
        `INSERT INTO users (id, student_id, name, email, password_hash, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, account.student_id, account.name, account.email, passwordHash, account.role]
      );

      console.log(
        `[Seed] Successfully seeded account: ${account.name} (Student ID: ${account.student_id || 'N/A'}, Email: ${account.email}, Role: ${account.role})`
      );
    }
  }

  // Seed sample initial courses if table is empty
  console.log('[Seed] Checking initial sample courses...');
  const initialCourses = [
    {
      code: 'OS401',
      name: 'Distributed Operating Systems & Concurrency',
      instructor: 'Dr. Evelyn Reed',
      description: 'Advanced study of kernel scheduling, mutual exclusion primitives, lock-free queues, and transaction recovery.',
      capacity: 3,
    },
    {
      code: 'CS502',
      name: 'High-Performance Database Systems',
      instructor: 'Prof. Marcus Vance',
      description: 'Deep dive into ACID transactions, multi-version concurrency control (MVCC), two-phase locking, and write-ahead logging.',
      capacity: 5,
    },
    {
      code: 'SEC310',
      name: 'Cybersecurity & Critical Infrastructure Defense',
      instructor: 'Dr. Sarah Lin',
      description: 'Zero-trust architecture, cryptographic protocols, authorization boundaries, and threat mitigation models.',
      capacity: 4,
    },
  ];

  for (const c of initialCourses) {
    const existingCourse = await query('SELECT id, code, name, capacity, enrolled_count FROM courses WHERE code = $1', [c.code]);
    if (existingCourse.rows.length === 0) {
      const courseId = uuidv4();
      await query(
        `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'OPEN')`,
        [courseId, c.code, c.name, c.instructor, c.description, c.capacity]
      );
      console.log(`[Seed] Seeded course: ${c.code} - ${c.name} (Capacity: ${c.capacity})`);
    } else {
      console.log(`[Seed] Course ${c.code} already exists. Preserving current capacity and enrollments.`);
    }
  }

  await saveSnapshot();
  console.log('[Seed] Seeding process completed safely.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Seeding failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seed };
