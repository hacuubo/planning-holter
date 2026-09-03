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
import { CATEGORIES, dureeLisible, libelleAppareil, libelleCourt } from '../core/materiel.js';
import { planChangementAppareil } from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilsActifs, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, classeMateriel, el, etiquetteAppareil, messageVide, nomPatient,
  notifier, notifierErreur, ouvrirFenetre, remplir, sexeLisible,
} from './base.js';

const INITIALES_JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Premier jour affiché et largeur de la fenêtre, en jours. */
let debutFenetre = ajouterJours(aujourdHui(), -7);
let largeur = 60;

/** Types de matériel masqués d'un clic sur la légende (clé catégorie|marque). */
const typesMasques = new Set();

function cleType(appareil) {
  return appareil.categorie === 'holter_ecg'
    ? `holter_ecg|${appareil.marque || ''}`
    : appareil.categorie;
}

/** En vue rapprochée (3 jours), on navigue par pas de 3 jours, pas de mois. */
function pasNavigation() {
  return largeur <= 7 ? largeur : 30;
}

export function afficherCalendrier(conteneur) {
  remplir(
    conteneur,
    el(
      'div',
      // Même principe que la barre de l'onglet Journée : sur téléphone, la
      // période affichée passe seule sur la première ligne (voir styles.css).
      { class: 'barre-outils barre-calendrier' },
      el('button', { class: 'bouton', onclick: () => decaler(-pasNavigation()) }, '‹ Précédent'),
      el('button', { class: 'bouton', onclick: () => allerAujourdHui() }, 'Aujourd’hui'),
      el('button', { class: 'bouton', onclick: () => decaler(pasNavigation()) }, 'Suivant ›'),
      el('span', { class: 'espace' }),
      el('span', { class: 'aide periode-affichee' },
        `du ${dateEnFrancais(debutFenetre)} au ${dateEnFrancais(ajouterJours(debutFenetre, largeur - 1))}`),
      el('div', { style: 'min-width:140px' }, el('input', {
        type: 'date', value: debutFenetre,
        onchange: (e) => { if (e.target.value) { debutFenetre = e.target.value; redessiner(); } },
      })),
      el('div', { style: 'min-width:130px' }, el('select', {
        onchange: (e) => {
          largeur = Number(e.target.value);
          // En passant en vue 3 jours, on se centre sur aujourd'hui.
          if (largeur <= 7) debutFenetre = ajouterJours(aujourdHui(), -1);
          redessiner();
        },
      }, [3, 30, 60, 90, 120].map((n) => {
        const o = el('option', { value: n }, `${n} jours`);
        if (n === largeur) o.selected = true;
        return o;
      }))),
    ),
    carte(null, legendeFiltrante(), tableauCalendrier()),
  );
}

/**
 * Légende cliquable : un clic sur un type le masque ou le réaffiche, pour
 * alléger le tableau (par exemple ne garder que les Holter DMS).
 */
