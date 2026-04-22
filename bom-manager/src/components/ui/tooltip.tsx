import React, { useState, createContext, useContext } from 'react'

const TooltipContext = createContext<{ isVisible: boolean }>({ isVisible: false })

export const TooltipProvider = ({ children, delayDuration: _delayDuration }: { children: React.ReactNode, delayDuration?: number }) => <>{children}</>

export const Tooltip = ({ children }: { children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false)
  
  return (
    <TooltipContext.Provider value={{ isVisible }}>
      <div 
        className="relative inline-block"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

export const TooltipTrigger = ({ children, asChild: _asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  return <>{children}</>
}

export const TooltipContent = ({ children, className, side, avoidCollisions: _avoidCollisions }: { children: React.ReactNode, className?: string, side?: string, avoidCollisions?: boolean }) => {
  const { isVisible } = useContext(TooltipContext)
  
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }

  const currentSideClass = sideClasses[side as keyof typeof sideClasses] || sideClasses.top

  if (!isVisible) return null

  return (
    <div className={`absolute ${currentSideClass} z-50 animate-in fade-in zoom-in-95 duration-200 pointer-events-none ${className}`}>
      <div className="bg-navy-900 text-white text-[10px] p-2 rounded-lg shadow-xl border border-white/10 min-w-[120px]">
        {children}
        {(!side || side === 'top') && <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-navy-900" />}
        {side === 'right' && <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-navy-900" />}
      </div>
    </div>
  )
}
