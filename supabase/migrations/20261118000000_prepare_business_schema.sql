-- Sensations Bois only. Audit the target project before applying this migration.
-- No existing object is dropped or replaced and no inventory is seeded.
begin;

create schema if not exists sb_private;

create table public.sb_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.sb_products (
  id uuid primary key default gen_random_uuid(),
  id_interne text not null unique check (id_interne ~ '^PROD-[0-9]{4}$'),
  designation text not null check (length(btrim(designation)) > 0),
  category_id uuid not null references public.sb_categories(id),
  nom_photo text, marque text, reference_fournisseur text, code_barres text,
  fournisseur text, unite text, conditionnement text, emplacement text,
  seuil_critique integer not null check (seuil_critique >= 0),
  observations text,
  statut_validation text not null check (statut_validation in ('Validé','À compléter','À identifier')),
  debit_rule text not null check (debit_rule in ('prise_confirmee','boite_vide','manuel')),
  quantite_stock integer check (quantite_stock >= 0),
  inventoried_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sb_stock_inventory_pair check ((quantite_stock is null) = (inventoried_at is null))
);
create unique index sb_products_id_interne_folded on public.sb_products (upper(btrim(id_interne)));

create table public.sb_chantiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  reference text not null unique,
  intitule text not null,
  client_nom text,
  adresse text,
  statut text not null default 'prévu' check (statut in ('prévu','en cours','terminé','annulé')),
  date_debut date, date_fin date,
  created_at timestamptz not null default now()
);
create index sb_chantiers_owner_id_idx on public.sb_chantiers(owner_id);

create table public.sb_interventions (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.sb_chantiers(id),
  intitule text not null,
  debut timestamptz not null,
  fin timestamptz,
  statut text not null default 'prévue' check (statut in ('prévue','en cours','terminée','annulée')),
  notes text,
  created_at timestamptz not null default now(),
  unique (id, chantier_id),
  check (fin is null or fin >= debut)
);
create index sb_interventions_chantier_id_idx on public.sb_interventions(chantier_id);

create table public.sb_materiel (
  id uuid primary key default gen_random_uuid(),
  designation text not null,
  reference text unique,
  statut text not null default 'disponible' check (statut in ('disponible','sur chantier','maintenance','hors service')),
  notes text,
  created_at timestamptz not null default now()
);

-- A post-it is a plan. Inserting or checking it never changes stock.
create table public.sb_postit_items (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.sb_chantiers(id),
  intervention_id uuid,
  product_id uuid references public.sb_products(id),
  materiel_id uuid references public.sb_materiel(id),
  quantite_prevue integer check (quantite_prevue is null or quantite_prevue > 0),
  est_prepare boolean not null default false,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (intervention_id, chantier_id)
    references public.sb_interventions(id, chantier_id),
  check ((product_id is null) <> (materiel_id is null))
);
create index sb_postit_chantier_id_idx on public.sb_postit_items(chantier_id);
create index sb_postit_intervention_chantier_idx on public.sb_postit_items(intervention_id, chantier_id);
create index sb_postit_product_id_idx on public.sb_postit_items(product_id);
create index sb_postit_materiel_id_idx on public.sb_postit_items(materiel_id);

create table public.sb_stock_movements (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  product_id uuid not null references public.sb_products(id),
  chantier_id uuid references public.sb_chantiers(id),
  sortie_movement_id uuid references public.sb_stock_movements(id),
  type_mouvement text not null check (type_mouvement in ('inventaire_initial','entree','prise_cartouche','boite_vide','sortie_manuelle','retour','correction')),
  quantite_avant integer,
  variation integer not null,
  quantite_apres integer not null check (quantite_apres >= 0),
  motif text not null check (length(btrim(motif)) > 0),
  utilisateur_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((type_mouvement = 'inventaire_initial' and quantite_avant is null and variation = quantite_apres) or
         (type_mouvement <> 'inventaire_initial' and quantite_avant is not null and quantite_apres = quantite_avant + variation)),
  check ((type_mouvement = 'retour') = (sortie_movement_id is not null)),
  check (id is distinct from sortie_movement_id),
  check ((type_mouvement in ('prise_cartouche','boite_vide','sortie_manuelle') and variation < 0) or
         (type_mouvement in ('entree','retour') and variation > 0) or
         type_mouvement in ('inventaire_initial','correction'))
);
create index sb_stock_movements_product_time on public.sb_stock_movements(product_id, created_at desc);
create index sb_stock_movements_sortie_idx on public.sb_stock_movements(sortie_movement_id)
  where sortie_movement_id is not null;

