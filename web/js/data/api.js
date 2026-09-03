/**
 * api.js — Tout le dialogue avec la base de données Supabase.
 *
 * Le reste du logiciel ne parle jamais directement à la base : il passe
 * toujours par ce fichier. Si un jour l'hébergement change, seul ce fichier
 * est à réécrire.
 */

import { CONFIG } from '../../config.js';

/* Le client Supabase est chargé par la balise <script> de index.html
   (fichier vendor/supabase.js), ce qui évite toute étape de compilation. */
const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export { client };

// ---------------------------------------------------------------------------
// Conversion des horodatages
// PostgreSQL renvoie « 2026-08-24T09:30:00 », le logiciel utilise
// « 2026-08-24 09:30 ». Ces deux fonctions font le pont.
// ---------------------------------------------------------------------------

export function depuisSql(valeur) {
  if (!valeur) return null;
  return String(valeur).replace('T', ' ').slice(0, 16);
}

export function versSql(horodatage) {
  if (!horodatage) return null;
  return `${horodatage}:00`;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export async function seConnecter(email, motDePasse) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw traduireErreur(error);
  return data;
}

export async function seDeconnecter() {
  await client.auth.signOut();
}

export async function sessionCourante() {
  const { data } = await client.auth.getSession();
  return data.session;
}

export function surChangementDeSession(rappel) {
  return client.auth.onAuthStateChange((evenement, session) => rappel(evenement, session));
}

/** Profil de l'utilisateur connecté (nom, rôle, actif). */
export async function monProfil() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from('profils')
    .select('id, nom, role, actif')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw traduireErreur(error);
  return data ? { ...data, email: user.email } : { id: user.id, email: user.email, nom: user.email, role: 'secretaire', actif: false };
}

// ---------------------------------------------------------------------------
// Lecture des données
// ---------------------------------------------------------------------------

export async function chargerAppareils() {
  const { data, error } = await client
    .from('appareils')
    .select('*')
    .order('ordre', { ascending: true });
  if (error) throw traduireErreur(error);
  return data;
}

export async function chargerParametres() {
  const { data, error } = await client.from('parametres').select('cle, valeur');
  if (error) throw traduireErreur(error);
  const resultat = {};
  for (const ligne of data) resultat[ligne.cle] = ligne.valeur;
  return resultat;
}

/**
 * Charge toutes les poses (et le rendez-vous associé) d'une fenêtre de dates.
 * Une seule requête : c'est ce qui rend l'interface instantanée ensuite.
 */
export async function chargerPoses(dateDebut, dateFin) {
  const { data, error } = await client
    .from('poses')
    .select(`
      id, rdv_id, appareil_id, duree_heures, marque_demandee,
      debut, fin, retour_effectif, statut,
      rendez_vous ( id, patient_nom, patient_sexe, cardiologue,
                    rdv_cardio, telephone, commentaire, statut, cree_par_nom, cree_le )
    `)
    .gte('debut', `${dateDebut} 00:00:00`)
    .lte('debut', `${dateFin} 23:59:59`)
    .order('debut', { ascending: true });
  if (error) throw traduireErreur(error);

  return data.map((p) => ({
    ...p,
    debut: depuisSql(p.debut),
    fin: depuisSql(p.fin),
    retour_effectif: depuisSql(p.retour_effectif),
    rdv: p.rendez_vous ? { ...p.rendez_vous, rdv_cardio: depuisSql(p.rendez_vous.rdv_cardio) } : null,
  }));
}

