import React, { useState } from 'react'

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>

export const Tooltip = ({ children }: { children: React.ReactNode }) => {
  return <div className="relative inline-block group">{children}</div>
}

export const TooltipTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  return <>{children}</>
}

export const TooltipContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 animate-in fade-in zoom-in-95 duration-200 pointer-events-none ${className}`}>
      <div className="bg-navy-900 text-white text-[10px] p-2 rounded-lg shadow-xl border border-white/10 min-w-[120px]">
        {children}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-navy-900" />
      </div>
    </div>
  )
}