-- Membership is provisioned by a trusted administrator after Auth users exist.
create table sb_private.members (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('admin','stock','lecture')),
  active boolean not null default true
);
revoke all on schema sb_private from public, anon, authenticated;
grant usage on schema sb_private to authenticated;
revoke all on all tables in schema sb_private from public, anon, authenticated;

create function sb_private.is_member(required_roles text[])
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists (
  select 1 from sb_private.members m
  where m.user_id = (select auth.uid()) and m.active and m.role = any(required_roles)
) $$;
revoke all on function sb_private.is_member(text[]) from public, anon, authenticated;
grant execute on function sb_private.is_member(text[]) to authenticated;

alter table public.sb_categories enable row level security;
alter table public.sb_products enable row level security;
alter table public.sb_chantiers enable row level security;
alter table public.sb_interventions enable row level security;
alter table public.sb_materiel enable row level security;
alter table public.sb_postit_items enable row level security;
alter table public.sb_stock_movements enable row level security;
alter table sb_private.members enable row level security;

create policy sb_categories_read on public.sb_categories for select to authenticated
using (sb_private.is_member(array['admin','stock','lecture']));
create policy sb_products_read on public.sb_products for select to authenticated
using (sb_private.is_member(array['admin','stock','lecture']));
create policy sb_chantiers_read on public.sb_chantiers for select to authenticated
using (sb_private.is_member(array['admin']) and owner_id = (select auth.uid()));
create policy sb_interventions_read on public.sb_interventions for select to authenticated
using (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));
create policy sb_materiel_read on public.sb_materiel for select to authenticated
using (sb_private.is_member(array['admin','stock','lecture']));
create policy sb_postit_read on public.sb_postit_items for select to authenticated
using (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));
create policy sb_movements_read on public.sb_stock_movements for select to authenticated
using (sb_private.is_member(array['admin','stock','lecture']));

-- Rémy may edit only his own chantier and its dependent records.
create policy sb_chantiers_insert on public.sb_chantiers for insert to authenticated
with check (sb_private.is_member(array['admin']) and owner_id = (select auth.uid()));
create policy sb_chantiers_update on public.sb_chantiers for update to authenticated
using (sb_private.is_member(array['admin']) and owner_id = (select auth.uid()))
with check (sb_private.is_member(array['admin']) and owner_id = (select auth.uid()));

create policy sb_interventions_insert on public.sb_interventions for insert to authenticated
with check (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));
create policy sb_interventions_update on public.sb_interventions for update to authenticated
using (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
))
with check (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));

create policy sb_postit_insert on public.sb_postit_items for insert to authenticated
with check (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));
create policy sb_postit_update on public.sb_postit_items for update to authenticated
using (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
))
with check (sb_private.is_member(array['admin']) and exists (
  select 1 from public.sb_chantiers c
  where c.id = chantier_id and c.owner_id = (select auth.uid())
));

-- Deny anonymous access and all direct writes to catalogue and stock.
revoke all on public.sb_categories, public.sb_products, public.sb_chantiers,
 public.sb_interventions, public.sb_materiel, public.sb_postit_items,
 public.sb_stock_movements from public, anon, authenticated;
grant select on public.sb_categories, public.sb_products, public.sb_chantiers,
 public.sb_interventions, public.sb_materiel, public.sb_postit_items,
 public.sb_stock_movements to authenticated;
grant insert (reference, intitule, client_nom, adresse, statut, date_debut, date_fin)
  on public.sb_chantiers to authenticated;
grant update (reference, intitule, client_nom, adresse, statut, date_debut, date_fin)
  on public.sb_chantiers to authenticated;
grant insert (chantier_id, intitule, debut, fin, statut, notes)
  on public.sb_interventions to authenticated;
grant update (chantier_id, intitule, debut, fin, statut, notes)
  on public.sb_interventions to authenticated;
grant insert (chantier_id, intervention_id, product_id, materiel_id, quantite_prevue, est_prepare, actif)
  on public.sb_postit_items to authenticated;
grant update (chantier_id, intervention_id, product_id, materiel_id, quantite_prevue, est_prepare, actif)
  on public.sb_postit_items to authenticated;

-- Atomic, idempotent operation. The caller must be an allowlisted Auth user.
create function public.sb_record_stock_movement(
  p_operation_id uuid, p_product_id uuid, p_type text, p_quantity integer,
  p_motif text, p_chantier_id uuid default null,
  p_sortie_movement_id uuid default null
) returns public.sb_stock_movements
language plpgsql security definer set search_path = ''
as $$
declare
  v_product public.sb_products%rowtype;
  v_existing public.sb_stock_movements%rowtype;
  v_sortie public.sb_stock_movements%rowtype;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_deja_retourne bigint;
  v_result public.sb_stock_movements%rowtype;
