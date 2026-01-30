import { ReactNode } from 'react';

interface BeveledPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function BeveledPanel({ children, className = '', hover = false }: BeveledPanelProps) {
  return (
    <div
      className={`
        rounded-[20px] bg-[#e9e6e2] p-8
        transition-all duration-300
        ${hover ? 'hover:shadow-[6px_6px_20px_rgba(0,0,0,0.08),-6px_-6px_20px_rgba(255,255,255,0.9)] hover:-translate-y-0.5' : ''}
        ${className}
      `}
      style={{
        boxShadow: '8px 8px 24px rgba(0, 0, 0, 0.06), -8px -8px 24px rgba(255, 255, 255, 0.8)'
      }}
    >
      {children}
    </div>
  );
}
