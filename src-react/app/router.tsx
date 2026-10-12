/* eslint-disable react-refresh/only-export-components -- route modules intentionally compose lazy components */
import { Center, Loader } from '@mantine/core';
import { lazy, type ReactNode, Suspense } from 'react';
import { Navigate, createHashRouter } from 'react-router-dom';
import { BootstrapBoundary } from './BootstrapBoundary';
import { RequireSession } from './RequireSession';
import { ConnectPage } from '../features/auth/ConnectPage';
import { SettingsLayout } from '../features/settings/SettingsLayout';
import { AppShell } from './shell/AppShell';

const ProfilesPage = lazy(() => import('../features/profiles/ProfilesPage').then((module) => ({ default: module.ProfilesPage })));
const ResourcesPage = lazy(() => import('../features/resources/ResourcesPage').then((module) => ({ default: module.ResourcesPage })));
const SyncPage = lazy(() => import('../features/sync/SyncPage').then((module) => ({ default: module.SyncPage })));
const GeneralSettings = lazy(() => import('../features/settings/GeneralSettings').then((module) => ({ default: module.GeneralSettings })));
const SubscriptionSettings = lazy(() => import('../features/settings/SubscriptionSettings').then((module) => ({ default: module.SubscriptionSettings })));
const RepositorySettings = lazy(() => import('../features/settings/RepositorySettings').then((module) => ({ default: module.RepositorySettings })));
const AboutSettings = lazy(() => import('../features/settings/AboutSettings').then((module) => ({ default: module.AboutSettings })));

function deferred(element: ReactNode) {
  return <Suspense fallback={<Center mih="50dvh"><Loader /></Center>}>{element}</Suspense>;
}

export const router = createHashRouter([
  {
    element: <BootstrapBoundary />,
    children: [
      { path: 'connect', element: <ConnectPage /> },
      {
        element: <RequireSession />,
        children: [{
          element: <AppShell />,
          children: [
            { index: true, element: <Navigate replace to="/profiles" /> },
            { path: 'profiles', element: deferred(<ProfilesPage />) },
            { path: 'resources/nodes', element: deferred(<ResourcesPage type="node" />) },
            { path: 'resources/templates', element: deferred(<ResourcesPage type="template" />) },
            { path: 'resources/rulesets', element: deferred(<ResourcesPage type="ruleset" />) },
            { path: 'sync', element: deferred(<SyncPage />) },
            {
              path: 'settings',
              element: <SettingsLayout />,
              children: [
                { index: true, element: <Navigate replace to="/settings/general" /> },
                { path: 'general', element: deferred(<GeneralSettings />) },
                { path: 'subscription', element: deferred(<SubscriptionSettings />) },
                { path: 'repository', element: deferred(<RepositorySettings />) },
                { path: 'about', element: deferred(<AboutSettings />) },
              ],
            },
            { path: '*', element: <Navigate replace to="/profiles" /> },
          ],
        }],
      },
    ],
  },
]);
