-- =============================================================================
--  PLANNING HOLTER — Mise à jour 1.3 (pour les bases DÉJÀ installées)
-- =============================================================================
--  À coller dans Supabase > SQL Editor, puis « Run ». Relançable sans risque.
--  Ensuite, rejouez aussi le fichier 03-fonctions.sql (nouvelles fonctions).
--
--  Une installation NEUVE n'a pas besoin de ce fichier : les fichiers 1 à 4
--  contiennent déjà tout.
--
--  Contenu :
--   • appareils.hors_service : mise hors service temporaire d'un appareil
--     (panne), sans le retirer du parc ;
--   • table rappels : patients à prévenir quand un horaire de pose change.
-- =============================================================================

alter table public.appareils
  add column if not exists hors_service boolean not null default false;

comment on column public.appareils.hors_service is
  'true = appareil momentanément indisponible (panne). Il reste dans le parc et se réactive d''un clic.';

create table if not exists public.rappels (
  id           uuid primary key default gen_random_uuid(),
  rdv_id       uuid references public.rendez_vous (id) on delete cascade,
  patient_nom  text not null,
  telephone    text,
  message      text not null,
  fait         boolean not null default false,
  fait_par     text,
  cree_le      timestamptz not null default now()
);

create index if not exists rappels_fait_idx on public.rappels (fait, cree_le);

alter table public.rappels enable row level security;
revoke all on public.rappels from anon;

drop policy if exists rappels_lecture on public.rappels;
create policy rappels_lecture on public.rappels
  for select to authenticated using (public.est_actif());

drop policy if exists rappels_creation on public.rappels;
create policy rappels_creation on public.rappels
  for insert to authenticated with check (public.est_actif());

drop policy if exists rappels_modification on public.rappels;
create policy rappels_modification on public.rappels
  for update to authenticated
  using (public.est_actif()) with check (public.est_actif());

drop policy if exists rappels_suppression on public.rappels;
create policy rappels_suppression on public.rappels
  for delete to authenticated using (public.est_admin());

-- Temps réel : les rappels arrivent chez toutes les secrétaires.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rappels'
  ) then
    alter publication supabase_realtime add table public.rappels;
  end if;
end $$;
