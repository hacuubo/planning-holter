/**
 * demarrer-demo.js — Lance l'application en mode démonstration.
 * Aucune donnée réelle, aucune connexion à Internet : tout est en mémoire.
 */

import { installerFausseBase } from './faux-supabase.js';

installerFausseBase();

window.__CONFIG_PLANNING__ = {
  SUPABASE_URL: 'https://demonstration.local',
  SUPABASE_ANON_KEY: 'demonstration',
  NOM_CABINET: 'Planning Holter — DÉMONSTRATION',
};

// L'application est chargée seulement maintenant, une fois la fausse base prête.
await import('../js/app.js');

// Connexion automatique pour aller droit au but.
const email = document.getElementById('connexion-email');
const mdp = document.getElementById('connexion-mdp');
if (email && mdp) {
  email.value = 'demonstration@exemple.fr';
  mdp.value = 'demonstration';
  setTimeout(() => document.getElementById('formulaire-connexion')
    ?.dispatchEvent(new Event('submit', { cancelable: true })), 50);
}
