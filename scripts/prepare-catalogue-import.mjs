import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute } from 'node:path'

const EXPECTED_HASH = '194de7cf8987a7cf3e52477332fd9e10dd3a50e23e465aaf781c531b507ab961'
const HEADERS = ['id_interne','nom_photo','designation','categorie','marque','reference_fournisseur','code_barres','fournisseur','unite','conditionnement','emplacement','seuil_critique','observations','statut_validation']
const REQUIRED_COUNTS = { Colles: 14, Abrasifs: 5, Visserie: 15, Assemblage: 4 }
const repo = resolve(import.meta.dirname, '..')

function parseCsv(source) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ';') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (quoted) throw Error('CSV : guillemet non fermé')
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}
function sql(value) { return value === '' ? 'null' : `'${value.replaceAll("'", "''")}'` }

const args = process.argv.slice(2)
if (!['--check', '--sql-out'].includes(args[0]) || (args[0] === '--check' && args.length !== 2) || (args[0] === '--sql-out' && args.length !== 3)) {
  throw Error('Usage : node scripts/prepare-catalogue-import.mjs --check <csv> | --sql-out <csv> <fichier.sql hors dépôt>')
}
const csvPath = resolve(args[1])
const outPath = args[2] && resolve(args[2])
if (outPath) {
  const rel = relative(repo, outPath)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw Error('Le SQL contenant des données client doit rester hors du dépôt')
}
const bytes = await readFile(csvPath)
const hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== EXPECTED_HASH) throw Error(`Empreinte CSV inattendue : ${hash}`)
const [header, ...data] = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''))
if (JSON.stringify(header) !== JSON.stringify(HEADERS)) throw Error('En-tête CSV inattendue ou colonne de quantité présente')
if (data.length !== 38 || data.some(row => row.length !== HEADERS.length)) throw Error('Le CSV doit contenir exactement 38 lignes et 14 colonnes')
const products = data.map(row => Object.fromEntries(HEADERS.map((name, i) => [name, row[i].trim()])))
const ids = new Set()
const counts = Object.fromEntries(Object.keys(REQUIRED_COUNTS).map(key => [key, 0]))
for (const product of products) {
  if (!/^PROD-\d{4}$/.test(product.id_interne) || ids.has(product.id_interne)) throw Error(`Référence absente, invalide ou répétée : ${product.id_interne}`)
  ids.add(product.id_interne)
  if (!product.designation || !(product.categorie in counts)) throw Error(`Désignation ou catégorie invalide : ${product.id_interne}`)
  if (!/^\d+$/.test(product.seuil_critique)) throw Error(`Seuil invalide : ${product.id_interne}`)
  if (!['Validé','À compléter','À identifier'].includes(product.statut_validation)) throw Error(`Statut invalide : ${product.id_interne}`)
  counts[product.categorie]++
}
if (JSON.stringify(counts) !== JSON.stringify(REQUIRED_COUNTS)) throw Error('Répartition des quatre catégories inattendue')
console.log(`CSV vérifié : ${products.length} produits distincts ; catégories ${JSON.stringify(counts)} ; SHA-256 ${hash}`)
if (args[0] === '--check') process.exit(0)

const columns = [...HEADERS, 'debit_rule']
const values = products.map(p => {
  const rule = p.categorie === 'Visserie' ? 'boite_vide' : p.unite.toLowerCase().startsWith('cartouche') ? 'prise_confirmee' : 'manuel'
  return `  (${[...HEADERS.map(h => h === 'seuil_critique' ? p[h] : sql(p[h])), sql(rule)].join(', ')})`
}).join(',\n')
const matchColumns = HEADERS.filter(h => h !== 'categorie')
const unchanged = matchColumns.map(h => h === 'seuil_critique'
  ? `p.${h} = s.${h}::integer`
  : `p.${h} is not distinct from nullif(s.${h}, '')`).join(' and\n      ')
const statement = `-- Données client confidentielles. Ne pas publier. Projet cible : dkfwiaulbapfbbrslavy uniquement.\n-- Exécuter après audit et migration du schéma. Aucun stock ni mouvement n'est créé.\nbegin;\ncreate temporary table sb_import_stage (${columns.map(h => `${h} text`).join(', ')}) on commit drop;\ninsert into sb_import_stage (${columns.join(', ')}) values\n${values};\ndo $$ begin\n  if (select count(*) from sb_import_stage) <> 38 or\n     (select count(distinct id_interne) from sb_import_stage) <> 38 then\n    raise exception 'Catalogue attendu : 38 références distinctes';\n  end if;\nend $$;\ninsert into public.sb_categories(name)\nselect distinct categorie from sb_import_stage on conflict (name) do nothing;\ninsert into public.sb_products (${columns.filter(h => h !== 'categorie').join(', ')}, category_id)\nselect ${columns.filter(h => h !== 'categorie').map(h => h === 'seuil_critique' ? 's.seuil_critique::integer' : `s.${h}`).join(', ')}, c.id\nfrom sb_import_stage s join public.sb_categories c on c.name = s.categorie\non conflict (id_interne) do nothing;\ndo $$ begin\n  if (select count(*) from public.sb_products p join sb_import_stage s on s.id_interne = p.id_interne and s.designation = p.designation) <> 38 then\n    raise exception 'Import incomplet ou référence préexistante avec désignation différente';\n  end if;\nend $$;\ncommit;\n-- Vérification après exécution :\n-- select count(*) from public.sb_products where id_interne between 'PROD-0001' and 'PROD-0038';\n-- select count(*) from public.sb_stock_movements;\n`
const verifiedStatement = statement.replace(
  's.id_interne = p.id_interne and s.designation = p.designation',
  `s.id_interne = p.id_interne and\n      ${unchanged} and\n      p.debit_rule = s.debit_rule and\n      p.category_id = (select id from public.sb_categories where name = s.categorie)`
)
await writeFile(outPath, verifiedStatement, { flag: 'wx', mode: 0o600 })
console.log(`SQL confidentiel créé hors dépôt : ${outPath}`)
