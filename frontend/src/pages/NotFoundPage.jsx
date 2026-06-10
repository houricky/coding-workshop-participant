import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Stack } from '@mui/material';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center' }}>
        <Stack direction="row" spacing={0.75}>
          {['#C4453D', '#C9852B', '#2E7D5B'].map((c) => (
            <Box key={c} sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c }} />
          ))}
        </Stack>
        <Typography variant="h4">Page not found</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
          That route doesn&apos;t exist in the tracker. Head back to the dashboard to find your projects.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </Button>
      </Stack>
    </Box>
  );
}
