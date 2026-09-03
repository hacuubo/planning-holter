/**
 * regles.js — Le cœur métier du logiciel.
 *
 * Ce fichier ne connaît ni la base de données ni l'affichage : il ne contient
 * que des calculs purs, ce qui permet de les tester automatiquement
 * (voir le dossier `tests/`).
 *
 * Principe général d'un examen :
 *   1. le patient a un rendez-vous avec son cardiologue le jour J à l'heure H ;
 *   2. le matériel est DÉPOSÉ (retiré) 15 minutes avant ce rendez-vous, pour
 *      que le résultat soit disponible pendant la consultation ;
 *   3. le matériel a donc été POSÉ « durée de port » plus tôt, en remontant
 *      aux jours ouvrés (la veille d'un lundi est le samedi) ;
 *   4. l'appareil est immobilisé de la pose jusqu'à la dépose, et redevient
 *      disponible dès son retour.
 */

import {
  ajouterJours, creneauxDuJour, decaler, ecartJours, estJourOuvre,
  horairesDuJour, horodatage, horodatageEnMinutes, decouper, listeCreneaux,
  minutes, minutesEnHorodatage, normaliserHorodatage, PAS_CRENEAU_MINUTES,
} from './dates.js';

/** Minuit + 12 h : sépare les plages du matin de celles de l'après-midi. */
const MIDI_MINUTES = 12 * 60;

/** Paramètres de fonctionnement par défaut (modifiables dans l'onglet Paramètres). */
export const PARAMETRES_PAR_DEFAUT = {
  /** Délai entre la dépose du matériel et le rendez-vous cardiologue. */
  minutesAvantRdvCardio: 15,
  /** Nombre de POSES par créneau de 15 minutes (les déposes sont illimitées). */
  posesParCreneau: 1,
  /** Tolérance : port légèrement plus court que la durée nominale (minutes). */
  toleranceDureeMinutes: 60,
  /** Délai de remise en service après le retour d'un appareil (minutes). */
  delaiReconditionnementMinutes: 0,
  /** Nombre de jours ouvrés explorés en amont pour trouver un créneau de pose. */
  fenetreRechercheJours: 5,
  /** Jours fériés d'Alsace-Moselle. */
  alsaceMoselle: false,
  /** Fermetures exceptionnelles : { "AAAA-MM-JJ": "motif" }. */
  fermeturesExceptionnelles: {},
};

export function fusionnerParametres(parametres = {}) {
  return { ...PARAMETRES_PAR_DEFAUT, ...parametres };
}

// ---------------------------------------------------------------------------
// 0. Créneaux de pose selon la catégorie de matériel
// ---------------------------------------------------------------------------

/**
 * Créneaux ("HH:MM") où une POSE de la catégorie donnée est possible ce
 * jour-là. Pour tout le matériel courant : tous les créneaux d'ouverture.
 * Pour la polygraphie ventilatoire : uniquement l'après-midi, prolongé
 * jusqu'à `finPosePolygraphie` (plage réservée aux polygraphies).
 */
export function creneauxPoseDuJour(date, categorie, parametres = {}) {
  if (categorie !== 'polygraphie') return creneauxDuJour(date, parametres);

  const h = horairesDuJour(date, parametres);
  if (!h) return [];
  const pas = parametres.pasCreneauMinutes || PAS_CRENEAU_MINUTES;
  const apresMidi = h.plages.filter((p) => minutes(p.debut) >= MIDI_MINUTES);
  return apresMidi.flatMap((p, i) => {
    const derniere = i === apresMidi.length - 1;
    const fin = derniere && h.finPosePolygraphie
      && minutes(h.finPosePolygraphie) > minutes(p.fin)
      ? h.finPosePolygraphie
      : p.fin;
    return listeCreneaux(p.debut, fin, pas);
  });
}

// ---------------------------------------------------------------------------
// 1. Créneau de dépose
// ---------------------------------------------------------------------------

/**
 * Créneau de dépose du matériel avant un rendez-vous cardiologue.
 * On retient le dernier créneau disponible situé au plus tard
 * `minutesAvantRdvCardio` avant le rendez-vous.
 *
 * @returns {{horodatage: string|null, margeMinutes: number, avertissement: string|null}}
 */
