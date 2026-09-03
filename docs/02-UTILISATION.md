# 2 — Utilisation au quotidien

Guide destiné aux secrétaires. Il tient en quelques pages : le logiciel a été
conçu pour qu'il y ait le moins de choix possible à faire.

---

## Se connecter

Ouvrez l'adresse du planning (mise en favori), saisissez votre adresse e-mail et
votre mot de passe. Vous restez connectée : il n'est pas nécessaire de
recommencer chaque matin.

**Sur téléphone** : ouvrez l'adresse, puis « Partager ▸ Ajouter à l'écran
d'accueil » (iPhone) ou « ⋮ ▸ Ajouter à l'écran d'accueil » (Android).

En haut à droite, une petite pastille indique l'état de la liaison :

| Pastille | Signification |
|----------|---------------|
| ● verte  | tout va bien ; vous voyez en direct ce que font vos collègues |
| ● rouge  | la liaison est interrompue — **rechargez la page** |

---

## Onglet **Journée** — poser et déposer

C'est l'écran de la personne qui s'occupe du matériel.

- Les créneaux s'affichent de haut en bas, tous les quarts d'heure, sur
  **deux colonnes** : les **poses à gauche**, les **déposes à droite**.
- Chaque acte indique le patient (nom de famille et sexe), le cardiologue,
  l'appareil et sa couleur.
- **⬇ = pose**, **⬆ = dépose**.

Deux boutons, et rien d'autre :

- **Posé** — à cliquer quand l'appareil a été posé au patient.
- **Rendu** — à cliquer quand le patient rapporte l'appareil. **Important :**
  c'est ce clic qui remet l'appareil dans la liste des disponibles. Si vous
  l'oubliez, le logiciel continue de croire l'appareil chez le patient.

En haut, le bandeau **« Matériel disponible pour une pose immédiate »** indique,
pour chaque type, le nombre d'appareils encore libres. Passez la souris dessus
pour voir les numéros. Le bandeau devient **rouge** quand il n'en reste plus.

Les flèches ← → passent d'un jour ouvré au suivant. Le bouton **🖨 Imprimer**
sort la feuille du jour ; **⬇ Excel** télécharge le classeur complet.

---

## Onglet **Rendez-vous** — prendre un rendez-vous

C'est l'écran principal. Vous n'avez que quatre choses à renseigner :

1. **Le patient** — son **nom de famille** et son **sexe** (F ou M), tous deux
   obligatoires. Le téléphone est facultatif.

   > Le cabinet a fait le choix de n'enregistrer **que** ces deux informations :
   > ni prénom, ni date de naissance. C'est volontaire, pour conserver le moins
   > de données personnelles possible. En cas d'homonymes dans la même semaine,
   > servez-vous de la **note interne** pour les distinguer.
2. **Le rendez-vous avec le cardiologue** — sa date et son heure, ainsi que les
   initiales du cardiologue demandeur.
3. **Le matériel** — cochez un ou plusieurs types. Pour un Holter ECG, vous
   pouvez préciser la marque (ELA ou DMS) et la durée (24, 48 ou 72 h).
   Si vous laissez « Indifférente », le logiciel choisit celui qui fait le mieux
   tourner le parc.
4. **C'est tout.** La proposition s'affiche et se recalcule à chaque
   modification.

### Lire la proposition

> ✔ **Rendez-vous réalisable.** Dépose du matériel le 25/08/2026 à 09:30, soit
> avant le rendez-vous de 10:00.
>
> `Holter ECG DMS 13` — **Pose 24/08/2026 à 09:30** · dépose 25/08/2026 à 09:30
> · port réel : 24 h

Le logiciel a décidé seul de la date de pose, de l'heure et du **numéro
d'appareil** à donner au patient. Le bandeau du dessous rappelle ce qui reste
disponible ce jour-là.

Quand tout est bon : **✔ Enregistrer le rendez-vous**.

### Quand ce n'est pas possible

> ✖ Ce rendez-vous n'est pas réalisable en l'état.
> *Plus aucun Holter ECG DMS disponible sur la période nécessaire.*

Une liste **« Autres rendez-vous possibles »** apparaît alors, avec les créneaux
les plus proches de l'heure demandée. Cliquez sur **Choisir** : le formulaire se
remplit tout seul. Vous convenez ensuite du rendez-vous cardiologue
correspondant.

### Messages que vous pouvez rencontrer

