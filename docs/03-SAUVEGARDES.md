# 3 — Sauvegardes, envoi par e-mail et mode secours

Le cahier des charges demandait quatre choses :

1. une sauvegarde quotidienne **sur un cloud** ;
2. **et** dans un dossier du cabinet ;
3. conservée **7 jours glissants**, les fichiers plus anciens étant supprimés ;
4. un **e-mail quotidien** avec les rendez-vous du lendemain en PDF.

Voici comment chacune est assurée, et comment l'activer.

---

## Ce qui est produit chaque matin

| Fichier | Contenu |
|---------|---------|
| `sauvegarde holter JJ-MM-AAAA.xlsx` | copie complète du planning, présentée comme l'interface |
| `rendez-vous JJ-MM-AAAA.pdf` | la feuille des rendez-vous du **lendemain**, prête à imprimer |

Le classeur Excel comporte sept feuilles :

- **Journée** — le programme du jour, heure par heure, avec les couleurs ;
- **Prochains jours** — le même détail sur deux semaines ;
- **Calendrier matériel** — quel appareil est chez quel patient, jour par jour ;
- **Rendez-vous** — la liste complète, avec un filtre pour chercher un patient ;
- **Matériel** — le parc et les appareils libres ;
- **Saisie manuelle** — des lignes vides à remplir pendant une panne ;
- **Mode d'emploi** — les règles à respecter en saisie manuelle.

---

## Où vont ces fichiers

```
        ┌──────────────────────────────┐
        │  Tâche automatique GitHub    │  tous les matins vers 7h15
        └──────────────┬───────────────┘
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
   Stockage       E-mail aux     Dossier du cabinet
   Supabase       secrétaires    (via le petit outil
   (« le cloud »)                 Windows, étape 3)
   7 jours                        7 jours
```

---

## Étape 1 — Ranger les identifiants dans GitHub

Ces informations ne doivent jamais figurer dans un fichier du projet. GitHub
dispose d'un coffre prévu pour cela.

Dans votre dépôt GitHub : **Settings** ▸ **Secrets and variables** ▸ **Actions**
▸ bouton **New repository secret**. Créez-les un par un :

| Nom du secret | Valeur | Où la trouver |
|---------------|--------|---------------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase ▸ Project Settings ▸ Data API |
| `SUPABASE_SERVICE_KEY` | la clé **service_role** | Supabase ▸ Project Settings ▸ API keys ▸ *Reveal* |
| `SMTP_HOST` | ex. `smtp.orange.fr` | fourni par votre hébergeur de messagerie |
| `SMTP_PORT` | `587` (ou `465`) | idem |
| `SMTP_USER` | l'adresse e-mail d'envoi | idem |
| `SMTP_PASSWORD` | son mot de passe | idem |
| `SMTP_FROM` | l'adresse affichée comme expéditeur | souvent la même que `SMTP_USER` |
| `SMTP_SECURE` | `true` si le port est 465, sinon `false` | |

> **Gmail / Google Workspace** : n'utilisez pas votre mot de passe habituel.
> Créez un **mot de passe d'application** (compte Google ▸ Sécurité ▸
> Validation en deux étapes ▸ Mots de passe des applications) et utilisez
> `smtp.gmail.com`, port `587`, `SMTP_SECURE = false`.

> **Si vous n'avez pas encore de serveur d'envoi**, laissez les cinq secrets
> `SMTP_*` de côté : la sauvegarde fonctionnera quand même, seul l'e-mail sera
> passé. Le message *« Aucun serveur d'envoi configuré »* apparaîtra dans le
> journal, sans que ce soit une erreur.

---

## Étape 2 — Indiquer qui reçoit l'e-mail

Cela se règle **depuis le site**, sans toucher au code :

**Réglages ▸ Sauvegarde quotidienne et envoi par e-mail**

