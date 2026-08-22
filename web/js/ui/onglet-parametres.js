/**
 * onglet-parametres.js — Réglages du cabinet.
 *
 * Parc matériel, horaires, cardiologues, envoi de la sauvegarde, statistiques
 * et comptes utilisateurs. Les réglages sont partagés : une modification vaut
 * pour toutes les secrétaires.
 */

import {
  aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper, HORAIRES_PAR_DEFAUT,
} from '../core/dates.js';
import { CATEGORIES, libelleAppareil, libelleCourt } from '../core/materiel.js';
import { appareilsLibres, choisirAppareil } from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilsActifs, cardiologues, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, champ, confirmer, el, encart, etiquetteAppareil, messageVide,
  notifier, notifierErreur, ouvrirFenetre, remplir, selection,
} from './base.js';

const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function afficherParametres(conteneur) {
  const admin = etat.profil?.role === 'admin';

  remplir(
    conteneur,
    admin ? null : encart(
      'info',
      'Les réglages sont en lecture seule : seul un administrateur peut les modifier. '
      + 'Une exception : les adresses e-mail de la sauvegarde quotidienne, que vous '
      + 'pouvez renseigner vous-même plus bas.',
    ),
    sectionMateriel(admin),
    sectionHoraires(admin),
    sectionCardiologues(admin),
    sectionFermetures(admin),
    sectionSauvegarde(),
    sectionStatistiques(),
    admin ? sectionComptes() : null,
    sectionAPropos(),
  );
}

function redessiner() {
  afficherParametres(document.getElementById('vue-parametres'));
}

// ===========================================================================
// Parc matériel
// ===========================================================================

function sectionMateriel(admin) {
  const groupes = new Map();
  for (const a of etat.appareils) {
    const cle = a.marque ? `${a.categorie}|${a.marque}` : a.categorie;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(a);
  }

  const blocs = [...groupes.entries()].map(([cle, liste]) => {
    const [categorie, marque] = cle.split('|');
    const titre = categorie === 'holter_ecg'
      ? `Holter ECG ${marque}`
      : (CATEGORIES[categorie]?.libelle || categorie);
    const enService = liste.filter((a) => a.actif !== false);

    return el(
      'div',
      { style: 'margin-bottom:1rem' },
      el('h3', {}, `${titre} — ${enService.length} en service`),
      el('div', { class: 'legende' }, liste.map((a) => el(
        admin ? 'button' : 'span',
        {
          class: `etiquette ${a.actif === false ? 'neutre' : (a.categorie === 'holter_ecg' ? `holter_ecg-${a.marque}` : a.categorie)}`,
          type: admin ? 'button' : null,
          title: a.actif === false
            ? 'Appareil retiré du parc'
            : (admin ? `Gérer ${libelleAppareil(a)}` : ''),
          onclick: admin ? () => gererAppareil(a) : null,
        },
        libelleCourt(a),
        a.urgence ? ' ⚠' : '',
        a.actif === false ? ' (retiré)' : '',
      ))),
    );
  });

  return carte(
    'Parc matériel',
    el('p', { class: 'aide', style: 'margin-top:0' },
      '⚠ = appareil réservé aux urgences, jamais attribué automatiquement.'),
    blocs.length ? blocs : messageVide('Aucun appareil enregistré.'),
    admin
      ? el('button', { class: 'bouton principal', onclick: () => ajouterAppareil() }, '+ Ajouter un appareil')
      : null,
  );
}

