-- =============================================================================
--  PLANNING HOLTER — Fichier 1/4 : structure de la base de données
-- =============================================================================
--  À coller dans Supabase > SQL Editor, puis « Run ».
--  Ce fichier peut être relancé sans risque : il ne détruit aucune donnée.
--
--  Convention de temps : toutes les dates de rendez-vous sont stockées en
--  « heure de l'horloge du cabinet » (type timestamp SANS fuseau horaire).
--  Cela supprime définitivement les décalages liés au changement d'heure.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- -----------------------------------------------------------------------------
-- Utilisateurs autorisés (une ligne par secrétaire / médecin)
-- -----------------------------------------------------------------------------
create table if not exists public.profils (
  id          uuid primary key references auth.users (id) on delete cascade,
  nom         text not null,
  role        text not null default 'secretaire' check (role in ('secretaire', 'admin')),
  actif       boolean not null default true,
  cree_le     timestamptz not null default now()
);

comment on table public.profils is
  'Personnes autorisées à utiliser le planning. Un compte Supabase sans profil actif ne voit rien.';

-- -----------------------------------------------------------------------------
-- Inventaire du matériel
-- -----------------------------------------------------------------------------
create table if not exists public.appareils (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  categorie    text not null check (categorie in ('holter_ecg', 'mapa', 'polygraphie', 'spider', 'autre')),
  marque       text,
  urgence      boolean not null default false,
  actif        boolean not null default true,
  ordre        integer not null default 0,
  commentaire  text,
  cree_le      timestamptz not null default now()
);

-- Un même code ne peut pas exister deux fois pour une même catégorie/marque.
create unique index if not exists appareils_code_unique
  on public.appareils (categorie, coalesce(marque, ''), code);

comment on column public.appareils.urgence is
  'Appareil réservé aux urgences : jamais attribué automatiquement.';
comment on column public.appareils.actif is
  'false = appareil retiré du parc. On ne supprime jamais physiquement un appareil ayant servi.';

-- -----------------------------------------------------------------------------
-- Rendez-vous patients
-- -----------------------------------------------------------------------------
-- Choix du cabinet : on n'enregistre que le NOM DE FAMILLE et le SEXE du
-- patient. Ni prénom, ni date de naissance, afin de limiter au maximum les
-- informations personnelles conservées.
create table if not exists public.rendez_vous (
  id                 uuid primary key default gen_random_uuid(),
  patient_nom        text not null,
  patient_sexe       text check (patient_sexe in ('F', 'M')),
  cardiologue        text not null,
  rdv_cardio         timestamp not null,
  telephone          text,
  commentaire        text,
  statut             text not null default 'prevu' check (statut in ('prevu', 'annule')),
  cree_par           uuid references auth.users (id),
  cree_par_nom       text,
  cree_le            timestamptz not null default now(),
  modifie_le         timestamptz not null default now(),
  annule_le          timestamptz,
  annule_par_nom     text,
  motif_annulation   text
);

create index if not exists rendez_vous_rdv_cardio_idx on public.rendez_vous (rdv_cardio);
create index if not exists rendez_vous_recherche_idx
  on public.rendez_vous (lower(patient_nom));
create index if not exists rendez_vous_statut_idx on public.rendez_vous (statut);

comment on column public.rendez_vous.rdv_cardio is
  'Heure du rendez-vous avec le cardiologue. La dépose du matériel a lieu 15 minutes avant.';

-- -----------------------------------------------------------------------------
-- Poses de matériel (une ligne par appareil attribué à un rendez-vous)
-- -----------------------------------------------------------------------------
create table if not exists public.poses (
  id               uuid primary key default gen_random_uuid(),
  rdv_id           uuid not null references public.rendez_vous (id) on delete cascade,
  appareil_id      uuid not null references public.appareils (id) on delete restrict,
  duree_heures     integer not null check (duree_heures between 1 and 1000),
  marque_demandee  text,
  debut            timestamp not null,          -- pose
  fin              timestamp not null,          -- dépose prévue
  retour_effectif  timestamp,                   -- retour réel de l'appareil
  statut           text not null default 'prevu' check (statut in ('prevu', 'pose', 'rendu', 'annule')),
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now(),
  constraint poses_duree_positive check (fin > debut),
  constraint poses_retour_coherent check (retour_effectif is null or retour_effectif >= debut)
);

create index if not exists poses_rdv_idx on public.poses (rdv_id);
create index if not exists poses_appareil_idx on public.poses (appareil_id);
create index if not exists poses_debut_idx on public.poses (debut);
create index if not exists poses_fin_idx on public.poses (fin);

-- ►►► LA GARANTIE ANTI-DOUBLON ◄◄◄
-- Un même appareil ne peut jamais être immobilisé deux fois sur des périodes qui
-- se chevauchent. Cette contrainte est vérifiée par PostgreSQL lui-même : même si
-- deux secrétaires valident un rendez-vous à la même seconde, la seconde reçoit
-- une erreur et le logiciel lui propose automatiquement un autre appareil.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'poses_pas_de_chevauchement') then
    alter table public.poses
      add constraint poses_pas_de_chevauchement
      exclude using gist (
        appareil_id with =,
        tsrange(debut, coalesce(retour_effectif, fin), '[)') with &&
      ) where (statut <> 'annule');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Paramètres du logiciel (une ligne par rubrique, contenu libre en JSON)
-- -----------------------------------------------------------------------------
create table if not exists public.parametres (
  cle          text primary key,
  valeur       jsonb not null,
  modifie_le   timestamptz not null default now(),
  modifie_par  text
);

-- -----------------------------------------------------------------------------
-- Journal des actions (traçabilité, obligatoire pour des données de santé)
-- -----------------------------------------------------------------------------
create table if not exists public.journal (
  id        bigserial primary key,
  quand     timestamptz not null default now(),
  qui       uuid,
  qui_nom   text,
  action    text not null,
  cible     text,
  details   jsonb
);

create index if not exists journal_quand_idx on public.journal (quand desc);

-- -----------------------------------------------------------------------------
-- Mise à jour automatique de `modifie_le`
-- -----------------------------------------------------------------------------
create or replace function public.touch_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

drop trigger if exists rendez_vous_touch on public.rendez_vous;
create trigger rendez_vous_touch before update on public.rendez_vous
  for each row execute function public.touch_modifie_le();

drop trigger if exists poses_touch on public.poses;
create trigger poses_touch before update on public.poses
  for each row execute function public.touch_modifie_le();

-- -----------------------------------------------------------------------------
-- Diffusion temps réel : toute modification est poussée aux autres secrétaires
-- -----------------------------------------------------------------------------
alter table public.rendez_vous replica identity full;
alter table public.poses replica identity full;
alter table public.appareils replica identity full;
alter table public.parametres replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rendez_vous', 'poses', 'appareils', 'parametres'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
