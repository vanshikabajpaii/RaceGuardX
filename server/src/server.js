const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment config
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const { initDatabase, getActiveEngine } = require('./config/database');
const { authenticateToken, requireRole } = require('./middleware/auth');

// Controllers
const authController = require('./controllers/authController');
const courseController = require('./controllers/courseController');
const regController = require('./controllers/regController');
const labController = require('./controllers/labController');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
createClient(https://aegjergg54johtg3tbnop.supabase.co,hsoihd53gurhi_g43jfs_)
// Optional auth middleware for endpoints that can benefit from student identity (like course listing)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return next();
  }
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('./middleware/auth');
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    system: 'RaceGuardX',
    tagline: 'Every Request. Every Seat. Under Control.',
    databaseEngine: getActiveEngine(),
    timestamp: new Date().toISOString(),
  });
});

// Authentication Routes
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateToken, authController.getProfile);

// Course Management Routes
app.get('/api/courses', optionalAuth, courseController.getCourses);
app.post('/api/courses', authenticateToken, requireRole('ADMIN'), courseController.createCourse);
app.put('/api/courses/:id', authenticateToken, requireRole('ADMIN'), courseController.updateCourse);
app.patch('/api/courses/:id/status', authenticateToken, requireRole('ADMIN'), courseController.toggleCourseStatus);

// Safe Registration Routes
app.post('/api/registrations', authenticateToken, requireRole('STUDENT'), regController.handleRegister);
app.post('/api/registrations/:id/cancel', authenticateToken, requireRole('STUDENT'), regController.handleCancel);
app.get('/api/registrations/my-status', authenticateToken, requireRole('STUDENT'), regController.getMyStatus);

// Admin Monitoring & Audit Routes
app.get('/api/admin/overview', authenticateToken, requireRole('ADMIN'), regController.getAdminOverview);

// Concurrency Lab Simulation Routes (Isolated sandbox)
app.post('/api/lab/simulate-unsafe', authenticateToken, requireRole('ADMIN'), labController.handleUnsafe);
app.post('/api/lab/simulate-global-lock', authenticateToken, requireRole('ADMIN'), labController.handleGlobalLock);
app.post('/api/lab/simulate-fine-grained', authenticateToken, requireRole('ADMIN'), labController.handleFineGrained);
app.post('/api/lab/simulate-failure-rollback', authenticateToken, requireRole('ADMIN'), labController.handleFailureRollback);

// C1: Mass Concurrency Simulation & 2-Course Distribution
app.post('/api/lab/mass-request', authenticateToken, requireRole('ADMIN'), labController.handleMassRequest);
app.post('/api/lab/c1-distribution', authenticateToken, requireRole('ADMIN'), labController.handleC1Distribution);

// C3: Bounded Ingress & Logical Tick Engine
app.post('/api/lab/ingress/submit', authenticateToken, requireRole('ADMIN'), labController.handleIngressSubmit);
app.get('/api/lab/ingress/status', authenticateToken, requireRole('ADMIN'), labController.handleIngressStatus);
app.post('/api/lab/ingress/pause', authenticateToken, requireRole('ADMIN'), labController.handleIngressPause);
app.post('/api/lab/ingress/resume', authenticateToken, requireRole('ADMIN'), labController.handleIngressResume);
app.post('/api/lab/ingress/step', authenticateToken, requireRole('ADMIN'), labController.handleIngressStep);

// C4: Crash Recovery Lab
app.post('/api/lab/crash-recovery', authenticateToken, requireRole('ADMIN'), labController.handleCrashRecovery);

// C5: Cross-Course Atomic Lab & Complete-Need Allocation
app.post('/api/lab/atomic-multi-course', authenticateToken, labController.handleAtomicMultiCourse);
app.post('/api/lab/c5-complete-need', authenticateToken, requireRole('ADMIN'), labController.handleC5Allocation);
// AsyncX KO-02 Standard Edge Cases Runner
app.post('/api/lab/edge-cases', authenticateToken, requireRole('ADMIN'), labController.handleRunEdgeCase);

// Initialize DB and start HTTP server
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`[RaceGuardX Server] Running on http://localhost:${PORT}`);
      console.log(`[RaceGuardX Server] Tagline: "Every Request. Every Seat. Under Control."`);
      console.log(`[RaceGuardX Server] Active DB Engine: ${getActiveEngine()}`);
    });
  } catch (err) {
    console.error('[RaceGuardX Server] Failed to initialize server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
