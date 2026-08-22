/**
 * classeur.js — Construction du classeur Excel de sauvegarde.
 *
 * Ce classeur a deux rôles :
 *   1. conserver une copie complète des données, tous les jours ;
 *   2. servir de solution de secours : si le site est indisponible, les
 *      secrétaires travaillent directement dans ce fichier, qui reprend la
 *      même présentation et les mêmes couleurs que l'interface.
 *
 * Le même code est utilisé par le bouton « Excel » du site et par la
 * sauvegarde automatique quotidienne : les deux fichiers sont identiques.
 */

import {
  ajouterJours, creneauxDuJour, dateEnFrancais, dateEnFrancaisLong, decouper,
  ecartJours, estJourOuvre, jourSemaine, nomJourFerie,
} from './dates.js';
import { CATEGORIES, dureeLisible, libelleAppareil, libelleCourt } from './materiel.js';
import { disponibilitesParType } from './regles.js';
import { ajouterFeuille, nouveauClasseur, styleDuMateriel } from './xlsx.js';

const INITIALES_JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Nom du fichier de sauvegarde : « sauvegarde holter 21-08-2026.xlsx ». */
export function nomFichierSauvegarde(date) {
  return `sauvegarde holter ${dateEnFrancais(date).replace(/\//g, '-')}.xlsx`;
}

function nomPatient(rdv) {
  if (!rdv) return '—';
  return (rdv.patient_nom || '').toUpperCase().trim() || '—';
}

/** Le cabinet n'enregistre que le nom de famille et le sexe du patient. */
function sexePatient(rdv) {
  return rdv?.patient_sexe || '';
}

function libelleStatut(statut) {
  return { prevu: 'prévu', pose: 'posé', rendu: 'rendu', annule: 'annulé' }[statut] || statut;
}

/**
 * @param {object} donnees
 * @param {string} donnees.date        jour de référence "AAAA-MM-JJ"
 * @param {Array}  donnees.appareils
 * @param {Array}  donnees.poses       poses avec leur propriété `rdv`
 * @param {object} donnees.parametres
 * @param {number} [donnees.joursPlanning]  nombre de jours détaillés (défaut 14)
 */
export function construireClasseurSauvegarde(donnees) {
  const { date, appareils, poses, parametres } = donnees;
  const joursPlanning = donnees.joursPlanning || 14;
  const actives = poses.filter((p) => p.statut !== 'annule');

  const classeur = nouveauClasseur();
  feuilleJournee(classeur, date, actives, appareils, parametres);
  feuilleProchainsJours(classeur, date, actives, appareils, parametres, joursPlanning);
  feuilleCalendrier(classeur, date, actives, appareils, parametres);
  feuilleRendezVous(classeur, poses, appareils);
  feuilleMateriel(classeur, date, appareils, actives, parametres);
  feuilleSaisieManuelle(classeur, appareils);
  feuilleModeEmploi(classeur, date);
  return classeur;
}

// ---------------------------------------------------------------------------
// Feuille 1 — Programme de la journée
// ---------------------------------------------------------------------------

function actesDuJour(date, poses, appareils) {
  const parId = new Map(appareils.map((a) => [a.id, a]));
  const actes = [];
  for (const pose of poses) {
    const appareil = parId.get(pose.appareil_id) || null;
    if (decouper(pose.debut).date === date) {
      actes.push({ heure: decouper(pose.debut).heure, type: 'Pose', pose, appareil });
    }
    if (decouper(pose.fin).date === date) {
      actes.push({ heure: decouper(pose.fin).heure, type: 'Dépose', pose, appareil });
    }
  }
  return actes.sort((a, b) => a.heure.localeCompare(b.heure)
    || nomPatient(a.pose.rdv).localeCompare(nomPatient(b.pose.rdv)));
}

const COLONNES_JOURNEE = [
  { titre: 'Heure', largeur: 8 },
  { titre: 'Geste', largeur: 9 },
  { titre: 'Patient', largeur: 28 },
  { titre: 'Sexe', largeur: 7 },
  { titre: 'Cardio', largeur: 8 },
  { titre: 'Matériel', largeur: 22 },
  { titre: 'Durée', largeur: 9 },
  { titre: 'Pose le', largeur: 16 },
  { titre: 'Dépose le', largeur: 16 },
  { titre: 'RDV cardio', largeur: 16 },
  { titre: 'État', largeur: 10 },
  { titre: 'Téléphone', largeur: 14 },
];

