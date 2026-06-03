export default function manifest() {
  return {
    name: 'Staynex Operations',
    short_name: 'Staynex',
    description: 'Staynex hotel operations system',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#070B12',
    theme_color: '#0A66FF',
    icons: [
      {
        src: '/staynex-logo.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  };
}
