/**
 * app.js — Point de départ du logiciel.
 *
 * Enchaînement : vérification de la configuration → connexion → chargement des
 * données → affichage des onglets → écoute des modifications en temps réel.
 */

import { CONFIG, configurationIncomplete } from '../config.js';
import * as api from './data/api.js';
import {
  arreterTempsReel, chargerTout, demarrerTempsReel, etat, parametres,
  posesActives, surChangement,
} from './data/etat.js';
import { el, encart, notifier, notifierErreur, remplir } from './ui/base.js';
import { afficherJour } from './ui/onglet-jour.js';
import { afficherRdv } from './ui/onglet-rdv.js';
import { afficherRecherche } from './ui/onglet-recherche.js';
import { afficherCalendrier } from './ui/onglet-calendrier.js';
import { afficherAlertes, nombreAlertes } from './ui/onglet-alertes.js';
import { afficherParametres } from './ui/onglet-parametres.js';
import { disponibilitesParType } from './core/regles.js';
import { ajouterJours, aujourdHui, decouper, maintenantHorodatage } from './core/dates.js';

const VUES = {
  jour: { element: 'vue-jour', afficher: afficherJour },
  rdv: { element: 'vue-rdv', afficher: afficherRdv },
  recherche: { element: 'vue-recherche', afficher: afficherRecherche },
  calendrier: { element: 'vue-calendrier', afficher: afficherCalendrier },
  alertes: { element: 'vue-alertes', afficher: afficherAlertes },
  parametres: { element: 'vue-parametres', afficher: afficherParametres },
};

let ongletActif = 'jour';

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function demarrer() {
  if (configurationIncomplete()) {
    document.getElementById('ecran-configuration').hidden = false;
    return;
  }

  document.getElementById('titre-cabinet').textContent = CONFIG.NOM_CABINET;
  document.title = CONFIG.NOM_CABINET;

  brancherConnexion();
  brancherOnglets();

  const session = await api.sessionCourante();
  if (session) await ouvrirSession();
  else afficherEcranConnexion();

  api.surChangementDeSession((evenement) => {
    if (evenement === 'SIGNED_OUT') {
      arreterTempsReel();
      afficherEcranConnexion();
    }
  });
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

function afficherEcranConnexion() {
  document.getElementById('application').hidden = true;
  document.getElementById('ecran-connexion').hidden = false;
}

function brancherConnexion() {
  const formulaire = document.getElementById('formulaire-connexion');
  const erreur = document.getElementById('connexion-erreur');

  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = formulaire.querySelector('button[type="submit"]');
    erreur.hidden = true;
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    try {
      await api.seConnecter(
        document.getElementById('connexion-email').value.trim(),
        document.getElementById('connexion-mdp').value,
      );
      document.getElementById('connexion-mdp').value = '';
      await ouvrirSession();
    } catch (e2) {
      erreur.textContent = e2.message;
      erreur.hidden = false;
    } finally {
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
    }
  });

  document.getElementById('bouton-deconnexion').addEventListener('click', async () => {
    arreterTempsReel();
    await api.seDeconnecter();
    afficherEcranConnexion();
  });
}

async function ouvrirSession() {
  try {
    etat.profil = await api.monProfil();
  } catch (erreur) {
    notifierErreur(erreur);
    return;
  }

  if (!etat.profil || !etat.profil.actif) {
    afficherCompteInactif();
    return;
  }

  document.getElementById('ecran-connexion').hidden = true;
  document.getElementById('application').hidden = false;
  document.getElementById('nom-utilisateur').textContent = etat.profil.nom;

  try {
    await chargerTout();
  } catch (erreur) {
    notifierErreur(erreur);
  }

  demarrerTempsReel();
  surChangement(rafraichirEcran);
  rafraichirEcran();
}

