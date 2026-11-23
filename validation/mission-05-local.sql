-- Run only against a disposable local Supabase PostgreSQL instance after the migration.
-- All fake users and data are rolled back.
\set ON_ERROR_STOP on
begin;

create function public.sb_test_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION: %', label; end if;
end $$;
create function public.sb_test_expect_error(statement text, fragment text)
returns void language plpgsql as $$
declare actual text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual = message_text;
    if position(fragment in actual) = 0 then
      raise exception 'Expected "%", got "%"', fragment, actual;
    end if;
    return;
  end;
  raise exception 'Expected rejection "%"', fragment;
end $$;

insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
insert into sb_private.members(user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'admin'),
  ('33333333-3333-4333-8333-333333333333', 'admin');
insert into public.sb_categories(id, name) values
  ('44444444-4444-4444-8444-444444444444', 'Colles'),
  ('55555555-5555-4555-8555-555555555555', 'Visserie');
insert into public.sb_products(id, id_interne, designation, category_id, seuil_critique, statut_validation, debit_rule)
values
  ('66666666-6666-4666-8666-666666666661', 'PROD-0001', 'Cartouche test', '44444444-4444-4444-8444-444444444444', 3, 'Validé', 'prise_confirmee'),
  ('66666666-6666-4666-8666-666666666662', 'PROD-0002', 'Boîte test', '55555555-5555-4555-8555-555555555555', 1, 'Validé', 'boite_vide');
insert into public.sb_chantiers(id, owner_id, reference, intitule) values
  ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', 'C-1', 'Chantier Rémy'),
  ('77777777-7777-4777-8777-777777777772', '33333333-3333-4333-8333-333333333333', 'C-2', 'Chantier autre admin');
insert into public.sb_interventions(id, chantier_id, intitule, debut) values
  ('88888888-8888-4888-8888-888888888881', '77777777-7777-4777-8777-777777777771', 'Pose', now()),
  ('88888888-8888-4888-8888-888888888882', '77777777-7777-4777-8777-777777777772', 'Autre pose', now());

set local role anon;
select public.sb_test_expect_error('select count(*) from public.sb_chantiers', 'permission denied');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','prise_cartouche',1,'Interdit','77777777-7777-4777-8777-777777777771')$q$, 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public.sb_test_assert((select count(*) from public.sb_chantiers) = 0, 'non membre : aucune lecture chantier');
select public.sb_test_expect_error($q$insert into public.sb_chantiers(reference, intitule) values ('C-3', 'Interdit')$q$, 'row-level security');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','prise_cartouche',1,'Interdit','77777777-7777-4777-8777-777777777771')$q$, 'Accès stock refusé');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public.sb_test_assert((select count(*) from public.sb_chantiers) = 1, 'Rémy ne lit que son chantier');
insert into public.sb_chantiers(reference, intitule) values ('C-3', 'Nouveau chantier Rémy');
select public.sb_test_assert((select owner_id from public.sb_chantiers where reference = 'C-3') = auth.uid(), 'propriétaire Auth par défaut');
update public.sb_chantiers set intitule = 'Pose modifiée' where reference = 'C-1';
select public.sb_test_assert((select intitule from public.sb_chantiers where reference = 'C-1') = 'Pose modifiée', 'mise à jour chantier autorisée');
select public.sb_test_assert((select count(*) from public.sb_chantiers where reference = 'C-2') = 0, 'chantier autre propriétaire invisible');
select public.sb_test_expect_error($q$update public.sb_chantiers set owner_id = '33333333-3333-4333-8333-333333333333' where reference = 'C-1'$q$, 'permission denied');
insert into public.sb_interventions(chantier_id, intitule, debut)
values ('77777777-7777-4777-8777-777777777771', 'Nouvelle intervention', now());
update public.sb_interventions set notes = 'Note Rémy'
where id = '88888888-8888-4888-8888-888888888881';
select public.sb_test_assert((select notes from public.sb_interventions where id = '88888888-8888-4888-8888-888888888881') = 'Note Rémy', 'mise à jour intervention autorisée');
select public.sb_test_expect_error($q$insert into public.sb_interventions(chantier_id,intitule,debut) values ('77777777-7777-4777-8777-777777777772','Interdit',now())$q$, 'row-level security');
select public.sb_test_expect_error($q$update public.sb_interventions set chantier_id='77777777-7777-4777-8777-777777777772' where id='88888888-8888-4888-8888-888888888881'$q$, 'row-level security');
insert into public.sb_postit_items(chantier_id, intervention_id, product_id, quantite_prevue)
values ('77777777-7777-4777-8777-777777777771', '88888888-8888-4888-8888-888888888881', '66666666-6666-4666-8666-666666666661', 2);
update public.sb_postit_items set est_prepare = true
where chantier_id = '77777777-7777-4777-8777-777777777771';
select public.sb_test_assert((select count(*) from public.sb_stock_movements) = 0, 'post-it sans débit');
select public.sb_test_assert((select quantite_stock from public.sb_products where id = '66666666-6666-4666-8666-666666666661') is null, 'non inventorié reste inconnu');
select public.sb_test_expect_error($q$insert into public.sb_postit_items(chantier_id,product_id) values ('77777777-7777-4777-8777-777777777772','66666666-6666-4666-8666-666666666661')$q$, 'row-level security');
select public.sb_test_expect_error($q$insert into public.sb_postit_items(chantier_id,intervention_id,product_id) values ('77777777-7777-4777-8777-777777777771','88888888-8888-4888-8888-888888888882','66666666-6666-4666-8666-666666666661')$q$, 'foreign key');
select public.sb_test_expect_error($q$update public.sb_products set quantite_stock=99 where id='66666666-6666-4666-8666-666666666661'$q$, 'permission denied');

