/**
 * onglet-recherche.js — Retrouver un patient déjà inscrit, consulter son
 * rendez-vous, le déplacer (autre date, autre heure, autre matériel)
 * ou l'annuler si besoin.
 */

import {
  aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper, horodatage,
  maintenantHorodatage,
} from '../core/dates.js';
import { CATEGORIES, dureeLisible, dureeParDefaut, dureesAutorisees } from '../core/materiel.js';
import { planifier, propositionsAlternatives } from '../core/regles.js';
import * as api from '../data/api.js';
import { appareilParId, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, champ, confirmer, demanderTexte, el, encart, etiquetteAppareil,
  etiquetteSexe, messageVide, nomPatient, notifier, notifierErreur,
  ouvrirFenetre, remplir, selection,
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
      annule || posesActives.length === 0 ? null : el('button', {
        class: 'bouton petit principal',
        title: 'Changer la date, l’heure ou le matériel de ce rendez-vous',
        onclick: () => deplacer(rdv),
      }, 'Déplacer / Modifier'),
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

// ---------------------------------------------------------------------------
// Déplacement / modification d'un rendez-vous
// ---------------------------------------------------------------------------

/**
 * Ouvre la fenêtre de déplacement : nouvelle date, nouvelle heure et/ou
 * nouveau matériel (changer le type de Holter, par exemple). Le logiciel
 * recalcule la proposition comme pour une prise de rendez-vous, sans que le
 * rendez-vous existant ne se bloque lui-même.
 */
function deplacer(rdv) {
  const posesEnCours = rdv.poses.filter((p) => p.statut !== 'annule');
  if (posesEnCours.some((p) => p.statut !== 'prevu')) {
    notifier('Le matériel de ce rendez-vous est déjà posé ou rendu : '
      + 'il ne peut plus être déplacé. Annulez-le puis reprenez un rendez-vous.', 'erreur');
    return;
  }

  // Saisie préremplie avec le rendez-vous actuel.
  const saisie = {
    date: decouper(rdv.rdv_cardio).date,
    heure: decouper(rdv.rdv_cardio).heure,
    materiels: {
      holter_ecg: { actif: false, marque: 'indifferent', duree: dureeParDefaut('holter_ecg') },
      mapa: { actif: false, marque: null, duree: dureeParDefaut('mapa') },
      polygraphie: { actif: false, marque: null, duree: dureeParDefaut('polygraphie') },
      spider: { actif: false, marque: null, duree: dureeParDefaut('spider') },
    },
  };
  for (const pose of posesEnCours) {
    const appareil = appareilParId(pose.appareil_id);
    const m = appareil ? saisie.materiels[appareil.categorie] : null;
    if (!m) continue;
    m.actif = true;
    if (pose.duree_heures) m.duree = pose.duree_heures;
    if (appareil.categorie === 'holter_ecg') m.marque = pose.marque_demandee || 'indifferent';
  }

  let plan = null;

  ouvrirFenetre((fermer) => {
    const zoneResultat = el('div', {});
    const boutonEnregistrer = el('button', { class: 'bouton principal' }, 'Enregistrer le déplacement');

    const materielsDemandes = () => Object.entries(saisie.materiels)
      .filter(([, m]) => m.actif)
      .map(([categorie, m]) => ({
        categorie,
        marque: categorie === 'holter_ecg' ? m.marque : null,
        dureeHeures: m.duree,
      }));

    const recalculer = () => {
      const params = parametres();
      const materiels = materielsDemandes();
      const maintenant = maintenantHorodatage();

      if (!saisie.date || !saisie.heure || materiels.length === 0) {
        plan = null;
        boutonEnregistrer.disabled = true;
        remplir(zoneResultat, messageVide('Choisissez une date, une heure et au moins un matériel.'));
        return;
      }

      const rdvCardio = horodatage(saisie.date, saisie.heure);
      plan = planifier({
        rdvCardio, materiels, appareils: etat.appareils, poses: posesActives(),
        parametres: params, maintenant, rdvIgnoreId: rdv.id,
      });
      boutonEnregistrer.disabled = !plan.possible;

      const elements = plan.avertissements.map((a) => encart(plan.possible ? 'alerte' : 'erreur', a));

      if (plan.possible) {
        const depose = decouper(plan.depose);
        elements.push(encart(
          'succes',
          el('strong', {}, '✔ Déplacement réalisable. '),
          `Dépose du matériel le ${dateEnFrancais(depose.date)} à ${depose.heure}.`,
        ));
        elements.push(el('div', { class: 'recap' }, plan.lignes.map((ligne) => el(
          'div',
          { class: 'recap-ligne' },
          etiquetteAppareil(ligne.appareil),
          el('span', {},
            el('strong', {}, `Pose ${dateEnFrancais(decouper(ligne.pose).date)} à ${decouper(ligne.pose).heure}`),
            ` · dépose ${dateEnFrancais(decouper(ligne.depose).date)} à ${decouper(ligne.depose).heure}`),
        ))));
      } else {
        elements.push(encart(
          'erreur',
          el('strong', {}, '✖ Ce déplacement n’est pas réalisable en l’état.'),
          el('ul', {}, plan.lignes
            .filter((l) => l.motifEchec)
            .map((l) => el('li', {}, l.motifEchec))),
        ));
        const alternatives = propositionsAlternatives({
          rdvCardio, materiels, appareils: etat.appareils, poses: posesActives(),
          parametres: params, maintenant, maxPropositions: 4,
        });
        if (alternatives.length > 0) {
          elements.push(el('h3', {}, 'Autres rendez-vous possibles'));
          elements.push(el('div', { class: 'propositions' }, alternatives.map((prop) => {
            const quand = decouper(prop.rdvCardio);
            return el(
              'div',
              { class: 'proposition' },
              el('span', { class: 'proposition-date' }, `${dateEnFrancaisLong(quand.date)} à ${quand.heure}`),
              el('button', {
                class: 'bouton petit principal',
                onclick: () => {
                  saisie.date = quand.date;
                  saisie.heure = quand.heure;
                  champDate.value = quand.date;
                  champHeure.value = quand.heure;
                  recalculer();
                },
              }, 'Choisir'),
            );
          })));
        }
      }

      remplir(zoneResultat, ...elements);
    };

    const champDate = el('input', {
      type: 'date', value: saisie.date, min: aujourdHui(),
      oninput: (e) => { saisie.date = e.target.value; recalculer(); },
    });
    const champHeure = el('input', {
      type: 'time', value: saisie.heure, step: 300,
      oninput: (e) => { saisie.heure = e.target.value; recalculer(); },
    });

    const lignesMateriel = ['holter_ecg', 'mapa', 'polygraphie', 'spider'].map((categorie) => {
      const m = saisie.materiels[categorie];
      const case_ = el('input', {
        type: 'checkbox', id: `dep-${categorie}`,
        oninput: (e) => { m.actif = e.target.checked; recalculer(); },
      });
      case_.checked = m.actif;

      const controles = [];
      if (categorie === 'holter_ecg') {
        controles.push(el('label', { class: 'aide paire' }, 'Marque :', selection(
          [
            { valeur: 'indifferent', libelle: 'Indifférente' },
            { valeur: 'ELA', libelle: 'ELA' },
            { valeur: 'DMS', libelle: 'DMS' },
          ],
          m.marque,
          (v) => { m.marque = v; recalculer(); },
          { style: 'width:auto' },
        )));
      }
      const durees = dureesAutorisees(categorie);
      if (durees.length > 1) {
        controles.push(el('label', { class: 'aide paire' }, 'Durée :', selection(
          durees.map((d) => ({ valeur: d, libelle: dureeLisible(d) })),
          m.duree,
          (v) => { m.duree = Number(v); recalculer(); },
          { style: 'width:auto' },
        )));
      } else {
        controles.push(el('span', { class: 'aide' }, `Durée : ${dureeLisible(durees[0])}`));
      }

      return el(
        'div',
        { class: 'recap-ligne' },
        case_,
        el('label', { for: `dep-${categorie}`, style: 'font-weight:700;cursor:pointer' },
          CATEGORIES[categorie].libelle),
        el('span', { class: 'espace' }),
        ...controles,
      );
    });

    boutonEnregistrer.addEventListener('click', async () => {
      if (!plan?.possible) return;
      boutonEnregistrer.disabled = true;
      boutonEnregistrer.textContent = 'Enregistrement…';
      try {
        await api.deplacerRendezVous(
          rdv.id,
          horodatage(saisie.date, saisie.heure),
          plan.lignes.map((l) => ({
            appareil_id: l.appareil.id,
            duree_heures: l.demande.dureeHeures,
            marque_demandee: l.demande.marque && l.demande.marque !== 'indifferent' ? l.demande.marque : null,
            debut: l.pose,
            fin: l.depose,
          })),
        );
        fermer();
        notifier(`Rendez-vous de ${nomPatient(rdv)} déplacé.`, 'succes');
        await rafraichir();
        lancerRecherche(true);
      } catch (erreur) {
        notifierErreur(erreur);
        boutonEnregistrer.textContent = 'Enregistrer le déplacement';
        // Les données ont pu changer entre-temps : on repart d'un état à jour.
        await rafraichir().catch(() => {});
        recalculer();
      }
    });

    recalculer();

    return [
      el('h2', {}, `Déplacer le rendez-vous de ${nomPatient(rdv)}`),
      el('p', { class: 'aide', style: 'margin-top:0' },
        'Changez la date, l’heure ou le matériel : le logiciel recalcule la pose et '
        + 'réattribue les appareils. L’ancien créneau est libéré automatiquement.'),
      el(
        'div',
        { class: 'grille' },
        champ('Date du rendez-vous cardiologue', champDate),
        champ('Heure du rendez-vous', champHeure),
      ),
      el('h3', {}, 'Matériel à poser'),
      el('div', { class: 'recap' }, lignesMateriel),
      zoneResultat,
      el(
        'div',
        { class: 'fenetre-actions' },
        el('button', { class: 'bouton', onclick: fermer }, 'Annuler'),
        boutonEnregistrer,
      ),
    ];
  });
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
