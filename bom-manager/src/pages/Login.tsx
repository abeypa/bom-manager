import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck, Activity, Database, Briefcase } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const loginEmail = email.includes('@') ? email.trim() : `${email.trim()}@bepindia.com`
    const { error } = await signIn(loginEmail, password)
    if (error) {
      setError('System verification failed. Invalid credentials detected.')
      setLoading(false)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f8fafc]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 p-16 relative overflow-hidden bg-navy-950">
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        {/* Ambient background blur */}
        <div className="absolute -bottom-24 -right-24 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-[400px] h-[400px] bg-navy-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <div className="w-16 h-16 bg-navy-900 border border-white/10 rounded-2xl flex items-center justify-center mb-10 shadow-2xl">
            <span className="font-syne font-black text-xs text-white uppercase tracking-tighter">BEP-V3</span>
          </div>
          
          <div className="space-y-4">
             <div className="label-caps !text-amber-500 !tracking-[0.3em] font-black !text-[10px]">Precision Logic</div>
             <h1 className="font-syne font-bold text-5xl text-white leading-[1.1] tracking-tight">
               Engineering<br />
               <span className="text-white/60">Parts Registry</span>
             </h1>
          </div>

          <p className="mt-8 text-white/40 font-medium text-lg leading-relaxed max-w-sm">
            Professional-grade BOM management and supply chain orchestration for precision manufacturing.
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10 grid grid-cols-1 gap-4 mb-2">
          {[
            { label: 'Asset Management', value: 'Global Registry', icon: Database },
            { label: 'Project Control', value: 'Live Hierarchy', icon: Briefcase },
            { label: 'Security', value: 'Verified Entry', icon: ShieldCheck },
          ].map(stat => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/10 transition-colors">
              <div className="p-2 bg-white/5 rounded-lg text-white/40">
                <stat.icon size={18} />
              </div>
              <div>
                <div className="text-white font-black text-base leading-none mb-1">{stat.value}</div>
                <div className="label-caps !text-[8px] !text-white/30">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-[420px] page-enter">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
             <div className="w-10 h-10 bg-navy-950 rounded-xl flex items-center justify-center">
                <span className="font-syne font-black text-[10px] text-white">BEP</span>
             </div>
             <span className="font-syne font-bold font-black text-xl text-navy-950 uppercase tracking-tighter">BOM Manager</span>
          </div>

          <div className="mb-10">
             <h2 className="font-syne font-black text-3xl text-navy-900 tracking-tight leading-none mb-3">System Access</h2>
             <p className="text-sm font-bold text-tertiary">Initialize your secure administrative session</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 p-4 rounded-2xl mb-6 animate-shake">
              <AlertCircle size={18} className="text-red-500 shrink-0" />
              <p className="text-xs font-black text-red-600 uppercase tracking-tight">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="label-caps px-1">Network Identity</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  className="input pl-11"
                  placeholder="username or email@bepindia.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="label-caps px-1">Security Credential</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input pl-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg w-full flex justify-center group"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Activity size={18} className="animate-spin" /> Verifying...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  ESTABLISH CONNECTION <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          <div className="mt-12 text-center p-6 border border-slate-100 rounded-3xl bg-slate-50/50">
             <p className="label-caps !text-[9px] !text-tertiary mb-2">Restricted Access Service</p>
             <p className="text-[10px] font-bold text-slate-400 max-w-[280px] mx-auto leading-relaxed">
               Access to this registry is governed by corporate security policies. 
               Unauthorized attempts are documented.
             </p>
          </div>
        </div>
      </div>
    </div>
  )
}
