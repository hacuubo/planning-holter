/**
 * Vérifie la tâche de sauvegarde quotidienne de bout en bout, en faisant
 * dialoguer le vrai script avec un faux serveur Supabase local.
 *
 * On contrôle ainsi que les requêtes envoyées sont les bonnes, que les
 * fichiers sont produits, déposés, et que la purge à 7 jours fonctionne.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajouterJours, aujourdHui, dateEnFrancais } from '../web/js/core/dates.js';
import { INVENTAIRE_INITIAL } from '../web/js/core/materiel.js';
import { HORAIRES_PAR_DEFAUT } from '../web/js/core/dates.js';
import { planifier } from '../web/js/core/regles.js';

const executer = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/sauvegarde-quotidienne.mjs', import.meta.url));

const APPAREILS = INVENTAIRE_INITIAL.map((a, i) => ({ ...a, id: `app-${i}`, actif: true }));

/** Quelques rendez-vous répartis sur les jours à venir. */
function jeuDeDonnees() {
  const poses = [];
  let n = 0;
  for (let jour = 0; jour <= 4; jour++) {
    for (const heure of ['09:00', '10:30', '15:00']) {
      const plan = planifier({
        rdvCardio: `${ajouterJours(aujourdHui(), jour)} ${heure}`,
        materiels: [{ categorie: n % 2 ? 'mapa' : 'holter_ecg', marque: 'DMS', dureeHeures: 24 }],
        appareils: APPAREILS,
        poses,
      });
      if (!plan.possible) continue;
      n++;
      for (const l of plan.lignes) {
        poses.push({
          id: `pose-${n}`,
          rdv_id: `rdv-${n}`,
          appareil_id: l.appareil.id,
          duree_heures: l.demande.dureeHeures,
          debut: `${l.pose}:00`,
          fin: `${l.depose}:00`,
          retour_effectif: null,
          statut: 'prevu',
          rendez_vous: {
            id: `rdv-${n}`,
            patient_nom: `PATIENT${n}`,
            patient_sexe: 'F',
            cardiologue: 'MA',
            rdv_cardio: `${ajouterJours(aujourdHui(), jour)} ${heure}:00`,
            statut: 'prevu',
            telephone: null,
            commentaire: null,
            cree_par_nom: 'Test',
          },
        });
      }
    }
  }
  return poses;
}

/** Faux Supabase : répond aux requêtes REST et de stockage utilisées. */
function fauxSupabase(etat) {
  return createServer((requete, reponse) => {
    const url = new URL(requete.url, 'http://localhost');
    etat.appels.push(`${requete.method} ${url.pathname}`);

    const corps = [];
    requete.on('data', (c) => corps.push(c));
    requete.on('end', () => {
      const json = (donnees, code = 200) => {
        reponse.writeHead(code, { 'Content-Type': 'application/json' });
        reponse.end(JSON.stringify(donnees));
      };

      if (url.pathname === '/rest/v1/appareils') return json(APPAREILS);
      if (url.pathname === '/rest/v1/parametres') {
        return json([
          { cle: 'planification', valeur: { posesParCreneau: 1, minutesAvantRdvCardio: 15 } },
          { cle: 'horaires', valeur: HORAIRES_PAR_DEFAUT },
          { cle: 'sauvegarde', valeur: { destinataires: [], frequence: 'quotidien', joursConservation: 7 } },
        ]);
      }
      if (url.pathname === '/rest/v1/poses') {
        // On vérifie que le script filtre bien sur une plage de dates.
        etat.filtresPoses = [...url.searchParams.getAll('debut')];
        return json(etat.poses);
      }

      if (url.pathname.startsWith('/storage/v1/object/list/')) {
        return json(etat.stockage.map((nom) => ({ name: nom })));
      }
      if (requete.method === 'POST' && url.pathname.startsWith('/storage/v1/object/')) {
        const nom = decodeURIComponent(url.pathname.split('/storage/v1/object/sauvegardes/')[1]);
        etat.stockage.push(nom);
        etat.deposes.push({ nom, taille: Buffer.concat(corps).length });
        return json({ Key: nom });
      }
      if (requete.method === 'DELETE' && url.pathname.startsWith('/storage/v1/object/')) {
        const { prefixes } = JSON.parse(Buffer.concat(corps).toString() || '{}');
        etat.supprimes = prefixes || [];
        etat.stockage = etat.stockage.filter((n) => !etat.supprimes.includes(n));
        return json([]);
      }

      json({ erreur: 'route inconnue' }, 404);
    });
  });
}