export function creneauDepose(rdvCardioTs, parametres = {}) {
  const p = fusionnerParametres(parametres);
  const { date } = decouper(rdvCardioTs);
  const cible = horodatageEnMinutes(rdvCardioTs) - p.minutesAvantRdvCardio;
  const creneaux = creneauxDuJour(date, p);

  if (creneaux.length === 0) {
    return {
      horodatage: null,
      margeMinutes: 0,
      avertissement: `Le ${date} n'est pas un jour travaillé : la dépose du matériel est impossible.`,
    };
  }

  let retenu = null;
  for (const h of creneaux) {
    if (horodatageEnMinutes(horodatage(date, h)) <= cible) retenu = horodatage(date, h);
  }

  if (retenu) {
    return {
      horodatage: retenu,
      margeMinutes: horodatageEnMinutes(rdvCardioTs) - horodatageEnMinutes(retenu),
      avertissement: null,
    };
  }

  // Rendez-vous cardiologue trop tôt dans la journée : on propose malgré tout
  // le premier créneau, en signalant que la marge est insuffisante.
  const premier = horodatage(date, creneaux[0]);
  const marge = horodatageEnMinutes(rdvCardioTs) - horodatageEnMinutes(premier);
  return {
    horodatage: marge >= 0 ? premier : null,
    margeMinutes: marge,
    avertissement: marge >= 0
      ? `Marge réduite : seulement ${marge} minutes entre la dépose (${creneaux[0]}) et le rendez-vous cardiologue.`
      : `Le rendez-vous cardiologue (${decouper(rdvCardioTs).heure}) précède l'ouverture du cabinet : dépose impossible.`,
  };
}

// ---------------------------------------------------------------------------
// 2. Créneaux de pose candidats
// ---------------------------------------------------------------------------

/**
 * Horodatage de pose « idéal » : exactement la durée de port avant la dépose.
 */
export function poseIdeale(deposeTs, dureeHeures) {
  return decaler(deposeTs, -dureeHeures * 60);
}

/**
 * Liste ordonnée des créneaux de pose envisageables pour atteindre `deposeTs`
 * après `dureeHeures` de port. Le meilleur candidat est en tête.
 *
 * Un créneau est retenu si :
 *   - il tombe un jour ouvré, à une heure d'ouverture ;
 *   - la durée de port réelle est au moins « durée nominale − tolérance » ;
 *   - il est postérieur (ou égal) à `pasAvant` (par défaut : maintenant).
 *
 * Cas particulier de la polygraphie ventilatoire (`categorie` = 'polygraphie') :
 * elle s'enregistre pendant UNE SEULE NUIT. La pose a lieu la veille
 * calendaire de la dépose, l'après-midi uniquement (plage prolongée), sans
 * contrainte de durée nominale.
 *
 * @returns {Array<{horodatage: string, dureeReelleMinutes: number, ecartMinutes: number}>}
 */
export function creneauxPoseCandidats(deposeTs, dureeHeures, parametres = {}, pasAvant = null, categorie = null) {
  const p = fusionnerParametres(parametres);
  if (categorie === 'polygraphie') return creneauxPosePolygraphie(deposeTs, p, pasAvant);
  const ideal = poseIdeale(deposeTs, dureeHeures);
  const minutesIdeal = horodatageEnMinutes(ideal);
  const minutesDepose = horodatageEnMinutes(deposeTs);
  const dureeMini = dureeHeures * 60 - p.toleranceDureeMinutes;
  const minutesPlancher = pasAvant ? horodatageEnMinutes(pasAvant) : -Infinity;

  // On explore les jours ouvrés autour de la date idéale : quelques jours en
  // amont (jours fériés, dimanche, week-end) et le jour suivant (rattrapage
  // d'une ouverture tardive, typiquement le lundi matin).
  const dateIdeale = decouper(ideal).date;
  const candidats = [];
  for (let delta = -p.fenetreRechercheJours; delta <= 1; delta++) {
    const jour = ajouterJours(dateIdeale, delta);
    if (!estJourOuvre(jour, p)) continue;
    if (ecartJours(jour, decouper(deposeTs).date) < 0) continue; // après la dépose
    for (const h of creneauxDuJour(jour, p)) {
      const ts = horodatage(jour, h);
      const m = horodatageEnMinutes(ts);
      if (m < minutesPlancher) continue;
      const dureeReelle = minutesDepose - m;
      if (dureeReelle < dureeMini) continue;
      candidats.push({
        horodatage: ts,
        dureeReelleMinutes: dureeReelle,
        ecartMinutes: m - minutesIdeal,
      });
    }
  }

  // Le meilleur créneau est celui qui s'écarte le moins de la durée nominale ;
  // à écart égal on privilégie la pose la plus précoce (port un peu plus long).
  candidats.sort((a, b) => {
    const d = Math.abs(a.ecartMinutes) - Math.abs(b.ecartMinutes);
    if (d !== 0) return d;
    return a.ecartMinutes - b.ecartMinutes;
  });
  return candidats;
}

/**
 * Créneaux de pose d'une polygraphie : la VEILLE calendaire de la dépose
 * (une seule nuit d'enregistrement), l'après-midi uniquement — la plage se
 * prolonge jusqu'à `finPosePolygraphie` (17:15 en semaine, 16:45 le
 * vendredi). Les créneaux les plus tardifs sont proposés en premier : ils
 * sont réservés aux polygraphies et n'entrent pas en concurrence avec les
 * poses des autres matériels.
 */
