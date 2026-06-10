import { Box, Typography, Stack } from '@mui/material';
import HealthGauge from './HealthGauge';

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
          bgcolor: 'primary.main',
          color: '#fff',
          p: 6,
          backgroundImage:
            'radial-gradient(900px 400px at 0% 0%, rgba(46,125,91,0.25), transparent), radial-gradient(700px 400px at 100% 100%, rgba(201,133,43,0.22), transparent)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {['#C4453D', '#C9852B', '#2E7D5B'].map((c) => (
              <Box key={c} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
            ))}
          </Box>
          <Typography sx={{ fontWeight: 700, fontFamily: '"Spline Sans", sans-serif', fontSize: 20 }}>
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
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, p: 2.5 }}>
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
