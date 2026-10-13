const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

async function login(req, res) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier (Student ID or Email) and password are required.' });
    }

    const cleanIdentifier = identifier.trim();

    // Query for user by student_id OR email
    const result = await query(
      `SELECT id, student_id, name, email, password_hash, role 
       FROM users 
       WHERE student_id = $1 OR LOWER(email) = LOWER($2) 
       LIMIT 1`,
      [cleanIdentifier, cleanIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    // Sign JWT token
    const tokenPayload = {
      id: user.id,
      student_id: user.student_id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        studentId: user.student_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

async function getProfile(req, res) {
  try {
    return res.json({
      user: {
        id: req.user.id,
        studentId: req.user.student_id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
}

module.exports = {
  login,
  getProfile,
};