function creneauxPosePolygraphie(deposeTs, p, pasAvant = null) {
  const veille = ajouterJours(decouper(deposeTs).date, -1);
  if (!estJourOuvre(veille, p)) return []; // dimanche, férié : pas de pose la veille -> impossible
  const minutesDepose = horodatageEnMinutes(deposeTs);
  const minutesPlancher = pasAvant ? horodatageEnMinutes(pasAvant) : -Infinity;

  return creneauxPoseDuJour(veille, 'polygraphie', p)
    .map((h) => horodatage(veille, h))
    .filter((ts) => horodatageEnMinutes(ts) >= minutesPlancher)
    .map((ts) => ({
      horodatage: ts,
      dureeReelleMinutes: minutesDepose - horodatageEnMinutes(ts),
      ecartMinutes: horodatageEnMinutes(ts) - (minutesDepose - 24 * 60),
    }))
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage));
}

// ---------------------------------------------------------------------------
// 3. Disponibilité des appareils
// ---------------------------------------------------------------------------

/** Vrai si deux intervalles [debut, fin[ se chevauchent. */
export function chevauche(debutA, finA, debutB, finB) {
  return horodatageEnMinutes(debutA) < horodatageEnMinutes(finB)
    && horodatageEnMinutes(debutB) < horodatageEnMinutes(finA);
}

/** Une pose est-elle « active » (donc bloquante) ? */
export function poseActive(pose) {
  return pose.statut !== 'annule';
}

/**
 * Fin d'immobilisation réelle d'un appareil : la dépose prévue, ou le retour
 * effectif s'il a déjà eu lieu, augmentée du délai de reconditionnement.
 */
export function finImmobilisation(pose, parametres = {}) {
  const p = fusionnerParametres(parametres);
  const base = pose.retour_effectif || pose.fin;
  return p.delaiReconditionnementMinutes
    ? decaler(base, p.delaiReconditionnementMinutes)
    : base;
}

/** Vrai si l'appareil est déjà pris sur la période demandée. */
export function appareilOccupe(appareilId, poses, debut, fin, parametres = {}, poseIgnoreeId = null) {
  return poses.some((pose) => (
    pose.appareil_id === appareilId
    // `poseIgnoreeId` sert à modifier un rendez-vous sans qu'il se bloque
    // lui-même. Attention : les poses provisoires ont un id `null`, elles ne
    // doivent jamais être confondues avec « aucune pose à ignorer ».
    && !(poseIgnoreeId != null && pose.id === poseIgnoreeId)
    && poseActive(pose)
    && chevauche(debut, fin, pose.debut, finImmobilisation(pose, parametres))
  ));
}

/**
 * Appareils libres sur une période, filtrés par catégorie et éventuellement
 * par marque. Les appareils réservés aux urgences sont exclus sauf demande
 * explicite (`inclureUrgence`).
 */
export function appareilsLibres(appareils, poses, criteres, parametres = {}) {
  const { categorie, marque = null, debut, fin, inclureUrgence = false, poseIgnoreeId = null } = criteres;
  return appareils.filter((a) => (
    a.actif !== false
    && a.hors_service !== true
    && a.categorie === categorie
    && (!marque || marque === 'indifferent' || a.marque === marque)
    && (inclureUrgence || !a.urgence)
    && !appareilOccupe(a.id, poses, debut, fin, parametres, poseIgnoreeId)
  ));
}

/**
 * Date du dernier retour connu d'un appareil (pour la rotation FIFO).
 * Renvoie null si l'appareil n'a jamais servi.
 */
export function dernierRetour(appareilId, poses, avantTs) {
  let dernier = null;
  for (const pose of poses) {
    if (pose.appareil_id !== appareilId || !poseActive(pose)) continue;
    const fin = pose.retour_effectif || pose.fin;
    if (horodatageEnMinutes(fin) > horodatageEnMinutes(avantTs)) continue;
    if (!dernier || horodatageEnMinutes(fin) > horodatageEnMinutes(dernier)) dernier = fin;
  }
  return dernier;
}

/**
 * Choix de l'appareil à attribuer parmi les appareils libres.
 * Règle de roulement : on prend celui qui est revenu depuis le plus longtemps
 * (ou qui n'a jamais servi), afin d'user les appareils de façon homogène.
 */
export function choisirAppareil(appareilsDisponibles, poses, debutTs) {
  if (appareilsDisponibles.length === 0) return null;
  const classes = [...appareilsDisponibles].sort((a, b) => {
    const ra = dernierRetour(a.id, poses, debutTs);
    const rb = dernierRetour(b.id, poses, debutTs);
    if (ra === null && rb !== null) return -1;
    if (rb === null && ra !== null) return 1;
    if (ra !== null && rb !== null) {
      const d = horodatageEnMinutes(ra) - horodatageEnMinutes(rb);
      if (d !== 0) return d;
    }
    return (a.ordre || 0) - (b.ordre || 0);
  });
  return classes[0];
}

