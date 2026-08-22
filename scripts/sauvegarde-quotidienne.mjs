/**
 * sauvegarde-quotidienne.mjs — Tâche automatique exécutée tous les matins.
 *
 * Elle :
 *   1. lit l'intégralité du planning dans la base Supabase ;
 *   2. fabrique le classeur Excel « sauvegarde holter JJ-MM-AAAA.xlsx » ;
 *   3. fabrique le PDF des rendez-vous du lendemain ;
 *   4. dépose le classeur dans l'espace de sauvegarde (le « cloud ») ;
 *   5. supprime les sauvegardes de plus de 7 jours (glissant) ;
 *   6. envoie le tout par e-mail aux adresses définies dans les réglages.
 *
 * Elle est lancée par GitHub Actions (voir .github/workflows/), mais peut
 * aussi être lancée à la main :  npm run sauvegarde
 *
 * Aucun mot de passe n'est écrit dans ce fichier : tout vient des variables
 * d'environnement (les « secrets » GitHub).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { construireClasseurSauvegarde, nomFichierSauvegarde } from '../web/js/core/classeur.js';
import { ecrireClasseur } from '../web/js/core/xlsx.js';
import { construirePdfJournee, nomFichierPdf } from './pdf-journee.mjs';
import {
  ajouterJours, aujourdHui, dateEnFrancais, dateEnFrancaisLong, estJourOuvre,
  jourSemaine, HORAIRES_PAR_DEFAUT,
} from '../web/js/core/dates.js';
import { PARAMETRES_PAR_DEFAUT } from '../web/js/core/regles.js';

const BUCKET = 'sauvegardes';
const JOURS_AVANT = 120;
const JOURS_APRES = 420;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function lireConfiguration() {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !cle) {
    throw new Error(
      'Configuration manquante : les variables SUPABASE_URL et SUPABASE_SERVICE_KEY '
      + 'doivent être définies (secrets GitHub).',
    );
  }
  return {
    url: url.replace(/\/+$/, ''),
    cle,
    smtp: {
      hote: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      utilisateur: process.env.SMTP_USER,
      motDePasse: process.env.SMTP_PASSWORD,
      expediteur: process.env.SMTP_FROM || process.env.SMTP_USER,
      securise: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    },
    dossierLocal: process.env.DOSSIER_SAUVEGARDE || 'sauvegardes',
  };
}

// ---------------------------------------------------------------------------
// Accès à la base (API REST de Supabase, sans bibliothèque)
// ---------------------------------------------------------------------------

async function interroger(config, chemin) {
  const reponse = await fetch(`${config.url}/rest/v1/${chemin}`, {
    headers: {
      apikey: config.cle,
      Authorization: `Bearer ${config.cle}`,
      Accept: 'application/json',
    },
  });
  if (!reponse.ok) {
    throw new Error(`Lecture impossible (${chemin}) : ${reponse.status} ${await reponse.text()}`);
  }
  return reponse.json();
}

const depuisSql = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : null);

async function chargerDonnees(config) {
  const debut = ajouterJours(aujourdHui(), -JOURS_AVANT);
  const fin = ajouterJours(aujourdHui(), JOURS_APRES);

  const [appareils, reglagesBruts, posesBrutes] = await Promise.all([
    interroger(config, 'appareils?select=*&order=ordre.asc'),
    interroger(config, 'parametres?select=cle,valeur'),
    interroger(config, `poses?select=*,rendez_vous(*)&debut=gte.${debut} 00:00:00`
      + `&debut=lte.${fin} 23:59:59&order=debut.asc`),
  ]);

  const reglages = {};
  for (const ligne of reglagesBruts) reglages[ligne.cle] = ligne.valeur;

  const poses = posesBrutes.map((p) => ({
    ...p,
    debut: depuisSql(p.debut),
    fin: depuisSql(p.fin),
    retour_effectif: depuisSql(p.retour_effectif),
    rdv: p.rendez_vous
      ? { ...p.rendez_vous, rdv_cardio: depuisSql(p.rendez_vous.rdv_cardio) }
      : null,
  }));

  const parametres = {
    ...PARAMETRES_PAR_DEFAUT,
    ...(reglages.planification || {}),
    horaires: reglages.horaires || HORAIRES_PAR_DEFAUT,
    fermeturesExceptionnelles: (reglages.planification || {}).fermeturesExceptionnelles || {},
  };

  return { appareils, poses, parametres, reglages };
}

// ---------------------------------------------------------------------------
// Espace de sauvegarde (stockage Supabase)
// ---------------------------------------------------------------------------

async function deposerFichier(config, nom, contenu, typeMime) {
  const reponse = await fetch(
    `${config.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(nom)}`,
    {
      method: 'POST',
      headers: {
        apikey: config.cle,
        Authorization: `Bearer ${config.cle}`,
        'Content-Type': typeMime,
        'x-upsert': 'true',
      },
      body: contenu,
    },
  );
  if (!reponse.ok) {
    throw new Error(`Dépôt impossible (${nom}) : ${reponse.status} ${await reponse.text()}`);
  }
}

async function listerSauvegardes(config) {
  const reponse = await fetch(`${config.url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: config.cle,
      Authorization: `Bearer ${config.cle}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!reponse.ok) throw new Error(`Liste impossible : ${reponse.status} ${await reponse.text()}`);
  return reponse.json();
}

async function supprimerFichiers(config, noms) {
  if (noms.length === 0) return;
  const reponse = await fetch(`${config.url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: config.cle,
      Authorization: `Bearer ${config.cle}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: noms }),
  });
  if (!reponse.ok) {
    throw new Error(`Suppression impossible : ${reponse.status} ${await reponse.text()}`);
  }
}

/** Ne conserve que les N derniers jours de sauvegardes. */
async function purger(config, joursConservation) {
  const fichiers = await listerSauvegardes(config);
  const limite = ajouterJours(aujourdHui(), -(joursConservation - 1));
  const aSupprimer = [];

  for (const fichier of fichiers) {
    const trouve = /(\d{2})-(\d{2})-(\d{4})\./.exec(fichier.name);
    if (!trouve) continue;
    const date = `${trouve[3]}-${trouve[2]}-${trouve[1]}`;
    if (date < limite) aSupprimer.push(fichier.name);
  }

  await supprimerFichiers(config, aSupprimer);
  return aSupprimer;
}