function ajouterAppareil() {
  let categorie = 'holter_ecg';
  let marque = 'DMS';
  let code = '';
  let urgence = false;

  ouvrirFenetre((fermer) => {
    const zoneMarque = el('div', {});

    const dessinerMarque = () => {
      const marques = CATEGORIES[categorie]?.marques || [];
      if (marques.length === 0) {
        marque = null;
        remplir(zoneMarque);
        return;
      }
      marque = marques.includes(marque) ? marque : marques[0];
      remplir(zoneMarque, champ('Marque', selection(
        [...marques.map((m) => ({ valeur: m, libelle: m })), { valeur: 'AUTRE', libelle: 'Autre…' }],
        marque,
        (v) => {
          if (v === 'AUTRE') {
            const saisi = window.prompt('Nom de la marque ?');
            marque = saisi ? saisi.trim() : marques[0];
            dessinerMarque();
          } else marque = v;
        },
      )));
    };
    dessinerMarque();

    return [
      el('h2', {}, 'Ajouter un appareil'),
      champ('Type de matériel', selection(
        Object.values(CATEGORIES).map((c) => ({ valeur: c.code, libelle: c.libelle })),
        categorie,
        (v) => { categorie = v; dessinerMarque(); },
      )),
      zoneMarque,
      champ('Numéro ou code', el('input', {
        type: 'text', placeholder: 'ex. 14, N4, Z…',
        oninput: (e) => { code = e.target.value.trim(); },
      })),
      el('label', { class: 'recap-ligne' },
        (() => {
          const c = el('input', { type: 'checkbox', oninput: (e) => { urgence = e.target.checked; } });
          return c;
        })(),
        el('span', {}, 'Réservé aux urgences (jamais attribué automatiquement)')),
      el(
        'div',
        { class: 'fenetre-actions' },
        el('button', { class: 'bouton', onclick: fermer }, 'Annuler'),
        el('button', {
          class: 'bouton principal',
          onclick: async () => {
            if (!code) { notifier('Indiquez un numéro ou un code.', 'erreur'); return; }
            try {
              const ordre = Math.max(0, ...etat.appareils.map((a) => a.ordre || 0)) + 1;
              await api.ajouterAppareil({ code, categorie, marque, urgence, ordre, actif: true });
              fermer();
              await rafraichir();
              notifier('Appareil ajouté.', 'succes');
              redessiner();
            } catch (erreur) { notifierErreur(erreur); }
          },
        }, 'Ajouter'),
      ),
    ];
  });
}

function gererAppareil(appareil) {
  ouvrirFenetre((fermer) => [
    el('h2', {}, libelleAppareil(appareil)),
    el(
      'div',
      { class: 'recap' },
      el('div', { class: 'recap-ligne' }, etiquetteAppareil(appareil),
        el('span', { class: 'aide' }, appareil.actif === false ? 'retiré du parc' : 'en service')),
    ),
    el(
      'div',
      { class: 'fenetre-actions' },
      el('button', { class: 'bouton', onclick: fermer }, 'Fermer'),
      appareil.actif === false
        ? el('button', {
          class: 'bouton principal',
          onclick: async () => {
            try {
              await api.modifierAppareil(appareil.id, { actif: true });
              fermer(); await rafraichir(); notifier('Appareil remis en service.', 'succes'); redessiner();
            } catch (erreur) { notifierErreur(erreur); }
          },
        }, 'Remettre en service')
        : el('button', {
          class: 'bouton danger',
          onclick: () => { fermer(); supprimerAppareil(appareil); },
        }, 'Retirer du parc'),
    ),
  ]);
}