// ---------------------------------------------------------------------------
// 4. Charge des créneaux (nombre de poses par quart d'heure)
// ---------------------------------------------------------------------------

/**
 * Nombre de POSES programmées sur chaque créneau. Les déposes ne sont pas
 * comptées : elles peuvent accueillir un nombre illimité de patients.
 * Un patient qui reçoit plusieurs appareils au même moment ne compte que
 * pour une seule pose.
 * @returns {Map<string, number>} horodatage -> nombre de poses
 */
export function chargeDesCreneaux(poses, rdvIgnoreId = null) {
  const actes = new Set();
  for (const pose of poses) {
    if (!poseActive(pose)) continue;
    if (rdvIgnoreId && pose.rdv_id === rdvIgnoreId) continue;
    // Les horodatages servent ici de clés : ils DOIVENT être normalisés, sinon
    // « 11:45 » et « 11:45:00 » comptent comme deux créneaux différents et le
    // contrôle de charge ne détecte plus rien.
    actes.add(`${normaliserHorodatage(pose.debut)}|${pose.rdv_id}`);
  }
  const charge = new Map();
  for (const acte of actes) {
    const ts = acte.split('|')[0];
    charge.set(ts, (charge.get(ts) || 0) + 1);
  }
  return charge;
}

/** Nombre de poses déjà programmées sur un créneau. */
export function gestesSurCreneau(charge, ts) {
  return charge.get(normaliserHorodatage(ts)) || 0;
}

/** Vrai si le créneau a atteint le nombre maximal de poses. */
export function creneauSature(charge, ts, parametres = {}) {
  const p = fusionnerParametres(parametres);
  return gestesSurCreneau(charge, ts) >= p.posesParCreneau;
}

/** Places de pose restantes sur un créneau. */
export function placesRestantes(charge, ts, parametres = {}) {
  const p = fusionnerParametres(parametres);
  return Math.max(0, p.posesParCreneau - gestesSurCreneau(charge, ts));
}

// ---------------------------------------------------------------------------
// 5. Planification complète d'une demande
// ---------------------------------------------------------------------------

/**
 * Prépare une proposition complète de rendez-vous.
 *
 * @param {object} demande
 * @param {string} demande.rdvCardio        horodatage "AAAA-MM-JJ HH:MM"
 * @param {Array}  demande.materiels        [{ categorie, marque?, dureeHeures? }]
 * @param {Array}  demande.appareils        inventaire complet
 * @param {Array}  demande.poses            poses existantes (toutes)
 * @param {object} demande.parametres
 * @param {string} demande.maintenant       horodatage courant (pose impossible avant)
 * @param {string} demande.rdvIgnoreId      rendez-vous en cours de modification
 *
 * @returns {{
 *   possible: boolean,
 *   depose: string|null,
 *   avertissements: string[],
 *   lignes: Array<{demande: object, appareil: object|null, pose: string|null,
 *                  dureeReelleMinutes: number|null, motifEchec: string|null,
 *                  marqueRedirigee: string|null}>,
 * }}
 */
