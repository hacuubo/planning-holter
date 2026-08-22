Je ne suis pas un développeur. Il va falloir que tu m'accompagnes sur ce projet.

Une simplicité de MAJ est nécessaire pour des modification ultérieures, via ton aide. 

L'idée de ce projet est de créer une interface pour un planning d'utilisation de nos holter ECG, MAPA, POLYGRAPHIES VENTILATOIRES, SPIDER FLASH, pour suppléer à celle papier utilisée par nos secrétaires et peu lisible.



Cahier des charges global:

\-L'interface doit être consultable par toutes les secrétaires, en même temps, les modifications réalisées par une doivent être vue par les autres si elles sont connectées en temps réel.

\-Les données doivent être sauvegardées en plus d'un cloud (celui que tu trouvera le plus pertinent) + dans un dossier qu'on définira par la suite sous la forme d'un fichier excel, tous les jours, et sur 7 jours, le fichier doit être supprimé en suite (sauvegarde uniqument sur 7j glissant pour limiter la mémoire) (nom de la sauvegarde: sauvegarde holter + date (JJ/MM/AAAA)).

\-La sécurité de l'interface doit être optimale

\-Une vérification de débogage et d'anomalie doit être réalisée avant le lancement de la version

\-L'interface doit être claire, épurée, dénuée de choix superflus, et simple d'utilisation.

\-Elle doit être utilisable d'un ordinateur ou d'un telephone

\-Une fois l'interface opérationnelle, il faudra touver une solution pour que les MAJ d'ultérieures versions soient réalisés depuis cette discussion claude et que tu modifies ce que j'ai dit dans le code initial, que tout cela soit mis à jour pour les différents utilisateurs sans perte de donnée sur les rendez vous à venir (prendre en compte la sauvegarde entière dans la version précédente pour absence de perte de donnée



Matériel:

\-Holter ECG:

\*11 de marque ELA (Nommés 51, 52, 53, 54, 55, 56, 57, 58, 59 + \[501, 502 réservés aux urgences])

\*14 de marque DMS (Nommé de 1 à 13 + \[ 502 réservé aux urgences])

