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
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK } from '../services/api';
import { initials } from '../utils/format';
import { command, glass } from '../theme';

const DRAWER_WIDTH = 248;
const COLLAPSED_DRAWER_WIDTH = 72;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlinedIcon /> },
  { to: '/projects', label: 'Projects', icon: <FolderOutlinedIcon /> },
  { to: '/deliverables', label: 'Deliverables', icon: <AssignmentOutlinedIcon /> },
  { to: '/employees', label: 'Employees', icon: <PeopleOutlinedIcon /> },
  { to: '/allocations', label: 'Resource Allocation', icon: <EventAvailableOutlinedIcon /> },
  { to: '/usage', label: 'Resource Usage', icon: <TimerOutlinedIcon /> },
];

function Brand({ collapsed = false, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label="Go to dashboard"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 1.25,
        px: collapsed ? 0 : 2.5,
        height: 64,
        width: '100%',
        border: 0,
        color: 'inherit',
        bgcolor: 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
      }}
    >
      <Box
        component="span"
        sx={{
          width: 32,
          height: 32,
          borderRadius: 2,
          background: `linear-gradient(145deg, ${command.teal}, ${command.bg2})`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {['#FF5C7A', '#F6C85F', '#36F59B'].map((c) => (
            <Box key={c} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: c }} />
          ))}
        </Box>
      </Box>
      {!collapsed && (
        <Box sx={{ lineHeight: 1 }}>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Inter", sans-serif' }}>ACME</Typography>
          <Typography variant="caption" color="text.secondary">
            Budget & Resource
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default function AppLayout() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
  };

  const drawerWidth = isDesktop && collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Brand collapsed={isDesktop && collapsed} onClick={() => { setMobileOpen(false); navigate('/dashboard'); }} />
      <Divider />
      <List sx={{ px: collapsed && isDesktop ? 1 : 1.5, py: 2, flex: 1 }}>
        {navItems.map((item) => (
          <Tooltip key={item.to} title={collapsed && isDesktop ? item.label : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 44,
                justifyContent: collapsed && isDesktop ? 'center' : 'flex-start',
                color: 'text.secondary',
                '&:hover': { bgcolor: 'rgba(56,189,248,0.06)' },
                '&.active': {
                  ...glass.inset,
                  color: 'primary.main',
                  fontWeight: 600,
                  borderColor: 'rgba(125,211,252,0.24)',
                },
                '&.active .MuiListItemIcon-root': { color: 'primary.main' },
              }}
            >
              <ListItemIcon sx={{ minWidth: collapsed && isDesktop ? 0 : 38, color: 'inherit', justifyContent: 'center' }}>{item.icon}</ListItemIcon>
              {(!collapsed || !isDesktop) && (
                <ListItemText primaryTypographyProps={{ fontSize: 14.5, fontWeight: 'inherit' }}>
                  {item.label}
                </ListItemText>
              )}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>
      {USE_MOCK && (
        <Box sx={{ p: collapsed && isDesktop ? 1 : 2 }}>
          <Tooltip title="Running on in-memory sample data. Set VITE_USE_MOCK=false to use the live API.">
            <Chip
              size="small"
              label={collapsed && isDesktop ? 'Demo' : 'Demo data'}
              variant="outlined"
              sx={{ width: '100%' }}
            />
          </Tooltip>
        </Box>
      )}
      {isDesktop && (
        <Box sx={{ p: collapsed ? 1 : 1.5, pt: 0 }}>
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              onClick={() => setCollapsed((value) => !value)}
              size="small"
              sx={{
                width: '100%',
                borderRadius: 2,
                border: '1px solid rgba(148,163,184,0.14)',
                color: 'text.secondary',
              }}
            >
              {collapsed ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <KeyboardDoubleArrowLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  const currentTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'ACME';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
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
            <Avatar sx={{ width: 34, height: 34, fontSize: 14 }}>
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

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        {isDesktop ? (
          <Drawer
            variant="permanent"
            open
            sx={{
              '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', overflowX: 'hidden' },
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
          width: { md: `calc(100% - ${drawerWidth}px)` },
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
