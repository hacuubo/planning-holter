/**
 * config.js — LE SEUL FICHIER À REMPLIR AVANT LA MISE EN LIGNE.
 *
 * Les deux valeurs ci-dessous se trouvent dans Supabase :
 *   Project Settings  ▸  Data API  ▸  Project URL  et  Publishable / anon key
 *
 * ⚠️ Ne collez JAMAIS ici la clé « service_role » : elle donne tous les droits.
 *    La clé « anon » est prévue pour être publique — elle ne donne accès à rien
 *    sans compte utilisateur, grâce aux règles de sécurité posées dans la base.
 */
const VALEURS = {
  SUPABASE_URL: 'https://VOTRE-PROJET.supabase.co',
  SUPABASE_ANON_KEY: 'COLLEZ-ICI-LA-CLE-ANON',

  /** Nom affiché en haut de l'interface. */
  NOM_CABINET: 'Planning Holter',

  /** Version affichée dans les paramètres (mise à jour à chaque évolution). */
  VERSION: '1.0.0',
};

/* La page de démonstration (demonstration.html) fournit ses propres valeurs
   pour fonctionner sans base de données. Ne rien changer ici. */
export const CONFIG = {
  ...VALEURS,
  ...(typeof window !== 'undefined' && window.__CONFIG_PLANNING__ ? window.__CONFIG_PLANNING__ : {}),
};

/** Vrai tant que le fichier n'a pas été complété. */
export function configurationIncomplete() {
  return CONFIG.SUPABASE_URL.includes('VOTRE-PROJET')
    || CONFIG.SUPABASE_ANON_KEY.includes('COLLEZ-ICI');
}
