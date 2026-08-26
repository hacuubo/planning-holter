-- =============================================================================
--  PLANNING HOLTER — Fichier 3/4 : règles appliquées par la base elle-même
-- =============================================================================
--  À coller dans Supabase > SQL Editor, après les fichiers 1 et 2, puis « Run ».
--
--  Ces fonctions garantissent qu'aucune secrétaire ne peut, même par accident
--  ou en cas de clic simultané, attribuer deux fois le même appareil ou
--  surcharger un quart d'heure.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Heure de l'horloge du cabinet
-- Les serveurs Supabase sont réglés sur UTC ; sans cette conversion, un retour
-- de matériel enregistré à 14h00 à Paris serait noté 12h00 en hiver.
-- -----------------------------------------------------------------------------
create or replace function public.maintenant_cabinet()
returns timestamp language sql stable as $$
  select (now() at time zone 'Europe/Paris')::timestamp;
$$;

-- -----------------------------------------------------------------------------
-- Écriture au journal
-- -----------------------------------------------------------------------------
create or replace function public.journaliser(p_action text, p_cible text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.journal (qui, qui_nom, action, cible, details)
  values (auth.uid(), public.nom_utilisateur(), p_action, p_cible, p_details);
$$;

-- -----------------------------------------------------------------------------
-- Nombre maximal de POSES par quart d'heure (lu dans les paramètres).
-- Les déposes ne sont pas limitées : seul le créneau de pose est contrôlé.
-- -----------------------------------------------------------------------------
drop function if exists public.gestes_par_creneau();
create or replace function public.poses_par_creneau()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (valeur ->> 'posesParCreneau')::int from public.parametres where cle = 'planification'),
    1
  );
$$;

-- -----------------------------------------------------------------------------
-- Le cabinet est-il ouvert ce jour de la semaine ? (0 = dimanche … 6 = samedi)
-- Lit les horaires enregistrés dans les paramètres ; par défaut, seul le
-- dimanche est fermé.
-- -----------------------------------------------------------------------------
create or replace function public.jour_ouvert(p_jour integer)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (valeur -> p_jour::text) is not null and (valeur -> p_jour::text) <> 'null'::jsonb
       from public.parametres where cle = 'horaires'),
    p_jour <> 0
  );
$$;

-- -----------------------------------------------------------------------------
-- Contrôle de la charge d'un quart d'heure : seules les POSES sont comptées
-- (les déposes accueillent un nombre illimité de patients). Un patient qui
-- reçoit plusieurs appareils au même moment ne compte que pour une pose.
-- -----------------------------------------------------------------------------
create or replace function public.verifier_capacite_creneau()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max integer := public.poses_par_creneau();
  v_nb  integer;
begin
  if new.statut = 'annule' then
    return new;
  end if;

  -- Sérialise les réservations concurrentes portant sur le même quart d'heure.
  perform pg_advisory_xact_lock(hashtext('creneau:' || new.debut::text));

  select count(distinct rdv_id) into v_nb
  from public.poses
  where statut <> 'annule'
    and rdv_id <> new.rdv_id
    and id is distinct from new.id
    and debut = new.debut;

  if v_nb + 1 > v_max then
    raise exception
      'CRENEAU_COMPLET: le créneau de pose du % est déjà pris par % patient(s) (maximum %).',
      to_char(new.debut, 'DD/MM/YYYY à HH24:MI'), v_nb, v_max
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists poses_capacite on public.poses;
create trigger poses_capacite
  before insert or update of debut, fin, statut on public.poses
  for each row execute function public.verifier_capacite_creneau();

-- -----------------------------------------------------------------------------
-- Contrôles de cohérence d'une pose
-- -----------------------------------------------------------------------------
create or replace function public.verifier_coherence_pose()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rdv       timestamp;
  v_appareil  public.appareils%rowtype;
begin
  select rdv_cardio into v_rdv from public.rendez_vous where id = new.rdv_id;

  if extract(minute from new.debut)::int % 15 <> 0 or extract(minute from new.fin)::int % 15 <> 0 then
    raise exception 'HORAIRE_INVALIDE: les poses et déposes se font par quart d''heure.'
      using errcode = 'check_violation';
  end if;

  -- Le calendrier détaillé (jours fériés, samedi, congés) est géré par
  -- l'interface. La base ne retient ici qu'un garde-fou : refuser un jour
  -- explicitement fermé dans les horaires, ce qui protège d'une page laissée
  -- ouverte plusieurs jours avec d'anciens réglages.
  if not public.jour_ouvert(extract(dow from new.debut)::int)
     or not public.jour_ouvert(extract(dow from new.fin)::int) then
    raise exception 'JOUR_FERME: le cabinet est fermé ce jour-là.'
      using errcode = 'check_violation';
  end if;

  if new.debut::time < time '07:00' or new.debut::time > time '19:00'
     or new.fin::time < time '07:00' or new.fin::time > time '19:00' then
    raise exception 'HORAIRE_INVALIDE: horaire en dehors des plages d''ouverture possibles.'
      using errcode = 'check_violation';
  end if;

  if v_rdv is not null and new.fin > v_rdv then
    raise exception 'DEPOSE_TROP_TARD: la dépose doit précéder le rendez-vous cardiologue.'
      using errcode = 'check_violation';
  end if;

  select * into v_appareil from public.appareils where id = new.appareil_id;
  if v_appareil.id is null or not v_appareil.actif then
    raise exception 'APPAREIL_INACTIF: cet appareil ne fait plus partie du parc.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists poses_coherence on public.poses;
