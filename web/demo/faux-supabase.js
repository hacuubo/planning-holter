/**
 * faux-supabase.js — Base de données FICTIVE, uniquement pour la démonstration.
 *
 * Ce fichier imite le comportement de Supabase en mémoire, sans réseau et sans
 * données réelles. Il sert :
 *   • à essayer l'interface avant d'avoir créé le compte Supabase ;
 *   • à vérifier automatiquement le bon fonctionnement du logiciel.
 *
 * Il n'est JAMAIS chargé par index.html : la vraie application ne s'en sert pas.
 */

import { INVENTAIRE_INITIAL } from '../js/core/materiel.js';
import { HORAIRES_PAR_DEFAUT } from '../js/core/dates.js';
import { ajouterJours, aujourdHui, horodatage } from '../js/core/dates.js';
import { planifier } from '../js/core/regles.js';

// ---------------------------------------------------------------------------
// Contenu initial
// ---------------------------------------------------------------------------

const NOMS = ['MARTIN', 'BERNARD', 'THOMAS', 'PETIT', 'ROBERT', 'RICHARD', 'DURAND',
  'DUBOIS', 'MOREAU', 'LAURENT', 'SIMON', 'MICHEL', 'LEFEBVRE', 'LEROY', 'ROUX',
  'DAVID', 'BERTRAND', 'MOREL', 'FOURNIER', 'GIRARD'];
const CARDIOS = ['MA', 'PL', 'RG', 'DC', 'AZ', 'LM', 'KS', 'GB', 'RB'];

let compteur = 0;
const identifiant = (prefixe) => `${prefixe}-${String(++compteur).padStart(4, '0')}`;

const base = {
  profils: [
    { id: 'utilisateur-demo', nom: 'Secrétaire (démonstration)', role: 'admin', actif: true, cree_le: '2026-01-01' },
    { id: 'utilisateur-2', nom: 'Marie (secrétaire)', role: 'secretaire', actif: true, cree_le: '2026-01-02' },
    { id: 'utilisateur-3', nom: 'Nouveau compte', role: 'secretaire', actif: false, cree_le: '2026-02-10' },
  ],
  appareils: INVENTAIRE_INITIAL.map((a) => ({ ...a, id: identifiant('app'), actif: true })),
  rendez_vous: [],
  poses: [],
  parametres: [
    {
      cle: 'planification',
      valeur: {
        minutesAvantRdvCardio: 15,
        posesParCreneau: 1,
        toleranceDureeMinutes: 60,
        delaiReconditionnementMinutes: 0,
        fenetreRechercheJours: 5,
        alsaceMoselle: false,
        fermeturesExceptionnelles: {},
      },
    },
    { cle: 'horaires', valeur: HORAIRES_PAR_DEFAUT },
    { cle: 'cardiologues', valeur: CARDIOS },
    { cle: 'sauvegarde', valeur: { destinataires: ['secretariat@exemple.fr'], frequence: 'quotidien', joursConservation: 7 } },
    { cle: 'cabinet', valeur: { nom: 'Cabinet de démonstration', version: '1.1.0' } },
  ],
};

