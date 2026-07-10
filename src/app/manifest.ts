import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Madame Dacosta Services',
    short_name: 'Mme Dacosta',
    description: 'La meilleure plateforme africaine de recrutement de personnel de maison',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#B83A9C',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
