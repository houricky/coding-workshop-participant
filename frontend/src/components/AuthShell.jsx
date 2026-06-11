import { Box, Typography, Stack } from '@mui/material';
import HealthGauge from './HealthGauge';
import { command, glass } from '../theme';

// Split auth screen: a branded panel that demonstrates the product's signature
// gauge, beside the form. The left panel collapses on small screens.
export default function AuthShell({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Box
        sx={{
          flex: 1.1,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          bgcolor: command.bg,
          color: 'text.primary',
          p: 6,
          backgroundImage:
            'radial-gradient(900px 480px at 0% 0%, rgba(56,189,248,0.10), transparent), linear-gradient(180deg, rgba(15,23,41,0.96), rgba(8,13,24,0.96))',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {['#FF5C7A', '#F6C85F', '#36F59B'].map((c) => (
              <Box key={c} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
            ))}
          </Box>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Inter", sans-serif', fontSize: 20 }}>
            ACME
          </Typography>
        </Stack>

        <Box sx={{ maxWidth: 420 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, lineHeight: 1.15 }}>
            See which projects are burning faster than they&rsquo;re finishing.
          </Typography>
          <Typography sx={{ opacity: 0.85, mb: 4 }}>
            Progress + budget burn + hours used, in one health view. Red, Amber, Green — no task
            boards, just portfolio truth.
          </Typography>
          <Box sx={{ ...glass.panel, borderRadius: 2, p: 2.5 }}>
            <Typography variant="caption" sx={{ opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Billing Migration · At risk
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <HealthGauge burn={62} completion={35} status="Red" showLabels={false} />
            </Box>
            <Typography variant="caption" sx={{ opacity: 0.8, mt: 1.5, display: 'block' }}>
              62% burned · 35% done · 27-pt gap
            </Typography>
          </Box>
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          Internal portfolio tracker · MVP
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 6 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>{children}</Box>
      </Box>
    </Box>
  );
}
