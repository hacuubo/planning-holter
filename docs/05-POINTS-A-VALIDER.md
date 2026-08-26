# 5 — Points à valider avant la mise en service

Le cahier des charges comportait quelques éléments contradictoires ou
incomplets. Deux d'entre eux ont été **tranchés par le secrétariat** et sont
désormais intégrés au logiciel ; il reste une question pratique et une décision
de fond.

---

## ✅ Réglé — Le parc matériel exact

Le parc enregistré dans le logiciel est le suivant, **43 appareils** :

| Type | Appareils courants | Réservés aux urgences | Total |
|------|--------------------|------------------------|-------|
| Holter ECG **ELA** | 51 à 59 | **501**, **502** | 11 |
| Holter ECG **DMS** | 1 à 13 | **101** | 14 |
| **MAPA** | A à N **sans le L** (A, B, C, D, E, F, G, H, I, J, K, M, N) | **Y** | 14 |
| **Spider Flash** | SF1 | — | 1 |
| **Polygraphie ventilatoire** | N1, N2, N3 | — | 3 |

Deux précisions qui avaient dû être clarifiées :

- le Holter DMS d'urgence porte le numéro **101** (et non 502, qui désigne un
  Holter ELA) — chaque appareil est ainsi identifiable sans ambiguïté ;
- le MAPA **N** complète bien la série et porte le total à 14, conformément au
  cahier des charges.

Le MAPA « N » et le polygraphe « N1 » sont deux appareils distincts : le logiciel
les distingue par leur type, et les affiche toujours avec leur libellé complet
(« MAPA N » / « Polygraphie ventilatoire N1 »). Une vérification automatique
s'assure qu'aucun code ne peut devenir ambigu si vous ajoutez du matériel plus
tard.

> **À vérifier une fois en service** : ouvrez **Réglages ▸ Parc matériel** et
> comparez avec les appareils réellement présents dans les tiroirs. Tout ajout
> ou retrait se fait là, en quelques clics.

---

## ✅ Réglé — Les informations enregistrées sur les patients

Le cabinet a choisi de **réduire au strict minimum** les données conservées.
Pour chaque patient, le logiciel n'enregistre plus que :

| Enregistré | Non enregistré |
|------------|----------------|
| le **nom de famille** | le prénom |
| le **sexe** (F ou M) | la date de naissance |
| le téléphone (facultatif) | |

C'est un vrai gain : sans prénom ni date de naissance, un enregistrement est
bien plus difficile à rattacher à une personne précise.

**Deux conséquences pratiques à connaître :**

1. **Les homonymes.** Deux patients du même nom la même semaine ne se
   distinguent plus automatiquement. Utilisez la **note interne** du rendez-vous
   pour les différencier (« M. — suivi Dr RG », « Mme — 2ᵉ Holter »).
2. **La recherche** porte désormais uniquement sur le nom de famille.

> **Précision honnête sur le plan juridique.** Ces données restent, au sens du
> RGPD, des **données de santé pseudonymisées** : un nom associé à un examen
> cardiologique reste rattachable à une personne. Le risque est fortement réduit,
> il n'est pas nul. La question de l'hébergement ci-dessous garde donc son sens,
> même si elle se pose avec beaucoup moins d'acuité qu'auparavant.

Si vous souhaitez aller plus loin, il est possible de ne conserver que les
initiales, ou un numéro de dossier : dites-le-moi.

---

## ✅ Réglé — Qui renseigne l'adresse e-mail

Ce sont les **secrétaires**, directement dans
**Réglages ▸ Sauvegarde quotidienne et envoi par e-mail**. C'est la seule
rubrique des réglages ouverte à tous les comptes, sans être administratrice.

Tant qu'aucune adresse n'est enregistrée, l'application affiche **en permanence
un bandeau orange** en haut de l'écran, cliquable, qui mène directement au bon
endroit. Il disparaît de lui-même dès qu'une adresse est saisie.

