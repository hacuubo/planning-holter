/**
 * dates.js — Calendrier, jours ouvrés, jours fériés et créneaux de 15 minutes.
 *
 * IMPORTANT : tout le logiciel travaille en "heure de l'horloge du cabinet".
 * Une date est une chaîne "AAAA-MM-JJ", une heure une chaîne "HH:MM",
 * un horodatage la chaîne "AAAA-MM-JJ HH:MM". Aucun fuseau horaire n'est
 * manipulé : cela supprime définitivement les décalages d'une heure liés
 * au changement d'heure été/hiver.
 */

// ---------------------------------------------------------------------------
// Manipulation de dates (arithmétique en UTC pour éviter tout décalage local)
// ---------------------------------------------------------------------------

/** "AAAA-MM-JJ" -> nombre de jours depuis 1970 (entier). */
export function jourDepuisEpoque(date) {
  const [a, m, j] = date.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, j) / 86400000);
}

/** Nombre de jours depuis 1970 -> "AAAA-MM-JJ". */
export function dateDepuisJour(n) {
  const d = new Date(n * 86400000);
  return isoDepuisDateUTC(d);
}

function isoDepuisDateUTC(d) {
  const a = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const j = String(d.getUTCDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

/** Ajoute (ou retire) des jours à une date "AAAA-MM-JJ". */
export function ajouterJours(date, nb) {
  return dateDepuisJour(jourDepuisEpoque(date) + nb);
}

/** Écart en jours entre deux dates (b - a). */
export function ecartJours(a, b) {
  return jourDepuisEpoque(b) - jourDepuisEpoque(a);
}

/** 0 = dimanche, 1 = lundi, ... 6 = samedi. */
export function jourSemaine(date) {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function nomJour(date) {
  return NOMS_JOURS[jourSemaine(date)];
}

/** "2026-08-21" -> "vendredi 21 août 2026" */
export function dateEnFrancaisLong(date) {
  const [a, m, j] = date.split('-').map(Number);
  return `${NOMS_JOURS[jourSemaine(date)]} ${j} ${NOMS_MOIS[m - 1]} ${a}`;
}

/** "2026-08-21" -> "21/08/2026" */
export function dateEnFrancais(date) {
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a}`;
}

/** "21/08/2026" -> "2026-08-21" (renvoie null si invalide). */
export function dateDepuisFrancais(texte) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((texte || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Date du jour, au format "AAAA-MM-JJ", selon l'horloge du poste. */
export function aujourdHui(maintenant = new Date()) {
  const a = maintenant.getFullYear();
  const m = String(maintenant.getMonth() + 1).padStart(2, '0');
  const j = String(maintenant.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

/** Horodatage courant "AAAA-MM-JJ HH:MM". */
export function maintenantHorodatage(maintenant = new Date()) {
  const h = String(maintenant.getHours()).padStart(2, '0');
  const mn = String(maintenant.getMinutes()).padStart(2, '0');
  return `${aujourdHui(maintenant)} ${h}:${mn}`;
}

// ---------------------------------------------------------------------------
// Heures et horodatages
// ---------------------------------------------------------------------------

/** "08:15" -> 495 (minutes depuis minuit). */
export function minutes(heure) {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

/** 495 -> "08:15". Accepte les valeurs hors 0-1439 en les ramenant au jour. */
export function heure(minutesDepuisMinuit) {
  const m = ((minutesDepuisMinuit % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Construit "AAAA-MM-JJ HH:MM". */
export function horodatage(date, heureTexte) {
  return `${date} ${heureTexte}`;
}

/**
 * Ramène un horodatage à la minute : "2026-08-22 11:45:00" -> "2026-08-22 11:45".
 *
 * Indispensable dès qu'un horodatage sert de CLÉ (comptage des gestes par
 * créneau, comparaisons de chaînes). La base de données renvoie des secondes,
 * l'interface n'en met pas : sans cette normalisation, deux écritures du même
 * instant ne se reconnaissent pas et un contrôle peut échouer en silence.
 */
export function normaliserHorodatage(ts) {
  return ts ? String(ts).replace('T', ' ').slice(0, 16) : ts;
}

/** Découpe "AAAA-MM-JJ HH:MM" en { date, heure }. */
export function decouper(ts) {
  const [date, h] = normaliserHorodatage(ts).split(' ');
  return { date, heure: h };
}

/** Horodatage -> minutes absolues depuis le 1er janvier 1970. */
export function horodatageEnMinutes(ts) {
  const { date, heure: h } = decouper(ts);
  return jourDepuisEpoque(date) * 1440 + minutes(h);
}

/** Minutes absolues -> horodatage "AAAA-MM-JJ HH:MM". */
export function minutesEnHorodatage(total) {
  const jours = Math.floor(total / 1440);
  const reste = total - jours * 1440;
  return horodatage(dateDepuisJour(jours), heure(reste));
}

/** Décale un horodatage d'un nombre de minutes (positif ou négatif). */
export function decaler(ts, deltaMinutes) {
  return minutesEnHorodatage(horodatageEnMinutes(ts) + deltaMinutes);
}

/** "2026-08-21 08:15" -> "21/08/2026 08:15" */
export function horodatageEnFrancais(ts) {
  const { date, heure: h } = decouper(ts);
  return `${dateEnFrancais(date)} ${h}`;
}

// ---------------------------------------------------------------------------
// Jours fériés français
// ---------------------------------------------------------------------------

/** Dimanche de Pâques d'une année (algorithme grégorien anonyme). */
export function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Jours fériés légaux français d'une année, sous forme { "AAAA-MM-JJ": "nom" }.
 * @param {number} annee
 * @param {boolean} alsaceMoselle  ajoute le Vendredi saint et le 26 décembre
 */
export function joursFeries(annee, alsaceMoselle = false) {
  const p = paques(annee);
  const feries = {
    [`${annee}-01-01`]: 'Jour de l’an',
    [`${annee}-05-01`]: 'Fête du Travail',
    [`${annee}-05-08`]: 'Victoire 1945',
    [`${annee}-07-14`]: 'Fête nationale',
    [`${annee}-08-15`]: 'Assomption',
    [`${annee}-11-01`]: 'Toussaint',
    [`${annee}-11-11`]: 'Armistice 1918',
    [`${annee}-12-25`]: 'Noël',
    [ajouterJours(p, 1)]: 'Lundi de Pâques',
    [ajouterJours(p, 39)]: 'Ascension',
    [ajouterJours(p, 50)]: 'Lundi de Pentecôte',
  };
  if (alsaceMoselle) {
    feries[ajouterJours(p, -2)] = 'Vendredi saint';
    feries[`${annee}-12-26`] = 'Saint-Étienne';
  }
  return feries;
}

/** Nom du jour férié, ou null. */
export function nomJourFerie(date, options = {}) {
  const annee = Number(date.slice(0, 4));
  const feries = joursFeries(annee, options.alsaceMoselle === true);
  if (feries[date]) return feries[date];
  // Fermetures exceptionnelles saisies dans les paramètres du logiciel.
  const exceptionnels = options.fermeturesExceptionnelles || {};
  return exceptionnels[date] || null;
}

export function estFerie(date, options = {}) {
  return nomJourFerie(date, options) !== null;
}

// ---------------------------------------------------------------------------
// Horaires d'ouverture et créneaux
// ---------------------------------------------------------------------------

/**
 * Horaires par défaut du cabinet, confirmés par le secrétariat.
 * Chaque jour ouvert comporte une ou plusieurs PLAGES de rendez-vous
 * (matin, après-midi) ; `debut` et `fin` sont inclusifs : `fin` est l'heure
 * du DERNIER créneau de la plage. `null` = jour de fermeture.
 *
 * `finPosePolygraphie` prolonge la plage de l'après-midi UNIQUEMENT pour les
 * poses de polygraphie ventilatoire (elles se posent en fin de journée et se
 * déposent le lendemain matin, après une seule nuit d'enregistrement).
 */
export const HORAIRES_PAR_DEFAUT = {
  0: null, // dimanche
  1: { plages: [{ debut: '08:45', fin: '11:30' }, { debut: '14:00', fin: '16:30' }], finPosePolygraphie: '17:15' },
  2: { plages: [{ debut: '08:45', fin: '11:30' }, { debut: '14:00', fin: '16:30' }], finPosePolygraphie: '17:15' },
  3: { plages: [{ debut: '08:45', fin: '11:30' }, { debut: '14:00', fin: '16:30' }], finPosePolygraphie: '17:15' },
  4: { plages: [{ debut: '08:45', fin: '11:30' }, { debut: '14:00', fin: '16:30' }], finPosePolygraphie: '17:15' },
  5: { plages: [{ debut: '08:45', fin: '11:30' }, { debut: '14:00', fin: '16:00' }], finPosePolygraphie: '16:45' },
  6: { plages: [{ debut: '08:30', fin: '11:45' }] }, // samedi : matin seul, pas de pose de polygraphie
};

export const PAS_CRENEAU_MINUTES = 15;

/**
 * Accepte l'ancien format d'horaires `{ debut, fin }` (une seule plage
 * continue, encore présent dans d'anciens réglages enregistrés) et le
 * nouveau `{ plages: [...] }`. Renvoie toujours le nouveau format, ou null.
 */
export function normaliserHoraires(h) {
  if (!h) return null;
  if (Array.isArray(h.plages)) return h.plages.length ? h : null;
  if (h.debut && h.fin) return { plages: [{ debut: h.debut, fin: h.fin }] };
  return null;
}

/** Horaires applicables à une date, ou null si le cabinet est fermé. */
export function horairesDuJour(date, parametres = {}) {
  if (estFerie(date, parametres)) return null;
  const horaires = parametres.horaires || HORAIRES_PAR_DEFAUT;
  return normaliserHoraires(horaires[jourSemaine(date)]);
}

export function estJourOuvre(date, parametres = {}) {
  return horairesDuJour(date, parametres) !== null;
}

/** Plages d'ouverture d'une date : [{ debut, fin }]. Tableau vide si fermé. */
export function plagesDuJour(date, parametres = {}) {
  const h = horairesDuJour(date, parametres);
  return h ? h.plages : [];
}

/** Créneaux "HH:MM" espacés de `pas` minutes entre deux heures INCLUSES. */
export function listeCreneaux(debut, fin, pas = PAS_CRENEAU_MINUTES) {
  const liste = [];
  for (let m = minutes(debut); m <= minutes(fin); m += pas) liste.push(heure(m));
  return liste;
}

/** Liste des créneaux ("HH:MM") d'une journée, toutes plages confondues. */
export function creneauxDuJour(date, parametres = {}) {
  const pas = parametres.pasCreneauMinutes || PAS_CRENEAU_MINUTES;
  return plagesDuJour(date, parametres).flatMap((p) => listeCreneaux(p.debut, p.fin, pas));
}

/** Vrai si `heureTexte` est un créneau valide de la journée `date`. */
export function estCreneauValide(date, heureTexte, parametres = {}) {
  return creneauxDuJour(date, parametres).includes(heureTexte);
}

/** Jour ouvré précédent (le samedi est la veille du lundi). */
export function jourOuvrePrecedent(date, parametres = {}) {
  let d = ajouterJours(date, -1);
  for (let i = 0; i < 60; i++) {
    if (estJourOuvre(d, parametres)) return d;
    d = ajouterJours(d, -1);
  }
  return null;
}

/** Jour ouvré suivant. */
export function jourOuvreSuivant(date, parametres = {}) {
  let d = ajouterJours(date, 1);
  for (let i = 0; i < 60; i++) {
    if (estJourOuvre(d, parametres)) return d;
    d = ajouterJours(d, 1);
  }
  return null;
}

/** Recule de `nb` jours ouvrés (nb=1 -> veille ouvrée). */
export function reculerJoursOuvres(date, nb, parametres = {}) {
  let d = date;
  for (let i = 0; i < nb; i++) {
    d = jourOuvrePrecedent(d, parametres);
    if (!d) return null;
  }
  return d;
}

/** Liste des jours ouvrés entre deux dates incluses. */
export function joursOuvresEntre(debut, fin, parametres = {}) {
  const liste = [];
  for (let d = debut; ecartJours(d, fin) >= 0; d = ajouterJours(d, 1)) {
    if (estJourOuvre(d, parametres)) liste.push(d);
  }
  return liste;
}
