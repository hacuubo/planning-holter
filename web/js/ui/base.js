/**
 * base.js — Petits outils d'affichage réutilisés par tous les écrans :
 * création d'éléments, messages temporaires, fenêtres de confirmation.
 */

import { couleursAppareil, libelleAppareil, libelleCourt, CATEGORIES } from '../core/materiel.js';

// ---------------------------------------------------------------------------
// Création d'éléments HTML
// ---------------------------------------------------------------------------

/**
 * Crée un élément.
 *   el('div', { class: 'carte' }, 'texte', el('b', {}, 'gras'))
 * Les valeurs sont insérées comme du TEXTE, jamais comme du HTML : une
 * apostrophe ou un chevron dans un nom de patient ne peut donc rien casser.
 */
export function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === 'class') noeud.className = valeur;
    else if (cle === 'style') noeud.style.cssText = valeur;
    else if (cle.startsWith('on') && typeof valeur === 'function') {
      noeud.addEventListener(cle.slice(2), valeur);
    } else if (cle === 'html') noeud.innerHTML = valeur;
    else if (valeur === true) noeud.setAttribute(cle, '');
    else noeud.setAttribute(cle, valeur);
  }
  for (const enfant of enfants.flat(3)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return noeud;
}

/** Vide un conteneur puis y place de nouveaux enfants. */
export function remplir(conteneur, ...enfants) {
  conteneur.replaceChildren(...enfants.flat(3).filter((x) => x !== null && x !== undefined && x !== false));
  return conteneur;
}

export function carte(titre, ...contenu) {
  return el('section', { class: 'carte' }, titre ? el('h2', {}, titre) : null, ...contenu);
}

export function encart(type, ...contenu) {
  return el('div', { class: `encart ${type}` }, ...contenu);
}

export function messageVide(texte) {
  return el('p', { class: 'vide-message' }, texte);
}

/** Champ de formulaire avec son intitulé. */
export function champ(intitule, controle, options = {}) {
  return el(
    'label',
    { class: 'champ' },
    el('span', {}, intitule, options.facultatif ? el('span', { class: 'facultatif' }, ' (facultatif)') : null),
    controle,
    options.aide ? el('span', { class: 'aide' }, options.aide) : null,
  );
}

export function selection(options, valeur, surChangement, attributs = {}) {
  const noeud = el('select', { ...attributs, onchange: (e) => surChangement(e.target.value) });
  for (const option of options) {
    const o = el('option', { value: option.valeur }, option.libelle);
    if (String(option.valeur) === String(valeur)) o.selected = true;
    noeud.append(o);
  }
  return noeud;
}

// ---------------------------------------------------------------------------
// Étiquettes de matériel
// ---------------------------------------------------------------------------

export function classeMateriel(appareil) {
  if (!appareil) return 'neutre';
  return appareil.categorie === 'holter_ecg'
    ? `holter_ecg-${appareil.marque || 'DMS'}`
    : appareil.categorie;
}

export function etiquetteAppareil(appareil, court = false) {
  if (!appareil) return el('span', { class: 'etiquette neutre' }, 'non attribué');
  return el(
    'span',
    { class: `etiquette ${classeMateriel(appareil)}`, title: libelleAppareil(appareil) },
    court ? libelleCourt(appareil) : libelleAppareil(appareil),
    appareil.urgence ? ' ⚠' : null,
  );
}

/** Bandeau de légende des couleurs. */
export function legendeCouleurs() {
  const exemples = [
    { categorie: 'holter_ecg', marque: 'DMS', code: 'DMS' },
    { categorie: 'holter_ecg', marque: 'ELA', code: 'ELA' },
    { categorie: 'mapa', code: 'MAPA' },
    { categorie: 'polygraphie', code: 'Polygraphie' },
    { categorie: 'spider', code: 'Spider Flash' },
  ];
  return el('div', { class: 'legende' }, exemples.map((a) => el(
    'span',
    { class: `etiquette ${classeMateriel(a)}` },
    a.categorie === 'holter_ecg' ? `Holter ${a.marque}` : CATEGORIES[a.categorie].libelle,
  )));
}

export { couleursAppareil };

// ---------------------------------------------------------------------------
// Messages temporaires
// ---------------------------------------------------------------------------

