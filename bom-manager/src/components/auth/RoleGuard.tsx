import React from 'react';
import { useRole } from '../../hooks/useRole';
import { ShieldAlert } from 'lucide-react';

interface RoleGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';   // if not specified, any authenticated user can access
  fallback?: React.ReactNode;
}

export default function RoleGuard({ 
  children, 
  requiredRole = 'user', 
  fallback 
}: RoleGuardProps) {
  const { role, isAdmin, loading } = useRole();

  if (loading) {
    return <div className="p-8 text-center text-sm font-bold uppercase tracking-widest text-gray-400">Verifying Security Protocols...</div>;
  }

  // If no role or doesn't meet requirement
  if (!role || (requiredRole === 'admin' && !isAdmin)) {
    return fallback || (
      <div className="flex flex-col items-center justify-center p-12 h-[32rem] text-center bg-white border border-gray-100 rounded-[2.5rem] shadow-sm m-6">
        <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Access Restricted</h2>
        <p className="text-gray-500 font-medium mt-2 max-w-xs mx-auto">Your account does not have the administrative clearance required to access this module.</p>
        <div className="mt-8 px-6 py-2 bg-gray-50 rounded-xl inline-block border border-gray-100">
           <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Required Clearance: {requiredRole}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
