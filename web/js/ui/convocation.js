/**
 * convocation.js — Fiche de convocation imprimable, remise au patient.
 *
 * Reprend le code couleur des fiches papier du cabinet : le numéro
 * d'appareil est mis en avant dans la couleur de sa catégorie, avec les
 * dates de pose, de dépose et le rendez-vous cardiologue. Les consignes
 * détaillées restent sur la fiche couleur remise avec l'appareil : cette
 * convocation ne s'occupe que du QUI, QUOI, QUAND.
 */

import { dateEnFrancaisLong, decouper } from '../core/dates.js';
import { couleursAppareil, libelleAppareil } from '../core/materiel.js';
import { notifier } from './base.js';

function echapper(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Ouvre une fenêtre d'impression avec la convocation.
 * @param {object} donnees
 * @param {string} donnees.patientNom
 * @param {string} donnees.cardiologue
 * @param {string} donnees.rdvCardio   "AAAA-MM-JJ HH:MM"
 * @param {Array}  donnees.lignes      [{ appareil, debut, fin }]
 * @param {string} [donnees.nomCabinet]
 */
export function imprimerConvocation({ patientNom, cardiologue, rdvCardio, lignes, nomCabinet }) {
  const fenetre = window.open('', '_blank', 'width=760,height=900');
  if (!fenetre) {
    notifier('La fenêtre d’impression a été bloquée par le navigateur : '
      + 'autorisez les fenêtres surgissantes pour ce site.', 'erreur');
    return;
  }

  const rdv = decouper(rdvCardio);
  const blocs = lignes.map((ligne) => {
    const c = couleursAppareil(ligne.appareil);
    const p = decouper(ligne.debut);
    const d = decouper(ligne.fin);
    return `
      <section style="border:2px solid ${c.couleur};border-radius:12px;overflow:hidden;margin:14px 0">
        <div style="background:${c.fond};color:${c.couleur};padding:10px 16px;display:flex;
                    justify-content:space-between;align-items:center;gap:12px">
          <strong style="font-size:1.05rem">${echapper(libelleAppareil(ligne.appareil))}</strong>
          <span style="font-size:1.6rem;font-weight:800">N° ${echapper(ligne.appareil.code)}</span>
        </div>
        <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:.78rem;color:#64748b;font-weight:700;text-transform:uppercase">Pose de l’appareil</div>
            <div style="font-weight:700">${echapper(dateEnFrancaisLong(p.date))}</div>
            <div style="font-size:1.3rem;font-weight:800">à ${echapper(p.heure)}</div>
          </div>
          <div>
            <div style="font-size:.78rem;color:#64748b;font-weight:700;text-transform:uppercase">Retrait de l’appareil</div>
            <div style="font-weight:700">${echapper(dateEnFrancaisLong(d.date))}</div>
            <div style="font-size:1.3rem;font-weight:800">à ${echapper(d.heure)}</div>
          </div>
        </div>
      </section>`;
  }).join('');

  fenetre.document.write(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Convocation — ${echapper(patientNom)}</title>
  <style>
    body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
           color: #0f172a; max-width: 640px; margin: 24px auto; padding: 0 18px; }
    @media print { .ne-pas-imprimer { display: none; } body { margin: 0 auto; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;
              border-bottom:2px solid #0f172a;padding-bottom:8px">
    <strong style="font-size:1.1rem">${echapper(nomCabinet || 'Planning Holter')}</strong>
    <span style="color:#64748b">Convocation</span>
  </div>

  <p style="margin:16px 0 4px;color:#64748b">Patient</p>
  <p style="margin:0;font-size:1.5rem;font-weight:800">${echapper(patientNom).toUpperCase()}</p>

  ${blocs}

  <section style="border:1px solid #cbd5e1;border-radius:12px;padding:12px 16px;margin:14px 0">
    <div style="font-size:.78rem;color:#64748b;font-weight:700;text-transform:uppercase">
      Rendez-vous avec le cardiologue (Dr ${echapper(cardiologue)})</div>
    <div style="font-weight:700">${echapper(dateEnFrancaisLong(rdv.date))}
      <span style="font-size:1.2rem;font-weight:800"> à ${echapper(rdv.heure)}</span></div>
  </section>

  <p style="color:#64748b;font-size:.9rem">
    Merci de vous présenter à l’heure indiquée, d’apporter cette fiche à chaque venue
    et de suivre les consignes de la fiche remise avec l’appareil.
    En cas d’empêchement, prévenez le secrétariat au plus tôt.
  </p>

  <p class="ne-pas-imprimer" style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="font:inherit;font-weight:700;padding:10px 22px;
      border-radius:8px;border:none;background:#0f766e;color:#fff;cursor:pointer">
      🖨 Imprimer</button>
  </p>
</body>
</html>`);
  fenetre.document.close();
  fenetre.focus();
  setTimeout(() => { try { fenetre.print(); } catch { /* l'utilisateur imprimera via le bouton */ } }, 350);
}
