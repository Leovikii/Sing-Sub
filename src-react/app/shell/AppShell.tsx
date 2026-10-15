import {
  ActionIcon,
  AppShell as MantineAppShell,
  Box,
  Burger,
  Divider,
  Drawer,
  Button,
  Group,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  Transition,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useMounted, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import {
  Boxes,
  Languages,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  LogOut,
  Layers3,
  ShieldCheck,
  UserRound,
  Waypoints,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { modals } from '@mantine/modals';
import { NavLink as RouterNavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { clearApplicationSession } from '../session';
import { useSessionStore } from '../../stores/session';

const navigation = [
  { to: '/profiles', match: '/profiles', label: 'nav.profiles', icon: UserRound },
  {
    to: '/resources/nodes', match: '/resources', label: 'nav.resources', icon: Boxes,
    children: [
      { to: '/resources/nodes', label: 'nav.nodes', icon: Waypoints },
      { to: '/resources/templates', label: 'nav.templates', icon: Layers3 },
      { to: '/resources/rulesets', label: 'nav.rulesets', icon: ShieldCheck },
    ],
  },
  { to: '/sync', match: '/sync', label: 'nav.sync', icon: RefreshCw },
  { to: '/settings', match: '/settings', label: 'nav.settings', icon: Settings },
] as const;

function RouteTransition({ children }: { children: ReactNode }) {
  const mounted = useMounted();

  return (
    <Transition mounted={mounted} transition="fade" duration={120} timingFunction="ease-out">
      {(styles) => <Box data-testid="route-transition" style={styles}>{children}</Box>}
    </Transition>
  );
}

function Navigation({ compact = false, onNavigate }: { compact?: boolean; onNavigate: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  return <Stack gap={4}>
    {navigation.map(({ to, match, label, icon: Icon, ...item }) => compact ? (
      ('children' in item ? item.children : [{ to, label, icon: Icon }]).map(({ to: target, label: itemLabel, icon: ItemIcon }) => <Tooltip key={target} label={t(itemLabel)} position="right" events={{ hover: true, focus: true, touch: true }}>
        <ActionIcon component={RouterNavLink} to={target} onClick={onNavigate} aria-label={t(itemLabel)} size={44}
          variant={location.pathname === target || location.pathname.startsWith(`${target}/`) ? 'light' : 'subtle'}>
          <ItemIcon size={18} />
        </ActionIcon>
      </Tooltip>)
    ) : <NavLink key={to} component={RouterNavLink} to={to} label={t(label)} leftSection={<Icon size={18} />}
      active={location.pathname === match || location.pathname.startsWith(`${match}/`)}
      mih={44} variant={'children' in item ? 'subtle' : 'light'} onClick={() => { if ('children' in item) navigate(to); onNavigate(); }} defaultOpened={match === '/resources'}
      styles={{ root: { borderRadius: 'var(--mantine-radius-md)' }, body: { minHeight: 24 } }}>
      {'children' in item && <Stack gap={4} pt={4}>{item.children.map(({ to: childTo, label: childLabel, icon: ChildIcon }) => (
        <NavLink key={childTo} component={RouterNavLink} to={childTo} label={t(childLabel)} leftSection={<ChildIcon size={16} />}
          active={location.pathname === childTo} onClick={onNavigate} mih={44} />
      ))}</Stack>}
    </NavLink>)}
  </Stack>;
}

export function AppShell() {
  const [opened, { toggle, close }] = useDisclosure();
  const [compact, setCompact] = useLocalStorage({ key: 'sing-sub.navigation-collapsed', defaultValue: false, getInitialValueInEffect: false });
  const mobile = useMediaQuery('(max-width: 47.99em)');
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');
  const dark = computedColorScheme === 'dark';
  const logout = useSessionStore((state) => state.logout);

  const toggleLanguage = () => {
    void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN');
  };

  const confirmLogout = () => { close(); modals.openConfirmModal({
    title: t('workspace.logoutTitle'),
    children: <Text size="sm">{t('workspace.logoutMessage')}</Text>,
    labels: { confirm: t('nav.logout'), cancel: t('common.cancel') },
    confirmProps: { color: 'red' },
    centered: true,
    onConfirm: async () => {
      await logout();
      clearApplicationSession();
      navigate('/connect', { replace: true });
    },
  }); };

  return (
    <MantineAppShell
      transitionDuration={120}
      header={{ height: 64 }}
      navbar={{ width: compact ? 64 : 216, breakpoint: 'sm', collapsed: { mobile: true } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="sm" gap="xs" justify="space-between">
          <Group gap="xs">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm" w={44} h={44}
              aria-label={t(opened ? 'nav.closeMenu' : 'nav.openMenu')}
            />
            <Tooltip label={t(compact ? 'nav.expand' : 'nav.collapse')}>
              <ActionIcon size={44} variant="subtle" visibleFrom="sm" aria-expanded={!compact}
                aria-label={t(compact ? 'nav.expand' : 'nav.collapse')} onClick={() => setCompact(value => !value)}>
                {compact ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
              </ActionIcon>
            </Tooltip>
            <Image src="/favicon.svg" alt="" w={36} h={36} fit="contain" data-testid="app-brand-icon" />
            <Text fw={700} visibleFrom="xs">{t('common.appName')}</Text>
          </Group>
          <Group gap={0}>
            <Tooltip label={t('common.switchLanguage')}>
              <ActionIcon
                variant="subtle"
                size={44}
                aria-label={t('common.switchLanguage')}
                onClick={toggleLanguage}
              >
                <Languages size={19} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('common.switchTheme')}>
              <ActionIcon
                variant="subtle"
                size={44}
                aria-label={t('common.switchTheme')}
                onClick={() => setColorScheme(dark ? 'light' : 'dark')}
              >
                {dark ? <Sun size={19} /> : <Moon size={19} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('nav.logout')}>
              <ActionIcon variant="subtle" color="red" size={44} aria-label={t('nav.logout')} onClick={confirmLogout}>
                <LogOut size={19} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={10} aria-label={t('nav.main')} visibleFrom="sm">
        <MantineAppShell.Section grow component={ScrollArea}>
          <Navigation compact={compact} onNavigate={close} />
        </MantineAppShell.Section>
        {!compact && <><Divider my="sm" /><MantineAppShell.Section>
          <Text c="dimmed" size="xs" px="sm">v{__APP_VERSION__}</Text>
        </MantineAppShell.Section></>}
      </MantineAppShell.Navbar>
      <Drawer opened={opened && Boolean(mobile)} onClose={close} title={t('nav.main')}
        size="min(280px, calc(100vw - 48px))" padding="sm"
        closeButtonProps={{ 'aria-label': t('nav.closeMenu'), size: 44 }}
        transitionProps={{ duration: 120 }}>
        <Box component="nav" aria-label={t('nav.main')}><Navigation onNavigate={close} /></Box>
        <Divider my="sm" />
        <Button variant="subtle" color="red" h={44} fullWidth leftSection={<LogOut size={18} />} onClick={confirmLogout}>{t('nav.logout')}</Button>
      </Drawer>

      <MantineAppShell.Main>
        <RouteTransition key={location.pathname}>{outlet}</RouteTransition>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
