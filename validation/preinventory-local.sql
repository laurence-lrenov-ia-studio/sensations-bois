-- Disposable local Supabase Postgres only. Run after both stock migrations.
-- All fixtures and their movements are rolled back.
\set ON_ERROR_STOP on
begin;

create function public.sb_pretest_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION: %', label; end if;
end $$;
create function public.sb_pretest_expect_error(statement text, fragment text)
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
insert into public.sb_categories(id, name)
values ('44444444-4444-4444-8444-444444444444', 'Colles');
insert into public.sb_products(id, id_interne, designation, category_id, seuil_critique, statut_validation, debit_rule)
values
  ('66666666-6666-4666-8666-666666666661', 'PROD-0001', 'Cartouche test',
   '44444444-4444-4444-8444-444444444444', 3, 'Validé', 'prise_confirmee'),
  ('66666666-6666-4666-8666-666666666662', 'PROD-0002', 'Produit déjà inventorié',
   '44444444-4444-4444-8444-444444444444', 1, 'Validé', 'manuel');
insert into public.sb_chantiers(id, owner_id, reference, intitule) values
  ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', 'C-1', 'Chantier Rémy'),
  ('77777777-7777-4777-8777-777777777772', '33333333-3333-4333-8333-333333333333', 'C-2', 'Autre chantier');

set local role anon;
select public.sb_pretest_expect_error('select count(*) from public.sb_preinventory_outflows', 'permission denied');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',2,'Prise')$q$, 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 0, 'non-membre : aucune trace visible');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',2,'Prise')$q$, 'Accès aux sorties refusé');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public.sb_record_stock_movement('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '66666666-6666-4666-8666-666666666662', 'inventaire_initial', 4,
  'Mouvement préexistant au scénario', null, null);
select public.sb_pretest_expect_error($q$insert into public.sb_preinventory_outflows(operation_id, product_id, chantier_id, type_sortie, quantite, motif, utilisateur_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',2,'Direct','11111111-1111-4111-8111-111111111111')$q$, 'permission denied');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777772','prise_cartouche',2,'Prise')$q$, 'Chantier inaccessible');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','boite_vide',2,'Prise')$q$, 'Règle de débit incompatible');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',0,'Prise')$q$, 'Paramètres de sortie invalides');

select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '66666666-6666-4666-8666-666666666661', '77777777-7777-4777-8777-777777777771',
  'prise_cartouche', 2, 'Prise réelle');
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 1, 'une trace avant inventaire');
select public.sb_pretest_assert((select quantite_stock is null and inventoried_at is null from public.sb_products where id = '66666666-6666-4666-8666-666666666661'), 'stock toujours inconnu');
select public.sb_pretest_assert((select count(*) from public.sb_stock_movements) = 1, 'aucun mouvement chiffré ajouté par la sortie avant inventaire');
select public.sb_pretest_assert((select variation = 4 and quantite_avant is null and quantite_apres = 4
  from public.sb_stock_movements where operation_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'), 'mouvement existant inchangé');
select public.sb_pretest_assert((select quantite_stock = 4 from public.sb_products
  where id = '66666666-6666-4666-8666-666666666662'), 'stock existant inchangé');
select public.sb_pretest_assert((select utilisateur_id = auth.uid() and created_at is not null and quantite = 2 from public.sb_preinventory_outflows), 'acteur, heure et quantité conservés');
select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '66666666-6666-4666-8666-666666666661', '77777777-7777-4777-8777-777777777771',
  'prise_cartouche', 2, 'Prise réelle');
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 1, 'relance idempotente');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',3,'Prise réelle')$q$, 'Identifiant opération déjà utilisé');
reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
set local role authenticated;
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 0, 'autre admin : aucune trace du chantier Rémy');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',1,'Prise')$q$, 'Chantier inaccessible');
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  '66666666-6666-4666-8666-666666666661', 'inventaire_initial', 7,
  'Sept physiquement constatées', null, null);
select public.sb_pretest_assert((select quantite_stock = 7 from public.sb_products where id = '66666666-6666-4666-8666-666666666661'), 'inventaire = 7, sans double déduction');
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 1, 'trace antérieure conservée');
select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '66666666-6666-4666-8666-666666666661', '77777777-7777-4777-8777-777777777771',
  'prise_cartouche', 2, 'Prise réelle');
select public.sb_pretest_assert((select count(*) from public.sb_preinventory_outflows) = 1, 'relance historique après inventaire');
select public.sb_pretest_expect_error($q$select public.sb_record_preinventory_outflow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','66666666-6666-4666-8666-666666666661','77777777-7777-4777-8777-777777777771','prise_cartouche',1,'Nouvelle prise')$q$, 'Produit déjà inventorié');
select public.sb_record_stock_movement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  '66666666-6666-4666-8666-666666666661', 'prise_cartouche', 1,
  'Prise postérieure', '77777777-7777-4777-8777-777777777771', null);
select public.sb_pretest_assert((select quantite_stock = 6 from public.sb_products where id = '66666666-6666-4666-8666-666666666661'), 'mouvement normal après inventaire');
select public.sb_pretest_assert((select count(*) from public.sb_stock_movements) = 3, 'mouvement existant, inventaire et sortie postérieure uniquement');
select public.sb_pretest_assert((select variation = 4 and quantite_avant is null and quantite_apres = 4
  from public.sb_stock_movements where operation_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'), 'mouvement existant toujours inchangé');
reset role;

rollback;
