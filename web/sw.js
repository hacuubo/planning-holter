/**
 * sw.js — Service worker : le site reste consultable même si la connexion
 * saute un instant, et il devient installable comme une application.
 *
 * Stratégie « réseau d'abord » : chaque fichier est toujours demandé au
 * serveur (les mises à jour arrivent donc normalement) et mis de côté ;
 * si le réseau échoue, la dernière version connue est servie. Les échanges
 * avec la base Supabase (autre domaine) ne passent pas par ce cache.
 */

const CACHE = 'planning-holter';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evenement) => evenement.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (evenement) => {
  const { request } = evenement;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  evenement.respondWith(
    fetch(request)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(request)),
  );
});
