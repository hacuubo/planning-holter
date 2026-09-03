/**
 * onglet-jour.js — Programme de la journée pour la personne qui pose
 * et dépose le matériel.
 *
 * Une ligne par quart d'heure, de l'ouverture à la fermeture, avec le patient,
 * le matériel et sa couleur. Deux boutons suffisent : « Posé » et « Rendu ».
 */

import {
  aujourdHui, ajouterJours, creneauxDuJour, dateEnFrancaisLong, decouper,
  estJourOuvre, horodatage, maintenantHorodatage, nomJourFerie,
} from '../core/dates.js';
import { dureeLisible, libelleAppareil } from '../core/materiel.js';
import { disponibilitesParType } from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilParId, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, classeMateriel, el, encart, etiquetteAppareil, etiquetteSexe,
  legendeCouleurs, messageVide, nomPatient, notifier, notifierErreur,
  pendantAction, remplir,
} from './base.js';
import { exporterJourneeExcel } from './exports.js';

let dateAffichee = aujourdHui();

export function afficherJour(conteneur) {
  const params = parametres();
  const ferie = nomJourFerie(dateAffichee, params);
  const ouvert = estJourOuvre(dateAffichee, params);
  const actes = actesDuJour(dateAffichee);

  remplir(
    conteneur,
    barreDeNavigation(),
    ouvert ? null : encart(
      'alerte',
      el('strong', {}, 'Cabinet fermé — '),
      ferie ? `${dateEnFrancaisLong(dateAffichee)} (${ferie}).` : `${dateEnFrancaisLong(dateAffichee)}.`,
      actes.length ? ' Des actes y sont pourtant programmés (voir ci-dessous).' : '',
    ),
    bandeauDisponibilites(),
    carte(null, legendeCouleurs(), listeDesCreneaux(actes, ouvert)),
  );
}

// ---------------------------------------------------------------------------
// Barre du haut : navigation entre les jours
// ---------------------------------------------------------------------------

function barreDeNavigation() {
  const selecteur = el('input', {
    type: 'date',
    value: dateAffichee,
    onchange: (e) => { if (e.target.value) changerDate(e.target.value); },
  });

  // Sur téléphone, la feuille de style fait passer la date sur sa propre ligne
  // et renvoie le groupe « Imprimer / Excel » à la ligne suivante, pour qu'aucun
  // bouton ne vienne se coller à la date. Voir « Barre du jour » dans styles.css.
  return el(
    'div',
    { class: 'barre-outils barre-jour' },
    el('button', { class: 'bouton', onclick: () => changerDate(jourPrecedent()) }, '←'),
    el('button', { class: 'bouton', onclick: () => changerDate(aujourdHui()) }, 'Aujourd’hui'),
    el('button', { class: 'bouton', onclick: () => changerDate(jourSuivant()) }, '→'),
    el('strong', { class: 'titre-jour' }, dateEnFrancaisLong(dateAffichee)),
    el('span', { class: 'espace' }),
    el('div', { class: 'champ-date' }, selecteur),
    el(
      'div',
      { class: 'groupe-actions' },
      el('button', { class: 'bouton', onclick: () => window.print() }, '🖨 Imprimer'),
      el('button', {
        class: 'bouton',
        onclick: () => exporterJourneeExcel(dateAffichee),
      }, '⬇ Excel'),
    ),
  );
}

function jourPrecedent() {
  const params = parametres();
  let d = ajouterJours(dateAffichee, -1);
  for (let i = 0; i < 10 && !estJourOuvre(d, params); i++) d = ajouterJours(d, -1);
  return d;
}

function jourSuivant() {
  const params = parametres();
  let d = ajouterJours(dateAffichee, 1);
  for (let i = 0; i < 10 && !estJourOuvre(d, params); i++) d = ajouterJours(d, 1);
  return d;
}

