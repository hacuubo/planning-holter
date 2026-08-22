import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appareilOccupe, appareilsLibres, chargeDesCreneaux, chevauche, choisirAppareil,
  creneauDepose, creneauSature, creneauxPoseCandidats, disponibilitesParType,
  placesRestantes, planifier, poseIdeale, propositionsAlternatives,
} from '../web/js/core/regles.js';
import { INVENTAIRE_INITIAL } from '../web/js/core/materiel.js';
import { ajouterJours } from '../web/js/core/dates.js';

/** Inventaire complet, avec un identifiant stable par appareil. */
const APPAREILS = INVENTAIRE_INITIAL.map((a, i) => ({ ...a, id: `app-${i}`, actif: true }));

const parCode = (code, marque = null) => APPAREILS.find(
  (a) => a.code === code && (marque === null || a.marque === marque),
);

/** Fabrique une pose enregistrée. */
function pose(appareil, debut, fin, extra = {}) {
  return {
    id: extra.id || `pose-${appareil.id}-${debut}`,
    rdv_id: extra.rdv_id || `rdv-${appareil.id}-${debut}`,
    appareil_id: appareil.id,
    debut,
    fin,
    statut: extra.statut || 'prevu',
    retour_effectif: extra.retour_effectif || null,
  };
}

// ---------------------------------------------------------------------------
// Dépose : 20 minutes avant le rendez-vous cardiologue
// ---------------------------------------------------------------------------

test('la dépose tombe sur le dernier créneau situé 20 min avant le RDV cardiologue', () => {
  // Mardi 25/08/2026, RDV à 10:00 -> cible 09:40 -> dernier créneau 09:30
  const d = creneauDepose('2026-08-25 10:00');
  assert.equal(d.horodatage, '2026-08-25 09:30');
  assert.equal(d.margeMinutes, 30);
  assert.equal(d.avertissement, null);
});

test('un RDV pile sur un créneau + 20 min utilise ce créneau', () => {
  // RDV à 10:05 -> cible 09:45 -> créneau 09:45 exactement
  const d = creneauDepose('2026-08-25 10:05');
  assert.equal(d.horodatage, '2026-08-25 09:45');
  assert.equal(d.margeMinutes, 20);
});

test('un RDV cardiologue trop matinal déclenche un avertissement de marge', () => {
  // Lundi : ouverture 08:00. RDV à 08:10 -> cible 07:50, aucun créneau avant.
  const d = creneauDepose('2026-08-24 08:10');
  assert.equal(d.horodatage, '2026-08-24 08:00');
  assert.equal(d.margeMinutes, 10);
  assert.match(d.avertissement, /Marge réduite/);
});

test('un RDV cardiologue avant l’ouverture rend la dépose impossible', () => {
  const d = creneauDepose('2026-08-24 07:30');
  assert.equal(d.horodatage, null);
  assert.match(d.avertissement, /impossible/);
});

test('un RDV cardiologue un dimanche est refusé', () => {
  const d = creneauDepose('2026-08-23 10:00');
  assert.equal(d.horodatage, null);
  assert.match(d.avertissement, /pas un jour travaillé/);
});

// ---------------------------------------------------------------------------
// Créneaux de pose
// ---------------------------------------------------------------------------

test('pose idéale = dépose moins la durée de port', () => {
  assert.equal(poseIdeale('2026-08-25 09:30', 24), '2026-08-24 09:30');
  assert.equal(poseIdeale('2026-08-25 09:30', 48), '2026-08-23 09:30');
  assert.equal(poseIdeale('2026-08-25 09:30', 168), '2026-08-18 09:30');
});

test('pour 24 h, la pose est proposée la veille à la même heure', () => {
  const c = creneauxPoseCandidats('2026-08-25 09:30', 24);
  assert.equal(c[0].horodatage, '2026-08-24 09:30');
  assert.equal(c[0].dureeReelleMinutes, 1440);
  assert.equal(c[0].ecartMinutes, 0);
});

