/**
 * regles.js — Le cœur métier du logiciel.
 *
 * Ce fichier ne connaît ni la base de données ni l'affichage : il ne contient
 * que des calculs purs, ce qui permet de les tester automatiquement
 * (voir le dossier `tests/`).
 *
 * Principe général d'un examen :
 *   1. le patient a un rendez-vous avec son cardiologue le jour J à l'heure H ;
 *   2. le matériel est DÉPOSÉ (retiré) 20 minutes avant ce rendez-vous, pour
 *      que le résultat soit disponible pendant la consultation ;
 *   3. le matériel a donc été POSÉ « durée de port » plus tôt, en remontant
 *      aux jours ouvrés (la veille d'un lundi est le samedi) ;
 *   4. l'appareil est immobilisé de la pose jusqu'à la dépose, et redevient
 *      disponible dès son retour.
 */

import {
  ajouterJours, creneauxDuJour, decaler, ecartJours, estJourOuvre,
  horodatage, horodatageEnMinutes, decouper, normaliserHorodatage,
} from './dates.js';

/** Paramètres de fonctionnement par défaut (modifiables dans l'onglet Paramètres). */
export const PARAMETRES_PAR_DEFAUT = {
  /** Délai entre la dépose du matériel et le rendez-vous cardiologue. */
  minutesAvantRdvCardio: 20,
  /** Nombre de patients pris en charge par créneau de 15 minutes. */
  gestesParCreneau: 2,
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
 * @returns {Array<{horodatage: string, dureeReelleMinutes: number, ecartMinutes: number}>}
 */
export function creneauxPoseCandidats(deposeTs, dureeHeures, parametres = {}, pasAvant = null) {
  const p = fusionnerParametres(parametres);
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
// 4. Charge des créneaux (nombre de gestes par quart d'heure)
// ---------------------------------------------------------------------------

/**
 * Nombre de gestes (poses + déposes) programmés sur chaque créneau.
 * Un patient qui reçoit plusieurs appareils au même moment ne compte que
 * pour un seul geste.
 * @returns {Map<string, number>} horodatage -> nombre de gestes
 */
export function chargeDesCreneaux(poses, rdvIgnoreId = null) {
  const actes = new Set();
  for (const pose of poses) {
    if (!poseActive(pose)) continue;
    if (rdvIgnoreId && pose.rdv_id === rdvIgnoreId) continue;
    // Les horodatages servent ici de clés : ils DOIVENT être normalisés, sinon
    // « 11:45 » et « 11:45:00 » comptent comme deux créneaux différents et le
    // contrôle de charge ne détecte plus rien.
    actes.add(`${normaliserHorodatage(pose.debut)}|pose|${pose.rdv_id}`);
    actes.add(`${normaliserHorodatage(pose.fin)}|depose|${pose.rdv_id}`);
  }
  const charge = new Map();
  for (const acte of actes) {
    const ts = acte.split('|')[0];
    charge.set(ts, (charge.get(ts) || 0) + 1);
  }
  return charge;
}

/** Nombre de gestes déjà programmés sur un créneau. */
export function gestesSurCreneau(charge, ts) {
  return charge.get(normaliserHorodatage(ts)) || 0;
}

/** Vrai si le créneau a atteint le nombre maximal de gestes. */
export function creneauSature(charge, ts, parametres = {}) {
  const p = fusionnerParametres(parametres);
  return gestesSurCreneau(charge, ts) >= p.gestesParCreneau;
}

/** Places restantes sur un créneau. */
export function placesRestantes(charge, ts, parametres = {}) {
  const p = fusionnerParametres(parametres);
  return Math.max(0, p.gestesParCreneau - gestesSurCreneau(charge, ts));
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

  const charge = chargeDesCreneaux(posesUtiles, rdvIgnoreId);

  // Le créneau de dépose doit lui aussi disposer d'une place.
  if (creneauSature(charge, depose.horodatage, p)) {
    avertissements.push(
      `Le créneau de dépose ${decouper(depose.horodatage).heure} est complet `
      + `(${p.gestesParCreneau} patients maximum par quart d'heure).`,
    );
    return { possible: false, depose: depose.horodatage, avertissements, lignes: [] };
  }

  // Les matériels de même durée de port sont posés au même moment.
  const groupes = new Map();
  for (const m of materiels) {
    const duree = m.dureeHeures || 24;
    if (!groupes.has(duree)) groupes.set(duree, []);
    groupes.get(duree).push({ ...m, dureeHeures: duree });
  }

  const lignes = [];
  const reservations = []; // poses provisoires du rendez-vous en cours de construction

  for (const [duree, groupe] of groupes) {
    const candidats = creneauxPoseCandidats(depose.horodatage, duree, p, maintenant);
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
      const motif = attributions && attributions.motif
        ? attributions.motif
        : 'Aucun créneau de pose compatible n’est disponible avant ce rendez-vous.';
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
    if (a.actif === false || a.urgence) continue;
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
