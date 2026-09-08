/**
 * onglet-rdv.js — Prise de rendez-vous.
 *
 * La secrétaire saisit le rendez-vous avec le cardiologue et le matériel
 * souhaité ; le logiciel calcule aussitôt l'heure de pose, choisit les
 * appareils et affiche le résultat. Si c'est impossible, il propose d'autres
 * dates et d'autres heures.
 */

import {
  aujourdHui, dateEnFrancais, dateEnFrancaisLong, decouper, horodatage,
  maintenantHorodatage, nomJourFerie,
} from '../core/dates.js';
import { CATEGORIES, dureeLisible, dureesAutorisees } from '../core/materiel.js';
import {
  disponibilitesParType, planifier, propositionsAlternatives, rdvFutursMemeNom,
} from '../core/regles.js';
import * as api from '../data/api.js';
import { cardiologues, etat, parametres, posesActives, rafraichir } from '../data/etat.js';
import {
  carte, champ, el, encart, etiquetteAppareil, messageVide, notifier,
  notifierErreur, ouvrirFenetre, remplir, selection,
} from './base.js';
import { imprimerConvocation } from './convocation.js';

/** Saisie en cours, conservée tant que la secrétaire ne change pas d'onglet. */
const saisie = {
  date: aujourdHui(),
  heure: '10:00',
  patient_nom: '',
  patient_sexe: '',
  cardiologue: '',
  telephone: '',
  commentaire: '',
  materiels: {
    holter_ecg: { actif: false, marque: 'indifferent', duree: 24 },
    mapa: { actif: false, duree: 24 },
    polygraphie: { actif: false, duree: 24 },
    spider: { actif: false, duree: 168 },
  },
};

let planCourant = null;
let alternatives = [];
let conteneurResultat = null;

export function afficherRdv(conteneur) {
  if (!saisie.cardiologue) saisie.cardiologue = cardiologues()[0] || '';

  conteneurResultat = el('div', {});

  remplir(
    conteneur,
    carte('Nouveau rendez-vous', formulairePatient(), formulaireRdv()),
    carte('Matériel à poser', choixMateriels(), boutonAuPlusTot()),
    conteneurResultat,
  );

  recalculer();
}

// ---------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------

let zoneDoublons = null;
let minuterieDoublons = null;

/**
 * Deux secrétaires peuvent recevoir le même appel, ou un patient rappeler
 * sans dire qu'il a déjà réservé : dès que le nom saisi correspond à un
 * rendez-vous à venir, un avertissement s'affiche sous le formulaire.
 */
function majDoublons() {
  clearTimeout(minuterieDoublons);
  minuterieDoublons = setTimeout(() => {
    if (!zoneDoublons) return;
    const doublons = rdvFutursMemeNom(posesActives(), saisie.patient_nom, maintenantHorodatage());
    if (doublons.length === 0) { remplir(zoneDoublons); return; }
    remplir(zoneDoublons, encart(
      'alerte',
      el('strong', {}, `⚠ ${saisie.patient_nom.trim().toUpperCase()} a déjà `
        + `${doublons.length > 1 ? `${doublons.length} rendez-vous` : 'un rendez-vous'} à venir : `),
      doublons.slice(0, 2).map((r) => `${dateEnFrancaisLong(decouper(r.rdv_cardio).date)} `
        + `à ${decouper(r.rdv_cardio).heure} (${r.cardiologue})`).join(' · '),
      '. Vérifiez qu’il ne s’agit pas d’une double réservation (onglet Recherche).',
    ));
  }, 250);
}

function formulairePatient() {
  zoneDoublons = el('div', {});
  majDoublons();
  return el(
    'div',
    {},
    el(
      'div',
      { class: 'grille' },
      champ('Nom de famille', el('input', {
        type: 'text',
        value: saisie.patient_nom,
        autocomplete: 'off',
        placeholder: 'DUPONT',
        oninput: (e) => { saisie.patient_nom = e.target.value; majBoutonValider(); majDoublons(); },
      })),
      champ('Sexe', choixSexe()),
      champ('Téléphone', el('input', {
        type: 'tel', value: saisie.telephone, autocomplete: 'off',
        oninput: (e) => { saisie.telephone = e.target.value; },
      }), { facultatif: true }),
    ),
    zoneDoublons,
    el('p', { class: 'aide', style: 'margin:0' },
      'Seuls le nom de famille et le sexe sont enregistrés. En cas d’homonymes, '
      + 'utilisez la note interne ci-dessous pour les distinguer.'),
  );
}

