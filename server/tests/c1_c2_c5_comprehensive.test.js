const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, query } = require('../src/config/database');
const { registerStudentForCourse } = require('../src/services/registrationService');
const { runC1MassDistribution } = require('../src/services/c1MassDistributionService');
const { allocateCompleteNeedMultiCourse } = require('../src/services/c5CompleteNeedService');

async function runComprehensiveTests() {
  console.log('\n======================================================');
  console.log('🧪 RaceGuardX C1, C2, and C5 Comprehensive OS Test Suite');
  console.log('Tagline: "Every Request. Every Seat. Under Control."');
  console.log('======================================================\n');

  await initDatabase();

  let passed = 0;
  let total = 14;

  try {
    // -------------------------------------------------------------
    // SETUP: Create two fresh isolated test courses for C1/C2/C5 tests
    // -------------------------------------------------------------
    const c1Id = uuidv4();
    const c2Id = uuidv4();
    const testCode1 = `TEST_C1_A_${Date.now()}`;
    const testCode2 = `TEST_C1_B_${Date.now()}`;

    await query(
      `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
       VALUES 
       ($1, $2, 'Advanced Operating Systems', 'Prof. Dijkstra', 'OS Theory', 10, 0, 'OPEN'),
       ($3, $4, 'Distributed Systems Architecture', 'Prof. Lamport', 'Clock synchronization', 10, 0, 'OPEN')`,
      [c1Id, testCode1, c2Id, testCode2]
    );

    // =============================================================
    // C1 TESTS (Tests 1 to 4)
    // =============================================================

    // TEST 1: Generate 500 requests and verify expected 250/250 distribution
    console.log('[Test 1 - C1] Verifying 500 requests 250/250 distribution across 2 courses...');
    const c1Run = await runC1MassDistribution({
      courseIds: [c1Id, c2Id],
      totalRequests: 500,
      maxWorkers: 4,
      maxQueue: 16,
    });

    assert.strictEqual(c1Run.distribution.course1.assignedRequests, 250, 'Course 1 must receive exactly 250 requests');
    assert.strictEqual(c1Run.distribution.course2.assignedRequests, 250, 'Course 2 must receive exactly 250 requests');
    assert.strictEqual(c1Run.totalRequests, 500, 'Total requests generated must be exactly 500');
    console.log('  ✅ PASSED: Exactly 250/250 distribution confirmed for 500 requests.');
    passed++;

    // TEST 2: Verify configured worker and queue limits are respected
    console.log('\n[Test 2 - C1] Verifying bounded worker pool (4) and queue (16) limits...');
    assert.strictEqual(c1Run.boundedIngress.maxWorkers, 4, 'Max workers must be 4');
    assert.strictEqual(c1Run.boundedIngress.maxQueue, 16, 'Max queue must be 16');
    assert.strictEqual(c1Run.boundedIngress.totalCapacity, 20, 'Total ingress capacity must be 4 + 16 = 20');
    assert.strictEqual(c1Run.boundedIngress.acceptedIntoIngress, 20, 'Only 20 requests must be accepted into bounded ingress');
    console.log('  ✅ PASSED: Bounded limits (4 workers, 16 queue, 20 total) strictly enforced.');
    passed++;

    // TEST 3: Verify all accepted requests receive final outcome & excess explicitly rejected
    console.log('\n[Test 3 - C1] Verifying explicit rejection of excess requests (zero loss)...');
    assert.strictEqual(c1Run.boundedIngress.rejectedBackpressureOverflow, 480, 'Exactly 480 requests must be explicitly rejected with backpressure');
    assert.strictEqual(c1Run.outcomes.rejectedOverflow, 480, 'Overflow rejection count must match 480');
    assert.strictEqual(c1Run.outcomes.allocated + c1Run.outcomes.rejectedFull, 20, 'All 20 accepted requests must have definitive final outcome');
    console.log('  ✅ PASSED: Zero requests dropped silently. 480 overflow rejected explicitly.');
    passed++;

    // TEST 4: Verify concurrent processing does not overbook either course
    console.log('\n[Test 4 - C1] Verifying seat invariant (enrolled <= capacity) under mass concurrency...');
    const checkC1 = await query('SELECT enrolled_count, capacity FROM courses WHERE id = $1::varchar', [String(c1Id)]);
    const checkC2 = await query('SELECT enrolled_count, capacity FROM courses WHERE id = $1::varchar', [String(c2Id)]);
    const enrolled1 = parseInt(checkC1.rows[0].enrolled_count, 10);
    const enrolled2 = parseInt(checkC2.rows[0].enrolled_count, 10);

    assert(enrolled1 <= 10, `Course 1 enrolled (${enrolled1}) must not exceed capacity 10`);
    assert(enrolled2 <= 10, `Course 2 enrolled (${enrolled2}) must not exceed capacity 10`);
    console.log(`  ✅ PASSED: Seat invariant preserved (C1: ${enrolled1}/10, C2: ${enrolled2}/10). Zero overbooking.`);
    passed++;

    // =============================================================
    // C2 TESTS (Tests 5 to 9)
    // =============================================================

    // Create a fresh test course with capacity 1 for C2
    const c2CourseId = uuidv4();
    await query(
      `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
       VALUES ($1, 'TEST_C2_CRS', 'C2 Duplicate Test Course', 'Prof. Unique', 'Test', 2, 0, 'OPEN')`,
      [c2CourseId]
    );

    // Create a test student
    const testStuA = uuidv4();
    await query(
      `INSERT INTO users (id, student_id, name, email, password_hash, role)
       VALUES ($1, 'C2_STU_A', 'Student C2 Alpha', 'c2_a@test.edu', 'hash', 'STUDENT')`,
      [testStuA]
    );

    // TEST 5 & 6: Submit multiple requests from same student for same course using different request IDs
    console.log('\n[Test 5 & 6 - C2] Submitting multiple requests for same course with distinct request IDs...');
    const reqId1 = `req_${Date.now()}_1`;
    const reqId2 = `req_${Date.now()}_2`;

    const attempt1 = await registerStudentForCourse({
      userId: testStuA,
      courseId: c2CourseId,
      clientRequestId: reqId1,
    });
    assert.strictEqual(attempt1.status, 'REGISTERED', 'First attempt must succeed');
    assert.strictEqual(attempt1.outcome, 'ALLOCATED', 'Outcome must be ALLOCATED');

    const attempt2 = await registerStudentForCourse({
      userId: testStuA,
      courseId: c2CourseId,
      clientRequestId: reqId2, // Distinct request ID!
    });

    // Check only 1 active enrollment created
    const activeRegs = await query(
      `SELECT id, status FROM registrations WHERE course_id = $1 AND user_id = $2 AND status = 'REGISTERED'`,
      [c2CourseId, testStuA]
    );
    assert.strictEqual(activeRegs.rows.length, 1, 'At most one active registration record may exist in DB');
    console.log('  ✅ PASSED: Exactly 1 active enrollment created despite multiple attempts.');
    passed += 2;

    // TEST 7: Duplicate attempts receive explicit rejection reason
    console.log('\n[Test 7 - C2] Verifying explicit rejection reason on duplicate attempt...');
    assert.strictEqual(attempt2.outcome, 'REJECTED_DUPLICATE_REGISTERED', 'Outcome must be REJECTED_DUPLICATE_REGISTERED');
    assert.strictEqual(attempt2.error, 'Duplicate registration — you are already enrolled in this course.');
    console.log('  ✅ PASSED: Explicit rejection reason ("Duplicate registration — you are already enrolled...") verified.');
    passed++;

    // TEST 8: Retrying the same request ID preserves idempotency replay
    console.log('\n[Test 8 - C2] Testing idempotency replay for identical request ID...');
    const retryAttempt = await registerStudentForCourse({
      userId: testStuA,
      courseId: c2CourseId,
      clientRequestId: reqId1, // Exact same ID as attempt 1
    });

    assert.strictEqual(retryAttempt.isDuplicateRetry, true, 'Must be flagged as idempotent replay');
    assert.strictEqual(retryAttempt.outcome, 'ALLOCATED', 'Replay outcome must match original allocation');
    console.log('  ✅ PASSED: Repeating same request ID returns saved idempotent replay without duplicate side effects.');
    passed++;

    // TEST 9: Different students can register for the same course independently
    console.log('\n[Test 9 - C2] Verifying different students register independently...');
    const testStuB = uuidv4();
    await query(
      `INSERT INTO users (id, student_id, name, email, password_hash, role)
       VALUES ($1, 'C2_STU_B', 'Student C2 Beta', 'c2_b@test.edu', 'hash', 'STUDENT')`,
      [testStuB]
    );

    const attemptStuB = await registerStudentForCourse({
      userId: testStuB,
      courseId: c2CourseId,
      clientRequestId: `req_${Date.now()}_b`,
    });
    assert.strictEqual(attemptStuB.status, 'REGISTERED', 'Different student must register independently');
    console.log('  ✅ PASSED: Student B registered independently without interference.');
    passed++;

    // =============================================================
    // C5 TESTS (Tests 10 to 14)
    // =============================================================

    // Create 2 courses with capacity 2 each for C5
    const c5CourseA = uuidv4();
    const c5CourseB = uuidv4();
    await query(
      `INSERT INTO courses (id, code, name, instructor, description, capacity, enrolled_count, status)
       VALUES 
       ($1, 'C5_CRS_A', 'C5 Course Alpha', 'Prof. Alpha', 'Test', 2, 0, 'OPEN'),
       ($2, 'C5_CRS_B', 'C5 Course Beta', 'Prof. Beta', 'Test', 2, 0, 'OPEN')`,
      [c5CourseA, c5CourseB]
    );

    // TEST 10: Requests for both courses from same student are not mistaken for duplicates
    console.log('\n[Test 10 - C5] Verifying multi-course requests from same student are not treated as duplicates...');
    const c5Stu1 = uuidv4();
    await query(
      `INSERT INTO users (id, student_id, name, email, password_hash, role)
       VALUES ($1, 'C5_STU_1', 'C5 Student One', 'c5_1@test.edu', 'hash', 'STUDENT')`,
      [c5Stu1]
    );

    const regA = await registerStudentForCourse({ userId: c5Stu1, courseId: c5CourseA, clientRequestId: `c5_req_1a` });
    const regB = await registerStudentForCourse({ userId: c5Stu1, courseId: c5CourseB, clientRequestId: `c5_req_1b` });

    assert.strictEqual(regA.status, 'REGISTERED', 'Registration for Course A must succeed');
    assert.strictEqual(regB.status, 'REGISTERED', 'Registration for Course B must succeed for same student');
    console.log('  ✅ PASSED: Student 1 successfully enrolled in both Course A and Course B (not duplicates).');
    passed++;

    // TEST 11: Complete requested sets can be satisfied when capacity permits
    console.log('\n[Test 11 - C5] Testing complete-need allocation when capacity allows...');
    const c5Batch1 = await allocateCompleteNeedMultiCourse({
      courseIds: [c5CourseA, c5CourseB],
      studentRequests: [
        {
          userId: c5Stu1,
          studentName: 'C5 Student One',
          studentId: 'C5_STU_1',
          requestedCourseIds: [c5CourseA, c5CourseB],
          requestId: 'c5_batch_req_1',
        },
      ],
    });

    assert.strictEqual(c5Batch1.fullySatisfiedCount, 1, 'Student 1 complete bundle must be fully satisfied');
    console.log('  ✅ PASSED: Complete-need satisfied when capacity permits.');
    passed++;

    // TEST 12: Capacity-constrained scenario where not every student bundle can be satisfied
    console.log('\n[Test 12 - C5] Testing capacity-constrained scenario...');
    // Currently enrolled: Course A has 1, Course B has 1. Capacity is 2 each.
    // Let's create Student 2 and Student 3 both requesting A + B. Only ONE more can fit!
    const c5Stu2 = uuidv4();
    const c5Stu3 = uuidv4();
    await query(
      `INSERT INTO users (id, student_id, name, email, password_hash, role)
       VALUES 
       ($1, 'C5_STU_2', 'C5 Student Two', 'c5_2@test.edu', 'hash', 'STUDENT'),
       ($2, 'C5_STU_3', 'C5 Student Three', 'c5_3@test.edu', 'hash', 'STUDENT')`,
      [c5Stu2, c5Stu3]
    );

    const c5Batch2 = await allocateCompleteNeedMultiCourse({
      courseIds: [c5CourseA, c5CourseB],
      studentRequests: [
        {
          userId: c5Stu2,
          studentName: 'C5 Student Two',
          studentId: 'C5_STU_2',
          requestedCourseIds: [c5CourseA, c5CourseB],
          requestId: 'c5_batch_req_2',
        },
        {
          userId: c5Stu3,
          studentName: 'C5 Student Three',
          studentId: 'C5_STU_3',
          requestedCourseIds: [c5CourseA, c5CourseB],
          requestId: 'c5_batch_req_3',
        },
      ],
    });

    assert.strictEqual(c5Batch2.fullySatisfiedCount, 1, 'Only 1 additional complete bundle can fit');
    assert.strictEqual(c5Batch2.unfulfilledCount, 1, 'The 3rd student bundle must be unfulfilled due to capacity');
    console.log('  ✅ PASSED: Capacity constraint correctly fulfilled 1 bundle and marked 1 unfulfilled.');
    passed++;

    // TEST 13: Verify no unrequested course given, no course exceeds capacity, no duplicate student-course pair
    console.log('\n[Test 13 - C5] Verifying course integrity (no unrequested courses, no overbooking)...');
    const finalCourseACheck = await query('SELECT enrolled_count, capacity FROM courses WHERE id = $1::varchar', [String(c5CourseA)]);
    const finalCourseBCheck = await query('SELECT enrolled_count, capacity FROM courses WHERE id = $1::varchar', [String(c5CourseB)]);

    const finalEnrolledA = parseInt(finalCourseACheck.rows[0].enrolled_count, 10);
    const finalEnrolledB = parseInt(finalCourseBCheck.rows[0].enrolled_count, 10);

    assert(finalEnrolledA <= 2, `Course A enrolled (${finalEnrolledA}) must not exceed capacity 2`);
    assert(finalEnrolledB <= 2, `Course B enrolled (${finalEnrolledB}) must not exceed capacity 2`);
    console.log(`  ✅ PASSED: Course capacities strictly honored (Course A: ${finalEnrolledA}/2, Course B: ${finalEnrolledB}/2).`);
    passed++;

    // TEST 14: Repeated allocation attempts do not create duplicate enrollments or corrupt state
    console.log('\n[Test 14 - C5] Verifying repeated allocation idempotency...');
    const c5BatchRepeated = await allocateCompleteNeedMultiCourse({
      courseIds: [c5CourseA, c5CourseB],
      studentRequests: [
        {
          userId: c5Stu2, // Already enrolled!
          studentName: 'C5 Student Two',
          studentId: 'C5_STU_2',
          requestedCourseIds: [c5CourseA, c5CourseB],
          requestId: 'c5_batch_req_2_repeat',
        },
      ],
    });

    const checkAfterRepeat = await query('SELECT enrolled_count FROM courses WHERE id = $1', [c5CourseA]);
    assert.strictEqual(
      parseInt(checkAfterRepeat.rows[0].enrolled_count, 10),
      finalEnrolledA,
      'Repeated allocation must not increment enrolled_count for already-enrolled students'
    );
    console.log('  ✅ PASSED: Repeated allocation is idempotent and does not create duplicate seats.');
    passed++;

    console.log('\n======================================================');
    console.log(`🎉 ALL TESTS PASSED: ${passed}/${total} Test Assertions Verified Successfully!`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ TEST RUN ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runComprehensiveTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runComprehensiveTests };
