const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, query } = require('../src/config/database');
const { registerStudentForCourse, cancelRegistration } = require('../src/services/registrationService');
const { runFailureRollbackSimulation } = require('../src/services/concurrencyLabService');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting RaceGuardX Automated Concurrency & Safety Tests');
  console.log('Tagline: "Every Request. Every Seat. Under Control."');
  console.log('======================================================\n');

  await initDatabase();

  let passedTests = 0;
  let totalTests = 4;

  try {
    // -----------------------------------------------------------------
    // TEST 1: Simultaneous requests competing for limited course capacity
    // -----------------------------------------------------------------
    console.log('[Test 1] Executing simultaneous requests competing for the last seat...');
    const testCourseId = uuidv4();
    const courseCapacity = 2;
    const testCode = `TEST-CONC-${Date.now()}`;

    await query("DELETE FROM courses WHERE code LIKE 'TEST-CONC%'");
    await query(
      `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
       VALUES ($1, $2, 'Concurrency Test Course', 'Prof. Mutex', 'Test', $3, 0, 'OPEN')`,
      [testCourseId, testCode, courseCapacity]
    );

    // Create 10 temporary students for the test
    await query("DELETE FROM users WHERE student_id LIKE 'T_STU_%'");
    const runId = Date.now();
    const studentIds = [];
    for (let i = 1; i <= 10; i++) {
      const uId = uuidv4();
      await query(
        `INSERT INTO users (id, student_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'hash', 'STUDENT')`,
        [uId, `T_STU_${runId}_${i}`, `Concurrent Student ${i}`, `tstudent_${runId}_${i}@test.edu`]
      );
      studentIds.push(uId);
    }

    // Launch 10 simultaneous registration requests concurrently
    const regPromises = studentIds.map(uId => 
      registerStudentForCourse({
        userId: uId,
        courseId: testCourseId,
        clientRequestId: uuidv4(),
      })
    );

    const results = await Promise.all(regPromises);

    const allocated = results.filter(r => r.status === 'REGISTERED');
    const waitlisted = results.filter(r => r.status === 'WAITLISTED');

    // Fetch live course state from DB
    const courseCheck = await query('SELECT capacity, enrolled_count FROM courses WHERE id = $1', [testCourseId]);
    const enrolledCount = parseInt(courseCheck.rows[0].enrolled_count, 10);

    assert.strictEqual(allocated.length, 2, 'Exactly 2 seats must be allocated');
    assert.strictEqual(waitlisted.length, 8, 'Exactly 8 students must be placed on waitlist');
    assert.strictEqual(enrolledCount, 2, 'enrolled_count in DB must not exceed capacity (2)');

    // Verify FIFO waitlist positions are 1 to 8 without gaps
    const waitlistPositions = waitlisted.map(w => w.waitlistPosition).sort((a, b) => a - b);
    assert.deepStrictEqual(waitlistPositions, [1, 2, 3, 4, 5, 6, 7, 8], 'Waitlist positions must be sequentially ordered 1..8');

    console.log('  ✅ PASSED: Zero Overbooking under 10 simultaneous requests (2 allocated, 8 waitlisted).');
    passedTests++;

    // -----------------------------------------------------------------
    // TEST 2: Duplicate Request Submission & Idempotency
    // -----------------------------------------------------------------
    console.log('\n[Test 2] Testing duplicate request idempotency & retry handling...');
    const duplicateStudentId = studentIds[0];
    const fixedRequestId = uuidv4();

    // First attempt (student is already registered from Test 1, so this tests active duplicate guard)
    const duplicateRegAttempt = await registerStudentForCourse({
      userId: duplicateStudentId,
      courseId: testCourseId,
      clientRequestId: fixedRequestId,
    });

    assert.strictEqual(
      duplicateRegAttempt.outcome,
      'REJECTED_DUPLICATE_REGISTERED',
      'Duplicate attempt must be rejected when student is already registered'
    );

    // Second attempt with exact same requestId (tests idempotency replay)
    const retryAttempt = await registerStudentForCourse({
      userId: duplicateStudentId,
      courseId: testCourseId,
      clientRequestId: fixedRequestId,
    });

    assert.strictEqual(retryAttempt.isDuplicateRetry, true, 'Second call must be flagged as idempotent replay');
    assert.strictEqual(retryAttempt.outcome, 'REJECTED_DUPLICATE_REGISTERED', 'Cached outcome must match');

    console.log('  ✅ PASSED: Idempotency keys prevent duplicate registrations on retries.');
    passedTests++;

    // -----------------------------------------------------------------
    // TEST 3: Registration Cancellation & Automatic FIFO Waitlist Promotion
    // -----------------------------------------------------------------
    console.log('\n[Test 3] Testing registration cancellation and automatic FIFO waitlist promotion...');
    // Find the first registered student from Test 1
    const registeredStudent = allocated[0];
    
    // Find the student at waitlist position #1
    const waitlistFirstStudent = waitlisted.find(w => w.waitlistPosition === 1);

    // Cancel first registered student
    const cancelRes = await cancelRegistration({
      userId: registeredStudent.registrationId ? (await query('SELECT user_id FROM registrations WHERE id = $1', [registeredStudent.registrationId])).rows[0].user_id : studentIds[0],
      registrationId: registeredStudent.registrationId,
    });

    assert.strictEqual(cancelRes.success, true, 'Cancellation must succeed');

    // Verify waitlist #1 student was automatically promoted to REGISTERED
    const promotedCheck = await query('SELECT status, waitlist_position FROM registrations WHERE id = $1', [waitlistFirstStudent.registrationId]);
    assert.strictEqual(promotedCheck.rows[0].status, 'REGISTERED', 'Waitlist #1 student must be promoted to REGISTERED');
    assert.strictEqual(promotedCheck.rows[0].waitlist_position, null, 'Promoted student waitlist_position must be null');

    // Verify course enrolled count remains exactly 2 (1 previous registered + 1 promoted)
    const courseAfterCancel = await query('SELECT enrolled_count FROM courses WHERE id = $1', [testCourseId]);
    assert.strictEqual(parseInt(courseAfterCancel.rows[0].enrolled_count, 10), 2, 'Enrolled count must remain 2 after promotion');

    // Verify remaining waitlisted students were shifted down by 1 position
    const remainingWaitlist = await query(
      `SELECT waitlist_position FROM registrations 
       WHERE course_id = $1 AND status = 'WAITLISTED' 
       ORDER BY waitlist_position ASC`,
      [testCourseId]
    );
    const newPositions = remainingWaitlist.rows.map(r => r.waitlist_position);
    assert.deepStrictEqual(newPositions, [1, 2, 3, 4, 5, 6, 7], 'Remaining waitlist must shift down to 1..7');

    console.log('  ✅ PASSED: Cancellation atomically promotes earliest FIFO waitlisted student.');
    passedTests++;

    // -----------------------------------------------------------------
    // TEST 4: Controlled Failure Injection & Transaction Rollback
    // -----------------------------------------------------------------
    console.log('\n[Test 4] Testing controlled failure injection and transaction rollback...');
    const rollbackResult = await runFailureRollbackSimulation();

    assert.strictEqual(rollbackResult.isRollbackSuccessful, true, 'Rollback must maintain consistent state');
    assert.strictEqual(rollbackResult.beforeEnrolled, rollbackResult.afterEnrolled, 'Seat count must not leak on failure');
    assert.strictEqual(rollbackResult.orphanedRowsCount, 0, 'No orphaned registration records may exist');

    console.log('  ✅ PASSED: Transaction rollback cleanly reverses state on injected failure.');
    passedTests++;

    // Cleanup test data
    await query('DELETE FROM registrations WHERE course_id = $1', [testCourseId]);
    await query('DELETE FROM registration_requests WHERE course_id = $1', [testCourseId]);
    await query('DELETE FROM courses WHERE id = $1', [testCourseId]);
    for (const uId of studentIds) {
      await query('DELETE FROM users WHERE id = $1', [uId]);
    }

    console.log('\n======================================================');
    console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} Test Cases Verified Successfully!`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTestSuite();