async function supprimerAppareil(appareil) {
  let futures = [];
  try {
    futures = await api.posesFutures(appareil.id);
  } catch (erreur) { notifierErreur(erreur); return; }

  if (futures.length === 0) {
    const ok = await confirmer({
      titre: `Retirer ${libelleAppareil(appareil)} ?`,
      message: 'Aucun patient ne dépend de cet appareil. Il ne sera plus proposé lors des '
        + 'prises de rendez-vous. Son historique est conservé.',
      boutonValider: 'Retirer du parc',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.retirerAppareil(appareil.id);
      await rafraichir();
      notifier('Appareil retiré du parc.', 'succes');
      redessiner();
    } catch (erreur) { notifierErreur(erreur); }
    return;
  }

  // Des patients utilisent encore cet appareil : on propose de les réattribuer.
  const remplacements = calculerRemplacements(appareil, futures);
  const bloquants = remplacements.filter((r) => !r.remplacant);

  ouvrirFenetre((fermer) => [
    el('h2', {}, `Suppression impossible en l’état`),
    encart(
      'erreur',
      `${futures.length} patient(s) doivent encore recevoir ${libelleAppareil(appareil)}. `
      + 'Cet appareil ne peut pas être retiré sans les réattribuer.',
    ),
    el('div', { class: 'recap' }, remplacements.map((r) => el(
      'div',
      { class: 'recap-ligne' },
      el('strong', {}, r.pose.patient),
      el('span', { class: 'aide' }, `pose le ${dateEnFrancais(decouper(r.pose.debut).date)} à ${decouper(r.pose.debut).heure}`),
      el('span', { class: 'espace' }),
      el('span', {}, '→ '),
      r.remplacant
        ? etiquetteAppareil(r.remplacant)
        : el('span', { class: 'etiquette urgence' }, 'aucun appareil libre'),
    ))),
    bloquants.length
      ? encart('alerte', `${bloquants.length} patient(s) n’ont aucun appareil de remplacement `
        + 'disponible. Modifiez leur rendez-vous avant de retirer cet appareil.')
      : encart('info', 'Tous les patients peuvent être réattribués automatiquement, '
        + 'en respectant les règles d’attribution habituelles.'),
    el(
      'div',
      { class: 'fenetre-actions' },
      el('button', { class: 'bouton', onclick: fermer }, 'Annuler'),
      bloquants.length === 0
        ? el('button', {
          class: 'bouton danger',
          onclick: async () => {
            fermer();
            await appliquerRemplacements(appareil, remplacements);
          },
        }, `Réattribuer les ${futures.length} patients puis retirer`)
        : null,
    ),
  ]);
}

/** Cherche, pour chaque pose future, un appareil de remplacement du même type. */
function calculerRemplacements(appareil, futures) {
  const params = parametres();
  const provisoires = [];

  return futures.map((pose) => {
    const poses = [...posesActives(), ...provisoires];
    const libres = appareilsLibres(
      etat.appareils.filter((a) => a.id !== appareil.id),
      poses,
      {
        categorie: appareil.categorie,
        marque: null, // on autorise l'autre marque, comme lors d'une prise de RDV
        debut: pose.debut,
        fin: pose.fin,
        poseIgnoreeId: pose.pose_id,
      },
      params,
    );
    const remplacant = choisirAppareil(libres, poses, pose.debut);
    if (remplacant) {
      provisoires.push({
        id: null, rdv_id: pose.rdv_id, appareil_id: remplacant.id,
        debut: pose.debut, fin: pose.fin, statut: 'prevu',
      });
    }
    return { pose, remplacant };
  });
}

async function appliquerRemplacements(appareil, remplacements) {
  let reussites = 0;
  for (const { pose, remplacant } of remplacements) {
    if (!remplacant) continue;
    try {
      await api.changerAppareil(pose.pose_id, remplacant.id);
      reussites++;
    } catch (erreur) {
      notifierErreur(erreur);
      await rafraichir();
      notifier('Réattribution interrompue : rien n’a été retiré du parc.', 'erreur');
      redessiner();
      return;
    }
  }
  try {
    await api.retirerAppareil(appareil.id);
    await rafraichir();
    notifier(`${reussites} patient(s) réattribué(s), appareil retiré du parc.`, 'succes');
    redessiner();
  } catch (erreur) { notifierErreur(erreur); }
}

// ===========================================================================
// Horaires et capacité
// ===========================================================================

function sectionHoraires(admin) {
  const params = parametres();
  const horaires = { ...HORAIRES_PAR_DEFAUT, ...(etat.reglages.horaires || {}) };
  const brouillon = JSON.parse(JSON.stringify(horaires));
  let gestes = params.gestesParCreneau;
  let minutesAvant = params.minutesAvantRdvCardio;
  let tolerance = params.toleranceDureeMinutes;

  const lignes = [0, 1, 2, 3, 4, 5, 6].map((jour) => {
    const h = brouillon[jour];
    const ouvert = el('input', { type: 'checkbox', disabled: !admin });
    ouvert.checked = !!h;

    const debut = el('input', {
      type: 'time', step: 900, value: h ? h.debut : '07:45', disabled: !admin || !h,
      oninput: (e) => { if (brouillon[jour]) brouillon[jour].debut = e.target.value; },
    });
    const fin = el('input', {
      type: 'time', step: 900, value: h ? h.fin : '18:00', disabled: !admin || !h,
      oninput: (e) => { if (brouillon[jour]) brouillon[jour].fin = e.target.value; },
    });

    ouvert.addEventListener('input', (e) => {
      brouillon[jour] = e.target.checked ? { debut: debut.value, fin: fin.value } : null;
      debut.disabled = !e.target.checked;
      fin.disabled = !e.target.checked;
    });

    return el(
      'div',
      { class: 'recap-ligne' },
      ouvert,
      el('strong', { style: 'min-width:90px' }, NOMS_JOURS[jour]),
      el('span', { class: 'aide' }, 'de'),
      el('div', { style: 'width:120px' }, debut),
      el('span', { class: 'aide' }, 'à'),
      el('div', { style: 'width:120px' }, fin),
    );
  });

  return carte(
    'Horaires et capacité',
    el('p', { class: 'aide', style: 'margin-top:0' },
      'L’heure de fin est celle du dernier créneau proposé. Les rendez-vous sont '
      + 'espacés de 15 minutes.'),
    el('div', { class: 'recap' }, lignes),
    el(
      'div',
      { class: 'grille', style: 'margin-top:1rem' },
      champ('Patients par quart d’heure', el('input', {
        type: 'number', min: 1, max: 10, value: gestes, disabled: !admin,
        oninput: (e) => { gestes = Number(e.target.value); },
      }), { aide: 'Poses et déposes confondues.' }),
      champ('Dépose avant le RDV cardiologue (minutes)', el('input', {
        type: 'number', min: 0, max: 180, step: 5, value: minutesAvant, disabled: !admin,
        oninput: (e) => { minutesAvant = Number(e.target.value); },
      })),
      champ('Tolérance sur la durée de port (minutes)', el('input', {
        type: 'number', min: 0, max: 360, step: 15, value: tolerance, disabled: !admin,
        oninput: (e) => { tolerance = Number(e.target.value); },
      }), { aide: 'Port un peu plus court accepté quand le cabinet ouvre plus tard.' }),
    ),
    admin ? el('button', {
      class: 'bouton principal',
      onclick: async () => {
        try {
          await api.enregistrerParametre('horaires', brouillon);
          await api.enregistrerParametre('planification', {
            ...(etat.reglages.planification || {}),
            gestesParCreneau: gestes,
            minutesAvantRdvCardio: minutesAvant,
            toleranceDureeMinutes: tolerance,
          });
          await rafraichir();
          notifier('Horaires enregistrés.', 'succes');
          redessiner();
        } catch (erreur) { notifierErreur(erreur); }
      },
    }, 'Enregistrer les horaires') : null,
  );
}

// ===========================================================================
// Cardiologues
// ===========================================================================

function sectionCardiologues(admin) {
  let liste = [...cardiologues()];

  const zone = el('div', { class: 'legende' });
  const dessiner = () => remplir(zone, liste.map((initiales) => el(
    'span',
    { class: 'etiquette neutre' },
    initiales,
    admin ? el('button', {
      class: 'bouton petit discret',
      style: 'padding:0 .2rem;margin-left:.2rem',
      title: 'Retirer',
      onclick: () => { liste = liste.filter((c) => c !== initiales); dessiner(); },
    }, '✕') : null,
  )));
  dessiner();

  return carte(
    'Cardiologues demandeurs',
    zone,
    admin ? el(
      'div',
      { class: 'barre-outils' },
      el('div', { style: 'width:150px' }, el('input', {
        type: 'text', placeholder: 'Initiales', id: 'nouveau-cardio', maxlength: 4,
      })),
      el('button', {
        class: 'bouton',
        onclick: () => {
          const saisie = document.getElementById('nouveau-cardio');
          const valeur = saisie.value.trim().toUpperCase();
          if (valeur && !liste.includes(valeur)) { liste.push(valeur); dessiner(); }
          saisie.value = '';
        },
      }, 'Ajouter'),
      el('span', { class: 'espace' }),
      el('button', {
        class: 'bouton principal',
        onclick: async () => {
          try {
            await api.enregistrerParametre('cardiologues', liste);
            await rafraichir();
            notifier('Liste enregistrée.', 'succes');
            redessiner();
          } catch (erreur) { notifierErreur(erreur); }
        },
      }, 'Enregistrer'),
    ) : null,
  );
}

// ===========================================================================
// Fermetures exceptionnelles
// ===========================================================================

function sectionFermetures(admin) {
  const planification = etat.reglages.planification || {};
  let fermetures = { ...(planification.fermeturesExceptionnelles || {}) };

  const zone = el('div', {});
  const dessiner = () => {
    const dates = Object.keys(fermetures).sort();
    remplir(zone, dates.length
      ? el('div', { class: 'recap' }, dates.map((d) => el(
        'div',
        { class: 'recap-ligne' },
        el('strong', {}, dateEnFrancaisLong(d)),
        el('span', { class: 'aide' }, fermetures[d]),
        el('span', { class: 'espace' }),
        admin ? el('button', {
          class: 'bouton petit discret',
          onclick: () => { delete fermetures[d]; dessiner(); },
        }, '✕') : null,
      )))
      : messageVide('Aucune fermeture exceptionnelle enregistrée.'));
  };
  dessiner();

  return carte(
    'Fermetures exceptionnelles',
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Les jours fériés français sont déjà pris en compte automatiquement. '
      + 'Ajoutez ici les congés, ponts et fermetures du cabinet.'),
    zone,
    admin ? el(
      'div',
      { class: 'barre-outils' },
      el('div', { style: 'width:160px' }, el('input', { type: 'date', id: 'fermeture-date', min: aujourdHui() })),
      el('div', { style: 'flex:1 1 180px' }, el('input', { type: 'text', id: 'fermeture-motif', placeholder: 'Motif (congés, pont…)' })),
      el('button', {
        class: 'bouton',
        onclick: () => {
          const d = document.getElementById('fermeture-date').value;
          const m = document.getElementById('fermeture-motif').value.trim() || 'Fermeture';
          if (!d) { notifier('Choisissez une date.', 'erreur'); return; }
          fermetures[d] = m;
          dessiner();
        },
      }, 'Ajouter'),
      el('span', { class: 'espace' }),
      el('button', {
        class: 'bouton principal',
        onclick: async () => {
          try {
            await api.enregistrerParametre('planification', { ...planification, fermeturesExceptionnelles: fermetures });
            await rafraichir();
            notifier('Fermetures enregistrées.', 'succes');
            redessiner();
          } catch (erreur) { notifierErreur(erreur); }
        },
      }, 'Enregistrer'),
    ) : null,
  );
}