function lignesActes(actes) {
  return actes.map(({ heure, type, pose, appareil }) => {
    const rdv = pose.rdv;
    const style = type === 'Pose' ? styleDuMateriel(appareil?.categorie, appareil?.marque) : 'depose';
    return [
      { v: heure, s: 'heure' },
      { v: type, s: 'celluleCentree' },
      { v: nomPatient(rdv), s: style },
      { v: sexePatient(rdv), s: 'celluleCentree' },
      { v: rdv?.cardiologue || '', s: 'celluleCentree' },
      { v: appareil ? libelleAppareil(appareil) : '—', s: style },
      { v: dureeLisible(pose.duree_heures), s: 'celluleCentree' },
      { v: `${dateEnFrancais(decouper(pose.debut).date)} ${decouper(pose.debut).heure}`, s: 'cellule' },
      { v: `${dateEnFrancais(decouper(pose.fin).date)} ${decouper(pose.fin).heure}`, s: 'cellule' },
      rdv ? { v: `${dateEnFrancais(decouper(rdv.rdv_cardio).date)} ${decouper(rdv.rdv_cardio).heure}`, s: 'cellule' } : { v: '', s: 'cellule' },
      { v: libelleStatut(pose.statut), s: 'celluleCentree' },
      { v: rdv?.telephone || '', s: 'cellule' },
    ];
  });
}

function feuilleJournee(classeur, date, poses, appareils, parametres) {
  const actes = actesDuJour(date, poses, appareils);
  const ferie = nomJourFerie(date, parametres);
  const lignes = [
    [{ v: `Programme du ${dateEnFrancaisLong(date)}`, s: 'titre' }],
    [{ v: ferie ? `Cabinet fermé — ${ferie}` : `${actes.length} geste(s) programmé(s)`, s: ferie ? 'alerte' : 'soustitre' }],
    [],
    COLONNES_JOURNEE.map((c) => ({ v: c.titre, s: 'entete' })),
  ];

  if (actes.length === 0) {
    lignes.push([{ v: 'Aucun rendez-vous ce jour.', s: 'cellule' }]);
  } else {
    lignes.push(...lignesActes(actes));
  }

  ajouterFeuille(classeur, {
    nom: 'Journée',
    colonnes: COLONNES_JOURNEE.map((c) => ({ largeur: c.largeur })),
    lignes,
    figer: { lignes: 4 },
    hauteurs: { 1: 22 },
  });
}

// ---------------------------------------------------------------------------
// Feuille 2 — Les prochains jours, créneau par créneau
// ---------------------------------------------------------------------------

function feuilleProchainsJours(classeur, date, poses, appareils, parametres, nbJours) {
  const lignes = [
    [{ v: 'Planning des prochains jours', s: 'titre' }],
    [{ v: `À partir du ${dateEnFrancaisLong(date)}`, s: 'soustitre' }],
  ];

  for (let i = 0; i < nbJours; i++) {
    const jour = ajouterJours(date, i);
    if (!estJourOuvre(jour, parametres)) continue;

    const actes = actesDuJour(jour, poses, appareils);
    lignes.push([]);
    lignes.push([{ v: dateEnFrancaisLong(jour), s: 'titre' }]);
    lignes.push(COLONNES_JOURNEE.slice(0, 8).map((c) => ({ v: c.titre, s: 'entete' })));

    const parHeure = new Map();
    for (const acte of actes) {
      if (!parHeure.has(acte.heure)) parHeure.set(acte.heure, []);
      parHeure.get(acte.heure).push(acte);
    }

    for (const heure of creneauxDuJour(jour, parametres)) {
      const duCreneau = parHeure.get(heure) || [];
      if (duCreneau.length === 0) {
        lignes.push([{ v: heure, s: 'heure' }, { v: '—', s: 'cellule' }]);
      } else {
        for (const acte of duCreneau) {
          lignes.push(lignesActes([acte])[0].slice(0, 8));
        }
      }
    }
  }

  ajouterFeuille(classeur, {
    nom: 'Prochains jours',
    colonnes: COLONNES_JOURNEE.slice(0, 8).map((c) => ({ largeur: c.largeur })),
    lignes,
    figer: { lignes: 2 },
  });
}

