-- Sensations Bois: trace consumption before a product's first physical count.
-- Additive migration for the already installed schema. No existing quantity is changed.
begin;

create table public.sb_preinventory_outflows (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  product_id uuid not null references public.sb_products(id),
  chantier_id uuid not null references public.sb_chantiers(id),
  type_sortie text not null check (type_sortie in ('prise_cartouche','boite_vide','sortie_manuelle')),
  quantite integer not null check (quantite > 0),
  motif text not null check (length(btrim(motif)) > 0),
  utilisateur_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index sb_preinventory_outflows_product_time
  on public.sb_preinventory_outflows(product_id, created_at desc);
create index sb_preinventory_outflows_chantier_time
  on public.sb_preinventory_outflows(chantier_id, created_at desc);

alter table public.sb_preinventory_outflows enable row level security;
create policy sb_preinventory_outflows_read on public.sb_preinventory_outflows
  for select to authenticated
  using (sb_private.is_member(array['admin']) and exists (
    select 1 from public.sb_chantiers c
    where c.id = chantier_id and c.owner_id = (select auth.uid())
  ));
revoke all on public.sb_preinventory_outflows from public, anon, authenticated;
grant select on public.sb_preinventory_outflows to authenticated;

-- A separate audit record, not a stock movement: no variation or stock balance is stored.
-- The product lock serializes this call with the existing initial-inventory RPC.
create function public.sb_record_preinventory_outflow(
  p_operation_id uuid, p_product_id uuid, p_chantier_id uuid,
  p_type text, p_quantity integer, p_motif text
) returns public.sb_preinventory_outflows
language plpgsql security definer set search_path = ''
as $$
declare
  v_product public.sb_products%rowtype;
  v_existing public.sb_preinventory_outflows%rowtype;
  v_result public.sb_preinventory_outflows%rowtype;
begin
  if (select auth.uid()) is null or not sb_private.is_member(array['admin']) then
    raise exception 'Accès aux sorties refusé';
  end if;
  if p_operation_id is null or p_product_id is null or p_chantier_id is null
     or p_quantity is null or p_quantity <= 0 or p_type is null
     or p_type not in ('prise_cartouche','boite_vide','sortie_manuelle')
     or p_motif is null or length(btrim(p_motif)) = 0 then
    raise exception 'Paramètres de sortie invalides';
  end if;

  select * into v_product from public.sb_products where id = p_product_id for update;
  if not found then raise exception 'Produit inconnu'; end if;
  select * into v_existing from public.sb_preinventory_outflows where operation_id = p_operation_id;
  if found then
    if v_existing.utilisateur_id = (select auth.uid())
       and v_existing.product_id = p_product_id
       and v_existing.chantier_id = p_chantier_id
       and v_existing.type_sortie = p_type
       and v_existing.quantite = p_quantity
       and v_existing.motif = p_motif
    then return v_existing; end if;
    raise exception 'Identifiant opération déjà utilisé';
  end if;

  if v_product.quantite_stock is not null or v_product.inventoried_at is not null then
    raise exception 'Produit déjà inventorié : enregistrer un mouvement de stock normal';
  end if;
  if (p_type = 'prise_cartouche' and v_product.debit_rule <> 'prise_confirmee')
     or (p_type = 'boite_vide' and v_product.debit_rule <> 'boite_vide')
     or (p_type = 'sortie_manuelle' and v_product.debit_rule <> 'manuel') then
    raise exception 'Règle de débit incompatible';
  end if;
  if not exists (
    select 1 from public.sb_chantiers c
    where c.id = p_chantier_id and c.owner_id = (select auth.uid())
  ) then
    raise exception 'Chantier inaccessible';
  end if;

  insert into public.sb_preinventory_outflows
    (operation_id, product_id, chantier_id, type_sortie, quantite, motif, utilisateur_id)
  values
    (p_operation_id, p_product_id, p_chantier_id, p_type, p_quantity, p_motif, (select auth.uid()))
  returning * into v_result;
  return v_result;
end $$;
revoke all on function public.sb_record_preinventory_outflow(uuid,uuid,uuid,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.sb_record_preinventory_outflow(uuid,uuid,uuid,text,integer,text)
  to authenticated;

commit;