Il reste une seule chose à faire côté technique : indiquer **le serveur d'envoi**
(la boîte depuis laquelle partent les e-mails) — voir
[03-SAUVEGARDES.md](03-SAUVEGARDES.md), étape 1.

---

## ✅ Réglé — Les deux phases : mise au point, puis mise en service

Le cabinet a choisi de séparer nettement deux périodes. C'est une bonne décision :
tant qu'il n'y a pas de vrai patient dans la base, il n'y a rien à protéger, et on
peut modifier le logiciel aussi souvent qu'on veut.

### Phase 1 — aujourd'hui : mise au point (dépôt **public**, GitHub Pages)

| | |
|---|---|
| Le code | https://github.com/hacuubo/planning-holter |
| Le site | https://hacuubo.github.io/planning-holter/ |
| La démonstration | https://hacuubo.github.io/planning-holter/web/demonstration.html |

Le dépôt est public **parce que GitHub Pages n'est gratuit qu'à cette
condition**. Aucun inconvénient à ce stade : le dépôt ne contient que du code et
de la documentation — ni identifiants, ni clés, ni patients. Et GitHub Pages
accepte autant de mises à jour que l'on veut : c'est exactement ce qu'il faut
pour ajuster le logiciel au fil de l'eau.

### Phase 2 — le jour de la mise en service (dépôt **privé**, Netlify)

Quand de vrais noms de patients entreront dans la base :

1. le dépôt GitHub repasse en **privé** (Settings ▸ General ▸ Danger Zone ▸
   *Change repository visibility*) ;
2. le site est publié par **Netlify**, qui accepte gratuitement les dépôts privés
   — contrairement à GitHub Pages, qui demanderait un abonnement ;
3. GitHub Pages est désactivé, et l'adresse donnée aux secrétaires devient celle
   de Netlify.

Deux points à connaître pour ce jour-là :

- **Netlify limite le nombre de mises en ligne** (environ 20 par mois sur l'offre
  gratuite). Il faudra donc regrouper les modifications au lieu de publier à
  chaque petit changement. Ce n'est pas gênant une fois le logiciel stabilisé.
- **Repasser en privé ne réécrit pas le passé** : ce qui a été public a pu être
  copié. C'est sans conséquence ici, puisque rien de confidentiel n'y a jamais
  figuré — mais c'est la raison pour laquelle il ne faut jamais, à aucun moment,
  mettre une clé ou un fichier de sauvegarde dans le dépôt.

- **La sauvegarde quotidienne ne bouge pas** : elle tourne sur GitHub Actions, qui
  fonctionne aussi bien en dépôt privé qu'en dépôt public.

> **Attention à ne pas confondre.** Netlify héberge le *site* — des fichiers
> HTML et JavaScript, sans aucune donnée. Les données de patients, elles, sont
> chez **Supabase**. Passer à Netlify ne change donc rien à la question de
> l'hébergement de santé traitée ci-dessous.

---

## ⚠️ Décision à prendre — L'hébergement

**Le fait** — même réduit au nom et au sexe, votre planning associe une personne
à un examen cardiologique. Il s'agit donc encore de **données de santé
pseudonymisées**.

En France, lorsque de telles données sont hébergées par un prestataire, celui-ci
doit en principe être **certifié HDS** (Hébergeur de Données de Santé). Supabase,
comme GitHub, Vercel ou Firebase, **ne l'est pas**.

**Ce qui a été mis en place pour limiter l'exposition**

- **le minimum de données** : ni prénom, ni date de naissance ;
- hébergement en **Europe** (région Francfort ou Irlande) — RGPD applicable ;
- aucun accès possible sans compte : la base refuse tout par défaut ;
- comptes créés inactifs, activés un par un par un administrateur ;
- **aucune donnée de patient sur GitHub**, jamais ;
- toutes les actions sensibles tracées dans un journal.

**Vos options, par ordre de coût**

