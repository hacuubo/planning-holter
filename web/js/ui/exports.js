/**
 * exports.js — Boutons de téléchargement Excel depuis le navigateur.
 * Le contenu du classeur est construit par js/core/classeur.js, le même code
 * que celui utilisé par la sauvegarde automatique quotidienne.
 */

import { construireClasseurSauvegarde, nomFichierSauvegarde } from '../core/classeur.js';
import { telechargerClasseur } from '../core/xlsx.js';
import { etat, parametres } from '../data/etat.js';
import { notifier, notifierErreur } from './base.js';

export function exporterJourneeExcel(date) {
  try {
    const classeur = construireClasseurSauvegarde({
      date,
      appareils: etat.appareils,
      poses: etat.poses,
      parametres: parametres(),
    });
    telechargerClasseur(classeur, nomFichierSauvegarde(date));
    notifier('Fichier Excel téléchargé.', 'succes');
  } catch (erreur) {
    notifierErreur(erreur);
  }
}
