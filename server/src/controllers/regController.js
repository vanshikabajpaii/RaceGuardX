const { registerStudentForCourse, cancelRegistration } = require('../services/registrationService');
const { query } = require('../config/database');

async function handleRegister(req, res) {
  try {
    const userId = req.user.id;
    const { courseId, requestId } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required.' });
    }

    const result = await registerStudentForCourse({
      userId,
      courseId,
      clientRequestId: requestId,
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.status(result.isDuplicateRetry ? 200 : 201).json(result);
  } catch (err) {
    console.error('[RegController] Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed due to server error: ' + err.message });
  }
}

async function handleCancel(req, res) {
  try {
    const userId = req.user.id;
    const { id: registrationId } = req.params;

    if (!registrationId) {
      return res.status(400).json({ error: 'registrationId is required.' });
    }

    const result = await cancelRegistration({
      userId,
      registrationId,
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[RegController] Cancel error:', err.message);
    return res.status(500).json({ error: 'Cancellation failed: ' + err.message });
  }
}

/**
 * Student-Private Status: Strict data isolation ensuring students can only view their own records
 */
async function getMyStatus(req, res) {
  try {
    const userId = req.user.id;

    // Fetch student's registrations
    const regRes = await query(
      `SELECT r.id AS registration_id, r.course_id, r.status, r.waitlist_position, 
              r.request_id, r.created_at, r.updated_at,
              c.code AS course_code, c.name AS course_name, c.instructor, c.capacity, c.enrolled_count
       FROM registrations r
       JOIN courses c ON r.course_id = c.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    // Fetch student's request history
    const reqRes = await query(
      `SELECT rr.id, rr.request_id, rr.course_id, rr.action, rr.outcome, 
              rr.details, rr.created_at,
              c.code AS course_code, c.name AS course_name
       FROM registration_requests rr
       JOIN courses c ON rr.course_id = c.id
       WHERE rr.user_id = $1
       ORDER BY rr.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const requests = reqRes.rows.map(r => {
      let parsed = {};
      try {
        parsed = JSON.parse(r.details);
      } catch (e) {}
      return {
        ...r,
        details: parsed,
      };
    });

    return res.json({
      student: {
        id: req.user.id,
        studentId: req.user.student_id,
        name: req.user.name,
        email: req.user.email,
      },
      registrations: regRes.rows,
      requests,
    });
  } catch (err) {
    console.error('[RegController] getMyStatus error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve personal registration status.' });
  }
}

/**
 * Admin Comprehensive Overview: Real-time course state, registered students, waitlist order, and audit log
 */
async function getAdminOverview(req, res) {
  try {
    const { courseCode, studentId, requestId, status } = req.query;

    // 1. All courses with enrollments and waitlist count
    const coursesRes = await query(
      `SELECT c.id, c.code, c.name, c.instructor, c.capacity, c.enrolled_count, c.status, c.created_at,
              (c.capacity - c.enrolled_count) AS available_seats
       FROM courses c
       ORDER BY c.created_at DESC`
    );

    // 2. Active Enrollments and Waitlist with Student Info
    let enrollmentsQuery = `
      SELECT r.id AS registration_id, r.course_id, r.user_id, r.status, r.waitlist_position, 
             r.request_id, r.created_at, r.updated_at,
             u.student_id, u.name AS student_name, u.email AS student_email,
             c.code AS course_code, c.name AS course_name
      FROM registrations r
      JOIN users u ON r.user_id = u.id
      JOIN courses c ON r.course_id = c.id
      WHERE 1=1
    `;
    const enrollmentsParams = [];

    if (courseCode) {
      enrollmentsParams.push(courseCode.toUpperCase());
      enrollmentsQuery += ` AND UPPER(c.code) = $${enrollmentsParams.length}`;
    }
    if (studentId) {
      enrollmentsParams.push(studentId);
      enrollmentsQuery += ` AND u.student_id = $${enrollmentsParams.length}`;
    }
    if (requestId) {
      enrollmentsParams.push(requestId);
      enrollmentsQuery += ` AND r.request_id = $${enrollmentsParams.length}`;
    }
    if (status) {
      enrollmentsParams.push(status.toUpperCase());
      enrollmentsQuery += ` AND r.status = $${enrollmentsParams.length}`;
    }

    enrollmentsQuery += ` ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, r.created_at DESC`;
    const enrollmentsRes = await query(enrollmentsQuery, enrollmentsParams);

    // 3. Incoming Requests History
    let requestsQuery = `
      SELECT rr.id, rr.request_id, rr.course_id, rr.user_id, rr.action, rr.outcome, 
             rr.details, rr.created_at,
             u.student_id, u.name AS student_name,
             c.code AS course_code, c.name AS course_name
      FROM registration_requests rr
      JOIN users u ON rr.user_id = u.id
      JOIN courses c ON rr.course_id = c.id
      WHERE 1=1
    `;
    const requestsParams = [];

    if (courseCode) {
      requestsParams.push(courseCode.toUpperCase());
      requestsQuery += ` AND UPPER(c.code) = $${requestsParams.length}`;
    }
    if (studentId) {
      requestsParams.push(studentId);
      requestsQuery += ` AND u.student_id = $${requestsParams.length}`;
    }
    if (requestId) {
      requestsParams.push(requestId);
      requestsQuery += ` AND rr.request_id = $${requestsParams.length}`;
    }
    if (status) {
      requestsParams.push(status.toUpperCase());
      requestsQuery += ` AND rr.outcome = $${requestsParams.length}`;
    }

    requestsQuery += ` ORDER BY rr.created_at DESC LIMIT 100`;
    const requestsRes = await query(requestsQuery, requestsParams);

    // 4. Audit Log Stream
    const auditRes = await query(
      `SELECT a.id, a.course_id, a.user_id, a.action, a.details, a.created_at,
              c.code AS course_code, u.name AS user_name, u.student_id
       FROM audit_logs a
       LEFT JOIN courses c ON a.course_id = c.id
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );

    return res.json({
      courses: coursesRes.rows,
      enrollments: enrollmentsRes.rows,
      requests: requestsRes.rows.map(r => {
        let details = {};
        try { details = JSON.parse(r.details); } catch (e) {}
        return { ...r, details };
      }),
      auditLogs: auditRes.rows.map(a => {
        let details = {};
        try { details = JSON.parse(a.details); } catch (e) {}
        return { ...a, details };
      }),
    });
  } catch (err) {
    console.error('[RegController] getAdminOverview error:', err.message);
    return res.status(500).json({ error: 'Failed to load administrative overview.' });
  }
}

module.exports = {
  handleRegister,
  handleCancel,
  getMyStatus,
  getAdminOverview,
};