function afficherCompteInactif() {
  const carte = document.querySelector('#ecran-connexion .carte-connexion');
  remplir(
    carte,
    el('h1', {}, '⏳ Compte en attente'),
    el('p', {}, 'Votre compte a bien été créé mais n’a pas encore été activé par '
      + 'un administrateur du cabinet.'),
    el('p', { class: 'aide' }, `Compte : ${etat.profil?.email || ''}`),
    el('button', {
      class: 'bouton principal large',
      onclick: async () => { await api.seDeconnecter(); window.location.reload(); },
    }, 'Se déconnecter'),
  );
  document.getElementById('ecran-connexion').hidden = false;
  document.getElementById('application').hidden = true;
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

function brancherOnglets() {
  for (const bouton of document.querySelectorAll('.onglet')) {
    bouton.addEventListener('click', () => changerOnglet(bouton.dataset.onglet));
  }
}

function changerOnglet(nom) {
  ongletActif = nom;
  for (const bouton of document.querySelectorAll('.onglet')) {
    bouton.classList.toggle('actif', bouton.dataset.onglet === nom);
  }
  for (const [cle, vue] of Object.entries(VUES)) {
    document.getElementById(vue.element).classList.toggle('active', cle === nom);
  }
  dessinerVue(nom);
}

function dessinerVue(nom) {
  const vue = VUES[nom];
  if (!vue) return;
  try {
    vue.afficher(document.getElementById(vue.element));
  } catch (erreur) {
    console.error(`Erreur d’affichage de l’onglet ${nom} :`, erreur);
    remplir(
      document.getElementById(vue.element),
      encart('erreur', 'Cet écran n’a pas pu s’afficher. Rechargez la page ; '
        + 'si le problème persiste, signalez-le avec la date et l’heure.'),
    );
  }
}

// ---------------------------------------------------------------------------
// Rafraîchissement global
// ---------------------------------------------------------------------------

function rafraichirEcran() {
  const pastille = document.getElementById('etat-connexion');
  pastille.classList.toggle('hors-ligne', !etat.enLigne);
  pastille.title = etat.enLigne
    ? 'Liaison temps réel active : les modifications des autres postes arrivent immédiatement.'
    : 'Liaison temps réel interrompue. Rechargez la page.';

  majBandeauAlerte();
  majRappelReglages();
  majPastilleAlertes();
  dessinerVue(ongletActif);
}

/**
 * Pastille de l'onglet Alertes : réservations sur un appareil indisponible
 * et patients à rappeler. Recalculée à chaque rafraîchissement des données,
 * donc à chaque nouvelle demande.
 */
function majPastilleAlertes() {
  const pastille = document.getElementById('pastille-alertes');
  if (!pastille) return;
  let nb = 0;
  try { nb = nombreAlertes(); } catch { nb = 0; }
  pastille.textContent = String(nb);
  pastille.hidden = nb === 0;
}

/**
 * Rappel permanent tant qu'aucune adresse e-mail n'a été enregistrée pour la
 * sauvegarde quotidienne. Il disparaît de lui-même dès qu'une adresse est
 * saisie dans les réglages.
 */
function majRappelReglages() {
  const rappel = document.getElementById('bandeau-rappel');
  if (!rappel) return; // page ancienne : ne jamais bloquer l'affichage pour autant
  const sauvegarde = etat.reglages.sauvegarde;

  // Tant que les réglages ne sont pas chargés, on n'affiche rien.
  if (!etat.profil || !sauvegarde) { rappel.hidden = true; return; }

  const destinataires = sauvegarde.destinataires || [];
  if (destinataires.length > 0 || sauvegarde.frequence === 'aucun') {
    rappel.hidden = true;
    return;
  }

  rappel.textContent = '✉ À compléter : aucune adresse e-mail n’est enregistrée pour '
    + 'la sauvegarde quotidienne. Cliquez ici pour l’ajouter dans les Réglages.';
  rappel.onclick = () => changerOnglet('parametres');
  rappel.hidden = false;
}

/** Alerte permanente si un type de matériel est totalement épuisé. */
function majBandeauAlerte() {
  const bandeau = document.getElementById('bandeau-alerte');
  if (etat.appareils.length === 0) { bandeau.hidden = true; return; }

  const debut = maintenantHorodatage();
  const fin = `${ajouterJours(decouper(debut).date, 1)} ${decouper(debut).heure}`;
  const dispos = disponibilitesParType(etat.appareils, posesActives(), debut, fin, parametres());
  const epuises = dispos.filter((d) => d.libres === 0);

  if (epuises.length === 0) {
    bandeau.hidden = true;
    return;
  }
  const noms = epuises.map((d) => (d.categorie === 'holter_ecg'
    ? `Holter ${d.marque}`
    : d.categorie.replace('_', ' '))).join(' · ');
  bandeau.textContent = `⚠ Plus aucun appareil disponible : ${noms}`;
  bandeau.hidden = false;
}

// ---------------------------------------------------------------------------
// Filet de sécurité : aucune erreur ne doit laisser un écran blanc
// ---------------------------------------------------------------------------

window.addEventListener('error', (e) => {
  console.error('Erreur non rattrapée :', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Erreur non rattrapée :', e.reason);
  if (e.reason?.message) notifier(e.reason.message, 'erreur');
});

// Un jour qui change pendant que l'application reste ouverte doit se voir.
setInterval(() => {
  if (etat.profil && document.visibilityState === 'visible') majBandeauAlerte();
}, 60000);

let jourAffiche = aujourdHui();
setInterval(() => {
  const maintenant = aujourdHui();
  if (maintenant !== jourAffiche) {
    jourAffiche = maintenant;
    if (etat.profil) rafraichirEcran();
  }
}, 60000);

demarrer().catch((erreur) => {
  console.error(erreur);
  document.body.append(el(
    'div',
    { class: 'encart erreur', style: 'margin:2rem' },
    'Le logiciel n’a pas pu démarrer : ', erreur.message,
  ));
});