create trigger poses_coherence
  before insert or update of debut, fin, appareil_id on public.poses
  for each row execute function public.verifier_coherence_pose();

-- =============================================================================
--  RÉSERVATION D'UN RENDEZ-VOUS (opération unique et indivisible)
-- =============================================================================
--  Soit tout le rendez-vous est enregistré, soit rien ne l'est. Il est donc
--  impossible qu'un patient se retrouve avec un seul de ses deux appareils.
-- =============================================================================
create or replace function public.reserver_rendez_vous(p_rdv jsonb, p_lignes jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_id     uuid;
  v_ligne  jsonb;
  v_nb     integer := 0;
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé à prendre des rendez-vous.';
  end if;

  if jsonb_array_length(p_lignes) = 0 then
    raise exception 'AUCUN_MATERIEL: sélectionnez au moins un matériel à poser.';
  end if;

  if coalesce(btrim(p_rdv ->> 'patient_nom'), '') = '' then
    raise exception 'NOM_MANQUANT: le nom de famille du patient est obligatoire.';
  end if;

  if coalesce(p_rdv ->> 'patient_sexe', '') not in ('F', 'M') then
    raise exception 'SEXE_MANQUANT: indiquez le sexe du patient (F ou M).';
  end if;

  insert into public.rendez_vous (
    patient_nom, patient_sexe, cardiologue,
    rdv_cardio, telephone, commentaire, cree_par, cree_par_nom
  ) values (
    btrim(p_rdv ->> 'patient_nom'),
    p_rdv ->> 'patient_sexe',
    p_rdv ->> 'cardiologue',
    (p_rdv ->> 'rdv_cardio')::timestamp,
    nullif(p_rdv ->> 'telephone', ''),
    nullif(p_rdv ->> 'commentaire', ''),
    auth.uid(),
    public.nom_utilisateur()
  )
  returning id into v_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    insert into public.poses (rdv_id, appareil_id, duree_heures, marque_demandee, debut, fin)
    values (
      v_id,
      (v_ligne ->> 'appareil_id')::uuid,
      (v_ligne ->> 'duree_heures')::int,
      nullif(v_ligne ->> 'marque_demandee', ''),
      (v_ligne ->> 'debut')::timestamp,
      (v_ligne ->> 'fin')::timestamp
    );
    v_nb := v_nb + 1;
  end loop;

  perform public.journaliser('rendez-vous créé', v_id::text,
    jsonb_build_object('patient', (p_rdv ->> 'patient_nom'), 'appareils', v_nb));

  return jsonb_build_object('id', v_id, 'appareils', v_nb);

exception
  when exclusion_violation then
    raise exception
      'CONFLIT_APPAREIL: une autre secrétaire vient d''attribuer ce matériel. '
      'Le logiciel va recalculer une proposition à jour.'
      using errcode = 'exclusion_violation';
end $$;

-- =============================================================================
--  ANNULATION
-- =============================================================================
create or replace function public.annuler_rendez_vous(p_rdv_id uuid, p_motif text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé.';
  end if;

  update public.poses set statut = 'annule'
  where rdv_id = p_rdv_id and statut <> 'annule';

  update public.rendez_vous
  set statut = 'annule',
      annule_le = now(),
      annule_par_nom = public.nom_utilisateur(),
      motif_annulation = p_motif
  where id = p_rdv_id;

  perform public.journaliser('rendez-vous annulé', p_rdv_id::text,
    jsonb_build_object('motif', p_motif));
end $$;

-- =============================================================================
--  DÉPLACEMENT / MODIFICATION D'UN RENDEZ-VOUS (opération unique et indivisible)
-- =============================================================================
--  Nouvelle date/heure de rendez-vous cardiologue et nouvelle liste de
--  matériels (changer le type de Holter, par exemple). Les anciennes poses
--  prévues sont annulées et remplacées d'un seul tenant : soit tout le
--  déplacement réussit, soit rien ne change.
-- =============================================================================
create or replace function public.deplacer_rendez_vous(p_rdv_id uuid, p_rdv_cardio timestamp, p_lignes jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_rdv    public.rendez_vous%rowtype;
  v_ligne  jsonb;
  v_nb     integer := 0;
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé à modifier des rendez-vous.';
  end if;

  if jsonb_array_length(p_lignes) = 0 then
    raise exception 'AUCUN_MATERIEL: sélectionnez au moins un matériel à poser.';
  end if;

  select * into v_rdv from public.rendez_vous where id = p_rdv_id for update;
  if v_rdv.id is null then
    raise exception 'RDV_INTROUVABLE: ce rendez-vous n''existe plus.';
  end if;
  if v_rdv.statut = 'annule' then
    raise exception 'RDV_ANNULE: un rendez-vous annulé ne peut pas être déplacé.';
  end if;

  -- Du matériel déjà posé (ou rendu) ne peut plus être déplacé.
  if exists (
    select 1 from public.poses
    where rdv_id = p_rdv_id and statut in ('pose', 'rendu')
  ) then
    raise exception 'MATERIEL_DEJA_POSE: le matériel de ce rendez-vous est déjà posé.';
  end if;

  update public.rendez_vous set rdv_cardio = p_rdv_cardio where id = p_rdv_id;

  -- Les anciennes poses prévues sont annulées, puis remplacées.
  update public.poses set statut = 'annule'
  where rdv_id = p_rdv_id and statut = 'prevu';

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    insert into public.poses (rdv_id, appareil_id, duree_heures, marque_demandee, debut, fin)
    values (
      p_rdv_id,
      (v_ligne ->> 'appareil_id')::uuid,
      (v_ligne ->> 'duree_heures')::int,
      nullif(v_ligne ->> 'marque_demandee', ''),
      (v_ligne ->> 'debut')::timestamp,
      (v_ligne ->> 'fin')::timestamp
    );
    v_nb := v_nb + 1;
  end loop;

  perform public.journaliser('rendez-vous déplacé', p_rdv_id::text,
    jsonb_build_object(
      'patient', v_rdv.patient_nom,
      'ancien_rdv', v_rdv.rdv_cardio,
      'nouveau_rdv', p_rdv_cardio,
      'appareils', v_nb));

  return jsonb_build_object('id', p_rdv_id, 'appareils', v_nb);

exception
  when exclusion_violation then
    raise exception
      'CONFLIT_APPAREIL: une autre secrétaire vient d''attribuer ce matériel. '
      'Le logiciel va recalculer une proposition à jour.'
      using errcode = 'exclusion_violation';
end $$;

-- =============================================================================
--  RETOUR D'UN APPAREIL (le matériel redevient disponible immédiatement)
-- =============================================================================
create or replace function public.enregistrer_retour(p_pose_id uuid, p_horodatage timestamp default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_quand timestamp := coalesce(p_horodatage, public.maintenant_cabinet());
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé.';
  end if;

  update public.poses
  set statut = 'rendu',
      retour_effectif = v_quand
  where id = p_pose_id;

  perform public.journaliser('retour matériel', p_pose_id::text,
    jsonb_build_object('quand', v_quand));
end $$;

-- Signale qu'un appareil a bien été posé (suivi de la journée en cours).
create or replace function public.enregistrer_pose(p_pose_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé.';
  end if;
  update public.poses set statut = 'pose' where id = p_pose_id and statut = 'prevu';
  perform public.journaliser('matériel posé', p_pose_id::text, '{}'::jsonb);
end $$;

-- =============================================================================
--  CHANGEMENT D'APPAREIL SUR UNE POSE EXISTANTE
-- =============================================================================
create or replace function public.changer_appareil(p_pose_id uuid, p_appareil_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.est_actif() then
    raise exception 'ACCES_REFUSE: votre compte n''est pas autorisé.';
  end if;

  update public.poses set appareil_id = p_appareil_id where id = p_pose_id;

  perform public.journaliser('changement d''appareil', p_pose_id::text,
    jsonb_build_object('nouvel_appareil', p_appareil_id));

exception
  when exclusion_violation then
    raise exception 'CONFLIT_APPAREIL: cet appareil est déjà pris sur cette période.'
      using errcode = 'exclusion_violation';
end $$;

-- =============================================================================
--  RETRAIT D'UN APPAREIL DU PARC
--  Refuse tant que des patients dépendent de cet appareil dans le futur.
-- =============================================================================
create or replace function public.appareil_poses_futures(p_appareil_id uuid)
returns table (
  pose_id uuid, rdv_id uuid, patient text, cardiologue text,
  debut timestamp, fin timestamp, duree_heures int
)
language sql stable security invoker set search_path = public as $$
  select p.id, r.id, r.patient_nom || coalesce(' (' || r.patient_sexe || ')', ''), r.cardiologue,
         p.debut, p.fin, p.duree_heures
  from public.poses p
  join public.rendez_vous r on r.id = p.rdv_id
  where p.appareil_id = p_appareil_id
    and p.statut in ('prevu', 'pose')
    and p.fin >= public.maintenant_cabinet()
  order by p.debut;
$$;

create or replace function public.retirer_appareil(p_appareil_id uuid, p_forcer boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_nb integer;
begin
  if not public.est_admin() then
    raise exception 'ACCES_REFUSE: seul un administrateur peut modifier le parc matériel.';
  end if;

  select count(*) into v_nb from public.appareil_poses_futures(p_appareil_id);

  if v_nb > 0 and not p_forcer then
    raise exception
      'SUPPRESSION_IMPOSSIBLE: % patient(s) doivent encore utiliser cet appareil. '
      'Réattribuez-les d''abord à un autre appareil du même type.', v_nb
      using errcode = 'check_violation';
  end if;

  update public.appareils set actif = false where id = p_appareil_id;

  perform public.journaliser('appareil retiré du parc', p_appareil_id::text,
    jsonb_build_object('poses_futures', v_nb));

  return jsonb_build_object('retire', true, 'poses_futures', v_nb);
end $$;

-- =============================================================================
--  STATISTIQUES DE L'ANNÉE
-- =============================================================================
create or replace function public.statistiques(p_annee integer)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (
    select r.id as rdv_id, r.cardiologue, r.statut as statut_rdv,
           p.id as pose_id, p.statut as statut_pose, p.duree_heures,
           a.categorie, a.marque, a.code, a.id as appareil_id
    from public.poses p
    join public.rendez_vous r on r.id = p.rdv_id
    join public.appareils a on a.id = p.appareil_id
    where extract(year from p.debut) = p_annee
  ),
  actives as (select * from base where statut_pose <> 'annule')
  select jsonb_build_object(
    'annee', p_annee,
    'total_examens', (select count(*) from actives),
    'total_patients', (select count(distinct rdv_id) from actives),
    'annulations', (select count(*) from base where statut_pose = 'annule'),
    'par_type', (
      select coalesce(jsonb_agg(t order by t ->> 'libelle'), '[]'::jsonb) from (
        select jsonb_build_object(
          'categorie', categorie, 'marque', marque,
          'libelle', categorie || coalesce(' ' || marque, ''),
          'examens', count(*), 'patients', count(distinct rdv_id),
          'journees_appareil', round(sum(duree_heures) / 24.0, 1)
        ) as t
        from actives group by categorie, marque
      ) s
    ),
    'par_cardiologue', (
      select coalesce(jsonb_agg(t order by (t ->> 'examens')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'cardiologue', cardiologue,
          'examens', count(*),
          'patients', count(distinct rdv_id),
          'holter_ecg', count(*) filter (where categorie = 'holter_ecg'),
          'mapa', count(*) filter (where categorie = 'mapa'),
          'polygraphie', count(*) filter (where categorie = 'polygraphie'),
          'spider', count(*) filter (where categorie = 'spider')
        ) as t
        from actives group by cardiologue
      ) s
    ),
    'par_appareil', (
      select coalesce(jsonb_agg(t order by (t ->> 'examens')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'code', code, 'categorie', categorie, 'marque', marque,
          'examens', count(*), 'journees', round(sum(duree_heures) / 24.0, 1)
        ) as t
        from actives group by appareil_id, code, categorie, marque
      ) s
    ),
    'par_mois', (
      select coalesce(jsonb_agg(t order by (t ->> 'mois')::int), '[]'::jsonb) from (
        select jsonb_build_object('mois', m, 'examens', n) as t
        from (
          select extract(month from p.debut)::int as m, count(*) as n
          from public.poses p
          where extract(year from p.debut) = p_annee and p.statut <> 'annule'
          group by 1
        ) x
      ) s
    )
  );
$$;

-- =============================================================================
--  Droits d'exécution
-- =============================================================================
grant execute on function
  public.reserver_rendez_vous(jsonb, jsonb),
  public.deplacer_rendez_vous(uuid, timestamp, jsonb),
  public.annuler_rendez_vous(uuid, text),
  public.enregistrer_retour(uuid, timestamp),
  public.enregistrer_pose(uuid),
  public.changer_appareil(uuid, uuid),
  public.appareil_poses_futures(uuid),
  public.retirer_appareil(uuid, boolean),
  public.statistiques(integer),
  public.est_actif(),
  public.est_admin(),
  public.nom_utilisateur(),
  public.jour_ouvert(integer),
  public.maintenant_cabinet()
to authenticated;