/** Deux boutons F / M, plus rapides qu'une liste déroulante. */
function choixSexe() {
  const groupe = el('div', { class: 'choix-sexe', role: 'radiogroup', 'aria-label': 'Sexe du patient' });

  for (const [valeur, libelle] of [['F', 'Femme'], ['M', 'Homme']]) {
    const bouton = el('button', {
      type: 'button',
      class: `bouton${saisie.patient_sexe === valeur ? ' principal' : ''}`,
      'aria-pressed': saisie.patient_sexe === valeur ? 'true' : 'false',
      onclick: () => {
        // Champ obligatoire : un second clic ne doit pas désélectionner
        // (une secrétaire effacerait le sexe sans s'en apercevoir).
        saisie.patient_sexe = valeur;
        for (const autre of groupe.children) {
          const actif = autre.dataset.valeur === saisie.patient_sexe;
          autre.className = `bouton${actif ? ' principal' : ''}`;
          autre.setAttribute('aria-pressed', actif ? 'true' : 'false');
        }
        majBoutonValider();
      },
    }, libelle);
    bouton.dataset.valeur = valeur;
    groupe.append(bouton);
  }
  return groupe;
}

function formulaireRdv() {
  return el(
    'div',
    { class: 'grille' },
    champ('Date du rendez-vous cardiologue', el('input', {
      type: 'date', value: saisie.date, min: aujourdHui(),
      oninput: (e) => { saisie.date = e.target.value; recalculer(); },
    })),
    champ('Heure du rendez-vous', el('input', {
      type: 'time', value: saisie.heure, step: 300,
      oninput: (e) => { saisie.heure = e.target.value; recalculer(); },
    }), { aide: 'La dépose du matériel est calculée automatiquement avant cette heure.' }),
    champ('Cardiologue demandeur', selection(
      cardiologues().map((c) => ({ valeur: c, libelle: c })),
      saisie.cardiologue,
      (v) => { saisie.cardiologue = v; },
    )),
    champ('Note interne', el('input', {
      type: 'text', value: saisie.commentaire,
      oninput: (e) => { saisie.commentaire = e.target.value; },
    }), { facultatif: true }),
  );
}