/** Génère un planning crédible sur les trois prochaines semaines. */
function remplirPlanningDeDemonstration() {
  const parametres = base.parametres[0].valeur;
  const demandes = [
    [{ categorie: 'holter_ecg', marque: 'DMS', dureeHeures: 24 }],
    [{ categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 }],
    [{ categorie: 'holter_ecg', marque: 'indifferent', dureeHeures: 48 }],
    [{ categorie: 'mapa', dureeHeures: 24 }],
    [{ categorie: 'mapa', dureeHeures: 24 }, { categorie: 'holter_ecg', marque: 'DMS', dureeHeures: 24 }],
    [{ categorie: 'polygraphie', dureeHeures: 24 }],
    [{ categorie: 'spider', dureeHeures: 168 }],
  ];
  const heures = ['09:15', '10:00', '10:45', '11:30', '14:30', '15:15', '16:00', '16:45'];

  let graine = 7;
  const tirage = (max) => {
    graine = (graine * 9301 + 49297) % 233280;
    return Math.floor((graine / 233280) * max);
  };

  for (let jour = -3; jour <= 18; jour++) {
    const date = ajouterJours(aujourdHui(), jour);
    const nb = 3 + tirage(4);
    for (let i = 0; i < nb; i++) {
      const materiels = demandes[tirage(demandes.length)];
      const rdvCardio = horodatage(date, heures[tirage(heures.length)]);
      const plan = planifier({
        rdvCardio,
        materiels,
        appareils: base.appareils,
        poses: base.poses,
        parametres,
      });
      if (!plan.possible) continue;

      const rdv = {
        id: identifiant('rdv'),
        patient_nom: NOMS[tirage(NOMS.length)],
        patient_sexe: tirage(2) === 0 ? 'F' : 'M',
        cardiologue: CARDIOS[tirage(CARDIOS.length)],
        rdv_cardio: `${rdvCardio}:00`,
        telephone: null,
        commentaire: null,
        statut: 'prevu',
        cree_par_nom: 'Données de démonstration',
        cree_le: new Date().toISOString(),
      };
      base.rendez_vous.push(rdv);

      for (const ligne of plan.lignes) {
        base.poses.push({
          id: identifiant('pose'),
          rdv_id: rdv.id,
          appareil_id: ligne.appareil.id,
          duree_heures: ligne.demande.dureeHeures,
          marque_demandee: ligne.demande.marque || null,
          debut: `${ligne.pose}:00`,
          fin: `${ligne.depose}:00`,
          retour_effectif: null,
          statut: jour < 0 ? 'rendu' : 'prevu',
        });
      }
    }
  }
}
remplirPlanningDeDemonstration();

// ---------------------------------------------------------------------------
// Imitation du client Supabase
// ---------------------------------------------------------------------------

const abonnes = [];
function diffuser() {
  for (const rappel of abonnes) rappel({ eventType: 'UPDATE' });
}

const reponse = (data, error = null) => Promise.resolve({ data, error });
const echec = (message) => Promise.resolve({ data: null, error: new Error(message) });

/** Constructeur de requête minimal, suffisant pour les besoins du logiciel. */
function requete(nomTable) {
  const filtres = [];
  let tri = null;
  let limite = null;
  let mode = 'liste';
  let colonnes = '*';

  const executer = () => {
    let lignes = [...(base[nomTable] || [])];
    for (const f of filtres) lignes = lignes.filter(f);
    if (tri) {
      lignes.sort((a, b) => {
        const va = a[tri.colonne]; const vb = b[tri.colonne];
        const c = va == null ? -1 : (vb == null ? 1 : String(va).localeCompare(String(vb), undefined, { numeric: true }));
        return tri.croissant ? c : -c;
      });
    }
    if (limite) lignes = lignes.slice(0, limite);
    lignes = lignes.map((l) => joindre(nomTable, l, colonnes));

    if (mode === 'unique') {
      if (lignes.length === 0) return echec('Aucune ligne trouvée');
      return reponse(lignes[0]);
    }
    if (mode === 'peutEtreUnique') return reponse(lignes[0] || null);
    return reponse(lignes);
  };

  const constructeur = {
    select(c) { if (typeof c === 'string') colonnes = c; return constructeur; },
    eq(colonne, valeur) { filtres.push((l) => String(l[colonne]) === String(valeur)); return constructeur; },
    gte(colonne, valeur) { filtres.push((l) => String(l[colonne]) >= String(valeur)); return constructeur; },
    lte(colonne, valeur) { filtres.push((l) => String(l[colonne]) <= String(valeur)); return constructeur; },
    ilike(colonne, motif) {
      const recherche = motif.replace(/%/g, '').toLowerCase();
      filtres.push((l) => String(l[colonne] || '').toLowerCase().includes(recherche));
      return constructeur;
    },
    or(expression) {
      // Forme utilisée : "patient_nom.ilike.%x%"
      const conditions = expression.split(',').map((c) => {
        const [colonne, , motif] = c.split('.');
        return { colonne, motif: motif.replace(/%/g, '').toLowerCase() };
      });
      filtres.push((l) => conditions.some((c) => String(l[c.colonne] || '').toLowerCase().includes(c.motif)));
      return constructeur;
    },
    order(colonne, options = {}) { tri = { colonne, croissant: options.ascending !== false }; return constructeur; },
    limit(n) { limite = n; return constructeur; },
    single() { mode = 'unique'; return constructeur; },
    maybeSingle() { mode = 'peutEtreUnique'; return constructeur; },

    insert(valeurs) {
      const liste = Array.isArray(valeurs) ? valeurs : [valeurs];
      const ajoutees = liste.map((v) => {
        const ligne = { id: identifiant(nomTable.slice(0, 3)), ...v };
        base[nomTable].push(ligne);
        return ligne;
      });
      diffuser();
      return {
        select: () => ({
          single: () => reponse(ajoutees[0]),
          then: (r) => reponse(ajoutees).then(r),
        }),
        then: (r) => reponse(ajoutees).then(r),
      };
    },

    update(champs) {
      return {
        eq(colonne, valeur) {
          for (const ligne of base[nomTable]) {
            if (String(ligne[colonne]) === String(valeur)) Object.assign(ligne, champs);
          }
          diffuser();
          return reponse(null);
        },
      };
    },

    upsert(valeurs) {
      const liste = Array.isArray(valeurs) ? valeurs : [valeurs];
      for (const v of liste) {
        const existante = base[nomTable].find((l) => l.cle === v.cle);
        if (existante) Object.assign(existante, v);
        else base[nomTable].push(v);
      }
      diffuser();
      return reponse(liste);
    },

    then(resoudre, rejeter) { return executer().then(resoudre, rejeter); },
  };
  return constructeur;
}

