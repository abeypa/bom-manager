import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FastScrollSliderProps {
  containerId: string;
}

export default function FastScrollSlider({ containerId }: FastScrollSliderProps) {
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (isDragging) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable > 0) {
      setProgress(el.scrollTop / scrollable);
    } else {
      setProgress(0);
    }
  }, [containerId, isDragging]);

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (el) {
      el.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleScroll);
      // Run once on mount after a tiny delay for render
      setTimeout(handleScroll, 100);
      return () => {
        el.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleScroll);
      };
    }
  }, [containerId, handleScroll]);

  const scrollToPercentage = useCallback((percentage: number) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    el.scrollTop = scrollable * percentage;
    setProgress(percentage);
  }, [containerId]);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const updatePosition = (clientY: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let y = clientY - rect.top;
      y = Math.max(0, Math.min(y, rect.height));
      const percentage = rect.height > 0 ? y / rect.height : 0;
      scrollToPercentage(percentage);
    };

    updatePosition(e.clientY);

    const handlePointerMove = (ev: PointerEvent) => {
      updatePosition(ev.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const jump = (amount: number) => {
    const newProgress = Math.max(0, Math.min(1, progress + amount));
    scrollToPercentage(newProgress);
  };

  return (
    <div className="h-full flex flex-col items-center bg-white shadow-sm border border-slate-200 rounded-xl py-2 w-10 overflow-hidden">
      <button 
        onClick={() => jump(-0.25)} 
        className="mb-2 p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
        title="Scroll Up 25%"
      >
        <ChevronUp size={16} />
      </button>
      
      {/* The Track */}
      <div 
        ref={trackRef}
        className="flex-1 w-2.5 bg-slate-100 rounded-full relative group cursor-grab active:cursor-grabbing"
        onPointerDown={handleTrackPointerDown}
        style={{ touchAction: 'none' }}
      >
        {/* The Handle */}
        <div 
          className="absolute left-0 right-0 bg-primary-500 rounded-full shadow-md group-hover:bg-primary-600 transition-colors pointer-events-none"
          style={{
            top: `max(0px, calc(${progress * 100}% - 24px * ${progress}))`,
            height: '24px',
          }}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-[2px]">
            <div className="w-1 h-px bg-white/50" />
            <div className="w-1 h-px bg-white/50" />
            <div className="w-1 h-px bg-white/50" />
          </div>
        </div>
      </div>

      <button 
        onClick={() => jump(0.25)} 
        className="mt-2 p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
        title="Scroll Down 25%"
      >
        <ChevronDown size={16} />
      </button>

      {/* Ticks/Markers */}
      <div className="mt-2 flex flex-col gap-1 w-full px-2">
        {[25, 50, 75].map(p => (
           <button 
             key={p}
             onClick={() => scrollToPercentage(p / 100)}
             className={`text-[8px] font-black w-full text-center rounded py-0.5 transition-colors ${
               Math.abs(progress * 100 - p) < 5 ? 'bg-primary-100 text-primary-700' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
             }`}
           >
             {p}%
           </button>
        ))}
      </div>
    </div>
  );
}