test('pour un RDV le lundi, la pose bascule au samedi (dernier créneau utile)', () => {
  // Dépose lundi 24/08 09:30 -> pose idéale dimanche 09:30 (fermé)
  // -> le samedi 22/08 à 11:45 est le créneau le plus proche de la durée nominale.
  const c = creneauxPoseCandidats('2026-08-24 09:30', 24);
  assert.equal(c[0].horodatage, '2026-08-22 11:45');
  // Aucun créneau du dimanche (fermé) ni du lundi matin (port trop court).
  assert.ok(!c.some((x) => x.horodatage.startsWith('2026-08-23')));
  assert.ok(!c.some((x) => x.horodatage.startsWith('2026-08-24')));
  // Les jours antérieurs restent des solutions de repli, moins bien classées.
  assert.ok(c.slice(0, 17).every((x) => x.horodatage.startsWith('2026-08-22')));
});

test('la tolérance permet de rattraper une ouverture tardive', () => {
  // Dépose mardi 07:45, 24 h -> pose idéale lundi 07:45, mais le lundi ouvre à 08:00.
  // La tolérance de 60 min autorise une pose lundi 08:00 (23 h 45 de port).
  const c = creneauxPoseCandidats('2026-08-25 07:45', 24);
  assert.equal(c[0].horodatage, '2026-08-24 08:00');
  assert.equal(c[0].dureeReelleMinutes, 1425);
});

test('un jour férié est enjambé pour trouver la pose', () => {
  // 14 juillet 2026 = mardi férié. Dépose mercredi 15/07 09:30, 24 h.
  // Pose idéale mardi 14 (férié) -> repli sur le lundi 13.
  const c = creneauxPoseCandidats('2026-07-15 09:30', 24);
  assert.ok(c[0].horodatage.startsWith('2026-07-13'));
});

test('le Spider Flash se pose 7 jours avant', () => {
  const c = creneauxPoseCandidats('2026-08-25 09:30', 168);
  assert.equal(c[0].horodatage, '2026-08-18 09:30');
  assert.equal(c[0].dureeReelleMinutes, 168 * 60);
});

test('aucune pose n’est proposée dans le passé', () => {
  const c = creneauxPoseCandidats('2026-08-25 09:30', 24, {}, '2026-08-24 12:00');
  assert.ok(c.every((x) => x.horodatage >= '2026-08-24 12:00'));
  assert.equal(c.length, 0); // toutes les poses valables du 24 sont antérieures à 12:00
});

// ---------------------------------------------------------------------------
// Immobilisation des appareils
// ---------------------------------------------------------------------------

test('deux périodes qui se touchent ne se chevauchent pas', () => {
  assert.ok(!chevauche('2026-08-24 09:30', '2026-08-25 09:30', '2026-08-25 09:30', '2026-08-26 09:30'));
  assert.ok(chevauche('2026-08-24 09:30', '2026-08-25 09:30', '2026-08-25 09:15', '2026-08-26 09:15'));
});

test('un appareil posé n’est pas réattribuable avant son retour', () => {
  const ela51 = parCode('51', 'ELA');
  const poses = [pose(ela51, '2026-08-24 09:30', '2026-08-25 09:30')];
  // Le lendemain, avant le retour : occupé.
  assert.ok(appareilOccupe(ela51.id, poses, '2026-08-25 08:00', '2026-08-26 08:00'));
  // Après le retour : libre.
  assert.ok(!appareilOccupe(ela51.id, poses, '2026-08-25 09:30', '2026-08-26 09:30'));
});

test('une pose annulée libère l’appareil', () => {
  const ela51 = parCode('51', 'ELA');
  const poses = [pose(ela51, '2026-08-24 09:30', '2026-08-25 09:30', { statut: 'annule' })];
  assert.ok(!appareilOccupe(ela51.id, poses, '2026-08-24 09:30', '2026-08-25 09:30'));
});

