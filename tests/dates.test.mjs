import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJours, creneauxDuJour, dateEnFrancais, dateDepuisFrancais, ecartJours,
  estFerie, estJourOuvre, joursFeries, jourOuvrePrecedent, jourSemaine, nomJourFerie,
  normaliserHoraires, paques, plagesDuJour, reculerJoursOuvres, decaler,
  horodatageEnMinutes, heure, minutes,
} from '../web/js/core/dates.js';

test('arithmétique de dates', () => {
  assert.equal(ajouterJours('2026-01-31', 1), '2026-02-01');
  assert.equal(ajouterJours('2024-02-28', 1), '2024-02-29'); // année bissextile
  assert.equal(ajouterJours('2026-03-01', -1), '2026-02-28');
  assert.equal(ecartJours('2026-08-21', '2026-08-24'), 3);
  assert.equal(ecartJours('2026-08-24', '2026-08-21'), -3);
});

test('passage à l’heure d’été sans décalage', () => {
  // Le 29 mars 2026 la France passe à l'heure d'été : le calcul ne doit pas bouger.
  assert.equal(ajouterJours('2026-03-28', 1), '2026-03-29');
  assert.equal(ajouterJours('2026-03-29', 1), '2026-03-30');
  assert.equal(decaler('2026-03-28 23:00', 120), '2026-03-29 01:00');
  assert.equal(horodatageEnMinutes('2026-03-30 08:00') - horodatageEnMinutes('2026-03-29 08:00'), 1440);
});

test('jour de la semaine', () => {
  assert.equal(jourSemaine('2026-08-21'), 5); // vendredi
  assert.equal(jourSemaine('2026-08-22'), 6); // samedi
  assert.equal(jourSemaine('2026-08-23'), 0); // dimanche
  assert.equal(jourSemaine('2026-08-24'), 1); // lundi
});

test('conversions d’affichage', () => {
  assert.equal(dateEnFrancais('2026-08-21'), '21/08/2026');
  assert.equal(dateDepuisFrancais('21/08/2026'), '2026-08-21');
  assert.equal(dateDepuisFrancais('n’importe quoi'), null);
  assert.equal(minutes('08:15'), 495);
  assert.equal(heure(495), '08:15');
});

test('dimanche de Pâques', () => {
  assert.equal(paques(2024), '2024-03-31');
  assert.equal(paques(2025), '2025-04-20');
  assert.equal(paques(2026), '2026-04-05');
  assert.equal(paques(2027), '2027-03-28');
});

test('jours fériés français', () => {
  const f2026 = joursFeries(2026);
  assert.equal(f2026['2026-04-06'], 'Lundi de Pâques');
  assert.equal(f2026['2026-05-14'], 'Ascension');
  assert.equal(f2026['2026-05-25'], 'Lundi de Pentecôte');
  assert.equal(f2026['2026-07-14'], 'Fête nationale');
  assert.equal(Object.keys(f2026).length, 11);

  assert.ok(estFerie('2026-12-25'));
  assert.ok(!estFerie('2026-12-24'));
  assert.equal(nomJourFerie('2026-11-11'), 'Armistice 1918');
});

test('fermetures exceptionnelles paramétrables', () => {
  const p = { fermeturesExceptionnelles: { '2026-08-21': 'Congés annuels' } };
  assert.ok(estFerie('2026-08-21', p));
  assert.equal(nomJourFerie('2026-08-21', p), 'Congés annuels');
  assert.ok(!estJourOuvre('2026-08-21', p));
});

test('horaires d’ouverture par jour : deux plages en semaine', () => {
  // Mardi : 08:45 -> 11:30 le matin, 14:00 -> 16:30 l'après-midi.
  const mardi = creneauxDuJour('2026-08-25');
  assert.equal(mardi[0], '08:45');
  assert.equal(mardi.at(-1), '16:30');
  assert.equal(mardi.length, 12 + 11);
  assert.ok(!mardi.includes('11:45'), 'pas de créneau entre les deux plages');
  assert.ok(!mardi.includes('13:45'), 'l’après-midi commence à 14:00');
  assert.ok(mardi.includes('11:30') && mardi.includes('14:00'));

  // Vendredi : l'après-midi s'arrête à 16:00.
  const vendredi = creneauxDuJour('2026-08-21');
  assert.equal(vendredi.at(-1), '16:00');
  assert.equal(vendredi.length, 12 + 9);

  // Samedi : matin seul, de 08:30 à 11:45.
  const samedi = creneauxDuJour('2026-08-22');
  assert.equal(samedi[0], '08:30');
  assert.equal(samedi.at(-1), '11:45');
  assert.equal(samedi.length, 14);

  // Dimanche et jours fériés : fermé
  assert.deepEqual(creneauxDuJour('2026-08-23'), []);
  assert.deepEqual(creneauxDuJour('2026-12-25'), []);
});

test('les plages du jour sont exposées séparément', () => {
  assert.deepEqual(plagesDuJour('2026-08-25'), [
    { debut: '08:45', fin: '11:30' },
    { debut: '14:00', fin: '16:30' },
  ]);
  assert.deepEqual(plagesDuJour('2026-08-23'), []);
});

test('l’ancien format d’horaires (une seule plage) reste compris', () => {
  // Des réglages enregistrés avant la mise à jour peuvent encore contenir
  // l'ancien format { debut, fin } : ils doivent continuer de fonctionner.
  assert.deepEqual(
    normaliserHoraires({ debut: '07:45', fin: '18:00' }),
    { plages: [{ debut: '07:45', fin: '18:00' }] },
  );
  assert.equal(normaliserHoraires(null), null);
  assert.equal(normaliserHoraires({ plages: [] }), null);

  const parametres = { horaires: { 2: { debut: '09:00', fin: '10:00' } } };
  assert.deepEqual(creneauxDuJour('2026-08-25', parametres), ['09:00', '09:15', '09:30', '09:45', '10:00']);
});

test('la veille ouvrée d’un lundi est le samedi', () => {
  assert.equal(jourOuvrePrecedent('2026-08-24'), '2026-08-22'); // lundi -> samedi
  assert.equal(jourOuvrePrecedent('2026-08-25'), '2026-08-24'); // mardi -> lundi
  assert.equal(reculerJoursOuvres('2026-08-25', 2), '2026-08-22'); // mardi -2 -> samedi
});

test('les jours fériés sont sautés en remontant', () => {
  // Le 15 août 2026 est un samedi férié : la veille ouvrée du lundi 17 est le vendredi 14.
  assert.ok(estFerie('2026-08-15'));
  assert.equal(jourOuvrePrecedent('2026-08-17'), '2026-08-14');
});
