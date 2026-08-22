-- =============================================================================
--  PLANNING HOLTER — Fichier 2/4 : sécurité
-- =============================================================================
--  À coller dans Supabase > SQL Editor, après le fichier 1, puis « Run ».
--
--  Principe : la base refuse par défaut TOUT accès. Seul un compte connecté
--  et rattaché à un profil actif peut lire ou écrire. Personne ne peut atteindre
--  les données patients sans identifiants, même en connaissant l'adresse du site.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions d'aide (elles contournent volontairement les règles d'accès pour
-- pouvoir lire la table des profils sans boucle infinie)
-- -----------------------------------------------------------------------------
create or replace function public.est_actif()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profils p where p.id = auth.uid() and p.actif
  );
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profils p where p.id = auth.uid() and p.actif and p.role = 'admin'
  );
$$;

create or replace function public.nom_utilisateur()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.nom from public.profils p where p.id = auth.uid()),
    (select u.email from auth.users u where u.id = auth.uid()),
    'inconnu'
  );
$$;

-- -----------------------------------------------------------------------------
-- Activation du verrouillage sur toutes les tables
-- -----------------------------------------------------------------------------
alter table public.profils     enable row level security;
alter table public.appareils   enable row level security;
alter table public.rendez_vous enable row level security;
alter table public.poses       enable row level security;
alter table public.parametres  enable row level security;
alter table public.journal     enable row level security;

-- Les visiteurs non connectés n'ont strictement aucun droit.
revoke all on public.profils, public.appareils, public.rendez_vous,
              public.poses, public.parametres, public.journal from anon;

-- -----------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------
drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils
  for select to authenticated
  using (id = auth.uid() or public.est_admin());

drop policy if exists profils_ecriture on public.profils;
create policy profils_ecriture on public.profils
  for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- -----------------------------------------------------------------------------
-- Appareils : tout le monde lit, seuls les administrateurs modifient le parc
-- -----------------------------------------------------------------------------
drop policy if exists appareils_lecture on public.appareils;
create policy appareils_lecture on public.appareils
  for select to authenticated using (public.est_actif());

drop policy if exists appareils_ecriture on public.appareils;
create policy appareils_ecriture on public.appareils
  for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- -----------------------------------------------------------------------------
-- Rendez-vous et poses : toutes les secrétaires travaillent sur les mêmes données
-- -----------------------------------------------------------------------------
drop policy if exists rdv_lecture on public.rendez_vous;
create policy rdv_lecture on public.rendez_vous
  for select to authenticated using (public.est_actif());

drop policy if exists rdv_creation on public.rendez_vous;
create policy rdv_creation on public.rendez_vous
  for insert to authenticated with check (public.est_actif());

drop policy if exists rdv_modification on public.rendez_vous;
create policy rdv_modification on public.rendez_vous
  for update to authenticated
  using (public.est_actif()) with check (public.est_actif());

-- La suppression définitive est réservée aux administrateurs : une annulation
-- conserve la trace du rendez-vous, ce qui est indispensable en cas de litige.
drop policy if exists rdv_suppression on public.rendez_vous;
create policy rdv_suppression on public.rendez_vous
  for delete to authenticated using (public.est_admin());

drop policy if exists poses_lecture on public.poses;
create policy poses_lecture on public.poses
  for select to authenticated using (public.est_actif());

drop policy if exists poses_creation on public.poses;
create policy poses_creation on public.poses
  for insert to authenticated with check (public.est_actif());

drop policy if exists poses_modification on public.poses;
create policy poses_modification on public.poses
  for update to authenticated
  using (public.est_actif()) with check (public.est_actif());

drop policy if exists poses_suppression on public.poses;
create policy poses_suppression on public.poses
  for delete to authenticated using (public.est_admin());

-- -----------------------------------------------------------------------------
-- Paramètres
-- -----------------------------------------------------------------------------
drop policy if exists parametres_lecture on public.parametres;
create policy parametres_lecture on public.parametres
  for select to authenticated using (public.est_actif());

drop policy if exists parametres_ecriture on public.parametres;
create policy parametres_ecriture on public.parametres
  for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- Exception voulue : toute secrétaire peut renseigner les adresses e-mail qui
-- reçoivent la sauvegarde quotidienne, sans avoir besoin d'être administratrice.
drop policy if exists parametres_sauvegarde_maj on public.parametres;
create policy parametres_sauvegarde_maj on public.parametres
  for update to authenticated
  using (cle = 'sauvegarde' and public.est_actif())
  with check (cle = 'sauvegarde' and public.est_actif());

drop policy if exists parametres_sauvegarde_creation on public.parametres;
create policy parametres_sauvegarde_creation on public.parametres
  for insert to authenticated
  with check (cle = 'sauvegarde' and public.est_actif());

-- -----------------------------------------------------------------------------
-- Journal : chacun y écrit, seuls les administrateurs le relisent
-- -----------------------------------------------------------------------------
drop policy if exists journal_ecriture on public.journal;
create policy journal_ecriture on public.journal
  for insert to authenticated with check (public.est_actif());

drop policy if exists journal_lecture on public.journal;
create policy journal_lecture on public.journal
  for select to authenticated using (public.est_admin());

-- -----------------------------------------------------------------------------
-- Création automatique d'un profil à la première connexion d'un compte invité
-- (le compte reste INACTIF tant qu'un administrateur ne l'a pas validé)
-- -----------------------------------------------------------------------------
create or replace function public.creer_profil_a_l_inscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, nom, role, actif)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nom', new.email), 'secretaire', false)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil_a_l_inscription();
