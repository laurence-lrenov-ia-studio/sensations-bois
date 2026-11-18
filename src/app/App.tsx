import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import logo from '../assets/prototype/logo.png'
import stockPhoto from '../assets/prototype/stock.jpg'
import chantiersPhoto from '../assets/prototype/chantiers.jpg'
import materielPhoto from '../assets/prototype/materiel.jpg'
import agendaPhoto from '../assets/prototype/agenda.jpg'
import scannerPhoto from '../assets/prototype/scanner.jpg'

type Page = 'home' | 'stock' | 'chantiers' | 'materiel' | 'agenda' | 'scanner'
type Product = { name: string; family: string; stock: number; reserved: number; threshold: number }
type Project = { client: string; city: string; type: string; progress: number; detail: string }
type Material = { name: string; status: string; kind: 'ok' | 'warn' | 'alert'; done: boolean }
type Demo = { products: Product[]; projects: Project[]; material: Material[]; events: { title: string }[][] }
const key = 'sensationsBoisDemoMission04'
const days = ['Lun 20', 'Mar 21', 'Mer 22', 'Jeu 23', 'Ven 24', 'Sam 25', 'Dim 26']
const defaults: Demo = {
  products: [
    { name: 'Colle PU', family: 'Colles', stock: 8, reserved: 2, threshold: 3 },
    { name: 'Mastic blanc', family: 'Mastics', stock: 2, reserved: 1, threshold: 3 },
    { name: 'Bande abrasive grain 80', family: 'Abrasifs', stock: 4, reserved: 2, threshold: 2 },
    { name: 'Parquet chêne', family: 'Bois', stock: 42, reserved: 18, threshold: 10 },
  ],
  projects: [
    { client: 'Client Démo A', city: 'Bordeaux', type: 'Pose parquet', progress: 57, detail: '47 m² posés sur 82 m²' },
    { client: 'Client Démo B', city: 'Mérignac', type: 'Dressing sur mesure', progress: 25, detail: 'Prise de côtes terminée' },
    { client: 'Client Démo C', city: 'Le Bouscat', type: 'Cuisine sur mesure', progress: 80, detail: 'Pose presque terminée' },
    { client: 'Client Démo D', city: 'Pessac', type: 'Bibliothèque', progress: 40, detail: 'Fabrication atelier' },
    { client: 'Client Démo E', city: 'Eysines', type: 'Terrasse bois', progress: 15, detail: 'Approvisionnement en cours' },
  ],
  material: [
    { name: 'Parquet chêne — 12 m²', status: 'Disponible', kind: 'ok', done: false },
    { name: 'Colle parquet — 4 seaux', status: '1 manque', kind: 'alert', done: false },
    { name: 'Bandes grain 80 — 2 boîtes', status: 'Disponible', kind: 'ok', done: false },
    { name: 'Scie plongeante', status: 'À charger', kind: 'warn', done: false },
    { name: 'Aspirateur chantier', status: 'Sur un autre chantier', kind: 'alert', done: false },
  ],
  events: [[{ title: 'Démo A — Pose parquet' }], [{ title: 'Démo A — Pose parquet' }], [{ title: 'Démo B — Prise de côtes' }], [{ title: 'Démo C — Finitions' }], [{ title: 'Atelier — Fabrication' }], [], []],
}
function initial(): Demo {
  try { const data = JSON.parse(localStorage.getItem(key) || 'null'); if (data && Array.isArray(data.products) && Array.isArray(data.projects) && Array.isArray(data.material) && Array.isArray(data.events) && data.events.length === 7) return data }
  catch { /* Ignore an invalid local demo. */ }
  return structuredClone(defaults)
}
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
  return <header className="workspace-header"><button className="back" onClick={home}>← Accueil</button><div className="workspace-title"><h1>{title}</h1><p>{subtitle} · Données fictives</p></div><img className="mini-logo" src={logo} alt=""/></header>
}
function Kpi({ label, value }: { label: string; value: number | string }) {
  return <div className="panel"><div className="muted">{label}</div><div className="kpi">{value}</div></div>
}
export function App() {
  const [page, setPage] = useState<Page>('home')
  const [demo, setDemo] = useState<Demo>(initial)
  const [modal, setModal] = useState<'product' | 'project' | 'event' | null>(null)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(new Date())
  const [weather, setWeather] = useState({ temp: '-- °C', label: 'Météo Bordeaux' })
  const [scannedIndex, setScannedIndex] = useState<number | null>(null)
  const [scanType, setScanType] = useState('Entrée fournisseur')
  const [scanQty, setScanQty] = useState(2)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { localStorage.setItem(key, JSON.stringify(demo)) }, [demo])
  useEffect(() => { const interval = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(interval) }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.open-meteo.com/v1/forecast?latitude=44.84&longitude=-0.58&current=temperature_2m,weather_code&timezone=auto', { signal: controller.signal }).then(r => r.json()).then(data => {
      const labels: Record<number, string> = { 0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert', 61: 'Pluie', 63: 'Pluie', 65: 'Forte pluie', 80: 'Averses', 81: 'Averses', 82: 'Fortes averses' }
      setWeather({ temp: `${Math.round(data.current.temperature_2m)} °C`, label: `${labels[data.current.weather_code] || 'Conditions variables'} · Bordeaux` })
    }).catch(() => setWeather({ temp: '-- °C', label: 'Météo indisponible' }))
    return () => controller.abort()
  }, [])
  useEffect(() => { if (!modal) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setModal(null) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [modal])
  function show(next: Page) { setPage(next); window.scrollTo(0, 0) }
  function toast(text: string) { setMessage(text); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(''), 2600) }
  function reset() { setDemo(structuredClone(defaults)); localStorage.removeItem(key); setScannedIndex(null); toast('Démo réinitialisée') }
  function adjustStock(index: number) {
    const input = prompt('Nouvelle quantité en stock (démo)', String(demo.products[index].stock))
    if (input === null) return
    const stock = Number(input)
    if (!Number.isInteger(stock) || stock < 0) return toast('Saisis une quantité entière positive')
    setDemo(old => ({ ...old, products: old.products.map((p, i) => i === index ? { ...p, stock } : p) })); toast('Stock fictif mis à jour')
  }
  function adjustProject(index: number) {
    const input = prompt('Nouvel avancement en % (démo)', String(demo.projects[index].progress))
    if (input === null) return
    const progress = Number(input)
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) return toast('Saisis un pourcentage de 0 à 100')
    setDemo(old => ({ ...old, projects: old.projects.map((p, i) => i === index ? { ...p, progress, detail: `${progress} % terminé` } : p) })); toast('Avancement fictif mis à jour')
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    if (modal === 'product') {
      const name = String(form.get('name') || '').trim(), stock = Number(form.get('stock')), threshold = Number(form.get('threshold'))
      if (!name) return toast('Renseigne une désignation')
      if (![stock, threshold].every(n => Number.isInteger(n) && n >= 0)) return toast('Saisis des quantités entières positives')
      setDemo(old => ({ ...old, products: [...old.products, { name, family: String(form.get('family') || '').trim() || 'Autres', stock, reserved: 0, threshold }] }))
    } else if (modal === 'project') {
      const client = String(form.get('client') || '').trim(), progress = Number(form.get('progress'))
      if (!client) return toast('Renseigne un client fictif')
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) return toast('Saisis un pourcentage de 0 à 100')
      setDemo(old => ({ ...old, projects: [...old.projects, { client, city: String(form.get('city') || '').trim() || '—', type: String(form.get('type') || '').trim() || 'Chantier', progress, detail: `${progress} % terminé` }] }))
    } else if (modal === 'event') {
      const title = String(form.get('title') || '').trim(), day = Number(form.get('day'))
      if (!title) return toast('Renseigne un intitulé')
      setDemo(old => ({ ...old, events: old.events.map((events, i) => i === day ? [...events, { title }] : events) }))
    }
    setModal(null); toast('Donnée fictive enregistrée')
  }
  function validateScan() {
    if (scannedIndex === null) return toast('Scanne d’abord un produit')
    if (!Number.isInteger(scanQty) || scanQty < 1) return toast('Saisis une quantité entière positive')
    setDemo(old => ({ ...old, products: old.products.map((p, i) => i === scannedIndex ? { ...p, stock: scanType === 'Sortie chantier' ? Math.max(0, p.stock - scanQty) : p.stock + scanQty } : p) })); toast('Mouvement fictif enregistré')
  }
  const alerts = demo.products.filter(p => p.stock - p.reserved <= p.threshold).length
  const done = demo.material.filter(m => m.done).length, remaining = demo.material.length - done
  const cards: { page: Exclude<Page, 'home'>; title: string; description: string; foot: string; photo: string }[] = [
    { page: 'stock', title: 'Stock', description: 'Produits, quantités, réservations et alertes.', foot: `${alerts} alerte${alerts > 1 ? 's' : ''}`, photo: stockPhoto },
    { page: 'chantiers', title: 'Chantiers', description: 'Photos, côtes, documents et avancement.', foot: `${demo.projects.length} actifs`, photo: chantiersPhoto },
    { page: 'materiel', title: 'Matériel', description: 'Post-it du matin, chargement et retours.', foot: `${remaining} à préparer`, photo: materielPhoto },
    { page: 'agenda', title: 'Agenda', description: 'Chantiers, rendez-vous et interventions.', foot: 'Semaine démo', photo: agendaPhoto },
    { page: 'scanner', title: 'Scanner', description: 'Entrées, sorties et QR codes internes.', foot: 'Simulation', photo: scannerPhoto },
  ]
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(now)
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const scanned = scannedIndex === null ? null : demo.products[scannedIndex]
  return <div className="app">
    {page === 'home' && <section className="screen active home"><header className="top"><img className="logo" src={logo} alt="Sensations Bois"/><div className="info"><div className="weather"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/></svg><div><div className="big">{weather.temp}</div><div className="small">{weather.label}</div></div></div><div className="sep"/><div className="datetime"><div className="big">{time}</div><div className="small">{date}</div></div></div></header><section className="hello"><h1>Bonjour <span>Rémy</span></h1><p className="demo-note">Interface de démonstration · Données fictives</p></section><section className="cards" aria-label="Espaces de démonstration">{cards.map(card => <button key={card.page} className="home-card" style={{ '--photo': `url(${card.photo})` } as CSSProperties} onClick={() => show(card.page)}><div className="home-card-content"><div className="icon"><Icon page={card.page}/></div><h2>{card.title}</h2><p>{card.description}</p><div className="card-foot"><span>{card.foot}</span><span>Ouvrir →</span></div></div></button>)}</section></section>}
    {page === 'stock' && <section className="screen active workspace"><Header title="Stock" subtitle="Catalogue, quantités et alertes" home={() => show('home')}/><main className="workspace-main"><div className="grid grid-4"><Kpi label="Références" value={demo.products.length}/><Kpi label="Sous le seuil" value={alerts}/><Kpi label="Réservées" value={demo.products.reduce((sum, p) => sum + p.reserved, 0)}/><Kpi label="Commandes en cours" value="2"/></div><div className="actions" style={{ marginTop: 18 }}><button className="btn primary" onClick={() => setModal('product')}>Ajouter un produit</button><button className="btn secondary" onClick={() => toast('Export d’inventaire — simulation')}>Exporter l’inventaire</button><button className="btn ghost" onClick={reset}>Réinitialiser la démo</button></div><div className="panel mobile-table-wrap"><table><thead><tr><th>Produit</th><th>Famille</th><th>Stock</th><th>Réservé</th><th>Disponible</th><th>Seuil</th><th>État</th><th></th></tr></thead><tbody>{demo.products.map((p, i) => { const available = p.stock - p.reserved, status = available <= 0 ? ['Rupture', 'alert'] : available <= p.threshold ? ['À recommander', 'warn'] : ['OK', 'ok']; return <tr key={i}><td data-label="Produit">{p.name}</td><td data-label="Famille">{p.family}</td><td data-label="Stock">{p.stock}</td><td data-label="Réservé">{p.reserved}</td><td data-label="Disponible">{available}</td><td data-label="Seuil">{p.threshold}</td><td data-label="État"><span className={`badge ${status[1]}`}>{status[0]}</span></td><td data-label="Action"><button className="btn ghost" onClick={() => adjustStock(i)}>Modifier</button></td></tr> })}</tbody></table></div></main></section>}
    {page === 'chantiers' && <section className="screen active workspace"><Header title="Chantiers" subtitle="Dossiers actifs et avancement" home={() => show('home')}/><main className="workspace-main"><div className="actions"><button className="btn primary" onClick={() => setModal('project')}>Nouveau chantier</button><button className="btn secondary" onClick={() => toast('Archives — simulation')}>Voir les archives</button></div><div className="grid grid-3">{demo.projects.map((p, i) => <div className="project-card" key={i}><h3>{p.client} — {p.city}</h3><div className="muted">{p.type}</div><div className="progress"><span style={{ width: `${p.progress}%` }}/></div><p>{p.detail}</p><div className="actions"><button className="btn primary" onClick={() => toast('Dossier chantier — simulation')}>Ouvrir</button><button className="btn secondary" onClick={() => adjustProject(i)}>Avancement</button></div></div>)}</div></main></section>}
    {page === 'materiel' && <section className="screen active workspace"><Header title="Matériel du matin" subtitle="Chantier Démo A — demain, 8 h 00" home={() => show('home')}/><main className="workspace-main"><div className="grid grid-3"><Kpi label="À préparer" value={remaining}/><Kpi label="Chargé" value={done}/><Kpi label="Manquant" value={demo.material.filter(m => m.kind === 'alert').length}/></div><div className="panel" style={{ marginTop: 18 }}><h3>Checklist de départ</h3><div className="list">{demo.material.map((m, i) => <label className="checkrow" key={i}><input type="checkbox" checked={m.done} onChange={event => setDemo(old => ({ ...old, material: old.material.map((item, j) => j === i ? { ...item, done: event.target.checked } : item) }))}/><div><strong>{m.name}</strong></div><span className={`badge ${m.kind}`}>{m.status}</span></label>)}</div><div className="actions" style={{ marginTop: 16 }}><button className="btn primary" onClick={() => toast(remaining ? `${remaining} élément(s) restent à charger` : 'Chargement fictif complet')}>Confirmer le chargement</button><button className="btn secondary" onClick={() => toast('Ajout d’élément — simulation')}>Ajouter un élément</button></div></div></main></section>}
    {page === 'agenda' && <section className="screen active workspace"><Header title="Agenda" subtitle="Interventions et rendez-vous · Semaine fictive" home={() => show('home')}/><main className="workspace-main"><div className="actions"><button className="btn primary" onClick={() => setModal('event')}>Ajouter une intervention</button><button className="btn secondary" onClick={() => toast('Connexion Google Agenda — simulation')}>Connecter Google Agenda</button></div><div className="panel"><div className="calendar">{days.map((day, i) => <div className="day" key={day}><strong>{day}</strong>{demo.events[i].map((event, j) => <div className="event" key={j}>{event.title}</div>)}</div>)}</div></div></main></section>}
    {page === 'scanner' && <section className="screen active workspace"><Header title="Scanner" subtitle="Simulation d’un mouvement de stock" home={() => show('home')}/><main className="workspace-main"><div className="grid grid-2"><div className="panel scan-box"><div className="scan-frame"><Icon page="scanner"/></div><button className="btn primary" onClick={() => { setScannedIndex(Math.min(2, demo.products.length - 1)); toast('Produit fictif reconnu') }}>Simuler un scan</button></div><div className="panel"><h3>Produit reconnu</h3><div className="muted" aria-live="polite">{scanned ? <><strong>{scanned.name}</strong><br/>{scanned.family} · stock fictif actuel : {scanned.stock}</> : 'Aucun produit scanné.'}</div><div className="form-grid" style={{ marginTop: 16 }}><div><label htmlFor="scan-type">Type de mouvement</label><select id="scan-type" value={scanType} onChange={e => setScanType(e.target.value)}><option>Entrée fournisseur</option><option>Sortie chantier</option><option>Retour chantier</option></select></div><div><label htmlFor="scan-qty">Quantité</label><input id="scan-qty" type="number" min="1" step="1" value={scanQty} onChange={e => setScanQty(Number(e.target.value))}/></div></div><button className="btn primary" style={{ marginTop: 16 }} onClick={validateScan}>Valider le mouvement</button></div></div></main></section>}
    {page !== 'home' && <nav className="mobile-nav" aria-label="Navigation mobile">{cards.map(card => <button key={card.page} className={page === card.page ? 'selected' : ''} aria-current={page === card.page ? 'page' : undefined} onClick={() => show(card.page)}>{card.title}</button>)}</nav>}
    {message && <div className="toast" role="status">{message}</div>}
    {modal && <div className="modal show" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><div className="modal-box" role="dialog" aria-modal="true" aria-label={modal === 'product' ? 'Ajouter un produit' : modal === 'project' ? 'Nouveau chantier' : 'Ajouter une intervention'}><form onSubmit={submit}>
      <h2>{modal === 'product' ? 'Ajouter un produit' : modal === 'project' ? 'Nouveau chantier' : 'Ajouter une intervention'}</h2>
      {modal === 'product' && <div className="form-grid"><div><label htmlFor="p-name">Désignation</label><input id="p-name" name="name" placeholder="Ex. Colle néoprène" autoFocus/></div><div><label htmlFor="p-family">Famille</label><input id="p-family" name="family" placeholder="Ex. Colles"/></div><div><label htmlFor="p-stock">Stock</label><input id="p-stock" name="stock" type="number" min="0" step="1" defaultValue="1"/></div><div><label htmlFor="p-threshold">Seuil</label><input id="p-threshold" name="threshold" type="number" min="0" step="1" defaultValue="1"/></div></div>}
      {modal === 'project' && <div className="form-grid"><div><label htmlFor="c-client">Client fictif</label><input id="c-client" name="client" placeholder="Ex. Client Démo F" autoFocus/></div><div><label htmlFor="c-city">Ville</label><input id="c-city" name="city" placeholder="Ville"/></div><div><label htmlFor="c-type">Type</label><input id="c-type" name="type" placeholder="Ex. Pose parquet"/></div><div><label htmlFor="c-progress">Avancement</label><input id="c-progress" name="progress" type="number" min="0" max="100" defaultValue="0"/></div></div>}
      {modal === 'event' && <div className="form-grid"><div><label htmlFor="a-day">Jour</label><select id="a-day" name="day">{days.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></div><div><label htmlFor="a-title">Intitulé</label><input id="a-title" name="title" placeholder="Ex. Prise de côtes" autoFocus/></div></div>}
      <div className="actions" style={{ marginTop: 16 }}><button className="btn primary" type="submit">Enregistrer</button><button className="btn secondary" type="button" onClick={() => setModal(null)}>Annuler</button></div>
    </form></div></div>}
  </div>
}
