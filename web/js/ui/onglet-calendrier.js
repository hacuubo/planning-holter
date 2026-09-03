/**
 * onglet-calendrier.js — Vue d'ensemble.
 *
 * Les jours en colonnes, le matériel en lignes. Chaque examen dessine un trait
 * coloré courant sur les jours pendant lesquels l'appareil est chez le patient.
 * On voit ainsi d'un coup d'œil quel appareil est libre et quand.
 */

import {
  ajouterJours, aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper,
  ecartJours, estFerie, estJourOuvre, jourSemaine, maintenantHorodatage,
  minutes, nomJourFerie,
} from '../core/dates.js';
import {
  CATEGORIES, dureeLisible, dureeParDefaut, dureesAutorisees, libelleAppareil,
  libelleCourt,
} from '../core/materiel.js';
import {
  appareilOccupe, chargeDesCreneaux, creneauSature, creneauxPoseDuJour,
  finImmobilisation, planChangementAppareil, proposerRdvDepuisPose,
} from '../core/regles.js';
import * as api from '../data/api.js';
import {
  appareilsActifs, cardiologues, etat, parametres, posesActives, rafraichir,
} from '../data/etat.js';
import {
  carte, champ, classeMateriel, el, etiquetteAppareil, messageVide, nomPatient,
  notifier, notifierErreur, ouvrirFenetre, remplir, selection, sexeLisible,
} from './base.js';

const INITIALES_JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Largeur de la fenêtre en jours (3 par défaut : la vue rapprochée est la
 *  vue de travail) et premier jour affiché (hier, pour centrer aujourd'hui). */
let largeur = 3;
let debutFenetre = ajouterJours(aujourdHui(), -1);

/** Glisser-déposer d'une pose prévue vers une autre ligne du même type. */
let glisse = null; // { pose, appareil, cibles: Map<appareilId, {ok, motif}> }

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
          // Vue 3 jours : centrée sur aujourd'hui ; vue 30 jours : une
          // semaine de recul.
          debutFenetre = ajouterJours(aujourdHui(), largeur <= 7 ? -1 : -7);
          redessiner();
        },
      }, [3, 30].map((n) => {
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
  debutFenetre = ajouterJours(aujourdHui(), largeur <= 7 ? -1 : -7);
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

  // Poses concernées par la fenêtre affichée : le trait couvre exactement la
  // période pendant laquelle l'appareil est chez le patient (pose → dépose).
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
      {
        class: jour === today ? 'aujourdhui' : null,
        title: ferie ? `${dateEnFrancaisLong(jour)} — ${ferie}` : dateEnFrancaisLong(jour),
      },
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
      if (pose) {
        td.append(traitDePose(pose, jour, appareil));
      } else if (jour >= today && estJourOuvre(jour, params)
        && appareil.actif !== false && appareil.hors_service !== true) {
        // Case libre d'un jour ouvré à venir : un clic propose une pose de
        // cet appareil précis ce jour-là.
        td.classList.add('reservable');
        td.title = `Poser ${libelleAppareil(appareil)} le ${dateEnFrancais(jour)} — cliquez`;
        td.addEventListener('click', () => nouveauRdvDepuisCase(appareil, jour));
      }
      return td;
    });

    const ligne = el(
      'tr',
      {
        // Cible d'un glisser-déposer : la ligne se colore en vert si l'appareil
        // est libre aux mêmes horaires, en rouge sinon (dépôt refusé).
        ondragover: (e) => {
          if (!glisse) return;
          const verdict = evaluerCible(appareil);
          ligne.classList.toggle('cible-ok', verdict.ok);
          ligne.classList.toggle('cible-non', !verdict.ok);
          if (verdict.ok) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
          else e.dataTransfer.dropEffect = 'none';
        },
        ondragleave: (e) => {
          if (!ligne.contains(e.relatedTarget)) ligne.classList.remove('cible-ok', 'cible-non');
        },
        ondrop: (e) => { e.preventDefault(); deposerSur(appareil); },
      },
      el('th', { class: 'appareil', title: libelleAppareil(appareil) },
        el('span', { class: `etiquette ${classeMateriel(appareil)}` }, libelleCourt(appareil)),
        appareil.urgence ? ' ⚠' : ''),
      cellules,
    );
    return ligne;
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