/** Recherche d'un patient par nom, prénom ou cardiologue. */
export async function rechercherRendezVous(texte) {
  const motif = `%${texte.trim()}%`;
  const { data, error } = await client
    .from('rendez_vous')
    .select(`
      id, patient_nom, patient_sexe, cardiologue, rdv_cardio,
      telephone, commentaire, statut, motif_annulation, cree_par_nom, cree_le,
      poses ( id, appareil_id, debut, fin, statut, duree_heures, marque_demandee, retour_effectif )
    `)
    .ilike('patient_nom', motif)
    .order('rdv_cardio', { ascending: false })
    .limit(80);
  if (error) throw traduireErreur(error);

  return data.map((r) => ({
    ...r,
    rdv_cardio: depuisSql(r.rdv_cardio),
    poses: (r.poses || []).map((p) => ({
      ...p,
      debut: depuisSql(p.debut),
      fin: depuisSql(p.fin),
      retour_effectif: depuisSql(p.retour_effectif),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Écritures (toutes passent par des fonctions de la base, qui vérifient
// les règles et empêchent les conflits entre secrétaires)
// ---------------------------------------------------------------------------

export async function reserverRendezVous(rdv, lignes) {
  const { data, error } = await client.rpc('reserver_rendez_vous', {
    p_rdv: {
      patient_nom: rdv.patient_nom,
      patient_sexe: rdv.patient_sexe,
      cardiologue: rdv.cardiologue,
      rdv_cardio: versSql(rdv.rdv_cardio),
      telephone: rdv.telephone || null,
      commentaire: rdv.commentaire || null,
    },
    p_lignes: lignes.map((l) => ({
      appareil_id: l.appareil_id,
      duree_heures: l.duree_heures,
      marque_demandee: l.marque_demandee || null,
      debut: versSql(l.debut),
      fin: versSql(l.fin),
    })),
  });
  if (error) throw traduireErreur(error);
  return data;
}

/**
 * Déplace ou modifie un rendez-vous existant : nouvelle date/heure de
 * rendez-vous cardiologue et nouvelle liste de matériels à poser. Les
 * anciennes poses prévues sont annulées et remplacées, en une seule
 * opération. Si du matériel est déjà posé sur le patient, `nouvelleDepose`
 * déplace sa dépose sans toucher à l'appareil ni à la pose.
 */
export async function deplacerRendezVous(id, rdvCardio, lignes, nouvelleDepose = null) {
  const { data, error } = await client.rpc('deplacer_rendez_vous', {
    p_rdv_id: id,
    p_rdv_cardio: versSql(rdvCardio),
    p_lignes: lignes.map((l) => ({
      appareil_id: l.appareil_id,
      duree_heures: l.duree_heures,
      marque_demandee: l.marque_demandee || null,
      debut: versSql(l.debut),
      fin: versSql(l.fin),
    })),
    p_nouvelle_depose: nouvelleDepose ? versSql(nouvelleDepose) : null,
  });
  if (error) throw traduireErreur(error);
  return data;
}

export async function annulerRendezVous(id, motif) {
  const { error } = await client.rpc('annuler_rendez_vous', { p_rdv_id: id, p_motif: motif || null });
  if (error) throw traduireErreur(error);
}

export async function enregistrerPose(poseId) {
  const { error } = await client.rpc('enregistrer_pose', { p_pose_id: poseId });
  if (error) throw traduireErreur(error);
}

export async function enregistrerRetour(poseId, horodatage = null) {
  const { error } = await client.rpc('enregistrer_retour', {
    p_pose_id: poseId,
    p_horodatage: horodatage ? versSql(horodatage) : null,
  });
  if (error) throw traduireErreur(error);
}

export async function changerAppareil(poseId, appareilId) {
  const { error } = await client.rpc('changer_appareil', {
    p_pose_id: poseId, p_appareil_id: appareilId,
  });
  if (error) throw traduireErreur(error);
}

export async function posesFutures(appareilId) {
  const { data, error } = await client.rpc('appareil_poses_futures', { p_appareil_id: appareilId });
  if (error) throw traduireErreur(error);
  return (data || []).map((p) => ({ ...p, debut: depuisSql(p.debut), fin: depuisSql(p.fin) }));
}

export async function retirerAppareil(appareilId, forcer = false) {
  const { data, error } = await client.rpc('retirer_appareil', {
    p_appareil_id: appareilId, p_forcer: forcer,
  });
  if (error) throw traduireErreur(error);
  return data;
}

export async function ajouterAppareil(appareil) {
  const { data, error } = await client.from('appareils').insert(appareil).select().single();
  if (error) throw traduireErreur(error);
  return data;
}

export async function modifierAppareil(id, champs) {
  const { error } = await client.from('appareils').update(champs).eq('id', id);
  if (error) throw traduireErreur(error);
}

export async function enregistrerParametre(cle, valeur) {
  const { error } = await client
    .from('parametres')
    .upsert({ cle, valeur, modifie_le: new Date().toISOString() }, { onConflict: 'cle' });
  if (error) throw traduireErreur(error);
}

export async function statistiques(annee) {
  const { data, error } = await client.rpc('statistiques', { p_annee: annee });
  if (error) throw traduireErreur(error);
  return data;
}

export async function listerProfils() {
  const { data, error } = await client
    .from('profils')
    .select('id, nom, role, actif, cree_le')
    .order('nom');
  if (error) throw traduireErreur(error);
  return data;
}

export async function modifierProfil(id, champs) {
  const { error } = await client.from('profils').update(champs).eq('id', id);
  if (error) throw traduireErreur(error);
}

// ---------------------------------------------------------------------------
// Temps réel : les modifications d'une secrétaire arrivent chez les autres
// ---------------------------------------------------------------------------

let canal = null;

/**
 * @param {Function} surChangement  appelée à chaque modification distante
 * @param {Function} surEtat        appelée avec true/false selon la liaison
 */
export function ecouterModifications(surChangement, surEtat) {
  if (canal) client.removeChannel(canal);

  canal = client
    .channel('planning-holter')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poses' }, surChangement)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rendez_vous' }, surChangement)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appareils' }, surChangement)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parametres' }, surChangement)
    .subscribe((statut) => {
      if (surEtat) surEtat(statut === 'SUBSCRIBED');
    });

  return canal;
}

export function arreterEcoute() {
  if (canal) {
    client.removeChannel(canal);
    canal = null;
  }
}

// ---------------------------------------------------------------------------
// Messages d'erreur compréhensibles
// ---------------------------------------------------------------------------

const TRADUCTIONS = [
  [/CONFLIT_APPAREIL/, 'Une autre secrétaire vient de réserver ce matériel. '
    + 'La proposition va être recalculée automatiquement.'],
  [/CRENEAU_COMPLET: (.*)/, null],
  [/SUPPRESSION_IMPOSSIBLE: (.*)/, null],
  [/DEPOSE_TROP_TARD/, 'La dépose doit avoir lieu avant le rendez-vous avec le cardiologue.'],
  [/HORAIRE_INVALIDE/, 'L’horaire choisi ne correspond pas aux plages d’ouverture du cabinet.'],
  [/JOUR_FERME/, 'Le cabinet est fermé ce jour-là.'],
  [/APPAREIL_INACTIF/, 'Cet appareil ne fait plus partie du parc.'],
  [/RDV_INTROUVABLE/, 'Ce rendez-vous n’existe plus. Actualisez la recherche.'],
  [/RDV_ANNULE/, 'Ce rendez-vous a été annulé : il ne peut plus être déplacé.'],
  [/MATERIEL_DEJA_POSE/, 'Le matériel de ce rendez-vous est déjà posé (ou rendu) : '
    + 'le rendez-vous ne peut plus être déplacé.'],
  [/DEPOSE_TROP_TOT/, 'La nouvelle dépose précéderait la pose du matériel : '
    + 'choisissez un rendez-vous plus tardif.'],
  [/ACCES_REFUSE/, 'Votre compte n’est pas autorisé à effectuer cette action. '
    + 'Contactez votre administrateur.'],
  [/AUCUN_MATERIEL/, 'Sélectionnez au moins un matériel à poser.'],
  [/NOM_MANQUANT/, 'Le nom de famille du patient est obligatoire.'],
  [/SEXE_MANQUANT/, 'Indiquez le sexe du patient.'],
  [/Invalid login credentials/i, 'Adresse e-mail ou mot de passe incorrect.'],
  [/Email not confirmed/i, 'Ce compte n’a pas encore été confirmé.'],
  [/duplicate key|appareils_code_unique/i, 'Un appareil porte déjà ce code pour ce type de matériel.'],
  [/Failed to fetch|NetworkError/i, 'Connexion au serveur impossible. Vérifiez votre accès à Internet.'],
];

/** Transforme une erreur technique en phrase compréhensible par une secrétaire. */
export function traduireErreur(erreur) {
  const brut = erreur?.message || String(erreur);
  for (const [motif, remplacement] of TRADUCTIONS) {
    const trouve = motif.exec(brut);
    if (trouve) {
      const message = remplacement || trouve[1] || brut;
      const e = new Error(message);
      e.code = brut.split(':')[0];
      e.original = brut;
      return e;
    }
  }
  const e = new Error(brut);
  e.original = brut;
  return e;
}
