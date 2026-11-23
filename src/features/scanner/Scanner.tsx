import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BrowserMultiFormatOneDReader, type IScannerControls } from '@zxing/browser'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Product } from '../../lib/supabase/data'
import { stockStatus } from '../stock/stock-status'

type Props = { client: SupabaseClient; products: Product[]; onChanged: () => Promise<void> }
type UnknownAction = 'associate' | 'create' | null
const normalize = (code: string) => code.trim().toLocaleUpperCase('en-US')
const writesEnabled = import.meta.env.VITE_SCANNER_WRITES_ENABLED === 'true'

export function Scanner({ client, products, onChanged }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const scanFinishedRef = useRef(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [code, setCode] = useState('')
  const [lookupCode, setLookupCode] = useState('')
  const [action, setAction] = useState<UnknownAction>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const found = products.find(product => product.code_barres && normalize(product.code_barres) === normalize(lookupCode))
  const categories = [...new Map(products.map(product => [product.category_id, product.category])).entries()]

  function stopCamera() {
    controlsRef.current?.stop()
    controlsRef.current = null
    setCameraOn(false)
  }
  useEffect(() => () => { controlsRef.current?.stop() }, [])

  function lookup(rawCode: string) {
    const value = rawCode.trim()
    stopCamera(); setError(''); setNotice(''); setAction(null)
    if (!/^[0-9A-Za-z._/-]{3,64}$/.test(value)) { setError('Saisissez un code-barres valide (3 à 64 caractères).'); setLookupCode(''); return }
    setCode(value); setLookupCode(value)
  }

  async function startCamera() {
    setError(''); setNotice('')
    if (!videoRef.current || !navigator.mediaDevices?.getUserMedia) { setError('Caméra indisponible. Utilisez la saisie manuelle.'); return }
    setBusy(true)
    try {
      scanFinishedRef.current = false
      const reader = new BrowserMultiFormatOneDReader()
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, activeControls) => {
        if (result && !scanFinishedRef.current) { scanFinishedRef.current = true; activeControls.stop(); lookup(result.getText()) }
      })
      if (scanFinishedRef.current) controls.stop()
      else { controlsRef.current = controls; setCameraOn(true) }
    } catch {
      setError('La caméra n’a pas pu démarrer. Autorisez-la ou saisissez le code manuellement.')
    } finally { setBusy(false) }
  }

  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await client.rpc('sb_assign_product_barcode', { p_product_id: String(form.get('product_id')), p_code: lookupCode })
      if (rpcError) throw rpcError
      await onChanged(); setAction(null); setNotice('Code associé à la fiche existante. Aucun stock modifié.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Association impossible. Vérifiez les droits et la migration Scanner.') }
    finally { setBusy(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const threshold = Number(form.get('threshold'))
      if (!Number.isSafeInteger(threshold) || threshold < 0) throw new Error('Seuil critique invalide.')
      const { error: rpcError } = await client.rpc('sb_create_scanned_product', {
        p_code: lookupCode,
        p_designation: String(form.get('designation')).trim(),
        p_category_id: String(form.get('category_id')),
        p_seuil_critique: threshold,
        p_debit_rule: String(form.get('debit_rule')),
      })
      if (rpcError) throw rpcError
      await onChanged(); setAction(null); setNotice('Fiche créée avec ce code. Stock non inventorié, aucun mouvement.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Création impossible. Vérifiez les droits et la migration Scanner.') }
    finally { setBusy(false) }
  }

  return <div className="grid grid-2 scanner-layout">
    <div className="panel scanner-panel"><h3>Scanner un code-barres</h3><p>Orientez la caméra vers le code du produit. La lecture ne modifie jamais le stock.</p><video ref={videoRef} className="scanner-video" muted playsInline autoPlay aria-label="Aperçu caméra"/><div className="actions"><button className="btn primary" type="button" onClick={startCamera} disabled={busy || cameraOn}>Ouvrir la caméra</button>{cameraOn && <button className="btn secondary" type="button" onClick={stopCamera}>Arrêter</button>}</div><form onSubmit={event => { event.preventDefault(); lookup(code) }}><label htmlFor="manual-code">Saisie manuelle du code</label><div className="actions"><input id="manual-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" inputMode="text" placeholder="EAN, UPC ou autre code-barres"/><button className="btn secondary" type="submit">Rechercher</button></div></form></div>
    <div className="panel scanner-panel" aria-live="polite"><h3>Fiche produit</h3>{!lookupCode && <p>Scannez un code ou saisissez-le ci-contre.</p>}{lookupCode && found && <div><span className="badge ok">Code reconnu</span><h2>{found.designation}</h2><p>{found.id_interne} · {found.category}</p><p>Code-barres : {found.code_barres}</p><p>Stock : <strong>{found.quantite_stock === null ? 'Non inventorié' : found.quantite_stock}</strong></p><p>État : {stockStatus(found.quantite_stock, 0, found.seuil_critique)} · seuil critique : {found.seuil_critique}</p><p>Règle : {found.debit_rule === 'prise_confirmee' ? 'Débit à la prise confirmée' : found.debit_rule === 'boite_vide' ? 'Débit à la boîte vide' : 'Débit manuel confirmé'}</p></div>}{lookupCode && !found && <div><span className="badge warn">Code inconnu</span><p>« {lookupCode} » n’est associé à aucune fiche visible.</p>{!writesEnabled && <p>Association et création disponibles après validation de la migration Scanner.</p>}<div className="actions"><button className="btn secondary" type="button" onClick={() => setAction('associate')} disabled={!writesEnabled}>Associer à un produit</button><button className="btn primary" type="button" onClick={() => setAction('create')} disabled={!writesEnabled}>Créer un produit</button></div>{action === 'associate' && <form onSubmit={associate}><label htmlFor="associate-product">Produit existant sans code</label><select id="associate-product" name="product_id" required><option value="">Choisir une fiche</option>{products.filter(product => !product.code_barres).map(product => <option key={product.id} value={product.id}>{product.id_interne} · {product.designation}</option>)}</select><button className="btn primary" disabled={busy}>Confirmer l’association</button></form>}{action === 'create' && <form onSubmit={create}><p>Le code « {lookupCode} » sera conservé. La fiche commencera à l’état « Non inventorié ».</p><label>Désignation<input name="designation" required/></label><label>Catégorie<select name="category_id" required><option value="">Choisir</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Seuil critique<input name="threshold" type="number" min="0" step="1" required/></label><label>Règle de débit<select name="debit_rule" required><option value="">Choisir</option><option value="prise_confirmee">Cartouche : prise confirmée</option><option value="boite_vide">Visserie : boîte vide</option><option value="manuel">Autre : sortie manuelle</option></select></label><button className="btn primary" disabled={busy}>Créer sans inventaire</button></form>}</div>}{error && <p className="feedback-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>
  </div>
}
