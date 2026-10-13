/**
 * RaceGuardX — C1 Mass Request Generator Service with Bounded Queue & Real Courses
 * 
 * Objective:
 * Supports admin-configured total requests (e.g. 500, or any number N)
 * distributed evenly across 2 selected courses (e.g. 250 each).
 * Odd numbers give the extra request to course 1 deterministically.
 * Bounded queue & worker limits from project design (4 workers, 16 queue slots).
 */

const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

/**
 * Run C1 Mass Request Generation across 2 courses
 * 
 * @param {Object} opts
 * @param {string[]} opts.courseIds - Array of 2 course IDs selected by admin
 * @param {number} opts.totalRequests - Total requests to generate (e.g. 500)
 * @param {number} [opts.maxWorkers=4] - Max concurrent worker slots
 * @param {number} [opts.maxQueue=16] - Max bounded queue size
 */
async function runC1MassDistribution({
  courseIds,
  totalRequests = 500,
  maxWorkers = 4,
  maxQueue = 16,
}) {
  if (!courseIds || courseIds.length !== 2) {
    return { error: 'C1 requires exactly 2 courses selected for even 50/50 distribution.' };
  }

  const startTime = Date.now();
  const c1Id = courseIds[0];
  const c2Id = courseIds[1];

  // 1. Fetch courses to verify existence and starting capacity
  const cRes = await query(
    `SELECT id, code, name, capacity, enrolled_count, status 
     FROM courses 
     WHERE id = $1::varchar OR id = $2::varchar`,
    [String(c1Id), String(c2Id)]
  );

  if (cRes.rows.length < 2) {
    return { error: 'Both selected courses must exist in the database.' };
  }

  const course1 = cRes.rows.find(c => c.id === c1Id);
  const course2 = cRes.rows.find(c => c.id === c2Id);

  // 2. Distribute requests evenly
  // For totalRequests = 500: c1Count = 250, c2Count = 250
  // For odd totals: course 1 receives the single extra request deterministically
  const c1Count = Math.ceil(totalRequests / 2);
  const c2Count = Math.floor(totalRequests / 2);

  const requests = [];
  const runBatchId = `c1_batch_${Date.now()}`;

  // Generate requests for Course 1
  for (let i = 0; i < c1Count; i++) {
    requests.push({
      requestId: `${runBatchId}_c1_${i + 1}`,
      studentId: `SYNTH_STU_${1000 + i}`,
      studentName: `Synthetic Student ${1000 + i}`,
      courseId: c1Id,
      courseCode: course1.code,
    });
  }

  // Generate requests for Course 2
  for (let i = 0; i < c2Count; i++) {
    requests.push({
      requestId: `${runBatchId}_c2_${i + 1}`,
      studentId: `SYNTH_STU_${2000 + i}`,
      studentName: `Synthetic Student ${2000 + i}`,
      courseId: c2Id,
      courseCode: course2.code,
    });
  }

  // 3. Process through Bounded Worker Pool (4 workers, 16 queue slots)
  // Total ingress capacity = maxWorkers + maxQueue (4 + 16 = 20)
  // Any excess requests arriving concurrently are explicitly REJECTED with QUEUE_OVERFLOW
  const ingressCapacity = maxWorkers + maxQueue;
  const acceptedRequests = requests.slice(0, ingressCapacity);
  const rejectedOverflowRequests = requests.slice(ingressCapacity);

  let processedCount = 0;
  let allocatedCount = 0;
  let rejectedFullCount = 0;
  let errorCount = 0;

  const results = [];

  // Log rejected overflow requests
  for (const r of rejectedOverflowRequests) {
    results.push({
      requestId: r.requestId,
      studentId: r.studentId,
      courseCode: r.courseCode,
      outcome: 'REJECTED_QUEUE_OVERFLOW',
      reason: `Bounded ingress capacity reached (${maxWorkers} workers + ${maxQueue} queue slots). Backpressure rejection.`,
    });
  }

  // Process accepted requests with DB row locks (worker pool concurrency simulation)
  // Split into worker-pool chunks of maxWorkers
  for (let i = 0; i < acceptedRequests.length; i += maxWorkers) {
    const chunk = acceptedRequests.slice(i, i + maxWorkers);
    
    const chunkPromises = chunk.map(async (req) => {
      const dbClient = await getClient();
      try {
        await dbClient.query('BEGIN');

        // Course row-level lock
        const lockRes = await dbClient.query(
          `SELECT id, code, capacity, enrolled_count, status 
           FROM courses 
           WHERE id = $1 
           FOR UPDATE`,
          [req.courseId]
        );

        if (lockRes.rows.length === 0) {
          await dbClient.query('ROLLBACK');
          return { ...req, outcome: 'ERROR_NOT_FOUND' };
        }

        const course = lockRes.rows[0];
        const capacity = parseInt(course.capacity, 10);
        const enrolled = parseInt(course.enrolled_count, 10);

        if (enrolled < capacity) {
          // Allocate seat
          const regId = uuidv4();
          
          // Check if synthetic user exists, create if not
          const userRes = await dbClient.query('SELECT id FROM users WHERE student_id = $1', [req.studentId]);
          let userId;
          if (userRes.rows.length > 0) {
            userId = userRes.rows[0].id;
          } else {
            userId = uuidv4();
            await dbClient.query(
              `INSERT INTO users (id, student_id, name, email, password_hash, role)
               VALUES ($1, $2, $3, $4, 'synth_hash', 'STUDENT')
               ON CONFLICT (student_id) DO NOTHING`,
              [userId, req.studentId, req.studentName, `${req.studentId.toLowerCase()}@synth.edu`]
            );
          }

          await dbClient.query(
            `INSERT INTO registrations (id, course_id, user_id, status, waitlist_position, request_id)
             VALUES ($1, $2, $3, 'REGISTERED', NULL, $4)`,
            [regId, req.courseId, userId, req.requestId]
          );

          await dbClient.query(
            `UPDATE courses SET enrolled_count = enrolled_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [req.courseId]
          );

          await dbClient.query(
            `INSERT INTO registration_requests (id, request_id, user_id, course_id, action, outcome, details)
             VALUES ($1, $2, $3, $4, 'REGISTER', 'ALLOCATED', $5)
             ON CONFLICT (request_id) DO NOTHING`,
            [uuidv4(), req.requestId, userId, req.courseId, JSON.stringify({ synthetic: true, seat: enrolled + 1 })]
          );

          await dbClient.query('COMMIT');
          allocatedCount++;
          return {
            requestId: req.requestId,
            studentId: req.studentId,
            courseCode: req.courseCode,
            outcome: 'ALLOCATED',
          };
        } else {
          // Full
          await dbClient.query('COMMIT');
          rejectedFullCount++;
          return {
            requestId: req.requestId,
            studentId: req.studentId,
            courseCode: req.courseCode,
            outcome: 'REJECTED_COURSE_FULL',
          };
        }
      } catch (err) {
        await dbClient.query('ROLLBACK');
        errorCount++;
        return {
          requestId: req.requestId,
          studentId: req.studentId,
          courseCode: req.courseCode,
          outcome: 'ERROR',
          error: err.message,
        };
      } finally {
        dbClient.release();
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    processedCount += chunk.length;
  }

  // 4. Fetch final course states
  const finalCRes = await query(
    `SELECT id, code, name, capacity, enrolled_count 
     FROM courses 
     WHERE id = $1::varchar OR id = $2::varchar`,
    [String(c1Id), String(c2Id)]
  );

  const finalCourse1 = finalCRes.rows.find(c => c.id === c1Id);
  const finalCourse2 = finalCRes.rows.find(c => c.id === c2Id);

  const course1Allocated = results.filter(r => r.courseCode === course1.code && r.outcome === 'ALLOCATED').length;
  const course2Allocated = results.filter(r => r.courseCode === course2.code && r.outcome === 'ALLOCATED').length;

  const durationMs = Date.now() - startTime;

  return {
    success: true,
    challenge: 'C1 — Mass Request Generation & Bounded Concurrent Processing',
    batchId: runBatchId,
    totalRequests,
    distribution: {
      course1: {
        id: course1.id,
        code: course1.code,
        assignedRequests: c1Count,
        allocatedSeats: course1Allocated,
        finalEnrolled: parseInt(finalCourse1.enrolled_count, 10),
        capacity: parseInt(finalCourse1.capacity, 10),
        overbooked: parseInt(finalCourse1.enrolled_count, 10) > parseInt(finalCourse1.capacity, 10),
      },
      course2: {
        id: course2.id,
        code: course2.code,
        assignedRequests: c2Count,
        allocatedSeats: course2Allocated,
        finalEnrolled: parseInt(finalCourse2.enrolled_count, 10),
        capacity: parseInt(finalCourse2.capacity, 10),
        overbooked: parseInt(finalCourse2.enrolled_count, 10) > parseInt(finalCourse2.capacity, 10),
      },
    },
    boundedIngress: {
      maxWorkers,
      maxQueue,
      totalCapacity: ingressCapacity,
      acceptedIntoIngress: acceptedRequests.length,
      rejectedBackpressureOverflow: rejectedOverflowRequests.length,
    },
    outcomes: {
      totalSubmitted: totalRequests,
      allocated: allocatedCount,
      rejectedFull: rejectedFullCount,
      rejectedOverflow: rejectedOverflowRequests.length,
      errors: errorCount,
    },
    durationMs,
    sampleResults: results.slice(0, 30),
  };
}

module.exports = {
  runC1MassDistribution,
};