begin
  if (select auth.uid()) is null or not sb_private.is_member(array['admin','stock']) then
    raise exception 'Accès stock refusé';
  end if;
  if p_operation_id is null or p_product_id is null or p_quantity is null or p_quantity < 0
     or p_motif is null or length(btrim(p_motif)) = 0 then
    raise exception 'Paramètres de mouvement invalides';
  end if;
  if (p_type = 'retour') is not true and p_sortie_movement_id is not null then
    raise exception 'Une sortie liée est réservée aux retours';
  end if;
  select * into v_product from public.sb_products where id = p_product_id for update;
  if not found then raise exception 'Produit inconnu'; end if;
  select * into v_existing from public.sb_stock_movements where operation_id = p_operation_id;
  if found then
    if v_existing.utilisateur_id = (select auth.uid())
       and v_existing.product_id = p_product_id and v_existing.type_mouvement = p_type
       and v_existing.motif = p_motif and v_existing.chantier_id is not distinct from p_chantier_id
       and v_existing.sortie_movement_id is not distinct from p_sortie_movement_id
       and (case when p_type = 'inventaire_initial' then v_existing.quantite_apres else abs(v_existing.variation) end) = p_quantity
    then return v_existing; end if;
    raise exception 'Identifiant opération déjà utilisé';
  end if;
  v_before := v_product.quantite_stock;
  if p_type = 'inventaire_initial' then
    if not sb_private.is_member(array['admin']) then raise exception 'Inventaire initial réservé à Rémy ou un administrateur habilité'; end if;
    if v_before is not null or p_chantier_id is not null then raise exception 'Inventaire initial déjà réalisé ou chantier renseigné'; end if;
    v_delta := p_quantity;
    v_after := p_quantity;
  else
    if v_before is null then raise exception 'Non inventorié : saisir et confirmer la quantité constatée'; end if;
    if p_quantity = 0 then raise exception 'Quantité nulle'; end if;
    if p_type = 'prise_cartouche' and v_product.debit_rule <> 'prise_confirmee' then raise exception 'Règle de débit incompatible'; end if;
    if p_type = 'boite_vide' and v_product.debit_rule <> 'boite_vide' then raise exception 'Règle de débit incompatible'; end if;
    if p_type = 'sortie_manuelle' and v_product.debit_rule <> 'manuel' then raise exception 'Règle de débit incompatible'; end if;
    if p_type in ('prise_cartouche','boite_vide','sortie_manuelle') then
      if p_chantier_id is null then raise exception 'Chantier requis pour une sortie'; end if;
      v_delta := -p_quantity;
    elsif p_type = 'entree' then v_delta := p_quantity;
    elsif p_type = 'retour' then
      if p_chantier_id is null or p_sortie_movement_id is null then
        raise exception 'Retour : chantier et sortie source requis';
      end if;
      -- The product row is already locked. This lock also serializes direct
      -- attempts to return against the same outgoing movement.
      select * into v_sortie from public.sb_stock_movements
        where id = p_sortie_movement_id for update;
      if not found or v_sortie.type_mouvement not in
         ('prise_cartouche','boite_vide','sortie_manuelle')
         or v_sortie.product_id <> p_product_id
         or v_sortie.chantier_id is distinct from p_chantier_id then
        raise exception 'Sortie chantier incompatible avec ce retour';
      end if;
      select coalesce(sum(variation), 0) into v_deja_retourne
        from public.sb_stock_movements
        where sortie_movement_id = p_sortie_movement_id and type_mouvement = 'retour';
      if v_deja_retourne + p_quantity > -v_sortie.variation then
        raise exception 'Quantité retournée supérieure au reliquat de la sortie';
      end if;
      v_delta := p_quantity;
    elsif p_type = 'correction' then raise exception 'Correction réservée à un flux administratif distinct';
    else raise exception 'Type de mouvement invalide'; end if;
    v_after := v_before + v_delta;
    if v_after < 0 then raise exception 'Stock insuffisant'; end if;
  end if;
  update public.sb_products set quantite_stock = v_after,
    inventoried_at = case when p_type = 'inventaire_initial' then now() else inventoried_at end,
    updated_at = now() where id = p_product_id;
  insert into public.sb_stock_movements
    (operation_id, product_id, chantier_id, sortie_movement_id, type_mouvement, quantite_avant,
     variation, quantite_apres, motif, utilisateur_id)
  values (p_operation_id, p_product_id, p_chantier_id, p_sortie_movement_id, p_type, v_before,
     v_delta, v_after, p_motif, (select auth.uid())) returning * into v_result;
  return v_result;
end $$;
revoke all on function public.sb_record_stock_movement(uuid,uuid,text,integer,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.sb_record_stock_movement(uuid,uuid,text,integer,text,uuid,uuid) to authenticated;

commit;
