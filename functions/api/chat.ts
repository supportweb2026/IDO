// Cloudflare Pages Function — /api/chat
// Utilise Workers AI (LLM) + un petit set d'outils GitHub réels.
// Le token GitHub vient du SECRET Cloudflare GITHUB_TOKEN (jamais dans le code).

interface Env {
  AI: any
  GITHUB_TOKEN: string
}

const ORG = 'supportweb2026'

const SYSTEM_PROMPTS: Record<string, string> = {
  jarvis: `Tu es JARVIS, le PDG (CEO) de l'entreprise IA qui gère TOUS les repos de l'org GitHub "${ORG}" (${ORG}/survey-quest-sync, secret-story-scroll, wp-sync-studio, militant-frame-capture, lancelot-your-personal-concierge, ecoute-client, gabonaise-des-jeux, gabon-dj, candl-collective-intentions, GabonCoin, reforge-miracle-dgs, Miracle-DGS, listmonk, moov-africa-newsletter-sign-up, IDO).
Stack commune : projets Lovable = Vite/React/TypeScript/TanStack Query/Supabase/Tailwind/shadcn-ui. Certains repos sont en Go/JavaScript (listmonk, Miracle-DGS).
Tu as une vision GLOBALE et TRANSVERSALE : tu connais l'état de chaque projet, tu identifies les dépendances, les doublons, les risques, et tu décides quelle équipe (Manager/LeadDev/Dev/DevOps/Security) agit sur quel repo.
Utilise tes outils GitHub pour vérifier l'état réel (liste des repos, PR, lecture de fichiers) avant de trancher.
Quand l'utilisateur donne une mission globale, réponds en français avec : (1) diagnostic cross-repos, (2) décision/plan d'action, (3) quels agents mobiliser et sur quels repos. Tu es le chef ; tu ne fais pas le travail des devs, tu l'orchestres.`,
  manager: `Tu es le Manager de l'entreprise IA Jarvis. Tu gères l'org GitHub "${ORG}" (projets Lovable : Vite/React/TS/TanStack Query/Supabase/Tailwind).
Tu ne codes pas toi-même : tu planifies, découpes les tâches, priorises, et orientes les autres agents (LeadDev, Dev, DevOps, Security).
Quand l'utilisateur demande une mission, propose une roadmap claire en markdown avec checkboxes et assignation. Utilise tes outils GitHub pour vérifier l'état réel des repos avant de répondre. Réponds en français, ton pro, synthétique.`,

  leaddev: `Tu es le LeadDev de l'entreprise IA Jarvis. Stack cible : Vite5/React18/TypeScript/TanStack Query v5/Supabase/shadcn-ui/Tailwind3.
Tu fais la revue d'architecture, définis les conventions (nommage, structure de dossiers, patterns de hooks, gestion d'erreur Supabase) et la code review.
Utilise tes outils GitHub pour lire les fichiers/dossiers réels des repos avant de juger. Ne committe pas toi-même ; propose du code et des standards. Réponds en français, technique et précis.`,

  dev: `Tu es un Développeur de l'entreprise IA Jarvis. Stack : Vite/React/TS/TanStack Query/Supabase/Tailwind/shadcn-ui.
Tu implémentes les features et corriges les bugs sur les repos de l'org "${ORG}". Utilise les outils GitHub pour lire le code existant, créer des branches, ouvrir des PR et créer des issues.
Quand tu proposes du code, donne des snippets complets et conformes aux patterns du repo. Réponds en français, concret, avec du code.`,

  devops: `Tu es le DevOps de l'entreprise IA Jarvis. Tu gères le CI/CD des repos de l'org "${ORG}" (GitHub Actions), les secrets GitHub, et le déploiement (Cloudflare/Vercel/Netlify/Hostinger).
Utilise tes outils pour lister/inspecter les workflows, créer des issues de config, et documenter les commandes de déploiement. Réponds en français, orienté fiabilité et automatisation.`,

  security: `Tu es le Security Engineer de l'entreprise IA Jarvis. Tu audites les repos de l'org "${ORG}" : secrets hardcodés, dépendances vulnérables (npm audit), règles RLS Supabase, exposition de clés anon vs service_role, injections dans edge functions.
Utilise tes outils GitHub pour inspecter les fichiers réels (.env, package.json, supabase/). NE révèle jamais la valeur brute d'un secret ; dis "PRÉSENT" et donne le NOM de la variable. Propose des remédiations concrètes. Réponds en français, classé (critique/haut/moyen/faible).`,
}

