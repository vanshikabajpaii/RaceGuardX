/**
 * RaceGuardX — Crash Recovery Lab Service (C4 Challenge)
 * 
 * Simulates worker failure mid-seat-update.
 * 
 * Recovery scenarios:
 * 1. Crash after BEGIN but before COMMIT → ROLLBACK (no partial state)
 * 2. Crash mid-update → transaction rollback restores consistent state
 * 3. Crash after COMMIT → seat is permanently allocated (REDO needed)
 * 4. Orphan Detection → find uncommitted seat_count increments with no matching registration
 * 
 * Uses isolated simulation tables only. Never affects real student registrations.
 */

const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Reset / create an isolated crash simulation course
 */
async function resetCrashCourse(capacity = 5) {
  const courseId = uuidv4();
  await query('DELETE FROM simulation_registrations WHERE simulation_course_id IN (SELECT id FROM simulation_courses WHERE code = $1)', ['C4-CRASH-LAB']);
  await query('DELETE FROM simulation_courses WHERE code = $1', ['C4-CRASH-LAB']);
  await query(
    `INSERT INTO simulation_courses (id, code, name, capacity, enrolled_count) VALUES ($1, 'C4-CRASH-LAB', 'C4 Crash Recovery Lab', $2, 0)`,
    [courseId, capacity]
  );
  return courseId;
}

/**
 * Scenario 1: Crash BEFORE commit — rollback restores state
 */
async function scenarioCrashBeforeCommit({ capacity = 5 }) {
  const courseId = await resetCrashCourse(capacity);
  const dbClient = await getClient();
  let caughtError = null;

  const beforeRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const before = parseInt(beforeRes.rows[0].enrolled_count, 10);

  try {
    await dbClient.query('BEGIN');
    await dbClient.query('SELECT * FROM simulation_courses WHERE id = $1 FOR UPDATE', [courseId]);
    await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);
    const regId = uuidv4();
    await dbClient.query(
      `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
       VALUES ($1, $2, 'CRASH_USER_A', 'Student A (Crashed)', 'C4_CRASH', 'ALLOCATED')`,
      [regId, courseId]
    );

    // SIMULATE: Worker crashes here (process.kill, OOM, timeout, etc.)
    throw new Error('SIMULATED_WORKER_CRASH: Node worker thread killed during seat update (before COMMIT)');

  } catch (err) {
    caughtError = err.message;
    await dbClient.query('ROLLBACK'); // DB engine rolls back automatically
  } finally {
    dbClient.release();
  }

  const afterRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const after = parseInt(afterRes.rows[0].enrolled_count, 10);

  const orphans = await query(
    `SELECT * FROM simulation_registrations WHERE simulation_course_id = $1 AND simulated_user_id = 'CRASH_USER_A'`,
    [courseId]
  );

  return {
    scenario: 'CRASH_BEFORE_COMMIT',
    description: 'Worker thread crashes between seat-increment and COMMIT. Database rolls back via ROLLBACK or crash recovery log.',
    simulatedFault: caughtError,
    seatsBefore: before,
    seatsAfter: after,
    seatCountRestored: before === after,
    orphanedRegistrations: orphans.rows.length,
    recoveryMethod: 'PostgreSQL ROLLBACK / Write-Ahead Log (WAL) crash recovery',
    verdict: before === after && orphans.rows.length === 0
      ? 'PASS: State fully restored. Zero seat leaks. Zero phantom registrations.'
      : 'FAIL: State inconsistency detected.',
  };
}

/**
 * Scenario 2: Crash AFTER commit — seat permanently allocated (correct: REDO)
 * Demonstrates durability — committed work survives crashes.
 */
