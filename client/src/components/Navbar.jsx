import React from 'react';
import { ShieldCheck, LogOut, User, Activity, BookOpen, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Tagline */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  RaceGuard<span className="text-cyan-400">X</span>
                </span>
                <p className="text-[11px] font-medium text-cyan-400 tracking-wide uppercase font-['JetBrains_Mono']">
                  Every Request. Every Seat. Under Control.
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          {user && (
            <div className="flex items-center space-x-3">
              {user.role === 'ADMIN' ? (
                <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setActiveTab('admin-overview')}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'admin-overview'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Admin Dashboard</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('concurrency-lab')}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'concurrency-lab'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Concurrency Lab</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setActiveTab('courses')}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'courses'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Course Catalog</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('my-registrations')}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'my-registrations'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>My Status & Waitlist</span>
                  </button>
                </div>
              )}

              {/* User Profile Pill */}
              <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-800">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-200 flex items-center justify-end space-x-1.5">
                    <span>{user.name}</span>
                    {user.studentId && (
                      <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-400 border border-cyan-800 rounded text-[10px] font-['JetBrains_Mono']">
                        ID: {user.studentId}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {user.role}
                  </span>
                </div>

                <button
                  onClick={logout}
                  title="Log out"
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
