/**
 * materiel.js — Catégories de matériel, couleurs, durées de port
 * et inventaire initial du cabinet.
 */

/**
 * Catégories de matériel.
 * `couleur`      : couleur principale (pastilles, traits du calendrier)
 * `fond`         : fond clair des cartes du planning
 * `dureesHeures` : durées de port proposées à la prise de rendez-vous
 */
export const CATEGORIES = {
  holter_ecg: {
    code: 'holter_ecg',
    libelle: 'Holter ECG',
    couleur: '#1d4ed8',
    fond: '#dbeafe',
    dureesHeures: [24, 48, 72],
    dureeParDefaut: 24,
    marques: ['ELA', 'DMS'],
  },
  mapa: {
    code: 'mapa',
    libelle: 'MAPA',
    couleur: '#dc2626',
    fond: '#fee2e2',
    dureesHeures: [24],
    dureeParDefaut: 24,
    marques: [],
  },
  polygraphie: {
    code: 'polygraphie',
    libelle: 'Polygraphie ventilatoire',
    couleur: '#15803d',
    fond: '#dcfce7',
    dureesHeures: [24],
    dureeParDefaut: 24,
    marques: [],
  },
  spider: {
    code: 'spider',
    libelle: 'Spider Flash',
    couleur: '#c2410c',
    fond: '#ffedd5',
    dureesHeures: [168],
    dureeParDefaut: 168,
    marques: [],
  },
  autre: {
    code: 'autre',
    libelle: 'Autre',
    couleur: '#475569',
    fond: '#e2e8f0',
    dureesHeures: [24, 48, 72, 168],
    dureeParDefaut: 24,
    marques: [],
  },
};

/**
 * Nuances par marque : le cahier des charges demande deux nuances d'une même
 * couleur pour distinguer les Holter ECG DMS des Holter ECG ELA.
 */
export const NUANCES_MARQUE = {
  'holter_ecg|DMS': { couleur: '#1e3a8a', fond: '#dbeafe' }, // bleu profond
  'holter_ecg|ELA': { couleur: '#3b82f6', fond: '#e0f2fe' }, // bleu clair
};

/** Couleurs d'affichage d'un appareil (catégorie + éventuelle nuance marque). */
export function couleursAppareil(appareil) {
  const nuance = NUANCES_MARQUE[`${appareil.categorie}|${appareil.marque}`];
  const base = CATEGORIES[appareil.categorie] || CATEGORIES.autre;
  return {
    couleur: (nuance && nuance.couleur) || base.couleur,
    fond: (nuance && nuance.fond) || base.fond,
  };
}

/** Libellé complet : "Holter ECG DMS n° 7", "MAPA A", "Polygraphie N1"… */
export function libelleAppareil(appareil) {
  const base = CATEGORIES[appareil.categorie] || CATEGORIES.autre;
  if (appareil.categorie === 'holter_ecg') {
    return `Holter ECG ${appareil.marque || ''} ${appareil.code}`.replace(/\s+/g, ' ').trim();
  }
  if (appareil.categorie === 'spider') return `Spider Flash ${appareil.code}`.trim();
  return `${base.libelle} ${appareil.code}`.trim();
}

/** Libellé court utilisé dans les listes denses du planning. */
export function libelleCourt(appareil) {
  if (appareil.categorie === 'holter_ecg') return `${appareil.marque || ''} ${appareil.code}`.trim();
  return appareil.code;
}

/** Durées de port autorisées pour une catégorie. */
export function dureesAutorisees(categorie) {
  return (CATEGORIES[categorie] || CATEGORIES.autre).dureesHeures;
}

export function dureeParDefaut(categorie) {
  return (CATEGORIES[categorie] || CATEGORIES.autre).dureeParDefaut;
}

/** Durée lisible : 24 -> "24 h", 168 -> "7 jours". */
export function dureeLisible(heures) {
  if (heures % 24 === 0 && heures >= 48) {
    const jours = heures / 24;
    return jours >= 7 ? `${jours} jours` : `${heures} h`;
  }
  return `${heures} h`;
}

/**
 * Inventaire du cabinet, confirmé par le secrétariat :
 *   - Holter ECG ELA : 51 à 59, plus 501 et 502 réservés aux urgences (11) ;
 *   - Holter ECG DMS : 1 à 13, plus 101 réservé aux urgences (14) ;
 *   - MAPA : A à N sans le L, plus Y réservé aux urgences (14) ;
 *   - 1 Spider Flash et 3 polygraphes.
 * Tout reste modifiable dans l'onglet Paramètres, sans toucher au code.
 */
export const INVENTAIRE_INITIAL = [
  // --- Holter ECG ELA : 51 à 59 + 501 et 502 réservés aux urgences (11) ---
  ...['51', '52', '53', '54', '55', '56', '57', '58', '59'].map((code, i) => ({
    code, categorie: 'holter_ecg', marque: 'ELA', urgence: false, ordre: 100 + i,
  })),
  { code: '501', categorie: 'holter_ecg', marque: 'ELA', urgence: true, ordre: 120 },
  { code: '502', categorie: 'holter_ecg', marque: 'ELA', urgence: true, ordre: 121 },

  // --- Holter ECG DMS : 1 à 13 + 101 réservé aux urgences (14) ---
  ...Array.from({ length: 13 }, (_, i) => ({
    code: String(i + 1), categorie: 'holter_ecg', marque: 'DMS', urgence: false, ordre: 200 + i,
  })),
  { code: '101', categorie: 'holter_ecg', marque: 'DMS', urgence: true, ordre: 220 },

  // --- MAPA : A à N sans le L + Y réservé aux urgences (14) ---
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'N'].map((code, i) => ({
    code, categorie: 'mapa', marque: null, urgence: false, ordre: 300 + i,
  })),
  { code: 'Y', categorie: 'mapa', marque: null, urgence: true, ordre: 320 },

  // --- Spider Flash ---
  { code: 'SF1', categorie: 'spider', marque: null, urgence: false, ordre: 400 },

  // --- Polygraphies ventilatoires ---
  { code: 'N1', categorie: 'polygraphie', marque: null, urgence: false, ordre: 500 },
  { code: 'N2', categorie: 'polygraphie', marque: null, urgence: false, ordre: 501 },
  { code: 'N3', categorie: 'polygraphie', marque: null, urgence: false, ordre: 502 },
];

/** Initiales des cardiologues demandeurs. */
export const CARDIOLOGUES = ['MA', 'PL', 'RG', 'DC', 'AZ', 'LM', 'KS', 'GB', 'RB'];
