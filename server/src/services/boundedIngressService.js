/**
 * RaceGuardX — Bounded Ingress Service (C3 Challenge)
 * 
 * Implements a bounded request queue with configurable workers and queue capacity.
 * Demonstrates: ThreadPoolExecutor / BoundedQueue concepts in Node.js
 * 
 * Architecture:
 *   - MAX_WORKERS active concurrent processors (default 4)
 *   - MAX_QUEUE queued pending requests (default 16)
 *   - Beyond capacity → REJECTED immediately
 * 
 * Every request takes exactly TICKS_PER_REQUEST logical ticks to process.
 * Admin can pause / step / resume tick execution.
 */

const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

const TICKS_PER_REQUEST = 10;
const MS_PER_TICK = 200; // 200ms per tick for visualization

class BoundedIngressEngine extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset({
    maxWorkers = 4,
    maxQueue = 16,
    msPerTick = MS_PER_TICK,
  } = {}) {
    // Configuration
    this.maxWorkers = maxWorkers;
    this.maxQueue = maxQueue;
    this.msPerTick = msPerTick;
    this.ticksPerRequest = TICKS_PER_REQUEST;

    // State
    this.pendingQueue = []; // Queued requests (up to maxQueue)
    this.activeWorkers = new Map(); // requestId → worker state
    this.completedRequests = []; // Completed log
    this.rejectedRequests = []; // Rejected (overflow) log

    this.globalTick = 0;
    this.paused = false;
    this.running = false;
    this._tickInterval = null;
    this._workerSlots = 0; // Active worker count

    // Stats
    this.stats = {
      totalSubmitted: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
      activeWorkers: 0,
      queueLength: 0,
    };
  }

  /**
   * Submit a batch of requests (e.g. 500 synthetic students)
   */
  submitBatch({ count = 500, courseCode = 'CS-SIM', batchId }) {
    const submitted = [];
    const bid = batchId || `batch_${Date.now()}`;

    for (let i = 0; i < count; i++) {
      const reqId = `${bid}_req_${i}`;
      const studentId = `SIM_${1000 + i}`;
      const req = {
        id: reqId,
        studentId,
        courseCode,
        submittedAt: Date.now(),
        tick: this.globalTick,
        batchId: bid,
      };

      this.stats.totalSubmitted++;

      const queueLen = this.pendingQueue.length;
      const activeCount = this.activeWorkers.size;

      if (activeCount < this.maxWorkers) {
        // Immediately assign to a worker slot
        this._assignToWorker(req);
        this.stats.accepted++;
        submitted.push({ ...req, decision: 'PROCESSING' });
      } else if (queueLen < this.maxQueue) {
        // Queue it
        this.pendingQueue.push(req);
        this.stats.accepted++;
        this.stats.queueLength = this.pendingQueue.length;
        submitted.push({ ...req, decision: 'QUEUED' });
      } else {
        // Reject immediately
        this.stats.rejected++;
        this.rejectedRequests.push({
          ...req,
          rejectedAt: Date.now(),
          reason: 'QUEUE_OVERFLOW',
        });
        submitted.push({ ...req, decision: 'REJECTED' });
      }
    }

    // Start tick engine if not running
    if (!this.running) {
      this._startTickEngine();
    }

    return {
      batchId: bid,
      totalSubmitted: count,
      accepted: submitted.filter(r => r.decision !== 'REJECTED').length,
      rejected: submitted.filter(r => r.decision === 'REJECTED').length,
      processing: submitted.filter(r => r.decision === 'PROCESSING').length,
      queued: submitted.filter(r => r.decision === 'QUEUED').length,
      breakdown: submitted,
    };
  }

  _assignToWorker(req) {
    this._workerSlots++;
    this.stats.activeWorkers = this._workerSlots;

    const workerState = {
      request: req,
      ticksRemaining: this.ticksPerRequest,
      ticksCompleted: 0,
      startTick: this.globalTick,
      workerId: `W${this._workerSlots}`,
    };
    this.activeWorkers.set(req.id, workerState);
  }

  _startTickEngine() {
    if (this._tickInterval) return;
    this.running = true;

    this._tickInterval = setInterval(() => {
      if (this.paused) return;
      this._processTick();
    }, this.msPerTick);
  }

  _stopTickEngine() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this.running = false;
  }

  _processTick() {
    this.globalTick++;
    const completedThisTick = [];

    // Advance all active workers by 1 tick
    for (const [reqId, worker] of this.activeWorkers) {
      worker.ticksCompleted++;
      worker.ticksRemaining--;

      if (worker.ticksRemaining <= 0) {
        completedThisTick.push(reqId);
        this.completedRequests.push({
          ...worker.request,
          workerId: worker.workerId,
          startTick: worker.startTick,
          endTick: this.globalTick,
          outcome: 'COMPLETED',
          completedAt: Date.now(),
        });
        this.stats.completed++;
      }
    }

    // Remove completed workers
    for (const reqId of completedThisTick) {
      this.activeWorkers.delete(reqId);
      this._workerSlots--;
      if (this._workerSlots < 0) this._workerSlots = 0;
    }

    // Promote queued requests to freed worker slots
    while (this.activeWorkers.size < this.maxWorkers && this.pendingQueue.length > 0) {
      const nextReq = this.pendingQueue.shift();
      this._assignToWorker(nextReq);
    }

    this.stats.activeWorkers = this.activeWorkers.size;
    this.stats.queueLength = this.pendingQueue.length;

    this.emit('tick', this.getState());

    // Stop if everything is done
    if (this.activeWorkers.size === 0 && this.pendingQueue.length === 0) {
      this._stopTickEngine();
      this.emit('finished', this.getState());
    }
  }

  pause() {
    this.paused = true;
    return { paused: true, tick: this.globalTick };
  }

  resume() {
    this.paused = false;
    if (!this.running && (this.activeWorkers.size > 0 || this.pendingQueue.length > 0)) {
      this._startTickEngine();
    }
    return { paused: false, tick: this.globalTick };
  }

  step() {
    if (!this.paused) return { error: 'Engine must be paused to step manually' };
    this._processTick();
    return this.getState();
  }

  getState() {
    return {
      globalTick: this.globalTick,
      paused: this.paused,
      running: this.running,
      maxWorkers: this.maxWorkers,
      maxQueue: this.maxQueue,
      ticksPerRequest: this.ticksPerRequest,
      stats: { ...this.stats },
      activeWorkers: Array.from(this.activeWorkers.values()).map(w => ({
        requestId: w.request.id,
        studentId: w.request.studentId,
        workerId: w.workerId,
        ticksCompleted: w.ticksCompleted,
        ticksRemaining: w.ticksRemaining,
        progress: Math.round((w.ticksCompleted / this.ticksPerRequest) * 100),
      })),
      queueSnapshot: this.pendingQueue.slice(0, 20).map(r => ({
        requestId: r.id,
        studentId: r.studentId,
        tick: r.tick,
      })),
      completedCount: this.completedRequests.length,
      rejectedCount: this.rejectedRequests.length,
      recentCompleted: this.completedRequests.slice(-20),
      recentRejected: this.rejectedRequests.slice(-20),
    };
  }
}

// Singleton engine instance (per server process)
const ingressEngine = new BoundedIngressEngine();

module.exports = { ingressEngine, BoundedIngressEngine };
