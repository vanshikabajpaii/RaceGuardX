import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ConcurrencyLab from './pages/ConcurrencyLab';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('courses');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center animate-pulse">
          <ShieldCheck className="w-7 h-7 text-cyan-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-white tracking-wide">RaceGuardX</p>
          <p className="text-[11px] font-mono text-cyan-400 mt-0.5">Initializing Database-Backed Session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 pb-16">
        {user.role === 'ADMIN' ? (
          activeTab === 'concurrency-lab' ? (
            <ConcurrencyLab />
          ) : (
            <AdminDashboard />
          )
        ) : (
          <StudentDashboard activeTab={activeTab} setActiveTab={setActiveTab} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-[#080c14] py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          <div>
            RaceGuardX &bull; <span className="text-cyan-400">"Every Request. Every Seat. Under Control."</span>
          </div>
          <div className="text-[11px] text-slate-600">
            PostgreSQL Relational Concurrency &bull; Row-Level Locks &bull; FIFO Waitlisting
          </div>
        </div>
      </footer>
    </div>
  );
}
