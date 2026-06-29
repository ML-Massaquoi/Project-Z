export const typography = {
  scale: {
    '2xs': '11px',
    xs:    '12px',
    sm:    '13px',
    base:  '14px',
    md:    '16px',
    lg:    '18px',
    xl:    '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '32px',
  },
  weight: {
    normal:    400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },
  leading: {
    none:    1,
    tight:   1.25,
    snug:    1.375,
    normal:  1.5,
    relaxed: 1.625,
  },
  tracking: {
    tight:   '-0.025em',
    normal:  '0',
    wide:    '0.025em',
    wider:   '0.05em',
    widest:  '0.075em',
  },
  roles: {
    pageTitle:    { fontSize: '32px', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 },
    sectionTitle: { fontSize: '24px', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 },
    cardTitle:    { fontSize: '18px', fontWeight: 600, letterSpacing: '-0.01em',  lineHeight: 1.35 },
    body:         { fontSize: '14px', fontWeight: 430, letterSpacing: '0',         lineHeight: 1.7 },
    bodySmall:    { fontSize: '13px', fontWeight: 430, letterSpacing: '0',         lineHeight: 1.6 },
    caption:      { fontSize: '12px', fontWeight: 400, letterSpacing: '0',         lineHeight: 1.4 },
    label:        { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',    lineHeight: 1.2 },
  },
} as const

export const spacing = {
  0:    '0',
  px:   '1px',
  0.5:  '0.125rem',
  1:    '0.25rem',
  1.5:  '0.375rem',
  2:    '0.5rem',
  2.5:  '0.625rem',
  3:    '0.75rem',
  3.5:  '0.875rem',
  4:    '1rem',
  5:    '1.25rem',
  6:    '1.5rem',
  8:    '2rem',
  10:   '2.5rem',
  12:   '3rem',
  16:   '4rem',
  20:   '5rem',
  24:   '6rem',
  32:   '8rem',
  48:   '12rem',
  64:   '16rem',
} as const

export const radius = {
  sm:    '6px',
  md:    '8px',
  lg:    '10px',
  xl:    '12px',
  '2xl': '16px',
  full:  '9999px',
} as const

export const shadow = {
  xs:         '0 1px 2px rgba(0,0,0,.20)',
  sm:         '0 1px 3px rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.20)',
  md:         '0 4px 6px -1px rgba(0,0,0,.30), 0 2px 4px -2px rgba(0,0,0,.25)',
  lg:         '0 10px 15px -3px rgba(0,0,0,.35), 0 4px 6px -4px rgba(0,0,0,.25)',
  xl:         '0 20px 25px -5px rgba(0,0,0,.40), 0 8px 10px -6px rgba(0,0,0,.30)',
  card:       '0 1px 2px rgba(0,0,0,.20), 0 1px 4px rgba(0,0,0,.15)',
  cardHover:  '0 4px 12px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.20)',
  modal:      '0 20px 60px rgba(0,0,0,.50)',
  elevated:   '0 8px 32px rgba(0,0,0,.40)',
  dropdown:   '0 4px 16px rgba(0,0,0,.40)',
} as const

export const colors = {
  brand:        '#3B82F6',
  brandHover:   '#60A5FA',
  brandLight:   'rgba(59,130,246,0.10)',
  accent:       '#10B981',
  accentHover:  '#34D399',
  accentLight:  'rgba(16,185,129,0.10)',

  bg:          '#0B1121',
  surface0:    '#0F172A',
  surface1:    '#0F172A',
  surface2:    '#1E293B',
  surface3:    '#334155',
  surface4:    '#475569',
  surfaceElevated: '#1E293B',

  border:       '#1E293B',
  borderSubtle: 'rgba(255,255,255,0.04)',
  borderStrong: '#334155',
  borderFocus:  '#3B82F6',

  text:          '#F1F5F9',
  textSecondary: '#CBD5E1',
  textTertiary:  '#94A3B8',
  textMuted:     '#64748B',
  textFaint:     '#475569',

  success: { default: '#10B981', light: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', text: '#34D399' },
  warning: { default: '#F59E0B', light: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', text: '#FBBF24' },
  danger:  { default: '#EF4444', light: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',  text: '#F87171' },
  info:    { default: '#3B82F6', light: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', text: '#60A5FA' },

  sidebarBg:         '#070D1A',
  sidebarBorder:     '#1E293B',
  sidebarText:       '#94A3B8',
  sidebarTextMuted:  '#64748B',
  sidebarHoverBg:    '#1E293B',
  sidebarActiveBg:   'rgba(59,130,246,0.12)',
  sidebarActiveText: '#60A5FA',
  sidebarActiveIcon: '#60A5FA',
} as const

export const transition = {
  duration: { fast: 120, normal: 180, slow: 280 },
  ease: {
    default: [0.4, 0, 0.2, 1] as const,
    spring:  [0.16, 1, 0.3, 1] as const,
    bounce:  [0.34, 1.56, 0.64, 1] as const,
  },
} as const

export const zIndex = {
  base: 1, dropdown: 30, sticky: 35, topbar: 40,
  sidebar: 50, modal: 60, popover: 80, toast: 90, tooltip: 100,
} as const

export const layout = {
  sidebarWidth:     260,
  sidebarCollapsed: 64,
  topbarHeight:     60,
  drawerWidth:      480,
  contentMaxWidth:  1600,
} as const

export const motionVariants = {
  fadeIn:    { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } },
  slideUp:   { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 6 },
               transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  slideInRight: { initial: { opacity: 0, x: '100%' }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: '100%' },
                  transition: { type: 'spring', damping: 30, stiffness: 300 } },
  scaleIn:   { initial: { opacity: 0, scale: 0.96, y: -8 }, animate: { opacity: 1, scale: 1, y: 0 },
               exit: { opacity: 0, scale: 0.96, y: -8 }, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  staggerContainer: { animate: { transition: { staggerChildren: 0.04 } } },
  staggerItem: { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 },
                 transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
} as const

export const chartTheme = {
  background: '#0F172A',
  paper:      '#1E293B',
  text:       '#94A3B8',
  grid:       '#334155',
  tooltip: {
    background:   '#1E293B',
    border:       '#334155',
    color:        '#F1F5F9',
    boxShadow:    '0 4px 16px rgba(0,0,0,.40)',
    fontSize:     '13px',
    borderRadius: '10px',
  },
  palette: [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#6366F1',
    '#06B6D4',
    '#8B5CF6',
    '#EC4899',
  ],
} as const

export default { typography, spacing, radius, shadow, colors, transition, zIndex, layout, motionVariants, chartTheme }