export function planifier({
  rdvCardio, materiels, appareils, poses, parametres = {}, maintenant = null, rdvIgnoreId = null,
}) {
  const p = fusionnerParametres(parametres);
  const avertissements = [];
  const posesUtiles = rdvIgnoreId ? poses.filter((x) => x.rdv_id !== rdvIgnoreId) : poses;

  const depose = creneauDepose(rdvCardio, p);
  if (depose.avertissement) avertissements.push(depose.avertissement);
  if (!depose.horodatage) {
    return { possible: false, depose: null, avertissements, lignes: [] };
  }

  // Le nombre de déposes par créneau n'est pas limité : seul le créneau de
  // POSE est soumis au contrôle de charge (voir plus bas).
  const charge = chargeDesCreneaux(posesUtiles, rdvIgnoreId);

  // Les matériels de même durée de port sont posés au même moment.
  // La polygraphie forme toujours son propre groupe : ses créneaux de pose
  // (la veille, l'après-midi) ne sont pas ceux des autres matériels.
  const groupes = new Map();
  for (const m of materiels) {
    const duree = m.dureeHeures || 24;
    const cle = m.categorie === 'polygraphie' ? `polygraphie|${duree}` : `standard|${duree}`;
    if (!groupes.has(cle)) groupes.set(cle, { duree, polygraphie: m.categorie === 'polygraphie', materiels: [] });
    groupes.get(cle).materiels.push({ ...m, dureeHeures: duree });
  }

  const lignes = [];
  const reservations = []; // poses provisoires du rendez-vous en cours de construction

  for (const [, { duree, polygraphie, materiels: groupe }] of groupes) {
    // La polygraphie se dépose le matin : le résultat de la nuit est lu avant
    // midi. Un rendez-vous cardiologue l'après-midi est donc refusé.
    let motifImpose = null;
    if (polygraphie && horodatageEnMinutes(depose.horodatage) % 1440 >= MIDI_MINUTES) {
      motifImpose = 'La polygraphie se dépose le matin (avant midi) : '
        + 'choisissez un rendez-vous cardiologue en matinée.';
    }

    const candidats = motifImpose ? [] : creneauxPoseCandidats(
      depose.horodatage, duree, p, maintenant, polygraphie ? 'polygraphie' : null,
    );
    if (!motifImpose && polygraphie && candidats.length === 0) {
      motifImpose = 'Aucun créneau de pose de polygraphie la veille : elle se pose '
        + 'l’après-midi précédant le rendez-vous, pour une seule nuit d’enregistrement.';
    }
    let creneauRetenu = null;
    let attributions = null;

    for (const candidat of candidats) {
      // Le créneau de pose doit avoir de la place (le rendez-vous complet
      // ne compte que pour un geste, quel que soit le nombre d'appareils).
      const dejaPoseAuMemeMoment = reservations.some((r) => r.debut === candidat.horodatage);
      if (!dejaPoseAuMemeMoment && creneauSature(charge, candidat.horodatage, p)) continue;

      const essai = attribuerAppareils({
        groupe,
        appareils,
        poses: [...posesUtiles, ...reservations],
        debut: candidat.horodatage,
        fin: depose.horodatage,
        parametres: p,
      });
      if (essai.complet) {
        creneauRetenu = candidat;
        attributions = essai;
        break;
      }
      // On mémorise le premier essai partiel pour pouvoir expliquer l'échec.
      if (!attributions) attributions = essai;
    }

    if (creneauRetenu && attributions && attributions.complet) {
      for (const attribution of attributions.lignes) {
        reservations.push({
          id: null,
          rdv_id: '__en_cours__',
          appareil_id: attribution.appareil.id,
          debut: creneauRetenu.horodatage,
          fin: depose.horodatage,
          statut: 'prevu',
        });
        lignes.push({
          demande: attribution.demande,
          appareil: attribution.appareil,
          pose: creneauRetenu.horodatage,
          depose: depose.horodatage,
          dureeReelleMinutes: creneauRetenu.dureeReelleMinutes,
          motifEchec: null,
          marqueRedirigee: attribution.marqueRedirigee,
        });
      }
    } else {
      const motif = motifImpose
        || (attributions && attributions.motif ? attributions.motif : null)
        || 'Aucun créneau de pose compatible n’est disponible avant ce rendez-vous.';
      for (const m of groupe) {
        lignes.push({
          demande: m,
          appareil: null,
          pose: null,
          depose: depose.horodatage,
          dureeReelleMinutes: null,
          motifEchec: motif,
          marqueRedirigee: null,
        });
      }
    }
  }

  for (const ligne of lignes) {
    if (ligne.marqueRedirigee) {
      avertissements.push(
        `Aucun Holter ${ligne.marqueRedirigee} disponible : le logiciel a proposé `
        + `un Holter ${ligne.appareil.marque} à la place.`,
      );
    }
  }

  return {
    possible: lignes.length > 0 && lignes.every((l) => l.appareil !== null),
    depose: depose.horodatage,
    avertissements,
    lignes,
  };
}

/**
 * Attribue un appareil à chaque matériel demandé sur une période donnée.
 * Gère la redirection ELA <-> DMS pour les Holter ECG.
 */
export function attribuerAppareils({ groupe, appareils, poses, debut, fin, parametres }) {
  const utilises = [];
  const lignes = [];
  let motif = null;

  for (const demande of groupe) {
    const marqueSouhaitee = demande.marque && demande.marque !== 'indifferent' ? demande.marque : null;
    const posesEtDeja = [
      ...poses,
      ...utilises.map((id) => ({ id: null, rdv_id: '__en_cours__', appareil_id: id, debut, fin, statut: 'prevu' })),
    ];

    let libres = appareilsLibres(appareils, posesEtDeja, {
      categorie: demande.categorie, marque: marqueSouhaitee, debut, fin,
    }, parametres);

    let marqueRedirigee = null;
    if (libres.length === 0 && marqueSouhaitee && demande.categorie === 'holter_ecg') {
      // Redirection vers l'autre marque de Holter ECG.
      libres = appareilsLibres(appareils, posesEtDeja, {
        categorie: demande.categorie, marque: null, debut, fin,
      }, parametres);
      if (libres.length > 0) marqueRedirigee = marqueSouhaitee;
    }

    const appareil = choisirAppareil(libres, poses, debut);
    if (!appareil) {
      motif = motif || messageIndisponibilite(demande);
      return { complet: false, lignes, motif };
    }
    utilises.push(appareil.id);
    lignes.push({ demande, appareil, marqueRedirigee });
  }

  return { complet: true, lignes, motif: null };
}

