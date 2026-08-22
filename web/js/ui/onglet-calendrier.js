/**
 * onglet-calendrier.js — Vue d'ensemble.
 *
 * Les jours en colonnes, le matériel en lignes. Chaque examen dessine un trait
 * coloré courant sur les jours pendant lesquels l'appareil est chez le patient.
 * On voit ainsi d'un coup d'œil quel appareil est libre et quand.
 */

import {
  ajouterJours, aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper,
  ecartJours, estFerie, jourSemaine, nomJourFerie,
} from '../core/dates.js';
import { dureeLisible, libelleAppareil, libelleCourt } from '../core/materiel.js';
import { appareilsActifs, etat, parametres } from '../data/etat.js';
import {
  carte, classeMateriel, el, etiquetteAppareil, legendeCouleurs, messageVide,
  nomPatient, ouvrirFenetre, remplir, sexeLisible,
} from './base.js';

const INITIALES_JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Premier jour affiché et largeur de la fenêtre, en jours. */
let debutFenetre = ajouterJours(aujourdHui(), -7);
let largeur = 60;

export function afficherCalendrier(conteneur) {
  remplir(
    conteneur,
    el(
      'div',
      { class: 'barre-outils' },
      el('button', { class: 'bouton', onclick: () => decaler(-30) }, '‹ Mois précédent'),
      el('button', { class: 'bouton', onclick: () => allerAujourdHui() }, 'Aujourd’hui'),
      el('button', { class: 'bouton', onclick: () => decaler(30) }, 'Mois suivant ›'),
      el('span', { class: 'espace' }),
      el('span', { class: 'aide' },
        `du ${dateEnFrancais(debutFenetre)} au ${dateEnFrancais(ajouterJours(debutFenetre, largeur - 1))}`),
      el('div', { style: 'min-width:140px' }, el('input', {
        type: 'date', value: debutFenetre,
        onchange: (e) => { if (e.target.value) { debutFenetre = e.target.value; redessiner(); } },
      })),
      el('div', { style: 'min-width:130px' }, el('select', {
        onchange: (e) => { largeur = Number(e.target.value); redessiner(); },
      }, [30, 60, 90, 120].map((n) => {
        const o = el('option', { value: n }, `${n} jours`);
        if (n === largeur) o.selected = true;
        return o;
      }))),
    ),
    carte(null, legendeCouleurs(), tableauCalendrier()),
  );
}

function decaler(jours) {
  debutFenetre = ajouterJours(debutFenetre, jours);
  redessiner();
}

function allerAujourdHui() {
  debutFenetre = ajouterJours(aujourdHui(), -7);
  redessiner();
}

function redessiner() {
  afficherCalendrier(document.getElementById('vue-calendrier'));
}

// ---------------------------------------------------------------------------
// Construction du tableau
// ---------------------------------------------------------------------------

