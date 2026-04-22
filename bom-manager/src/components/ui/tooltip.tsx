import React, { useState } from 'react'

export const TooltipProvider = ({ children, delayDuration }: { children: React.ReactNode, delayDuration?: number }) => <>{children}</>

export const Tooltip = ({ children }: { children: React.ReactNode }) => {
  return <div className="relative inline-block group">{children}</div>
}

export const TooltipTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  return <>{children}</>
}

export const TooltipContent = ({ children, className, side }: { children: React.ReactNode, className?: string, side?: string }) => {
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }

  const currentSideClass = sideClasses[side as keyof typeof sideClasses] || sideClasses.top

  return (
    <div className={`absolute ${currentSideClass} hidden group-hover:block z-50 animate-in fade-in zoom-in-95 duration-200 pointer-events-none ${className}`}>
      <div className="bg-navy-900 text-white text-[10px] p-2 rounded-lg shadow-xl border border-white/10 min-w-[120px]">
        {children}
        {(!side || side === 'top') && <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-navy-900" />}
        {side === 'right' && <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-navy-900" />}
      </div>
    </div>
  )
}
