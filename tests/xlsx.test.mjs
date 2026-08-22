import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ajouterFeuille, creerZip, ecrireClasseur, lettreColonne, nouveauClasseur, serieExcel,
  styleDuMateriel,
} from '../web/js/core/xlsx.js';

test('numérotation des colonnes', () => {
  assert.equal(lettreColonne(0), 'A');
  assert.equal(lettreColonne(25), 'Z');
  assert.equal(lettreColonne(26), 'AA');
  assert.equal(lettreColonne(27), 'AB');
  assert.equal(lettreColonne(51), 'AZ');
  assert.equal(lettreColonne(52), 'BA');
  assert.equal(lettreColonne(701), 'ZZ');
});

test('conversion des dates au format Excel', () => {
  // Excel compte les jours depuis le 30/12/1899. Références connues :
  assert.equal(serieExcel('2000-01-01'), 36526);
  assert.equal(serieExcel('2024-02-29'), 45351); // année bissextile
  assert.equal(serieExcel('2026-08-21'), 46255);
  // Un jour d'écart correspond bien à 1.
  assert.equal(serieExcel('2026-08-22') - serieExcel('2026-08-21'), 1);
  // Note : Excel considère à tort 1900 comme bissextile ; les dates
  // antérieures à mars 1900 sont donc décalées de 1. Sans conséquence ici.
});

test('choix du style selon le matériel', () => {
  assert.equal(styleDuMateriel('holter_ecg', 'ELA'), 'holterELA');
  assert.equal(styleDuMateriel('holter_ecg', 'DMS'), 'holterDMS');
  assert.equal(styleDuMateriel('mapa', null), 'mapa');
  assert.equal(styleDuMateriel('inconnu', null), 'cellule');
});

test('archive ZIP valide (signatures et fin d’archive)', () => {
  const zip = creerZip([{ nom: 'a.txt', contenu: 'bonjour' }]);
  // Signature d'un en-tête local de fichier : PK\x03\x04
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04]);
  // Signature de fin d'archive : PK\x05\x06
  const fin = zip.slice(-22, -18);
  assert.deepEqual([...fin], [0x50, 0x4B, 0x05, 0x06]);
});

test('un classeur vide est refusé', () => {
  assert.throws(() => ecrireClasseur(nouveauClasseur()), /aucune feuille/);
});

test('les noms de feuille interdits sont corrigés', () => {
  const c = nouveauClasseur();
  ajouterFeuille(c, { nom: 'Planning 21/08/2026 [essai]', lignes: [['x']] });
  assert.equal(c.feuilles[0].nom, 'Planning 21-08-2026 -essai-');
  assert.ok(c.feuilles[0].nom.length <= 31);
});

test('génération complète d’un classeur lisible', () => {
  const classeur = nouveauClasseur();
  ajouterFeuille(classeur, {
    nom: 'Planning',
    colonnes: [{ largeur: 10 }, { largeur: 30 }, { largeur: 18 }],
    figer: { lignes: 1 },
    lignes: [
      [{ v: 'Heure', s: 'entete' }, { v: 'Patient', s: 'entete' }, { v: 'Matériel', s: 'entete' }],
      [{ v: '08:00', s: 'heure' }, { v: 'DUPONT Jean & fils <test>', s: 'cellule' },
        { v: 'Holter ECG DMS 7', s: 'holterDMS' }],
      [{ v: '08:15', s: 'heure' }, { v: "O'CONNOR Aoife", s: 'cellule' },
        { v: 'MAPA A', s: 'mapa' }],
      [{ v: '08:30', s: 'heure' }, { v: 'Nombre', s: 'cellule' }, { v: 42, s: 'nombre' }],
      [{ v: '08:45', s: 'heure' }, { v: 'Date', s: 'cellule' },
        { v: '2026-08-21', type: 'date', s: 'date' }],
    ],
  });
  ajouterFeuille(classeur, { nom: 'Statistiques', lignes: [['Total', 3]], filtre: true });

  const octets = ecrireClasseur(classeur);
  assert.ok(octets.length > 2000);

  const texte = Buffer.from(octets).toString('latin1');
  // Les fichiers attendus par Excel sont bien présents.
  for (const attendu of [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
  ]) {
    assert.ok(texte.includes(attendu), `entrée manquante : ${attendu}`);
  }
  // Les caractères spéciaux sont échappés, pas recopiés tels quels.
  assert.ok(texte.includes('&amp;'), 'l’esperluette doit être échappée');
  assert.ok(texte.includes('&lt;test&gt;'), 'les chevrons doivent être échappés');
  assert.ok(!/<t xml:space="preserve">[^<]*<test>/.test(texte));

  // Écrit un exemplaire pour vérification manuelle dans Excel.
  const dossier = join(tmpdir(), 'planning-holter-tests');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'exemple.xlsx'), octets);
});
