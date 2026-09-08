/**
 * onglet-alertes.js — Ce qui demande une action du secrétariat.
 *
 * Quatre listes, recalculées à chaque rafraîchissement des données (donc à
 * chaque nouvelle réservation, pose, retour ou mise hors service) :
 *
 *   1. les appareils NON RENDUS après l'heure de dépose prévue : tant que ce
 *      n'est pas régularisé, ils paraissent disponibles alors qu'ils sont
 *      encore chez un patient ;
 *   2. les poses passées jamais marquées « Posé » (oubli de clic, ou patient
 *      qui n'est pas venu) ;
 *   3. les réservations posées sur un appareil devenu indisponible (panne,
 *      retrait du parc) : un bouton les réattribue automatiquement, d'abord
 *      sur le même créneau, sinon sur le créneau le plus proche de la durée
 *      nominale de port (24 h en général, parfois un peu moins) ;
 *   4. les patients à rappeler quand leur horaire de pose a changé.
 */

import { aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper, maintenantHorodatage } from '../core/dates.js';
import { libelleAppareil } from '../core/materiel.js';
import {
  appareilIndisponible, posesOubliees, prochaineReservation,
  propositionReattribution, retoursEnRetard,
} from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilParId, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, confirmer, el, encart, etiquetteAppareil, lienTelephone, messageVide,
  nomPatient, notifier, notifierErreur, remplir,
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

/** Appareils toujours dehors après l'heure de dépose prévue (marge 30 min). */
export function retardsDeRetour() {
  return retoursEnRetard(posesActives(), maintenantHorodatage());
}

/** Poses passées jamais marquées « Posé » (marge 30 min). */
export function posesSansPointage() {
  return posesOubliees(posesActives(), maintenantHorodatage());
}