/**
 * Position horizontale (en %) d'une heure dans la colonne d'un jour : la
 * journée affichée court de 08:00 (bord gauche) à 18:00 (bord droit). Une
 * pose de 08:45 démarre donc tout à gauche de sa colonne, une dépose de
 * fin d'après-midi glisse presque jusqu'au bord droit de la sienne.
 */
const DEBUT_JOURNEE_MIN = 8 * 60;
const FIN_JOURNEE_MIN = 18 * 60;
function positionHeure(heure) {
  const part = (minutes(heure) - DEBUT_JOURNEE_MIN) / (FIN_JOURNEE_MIN - DEBUT_JOURNEE_MIN);
  return Math.min(100, Math.max(0, part * 100));
}

function traitDePose(pose, jour, appareil) {
  const p = decouper(pose.debut);
  const d = decouper(pose.fin);
  const debut = p.date;
  const fin = d.date;
  // Le trait couvre exactement la période où l'appareil est chez le patient :
  // le jour de pose (heure de pose et nom du patient) jusqu'au jour de dépose
  // (heure de dépose). Dans la colonne du jour de pose, le trait DÉMARRE à la
  // position de l'heure de pose ; dans celle du jour de dépose, il S'ARRÊTE à
  // la position de l'heure de dépose.
  const classes = ['trait', classeMateriel(appareil)];
  const styles = [];
  const deplacable = pose.statut === 'prevu';
  if (jour === debut) {
    classes.push('debut');
    styles.push(`left:${positionHeure(p.heure).toFixed(1)}%`);
  }
  if (jour === fin) {
    classes.push('fin');
    styles.push(`right:${(100 - positionHeure(d.heure)).toFixed(1)}%`);
  }

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
      style: styles.length ? styles.join(';') : null,
      title: `${patient} · ${libelleAppareil(appareil)} · `
        + `pose le ${dateEnFrancais(debut)} à ${p.heure}, dépose le ${dateEnFrancais(fin)} à ${d.heure}`
        + (deplacable ? ' — glissez ce trait sur une autre ligne du même type pour changer d’appareil' : ''),
      onclick: () => detailPose(pose, appareil),
      // Une pose prévue se glisse à la souris sur une autre ligne du même type.
      draggable: deplacable ? 'true' : null,
      ondragstart: deplacable ? (e) => {
        glisse = { pose, appareil, cibles: new Map() };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', pose.id);
        e.currentTarget.classList.add('en-glisse');
      } : null,
      ondragend: deplacable ? (e) => {
        glisse = null;
        e.currentTarget.classList.remove('en-glisse');
        nettoyerCibles();
      } : null,
    },
    contenu,
  );
}

// ---------------------------------------------------------------------------
// Glisser-déposer : changer d'appareil sans changer d'horaires
// ---------------------------------------------------------------------------

/**
 * Une ligne peut recevoir la pose glissée si l'appareil est du même type,
 * en service, et libre sur exactement la même période (pose → dépose, délai
 * de reconditionnement compris). Le verdict est mémorisé le temps du geste.
 */
function evaluerCible(cible) {
  if (!glisse) return { ok: false, motif: '' };
  if (glisse.cibles.has(cible.id)) return glisse.cibles.get(cible.id);
  const { pose, appareil } = glisse;
  const params = parametres();
  let verdict;
  if (cible.id === appareil.id) {
    verdict = { ok: false, motif: 'c’est déjà son appareil' };
  } else if (cible.categorie !== appareil.categorie) {
    verdict = { ok: false, motif: `ce n’est pas un ${CATEGORIES[appareil.categorie]?.libelle || appareil.categorie}` };
  } else if (cible.actif === false || cible.hors_service === true) {
    verdict = { ok: false, motif: 'appareil retiré ou hors service' };
  } else if (appareilOccupe(cible.id, posesActives(), pose.debut, finImmobilisation(pose, params), params, pose.id)) {
    verdict = { ok: false, motif: 'déjà pris sur ces horaires' };
  } else {
    verdict = { ok: true, motif: '' };
  }
  glisse.cibles.set(cible.id, verdict);
  return verdict;
}

