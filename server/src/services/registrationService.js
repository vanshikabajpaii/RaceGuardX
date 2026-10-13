const { v4: uuidv4 } = require('uuid');
const { getClient, query } = require('../config/database');

/**
 * Execute atomic, safe course registration with DB row locking and idempotency
 */
async function registerStudentForCourse({ userId, courseId, clientRequestId }) {
  const startTime = Date.now();
  const requestId = clientRequestId || uuidv4();

  // 1. Idempotency Check: Bind request ID to user and course
  const existingReq = await query(
    `SELECT id, request_id, outcome, details, created_at 
     FROM registration_requests 
     WHERE request_id = $1 AND user_id = $2`,
    [requestId, userId]
  );

  if (existingReq.rows.length > 0) {
    const prev = existingReq.rows[0];
    const parsedDetails = prev.details ? JSON.parse(prev.details) : {};
    return {
      isDuplicateRetry: true,
      requestId,
      outcome: prev.outcome,
      registrationId: parsedDetails.registrationId || null,
      status: parsedDetails.status || prev.outcome,
      waitlistPosition: parsedDetails.waitlistPosition || null,
      message: `Idempotent replay: Request was already processed with outcome '${prev.outcome}'.`,
    };
  }

  // 2. Open DB Transaction with Row-Level Lock
  const dbClient = await getClient();

  try {
    await dbClient.query('BEGIN');

    // Lock course row to serialize seat checks for this course
    const courseRes = await dbClient.query(
      `SELECT id, code, name, capacity, enrolled_count, status 
       FROM courses 
       WHERE id = $1 
       FOR UPDATE`,
      [courseId]
    );

    if (courseRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      await recordRequestOutcome({
        requestId,
        userId,
        courseId,
        outcome: 'REJECTED_NOT_FOUND',
        details: { error: 'Course does not exist.' },
      });
      return { error: 'Course not found.', outcome: 'REJECTED_NOT_FOUND' };
    }

    const course = courseRes.rows[0];

    if (course.status !== 'OPEN') {
      await dbClient.query('ROLLBACK');
      await recordRequestOutcome({
        requestId,
        userId,
        courseId,
        outcome: 'REJECTED_CLOSED',
        details: { error: 'Course registration is currently closed.' },
      });
      return { error: 'Registration for this course is closed.', outcome: 'REJECTED_CLOSED' };
    }

    // 3. Duplicate Active Registration Check
    const activeReg = await dbClient.query(
      `SELECT id, status, waitlist_position 
       FROM registrations 
       WHERE course_id = $1 AND user_id = $2 AND status IN ('REGISTERED', 'WAITLISTED')`,
      [courseId, userId]
    );

    if (activeReg.rows.length > 0) {
      const existing = activeReg.rows[0];
      await dbClient.query('ROLLBACK');

      const outcome = existing.status === 'REGISTERED' ? 'REJECTED_DUPLICATE_REGISTERED' : 'REJECTED_DUPLICATE_WAITLISTED';
      await recordRequestOutcome({
        requestId,
        userId,
        courseId,
        outcome,
        details: { 
          registrationId: existing.id, 
          status: existing.status, 
          waitlistPosition: existing.waitlist_position 
        },
      });

      const errorMsg = existing.status === 'REGISTERED'
        ? 'Duplicate registration — you are already enrolled in this course.'
        : `Duplicate registration — you are already waitlisted (position #${existing.waitlist_position}) in this course.`;

      return {
        error: errorMsg,
        outcome,
        registrationId: existing.id,
        status: existing.status,
      };
    }

    const capacity = parseInt(course.capacity, 10);
    const enrolled = parseInt(course.enrolled_count, 10);
    let outcome = '';
    let finalStatus = '';
    let waitlistPosition = null;
    const registrationId = uuidv4();

    // 4. Seat Allocation vs Neutral FIFO Waitlist
    if (enrolled < capacity) {
      // Allocate seat
      finalStatus = 'REGISTERED';
      outcome = 'ALLOCATED';

      // Insert registration record
      await dbClient.query(
        `INSERT INTO registrations (id, course_id, user_id, status, waitlist_position, request_id)
         VALUES ($1, $2, $3, $4, NULL, $5)`,
        [registrationId, courseId, userId, finalStatus, requestId]
      );

      // Increment course enrolled counter
      await dbClient.query(
        `UPDATE courses 
         SET enrolled_count = enrolled_count + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [courseId]
      );

      // Audit log entry
      await dbClient.query(
        `INSERT INTO audit_logs (id, course_id, user_id, action, details)
         VALUES ($1, $2, $3, 'SEAT_ALLOCATED', $4)`,
        [
          uuidv4(),
          courseId,
          userId,
          JSON.stringify({ registrationId, requestId, seatNumber: enrolled + 1, capacity }),
        ]
      );
    } else {
      // Course is full -> Neutral FIFO Waitlist
      finalStatus = 'WAITLISTED';
      outcome = 'WAITLISTED';

      const maxWaitRes = await dbClient.query(
        `SELECT COALESCE(MAX(waitlist_position), 0) AS max_pos 
         FROM registrations 
         WHERE course_id = $1 AND status = 'WAITLISTED'`,
        [courseId]
      );

      waitlistPosition = parseInt(maxWaitRes.rows[0].max_pos, 10) + 1;

      await dbClient.query(
        `INSERT INTO registrations (id, course_id, user_id, status, waitlist_position, request_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [registrationId, courseId, userId, finalStatus, waitlistPosition, requestId]
      );

      await dbClient.query(
        `INSERT INTO audit_logs (id, course_id, user_id, action, details)
         VALUES ($1, $2, $3, 'WAITLIST_ENQUEUED', $4)`,
        [
          uuidv4(),
          courseId,
          userId,
          JSON.stringify({ registrationId, requestId, waitlistPosition }),
        ]
      );
    }

    // 5. Persist Request Outcome
    const details = {
      registrationId,
      status: finalStatus,
      waitlistPosition,
      latencyMs: Date.now() - startTime,
    };

    await dbClient.query(
      `INSERT INTO registration_requests (id, request_id, user_id, course_id, action, outcome, details)
       VALUES ($1, $2, $3, $4, 'REGISTER', $5, $6)`,
      [uuidv4(), requestId, userId, courseId, outcome, JSON.stringify(details)]
    );

    await dbClient.query('COMMIT');

    return {
      success: true,
      requestId,
      registrationId,
      status: finalStatus,
      outcome,
      waitlistPosition,
      message:
        finalStatus === 'REGISTERED'
          ? 'Seat successfully allocated!'
          : `Course is full. You are placed at position #${waitlistPosition} on the waitlist.`,
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[RegistrationService] Transaction failed:', err.message);

    await recordRequestOutcome({
      requestId,
      userId,
      courseId,
      outcome: 'FAILED_ERROR',
      details: { error: err.message },
    }).catch(() => {});

    throw err;
  } finally {
    dbClient.release();
  }
}

/**
 * Cancel an active registration and automatically promote the earliest waitlisted student
 */
async function cancelRegistration({ userId, registrationId }) {
  const dbClient = await getClient();

  try {
    await dbClient.query('BEGIN');

    // 1. Fetch and lock target registration
    const regRes = await dbClient.query(
      `SELECT r.id, r.course_id, r.user_id, r.status, r.waitlist_position, c.capacity, c.enrolled_count
       FROM registrations r
       JOIN courses c ON r.course_id = c.id
       WHERE r.id = $1 AND r.user_id = $2 AND r.status IN ('REGISTERED', 'WAITLISTED')
       FOR UPDATE`,
      [registrationId, userId]
    );

    if (regRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return { error: 'Active registration record not found.' };
    }

    const reg = regRes.rows[0];
    const courseId = reg.course_id;
    const prevStatus = reg.status;
    const prevWaitlistPos = reg.waitlist_position;

    // Lock course row
    await dbClient.query('SELECT id, capacity, enrolled_count FROM courses WHERE id = $1 FOR UPDATE', [courseId]);

    // Update status to CANCELLED
    await dbClient.query(
      `UPDATE registrations 
       SET status = 'CANCELLED', waitlist_position = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [registrationId]
    );

    let promotedStudent = null;

    if (prevStatus === 'REGISTERED') {
      // Decrement enrolled count
      await dbClient.query(
        `UPDATE courses 
         SET enrolled_count = GREATEST(0, enrolled_count - 1), updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [courseId]
      );

      // Check for earliest eligible student on FIFO waitlist
      const waitlistRes = await dbClient.query(
        `SELECT r.id, r.user_id, r.waitlist_position, u.name, u.student_id 
         FROM registrations r
         JOIN users u ON r.user_id = u.id
         WHERE r.course_id = $1 AND r.status = 'WAITLISTED'
         ORDER BY r.waitlist_position ASC 
         LIMIT 1 
         FOR UPDATE`,
        [courseId]
      );

      if (waitlistRes.rows.length > 0) {
        const nextInLine = waitlistRes.rows[0];

        // Promote student to REGISTERED
        await dbClient.query(
          `UPDATE registrations 
           SET status = 'REGISTERED', waitlist_position = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [nextInLine.id]
        );

        // Increment enrolled count
        await dbClient.query(
          `UPDATE courses 
           SET enrolled_count = enrolled_count + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [courseId]
        );

        // Shift remaining waitlisted students down by 1
        await dbClient.query(
          `UPDATE registrations 
           SET waitlist_position = waitlist_position - 1, updated_at = CURRENT_TIMESTAMP 
           WHERE course_id = $1 AND status = 'WAITLISTED'`,
          [courseId]
        );

        // Log promotion
        await dbClient.query(
          `INSERT INTO audit_logs (id, course_id, user_id, action, details)
           VALUES ($1, $2, $3, 'WAITLIST_PROMOTED', $4)`,
          [
            uuidv4(),
            courseId,
            nextInLine.user_id,
            JSON.stringify({ 
              registrationId: nextInLine.id, 
              studentName: nextInLine.name,
              promotedFromPosition: nextInLine.waitlist_position 
            }),
          ]
        );

        promotedStudent = {
          studentId: nextInLine.student_id,
          name: nextInLine.name,
        };
      }

      await dbClient.query(
        `INSERT INTO audit_logs (id, course_id, user_id, action, details)
         VALUES ($1, $2, $3, 'REGISTRATION_CANCELLED', $4)`,
        [
          uuidv4(),
          courseId,
          userId,
          JSON.stringify({ registrationId, promotedStudent }),
        ]
      );
    } else if (prevStatus === 'WAITLISTED') {
      // Re-order remaining waitlist entries behind this position
      await dbClient.query(
        `UPDATE registrations 
         SET waitlist_position = waitlist_position - 1, updated_at = CURRENT_TIMESTAMP 
         WHERE course_id = $1 AND status = 'WAITLISTED' AND waitlist_position > $2`,
        [courseId, prevWaitlistPos]
      );

      await dbClient.query(
        `INSERT INTO audit_logs (id, course_id, user_id, action, details)
         VALUES ($1, $2, $3, 'WAITLIST_CANCELLED', $4)`,
        [uuidv4(), courseId, userId, JSON.stringify({ registrationId, removedPosition: prevWaitlistPos })]
      );
    }

    await dbClient.query('COMMIT');

    return {
      success: true,
      message: 'Registration successfully cancelled.',
      promotedStudent,
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[RegistrationService] Cancellation failed:', err.message);
    throw err;
  } finally {
    dbClient.release();
  }
}

async function recordRequestOutcome({ requestId, userId, courseId, outcome, details }) {
  try {
    await query(
      `INSERT INTO registration_requests (id, request_id, user_id, course_id, action, outcome, details)
       VALUES ($1, $2, $3, $4, 'REGISTER', $5, $6)
       ON CONFLICT (request_id) DO NOTHING`,
      [uuidv4(), requestId, userId, courseId, outcome, JSON.stringify(details || {})]
    );
  } catch (err) {
    console.warn('[RegistrationService] Failed to log outcome:', err.message);
  }
}

module.exports = {
  registerStudentForCourse,
  cancelRegistration,
};
