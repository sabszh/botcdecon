import React from 'react'
import { fetchJson } from '../lib/api'

type SessionSummary = {
  sessionId: string
  startedAt: string
  lastActivityAt: string
  language: string
  userName: string
  userLocation?: string | null
  turnCount: number
  lastUserMessage: string
  lastBotMessage: string
}

type SessionTurn = {
  id: number
  createdAt: string
  mode: string
  language: string
  userMessage: string
  botMessage: string
  error?: string | null
  continuousData?: Record<string, unknown> | null
}

type SessionDetail = {
  session: SessionSummary
  turns: SessionTurn[]
}

function fmtDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

function getInteractionLabel(turn: SessionTurn): string {
  const mode = (turn.mode || '').toLowerCase()
  const stage = turn.continuousData && typeof turn.continuousData === 'object'
    ? (turn.continuousData.returnPromptStage as string | undefined)
    : undefined

  if (mode === 'memory') return 'Memory'
  if (mode === 'question') return 'Question'

  if (mode === 'system') {
    if (stage === 'asked' || stage === 'answered') return 'Where We Are Going'
    return 'System'
  }

  return mode ? `${mode.charAt(0).toUpperCase()}${mode.slice(1)}` : 'Interaction'
}

function getInteractionBadgeClasses(turn: SessionTurn): string {
  const mode = (turn.mode || '').toLowerCase()
  const stage = turn.continuousData && typeof turn.continuousData === 'object'
    ? (turn.continuousData.returnPromptStage as string | undefined)
    : undefined

  if (mode === 'memory') return 'bg-sky-100 text-sky-800'
  if (mode === 'question') return 'bg-emerald-100 text-emerald-800'
  if (mode === 'system' && (stage === 'asked' || stage === 'answered')) return 'bg-amber-100 text-amber-800'
  if (mode === 'system') return 'bg-slate-200 text-slate-700'
  return 'bg-zinc-200 text-zinc-700'
}