function choixMateriels() {
  const lignes = ['holter_ecg', 'mapa', 'polygraphie', 'spider'].map((categorie) => {
    const m = saisie.materiels[categorie];
    const infos = CATEGORIES[categorie];

    const case_ = el('input', {
      type: 'checkbox', id: `mat-${categorie}`,
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
      el('label', { for: `mat-${categorie}`, style: 'font-weight:700;cursor:pointer' }, infos.libelle),
      el('span', { class: 'espace' }),
      ...controles,
    );
  });

  return el('div', { class: 'recap' }, lignes);
}

// ---------------------------------------------------------------------------
// « Au plus tôt » : les trois premiers créneaux possibles
// ---------------------------------------------------------------------------

function boutonAuPlusTot() {
  return el(
    'div',
    { class: 'barre-outils', style: 'margin:.8rem 0 0' },
    el('button', { class: 'bouton', onclick: () => proposerAuPlusTot() }, '⚡ Au plus tôt'),
    el('span', { class: 'aide' },
      'Propose les trois premiers rendez-vous possibles pour le matériel coché.'),
  );
}

function proposerAuPlusTot() {
  const materiels = materielsDemandes();
  if (materiels.length === 0) {
    notifier('Cochez d’abord le matériel souhaité.', 'erreur');
    return;
  }

  // On écarte les créneaux à marge réduite (dépose collée au rendez-vous) :
  // « au plus tôt » ne doit pas rimer avec « à la course ».
  const propositions = propositionsAlternatives({
    rdvCardio: horodatage(aujourdHui(), '00:00'),
    materiels,
    appareils: etat.appareils,
    poses: posesActives(),
    parametres: parametres(),
    maintenant: maintenantHorodatage(),
    maxPropositions: 8,
    joursExplores: 30,
  }).filter((prop) => !prop.plan.avertissements.some((a) => /Marge réduite/.test(a)))
    .slice(0, 3);

  ouvrirFenetre((fermer) => [
    el('h2', {}, '⚡ Premiers rendez-vous possibles'),
    propositions.length === 0
      ? encart('erreur', 'Aucun créneau possible dans les 30 prochains jours pour ce matériel. '
        + 'Vérifiez le parc (appareils hors service ?) ou essayez un autre matériel.')
      : el('div', { class: 'propositions' }, propositions.map((prop) => {
        const quand = decouper(prop.rdvCardio);
        const pose = decouper(prop.plan.lignes[0].pose);
        return el(
          'div',
          { class: 'proposition' },
          el('span', { class: 'proposition-date' }, `${dateEnFrancaisLong(quand.date)} à ${quand.heure}`),
          el('span', { class: 'proposition-detail' },
            `pose le ${dateEnFrancais(pose.date)} à ${pose.heure} · `,
            prop.plan.lignes.map((l) => l.appareil.code).join(', ')),
          el('button', {
            class: 'bouton petit principal',
            onclick: () => {
              saisie.date = quand.date;
              saisie.heure = quand.heure;
              fermer();
              afficherRdv(document.getElementById('vue-rdv'));
            },
          }, 'Choisir'),
        );
      })),
    el('div', { class: 'fenetre-actions' },
      el('button', { class: 'bouton', onclick: fermer }, 'Fermer')),
  ]);
}

// ---------------------------------------------------------------------------
// Calcul de la proposition
// ---------------------------------------------------------------------------

function materielsDemandes() {
  const liste = [];
  for (const [categorie, m] of Object.entries(saisie.materiels)) {
    if (!m.actif) continue;
    liste.push({
      categorie,
      marque: categorie === 'holter_ecg' ? m.marque : null,
      dureeHeures: m.duree,
    });
  }
  return liste;
}

let minuterie = null;

function recalculer() {
  clearTimeout(minuterie);
  minuterie = setTimeout(calculer, 120);
}

function calculer() {
  if (!conteneurResultat) return;
  const materiels = materielsDemandes();

  if (!saisie.date || !saisie.heure || materiels.length === 0) {
    planCourant = null;
    alternatives = [];
    remplir(conteneurResultat, carte(
      'Proposition',
      messageVide('Choisissez une date, une heure et au moins un matériel.'),
    ));
    return;
  }

  const params = parametres();
  const rdvCardio = horodatage(saisie.date, saisie.heure);
  const maintenant = maintenantHorodatage();

  planCourant = planifier({
    rdvCardio, materiels, appareils: etat.appareils, poses: posesActives(),
    parametres: params, maintenant,
  });

  alternatives = planCourant.possible ? [] : propositionsAlternatives({
    rdvCardio, materiels, appareils: etat.appareils, poses: posesActives(),
    parametres: params, maintenant, maxPropositions: 6,
  });

  remplir(conteneurResultat, affichageProposition());
}

// ---------------------------------------------------------------------------
// Affichage du résultat
// ---------------------------------------------------------------------------

function affichageProposition() {
  const params = parametres();
  const ferie = nomJourFerie(saisie.date, params);
  const elements = [];

  if (ferie) {
    elements.push(encart('alerte', `⚠ ${dateEnFrancaisLong(saisie.date)} : ${ferie}. Le cabinet est fermé.`));
  }

  for (const avertissement of planCourant.avertissements) {
    elements.push(encart(planCourant.possible ? 'alerte' : 'erreur', avertissement));
  }

  if (planCourant.possible) {
    elements.push(recapitulatif());
    elements.push(bandeauDisponibilitesPose());
    elements.push(boutonsValidation());
  } else {
    elements.push(encart(
      'erreur',
      el('strong', {}, '✖ Ce rendez-vous n’est pas réalisable en l’état.'),
      el('ul', {}, planCourant.lignes
        .filter((l) => l.motifEchec)
        .map((l) => el('li', {}, l.motifEchec))),
    ));
    elements.push(listeAlternatives());
  }

  return carte('Proposition', ...elements);
}

function recapitulatif() {
  const lignes = planCourant.lignes.map((ligne) => el(
    'div',
    { class: 'recap-ligne' },
    etiquetteAppareil(ligne.appareil),
    el(
      'span',
      {},
      el('strong', {}, `Pose ${dateEnFrancais(decouper(ligne.pose).date)} à ${decouper(ligne.pose).heure}`),
      ` · dépose ${dateEnFrancais(decouper(ligne.depose).date)} à ${decouper(ligne.depose).heure}`,
    ),
    el('span', { class: 'espace' }),
    el('span', { class: 'aide' }, `port réel : ${formaterDuree(ligne.dureeReelleMinutes)}`),
  ));

  const depose = decouper(planCourant.depose);
  return el(
    'div',
    {},
    encart(
      'succes',
      el('strong', {}, '✔ Rendez-vous réalisable. '),
      `Dépose du matériel le ${dateEnFrancais(depose.date)} à ${depose.heure}, `
      + `soit avant le rendez-vous de ${saisie.heure}.`,
    ),
    el('div', { class: 'recap' }, lignes),
  );
}

function formaterDuree(minutes) {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (heures >= 48) return `${Math.floor(heures / 24)} j ${heures % 24} h`;
  return reste ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`;
}

/** Rappel des appareils restants le jour de la pose. */
function bandeauDisponibilitesPose() {
  const params = parametres();
  const premierePose = planCourant.lignes
    .map((l) => l.pose)
    .sort()[0];
  if (!premierePose) return null;

  const dispos = disponibilitesParType(
    etat.appareils, posesActives(), premierePose, planCourant.depose, params,
  );

  return el(
    'div',
    { style: 'margin-top:.9rem' },
    el('h3', {}, `Appareils encore libres sur la période du ${dateEnFrancais(decouper(premierePose).date)}`),
    el('div', { class: 'dispos' }, dispos.map((d) => el(
      'div',
      { class: `dispo ${d.libres === 0 ? 'epuise' : (d.libres <= 2 ? 'tendu' : '')}` },
      el('div', { class: 'dispo-titre' }, d.categorie === 'holter_ecg' ? `Holter ${d.marque}` : CATEGORIES[d.categorie].libelle),
      el('div', { class: 'dispo-nombre' }, `${d.libres}/${d.total}`),
    ))),
  );
}

function listeAlternatives() {
  if (alternatives.length === 0) {
    return messageVide('Aucune autre date n’a été trouvée dans les 15 prochains jours. '
      + 'Essayez une autre durée de port ou un autre matériel.');
  }

  return el(
    'div',
    {},
    el('h3', {}, 'Autres rendez-vous possibles'),
    el('p', { class: 'aide', style: 'margin-top:0' },
      'Choisissez un créneau ci-dessous, puis convenez du rendez-vous cardiologue correspondant.'),
    el('div', { class: 'propositions' }, alternatives.map((p) => {
      const { date, heure } = decouper(p.rdvCardio);
      const pose = decouper(p.plan.lignes[0].pose);
      return el(
        'div',
        { class: 'proposition' },
        el('span', { class: 'proposition-date' }, `${dateEnFrancaisLong(date)} à ${heure}`),
        el('span', { class: 'proposition-detail' },
          `pose le ${dateEnFrancais(pose.date)} à ${pose.heure} · `,
          p.plan.lignes.map((l) => l.appareil.code).join(', ')),
        el('button', {
          class: 'bouton petit principal',
          onclick: () => {
            saisie.date = date;
            saisie.heure = heure;
            afficherRdv(document.getElementById('vue-rdv'));
          },
        }, 'Choisir'),
      );
    })),
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

let boutonValider = null;

function boutonsValidation() {
  boutonValider = el('button', {
    class: 'bouton principal',
    onclick: () => valider(),
  }, '✔ Enregistrer le rendez-vous');

  const zone = el(
    'div',
    { class: 'barre-outils', style: 'margin:1rem 0 0' },
    el('span', { class: 'aide' }, 'Vérifiez le nom du patient avant d’enregistrer.'),
    el('span', { class: 'espace' }),
    el('button', { class: 'bouton', onclick: () => reinitialiser() }, 'Effacer'),
    boutonValider,
  );
  majBoutonValider();
  return zone;
}

function majBoutonValider() {
  if (!boutonValider) return;
  const nomSaisi = saisie.patient_nom.trim().length > 0;
  const sexeSaisi = saisie.patient_sexe === 'F' || saisie.patient_sexe === 'M';
  const pret = nomSaisi && sexeSaisi && planCourant?.possible;

  boutonValider.disabled = !pret;
  if (pret) boutonValider.title = '';
  else if (!nomSaisi) boutonValider.title = 'Renseignez le nom de famille du patient.';
  else if (!sexeSaisi) boutonValider.title = 'Indiquez le sexe du patient.';
  else boutonValider.title = 'Ce rendez-vous n’est pas réalisable en l’état.';
}

async function valider() {
  if (!planCourant?.possible) return;
  boutonValider.disabled = true;
  boutonValider.textContent = 'Enregistrement…';

  try {
    await api.reserverRendezVous(
      {
        patient_nom: saisie.patient_nom.trim(),
        patient_sexe: saisie.patient_sexe,
        cardiologue: saisie.cardiologue,
        rdv_cardio: horodatage(saisie.date, saisie.heure),
        telephone: saisie.telephone.trim() || null,
        commentaire: saisie.commentaire.trim() || null,
      },
      planCourant.lignes.map((l) => ({
        appareil_id: l.appareil.id,
        duree_heures: l.demande.dureeHeures,
        marque_demandee: l.demande.marque && l.demande.marque !== 'indifferent' ? l.demande.marque : null,
        debut: l.pose,
        fin: l.depose,
      })),
    );

    const convocation = {
      patientNom: saisie.patient_nom.trim(),
      cardiologue: saisie.cardiologue,
      rdvCardio: horodatage(saisie.date, saisie.heure),
      lignes: planCourant.lignes.map((l) => ({ appareil: l.appareil, debut: l.pose, fin: l.depose })),
      nomCabinet: etat.reglages.cabinet?.nom,
    };
    notifier(`Rendez-vous enregistré pour ${saisie.patient_nom.toUpperCase()}.`, 'succes');
    await rafraichir();
    reinitialiser();
    ouvrirFenetre((fermer) => [
      el('h2', {}, '✔ Rendez-vous enregistré'),
      el('p', {}, `Souhaitez-vous imprimer la convocation de ${convocation.patientNom.toUpperCase()} `
        + '(numéro d’appareil, dates de pose et de dépose, rendez-vous cardiologue) ?'),
      el(
        'div',
        { class: 'fenetre-actions' },
        el('button', { class: 'bouton', onclick: fermer }, 'Non merci'),
        el('button', {
          class: 'bouton principal',
          onclick: () => { fermer(); imprimerConvocation(convocation); },
        }, '🖨 Imprimer la convocation'),
      ),
    ]);
  } catch (erreur) {
    notifierErreur(erreur);
    // En cas de conflit avec une autre secrétaire, on repart de données à jour
    // et le logiciel repropose immédiatement un autre appareil.
    await rafraichir().catch(() => {});
    afficherRdv(document.getElementById('vue-rdv'));
  }
}

function reinitialiser() {
  saisie.patient_nom = '';
  saisie.patient_sexe = '';
  saisie.telephone = '';
  saisie.commentaire = '';
  for (const m of Object.values(saisie.materiels)) m.actif = false;
  afficherRdv(document.getElementById('vue-rdv'));
}

/** Permet aux autres écrans de préremplir une prise de rendez-vous. */
export function preremplirRdv(champs) {
  Object.assign(saisie, champs);
}
