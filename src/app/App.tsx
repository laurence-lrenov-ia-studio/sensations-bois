import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import logo from '../assets/prototype/logo.png'
import stockPhoto from '../assets/prototype/stock.jpg'
import chantiersPhoto from '../assets/prototype/chantiers.jpg'
import materielPhoto from '../assets/prototype/materiel.jpg'
import agendaPhoto from '../assets/prototype/agenda.jpg'
import scannerPhoto from '../assets/prototype/scanner.jpg'
import { configurationError, invitationInUrl, supabase } from '../lib/supabase/client'
import { loadWorkspace, type WorkspaceData } from '../lib/supabase/data'
import { stockStatus } from '../features/stock/stock-status'
import { outgoingType, preinventoryOutflowsEnabled } from '../features/stock/preinventory'
const Scanner = lazy(() => import('../features/scanner/Scanner').then(module => ({ default: module.Scanner })))

type Page = 'home' | 'stock' | 'chantiers' | 'materiel' | 'agenda' | 'scanner'
type Modal = 'inventory' | 'chantier' | 'intervention' | 'postit' | null
const empty: WorkspaceData = { products: [], chantiers: [], interventions: [], postit: [], material: [], movements: [], preinventoryOutflows: [] }
const photos = { stock: stockPhoto, chantiers: chantiersPhoto, materiel: materielPhoto, agenda: agendaPhoto, scanner: scannerPhoto }
const dateTime = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Opération impossible.'