function legendeFiltrante() {
  const types = [
    { cle: 'holter_ecg|DMS', libelle: 'Holter DMS', exemple: { categorie: 'holter_ecg', marque: 'DMS' } },
    { cle: 'holter_ecg|ELA', libelle: 'Holter ELA', exemple: { categorie: 'holter_ecg', marque: 'ELA' } },
    { cle: 'mapa', libelle: CATEGORIES.mapa.libelle, exemple: { categorie: 'mapa' } },
    { cle: 'polygraphie', libelle: CATEGORIES.polygraphie.libelle, exemple: { categorie: 'polygraphie' } },
    { cle: 'spider', libelle: CATEGORIES.spider.libelle, exemple: { categorie: 'spider' } },
  ];
  return el(
    'div',
    { class: 'legende' },
    types.map((t) => el('button', {
      type: 'button',
      class: `etiquette etiquette-filtre ${classeMateriel(t.exemple)}${typesMasques.has(t.cle) ? ' masque' : ''}`,
      title: typesMasques.has(t.cle)
        ? `Cliquez pour réafficher les ${t.libelle}`
        : `Cliquez pour masquer les ${t.libelle}`,
      onclick: () => {
        if (typesMasques.has(t.cle)) typesMasques.delete(t.cle);
        else typesMasques.add(t.cle);
        redessiner();
      },
    }, t.libelle, typesMasques.has(t.cle) ? ' 🚫' : '')),
    typesMasques.size > 0
      ? el('button', {
        class: 'bouton petit',
        onclick: () => { typesMasques.clear(); redessiner(); },
      }, 'Tout afficher')
      : el('span', { class: 'aide' }, 'Cliquez sur un type pour le masquer.'),
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
  const appareils = appareilsActifs().filter((a) => !typesMasques.has(cleType(a)));
  if (appareils.length === 0) {
    return messageVide(typesMasques.size > 0
      ? 'Tous les types sont masqués : cliquez sur la légende pour les réafficher.'
      : 'Aucun appareil dans le parc.');
  }

  const jours = Array.from({ length: largeur }, (_, i) => ajouterJours(debutFenetre, i));
  const dernier = jours[jours.length - 1];
  const today = aujourdHui();

  // Poses concernées par la fenêtre affichée. Le trait démarre la VEILLE de
  // la pose (jour de réservation de l'appareil) : on garde donc aussi les
  // poses dont seule la veille tombe dans la fenêtre.
  const poses = etat.poses.filter((p) => (
    p.statut !== 'annule'
    && ecartJours(ajouterJours(decouper(p.debut).date, -1), dernier) >= 0
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
      // La période réelle (pose -> dépose) passe avant la veille : quand deux
      // examens s'enchaînent, la dépose de l'un ne doit pas être masquée par
      // la veille du suivant.
      const pose = posesAppareil.find((p) => (
        ecartJours(decouper(p.debut).date, jour) >= 0
        && ecartJours(jour, decouper(p.fin).date) >= 0
      )) || posesAppareil.find((p) => ajouterJours(decouper(p.debut).date, -1) === jour);
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
  const p = decouper(pose.debut);
  const d = decouper(pose.fin);
  const debut = p.date;
  const fin = d.date;
  // Le trait couvre trois jours pour un examen de 24 h : la veille de la
  // pose (appareil réservé, affichée en plus clair), le jour de pose au
  // milieu (où s'inscrivent l'heure de pose et le nom du patient) et le
  // jour de dépose, avec son heure.
  const veille = ajouterJours(debut, -1);
  const classes = ['trait', classeMateriel(appareil)];
  if (jour === veille) classes.push('veille', 'debut');
  if (jour === fin) classes.push('fin');

  const patient = nomPatient(pose.rdv);
  // En vue large les cases sont trop étroites pour les heures : elles ne
  // s'affichent qu'en vue rapprochée (3 jours) ; l'info-bulle les donne
  // toujours.
  const heuresVisibles = largeur <= 7;
  const contenu = [];
  if (jour === debut) {
    if (heuresVisibles) contenu.push(el('span', { class: 'trait-heure' }, p.heure));
    contenu.push(el('span', { class: 'trait-nom' }, heuresVisibles ? patient : patient.slice(0, 9)));
  }
  if (jour === fin && heuresVisibles) {
    contenu.push(el('span', { class: 'trait-heure trait-heure-fin' }, d.heure));
  }

  return el(
    'div',
    {
      class: classes.join(' '),
      title: `${patient} · ${libelleAppareil(appareil)} · `
        + `pose le ${dateEnFrancais(debut)} à ${p.heure}, dépose le ${dateEnFrancais(fin)} à ${d.heure} `
        + `(appareil réservé dès le ${dateEnFrancais(veille)})`,
      onclick: () => detailPose(pose, appareil),
    },
    contenu,
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
      ['prevu', 'pose'].includes(pose.statut)
        ? el('button', {
          class: 'bouton',
          title: 'Corriger le numéro d’appareil réellement posé',
          onclick: () => { fermer(); changerAppareilPose(pose, appareil); },
        }, 'Changer d’appareil')
        : null,
      el('button', { class: 'bouton principal', onclick: fermer }, 'Fermer')),
  ]);
}

// ---------------------------------------------------------------------------
// Correction du numéro d'appareil (le jour de la pose)
// ---------------------------------------------------------------------------

/**
 * Le mauvais appareil a été posé sur le patient : on enregistre l'appareil
 * réellement posé. Si celui-ci était réservé pour un autre patient, ce
 * dernier est réattribué automatiquement dans la même opération (l'appareil
 * d'origine, redevenu libre, en fait partie). Fenêtre d'alerte si un conflit
 * rend la correction impossible.
 */
function changerAppareilPose(pose, appareil) {
  const candidats = etat.appareils.filter((a) => (
    a.categorie === appareil.categorie
    && a.id !== appareil.id
    && a.actif !== false
    && a.hors_service !== true
  ));

  if (candidats.length === 0) {
    ouvrirFenetre((fermer) => [
      el('h2', {}, '⚠ Aucun autre appareil'),
      el('p', {}, 'Aucun autre appareil de ce type n’est en service dans le parc.'),
      el('div', { class: 'fenetre-actions' },
        el('button', { class: 'bouton principal', onclick: fermer }, 'Fermer')),
    ]);
    return;
  }

  let cibleId = '';
  let plan = null;

  ouvrirFenetre((fermer) => {
    const zoneResultat = el('div', {});
    const boutonValider = el('button', { class: 'bouton principal', disabled: true }, 'Enregistrer la correction');

    const recalculer = () => {
      plan = null;
      boutonValider.disabled = true;
      if (!cibleId) {
        remplir(zoneResultat, messageVide('Choisissez l’appareil réellement posé.'));
        return;
      }
      const cible = etat.appareils.find((a) => a.id === cibleId);
      plan = planChangementAppareil({
        pose, appareilCible: cible, appareils: etat.appareils,
        poses: posesActives(), parametres: parametres(),
      });

      const elements = [];
      if (!plan.possible) {
        elements.push(el('div', { class: 'encart erreur' },
          el('strong', {}, '✖ Correction impossible. '), plan.motif));
      } else {
        elements.push(el('div', { class: 'encart succes' },
          el('strong', {}, '✔ Correction possible. '),
          `${nomPatient(pose.rdv)} sera enregistré avec ${libelleAppareil(cible)}.`));
        if (plan.reattributions.length > 0) {
          elements.push(el('p', { class: 'aide' },
            'Cet appareil était réservé : le logiciel réattribue automatiquement '
            + `${plan.reattributions.length} patient(s), sans changer leurs horaires.`));
          elements.push(el('div', { class: 'recap' }, plan.reattributions.map((r) => el(
            'div',
            { class: 'recap-ligne' },
            el('strong', {}, nomPatient(r.pose.rdv)),
            el('span', { class: 'aide' },
              `pose le ${dateEnFrancais(decouper(r.pose.debut).date)} à ${decouper(r.pose.debut).heure}`),
            el('span', { class: 'espace' }),
            el('span', {}, '→ '),
            etiquetteAppareil(r.appareil),
          ))));
        }
        boutonValider.disabled = false;
      }
      remplir(zoneResultat, ...elements);
    };

    boutonValider.addEventListener('click', async () => {
      if (!plan?.possible) return;
      boutonValider.disabled = true;
      boutonValider.textContent = 'Enregistrement…';
      try {
        await api.changerAppareils([
          // Les patients réattribués d'abord : l'appareil visé se libère.
          ...plan.reattributions.map((r) => ({ pose_id: r.pose.id, appareil_id: r.appareil.id })),
          { pose_id: pose.id, appareil_id: cibleId },
        ]);
        fermer();
        notifier('Appareil corrigé' + (plan.reattributions.length
          ? ` et ${plan.reattributions.length} patient(s) réattribué(s).` : '.'), 'succes');
        await rafraichir();
        redessiner();
      } catch (erreur) {
        fermer();
        notifierErreur(erreur);
        await rafraichir().catch(() => {});
        redessiner();
      }
    });

    recalculer();

    return [
      el('h2', {}, `Changer l’appareil de ${nomPatient(pose.rdv)}`),
      el('p', { class: 'aide', style: 'margin-top:0' },
        'À utiliser quand le numéro posé ne correspond pas à la réservation. '
        + 'Si l’appareil choisi était promis à un autre patient, celui-ci est '
        + 'réattribué automatiquement.'),
      el(
        'div',
        { class: 'recap', style: 'margin-bottom:.8rem' },
        el('div', { class: 'recap-ligne' },
          el('span', { class: 'aide' }, 'Enregistré actuellement :'),
          etiquetteAppareil(appareil),
          el('span', { class: 'aide' },
            `pose le ${dateEnFrancais(decouper(pose.debut).date)} à ${decouper(pose.debut).heure}`)),
      ),
      el('label', { class: 'champ' },
        el('span', {}, 'Appareil réellement posé'),
        el('select', {
          onchange: (e) => { cibleId = e.target.value; recalculer(); },
        },
        el('option', { value: '' }, '— Choisir —'),
        candidats.map((a) => el('option', { value: a.id },
          libelleAppareil(a) + (a.urgence ? ' ⚠ (urgence)' : ''))))),
      zoneResultat,
      el(
        'div',
        { class: 'fenetre-actions' },
        el('button', { class: 'bouton', onclick: fermer }, 'Annuler'),
        boutonValider,
      ),
    ];
  });
}