// ===========================================================================
// Sauvegarde et envoi par e-mail
// ===========================================================================

/**
 * Seule section des réglages ouverte à TOUTES les secrétaires : ce sont elles
 * qui renseignent l'adresse e-mail recevant la sauvegarde quotidienne.
 * La base de données autorise explicitement cette exception (voir 02-securite.sql).
 */
function sectionSauvegarde() {
  const reglage = etat.reglages.sauvegarde || {};
  let destinataires = [...(reglage.destinataires || [])];
  let frequence = reglage.frequence || 'quotidien';
  let conservation = reglage.joursConservation || 7;

  const zone = el('div', { class: 'legende' });
  const dessiner = () => remplir(zone, destinataires.length
    ? destinataires.map((adresse) => el(
      'span',
      { class: 'etiquette neutre' },
      adresse,
      el('button', {
        class: 'bouton petit discret', style: 'padding:0 .2rem;margin-left:.2rem',
        title: 'Retirer cette adresse',
        onclick: () => { destinataires = destinataires.filter((d) => d !== adresse); dessiner(); },
      }, '✕'),
    ))
    : el('span', { class: 'aide' }, 'Aucun destinataire : aucun e-mail ne sera envoyé.'));
  dessiner();

  const aucuneAdresse = destinataires.length === 0 && frequence !== 'aucun';

  return carte(
    'Sauvegarde quotidienne et envoi par e-mail',
    aucuneAdresse
      ? encart(
        'alerte',
        el('strong', {}, '✉ Adresse e-mail à renseigner. '),
        'Aucune adresse n’est encore enregistrée : la sauvegarde du planning est '
        + 'bien produite chaque matin, mais elle n’est envoyée à personne. '
        + 'Ajoutez ci-dessous l’adresse du secrétariat, puis cliquez sur Enregistrer.',
      )
      : null,
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Chaque jour, un fichier Excel complet est produit, déposé dans l’espace de '
      + 'sauvegarde, et envoyé par e-mail avec le PDF des rendez-vous du lendemain. '
      + 'Les sauvegardes de plus de 7 jours sont supprimées automatiquement.'),
    zone,
    el(
      'div',
      { class: 'barre-outils' },
      el('div', { style: 'flex:1 1 240px' }, el('input', {
        type: 'email', id: 'nouveau-destinataire', placeholder: 'adresse@cabinet.fr',
      })),
      el('button', {
        class: 'bouton',
        onclick: () => {
          const saisie = document.getElementById('nouveau-destinataire');
          const valeur = saisie.value.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(valeur)) {
            notifier('Adresse e-mail invalide.', 'erreur'); return;
          }
          if (!destinataires.includes(valeur)) destinataires.push(valeur);
          saisie.value = '';
          dessiner();
        },
      }, 'Ajouter'),
    ),
    el(
      'div',
      { class: 'grille' },
      champ('Fréquence d’envoi', selection(
        [
          { valeur: 'quotidien', libelle: 'Tous les jours' },
          { valeur: 'ouvres', libelle: 'Uniquement les jours ouvrés' },
          { valeur: 'hebdomadaire', libelle: 'Une fois par semaine (lundi)' },
          { valeur: 'aucun', libelle: 'Ne pas envoyer d’e-mail' },
        ],
        frequence,
        (v) => { frequence = v; },
      )),
      champ('Conservation des sauvegardes (jours)', el('input', {
        type: 'number', min: 1, max: 60, value: conservation,
        oninput: (e) => { conservation = Number(e.target.value); },
      })),
    ),
    el('button', {
      class: 'bouton principal',
      onclick: async () => {
        try {
          await api.enregistrerParametre('sauvegarde', {
            ...reglage, destinataires, frequence, joursConservation: conservation,
          });
          await rafraichir();
          notifier('Réglages de sauvegarde enregistrés.', 'succes');
          redessiner();
        } catch (erreur) { notifierErreur(erreur); }
      },
    }, 'Enregistrer'),
  );
}