export function notifier(texte, type = '') {
  const zone = document.getElementById('notifications');
  const message = el('div', { class: `notification ${type}` }, texte);
  zone.append(message);
  setTimeout(() => message.remove(), type === 'erreur' ? 7000 : 4000);
}

export function notifierErreur(erreur) {
  console.error(erreur);
  notifier(erreur?.message || 'Une erreur est survenue.', 'erreur');
}

// ---------------------------------------------------------------------------
// Fenêtres modales
// ---------------------------------------------------------------------------

/**
 * Ouvre une fenêtre. `construire(fermer)` doit renvoyer le contenu.
 * @returns {Function} fonction de fermeture
 */
export function ouvrirFenetre(construire) {
  const fond = document.getElementById('fenetre');
  const application = document.getElementById('application');
  const declencheur = document.activeElement;

  const fermer = () => {
    fond.hidden = true;
    fond.replaceChildren();
    // Le reste de la page redevient utilisable (clavier compris).
    if (application) application.inert = false;
    document.removeEventListener('keydown', surTouche);
    if (declencheur && declencheur.focus) declencheur.focus();
  };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };

  const boite = el('div', { class: 'fenetre', role: 'dialog', 'aria-modal': 'true' });
  boite.append(...[construire(fermer)].flat().filter(Boolean));

  fond.replaceChildren(boite);
  fond.hidden = false;
  // Tant que la fenêtre est ouverte, l'arrière-plan n'est plus accessible :
  // la tabulation reste dans la fenêtre.
  if (application) application.inert = true;
  fond.onclick = (e) => { if (e.target === fond) fermer(); };
  document.addEventListener('keydown', surTouche);

  const premier = boite.querySelector('input, select, textarea, button');
  if (premier) setTimeout(() => premier.focus(), 30);

  return fermer;
}

/** Demande une confirmation. Renvoie une promesse : true si l'utilisateur valide. */
export function confirmer({ titre, message, boutonValider = 'Confirmer', danger = false, details = null }) {
  return new Promise((resoudre) => {
    ouvrirFenetre((fermer) => [
      el('h2', {}, titre),
      typeof message === 'string' ? el('p', {}, message) : message,
      details,
      el(
        'div',
        { class: 'fenetre-actions' },
        el('button', { class: 'bouton', onclick: () => { fermer(); resoudre(false); } }, 'Annuler'),
        el('button', {
          class: `bouton ${danger ? 'danger' : 'principal'}`,
          onclick: () => { fermer(); resoudre(true); },
        }, boutonValider),
      ),
    ]);
  });
}

/** Demande une saisie libre. Renvoie la chaîne saisie, ou null. */
export function demanderTexte({ titre, message, valeur = '', boutonValider = 'Valider' }) {
  return new Promise((resoudre) => {
    let saisie;
    ouvrirFenetre((fermer) => {
      saisie = el('input', { type: 'text', value: valeur });
      const valider = () => { fermer(); resoudre(saisie.value.trim() || null); };
      saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
      return [
        el('h2', {}, titre),
        message ? el('p', {}, message) : null,
        saisie,
        el(
          'div',
          { class: 'fenetre-actions' },
          el('button', { class: 'bouton', onclick: () => { fermer(); resoudre(null); } }, 'Annuler'),
          el('button', { class: 'bouton principal', onclick: valider }, boutonValider),
        ),
      ];
    });
  });
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

/**
 * Nom du patient, en majuscules.
 * Le cabinet n'enregistre que le nom de famille et le sexe : ni prénom,
 * ni date de naissance.
 */
export function nomPatient(rdv) {
  if (!rdv) return '—';
  return (rdv.patient_nom || '').toUpperCase().trim() || '—';
}

/** Libellé long du sexe, pour les info-bulles et les documents. */
export function sexeLisible(sexe) {
  return { F: 'Femme', M: 'Homme' }[sexe] || '';
}

/** Petite pastille « F » ou « M » affichée à côté du nom. */
export function etiquetteSexe(rdv) {
  const sexe = rdv?.patient_sexe;
  if (!sexe) return null;
  return el('span', { class: 'etiquette neutre', title: sexeLisible(sexe) }, sexe);
}

/** Empêche le double-clic sur un bouton d'action pendant un enregistrement. */
export async function pendantAction(bouton, action) {
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Patientez…';
  try {
    return await action();
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}