| Message | Ce qu'il faut faire |
|---------|---------------------|
| *Aucun Holter ELA disponible : le logiciel a proposé un Holter DMS à la place.* | Rien — c'est une information. Vérifiez simplement que la marque convient au cardiologue. |
| *Le créneau de pose du … est déjà pris par 1 patient(s) (maximum 1).* | Décalez le rendez-vous cardiologue de 15 minutes : la pose glissera sur un autre créneau. |
| *La polygraphie se dépose le matin (avant midi).* | Choisissez un rendez-vous cardiologue en matinée. |
| *Marge réduite : seulement 10 minutes entre la dépose et le rendez-vous.* | Le rendez-vous cardiologue est très tôt. Possible, mais serré. |
| *Une autre secrétaire vient de réserver ce matériel.* | Rien — le logiciel recalcule automatiquement une nouvelle proposition. |
| *Le cabinet est fermé ce jour-là.* | Dimanche, jour férié ou fermeture exceptionnelle : choisissez un autre jour. |

---

## Onglet **Recherche** — retrouver, déplacer ou annuler

Tapez les premières lettres du nom de famille. La fiche affiche le rendez-vous
cardiologue, les appareils attribués, les dates de pose et de dépose.

**Déplacer / Modifier** ouvre une fenêtre préremplie avec le rendez-vous
actuel : changez la date, l'heure ou le matériel (le type de Holter, par
exemple) et le logiciel recalcule aussitôt la pose, la dépose et les appareils,
comme lors d'une prise de rendez-vous. L'ancien créneau est libéré
automatiquement à l'enregistrement. Si le nouveau créneau est impossible,
d'autres rendez-vous sont proposés.

Le déplacement reste possible **même une fois le matériel posé ou rendu**, y
compris pour un rendez-vous passé : l'appareil et sa date de pose ne bougent
alors plus, seule la **dépose suit le nouveau rendez-vous** (matériel posé) ;
un matériel déjà rendu reste inchangé et seule la date du rendez-vous
cardiologue est modifiée. Le logiciel vérifie que l'appareil n'est pas promis
à un autre patient sur la période prolongée.

**Annuler le rendez-vous** libère immédiatement le matériel pour d'autres
patients. Le rendez-vous n'est pas effacé : il reste consultable, marqué
*ANNULÉ*, avec le motif que vous aurez saisi.

---

## Onglet **Calendrier** — voir loin