- ajoutez une ou plusieurs adresses ;
- choisissez la fréquence : tous les jours, uniquement les jours ouvrés, une fois
  par semaine, ou aucun envoi ;
- réglez la durée de conservation (7 jours par défaut).

### Vérifier que ça marche

Dans GitHub : onglet **Actions** ▸ **Sauvegarde quotidienne** ▸
**Run workflow** ▸ **Run workflow**.

La tâche s'exécute en une minute environ. Cliquez dessus pour voir son
déroulement. Un ✅ vert signifie que tout s'est bien passé ; vérifiez la
réception de l'e-mail.

En cas de ❌, ouvrez l'étape en rouge : le message indique quoi corriger
(le plus souvent un secret mal recopié).

---

## Étape 3 — La copie dans un dossier du cabinet

Le dossier « qu'on définira » du cahier des charges. Le petit outil
`outils/copier-sauvegardes.ps1` récupère chaque jour les sauvegardes et les
dépose là où vous voulez : dossier OneDrive, disque réseau, dossier partagé.

**Sur l'ordinateur du secrétariat qui reste allumé :**

1. Copiez les deux fichiers du dossier `outils/` dans, par exemple,
   `C:\PlanningHolter\`
2. Ouvrez `parametres-sauvegarde.txt` avec le Bloc-notes et complétez :

   ```
   ADRESSE_SUPABASE=https://xxxx.supabase.co
   CLE_SERVICE=la clé service_role
   DOSSIER_DESTINATION=C:\Users\secretariat\OneDrive\Sauvegardes Holter
   JOURS_CONSERVATION=7
   ```

3. Testez-le une fois à la main : `Maj + clic droit` dans le dossier ▸
   *Ouvrir la fenêtre PowerShell ici*, puis :

   ```bash
   powershell -ExecutionPolicy Bypass -File .\copier-sauvegardes.ps1
   ```

   Les fichiers doivent apparaître dans le dossier choisi.

4. Automatisez-le : **Planificateur de tâches** Windows ▸ *Créer une tâche de
   base* ▸ nom « Sauvegarde planning Holter » ▸ *Tous les jours* à 8h00 ▸
   *Démarrer un programme* :

   - Programme : `powershell.exe`
   - Arguments : `-ExecutionPolicy Bypass -File "C:\PlanningHolter\copier-sauvegardes.ps1"`

> Le fichier `parametres-sauvegarde.txt` contient une clé qui donne accès aux
> données du cabinet. Laissez-le sur cet ordinateur, ne l'envoyez jamais par
> e-mail et ne le publiez jamais sur GitHub.

---

## Le mode secours

Si le site est indisponible (panne d'Internet, incident chez l'hébergeur) :

1. Ouvrez le **dernier fichier Excel** reçu, depuis le dossier partagé pour que
   plusieurs secrétaires puissent y travailler en même temps.
2. Les feuilles **Journée**, **Prochains jours** et **Calendrier matériel**
   donnent l'état exact du planning au matin.
3. Notez les nouveaux rendez-vous dans la feuille **Saisie manuelle**, en
   respectant les règles rappelées dans la feuille **Mode d'emploi** — en
   particulier : vérifier dans le calendrier qu'un appareil n'est pas déjà pris.
4. **Enregistrez le fichier** au fur et à mesure.

Au retour du service : signalez-le dans la discussion Claude en joignant ce
fichier. Les rendez-vous saisis à la main seront réintégrés dans le logiciel,
sans perte.

---

## Ce qui n'est jamais envoyé sur GitHub

Le dépôt GitHub est public : il ne doit contenir **aucune donnée de patient**.
Trois protections sont en place :

1. le fichier `.gitignore` exclut les `.xlsx`, les `.pdf` et le dossier
   `sauvegardes/` ;
2. la tâche automatique efface les fichiers produits à la fin de son exécution ;
3. les sauvegardes sont déposées dans un espace Supabase **privé**, qui exige
   une clé pour être lu.
