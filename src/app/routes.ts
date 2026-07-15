import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const WorkspaceView = () => import('../features/workspace/WorkspaceView.vue');

const workspaceRoute = (path: string, name: string, titleKey: string): RouteRecordRaw => ({
  path,
  name,
  component: WorkspaceView,
  meta: { titleKey },
});

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/profiles' },
  workspaceRoute('/connect', 'connect', 'common.appName'),
  workspaceRoute('/profiles', 'profiles', 'nav.profiles'),
  workspaceRoute('/resources/nodes', 'resource-nodes', 'nav.nodes'),
  workspaceRoute('/resources/templates', 'resource-templates', 'nav.templates'),
  workspaceRoute('/resources/adapters', 'resource-adapters', 'nav.adapters'),
  workspaceRoute('/resources/rulesets', 'resource-rulesets', 'nav.rulesets'),
  workspaceRoute('/sync', 'sync', 'nav.sync'),
  workspaceRoute('/settings/general', 'settings-general', 'nav.general'),
  workspaceRoute('/settings/subscription', 'settings-subscription', 'nav.subscription'),
  workspaceRoute('/settings/repository', 'settings-repository', 'nav.repository'),
  workspaceRoute('/settings/about', 'settings-about', 'nav.about'),
  { path: '/:pathMatch(.*)*', redirect: '/profiles' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