| Option | Conséquence |
|--------|-------------|
| **Rester ainsi** | Fonctionne dès aujourd'hui, gratuit. Avec des données réduites au nom et au sexe, c'est un choix défendable. La décision vous appartient. |
| **Réduire encore** | N'enregistrer que les initiales ou un numéro de dossier. Le lien avec une personne devient très difficile à établir. Demandez-le-moi : c'est une modification simple. |
| **Hébergeur HDS** | Plusieurs prestataires français (OVHcloud, Scaleway, Claranet…) proposent du PostgreSQL certifié HDS. Compter quelques dizaines d'euros par mois. Le logiciel a été construit pour que **seul le fichier `web/js/data/api.js`** soit à réécrire : le déménagement est réalisable. |
| **Serveur au cabinet** | Les données ne sortent jamais des murs, la question HDS ne se pose plus. En contrepartie : un ordinateur à laisser allumé et pas d'accès depuis l'extérieur. |

**Ce que je vous recommande** — en parler à votre DPO ou à votre assureur en
responsabilité professionnelle, en leur montrant cette page. Le logiciel
fonctionne dans les quatre cas.

---

## 🔎 À confirmer à l'usage — Règles de fonctionnement

Ces règles ont été déduites du cahier des charges. Elles sont **toutes
modifiables dans Réglages**, sans intervention sur le code. Rien ne vous empêche
de démarrer et d'ajuster après quelques semaines d'utilisation réelle.

| Règle appliquée | Pourquoi ce choix | Où la changer |
|-----------------|-------------------|---------------|
| Du lundi au vendredi : **8h45 – 11h30** et **14h00 – 16h30** (16h00 le vendredi) | plages de rendez-vous confirmées par le secrétariat | Réglages ▸ Horaires |
| Le samedi : **8h30 – 11h45**, matin seulement | plages confirmées par le secrétariat | Réglages ▸ Horaires |
| Poses de **polygraphie** : l'après-midi uniquement, jusqu'à **17h15** (16h45 le vendredi) ; dépose le lendemain **matin** (une seule nuit) | plage réservée demandée par le secrétariat | Réglages ▸ Horaires |
| **1 pose** par quart d'heure ; **déposes illimitées** | demande du secrétariat | Réglages ▸ Horaires |
| Un patient qui reçoit **2 appareils** ne compte que pour **1** patient dans le créneau | Il s'agit d'une seule venue | me le signaler si c'est faux |
| La dépose peut avoir lieu **jusqu'à 15 min** avant le RDV cardiologue, arrondie au quart d'heure précédent | « la dépose se passe 15 minutes avant le rendez-vous » | Réglages ▸ Horaires |
| Un port **jusqu'à 1 h plus court** que la durée nominale est accepté | Évite de reculer d'un jour entier quand le cabinet ouvre plus tard | Réglages ▸ Horaires |
| Un appareil rendu est **immédiatement** réattribuable | « une fois le retour effectué le matériel est rendu disponible » | me le dire s'il faut un délai de nettoyage |
| Le Spider Flash se pose **7 jours** avant | « la durée du spider flash est de 7 jours » | — |
| MAPA et polygraphies : **24 h**, sans autre choix | non précisé, usage courant | me le dire si 48 h doit être possible |
| Les appareils d'urgence (**501**, **502**, **101**, **Y**) ne sont **jamais** attribués automatiquement | « réservés aux urgences » | Réglages ▸ Parc matériel |

---

## Récapitulatif — ce qu'il me reste à savoir

1. Le **serveur d'envoi des e-mails** (l'adresse destinataire, elle, se saisit
   dans l'application par les secrétaires).
2. Votre décision sur l'**hébergement**.
3. Toute règle du dernier tableau qui ne correspondrait pas à votre pratique.

Aucun de ces points n'empêche de démarrer : le logiciel est utilisable dès
maintenant, et tout se règle depuis l'onglet Réglages.