test('un retour anticipé remet l’appareil en service plus tôt', () => {
  const ela51 = parCode('51', 'ELA');
  const poses = [pose(ela51, '2026-08-24 09:30', '2026-08-25 09:30', { retour_effectif: '2026-08-25 08:00' })];
  assert.ok(!appareilOccupe(ela51.id, poses, '2026-08-25 08:00', '2026-08-26 08:00'));
});

test('les appareils d’urgence sont exclus des attributions courantes', () => {
  const libres = appareilsLibres(APPAREILS, [], {
    categorie: 'holter_ecg', marque: 'ELA', debut: '2026-08-24 09:30', fin: '2026-08-25 09:30',
  });
  assert.equal(libres.length, 9); // 51 à 59, sans 501 ni 502
  const avecUrgence = appareilsLibres(APPAREILS, [], {
    categorie: 'holter_ecg', marque: 'ELA', debut: '2026-08-24 09:30', fin: '2026-08-25 09:30',
    inclureUrgence: true,
  });
  assert.equal(avecUrgence.length, 11);
});

test('rotation : on reprend l’appareil revenu depuis le plus longtemps', () => {
  const a51 = parCode('51', 'ELA');
  const a52 = parCode('52', 'ELA');
  const a53 = parCode('53', 'ELA');
  const poses = [
    pose(a51, '2026-08-10 09:00', '2026-08-11 09:00'), // revenu le plus tôt
    pose(a52, '2026-08-18 09:00', '2026-08-19 09:00'),
    pose(a53, '2026-08-20 09:00', '2026-08-21 09:00'),
  ];
  const choisi = choisirAppareil([a53, a52, a51], poses, '2026-08-24 09:30');
  assert.equal(choisi.code, '51');
});

test('un appareil jamais utilisé passe en premier', () => {
  const a51 = parCode('51', 'ELA');
  const a52 = parCode('52', 'ELA');
  const poses = [pose(a51, '2026-08-10 09:00', '2026-08-11 09:00')];
  const choisi = choisirAppareil([a51, a52], poses, '2026-08-24 09:30');
  assert.equal(choisi.code, '52');
});

// ---------------------------------------------------------------------------
// Charge des créneaux
// ---------------------------------------------------------------------------