function tableauCalendrier() {
  const params = parametres();
  const appareils = appareilsActifs();
  if (appareils.length === 0) return messageVide('Aucun appareil dans le parc.');

  const jours = Array.from({ length: largeur }, (_, i) => ajouterJours(debutFenetre, i));
  const dernier = jours[jours.length - 1];
  const today = aujourdHui();

  // Poses concernées par la fenêtre affichée.
  const poses = etat.poses.filter((p) => (
    p.statut !== 'annule'
    && ecartJours(decouper(p.debut).date, dernier) >= 0
    && ecartJours(debutFenetre, decouper(p.fin).date) >= 0
  ));

  const parAppareil = new Map();
  for (const pose of poses) {
    if (!parAppareil.has(pose.appareil_id)) parAppareil.set(pose.appareil_id, []);
    parAppareil.get(pose.appareil_id).push(pose);
  }

  // --- En-tête : mois, puis numéro du jour et initiale ---
  const ligneMois = el('tr', {}, el('th', { class: 'coin', rowspan: 2 }, 'Appareil'));
  let moisCourant = null;
  let cellule = null;
  for (const jour of jours) {
    const mois = jour.slice(0, 7);
    if (mois !== moisCourant) {
      moisCourant = mois;
      cellule = el('th', { class: 'mois', colspan: 1 },
        `${MOIS_COURTS[Number(jour.slice(5, 7)) - 1]} ${jour.slice(0, 4)}`);
      ligneMois.append(cellule);
    } else {
      cellule.colSpan += 1;
    }
  }

  const ligneJours = el('tr', {}, jours.map((jour) => {
    const js = jourSemaine(jour);
    const ferie = nomJourFerie(jour, params);
    return el(
      'th',
      { title: ferie ? `${dateEnFrancaisLong(jour)} — ${ferie}` : dateEnFrancaisLong(jour) },
      el('div', { style: 'font-weight:800' }, String(Number(jour.slice(8, 10)))),
      el('div', { style: 'color:#94a3b8' }, INITIALES_JOURS[js]),
    );
  }));

  // --- Corps : une ligne par appareil ---
  const corps = appareils.map((appareil) => {
    const posesAppareil = parAppareil.get(appareil.id) || [];
    const cellules = jours.map((jour) => {
      const js = jourSemaine(jour);
      const classes = ['jour'];
      if (js === 0 || js === 6) classes.push('week-end');
      if (estFerie(jour, params)) classes.push('ferie');
      if (jour === today) classes.push('aujourdhui');

      const td = el('td', { class: classes.join(' ') });
      const pose = posesAppareil.find((p) => (
        ecartJours(decouper(p.debut).date, jour) >= 0
        && ecartJours(jour, decouper(p.fin).date) >= 0
      ));
      if (pose) td.append(traitDePose(pose, jour, appareil));
      return td;
    });

    return el(
      'tr',
      {},
      el('th', { class: 'appareil', title: libelleAppareil(appareil) },
        el('span', { class: `etiquette ${classeMateriel(appareil)}` }, libelleCourt(appareil)),
        appareil.urgence ? ' ⚠' : ''),
      cellules,
    );
  });

  return el(
    'div',
    { class: 'calendrier' },
    el(
      'table',
      {},
      el('thead', {}, ligneMois, ligneJours),
      el('tbody', {}, corps),
    ),
  );
}

function traitDePose(pose, jour, appareil) {
  const debut = decouper(pose.debut).date;
  const fin = decouper(pose.fin).date;
  const classes = ['trait', classeMateriel(appareil)];
  if (jour === debut) classes.push('debut');
  if (jour === fin) classes.push('fin');

  const patient = nomPatient(pose.rdv);
  return el(
    'div',
    {
      class: classes.join(' '),
      title: `${patient} · ${libelleAppareil(appareil)} · `
        + `du ${dateEnFrancais(debut)} au ${dateEnFrancais(fin)}`,
      onclick: () => detailPose(pose, appareil),
    },
    jour === debut ? patient.slice(0, 9) : '',
  );
}

function detailPose(pose, appareil) {
  const rdv = pose.rdv;
  ouvrirFenetre((fermer) => [
    el('h2', {}, nomPatient(rdv)),
    el(
      'div',
      { class: 'recap' },
      el('div', { class: 'recap-ligne' }, etiquetteAppareil(appareil),
        el('span', {}, dureeLisible(pose.duree_heures))),
      el('div', { class: 'recap-ligne' },
        el('span', {}, 'Pose : '),
        el('strong', {}, `${dateEnFrancaisLong(decouper(pose.debut).date)} à ${decouper(pose.debut).heure}`)),
      el('div', { class: 'recap-ligne' },
        el('span', {}, 'Dépose : '),
        el('strong', {}, `${dateEnFrancaisLong(decouper(pose.fin).date)} à ${decouper(pose.fin).heure}`)),
      rdv ? el('div', { class: 'recap-ligne' },
        el('span', {}, 'Rendez-vous cardiologue : '),
        el('strong', {}, `${dateEnFrancaisLong(decouper(rdv.rdv_cardio).date)} à ${decouper(rdv.rdv_cardio).heure}`),
        el('span', { class: 'etiquette neutre' }, rdv.cardiologue)) : null,
      rdv?.patient_sexe
        ? el('div', { class: 'recap-ligne aide' }, sexeLisible(rdv.patient_sexe))
        : null,
      pose.retour_effectif
        ? el('div', { class: 'recap-ligne aide' },
          `Rendu le ${dateEnFrancais(decouper(pose.retour_effectif).date)} à ${decouper(pose.retour_effectif).heure}`)
        : null,
    ),
    el('div', { class: 'fenetre-actions' },
      el('button', { class: 'bouton principal', onclick: fermer }, 'Fermer')),
  ]);
}