// ---------------------------------------------------------------------------
// Feuille 3 — Calendrier matériel (appareils en lignes, jours en colonnes)
// ---------------------------------------------------------------------------

function feuilleCalendrier(classeur, date, poses, appareils, parametres) {
  const debut = ajouterJours(date, -7);
  const nbJours = 90;
  const jours = Array.from({ length: nbJours }, (_, i) => ajouterJours(debut, i));

  const enteteMois = [{ v: '', s: 'entete' }];
  const enteteJours = [{ v: 'Appareil', s: 'entete' }];
  for (const jour of jours) {
    const numero = Number(jour.slice(8, 10));
    enteteMois.push({ v: numero === 1 || jour === debut ? dateEnFrancais(jour).slice(3) : '', s: 'entete' });
    enteteJours.push({ v: `${numero}${INITIALES_JOURS[jourSemaine(jour)]}`, s: 'entete' });
  }

  const lignes = [
    [{ v: 'Occupation du matériel', s: 'titre' }],
    [{ v: 'Le nom du patient apparaît sur chaque jour où l’appareil est chez lui.', s: 'soustitre' }],
    [],
    enteteMois,
    enteteJours,
  ];

  const actifs = appareils.filter((a) => a.actif !== false);
  for (const appareil of actifs) {
    const ligne = [{ v: libelleCourt(appareil) + (appareil.urgence ? ' ⚠' : ''), s: 'gras' }];
    const posesAppareil = poses.filter((p) => p.appareil_id === appareil.id);
    for (const jour of jours) {
      const pose = posesAppareil.find((p) => (
        ecartJours(decouper(p.debut).date, jour) >= 0 && ecartJours(jour, decouper(p.fin).date) >= 0
      ));
      ligne.push(pose
        ? { v: (pose.rdv?.patient_nom || '●').toUpperCase().slice(0, 4), s: styleDuMateriel(appareil.categorie, appareil.marque) }
        : { v: '', s: 'cellule' });
    }
    lignes.push(ligne);
  }

  ajouterFeuille(classeur, {
    nom: 'Calendrier matériel',
    colonnes: [{ largeur: 16 }, ...jours.map(() => ({ largeur: 4.5 }))],
    lignes,
    figer: { lignes: 5, colonnes: 1 },
  });
}

// ---------------------------------------------------------------------------
// Feuille 4 — Tous les rendez-vous (sert de moteur de recherche de secours)
// ---------------------------------------------------------------------------

function feuilleRendezVous(classeur, poses, appareils) {
  const parId = new Map(appareils.map((a) => [a.id, a]));
  const colonnes = [
    { titre: 'Patient', largeur: 26 },
    { titre: 'Sexe', largeur: 7 },
    { titre: 'Cardio', largeur: 8 },
    { titre: 'RDV cardiologue', largeur: 18 },
    { titre: 'Matériel', largeur: 22 },
    { titre: 'Pose', largeur: 18 },
    { titre: 'Dépose', largeur: 18 },
    { titre: 'Durée', largeur: 9 },
    { titre: 'État', largeur: 10 },
    { titre: 'Téléphone', largeur: 14 },
    { titre: 'Note', largeur: 30 },
    { titre: 'Saisi par', largeur: 18 },
  ];

  const lignes = [colonnes.map((c) => ({ v: c.titre, s: 'entete' }))];

  const triees = [...poses].sort((a, b) => a.debut.localeCompare(b.debut));
  for (const pose of triees) {
    const rdv = pose.rdv;
    const appareil = parId.get(pose.appareil_id);
    const style = pose.statut === 'annule' ? 'cellule' : styleDuMateriel(appareil?.categorie, appareil?.marque);
    lignes.push([
      { v: nomPatient(rdv), s: style },
      { v: sexePatient(rdv), s: 'celluleCentree' },
      { v: rdv?.cardiologue || '', s: 'celluleCentree' },
      rdv ? { v: `${dateEnFrancais(decouper(rdv.rdv_cardio).date)} ${decouper(rdv.rdv_cardio).heure}`, s: 'cellule' } : { v: '', s: 'cellule' },
      { v: appareil ? libelleAppareil(appareil) : '—', s: style },
      { v: `${dateEnFrancais(decouper(pose.debut).date)} ${decouper(pose.debut).heure}`, s: 'cellule' },
      { v: `${dateEnFrancais(decouper(pose.fin).date)} ${decouper(pose.fin).heure}`, s: 'cellule' },
      { v: dureeLisible(pose.duree_heures), s: 'celluleCentree' },
      { v: libelleStatut(pose.statut), s: pose.statut === 'annule' ? 'alerte' : 'celluleCentree' },
      { v: rdv?.telephone || '', s: 'cellule' },
      { v: rdv?.commentaire || '', s: 'cellule' },
      { v: rdv?.cree_par_nom || '', s: 'cellule' },
    ]);
  }

  ajouterFeuille(classeur, {
    nom: 'Rendez-vous',
    colonnes: colonnes.map((c) => ({ largeur: c.largeur })),
    lignes,
    figer: { lignes: 1 },
    filtre: true,
  });
}