function changerDate(nouvelle) {
  dateAffichee = nouvelle;
  afficherJour(document.getElementById('vue-jour'));
}

export function allerAuJour(date) {
  dateAffichee = date;
}

// ---------------------------------------------------------------------------
// Bandeau des appareils disponibles
// ---------------------------------------------------------------------------

function bandeauDisponibilites() {
  const params = parametres();
  // Disponibilité « en ce moment » : appareils non immobilisés dans l'heure qui vient.
  const debut = maintenantHorodatage();
  const fin = horodatage(ajouterJours(decouper(debut).date, 1), decouper(debut).heure);
  const dispos = disponibilitesParType(etat.appareils, posesActives(), debut, fin, params);

  const epuises = dispos.filter((d) => d.libres === 0);

  return carte(
    'Matériel disponible pour une pose immédiate',
    epuises.length
      ? encart(
        'erreur',
        el('strong', {}, '⚠ Plus aucun appareil disponible : '),
        epuises.map((d) => nomType(d)).join(', '),
        '.',
      )
      : null,
    el('div', { class: 'dispos' }, dispos.map((d) => {
      const classe = d.libres === 0 ? 'epuise' : (d.libres <= 2 ? 'tendu' : '');
      return el(
        'div',
        { class: `dispo ${classe}`, title: d.codesLibres.length ? `Libres : ${d.codesLibres.join(', ')}` : 'Aucun appareil libre' },
        el('div', { class: 'dispo-titre' }, nomType(d)),
        el('div', { class: 'dispo-nombre' }, `${d.libres}/${d.total}`),
      );
    })),
  );
}

function nomType(d) {
  if (d.categorie === 'holter_ecg') return `Holter ${d.marque}`;
  if (d.categorie === 'mapa') return 'MAPA';
  if (d.categorie === 'polygraphie') return 'Polygraphie';
  if (d.categorie === 'spider') return 'Spider Flash';
  return d.categorie;
}

// ---------------------------------------------------------------------------
// Actes de la journée
// ---------------------------------------------------------------------------

/** @returns {Array<{heure, type, pose, appareil}>} */
function actesDuJour(date) {
  const actes = [];
  for (const pose of etat.poses) {
    if (pose.statut === 'annule') continue;
    const appareil = appareilParId(pose.appareil_id);
    if (decouper(pose.debut).date === date) {
      actes.push({ heure: decouper(pose.debut).heure, type: 'pose', pose, appareil });
    }
    if (decouper(pose.fin).date === date) {
      actes.push({ heure: decouper(pose.fin).heure, type: 'depose', pose, appareil });
    }
  }
  return actes.sort((a, b) => (
    a.heure.localeCompare(b.heure)
    || nomPatient(a.pose.rdv).localeCompare(nomPatient(b.pose.rdv))
  ));
}

function listeDesCreneaux(actes, ouvert) {
  const params = parametres();
  const creneaux = ouvert ? creneauxDuJour(dateAffichee, params) : [];

  // Les actes situés hors des horaires habituels (réglage modifié après coup)
  // ne doivent jamais disparaître de l'écran.
  const heuresSupplementaires = [...new Set(actes.map((a) => a.heure))]
    .filter((h) => !creneaux.includes(h));
  const toutes = [...creneaux, ...heuresSupplementaires].sort();

  if (toutes.length === 0) return messageVide('Aucun créneau ce jour-là.');

  const parHeure = new Map();
  for (const acte of actes) {
    if (!parHeure.has(acte.heure)) parHeure.set(acte.heure, []);
    parHeure.get(acte.heure).push(acte);
  }

  const nbPoses = actes.filter((a) => a.type === 'pose').length;
  const nbDeposes = actes.length - nbPoses;

  return el(
    'div',
    {},
    el(
      'p',
      { class: 'aide', style: 'margin-top:0' },
      `${nbPoses} pose${nbPoses > 1 ? 's' : ''} et ${nbDeposes} dépose${nbDeposes > 1 ? 's' : ''} `
      + `pour ${new Set(actes.map((a) => a.pose.rdv_id)).size} patient(s).`,
    ),
    el(
      'div',
      { class: 'creneau-entetes' },
      el('span', {}, 'Heure'),
      el('span', {}, '⬇ Poses'),
      el('span', {}, '⬆ Déposes'),
    ),
    toutes.map((h) => ligneCreneau(h, parHeure.get(h) || [])),
  );
}

