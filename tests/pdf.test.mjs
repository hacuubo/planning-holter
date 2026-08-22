import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construirePdfJournee, nomFichierPdf } from '../scripts/pdf-journee.mjs';
import { ecrireDocument, largeurTexte, nouveauDocument, texte, tronquer } from '../scripts/pdf.mjs';
import { INVENTAIRE_INITIAL } from '../web/js/core/materiel.js';
import { planifier } from '../web/js/core/regles.js';

const APPAREILS = INVENTAIRE_INITIAL.map((a, i) => ({ ...a, id: `app-${i}`, actif: true }));

test('mesure et troncature du texte', () => {
  assert.ok(largeurTexte('AAA', 10) > largeurTexte('iii', 10));
  assert.equal(tronquer('court', 10, 200), 'court');
  const coupe = tronquer('un nom de patient vraiment très long', 8, 40);
  assert.ok(coupe.endsWith('…'));
  assert.ok(coupe.length < 36);
});

test('structure d’un PDF minimal', () => {
  const doc = nouveauDocument();
  texte(doc, 'Bonjour', { x: 50, y: 700 });
  const pdf = ecrireDocument(doc);
  const contenu = pdf.toString('latin1');

  assert.ok(contenu.startsWith('%PDF-1.4'));
  assert.ok(contenu.trimEnd().endsWith('%%EOF'));
  assert.ok(contenu.includes('/Type /Catalog'));
  assert.ok(contenu.includes('/Type /Pages'));
  assert.ok(contenu.includes('/BaseFont /Helvetica'));
  assert.ok(contenu.includes('(Bonjour) Tj'));

  // La position déclarée dans startxref doit pointer sur la table « xref ».
  const debutXref = Number(/startxref\s+(\d+)/.exec(contenu)[1]);
  assert.equal(contenu.slice(debutXref, debutXref + 4), 'xref');
});

test('les accents et les parenthèses sont correctement encodés', () => {
  const doc = nouveauDocument();
  texte(doc, 'Dépose à 9h30 (RDV) \\ n° 5 — œuvre');
  const contenu = ecrireDocument(doc).toString('latin1');
  assert.ok(contenu.includes('D\xE9pose \xE0 9h30'), 'é et à doivent être en WinAnsi');
  assert.ok(contenu.includes('\\(RDV\\)'), 'les parenthèses doivent être échappées');
  assert.ok(contenu.includes('\\\\'), 'l’antislash doit être échappé');
  assert.ok(contenu.includes('\x9C'), 'œ doit être encodé en WinAnsi (0x9C)');
});

test('feuille de journée complète', () => {
  // On fabrique une vingtaine de rendez-vous pour forcer plusieurs pages.
  const poses = [];
  const date = '2026-08-25';
  const heures = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00'];
  let n = 0;
  for (const heure of heures) {
    for (const materiels of [
      [{ categorie: 'holter_ecg', marque: 'DMS', dureeHeures: 24 }],
      [{ categorie: 'mapa', dureeHeures: 24 }],
    ]) {
      const plan = planifier({
        rdvCardio: `${date} ${heure}`,
        materiels,
        appareils: APPAREILS,
        poses,
      });
      if (!plan.possible) continue;
      n++;
      for (const ligne of plan.lignes) {
        poses.push({
          id: `p${n}`,
          rdv_id: `r${n}`,
          appareil_id: ligne.appareil.id,
          duree_heures: ligne.demande.dureeHeures,
          debut: ligne.pose,
          fin: ligne.depose,
          statut: 'prevu',
          retour_effectif: null,
          rdv: {
            patient_nom: `PATIENT${n}`,
            patient_sexe: n % 2 ? 'F' : 'M',
            cardiologue: 'MA',
            rdv_cardio: `${date} ${heure}`,
          },
        });
      }
    }
  }
  assert.ok(poses.length >= 20, 'le jeu d’essai doit contenir assez de rendez-vous');

  const pdf = construirePdfJournee({ date, poses, appareils: APPAREILS, parametres: {} });
  const contenu = pdf.toString('latin1');

  assert.ok(pdf.length > 3000);
  assert.ok(contenu.includes('Rendez-vous du mardi 25 ao\xFBt 2026'));
  assert.ok(contenu.includes('PATIENT1'));
  assert.ok(contenu.includes('page 1/'));
  assert.equal(nomFichierPdf(date), 'rendez-vous 25-08-2026.pdf');

  const dossier = join(tmpdir(), 'planning-holter-tests');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'journee.pdf'), pdf);
});

test('journée sans rendez-vous', () => {
  const pdf = construirePdfJournee({
    date: '2026-08-23', poses: [], appareils: APPAREILS, parametres: {},
  });
  const contenu = pdf.toString('latin1');
  assert.ok(contenu.includes('Aucun rendez-vous'));
  assert.ok(contenu.includes('Cabinet ferm\xE9'));
});
