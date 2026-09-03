/**
 * etat.js — La mémoire vive du logiciel.
 *
 * Toutes les données utiles (matériel, réglages, poses) sont chargées une fois
 * puis conservées ici. Les écrans lisent cet état ; quand il change, ils se
 * redessinent. Les modifications faites par les autres secrétaires arrivent en
 * temps réel et déclenchent un rechargement automatique.
 */

import * as api from './api.js';
import { ajouterJours, aujourdHui } from '../core/dates.js';
import { PARAMETRES_PAR_DEFAUT } from '../core/regles.js';
import { HORAIRES_PAR_DEFAUT } from '../core/dates.js';

/** Fenêtre de données maintenue en mémoire, autour de la date du jour. */
const JOURS_AVANT = 90;
const JOURS_APRES = 420;

export const etat = {
  profil: null,
  appareils: [],
  reglages: {},          // contenu brut de la table « parametres »
  poses: [],
  rappels: [],           // patients à prévenir d'un changement d'horaire
  fenetre: { debut: null, fin: null },
  chargement: false,
  enLigne: true,
  derniereErreur: null,
};

// ---------------------------------------------------------------------------
// Abonnement des écrans
// ---------------------------------------------------------------------------

const abonnes = new Set();

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function prevenir() {
  for (const rappel of abonnes) {
    try {
      rappel(etat);
    } catch (e) {
      console.error('Erreur pendant le rafraîchissement d’un écran :', e);
    }
  }
}

// ---------------------------------------------------------------------------
// Paramètres consolidés, tels que les attendent les règles métier
// ---------------------------------------------------------------------------

export function parametres() {
  const planification = etat.reglages.planification || {};
  const horaires = etat.reglages.horaires || HORAIRES_PAR_DEFAUT;
  return {
    ...PARAMETRES_PAR_DEFAUT,
    ...planification,
    horaires,
    fermeturesExceptionnelles: planification.fermeturesExceptionnelles || {},
  };
}

export function cardiologues() {
  return etat.reglages.cardiologues || ['MA', 'PL', 'RG', 'DC', 'AZ', 'LM', 'KS', 'GB', 'RB'];
}

/** Appareils actifs, dans l'ordre d'affichage. */
export function appareilsActifs() {
  return etat.appareils.filter((a) => a.actif !== false);
}

export function appareilParId(id) {
  return etat.appareils.find((a) => a.id === id) || null;
}

/** Poses non annulées, format attendu par les règles métier. */
export function posesActives() {
  return etat.poses.filter((p) => p.statut !== 'annule');
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

export async function chargerTout() {
  etat.chargement = true;
  prevenir();
  try {
    const debut = ajouterJours(aujourdHui(), -JOURS_AVANT);
    const fin = ajouterJours(aujourdHui(), JOURS_APRES);
    const [appareils, reglages, poses, rappels] = await Promise.all([
      api.chargerAppareils(),
      api.chargerParametres(),
      api.chargerPoses(debut, fin),
      // Base pas encore migrée (table absente) : on continue sans rappels.
      api.listerRappels().catch(() => []),
    ]);
    etat.appareils = appareils;
    etat.reglages = reglages;
    etat.poses = poses;
    etat.rappels = rappels;
    etat.fenetre = { debut, fin };
    etat.derniereErreur = null;
  } catch (erreur) {
    etat.derniereErreur = erreur;
    throw erreur;
  } finally {
    etat.chargement = false;
    prevenir();
  }
}

/** Recharge uniquement les poses (après une modification distante). */
export async function rechargerPoses() {
  const { debut, fin } = etat.fenetre;
  if (!debut) return chargerTout();
  etat.poses = await api.chargerPoses(debut, fin);
  prevenir();
  return etat.poses;
}

// ---------------------------------------------------------------------------
// Temps réel (rechargement groupé pour éviter les rafales)
// ---------------------------------------------------------------------------

let minuterie = null;

export function demarrerTempsReel() {
  api.ecouterModifications(
    () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        chargerTout().catch((e) => console.error('Rechargement impossible :', e));
      }, 350);
    },
    (connecte) => {
      if (etat.enLigne !== connecte) {
        etat.enLigne = connecte;
        prevenir();
      }
    },
  );
}

export function arreterTempsReel() {
  clearTimeout(minuterie);
  api.arreterEcoute();
}

/** À appeler après toute écriture faite depuis ce poste. */
export async function rafraichir() {
  await chargerTout();
}

export { prevenir };
