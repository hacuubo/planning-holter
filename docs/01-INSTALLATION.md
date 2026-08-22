# 1 — Mise en service, pas à pas

Ce guide est écrit pour quelqu'un qui n'est pas informaticien. Comptez environ
**une heure**, en une seule fois ou en plusieurs. Rien n'est irréversible : en
cas de doute, arrêtez-vous et posez la question dans la discussion Claude.

Vous aurez besoin :

- d'une adresse e-mail professionnelle ;
- des adresses e-mail des secrétaires qui utiliseront le planning ;
- de l'adresse e-mail qui recevra la sauvegarde quotidienne.

---

## Vue d'ensemble

| Étape | Ce que vous faites | Durée |
|-------|--------------------|-------|
| 1 | Créer le compte Supabase (la base de données) | 10 min |
| 2 | Installer la base : coller 4 fichiers | 10 min |
| 3 | Remplir `config.js` | 5 min |
| 4 | Publier le site sur GitHub Pages | 15 min |
| 5 | Créer les comptes des secrétaires | 10 min |
| 6 | Activer la sauvegarde quotidienne | 15 min |
| 7 | Vérifier que tout fonctionne | 10 min |

---

## Étape 1 — Créer le compte Supabase

Supabase est le service qui stocke les rendez-vous et gère les comptes.

1. Allez sur **https://supabase.com** et cliquez sur **Start your project**.
   Créez un compte (avec votre adresse professionnelle, ou via GitHub).
2. Cliquez sur **New project**.
3. Remplissez :
   - **Name** : `planning-holter`
   - **Database Password** : cliquez sur *Generate a password*, puis
     **copiez-le et rangez-le** dans votre gestionnaire de mots de passe.
     Vous n'en aurez pas besoin au quotidien, mais il est irrécupérable.
   - **Region** : choisissez **Central EU (Frankfurt)** ou **West EU (Ireland)**
     — les données restent ainsi en Europe.
   - **Plan** : *Free*.
4. Cliquez sur **Create new project** et patientez 2 à 3 minutes.

### Notez deux informations

Dans le menu de gauche : **Project Settings** (la roue dentée) ▸ **Data API**.

- **Project URL** — quelque chose comme `https://abcdefghijk.supabase.co`
- **anon public** (ou *Publishable key*) — une très longue suite de caractères

Copiez ces deux valeurs dans un fichier texte : vous les collerez à l'étape 3.

> **Une troisième clé, à ne jamais divulguer.** Dans **Project Settings ▸ API keys**
> se trouve aussi une clé **`service_role`**. Celle-là donne tous les droits.
> Elle ne servira qu'à l'étape 6, et ne doit **jamais** être mise dans le site,
> ni envoyée par e-mail, ni publiée sur GitHub.

---

## Étape 2 — Installer la base de données

Dans le menu de gauche de Supabase, cliquez sur **SQL Editor**, puis sur
**New query**.

Vous allez coller **quatre fichiers, dans l'ordre**. Pour chacun : ouvrez le
fichier, sélectionnez tout (`Ctrl+A`), copiez (`Ctrl+C`), collez dans Supabase
(`Ctrl+V`), puis cliquez sur **Run** (ou `Ctrl+Entrée`).

| Ordre | Fichier | Ce qu'il fait |
|-------|---------|---------------|
| 1 | `supabase/01-schema.sql` | crée les tables et la protection anti-doublon |
| 2 | `supabase/02-securite.sql` | interdit tout accès sans compte autorisé |
| 3 | `supabase/03-fonctions.sql` | installe les règles appliquées par la base |
| 4 | `supabase/04-donnees-initiales.sql` | enregistre votre matériel et les réglages |

Après chaque fichier, Supabase doit afficher **Success. No rows returned**
(ou une liste de résultats). Si un message rouge apparaît, **arrêtez-vous** et
copiez-le dans la discussion Claude : ne passez pas au fichier suivant.

> Le dossier contient aussi un fichier **`05-migration-donnees-patients.sql`**.
> **Ne le lancez pas** lors d'une première installation : il ne sert qu'aux
> cabinets ayant installé une version antérieure du logiciel, pour supprimer
> les prénoms et dates de naissance devenus inutiles.

### Vérification

Menu **Table Editor** : vous devez voir les tables `appareils`, `rendez_vous`,
`poses`, `parametres`, `profils`, `journal`. En ouvrant `appareils`, vous devez
compter **43 lignes** (11 Holter ELA, 14 Holter DMS, 14 MAPA, 1 Spider Flash,
3 polygraphes).

---

## Étape 3 — Remplir `config.js`

Ouvrez le fichier `web/config.js` avec le Bloc-notes (clic droit ▸ Ouvrir avec ▸
Bloc-notes) et remplacez les deux valeurs entre apostrophes :

```js
SUPABASE_URL: 'https://abcdefghijk.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi..... (la longue clé anon)',
```

Vous pouvez aussi personnaliser le nom affiché en haut de l'écran :

```js
NOM_CABINET: 'Planning Holter — Cabinet de cardiologie',
```

Enregistrez le fichier. **Ne touchez à rien d'autre.**

---

## Étape 4 — Publier le site sur GitHub Pages

