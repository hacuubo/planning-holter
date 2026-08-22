/**
 * generer-demonstration.mjs — Fabrique `web/demonstration.html` à partir de
 * `web/index.html`.
 *
 * Pourquoi : la démonstration doit être la copie EXACTE de l'application, à
 * la source de données près. En la recopiant à la main, on finit par oublier
 * une modification et la démonstration ne reflète plus le vrai logiciel.
 *
 *   npm run demo
 *
 * Ce script est aussi exécuté par les tests, qui vérifient que la page de
 * démonstration est bien à jour.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../web/index.html', import.meta.url));
const CIBLE = fileURLToPath(new URL('../web/demonstration.html', import.meta.url));

const BANDEAU = '<div style="background:#b45309;color:#fff;padding:.5rem 1rem;'
  + 'text-align:center;font-weight:700;font-size:.85rem">'
  + 'Mode DÉMONSTRATION — données fictives, rien n’est enregistré</div>';

const AVERTISSEMENT = '<!-- ⚠️ FICHIER PRODUIT AUTOMATIQUEMENT — NE PAS MODIFIER À LA MAIN.\n'
  + '     Il est régénéré depuis index.html par « npm run demo ». -->';

/** Transforme le contenu de index.html en page de démonstration. */
export function construireDemonstration(source) {
  let page = source;

  page = page.replace(
    '<title>Planning Holter</title>',
    '<title>Planning Holter — démonstration</title>',
  );

  // La démonstration n'utilise pas la vraie bibliothèque Supabase…
  page = page.replace('<script src="vendor/supabase.js"></script>\n', '');

  // …et charge l'application via son propre point d'entrée.
  page = page.replace(
    '<script type="module" src="js/app.js"></script>',
    '<script type="module" src="demo/demarrer-demo.js"></script>',
  );

  page = page.replace('<body>\n', `<body>\n\n${BANDEAU}\n`);
  page = page.replace('<!doctype html>', `<!doctype html>\n${AVERTISSEMENT}`);

  return page;
}

const attendu = construireDemonstration(readFileSync(SOURCE, 'utf8'));

if (process.argv.includes('--verifier')) {
  const actuel = readFileSync(CIBLE, 'utf8');
  if (actuel !== attendu) {
    console.error('La page de démonstration n’est plus à jour. Lancez : npm run demo');
    process.exitCode = 1;
  } else {
    console.log('Page de démonstration à jour.');
  }
} else {
  writeFileSync(CIBLE, attendu);
  console.log('web/demonstration.html régénéré depuis web/index.html');
}
