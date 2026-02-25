import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Command Center palette
        base: {
          DEFAULT: '#09090b',   // zinc-950
          surface: '#18181b',   // zinc-900
          elevated: '#27272a',  // zinc-800
        },
        border: {
          DEFAULT: '#3f3f46',   // zinc-700
          subtle: '#27272a',    // zinc-800
        },
        accent: {
          DEFAULT: '#6366f1',   // indigo-500
          hover: '#4f46e5',     // indigo-600
          muted: '#312e81',     // indigo-900
        },
        status: {
          'on-track': '#22c55e',    // green-500
          'at-risk': '#f59e0b',     // amber-500
          'critical': '#ef4444',    // red-500
          'on-track-bg': '#14532d', // green-900
          'at-risk-bg': '#451a03',  // amber-900
          'critical-bg': '#450a0a', // red-950
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'ticker': 'ticker 30s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
