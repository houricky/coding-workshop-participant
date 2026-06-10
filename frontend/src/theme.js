import { createTheme } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
// Palette: a calm "operations console" neutral with an ink-navy primary, paired
// with a deliberately DESATURATED traffic-light system so a portfolio of many
// projects reads as data rather than alarm. These RAG values are the brand.
export const rag = {
  green: { main: '#2E7D5B', soft: '#E4F0EA', text: '#1E5A40' }, // forest
  amber: { main: '#C9852B', soft: '#FBF0DD', text: '#8A5A14' }, // ochre
  red: { main: '#C4453D', soft: '#FBE6E4', text: '#8E2B25' }, // brick
};

export const ragMeta = {
  Green: { label: 'On track', color: rag.green, order: 0 },
  Amber: { label: 'Watch', color: rag.amber, order: 1 },
  Red: { label: 'At risk', color: rag.red, order: 2 },
};

const ink = '#1B2A4A';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: ink, light: '#33456b', dark: '#101a30', contrastText: '#fff' },
    secondary: { main: '#5B6B8C' },
    success: { main: rag.green.main },
    warning: { main: rag.amber.main },
    error: { main: rag.red.main },
    background: { default: '#F6F7F9', paper: '#FFFFFF' },
    text: { primary: '#1A2233', secondary: '#5A6478' },
    divider: 'rgba(27, 42, 74, 0.10)',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    h4: { fontFamily: '"Spline Sans", "Inter", sans-serif', fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontFamily: '"Spline Sans", "Inter", sans-serif', fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontFamily: '"Spline Sans", "Inter", sans-serif', fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.68rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Tabular figures everywhere there are numbers — money/hours must align.
        '.tnum': { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid rgba(27, 42, 74, 0.10)' },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: '#5A6478', backgroundColor: '#FBFBFC' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', borderBottom: '1px solid rgba(27, 42, 74, 0.10)' },
      },
    },
  },
});

export default theme;
