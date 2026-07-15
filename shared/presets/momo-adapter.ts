import type { AdapterPreset } from '../schemas/adapter.schema';

export const MOMO_ADAPTER_PRESET: AdapterPreset = {
  schemaVersion: 1,
  name: 'momo',
  note: 'OpenWrt Momo',
  replacements: [
    {
      path: ['inbounds'],
      value: [
        { tag: 'dns-in', type: 'direct', listen: '::', listen_port: 1053 },
        { tag: 'redirect-in', type: 'redirect', listen: '::', listen_port: 7890 },
        { tag: 'tproxy-in', type: 'tproxy', listen: '::', listen_port: 7891 },
        { tag: 'http-in', type: 'http', listen: '::', listen_port: 1080 },
        { tag: 'socks-in', type: 'socks', listen: '::', listen_port: 1081 },
        {
          tag: 'tun-in',
          type: 'tun',
          interface_name: 'momo',
          mtu: 9000,
          auto_route: false,
          strict_route: true,
          auto_redirect: false,
          address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
        },
      ],
    },
    {
      path: ['route', 'rules'],
      match: { action: 'hijack-dns' },
      value: { inbound: 'dns-in', action: 'hijack-dns' },
    },
  ],
};
