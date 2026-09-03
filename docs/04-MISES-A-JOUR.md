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
   sont relancées (plus de 70 contrôles) pour s'assurer que rien d'existant n'est cassé.
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
| 1.5.0 | septembre 2026 | calendrier : vue 3 jours par défaut (hier, aujourd'hui, demain) ; le trait ne couvre plus la veille de la pose, seulement la période pose → dépose ; colonne du jour encadrée (plus de cellules surlignées une à une) ; glisser-déposer d'un rendez-vous prévu vers une autre ligne du même type, accepté seulement si l'appareil est libre aux mêmes horaires (ligne verte), refusé sinon (ligne rouge) ; MAPA en rouge, polygraphies en vert franc — aucune modification de la base |
| 1.4.1 | septembre 2026 | calendrier : les traits démarrent et s'arrêtent à la position de l'heure dans la colonne du jour (8h à gauche, 18h à droite) — une pose de 8h45 débute tout à gauche de sa colonne, une dépose de fin d'après-midi glisse jusqu'au bord droit de la sienne |
| 1.4.0 | septembre 2026 | calendrier : vues limitées à 3 et 30 jours ; prise de rendez-vous d'un clic sur une case libre (appareil + jour), heure de pose, nom, sexe, cardiologue et durée (modifiable pour les Holter, fixe sinon), dépose et rendez-vous cardiologue déduits automatiquement — aucune modification de la base |
| 1.3.0 | septembre 2026 | onglet Alertes (réattributions automatiques après panne, patients à rappeler) ; mise hors service temporaire d'un appareil ; correction du numéro d'appareil depuis le calendrier avec réattribution en cascade ; calendrier : vue 3 jours, filtre par type, heures de pose/dépose sur les traits ; Journée : colonnes Poses et Déposes — rejouer `supabase/06-mise-a-jour-1-3.sql` PUIS `supabase/03-fonctions.sql` dans Supabase |
| 1.2.0 | septembre 2026 | déplacement possible même quand le matériel est posé ou rendu (la dépose suit le rendez-vous, l'appareil ne change pas) ; calendrier : le trait couvre aussi la veille de la pose (trois jours pour un Holter 24 h, jour de pose au milieu) — rejouer `supabase/03-fonctions.sql` dans Supabase après la mise à jour |
| 1.1.0 | août 2026 | déplacement / modification d'un rendez-vous depuis la Recherche ; plages de rendez-vous matin et après-midi ; règles de la polygraphie (pose la veille après-midi jusqu'à 17h15 — 16h45 le vendredi —, dépose le lendemain matin, une seule nuit) ; 1 pose par quart d'heure et déposes illimitées ; dépose 15 minutes avant le rendez-vous |

**Mise à jour 1.3.0 — à faire une fois dans Supabase.** Ouvrez Supabase ▸
**SQL Editor** et jouez, dans cet ordre : 1) `supabase/06-mise-a-jour-1-3.sql`
(colonne « hors service » et table des rappels — aucune donnée existante n'est
touchée), puis 2) `supabase/03-fonctions.sql` (nouvelles fonctions). C'est tout.

**Mise à jour 1.1.0 — à faire une fois dans Supabase.** Cette version touche
aussi la base (une nouvelle fonction et des règles de contrôle) : après avoir
déposé les fichiers du site, ouvrez Supabase ▸ **SQL Editor**, collez le
contenu de `supabase/03-fonctions.sql` et cliquez sur **Run** (les rendez-vous
ne sont pas touchés : seules les fonctions sont remplacées). Vérifiez ensuite
dans l'onglet **Réglages ▸ Horaires et capacité** que les plages, le nombre de
poses par quart d'heure (1) et le délai de dépose (15 minutes) correspondent
bien au fonctionnement du cabinet, puis cliquez sur **Enregistrer les
horaires** : les anciens réglages enregistrés sont remplacés par les nouveaux.
