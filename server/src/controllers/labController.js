const {
  runUnsafeSimulation,
  runGlobalLockSimulation,
  runFineGrainedSimulation,
  runFailureRollbackSimulation,
} = require('../services/concurrencyLabService');

const { runC1ConcurrentSeatInvariant } = require('../services/massRequestService');
const { ingressEngine } = require('../services/boundedIngressService');
const {
  scenarioCrashBeforeCommit,
  scenarioCrashAfterCommit,
  scenarioConcurrentCrashRecovery,
} = require('../services/crashRecoveryService');
const {
  registerAtomicMultiCourse,
  explainDeadlockPrevention,
} = require('../services/atomicMultiCourseService');

async function handleUnsafe(req, res) {
  try {
    const concurrency = parseInt(req.body.concurrency, 10) || 8;
    const capacity = parseInt(req.body.capacity, 10) || 2;
    const result = await runUnsafeSimulation({ concurrency, capacity });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Unsafe simulation failed: ' + err.message });
  }
}

async function handleGlobalLock(req, res) {
  try {
    const concurrency = parseInt(req.body.concurrency, 10) || 8;
    const capacity = parseInt(req.body.capacity, 10) || 2;
    const result = await runGlobalLockSimulation({ concurrency, capacity });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Global lock simulation failed: ' + err.message });
  }
}

async function handleFineGrained(req, res) {
  try {
    const concurrency = parseInt(req.body.concurrency, 10) || 8;
    const capacity = parseInt(req.body.capacity, 10) || 2;
    const result = await runFineGrainedSimulation({ concurrency, capacity });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Fine-grained simulation failed: ' + err.message });
  }
}

async function handleFailureRollback(req, res) {
  try {
    const result = await runFailureRollbackSimulation();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failure rollback simulation failed: ' + err.message });
  }
}

// C1: Mass Concurrency Engine
async function handleMassRequest(req, res) {
  try {
    const totalRequests = parseInt(req.body.totalRequests, 10) || 100;
    const courseCount = parseInt(req.body.courseCount, 10) || 2;
    const capacityPerCourse = parseInt(req.body.capacityPerCourse, 10) || 30;
    const mode = req.body.mode || 'FINE_GRAINED';
    const result = await runC1ConcurrentSeatInvariant({ totalRequests, courseCount, capacityPerCourse, mode });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'C1 Mass request failed: ' + err.message });
  }
}

// C3: Bounded Ingress & Logical Ticks
async function handleIngressSubmit(req, res) {
  try {
    const count = parseInt(req.body.count, 10) || 500;
    const maxWorkers = parseInt(req.body.maxWorkers, 10) || 4;
    const maxQueue = parseInt(req.body.maxQueue, 10) || 16;
    ingressEngine.reset({ maxWorkers, maxQueue });
    const result = ingressEngine.submitBatch({ count });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Ingress submission failed: ' + err.message });
  }
}

function handleIngressStatus(req, res) {
  return res.json(ingressEngine.getState());
}

function handleIngressPause(req, res) {
  return res.json(ingressEngine.pause());
}

function handleIngressResume(req, res) {
  return res.json(ingressEngine.resume());
}

function handleIngressStep(req, res) {
  return res.json(ingressEngine.step());
}

// C4: Crash Recovery Lab
async function handleCrashRecovery(req, res) {
  try {
    const scenario = req.body.scenario || 'before_commit';
    let result;
    if (scenario === 'before_commit') {
      result = await scenarioCrashBeforeCommit({ capacity: 5 });
    } else if (scenario === 'after_commit') {
      result = await scenarioCrashAfterCommit({ capacity: 5 });
    } else {
      result = await scenarioConcurrentCrashRecovery({ capacity: 3 });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Crash recovery simulation failed: ' + err.message });
  }
}

// C5: Cross-Course Atomic Lab
async function handleAtomicMultiCourse(req, res) {
  try {
    const { courseIds } = req.body;
    const userId = req.user ? req.user.id : 'demo_user';
    const result = await registerAtomicMultiCourse({ userId, courseIds });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Atomic multi-course failed: ' + err.message });
  }
}

const { runC1MassDistribution } = require('../services/c1MassDistributionService');
const { allocateCompleteNeedMultiCourse } = require('../services/c5CompleteNeedService');

// C1: Mass Request Distribution across 2 Selected Courses
async function handleC1Distribution(req, res) {
  try {
    const { courseIds, totalRequests, maxWorkers, maxQueue } = req.body;
    if (!courseIds || courseIds.length !== 2) {
      return res.status(400).json({ error: 'Please select exactly 2 courses for C1 mass distribution.' });
    }
    const result = await runC1MassDistribution({
      courseIds,
      totalRequests: parseInt(totalRequests, 10) || 500,
      maxWorkers: maxWorkers ? parseInt(maxWorkers, 10) : 4,
      maxQueue: maxQueue ? parseInt(maxQueue, 10) : 16,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'C1 mass distribution failed: ' + err.message });
  }
}

// C5: Complete-Need Multi-Course Allocation
async function handleC5Allocation(req, res) {
  try {
    const { courseIds, studentRequests } = req.body;
    if (!courseIds || courseIds.length < 2) {
      return res.status(400).json({ error: 'Please select at least 2 courses for C5 multi-course allocation.' });
    }
    const result = await allocateCompleteNeedMultiCourse({
      courseIds,
      studentRequests,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'C5 complete-need allocation failed: ' + err.message });
  }
}

function handleDeadlockExplain(req, res) {
  const courseIds = req.body?.courseIds || ['COURSE_MATH', 'COURSE_PHYSICS', 'COURSE_CS'];
  return res.json(explainDeadlockPrevention(courseIds));
}

const {
  runEdgeCaseC1,
  runEdgeCaseC2,
  runEdgeCaseC4,
  runEdgeCaseC5,
} = require('../services/edgeCasesService');

async function handleRunEdgeCase(req, res) {
  try {
    const { challenge } = req.body;
    let result;
    if (challenge === 'KO-02-C1' || challenge === 'C1') {
      result = await runEdgeCaseC1();
    } else if (challenge === 'KO-02-C2' || challenge === 'C2') {
      result = await runEdgeCaseC2();
    } else if (challenge === 'KO-02-C4' || challenge === 'C4') {
      result = await runEdgeCaseC4();
    } else if (challenge === 'KO-02-C5' || challenge === 'C5') {
      result = await runEdgeCaseC5();
    } else {
      return res.status(400).json({ error: 'Unknown challenge identifier. Use KO-02-C1, KO-02-C2, KO-02-C4, or KO-02-C5.' });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Edge case simulation failed: ' + err.message });
  }
}

module.exports = {
  handleUnsafe,
  handleGlobalLock,
  handleFineGrained,
  handleFailureRollback,
  handleMassRequest,
  handleIngressSubmit,
  handleIngressStatus,
  handleIngressPause,
  handleIngressResume,
  handleIngressStep,
  handleCrashRecovery,
  handleAtomicMultiCourse,
  handleDeadlockExplain,
  handleC1Distribution,
  handleC5Allocation,
  handleRunEdgeCase,
};
