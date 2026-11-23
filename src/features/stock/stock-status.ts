export type StockStatus = 'Non inventorié' | 'Rupture' | 'À recommander' | 'OK'

export function stockStatus(quantity: number | null, reserved: number, threshold: number): StockStatus {
  if (quantity === null) return 'Non inventorié'
  const available = quantity - reserved
  if (available <= 0) return 'Rupture'
  if (available <= threshold) return 'À recommander'
  return 'OK'
}