// ---------- Outils GitHub ----------
type ToolResult = { name: string; content: string }

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
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_repos',
      description: 'Liste les repos accessibles au token dans l’org supportweb2026 (nom, privé/public, langage, dernière maj).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_repo',
      description: 'Récupère les infos d’un repo (description, branche par défaut, langage).',
      parameters: {
        type: 'object',
        properties: { repo: { type: 'string', description: 'ex: survey-quest-sync' } },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_prs',
      description: 'Liste les pull requests d’un repo.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lit le contenu d’un fichier d’un repo (utile pour .env, package.json, etc.).',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string', description: 'chemin du fichier ex: package.json' },
          ref: { type: 'string', description: 'branche (défaut: main)' },
        },
        required: ['repo', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_issue',
      description: 'Crée une issue GitHub sur un repo.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['repo', 'title'],
      },
    },
  },
]

async function runTool(name: string, args: any, token: string): Promise<string> {
  try {
    if (name === 'list_repos') {
      const d = await gh(`orgs/${ORG}/repos?per_page=100`, token)
      if (Array.isArray(d))
        return d.map((r) => `${r.full_name} | ${r.private ? 'privé' : 'public'} | ${r.language} | maj:${r.pushed_at?.slice(0, 10)}`).join('\n')
      return JSON.stringify(d)
    }
    if (name === 'get_repo') {
      return JSON.stringify(await gh(`repos/${ORG}/${args.repo}`, token), null, 2)
    }
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
      const d = await gh(`repos/${ORG}/${args.repo}/issues`, token, {
        method: 'POST',
        body: JSON.stringify({ title: args.title, body: args.body || '' }),
      })
      return d?.html_url ? `Issue créée: ${d.html_url}` : JSON.stringify(d)
    }
  } catch (e: any) {
    return 'ERREUR OUTIL: ' + e.message
  }
  return 'outil inconnu'
}

// ---------- Pipeline ----------
export const onRequestPost = async (ctx: { request: Request; env: Env }) => {
  const { request, env } = ctx
  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response('JSON invalide', { status: 400 })
  }
  const agent: string = body.agent || 'manager'
  const messages: { role: string; content: string }[] = body.messages || []
  const sys = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.manager

  const full: any[] = [{ role: 'system', content: sys }, ...messages.map((m) => ({ role: m.role, content: m.content }))]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(encoder.encode(s))
      try {
        // 1) Appel non-streamé avec outils pour décider des actions
        const first: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
          messages: full,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 1024,
          stream: false,
        })
        let working = full
        const toolCalls = first?.response?.tool_calls || first?.tool_calls
        if (Array.isArray(toolCalls) && toolCalls.length) {
          push('[outils GitHub] ')
          for (const tc of toolCalls) {
            const fn = tc.function || tc
            const an = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : fn.arguments || {}
            push(`▸ ${fn.name} `)
            const res = await runTool(fn.name, an, env.GITHUB_TOKEN)
            working.push({ role: 'assistant', content: '', tool_calls: toolCalls })
            working.push({ role: 'tool', name: fn.name, content: res })
          }
          push('\n\n')
        }
        // 2) Réponse finale streamée
        const out: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
          messages: working,
          max_tokens: 1500,
          stream: true,
          temperature: 0.6,
        })
        if (out?.response) {
          for await (const chunk of out) {
            const t = chunk?.response ?? chunk?.token?.text ?? ''
            if (t) push(t)
          }
        } else if (typeof out === 'string') {
          push(out)
        }
      } catch (e: any) {
        push('\n⚠️ Erreur backend: ' + e.message)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const onRequestOptions = async () =>
  new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