test('sauvegarde quotidienne complète', async () => {
  const etat = {
    poses: jeuDeDonnees(),
    appels: [],
    deposes: [],
    supprimes: [],
    // Deux vieilles sauvegardes qui doivent disparaître, une récente à garder.
    stockage: [
      `sauvegarde holter ${dateEnFrancais(ajouterJours(aujourdHui(), -30)).replace(/\//g, '-')}.xlsx`,
      `sauvegarde holter ${dateEnFrancais(ajouterJours(aujourdHui(), -8)).replace(/\//g, '-')}.xlsx`,
      `sauvegarde holter ${dateEnFrancais(ajouterJours(aujourdHui(), -2)).replace(/\//g, '-')}.xlsx`,
    ],
  };

  const serveur = fauxSupabase(etat);
  await new Promise((r) => serveur.listen(0, r));
  const port = serveur.address().port;
  const dossier = mkdtempSync(join(tmpdir(), 'holter-sauvegarde-'));

  try {
    const { stdout } = await executer(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${port}`,
        SUPABASE_SERVICE_KEY: 'cle-de-test',
        DOSSIER_SAUVEGARDE: dossier,
        SMTP_HOST: '', // aucun envoi d'e-mail pendant le test
      },
    });

    assert.match(stdout, /Sauvegarde termin/);

    // 1. Les trois lectures attendues ont bien eu lieu.
    assert.ok(etat.appels.includes('GET /rest/v1/appareils'));
    assert.ok(etat.appels.includes('GET /rest/v1/parametres'));
    assert.ok(etat.appels.includes('GET /rest/v1/poses'));
    assert.equal(etat.filtresPoses.length, 2, 'les poses doivent être filtrées sur une plage');

    // 2. Les deux fichiers sont écrits localement, avec les bons noms.
    const fichiers = readdirSync(dossier);
    const jour = dateEnFrancais(aujourdHui()).replace(/\//g, '-');
    const demain = dateEnFrancais(ajouterJours(aujourdHui(), 1)).replace(/\//g, '-');
    assert.ok(fichiers.includes(`sauvegarde holter ${jour}.xlsx`), fichiers.join(', '));
    assert.ok(fichiers.includes(`rendez-vous ${demain}.pdf`), fichiers.join(', '));

    // 3. Ce sont de vrais fichiers Excel et PDF.
    const excel = readFileSync(join(dossier, `sauvegarde holter ${jour}.xlsx`));
    assert.equal(excel.slice(0, 2).toString(), 'PK');
    assert.ok(excel.length > 5000);
    const pdf = readFileSync(join(dossier, `rendez-vous ${demain}.pdf`));
    assert.equal(pdf.slice(0, 5).toString(), '%PDF-');

    // 4. Les deux fichiers ont été déposés dans l'espace de sauvegarde.
    assert.equal(etat.deposes.length, 2);
    assert.ok(etat.deposes.every((d) => d.taille > 1000));

    // 5. La purge n'a supprimé que ce qui dépasse 7 jours.
    assert.deepEqual(
      etat.supprimes.sort(),
      [
        `sauvegarde holter ${dateEnFrancais(ajouterJours(aujourdHui(), -30)).replace(/\//g, '-')}.xlsx`,
        `sauvegarde holter ${dateEnFrancais(ajouterJours(aujourdHui(), -8)).replace(/\//g, '-')}.xlsx`,
      ].sort(),
    );
  } finally {
    serveur.close();
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('message clair si la configuration est absente', async () => {
  const resultat = await executer(process.execPath, [SCRIPT], {
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' },
  }).catch((e) => e);

  const sortie = `${resultat.stdout || ''}${resultat.stderr || ''}`;
  assert.match(sortie, /Configuration manquante/);
  assert.match(sortie, /SUPABASE_URL/);
});