/** Une ligne par quart d'heure : les poses à gauche, les déposes à droite. */
function ligneCreneau(heure, actes) {
  const poses = actes.filter((a) => a.type === 'pose');
  const deposes = actes.filter((a) => a.type === 'depose');
  const colonne = (liste) => el(
    'div',
    { class: 'creneau-actes' },
    liste.length ? liste.map(carteActe) : el('div', { class: 'creneau-libre' }, '—'),
  );
  return el(
    'div',
    { class: `creneau ${actes.length ? 'plein' : 'vide'}` },
    el('div', { class: 'creneau-heure' }, heure),
    colonne(poses),
    colonne(deposes),
  );
}

function carteActe(acte) {
  const { pose, appareil, type } = acte;
  const rdv = pose.rdv;
  const termine = (type === 'pose' && pose.statut !== 'prevu')
    || (type === 'depose' && pose.statut === 'rendu');

  const classes = type === 'pose'
    ? `acte pose-${classeMateriel(appareil)}`
    : 'acte depose';

  return el(
    'div',
    { class: `${classes}${termine ? ' termine' : ''}` },
    el('span', { title: type === 'pose' ? 'Pose' : 'Dépose' }, type === 'pose' ? '⬇' : '⬆'),
    el(
      'div',
      { style: 'min-width:0' },
      el('div', { class: 'acte-patient' }, nomPatient(rdv), ' ', etiquetteSexe(rdv)),
      el(
        'div',
        { class: 'acte-detail' },
        type === 'pose'
          ? `Pose · ${dureeLisible(pose.duree_heures)} · dépose le ${decouper(pose.fin).date.split('-').reverse().join('/')} à ${decouper(pose.fin).heure}`
          : `Dépose · RDV ${rdv?.cardiologue || '?'} à ${decouper(rdv?.rdv_cardio || pose.fin).heure}`,
      ),
    ),
    etiquetteAppareil(appareil),
    el('span', { class: 'etiquette neutre' }, rdv?.cardiologue || '—'),
    boutonsActe(acte, termine),
  );
}

function boutonsActe(acte, termine) {
  const { pose, type } = acte;

  if (type === 'pose') {
    if (termine) return el('span', { class: 'acte-actions etiquette neutre' }, '✓ posé');
    return el(
      'div',
      { class: 'acte-actions' },
      el('button', {
        class: 'bouton petit principal',
        onclick: (e) => pendantAction(e.target, async () => {
          try {
            await api.enregistrerPose(pose.id);
            await rafraichir();
            notifier('Pose enregistrée.', 'succes');
          } catch (erreur) { notifierErreur(erreur); }
        }),
      }, 'Posé'),
    );
  }

  if (pose.statut === 'rendu') {
    return el('span', { class: 'acte-actions etiquette neutre' }, '✓ rendu');
  }
  return el(
    'div',
    { class: 'acte-actions' },
    el('button', {
      class: 'bouton petit principal',
      title: 'L’appareil redevient immédiatement disponible',
      onclick: (e) => pendantAction(e.target, async () => {
        try {
          await api.enregistrerRetour(pose.id, maintenantHorodatage());
          await rafraichir();
          notifier(`${libelleAppareil(appareilParId(pose.appareil_id))} est de nouveau disponible.`, 'succes');
        } catch (erreur) { notifierErreur(erreur); }
      }),
    }, 'Rendu'),
  );
}

export { actesDuJour, dateAffichee };
