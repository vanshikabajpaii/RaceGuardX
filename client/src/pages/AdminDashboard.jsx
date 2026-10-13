import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  RefreshCw, 
  Search, 
  Filter, 
  Users, 
  Clock, 
  CheckCircle2, 
  BookOpen, 
  Edit3, 
  ToggleLeft, 
  ToggleRight,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { apiRequest } from '../api/client';
import CreateCourseModal from '../components/CreateCourseModal';
import EditCourseModal from '../components/EditCourseModal';

export default function AdminDashboard() {
  const [data, setData] = useState({
    courses: [],
    enrollments: [],
    requests: [],
    auditLogs: [],
  });
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  // Search & Filter State
  const [filters, setFilters] = useState({
    courseCode: '',
    studentId: '',
    requestId: '',
    status: '',
  });

  useEffect(() => {
    loadOverview();
  }, [filters]);

  async function loadOverview() {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.courseCode) queryParams.append('courseCode', filters.courseCode);
      if (filters.studentId) queryParams.append('studentId', filters.studentId);
      if (filters.requestId) queryParams.append('requestId', filters.requestId);
      if (filters.status) queryParams.append('status', filters.status);

      const res = await apiRequest(`/admin/overview?${queryParams.toString()}`);
      setData(res);
    } catch (err) {
      console.error('Failed to load admin overview:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(course) {
    const nextStatus = course.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      await apiRequest(`/courses/${course.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      loadOverview();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
        <div>
          <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">
            Administrative Control Center
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            Course Management & Registration Audit
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tagline: <span className="text-cyan-300 font-semibold">"Every Request. Every Seat. Under Control."</span>
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <button
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Audit Feed</span>
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Course</span>
          </button>
        </div>
      </div>

      {/* Courses Overview Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <span>Active Courses & Capacity State</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.courses.map(course => {
            const isFull = course.enrolled_count >= course.capacity;

            return (
              <div
                key={course.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {course.code}
                    </span>
                    <button
                      onClick={() => handleToggleStatus(course)}
                      className={`flex items-center space-x-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                        course.status === 'OPEN'
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                          : 'bg-red-950/60 border-red-500/40 text-red-300 hover:bg-red-900/60'
                      }`}
                    >
                      {course.status === 'OPEN' ? (
                        <ToggleRight className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-red-400" />
                      )}
                      <span>{course.status}</span>
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-white mt-3 line-clamp-1">
                    {course.name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Instructor: <span className="text-slate-300 font-semibold">{course.instructor}</span>
                  </p>

                  {/* Seat Allocation Metrics */}
                  <div className="mt-4 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Total Seat Capacity:</span>
                      <span className="font-mono font-bold text-white">{course.capacity}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Allocated Seats:</span>
                      <span className="font-mono font-bold text-cyan-400">{course.enrolled_count}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Remaining Seats:</span>
                      <span className={`font-mono font-bold ${course.available_seats > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {course.available_seats}
                      </span>
                    </div>

                    {/* Capacity Bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${
                          isFull
                            ? 'bg-amber-500'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (course.enrolled_count / course.capacity) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => setEditingCourse(course)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Edit Capacity & Settings</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span>Search & Filter Registration State</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <input
              type="text"
              placeholder="Filter by Course Code (e.g. OS401)"
              value={filters.courseCode}
              onChange={e => setFilters({ ...filters, courseCode: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 uppercase font-mono"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Filter by Student ID (e.g. 620)"
              value={filters.studentId}
              onChange={e => setFilters({ ...filters, studentId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Filter by Request ID"
              value={filters.requestId}
              onChange={e => setFilters({ ...filters, requestId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <div>
            <select
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Statuses</option>
              <option value="REGISTERED">REGISTERED</option>
              <option value="WAITLISTED">WAITLISTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Enrollments & Waitlists Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center space-x-2">
          <Users className="w-5 h-5 text-cyan-400" />
          <span>Active Students & FIFO Waitlist Queue</span>
        </h3>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          {data.enrollments.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No matching registrations found with current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-['JetBrains_Mono']">
                  <tr>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Student ID</th>
                    <th className="py-3.5 px-4">Course</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Waitlist Order</th>
                    <th className="py-3.5 px-4">Request ID</th>
                    <th className="py-3.5 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.enrollments.map(item => (
                    <tr key={item.registration_id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white">{item.student_name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-cyan-300 font-bold">
                        {item.student_id || 'N/A'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-200">{item.course_code}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] border ${
                            item.status === 'REGISTERED'
                              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                              : item.status === 'WAITLISTED'
                              ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {item.status === 'WAITLISTED' ? (
                          <span className="font-bold text-amber-400">#{item.waitlist_position}</span>
                        ) : item.status === 'REGISTERED' ? (
                          <span className="text-emerald-400">Allocated</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {item.request_id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(item.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Incoming Requests & Audit Events Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests Feed */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center space-x-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Incoming Registration Requests & Outcomes</span>
          </h4>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {data.requests.length === 0 ? (
              <p className="text-xs text-slate-500">No requests recorded yet.</p>
            ) : (
              data.requests.map(req => (
                <div key={req.id} className="py-3 flex items-start justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center space-x-2">
                      <span>{req.student_name}</span>
                      <span className="font-mono text-cyan-300">({req.student_id})</span>
                      <span className="text-slate-500">→</span>
                      <span>{req.course_code}</span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                      Req ID: {req.request_id}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
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

        {/* Audit Log Stream */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Database Transaction Audit Stream</span>
          </h4>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {data.auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No audit events logged yet.</p>
            ) : (
              data.auditLogs.map(audit => (
                <div key={audit.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 font-mono text-[11px]">
                      {audit.action}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(audit.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-300 mt-1">
                    {audit.user_name ? `${audit.user_name} (${audit.student_id || 'Admin'})` : 'System Operation'}
                    {audit.course_code && ` • Course: ${audit.course_code}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateCourseModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCourseCreated={loadOverview}
      />
      <EditCourseModal
        isOpen={!!editingCourse}
        course={editingCourse}
        onClose={() => setEditingCourse(null)}
        onCourseUpdated={loadOverview}
      />
    </div>
  );
}