// ===========================================================================
// Statistiques
// ===========================================================================

let anneeStats = new Date().getFullYear();
let donneesStats = null;

function sectionStatistiques() {
  const zone = el('div', {});

  const charger = async () => {
    remplir(zone, messageVide('Calcul en cours…'));
    try {
      donneesStats = await api.statistiques(anneeStats);
      remplir(zone, tableauxStats(donneesStats));
    } catch (erreur) {
      notifierErreur(erreur);
      remplir(zone, messageVide('Statistiques indisponibles.'));
    }
  };

  if (donneesStats && donneesStats.annee === anneeStats) remplir(zone, tableauxStats(donneesStats));
  else charger();

  const annees = [];
  for (let a = new Date().getFullYear(); a >= new Date().getFullYear() - 5; a--) annees.push(a);

  return carte(
    'Statistiques',
    el(
      'div',
      { class: 'barre-outils' },
      el('span', {}, 'Année :'),
      el('div', { style: 'width:120px' }, selection(
        annees.map((a) => ({ valeur: a, libelle: String(a) })),
        anneeStats,
        (v) => { anneeStats = Number(v); charger(); },
      )),
      el('span', { class: 'espace' }),
      el('button', { class: 'bouton', onclick: charger }, '↻ Actualiser'),
    ),
    zone,
  );
}