test('un patient avec plusieurs appareils ne compte que pour un geste', () => {
  const a51 = parCode('51', 'ELA');
  const mapaA = parCode('A');
  const poses = [
    pose(a51, '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'rdv-1' }),
    pose(mapaA, '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'rdv-1' }),
  ];
  const charge = chargeDesCreneaux(poses);
  assert.equal(charge.get('2026-08-24 09:30'), 1);
  assert.equal(charge.get('2026-08-25 09:30'), 1);
});

test('le créneau est saturé au-delà de 2 gestes par quart d’heure', () => {
  const poses = [
    pose(parCode('51', 'ELA'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r1' }),
    pose(parCode('52', 'ELA'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r2' }),
  ];
  const charge = chargeDesCreneaux(poses);
  assert.ok(creneauSature(charge, '2026-08-24 09:30'));
  assert.ok(!creneauSature(charge, '2026-08-24 09:45'));
  assert.ok(!creneauSature(charge, '2026-08-24 09:30', { gestesParCreneau: 3 }));
});

test('les horodatages venant de la base (avec secondes) comptent normalement', () => {
  // Régression : PostgreSQL renvoie « 09:30:00 », l'interface écrit « 09:30 ».
  // Sans normalisation, les deux formes comptaient comme deux créneaux
  // distincts et la limite de patients par quart d'heure ne s'appliquait plus.
  const avecSecondes = [
    { id: 'p1', rdv_id: 'r1', appareil_id: 'a1', debut: '2026-08-24 09:30:00', fin: '2026-08-25 09:30:00', statut: 'prevu' },
    { id: 'p2', rdv_id: 'r2', appareil_id: 'a2', debut: '2026-08-24 09:30:00', fin: '2026-08-25 09:30:00', statut: 'prevu' },
  ];
  const charge = chargeDesCreneaux(avecSecondes);

  assert.equal(charge.get('2026-08-24 09:30'), 2, 'les secondes doivent être ignorées');
  assert.ok(creneauSature(charge, '2026-08-24 09:30'));
  assert.ok(creneauSature(charge, '2026-08-24 09:30:00'), 'les deux écritures doivent être équivalentes');
  assert.equal(placesRestantes(charge, '2026-08-24 09:30:00'), 0);

  // Et le planificateur doit refuser d'ajouter un troisième patient.
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'mapa', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses: avecSecondes,
  });
  assert.ok(!plan.possible, 'le créneau de dépose de 09:30 est déjà complet');
  assert.ok(plan.avertissements.some((a) => /créneau de dépose/.test(a)));
});

test('aucun créneau ne dépasse jamais la capacité, même sur un planning chargé', () => {
  // On enchaîne des prises de rendez-vous comme le feraient les secrétaires,
  // en stockant les poses au format de la base (avec secondes), et on vérifie
  // qu'aucun quart d'heure ne finit surchargé.
  const poses = [];
  let n = 0;
  for (let jour = 0; jour < 12; jour++) {
    for (const heure of ['08:30', '09:00', '10:15', '11:00', '14:30', '16:00']) {
      for (let essai = 0; essai < 3; essai++) {
        const plan = planifier({
          rdvCardio: `${ajouterJours('2026-09-01', jour)} ${heure}`,
          materiels: [{ categorie: essai % 2 ? 'mapa' : 'holter_ecg', marque: 'indifferent', dureeHeures: 24 }],
          appareils: APPAREILS,
          poses,
        });
        if (!plan.possible) continue;
        n++;
        for (const ligne of plan.lignes) {
          poses.push({
            id: `p${n}-${ligne.appareil.code}`,
            rdv_id: `r${n}`,
            appareil_id: ligne.appareil.id,
            debut: `${ligne.pose}:00`,   // format de la base
            fin: `${ligne.depose}:00`,
            statut: 'prevu',
          });
        }
      }
    }
  }

  assert.ok(n > 30, `le jeu d’essai doit être conséquent (${n} rendez-vous)`);

  const charge = chargeDesCreneaux(poses);
  const depassements = [...charge.entries()].filter(([, nb]) => nb > 2);
  assert.deepEqual(depassements, [], 'aucun créneau ne doit dépasser 2 patients');
});

test('la dépose consomme aussi une place dans son créneau', () => {
  const poses = [
    pose(parCode('51', 'ELA'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r1' }),
    pose(parCode('52', 'ELA'), '2026-08-24 10:00', '2026-08-25 09:30', { rdv_id: 'r2' }),
  ];
  const charge = chargeDesCreneaux(poses);
  assert.equal(charge.get('2026-08-25 09:30'), 2);
  assert.ok(creneauSature(charge, '2026-08-25 09:30'));
});

// ---------------------------------------------------------------------------
// Planification complète
// ---------------------------------------------------------------------------

test('planification simple d’un Holter ECG 24 h', () => {
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses: [],
  });
  assert.ok(plan.possible);
  assert.equal(plan.depose, '2026-08-25 09:30');
  assert.equal(plan.lignes.length, 1);
  assert.equal(plan.lignes[0].pose, '2026-08-24 09:30');
  assert.equal(plan.lignes[0].appareil.marque, 'ELA');
  assert.equal(plan.lignes[0].dureeReelleMinutes, 1440);
});

test('plusieurs matériels de même durée sont posés au même créneau', () => {
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [
      { categorie: 'holter_ecg', marque: 'DMS', dureeHeures: 24 },
      { categorie: 'mapa', dureeHeures: 24 },
    ],
    appareils: APPAREILS,
    poses: [],
  });
  assert.ok(plan.possible);
  assert.equal(plan.lignes.length, 2);
  assert.equal(plan.lignes[0].pose, plan.lignes[1].pose);
  assert.equal(plan.lignes[0].depose, plan.lignes[1].depose);
});

test('des durées différentes donnent des poses à des dates différentes', () => {
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [
      { categorie: 'holter_ecg', marque: 'DMS', dureeHeures: 24 },
      { categorie: 'spider', dureeHeures: 168 },
    ],
    appareils: APPAREILS,
    poses: [],
  });
  assert.ok(plan.possible);
  const poses = plan.lignes.map((l) => l.pose).sort();
  assert.equal(poses[0], '2026-08-18 09:30'); // Spider Flash : 7 jours avant
  assert.equal(poses[1], '2026-08-24 09:30'); // Holter : la veille
});

