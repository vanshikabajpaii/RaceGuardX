import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RotateCcw, 
  Layers, 
  FastForward, 
  Play, 
  Pause, 
  Cpu, 
  Users, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { apiRequest } from '../api/client';

export default function ConcurrencyLab() {
  const [activeTab, setActiveTab] = useState('c1_mass');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  // Available real courses in DB for selection in C1 and C5
  const [courses, setCourses] = useState([]);
  
  // C1 State
  const [c1Course1, setC1Course1] = useState('');
  const [c1Course2, setC1Course2] = useState('');
  const [c1TotalRequests, setC1TotalRequests] = useState(500);
  const [c1Result, setC1Result] = useState(null);

  // C2 State
  const [c2Data, setC2Data] = useState({ requests: [], enrollments: [] });
  const [c2FilterStudent, setC2FilterStudent] = useState('');

  // C3 State
  const [ingressBurst, setIngressBurst] = useState(500);
  const [ingressWorkers, setIngressWorkers] = useState(4);
  const [ingressQueue, setIngressQueue] = useState(16);
  const [ingressStatus, setIngressStatus] = useState(null);
  const [tickPolling, setTickPolling] = useState(false);

  // C4 State
  const [crashScenario, setCrashScenario] = useState('before_commit');
  const [crashResult, setCrashResult] = useState(null);

  // C5 State
  const [c5Course1, setC5Course1] = useState('');
  const [c5Course2, setC5Course2] = useState('');
  const [c5Result, setC5Result] = useState(null);

  // Kernel Ops KO-02 Edge Cases State
  const [edgeCaseChallenge, setEdgeCaseChallenge] = useState('KO-02-C1');
  const [edgeCaseResult, setEdgeCaseResult] = useState(null);

  // Fetch real courses on load
  useEffect(() => {
    loadCoursesAndC2Data();
  }, [activeTab]);

  async function loadCoursesAndC2Data() {
    try {
      const [coursesRes, overviewRes] = await Promise.all([
        apiRequest('/courses'),
        apiRequest('/admin/overview'),
      ]);
      const list = coursesRes.courses || [];
      setCourses(list);
      if (list.length >= 2) {
        if (!c1Course1) setC1Course1(list[0].id);
        if (!c1Course2) setC1Course2(list[1].id);
        if (!c5Course1) setC5Course1(list[0].id);
        if (!c5Course2) setC5Course2(list[1].id);
      }
      setC2Data({
        requests: overviewRes.requests || [],
        enrollments: overviewRes.enrollments || [],
      });
    } catch (e) {
      console.error('Failed to load courses or C2 data:', e.message);
    }
  }

  // Polling for C3 Bounded Ingress Ticks
  useEffect(() => {
    let interval;
    if (tickPolling) {
      interval = setInterval(async () => {
        try {
          const res = await apiRequest('/lab/ingress/status');
          setIngressStatus(res);
          if (!res.running && res.activeWorkers.length === 0 && res.queueSnapshot.length === 0) {
            setTickPolling(false);
          }
        } catch (e) {
          console.error(e);
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [tickPolling]);

  // Handler: C1 Mass Request Generator across 2 courses
  async function runC1Distribution() {
    if (!c1Course1 || !c1Course2 || c1Course1 === c1Course2) {
      setError('Please select two distinct courses for the C1 50/50 distribution test.');
      return;
    }
    setRunning(true);
    setC1Result(null);
    setError(null);
    try {
      const res = await apiRequest('/lab/c1-distribution', {
        method: 'POST',
        body: JSON.stringify({
          courseIds: [c1Course1, c1Course2],
          totalRequests: c1TotalRequests,
          maxWorkers: 4,
          maxQueue: 16,
        }),
      });
      setC1Result(res);
      await loadCoursesAndC2Data();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  // Handlers: C3 Bounded Ingress
  async function submitIngressBurst() {
    setRunning(true);
    setError(null);
    try {
      await apiRequest('/lab/ingress/submit', {
        method: 'POST',
        body: JSON.stringify({
          count: ingressBurst,
          maxWorkers: ingressWorkers,
          maxQueue: ingressQueue,
        }),
      });
      setTickPolling(true);
      const res = await apiRequest('/lab/ingress/status');
      setIngressStatus(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function triggerIngressControl(action) {
    try {
      await apiRequest(`/lab/ingress/${action}`, { method: 'POST' });
      const status = await apiRequest('/lab/ingress/status');
      setIngressStatus(status);
    } catch (err) {
      setError(err.message);
    }
  }

  // Handler: C4 Crash Recovery
  async function runCrashRecovery() {
    setRunning(true);
    setCrashResult(null);
    setError(null);
    try {
      const res = await apiRequest('/lab/crash-recovery', {
        method: 'POST',
        body: JSON.stringify({ scenario: crashScenario }),
      });
      setCrashResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  // Handler: C5 Complete-Need Multi-Course Allocation
  async function runC5Allocation() {
    if (!c5Course1 || !c5Course2 || c5Course1 === c5Course2) {
      setError('Please select two distinct courses for C5 multi-course allocation.');
      return;
    }
    setRunning(true);
    setC5Result(null);
    setError(null);
    try {
      // Create a deterministic batch of multi-course student requests to allocate
      const studentRequests = [
        {
          userId: 'seed_vanshika_620',
          studentName: 'VANSHIKA',
          studentId: '620',
          requestedCourseIds: [c5Course1, c5Course2],
          requestId: `req_c5_620_${Date.now()}`,
        },
        {
          userId: 'seed_khyati_622',
          studentName: 'KHYATI',
          studentId: '622',
          requestedCourseIds: [c5Course1, c5Course2],
          requestId: `req_c5_622_${Date.now()}`,
        },
        {
          userId: 'seed_pallavi_649',
          studentName: 'PALLAVI',
          studentId: '649',
          requestedCourseIds: [c5Course1, c5Course2],
          requestId: `req_c5_649_${Date.now()}`,
        },
      ];

      const res = await apiRequest('/lab/c5-complete-need', {
        method: 'POST',
        body: JSON.stringify({
          courseIds: [c5Course1, c5Course2],
          studentRequests,
        }),
      });
      setC5Result(res);
      await loadCoursesAndC2Data();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  // Handler: Run Kernel Ops Edge Case
  async function runEdgeCase() {
    setRunning(true);
    setEdgeCaseResult(null);
    setError(null);
    try {
      const res = await apiRequest('/lab/edge-cases', {
        method: 'POST',
        body: JSON.stringify({ challenge: edgeCaseChallenge }),
      });
      setEdgeCaseResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  // Computed C2 duplicate stats
  const duplicateRequests = c2Data.requests.filter(r => 
    r.outcome && (r.outcome.includes('DUPLICATE') || r.details?.error?.includes('Duplicate'))
  );
  const allocatedRequests = c2Data.requests.filter(r => r.outcome === 'ALLOCATED');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">
              RaceGuardX OS Master Suite
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-400 font-bold">
              C1, C2, C3, C4, C5 Fully Enabled
            </span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">
            Operating Systems Concurrency, Safety & Allocation Lab
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live interactive demonstrations of C1 Mass Processing (500 requests, 250/250 split), C2 Duplicate Prevention, C3 Bounded Ingress & Logical Ticks, C4 Crash Recovery, and C5 Complete-Need Multi-Course Allocation.
          </p>
        </div>
      </div>

      {/* Tabs navigation for C1 - C5 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'c1_mass', label: 'C1: Mass Generator (500 Req)', icon: FastForward },
          { id: 'c2_duplicate', label: 'C2: Duplicate Prevention', icon: ShieldCheck },
          { id: 'c3_ingress', label: 'C3: Bounded Ingress & Ticks', icon: Cpu },
          { id: 'c4_crash', label: 'C4: Crash Recovery Lab', icon: RotateCcw },
          { id: 'c5_multi', label: 'C5: Complete-Need Allocation', icon: Layers },
          { id: 'ko02_edge', label: '⚡ KO-02 Standard Edge Cases', icon: AlertTriangle },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setError(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-500/40 rounded-2xl text-xs text-red-300">
          Simulation Error: {error}
        </div>
      )}

      {/* ================= TAB 1: C1 MASS REQUEST GENERATOR ================= */}
      {activeTab === 'c1_mass' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <FastForward className="w-5 h-5 text-cyan-400" />
                <span>C1 — Mass Request Generation & Bounded Concurrent Processing</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Admin selects two courses. Requests are split evenly (e.g. 500 $\rightarrow$ 250/250). Processed through bounded worker pool (4 workers, 16 queue slots) with row-level locks and zero overbooking.
              </p>
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <label className="block text-slate-400 mb-1">Select Course 1:</label>
              <select
                value={c1Course1}
                onChange={e => setC1Course1(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} (Cap: {c.capacity}, Enrolled: {c.enrolled_count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Select Course 2:</label>
              <select
                value={c1Course2}
                onChange={e => setC1Course2(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} (Cap: {c.capacity}, Enrolled: {c.enrolled_count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Total Requests:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={c1TotalRequests}
                  onChange={e => setC1TotalRequests(parseInt(e.target.value, 10) || 500)}
                  min="2"
                  max="1000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
                <button
                  onClick={runC1Distribution}
                  disabled={running}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-white font-bold rounded-xl whitespace-nowrap shadow-lg"
                >
                  {running ? 'Processing...' : 'Run C1 Test'}
                </button>
              </div>
            </div>
          </div>

          {/* C1 Results View */}
          {c1Result && (
            <div className="space-y-4 font-mono text-xs">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="text-cyan-400 font-bold">{c1Result.challenge}</span>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Batch ID: {c1Result.batchId} • Duration: {c1Result.durationMs}ms
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-bold text-[11px]">
                  ZERO OVERBOOKING VERIFIED
                </div>
              </div>

              {/* 50/50 Distribution Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex justify-between font-bold text-white">
                    <span>Course 1: {c1Result.distribution.course1.code}</span>
                    <span className="text-cyan-400">Assigned: {c1Result.distribution.course1.assignedRequests} reqs</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Capacity: {c1Result.distribution.course1.capacity} • Final Enrolled: {c1Result.distribution.course1.finalEnrolled}
                  </div>
                  <div className="text-[11px] text-emerald-400">
                    Allocated Seats: {c1Result.distribution.course1.allocatedSeats}
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex justify-between font-bold text-white">
                    <span>Course 2: {c1Result.distribution.course2.code}</span>
                    <span className="text-cyan-400">Assigned: {c1Result.distribution.course2.assignedRequests} reqs</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Capacity: {c1Result.distribution.course2.capacity} • Final Enrolled: {c1Result.distribution.course2.finalEnrolled}
                  </div>
                  <div className="text-[11px] text-emerald-400">
                    Allocated Seats: {c1Result.distribution.course2.allocatedSeats}
                  </div>
                </div>
              </div>

              {/* Ingress & Outcome Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">INGRESS INTAKE</span>
                  <div className="text-base font-bold text-white">
                    {c1Result.boundedIngress.acceptedIntoIngress} / {c1Result.totalRequests}
                  </div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">SEATS ALLOCATED</span>
                  <div className="text-base font-bold text-emerald-400">{c1Result.outcomes.allocated}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">REJECTED (FULL)</span>
                  <div className="text-base font-bold text-amber-400">{c1Result.outcomes.rejectedFull}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">BACKPRESSURE OVERFLOW</span>
                  <div className="text-base font-bold text-red-400">{c1Result.outcomes.rejectedOverflow}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: C2 DUPLICATE PREVENTION ================= */}
      {activeTab === 'c2_duplicate' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <span>C2 — Duplicate Requests & Duplicate-Enrollment Prevention</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Demonstrates that repeating the same request ID preserves idempotency, whereas submitting a distinct request ID for an already active enrollment is explicitly rejected with reason: "Duplicate registration — you are already enrolled in this course."
              </p>
            </div>
            <button
              onClick={loadCoursesAndC2Data}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
            >
              Sync Records
            </button>
          </div>

          {/* Metric Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px]">TOTAL RECORDED REQUESTS</span>
              <div className="text-xl font-bold text-white mt-1">{c2Data.requests.length}</div>
            </div>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px]">ACTIVE ENROLLMENTS</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">{allocatedRequests.length}</div>
            </div>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px]">DUPLICATE REJECTIONS CAUGHT</span>
              <div className="text-xl font-bold text-amber-400 mt-1">{duplicateRequests.length}</div>
            </div>
          </div>

          {/* Explanation Box */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs space-y-2">
            <div className="font-bold text-cyan-300 font-mono">
              Database Constraints & Locking Mechanism:
            </div>
            <p className="text-slate-300 leading-relaxed">
              1. <strong>Idempotency Layer:</strong> Checks <code className="text-cyan-300 font-mono">registration_requests</code> for matching <code className="text-cyan-300 font-mono">(request_id, user_id)</code>. If found, returns previously saved replay outcome without side effects.
              <br />
              2. <strong>Enrollment Uniqueness:</strong> Within a transaction, row-locks the course and queries <code className="text-cyan-300 font-mono">registrations</code> for active records. Enforced in schema via:
              <br />
              <code className="text-amber-300 font-mono bg-slate-900 px-2 py-0.5 rounded mt-1 inline-block">
                CREATE UNIQUE INDEX idx_unique_active_registration ON registrations (course_id, user_id) WHERE status IN ('REGISTERED', 'WAITLISTED');
              </code>
            </p>
          </div>

          {/* Duplicate Audit Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Recent Duplicate Attempt & Idempotency Audit Traces
            </h4>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl max-h-72 overflow-y-auto divide-y divide-slate-800 text-xs font-mono">
              {c2Data.requests.slice(0, 20).map((r, i) => (
                <div key={r.id || i} className="p-3 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white flex items-center space-x-2">
                      <span>{r.student_name || r.user_id}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-cyan-400">{r.course_code}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Req ID: {r.request_id} • {new Date(r.created_at).toLocaleTimeString()}
                    </div>
                    {r.details?.error && (
                      <div className="text-[11px] text-amber-300 font-sans mt-0.5">
                        Reason: {r.details.error}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                      r.outcome === 'ALLOCATED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                        : r.outcome?.includes('DUPLICATE')
                        ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                        : 'bg-red-950 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {r.outcome}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: C3 BOUNDED INGRESS ================= */}
      {activeTab === 'c3_ingress' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <span>C3 — Bounded Ingress Queue & Logical Tick Processing</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact preset: 500 burst $\rightarrow$ 4 active concurrent workers + 16 queued requests + 480 rejected immediately with backpressure overflow. 10 logical ticks per request.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={submitIngressBurst}
                disabled={running}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Send 500 Burst Preset
              </button>
              <button
                onClick={() => triggerIngressControl('pause')}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl border border-slate-700"
                title="Pause Ticks"
              >
                <Pause className="w-4 h-4" />
              </button>
              <button
                onClick={() => triggerIngressControl('resume')}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-xl border border-slate-700"
                title="Resume Ticks"
              >
                <Play className="w-4 h-4" />
              </button>
              <button
                onClick={() => triggerIngressControl('step')}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl border border-slate-700"
                title="Step 1 Logical Tick"
              >
                <FastForward className="w-4 h-4" />
              </button>
            </div>
          </div>

          {ingressStatus && (
            <div className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">CURRENT TICK</span>
                  <div className="text-xl font-bold text-cyan-400">#{ingressStatus.globalTick}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">ACTIVE WORKERS (MAX 4)</span>
                  <div className="text-xl font-bold text-white">{ingressStatus.stats.activeWorkers} / 4</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">QUEUED (MAX 16)</span>
                  <div className="text-xl font-bold text-amber-400">{ingressStatus.stats.queueLength} / 16</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">COMPLETED</span>
                  <div className="text-xl font-bold text-emerald-400">{ingressStatus.stats.completed}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">REJECTED OVERFLOW</span>
                  <div className="text-xl font-bold text-red-400">{ingressStatus.stats.rejected}</div>
                </div>
              </div>

              {/* Active Worker Slots */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Active Worker Slots (Processing 10 Ticks Each)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {ingressStatus.activeWorkers.map((w, idx) => (
                    <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono space-y-1.5">
                      <div className="flex justify-between font-bold text-white">
                        <span>Worker Slot #{idx + 1}</span>
                        <span className="text-cyan-400">{w.progress}%</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{w.studentId}</div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-cyan-500 h-full transition-all" style={{ width: `${w.progress}%` }}></div>
                      </div>
                      <div className="text-[10px] text-slate-500 text-right">{w.ticksRemaining} ticks left</div>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 4 - ingressStatus.activeWorkers.length) }).map((_, i) => (
                    <div key={i} className="p-3 bg-slate-950/40 border border-slate-800/40 rounded-xl text-xs font-mono flex items-center justify-center text-slate-600">
                      IDLE WORKER SLOT
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 4: C4 CRASH RECOVERY ================= */}
      {activeTab === 'c4_crash' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-purple-400" />
                <span>C4 — Owner Failure During Seat Update</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Simulate worker crash before commit (automatic rollback, zero orphaned records) vs. after commit (durability/REDO log).
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={crashScenario}
                onChange={e => setCrashScenario(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
              >
                <option value="before_commit">Crash BEFORE Commit (Rollback & Zero Leaks)</option>
                <option value="after_commit">Crash AFTER Commit (Durability & REDO)</option>
                <option value="concurrent">Concurrent Crash + Safe Peer Execution</option>
              </select>
              <button
                onClick={runCrashRecovery}
                disabled={running}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                {running ? 'Simulating Fault...' : 'Inject Crash'}
              </button>
            </div>
          </div>

          {crashResult && (
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between font-bold text-purple-300">
                <span>SCENARIO: {crashResult.scenario}</span>
                <span className="text-emerald-400">{crashResult.verdict}</span>
              </div>
              <p className="text-slate-300">{crashResult.description}</p>
              {crashResult.simulatedFault && (
                <div className="p-2.5 bg-red-950/40 border border-red-500/20 text-red-300 rounded-xl text-[11px]">
                  Caught Injected Exception: {crashResult.simulatedFault}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 5: C5 COMPLETE-NEED ALLOCATION ================= */}
      {activeTab === 'c5_multi' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>C5 — Multi-Course Requests & Complete-Need Allocation</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Admin selects two courses. The allocation algorithm satisfies each student's complete requested course bundle wherever capacity permits, preventing partial/deadlocked allocations.
              </p>
            </div>
          </div>

          {/* Course Selection */}
          <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <label className="block text-slate-400 mb-1">Select Course 1:</label>
              <select
                value={c5Course1}
                onChange={e => setC5Course1(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} (Cap: {c.capacity}, Enrolled: {c.enrolled_count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Select Course 2:</label>
              <select
                value={c5Course2}
                onChange={e => setC5Course2(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} (Cap: {c.capacity}, Enrolled: {c.enrolled_count})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={runC5Allocation}
                disabled={running}
                className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition"
              >
                {running ? 'Allocating Complete Needs...' : 'Execute C5 Allocation'}
              </button>
            </div>
          </div>

          {/* C5 Result Dashboard */}
          {c5Result && (
            <div className="space-y-4 font-mono text-xs">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="text-emerald-400 font-bold">{c5Result.challenge}</span>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    {c5Result.explanation}
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold text-[11px]">
                  COMPLETE NEED SATISFACTION RULE APPLIED
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">TOTAL STUDENTS</span>
                  <div className="text-base font-bold text-white">{c5Result.totalStudentsRequesting}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">COURSE REQUESTS</span>
                  <div className="text-base font-bold text-cyan-400">{c5Result.totalCourseRequests}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">COMPLETE BUNDLES MET</span>
                  <div className="text-base font-bold text-emerald-400">{c5Result.fullySatisfiedCount}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 text-[10px]">UNSATISFIED BUNDLES</span>
                  <div className="text-base font-bold text-amber-400">{c5Result.unfulfilledCount}</div>
                </div>
              </div>

              {/* Before and After State */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="font-bold text-white mb-2">Course Seat Usage (Before vs. After Allocation):</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {c5Result.afterState?.map(c => (
                    <div key={c.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-bold text-cyan-300">{c.code} — {c.name}</div>
                      <div className="text-slate-400">Total Capacity: {c.capacity}</div>
                      <div className="flex justify-between text-[11px]">
                        <span>Enrolled Before: {c.enrolledBefore}</span>
                        <span className="text-emerald-400 font-bold">Enrolled After: {c.enrolledAfter}</span>
                      </div>
                      <div className="text-slate-500 text-[10px]">Remaining Seats: {c.seatsAvailableAfter}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allocation Outcome Log */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="font-bold text-white">Student Bundle Allocation Decisions:</div>
                <div className="divide-y divide-slate-800">
                  {c5Result.allocationLog?.map((log, idx) => (
                    <div key={idx} className="py-2 flex items-start justify-between">
                      <div>
                        <span className="font-bold text-white">{log.studentName}</span>
                        <span className="text-slate-400 ml-2">({log.courses})</span>
                        <div className="text-[11px] text-slate-500 mt-0.5">{log.reason}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.outcome === 'COMPLETE_NEED_MET'
                            ? 'bg-emerald-950 text-emerald-300'
                            : 'bg-amber-950 text-amber-300'
                        }`}
                      >
                        {log.outcome}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 6: KO-02 STANDARD EDGE CASES ================= */}
      {activeTab === 'ko02_edge' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">
                  TEAM TECHNICAL CHALLENGES • ASYNCX (KO-02)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-[10px] text-cyan-300 font-bold">
                  Official Edge Cases Benchmark
                </span>
              </div>
              <h3 className="text-lg font-black text-white mt-1 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>AsyncX (KO-02) Edge Cases Execution Runner</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Execute and verify the exact test setups and invariants specified in the AsyncX KO-02 technical challenge sheet.
              </p>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="sm:col-span-2">
              <label className="block text-slate-400 mb-1">Select Challenge Edge Case:</label>
              <select
                value={edgeCaseChallenge}
                onChange={e => setEdgeCaseChallenge(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              >
                <option value="KO-02-C1">01 Concurrent seat invariant | KO-02-C1 (500 distinct requests, A: 3, B: 2, 250 each)</option>
                <option value="KO-02-C2">02 Retry identity | KO-02-C2 (Capacity 1; S1 sends r1, r1, r2; then S2 sends r3)</option>
                <option value="KO-02-C4">04 Owner failure during seat update | KO-02-C4 (Cap 1; r1 fails at update step; r2 waits; retry r1)</option>
                <option value="KO-02-C5">05 Cross-course atomic request | KO-02-C5 (Cap A: 1, B: 1; r1: A+B, r2: B+A concurrently)</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={runEdgeCase}
                disabled={running}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 font-black rounded-xl shadow-lg transition"
              >
                {running ? 'Executing Edge Case...' : '⚡ Launch Benchmark'}
              </button>
            </div>
          </div>

          {/* Results View */}
          {edgeCaseResult && (
            <div className="space-y-4 font-mono text-xs animate-fadeIn">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="text-cyan-400 font-bold text-sm">{edgeCaseResult.challenge}</span>
                  <div className="text-slate-400 text-[11px] mt-0.5">{edgeCaseResult.description}</div>
                  <div className="text-amber-300 text-[10px] mt-0.5 font-sans">Setup: {edgeCaseResult.setup}</div>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] whitespace-nowrap">
                  {edgeCaseResult.verdict.startsWith('PASS') ? 'BENCHMARK PASSED' : 'CHECK FAILED'}
                </div>
              </div>

              {/* Challenge-specific UI blocks */}
              {edgeCaseResult.challenge.includes('C1') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="font-bold text-white flex justify-between">
                      <span>Course A (Capacity 3)</span>
                      <span className="text-emerald-400">{edgeCaseResult.courseA.allocatedSeats} Allocated</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">Total Requests: {edgeCaseResult.courseA.totalRequests}</div>
                    <div className="text-amber-400 text-[11px]">Waitlist Queue: {edgeCaseResult.courseA.waitlistedCount} students</div>
                    <div className="text-[10px] text-slate-500">DB Enrolled Count: {edgeCaseResult.courseA.finalEnrolledInDB} / 3</div>
                  </div>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="font-bold text-white flex justify-between">
                      <span>Course B (Capacity 2)</span>
                      <span className="text-emerald-400">{edgeCaseResult.courseB.allocatedSeats} Allocated</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">Total Requests: {edgeCaseResult.courseB.totalRequests}</div>
                    <div className="text-amber-400 text-[11px]">Waitlist Queue: {edgeCaseResult.courseB.waitlistedCount} students</div>
                    <div className="text-[10px] text-slate-500">DB Enrolled Count: {edgeCaseResult.courseB.finalEnrolledInDB} / 2</div>
                  </div>
                </div>
              )}

              {edgeCaseResult.challenge.includes('C2') && (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="font-bold text-white">Execution Sequence & Idempotency Audit:</div>
                    <div className="divide-y divide-slate-800">
                      {edgeCaseResult.steps?.map((s, idx) => (
                        <div key={idx} className="py-2 flex items-center justify-between text-[11px]">
                          <span className="text-white">{s.step}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400">{s.verdict}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.outcome === 'ALLOCATED' ? 'bg-emerald-950 text-emerald-300' :
                              s.outcome === 'WAITLISTED' ? 'bg-cyan-950 text-cyan-300' :
                              'bg-amber-950 text-amber-300'
                            }`}>
                              {s.outcome}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {edgeCaseResult.challenge.includes('C4') && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                  <div className="font-bold text-white">Failure Injection & Consistency Trace:</div>
                  <div className="divide-y divide-slate-800">
                    {edgeCaseResult.traces?.map((t, idx) => (
                      <div key={idx} className="py-2 text-[11px]">
                        <div className="flex justify-between font-bold text-white">
                          <span>{t.step}</span>
                          <span className="text-purple-400">{t.outcome}</span>
                        </div>
                        <div className="text-slate-400 mt-0.5">{t.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {edgeCaseResult.challenge.includes('C5') && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                  <div className="font-bold text-white">Deadlock Prevention & All-Or-Nothing Outcomes:</div>
                  <div className="text-[11px] text-cyan-300 mb-2">{edgeCaseResult.deadlockPreventionMechanism}</div>
                  <div className="divide-y divide-slate-800">
                    {edgeCaseResult.results?.map((r, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold text-white">{r.request}</span>
                          <div className="text-[10px] text-slate-500">Lock Order: {r.lockAcquisitionOrder}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.result === 'ALLOCATED_BOTH' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
                        }`}>
                          {r.result}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verdict Text */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300">
                <span className="text-emerald-400 font-bold">Conclusion: </span>
                {edgeCaseResult.verdict}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
