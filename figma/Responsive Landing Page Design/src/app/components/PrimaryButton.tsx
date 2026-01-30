import { ReactNode } from 'react';

interface PrimaryButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
  onClick?: () => void;
}

export function PrimaryButton({ 
  children, 
  variant = 'primary', 
  className = '',
  onClick 
}: PrimaryButtonProps) {
  const baseStyles = `
    px-8 py-4 rounded-[16px] transition-all duration-200
    font-medium tracking-tight
  `;
  
  const variantStyles = {
    primary: `
      bg-[#c9a55d] text-[#1a1712]
      shadow-[4px_4px_12px_rgba(0,0,0,0.1),-2px_-2px_8px_rgba(255,255,255,0.5)]
      hover:shadow-[2px_2px_8px_rgba(0,0,0,0.12),-1px_-1px_4px_rgba(255,255,255,0.6)]
      active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.15),inset_-2px_-2px_6px_rgba(255,255,255,0.3)]
      active:translate-y-[1px]
    `,
    secondary: `
      bg-[#e9e6e2] text-[#1a1712]
      shadow-[4px_4px_12px_rgba(0,0,0,0.08),-2px_-2px_8px_rgba(255,255,255,0.7)]
      hover:shadow-[2px_2px_8px_rgba(0,0,0,0.1),-1px_-1px_4px_rgba(255,255,255,0.8)]
      active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.12),inset_-2px_-2px_6px_rgba(255,255,255,0.4)]
      active:translate-y-[1px]
    `
  };

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
