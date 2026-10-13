import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Allow company subdomains: http://horizon.localhost:5173
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // If the browser hit a company subdomain, forward it for tenant resolution
            // even when the client forgot X-Tenant-Host.
            if (proxyReq.getHeader('x-tenant-host')) return;
            const host = String(req.headers.host ?? '')
              .split(':')[0]
              .toLowerCase();
            if (host && host !== 'localhost' && host !== '127.0.0.1') {
              proxyReq.setHeader('X-Tenant-Host', host);
            }
          });
        },
      },
    },
  },
});
