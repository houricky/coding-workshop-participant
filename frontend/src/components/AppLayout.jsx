import { useState } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Chip,
  Tooltip,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK } from '../services/api';
import { initials } from '../utils/format';

const DRAWER_WIDTH = 248;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlinedIcon /> },
  { to: '/projects', label: 'Projects', icon: <FolderOutlinedIcon /> },
  { to: '/employees', label: 'Employees', icon: <PeopleOutlinedIcon /> },
  { to: '/allocations', label: 'Resource Allocation', icon: <EventAvailableOutlinedIcon /> },
  { to: '/usage', label: 'Resource Usage', icon: <TimerOutlinedIcon /> },
];

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, height: 64 }}>
      <Box
        component="span"
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.5,
          bgcolor: 'primary.main',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {['#C4453D', '#C9852B', '#2E7D5B'].map((c) => (
            <Box key={c} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: c }} />
          ))}
        </Box>
      </Box>
      <Box sx={{ lineHeight: 1 }}>
        <Typography sx={{ fontWeight: 700, fontFamily: '"Spline Sans", sans-serif' }}>ACME</Typography>
        <Typography variant="caption" color="text.secondary">
          Budget & Resource
        </Typography>
      </Box>
    </Box>
  );
}

export default function AppLayout() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Brand />
      <Divider />
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              color: 'text.secondary',
              '&.active': { bgcolor: 'rgba(27,42,74,0.08)', color: 'primary.main', fontWeight: 600 },
              '&.active .MuiListItemIcon-root': { color: 'primary.main' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14.5, fontWeight: 'inherit' }}>
              {item.label}
            </ListItemText>
          </ListItemButton>
        ))}
      </List>
      {USE_MOCK && (
        <Box sx={{ p: 2 }}>
          <Tooltip title="Running on in-memory sample data. Set VITE_USE_MOCK=false to use the live API.">
            <Chip size="small" label="Demo data" variant="outlined" sx={{ width: '100%' }} />
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  const currentTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'ACME';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{ width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, ml: { md: `${DRAWER_WIDTH}px` } }}
      >
        <Toolbar>
          {!isDesktop && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1.5 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.primary' }}>
            {currentTitle}
          </Typography>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>
              {initials(user?.name) || 'U'}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email} · {user?.role}
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isDesktop ? (
          <Drawer
            variant="permanent"
            open
            sx={{
              '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: '1px solid rgba(27,42,74,0.1)' },
            }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 2, sm: 3, md: 4 },
          py: 3,
          mt: 8,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
