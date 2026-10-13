import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  UserCheck, 
  XCircle,
  Hash,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function StudentDashboard({ activeTab, setActiveTab }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [requestHistory, setRequestHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registeringCourseId, setRegisteringCourseId] = useState(null);
  const [cancellingRegId, setCancellingRegId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const [coursesData, statusData] = await Promise.all([
        apiRequest('/courses'),
        apiRequest('/registrations/my-status'),
      ]);
      setCourses(coursesData.courses || []);
      setMyRegistrations(statusData.registrations || []);
      setRequestHistory(statusData.requests || []);
    } catch (err) {
      console.error('Failed to load student data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Safe Registration Handler with Idempotency UUID
  async function handleRegister(courseId) {
    if (registeringCourseId) return; // Debounce repeated rapid clicks

    setRegisteringCourseId(courseId);
    setFeedback(null);

    // Client-generated idempotency key
    const clientRequestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await apiRequest('/registrations', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          requestId: clientRequestId,
        }),
      });

      setFeedback({
        type: res.status === 'REGISTERED' ? 'success' : 'warning',
        message: res.message,
        requestId: res.requestId,
        status: res.status,
        waitlistPosition: res.waitlistPosition,
      });

      // Reload fresh data from database
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setRegisteringCourseId(null);
    }
  }

  // Safe Cancellation Handler
  async function handleCancel(registrationId, courseName) {
    if (cancellingRegId) return;
    if (!window.confirm(`Are you sure you want to cancel your registration for ${courseName}?`)) return;

    setCancellingRegId(registrationId);
    setFeedback(null);

    try {
      const res = await apiRequest(`/registrations/${registrationId}/cancel`, {
        method: 'POST',
      });

      setFeedback({
        type: 'info',
        message: res.promotedStudent
          ? `Cancelled. Earliest waitlisted student (${res.promotedStudent.name}) was automatically promoted to this seat!`
          : 'Registration successfully cancelled.',
      });

      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setCancellingRegId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-6 bg-slate-900/80 border border-slate-800 rounded-3xl shadow-xl backdrop-blur-md">
        <div>
          <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">
            Student Registration Portal
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            Welcome back, {user.name}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Student ID: <span className="font-mono text-cyan-300 font-bold">{user.studentId}</span> • Database-backed atomic seat allocation
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync State</span>
        </button>
      </div>

      {/* Transaction Outcome Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-start space-x-3 text-xs animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : feedback.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : feedback.type === 'info'
              ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />}
          {feedback.type === 'warning' && <Clock className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />}
          {feedback.type === 'info' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-cyan-400 mt-0.5" />}
          {feedback.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />}
          <div className="flex-1">
            <div className="font-bold text-sm">{feedback.message}</div>
            {feedback.requestId && (
              <div className="mt-1 font-mono text-[11px] opacity-80">
                Transaction Request ID: <span className="underline">{feedback.requestId}</span>
                {feedback.waitlistPosition && ` • Position in Queue: #${feedback.waitlistPosition}`}
              </div>
            )}
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Tab View */}
      {activeTab === 'courses' ? (
        /* ================= COURSE CATALOG ================= */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <span>Available Courses</span>
              </h3>
              <p className="text-xs text-slate-400">
                Live seat counters synchronized with PostgreSQL transactions
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
              {courses.length} courses listed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map(course => {
              const isRegistered = course.user_registration_status === 'REGISTERED';
              const isWaitlisted = course.user_registration_status === 'WAITLISTED';
              const isClosed = course.status === 'CLOSED';
              const isFull = course.available_seats === 0;

              return (
                <div
                  key={course.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800">
                        {course.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isClosed
                            ? 'bg-red-950/60 border-red-500/40 text-red-300'
                            : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {course.status}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-white mt-3 line-clamp-1">
                      {course.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Instructor: <span className="text-slate-300 font-semibold">{course.instructor}</span>
                    </p>

                    <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 min-h-[2rem]">
                      {course.description || 'No description provided.'}
                    </p>

                    {/* Capacity Indicator */}
                    <div className="mt-4 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Seat Capacity:</span>
                        <span className="font-mono font-bold text-slate-200">
                          {course.enrolled_count} / {course.capacity}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isFull
                              ? 'bg-amber-500'
                              : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                          }`}
                          style={{
                            width: `${Math.min(100, (course.enrolled_count / course.capacity) * 100)}%`,
                          }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className={course.available_seats > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                          {course.available_seats > 0 ? `${course.available_seats} seats remaining` : 'Capacity Full'}
                        </span>
                        {course.waitlist_count > 0 && (
                          <span className="text-slate-400">
                            Waitlist: {course.waitlist_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80">
                    {isRegistered ? (
                      <div className="space-y-2">
                        <div className="w-full py-2 px-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center justify-center space-x-1.5 text-xs font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Registered (Seat Confirmed)</span>
                        </div>
                        <button
                          onClick={() => handleRegister(course.id)}
                          disabled={registeringCourseId === course.id}
                          className="w-full py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-[11px] font-mono font-semibold transition"
                          title="Submit a new request ID to test C2 duplicate registration rejection"
                        >
                          {registeringCourseId === course.id ? 'Submitting...' : '⚡ Test Duplicate Attempt (C2)'}
                        </button>
                      </div>
                    ) : isWaitlisted ? (
                      <div className="space-y-2">
                        <div className="w-full py-2 px-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl flex items-center justify-center space-x-1.5 text-xs font-bold font-mono">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <span>Waitlist Position #{course.user_waitlist_position}</span>
                        </div>
                        <button
                          onClick={() => handleRegister(course.id)}
                          disabled={registeringCourseId === course.id}
                          className="w-full py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-[11px] font-mono font-semibold transition"
                          title="Submit a new request ID to test C2 duplicate waitlist rejection"
                        >
                          {registeringCourseId === course.id ? 'Submitting...' : '⚡ Test Duplicate Attempt (C2)'}
                        </button>
                      </div>
                    ) : isClosed ? (
                      <button
                        disabled
                        className="w-full py-2.5 px-3 bg-slate-800 text-slate-500 rounded-xl text-xs font-bold cursor-not-allowed"
                      >
                        Registration Closed
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRegister(course.id)}
                        disabled={registeringCourseId === course.id}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold shadow-lg flex items-center justify-center space-x-1.5 transition ${
                          isFull
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20'
                        } disabled:opacity-50`}
                      >
                        {registeringCourseId === course.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Processing Request...</span>
                          </>
                        ) : isFull ? (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            <span>Join FIFO Waitlist</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Register for Seat</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ================= MY REGISTRATIONS & WAITLIST ================= */
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>My Active Registrations & Waitlist State</span>
            </h3>
            <p className="text-xs text-slate-400">
              Guaranteed isolation: Only your personal registration records and positions are shown
            </p>
          </div>

          {/* Registrations Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {myRegistrations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                You have not registered for any courses yet. Browse the Course Catalog to register.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-['JetBrains_Mono']">
                    <tr>
                      <th className="py-3.5 px-4">Course</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Waitlist Order</th>
                      <th className="py-3.5 px-4">Request ID</th>
                      <th className="py-3.5 px-4">Timestamp</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {myRegistrations.map(reg => (
                      <tr key={reg.registration_id} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-4">
                          <div className="font-bold text-white text-sm">{reg.course_code}</div>
                          <div className="text-xs text-slate-400">{reg.course_name}</div>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-[10px] border ${
                              reg.status === 'REGISTERED'
                                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                                : reg.status === 'WAITLISTED'
                                ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {reg.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono">
                          {reg.status === 'WAITLISTED' ? (
                            <span className="font-bold text-amber-400">#{reg.waitlist_position} in line</span>
                          ) : reg.status === 'REGISTERED' ? (
                            <span className="text-emerald-400 font-semibold">Seat Allocated</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400 text-[11px]">
                          {reg.request_id}
                        </td>
                        <td className="py-4 px-4 text-slate-400 text-[11px]">
                          {new Date(reg.created_at).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {reg.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancel(reg.registration_id, reg.course_code)}
                              disabled={cancellingRegId === reg.registration_id}
                              className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 font-bold rounded-lg text-xs transition disabled:opacity-50"
                            >
                              {cancellingRegId === reg.registration_id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Request Audit History */}
          <div className="mt-8 space-y-3">
            <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">
              Personal Request Log & Outcomes
            </h4>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 divide-y divide-slate-800">
              {requestHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No previous request records found.</p>
              ) : (
                requestHistory.slice(0, 10).map(req => (
                  <div key={req.id} className="py-2.5 flex items-start justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">{req.course_code}</span>
                        <span className="font-mono text-slate-400 text-[10px]">({req.request_id})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(req.created_at).toLocaleTimeString()}
                      </div>
                      {req.details?.error && (
                        <div className="text-[11px] text-red-400 font-sans mt-0.5">
                          {req.details.error}
                        </div>
                      )}
                      {req.details?.status && !req.details?.error && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Registration ID: {req.details.registrationId?.substring(0, 8)}...
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0 ${
                        req.outcome === 'ALLOCATED'
                          ? 'bg-emerald-950 text-emerald-300'
                          : req.outcome === 'WAITLISTED'
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-red-950 text-red-300'
                      }`}
                    >
                      {req.outcome}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
