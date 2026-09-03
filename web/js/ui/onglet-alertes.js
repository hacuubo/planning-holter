/**
 * onglet-alertes.js — Ce qui demande une action du secrétariat.
 *
 * Deux listes, recalculées à chaque rafraîchissement des données (donc à
 * chaque nouvelle réservation, mise hors service ou retour de matériel) :
 *
 *   1. les réservations posées sur un appareil devenu indisponible (panne,
 *      retrait du parc) : un bouton les réattribue automatiquement, d'abord
 *      sur le même créneau, sinon sur le créneau le plus proche de la durée
 *      nominale de port (24 h en général, parfois un peu moins) ;
 *   2. les patients à rappeler quand leur horaire de pose a changé.
 */

import { aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper, maintenantHorodatage } from '../core/dates.js';
import { libelleAppareil } from '../core/materiel.js';
import { appareilIndisponible, propositionReattribution } from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilParId, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, confirmer, el, encart, etiquetteAppareil, messageVide, nomPatient,
  notifier, notifierErreur, remplir,
} from './base.js';

// ---------------------------------------------------------------------------
// Détection (utilisée aussi par le badge de l'onglet, dans app.js)
// ---------------------------------------------------------------------------

/** Réservations à venir dont l'appareil est hors service ou retiré du parc. */
export function posesAReattribuer() {
  const jour = aujourdHui();
  return posesActives().filter((p) => (
    p.statut === 'prevu'
    && decouper(p.fin).date >= jour
    && appareilIndisponible(appareilParId(p.appareil_id))
  ));
}

export function rappelsEnAttente() {
  return (etat.rappels || []).filter((r) => !r.fait);
}

/** Nombre total d'alertes en cours (pour la pastille de l'onglet). */
export function nombreAlertes() {
  return posesAReattribuer().length + rappelsEnAttente().length;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

export function afficherAlertes(conteneur) {
  const orphelines = posesAReattribuer();
  const rappels = rappelsEnAttente();

  remplir(
    conteneur,
    orphelines.length === 0 && rappels.length === 0
      ? carte('Alertes', encart('succes', '✔ Rien à signaler : toutes les réservations '
        + 'sont sur des appareils en service et aucun patient n’est à rappeler.'))
      : null,
    orphelines.length > 0 ? sectionReattributions(orphelines) : null,
    sectionRappels(rappels),
  );
}

function redessiner() {
  afficherAlertes(document.getElementById('vue-alertes'));
}

// ---------------------------------------------------------------------------
// 1. Réservations à réattribuer
// ---------------------------------------------------------------------------

function sectionReattributions(orphelines) {
  return carte(
    `⚠ ${orphelines.length} réservation(s) sur un appareil indisponible`,
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Ces patients attendent un appareil hors service ou retiré du parc. '
      + '« Réattribuer » cherche d’abord un autre appareil sur le même créneau '
      + '(rien à dire au patient), sinon le créneau le plus proche de la durée '
      + 'de port prévue — le patient est alors ajouté à la liste des rappels.'),
    orphelines.map((pose) => {
      const appareil = appareilParId(pose.appareil_id);
      const p = decouper(pose.debut);
      const d = decouper(pose.fin);
      return el(
        'div',
        { class: 'recap', style: 'margin-bottom:.6rem' },
        el(
          'div',
          { class: 'recap-ligne' },
          el('strong', {}, nomPatient(pose.rdv)),
          etiquetteAppareil(appareil),
          el('span', { class: 'etiquette urgence' },
            appareil?.actif === false ? 'retiré du parc' : 'hors service'),
          el('span', { class: 'espace' }),
          el('button', {
            class: 'bouton petit principal',
            onclick: () => reattribuer(pose, appareil),
          }, 'Réattribuer'),
        ),
        el('div', { class: 'recap-ligne aide' },
          `Pose le ${dateEnFrancais(p.date)} à ${p.heure} · dépose le ${dateEnFrancais(d.date)} à ${d.heure}`,
          pose.rdv?.telephone ? ` · ☎ ${pose.rdv.telephone}` : ''),
      );
    }),
  );
}