// ---------------------------------------------------------------------------
// Feuille 5 — Parc matériel et disponibilité
// ---------------------------------------------------------------------------

function feuilleMateriel(classeur, date, appareils, poses, parametres) {
  const debut = `${date} 00:00`;
  const fin = `${ajouterJours(date, 1)} 23:59`;
  const dispos = disponibilitesParType(appareils, poses, debut, fin, parametres);

  const lignes = [
    [{ v: 'Parc matériel', s: 'titre' }],
    [{ v: `Disponibilité calculée pour le ${dateEnFrancaisLong(date)}`, s: 'soustitre' }],
    [],
    [{ v: 'Type', s: 'entete' }, { v: 'Total', s: 'entete' }, { v: 'Libres', s: 'entete' },
      { v: 'Numéros libres', s: 'entete' }],
  ];

  for (const d of dispos) {
    const libelle = d.categorie === 'holter_ecg'
      ? `Holter ECG ${d.marque}`
      : (CATEGORIES[d.categorie]?.libelle || d.categorie);
    lignes.push([
      { v: libelle, s: styleDuMateriel(d.categorie, d.marque) },
      { v: d.total, s: 'nombre' },
      { v: d.libres, s: d.libres === 0 ? 'alerte' : 'nombre' },
      { v: d.codesLibres.join(', ') || 'aucun', s: 'cellule' },
    ]);
  }

  lignes.push([]);
  lignes.push([{ v: 'Détail des appareils', s: 'titre' }]);
  lignes.push([{ v: 'Code', s: 'entete' }, { v: 'Type', s: 'entete' }, { v: 'Marque', s: 'entete' },
    { v: 'Urgence', s: 'entete' }, { v: 'En service', s: 'entete' }]);

  for (const a of appareils) {
    lignes.push([
      { v: a.code, s: styleDuMateriel(a.categorie, a.marque) },
      { v: CATEGORIES[a.categorie]?.libelle || a.categorie, s: 'cellule' },
      { v: a.marque || '', s: 'celluleCentree' },
      { v: a.urgence ? 'oui' : '', s: 'celluleCentree' },
      { v: a.actif === false ? 'retiré' : 'oui', s: a.actif === false ? 'alerte' : 'celluleCentree' },
    ]);
  }

  ajouterFeuille(classeur, {
    nom: 'Matériel',
    colonnes: [{ largeur: 24 }, { largeur: 22 }, { largeur: 12 }, { largeur: 12 }, { largeur: 12 }],
    lignes,
  });
}

// ---------------------------------------------------------------------------
// Feuille 6 — Saisie manuelle pendant une panne
// ---------------------------------------------------------------------------

