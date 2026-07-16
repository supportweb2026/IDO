// Route Vercel (Node) — /api/chat
// Remplace la Pages Function pour un déploiement sur Vercel.
// LLM : API REST Cloudflare Workers AI (on appelle l'endpoint /ai/run depuis Vercel).
// Token GitHub : variable d'env VERCEL GITHUB_TOKEN (jamais dans le code).

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ORG = 'supportweb2026'
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || ''
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''

const SYSTEM_PROMPTS: Record<string, string> = {
  jarvis: `Tu es JARVIS, le PDG (CEO) de l'entreprise IA qui gère TOUS les repos de l'org GitHub "${ORG}".
Stack commune : projets Lovable = Vite/React/TypeScript/TanStack Query/Supabase/Tailwind/shadcn-ui. Certains repos sont en Go/JavaScript (listmonk, Miracle-DGS).
Tu as une vision GLOBALE et TRANSVERSALE : tu connais l'état de chaque projet, tu identifies les dépendances, les doublons, les risques, et tu décides quelle équipe (Manager/LeadDev/Dev/DevOps/Security) agit sur quel repo.
Utilise tes outils GitHub pour vérifier l'état réel (liste des repos, PR, lecture de fichiers) avant de trancher.
Quand l'utilisateur donne une mission globale, réponds en français avec : (1) diagnostic cross-repos, (2) décision/plan d'action, (3) quels agents mobiliser et sur quels repos. Tu es le chef ; tu ne fais pas le travail des devs, tu l'orchestres.`,
  manager: `Tu es le Manager de l'entreprise IA Jarvis. Tu gères l'org GitHub "${ORG}" (projets Lovable : Vite/React/TS/TanStack Query/Supabase/Tailwind).
Tu ne codes pas toi-même : tu planifies, découpes les tâches, priorises, et orientes les autres agents. Utilise tes outils GitHub pour vérifier l'état réel. Réponds en français, ton pro, synthétique.`,
  leaddev: `Tu es le LeadDev de l'entreprise IA Jarvis. Stack cible : Vite5/React18/TypeScript/TanStack Query v5/Supabase/shadcn-ui/Tailwind3.
Tu fais la revue d'architecture, définis les conventions et la code review. Utilise tes outils GitHub pour lire les fichiers réels. Ne committe pas toi-même ; propose du code et des standards. Réponds en français, technique et précis.`,
  dev: `Tu es un Développeur de l'entreprise IA Jarvis. Stack : Vite/React/TS/TanStack Query/Supabase/Tailwind/shadcn-ui.
Tu implémentes les features et corriges les bugs sur l'org "${ORG}". Utilise les outils GitHub pour lire le code, créer des branches, ouvrir des PR et créer des issues. Réponds en français, concret, avec du code.`,
  devops: `Tu es le DevOps de l'entreprise IA Jarvis. Tu gères le CI/CD des repos de l'org "${ORG}" (GitHub Actions), les secrets GitHub et le déploiement (Vercel/Cloudflare/Netlify/Hostinger).
Utilise tes outils pour lister/inspecter les workflows, créer des issues de config, documenter les commandes de déploiement. Réponds en français, orienté fiabilité.`,
  security: `Tu es le Security Engineer de l'entreprise IA Jarvis. Tu audites les repos de l'org "${ORG}" : secrets hardcodés, dépendances vulnérables (npm audit), règles RLS Supabase, exposition de clés anon vs service_role, injections dans edge functions.
Utilise tes outils GitHub pour inspecter les fichiers réels (.env, package.json, supabase/). NE révèle jamais la valeur brute d'un secret ; dis "PRÉSENT" et donne le NOM de la variable. Réponds en français, classé (critique/haut/moyen/faible).`,
}

type ToolResult = string

async function gh(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.github.com/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) return { error: `${res.status} ${text.slice(0, 300)}` }
  try { return JSON.parse(text) } catch { return text }
}

