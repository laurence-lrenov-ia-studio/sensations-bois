// Keep the current deployed app compatible until the additive SQL migration is applied.
export const preinventoryOutflowsEnabled = import.meta.env.VITE_PREINVENTORY_OUTFLOWS_ENABLED === 'true'

export function outgoingType(rule: 'prise_confirmee' | 'boite_vide' | 'manuel') {
  return rule === 'prise_confirmee' ? 'prise_cartouche' : rule === 'boite_vide' ? 'boite_vide' : 'sortie_manuelle'
}