function messageIndisponibilite(demande) {
  const nom = demande.categorie === 'holter_ecg'
    ? `Holter ECG${demande.marque && demande.marque !== 'indifferent' ? ` ${demande.marque}` : ''}`
    : demande.categorie;
  return `Plus aucun ${nom} disponible sur la période nécessaire.`;
}

// ---------------------------------------------------------------------------
// 6. Propositions de repli (autres jours / autres heures)
// ---------------------------------------------------------------------------

/**
 * Lorsque le rendez-vous demandé est impossible, cherche d'autres rendez-vous
 * cardiologue (même jour à d'autres heures, puis jours suivants) permettant de
 * poser tout le matériel demandé.
 *
 * @returns {Array<{rdvCardio: string, plan: object}>} au plus `maxPropositions`
 */
export function propositionsAlternatives({
  rdvCardio, materiels, appareils, poses, parametres = {}, maintenant = null,
  maxPropositions = 6, joursExplores = 15,
}) {
  const p = fusionnerParametres(parametres);
  const dateDepart = decouper(rdvCardio).date;
  const heureSouhaitee = horodatageEnMinutes(rdvCardio) - horodatageEnMinutes(horodatage(dateDepart, '00:00'));
  const propositions = [];

  for (let delta = 0; delta <= joursExplores && propositions.length < maxPropositions; delta++) {
    const jour = ajouterJours(dateDepart, delta);
    if (!estJourOuvre(jour, p)) continue;

    // On teste les créneaux du jour, en partant de l'heure souhaitée.
    const creneaux = creneauxDuJour(jour, p)
      .map((h) => horodatage(jour, h))
      .filter((ts) => !maintenant || horodatageEnMinutes(ts) > horodatageEnMinutes(maintenant))
      .filter((ts) => !(delta === 0 && ts === rdvCardio))
      .sort((a, b) => {
        const da = Math.abs(horodatageEnMinutes(a) % 1440 - heureSouhaitee);
        const db = Math.abs(horodatageEnMinutes(b) % 1440 - heureSouhaitee);
        return da - db;
      });

    let trouvesCeJour = 0;
    for (const ts of creneaux) {
      if (propositions.length >= maxPropositions || trouvesCeJour >= 3) break;
      const plan = planifier({ rdvCardio: ts, materiels, appareils, poses, parametres: p, maintenant });
      if (plan.possible) {
        propositions.push({ rdvCardio: ts, plan });
        trouvesCeJour++;
      }
    }
  }

  return propositions;
}

// ---------------------------------------------------------------------------
// 7. Disponibilités affichées à la prise de rendez-vous
// ---------------------------------------------------------------------------

/**
 * Pour chaque catégorie (et marque) de matériel, nombre d'appareils encore
 * libres si l'on posait aujourd'hui pour une dépose donnée.
 * Sert au bandeau « appareils restants » de l'onglet Prise de rendez-vous.
 */
export function disponibilitesParType(appareils, poses, debut, fin, parametres = {}) {
  const types = new Map();
  for (const a of appareils) {
    if (a.actif === false || a.hors_service === true || a.urgence) continue;
    const cle = a.marque ? `${a.categorie}|${a.marque}` : a.categorie;
    if (!types.has(cle)) {
      types.set(cle, { cle, categorie: a.categorie, marque: a.marque, total: 0, libres: 0, codesLibres: [] });
    }
    const t = types.get(cle);
    t.total++;
    if (!appareilOccupe(a.id, poses, debut, fin, parametres)) {
      t.libres++;
      t.codesLibres.push(a.code);
    }
  }
  return [...types.values()];
}

// ---------------------------------------------------------------------------
// 8. Corrections et réattributions d'appareils
// ---------------------------------------------------------------------------

/** Vrai si l'appareil ne doit plus recevoir de nouvelle attribution. */
export function appareilIndisponible(appareil) {
  return !appareil || appareil.actif === false || appareil.hors_service === true;
}

/**
 * Correction du jour de la pose : le mauvais appareil a été posé sur un
 * patient, on veut enregistrer l'appareil réellement posé (`appareilCible`).
 * Si celui-ci était réservé pour d'autres patients, la fonction cherche un
 * appareil de remplacement pour chacun d'eux (l'appareil d'origine, redevenu
 * libre, en fait partie).
 *
 * @returns {{possible: boolean, reattributions: Array<{pose, appareil}>, motif: string|null}}
 */
