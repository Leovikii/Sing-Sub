import {
  ActionIcon,
  AppShell as MantineAppShell,
  Box,
  Burger,
  Divider,
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
import { useDisclosure, useMounted } from '@mantine/hooks';
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
  { to: '/settings/general', match: '/settings', label: 'nav.settings', icon: Settings },
] as const;

function RouteTransition({ children }: { children: ReactNode }) {
  const mounted = useMounted();

  return (
    <Transition mounted={mounted} transition="fade" duration={120} timingFunction="ease-out">
      {(styles) => <Box data-testid="route-transition" style={styles}>{children}</Box>}
    </Transition>
  );
}

export function AppShell() {
  const [opened, { toggle, close }] = useDisclosure();
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

  const confirmLogout = () => modals.openConfirmModal({
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
  });

  return (
    <MantineAppShell
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={t(opened ? 'nav.closeMenu' : 'nav.openMenu')}
            />
            <Image src="/favicon.svg" alt="" w={36} h={36} fit="contain" data-testid="app-brand-icon" />
            <Text fw={700}>{t('common.appName')}</Text>
          </Group>
          <Group gap="xs">
            <Tooltip label={t('common.switchLanguage')}>
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label={t('common.switchLanguage')}
                onClick={toggleLanguage}
              >
                <Languages size={19} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('common.switchTheme')}>
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label={t('common.switchTheme')}
                onClick={() => setColorScheme(dark ? 'light' : 'dark')}
              >
                {dark ? <Sun size={19} /> : <Moon size={19} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('nav.logout')}>
              <ActionIcon variant="subtle" color="red" size="lg" aria-label={t('nav.logout')} onClick={confirmLogout}>
                <LogOut size={19} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="sm" aria-label={t('nav.main')}>
        <MantineAppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            {navigation.map(({ to, match, label, icon: Icon, ...item }) => (
              <NavLink
                key={to}
                component={RouterNavLink}
                to={to}
                label={t(label)}
                leftSection={<Icon size={18} />}
                active={location.pathname === match || location.pathname.startsWith(`${match}/`)}
                variant={'children' in item ? 'subtle' : 'light'}
                onClick={() => { navigate(to); close(); }}
                defaultOpened={match === '/resources'}
              >
                {'children' in item && item.children ? (
                  <Stack gap={4} pt={4}>
                    {item.children.map(({ to: childTo, label: childLabel, icon: ChildIcon }) => (
                      <NavLink
                        key={childTo} component={RouterNavLink} to={childTo} label={t(childLabel)}
                        leftSection={<ChildIcon size={16} />} active={location.pathname === childTo} onClick={close}
                      />
                    ))}
                  </Stack>
                ) : null}
              </NavLink>
            ))}
          </Stack>
        </MantineAppShell.Section>
        <Divider my="sm" />
        <MantineAppShell.Section>
          <Text c="dimmed" size="xs" px="sm">
            v{__APP_VERSION__}
          </Text>
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <RouteTransition key={location.pathname}>{outlet}</RouteTransition>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