Le matériel en lignes, les jours en colonnes. Chaque trait coloré est un examen
en cours : on voit d'un coup d'œil les périodes chargées et les appareils libres.
Pour un Holter 24 h, le trait court sur **trois jours** : la **veille de la
pose** (en plus clair — l'appareil est réservé), le **jour de pose** au milieu,
où s'inscrit le nom du patient, et le **jour de dépose**. Les examens plus
longs (48 h, 72 h, Spider Flash) s'étendent d'autant. Cliquez sur un trait pour
voir le patient concerné.

Les boutons du haut font défiler la période ; la liste déroulante propose
deux vues : **30 jours** (vue d'ensemble) et **3 jours** (vue rapprochée,
navigation par pas de 3 jours). En vue **3 jours**, chaque trait
affiche l'**heure de pose à gauche**, le **nom du patient** au milieu et
l'**heure de dépose à droite**. Dans les deux vues, le trait **démarre et
s'arrête à la position de l'heure** dans la colonne du jour (8 h au bord
gauche, 18 h au bord droit) : on lit d'un coup d'œil si la pose est en début
ou en fin de journée.

**Filtrer par type** — cliquez sur un type dans la légende (Holter DMS,
Holter ELA, MAPA…) pour le masquer et alléger le tableau ; un second clic
(ou « Tout afficher ») le réaffiche.

**Prendre un rendez-vous d'un clic** — cliquez sur une **case libre** de la
ligne d'un appareil, au niveau d'une journée : choisissez l'heure de pose, le
nom du patient, le sexe, le cardiologue et la durée (fixe pour les MAPA,
polygraphies et Spider Flash ; 24, 48 ou 72 h pour les Holter). La **dépose**
et le **rendez-vous cardiologue** sont déduits automatiquement — au créneau le
plus proche de la durée de port, quitte à raccourcir un peu le port quand un
week-end s'interpose (un avertissement le signale). Les cases se colorent au
survol ; une case occupée, passée ou un jour fermé ne réagit pas.

**Corriger un numéro d'appareil** — si le mauvais appareil a été posé,
cliquez sur le trait puis « Changer d'appareil » et choisissez l'appareil
réellement posé. S'il était réservé pour un autre patient, ce dernier est
**réattribué automatiquement** à un autre appareil (celui d'origine, redevenu
libre, en fait partie), le tout en une seule opération. Une fenêtre d'alerte
prévient si un conflit rend la correction impossible — par exemple si
l'appareil choisi est déjà porté par un autre patient.

---

## Onglet **Alertes** — ce qui demande une action

Une pastille rouge sur l'onglet indique le nombre d'alertes en cours,
recalculé à chaque nouvelle demande et à chaque modification :

1. **Réservations sur un appareil indisponible** (hors service ou retiré du
   parc). Le bouton **Réattribuer** cherche d'abord un autre appareil sur le
   **même créneau** — le patient n'a rien à savoir. Sinon, il propose le
   créneau **le plus proche de la durée de port prévue** (24 h en général,
   parfois un peu moins) : après confirmation, le patient est ajouté à la
   liste des rappels.
2. **Patients à rappeler** — chaque fois qu'un horaire de pose a été modifié
   après coup, le patient apparaît ici avec son téléphone et le détail du
   changement. Cochez « Rappelé » une fois le patient prévenu ; la liste est
   partagée entre toutes les secrétaires.

---

## Onglet **Réglages**

Consultable par toutes, modifiable par les administratrices seulement.
Voir [04-MISES-A-JOUR.md](04-MISES-A-JOUR.md) pour les changements plus
profonds.

**Parc matériel** — cliquez sur un appareil pour le gérer.

**Mettre hors service** (panne passagère) : l'appareil est grisé et n'est plus
jamais proposé, mais reste dans le parc ; un clic sur « Remettre en service »
le réactive. Les patients qui l'attendaient apparaissent dans l'onglet
**Alertes** pour être réattribués.

Pour **retirer** définitivement un appareil (réforme) : si des patients l'attendent
encore, le logiciel refuse, **liste les patients concernés** et propose de tous
les réattribuer automatiquement à d'autres appareils du même type. Vous validez
en un clic.

**Horaires et capacité** — jours d'ouverture, plages du matin et de
l'après-midi, fin de la plage réservée aux poses de polygraphie, nombre de
poses par quart d'heure.

**Fermetures exceptionnelles** — congés, ponts. Les jours fériés français sont
déjà connus du logiciel, il est inutile de les saisir.

**Sauvegarde** — adresses qui reçoivent le fichier quotidien, fréquence d'envoi.
C'est la **seule** rubrique que chaque secrétaire peut modifier sans être
administratrice. Tant qu'aucune adresse n'y figure, un bandeau orange le rappelle
en haut de l'écran : cliquez dessus pour arriver directement au bon endroit.

**Statistiques** — pour l'année choisie : nombre d'examens, de patients, détail
par type de matériel, par cardiologue demandeur et par appareil.

---

## Les règles que le logiciel applique tout seul

Vous n'avez pas à y penser, mais les connaître aide à comprendre ses réponses.

1. Les rendez-vous se prennent sur deux **plages** : le matin de 8h45 à 11h30
   et l'après-midi de 14h00 à 16h30 (16h00 le vendredi) ; le samedi de 8h30 à
   11h45, matin seulement.
2. La **dépose** a lieu 15 minutes avant le rendez-vous cardiologue, pour que le
   résultat soit prêt pendant la consultation.
3. La **pose** a lieu la durée de port avant la dépose : la veille pour 24 h,
   l'avant-veille pour 48 h, et ainsi de suite ; 7 jours avant pour le Spider Flash.
4. La **polygraphie ventilatoire** se pose **la veille, l'après-midi
   uniquement** — sa plage est prolongée jusqu'à **17h15** (16h45 le vendredi),
   réservée aux polygraphies — et se dépose **le lendemain matin, avant midi**,
   après une seule nuit d'enregistrement. Le rendez-vous cardiologue doit donc
   permettre une dépose en matinée, et il n'y a pas de polygraphie déposée le
   lundi (la veille est un dimanche).
5. **La veille d'un lundi est le samedi.** Personne ne travaille du samedi midi
   au lundi matin.
6. Les **jours fériés** sont sautés automatiquement.
7. Un appareil est **immobilisé de sa pose à son retour** : il ne peut être donné
   à personne d'autre entre-temps, même une minute.
8. **Une pose maximum par quart d'heure.** Les **déposes ne sont pas
   limitées** : plusieurs patients peuvent rendre leur matériel sur le même
   créneau. Un patient qui reçoit deux appareils ne compte que pour un.
9. Les appareils **501 et 502** (ELA), **101** (DMS) et **Y** (MAPA) sont
   **réservés aux urgences** : le logiciel ne les attribue jamais
   automatiquement.
10. À matériel équivalent, le logiciel choisit l'appareil **revenu depuis le plus
    longtemps**, pour user le parc de façon homogène.

---

## En cas de problème

**Le site ne s'ouvre pas / la pastille reste rouge**
Rechargez la page (`Ctrl + F5`). Si cela ne suffit pas, vérifiez votre connexion
Internet, puis prévenez la personne référente.

**Le site est indisponible plus longtemps**
Ouvrez le dernier fichier **« sauvegarde holter JJ-MM-AAAA.xlsx »** reçu par
e-mail ou déposé dans le dossier partagé. Il reprend la présentation de
l'interface et contient une feuille **« Saisie manuelle »** pour noter les
rendez-vous pris pendant la panne. Sa feuille **« Mode d'emploi »** rappelle les
règles à respecter. Au retour du service, ce fichier sert de référence pour
remettre le logiciel à jour, **sans perdre aucun rendez-vous**.