test('deux appareils identiques demandés reçoivent deux numéros différents', () => {
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [
      { categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 },
      { categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 },
    ],
    appareils: APPAREILS,
    poses: [],
  });
  assert.ok(plan.possible);
  assert.notEqual(plan.lignes[0].appareil.id, plan.lignes[1].appareil.id);
});

test('redirection ELA -> DMS quand tous les ELA sont pris', () => {
  // On occupe les 9 ELA courants sur la période de pose.
  const poses = APPAREILS
    .filter((a) => a.categorie === 'holter_ecg' && a.marque === 'ELA' && !a.urgence)
    .map((a, i) => pose(a, '2026-08-24 08:00', '2026-08-26 08:00', { rdv_id: `occup-${i}` }));

  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses,
    parametres: { gestesParCreneau: 99 },
  });
  assert.ok(plan.possible);
  assert.equal(plan.lignes[0].appareil.marque, 'DMS');
  assert.equal(plan.lignes[0].marqueRedirigee, 'ELA');
  assert.ok(plan.avertissements.some((a) => /Aucun Holter ELA disponible/.test(a)));
});

test('impossibilité annoncée quand plus aucun Holter n’est libre', () => {
  const poses = APPAREILS
    .filter((a) => a.categorie === 'holter_ecg')
    .map((a, i) => pose(a, '2026-08-17 08:00', '2026-08-30 08:00', { rdv_id: `occup-${i}` }));

  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses,
    parametres: { gestesParCreneau: 99 },
  });
  assert.ok(!plan.possible);
  assert.equal(plan.lignes[0].appareil, null);
  assert.match(plan.lignes[0].motifEchec, /Plus aucun Holter/);
});

test('un créneau de pose saturé fait glisser vers un autre créneau', () => {
  const poses = [
    pose(parCode('1', 'DMS'), '2026-08-24 09:30', '2026-08-24 18:00', { rdv_id: 'r1' }),
    pose(parCode('2', 'DMS'), '2026-08-24 09:30', '2026-08-24 18:00', { rdv_id: 'r2' }),
  ];
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'holter_ecg', marque: 'ELA', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses,
  });
  assert.ok(plan.possible);
  assert.notEqual(plan.lignes[0].pose, '2026-08-24 09:30');
  // Le créneau retenu reste proche : 09:15 ou 09:45.
  assert.ok(['2026-08-24 09:15', '2026-08-24 09:45'].includes(plan.lignes[0].pose));
});

