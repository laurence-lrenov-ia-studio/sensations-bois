import type { SupabaseClient } from '@supabase/supabase-js'
import { preinventoryOutflowsEnabled } from '../../features/stock/preinventory'

export type Product = {
  id: string
  id_interne: string
  designation: string
  category_id: string
  category: string
  quantite_stock: number | null
  inventoried_at: string | null
  seuil_critique: number
  debit_rule: 'prise_confirmee' | 'boite_vide' | 'manuel'
  unite: string | null
  statut_validation: string
  code_barres: string | null
}

export type Chantier = {
  id: string
  reference: string
  intitule: string
  client_nom: string | null
  adresse: string | null
  statut: 'prévu' | 'en cours' | 'terminé' | 'annulé'
  date_debut: string | null
  date_fin: string | null
}

export type Intervention = {
  id: string
  chantier_id: string
  intitule: string
  debut: string
  fin: string | null
  statut: 'prévue' | 'en cours' | 'terminée' | 'annulée'
  notes: string | null
}

export type PostitItem = {
  id: string
  chantier_id: string
  intervention_id: string | null
  product_id: string | null
  materiel_id: string | null
  quantite_prevue: number | null
  est_prepare: boolean
  actif: boolean
}

export type Material = {
  id: string
  designation: string
  statut: string
}

export type StockMovement = {
  id: string
  product_id: string
  chantier_id: string | null
  sortie_movement_id: string | null
  type_mouvement: string
  variation: number
  quantite_avant: number | null
  quantite_apres: number
  motif: string
  created_at: string
}

export type PreinventoryOutflow = {
  id: string
  product_id: string
  chantier_id: string
  type_sortie: 'prise_cartouche' | 'boite_vide' | 'sortie_manuelle'
  quantite: number
  motif: string
  utilisateur_id: string
  created_at: string
}

export type WorkspaceData = {
  products: Product[]
  chantiers: Chantier[]
  interventions: Intervention[]
  postit: PostitItem[]
  material: Material[]
  movements: StockMovement[]
  preinventoryOutflows: PreinventoryOutflow[]
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('Réponse Supabase vide')
  return result.data
}

export async function loadWorkspace(client: SupabaseClient): Promise<WorkspaceData> {
  const [categoriesResult, productsResult, chantiersResult, interventionsResult,
    postitResult, materialResult, movementsResult, preinventoryResult] = await Promise.all([
    client.from('sb_categories').select('id,name').order('name'),
    client.from('sb_products').select('id,id_interne,designation,category_id,quantite_stock,inventoried_at,seuil_critique,debit_rule,unite,statut_validation,code_barres').order('id_interne'),
    client.from('sb_chantiers').select('id,reference,intitule,client_nom,adresse,statut,date_debut,date_fin').order('created_at', { ascending: false }),
    client.from('sb_interventions').select('id,chantier_id,intitule,debut,fin,statut,notes').order('debut'),
    client.from('sb_postit_items').select('id,chantier_id,intervention_id,product_id,materiel_id,quantite_prevue,est_prepare,actif').eq('actif', true),
    client.from('sb_materiel').select('id,designation,statut').order('designation'),
    client.from('sb_stock_movements').select('id,product_id,chantier_id,sortie_movement_id,type_mouvement,variation,quantite_avant,quantite_apres,motif,created_at').order('created_at', { ascending: false }).limit(500),
    preinventoryOutflowsEnabled
      ? client.from('sb_preinventory_outflows').select('id,product_id,chantier_id,type_sortie,quantite,motif,utilisateur_id,created_at').order('created_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [] as PreinventoryOutflow[], error: null }),
  ])
  const categories = check<{ id: string; name: string }[]>(categoriesResult)
  const products = check<Omit<Product, 'category'>[]>(productsResult)
  const names = new Map(categories.map(category => [category.id, category.name]))
  return {
    products: products.map(product => ({ ...product, category: names.get(product.category_id) ?? 'Autres' })),
    chantiers: check<Chantier[]>(chantiersResult),
    interventions: check<Intervention[]>(interventionsResult),
    postit: check<PostitItem[]>(postitResult),
    material: check<Material[]>(materialResult),
    movements: check<StockMovement[]>(movementsResult),
    preinventoryOutflows: check<PreinventoryOutflow[]>(preinventoryResult),
  }
}