/** Nombre total d'alertes en cours (pour la pastille de l'onglet). */
export function nombreAlertes() {
  return retardsDeRetour().length + posesSansPointage().length
    + posesAReattribuer().length + rappelsEnAttente().length;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

export function afficherAlertes(conteneur) {
  const retards = retardsDeRetour();
  const oublis = posesSansPointage();
  const orphelines = posesAReattribuer();
  const rappels = rappelsEnAttente();

  remplir(
    conteneur,
    retards.length + oublis.length + orphelines.length + rappels.length === 0
      ? carte('Alertes', encart('succes', '✔ Rien à signaler : les pointages sont à jour, '
        + 'toutes les réservations sont sur des appareils en service et aucun patient '
        + 'n’est à rappeler.'))
      : null,
    retards.length > 0 ? sectionRetards(retards) : null,
    oublis.length > 0 ? sectionOublis(oublis) : null,
    orphelines.length > 0 ? sectionReattributions(orphelines) : null,
    sectionRappels(rappels),
  );
}

// ---------------------------------------------------------------------------
// 0a. Appareils non rendus après l'heure de dépose prévue
// ---------------------------------------------------------------------------

function sectionRetards(retards) {
  return carte(
    `⏰ ${retards.length} appareil(s) non rendu(s) à l'heure`,
    el('p', { class: 'aide', style: 'margin-top:0' },
      'L’heure de dépose est passée et le retour n’a pas été enregistré : tant que '
      + 'ce n’est pas régularisé, l’appareil paraît disponible alors qu’il est encore '
      + 'chez le patient. Si l’appareil est bien revenu, cliquez « Rendu » ; sinon, '
      + 'rappelez le patient et réattribuez le suivant si besoin.'),
    retards.map((pose) => {
      const appareil = appareilParId(pose.appareil_id);
      const d = decouper(pose.fin);
      const suivante = prochaineReservation(pose.appareil_id, posesActives(), maintenantHorodatage());
      return el(
        'div',
        { class: 'recap', style: 'margin-bottom:.6rem' },
        el(
          'div',
          { class: 'recap-ligne' },
          el('strong', {}, nomPatient(pose.rdv)),
          etiquetteAppareil(appareil),
          el('span', { class: 'etiquette urgence' }, `dépose prévue le ${dateEnFrancais(d.date)} à ${d.heure}`),
          lienTelephone(pose.rdv?.telephone),
          el('span', { class: 'espace' }),
          el('button', {
            class: 'bouton petit principal',
            title: 'L’appareil est revenu : enregistrer le retour maintenant',
            onclick: async () => {
              try {
                await api.enregistrerRetour(pose.id, maintenantHorodatage());
                notifier(`${libelleAppareil(appareil)} enregistré comme rendu.`, 'succes');
                await rafraichir();
                redessiner();
              } catch (erreur) { notifierErreur(erreur); }
            },
          }, '✓ Rendu maintenant'),
        ),
        suivante && suivante.rdv_id !== pose.rdv_id
          ? el('div', { class: 'recap-ligne' },
            el('span', { class: 'aide' },
              `⚠ Réservé ensuite par ${nomPatient(suivante.rdv)} — pose le `
              + `${dateEnFrancais(decouper(suivante.debut).date)} à ${decouper(suivante.debut).heure}.`),
            el('span', { class: 'espace' }),
            el('button', {
              class: 'bouton petit',
              title: 'Attribuer un autre appareil au patient suivant sans attendre le retour',
              onclick: () => reattribuer(suivante, appareil),
            }, `Réattribuer ${nomPatient(suivante.rdv)}`))
          : null,
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// 0b. Poses passées jamais marquées « Posé »
// ---------------------------------------------------------------------------

function sectionOublis(oublis) {
  return carte(
    `❓ ${oublis.length} pose(s) passée(s) sans pointage`,
    el('p', { class: 'aide', style: 'margin-top:0' },
      'L’heure de pose est passée mais rien n’a été enregistré. Si le patient est '
      + 'venu, cliquez « Posé » ; s’il n’est pas venu, annulez le rendez-vous pour '
      + 'libérer l’appareil.'),
    oublis.map((pose) => {
      const appareil = appareilParId(pose.appareil_id);
      const p = decouper(pose.debut);
      return el(
        'div',
        { class: 'recap', style: 'margin-bottom:.6rem' },
        el(
          'div',
          { class: 'recap-ligne' },
          el('strong', {}, nomPatient(pose.rdv)),
          etiquetteAppareil(appareil),
          el('span', { class: 'aide' }, `pose prévue le ${dateEnFrancais(p.date)} à ${p.heure}`),
          lienTelephone(pose.rdv?.telephone),
          el('span', { class: 'espace' }),
          el('button', {
            class: 'bouton petit principal',
            onclick: async () => {
              try {
                await api.enregistrerPose(pose.id);
                notifier(`Pose de ${nomPatient(pose.rdv)} enregistrée.`, 'succes');
                await rafraichir();
                redessiner();
              } catch (erreur) { notifierErreur(erreur); }
            },
          }, '✓ Posé'),
          el('button', {
            class: 'bouton petit danger',
            title: 'Le patient n’est pas venu : annuler et libérer l’appareil',
            onclick: async () => {
              const ok = await confirmer({
                titre: `Annuler le rendez-vous de ${nomPatient(pose.rdv)} ?`,
                message: 'Le matériel réservé redevient immédiatement disponible. Le rendez-vous '
                  + 'restera visible dans la recherche, marqué annulé (« patient non venu »).',
                boutonValider: 'Annuler le rendez-vous',
                danger: true,
              });
              if (!ok) return;
              try {
                await api.annulerRendezVous(pose.rdv_id, 'Patient non venu à la pose');
                notifier('Rendez-vous annulé, appareil libéré.', 'succes');
                await rafraichir();
                redessiner();
              } catch (erreur) { notifierErreur(erreur); }
            },
          }, 'Pas venu'),
        ),
      );
    }),
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
          lienTelephone(pose.rdv?.telephone)),
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
          lienTelephone(rappel.telephone),
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
