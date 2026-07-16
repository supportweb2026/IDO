// Définition partagée des agents (front + back).
// Les prompts système complets vivent côté serveur (functions/api/chat.ts)
// pour ne pas les exposer au client.

export type AgentId = 'jarvis' | 'manager' | 'leaddev' | 'dev' | 'devops' | 'security'

export interface Agent {
  id: AgentId
  name: string
  emoji: string
  role: string
  blurb: string
  color: string // tailwind-ish hex pour l'accent
}

export const AGENTS: Agent[] = [
  {
    id: 'jarvis',
    name: 'Jarvis',
    emoji: '🤖',
    role: 'PDG — CEO',
    blurb: 'Vision globale de tous tes repos, décide et orchestre l’équipe.',
    color: '#f59e0b',
  },
  {
    id: 'manager',
    name: 'Manager',
    emoji: '🧭',
    role: 'Chef de projet',
    blurb: 'Roadmap, découpe des tâches et priorisation sur tes repos.',
    color: '#38bdf8',
  },
  {
    id: 'leaddev',
    name: 'LeadDev',
    emoji: '🏗️',
    role: 'Architecte',
    blurb: 'Revue d’architecture, conventions et standards de code.',
    color: '#a78bfa',
  },
  {
    id: 'dev',
    name: 'Dev',
    emoji: '👨‍💻',
    role: 'Développeur',
    blurb: 'Implémente les features, ouvre des PR sur tes repos.',
    color: '#34d399',
  },
  {
    id: 'devops',
    name: 'DevOps',
    emoji: '⚙️',
    role: 'CI / CD',
    blurb: 'Workflows GitHub Actions, secrets, déploiement.',
    color: '#fbbf24',
  },
  {
    id: 'security',
    name: 'Security',
    emoji: '🔐',
    role: 'Sécurité',
    blurb: 'Audit des secrets, dépendances et règles Supabase.',
    color: '#f87171',
  },
]

export const AGENT_MAP: Record<AgentId, Agent> = AGENTS.reduce(
  (acc, a) => ((acc[a.id] = a), acc),
  {} as Record<AgentId, Agent>,
)