export function planChangementAppareil({ pose, appareilCible, appareils, poses, parametres = {} }) {
  const p = fusionnerParametres(parametres);

  if (appareilIndisponible(appareilCible)) {
    return { possible: false, reattributions: [], motif: 'Cet appareil est retiré du parc ou hors service.' };
  }
  if (appareilCible.id === pose.appareil_id) {
    return { possible: false, reattributions: [], motif: 'C’est déjà l’appareil enregistré pour cette pose.' };
  }

  const finPose = finImmobilisation(pose, p);
  // Notre pose quitte son appareil d'origine : elle ne compte plus nulle part.
  const sansNotrePose = poses.filter((x) => x.id !== pose.id);

  const conflits = sansNotrePose.filter((x) => (
    x.appareil_id === appareilCible.id
    && poseActive(x)
    && chevauche(pose.debut, finPose, x.debut, finImmobilisation(x, p))
  ));

  // Un appareil déjà posé sur un autre patient ne peut pas être « libéré ».
  const dejaPorte = conflits.find((x) => x.statut === 'pose');
  if (dejaPorte) {
    return {
      possible: false,
      reattributions: [],
      motif: 'Cet appareil est actuellement porté par un autre patient : impossible de le réattribuer.',
    };
  }

  const provisoires = [];
  const reattributions = [];
  for (const conflit of conflits) {
    const reference = [...sansNotrePose.filter((x) => x.id !== conflit.id), ...provisoires];
    let libres = appareilsLibres(
      appareils.filter((a) => a.id !== appareilCible.id),
      reference,
      {
        categorie: appareilCible.categorie,
        marque: conflit.marque_demandee || null,
        debut: conflit.debut,
        fin: finImmobilisation(conflit, p),
      },
      p,
    );
    if (libres.length === 0 && conflit.marque_demandee && appareilCible.categorie === 'holter_ecg') {
      libres = appareilsLibres(appareils.filter((a) => a.id !== appareilCible.id), reference, {
        categorie: appareilCible.categorie, marque: null,
        debut: conflit.debut, fin: finImmobilisation(conflit, p),
      }, p);
    }
    const remplacant = choisirAppareil(libres, poses, conflit.debut);
    if (!remplacant) {
      return {
        possible: false,
        reattributions,
        motif: 'Un patient réservé sur cet appareil n’a aucun appareil de remplacement disponible.',
      };
    }
    provisoires.push({
      id: null, rdv_id: '__reattribution__', appareil_id: remplacant.id,
      debut: conflit.debut, fin: conflit.fin, statut: 'prevu',
    });
    reattributions.push({ pose: conflit, appareil: remplacant });
  }

  return { possible: true, reattributions, motif: null };
}

/**
 * Réattribution d'une pose dont l'appareil est devenu indisponible (panne,
 * retrait du parc). Deux niveaux :
 *   1. un autre appareil libre SUR LE MÊME créneau (le patient n'a rien à
 *      savoir) ;
 *   2. sinon, un autre créneau de pose, choisi AU PLUS PRÈS de la durée
 *      nominale (24 h en général), même si le port est un peu plus court —
 *      le patient doit alors être rappelé.
 *
 * @returns {{type: 'appareil'|'deplacement', appareil, debut: string,
 *            dureeReelleMinutes: number|null} | null}
 */
