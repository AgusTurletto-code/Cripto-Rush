import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const zone = (env.VITE_MONETAG_ZONE || '').trim();
  if (zone && !/^\d+$/.test(zone)) throw new Error('VITE_MONETAG_ZONE debe ser solo el número de la zona (ej: 9012345)');

  return {
    base: './',
    plugins: [{
      // Escribe la etiqueta del SDK de Monetag en el HTML (Monetag la busca para verificar la Mini App).
      // No se agrega en la demo ni si no hay zona configurada.
      name: 'monetag-tag',
      transformIndexHtml(html) {
        if (!zone || env.VITE_DEMO === '1') return html;
        const tag = `<script src="//libtl.com/sdk.js" data-zone="${zone}" data-sdk="show_${zone}"></script>`;
        return html.replace('</head>', `  ${tag}\n</head>`);
      },
    }],
    server: {
      host: true,
      proxy: { '/api': 'http://localhost:3000', '/tonconnect-manifest.json': 'http://localhost:3000' },
      fs: { allow: ['..'] }, // permite importar ../shared
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