function tableauxStats(stats) {
  const resume = el(
    'div',
    { class: 'dispos', style: 'margin-bottom:1rem' },
    el('div', { class: 'dispo' },
      el('div', { class: 'dispo-titre' }, 'Examens'),
      el('div', { class: 'dispo-nombre' }, stats.total_examens)),
    el('div', { class: 'dispo' },
      el('div', { class: 'dispo-titre' }, 'Patients'),
      el('div', { class: 'dispo-nombre' }, stats.total_patients)),
    el('div', { class: 'dispo' },
      el('div', { class: 'dispo-titre' }, 'Annulations'),
      el('div', { class: 'dispo-nombre' }, stats.annulations)),
  );

  const parType = tableau(
    ['Type de matériel', 'Examens', 'Patients', 'Journées appareil'],
    (stats.par_type || []).map((t) => [
      t.categorie === 'holter_ecg' ? `Holter ECG ${t.marque || ''}` : (CATEGORIES[t.categorie]?.libelle || t.categorie),
      t.examens, t.patients, t.journees_appareil,
    ]),
  );

  const parCardio = tableau(
    ['Cardiologue', 'Examens', 'Patients', 'Holter ECG', 'MAPA', 'Polygraphie', 'Spider'],
    (stats.par_cardiologue || []).map((c) => [
      c.cardiologue, c.examens, c.patients, c.holter_ecg, c.mapa, c.polygraphie, c.spider,
    ]),
  );

  const parAppareil = tableau(
    ['Appareil', 'Examens', 'Journées d’utilisation'],
    (stats.par_appareil || []).map((a) => [
      a.categorie === 'holter_ecg' ? `${a.marque} ${a.code}` : a.code, a.examens, a.journees,
    ]),
  );

  return el(
    'div',
    {},
    resume,
    el('h3', {}, 'Par type de matériel'), parType,
    el('h3', {}, 'Par cardiologue demandeur'), parCardio,
    el('h3', {}, 'Par appareil'), parAppareil,
  );
}

