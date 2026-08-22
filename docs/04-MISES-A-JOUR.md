# 4 — Faire évoluer le logiciel

Le cahier des charges demandait que les évolutions futures se fassent **depuis
la discussion Claude**, et qu'elles soient répercutées chez toutes les
secrétaires **sans perdre les rendez-vous à venir**. Voici comment cela
fonctionne, et pourquoi c'est sans risque.

---

## Pourquoi une mise à jour ne peut pas effacer vos rendez-vous

C'est le point le plus important, et il tient à la façon dont le logiciel est
construit :

```
   LE SITE                          LA BASE DE DONNÉES
   (GitHub Pages)                   (Supabase)

   • l'apparence                    • les patients
   • les boutons                    • les rendez-vous
   • les règles de calcul           • le matériel
                                    • les réglages
   ← remplacé à chaque MAJ →        ← jamais touché →
```

Une mise à jour remplace des fichiers du **site**. Les données vivent ailleurs,
dans la **base**, et ne sont pas concernées. C'est exactement comme mettre à jour
une application sur son téléphone : les données restent.

Les rares mises à jour qui touchent aussi à la base (par exemple : ajouter une
information sur les patients) se font par **ajout**, jamais par remplacement, et
sont toujours annoncées comme telles.

---

## Comment demander une évolution

Écrivez simplement ce que vous voulez, dans vos mots. Par exemple :

> « Il faudrait pouvoir noter si le patient est venu accompagné. »
>
> « On voudrait 3 patients par quart d'heure le mardi seulement. »
>
> « Ajoute un cardiologue : les initiales sont JD. »

Plus votre demande est concrète (« quand je fais ceci, je voudrais que… »),
plus la modification sera juste du premier coup.

### Trois choses qui aident beaucoup

1. **Dire ce qui se passe aujourd'hui et ce que vous voudriez à la place.**
2. **Donner un exemple réel** : un patient, une date, une heure.
3. **Copier le message d'erreur** s'il y en a un, tel quel.

### Certaines demandes ne nécessitent aucune modification

Beaucoup de choses se règlent déjà dans l'onglet **Réglages**, tout de suite et
sans intervention : horaires, nombre de patients par quart d'heure, ajout ou
retrait de matériel, cardiologues, jours de fermeture, destinataires des
e-mails, délai entre la dépose et le rendez-vous. Regardez-y d'abord.

---

## Ce qui se passe ensuite

1. Vous décrivez le besoin dans la discussion.
2. Les fichiers concernés sont modifiés, et les **vérifications automatiques**
   sont relancées (65 contrôles) pour s'assurer que rien d'existant n'est cassé.
3. Vous recevez la liste des fichiers modifiés.
4. Vous les déposez sur GitHub (voir ci-dessous).
5. Les secrétaires **rechargent la page** : elles ont la nouvelle version.

Aucune installation, aucun redémarrage, aucune interruption de service.

---

## Déposer une mise à jour sur GitHub

**La méthode la plus simple** — remplacer un fichier :

1. Sur GitHub, ouvrez votre dépôt et naviguez jusqu'au fichier concerné
   (par exemple `web/js/ui/onglet-rdv.js`).
2. Cliquez sur l'icône **crayon** (*Edit this file*).
3. Sélectionnez tout (`Ctrl+A`) et collez le nouveau contenu.
4. En bas, cliquez sur **Commit changes**. Dans la description, écrivez ce que
   vous avez changé (par exemple « ajout du champ accompagnant »).

**Pour plusieurs fichiers d'un coup** :
bouton **Add file ▸ Upload files**, puis glissez-déposez les fichiers. Ceux qui
portent le même nom sont remplacés.

Le site est mis à jour en 1 à 2 minutes (onglet **Actions** de GitHub pour
suivre l'avancement).

### Si les secrétaires voient encore l'ancienne version

Le navigateur garde parfois l'ancien fichier en mémoire. Demandez-leur de faire
`Ctrl + F5` (ou `Cmd + Maj + R` sur Mac). Une seule fois suffit.

---

## Revenir en arrière

GitHub conserve **toutes** les versions précédentes. Si une mise à jour pose
problème :

1. Ouvrez votre dépôt ▸ onglet **Commits** (ou l'icône horloge).
2. Repérez la version qui fonctionnait, cliquez dessus.
3. Bouton **Revert** — ou signalez-le simplement dans la discussion Claude, en
   précisant depuis quand le problème apparaît.

Là encore, les rendez-vous ne bougent pas : seul le site revient en arrière.

---

## Signaler un problème efficacement

Pour qu'un problème soit corrigé du premier coup, indiquez :

| À indiquer | Exemple |
|------------|---------|
| Ce que vous faisiez | « je prenais un rendez-vous pour le 3 septembre à 14h » |
| Ce que vous attendiez | « il devait proposer une pose le 2 » |
| Ce qui s'est passé | « il a dit qu'aucun appareil n'était disponible » |
| Le message exact | copié-collé, ou une photo de l'écran |
| Le jour et l'heure | « mardi 25 vers 10h30 » |

La date et l'heure permettent de retrouver l'action dans le **journal** que la
base conserve automatiquement.

---

## Le suivi des versions

Le numéro de version s'affiche en bas de l'onglet **Réglages**. Il est modifié à
chaque évolution, avec un résumé de ce qui a changé, pour que vous sachiez
toujours quelle version tourne au cabinet.

| Version | Date | Contenu |
|---------|------|---------|
| 1.0.0 | mise en service initiale | planning, prise de rendez-vous, recherche, calendrier, réglages, statistiques, sauvegardes quotidiennes |
