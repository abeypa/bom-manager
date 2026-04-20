import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  subLabel?: string;
  group?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (opt.group && opt.group.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groups = Array.from(new Set(filteredOptions.map(opt => opt.group).filter(Boolean)));

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between w-full bg-white border border-gray-100 rounded-[1.5rem] py-4 px-6 text-sm font-bold shadow-sm cursor-pointer transition-all
          ${isOpen ? 'ring-2 ring-gray-100 border-gray-200' : 'hover:border-gray-200'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {selectedOption ? (
            <div className="flex flex-col overflow-hidden">
              <span className="text-gray-900 truncate">{selectedOption.label}</span>
              {selectedOption.subLabel && (
                <span className="text-[10px] text-gray-400 font-medium truncate">{selectedOption.subLabel}</span>
              )}
            </div>
          ) : (
            <span className="text-gray-300 font-black uppercase tracking-widest">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-white border border-gray-100 rounded-[2rem] shadow-2xl overflow-hidden animate-fade-in">
          <div className="p-4 border-b border-gray-50 flex items-center gap-3 bg-gray-50/50">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              className="bg-transparent border-none outline-none text-sm font-bold w-full placeholder:text-gray-300"
              placeholder="Start typing to filter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchTerm && (
              <button 
                onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-2">
            {filteredOptions.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-xs font-black text-gray-300 uppercase tracking-widest italic">No matching parts</p>
              </div>
            ) : groups.length > 0 ? (
              groups.map(groupName => (
                <div key={groupName}>
                  <div className="px-6 py-2 bg-gray-50/50">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{groupName}</span>
                  </div>
                  {filteredOptions
                    .filter(opt => opt.group === groupName)
                    .map(option => (
                      <div
                        key={option.value}
                        onClick={() => handleSelect(option.value)}
                        className={`
                          px-6 py-3 flex items-center justify-between cursor-pointer transition-colors
                          ${value === option.value ? 'bg-gray-50 text-gray-900' : 'hover:bg-gray-50/50 text-gray-600'}
                        `}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{option.label}</span>
                          {option.subLabel && (
                            <span className="text-[10px] text-gray-400 font-medium">{option.subLabel}</span>
                          )}
                        </div>
                        {value === option.value && <Check className="w-4 h-4 text-gray-900" />}
                      </div>
                    ))}
                </div>
              ))
            ) : (
              filteredOptions.map(option => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`
                    px-6 py-3 flex items-center justify-between cursor-pointer transition-colors
                    ${value === option.value ? 'bg-gray-50 text-gray-900' : 'hover:bg-gray-50/50 text-gray-600'}
                  `}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{option.label}</span>
                    {option.subLabel && (
                      <span className="text-[10px] text-gray-400 font-medium">{option.subLabel}</span>
                    )}
                  </div>
                  {value === option.value && <Check className="w-4 h-4 text-gray-900" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