function feuilleSaisieManuelle(classeur, appareils) {
  const colonnes = [
    { titre: 'Date pose', largeur: 13 },
    { titre: 'Heure pose', largeur: 11 },
    { titre: 'Patient (nom de famille)', largeur: 28 },
    { titre: 'Sexe (F/M)', largeur: 9 },
    { titre: 'Cardio', largeur: 9 },
    { titre: 'Matériel (code)', largeur: 16 },
    { titre: 'Durée (h)', largeur: 10 },
    { titre: 'Date dépose', largeur: 13 },
    { titre: 'Heure dépose', largeur: 12 },
    { titre: 'RDV cardio', largeur: 16 },
    { titre: 'Téléphone', largeur: 14 },
    { titre: 'Saisi par', largeur: 16 },
  ];

  const codes = appareils.filter((a) => a.actif !== false).map((a) => libelleCourt(a)).join(', ');

  const lignes = [
    [{ v: 'Rendez-vous pris pendant une panne du site', s: 'titre' }],
    [{ v: 'Remplissez une ligne par appareil posé. Ces lignes seront réintégrées '
        + 'dans le logiciel au retour du service.', s: 'soustitre' }],
    [{ v: `Codes matériel disponibles : ${codes}`, s: 'soustitre' }],
    [],
    colonnes.map((c) => ({ v: c.titre, s: 'entete' })),
  ];

  // 60 lignes vides prêtes à être remplies.
  for (let i = 0; i < 60; i++) {
    lignes.push(colonnes.map(() => ({ v: '', s: 'cellule' })));
  }

  ajouterFeuille(classeur, {
    nom: 'Saisie manuelle',
    colonnes: colonnes.map((c) => ({ largeur: c.largeur })),
    lignes,
    figer: { lignes: 5 },
  });
}

// ---------------------------------------------------------------------------
// Feuille 7 — Mode d'emploi
// ---------------------------------------------------------------------------

function feuilleModeEmploi(classeur, date) {
  const texte = [
    ['Sauvegarde du planning Holter', 'titre'],
    [`Fichier produit automatiquement le ${dateEnFrancaisLong(date)}.`, 'soustitre'],
    ['', 'normal'],
    ['À quoi sert ce fichier ?', 'gras'],
    ['Il contient une copie complète du planning au moment de la sauvegarde.', 'normal'],
    ['Si le site en ligne est indisponible, ce fichier prend le relais : ouvrez-le', 'normal'],
    ['depuis le dossier partagé et travaillez dedans, à plusieurs si nécessaire.', 'normal'],
    ['', 'normal'],
    ['Les feuilles du classeur', 'gras'],
    ['• Journée — le programme du jour, heure par heure, comme dans le logiciel.', 'normal'],
    ['• Prochains jours — le même détail pour les deux semaines à venir.', 'normal'],
    ['• Calendrier matériel — quel appareil est chez quel patient, jour par jour.', 'normal'],
    ['• Rendez-vous — la liste complète, avec un filtre pour rechercher un patient.', 'normal'],
    ['• Matériel — le parc et les appareils libres.', 'normal'],
    ['• Saisie manuelle — les lignes à remplir pendant une panne.', 'normal'],
    ['', 'normal'],
    ['Règles à respecter en saisie manuelle', 'gras'],
    ['1. La dépose a lieu 20 minutes avant le rendez-vous avec le cardiologue.', 'normal'],
    ['2. La pose a lieu la durée de port avant la dépose (la veille pour 24 h).', 'normal'],
    ['3. La veille d’un lundi est le samedi ; dernière pose le samedi à 11h45.', 'normal'],
    ['4. Un appareil ne peut pas être donné à deux patients en même temps :', 'normal'],
    ['   vérifiez la feuille « Calendrier matériel » avant d’attribuer un numéro.', 'normal'],
    ['5. Deux patients au maximum par quart d’heure, poses et déposes confondues.', 'normal'],
    ['', 'normal'],
    ['Au retour du service en ligne', 'gras'],
    ['Prévenez l’administrateur : le dernier fichier Excel modifié pendant la panne', 'normal'],
    ['sert de référence pour remettre le logiciel à jour, sans perte de rendez-vous.', 'normal'],
  ];

  ajouterFeuille(classeur, {
    nom: 'Mode d’emploi',
    colonnes: [{ largeur: 95 }],
    lignes: texte.map(([v, s]) => [{ v, s }]),
  });
}