async function reattribuer(pose, appareil) {
  const proposition = propositionReattribution({
    pose,
    appareil,
    appareils: etat.appareils,
    poses: posesActives(),
    parametres: parametres(),
    maintenant: maintenantHorodatage(),
  });

  if (!proposition) {
    await confirmer({
      titre: '✖ Aucune solution automatique',
      message: 'Aucun appareil du même type n’est disponible, même en changeant '
        + 'l’horaire de pose. Libérez un appareil (retour anticipé, remise en '
        + 'service) ou déplacez le rendez-vous depuis l’onglet Recherche.',
      boutonValider: 'Compris',
    });
    return;
  }

  const memeCreneau = proposition.type === 'appareil';
  const nouveau = decouper(proposition.debut);
  const ancien = decouper(pose.debut);

  const ok = await confirmer({
    titre: `Réattribuer ${nomPatient(pose.rdv)} ?`,
    message: memeCreneau
      ? 'Un appareil est libre sur le même créneau : rien ne change pour le patient.'
      : 'Aucun appareil n’est libre sur le créneau actuel. Le logiciel propose le '
        + 'créneau le plus proche de la durée de port prévue — il faudra prévenir le patient.',
    details: el(
      'div',
      { class: 'recap' },
      el('div', { class: 'recap-ligne' },
        el('span', { class: 'aide' }, 'Nouvel appareil :'), etiquetteAppareil(proposition.appareil)),
      el('div', { class: 'recap-ligne' },
        el('span', { class: 'aide' }, 'Pose :'),
        memeCreneau
          ? el('span', {}, `inchangée — le ${dateEnFrancais(ancien.date)} à ${ancien.heure}`)
          : el('span', {},
            `${dateEnFrancais(ancien.date)} à ${ancien.heure} → `,
            el('strong', {}, `${dateEnFrancais(nouveau.date)} à ${nouveau.heure}`),
            proposition.dureeReelleMinutes
              ? ` (port ≈ ${Math.round(proposition.dureeReelleMinutes / 60)} h)`
              : '')),
    ),
    boutonValider: memeCreneau ? 'Réattribuer' : 'Réattribuer et prévoir le rappel',
  });
  if (!ok) return;

  try {
    if (memeCreneau) {
      await api.changerAppareil(pose.id, proposition.appareil.id);
    } else {
      await api.reattribuerPose(pose.id, proposition.appareil.id, proposition.debut);
      await api.ajouterRappel({
        rdv_id: pose.rdv_id,
        patient_nom: nomPatient(pose.rdv),
        telephone: pose.rdv?.telephone || null,
        message: `Pose déplacée du ${dateEnFrancais(ancien.date)} ${ancien.heure} `
          + `au ${dateEnFrancais(nouveau.date)} ${nouveau.heure} `
          + `(${libelleAppareil(proposition.appareil)}) : prévenir le patient.`,
      }).catch(() => {
        notifier('Le rappel n’a pas pu être enregistré : notez de prévenir le patient.', 'erreur');
      });
    }
    notifier(memeCreneau
      ? `${nomPatient(pose.rdv)} réattribué sur ${libelleAppareil(proposition.appareil)}.`
      : `${nomPatient(pose.rdv)} réattribué — pensez à le rappeler (liste ci-dessous).`, 'succes');
    await rafraichir();
    redessiner();
  } catch (erreur) {
    notifierErreur(erreur);
    await rafraichir().catch(() => {});
    redessiner();
  }
}

// ---------------------------------------------------------------------------
// 2. Patients à rappeler
// ---------------------------------------------------------------------------

function sectionRappels(rappels) {
  return carte(
    rappels.length > 0 ? `☎ ${rappels.length} patient(s) à rappeler` : '☎ Patients à rappeler',
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Un patient apparaît ici quand son horaire de pose a été modifié après '
      + 'coup. Cochez « Rappelé » une fois le patient prévenu.'),
    rappels.length === 0
      ? messageVide('Aucun rappel en attente.')
      : rappels.map((rappel) => el(
        'div',
        { class: 'recap', style: 'margin-bottom:.6rem' },
        el(
          'div',
          { class: 'recap-ligne' },
          el('strong', {}, rappel.patient_nom),
          rappel.telephone ? el('span', { class: 'aide' }, `☎ ${rappel.telephone}`) : null,
          el('span', { class: 'espace' }),
          el('span', { class: 'aide' },
            rappel.cree_le ? dateEnFrancaisLong(String(rappel.cree_le).slice(0, 10)) : ''),
          el('button', {
            class: 'bouton petit principal',
            onclick: async () => {
              try {
                await api.marquerRappel(rappel.id, true, etat.profil?.nom || null);
                notifier(`${rappel.patient_nom} marqué comme rappelé.`, 'succes');
                await rafraichir();
                redessiner();
              } catch (erreur) { notifierErreur(erreur); }
            },
          }, '✓ Rappelé'),
        ),
        el('div', { class: 'recap-ligne aide' }, rappel.message),
      )),
  );
}
