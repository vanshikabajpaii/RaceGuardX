/**
 * RaceGuardX — Multi-Course Complete-Need Allocation Service (C5 Challenge)
 * 
 * Objective:
 * A student's requested course needs should be satisfied completely wherever
 * the available course capacity and the defined allocation rules make that possible.
 * 
 * Rules:
 * 1. Considers all pending multi-course requests.
 * 2. Deterministic order (by arrival timestamp / requestId).
 * 3. Complete need preference: A student requesting a bundle of courses is allocated
 *    if ALL requested courses have remaining capacity. If any course is full, the student
 *    is unfulfilled (or partial if policy permits, but preference is complete set).
 * 4. No student is assigned an unrequested course.
 * 5. No course exceeds configured capacity.
 * 6. No student-course pair is enrolled twice.
 * 7. Transactional & deterministic.
 */

const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

/**
 * Execute Complete-Need Multi-Course Batch Allocation
 * 
 * @param {Object} opts
 * @param {string[]} opts.courseIds - Array of course IDs involved (typically 2 courses)
 * @param {Array<{userId: string, requestedCourseIds: string[], requestId: string, studentName?: string, studentId?: string}>} [opts.studentRequests] - Optional in-memory or submitted batch of student requests. If not provided, reads from database.
 */
async function allocateCompleteNeedMultiCourse({ courseIds, studentRequests = [] }) {
  if (!courseIds || courseIds.length < 2) {
    return { error: 'C5 requires at least 2 courses for multi-course allocation.' };
  }

  // Deterministic lock order by course ID
  const sortedCourseIds = [...courseIds].sort();
  const dbClient = await getClient();

  try {
    await dbClient.query('BEGIN');

    // 1. Lock and load selected courses
    const coursesMap = new Map();
    const beforeState = [];

    for (const cId of sortedCourseIds) {
      const res = await dbClient.query(
        `SELECT id, code, name, capacity, enrolled_count, status 
         FROM courses 
         WHERE id = $1 
         FOR UPDATE`,
        [cId]
      );
      if (res.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return { error: `Course ID ${cId} not found in database.` };
      }
      const c = res.rows[0];
      coursesMap.set(c.id, {
        id: c.id,
        code: c.code,
        name: c.name,
        capacity: parseInt(c.capacity, 10),
        enrolledCount: parseInt(c.enrolled_count, 10),
        status: c.status,
      });
      beforeState.push({
        id: c.id,
        code: c.code,
        name: c.name,
        capacity: parseInt(c.capacity, 10),
        enrolledBefore: parseInt(c.enrolled_count, 10),
      });
    }

    // 2. Identify student requests:
    // If studentRequests array is provided, use it. Otherwise, look for students who registered for these courses.
    let requestsToProcess = [];
    if (studentRequests && studentRequests.length > 0) {
      requestsToProcess = studentRequests;
    } else {
      // Query recent requests targeting any of these courses
      const placeholders = sortedCourseIds.map((_, idx) => `$${idx + 1}`).join(', ');
      const recentReqs = await dbClient.query(
        `SELECT r.user_id, r.course_id, u.name as student_name, u.student_id, r.request_id, r.created_at
         FROM registrations r
         JOIN users u ON r.user_id = u.id
         WHERE r.course_id IN (${placeholders})
         ORDER BY r.created_at ASC`,
        sortedCourseIds
      );

      // Group by user_id to find multi-course requested sets
      const studentMap = new Map();
      for (const row of recentReqs.rows) {
        if (!studentMap.has(row.user_id)) {
          studentMap.set(row.user_id, {
            userId: row.user_id,
            studentName: row.student_name,
            studentId: row.student_id,
            requestedCourseIds: [],
            requestId: row.request_id,
          });
        }
        const s = studentMap.get(row.user_id);
        if (!s.requestedCourseIds.includes(row.course_id)) {
          s.requestedCourseIds.push(row.course_id);
        }
      }
      requestsToProcess = Array.from(studentMap.values());
    }

    // 3. Complete-Need Allocation Algorithm (Deterministic)
    // Preference: Students whose entire requested set can be accommodated
    const fulfilledStudents = [];
    const partiallyFulfilledStudents = [];
    const unfulfilledStudents = [];
    const allocationLog = [];

    for (const req of requestsToProcess) {
      const { userId, requestedCourseIds, requestId, studentName, studentId } = req;
      
      // Filter requestedCourseIds to only those in the C5 course set
      const validRequestedCourseIds = requestedCourseIds.filter(id => coursesMap.has(id));
      if (validRequestedCourseIds.length === 0) continue;

      // Check current capacity for all courses in this student's requested set
      let canFullyFulfill = true;
      for (const cId of validRequestedCourseIds) {
        const course = coursesMap.get(cId);
        if (course.enrolledCount >= course.capacity) {
          canFullyFulfill = false;
          break;
        }

        // Check if student is ALREADY registered in DB for this course
        const alreadyReg = await dbClient.query(
          `SELECT id FROM registrations WHERE course_id = $1 AND user_id = $2 AND status = 'REGISTERED'`,
          [cId, userId]
        );
        if (alreadyReg.rows.length > 0) {
          // Already registered, this seat is already consumed by this student
          // No need to re-increment, but verify they don't get double allocated
        }
      }

      if (canFullyFulfill) {
        // Complete-need satisfied!
        const allocatedForStudent = [];
        for (const cId of validRequestedCourseIds) {
          const course = coursesMap.get(cId);
          
          // Check if already registered
          const alreadyReg = await dbClient.query(
            `SELECT id FROM registrations WHERE course_id = $1 AND user_id = $2 AND status = 'REGISTERED'`,
            [cId, userId]
          );

          if (alreadyReg.rows.length === 0) {
            // Allocate seat
            course.enrolledCount++;
            const regId = uuidv4();
            await dbClient.query(
              `INSERT INTO registrations (id, course_id, user_id, status, waitlist_position, request_id)
               VALUES ($1, $2, $3, 'REGISTERED', NULL, $4)
               ON CONFLICT (id) DO NOTHING`,
              [regId, cId, userId, requestId || `c5_${Date.now()}`]
            );

            await dbClient.query(
              `UPDATE courses SET enrolled_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [course.enrolledCount, cId]
            );

            await dbClient.query(
              `INSERT INTO audit_logs (id, course_id, user_id, action, details)
               VALUES ($1, $2, $3, 'C5_COMPLETE_NEED_ALLOCATED', $4)`,
              [uuidv4(), cId, userId, JSON.stringify({ courseCode: course.code, requestId })]
            );
          }

          allocatedForStudent.push(course.code);
        }

        fulfilledStudents.push({
          userId,
          studentName: studentName || userId,
          studentId: studentId || 'N/A',
          requestedCourses: validRequestedCourseIds.map(id => coursesMap.get(id).code),
          allocatedCourses: allocatedForStudent,
          status: 'FULLY_SATISFIED',
        });

        allocationLog.push({
          studentName: studentName || userId,
          outcome: 'COMPLETE_NEED_MET',
          courses: allocatedForStudent.join(' + '),
          reason: 'All requested courses had sufficient available capacity.',
        });
      } else {
        // Complete need cannot be satisfied
        unfulfilledStudents.push({
          userId,
          studentName: studentName || userId,
          studentId: studentId || 'N/A',
          requestedCourses: validRequestedCourseIds.map(id => coursesMap.get(id).code),
          allocatedCourses: [],
          status: 'UNSATISFIED_CAPACITY_EXHAUSTED',
          reason: 'One or more requested courses reached maximum seat capacity.',
        });

        allocationLog.push({
          studentName: studentName || userId,
          outcome: 'UNFULFILLED',
          courses: validRequestedCourseIds.map(id => coursesMap.get(id).code).join(' + '),
          reason: 'Capacity exhausted on one or more courses in requested bundle.',
        });
      }
    }

    await dbClient.query('COMMIT');

    // 4. Calculate after state
    const afterState = [];
    for (const cId of sortedCourseIds) {
      const c = coursesMap.get(cId);
      const before = beforeState.find(b => b.id === cId);
      afterState.push({
        id: c.id,
        code: c.code,
        name: c.name,
        capacity: c.capacity,
        enrolledBefore: before ? before.enrolledBefore : 0,
        enrolledAfter: c.enrolledCount,
        seatsAvailableAfter: Math.max(0, c.capacity - c.enrolledCount),
      });
    }

    return {
      success: true,
      challenge: 'C5 — Multi-Course Complete-Need Allocation',
      courseCount: sortedCourseIds.length,
      totalStudentsRequesting: requestsToProcess.length,
      totalCourseRequests: requestsToProcess.reduce((acc, r) => acc + (r.requestedCourseIds ? r.requestedCourseIds.length : 0), 0),
      fullySatisfiedCount: fulfilledStudents.length,
      partiallySatisfiedCount: partiallyFulfilledStudents.length,
      unfulfilledCount: unfulfilledStudents.length,
      beforeState,
      afterState,
      fulfilledStudents,
      unfulfilledStudents,
      allocationLog,
      explanation: 'Complete-Need Allocation Policy: In multi-course bundles, allocations strictly satisfy the full bundle to prevent split/deadlocked enrollments. Total lock ordering eliminates Coffman Condition #4 deadlocks.',
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[C5 Allocation Error]', err.message);
    return { error: 'C5 Complete-Need allocation failed: ' + err.message };
  } finally {
    dbClient.release();
  }
}

module.exports = {
  allocateCompleteNeedMultiCourse,
};
