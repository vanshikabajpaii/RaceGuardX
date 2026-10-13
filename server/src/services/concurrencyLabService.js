const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

// In-Memory Global Mutex primitive for demonstration comparison
class AsyncMutex {
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

const globalLabMutex = new AsyncMutex();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resets or creates an isolated simulation course
 */
async function resetSimulationCourse(capacity = 2, code = 'SIM-101') {
  await query('DELETE FROM simulation_registrations WHERE simulation_course_id IN (SELECT id FROM simulation_courses WHERE code = $1)', [code]);
  await query('DELETE FROM simulation_courses WHERE code = $1', [code]);

  const courseId = uuidv4();
  await query(
    `INSERT INTO simulation_courses (id, code, name, capacity, enrolled_count)
     VALUES ($1, $2, 'Operating Systems Concurrency Lab Simulation', $3, 0)`,
    [courseId, code, capacity]
  );

  return { courseId, code, capacity, enrolled_count: 0 };
}

/**
 * Mode 1: Deliberately Unsafe Execution (Race Condition Demonstration)
 * Does NOT use transactions or locks. Reads state, artificially sleeps to simulate network delay,
 * then updates. Demonstrates lost updates and overbooking on simulation tables.
 */
async function runUnsafeSimulation({ concurrency = 8, capacity = 2 }) {
  const { courseId } = await resetSimulationCourse(capacity, 'SIM-UNSAFE');
  const results = [];
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, (_, i) => async () => {
    const studentName = `Sim-Student-${i + 1}`;
    const studentId = `SIM_STU_${100 + i}`;
    const workerStart = Date.now();

    try {
      // 1. Unsynchronized Read (Check)
      const readRes = await query('SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1', [courseId]);
      const currentEnrolled = parseInt(readRes.rows[0].enrolled_count, 10);
      const courseCapacity = parseInt(readRes.rows[0].capacity, 10);

      // 2. Artificial Thread/Network Jitter (creates race condition window)
      await sleep(15 + Math.floor(Math.random() * 20));

      // 3. Unsafe Update (Act)
      if (currentEnrolled < courseCapacity) {
        // Increment and write back without transaction or lock
        await query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);

        const regId = uuidv4();
        await query(
          `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
           VALUES ($1, $2, $3, $4, 'UNSAFE', 'ALLOCATED')`,
          [regId, courseId, studentId, studentName]
        );

        results.push({
          studentName,
          status: 'ALLOCATED',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      } else {
        results.push({
          studentName,
          status: 'REJECTED_FULL',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      }
    } catch (err) {
      results.push({ studentName, status: 'ERROR', error: err.message });
    }
  });

  // Launch all concurrent workers simultaneously
  await Promise.all(workers.map(w => w()));

  const finalRes = await query('SELECT capacity, enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const finalEnrolled = parseInt(finalRes.rows[0].enrolled_count, 10);

  const allocatedCount = results.filter(r => r.status === 'ALLOCATED').length;
  const isOverbooked = finalEnrolled > capacity;

  return {
    mode: 'UNSAFE',
    totalRequests: concurrency,
    capacity,
    finalEnrolled,
    allocatedCount,
    isOverbooked,
    anomaly: isOverbooked
      ? `CRITICAL OVERBOOKING DETECTED: Capacity was ${capacity}, but ${allocatedCount} seats were allocated!`
      : 'No race condition occurred in this run.',
    explanation:
      'Unsafe mode lacks atomic synchronization. Multiple threads simultaneously observed available seats during the check phase before writing back, causing classic lost updates and overbooking.',
    durationMs: Date.now() - startTime,
    results,
  };
}

/**
 * Mode 2: In-Memory Global Mutex Lock
 * Synchronizes requests sequentially through a process-level mutex.
 */
async function runGlobalLockSimulation({ concurrency = 8, capacity = 2 }) {
  const { courseId } = await resetSimulationCourse(capacity, 'SIM-GLOBAL-LOCK');
  const results = [];
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, (_, i) => async () => {
    const studentName = `Sim-Student-${i + 1}`;
    const studentId = `SIM_STU_${200 + i}`;
    const workerStart = Date.now();

    // Acquire global mutex lock
    const release = await globalLabMutex.acquire();

    try {
      // Critical Section
      const readRes = await query('SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1', [courseId]);
      const currentEnrolled = parseInt(readRes.rows[0].enrolled_count, 10);
      const courseCapacity = parseInt(readRes.rows[0].capacity, 10);

      if (currentEnrolled < courseCapacity) {
        await query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);

        const regId = uuidv4();
        await query(
          `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
           VALUES ($1, $2, $3, $4, 'GLOBAL_LOCK', 'ALLOCATED')`,
          [regId, courseId, studentId, studentName]
        );

        results.push({
          studentName,
          status: 'ALLOCATED',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      } else {
        const regId = uuidv4();
        await query(
          `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
           VALUES ($1, $2, $3, $4, 'GLOBAL_LOCK', 'WAITLISTED')`,
          [regId, courseId, studentId, studentName]
        );

        results.push({
          studentName,
          status: 'WAITLISTED',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      }
    } finally {
      // Release mutex lock
      release();
    }
  });

  await Promise.all(workers.map(w => w()));

  const finalRes = await query('SELECT capacity, enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const finalEnrolled = parseInt(finalRes.rows[0].enrolled_count, 10);
  const allocatedCount = results.filter(r => r.status === 'ALLOCATED').length;

  return {
    mode: 'GLOBAL_LOCK',
    totalRequests: concurrency,
    capacity,
    finalEnrolled,
    allocatedCount,
    isOverbooked: false,
    explanation:
      'Global Mutex successfully serializes execution inside this process, preventing race conditions. Architectural Trade-off: In-memory locks only coordinate threads within a single Node.js process and create a bottleneck across unrelated courses. They do not protect database state across multiple server instances.',
    durationMs: Date.now() - startTime,
    results,
  };
}

/**
 * Mode 3: Fine-Grained Database Row Locking (Production Architecture)
 * Uses true PostgreSQL transaction with `SELECT ... FOR UPDATE` on simulation table.
 */
async function runFineGrainedSimulation({ concurrency = 8, capacity = 2 }) {
  const { courseId } = await resetSimulationCourse(capacity, 'SIM-FINE-GRAINED');
  const results = [];
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, (_, i) => async () => {
    const studentName = `Sim-Student-${i + 1}`;
    const studentId = `SIM_STU_${300 + i}`;
    const workerStart = Date.now();

    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');

      // Database-level row lock
      const lockRes = await dbClient.query(
        'SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1 FOR UPDATE',
        [courseId]
      );

      const currentEnrolled = parseInt(lockRes.rows[0].enrolled_count, 10);
      const courseCapacity = parseInt(lockRes.rows[0].capacity, 10);

      if (currentEnrolled < courseCapacity) {
        await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);

        const regId = uuidv4();
        await dbClient.query(
          `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
           VALUES ($1, $2, $3, $4, 'FINE_GRAINED', 'ALLOCATED')`,
          [regId, courseId, studentId, studentName]
        );

        await dbClient.query('COMMIT');

        results.push({
          studentName,
          status: 'ALLOCATED',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      } else {
        const regId = uuidv4();
        await dbClient.query(
          `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
           VALUES ($1, $2, $3, $4, 'FINE_GRAINED', 'WAITLISTED')`,
          [regId, courseId, studentId, studentName]
        );

        await dbClient.query('COMMIT');

        results.push({
          studentName,
          status: 'WAITLISTED',
          readEnrolledAtCheck: currentEnrolled,
          latencyMs: Date.now() - workerStart,
        });
      }
    } catch (err) {
      await dbClient.query('ROLLBACK');
      results.push({ studentName, status: 'ERROR', error: err.message });
    } finally {
      dbClient.release();
    }
  });

  await Promise.all(workers.map(w => w()));

  const finalRes = await query('SELECT capacity, enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const finalEnrolled = parseInt(finalRes.rows[0].enrolled_count, 10);
  const allocatedCount = results.filter(r => r.status === 'ALLOCATED').length;

  return {
    mode: 'FINE_GRAINED_DB_LOCK',
    totalRequests: concurrency,
    capacity,
    finalEnrolled,
    allocatedCount,
    isOverbooked: false,
    explanation:
      "Database Row-Level Locking ('SELECT ... FOR UPDATE') enforces strict serializability at the database engine level. It protects shared database state across all application instances without process-level bottlenecks, ensuring zero overbooking.",
    durationMs: Date.now() - startTime,
    results,
  };
}

/**
 * Mode 4: Controlled Failure Injection with Transaction Rollback
 * Restricts fault injection to simulation mode.
 */
async function runFailureRollbackSimulation() {
  const { courseId } = await resetSimulationCourse(3, 'SIM-FAIL-ROLLBACK');

  // Initial state: 1 student pre-registered
  await query('UPDATE simulation_courses SET enrolled_count = 1 WHERE id = $1', [courseId]);
  await query(
    `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
     VALUES ($1, $2, 'PRE_EXISTING', 'Alice Valid', 'SIMULATION', 'ALLOCATED')`,
    [uuidv4(), courseId]
  );

  const beforeRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const beforeEnrolled = parseInt(beforeRes.rows[0].enrolled_count, 10);

  const dbClient = await getClient();
  let caughtError = null;

  try {
    await dbClient.query('BEGIN');

    // Step 1: Lock course row
    await dbClient.query('SELECT * FROM simulation_courses WHERE id = $1 FOR UPDATE', [courseId]);

    // Step 2: Increment enrolled count
    await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);

    // Step 3: Insert registration row
    const testRegId = uuidv4();
    await dbClient.query(
      `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
       VALUES ($1, $2, 'SIM_FAULT_USER', 'Bob Faulty', 'SIMULATION', 'ALLOCATED')`,
      [testRegId, courseId]
    );

    // Step 4: Controlled Fault Injection (Simulated credit/payment failure or DB exception)
    throw new Error('SIMULATED_TRANSACTION_FAILURE: Injected student prerequisite verification exception.');

    // Step 5: (Unreachable due to injected fault)
    await dbClient.query('COMMIT');
  } catch (err) {
    caughtError = err.message;
    await dbClient.query('ROLLBACK');
  } finally {
    dbClient.release();
  }

  // Verify post-rollback state
  const afterRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const afterEnrolled = parseInt(afterRes.rows[0].enrolled_count, 10);

  const faultyUserRows = await query(
    "SELECT * FROM simulation_registrations WHERE simulation_course_id = $1 AND simulated_user_id = 'SIM_FAULT_USER'",
    [courseId]
  );

  const isRollbackSuccessful = beforeEnrolled === afterEnrolled && faultyUserRows.rows.length === 0;

  return {
    mode: 'FAILURE_ROLLBACK_INJECTION',
    injectedFault: caughtError,
    beforeEnrolled,
    afterEnrolled,
    orphanedRowsCount: faultyUserRows.rows.length,
    isRollbackSuccessful,
    explanation:
      'Transactional Atomicity: The injected exception triggered an immediate ROLLBACK. PostgreSQL reversed all modifications, leaving seat counts, registrations, and locks completely consistent.',
  };
}

module.exports = {
  runUnsafeSimulation,
  runGlobalLockSimulation,
  runFineGrainedSimulation,
  runFailureRollbackSimulation,
};