test('un créneau de dépose saturé bloque la prise de rendez-vous', () => {
  const poses = [
    pose(parCode('1', 'DMS'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r1' }),
    pose(parCode('2', 'DMS'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r2' }),
  ];
  const plan = planifier({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'mapa', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses,
  });
  assert.ok(!plan.possible);
  assert.ok(plan.avertissements.some((a) => /créneau de dépose/.test(a)));
});

// ---------------------------------------------------------------------------
// Propositions de repli
// ---------------------------------------------------------------------------

test('des rendez-vous de remplacement sont proposés', () => {
  const poses = [
    pose(parCode('1', 'DMS'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r1' }),
    pose(parCode('2', 'DMS'), '2026-08-24 09:30', '2026-08-25 09:30', { rdv_id: 'r2' }),
  ];
  const propositions = propositionsAlternatives({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'mapa', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses,
  });
  assert.ok(propositions.length > 0);
  assert.ok(propositions.every((p) => p.plan.possible));
  // Les propositions sont ordonnées : les plus proches de l'heure souhaitée d'abord.
  assert.ok(propositions[0].rdvCardio.startsWith('2026-08-25'));
});

test('les propositions ne dépassent pas le nombre demandé', () => {
  const propositions = propositionsAlternatives({
    rdvCardio: '2026-08-25 10:00',
    materiels: [{ categorie: 'polygraphie', dureeHeures: 24 }],
    appareils: APPAREILS,
    poses: [],
    maxPropositions: 4,
  });
  assert.ok(propositions.length <= 4);
});

// ---------------------------------------------------------------------------
// Bandeau de disponibilité
// ---------------------------------------------------------------------------

test('décompte des appareils restants par type', () => {
  const poses = [
    pose(parCode('51', 'ELA'), '2026-08-24 09:30', '2026-08-25 09:30'),
    pose(parCode('A'), '2026-08-24 09:30', '2026-08-25 09:30'),
  ];
  const dispo = disponibilitesParType(APPAREILS, poses, '2026-08-24 09:30', '2026-08-25 09:30');
  const ela = dispo.find((d) => d.cle === 'holter_ecg|ELA');
  const mapa = dispo.find((d) => d.cle === 'mapa');
  const poly = dispo.find((d) => d.cle === 'polygraphie');
  assert.equal(ela.total, 9);
  assert.equal(ela.libres, 8);
  assert.ok(!ela.codesLibres.includes('51'));
  assert.equal(mapa.total, 13); // A à N sans le L ; le Y d'urgence est exclu
  assert.equal(mapa.libres, 12);
  assert.equal(poly.total, 3);
  assert.equal(poly.libres, 3);
});

test('inventaire du cabinet conforme au parc réel', () => {
  const compter = (f) => APPAREILS.filter(f).length;
  const ela = (a) => a.categorie === 'holter_ecg' && a.marque === 'ELA';
  const dms = (a) => a.categorie === 'holter_ecg' && a.marque === 'DMS';
  const mapa = (a) => a.categorie === 'mapa';

  assert.equal(compter(ela), 11, '11 Holter ELA');
  assert.equal(compter(dms), 14, '14 Holter DMS');
  assert.equal(compter(mapa), 14, '14 MAPA');
  assert.equal(compter((a) => a.categorie === 'spider'), 1);
  assert.equal(compter((a) => a.categorie === 'polygraphie'), 3);
  assert.equal(APPAREILS.length, 43);

  // Appareils réservés aux urgences : 501, 502 (ELA), 101 (DMS), Y (MAPA)
  const urgences = APPAREILS.filter((a) => a.urgence).map((a) => a.code).sort();
  assert.deepEqual(urgences, ['101', '501', '502', 'Y']);

  // Les MAPA vont de A à N, sans le L.
  const codesMapa = APPAREILS.filter((a) => mapa(a) && !a.urgence).map((a) => a.code);
  assert.deepEqual(codesMapa, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'N']);
  assert.ok(!codesMapa.includes('L'), 'il n’y a pas de MAPA « L »');

  // Le MAPA « N » et les polygraphes « N1/N2/N3 » sont bien distincts.
  assert.equal(compter((a) => a.code === 'N'), 1);
  assert.equal(compter((a) => a.code === 'N1'), 1);

  // Aucun code en double au sein d'un même type de matériel.
  const cles = APPAREILS.map((a) => `${a.categorie}|${a.marque || ''}|${a.code}`);
  assert.equal(new Set(cles).size, cles.length, 'chaque appareil doit être identifiable sans ambiguïté');
});