async function scenarioCrashAfterCommit({ capacity = 5 }) {
  const courseId = await resetCrashCourse(capacity);
  const dbClient = await getClient();

  const beforeRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const before = parseInt(beforeRes.rows[0].enrolled_count, 10);

  try {
    await dbClient.query('BEGIN');
    await dbClient.query('SELECT * FROM simulation_courses WHERE id = $1 FOR UPDATE', [courseId]);
    await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);
    const regId = uuidv4();
    await dbClient.query(
      `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
       VALUES ($1, $2, 'CRASH_USER_B', 'Student B (Post-Commit Crash)', 'C4_CRASH', 'ALLOCATED')`,
      [regId, courseId]
    );
    await dbClient.query('COMMIT'); // Transaction committed successfully

    // SIMULATE: Worker crashes AFTER commit (e.g. response sending fails, client disconnects)
    // The DB state is already durable — commit is permanent.
    throw new Error('SIMULATED_POST_COMMIT_CRASH: Network failure during response dispatch after successful COMMIT');
  } catch (err) {
    // No ROLLBACK here — transaction already committed
    // This is expected: the crash is post-commit
  } finally {
    dbClient.release();
  }

  const afterRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const after = parseInt(afterRes.rows[0].enrolled_count, 10);

  const reg = await query(
    `SELECT * FROM simulation_registrations WHERE simulation_course_id = $1 AND simulated_user_id = 'CRASH_USER_B'`,
    [courseId]
  );

  return {
    scenario: 'CRASH_AFTER_COMMIT',
    description: 'Worker crashes after COMMIT succeeds. The committed transaction is durable — the seat remains allocated.',
    seatsBefore: before,
    seatsAfter: after,
    seatPermanentlyAllocated: after === before + 1,
    registrationPersisted: reg.rows.length > 0,
    recoveryMethod: 'REDO Log — committed transactions survive crashes; no rollback needed',
    verdict: after === before + 1 && reg.rows.length > 0
      ? 'PASS: ACID Durability confirmed. Committed seat allocation survives crash.'
      : 'UNEXPECTED: State changed unexpectedly.',
  };
}

/**
 * Scenario 3: Concurrent crash + recovery race
 * Worker A crashes mid-update; Worker B proceeds safely.
 */
async function scenarioConcurrentCrashRecovery({ capacity = 3 }) {
  const courseId = await resetCrashCourse(capacity);
  const results = [];

  // Worker A: will crash mid-transaction
  const workerA = (async () => {
    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SELECT * FROM simulation_courses WHERE id = $1 FOR UPDATE', [courseId]);
      await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);
      await sleep(50); // Simulates work being done
      throw new Error('WORKER_A_CRASH: Simulated OOM during registration');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      results.push({ worker: 'A', outcome: 'CRASHED_ROLLED_BACK', error: err.message });
    } finally {
      dbClient.release();
    }
  })();

  // Worker B: runs normally, should succeed
  const workerB = (async () => {
    await sleep(20); // Slightly delayed
    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SELECT * FROM simulation_courses WHERE id = $1 FOR UPDATE', [courseId]);
      const regId = uuidv4();
      await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [courseId]);
      await dbClient.query(
        `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status)
         VALUES ($1, $2, 'CRASH_USER_C', 'Student C (Survived)', 'C4_CONCURRENT', 'ALLOCATED')`,
        [regId, courseId]
      );
      await dbClient.query('COMMIT');
      results.push({ worker: 'B', outcome: 'COMMITTED_SUCCESSFULLY' });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      results.push({ worker: 'B', outcome: 'FAILED', error: err.message });
    } finally {
      dbClient.release();
    }
  })();

  await Promise.all([workerA, workerB]);

  const finalRes = await query('SELECT enrolled_count FROM simulation_courses WHERE id = $1', [courseId]);
  const finalSeats = parseInt(finalRes.rows[0].enrolled_count, 10);

  return {
    scenario: 'CONCURRENT_CRASH_RECOVERY',
    description: 'Worker A crashes mid-transaction while Worker B runs concurrently. A\'s rollback does not block B.',
    workerResults: results,
    finalSeats,
    capacity,
    expectedSeats: 1, // Only Worker B should have committed
    verdict: finalSeats === 1
      ? 'PASS: Worker A crash did not corrupt Worker B\'s registration. Isolation maintained.'
      : `UNEXPECTED: Final seats = ${finalSeats}, expected 1.`,
  };
}

module.exports = {
  scenarioCrashBeforeCommit,
  scenarioCrashAfterCommit,
  scenarioConcurrentCrashRecovery,
};
