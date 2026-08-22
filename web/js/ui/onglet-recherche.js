/**
 * onglet-recherche.js — Retrouver un patient déjà inscrit, consulter son
 * rendez-vous et l'annuler si besoin.
 */

import { dateEnFrancais, dateEnFrancaisLong, decouper } from '../core/dates.js';
import { dureeLisible } from '../core/materiel.js';
import * as api from '../data/api.js';
import { appareilParId, rafraichir } from '../data/etat.js';
import {
  carte, confirmer, demanderTexte, el, etiquetteAppareil, etiquetteSexe, messageVide,
  nomPatient, notifier, notifierErreur, remplir,
} from './base.js';

let texteRecherche = '';
let resultats = null;
let recherche = false;
let conteneurResultats = null;

export function afficherRecherche(conteneur) {
  const saisie = el('input', {
    type: 'search',
    value: texteRecherche,
    placeholder: 'Nom ou prénom du patient…',
    autocomplete: 'off',
    oninput: (e) => { texteRecherche = e.target.value; lancerRecherche(); },
  });

  conteneurResultats = el('div', {});

  remplir(
    conteneur,
    carte(
      'Rechercher un patient',
      el(
        'div',
        { class: 'barre-outils' },
        el('div', { style: 'flex:1 1 260px' }, saisie),
        el('button', { class: 'bouton principal', onclick: () => lancerRecherche(true) }, 'Rechercher'),
      ),
      el('p', { class: 'aide', style: 'margin:0' },
        'Saisissez au moins 2 caractères. La recherche porte sur tous les rendez-vous, passés et à venir.'),
    ),
    conteneurResultats,
  );

  afficherResultats();
  setTimeout(() => saisie.focus(), 30);
}

let minuterie = null;

function lancerRecherche(immediat = false) {
  clearTimeout(minuterie);
  const executer = async () => {
    const texte = texteRecherche.trim();
    if (texte.length < 2) {
      resultats = null;
      afficherResultats();
      return;
    }
    recherche = true;
    afficherResultats();
    try {
      resultats = await api.rechercherRendezVous(texte);
    } catch (erreur) {
      notifierErreur(erreur);
      resultats = [];
    } finally {
      recherche = false;
      afficherResultats();
    }
  };
  if (immediat) executer();
  else minuterie = setTimeout(executer, 300);
}

function afficherResultats() {
  if (!conteneurResultats) return;

  if (recherche) {
    remplir(conteneurResultats, carte(null, messageVide('Recherche en cours…')));
    return;
  }
  if (resultats === null) {
    remplir(conteneurResultats);
    return;
  }
  if (resultats.length === 0) {
    remplir(conteneurResultats, carte(null, messageVide('Aucun patient trouvé.')));
    return;
  }

  remplir(
    conteneurResultats,
    carte(`${resultats.length} résultat${resultats.length > 1 ? 's' : ''}`,
      resultats.map(ficheRendezVous)),
  );
}

function ficheRendezVous(rdv) {
  const annule = rdv.statut === 'annule';
  const posesActives = rdv.poses.filter((p) => p.statut !== 'annule');
  const { date, heure } = decouper(rdv.rdv_cardio);

  return el(
    'div',
    { class: 'recap', style: `margin-bottom:.7rem${annule ? ';opacity:.6' : ''}` },
    el(
      'div',
      { class: 'recap-ligne' },
      el('strong', { style: 'font-size:1.05rem' }, nomPatient(rdv)),
      etiquetteSexe(rdv),
      el('span', { class: 'etiquette neutre' }, rdv.cardiologue),
      annule ? el('span', { class: 'etiquette urgence' }, 'ANNULÉ') : null,
      el('span', { class: 'espace' }),
      annule ? null : el('button', {
        class: 'bouton petit danger',
        onclick: () => annuler(rdv),
      }, 'Annuler le rendez-vous'),
    ),
    el(
      'div',
      { class: 'recap-ligne' },
      el('span', {}, `Rendez-vous cardiologue : `, el('strong', {}, `${dateEnFrancaisLong(date)} à ${heure}`)),
      rdv.telephone ? el('span', { class: 'aide' }, `☎ ${rdv.telephone}`) : null,
    ),
    posesActives.length === 0
      ? el('div', { class: 'recap-ligne aide' }, 'Aucun matériel attribué.')
      : posesActives.map((pose) => {
        const appareil = appareilParId(pose.appareil_id);
        const p = decouper(pose.debut);
        const d = decouper(pose.fin);
        return el(
          'div',
          { class: 'recap-ligne' },
          etiquetteAppareil(appareil),
          el('span', {},
            `Pose le ${dateEnFrancais(p.date)} à ${p.heure} · `,
            `dépose le ${dateEnFrancais(d.date)} à ${d.heure} · `,
            dureeLisible(pose.duree_heures)),
          el('span', { class: 'espace' }),
          el('span', { class: 'etiquette neutre' }, libelleStatut(pose.statut)),
        );
      }),
    rdv.commentaire ? el('div', { class: 'recap-ligne aide' }, `Note : ${rdv.commentaire}`) : null,
    annule && rdv.motif_annulation
      ? el('div', { class: 'recap-ligne aide' }, `Motif d’annulation : ${rdv.motif_annulation}`)
      : null,
  );
}

function libelleStatut(statut) {
  return { prevu: 'prévu', pose: 'posé', rendu: 'rendu', annule: 'annulé' }[statut] || statut;
}

async function annuler(rdv) {
  const details = el(
    'div',
    { class: 'recap' },
    el('div', { class: 'recap-ligne' }, el('strong', {}, nomPatient(rdv))),
    rdv.poses.filter((p) => p.statut !== 'annule').map((pose) => el(
      'div',
      { class: 'recap-ligne' },
      etiquetteAppareil(appareilParId(pose.appareil_id)),
      el('span', {}, `pose le ${dateEnFrancais(decouper(pose.debut).date)}`),
    )),
  );

  const ok = await confirmer({
    titre: 'Annuler ce rendez-vous ?',
    message: 'Le matériel réservé redeviendra immédiatement disponible pour d’autres patients. '
      + 'Le rendez-vous restera visible dans la recherche, marqué comme annulé.',
    details,
    boutonValider: 'Annuler le rendez-vous',
    danger: true,
  });
  if (!ok) return;

  const motif = await demanderTexte({
    titre: 'Motif de l’annulation',
    message: 'Facultatif, mais utile pour les statistiques et en cas de question ultérieure.',
    boutonValider: 'Terminer l’annulation',
  });

  try {
    await api.annulerRendezVous(rdv.id, motif);
    notifier('Rendez-vous annulé, matériel libéré.', 'succes');
    await rafraichir();
    lancerRecherche(true);
  } catch (erreur) {
    notifierErreur(erreur);
  }
}
