import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        historyApiFallback: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                ws: true,
                timeout: 60000,
                proxyTimeout: 60000,
                configure: (proxy, options) => {
                    proxy.on('error', (err, req, res) => {
                        // Suppress proxy error spam in dev console
                    });
                }
            },
            '/ws': {
                target: 'ws://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                ws: true,
                rewriteWsOrigin: true,
                timeout: 60000,
                proxyTimeout: 60000,
                configure: (proxy, options) => {
                    proxy.on('error', (err, req, res) => {
                        // Suppressed spam: console.log(`[Vite Proxy Error] /ws: ${err.message}`);
                    });
                }
            },
            '/storage': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                timeout: 60000,
            },
            '/uploads': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                timeout: 60000,
                rewrite: (path) => path,
                configure: (proxy, options) => {
                    proxy.on('error', (err, req, res) => {
                        console.log(`[Vite Proxy Error] /uploads: ${err.message}`);
                    });
                }
            }
        }
    }
})