// ---------------------------------------------------------------------------
// Envoi de l'e-mail
// ---------------------------------------------------------------------------

async function envoyerMail(config, reglageSauvegarde, dateDemain, pieces) {
  const destinataires = reglageSauvegarde.destinataires || [];
  if (destinataires.length === 0) {
    console.log('Aucun destinataire configuré : e-mail non envoyé.');
    return false;
  }
  if (!config.smtp.hote) {
    console.log('Aucun serveur d’envoi (SMTP_HOST) configuré : e-mail non envoyé.');
    return false;
  }

  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: config.smtp.hote,
    port: config.smtp.port,
    secure: config.smtp.securise || config.smtp.port === 465,
    auth: config.smtp.utilisateur
      ? { user: config.smtp.utilisateur, pass: config.smtp.motDePasse }
      : undefined,
  });

  const objet = `${reglageSauvegarde.objetMail || 'Planning Holter — rendez-vous du lendemain'} `
    + `— ${dateEnFrancais(dateDemain)}`;

  await transport.sendMail({
    from: config.smtp.expediteur,
    to: destinataires.join(', '),
    subject: objet,
    text: [
      `Bonjour,`,
      '',
      `Vous trouverez en pièce jointe :`,
      `  • la feuille des rendez-vous du ${dateEnFrancaisLong(dateDemain)} (PDF) ;`,
      `  • la sauvegarde complète du planning (Excel).`,
      '',
      'Le fichier Excel reprend la présentation de l’interface : il peut servir de',
      'solution de secours si le site est momentanément indisponible.',
      '',
      'Message envoyé automatiquement par le planning Holter.',
    ].join('\n'),
    attachments: pieces.map((p) => ({ filename: p.nom, content: p.contenu })),
  });

  console.log(`E-mail envoyé à : ${destinataires.join(', ')}`);
  return true;
}

/** L'envoi doit-il avoir lieu aujourd'hui ? */
function envoiPrevuAujourdHui(frequence, date, parametres) {
  if (frequence === 'aucun') return false;
  if (frequence === 'hebdomadaire') return jourSemaine(date) === 1;
  if (frequence === 'ouvres') return estJourOuvre(date, parametres);
  return true;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function principal() {
  const config = lireConfiguration();
  const date = aujourdHui();
  const demain = ajouterJours(date, 1);

  console.log(`Sauvegarde du ${dateEnFrancais(date)}`);

  const { appareils, poses, parametres, reglages } = await chargerDonnees(config);
  console.log(`${appareils.length} appareils, ${poses.length} poses chargées.`);

  // 1. Classeur Excel
  const classeur = construireClasseurSauvegarde({ date, appareils, poses, parametres });
  const excel = Buffer.from(ecrireClasseur(classeur));
  const nomExcel = nomFichierSauvegarde(date);

  // 2. PDF des rendez-vous du lendemain
  const pdf = construirePdfJournee({ date: demain, poses, appareils, parametres });
  const nomPdf = nomFichierPdf(demain);

  // 3. Copie locale (récupérée ensuite par le dossier partagé du cabinet)
  mkdirSync(config.dossierLocal, { recursive: true });
  writeFileSync(join(config.dossierLocal, nomExcel), excel);
  writeFileSync(join(config.dossierLocal, nomPdf), pdf);
  console.log(`Fichiers écrits dans ${config.dossierLocal}/`);

  // 4. Dépôt dans l'espace de sauvegarde
  await deposerFichier(config, nomExcel, excel,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await deposerFichier(config, nomPdf, pdf, 'application/pdf');
  console.log('Sauvegarde déposée dans l’espace de stockage.');

  // 5. Purge au-delà de la durée de conservation
  const reglageSauvegarde = reglages.sauvegarde || {};
  const conservation = reglageSauvegarde.joursConservation || 7;
  const supprimes = await purger(config, conservation);
  console.log(`Purge : ${supprimes.length} fichier(s) de plus de ${conservation} jours supprimé(s).`);

  // 6. Envoi par e-mail
  const frequence = reglageSauvegarde.frequence || 'quotidien';
  if (envoiPrevuAujourdHui(frequence, date, parametres)) {
    await envoyerMail(config, reglageSauvegarde, demain, [
      { nom: nomPdf, contenu: pdf },
      { nom: nomExcel, contenu: excel },
    ]);
  } else {
    console.log(`Envoi non prévu aujourd’hui (fréquence : ${frequence}).`);
  }

  console.log('Sauvegarde terminée.');
}

principal().catch((erreur) => {
  console.error('ÉCHEC DE LA SAUVEGARDE :', erreur.message);
  process.exitCode = 1;
});
