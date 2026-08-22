# Planning Holter

Interface de planification des **Holter ECG, MAPA, polygraphies ventilatoires et
Spider Flash**, destinée à remplacer le planning papier du secrétariat.

Plusieurs secrétaires peuvent l'utiliser en même temps, depuis un ordinateur ou
un téléphone ; chacune voit immédiatement les modifications des autres, et le
logiciel garantit qu'un même appareil ne peut jamais être attribué à deux
patients sur des périodes qui se chevauchent.

---

## Par où commencer

| Vous voulez…                                   | Lisez                                                        |
|------------------------------------------------|--------------------------------------------------------------|
| **Essayer le logiciel tout de suite**          | [Essayer sans rien installer](#essayer-sans-rien-installer)  |
| **Mettre le logiciel en service**              | [docs/01-INSTALLATION.md](docs/01-INSTALLATION.md)           |
| Apprendre à vous en servir au quotidien        | [docs/02-UTILISATION.md](docs/02-UTILISATION.md)             |
| Comprendre les sauvegardes et le mode secours  | [docs/03-SAUVEGARDES.md](docs/03-SAUVEGARDES.md)             |
| Demander une évolution du logiciel             | [docs/04-MISES-A-JOUR.md](docs/04-MISES-A-JOUR.md)           |
| **Répondre aux questions en attente**          | [docs/05-POINTS-A-VALIDER.md](docs/05-POINTS-A-VALIDER.md)   |

> **À faire avant la mise en service** : deux points restent ouverts — le
> serveur d'envoi des e-mails, et votre décision sur l'hébergement. Ils sont
> détaillés dans [docs/05-POINTS-A-VALIDER.md](docs/05-POINTS-A-VALIDER.md).

---

## Essayer sans rien installer

**→ https://hacuubo.github.io/planning-holter/web/demonstration.html**

Une version de démonstration, remplie de patients fictifs, permet de tout
essayer sans risque, sans compte à créer et sans rien installer. Elle
fonctionne aussi bien sur ordinateur que sur téléphone.

Rien n'y est enregistré : en rechargeant la page, tout repart à zéro.

Pour la faire tourner sur votre propre ordinateur plutôt qu'en ligne, voir
[docs/01-INSTALLATION.md](docs/01-INSTALLATION.md), annexe « Essayer en local ».

---

## Ce que fait le logiciel

**Onglet Journée** — le programme de la personne qui pose et dépose le matériel,
quart d'heure par quart d'heure, avec un code couleur par type d'appareil
(deux nuances de bleu distinguent les Holter DMS des Holter ELA). Deux boutons :
« Posé » et « Rendu ». Un appareil rendu redevient disponible immédiatement.

**Onglet Rendez-vous** — la secrétaire saisit le rendez-vous avec le cardiologue
et le matériel souhaité. Le logiciel calcule tout le reste :

- la **dépose** 20 minutes avant le rendez-vous cardiologue, pour que le résultat
  soit disponible pendant la consultation ;
- la **pose** la durée de port plus tôt (la veille pour 24 h, 7 jours avant pour
  le Spider Flash), en tenant compte des week-ends et des jours fériés — la veille
  d'un lundi est le samedi, dernière pose à 11h45 ;
- le **numéro d'appareil** à donner, en faisant tourner le parc de façon homogène ;
- si le matériel demandé est indisponible, il le **dit clairement** et propose
  d'autres jours et d'autres heures ;
- si aucun Holter ELA n'est libre, il **bascule automatiquement sur un DMS**
  (et inversement) en le signalant.

**Onglet Recherche** — retrouver un patient et annuler son rendez-vous ;
le matériel est aussitôt libéré.

**Onglet Calendrier** — une vue d'ensemble : le matériel en lignes, les jours en
colonnes, un trait coloré sur chaque journée où l'appareil est chez un patient.

**Onglet Réglages** — parc matériel (ajout, retrait avec réattribution
automatique des patients concernés), horaires, nombre de patients par quart
d'heure, cardiologues, fermetures exceptionnelles, destinataires des e-mails,
statistiques de l'année et comptes utilisateurs.

**Tous les jours automatiquement** — un classeur Excel de sauvegarde complet,
un PDF des rendez-vous du lendemain, l'envoi par e-mail, et la suppression des
sauvegardes de plus de 7 jours.

---

## Comment c'est construit

Trois briques seulement, ce qui rend les évolutions simples et sans risque.

| Brique | Rôle | Coût |
|--------|------|------|
| **GitHub Pages** | héberge le site (des fichiers HTML/CSS/JavaScript) | gratuit |
| **Supabase** | base de données, comptes, temps réel, sauvegardes | gratuit à cette échelle |
| **GitHub Actions** | la tâche automatique quotidienne | gratuit |

Le site n'a **aucune étape de compilation** : les fichiers publiés sont
exactement ceux du dossier `web/`. Une mise à jour consiste à modifier un
fichier et à l'envoyer sur GitHub ; toutes les secrétaires ont la nouvelle
version au rechargement de la page, **sans aucune perte de rendez-vous**
puisque les données vivent dans Supabase et non dans le site.

### Organisation des fichiers

```
web/                     le site publié
  index.html             la page unique de l'application
  styles.css             toute la présentation
  config.js              ← LE SEUL FICHIER À REMPLIR
  js/core/               les règles métier (dates, matériel, attribution, Excel)
  js/data/               le dialogue avec la base de données
  js/ui/                 les cinq écrans
  demo/                  la démonstration (jamais utilisée en vrai)
  vendor/                la bibliothèque Supabase, recopiée dans le projet

supabase/                à coller dans Supabase, dans l'ordre : 01, 02, 03, 04
                         (05 = migration, uniquement si déjà installé avant)
scripts/                 la sauvegarde quotidienne (Excel, PDF, e-mail)
outils/                  la copie des sauvegardes dans un dossier du cabinet
tests/                   les vérifications automatiques
docs/                    les guides
```

### Les vérifications automatiques

Le cahier des charges demande une vérification de débogage avant chaque mise en
service. Elle est automatisée : `npm test` exécute **65 contrôles** portant sur
les jours fériés, les horaires du samedi et du lundi, le calcul des poses et des
déposes, la non-réattribution d'un appareil déjà pris, la rotation du parc, la
saturation des créneaux, la bascule ELA/DMS, la génération des fichiers Excel et
des PDF. Ces tests sont aussi relancés automatiquement avant chaque sauvegarde
quotidienne.

---

## Sécurité et données personnelles

- **Le minimum de données** : pour chaque patient, le logiciel n'enregistre que
  le **nom de famille** et le **sexe**. Ni prénom, ni date de naissance.
- Aucune donnée n'est visible sans compte : la base refuse par défaut tout accès,
  et n'autorise que les comptes rattachés à un profil **actif** (règles RLS).
- Un nouveau compte est créé **inactif** ; un administrateur doit l'activer.
- Toutes les actions sensibles sont tracées dans un journal.
- Le dépôt GitHub ne contient **jamais** de données de patients : les sauvegardes
  sont exclues par `.gitignore` et effacées à la fin de la tâche automatique.
- La clé publique présente dans `config.js` est prévue pour être publique ; elle
  ne donne accès à rien sans identifiants.

> **Point juridique à connaître.** Même réduit au nom et au sexe, un planning
> qui associe une personne à un examen cardiologique reste une donnée de santé
> pseudonymisée. Ce type de donnée doit en principe être hébergé chez un
> **hébergeur certifié HDS** ; Supabase ne l'est pas. Le choix a été fait en
> connaissance de cause ; il est détaillé, avec les options possibles, dans
> [docs/05-POINTS-A-VALIDER.md](docs/05-POINTS-A-VALIDER.md).