\-MAPA 14 appareils(nommés de A à M + \[Y réservé aux urgences], il n'y a pas de "L")

\-1 spider flash

\-3 polygraphes pour l'apnée du sommeil (Nommés N1, N2, N3)



Organisation de l'interface:

\-1 onglet à la date du jour pour la personne qui pose et dépose les appareils, elle doit avoir son programme clair, noté heure par heure, patient par patient et on doit trouver un code couleur agréable pour différencier les MAPA, HOLTER ECG (2 nuances d'une meme couleur entre DMS et ELA), MAPA, spider flash et polygraphie.

\-1 onglet prise de rendez vous, ou la secrétaire sélectionne le jour et l'heure du rendez vous avec le cardiologue du patient, rentre son nom et prénom, date de naissance (non obligatoire pour valider le rendez vous), les initiales du cardio demandeur (MA, PL, RG, DC, AZ, LM, KS, GB, RB) l'heure du rendez vous, le matériel à poser souhaité, durée nominale de 24H, On pourra sélectionner 48 ou 72H pour les holter ECG, la durée du spider flash est de 7 jours. Possibilité de sélectionner plusieurs matériels à poser pour un même patient.

Sur cet onglet, il doit être mentionné les appareils restants disponibles pour la pose la veille (la plupart des appareils), ou l'avant veille ou les jours avant pour que la durée approximative de port de l'appareil se termine le jour de la consultation.

\-La veille d'un rendez vous le lundi est le samedi, dernière pose à 11H45, personne ne travaille à partir du samedi midi jusqu'au lundi matin 8H. Intégrer à ce fonctionnement les jours fériés calendaires annuels.

\-Les horaires de pose et de dépose sont toutes les 15 minutes (2 gestes par 15 minutes de pose et dépose) de 7H45  à 18H

\-L'interface doit permettre:

&#x20; \*D'annoncer une impossibilité de pose de matériel le jour de la pose si dans l'agenda il n'en reste plus

&#x20; \*De proposer une horaire de pose des matériels le jour (la même si plusieurs demandés, donc on attendra que tous les dispositifs soient présents, de mettre en avant les horaires optimales pour faciliter le roulement des appareil.

&#x20; \*De proposer un autre jour et plusieurs heures de rendez vous ou les matériels demandés seront disponibles, la secrétaire adaptera dans un second temps de rendez vous cardiologue en fonction des résulats.

\-Au rendez vous avec le cardio, le patient doit avoir le résultat de son examen réalisé avec le matériel, donc la dépose s'effectue 20 minutes avant le rdv, à prendre en compte pour le retour de chaque matériel, une fois le retour effectué le matériel est rendu disponible par l'interface et la prise de rendez vous (à tenir compte pour les dispo dans l'interface et les prise de rendez vous pas les secrétaires)



Cahier des charges et conflits fonctionnels:

\-Envoyer tous les jours un mail avec les rendez vous du lendemain sur un PDF à une adresse mail qu'on définiera avant le lancement du projet

\-Le but étant que toutes les secrétaires puissent travailler en même temps sans se gêner, sans attribuer le même numéro de matériel sur des patients différents qui auraient des prises de rdv simulatanés.

\-Lors de l'attribution d'un numéro de materiel via la plateforme à un patient lambda, il faut que ce numero soit dispnible pour le patient et être sur que le materiel ne soit pas attribué à u autre patient le lendemain avant que le patient le ramène.

\-Une alerte sur l'interface visible doit être mentionnée si aucun des matériels disponibles



\-Onglet paramètres : 

&#x20; \*Ajout/Suppression matériel qui devient alors un matériel de plus dans la liste (noter quel type/ marque pour Holter, avec possibilité « autre »

&#x20; \*Si suppression de matériel, fenêtre confirmer nécessaire, si confirmées message d’erreur avec suppression impossible si un ou plusieurs patients dépendant de ce matériel dans le planning future. IL Faut alors proposer le changement de tous les patients porteur de ce matériel dans le planning futur par un des autres du même type (holter ECG en général pour les holters)en tenant compte des règles d’atribution



&#x20; \*Statistiques dans paramètre disponible avec résultats sur l’année en cours, statistiques d’utilisation, générale et par cardiologue (nombre de patients, quel type de matériel etc.)



\-Les fichiers Excel générés de manière journalière comme sauvegarde de sécurité devront avoir une fonctionnalité et présentation au plus proche de l’interface d’origine pour être utilisés si problème de l’interface en ligne. Les secrétaires pourront l’utiliser de manière partagée pour réaliser les même tâches qu’avec l’interface. Nous utiliseront au moment de reprise de l’interface le dernier fichier Excel modifié durant l’indisponibilité de l’interface comme base de données et reprendre toutes les informations pour être à jour.



\-Dans les paramètres il sera possible de modifier les plages horaires de rendez vous disponible au rendez vous pour pose et dépose de matériel ainsi que le nombre de patient par 1/4 d’heure



\-Dans paramètre il est possible de modifier ou d’ajouter des adresses mail d’envoi du fichier Excel journalier et de modifier l’occurrence de l’envoi.



\-Lors de la prise de rdv, possibilité de noter si Holter ELA ou DMS, le cas échéant, noter si l’un des 2 n’est pas disponible et rediriger vers l’autre modèle si c’est le cas 



\-Possibilité d’annuler le rendez-vous vous du patient de pose du matériel



\-Possibilité de recherche de patient ayant déjà un rendez-vous via barre de recherche et annulation également du rendez-vous vous via cet outil.



\-3 eme onglet avec un calendrier général, les jours en haut un par un le matériel à gauche dans l’ordre, les rdv marqués pour chaque matériel par un trait courant sur les jours utilisés (posés sur les patients), ce calendrier défilant sur l’année.

