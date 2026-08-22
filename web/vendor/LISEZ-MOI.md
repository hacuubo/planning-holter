# Bibliothèques externes

Ce dossier contient les rares bibliothèques que le logiciel n'écrit pas lui-même.
Elles sont **copiées dans le projet** volontairement : le site ne dépend ainsi
d'aucun serveur extérieur et continue de fonctionner même si un service tiers
tombe en panne.

| Fichier        | Origine                          | Version   | Rôle                                                        |
|----------------|----------------------------------|-----------|-------------------------------------------------------------|
| `supabase.js`  | npm `@supabase/supabase-js`      | 2.112.3   | Dialogue avec la base de données, connexion, temps réel     |

## Pour mettre à jour cette bibliothèque

Il n'y a normalement aucune raison de le faire seul. Demandez-le dans la
discussion Claude : la mise à jour consiste à remplacer ce seul fichier.

Le générateur de fichiers Excel, lui, est écrit dans le projet
(`web/js/core/xlsx.js`) : aucune bibliothèque externe n'est nécessaire.
