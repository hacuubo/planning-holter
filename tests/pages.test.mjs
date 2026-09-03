/**
 * Contrôles sur les pages HTML du site.
 *
 * Ces tests protègent contre une panne réelle rencontrée pendant la mise au
 * point : la page de démonstration avait été recopiée à la main, puis oubliée
 * lors d'une évolution de l'application, ce qui laissait un écran vide.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construireDemonstration } from '../scripts/generer-demonstration.mjs';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

const INDEX = lire('../web/index.html');
const DEMO = lire('../web/demonstration.html');

test('la page de démonstration est à jour', () => {
  assert.equal(
    DEMO,
    construireDemonstration(INDEX),
    'web/demonstration.html est décalé par rapport à index.html — lancez « npm run demo »',
  );
});

test('les éléments attendus par le code sont présents dans la page', () => {
  // Tout identifiant utilisé par app.js doit exister dans index.html.
  const identifiants = [
    'ecran-connexion', 'formulaire-connexion', 'connexion-email', 'connexion-mdp',
    'connexion-erreur', 'ecran-configuration', 'application', 'titre-cabinet',
    'etat-connexion', 'nom-utilisateur', 'bouton-deconnexion',
    'bandeau-alerte', 'bandeau-rappel', 'notifications', 'fenetre', 'pastille-alertes',
    'vue-jour', 'vue-rdv', 'vue-recherche', 'vue-calendrier', 'vue-alertes', 'vue-parametres',
  ];
  for (const id of identifiants) {
    assert.ok(INDEX.includes(`id="${id}"`), `identifiant manquant dans index.html : ${id}`);
  }
});

test('chaque onglet a bien une vue correspondante', () => {
  const onglets = [...INDEX.matchAll(/data-onglet="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(onglets, ['jour', 'rdv', 'recherche', 'calendrier', 'alertes', 'parametres']);
  for (const onglet of onglets) {
    assert.ok(INDEX.includes(`id="vue-${onglet}"`), `vue manquante pour l’onglet ${onglet}`);
  }
});

test('la démonstration ne charge jamais la vraie base de données', () => {
  assert.ok(!DEMO.includes('vendor/supabase.js'), 'la démonstration ne doit pas charger Supabase');
  assert.ok(DEMO.includes('demo/demarrer-demo.js'));
  assert.ok(DEMO.includes('DÉMONSTRATION'), 'la démonstration doit s’annoncer clairement');
  assert.ok(INDEX.includes('vendor/supabase.js'), 'l’application réelle doit charger Supabase');
  assert.ok(!INDEX.includes('demo/'), 'l’application réelle ne doit rien charger de la démonstration');
});

test('la page interdit son indexation par les moteurs de recherche', () => {
  assert.ok(INDEX.includes('name="robots"') && INDEX.includes('noindex'));
});
