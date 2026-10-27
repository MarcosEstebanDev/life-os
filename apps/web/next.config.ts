import type { NextConfig } from 'next';

/**
 * La API se sirve por el mismo origen que la web: la cookie de sesión no
 * cruza puertos y no hace falta CORS con credenciales.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3010';

const config: NextConfig = {
  // Abajo a la izquierda tapaba "Salir" de la barra lateral.
  devIndicators: { position: 'bottom-right' },
  async redirects() {
    return [{ source: '/', destination: '/brief', permanent: false }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default config;
