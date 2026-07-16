# Jarvis AI Company

Interface web où tu discutes **directement** avec chacun des agents de ton entreprise IA :
🧭 Manager · 🏗️ LeadDev · 👨‍💻 Dev · ⚙️ DevOps · 🔐 Security.

Chaque agent a sa propre personnalité, son propre système de prompts, et l'accès **réel**
à tes repos GitHub (`supportweb2026`) via des outils (liste de repos, lecture de fichiers,
PR, issues…). Le token GitHub reste dans un **secret Cloudflare**, jamais exposé au client.

## Stack
- **Front** : Vite + React + TypeScript + Tailwind CSS
- **Back** : Cloudflare Pages Functions (`/functions/api/chat.ts`)
- **LLM** : Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct`)
- **Outils** : GitHub REST API (token en secret)

## Déploiement sur Cloudflare Pages

```bash
# 1. Installer les deps
npm install

# 2. Build local (vérifie le type-check)
npm run build

# 3. Connecter le repo GitHub dans le dashboard Cloudflare Pages
#    Build command : npm run build
#    Build output : dist

# 4. Ajouter le secret GitHub (token fine-grained, scope sur supportweb2026)
wrangler pages secret put GITHUB_TOKEN --project-name=jarvis-ai-company
# puis coller le token (ghp_... ou github_pat_...)

# 5. Déployer en CLI (alternative au dashboard)
npm run deploy
```

## Dév local
```bash
npm install
# Front
npm run dev
# Back (Functions) avec Pages dev
npm run pages:dev   # sert dist/ + functions/ sur http://localhost:8788
```

## Notes sécurité
- Le token GitHub doit être **fine-grained**, scoped sur l'org `supportweb2026`,
  avec `Contents`, `Pull requests`, `Issues` en lecture/écriture (pas la création de repo).
- Régénère le token régulièrement et ne le partage jamais en clair.
- L'agent Security ne révèle jamais la valeur brute d'un secret.