function tableau(entetes, lignes) {
  if (lignes.length === 0) return messageVide('Aucune donnée pour cette année.');
  return el(
    'div',
    { class: 'tableau-defilant', style: 'margin-bottom:1rem' },
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, entetes.map((t, i) => el('th', { class: i ? 'nombre' : '' }, t)))),
      el('tbody', {}, lignes.map((l) => el('tr', {}, l.map((v, i) => el('td', { class: i ? 'nombre' : '' }, String(v ?? '')))))),
    ),
  );
}

// ===========================================================================
// Comptes utilisateurs
// ===========================================================================

function sectionComptes() {
  const zone = el('div', {}, messageVide('Chargement…'));

  api.listerProfils().then((profils) => {
    remplir(zone, tableauComptes(profils));
  }).catch((erreur) => {
    notifierErreur(erreur);
    remplir(zone, messageVide('Liste indisponible.'));
  });

  return carte(
    'Comptes utilisateurs',
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Un nouveau compte créé dans Supabase apparaît ici, inactif. Activez-le pour '
      + 'donner accès au planning. Un administrateur peut modifier les réglages.'),
    zone,
  );
}

function tableauComptes(profils) {
  if (profils.length === 0) return messageVide('Aucun compte.');
  return el(
    'div',
    { class: 'tableau-defilant' },
    el(
      'table',
      {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Nom'), el('th', {}, 'Rôle'), el('th', {}, 'État'), el('th', {}, 'Actions'))),
      el('tbody', {}, profils.map((p) => el(
        'tr',
        {},
        el('td', {}, p.nom),
        el('td', {}, p.role === 'admin' ? 'Administrateur' : 'Secrétaire'),
        el('td', {}, p.actif
          ? el('span', { class: 'etiquette neutre' }, 'actif')
          : el('span', { class: 'etiquette urgence' }, 'inactif')),
        el('td', {}, el(
          'div',
          { style: 'display:flex;gap:.3rem;flex-wrap:wrap' },
          el('button', {
            class: 'bouton petit',
            onclick: () => majProfil(p.id, { actif: !p.actif }),
          }, p.actif ? 'Désactiver' : 'Activer'),
          el('button', {
            class: 'bouton petit',
            onclick: () => majProfil(p.id, { role: p.role === 'admin' ? 'secretaire' : 'admin' }),
          }, p.role === 'admin' ? 'Retirer admin' : 'Rendre admin'),
        )),
      ))),
    ),
  );
}

async function majProfil(id, champs) {
  try {
    await api.modifierProfil(id, champs);
    notifier('Compte mis à jour.', 'succes');
    redessiner();
  } catch (erreur) { notifierErreur(erreur); }
}

// ===========================================================================
// À propos
// ===========================================================================

function sectionAPropos() {
  const cabinet = etat.reglages.cabinet || {};
  return carte(
    'À propos',
    el('p', { class: 'aide', style: 'margin:0' },
      `Planning Holter — version ${cabinet.version || '1.0.0'}. `,
      `${appareilsActifs().length} appareils en service, `,
      `${posesActives().length} poses en mémoire. `,
      `Connecté en tant que ${etat.profil?.nom || '—'} (${etat.profil?.role === 'admin' ? 'administrateur' : 'secrétaire'}).`),
  );
}