select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','prise_cartouche',1,'Prise confirmée','77777777-7777-4777-8777-777777777771')$q$, 'Non inventorié');
select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','66666666-6666-4666-8666-666666666661','inventaire_initial',5,'Comptage confirmé');
select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','66666666-6666-4666-8666-666666666662','inventaire_initial',4,'Comptage confirmé');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','66666666-6666-4666-8666-666666666661','boite_vide',1,'Mauvaise règle','77777777-7777-4777-8777-777777777771')$q$, 'Règle de débit incompatible');
select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','66666666-6666-4666-8666-666666666661','prise_cartouche',3,'Prise confirmée','77777777-7777-4777-8777-777777777771');
select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','66666666-6666-4666-8666-666666666662','boite_vide',1,'Boîte vide','77777777-7777-4777-8777-777777777771');
select public.sb_test_assert((select quantite_stock from public.sb_products where id = '66666666-6666-4666-8666-666666666661') = 2, 'débit cartouche à la confirmation');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','66666666-6666-4666-8666-666666666661','retour',1,'Sans sortie','77777777-7777-4777-8777-777777777771')$q$, 'sortie source requis');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8','66666666-6666-4666-8666-666666666661','retour',1,'Mauvais produit','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'))$q$, 'Sortie chantier incompatible');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9','66666666-6666-4666-8666-666666666661','retour',1,'Mauvais chantier','77777777-7777-4777-8777-777777777772',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'))$q$, 'Sortie chantier incompatible');
select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','66666666-6666-4666-8666-666666666661','retour',2,'Retour partiel','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'));
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','66666666-6666-4666-8666-666666666661','retour',1,'Retour modifié','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'))$q$, 'Identifiant opération déjà utilisé');
select public.sb_test_expect_error($q$select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','66666666-6666-4666-8666-666666666661','retour',2,'Retour excessif','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'))$q$, 'supérieure au reliquat');
select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3','66666666-6666-4666-8666-666666666661','retour',1,'Retour restant','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'));
select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','66666666-6666-4666-8666-666666666661','retour',2,'Retour partiel','77777777-7777-4777-8777-777777777771',(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'));
select public.sb_test_assert((select count(*) from public.sb_stock_movements where sortie_movement_id=(select id from public.sb_stock_movements where operation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')) = 2, 'relance idempotente sans doublon');
select public.sb_test_assert((select quantite_stock from public.sb_products where id='66666666-6666-4666-8666-666666666661') = 5, 'stock restauré sans dépassement');
select public.sb_test_assert((select count(*) from public.sb_stock_movements where type_mouvement='inventaire_initial') = 2, 'inventaires saisis uniquement par test');
reset role;

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
set local role authenticated;
select public.sb_test_assert((select count(*) from public.sb_chantiers where reference='C-1') = 0, 'autre admin isolé');
select public.sb_test_expect_error($q$insert into public.sb_postit_items(chantier_id,product_id) values ('77777777-7777-4777-8777-777777777771','66666666-6666-4666-8666-666666666661')$q$, 'row-level security');
reset role;

rollback;
