/**
 * xlsx.js — Générateur de fichiers Excel (.xlsx), écrit spécialement pour ce
 * projet. Aucune bibliothèque externe n'est nécessaire.
 *
 * Un fichier .xlsx est une archive ZIP contenant des fichiers XML. Ce module
 * construit ces XML puis les assemble dans une archive ZIP « sans compression »,
 * format qu'Excel, LibreOffice et Google Sheets acceptent tous.
 *
 * Fonctionne à l'identique dans le navigateur et dans Node.js.
 *
 * Utilisation :
 *   const classeur = nouveauClasseur();
 *   ajouterFeuille(classeur, {
 *     nom: 'Planning',
 *     colonnes: [{ largeur: 10 }, { largeur: 28 }],
 *     lignes: [
 *       [{ v: 'Heure', s: 'entete' }, { v: 'Patient', s: 'entete' }],
 *       [{ v: '08:00' }, { v: 'DUPONT Jean' }],
 *     ],
 *     figer: { lignes: 1, colonnes: 0 },
 *   });
 *   const octets = ecrireClasseur(classeur); // Uint8Array
 */

// ---------------------------------------------------------------------------
// Styles disponibles (référencés par leur nom dans les cellules)
// ---------------------------------------------------------------------------

/**
 * Chaque style décrit : police, remplissage, bordures, format et alignement.
 * `couleur` et `fond` sont des codes hexadécimaux sans dièse (ex. '1D4ED8').
 */
export const STYLES = {
  normal: {},
  gras: { gras: true },
  titre: { gras: true, taille: 14 },
  soustitre: { gras: true, taille: 11, couleur: '475569' },
  entete: { gras: true, couleur: 'FFFFFF', fond: '1E293B', bordure: true, alignement: { h: 'center', v: 'center' } },
  cellule: { bordure: true, alignement: { v: 'center' } },
  celluleCentree: { bordure: true, alignement: { h: 'center', v: 'center' } },
  heure: { gras: true, bordure: true, alignement: { h: 'center', v: 'center' }, fond: 'F1F5F9' },
  date: { bordure: true, format: 'dd/mm/yyyy', alignement: { h: 'center', v: 'center' } },
  nombre: { bordure: true, format: '0', alignement: { h: 'center', v: 'center' } },
  decimal: { bordure: true, format: '0.0', alignement: { h: 'center', v: 'center' } },
  alerte: { gras: true, couleur: '991B1B', fond: 'FEE2E2', bordure: true },
  // Couleurs de matériel, alignées sur celles de l'interface
  holterDMS: { bordure: true, fond: 'DBEAFE', couleur: '1E3A8A', alignement: { v: 'center' } },
  holterELA: { bordure: true, fond: 'E0F2FE', couleur: '1D4ED8', alignement: { v: 'center' } },
  mapa: { bordure: true, fond: 'EDE9FE', couleur: '5B21B6', alignement: { v: 'center' } },
  polygraphie: { bordure: true, fond: 'CCFBF1', couleur: '0F766E', alignement: { v: 'center' } },
  spider: { bordure: true, fond: 'FFEDD5', couleur: 'C2410C', alignement: { v: 'center' } },
  depose: { bordure: true, fond: 'F8FAFC', couleur: '334155', italique: true, alignement: { v: 'center' } },
};

/** Nom de style correspondant à un appareil (utilisé par les exports). */
export function styleDuMateriel(categorie, marque) {
  if (categorie === 'holter_ecg') return marque === 'ELA' ? 'holterELA' : 'holterDMS';
  if (categorie === 'mapa') return 'mapa';
  if (categorie === 'polygraphie') return 'polygraphie';
  if (categorie === 'spider') return 'spider';
  return 'cellule';
}

// ---------------------------------------------------------------------------
// Construction du classeur
// ---------------------------------------------------------------------------

export function nouveauClasseur() {
  return { feuilles: [] };
}

/**
 * @param {object} classeur
 * @param {object} feuille
 * @param {string} feuille.nom
 * @param {Array<{largeur?: number}>} [feuille.colonnes]
 * @param {Array<Array<object|string|number|null>>} feuille.lignes
 * @param {{lignes?: number, colonnes?: number}} [feuille.figer]
 * @param {Array<string>} [feuille.fusions]  ex. ['A1:D1']
 * @param {boolean} [feuille.filtre]         ajoute un filtre automatique sur la 1re ligne
 */