export default function AdminPage() {
  const [sessions, setSessions] = React.useState<SessionSummary[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<SessionDetail | null>(null)
  const [query, setQuery] = React.useState('')
  const [language, setLanguage] = React.useState<'all' | 'da' | 'en'>('all')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [appliedLanguage, setAppliedLanguage] = React.useState<'all' | 'da' | 'en'>('all')
  const [limit] = React.useState(50)
  const [offset, setOffset] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [isLoadingList, setIsLoadingList] = React.useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false)
  const [listError, setListError] = React.useState<string | null>(null)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [turnOrder, setTurnOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null)

  const loadSessions = React.useCallback(async (
    nextOffset: number,
    replace: boolean,
    nextQuery: string = appliedQuery,
    nextLanguage: 'all' | 'da' | 'en' = appliedLanguage
  ) => {
    setIsLoadingList(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(nextOffset)
      })
      if (nextQuery.trim()) params.set('q', nextQuery.trim())
      if (nextLanguage !== 'all') params.set('language', nextLanguage)
      const data = await fetchJson<{ items: SessionSummary[]; total: number }>(`/api/admin/chat-sessions?${params.toString()}`)
      setSessions((current) => replace ? data.items : [...current, ...data.items])
      setTotal(data.total)
      setOffset(nextOffset)
      if (data.items[0]) {
        setSelectedId((current) => current || data.items[0].sessionId)
      }
    } catch (err) {
      setListError((err as Error)?.message || 'Failed to load sessions.')
    } finally {
      setIsLoadingList(false)
    }
  }, [appliedLanguage, appliedQuery, limit])

  const loadDetail = React.useCallback(async (sessionId: string) => {
    setIsLoadingDetail(true)
    setDetailError(null)
    try {
      const data = await fetchJson<SessionDetail>(`/api/admin/chat-sessions/${encodeURIComponent(sessionId)}`)
      setDetail(data)
    } catch (err) {
      setDetailError((err as Error)?.message || 'Failed to load transcript.')
      setDetail(null)
    } finally {
      setIsLoadingDetail(false)
    }
  }, [])

  React.useEffect(() => {
    loadSessions(0, true)
  }, [loadSessions])

  React.useEffect(() => {
    if (!selectedId) return
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const canLoadMore = sessions.length < total
  const displayedTurns = React.useMemo(() => {
    if (!detail?.turns) return []
    const turns = [...detail.turns]
    if (turnOrder === 'newest') {
      turns.sort((a, b) => b.id - a.id)
    } else {
      turns.sort((a, b) => a.id - b.id)
    }
    return turns
  }, [detail?.turns, turnOrder])

  const copyJson = React.useCallback(async (label: string, value: unknown) => {
    setCopyStatus(null)
    try {
      await copyTextToClipboard(toPrettyJson(value))
      setCopyStatus(`${label} copied`)
      window.setTimeout(() => {
        setCopyStatus((current) => current === `${label} copied` ? null : current)
      }, 2500)
    } catch (err) {
      setCopyStatus((err as Error)?.message || 'Copy failed')
    }
  }, [])

  return (
    <div className='min-h-screen bg-black/10 text-black'>
      <div className='mx-auto flex max-w-[1500px] gap-6 p-6' style={{ height: '100vh' }}>
        <aside className='surface-card flex w-[420px] shrink-0 flex-col rounded-[2rem] p-5 overflow-hidden'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-medium tracking-[0.08em]'>Admin</h1>
              <p className='text-sm text-black/65'>Chat history</p>
            </div>
            <a href='/' className='surface-pill rounded-full px-4 py-2 text-sm text-black transition hover:bg-white'>
              Back to app
            </a>
          </div>

          <div className='mb-4 flex flex-col gap-3'>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search session id, visitor, location, or text'
              className='surface-bubble rounded-2xl px-4 py-3 outline-none'
            />
            <div className='flex items-center gap-3'>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'all' | 'da' | 'en')}
                className='surface-pill rounded-full px-4 py-3 outline-none'
              >
                <option value='all'>All languages</option>
                <option value='da'>Dansk</option>
                <option value='en'>English</option>
              </select>
              <button
                type='button'
                onClick={() => {
                  const nextQuery = query
                  const nextLanguage = language
                  setAppliedQuery(nextQuery)
                  setAppliedLanguage(nextLanguage)
                  setSessions([])
                  setDetail(null)
                  setSelectedId(null)
                  loadSessions(0, true, nextQuery, nextLanguage)
                }}
                className='surface-pill rounded-full px-4 py-3 text-sm transition hover:bg-white'
              >
                Refresh
              </button>
            </div>
          </div>

          <div className='mb-3 text-sm text-black/60'>
            {total} session{total === 1 ? '' : 's'}
          </div>

          <div className='mb-3 text-xs text-black/50'>
            Ordered by last activity (newest first)
          </div>

          <div className='flex-1 overflow-y-auto pr-1'>
            {listError && (
              <div className='surface-bubble mb-3 rounded-2xl p-4 text-sm text-red-700'>
                {listError}
              </div>
            )}

            <div className='flex flex-col gap-3'>
              {sessions.map((session) => {
                const active = session.sessionId === selectedId
                return (
                  <button
                    key={session.sessionId}
                    type='button'
                    onClick={() => setSelectedId(session.sessionId)}
                    className={`surface-bubble rounded-[1.5rem] p-4 text-left transition ${active ? 'ring-2 ring-black/40' : 'hover:bg-white'}`}
                  >
                    <div className='mb-2 flex items-center justify-between gap-3'>
                      <div className='truncate text-sm font-medium'>{session.sessionId}</div>
                      <div className='text-xs uppercase tracking-[0.14em] text-black/55'>{session.language}</div>
                    </div>
                    <div className='mb-2 text-xs text-black/55'>
                      {fmtDate(session.lastActivityAt)} · {session.turnCount} turns
                    </div>
                    <div className='mb-1 text-sm text-black/75'>{session.userName}{session.userLocation ? ` · ${session.userLocation}` : ''}</div>
                    <div className='line-clamp-2 text-sm text-black/80'>{session.lastUserMessage || 'No user text'}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className='mt-4'>
            <button
              type='button'
              disabled={!canLoadMore || isLoadingList}
              onClick={() => loadSessions(offset + limit, false)}
              className='surface-pill rounded-full px-4 py-3 text-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isLoadingList ? 'Loading…' : (canLoadMore ? 'Load more' : 'All loaded')}
            </button>
          </div>
        </aside>

        <main className='surface-card flex min-h-0 min-w-0 flex-1 flex-col rounded-[2rem] p-6 overflow-hidden'>
          {!selectedId && !isLoadingList && (
            <div className='m-auto text-center text-black/60'>Select a session to inspect the transcript.</div>
          )}

          {selectedId && (
            <>
              <div className='mb-5 flex items-end justify-between gap-4 border-b border-black/10 pb-4'>
                <div>
                  <h2 className='text-2xl font-medium tracking-[0.05em]'>{detail?.session.sessionId || selectedId}</h2>
                  {detail?.session && (
                    <p className='mt-1 text-sm text-black/60'>
                      Started {fmtDate(detail.session.startedAt)} · Last activity {fmtDate(detail.session.lastActivityAt)} · {detail.session.turnCount} turns
                    </p>
                  )}
                </div>
                {detail?.session && (
                  <div className='text-right text-sm text-black/60'>
                    <div>{detail.session.userName}</div>
                    <div>{detail.session.userLocation || 'Unknown location'}</div>
                    <div className='mt-2 flex flex-wrap items-center justify-end gap-2'>
                      <button
                        type='button'
                        onClick={() => copyJson('Session JSON', detail)}
                        className='surface-pill rounded-full px-3 py-1.5 text-xs text-black transition hover:bg-white'
                      >
                        Copy session JSON
                      </button>
                      <span className='text-xs uppercase tracking-[0.12em] text-black/55'>Turns</span>
                      <select
                        value={turnOrder}
                        onChange={(e) => setTurnOrder(e.target.value as 'newest' | 'oldest')}
                        className='surface-pill rounded-full px-3 py-1.5 text-xs outline-none'
                      >
                        <option value='newest'>Newest first</option>
                        <option value='oldest'>Oldest first</option>
                      </select>
                    </div>
                    {copyStatus && (
                      <div className='mt-2 text-xs text-black/55'>{copyStatus}</div>
                    )}
                  </div>
                )}
              </div>

              {detailError && (
                <div className='surface-bubble mb-4 rounded-2xl p-4 text-sm text-red-700'>
                  {detailError}
                </div>
              )}

              <div className='flex-1 overflow-y-auto'>
                {isLoadingDetail && !detail && (
                  <div className='text-black/60'>Loading transcript…</div>
                )}

                <div className='flex flex-col gap-4'>
                  {displayedTurns.map((turn) => (
                    <section key={turn.id} className='surface-bubble rounded-[1.5rem] p-5'>
                      <div className='mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-black/55'>
                        <div className='flex items-center gap-2'>
                          <span className={`rounded-full px-2.5 py-1 font-semibold tracking-[0.08em] ${getInteractionBadgeClasses(turn)}`}>
                            {getInteractionLabel(turn)}
                          </span>
                        </div>
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            onClick={() => copyJson(`Entry ${turn.id} JSON`, turn)}
                            className='rounded-full bg-white/55 px-2.5 py-1 text-[0.65rem] font-semibold tracking-[0.08em] text-black transition hover:bg-white'
                          >
                            Copy JSON
                          </button>
                          <span>{fmtDate(turn.createdAt)}</span>
                        </div>
                      </div>
                      <div className='grid gap-4 lg:grid-cols-2'>
                        <div>
                          <div className='mb-2 text-xs uppercase tracking-[0.12em] text-black/55'>Visitor</div>
                          <div className='whitespace-pre-wrap text-sm leading-6'>{turn.userMessage}</div>
                        </div>
                        <div>
                          <div className='mb-2 text-xs uppercase tracking-[0.12em] text-black/55'>Bot</div>
                          <div className='whitespace-pre-wrap text-sm leading-6'>{turn.botMessage}</div>
                        </div>
                      </div>
                      {turn.error && (
                        <div className='mt-4 rounded-2xl bg-red-100 px-4 py-3 text-sm text-red-700'>
                          {turn.error}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
