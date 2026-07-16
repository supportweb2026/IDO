import { useEffect, useRef, useState } from 'react'
import { AGENTS, AGENT_MAP, type AgentId } from './agents'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const LS_KEY = (a: AgentId) => `jarvis-chat:${a}`

export default function App() {
  const [active, setActive] = useState<AgentId>('manager')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Charger l'historique de l'agent actif
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(active))
      setMessages(raw ? (JSON.parse(raw) as Msg[]) : [])
    } catch {
      setMessages([])
    }
  }, [active])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    localStorage.setItem(LS_KEY(active), JSON.stringify(next))
    setInput('')
    setBusy(true)

    // Placeholder assistant pendant le stream
    const assistantMsg: Msg = { role: 'assistant', content: '' }
    setMessages([...next, assistantMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: active, messages: next }),
      })
      if (!res.body) throw new Error('Pas de flux')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages([...next, { role: 'assistant', content: acc }])
      }
      // Persister
      const finalMsgs = [...next, { role: 'assistant' as const, content: acc }]
      localStorage.setItem(LS_KEY(active), JSON.stringify(finalMsgs))
    } catch (e: any) {
      const err = [...next, { role: 'assistant' as const, content: '⚠️ Erreur: ' + e.message }]
      setMessages(err)
      localStorage.setItem(LS_KEY(active), JSON.stringify(err))
    } finally {
      setBusy(false)
    }
  }

  function clearChat() {
    localStorage.removeItem(LS_KEY(active))
    setMessages([])
  }

  const a = AGENT_MAP[active]

  return (
    <div className="flex h-full">
      {/* Sidebar agents */}
      <aside className="w-64 shrink-0 border-r border-edge bg-panel flex flex-col">
        <div className="p-4 border-b border-edge">
          <div className="text-lg font-bold tracking-tight">🏢 Jarvis AI</div>
          <div className="text-xs text-slate-400">Entreprise IA · {AGENTS.length} agents</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {AGENTS.map((ag) => {
            const sel = ag.id === active
            return (
              <button
                key={ag.id}
                onClick={() => setActive(ag.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition flex items-start gap-3 ${
                  sel ? 'bg-edge' : 'hover:bg-edge/50'
                }`}
                style={sel ? { boxShadow: `inset 3px 0 0 ${ag.color}` } : undefined}
              >
                <span className="text-xl leading-none">{ag.emoji}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-sm">{ag.name}</span>
                  <span className="block text-xs text-slate-400 truncate">{ag.role}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <div className="p-3 border-t border-edge">
          <div className="text-xs text-slate-500">Déployé sur Cloudflare · Workers AI</div>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="p-4 border-b border-edge flex items-center gap-3">
          <span className="text-2xl">{a.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold" style={{ color: a.color }}>
              {a.name}
            </div>
            <div className="text-xs text-slate-400">{a.blurb}</div>
          </div>
          <button
            onClick={clearChat}
            className="text-xs px-3 py-1.5 rounded-md border border-edge hover:bg-edge text-slate-300"
          >
            Effacer
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-slate-500 text-sm">
              Salut, je suis <b style={{ color: a.color }}>{a.name}</b>. {a.blurb}. Pose-moi une
              question sur tes repos GitHub (org <code>supportweb2026</code>) ou demande-moi une
              tâche.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-sky-600 text-white'
                    : 'bg-panel border border-edge'
                }`}
              >
                {m.content || (busy && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
        </div>

        <footer className="p-3 border-t border-edge">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={`Discuter avec ${a.name}…`}
              className="flex-1 bg-panel border border-edge rounded-xl px-4 py-2.5 text-sm outline-none focus:border-sky-500"
            />
            <button
              onClick={send}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-semibold"
            >
              {busy ? '…' : 'Envoyer'}
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}
