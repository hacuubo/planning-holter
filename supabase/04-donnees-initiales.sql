-- =============================================================================
--  PLANNING HOLTER — Fichier 4/4 : matériel du cabinet et réglages de départ
-- =============================================================================
--  À coller dans Supabase > SQL Editor, après les fichiers 1, 2 et 3, puis « Run ».
--  Relançable sans risque : rien n'est écrasé, rien n'est dupliqué.
--
--  Inventaire confirmé par le secrétariat (43 appareils au total) :
--     • Holter ECG ELA : 51 à 59, plus 501 et 502 pour les urgences   (11)
--     • Holter ECG DMS : 1 à 13, plus 101 pour les urgences           (14)
--     • MAPA           : A à N sans le L, plus Y pour les urgences    (14)
--     • Spider Flash   : SF1                                           (1)
--     • Polygraphies   : N1, N2, N3                                    (3)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Matériel
-- -----------------------------------------------------------------------------
insert into public.appareils (code, categorie, marque, urgence, ordre)
select v.code, v.categorie, v.marque, v.urgence, v.ordre
from (values
  -- Holter ECG ELA (11)
  ('51',  'holter_ecg', 'ELA', false, 100),
  ('52',  'holter_ecg', 'ELA', false, 101),
  ('53',  'holter_ecg', 'ELA', false, 102),
  ('54',  'holter_ecg', 'ELA', false, 103),
  ('55',  'holter_ecg', 'ELA', false, 104),
  ('56',  'holter_ecg', 'ELA', false, 105),
  ('57',  'holter_ecg', 'ELA', false, 106),
  ('58',  'holter_ecg', 'ELA', false, 107),
  ('59',  'holter_ecg', 'ELA', false, 108),
  ('501', 'holter_ecg', 'ELA', true,  120),
  ('502', 'holter_ecg', 'ELA', true,  121),

  -- Holter ECG DMS (14)
  ('1',    'holter_ecg', 'DMS', false, 200),
  ('2',    'holter_ecg', 'DMS', false, 201),
  ('3',    'holter_ecg', 'DMS', false, 202),
  ('4',    'holter_ecg', 'DMS', false, 203),
  ('5',    'holter_ecg', 'DMS', false, 204),
  ('6',    'holter_ecg', 'DMS', false, 205),
  ('7',    'holter_ecg', 'DMS', false, 206),
  ('8',    'holter_ecg', 'DMS', false, 207),
  ('9',    'holter_ecg', 'DMS', false, 208),
  ('10',   'holter_ecg', 'DMS', false, 209),
  ('11',   'holter_ecg', 'DMS', false, 210),
  ('12',   'holter_ecg', 'DMS', false, 211),
  ('13',   'holter_ecg', 'DMS', false, 212),
  ('101',  'holter_ecg', 'DMS', true,  220),

  -- MAPA (A à N sans le L, + Y d'urgence)
  ('A', 'mapa', null, false, 300),
  ('B', 'mapa', null, false, 301),
  ('C', 'mapa', null, false, 302),
  ('D', 'mapa', null, false, 303),
  ('E', 'mapa', null, false, 304),
  ('F', 'mapa', null, false, 305),
  ('G', 'mapa', null, false, 306),
  ('H', 'mapa', null, false, 307),
  ('I', 'mapa', null, false, 308),
  ('J', 'mapa', null, false, 309),
  ('K', 'mapa', null, false, 310),
  ('M', 'mapa', null, false, 311),
  ('N', 'mapa', null, false, 312),
  ('Y', 'mapa', null, true,  320),

  -- Spider Flash
  ('SF1', 'spider', null, false, 400),

  -- Polygraphies ventilatoires
  ('N1', 'polygraphie', null, false, 500),
  ('N2', 'polygraphie', null, false, 501),
  ('N3', 'polygraphie', null, false, 502)
) as v(code, categorie, marque, urgence, ordre)
where not exists (
  select 1 from public.appareils a
  where a.categorie = v.categorie
    and coalesce(a.marque, '') = coalesce(v.marque, '')
    and a.code = v.code
);

-- -----------------------------------------------------------------------------
-- Réglages
-- -----------------------------------------------------------------------------
insert into public.parametres (cle, valeur) values
  ('planification', jsonb_build_object(
     'minutesAvantRdvCardio', 15,
     'posesParCreneau', 1,
     'toleranceDureeMinutes', 60,
     'delaiReconditionnementMinutes', 0,
     'fenetreRechercheJours', 5,
     'alsaceMoselle', false,
     'fermeturesExceptionnelles', '{}'::jsonb
   )),
  -- Plages de rendez-vous : matin et après-midi. `finPosePolygraphie`
  -- prolonge l'après-midi pour les seules poses de polygraphie (pose
  -- l'après-midi, dépose le lendemain matin, une seule nuit).
  ('horaires', jsonb_build_object(
     '0', null,
     '1', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:45', 'fin', '11:30'),
          jsonb_build_object('debut', '14:00', 'fin', '16:30')),
        'finPosePolygraphie', '17:15'),
     '2', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:45', 'fin', '11:30'),
          jsonb_build_object('debut', '14:00', 'fin', '16:30')),
        'finPosePolygraphie', '17:15'),
     '3', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:45', 'fin', '11:30'),
          jsonb_build_object('debut', '14:00', 'fin', '16:30')),
        'finPosePolygraphie', '17:15'),
     '4', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:45', 'fin', '11:30'),
          jsonb_build_object('debut', '14:00', 'fin', '16:30')),
        'finPosePolygraphie', '17:15'),
     '5', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:45', 'fin', '11:30'),
          jsonb_build_object('debut', '14:00', 'fin', '16:00')),
        'finPosePolygraphie', '16:45'),
     '6', jsonb_build_object(
        'plages', jsonb_build_array(
          jsonb_build_object('debut', '08:30', 'fin', '11:45')))
   )),
  ('cardiologues', '["MA","PL","RG","DC","AZ","LM","KS","GB","RB"]'::jsonb),
  ('sauvegarde', jsonb_build_object(
     'destinataires', '[]'::jsonb,
     'frequence', 'quotidien',
     'joursConservation', 7,
     'objetMail', 'Planning Holter — rendez-vous du lendemain'
   )),
  ('cabinet', jsonb_build_object(
     'nom', 'Cabinet de cardiologie',
     'version', '1.1.0'
   ))
on conflict (cle) do nothing;

-- -----------------------------------------------------------------------------
-- Espace de stockage des sauvegardes (privé)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sauvegardes', 'sauvegardes', false)
on conflict (id) do nothing;

-- Seules les personnes connectées et autorisées peuvent lire les sauvegardes
-- depuis le site. La tâche automatique quotidienne, elle, utilise la clé
-- « service_role » et n'est pas concernée par cette règle.
--
-- ℹ️ Si cette dernière instruction renvoie une erreur de droits (« must be owner
--    of table objects »), ce n'est pas bloquant : la sauvegarde automatique
--    fonctionnera quand même. Créez alors la règle depuis l'interface Supabase,
--    dans Storage ▸ Policies ▸ New policy.
drop policy if exists sauvegardes_lecture on storage.objects;
create policy sauvegardes_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'sauvegardes' and public.est_actif());