1. Créez un compte sur **https://github.com** si vous n'en avez pas.
2. Cliquez sur **+** (en haut à droite) ▸ **New repository**.
   - **Repository name** : `planning-holter`
   - **Public** (nécessaire pour que GitHub Pages soit gratuit ; le code y est
     visible, mais **aucune donnée de patient** n'y figure jamais)
   - Ne cochez rien d'autre. Cliquez sur **Create repository**.
3. Sur la page qui s'affiche, cliquez sur **uploading an existing file**.
4. Dans l'explorateur Windows, ouvrez le dossier du projet, **sélectionnez tout**
   (`Ctrl+A`) et **glissez-déposez** dans la fenêtre GitHub.
   Attendez la fin du transfert, puis cliquez sur **Commit changes**.
5. Allez dans **Settings** (onglet du dépôt) ▸ **Pages** (menu de gauche).
   - **Source** : *Deploy from a branch*
   - **Branch** : `main` et dossier **`/ (root)`**
   - Cliquez sur **Save**.
6. Patientez 1 à 2 minutes, puis rechargez la page : GitHub affiche l'adresse de
   votre site.

**C'est l'adresse à donner aux secrétaires**, par exemple :

```
https://votre-compte.github.io/planning-holter/
```

Demandez-leur de l'ajouter en favori, et sur téléphone d'utiliser
« Ajouter à l'écran d'accueil » : l'application s'ouvrira comme une vraie
application.

---

## Étape 5 — Créer les comptes des secrétaires

Dans Supabase : **Authentication** ▸ **Users** ▸ **Add user** ▸
**Create new user**.

Pour chaque secrétaire :

- **Email** : son adresse professionnelle
- **Password** : un mot de passe provisoire, qu'elle changera ensuite
- Cochez **Auto Confirm User** (sinon elle devra valider un e-mail)

> Par sécurité, un compte fraîchement créé **ne voit rien** tant qu'il n'est pas
> activé.

### Activer les comptes

1. Connectez-vous une première fois au site avec **votre** compte.
   Il s'affichera « Compte en attente » : c'est normal.
2. Dans Supabase, ouvrez **Table Editor** ▸ table **`profils`**.
   Vous y voyez une ligne par compte.
3. Sur votre ligne : mettez `actif` à **true** et `role` à **admin**.
   Cliquez sur **Save**.
4. Rechargez le site : vous êtes administrateur.
5. Toutes les autres activations se font désormais **depuis le site**, dans
   l'onglet **Réglages ▸ Comptes utilisateurs** : bouton *Activer*.

---

## Étape 6 — Activer la sauvegarde quotidienne

Cette étape met en place : le classeur Excel quotidien, le PDF des rendez-vous
du lendemain, l'envoi par e-mail et la suppression au bout de 7 jours.

Elle est décrite en détail dans **[03-SAUVEGARDES.md](03-SAUVEGARDES.md)**.
Vous pouvez la faire plus tard : le logiciel fonctionne sans.

---

## Étape 7 — Vérifier que tout fonctionne

Faites ce petit parcours avec une secrétaire :

1. **Connexion** — l'écran de connexion accepte votre adresse et votre mot de passe.
2. **Journée** — l'onglet s'ouvre sur la date du jour et affiche les créneaux de
   7h45 à 18h.
3. **Rendez-vous** — saisissez un patient d'essai (nom de famille et sexe),
   cochez « Holter ECG », choisissez un rendez-vous cardiologue **un mardi** :
   le logiciel doit proposer la pose **le lundi à la même heure**.
4. Refaites l'essai avec un rendez-vous **un lundi** : la pose doit basculer au
   **samedi**, avant 11h45.
5. **Enregistrez**, puis allez dans **Recherche**, tapez le nom : le rendez-vous
   apparaît. **Annulez-le** pour ne pas laisser de patient fictif.
6. **Deux secrétaires en même temps** — ouvrez le site sur deux postes.
   Une prise de rendez-vous sur l'un doit apparaître sur l'autre en quelques
   secondes, sans recharger la page.
7. **Réglages** — vérifiez que le parc matériel correspond bien à la réalité du
   cabinet (voir [05-POINTS-A-VALIDER.md](05-POINTS-A-VALIDER.md)).

Si l'un de ces points ne fonctionne pas, notez précisément ce que vous avez fait
et ce qui s'est affiché, et transmettez-le dans la discussion Claude.

---

## Annexe — Essayer en local avant de publier

Utile pour se former sans toucher aux vraies données.

1. Installez **Node.js** depuis https://nodejs.org (version LTS, bouton de gauche).
2. Ouvrez le dossier du projet, faites `Maj + clic droit` dans une zone vide ▸
   **Ouvrir la fenêtre PowerShell ici**.
3. Tapez :

```bash
node scripts/serveur-local.mjs
```

4. Ouvrez votre navigateur sur **http://localhost:8080/demonstration.html**

La démonstration contient des patients fictifs et **n'enregistre rien**.
Pour arrêter le serveur : `Ctrl + C` dans la fenêtre PowerShell.

Pour relancer les vérifications automatiques du logiciel :

```bash
npm test
```
