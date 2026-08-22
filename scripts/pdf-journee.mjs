/**
 * pdf-journee.mjs — Feuille PDF des rendez-vous d'une journée,
 * celle qui est envoyée chaque jour par e-mail pour le lendemain.
 */

import {
  DIMENSIONS, ecrireDocument, ligne, nouveauDocument, nouvellePage,
  rectangle, texte, tronquer,
} from './pdf.mjs';
import {
  dateEnFrancais, dateEnFrancaisLong, decouper, estJourOuvre, nomJourFerie,
} from '../web/js/core/dates.js';
import { dureeLisible, libelleAppareil } from '../web/js/core/materiel.js';

const COULEURS = {
  texte: [0.06, 0.09, 0.16],
  doux: [0.39, 0.45, 0.55],
  trait: [0.85, 0.89, 0.94],
  entete: [0.06, 0.09, 0.16],
  holter_ecg_DMS: [0.12, 0.23, 0.54],
  holter_ecg_ELA: [0.11, 0.31, 0.85],
  mapa: [0.43, 0.16, 0.85],
  polygraphie: [0.06, 0.46, 0.43],
  spider: [0.76, 0.25, 0.05],
  autre: [0.28, 0.33, 0.41],
};

function couleurMateriel(appareil) {
  if (!appareil) return COULEURS.autre;
  if (appareil.categorie === 'holter_ecg') {
    return appareil.marque === 'ELA' ? COULEURS.holter_ecg_ELA : COULEURS.holter_ecg_DMS;
  }
  return COULEURS[appareil.categorie] || COULEURS.autre;
}

function nomPatient(rdv) {
  if (!rdv) return '—';
  // Le cabinet n'enregistre que le nom de famille et le sexe.
  return (rdv.patient_nom || '').toUpperCase().trim() || '—';
}

const COLONNES = [
  { titre: 'Heure', x: 0, largeur: 40 },
  { titre: 'Geste', x: 42, largeur: 44 },
  { titre: 'Patient', x: 90, largeur: 138 },
  { titre: 'Sexe', x: 232, largeur: 34 },
  { titre: 'Cardio', x: 270, largeur: 40 },
  { titre: 'Matériel', x: 314, largeur: 136 },
  { titre: 'Durée', x: 454, largeur: 40 },
  { titre: 'Retour prévu', x: 496, largeur: 74 },
];

/**
 * @param {object} donnees { date, poses (avec .rdv), appareils, parametres }
 * @returns {Buffer} le PDF
 */
export function construirePdfJournee({ date, poses, appareils, parametres }) {
  const parId = new Map(appareils.map((a) => [a.id, a]));

  const actes = [];
  for (const pose of poses) {
    if (pose.statut === 'annule') continue;
    const appareil = parId.get(pose.appareil_id) || null;
    if (decouper(pose.debut).date === date) {
      actes.push({ heure: decouper(pose.debut).heure, type: 'Pose', pose, appareil });
    }
    if (decouper(pose.fin).date === date) {
      actes.push({ heure: decouper(pose.fin).heure, type: 'Dépose', pose, appareil });
    }
  }
  actes.sort((a, b) => a.heure.localeCompare(b.heure)
    || nomPatient(a.pose.rdv).localeCompare(nomPatient(b.pose.rdv)));

  const document = nouveauDocument();
  const { marge, largeurUtile, hauteur } = DIMENSIONS;
  let page = nouvellePage(document);
  let y = hauteur - marge;

  const enTete = (suite = false) => {
    texte(document, `Rendez-vous du ${dateEnFrancaisLong(date)}`, {
      x: marge, y, taille: 15, gras: true, couleur: COULEURS.texte,
    });
    y -= 16;
    const ferie = nomJourFerie(date, parametres);
    const ouvert = estJourOuvre(date, parametres);
    const resume = !ouvert
      ? `Cabinet fermé${ferie ? ` — ${ferie}` : ''}`
      : `${actes.filter((a) => a.type === 'Pose').length} pose(s), `
        + `${actes.filter((a) => a.type === 'Dépose').length} dépose(s), `
        + `${new Set(actes.map((a) => a.pose.rdv_id)).size} patient(s)`;
    texte(document, suite ? `${resume} — suite` : resume, {
      x: marge, y, taille: 9, couleur: COULEURS.doux,
    });
    y -= 18;

    rectangle(document, marge, y - 4, largeurUtile, 15, COULEURS.entete);
    for (const colonne of COLONNES) {
      texte(document, colonne.titre, {
        x: marge + colonne.x + 3, y, taille: 8, gras: true, couleur: [1, 1, 1],
      });
    }
    y -= 16;
  };

  enTete();

  if (actes.length === 0) {
    texte(document, 'Aucun rendez-vous programmé ce jour.', {
      x: marge, y: y - 6, taille: 10, couleur: COULEURS.doux,
    });
  }

  let creneauPrecedent = null;
  for (const acte of actes) {
    if (y < marge + 40) {
      page = nouvellePage(document);
      y = hauteur - marge;
      enTete(true);
      creneauPrecedent = null;
    }

    // Trait de séparation entre deux quarts d'heure différents.
    if (creneauPrecedent && creneauPrecedent !== acte.heure) {
      ligne(document, marge, y + 11, marge + largeurUtile, y + 11, COULEURS.trait);
    }
    creneauPrecedent = acte.heure;

    const { pose, appareil } = acte;
    const rdv = pose.rdv;
    const couleur = acte.type === 'Pose' ? couleurMateriel(appareil) : COULEURS.doux;

    // Pastille de couleur du matériel
    rectangle(document, marge, y - 2, 2.5, 10, couleur);

    const valeurs = [
      acte.heure,
      acte.type,
      nomPatient(rdv),
      rdv?.patient_sexe || '',
      rdv?.cardiologue || '',
      appareil ? libelleAppareil(appareil) : '—',
      dureeLisible(pose.duree_heures),
      acte.type === 'Pose'
        ? `${dateEnFrancais(decouper(pose.fin).date)} ${decouper(pose.fin).heure}`
        : `RDV ${decouper(rdv?.rdv_cardio || pose.fin).heure}`,
    ];

    COLONNES.forEach((colonne, i) => {
      const taille = i === 2 ? 9 : 8;
      texte(document, tronquer(valeurs[i], taille, colonne.largeur - 4), {
        x: marge + colonne.x + 4,
        y,
        taille,
        gras: i === 0 || i === 2,
        couleur: i === 5 ? couleur : COULEURS.texte,
      });
    });

    y -= 14;
  }

  // Pied de page sur chaque page
  document.pages.forEach((p, i) => {
    document.page = p;
    texte(document,
      `Planning Holter — document produit automatiquement le ${dateEnFrancais(date)} `
      + `· page ${i + 1}/${document.pages.length}`,
      { x: marge, y: 22, taille: 7, couleur: COULEURS.doux });
  });

  return ecrireDocument(document);
}

/** Nom du fichier PDF : « rendez-vous 22-08-2026.pdf ». */
export function nomFichierPdf(date) {
  return `rendez-vous ${dateEnFrancais(date).replace(/\//g, '-')}.pdf`;
}
