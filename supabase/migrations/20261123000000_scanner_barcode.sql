-- Sensations Bois only. Apply after the Mission 05 schema, on dkfwiaulbapfbbrslavy.
-- No stock quantity or movement is changed by this migration or its functions.
begin;

-- Fail on existing duplicate nonblank codes; never silently reassign a code.
create unique index sb_products_code_barres_unique
  on public.sb_products (upper(btrim(code_barres)))
  where nullif(btrim(code_barres), '') is not null;

create function public.sb_assign_product_barcode(p_product_id uuid, p_code text)
returns public.sb_products
language plpgsql security definer set search_path = ''
as $$
declare
  v_product public.sb_products%rowtype;
  v_code text := btrim(p_code);
begin
  if (select auth.uid()) is null or not sb_private.is_member(array['admin']) then
    raise exception 'Accès catalogue refusé';
  end if;
  if p_product_id is null or v_code is null or v_code !~ '^[0-9A-Za-z._/-]{3,64}$' then
    raise exception 'Code-barres invalide';
  end if;
  select * into v_product from public.sb_products where id = p_product_id for update;
  if not found then raise exception 'Produit inconnu'; end if;
  if nullif(btrim(v_product.code_barres), '') is not null then
    if upper(btrim(v_product.code_barres)) = upper(v_code) then return v_product; end if;
    raise exception 'Ce produit possède déjà un autre code-barres';
  end if;
  update public.sb_products
    set code_barres = v_code, updated_at = now()
    where id = p_product_id returning * into v_product;
  return v_product;
end $$;

create function public.sb_create_scanned_product(
  p_code text, p_designation text, p_category_id uuid,
  p_seuil_critique integer, p_debit_rule text
)
returns public.sb_products
language plpgsql security definer set search_path = ''
as $$
declare
  v_product public.sb_products%rowtype;
  v_code text := btrim(p_code);
  v_next integer;
begin
  if (select auth.uid()) is null or not sb_private.is_member(array['admin']) then
    raise exception 'Accès catalogue refusé';
  end if;
  if v_code is null or v_code !~ '^[0-9A-Za-z._/-]{3,64}$'
     or p_designation is null or length(btrim(p_designation)) = 0
     or p_category_id is null or p_seuil_critique is null or p_seuil_critique < 0
     or p_debit_rule is null or p_debit_rule not in ('prise_confirmee','boite_vide','manuel') then
    raise exception 'Paramètres produit invalides';
  end if;
  if not exists (select 1 from public.sb_categories where id = p_category_id) then
    raise exception 'Catégorie inconnue';
  end if;
  -- Serialize reference allocation; the unique indexes also protect concurrent calls.
  perform pg_catalog.pg_advisory_xact_lock(481211, 6);
  select coalesce(max(substring(id_interne from 6)::integer), 0) + 1
    into v_next from public.sb_products;
  if v_next > 9999 then raise exception 'Références produit épuisées'; end if;
  insert into public.sb_products
    (id_interne, designation, category_id, code_barres, seuil_critique,
     statut_validation, debit_rule, quantite_stock, inventoried_at)
  values
    ('PROD-' || lpad(v_next::text, 4, '0'), btrim(p_designation), p_category_id,
     v_code, p_seuil_critique, 'À compléter', p_debit_rule, null, null)
  returning * into v_product;
  return v_product;
end $$;

revoke all on function public.sb_assign_product_barcode(uuid,text) from public, anon, authenticated;
revoke all on function public.sb_create_scanned_product(text,text,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.sb_assign_product_barcode(uuid,text) to authenticated;
grant execute on function public.sb_create_scanned_product(text,text,uuid,integer,text) to authenticated;

commit;
