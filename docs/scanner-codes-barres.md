# Scanner — préparation locale

Le scanner lit les codes-barres 1D via la caméra du téléphone ou par saisie manuelle. Il cherche dans le catalogue chargé après Auth et affiche immédiatement la fiche trouvée. Il ne génère aucun QR code interne et ne modifie jamais le stock lors d'une lecture, d'une association ou d'une création. La caméra exige HTTPS sur smartphone ; GitHub Pages le fournit. L'application utilise `@zxing/browser` pour la lecture et libère la caméra dès qu'un code est reconnu ou que Rémy l'arrête. [API officielle ZXing](https://github.com/zxing-js/browser#using-the-api).

La migration `supabase/migrations/20261123000000_scanner_barcode.sql` est **préparée localement, non appliquée à distance**. Avant exécution sur `dkfwiaulbapfbbrslavy`, vérifier les doublons existants :

```sql
select upper(btrim(code_barres)) as code, count(*)
from public.sb_products
where nullif(btrim(code_barres), '') is not null
group by upper(btrim(code_barres))
having count(*) > 1;
```

Le résultat attendu est zéro ligne. L'index unique normalise casse et espaces ; si des doublons existent, la migration échoue sans modifier la base grâce à sa transaction. Les deux fonctions RPC exigent `auth.uid()` et le rôle `admin` actif dans `sb_private.members`. Les rôles `anon`, non habilité et `lecture` sont refusés. Les droits directs d'écriture sur `sb_products` restent révoqués.

Après validation de la migration, vérifier en transaction annulée : association d'un code libre, refus d'un code déjà utilisé, refus de remplacer un code différent sur une fiche, création avec code conservé, `quantite_stock is null`, `inventoried_at is null`, aucun mouvement supplémentaire ; puis `rollback`. Contrôler aussi le refus pour un compte non administrateur. Activer ensuite `VITE_SCANNER_WRITES_ENABLED=true` dans une version de test seulement après ces contrôles. Le workflow GitHub Pages le maintient actuellement à `false` : lecture et saisie manuelle visibles, association et création désactivées.

Les nouveaux produits reçoivent une référence `PROD-xxxx`, la catégorie sélectionnée, un seuil critique saisi et la règle de débit choisie. Leur statut de validation est `À compléter`. L'inventaire initial reste une opération séparée, confirmée et historisée par `sb_record_stock_movement`.