function nettoyerCibles() {
  document.querySelectorAll('.calendrier tr.cible-ok, .calendrier tr.cible-non')
    .forEach((tr) => tr.classList.remove('cible-ok', 'cible-non'));
}

async function deposerSur(cible) {
  if (!glisse) return;
  const { pose, appareil } = glisse;
  const verdict = evaluerCible(cible);
  glisse = null;
  nettoyerCibles();
  if (!verdict.ok) {
    notifier(`Impossible de déplacer ${nomPatient(pose.rdv)} sur ${libelleAppareil(cible)} : ${verdict.motif}.`, 'erreur');
    return;
  }
  try {
    await api.changerAppareil(pose.id, cible.id);
    notifier(`${nomPatient(pose.rdv)} : ${libelleAppareil(appareil)} → ${libelleAppareil(cible)}, mêmes horaires.`, 'succes');
    await rafraichir();
    redessiner();
  } catch (erreur) {
    notifierErreur(erreur);
    await rafraichir().catch(() => {});
    redessiner();
  }
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
// Prise de rendez-vous directement depuis une case du calendrier
// ---------------------------------------------------------------------------

/**
 * La secrétaire a cliqué sur la ligne d'un appareil, au niveau d'une journée
 * libre : elle choisit l'heure de pose, le nom du patient et la durée (fixe
 * pour les MAPA, polygraphies et Spider Flash ; 24/48/72 h pour les Holter).
 * La dépose et le rendez-vous cardiologue sont déduits automatiquement.
 */
function nouveauRdvDepuisCase(appareil, jour) {
  const params = parametres();
  const maintenant = maintenantHorodatage();
  const charge = chargeDesCreneaux(posesActives());

  // Créneaux de pose encore possibles ce jour-là pour cette catégorie.
  const heures = creneauxPoseDuJour(jour, appareil.categorie, params)
    .filter((h) => `${jour} ${h}` >= maintenant)
    .filter((h) => !creneauSature(charge, `${jour} ${h}`, params));

  if (heures.length === 0) {
    ouvrirFenetre((fermer) => [
      el('h2', {}, '⚠ Aucun créneau de pose'),
      el('p', {}, `Tous les créneaux de pose du ${dateEnFrancaisLong(jour)} sont passés ou complets`
        + (appareil.categorie === 'polygraphie' ? ' (les polygraphies se posent l’après-midi uniquement).' : '.')),
      el('div', { class: 'fenetre-actions' },
        el('button', { class: 'bouton principal', onclick: fermer }, 'Fermer')),
    ]);
    return;
  }

  const durees = dureesAutorisees(appareil.categorie);
  const saisie = {
    heure: heures[0],
    duree: dureeParDefaut(appareil.categorie),
    nom: '',
    sexe: '',
    cardiologue: cardiologues()[0] || '',
  };
  let proposition = null;

  ouvrirFenetre((fermer) => {
    const zoneResultat = el('div', {});
    const boutonValider = el('button', { class: 'bouton principal', disabled: true }, 'Enregistrer le rendez-vous');

    const majBouton = () => {
      boutonValider.disabled = !(proposition?.possible
        && saisie.nom.trim().length > 0
        && (saisie.sexe === 'F' || saisie.sexe === 'M'));
    };

    const recalculer = () => {
      proposition = proposerRdvDepuisPose({
        appareil,
        date: jour,
        heure: saisie.heure,
        dureeHeures: saisie.duree,
        poses: posesActives(),
        parametres: params,
        maintenant,
      });

      const elements = proposition.avertissements.map((a) => el('div', { class: 'encart alerte' }, `⚠ ${a}`));
      if (!proposition.possible) {
        elements.push(el('div', { class: 'encart erreur' }, el('strong', {}, '✖ '), proposition.motif));
      } else {
        const d = decouper(proposition.depose);
        const r = decouper(proposition.rdvCardio);
        elements.push(el(
          'div',
          { class: 'encart succes' },
          el('strong', {}, '✔ '),
          `Pose le ${dateEnFrancais(jour)} à ${saisie.heure} · `,
          el('strong', {}, `dépose le ${dateEnFrancais(d.date)} à ${d.heure}`),
          ` · rendez-vous cardiologue le ${dateEnFrancais(r.date)} à ${r.heure}.`,
        ));
      }
      remplir(zoneResultat, ...elements);
      majBouton();
    };

    const choixSexe = el('div', { class: 'choix-sexe', role: 'radiogroup', 'aria-label': 'Sexe du patient' });
    for (const [valeur, libelle] of [['F', 'Femme'], ['M', 'Homme']]) {
      const bouton = el('button', {
        type: 'button', class: 'bouton',
        onclick: () => {
          saisie.sexe = valeur;
          for (const autre of choixSexe.children) {
            autre.className = `bouton${autre.dataset.valeur === valeur ? ' principal' : ''}`;
          }
          majBouton();
        },
      }, libelle);
      bouton.dataset.valeur = valeur;
      choixSexe.append(bouton);
    }

    boutonValider.addEventListener('click', async () => {
      if (boutonValider.disabled) return;
      boutonValider.disabled = true;
      boutonValider.textContent = 'Enregistrement…';
      try {
        await api.reserverRendezVous(
          {
            patient_nom: saisie.nom.trim(),
            patient_sexe: saisie.sexe,
            cardiologue: saisie.cardiologue,
            rdv_cardio: proposition.rdvCardio,
            telephone: null,
            commentaire: null,
          },
          [{
            appareil_id: appareil.id,
            duree_heures: saisie.duree,
            marque_demandee: appareil.marque || null,
            debut: proposition.pose,
            fin: proposition.depose,
          }],
        );
        fermer();
        notifier(`Rendez-vous enregistré pour ${saisie.nom.trim().toUpperCase()} `
          + `(${libelleAppareil(appareil)}).`, 'succes');
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
      el('h2', {}, `Nouveau rendez-vous — ${dateEnFrancaisLong(jour)}`),
      el(
        'div',
        { class: 'recap', style: 'margin-bottom:.8rem' },
        el('div', { class: 'recap-ligne' },
          etiquetteAppareil(appareil),
          el('span', { class: 'aide' }, 'appareil choisi sur le calendrier')),
      ),
      el(
        'div',
        { class: 'grille' },
        champ('Heure de pose', selection(
          heures.map((h) => ({ valeur: h, libelle: h })),
          saisie.heure,
          (v) => { saisie.heure = v; recalculer(); },
        )),
        durees.length > 1
          ? champ('Durée du Holter', selection(
            durees.map((d) => ({ valeur: d, libelle: dureeLisible(d) })),
            saisie.duree,
            (v) => { saisie.duree = Number(v); recalculer(); },
          ))
          : champ('Durée', el('input', { type: 'text', value: dureeLisible(durees[0]), disabled: true })),
        champ('Nom de famille', el('input', {
          type: 'text', placeholder: 'DUPONT', autocomplete: 'off',
          oninput: (e) => { saisie.nom = e.target.value; majBouton(); },
        })),
        champ('Sexe', choixSexe),
        champ('Cardiologue demandeur', selection(
          cardiologues().map((c) => ({ valeur: c, libelle: c })),
          saisie.cardiologue,
          (v) => { saisie.cardiologue = v; },
        )),
      ),
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
