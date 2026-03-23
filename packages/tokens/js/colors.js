export const darkColors = {
  bgBase: '#1a1918',
  bgSurface: '#1f1e1c',
  bgElevated: '#262624',
  bgInput: 'rgba(255, 255, 255, 0.06)',
  bgOverlay: '#242422',
  bgOverlayCollapsed: '#21211e',

  textPrimary: '#f0ece6',
  textSecondary: '#8a8680',
  textMuted: '#5c5a56',
  textOnAccent: '#2f2229',

  borderSoft: 'rgba(255, 255, 255, 0.08)',
  borderMedium: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(236, 137, 184, 0.5)',

  accent: '#ec89b8',
  accentSoft: 'rgba(236, 137, 184, 0.1)',
  accentMedium: 'rgba(236, 137, 184, 0.25)',
  accentBorder: 'rgba(236, 137, 184, 0.18)',

  surfaceHover: 'rgba(255, 255, 255, 0.05)',
  surfaceActive: 'rgba(255, 255, 255, 0.08)',
  surfacePrimary: '#2e2d2b',
  surfaceSecondary: '#34332f',

  statusRunning: '#ec89b8',
  statusRunningBg: 'rgba(236, 137, 184, 0.1)',
  statusComplete: '#78c88c',
  statusCompleteBg: 'rgba(120, 200, 140, 0.07)',
  statusError: '#f06464',
  statusErrorBg: 'rgba(240, 100, 100, 0.06)',
  statusAborted: '#95928b',
  statusAbortedBg: 'rgba(149, 146, 139, 0.07)',

  alertSuccessBg: 'rgba(24, 126, 88, 0.28)',
  alertSuccessText: '#b7f4d8',
  alertSuccessBorder: 'rgba(140, 239, 198, 0.22)',
  alertErrorBg: 'rgba(134, 39, 74, 0.34)',
  alertErrorText: '#ffd0e4',
  alertErrorBorder: 'rgba(255, 181, 213, 0.18)',
  alertPendingBg: 'rgba(104, 62, 86, 0.35)',
  alertPendingText: '#f3c8de',
  alertPendingBorder: 'rgba(210, 178, 200, 0.28)',

  userBubble: 'rgba(236, 137, 184, 0.1)',
  userBubbleBorder: 'rgba(236, 137, 184, 0.15)',
  userBubbleText: '#f0ece6',

  toolBg: '#2e2d2b',
  toolBorder: 'rgba(255, 255, 255, 0.08)',
  toolRunningBorder: 'rgba(236, 137, 184, 0.3)',
  toolRunningBg: 'rgba(236, 137, 184, 0.05)',

  timelineLine: 'rgba(255, 255, 255, 0.08)',
  timelineNode: 'rgba(236, 137, 184, 0.2)',

  scrollThumb: 'rgba(255, 255, 255, 0.1)',
  scrollThumbHover: 'rgba(255, 255, 255, 0.18)',

  codeBg: '#1a1918',
  placeholder: '#5c5a56',

  shadow: '0 20px 42px rgba(3, 3, 5, 0.45)',
  cardShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
  popoverShadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)',

  overlayContainerBorder: '#3b3b36',
  overlayCardShadow: '0 8px 28px rgba(0, 0, 0, 0.35), 0 1px 6px rgba(0, 0, 0, 0.25)',
  overlayInputPillBg: '#2a2a27'
}

export const colors = darkColors

export function getColors() {
  return darkColors
}