const TOOLS = [
  { type: 'function', function: { name: 'list_repos', description: 'Liste les repos accessibles au token dans l’org supportweb2026.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_repo', description: 'Infos d’un repo.', parameters: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] } } },
  { type: 'function', function: { name: 'list_prs', description: 'Liste les PR d’un repo.', parameters: { type: 'object', properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' } }, required: ['repo'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Lit un fichier d’un repo.', parameters: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string' } }, required: ['repo', 'path'] } } },
  { type: 'function', function: { name: 'create_issue', description: 'Crée une issue GitHub.', parameters: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['repo', 'title'] } } },
]

async function runTool(name: string, args: any, token: string): Promise<string> {
  try {
    if (name === 'list_repos') {
      const d = await gh(`orgs/${ORG}/repos?per_page=100`, token)
      if (Array.isArray(d)) return d.map((r) => `${r.full_name} | ${r.private ? 'privé' : 'public'} | ${r.language} | maj:${r.pushed_at?.slice(0, 10)}`).join('\n')
      return JSON.stringify(d)
    }
    if (name === 'get_repo') return JSON.stringify(await gh(`repos/${ORG}/${args.repo}`, token), null, 2)
    if (name === 'list_prs') {
      const d = await gh(`repos/${ORG}/${args.repo}/pulls?state=${args.state || 'open'}`, token)
      if (Array.isArray(d)) return d.map((p) => `#${p.number} ${p.title} (${p.state}) par ${p.user?.login}`).join('\n') || 'aucune PR'
      return JSON.stringify(d)
    }
    if (name === 'read_file') {
      const ref = args.ref || 'main'
      const d = await gh(`repos/${ORG}/${args.repo}/contents/${encodeURIComponent(args.path)}?ref=${ref}`, token)
      if (d?.content) {
        const bin = atob(d.content.replace(/\s/g, ''))
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
        return new TextDecoder().decode(bytes).slice(0, 8000)
      }
      return JSON.stringify(d)
    }
    if (name === 'create_issue') {
      const d = await gh(`repos/${ORG}/${args.repo}/issues`, token, { method: 'POST', body: JSON.stringify({ title: args.title, body: args.body || '' }) })
      return d?.html_url ? `Issue créée: ${d.html_url}` : JSON.stringify(d)
    }
  } catch (e: any) { return 'ERREUR OUTIL: ' + e.message }
  return 'outil inconnu'
}

// Appel Cloudflare Workers AI via REST (depuis Vercel)
async function runAI(messages: any[], tools: any[], stream: boolean) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.3-70b-instruct`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, tools, tool_choice: 'auto', max_tokens: stream ? 1500 : 1024, stream }),
    },
  )
  return res
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  const ghToken = process.env.GITHUB_TOKEN || ''
  const { agent = 'jarvis', messages = [] } = req.body || {}
  const sys = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.jarvis
  const full = [{ role: 'system', content: sys }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))]

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const write = (s: string) => res.write(s)

  try {
    // 1) Décision outils (non streamé)
    const r1 = await runAI(full, TOOLS, false)
    const j1 = await r1.json()
    const toolCalls = j1?.result?.response?.tool_calls || j1?.result?.tool_calls
    let working = full
    if (Array.isArray(toolCalls) && toolCalls.length) {
      write('[outils GitHub] ')
      for (const tc of toolCalls) {
        const fn = tc.function || tc
        const an = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : fn.arguments || {}
        write(`▸ ${fn.name} `)
        const out = await runTool(fn.name, an, ghToken)
        working.push({ role: 'assistant', content: '', tool_calls: toolCalls })
        working.push({ role: 'tool', name: fn.name, content: out })
      }
      write('\n\n')
    }
    // 2) Réponse finale (streamée)
    const r2 = await runAI(working, [], true)
    if (!r2.body) { write('⚠️ Pas de flux du modèle'); return res.end() }
    const reader = r2.body.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = dec.decode(value, { stream: true })
      // Cloudflare stream renvoie des JSON lines {"response": "..."}
      for (const line of chunk.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          const o = JSON.parse(t)
          if (o.response) write(o.response)
        } catch { /* buffer partiel */ }
      }
    }
  } catch (e: any) {
    write('\n⚠️ Erreur backend: ' + e.message)
  } finally {
    res.end()
  }
}
