/**
 * RaceGuardX — Cross-Course Atomic Service (C5 Challenge)
 * 
 * Implements all-or-nothing registration across multiple courses simultaneously.
 * Uses deterministic lock ordering (sorted course IDs) to prevent deadlocks.
 * 
 * If ANY course in the set is full, CLOSED, or already registered, 
 * the entire multi-course registration rolls back atomically.
 */

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');

/**
 * Atomically register a student for multiple courses, or fail entirely.
 * @param {Object} opts
 * @param {string} opts.userId - authenticated student user ID
 * @param {string[]} opts.courseIds - array of course IDs to register for
 * @param {string} opts.requestId - client-side idempotency key
 */
async function registerAtomicMultiCourse({ userId, courseIds, requestId }) {
  if (!courseIds || courseIds.length < 2) {
    return { error: 'Must specify at least 2 courses for atomic multi-course registration.' };
  }
  if (courseIds.length > 5) {
    return { error: 'Maximum 5 courses per atomic batch.' };
  }

  // Deterministic lock order: sort course IDs to prevent deadlocks
  const sortedCourseIds = [...courseIds].sort();
  const atomicId = requestId || `atomic_${uuidv4()}`;

  const dbClient = await getClient();
  const outcomes = [];

  try {
    await dbClient.query('BEGIN');

    // Lock all courses in deterministic order (prevents deadlock)
    const lockedCourses = [];
    for (const courseId of sortedCourseIds) {
      const res = await dbClient.query(
        `SELECT id, code, name, capacity, enrolled_count, status FROM courses WHERE id = $1 FOR UPDATE`,
        [courseId]
      );
      if (res.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return {
          error: `Course ${courseId} does not exist.`,
          atomicOutcome: 'ABORTED_NOT_FOUND',
          outcomes: [],
        };
      }
      lockedCourses.push(res.rows[0]);
    }

    // Validate all courses before any writes (fail-fast pre-check)
    for (const course of lockedCourses) {
      if (course.status !== 'OPEN') {
        await dbClient.query('ROLLBACK');
        return {
          error: `Course ${course.code} is CLOSED. Atomic batch aborted.`,
          atomicOutcome: 'ABORTED_COURSE_CLOSED',
          failedCourse: course.code,
          outcomes: [],
        };
      }

      const enrolled = parseInt(course.enrolled_count, 10);
      const capacity = parseInt(course.capacity, 10);
      if (enrolled >= capacity) {
        await dbClient.query('ROLLBACK');
        return {
          error: `Course ${course.code} is FULL. Atomic batch aborted.`,
          atomicOutcome: 'ABORTED_COURSE_FULL',
          failedCourse: course.code,
          outcomes: [],
        };
      }

      // Check for duplicate active registration
      const existingReg = await dbClient.query(
        `SELECT id, status FROM registrations WHERE course_id = $1 AND user_id = $2 AND status IN ('REGISTERED', 'WAITLISTED')`,
        [course.id, userId]
      );
      if (existingReg.rows.length > 0) {
        await dbClient.query('ROLLBACK');
        return {
          error: `Already registered for ${course.code}. Atomic batch aborted.`,
          atomicOutcome: 'ABORTED_DUPLICATE',
          failedCourse: course.code,
          outcomes: [],
        };
      }
    }

    // All validations passed — perform all registrations atomically
    for (const course of lockedCourses) {
      const registrationId = uuidv4();
      const enrolled = parseInt(course.enrolled_count, 10);
      const capacity = parseInt(course.capacity, 10);

      await dbClient.query(
        `INSERT INTO registrations (id, course_id, user_id, status, waitlist_position, request_id)
         VALUES ($1, $2, $3, 'REGISTERED', NULL, $4)`,
        [registrationId, course.id, userId, atomicId]
      );

      await dbClient.query(
        `UPDATE courses SET enrolled_count = enrolled_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [course.id]
      );

      await dbClient.query(
        `INSERT INTO audit_logs (id, course_id, user_id, action, details)
         VALUES ($1, $2, $3, 'ATOMIC_SEAT_ALLOCATED', $4)`,
        [uuidv4(), course.id, userId, JSON.stringify({ registrationId, atomicId, courseCode: course.code })]
      );

      outcomes.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        registrationId,
        status: 'REGISTERED',
        seatsAfter: enrolled + 1,
      });
    }

    // Record the atomic request outcome
    await dbClient.query(
      `INSERT INTO registration_requests (id, request_id, user_id, course_id, action, outcome, details)
       VALUES ($1, $2, $3, $4, 'ATOMIC_REGISTER', 'ATOMIC_ALLOCATED', $5)
       ON CONFLICT (request_id) DO NOTHING`,
      [
        uuidv4(),
        atomicId,
        userId,
        sortedCourseIds[0],
        JSON.stringify({ atomicId, courseIds: sortedCourseIds, outcomes }),
      ]
    );

    await dbClient.query('COMMIT');

    return {
      success: true,
      atomicId,
      atomicOutcome: 'ATOMIC_ALLOCATED',
      courseCount: outcomes.length,
      lockOrder: sortedCourseIds,
      outcomes,
      message: `All ${outcomes.length} courses registered atomically. No partial allocations possible.`,
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[AtomicMultiCourse] Transaction failed:', err.message);
    return {
      error: `Atomic transaction failed: ${err.message}`,
      atomicOutcome: 'FAILED_ERROR',
      outcomes: [],
    };
  } finally {
    dbClient.release();
  }
}

/**
 * Simulate deadlock risk: without ordering, two clients could request A+B and B+A
 * This demonstrates the ordering solution used above.
 */
function explainDeadlockPrevention(courseIds) {
  const unordered = [...courseIds];
  const ordered = [...courseIds].sort();
  return {
    unorderedLockSequence: unordered,
    orderedLockSequence: ordered,
    explanation: `Without deterministic ordering, Thread 1 locking [${unordered.join(', ')}] and Thread 2 locking [${[...unordered].reverse().join(', ')}] would create a circular wait deadlock. By always locking in sorted order, both threads compete for the same first lock, eliminating the cycle.`,
    principle: 'Total Lock Ordering — Coffman Deadlock Condition #4 Prevention',
  };
}

module.exports = { registerAtomicMultiCourse, explainDeadlockPrevention };
