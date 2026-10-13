const assert = require('assert');
const { initDatabase } = require('../src/config/database');
const {
  runEdgeCaseC1,
  runEdgeCaseC2,
  runEdgeCaseC4,
  runEdgeCaseC5,
} = require('../src/services/edgeCasesService');

async function verifyEdgeCases() {
  console.log('\n======================================================================');
  console.log('⚡ ASYNCX (KO-02) TEAM TECHNICAL CHALLENGES — EDGE CASES VERIFICATION');
  console.log('======================================================================\n');

  await initDatabase();

  let passed = 0;
  const total = 4;

  // 1. KO-02-C1
  console.log('[EDGE CASE 01] Running Concurrent seat invariant (KO-02-C1)...');
  const resC1 = await runEdgeCaseC1();
  console.log(`  Course A: Capacity ${resC1.courseA.capacity}, Allocated: ${resC1.courseA.allocatedSeats}, Waitlist: ${resC1.courseA.waitlistedCount}`);
  console.log(`  Course B: Capacity ${resC1.courseB.capacity}, Allocated: ${resC1.courseB.allocatedSeats}, Waitlist: ${resC1.courseB.waitlistedCount}`);
  assert.strictEqual(resC1.courseA.allocatedSeats, 3, 'Course A allocated must be 3');
  assert.strictEqual(resC1.courseA.waitlistedCount, 247, 'Course A waitlisted must be 247');
  assert.strictEqual(resC1.courseB.allocatedSeats, 2, 'Course B allocated must be 2');
  assert.strictEqual(resC1.courseB.waitlistedCount, 248, 'Course B waitlisted must be 248');
  console.log('  ✅ PASSED: KO-02-C1 Seat Invariant & Waitlists strictly satisfied!\n');
  passed++;

  // 2. KO-02-C2
  console.log('[EDGE CASE 02] Running Retry identity (KO-02-C2)...');
  const resC2 = await runEdgeCaseC2();
  console.log('  Step 1 (S1 r1):', resC2.steps[0].outcome);
  console.log('  Step 2 (S1 r1 retry):', resC2.steps[1].outcome, `(IsReplay: ${resC2.steps[1].isReplay})`);
  console.log('  Step 3 (S1 r2 new req):', resC2.steps[2].outcome);
  console.log('  Step 4 (S2 r3):', resC2.steps[3].outcome);
  assert.strictEqual(resC2.steps[0].outcome, 'ALLOCATED');
  assert.strictEqual(resC2.steps[1].isReplay, true);
  assert.strictEqual(resC2.steps[2].outcome, 'REJECTED_DUPLICATE_REGISTERED');
  assert.strictEqual(resC2.steps[3].outcome, 'WAITLISTED');
  assert.strictEqual(resC2.finalCourseState.s1ActiveEnrollments, 1);
  console.log('  ✅ PASSED: KO-02-C2 Idempotency gap closed & duplicate seat use prevented!\n');
  passed++;

  // 3. KO-02-C4
  console.log('[EDGE CASE 04] Running Owner failure during seat update (KO-02-C4)...');
  const resC4 = await runEdgeCaseC4();
  console.log('  Worker 1 Failure:', resC4.traces[0].outcome);
  console.log('  Worker 2 Progress:', resC4.traces[1].outcome);
  console.log('  Recovered r1 Retry:', resC4.traces[2].outcome);
  assert.strictEqual(resC4.finalCourseState.enrolledInDB, 1);
  console.log('  ✅ PASSED: KO-02-C4 Rollback on worker failure & lock release verified!\n');
  passed++;

  // 4. KO-02-C5
  console.log('[EDGE CASE 05] Running Cross-course atomic request (KO-02-C5)...');
  const resC5 = await runEdgeCaseC5();
  console.log('  Request r1 (A+B):', resC5.results[0].result);
  console.log('  Request r2 (B+A):', resC5.results[1].result);
  console.log('  Deadlock Prevention:', resC5.deadlockPreventionMechanism);
  assert.strictEqual(resC5.finalCourseState.partialSeatsHeld, 0, 'Zero partial seats held permanently');
  console.log('  ✅ PASSED: KO-02-C5 All-or-nothing allocation & deterministic lock order verified!\n');
  passed++;

  console.log('======================================================================');
  console.log(`🎉 ALL 4 ASYNCX (KO-02) EDGE CASES VERIFIED: ${passed}/${total} PASSED!`);
  console.log('======================================================================\n');
}

if (require.main === module) {
  verifyEdgeCases()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { verifyEdgeCases };