function Icon({ page }: { page: Page }) {
  const shapes: Record<Page, ReactNode> = {
    home: null,
    stock: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    chantiers: <><path d="M4 5.5h6l1.5 2H20v11H4v-13Z"/><path d="M7 12h10M7 15h7"/></>,
    materiel: <><path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2M8 12h8"/></>,
    agenda: <><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7 3v4M17 3v4M3.5 9.5h17"/></>,
    scanner: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" aria-hidden="true">{shapes[page]}</svg>
}

function Header({ title, subtitle, home }: { title: string; subtitle: string; home: () => void }) {
  return <header className="workspace-header"><button className="back" onClick={home}>← Accueil</button><div className="workspace-title"><h1>{title}</h1><p>{subtitle}</p></div><img className="mini-logo" src={logo} alt=""/></header>
}
function Kpi({ label, value }: { label: string; value: number | string }) {
  return <div className="panel"><div className="muted">{label}</div><div className="kpi">{value}</div></div>
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [inviteFlow, setInviteFlow] = useState(invitationInUrl)
  const [data, setData] = useState<WorkspaceData>(empty)
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState<Page>('home')
  const [modal, setModal] = useState<Modal>(null)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [stockType, setStockType] = useState('entree')
  const [stockQuantity, setStockQuantity] = useState(1)
  const [stockChantier, setStockChantier] = useState('')
  const [stockSource, setStockSource] = useState('')
  const [stockReason, setStockReason] = useState('')
  const [stockConfirmed, setStockConfirmed] = useState(false)
  const pendingPreinventoryRef = useRef<{ fingerprint: string; id: string } | null>(null)
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let active = true
    supabase.auth.getUser().then(({ data: result, error: authError }) => {
      if (!active) return
      setUser(authError ? null : result.user)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (!session) { setData(empty); setAuthorized(false); setPage('home') }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!user || !supabase || inviteFlow) return
    let active = true
    setLoading(true)
    setError('')
    loadWorkspace(supabase).then(result => {
      if (!active) return
      // The catalog is the membership gate. RLS returns no rows to users absent from sb_private.members.
      if (result.products.length === 0) { setAuthorized(false); setData(empty); setError('Accès non autorisé ou catalogue vide. Vérifiez le compte et son habilitation.'); return }
      setData(result); setAuthorized(true)
    }).catch(cause => { if (active) { setAuthorized(false); setData(empty); setError(errorText(cause)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id, inviteFlow])

  async function refresh() {
    if (!supabase) return
    const result = await loadWorkspace(supabase)
    if (result.products.length === 0) throw new Error('Le catalogue Sensations Bois n’est pas accessible.')
    setData(result)
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? '') })
    if (authError) setError('Connexion refusée. Vérifiez vos identifiants et votre habilitation.')
    setBusy(false)
  }

  async function finishInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirmation = String(form.get('confirmation') ?? '')
    if (password.length < 12 || password !== confirmation) {
      setError('Choisissez au moins 12 caractères et saisissez deux fois le même mot de passe.')
      return
    }
    setBusy(true); setError('')
    const { error: authError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (authError) { setError('Le mot de passe n’a pas été enregistré. Vérifiez le lien d’invitation ou réessayez.'); return }
    window.history.replaceState({}, '', window.location.pathname)
    setInviteFlow(false)
    setNotice('Mot de passe enregistré. Vérification de votre habilitation…')
  }

  async function mutate(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await action()
      if (response.error) throw new Error(response.error.message)
      await refresh()
      setModal(null); setNotice(success)
      return true
    } catch (cause) { setError(errorText(cause)); return false }
    finally { setBusy(false) }
  }

  async function inventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    const productId = String(form.get('product_id') ?? '')
    const quantity = Number(form.get('quantity'))
    if (!Number.isSafeInteger(quantity) || quantity < 0 || form.get('confirm') !== 'yes') { setError('Saisissez une quantité entière et confirmez le comptage.'); return }
    if (data.products.find(product => product.id === productId)?.quantite_stock !== null) { setError('Ce produit a déjà été inventorié.'); return }
    await mutate(() => supabase!.rpc('sb_record_stock_movement', { p_operation_id: crypto.randomUUID(), p_product_id: productId, p_type: 'inventaire_initial', p_quantity: quantity, p_motif: 'Inventaire initial compté et confirmé', p_chantier_id: null, p_sortie_movement_id: null }), 'Inventaire initial enregistré et historisé.')
  }

  async function submitChantier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const f = new FormData(event.currentTarget)
    await mutate(() => supabase!.from('sb_chantiers').insert({ reference: String(f.get('reference')).trim(), intitule: String(f.get('intitule')).trim(), client_nom: String(f.get('client_nom')).trim() || null, adresse: String(f.get('adresse')).trim() || null, statut: 'prévu' }).select('id').single(), 'Chantier créé.')
  }
  async function submitIntervention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const f = new FormData(event.currentTarget)
    await mutate(() => supabase!.from('sb_interventions').insert({ chantier_id: String(f.get('chantier_id')), intitule: String(f.get('intitule')).trim(), debut: new Date(String(f.get('debut'))).toISOString(), statut: 'prévue' }).select('id').single(), 'Intervention créée.')
  }
  async function submitPostit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const f = new FormData(event.currentTarget)
    await mutate(() => supabase!.from('sb_postit_items').insert({ chantier_id: String(f.get('chantier_id')), product_id: String(f.get('product_id')), quantite_prevue: Number(f.get('quantity')), est_prepare: false, actif: true }).select('id').single(), 'Ajouté au post-it sans débit de stock.')
  }

  const product = data.products.find(item => item.id === selectedProduct)
  const stockOutType = product ? outgoingType(product.debit_rule) : 'sortie_manuelle'
  const matchingSources = data.movements.filter(m => m.product_id === selectedProduct && m.chantier_id === stockChantier && ['prise_cartouche','boite_vide','sortie_manuelle'].includes(m.type_mouvement) && -m.variation > data.movements.filter(r => r.sortie_movement_id === m.id).reduce((sum, r) => sum + r.variation, 0))

  async function recordMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !product) return
    if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 1) { setError('Saisissez une quantité entière positive.'); return }
    const type = stockType === 'sortie' ? stockOutType : stockType
    if ((type === 'retour' || stockType === 'sortie') && !stockChantier) { setError('Choisissez un chantier.'); return }
    if (type === 'retour' && !stockSource) { setError('Choisissez la sortie chantier à laquelle rattacher ce retour.'); return }
    if (!stockReason.trim()) { setError('Indiquez un motif.'); return }
    if (stockType === 'sortie' && !stockConfirmed) { setError('Confirmez la prise ou la boîte vide avant la sortie.'); return }
    if (product.quantite_stock === null) {
      if (stockType !== 'sortie') { setError('Seules les sorties peuvent être tracées avant inventaire.'); return }
      if (!preinventoryOutflowsEnabled) { setError('La trace avant inventaire attend la migration Supabase.'); return }
      const motif = stockReason.trim()
      const fingerprint = [product.id, stockChantier, stockQuantity, type, motif].join(':')
      if (pendingPreinventoryRef.current?.fingerprint !== fingerprint) pendingPreinventoryRef.current = { fingerprint, id: crypto.randomUUID() }
      setBusy(true); setError(''); setNotice('')
      try {
        const { error: rpcError } = await supabase.rpc('sb_record_preinventory_outflow', {
          p_operation_id: pendingPreinventoryRef.current.id,
          p_product_id: product.id,
          p_chantier_id: stockChantier,
          p_type: type,
          p_quantity: stockQuantity,
          p_motif: motif,
        })
        if (rpcError) throw rpcError
        await refresh()
        pendingPreinventoryRef.current = null
        setStockConfirmed(false)
        setNotice('Sortie avant inventaire tracée. Le stock reste non inventorié.')
      } catch (cause) { setError(errorText(cause)) }
      finally { setBusy(false) }
      return
    }
    const recorded = await mutate(() => supabase!.rpc('sb_record_stock_movement', { p_operation_id: crypto.randomUUID(), p_product_id: product.id, p_type: type, p_quantity: stockQuantity, p_motif: stockReason.trim(), p_chantier_id: stockChantier || null, p_sortie_movement_id: type === 'retour' ? stockSource : null }), 'Mouvement enregistré et historisé.')
    if (recorded) setStockConfirmed(false)
  }

  const recentHistory = [
    ...data.movements.map(m => ({ id: m.id, created_at: m.created_at, product_id: m.product_id, title: m.type_mouvement, detail: m.motif, quantity: `${m.variation > 0 ? '+' : ''}${m.variation}`, badge: m.variation < 0 ? 'warn' : 'ok' })),
    ...data.preinventoryOutflows.map(s => ({ id: s.id, created_at: s.created_at, product_id: s.product_id, title: 'Sortie avant inventaire', detail: `${data.chantiers.find(c => c.id === s.chantier_id)?.intitule ?? 'Chantier'} · ${s.motif}`, quantity: `Qté ${s.quantite}`, badge: 'neutral' })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30)

  const notInventoried = data.products.filter(p => p.quantite_stock === null).length
  const alerts = data.products.filter(p => p.quantite_stock !== null && p.quantite_stock <= p.seuil_critique).length
  const filtered = data.products.filter(p => `${p.id_interne} ${p.designation} ${p.category}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')))
  const cards: { page: Exclude<Page, 'home'>; title: string; description: string; foot: string }[] = [
    { page: 'stock', title: 'Stock', description: 'Catalogue, inventaire et seuils critiques.', foot: `${notInventoried} non inventorié(s)` },
    { page: 'chantiers', title: 'Chantiers', description: 'Dossiers et avancement.', foot: `${data.chantiers.length} chantier(s)` },
    { page: 'materiel', title: 'Matériel', description: 'Post-it du matin et préparation.', foot: `${data.postit.length} élément(s)` },
    { page: 'agenda', title: 'Agenda', description: 'Interventions et rendez-vous.', foot: `${data.interventions.length} intervention(s)` },
    { page: 'scanner', title: 'Scanner', description: 'Codes-barres et mouvements confirmés.', foot: `${data.movements.length + data.preinventoryOutflows.length} trace(s)` },
  ]

  if (inviteFlow && user && !configurationError) return <div className="app auth-screen"><div className="auth-card"><img className="logo" src={logo} alt="Sensations Bois"/><h1>Accepter l’invitation</h1><p>Compte : {user.email}. Choisissez vous-même votre mot de passe pour Sensations Bois.</p><form onSubmit={finishInvitation}><label htmlFor="new-password">Nouveau mot de passe</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required/><label htmlFor="confirm-password">Confirmer le mot de passe</label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} required/><button className="btn primary" disabled={busy}>Enregistrer mon mot de passe</button></form>{error && <p className="feedback-error" role="alert">{error}</p>}</div></div>
  if (configurationError || !authReady || !user || loading || !authorized) return <div className="app auth-screen"><div className="auth-card"><img className="logo" src={logo} alt="Sensations Bois"/><h1>Accès professionnel</h1>{configurationError ? <p role="alert">{configurationError}</p> : !authReady || loading ? <p>Chargement sécurisé…</p> : !user ? <form onSubmit={login}><label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="username" required/><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required/><button className="btn primary" disabled={busy}>Se connecter</button></form> : <button className="btn secondary" onClick={() => supabase?.auth.signOut()}>Changer de compte</button>}{error && <p className="feedback-error" role="alert">{error}</p>}</div></div>

  return <div className="app">
    {page === 'home' && <section className="screen active home"><header className="top"><img className="logo" src={logo} alt="Sensations Bois"/><div className="info"><div className="datetime"><div className="big">{new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(now)}</div><div className="small">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(now)}</div></div><button className="btn secondary" onClick={() => supabase?.auth.signOut()}>Déconnexion</button></div></header><section className="hello"><h1>Bonjour <span>Rémy</span></h1><p className="demo-note">Espace privé Sensations Bois · {data.products.length} références</p></section><section className="cards" aria-label="Espaces de travail">{cards.map(card => <button key={card.page} className="home-card" style={{ '--photo': `url(${photos[card.page]})` } as CSSProperties} onClick={() => { setPage(card.page); setError(''); window.scrollTo(0, 0) }}><div className="home-card-content"><div className="icon"><Icon page={card.page}/></div><h2>{card.title}</h2><p>{card.description}</p><div className="card-foot"><span>{card.foot}</span><span>Ouvrir →</span></div></div></button>)}</section></section>}
    {page === 'stock' && <section className="screen active workspace"><Header title="Stock" subtitle="Catalogue réel et inventaire" home={() => setPage('home')}/><main className="workspace-main"><div className="grid grid-4"><Kpi label="Références" value={data.products.length}/><Kpi label="Non inventoriés" value={notInventoried}/><Kpi label="Sous le seuil" value={alerts}/><Kpi label="Traces affichées" value={data.movements.length + data.preinventoryOutflows.length}/></div><div className="actions" style={{ marginTop: 18 }}><button className="btn primary" onClick={() => setModal('inventory')} disabled={notInventoried === 0}>Saisir un inventaire initial</button><button className="btn secondary" onClick={() => { refresh().catch(cause => setError(errorText(cause))) }}>Actualiser</button><input className="search-input" aria-label="Rechercher un produit" placeholder="Rechercher une référence…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="panel mobile-table-wrap"><table><thead><tr><th>Référence</th><th>Produit</th><th>Famille</th><th>Stock</th><th>Seuil</th><th>État</th></tr></thead><tbody>{filtered.map(p => { const status = stockStatus(p.quantite_stock, 0, p.seuil_critique); return <tr key={p.id}><td data-label="Référence">{p.id_interne}</td><td data-label="Produit">{p.designation}</td><td data-label="Famille">{p.category}</td><td data-label="Stock">{p.quantite_stock === null ? 'Non inventorié' : `${p.quantite_stock}${p.unite ? ` ${p.unite}` : ''}`}</td><td data-label="Seuil">{p.seuil_critique}</td><td data-label="État"><span className={`badge ${status === 'Rupture' ? 'alert' : status === 'À recommander' ? 'warn' : status === 'OK' ? 'ok' : 'neutral'}`}>{status}</span></td></tr> })}</tbody></table></div></main></section>}
    {page === 'chantiers' && <section className="screen active workspace"><Header title="Chantiers" subtitle="Dossiers privés" home={() => setPage('home')}/><main className="workspace-main"><div className="actions"><button className="btn primary" onClick={() => setModal('chantier')}>Nouveau chantier</button></div><div className="grid grid-3">{data.chantiers.map(c => <div className="project-card" key={c.id}><h3>{c.intitule}</h3><p>{c.reference} · {c.statut}</p><p>{c.client_nom || 'Client non renseigné'}</p><p>{c.adresse || 'Adresse non renseignée'}</p><div className="actions"><select aria-label={`Statut de ${c.intitule}`} value={c.statut} onChange={e => { if (!supabase) return; void mutate(() => supabase!.from('sb_chantiers').update({ statut: e.target.value }).eq('id', c.id).select('id').single(), 'Chantier mis à jour.') }}><option>prévu</option><option>en cours</option><option>terminé</option><option>annulé</option></select></div></div>)}</div>{data.chantiers.length === 0 && <p>Aucun chantier enregistré.</p>}</main></section>}
    {page === 'materiel' && <section className="screen active workspace"><Header title="Matériel du matin" subtitle="Post-it sans débit automatique" home={() => setPage('home')}/><main className="workspace-main"><div className="grid grid-3"><Kpi label="À préparer" value={data.postit.filter(i => !i.est_prepare).length}/><Kpi label="Préparés" value={data.postit.filter(i => i.est_prepare).length}/><Kpi label="Matériels référencés" value={data.material.length}/></div><div className="actions" style={{ marginTop: 18 }}><button className="btn primary" onClick={() => setModal('postit')} disabled={data.chantiers.length === 0}>Ajouter au post-it</button></div><div className="panel"><h3>Liste de préparation</h3><div className="list">{data.postit.map(item => <label className="checkrow" key={item.id}><input type="checkbox" checked={item.est_prepare} onChange={e => { if (!supabase) return; void mutate(() => supabase!.from('sb_postit_items').update({ est_prepare: e.target.checked }).eq('id', item.id).select('id').single(), 'Post-it mis à jour sans mouvement de stock.') }}/><div><strong>{data.products.find(p => p.id === item.product_id)?.designation ?? data.material.find(m => m.id === item.materiel_id)?.designation ?? 'Élément'}</strong><small>{data.chantiers.find(c => c.id === item.chantier_id)?.intitule} · quantité prévue : {item.quantite_prevue ?? '—'}</small></div><span className={`badge ${item.est_prepare ? 'ok' : 'warn'}`}>{item.est_prepare ? 'Préparé' : 'À préparer'}</span></label>)}</div>{data.postit.length === 0 && <p>Aucun élément prévu.</p>}</div></main></section>}
    {page === 'agenda' && <section className="screen active workspace"><Header title="Agenda" subtitle="Interventions privées" home={() => setPage('home')}/><main className="workspace-main"><div className="actions"><button className="btn primary" onClick={() => setModal('intervention')} disabled={data.chantiers.length === 0}>Nouvelle intervention</button></div><div className="grid grid-3">{data.interventions.map(i => <div className="project-card" key={i.id}><h3>{i.intitule}</h3><p>{data.chantiers.find(c => c.id === i.chantier_id)?.intitule}</p><p>{dateTime(i.debut)}</p><select aria-label={`Statut de ${i.intitule}`} value={i.statut} onChange={e => { if (!supabase) return; void mutate(() => supabase!.from('sb_interventions').update({ statut: e.target.value }).eq('id', i.id).select('id').single(), 'Intervention mise à jour.') }}><option>prévue</option><option>en cours</option><option>terminée</option><option>annulée</option></select></div>)}</div>{data.interventions.length === 0 && <p>Aucune intervention enregistrée.</p>}</main></section>}
    {page === 'scanner' && <section className="screen active workspace"><Header title="Scanner" subtitle="Codes-barres et mouvements historisés" home={() => setPage('home')}/><main className="workspace-main"><Suspense fallback={<p>Chargement du scanner…</p>}><Scanner client={supabase!} products={data.products} chantiers={data.chantiers} onChanged={refresh}/></Suspense><h2 className="section-heading">Sorties et mouvements</h2><div className="grid grid-2"><form className="panel" onSubmit={recordMovement}><h3>Enregistrer une sortie ou un mouvement</h3><label htmlFor="stock-product">Produit</label><select id="stock-product" value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setStockSource(''); setStockConfirmed(false) }} required><option value="">Choisir un produit</option>{data.products.map(p => <option key={p.id} value={p.id}>{p.id_interne} · {p.designation}</option>)}</select><p className="muted">{product ? `Stock : ${product.quantite_stock === null ? 'Non inventorié' : product.quantite_stock}. Règle : ${product.debit_rule === 'prise_confirmee' ? 'cartouche prise confirmée' : product.debit_rule === 'boite_vide' ? 'boîte vide confirmée' : 'sortie manuelle confirmée'}.` : 'Choisissez une référence.'}</p>{product?.quantite_stock === null && <p className="muted">{preinventoryOutflowsEnabled ? 'Sortie possible avec trace séparée. Le stock reste non inventorié jusqu’au comptage réel.' : 'La trace avant inventaire sera disponible après validation de la migration.'}</p>}<label htmlFor="stock-type">Opération</label><select id="stock-type" value={stockType} onChange={e => { setStockType(e.target.value); setStockSource(''); setStockConfirmed(false) }}><option value="entree">Entrée fournisseur</option><option value="sortie">{product?.debit_rule === 'boite_vide' ? 'Boîte vide confirmée' : product?.debit_rule === 'prise_confirmee' ? 'Prise de cartouche confirmée' : 'Sortie chantier confirmée'}</option><option value="retour">Retour chantier</option></select><label htmlFor="stock-qty">Quantité</label><input id="stock-qty" type="number" min="1" step="1" value={stockQuantity} onChange={e => setStockQuantity(Number(e.target.value))} required/>{stockType !== 'entree' && <><label htmlFor="stock-chantier">Chantier</label><select id="stock-chantier" value={stockChantier} onChange={e => { setStockChantier(e.target.value); setStockSource('') }} required><option value="">Choisir un chantier</option>{data.chantiers.map(c => <option key={c.id} value={c.id}>{c.intitule}</option>)}</select></>}{stockType === 'retour' && <><label htmlFor="stock-source">Sortie d’origine</label><select id="stock-source" value={stockSource} onChange={e => setStockSource(e.target.value)} required><option value="">Choisir la sortie</option>{matchingSources.map(m => <option key={m.id} value={m.id}>{dateTime(m.created_at)} · sorti {-m.variation}, retournable {-m.variation - data.movements.filter(r => r.sortie_movement_id === m.id).reduce((sum, r) => sum + r.variation, 0)}</option>)}</select></>}{stockType === 'sortie' && <label className="confirm-row"><input type="checkbox" checked={stockConfirmed} onChange={e => setStockConfirmed(e.target.checked)} required/>{product?.debit_rule === 'boite_vide' ? 'Je confirme que la boîte est vide.' : product?.debit_rule === 'prise_confirmee' ? 'Je confirme la prise des cartouches.' : 'Je confirme la sortie chantier.'}</label>}<label htmlFor="stock-reason">Motif</label><input id="stock-reason" value={stockReason} onChange={e => setStockReason(e.target.value)} required/><button className="btn primary" type="submit" disabled={busy || !product || (product.quantite_stock === null && (!preinventoryOutflowsEnabled || stockType !== 'sortie'))}>Confirmer le mouvement</button></form><div className="panel"><h3>Historique récent</h3><div className="list">{recentHistory.map(item => <div className="item" key={item.id}><div><strong>{data.products.find(p => p.id === item.product_id)?.designation ?? 'Produit'}</strong><small>{dateTime(item.created_at)} · {item.title} · {item.detail}</small></div><span className={`badge ${item.badge}`}>{item.quantity}</span></div>)}</div>{recentHistory.length === 0 && <p>Aucune sortie ni mouvement enregistré.</p>}</div></div></main></section>}
    {page !== 'home' && <nav className="mobile-nav" aria-label="Navigation mobile">{cards.map(card => <button key={card.page} className={page === card.page ? 'selected' : ''} aria-current={page === card.page ? 'page' : undefined} onClick={() => { setPage(card.page); setError('') }}>{card.title}</button>)}</nav>}
    {(error || notice) && <div className={`toast visible ${error ? 'feedback-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    {modal && <div className="modal show" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><div className="modal-box" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setModal(null)} aria-label="Fermer">×</button><h2>{modal === 'inventory' ? 'Inventaire initial' : modal === 'chantier' ? 'Nouveau chantier' : modal === 'intervention' ? 'Nouvelle intervention' : 'Ajouter au post-it'}</h2>{modal === 'inventory' && <form onSubmit={inventory}><p>Saisissez la quantité physiquement présente aujourd’hui. Les sorties tracées avant cet inventaire ne seront pas déduites une seconde fois. La validation crée un mouvement d’inventaire initial.</p><label htmlFor="inventory-product">Produit non inventorié</label><select id="inventory-product" name="product_id" required><option value="">Choisir une référence</option>{data.products.filter(p => p.quantite_stock === null).map(p => <option key={p.id} value={p.id}>{p.id_interne} · {p.designation}</option>)}</select><label htmlFor="inventory-qty">Quantité constatée</label><input id="inventory-qty" name="quantity" type="number" min="0" step="1" required/><label className="confirm-row"><input type="checkbox" name="confirm" value="yes" required/> Je confirme avoir compté cette quantité.</label><button className="btn primary" disabled={busy}>Valider l’inventaire</button></form>}{modal === 'chantier' && <form onSubmit={submitChantier}><label>Référence<input name="reference" required/></label><label>Intitulé<input name="intitule" required/></label><label>Client<input name="client_nom"/></label><label>Adresse<input name="adresse"/></label><button className="btn primary" disabled={busy}>Créer</button></form>}{modal === 'intervention' && <form onSubmit={submitIntervention}><label>Chantier<select name="chantier_id" required><option value="">Choisir</option>{data.chantiers.map(c => <option key={c.id} value={c.id}>{c.intitule}</option>)}</select></label><label>Intitulé<input name="intitule" required/></label><label>Début<input name="debut" type="datetime-local" required/></label><button className="btn primary" disabled={busy}>Créer</button></form>}{modal === 'postit' && <form onSubmit={submitPostit}><label>Chantier<select name="chantier_id" required><option value="">Choisir</option>{data.chantiers.map(c => <option key={c.id} value={c.id}>{c.intitule}</option>)}</select></label><label>Produit<select name="product_id" required><option value="">Choisir</option>{data.products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}</select></label><label>Quantité prévue<input name="quantity" type="number" min="1" step="1" required/></label><p>Cette opération prépare la liste sans débiter le stock.</p><button className="btn primary" disabled={busy}>Ajouter</button></form>}</div></div>}
  </div>
}