export function propositionReattribution({ pose, appareil, appareils, poses, parametres = {}, maintenant = null }) {
  const p = fusionnerParametres(parametres);
  const categorie = appareil.categorie;
  const autres = poses.filter((x) => x.id !== pose.id);

  const chercherLibre = (debut) => {
    let libres = appareilsLibres(appareils, autres, {
      categorie, marque: pose.marque_demandee || null, debut, fin: pose.fin,
    }, p);
    if (libres.length === 0 && pose.marque_demandee && categorie === 'holter_ecg') {
      libres = appareilsLibres(appareils, autres, { categorie, marque: null, debut, fin: pose.fin }, p);
    }
    return choisirAppareil(libres, poses, debut);
  };

  // 1. Même créneau, autre appareil.
  const direct = chercherLibre(pose.debut);
  if (direct) return { type: 'appareil', appareil: direct, debut: pose.debut, dureeReelleMinutes: null };

  // 2. Autre créneau : on relâche la tolérance jusqu'à la moitié de la durée
  // nominale, et les candidats sortent déjà triés du plus proche de la durée
  // nominale au plus éloigné.
  const duree = pose.duree_heures || 24;
  const souple = { ...p, toleranceDureeMinutes: Math.max(p.toleranceDureeMinutes, (duree * 60) / 2) };
  const charge = chargeDesCreneaux(autres);
  const candidats = creneauxPoseCandidats(
    pose.fin, duree, souple, maintenant, categorie === 'polygraphie' ? 'polygraphie' : null,
  );
  for (const candidat of candidats) {
    if (candidat.horodatage === pose.debut) continue;
    if (creneauSature(charge, candidat.horodatage, p)) continue;
    const remplacant = chercherLibre(candidat.horodatage);
    if (remplacant) {
      return {
        type: 'deplacement',
        appareil: remplacant,
        debut: candidat.horodatage,
        dureeReelleMinutes: candidat.dureeReelleMinutes,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 9. Rendez-vous pris directement depuis le calendrier (appareil + jour choisis)
// ---------------------------------------------------------------------------

/**
 * La secrétaire clique sur une case du calendrier : un APPAREIL précis, un
 * JOUR précis, puis choisit l'heure de pose et la durée. On remonte alors le
 * fil dans l'autre sens : la dépose est le premier créneau atteignable après
 * la durée de port (à la tolérance près), et le rendez-vous cardiologue est
 * placé juste après la dépose.
 *
 * @returns {{possible: boolean, pose: string|null, depose: string|null,
 *            rdvCardio: string|null, dureeReelleMinutes: number|null,
 *            avertissements: string[], motif: string|null}}
 */
export function proposerRdvDepuisPose({
  appareil, date, heure, dureeHeures, poses, parametres = {}, maintenant = null,
}) {
  const p = fusionnerParametres(parametres);
  const refus = (motif) => ({
    possible: false, pose: null, depose: null, rdvCardio: null,
    dureeReelleMinutes: null, avertissements: [], motif,
  });

  if (appareilIndisponible(appareil)) {
    return refus('Cet appareil est hors service ou retiré du parc.');
  }

  const duree = dureeHeures || 24;
  const poseTs = horodatage(date, heure);

  if (!creneauxPoseDuJour(date, appareil.categorie, p).includes(heure)) {
    return refus(appareil.categorie === 'polygraphie'
      ? 'Les polygraphies se posent l’après-midi uniquement.'
      : 'Cette heure ne correspond à aucun créneau d’ouverture ce jour-là.');
  }
  if (maintenant && horodatageEnMinutes(poseTs) < horodatageEnMinutes(maintenant)) {
    return refus('Ce créneau de pose est déjà passé.');
  }
  if (creneauSature(chargeDesCreneaux(poses), poseTs, p)) {
    return refus(`Le créneau de pose de ${heure} est déjà pris `
      + `(${p.posesParCreneau} pose(s) maximum par quart d'heure).`);
  }

  // Recherche de la dépose.
  let depose = null;
  if (appareil.categorie === 'polygraphie') {
    // Une seule nuit : dépose le lendemain matin, au dernier créneau du matin
    // (le port se rapproche ainsi au mieux des 24 h).
    const lendemain = ajouterJours(date, 1);
    const matins = creneauxDuJour(lendemain, p).filter((h) => minutes(h) < MIDI_MINUTES);
    if (matins.length === 0) {
      return refus('Le lendemain est fermé : impossible de déposer la polygraphie le matin suivant.');
    }
    depose = horodatage(lendemain, matins[matins.length - 1]);
  } else {
    // Créneau de dépose LE PLUS PROCHE de « pose + durée ». On accepte un
    // port sensiblement plus court (jusqu'à la moitié de la durée nominale) :
    // une pose du vendredi après-midi se dépose le samedi matin plutôt que
    // le lundi, quitte à porter moins de 24 h — un avertissement le signale.
    const ideal = horodatageEnMinutes(poseTs) + duree * 60;
    const plancher = ideal - Math.max(p.toleranceDureeMinutes, (duree * 60) / 2);
    let meilleur = null;
    let jour = decouper(minutesEnHorodatage(plancher)).date;
    for (let i = 0; i < 15 && !(meilleur && meilleur.apresIdeal); i++) {
      for (const h of creneauxDuJour(jour, p)) {
        const m = horodatageEnMinutes(horodatage(jour, h));
        if (m < plancher) continue;
        const ecart = Math.abs(m - ideal);
        if (!meilleur || ecart < meilleur.ecart) {
          meilleur = { ts: horodatage(jour, h), ecart, apresIdeal: m >= ideal };
        }
        if (m >= ideal) { meilleur.apresIdeal = true; break; }
      }
      jour = ajouterJours(jour, 1);
    }
    if (!meilleur) return refus('Aucun créneau de dépose trouvé après la durée de port.');
    depose = meilleur.ts;
  }

  const avertissements = [];
  const dureeReelleMinutes = horodatageEnMinutes(depose) - horodatageEnMinutes(poseTs);
  if (appareil.categorie !== 'polygraphie'
      && Math.abs(dureeReelleMinutes - duree * 60) > p.toleranceDureeMinutes) {
    const heures = Math.round(dureeReelleMinutes / 60);
    avertissements.push(`Port réel de ${heures} h au lieu de ${duree} h `
      + '(week-end ou fermeture entre la pose et la dépose).');
  }
  if (appareil.urgence) {
    avertissements.push('Cet appareil est réservé aux urgences : il ne sera plus disponible '
      + 'pour un imprévu pendant toute la période.');
  }
  if (appareilOccupe(appareil.id, poses, poseTs, depose, p)) {
    return refus(`L'appareil ${appareil.code} est déjà réservé sur cette période `
      + '(de la pose au retour). Choisissez une autre ligne ou une autre date.');
  }

  return {
    possible: true,
    pose: poseTs,
    depose,
    rdvCardio: decaler(depose, p.minutesAvantRdvCardio),
    dureeReelleMinutes,
    avertissements,
    motif: null,
  };
}
