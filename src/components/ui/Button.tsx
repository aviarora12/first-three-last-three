import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  danger:  'bg-red-900 hover:bg-red-800 text-red-200 border border-red-700',
  ghost:   'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100',
  outline: 'bg-transparent border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: 'sm' | 'md';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <button
      {...rest}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClass,
        VARIANTS[variant],
        className,
      )}
    >
      {isLoading && (
        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}
