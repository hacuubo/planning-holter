/**
 * serveur-local.mjs — Ouvre le site sur cet ordinateur, pour essayer
 * l'interface sans rien mettre en ligne.
 *
 *   npm run site        puis ouvrir http://localhost:8080/demonstration.html
 *
 * Ce fichier ne sert QUE pendant la mise au point : le site publié sur
 * GitHub Pages n'en a pas besoin.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const serveur = createServer(async (requete, reponse) => {
  const chemin = decodeURIComponent(new URL(requete.url, 'http://localhost').pathname);
  const relatif = normalize(chemin === '/' ? '/index.html' : chemin).replace(/^[\\/]+/, '');

  // Empêche de sortir du dossier `web` (« ../../ »).
  if (relatif.split(sep).includes('..')) {
    reponse.writeHead(403).end('Accès refusé');
    return;
  }

  try {
    const contenu = await readFile(join(RACINE, relatif));
    reponse.writeHead(200, {
      'Content-Type': TYPES[extname(relatif)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    reponse.end('Fichier introuvable');
  }
});

serveur.listen(PORT, () => {
  console.log(`Site disponible sur http://localhost:${PORT}/`);
  console.log(`Démonstration     : http://localhost:${PORT}/demonstration.html`);
});
