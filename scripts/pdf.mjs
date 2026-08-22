/**
 * pdf.mjs — Générateur de PDF minimal, écrit pour ce projet.
 *
 * Il produit des documents texte et tableaux (police Helvetica), ce qui suffit
 * largement pour la feuille des rendez-vous du lendemain. Aucune bibliothèque
 * externe n'est nécessaire.
 *
 * Format : PDF 1.4, pages A4, contenu non compressé, encodage WinAnsi
 * (les accents français sont correctement rendus).
 */

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 34;

// ---------------------------------------------------------------------------
// Encodage du texte
// ---------------------------------------------------------------------------

/** Caractères présents dans WinAnsi mais absents de l'ISO-8859-1. */
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91,
  '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
  '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
};

function encoderTexte(texte) {
  const octets = [];
  for (const caractere of String(texte)) {
    const code = caractere.codePointAt(0);
    if (CP1252[caractere] !== undefined) octets.push(CP1252[caractere]);
    else if (code < 256) octets.push(code);
    else octets.push(0x3F); // « ? » pour tout caractère non représentable
  }
  return Buffer.from(octets);
}

/** Échappe les caractères réservés d'une chaîne PDF puis l'encode. */
function chaine(texte) {
  const brut = encoderTexte(texte);
  const sortie = [0x28]; // (
  for (const octet of brut) {
    if (octet === 0x28 || octet === 0x29 || octet === 0x5C) sortie.push(0x5C);
    sortie.push(octet);
  }
  sortie.push(0x29); // )
  return Buffer.from(sortie);
}

// ---------------------------------------------------------------------------
// Largeur des caractères Helvetica (millièmes de point), pour couper le texte
// ---------------------------------------------------------------------------

const LARGEURS_HELVETICA = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

/** Largeur approximative d'un texte, en points. */
export function largeurTexte(texte, taille) {
  let total = 0;
  for (const c of String(texte)) total += LARGEURS_HELVETICA[c] ?? 556;
  return (total / 1000) * taille;
}

/** Tronque un texte pour qu'il tienne dans une largeur donnée. */
export function tronquer(texte, taille, largeurMax) {
  const t = String(texte);
  if (largeurTexte(t, taille) <= largeurMax) return t;
  let resultat = '';
  for (const c of t) {
    if (largeurTexte(`${resultat}${c}…`, taille) > largeurMax) break;
    resultat += c;
  }
  return `${resultat}…`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function nouveauDocument() {
  return { pages: [], page: null };
}

export function nouvellePage(document) {
  document.page = { instructions: [], y: A4.hauteur - MARGE };
  document.pages.push(document.page);
  return document.page;
}

/**
 * Écrit une ligne de texte.
 * @param {object} options  { x, y, taille, gras, couleur: [r,g,b] (0-1) }
 */
export function texte(document, contenu, options = {}) {
  const page = document.page || nouvellePage(document);
  const taille = options.taille || 10;
  const x = options.x ?? MARGE;
  const y = options.y ?? page.y;
  const police = options.gras ? '/F2' : '/F1';
  const couleur = options.couleur || [0, 0, 0];

  page.instructions.push(Buffer.concat([
    Buffer.from(`${couleur.map((c) => c.toFixed(3)).join(' ')} rg\nBT ${police} ${taille} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td `),
    chaine(contenu),
    Buffer.from(' Tj ET\n'),
  ]));
  return page;
}

/** Rectangle plein (fonds de lignes, bandeaux). */
export function rectangle(document, x, y, largeur, hauteur, couleur) {
  const page = document.page || nouvellePage(document);
  page.instructions.push(Buffer.from(
    `${couleur.map((c) => c.toFixed(3)).join(' ')} rg\n`
    + `${x.toFixed(2)} ${y.toFixed(2)} ${largeur.toFixed(2)} ${hauteur.toFixed(2)} re f\n`,
  ));
}

/** Trait horizontal. */
export function ligne(document, x1, y1, x2, y2, couleur = [0.8, 0.8, 0.8], epaisseur = 0.5) {
  const page = document.page || nouvellePage(document);
  page.instructions.push(Buffer.from(
    `${couleur.map((c) => c.toFixed(3)).join(' ')} RG ${epaisseur} w\n`
    + `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`,
  ));
}

export const DIMENSIONS = { ...A4, marge: MARGE, largeurUtile: A4.largeur - 2 * MARGE };

// ---------------------------------------------------------------------------
// Assemblage du fichier
// ---------------------------------------------------------------------------

/** @returns {Buffer} contenu binaire du PDF */
export function ecrireDocument(document) {
  if (document.pages.length === 0) nouvellePage(document);

  const objets = [];
  const nbPages = document.pages.length;
  // Numérotation : 1 = catalogue, 2 = arbre des pages,
  // 3..(2+n) = pages, puis les contenus, puis les deux polices.
  const idPage = (i) => 3 + i;
  const idContenu = (i) => 3 + nbPages + i;
  const idPolice = 3 + 2 * nbPages;

  objets[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objets[2] = Buffer.from(
    `<< /Type /Pages /Kids [${document.pages.map((_, i) => `${idPage(i)} 0 R`).join(' ')}] `
    + `/Count ${nbPages} >>`,
  );

  document.pages.forEach((page, i) => {
    objets[idPage(i)] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largeur} ${A4.hauteur}] `
      + `/Resources << /Font << /F1 ${idPolice} 0 R /F2 ${idPolice + 1} 0 R >> >> `
      + `/Contents ${idContenu(i)} 0 R >>`,
    );
    const flux = Buffer.concat(page.instructions);
    objets[idContenu(i)] = Buffer.concat([
      Buffer.from(`<< /Length ${flux.length} >>\nstream\n`),
      flux,
      Buffer.from('\nendstream'),
    ]);
  });

  objets[idPolice] = Buffer.from(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  objets[idPolice + 1] = Buffer.from(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  // Corps du fichier, en mémorisant la position de chaque objet.
  const morceaux = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let position = morceaux[0].length;
  const positions = [];

  for (let i = 1; i < objets.length; i++) {
    positions[i] = position;
    const bloc = Buffer.concat([
      Buffer.from(`${i} 0 obj\n`), objets[i], Buffer.from('\nendobj\n'),
    ]);
    morceaux.push(bloc);
    position += bloc.length;
  }

  // Table des références croisées
  const nbObjets = objets.length;
  let xref = `xref\n0 ${nbObjets}\n0000000000 65535 f \n`;
  for (let i = 1; i < nbObjets; i++) {
    xref += `${String(positions[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nbObjets} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  morceaux.push(Buffer.from(xref));

  return Buffer.concat(morceaux);
}
