import { createTheme } from '@mui/material/styles';

export const command = {
  bg: '#0F1729',
  bg2: '#111C31',
  panel: '#121D33',
  panel2: '#17233A',
  line: 'rgba(148, 163, 184, 0.18)',
  lineStrong: 'rgba(56, 189, 248, 0.34)',
  text: '#E5EEF9',
  muted: '#91A1B8',
  teal: '#38BDF8',
  teal2: '#7DD3FC',
  blue: '#60A5FA',
  violet: '#A78BFA',
  amber: '#F6C85F',
  red: '#FF5C7A',
  green: '#36F59B',
};

export const rag = {
  green: { main: command.green, soft: 'rgba(54, 245, 155, 0.14)', text: '#A7FDD3' },
  amber: { main: command.amber, soft: 'rgba(246, 200, 95, 0.16)', text: '#FFE3A3' },
  red: { main: command.red, soft: 'rgba(255, 92, 122, 0.16)', text: '#FFB4C2' },
};

export const ragMeta = {
  Green: { label: 'On track', color: rag.green, order: 0 },
  Amber: { label: 'Watch', color: rag.amber, order: 1 },
  Red: { label: 'At risk', color: rag.red, order: 2 },
};

export const glass = {
  panel: {
    backgroundColor: 'rgba(18, 29, 51, 0.72)',
    backgroundImage: 'linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))',
    border: `1px solid ${command.line}`,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255,255,255,0.06)',
    backdropFilter: 'blur(18px) saturate(130%)',
    WebkitBackdropFilter: 'blur(18px) saturate(130%)',
  },
  inset: {
    backgroundColor: 'rgba(15, 23, 41, 0.54)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    backdropFilter: 'blur(14px) saturate(140%)',
    WebkitBackdropFilter: 'blur(14px) saturate(140%)',
  },
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: command.teal, light: command.teal2, dark: '#089EA5', contrastText: '#051019' },
    secondary: { main: command.blue },
    success: { main: rag.green.main },
    warning: { main: rag.amber.main },
    error: { main: rag.red.main },
    background: { default: command.bg, paper: 'rgba(18, 29, 51, 0.82)' },
    text: { primary: command.text, secondary: command.muted },
    divider: command.line,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: 0 },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    subtitle2: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
    overline: { fontWeight: 800, letterSpacing: '0.12em', fontSize: '0.67rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: command.bg,
          backgroundImage: [
            'radial-gradient(900px 520px at 6% -8%, rgba(56,189,248,0.10), transparent 62%)',
            'radial-gradient(900px 620px at 88% 8%, rgba(96,165,250,0.08), transparent 58%)',
            'linear-gradient(180deg, #0F1729 0%, #0B1120 100%)',
          ].join(', '),
          backgroundAttachment: 'fixed',
        },
        '::selection': { background: 'rgba(56,189,248,0.24)' },
        '.tnum': {
          fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          ...glass.panel,
          borderRadius: 8,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 1,
            background: 'linear-gradient(90deg, rgba(125,211,252,0.32), rgba(255,255,255,0.04))',
            pointerEvents: 'none',
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8 },
        contained: {
          boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
        },
        outlined: {
          backgroundColor: 'rgba(15,23,41,0.42)',
          borderColor: command.line,
          '&:hover': { borderColor: command.lineStrong, backgroundColor: 'rgba(56,189,248,0.06)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          borderColor: command.line,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: 'rgba(148,163,184,0.12)' },
        head: {
          fontWeight: 700,
          color: command.muted,
          backgroundColor: 'rgba(15, 23, 41, 0.74)',
          borderBottomColor: command.line,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: 'rgba(56,189,248,0.05)' },
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(15,23,41,0.76)',
          borderBottom: '1px solid rgba(148,163,184,0.16)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
          backdropFilter: 'blur(18px) saturate(130%)',
          WebkitBackdropFilter: 'blur(18px) saturate(130%)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(12, 18, 32, 0.82)',
          borderColor: 'rgba(148,163,184,0.14)',
          boxShadow: '12px 0 34px rgba(0,0,0,0.24)',
          backdropFilter: 'blur(18px) saturate(130%)',
          WebkitBackdropFilter: 'blur(18px) saturate(130%)',
        },
      },
    },
    MuiDialog: { styleOverrides: { paper: { ...glass.panel, borderRadius: 8 } } },
    MuiMenu: { styleOverrides: { paper: { ...glass.panel, borderRadius: 8 } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'rgba(8, 13, 24, 0.94)',
          border: `1px solid ${command.line}`,
          boxShadow: '0 16px 44px rgba(0,0,0,0.36)',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(15,23,41,0.52)',
          '& fieldset': { borderColor: 'rgba(148,163,184,0.18)' },
          '&:hover fieldset': { borderColor: 'rgba(125,211,252,0.32)' },
          '&.Mui-focused fieldset': { borderColor: command.teal },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(56,189,248,0.16)',
          color: command.teal2,
          border: '1px solid rgba(125,211,252,0.22)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: 'rgba(148,163,184,0.12)' },
      },
    },
  },
});

export default theme;
