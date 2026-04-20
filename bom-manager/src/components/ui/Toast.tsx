import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  onClose: (id: string) => void;
  duration?: number;
}

export default function Toast({ id, type, message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const config = {
    success: {
       icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
       bg: 'bg-emerald-50/50',
       border: 'border-emerald-100',
       accent: 'bg-emerald-500',
       label: 'Success Registry'
    },
    error: {
       icon: <XCircle className="w-5 h-5 text-red-500" />,
       bg: 'bg-red-50/50',
       border: 'border-red-100',
       accent: 'bg-red-500',
       label: 'System Error'
    },
    info: {
       icon: <AlertCircle className="w-5 h-5 text-blue-500" />,
       bg: 'bg-blue-50/50',
       border: 'border-blue-100',
       accent: 'bg-blue-500',
       label: 'Audit Info'
    },
    warning: {
       icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
       bg: 'bg-amber-50/50',
       border: 'border-amber-100',
       accent: 'bg-amber-500',
       label: 'Registry Alert'
    }
  };

  const current = config[type as keyof typeof config] || config.info;

  return (
    <div className={`flex items-center gap-4 bg-white border ${current.border} shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] rounded-[2rem] px-6 py-5 min-w-[320px] mb-3 group animate-in fade-in slide-in-from-right-8 duration-500 relative overflow-hidden`}>
      {/* Decorative Accent Bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${current.accent} rounded-r-full shadow-lg opacity-80`} />
      
      <div className={`w-10 h-10 ${current.bg} rounded-2xl flex items-center justify-center shrink-0 border ${current.border} group-hover:scale-110 transition-transform`}>
        {current.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 italic">{current.label}</p>
        <p className="text-xs font-bold text-gray-900 leading-tight truncate">{message}</p>
      </div>

      <button 
        onClick={() => onClose(id)} 
        className="p-2 text-gray-300 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all hover:rotate-90 active:scale-95"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Duration indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-50">
         <div 
            className={`h-full ${current.accent} opacity-30 transition-all ease-linear`} 
            style={{ 
                animation: `toast-progress ${duration}ms linear forwards` 
            }} 
         />
      </div>

      <style>{`
        @keyframes toast-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
