/**
 * RaceGuardX — Mass Request Generator Service (C1 Challenge)
 * 
 * C1: Concurrent Seat Invariant
 * Sends N concurrent requests competing for seats across multiple courses.
 * Verifies: enrolled_count never exceeds capacity for any course.
 * 
 * This runs on simulation tables only — no real student data affected.
 */

const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create N simulation courses for mass testing
 */
async function setupMassCourses({ courseCount = 2, capacityPerCourse = 30 }) {
  const courseIds = [];
  const code = `MASS_${Date.now()}`;

  for (let i = 0; i < courseCount; i++) {
    const courseId = uuidv4();
    await query('DELETE FROM simulation_registrations WHERE simulation_course_id IN (SELECT id FROM simulation_courses WHERE code LIKE $1)', [`MASS_%`]);
    await query('DELETE FROM simulation_courses WHERE code LIKE $1', [`MASS_%`]);
    break; // Clean once
  }

  for (let i = 0; i < courseCount; i++) {
    const courseId = uuidv4();
    const courseCode = `${code}_C${i + 1}`;
    await query(
      `INSERT INTO simulation_courses (id, code, name, capacity, enrolled_count) VALUES ($1, $2, $3, $4, 0)`,
      [courseId, courseCode, `Mass Sim Course ${i + 1}`, capacityPerCourse]
    );
    courseIds.push({ courseId, courseCode, capacity: capacityPerCourse });
  }

  return courseIds;
}

/**
 * C1: Run 500 concurrent requests across 2 courses with independent fine-grained locking
 * Verifies the seat invariant: enrolled_count <= capacity for ALL courses
 */
async function runC1ConcurrentSeatInvariant({
  totalRequests = 500,
  courseCount = 2,
  capacityPerCourse = 30,
  mode = 'FINE_GRAINED', // FINE_GRAINED | UNSAFE | GLOBAL_LOCK
}) {
  const courses = await setupMassCourses({ courseCount, capacityPerCourse });
  const startTime = Date.now();
  const results = [];
  let workerErrors = 0;

  // Distribute requests evenly across courses
  const workers = Array.from({ length: totalRequests }, (_, i) => {
    const courseIndex = i % courseCount;
    const course = courses[courseIndex];
    const studentId = `MASS_STU_${i}`;

    return async () => {
      if (mode === 'UNSAFE') {
        // Unsafe: no transaction, check-then-act with artificial jitter
        try {
          const readRes = await query(
            'SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1',
            [course.courseId]
          );
          const enrolled = parseInt(readRes.rows[0].enrolled_count, 10);
          const cap = parseInt(readRes.rows[0].capacity, 10);

          await sleep(5 + Math.floor(Math.random() * 10)); // Race window

          if (enrolled < cap) {
            await query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [course.courseId]);
            const regId = uuidv4();
            await query(
              `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status) VALUES ($1, $2, $3, $4, 'C1_UNSAFE', 'ALLOCATED')`,
              [regId, course.courseId, studentId, `Mass-${studentId}`]
            );
            results.push({ studentId, courseCode: course.courseCode, outcome: 'ALLOCATED', mode: 'UNSAFE' });
          } else {
            results.push({ studentId, courseCode: course.courseCode, outcome: 'REJECTED', mode: 'UNSAFE' });
          }
        } catch (err) {
          workerErrors++;
          results.push({ studentId, courseCode: course.courseCode, outcome: 'ERROR' });
        }
      } else {
        // Safe: fine-grained DB row lock
        const dbClient = await getClient();
        try {
          await dbClient.query('BEGIN');
          const lockRes = await dbClient.query(
            'SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1 FOR UPDATE',
            [course.courseId]
          );
          const enrolled = parseInt(lockRes.rows[0].enrolled_count, 10);
          const cap = parseInt(lockRes.rows[0].capacity, 10);

          if (enrolled < cap) {
            await dbClient.query('UPDATE simulation_courses SET enrolled_count = enrolled_count + 1 WHERE id = $1', [course.courseId]);
            const regId = uuidv4();
            await dbClient.query(
              `INSERT INTO simulation_registrations (id, simulation_course_id, simulated_user_id, simulated_user_name, mode, status) VALUES ($1, $2, $3, $4, 'C1_SAFE', 'ALLOCATED')`,
              [regId, course.courseId, studentId, `Mass-${studentId}`]
            );
            await dbClient.query('COMMIT');
            results.push({ studentId, courseCode: course.courseCode, outcome: 'ALLOCATED', mode: 'FINE_GRAINED' });
          } else {
            await dbClient.query('COMMIT');
            results.push({ studentId, courseCode: course.courseCode, outcome: 'REJECTED_FULL', mode: 'FINE_GRAINED' });
          }
        } catch (err) {
          await dbClient.query('ROLLBACK');
          workerErrors++;
          results.push({ studentId, courseCode: course.courseCode, outcome: 'ERROR' });
        } finally {
          dbClient.release();
        }
      }
    };
  });

  // Launch all workers truly concurrently
  await Promise.all(workers.map(w => w()));

  // Verify seat invariant for all courses
  const invariantChecks = [];
  let invariantViolated = false;

  for (const course of courses) {
    const finalRes = await query('SELECT enrolled_count, capacity FROM simulation_courses WHERE id = $1', [course.courseId]);
    const finalEnrolled = parseInt(finalRes.rows[0].enrolled_count, 10);
    const cap = parseInt(finalRes.rows[0].capacity, 10);
    const allocated = results.filter(r => r.courseCode === course.courseCode && r.outcome === 'ALLOCATED').length;
    const violated = finalEnrolled > cap;
    if (violated) invariantViolated = true;

    invariantChecks.push({
      courseCode: course.courseCode,
      capacity: cap,
      finalEnrolled,
      allocatedByWorkers: allocated,
      overbooked: violated,
      status: violated ? `INVARIANT VIOLATED: ${finalEnrolled} > ${cap}` : `OK: ${finalEnrolled} <= ${cap}`,
    });
  }

  const totalAllocated = results.filter(r => r.outcome === 'ALLOCATED').length;
  const totalRejected = results.filter(r => r.outcome.startsWith('REJECTED')).length;

  return {
    challenge: 'C1 — Concurrent Seat Invariant',
    mode,
    totalRequests,
    courseCount,
    capacityPerCourse,
    durationMs: Date.now() - startTime,
    totalAllocated,
    totalRejected,
    workerErrors,
    invariantViolated,
    invariantChecks,
    verdict: invariantViolated
      ? `FAIL: Seat invariant violated! Overbooking detected in ${mode} mode.`
      : `PASS: Seat invariant maintained across all ${courseCount} courses. Zero overbooking.`,
    explanation: mode === 'UNSAFE'
      ? 'UNSAFE mode: No synchronization. Check-then-act race conditions may produce overbooking (enrolled_count > capacity).'
      : 'FINE_GRAINED mode: Each course row locked independently (SELECT ... FOR UPDATE). Concurrent requests for different courses proceed in parallel; same-course requests serialize via DB lock.',
    sampleResults: results.slice(0, 50),
  };
}

module.exports = { runC1ConcurrentSeatInvariant };