export function ajouterFeuille(classeur, feuille) {
  classeur.feuilles.push({
    nom: nettoyerNomFeuille(feuille.nom),
    colonnes: feuille.colonnes || [],
    lignes: feuille.lignes || [],
    figer: feuille.figer || null,
    fusions: feuille.fusions || [],
    filtre: feuille.filtre === true,
    hauteurs: feuille.hauteurs || {},
  });
  return classeur;
}

/** Excel interdit certains caractères et limite les noms à 31 caractères. */
function nettoyerNomFeuille(nom) {
  return String(nom).replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Feuille';
}

// ---------------------------------------------------------------------------
// Conversion des valeurs
// ---------------------------------------------------------------------------

/** Numéro de colonne (0 = A) -> lettre(s). */
export function lettreColonne(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - reste) / 26);
  }
  return s;
}

/** "AAAA-MM-JJ" -> numéro de série Excel (jours depuis le 30/12/1899). */
export function serieExcel(date) {
  const [a, m, j] = String(date).slice(0, 10).split('-').map(Number);
  const jours = Math.round(Date.UTC(a, m - 1, j) / 86400000);
  return jours + 25569;
}

function echapperXml(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Excel refuse les caractères de contrôle.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Normalise une cellule saisie sous forme abrégée. */
function normaliserCellule(brut) {
  if (brut === null || brut === undefined || brut === '') return null;
  if (typeof brut === 'object' && !(brut instanceof Date)) return brut;
  return { v: brut };
}

// ---------------------------------------------------------------------------
// Génération des XML
// ---------------------------------------------------------------------------

const EN_TETE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function construireStyles() {
  const noms = Object.keys(STYLES);

  // Polices
  const polices = noms.map((nom) => {
    const s = STYLES[nom];
    return '<font>'
      + (s.gras ? '<b/>' : '')
      + (s.italique ? '<i/>' : '')
      + `<sz val="${s.taille || 11}"/>`
      + (s.couleur ? `<color rgb="FF${s.couleur}"/>` : '')
      + '<name val="Calibri"/></font>';
  });

  // Remplissages : les deux premiers sont imposés par le format Excel.
  const fonds = ['<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>'];
  const indexFond = {};
  noms.forEach((nom) => {
    const s = STYLES[nom];
    if (!s.fond) return;
    if (indexFond[s.fond] === undefined) {
      indexFond[s.fond] = fonds.length;
      fonds.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fond}"/>`
        + '<bgColor indexed="64"/></patternFill></fill>');
    }
  });

  // Bordures
  const bordures = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFCBD5E1"/></left>'
    + '<right style="thin"><color rgb="FFCBD5E1"/></right>'
    + '<top style="thin"><color rgb="FFCBD5E1"/></top>'
    + '<bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>'];

  // Formats de nombre personnalisés (les identifiants < 164 sont réservés)
  const formats = [];
  const indexFormat = {};
  noms.forEach((nom) => {
    const s = STYLES[nom];
    if (!s.format) return;
    if (indexFormat[s.format] === undefined) {
      const id = 164 + formats.length;
      indexFormat[s.format] = id;
      formats.push(`<numFmt numFmtId="${id}" formatCode="${echapperXml(s.format)}"/>`);
    }
  });

  // Un « xf » par style déclaré, dans l'ordre des noms.
  const xfs = noms.map((nom, i) => {
    const s = STYLES[nom];
    const fillId = s.fond ? indexFond[s.fond] : 0;
    const borderId = s.bordure ? 1 : 0;
    const numFmtId = s.format ? indexFormat[s.format] : 0;
    const al = s.alignement;
    const alignement = al
      ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}`
        + `${al.retour ? ' wrapText="1"' : ''}/>`
      : '';
    return `<xf numFmtId="${numFmtId}" fontId="${i}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
      + ` applyFont="1"${s.fond ? ' applyFill="1"' : ''}${s.bordure ? ' applyBorder="1"' : ''}`
      + `${s.format ? ' applyNumberFormat="1"' : ''}${al ? ' applyAlignment="1"' : ''}`
      + (alignement ? `>${alignement}</xf>` : '/>');
  });

  return `${EN_TETE_XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + (formats.length ? `<numFmts count="${formats.length}">${formats.join('')}</numFmts>` : '')
    + `<fonts count="${polices.length}">${polices.join('')}</fonts>`
    + `<fills count="${fonds.length}">${fonds.join('')}</fills>`
    + `<borders count="${bordures.length}">${bordures.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

const INDEX_STYLE = Object.keys(STYLES).reduce((acc, nom, i) => {
  acc[nom] = i;
  return acc;
}, {});

function construireFeuille(feuille) {
  const colonnes = feuille.colonnes.length
    ? `<cols>${feuille.colonnes.map((c, i) => (
      `<col min="${i + 1}" max="${i + 1}" width="${c.largeur || 12}" customWidth="1"/>`
    )).join('')}</cols>`
    : '';

  const lignes = feuille.lignes.map((cellules, indexLigne) => {
    const numero = indexLigne + 1;
    const hauteur = feuille.hauteurs[numero];
    const contenu = cellules.map((brut, indexColonne) => {
      const cellule = normaliserCellule(brut);
      if (cellule === null) return '';
      const ref = `${lettreColonne(indexColonne)}${numero}`;
      const style = INDEX_STYLE[cellule.s] !== undefined ? ` s="${INDEX_STYLE[cellule.s]}"` : '';

      // Cellule vide mais mise en forme (quadrillage, lignes à remplir) :
      // on n'écrit que le style, pas de texte. Cela allège beaucoup le fichier.
      if (cellule.v === '' || cellule.v === null || cellule.v === undefined) {
        return `<c r="${ref}"${style}/>`;
      }
      if (cellule.type === 'date') {
        return `<c r="${ref}"${style}><v>${serieExcel(cellule.v)}</v></c>`;
      }
      if (typeof cellule.v === 'number') {
        return `<c r="${ref}"${style}><v>${cellule.v}</v></c>`;
      }
      if (typeof cellule.v === 'boolean') {
        return `<c r="${ref}"${style} t="b"><v>${cellule.v ? 1 : 0}</v></c>`;
      }
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">`
        + `${echapperXml(cellule.v)}</t></is></c>`;
    }).join('');
    return `<row r="${numero}"${hauteur ? ` ht="${hauteur}" customHeight="1"` : ''}>${contenu}</row>`;
  }).join('');

  // Volets figés
  let vue = '<sheetView workbookViewId="0"/>';
  if (feuille.figer && (feuille.figer.lignes || feuille.figer.colonnes)) {
    const x = feuille.figer.colonnes || 0;
    const y = feuille.figer.lignes || 0;
    const cellule = `${lettreColonne(x)}${y + 1}`;
    vue = '<sheetView workbookViewId="0">'
      + `<pane xSplit="${x}" ySplit="${y}" topLeftCell="${cellule}" activePane="bottomRight" state="frozen"/>`
      + `<selection pane="bottomRight" activeCell="${cellule}" sqref="${cellule}"/>`
      + '</sheetView>';
  }

  const fusions = feuille.fusions.length
    ? `<mergeCells count="${feuille.fusions.length}">`
      + feuille.fusions.map((f) => `<mergeCell ref="${f}"/>`).join('')
      + '</mergeCells>'
    : '';

  const nbLignes = feuille.lignes.length;
  const nbColonnes = Math.max(1, ...feuille.lignes.map((l) => l.length));
  const etendue = `A1:${lettreColonne(nbColonnes - 1)}${Math.max(1, nbLignes)}`;
  const filtre = feuille.filtre ? `<autoFilter ref="${etendue}"/>` : '';

  return `${EN_TETE_XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews>${vue}</sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + colonnes
    + `<sheetData>${lignes}</sheetData>`
    + fusions
    + filtre
    + '</worksheet>';
}

function construireClasseurXml(classeur) {
  const feuilles = classeur.feuilles.map((f, i) => (
    `<sheet name="${echapperXml(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  )).join('');
  return `${EN_TETE_XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${feuilles}</sheets></workbook>`;
}

function construireRelations(classeur) {
  const rels = classeur.feuilles.map((_, i) => (
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/`
    + `relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  )).join('');
  const idStyles = classeur.feuilles.length + 1;
  return `${EN_TETE_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + rels
    + `<Relationship Id="rId${idStyles}" Type="http://schemas.openxmlformats.org/officeDocument/2006/`
    + 'relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';
}

function construireTypesContenu(classeur) {
  const feuilles = classeur.feuilles.map((_, i) => (
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-`
    + 'officedocument.spreadsheetml.worksheet+xml"/>'
  )).join('');
  return `${EN_TETE_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-'
    + 'officedocument.spreadsheetml.sheet.main+xml"/>'
    + feuilles
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-'
    + 'officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';
}

const RELATIONS_RACINE = `${EN_TETE_XML}`
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
  + 'relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

// ---------------------------------------------------------------------------
// Archive ZIP (méthode « stockage », sans compression)
// ---------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function versOctets(texte) {
  return new TextEncoder().encode(texte);
}

/** Assemble des fichiers { nom, contenu } en une archive ZIP (Uint8Array). */
export function creerZip(fichiers) {
  const entrees = fichiers.map((f) => {
    const nom = versOctets(f.nom);
    const donnees = typeof f.contenu === 'string' ? versOctets(f.contenu) : f.contenu;
    return { nom, donnees, crc: crc32(donnees) };
  });

  const morceaux = [];
  const central = [];
  let position = 0;

  for (const e of entrees) {
    const entete = new Uint8Array(30 + e.nom.length);
    const vue = new DataView(entete.buffer);
    vue.setUint32(0, 0x04034B50, true); // signature
    vue.setUint16(4, 20, true);         // version minimale
    vue.setUint16(6, 0x0800, true);     // noms de fichier en UTF-8
    vue.setUint16(8, 0, true);          // méthode 0 = stockage
    vue.setUint16(10, 0, true);         // heure
    vue.setUint16(12, 0x2821, true);    // date (01/01/2000)
    vue.setUint32(14, e.crc, true);
    vue.setUint32(18, e.donnees.length, true);
    vue.setUint32(22, e.donnees.length, true);
    vue.setUint16(26, e.nom.length, true);
    vue.setUint16(28, 0, true);
    entete.set(e.nom, 30);

    morceaux.push(entete, e.donnees);

    const fiche = new Uint8Array(46 + e.nom.length);
    const vf = new DataView(fiche.buffer);
    vf.setUint32(0, 0x02014B50, true);
    vf.setUint16(4, 20, true);
    vf.setUint16(6, 20, true);
    vf.setUint16(8, 0x0800, true);
    vf.setUint16(10, 0, true);
    vf.setUint16(12, 0, true);
    vf.setUint16(14, 0x2821, true);
    vf.setUint32(16, e.crc, true);
    vf.setUint32(20, e.donnees.length, true);
    vf.setUint32(24, e.donnees.length, true);
    vf.setUint16(28, e.nom.length, true);
    vf.setUint32(42, position, true);
    fiche.set(e.nom, 46);
    central.push(fiche);

    position += entete.length + e.donnees.length;
  }

  const tailleCentral = central.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const vfin = new DataView(fin.buffer);
  vfin.setUint32(0, 0x06054B50, true);
  vfin.setUint16(8, entrees.length, true);
  vfin.setUint16(10, entrees.length, true);
  vfin.setUint32(12, tailleCentral, true);
  vfin.setUint32(16, position, true);

  const tout = [...morceaux, ...central, fin];
  const total = tout.reduce((n, m) => n + m.length, 0);
  const resultat = new Uint8Array(total);
  let decalage = 0;
  for (const m of tout) {
    resultat.set(m, decalage);
    decalage += m.length;
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/** Produit le contenu binaire du fichier .xlsx. */
export function ecrireClasseur(classeur) {
  if (classeur.feuilles.length === 0) {
    throw new Error('Le classeur ne contient aucune feuille.');
  }
  const fichiers = [
    { nom: '[Content_Types].xml', contenu: construireTypesContenu(classeur) },
    { nom: '_rels/.rels', contenu: RELATIONS_RACINE },
    { nom: 'xl/workbook.xml', contenu: construireClasseurXml(classeur) },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: construireRelations(classeur) },
    { nom: 'xl/styles.xml', contenu: construireStyles() },
    ...classeur.feuilles.map((f, i) => ({
      nom: `xl/worksheets/sheet${i + 1}.xml`,
      contenu: construireFeuille(f),
    })),
  ];
  return creerZip(fichiers);
}

/** Déclenche le téléchargement du classeur depuis le navigateur. */
export function telechargerClasseur(classeur, nomFichier) {
  const octets = ecrireClasseur(classeur);
  const blob = new Blob([octets], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
