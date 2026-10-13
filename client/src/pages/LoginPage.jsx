import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Lock, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('620');
  const [password, setPassword] = useState('Student@Pass123');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-configured development quick-fill demo identities
  const demoAccounts = [
    { label: 'VANSHIKA', studentId: '620', role: 'STUDENT', pass: 'Student@Pass123' },
    { label: 'KHYATI', studentId: '622', role: 'STUDENT', pass: 'Student@Pass123' },
    { label: 'PALLAVI', studentId: '649', role: 'STUDENT', pass: 'Student@Pass123' },
    { label: 'Admin', studentId: 'admin@raceguardx.edu', role: 'ADMIN', pass: 'Admin@SecurePass123' },
  ];

  async function handleLogin(e) {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(identifier, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectDemo(account) {
    setIdentifier(account.studentId);
    setPassword(account.pass);
    setError(null);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Card Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-xl shadow-cyan-500/20 mb-4 ring-1 ring-cyan-400/30">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            RaceGuard<span className="text-cyan-400">X</span>
          </h1>
          <p className="mt-1 text-sm font-medium text-cyan-400 font-['JetBrains_Mono']">
            Every Request. Every Seat. Under Control.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            High-concurrency course registration & OS synchronization platform
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-7 shadow-2xl backdrop-blur-xl">
          {error && (
            <div className="mb-5 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center space-x-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Student ID or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserCheck className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. 620, 622, 649 or admin email"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-['JetBrains_Mono'] transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-2 transition duration-150 disabled:opacity-50 text-sm"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick-Fill Demo Accounts */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>1-Click Seed Account Selector</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map(acc => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => handleSelectDemo(acc)}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    identifier === acc.studentId
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold text-white">{acc.label}</span>
                  <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                    {acc.role === 'ADMIN' ? 'Admin Role' : `ID: ${acc.studentId}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
