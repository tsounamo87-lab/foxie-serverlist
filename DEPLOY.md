# Déploiement — guide simple

Il y a **2 choses séparées** dans ce dossier. C'est ça qui peut perdre :

```
foxie serverlist/
├── src/  index.html  package.json ...   ← 1) LE SITE (frontend React)
└── server/                              ← 2) LE RELAIS (le "bot", backend Node)
```

| | C'est quoi | Où ça tourne |
|---|---|---|
| **1. Le site** | la page web, les cartes, la map | ton PC (`npm run dev`) ou un hébergeur statique (Netlify/Vercel/Cloudflare Pages) |
| **2. Le relais** | le bot qui rejoint les parties et envoie astéroïdes/stations | **Railway** (un process Node qui tourne 24/7) |

Le site marche **déjà tout seul** sans le relais (positions joueurs via pixelmelt). Le relais ajoute **les vrais astéroïdes + stations**. Tu peux donc déployer le relais quand tu veux, séparément.

---

## Déployer LE RELAIS sur Railway (le seul truc nouveau)

### Étape 1 — préparer le dossier `server/`

```bash
cd server
npm install
# récupérer le générateur d'astéroïdes (à déposer BRUT, aucune modif) :
# macOS / Linux :
curl -o mapGen.js https://starblast.dankdmitron.dev/js/lib/mapGen.js
# Windows PowerShell (curl est un alias, il faut curl.exe) :
curl.exe -o mapGen.js https://starblast.dankdmitron.dev/js/lib/mapGen.js
```

> Jette un œil au `mapGen.js` avant (c'est un générateur de map obfusqué, mais inoffensif — que des maths). Le relais le charge tout seul, tu n'as **rien à éditer**.

### Étape 2 — déployer avec la CLI Railway

```bash
# depuis le dossier server/
npm i -g @railway/cli      # si pas déjà installé
railway login
railway init               # crée un nouveau projet Railway
railway up                 # upload + build + lance ce dossier
```

Railway détecte Node tout seul, fait `npm install` et lance `npm start` (= `node relay.mjs`).

### Étape 3 — récupérer l'URL publique

Dans Railway → ton service → **Settings → Networking → Generate Domain**.
Tu obtiens un truc comme `foxie-relay-production.up.railway.app`.

> Railway injecte automatiquement la variable `PORT`, le relais l'utilise déjà. Rien à configurer.

### Étape 4 — brancher le site sur le relais

Crée un fichier `.env.local` à la **racine** du projet (PAS dans server/) :

```
VITE_RELAY_URL=wss://foxie-relay-production.up.railway.app
```

(`wss://` car Railway est en HTTPS). Relance `npm run dev`, ouvre un serveur live → **astéroïdes + stations réels** 🦊

---

## Vérifier que le relais marche

Ouvre l'URL Railway dans le navigateur → tu dois voir `Foxie relay up`.
Dans les **logs Railway**, au premier `subscribe` tu verras la connexion au jeu. Si le `welcome` a une structure un peu différente, copie-moi les logs et on ajuste.

## (Plus tard) déployer le site aussi

Le site est un build Vite statique :
```bash
npm run build          # génère dist/
```
Dépose `dist/` sur Netlify / Vercel / Cloudflare Pages (gratuit). Pense à y mettre la variable `VITE_RELAY_URL` dans les réglages du build.
