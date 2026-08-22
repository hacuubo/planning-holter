-- =============================================================================
--  PLANNING HOLTER — Migration : moins de données personnelles
-- =============================================================================
--  ⚠️ CE FICHIER NE SERT QUE SI VOUS AVIEZ DÉJÀ INSTALLÉ LA BASE
--     avec les colonnes « prénom » et « date de naissance ».
--
--  Si vous installez le logiciel pour la première fois, ignorez ce fichier :
--  les fichiers 01 à 04 créent déjà la bonne structure.
--
--  Ce que fait cette migration :
--    • ajoute la colonne « sexe du patient » (F ou M) ;
--    • SUPPRIME définitivement le prénom et la date de naissance de tous les
--      rendez-vous, passés comme à venir.
--
--  ⚠️ Cette suppression est IRRÉVERSIBLE. C'est voulu : il s'agit précisément
--     d'effacer ces informations. Aucun rendez-vous n'est perdu, seules ces
--     deux colonnes disparaissent.
--
--  À coller dans Supabase ▸ SQL Editor, puis « Run ».
-- =============================================================================

-- 1. Nouvelle colonne « sexe »
alter table public.rendez_vous
  add column if not exists patient_sexe text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rendez_vous_sexe_valide') then
    alter table public.rendez_vous
      add constraint rendez_vous_sexe_valide check (patient_sexe in ('F', 'M'));
  end if;
end $$;

comment on column public.rendez_vous.patient_sexe is
  'F ou M. Seules informations conservées sur le patient : nom de famille et sexe.';

-- 2. Suppression des informations qui ne doivent plus être conservées
alter table public.rendez_vous drop column if exists patient_prenom;
alter table public.rendez_vous drop column if exists patient_naissance;

-- 3. L'index de recherche ne porte plus que sur le nom
drop index if exists public.rendez_vous_recherche_idx;
create index if not exists rendez_vous_recherche_idx
  on public.rendez_vous (lower(patient_nom));

-- 4. Trace de l'opération dans le journal
insert into public.journal (qui_nom, action, cible, details)
values (
  'migration',
  'réduction des données patients',
  'rendez_vous',
  jsonb_build_object(
    'supprime', jsonb_build_array('patient_prenom', 'patient_naissance'),
    'ajoute', 'patient_sexe'
  )
);

-- =============================================================================
--  APRÈS CETTE MIGRATION
--  Relancez le fichier 03-fonctions.sql : il contient la version à jour de la
--  fonction de prise de rendez-vous, qui attend désormais le sexe du patient.
-- =============================================================================
