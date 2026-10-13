const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

async function getCourses(req, res) {
  try {
    const userId = req.user ? req.user.id : null;

    // Fetch courses with waitlist count
    const coursesRes = await query(
      `SELECT c.id, c.code, c.name, c.instructor, c.description, 
              c.capacity, c.enrolled_count, c.status, c.created_at,
              (c.capacity - c.enrolled_count) AS available_seats,
              COALESCE(w.waitlist_count, 0) AS waitlist_count
       FROM courses c
       LEFT JOIN (
         SELECT course_id, COUNT(*) AS waitlist_count 
         FROM registrations 
         WHERE status = 'WAITLISTED' 
         GROUP BY course_id
       ) w ON c.id = w.course_id
       ORDER BY c.created_at DESC`
    );

    let courses = coursesRes.rows.map(c => ({
      ...c,
      capacity: parseInt(c.capacity, 10),
      enrolled_count: parseInt(c.enrolled_count, 10),
      available_seats: Math.max(0, parseInt(c.capacity, 10) - parseInt(c.enrolled_count, 10)),
      waitlist_count: parseInt(c.waitlist_count, 10),
      user_registration_status: null,
      user_waitlist_position: null,
    }));

    // If student is logged in, attach their individual registration status for each course
    if (userId) {
      const userRegs = await query(
        `SELECT course_id, status, waitlist_position, request_id, id AS registration_id 
         FROM registrations 
         WHERE user_id = $1 AND status IN ('REGISTERED', 'WAITLISTED')`,
        [userId]
      );

      const regMap = {};
      userRegs.rows.forEach(r => {
        regMap[r.course_id] = r;
      });

      courses = courses.map(c => {
        const reg = regMap[c.id];
        return {
          ...c,
          user_registration_status: reg ? reg.status : null,
          user_waitlist_position: reg ? reg.waitlist_position : null,
          user_registration_id: reg ? reg.registration_id : null,
        };
      });
    }

    return res.json({ courses });
  } catch (err) {
    console.error('[CourseController] getCourses error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch courses.' });
  }
}

async function createCourse(req, res) {
  try {
    const { code, name, instructor, description, capacity, status } = req.body;

    if (!code || !name || !instructor || capacity === undefined) {
      return res.status(400).json({ 
        error: 'Course code, name, instructor, and seat capacity are required.' 
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanInstructor = instructor.trim();
    const parsedCapacity = parseInt(capacity, 10);
    const courseStatus = status === 'CLOSED' ? 'CLOSED' : 'OPEN';

    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return res.status(400).json({ error: 'Seat capacity must be a positive integer greater than 0.' });
    }

    // Check code uniqueness
    const existing = await query('SELECT id FROM courses WHERE code = $1', [cleanCode]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `A course with code '${cleanCode}' already exists.` });
    }

    const courseId = uuidv4();
    await query(
      `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
      [courseId, cleanCode, cleanName, cleanInstructor, description || '', parsedCapacity, courseStatus]
    );

    // Write audit log
    await query(
      `INSERT INTO audit_logs (id, course_id, user_id, action, details)
       VALUES ($1, $2, $3, 'COURSE_CREATED', $4)`,
      [
        uuidv4(),
        courseId,
        req.user.id,
        JSON.stringify({ code: cleanCode, name: cleanName, capacity: parsedCapacity, status: courseStatus })
      ]
    );

    return res.status(201).json({
      message: 'Course created successfully.',
      course: {
        id: courseId,
        code: cleanCode,
        name: cleanName,
        instructor: cleanInstructor,
        description: description || '',
        capacity: parsedCapacity,
        enrolled_count: 0,
        available_seats: parsedCapacity,
        status: courseStatus,
      },
    });
  } catch (err) {
    console.error('[CourseController] createCourse error:', err.message);
    return res.status(500).json({ error: 'Failed to create course in database.' });
  }
}

async function updateCourse(req, res) {
  try {
    const { id } = req.params;
    const { name, instructor, description, capacity, status } = req.body;

    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [id]);
    if (courseRes.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const currentCourse = courseRes.rows[0];
    const newCapacity = capacity !== undefined ? parseInt(capacity, 10) : currentCourse.capacity;

    if (isNaN(newCapacity) || newCapacity <= 0) {
      return res.status(400).json({ error: 'Seat capacity must be a positive integer.' });
    }

    // Safeguard: Do not allow capacity changes that would invalidate existing registrations
    if (newCapacity < currentCourse.enrolled_count) {
      return res.status(400).json({
        error: `Cannot reduce capacity to ${newCapacity}. Course currently has ${currentCourse.enrolled_count} active registered students.`
      });
    }

    const updatedName = name ? name.trim() : currentCourse.name;
    const updatedInstructor = instructor ? instructor.trim() : currentCourse.instructor;
    const updatedDescription = description !== undefined ? description : currentCourse.description;
    const updatedStatus = status ? status : currentCourse.status;

    await query(
      `UPDATE courses 
       SET name = $1, instructor = $2, description = $3, capacity = $4, status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [updatedName, updatedInstructor, updatedDescription, newCapacity, updatedStatus, id]
    );

    // Write audit log
    await query(
      `INSERT INTO audit_logs (id, course_id, user_id, action, details)
       VALUES ($1, $2, $3, 'COURSE_UPDATED', $4)`,
      [
        uuidv4(),
        id,
        req.user.id,
        JSON.stringify({ 
          previousCapacity: currentCourse.capacity, 
          newCapacity, 
          previousStatus: currentCourse.status, 
          newStatus: updatedStatus 
        })
      ]
    );

    return res.json({
      message: 'Course updated successfully.',
      course: {
        id,
        code: currentCourse.code,
        name: updatedName,
        instructor: updatedInstructor,
        description: updatedDescription,
        capacity: newCapacity,
        enrolled_count: currentCourse.enrolled_count,
        available_seats: newCapacity - currentCourse.enrolled_count,
        status: updatedStatus,
      },
    });
  } catch (err) {
    console.error('[CourseController] updateCourse error:', err.message);
    return res.status(500).json({ error: 'Failed to update course.' });
  }
}

async function toggleCourseStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['OPEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: "Status must be either 'OPEN' or 'CLOSED'." });
    }

    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [id]);
    if (courseRes.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    await query('UPDATE courses SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);

    await query(
      `INSERT INTO audit_logs (id, course_id, user_id, action, details)
       VALUES ($1, $2, $3, 'COURSE_STATUS_TOGGLED', $4)`,
      [uuidv4(), id, req.user.id, JSON.stringify({ status })]
    );

    return res.json({ message: `Course registration is now ${status}.`, status });
  } catch (err) {
    console.error('[CourseController] toggleCourseStatus error:', err.message);
    return res.status(500).json({ error: 'Failed to toggle course status.' });
  }
}

module.exports = {
  getCourses,
  createCourse,
  updateCourse,
  toggleCourseStatus,
};
