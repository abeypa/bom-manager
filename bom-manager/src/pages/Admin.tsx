import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Shield, User, Search, Database, Briefcase,
  RefreshCw, Plus, X, Mail, Lock, UserPlus, AlertTriangle,
  CheckCircle2, Edit2, ShieldCheck, ShieldOff, Key, ChevronRight, Activity, MapPin, Code
} from 'lucide-react';
import { adminApi } from '../api/admin';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(p: any): string {
  if (p.full_name) return p.full_name;
  if (p.email) return p.email.split('@')[0];
  return 'Unknown User';
}

function initials(p: any): string {
  const name = displayName(p);
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-navy-700', 'bg-navy-500', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600',
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Create User Modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ isOpen, onClose, onSuccess }: CreateModalProps) {
  const { showToast } = useToast();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole]         = useState<'user' | 'admin'>('user');
  const [loading, setLoading]   = useState(false);

  const reset = () => { setEmail(''); setPassword(''); setFullName(''); setRole('user'); };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !fullName.trim()) {
      showToast('error', 'All fields are required');
      return;
    }
    if (password.length < 6) {
      showToast('error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const finalEmail = email.includes('@')
        ? email.trim()
        : `${email.trim()}@bepindia.com`;

      const newUser = await adminApi.createUser(finalEmail, password, fullName.trim());

      if (role === 'admin' && newUser?.id) {
        await adminApi.updateUserRole(newUser.id, 'admin');
      }

      showToast('success', `User "${fullName}" created — they can log in immediately`);
      reset();
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Failed to create user';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm transition-all duration-300">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-navy-900 rounded-2xl shadow-lg">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-navy-900 tracking-tight">Provision User</h2>
              <p className="label-caps !text-[9px] !text-tertiary mt-0.5">Initialize System Access</p>
            </div>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="btn btn-icon btn-ghost">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="label-caps !text-[10px] mb-2 px-1">Full Legal Identity</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Rishi Kumar"
                  autoFocus
                  className="input pl-11"
                />
              </div>
            </div>

            <div>
              <label className="label-caps !text-[10px] mb-2 px-1">Network Username or Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
                <input
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="rishi or rishi@bepindia.com"
                  className="input pl-11"
                />
              </div>
              {email && !email.includes('@') && (
                <p className="font-mono text-[9px] font-black text-navy-400 mt-1.5 ml-1 italic opacity-60">
                   SYSTEM-TARGET: {email.trim()}@bepindia.com
                </p>
              )}
            </div>

            <div>
              <label className="label-caps !text-[10px] mb-2 px-1">Security Credential</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="input pl-11"
                />
              </div>
            </div>

            <div>
              <label className="label-caps !text-[10px] mb-2 px-1">Privilege Tier</label>
              <div className="flex gap-3">
                {(['user', 'admin'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                      role === r
                        ? 'bg-navy-900 text-white border-navy-900 shadow-lg scale-[1.02]'
                        : 'bg-white text-tertiary border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {r === 'admin' ? <ShieldCheck size={14} /> : <User size={14} />}
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
            <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold text-emerald-800 leading-relaxed uppercase tracking-tight">
              Instant Activation: User manifest will be finalized without email confirmation. Verify all credentials before submission.
            </p>
          </div>

          <div className="flex gap-4 pt-2">
            <button type="button" onClick={() => { reset(); onClose(); }} className="btn btn-secondary flex-1 uppercase tracking-widest text-[10px]">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-lg flex-[2] text-[10px] tracking-[0.15em]">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" />PROVISION ACCOUNT</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function Admin() {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles]     = useState<any[]>([]);
  const [stats, setStats]           = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [editUser, setEditUser]         = useState<any>(null);
  const [resetPwdUser, setResetPwdUser] = useState<any>(null);

  useEffect(() => {
    document.title = 'Control Center | BOM Manager';
  }, []);

  const isAuthorized = currentUser?.email === 'abey.thomas@bepindia.com';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesData, statsData] = await Promise.all([
        adminApi.getProfiles(),
        adminApi.getSystemStats(),
      ]);
      setProfiles(profilesData || []);
      setStats(statsData);
    } catch (err: any) {
      showToast('error', `Synchronization Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRoleToggle = async (p: any) => {
    if (p.id === currentUser?.id) {
      showToast('error', 'Privilege Protection: You cannot modify your own access tier.');
      return;
    }
    const newRole = p.role === 'admin' ? 'user' : 'admin';
    setUpdatingId(p.id);
    try {
      await adminApi.updateUserRole(p.id, newRole);
      setProfiles(prev => prev.map(u => u.id === p.id ? { ...u, role: newRole } : u));
      showToast('success', `Privileges for ${displayName(p)} updated to ${newRole.toUpperCase()}.`);
    } catch {
      showToast('error', 'Failed to update system role.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return !q || 
      (p.email || '').toLowerCase().includes(q) ||
      (p.full_name || '').toLowerCase().includes(q);
  });

  const renderSkeletons = () => (
    <div className="card overflow-hidden">
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="label-caps mb-1.5 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-navy-500" />
            System Control Center
          </p>
          <h1 className="page-title">Administrative Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-icon h-11 w-11 shadow-sm">
             <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAuthorized && (
            <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-lg shadow-lg shadow-navy-900/10">
              <Plus className="w-5 h-5" />
              PROVISION USER
            </button>
          )}
        </div>
      </header>

      {/* Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'SYSTEM NODES',    value: stats?.users,    icon: Users,    cls: 'hover:border-navy-500'  },
          { label: 'ACTIVE PIPELINES', value: stats?.projects, icon: Briefcase, cls: 'hover:border-amber-500' },
          { label: 'ASSET REGISTRY', value: stats?.parts,    icon: Database, cls: 'hover:border-teal-500' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`card group transition-all duration-300 p-6 border-b-4 ${s.cls}`}>
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-navy-400 group-hover:bg-navy-900 group-hover:text-white transition-all shadow-sm">
                  <Icon size={24} />
                </div>
                <div>
                  <p className="label-caps !text-[9px] !text-tertiary mb-1">{s.label}</p>
                  <p className="text-3xl font-black text-navy-900 font-mono tracking-tighter italic">
                    {loading ? <div className="skeleton h-8 w-12" /> : (s.value ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Registry */}
      <div className="flex-1">
        <div className="section-card p-4 flex flex-col md:flex-row items-center gap-4 mb-8">
           <div className="flex items-center gap-3 px-2 grayscale">
              <Users size={18} className="text-navy-900" />
              <div className="label-caps !text-navy-900 !text-[11px] whitespace-nowrap">Authorized Directory</div>
           </div>
           <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
              <input
                type="text"
                className="input pl-11"
                placeholder="Search by identity or system email ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
        </div>

        {loading && profiles.length === 0 ? renderSkeletons() : (
          <div className="card shadow-sm overflow-hidden">
             <table className="data-table-modern">
               <thead>
                 <tr>
                    <th>User Identity</th>
                    <th>System Credential</th>
                    <th>Privilege Tier</th>
                    <th>Record Joined</th>
                    <th className="w-48 text-right" />
                 </tr>
               </thead>
               <tbody>
                  {filtered.map(p => {
                    const isMe = p.id === currentUser?.id;
                    const isAdmin = p.role === 'admin';
                    const updating = updatingId === p.id;
                    const colorCls = avatarColor(p.id);

                    return (
                      <tr key={p.id} className={`table-row-hover group transition-colors ${isMe ? 'bg-navy-50/30' : ''}`}>
                         <td>
                           <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black shadow-lg shadow-navy-900/10 ${colorCls} group-hover:scale-105 transition-transform`}>
                                {initials(p)}
                              </div>
                              <div>
                                <p className="text-sm font-black text-navy-900 group-hover:text-amber-700 transition-colors uppercase tracking-tight flex items-center gap-2">
                                  {displayName(p)}
                                  {isMe && <span className="badge badge-navy !bg-navy-900 !text-white !px-1.5 !py-0.5 !text-[7px] font-black">LOCAL-ROOT</span>}
                                </p>
                                {!p.full_name && <p className="text-[9px] font-bold text-amber-600 uppercase mt-0.5 flex items-center gap-1"><AlertTriangle size={10} /> Incomplete Metadata</p>}
                              </div>
                           </div>
                         </td>
                         <td>
                            {p.email ? (
                              <span className="font-mono text-[11px] font-black text-navy-400 group-hover:text-navy-900 transition-colors">{p.email}</span>
                            ) : (
                              <span className="badge badge-amber !bg-amber-100 !text-amber-700 !px-2 !py-0.5 !text-[8px] font-black border border-amber-200 uppercase">Profile Sync Disconnected</span>
                            )}
                         </td>
                         <td>
                           <span className={`badge ${isAdmin ? 'badge-navy !bg-navy-900 !text-white' : 'badge-slate'} !px-3 font-black text-[9px] tracking-widest inline-flex items-center gap-2`}>
                             {isAdmin ? <ShieldCheck size={10} /> : <User size={10} />}
                             {p.role?.toUpperCase() || 'USER'}
                           </span>
                         </td>
                         <td>
                           <p className="font-mono text-[10px] font-black text-tertiary opacity-60">
                              {p.created_date ? new Date(p.created_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'LEGACY RECORD'}
                           </p>
                         </td>
                         <td className="text-right">
                           {isMe ? (
                             <div className="label-caps !text-[10px] !text-tertiary italic px-4">Immune to Edits</div>
                           ) : (
                             <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 pr-2">
                               <button onClick={() => setEditUser(p)} className="btn btn-icon btn-sm btn-ghost hover:text-navy-600" title="Modify Identity"><Edit2 size={13}/></button>
                               <button onClick={() => setResetPwdUser(p)} className="btn btn-icon btn-sm btn-ghost hover:text-amber-600" title="Credential Reset"><Key size={13}/></button>
                               <button 
                                 onClick={() => handleRoleToggle(p)} 
                                 disabled={updating}
                                 className={`btn btn-icon btn-sm btn-ghost ${isAdmin ? 'hover:text-red-500' : 'hover:text-emerald-500'}`}
                               >
                                 {updating ? <RefreshCw size={13} className="animate-spin" /> : isAdmin ? <ShieldOff size={13}/> : <ShieldCheck size={13}/>}
                               </button>
                             </div>
                           )}
                         </td>
                      </tr>
                    );
                  })}
               </tbody>
             </table>
          </div>
        )}
      </div>

      <CreateUserModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onSuccess={fetchData} />
    </div>
  );
}
