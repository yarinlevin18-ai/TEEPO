import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        /* Locked landing typography (teepo-design/CLAUDE_CODE_HANDOFF.md):
           sans    = body/UI (Assistant primary, Heebo fallback)
           display = hero headlines (Heebo Black/900)
           brand   = wordmark only (Fredoka SemiBold/600) */
        sans:    ['Assistant', 'Heebo', 'system-ui', 'sans-serif'],
        display: ['Heebo', 'Assistant', 'system-ui', 'sans-serif'],
        brand:   ['Fredoka', 'Assistant', 'sans-serif'],
      },
      /* ── Typography Scale ──
         Modular scale (~1.25 ratio) optimized for Hebrew readability.
         Each entry returns [fontSize, { lineHeight, fontWeight }]. */
      fontSize: {
        'display-1': ['4rem',      { lineHeight: '1.05', fontWeight: '700' }],
        'display-2': ['3rem',      { lineHeight: '1.1',  fontWeight: '700' }],
        'heading-1': ['2rem',      { lineHeight: '1.2',  fontWeight: '800' }],
        'heading-2': ['1.5rem',    { lineHeight: '1.25', fontWeight: '700' }],
        'heading-3': ['1.125rem',  { lineHeight: '1.3',  fontWeight: '600' }],
        'body':      ['0.9375rem', { lineHeight: '1.7',  fontWeight: '400' }],
        'body-sm':   ['0.8125rem', { lineHeight: '1.6',  fontWeight: '400' }],
        'caption':   ['0.75rem',   { lineHeight: '1.5',  fontWeight: '500' }],
        'overline':  ['0.625rem',  { lineHeight: '1.4',  fontWeight: '600' }],
      },
      colors: {
        /* TEEPO design tokens — locked-in cream palette per
           teepo-design/SESSION_HANDOFF.md (warm paper-feel base). */
        base:    '#f5ead2',  /* warm saturated cream — body bg */
        elev:    '#efe0bc',  /* deeper warm cream */
        hover:   '#f1e3c4',
        line: {
          DEFAULT: '#e0cda8',
          soft:    '#ead8b3',
        },
        surface: {
          /* Cards lift off the paper texture with shadow + opaque cream */
          DEFAULT: '#fdf6e3',
          50:  '#fdf6e3',  /* primary card */
          100: '#fbeed1',  /* tinted card variant */
          200: '#f1e3c4',  /* hover */
        },
        paper: {
          DEFAULT: '#fdf6e3',
          muted:   '#fbeed1',
          subtle:  '#f1e3c4',
        },
        /* Brand: leaf green → lime gradient (no orange — Moodle uses orange) */
        accent: {
          DEFAULT: '#16a34a',
          soft:    '#dcfce7',
          deep:    '#14532d',
          50:  '#dcfce7',
          100: '#bbf7d0',
          400: '#4ade80',
          500: '#16a34a',
          600: '#15803d',
          700: '#14532d',
        },
        coral: '#84cc16',  /* lime — secondary brand */
        clay: {
          DEFAULT: '#d97706',
          400:     '#f59e0b',
          500:     '#d97706',
          600:     '#b45309',
        },
        /* Warm dark text on cream */
        ink: {
          DEFAULT: '#2d1810',
          soft:    '#5c3f2f',
          muted:   '#8a7261',
          subtle:  '#b39c81',
        },
        /* Semantic status colors */
        success: {
          DEFAULT: '#10b981',
          50:  '#ecfdf5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          DEFAULT: '#f59e0b',
          50:  '#fffbeb',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          DEFAULT: '#ef4444',
          50:  '#fef2f2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        info: {
          DEFAULT: '#3b82f6',
          50:  '#eff6ff',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        // Keep primary alias so any leftover classes don't break
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
      },
      backgroundImage: {
        'gradient-accent':   'linear-gradient(135deg, #16a34a 0%, #84cc16 100%)',
        'gradient-warm':     'linear-gradient(135deg, #16a34a 0%, #84cc16 100%)',
        'gradient-mesh':     'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.18) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.14) 0%, transparent 60%), radial-gradient(ellipse at 50% 80%, rgba(56,189,248,0.08) 0%, transparent 60%)',
        'shimmer':           'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)',
      },
      boxShadow: {
        'glow':       '0 0 24px rgba(99,102,241,0.35)',
        'glow-sm':    '0 0 12px rgba(99,102,241,0.25)',
        'glow-lg':    '0 0 48px rgba(99,102,241,0.45)',
        'card':       '0 4px 24px rgba(0,0,0,0.35)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.08)',
        'dropdown':   '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        'modal':      '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.1)',
        'success':    '0 0 16px rgba(16,185,129,0.3)',
        'warning':    '0 0 16px rgba(245,158,11,0.3)',
        'danger':     '0 0 16px rgba(239,68,68,0.3)',
      },
      animation: {
        'fade-in':      'fadeIn 0.4s ease-out',
        'fade-in-up':   'fadeInUp 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
        'slide-up':     'slideUp 0.4s ease-out',
        'slide-right':  'slideRight 0.35s cubic-bezier(0.25,0.46,0.45,0.94)',
        'scale-in':     'scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'float':        'float 6s ease-in-out infinite',
        'float-slow':   'float 10s ease-in-out infinite',
        'shimmer':      'shimmer 2.2s linear infinite',
        'pulse-glow':   'pulseGlow 2s ease-in-out infinite',
        'pulse-slow':   'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-dot':   'bounceDot 1.2s ease-in-out infinite',
        'wiggle':       'wiggle 0.5s ease-in-out',
        'check-bounce': 'checkBounce 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'glow-ring':    'glowRing 0.6s ease-out forwards',
        'strike':       'strike 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%':   { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-18px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(99,102,241,0.3)' },
          '50%':      { boxShadow: '0 0 32px rgba(99,102,241,0.6)' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%':           { transform: 'scale(1)',   opacity: '1'   },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%':      { transform: 'rotate(-8deg)' },
          '40%':      { transform: 'rotate(8deg)' },
          '60%':      { transform: 'rotate(-4deg)' },
          '80%':      { transform: 'rotate(4deg)' },
        },
        checkBounce: {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        glowRing: {
          '0%':   { boxShadow: '0 0 0 0 rgba(16,185,129,0.5)', opacity: '1' },
          '100%': { boxShadow: '0 0 0 12px rgba(16,185,129,0)', opacity: '0' },
        },
        strike: {
          '0%':   { textDecorationColor: 'transparent' },
          '100%': { textDecorationColor: 'currentColor' },
        },
      },
    },
  },
  plugins: [],
}

export default config