/** Reproduit les jointures « table(colonnes) » utilisées par le logiciel. */
function joindre(nomTable, ligne, colonnes) {
  const copie = { ...ligne };
  if (nomTable === 'poses' && colonnes.includes('rendez_vous')) {
    copie.rendez_vous = base.rendez_vous.find((r) => r.id === ligne.rdv_id) || null;
  }
  if (nomTable === 'rendez_vous' && colonnes.includes('poses')) {
    copie.poses = base.poses.filter((p) => p.rdv_id === ligne.id);
  }
  return copie;
}

// ---------------------------------------------------------------------------
// Fonctions serveur imitées
// ---------------------------------------------------------------------------

function chevauchement(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

/**
 * Contrôles communs à la réservation et au déplacement, identiques à ceux
 * de la vraie base : conflit d'appareil et charge des créneaux de POSE
 * (les déposes accueillent un nombre illimité de patients).
 */
function verifierLignes(p_lignes, rdvIgnoreId = null) {
  for (const ligne of p_lignes) {
    const conflit = base.poses.some((p) => (
      p.appareil_id === ligne.appareil_id && p.statut !== 'annule'
      && p.rdv_id !== rdvIgnoreId
      && chevauchement(ligne.debut, ligne.fin, p.debut, p.retour_effectif || p.fin)
    ));
    if (conflit) {
      throw new Error('CONFLIT_APPAREIL: une autre secrétaire vient d’attribuer ce matériel.');
    }
  }
  const max = base.parametres[0].valeur.posesParCreneau;
  for (const creneau of new Set(p_lignes.map((l) => l.debut))) {
    const patients = new Set(base.poses
      .filter((p) => p.statut !== 'annule' && p.rdv_id !== rdvIgnoreId && p.debut === creneau)
      .map((p) => p.rdv_id));
    if (patients.size + 1 > max) {
      throw new Error(`CRENEAU_COMPLET: le créneau de pose du ${creneau} est déjà pris par ${patients.size} patient(s) (maximum ${max}).`);
    }
  }
}

const fonctions = {
  reserver_rendez_vous({ p_rdv, p_lignes }) {
    // Contrôles identiques à ceux de la vraie base.
    if (!String(p_rdv.patient_nom || '').trim()) {
      throw new Error('NOM_MANQUANT: le nom de famille du patient est obligatoire.');
    }
    if (!['F', 'M'].includes(p_rdv.patient_sexe)) {
      throw new Error('SEXE_MANQUANT: indiquez le sexe du patient (F ou M).');
    }
    verifierLignes(p_lignes);

    const rdv = {
      id: identifiant('rdv'), ...p_rdv, statut: 'prevu',
      cree_par_nom: 'Secrétaire (démonstration)', cree_le: new Date().toISOString(),
    };
    base.rendez_vous.push(rdv);
    for (const ligne of p_lignes) {
      base.poses.push({
        id: identifiant('pose'), rdv_id: rdv.id, ...ligne, retour_effectif: null, statut: 'prevu',
      });
    }
    diffuser();
    return { id: rdv.id, appareils: p_lignes.length };
  },

  deplacer_rendez_vous({ p_rdv_id, p_rdv_cardio, p_lignes }) {
    const rdv = base.rendez_vous.find((r) => r.id === p_rdv_id);
    if (!rdv) throw new Error('RDV_INTROUVABLE: ce rendez-vous n’existe plus.');
    if (rdv.statut === 'annule') throw new Error('RDV_ANNULE: un rendez-vous annulé ne peut pas être déplacé.');
    if (base.poses.some((p) => p.rdv_id === p_rdv_id && ['pose', 'rendu'].includes(p.statut))) {
      throw new Error('MATERIEL_DEJA_POSE: le matériel de ce rendez-vous est déjà posé.');
    }
    if (!p_lignes.length) throw new Error('AUCUN_MATERIEL: sélectionnez au moins un matériel à poser.');

    verifierLignes(p_lignes, p_rdv_id);

    rdv.rdv_cardio = p_rdv_cardio;
    for (const p of base.poses) if (p.rdv_id === p_rdv_id && p.statut === 'prevu') p.statut = 'annule';
    for (const ligne of p_lignes) {
      base.poses.push({
        id: identifiant('pose'), rdv_id: p_rdv_id, ...ligne, retour_effectif: null, statut: 'prevu',
      });
    }
    diffuser();
    return { id: p_rdv_id, appareils: p_lignes.length };
  },

  annuler_rendez_vous({ p_rdv_id, p_motif }) {
    for (const p of base.poses) if (p.rdv_id === p_rdv_id) p.statut = 'annule';
    const rdv = base.rendez_vous.find((r) => r.id === p_rdv_id);
    if (rdv) { rdv.statut = 'annule'; rdv.motif_annulation = p_motif; }
    diffuser();
    return null;
  },

  enregistrer_pose({ p_pose_id }) {
    const pose = base.poses.find((p) => p.id === p_pose_id);
    if (pose && pose.statut === 'prevu') pose.statut = 'pose';
    diffuser();
    return null;
  },

  enregistrer_retour({ p_pose_id, p_horodatage }) {
    const pose = base.poses.find((p) => p.id === p_pose_id);
    if (pose) {
      pose.statut = 'rendu';
      pose.retour_effectif = p_horodatage || `${new Date().toISOString().slice(0, 16).replace('T', ' ')}:00`;
    }
    diffuser();
    return null;
  },

  changer_appareil({ p_pose_id, p_appareil_id }) {
    const pose = base.poses.find((p) => p.id === p_pose_id);
    const conflit = base.poses.some((p) => (
      p.id !== p_pose_id && p.appareil_id === p_appareil_id && p.statut !== 'annule'
      && chevauchement(pose.debut, pose.fin, p.debut, p.retour_effectif || p.fin)
    ));
    if (conflit) throw new Error('CONFLIT_APPAREIL: cet appareil est déjà pris sur cette période.');
    pose.appareil_id = p_appareil_id;
    diffuser();
    return null;
  },

  appareil_poses_futures({ p_appareil_id }) {
    const maintenant = `${aujourdHui()} 00:00:00`;
    return base.poses
      .filter((p) => p.appareil_id === p_appareil_id && ['prevu', 'pose'].includes(p.statut) && p.fin >= maintenant)
      .map((p) => {
        const rdv = base.rendez_vous.find((r) => r.id === p.rdv_id);
        return {
          pose_id: p.id,
          rdv_id: p.rdv_id,
          patient: (rdv?.patient_nom || '').toUpperCase(),
          cardiologue: rdv?.cardiologue,
          debut: p.debut,
          fin: p.fin,
          duree_heures: p.duree_heures,
        };
      })
      .sort((a, b) => a.debut.localeCompare(b.debut));
  },

  retirer_appareil({ p_appareil_id, p_forcer }) {
    const futures = fonctions.appareil_poses_futures({ p_appareil_id });
    if (futures.length > 0 && !p_forcer) {
      throw new Error(`SUPPRESSION_IMPOSSIBLE: ${futures.length} patient(s) doivent encore utiliser cet appareil.`);
    }
    const appareil = base.appareils.find((a) => a.id === p_appareil_id);
    if (appareil) appareil.actif = false;
    diffuser();
    return { retire: true, poses_futures: futures.length };
  },

  statistiques({ p_annee }) {
    const actives = base.poses
      .filter((p) => p.statut !== 'annule' && p.debut.startsWith(String(p_annee)))
      .map((p) => ({
        pose: p,
        rdv: base.rendez_vous.find((r) => r.id === p.rdv_id),
        appareil: base.appareils.find((a) => a.id === p.appareil_id),
      }));

    const grouper = (cle, construire) => {
      const groupes = new Map();
      for (const item of actives) {
        const k = cle(item);
        if (!groupes.has(k)) groupes.set(k, []);
        groupes.get(k).push(item);
      }
      return [...groupes.entries()].map(([k, liste]) => construire(k, liste));
    };

    return {
      annee: p_annee,
      total_examens: actives.length,
      total_patients: new Set(actives.map((a) => a.pose.rdv_id)).size,
      annulations: base.poses.filter((p) => p.statut === 'annule').length,
      par_type: grouper(
        (i) => `${i.appareil?.categorie}|${i.appareil?.marque || ''}`,
        (k, liste) => ({
          categorie: k.split('|')[0],
          marque: k.split('|')[1] || null,
          examens: liste.length,
          patients: new Set(liste.map((i) => i.pose.rdv_id)).size,
          journees_appareil: Math.round(liste.reduce((n, i) => n + i.pose.duree_heures, 0) / 24 * 10) / 10,
        }),
      ),
      par_cardiologue: grouper(
        (i) => i.rdv?.cardiologue || '?',
        (k, liste) => ({
          cardiologue: k,
          examens: liste.length,
          patients: new Set(liste.map((i) => i.pose.rdv_id)).size,
          holter_ecg: liste.filter((i) => i.appareil?.categorie === 'holter_ecg').length,
          mapa: liste.filter((i) => i.appareil?.categorie === 'mapa').length,
          polygraphie: liste.filter((i) => i.appareil?.categorie === 'polygraphie').length,
          spider: liste.filter((i) => i.appareil?.categorie === 'spider').length,
        }),
      ).sort((a, b) => b.examens - a.examens),
      par_appareil: grouper(
        (i) => i.appareil?.id,
        (k, liste) => ({
          code: liste[0].appareil?.code,
          categorie: liste[0].appareil?.categorie,
          marque: liste[0].appareil?.marque,
          examens: liste.length,
          journees: Math.round(liste.reduce((n, i) => n + i.pose.duree_heures, 0) / 24 * 10) / 10,
        }),
      ).sort((a, b) => b.examens - a.examens),
      par_mois: [],
    };
  },
};

// ---------------------------------------------------------------------------
// Client exposé
// ---------------------------------------------------------------------------

let session = null;

export function installerFausseBase() {
  window.supabase = {
    createClient() {
      return {
        auth: {
          async signInWithPassword({ email }) {
            session = { user: { id: 'utilisateur-demo', email: email || 'demonstration@exemple.fr' } };
            return { data: session, error: null };
          },
          async signOut() { session = null; return { error: null }; },
          async getSession() { return { data: { session } }; },
          async getUser() { return { data: { user: session?.user || null } }; },
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        },
        from: (table) => requete(table),
        async rpc(nom, args) {
          try {
            if (!fonctions[nom]) throw new Error(`Fonction inconnue : ${nom}`);
            return { data: fonctions[nom](args || {}), error: null };
          } catch (erreur) {
            return { data: null, error: erreur };
          }
        },
        channel() {
          const canal = {
            on(_type, _filtre, rappel) { abonnes.push(rappel); return canal; },
            subscribe(rappel) { if (rappel) setTimeout(() => rappel('SUBSCRIBED'), 10); return canal; },
          };
          return canal;
        },
        removeChannel() {},
      };
    },
  };
}

export { base };
