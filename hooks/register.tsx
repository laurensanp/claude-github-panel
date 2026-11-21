import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Detail, Filter, Sub, Tab, View } from '../types'

const PANE = 'github-panel'
const TICK_MS = 2000 // git is polled every tick, GitHub every GH_EVERY ticks
const GH_EVERY = 8
const view = atom({ plugin: 'github-panel', key: 'view' } as const, {
  tab: 'code', dir: '', file: null, filter: 'open', stack: [], sub: 'conversation',
} as View, { shape: 'view-3' })

// --- look ---------------------------------------------------------------------
// GitHub's layout and state colours, Claude Code's accent and warm neutrals.
// Fills are translucent so they read on light and dark themes.

const ACCENT = '#d97757'
// 60/30/10 with an orange accent. Every neutral carries 4% of the orange for warmth
// (warm(x) = 96% x + 4% ORANGE). The accent is kept to a few items on screen: the
// open tab's underline and the unread badges on the tabs.
const ORANGE = '#d77351'
function warm(hex: string): string {
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.96 + parseInt(ORANGE.slice(i, i + 2), 16) * 0.04)
  return '#' + [1, 3, 5].map(i => mix(i).toString(16).padStart(2, '0')).join('') + hex.slice(7)
}
const GREY = warm('#8b949e')
const C = {
  open: '#3fb950', merged: '#a371f7', closed: '#f85149', done: '#a371f7', muted: warm('#9198a1'), // one grey for all secondary text and icons
  surface: `${GREY}1c`, card: `${GREY}1c`, cardMine: `${GREY}2e`, menu: warm('#2a2b2e'),
  edge: `${GREY}2e`, hover: `${GREY}33`, accentBg: `${ORANGE}26`,
  pane: warm('#1c1c1c'), // the 60: the panel's own background, warmed
  text: warm('#e6edf3'), subtle: warm('#9198a1'), icon: warm('#c9ccd1'), folder: warm('#9aa7b4'),
  // A border the eye cannot see: rounded hover tints need a border to be round.
  clear: '#00000000',
}

const svg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body.replaceAll('$C', color)}</svg>`
const ICON: Record<string, string> = {
  issueOpen: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="8" r="1.1" fill="$C"/>',
  issueClosed: '<circle cx="8" cy="8" r="6.25"/><path d="M5.4 8.2l1.8 1.8 3.4-3.7"/>',
  issueSkip: '<circle cx="8" cy="8" r="6.25"/><path d="M4 12L12 4"/>',
  pr: '<circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="12.5" r="1.6"/><path d="M4 5.1v5.8M12 10.9V6.5a2 2 0 0 0-2-2H7.5M9 3l-1.5 1.5L9 6"/>',
  prMerged: '<circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="8.5" r="1.6"/><path d="M4 5.1v5.8M4 5.1c0 2.4 2.2 3.4 6.4 3.4"/>',
  prClosed: '<circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="12.5" r="1.6"/><path d="M4 5.1v5.8M12 10.9V8.5M10.4 3.2l3.2 3.2M13.6 3.2l-3.2 3.2"/>',
  commit: '<circle cx="8" cy="8" r="2.6"/><path d="M1.5 8h3.9M10.6 8h3.9"/>',
  tag: '<path d="M1.75 2.75v4.6l6.9 6.9 5.6-5.6-6.9-6.9H1.75z"/><circle cx="5" cy="5" r="1" fill="$C"/>',
  folder: '<path d="M1.75 3.25h4.2l1.5 1.5h6.8v8H1.75z" fill="$C" fill-opacity=".25"/>',
  file: '<path d="M3.75 1.75h5.2l3.3 3.3v9.2h-8.5zM8.75 1.75v3.5h3.5"/>',
  comment: '<path d="M2 3h12v8H7.2L4 13.5V11H2z"/>',
  book: '<path d="M2 2.75h4.2A1.8 1.8 0 0 1 8 4.55v9.2a1.5 1.5 0 0 0-1.5-1.5H2zM14 2.75H9.8A1.8 1.8 0 0 0 8 4.55v9.2a1.5 1.5 0 0 1 1.5-1.5H14z"/>',
  code: '<path d="M5.5 4L1.75 8l3.75 4M10.5 4l3.75 4-3.75 4"/>',
  back: '<path d="M7 3.5L2.5 8 7 12.5M3 8h10.5"/>',
  upload: '<path d="M3.75 1.75h5.2l3.3 3.3v9.2h-8.5zM8.75 1.75v3.5h3.5M8 12.5V7.5M5.75 9.5L8 7.25l2.25 2.25"/>',
  clipboard: '<path d="M5.5 2.75H4a1.25 1.25 0 0 0-1.25 1.25v9.25A1.25 1.25 0 0 0 4 14.5h8a1.25 1.25 0 0 0 1.25-1.25V4A1.25 1.25 0 0 0 12 2.75h-1.5M6 1.75h4v2H6z"/>',
  pencil: '<path d="M10.75 2.75l2.5 2.5-7.5 7.5H3.25v-2.5z"/>',
  trash: '<path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4.25 4.25l.75 9h6l.75-9"/>',
  close: '<circle cx="8" cy="8" r="6.25"/><path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5"/>',
  link: '<path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2.1-2.1a2.75 2.75 0 0 0-3.9-3.9l-.9.9M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2.1 2.1a2.75 2.75 0 0 0 3.9 3.9l.9-.9"/>',
}

// GitHub's mark (Primer Octicons, MIT).
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#919596" d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.37A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'

type State = { text: string; icon: string; color: string }
const ISSUE_STATE = (s: string, reason?: string): State =>
  s === 'OPEN' ? { text: 'Open', icon: 'issueOpen', color: C.open }
    : reason === 'NOT_PLANNED' ? { text: 'Closed', icon: 'issueSkip', color: C.muted }
      : { text: 'Closed', icon: 'issueClosed', color: C.done }
const PR_STATE = (s: string, draft?: boolean): State =>
  s === 'MERGED' ? { text: 'Merged', icon: 'prMerged', color: C.merged }
    : s === 'CLOSED' ? { text: 'Closed', icon: 'prClosed', color: C.closed }
      : draft ? { text: 'Draft', icon: 'pr', color: C.muted }
        : { text: 'Open', icon: 'pr', color: C.open }

// --- data ---------------------------------------------------------------------

type Repo = {
  url: string; owner: string; name: string; description: string; stars: number; forks: number
  openIssues: number; openPrs: number; releases: number
  activity: Record<string, number> // 'issue#3' -> comments (+ reviews for PRs)
  languages: { name: string; color: string; share: number }[]
}
type Local = { branch: string; changed: number; commits: number; ahead: number; behind: number }
type Row = {
  key: string; title: string; open: Detail; state?: State; icon?: { name: string; color: string }
  id?: string; meta: string; messages?: number; plus?: number; minus?: number
  labels?: { name: string; color: string }[]; seenKey?: string
}
type Entry = { name: string; isDir: boolean }

// The repository the panel shows: the one Claude last worked in ('' = the session's folder).
let repoDir = ''
let repoTop = '' // that repository's top folder, as git prints it
let repoGen = 0 // counts switches: answers fetched before one are thrown away
async function run($: EngineInterface, argv: string[], stdin?: string): Promise<string> {
  const r = await $.process.run(argv, { timeoutMs: 120000, ...(stdin !== undefined ? { stdin } : {}), ...(repoDir ? { cwd: repoDir } : {}) })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim() || `${argv[0]} failed`)
  return r.stdout
}
const json = async ($: EngineInterface, argv: string[]) => JSON.parse(await run($, argv))
const cap = (text: string, n = 80000) => (text.length > n ? text.slice(0, n) + '\n… (cut, too long)' : text)

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (!isFinite(s)) return ''
  for (const [n, unit] of [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']] as const)
    if (s >= n) return `${Math.floor(s / n)}${unit} ago`
  return 'just now'
}
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

const REPO_Q = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
  url owner{login} name description stargazerCount forkCount
  languages(first:6,orderBy:{field:SIZE,direction:DESC}){totalSize edges{size node{name color}}}
  openIssues:issues(states:OPEN){totalCount} openPrs:pullRequests(states:OPEN){totalCount} releases{totalCount}
  issues(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number comments{totalCount}}}
  pullRequests(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number comments{totalCount} reviews{totalCount}}}}}`

async function repoOf($: EngineInterface): Promise<Repo | null> {
  try {
    const r = (await json($, ['gh', 'api', 'graphql', '-F', 'owner={owner}', '-F', 'name={repo}', '-f', `query=${REPO_Q}`])).data.repository
    const activity: Record<string, number> = {}
    for (const i of r.issues.nodes) activity[`issue#${i.number}`] = i.comments.totalCount
    for (const p of r.pullRequests.nodes) activity[`pr#${p.number}`] = p.comments.totalCount + p.reviews.totalCount
    return {
      url: r.url, owner: r.owner.login, name: r.name, description: r.description ?? '', stars: r.stargazerCount, forks: r.forkCount,
      openIssues: r.openIssues.totalCount, openPrs: r.openPrs.totalCount, releases: r.releases.totalCount, activity,
      languages: r.languages.edges.map((l: any) => ({ name: l.node.name, color: l.node.color ?? '#8b949e', share: l.size / Math.max(1, r.languages.totalSize) })),
    }
  } catch {
    return null
  }
}

async function localOf($: EngineInterface): Promise<Local> {
  const [status, count] = await Promise.all([
    run($, ['git', 'status', '--porcelain=v1', '--branch']),
    run($, ['git', 'rev-list', '--count', 'HEAD']).catch(() => '0'),
  ])
  const [head = '', ...files] = status.split('\n').filter(Boolean)
  return {
    branch: head.replace(/^## /, '').split('...')[0] ?? '',
    changed: files.length,
    commits: Number(count.trim()) || 0,
    ahead: Number(head.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(head.match(/behind (\d+)/)?.[1] ?? 0),
  }
}

async function commitsOf($: EngineInterface): Promise<Row[]> {
  const out = await run($, ['git', 'log', '-50', '--format=%h%x09%H%x09%aI%x09%an%x09%s'])
  return out.trim().split('\n').filter(Boolean).map(line => {
    const [short = '', full = '', when = '', who = '', subject = ''] = line.split('\t')
    return { key: full, id: short, title: subject, icon: { name: 'commit', color: C.muted }, open: { kind: 'commit', id: full }, meta: `${who} committed ${ago(when)}` }
  })
}

async function releasesOf($: EngineInterface): Promise<Row[]> {
  const list = await json($, ['gh', 'release', 'list', '-L', '30', '--json', 'tagName,name,publishedAt,isLatest,isDraft,isPrerelease'])
  return list.map((r: any) => ({
    key: r.tagName,
    title: r.name || r.tagName,
    icon: { name: 'tag', color: r.isLatest ? C.open : C.muted },
    state: r.isLatest ? { text: 'Latest', icon: '', color: C.open } : r.isPrerelease ? { text: 'Pre-release', icon: '', color: '#d29922' } : r.isDraft ? { text: 'Draft', icon: '', color: C.muted } : undefined,
    open: { kind: 'release', id: r.tagName },
    meta: `${r.tagName}, published ${ago(r.publishedAt)}`,
  }))
}

async function prsOf($: EngineInterface, filter: Filter): Promise<Row[]> {
  const list = await json($, ['gh', 'pr', 'list', '--state', filter, '-L', '40', '--json', 'number,title,state,isDraft,author,updatedAt,additions,deletions,labels,comments'])
  return list.map((x: any) => {
    const st = PR_STATE(x.state, x.isDraft)
    return {
      key: `pr#${x.number}`, seenKey: `pr#${x.number}`, title: x.title, state: st, icon: { name: st.icon, color: st.color },
      open: { kind: 'pr', id: String(x.number) },
      meta: `#${x.number} opened by ${x.author?.login ?? '?'}, updated ${ago(x.updatedAt)}`,
      messages: x.comments?.length ?? 0, plus: x.additions, minus: x.deletions,
      labels: (x.labels ?? []).map((l: any) => ({ name: l.name, color: `#${l.color}` })),
    }
  })
}

async function issuesOf($: EngineInterface, filter: Filter): Promise<Row[]> {
  const list = await json($, ['gh', 'issue', 'list', '--state', filter, '-L', '40', '--json', 'number,title,state,stateReason,author,updatedAt,labels,comments'])
  return list.map((x: any) => {
    const st = ISSUE_STATE(x.state, x.stateReason)
    return {
      key: `issue#${x.number}`, seenKey: `issue#${x.number}`, title: x.title, state: st, icon: { name: st.icon, color: st.color },
      open: { kind: 'issue', id: String(x.number) },
      meta: `#${x.number} opened by ${x.author?.login ?? '?'}, updated ${ago(x.updatedAt)}`,
      messages: x.comments?.length ?? 0,
      labels: (x.labels ?? []).map((l: any) => ({ name: l.name, color: `#${l.color}` })),
    }
  })
}

async function treeOf($: EngineInterface, dir: string): Promise<Entry[]> {
  const out = await run($, ['git', 'ls-tree', `HEAD:${dir}`])
  return out.trim().split('\n').filter(Boolean).map(line => {
    const [meta = '', name = ''] = line.split('\t')
    return { name, isDir: meta.split(' ')[1] === 'tree' }
  }).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
}

const lastCommitOf = async ($: EngineInterface, path: string) =>
  (await run($, ['git', 'log', '-1', '--format=%h%x09%H%x09%s%x09%an%x09%aI', '--', path || '.'])).trim()
const fileOf = async ($: EngineInterface, path: string) => cap(await run($, ['git', 'show', `HEAD:${path}`]), 60000)

const issueOf = ($: EngineInterface, n: string) =>
  json($, ['gh', 'issue', 'view', n, '--json', 'number,title,state,stateReason,author,body,comments,labels,createdAt,assignees'])
const prOf = ($: EngineInterface, n: string) =>
  json($, ['gh', 'pr', 'view', n, '--json', 'number,title,state,isDraft,author,body,comments,reviews,labels,createdAt,additions,deletions,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,files,commits,reviewDecision,mergedAt,changedFiles'])
const prDiffOf = async ($: EngineInterface, n: string) => cap(await run($, ['gh', 'pr', 'diff', n]))
const releaseOf = ($: EngineInterface, tag: string) =>
  json($, ['gh', 'release', 'view', tag, '--json', 'tagName,name,body,publishedAt,author,assets,isPrerelease,isDraft'])

async function commitOf($: EngineInterface, sha: string) {
  try {
    const head = await run($, ['git', 'show', '-s', '--format=%H%x00%an%x00%aI%x00%B', sha])
    const [full = '', who = '', when = '', message = ''] = head.split('\0')
    const diff = await run($, ['git', 'show', '--format=', '--patch', sha])
    return { sha: full.trim(), who, when, message: message.trim(), diff: cap(diff) }
  } catch {
    // Not in the local clone (a fork's PR commit): ask GitHub.
    const c = await json($, ['gh', 'api', `repos/{owner}/{repo}/commits/${sha}`])
    const diff = await run($, ['gh', 'api', `repos/{owner}/{repo}/commits/${sha}`, '-H', 'Accept: application/vnd.github.diff'])
    return { sha: c.sha, who: c.commit.author.name, when: c.commit.author.date, message: c.commit.message, diff: cap(diff) }
  }
}

const commitCommentsOf = async ($: EngineInterface, sha: string) =>
  (await json($, ['gh', 'api', `repos/{owner}/{repo}/commits/${sha}/comments`]).catch(() => [])) as any[]

/** One unified diff split per file: [path, its hunks]. */
function splitDiff(diff: string): [string, string, number, number][] {
  return diff.split(/^(?=diff --git )/m).filter(Boolean).map(part => {
    const path = part.match(/^diff --git a\/(.+?) b\//)?.[1] ?? 'file'
    const body = part.slice(part.search(/^@@/m) >= 0 ? part.search(/^@@/m) : part.length)
    const plus = (body.match(/^\+(?!\+\+)/gm) ?? []).length
    const minus = (body.match(/^-(?!--)/gm) ?? []).length
    return [path, body, plus, minus]
  })
}

// --- unread -------------------------------------------------------------------
// What you have seen: comments (+ reviews) per issue/PR when you last opened it,
// kept across sessions. The first look at a repo counts everything as seen.

let seen: Record<string, number> | null = null
async function unreadOf($: EngineInterface, repo: Repo | null): Promise<Set<string>> {
  if (!repo) return new Set()
  const scope = `${repo.owner}/${repo.name}`
  if (!seen) seen = ((await $.store.get(`seen:${scope}`)) as Record<string, number> | undefined) ?? {}
  if (!seen.__init) {
    seen = { ...repo.activity, __init: 1 }
    await $.store.set(`seen:${scope}`, seen)
  }
  return new Set(Object.entries(repo.activity).filter(([k, n]) => n > (seen![k] ?? -1)).map(([k]) => k))
}
async function markSeen($: EngineInterface, repo: Repo | null, key: string) {
  if (!repo || !seen || seen[key] === repo.activity[key]) return
  seen = { ...seen, [key]: repo.activity[key] ?? 0 }
  await $.store.set(`seen:${repo.owner}/${repo.name}`, seen)
  $.ui.invalidate('ui.render')
}

// --- comment drafts ---
// Per issue, PR or commit: the text being written, files to attach, and what the
// last send did. Module memory: a reload of the mod starts them over.
type Draft = { text: string; files: string[]; busy?: string; error?: string; note?: string; preview?: boolean; pathField?: boolean; menu?: boolean }
const drafts = new Map<string, Draft>()
const draftOf = (k: string): Draft => drafts.get(k) ?? { text: '', files: [] }
const setDraft = (k: string, patch: Partial<Draft>) => drafts.set(k, { ...draftOf(k), ...patch })
// Small picture previews of attachments, as data URIs (kept per path).
const thumbs = new Map<string, string | null>()

const MEDIA = /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm)$/i
const PICTURE = /\.(png|jpe?g|gif|webp)$/i
const TEXTISH = /\.(txt|log|md|json|ya?ml|toml|ini|cfg|xml|csv|java|kt|kts|gradle|js|ts|tsx|py|glsl|vsh|fsh|sh|ps1|bat|c|h|cpp|rs|go|properties)$/i
// Adds files to a draft: pictures and videos upload with the comment, small text
// files go into the comment as a code block, anything else is explained.
async function addFiles($: EngineInterface, k: string, paths: string[]) {
  const problems: string[] = []
  for (const raw of paths) {
    const path = raw.trim().replace(/^["']|["']$/g, '')
    if (!path) continue
    const st = await $.fs.stat(path).catch(() => null)
    const name = path.split(/[\\/]/).pop() ?? path
    if (!st || st.kind !== 'file') { problems.push(`${name}: no such file`); continue }
    if (MEDIA.test(path)) {
      if (st.size > 100 * 1024 * 1024) { problems.push(`${name}: over GitHub's 100 MB limit`); continue }
      setDraft(k, { files: [...new Set([...draftOf(k).files, path])] })
      if (PICTURE.test(path) && !thumbs.has(path)) {
        thumbs.set(path, null)
        if (st.size < 12 * 1024) {
          const bytes = await $.fs.read(path, { as: 'bytes' }).catch(() => null)
          const ext = path.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg')
          if (bytes) thumbs.set(path, `data:image/${ext};base64,${bytes.base64}`)
        } else {
          thumbs.set(path, await shrinkToDataUri($, path, 160, 16000).catch(() => null))
        }
      }
    } else if (TEXTISH.test(path) && st.size < 60 * 1024) {
      const body = await $.fs.read(path).catch(() => '')
      const lang = path.split('.').pop()!.toLowerCase()
      const fence = '`'.repeat(Math.max(3, ...(body.match(/`+/g) ?? []).map(t => t.length + 1)))
      const cur = draftOf(k).text
      setDraft(k, { text: `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}**${name}**\n${fence}${lang}\n${body.replace(/\n$/, '')}\n${fence}\n`, preview: false })
    } else {
      problems.push(`${name}: GitHub takes pictures, videos and small text files here`)
    }
  }
  setDraft(k, { error: problems.length ? problems.join('. ') + '.' : undefined, note: undefined })
  redraw()
}
// Ctrl+V of a copied path ("Copy as path" in Explorer) becomes an attachment.
// The desktop's field types a line break on Enter and never reports a submit, so a
// single new line break is read as "send"; the watcher reports Ctrl+Enter and
// Shift+Enter, and those keep the line break.
let lastNewlineKey = 0
const senders = new Map<string, () => void>() // comment box -> its send, set while drawn
function enterSends(before: string, t: string): boolean {
  if (t.length !== before.length + 1) return false
  let i = 0
  while (i < before.length && before[i] === t[i]) i++
  return t[i] === '\n' && t.slice(i + 1) === before.slice(i)
}
async function typed($: EngineInterface, k: string, t: string) {
  lastPanelUse = Date.now()
  const before = draftOf(k).text
  setDraft(k, { text: t })
  if (enterSends(before, t)) {
    const typedAt = Date.now()
    // The watcher's report of Ctrl/Shift+Enter can land just after the keystroke.
    $.clock.after(120, () => {
      if (Math.abs(lastNewlineKey - typedAt) < 400) return
      setDraft(k, { text: before })
      if (before.trim() || draftOf(k).files.length) senders.get(k)?.()
      else redraw()
    })
    return
  }
  const added = t.startsWith(before) ? t.slice(before.length).trim() : ''
  const paths = added.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  if (paths.length && paths.every(x => /^"?[A-Za-z]:\\[^"]+"?$/.test(x))) {
    setDraft(k, { text: before })
    await addFiles($, k, paths)
  }
}


// Ctrl+V of a picture in the panel's comment field. The app hands a mod's field only
// text, so a small watcher (started while a comment box is shown) reports Ctrl+V in
// the Claude window together with the clipboard's picture or files. The panel takes
// it only while the panel holds the keyboard, and not when Claude's own message box
// changed right after (that paste was for the chat). Text pastes stay in the field.
const PASTE_WATCH_PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
  "Add-Type 'using System; using System.Runtime.InteropServices; public class K { [DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int k); [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }'",
  '$prevX1 = $false; $prevX2 = $false',
  'function Read-Clip {',
  '  for ($try = 0; $try -lt 4; $try++) {',
  '    try {',
  '      $o = [ordered]@{ files = @(); image = $null }',
  '      $f = [System.Windows.Forms.Clipboard]::GetFileDropList()',
  '      if ($f -and $f.Count) { $o.files = @($f); return $o }',
  '      if ([System.Windows.Forms.Clipboard]::ContainsImage()) {',
  '        $p = Join-Path $env:TEMP ("github-panel-paste-" + [DateTime]::Now.ToString("yyyyMMdd-HHmmss-fff") + ".png")',
  '        $img = [System.Windows.Forms.Clipboard]::GetImage(); $img.Save($p, [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose()',
  '        $o.image = $p; return $o',
  '      }',
  '      return $o',
  '    } catch { Start-Sleep -Milliseconds 60 }',
  '  }',
  '  return $null',
  '}',
  "[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()",
  '$prev = $false; $prevEnter = $false',
  'while ($true) {',
  '  try {',
  '    $down = (([K]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0) -and (([K]::GetAsyncKeyState(0x56) -band 0x8000) -ne 0)',
  '    if ($down -and -not $prev) {',
  '      $id = 0; [void][K]::GetWindowThreadProcessId([K]::GetForegroundWindow(), [ref]$id)',
  "      if ((Get-Process -Id $id).ProcessName -ieq 'claude') {",
  '        $o = Read-Clip',
  "        if ($o -and ($o.files.Count -or $o.image)) { [Console]::Out.WriteLine('PASTE ' + ($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }",
  '      }',
  '    }',
  '    $mod = (([K]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0) -or (([K]::GetAsyncKeyState(0x10) -band 0x8000) -ne 0)',
  '    $enter = (([K]::GetAsyncKeyState(0x0D) -band 0x8000) -ne 0)',
  "    if ($enter -and -not $prevEnter -and $mod) { [Console]::Out.WriteLine('NEWLINE'); [Console]::Out.Flush() }",
  '    $prevEnter = $enter',
  '    $x1 = (([K]::GetAsyncKeyState(0x05) -band 0x8000) -ne 0); $x2 = (([K]::GetAsyncKeyState(0x06) -band 0x8000) -ne 0)',
  '    if (($x1 -and -not $prevX1) -or ($x2 -and -not $prevX2)) {',
  '      $id = 0; [void][K]::GetWindowThreadProcessId([K]::GetForegroundWindow(), [ref]$id)',
  "      if ((Get-Process -Id $id).ProcessName -ieq 'claude') { [Console]::Out.WriteLine($(if ($x1 -and -not $prevX1) { 'BACK' } else { 'FORWARD' })); [Console]::Out.Flush() }",
  '    }',
  '    $prevX1 = $x1; $prevX2 = $x2',
  '    $prev = $down',
  '  } catch { $prev = $false }',
  '  Start-Sleep -Milliseconds 25',
  '}',
].join('\n')
// What /push (and the Push button) asks Claude to do: the way this user ships every
// project (commits, version, push, release, notes), read from their repositories.
const PUSH_STEPS = (dir: string) => `Push all current progress of the repository I am working on${dir ? ` (${dir})` : ''} to GitHub, the way I always do it:

1. Read the repository's CLAUDE.md (and README) first: its "Release"/"Releases" section is the recipe and wins over these steps.
2. \`git status\` and \`git log origin/<branch>..HEAD\`: see everything not yet pushed, in this repository and in nested ones you changed in this session.
3. Commit what is left, in small commits by topic. Message: one plain sentence saying what changed for users, no prefix, no trailing period (like "Frame Generation up to 6x where the driver offers it"). Never commit secrets (.env, tokens, credentials) or build output that is ignored.
4. Version: if the changes need one, bump it where the project keeps it (build.gradle, gradle.properties, package.json, plugin.json...) following semver from the current version (patch: fixes, minor: features, major: breaking; docs/CI only: none). Commit the bump alone as "<Name> <version>" (like "SIRIS 1.3.0"). Say the chosen version and why in one line.
5. Push the branch. If it is not main, tell me and ask whether to merge it into main first.
6. Release, if the project makes releases (tags, GitHub releases, a release workflow, or a Releases list in CLAUDE.md): build, then \`gh release create v<version> <only this project's own files> --title "<Name> <version>" --latest --notes-file <notes>\` with the title as the earlier releases have it, notes saying what changed for users; never attach other projects' files. Where a workflow releases on push to main, the bump is the release: check it ran. Then Modrinth, if the project is there, as its CLAUDE.md says: changelog for players, nothing about building.
7. Update the Releases list in CLAUDE.md (newest first: "- v<version> (<date>): what changed. Modrinth <id>.") and commit it as "CLAUDE.md: <Name> <version> published", then push again.
8. Tell me in a few lines what was pushed, the version, and the release and Modrinth links. If a step was refused or needs me (a payment, a login, a blocked command), stop there and tell me what to do.`
let bandShown = false // the GitHub button above Claude's message box
let unreadTotal = 0 // unread issues and PRs, for that button
let watcher: { stop: () => void } | null = null
let pasteTarget = '' // the comment box on screen, '' when none
let lastPanelUse = 0 // a click, focus or keystroke in the panel
// True while the panel holds the keyboard (the Pane's isFocused). A click into any
// chat box, in this session or another, takes it away: then a paste is not ours.
let paneFocused = false
// Removed pictures stay removed, and one paste reported twice counts once.
const dismissed = new Set<string>()
// Messages being edited or about to be deleted, by message.
const edits = new Map<string, { text: string; confirmDelete?: boolean; busy?: string; error?: string }>()
// The message being edited in the chat box at the bottom (Discord style): its detail's
// comment box key and the message's own key.
let editTarget: { k: string; ek: string } | null = null
let lastPaste = { line: '', at: 0 }
let lastPromptUse = 0 // an edit of Claude's own message box
// Back and forward in the panel, as a browser's: every move (tab, folder, file, item)
// is a step. Set while the panel is drawn.
let navBack = () => {}
let navForward = () => {}
const past: View[] = []
const future: View[] = []
function stopWatcher() { watcher?.stop(); watcher = null }
function ensureWatcher($: EngineInterface) {
  if (watcher) return
  let live = true
  const proc = $.process.spawn({ argv: ['powershell', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', PASTE_WATCH_PS] })
  const me2 = { stop: () => { live = false; void (proc as any).return?.() } }
  watcher = me2
  void (async () => {
    try {
      for await (const { stream, text } of proc) {
        if (!live) break
        if (stream !== 'stdout') continue
        for (const line of text.split(/\r?\n/)) {
          if (line.startsWith('NEWLINE')) { lastNewlineKey = Date.now(); continue }
          // Mouse buttons 4 and 5: back and forward, while the panel has the keyboard.
          if (line.startsWith('BACK')) { if (paneFocused) navBack(); continue }
          if (line.startsWith('FORWARD')) { if (paneFocused) navForward(); continue }
          if (!line.startsWith('PASTE ')) continue
          const at = Date.now()
          const target = pasteTarget
          if (!target || !paneFocused) continue
          if (line === lastPaste.line && at - lastPaste.at < 1500) continue
          lastPaste = { line, at }
          let clip: { files?: string[]; image?: string | null }
          try { clip = JSON.parse(line.slice(6)) } catch { continue }
          const files: string[] = [clip.files ?? []].flat().filter(Boolean)
          const paths = (files.length ? files : clip.image ? [clip.image] : []).filter(f => !dismissed.has(`${target}|${f}`))
          if (!paths.length) continue
          // Wait a moment: a paste into Claude's own box edits it, and then it was not ours.
          $.clock.after(300, () => {
            if (lastPromptUse >= at || pasteTarget !== target || !paneFocused) return
            lastPanelUse = Date.now()
            void addFiles($, target, paths)
          })
        }
      }
    } catch {}
    if (watcher === me2) watcher = null
  })()
}

// Drawn pictures travel inside an SVG, which holds 131072 characters: a picture over
// ~90 KB is scaled down to a JPEG first (longest side `maxSide`), then embedded.
const SHRINK_PS = [
  'Add-Type -AssemblyName System.Drawing',
  '$i = [System.Drawing.Image]::FromFile($env:GP_IN); $ow = $i.Width; $oh = $i.Height',
  '$s = [Math]::Min([double]1, [double]$env:GP_MAX / [Math]::Max($i.Width, $i.Height))',
  '$w = [int][Math]::Max(1, $i.Width * $s); $h = [int][Math]::Max(1, $i.Height * $s)',
  '$b = New-Object System.Drawing.Bitmap $w, $h',
  '$g = [System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode = "HighQualityBicubic"; $g.DrawImage($i, 0, 0, $w, $h)',
  '$c = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }',
  '$p = New-Object System.Drawing.Imaging.EncoderParameters 1',
  '$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$env:GP_Q)',
  '$b.Save($env:GP_OUT, $c, $p); $i.Dispose(); $b.Dispose()',
  'Write-Output "$w $h $ow $oh"',
].join('\n')
type Shrunk = { uri: string; w: number; h: number; ow: number; oh: number }
// `budget`: the most base64 characters one drawn picture may take. The whole pane
// stops redrawing when its pictures add up to too much, so previews stay small.
async function shrinkPicture($: EngineInterface, path: string, maxSide: number, quality = 80, budget = 60000): Promise<Shrunk | null> {
  const steps: [number, number][] = [[maxSide, quality], [Math.round(maxSide * 0.75), quality - 8], [Math.round(maxSide * 0.55), quality - 15],
    [Math.round(maxSide * 0.4), quality - 22], [Math.round(maxSide * 0.25), 50]]
  for (const [side, q] of steps) {
    const out = `${path}.panel-${side}.jpg`
    const r = await $.process.run(['powershell', '-NoProfile', '-Command', SHRINK_PS],
      { env: { GP_IN: path, GP_OUT: out, GP_MAX: String(side), GP_Q: String(q) }, timeoutMs: 30000 })
    if (r.exitCode !== 0) return null
    const [w = 1, h = 1, ow = 1, oh = 1] = r.stdout.trim().split(/\s+/).map(Number)
    const bytes = await $.fs.read(out, { as: 'bytes' }).catch(() => null)
    if (bytes && bytes.base64.length < budget) return { uri: `data:image/jpeg;base64,${bytes.base64}`, w, h, ow, oh }
  }
  return null
}
const shrinkToDataUri = async ($: EngineInterface, path: string, maxSide: number, budget = 60000) => (await shrinkPicture($, path, maxSide, 80, budget))?.uri ?? null

// Pictures attached on GitHub, fetched with the person's gh login (a private repo's
// attachments answer 404 without it). The token reaches curl on stdin, never argv.
const ATTACHED = /(?:!\[([^\]]*)\]\((https:\/\/(?:github\.com\/user-attachments\/assets|private-user-images\.githubusercontent\.com|user-images\.githubusercontent\.com)\/[^)\s]+)\))|(?:<img[^>]*src="(https:\/\/(?:github\.com\/user-attachments\/assets|private-user-images\.githubusercontent\.com|user-images\.githubusercontent\.com)\/[^"]+)"[^>]*>)/g
type Pic = Shrunk & { file: string; mime: string; bytes: number }
const pictures = new Map<string, Pic | null | 'loading'>()
const large = new Map<string, Shrunk | null | 'loading'>()
let tmpDir = ''
async function tempDir($: EngineInterface) {
  if (!tmpDir) tmpDir = (await run($, ['cmd', '/d', '/c', 'echo %TEMP%'])).trim().split('\\').join('/')
  return tmpDir
}
async function loadPicture($: EngineInterface, url: string) {
  if (pictures.has(url)) return
  pictures.set(url, 'loading')
  try {
    await tempDir($)
    const token = (await run($, ['gh', 'auth', 'token'])).trim()
    const base = `${tmpDir}/github-panel-${url.split('/').pop()!.replace(/[^\w.-]/g, '').slice(0, 60)}`
    // curl prints the type GitHub sent; the picture is scaled from disk (never read
    // whole: an 8 MB screenshot is too big for that), which also gives its size.
    const mime = (await run($, ['curl', '-sfL', '--max-filesize', String(25 * 1024 * 1024), '-H', '@-', '-o', base, '-w', '%{content_type}', url],
      `Authorization: token ${token}\n`)).trim().split(';')[0]!
    if (!mime.startsWith('image/')) throw new Error(mime || 'not a picture')
    // Named with its type, so Windows opens the original in its picture viewer.
    const file = `${base}.${(mime.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`
    await $.process.run(['powershell', '-NoProfile', '-Command', 'Move-Item -Force -LiteralPath $env:GP_A -Destination $env:GP_B'],
      { env: { GP_A: base, GP_B: file }, timeoutMs: 20000 })
    const st = await $.fs.stat(file)
    const shrunk = await shrinkPicture($, file, 560, 80, 45000)
    pictures.set(url, shrunk ? { ...shrunk, file, mime, bytes: st.size } : null)
  } catch {
    pictures.set(url, null) // too big, a video, or not reachable: shown as a link card
  }
  redraw()
}

// The viewer's GitHub login: their comments sit on the right, as in a chat.
let me = ''
let meAsked = false

// /comment in Claude's message box: pictures pasted there natively go along.
async function writeBase64($: EngineInterface, path: string, base64: string) {
  // fs.write takes text only: the base64 goes to a file, certutil decodes it.
  await $.fs.write(`${path}.b64`, base64)
  const r = await $.process.run(['certutil', '-f', '-decode', `${path}.b64`, path], { timeoutMs: 60000 })
  if (r.exitCode !== 0) throw new Error('could not save a pasted picture')
}

// GitHub profile pictures (public, no login needed), one fetch per login.
const avatars = new Map<string, string | null | 'loading'>()
async function loadAvatar($: EngineInterface, login: string) {
  if (avatars.has(login) || !/^[\w-]+$/.test(login)) return
  avatars.set(login, 'loading')
  try {
    await tempDir($)
    const file = `${tmpDir}/github-panel-avatar-${login}`
    const mime = (await run($, ['curl', '-sfL', '--max-filesize', '400000', '-o', file, '-w', '%{content_type}', `https://github.com/${login}.png?size=64`])).trim().split(';')[0]!
    if (!mime.startsWith('image/')) throw new Error(mime)
    const bytes = await $.fs.read(file, { as: 'bytes' })
    avatars.set(login, bytes.base64.length < 30000 ? `data:${mime};base64,${bytes.base64}` : null)
  } catch {
    avatars.set(login, null) // the letter circle stays
  }
  redraw()
}

async function loadLarge($: EngineInterface, url: string) {
  const pic = pictures.get(url)
  if (large.has(url) || !pic || pic === 'loading') return
  large.set(url, 'loading')
  large.set(url, await shrinkPicture($, pic.file, 1400, 88, 110000).catch(() => null))
  redraw()
}
// The original file in Windows' own picture viewer (Explorer opens it as a double-click would).
async function openOriginal($: EngineInterface, file: string) {
  await $.process.run(['explorer.exe', file.split('/').join('\\')], { timeoutMs: 20000 })
}

// The ＋ menu's actions. Both are short PowerShell calls run only on a click: the
// Windows file picker (several files at once), and one read of the clipboard.
const PICK_FILES_PS = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0 }',
  '$d = New-Object System.Windows.Forms.OpenFileDialog',
  '$d.Multiselect = $true; $d.Title = "Attach to the GitHub comment"',
  '$d.Filter = "Pictures and videos|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.mp4;*.mov;*.webm|Text files|*.txt;*.log;*.md;*.json;*.yml;*.yaml;*.toml;*.xml;*.csv;*.java;*.glsl;*.py;*.js;*.ts|All files|*.*"',
  'if ($d.ShowDialog($owner) -eq "OK") { ConvertTo-Json -Compress @($d.FileNames) } else { "[]" }',
  '$owner.Dispose()',
].join('\n')
const READ_CLIP_PS = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
  '$o = [ordered]@{ files = @(); image = $null }',
  'for ($try = 0; $try -lt 4; $try++) { try {',
  '  $f = [System.Windows.Forms.Clipboard]::GetFileDropList()',
  '  if ($f -and $f.Count) { $o.files = @($f) }',
  '  elseif ([System.Windows.Forms.Clipboard]::ContainsImage()) {',
  '    $p = Join-Path $env:TEMP ("github-panel-paste-" + [DateTime]::Now.ToString("yyyyMMdd-HHmmss-fff") + ".png")',
  '    $img = [System.Windows.Forms.Clipboard]::GetImage(); $img.Save($p, [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose(); $o.image = $p',
  '  }',
  '  break } catch { Start-Sleep -Milliseconds 60 } }',
  '$o | ConvertTo-Json -Compress',
].join('\n')
async function pickFiles($: EngineInterface, k: string) {
  setDraft(k, { menu: false, busy: 'Choose files in the window that opened…', error: undefined, note: undefined })
  redraw()
  try {
    const out = await $.process.run(['powershell', '-NoProfile', '-STA', '-Command', PICK_FILES_PS], { timeoutMs: 600000 })
    const files: string[] = [JSON.parse(out.stdout.trim() || '[]')].flat().filter(Boolean)
    setDraft(k, { busy: undefined })
    if (files.length) await addFiles($, k, files)
    else redraw()
  } catch {
    setDraft(k, { busy: undefined, error: 'The file picker did not open.' })
    redraw()
  }
}
async function pasteClipboard($: EngineInterface, k: string) {
  setDraft(k, { menu: false, busy: 'Reading the clipboard…', error: undefined, note: undefined })
  redraw()
  try {
    const out = await $.process.run(['powershell', '-NoProfile', '-STA', '-Command', READ_CLIP_PS], { timeoutMs: 30000 })
    const clip = JSON.parse(out.stdout.trim() || '{}')
    const files: string[] = [clip.files ?? []].flat().filter(Boolean)
    setDraft(k, { busy: undefined })
    if (files.length) await addFiles($, k, files)
    else if (clip.image) await addFiles($, k, [clip.image])
    else { setDraft(k, { error: 'No picture or file on the clipboard. Copy one first.' }); redraw() }
  } catch {
    setDraft(k, { busy: undefined, error: 'Could not read the clipboard.' })
    redraw()
  }
}

// --- live cache ---------------------------------------------------------------
// Every value the pane shows sits here under a key with its fetcher. The poller
// fetches again what the last drawing used and redraws only when a value changed.

type Slot = { value: unknown; json: string; gh: boolean; fetch: () => Promise<unknown>; error?: unknown }
const slots = new Map<string, Slot>()
let used = new Set<string>()
let tick = 0
let timer: { cancel: () => void } | null = null

// A value not fetched yet throws LOADING: the pane draws a placeholder at once and
// redraws when the fetch lands, instead of freezing until gh answers (~0.5 s a call).
const LOADING = Symbol('loading')
const pending = new Set<string>()
let redraw: () => void = () => {}
let polling = false

const isAbsolute = (p: string) => /^([A-Za-z]:[\\/]|\/)/.test(p)
// The folder a shell command works in: `cd X` or `git -C X`, absolute paths only.
function folderInCommand(cmd: string): string {
  const m = /(?:^|[;&|(]\s*)cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|)]+))/.exec(cmd) ?? /\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(cmd)
  const dir = m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
  return isAbsolute(dir) ? dir : ''
}
// Show the GitHub repository a folder belongs to, if it is one and not the one shown now.
async function follow($: EngineInterface, dir: string) {
  try {
    const top = await $.process.run(['git', '-C', dir, 'rev-parse', '--show-toplevel'])
    const t = top.exitCode === 0 ? top.stdout.trim() : ''
    if (!t || t.toLowerCase() === repoTop.toLowerCase()) return
    const origin = await $.process.run(['git', '-C', t, 'remote', 'get-url', 'origin'])
    if (origin.exitCode !== 0 || !/github\.com/i.test(origin.stdout)) return
    repoDir = t; repoTop = t; repoGen++
    pending.clear(); slots.clear(); past.length = 0; future.length = 0; used = new Set(); seen = null; pictures.clear(); large.clear(); unreadTotal = 0
    await update($, view, old => ({ ...old, tab: 'code', dir: '', file: null, stack: [], sub: 'conversation' }))
    bandShown = true
    if (!timer) timer = $.clock.every(TICK_MS, () => void poll($))
    $.ui.invalidate('ui.render')
  } catch {}
}

async function get<T>(key: string, gh: boolean, fetch: () => Promise<T>): Promise<T> {
  used.add(key)
  const slot = slots.get(key)
  if (slot) {
    if (slot.error !== undefined) throw slot.error
    return slot.value as T
  }
  if (!pending.has(key)) {
    pending.add(key)
    const gen = repoGen
    // An answer for the repository shown before a switch is dropped, not cached.
    fetch()
      .then(value => { if (gen === repoGen) slots.set(key, { value, json: JSON.stringify(value), gh, fetch }) },
        error => { if (gen === repoGen) slots.set(key, { value: undefined, json: '', gh, fetch, error }) })
      .finally(() => { if (gen === repoGen) pending.delete(key); redraw() })
  }
  throw LOADING
}

// Fetch once ahead of a click, without joining the poll (that starts when it is opened).
function prefetch(key: string, fetch: () => Promise<unknown>) {
  if (slots.has(key) || pending.has(key)) return
  pending.add(key)
  const gen = repoGen
  fetch().then(value => { if (gen === repoGen) slots.set(key, { value, json: JSON.stringify(value), gh: true, fetch }) }, () => {})
    .finally(() => { if (gen === repoGen) pending.delete(key) })
}

async function poll($: EngineInterface, force = false) {
  if (polling) return
  polling = true
  try { await pollOnce($, force) } finally { polling = false }
}

async function pollOnce($: EngineInterface, force: boolean) {
  tick++
  const gen = repoGen
  let changed = false
  await Promise.all([...used].map(async key => {
    const slot = slots.get(key)
    if (!slot || (slot.gh && !force && tick % GH_EVERY !== 0)) return
    try {
      const value = await slot.fetch()
      const text = JSON.stringify(value)
      if (text !== slot.json && gen === repoGen) {
        slots.set(key, { value, json: text, gh: slot.gh, fetch: slot.fetch })
        changed = true
      }
    } catch { /* keep the last good value */ }
  }))
  if (changed) $.ui.invalidate('ui.render')
}

const LANG: Record<string, string> = { ts: 'typescript', tsx: 'tsx', js: 'javascript', md: 'markdown', yml: 'yaml', kts: 'kotlin', glsl: 'glsl', sh: 'bash', py: 'python' }

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'GitHub', columns: 72, backgroundColor: C.pane })

export const register: Register = on => {
  // Always in reach: a GitHub button in the row above Claude's message box (the app's own
  // toolbars are not open to mods). Shown in git repositories only.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!bandShown || (e.props as any).hasSurvey) return next(e)
    const { Box, Button, Text, Svg } = $.ui.resolve(e) as any
    return (
      <Box flexDirection="row" gap={1} alignItems="center" justifyContent="flex-end">
        <Button key="band:open" plain onPress={() => void open($)}>
          <Text size="caption" color={C.subtle}>◆ GitHub</Text>
        </Button>
        {unreadTotal > 0 && <Text size="caption" color={ORANGE}>{`● ${unreadTotal} new`}</Text>}
        <Text size="caption" color={C.subtle}>·</Text>
        <Button key="band:push" plain onPress={() => void $.prompt.submit({ text: PUSH_STEPS(repoTop) } as any).catch((x: unknown) => $.ui.toast(`Push did not start: ${String(x).slice(0, 120)}`))}>
          <Text size="caption" color={C.subtle}>↑ Push</Text>
        </Button>
      </Box>
    )
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'github', description: 'Show this repo (code, commits, PRs, issues, releases) in a side panel' })
    await $.command.register({ name: 'push', description: 'Commit, version, push and release everything in the repository being worked on, the usual way' })
    await $.command.register({ name: 'comment', description: 'Comment on the issue, PR or commit open in the GitHub panel (paste pictures too)' })
    void run($, ['gh', 'api', 'user', '-q', '.login']).then(t => { me = t.trim(); redraw() }, () => {})
    const inRepo = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree']).then(r => r.exitCode === 0, () => false)
    bandShown = inRepo
    if (inRepo && !repoTop) repoTop = (await $.process.run(['git', 'rev-parse', '--show-toplevel']).catch(() => null))?.stdout.trim() ?? ''
    if (inRepo) {
      void open($)
      timer?.cancel()
      timer = $.clock.every(TICK_MS, () => void poll($))
    }
    return next(e)
  })

  on('command.run', { command: 'comment' }, async () => ({ text: 'Open an issue, a pull request or a commit in the GitHub panel, then send /comment with your text.' }))

  on('command.run', { command: 'push' }, async $ => {
    // Reached only where prompt.submit below did not turn /push into the steps.
    return { text: 'Pushing: Claude takes it from here.', context: [PUSH_STEPS(repoTop)] }
  })

  on('command.run', { command: 'github' }, async $ => {
    await open($)
    return { text: 'GitHub panel opened.' }
  })

  // The watcher lives while the panel is open; closing the panel ends it.
  on('ui.close', async ($, e, next) => {
    if ((e as any).id === PANE) { stopWatcher(); paneFocused = false }
    return next(e)
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    lastPanelUse = Date.now()
    return next(e)
  })
  on('ui.press', { requestId: PANE }, async ($, e, next) => {
    lastPanelUse = Date.now()
    return next(e)
  })
  on('prompt.edit', async ($, e, next) => {
    lastPromptUse = Date.now()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // /push becomes the push steps as the prompt itself, so Claude starts on them at once.
    if (e.command?.name === 'push' || /^\/push\s*$/.test(e.text ?? '')) return next({ ...e, text: PUSH_STEPS(repoTop), command: undefined } as any)
    const isComment = e.command?.name === 'comment' || /^\/comment(\s|$)/.test(e.text ?? '')
    if (!isComment) return next(e)
    const v = await read($, view)
    const d = v.stack[v.stack.length - 1]
    if (!d || d.kind === 'release') return { drop: 'Open an issue, a pull request or a commit in the GitHub panel first, then /comment posts to it.' }
    const text = (e.command?.name === 'comment' ? e.command.args ?? '' : (e.text ?? '').replace(/^\/comment\s?/, '')).trim()
    const files: string[] = []
    try {
      for (const [i, att] of (e.attachments ?? []).entries()) {
        if (att.type !== 'image' || !att.id) continue
        let b64 = ''
        let offset: number | undefined = 0
        let type = 'image/png'
        while (offset !== undefined) {
          const part: any = await $.prompt.media({ id: att.id, offset } as any)
          if (!part?.base64) break
          b64 += part.base64
          type = part.mediaType ?? type
          offset = part.next ?? part.nextOffset
        }
        if (!b64) continue
        const path = `${await tempDir($)}/github-panel-comment-${Date.now()}-${i}.${type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'}`
        await writeBase64($, path, b64)
        files.push(path)
      }
      if (!text && !files.length) return { drop: 'Write something after /comment, or paste a picture.' }
      if (d.kind === 'commit') {
        if (files.length) return { drop: 'GitHub takes no pictures on commit comments. Send the text alone.' }
        await run($, ['gh', 'api', '--method', 'POST', `repos/{owner}/{repo}/commits/${d.id}/comments`, '-F', 'body=@-'], text)
        slots.delete(`ccomments|${d.id}`)
      } else {
        const noun = d.kind === 'issue' ? 'issue' : 'pr'
        await run($, ['gh', noun, 'comment', d.id, '--body-file', '-', ...files.flatMap(f => ['--attach', f])], text)
        slots.delete(`${d.kind}|${d.id}`)
      }
      redraw()
      const where = d.kind === 'commit' ? `commit ${d.id.slice(0, 7)}` : `#${d.id}`
      return { drop: `Posted to ${where}${files.length ? ` with ${files.length} picture${files.length > 1 ? 's' : ''}` : ''}.` }
    } catch (err) {
      return { drop: `Not posted: ${String((err as Error)?.message ?? err).split('\n')[0]}` }
    }
  })

  // A commit, push or gh call shows up at once, GitHub included.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const cmd = String((e as any).command ?? '')
    const dir = folderInCommand(cmd)
    if (dir) void follow($, dir)
    else if (/\b(git|gh)\b/.test(cmd)) void poll($, true)
    return ran
  })
  // Editing a file in another repository moves the panel there too.
  for (const tool of ['Edit', 'Write', 'NotebookEdit'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const ran = await next(e)
      const file = String((e as any).file_path ?? (e as any).notebook_path ?? '')
      if (isAbsolute(file)) void follow($, file.replace(/[\\/][^\\/]*$/, ''))
      return ran
    })
  }

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Code, Markdown, Link } = els
    const Svg = 'Svg' in els ? els.Svg : null
    const rich = e.surface !== 'terminal'
    const fill = (c: string) => (rich ? c : undefined)
    const edge = rich ? C.edge : 'promptBorder'
    const v = await read($, view)
    // Every move goes through here, so mouse back/forward can retrace it.
    const go = (fn: (old: View) => View) => void update($, view, old => {
      const next = fn(old)
      if (JSON.stringify(next) !== JSON.stringify(old)) {
        past.push(old); if (past.length > 100) past.shift()
        future.length = 0
      }
      return next
    })
    const set = (patch: Partial<View>) => go(old => ({ ...old, ...patch }))
    const toEnd = () => { $.clock.after(450, () => void $.ui.scroll({ in: PANE, to: 'end' } as any).catch(() => {})) }
    const push = (d: Detail) => {
      go(old => ({ ...old, stack: [...old.stack, d], sub: 'conversation' }))
      if (d.kind !== 'image') toEnd()
    }
    const back = () => go(old => ({ ...old, stack: old.stack.slice(0, -1), sub: 'conversation' }))
    navBack = () => void update($, view, old => { const p = past.pop(); if (!p) return old; future.push(old); return p })
    navForward = () => void update($, view, old => { const f = future.pop(); if (!f) return old; past.push(old); return f })
    used = new Set()
    redraw = () => $.ui.invalidate('ui.render')
    pasteTarget = ''
    const focusedNow = !!(e.props as any).isFocused
    paneFocused = focusedNow
    if (!me && !meAsked) { meAsked = true; void run($, ['gh', 'api', 'user', '-q', '.login']).then(t => { me = t.trim(); redraw() }, () => { meAsked = false }) }
    if (!tmpDir) void tempDir($).catch(() => {})

    const [repo, local] = await Promise.all([
      get('repo', true, () => repoOf($)).catch(() => null),
      get('local', false, () => localOf($)).catch(() => null),
    ])
    // The accent is the repo's own: the colour GitHub gives its main language.
    const accent = ORANGE
    const accentBg = `${accent}26`
    const unread = await unreadOf($, repo)
    if (unread.size !== unreadTotal) { unreadTotal = unread.size; $.ui.invalidate('ui.render') }
    const warm = (key: string, gh: boolean, fetch: () => Promise<unknown>) => void get(key, gh, fetch).catch(() => {})
    warm('commits', false, () => commitsOf($))
    warm('releases', true, () => releasesOf($))
    warm('prs|all', true, () => prsOf($, 'all'))
    warm('issues|all', true, () => issuesOf($, 'all'))
    warm('tree|', false, () => treeOf($, ''))
    warm('last|', false, () => lastCommitOf($, ''))
    const unreadIn = (kind: string) => [...unread].filter(k => k.startsWith(kind)).length

    // --- pieces ---
    const icon = (name: string, color: string, px = 16) =>
      Svg ? <Svg source={svg(ICON[name] ?? '', color)} alt={name} width={px} height={px} /> : <Text color={color}>●</Text>
    // State reads like the list rows: the coloured icon and the word, no box around it.
    const stateMark = (st: State) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        {icon(st.icon, st.color, 14)}<Text size="caption" bold color={st.color}>{st.text}</Text>
      </Box>
    )
    const pill = (text: string, color: string) => (
      <Text size="caption" weight="semibold" color={color}>{text}</Text>
    )
    const box = (children: any) => (
      <Box flexDirection="column" gap={1} paddingX={1}>{children}</Box>
    )
    // A bar as wide as its box with round ends: two half-circle caps around a middle
    // that is drawn far too wide and clipped (the pane's width in pixels is unknown).
    const capSvg = (color: string, px: number, side: 'l' | 'r') =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px / 2}" height="${px}"><circle cx="${side === 'l' ? px / 2 : 0}" cy="${px / 2}" r="${px / 2}" fill="${color}"/></svg>`
    const midSvg = (color: string, px: number) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${px}"><rect width="4000" height="${px}" fill="${color}"/></svg>`
    const roundBar = (key: string, segments: { color: string; grow: number; alt: string }[], px: number) => Svg && segments.length
      ? (
        <Box key={key} flexDirection="row" gap={0} width="100%">
          <Svg source={capSvg(segments[0]!.color, px, 'l')} alt="bar start" width={px / 2} height={px} />
          {segments.map((sg, i) => (
            <Box key={`${key}:${i}`} flexGrow={Math.max(0.02, sg.grow)} flexShrink={1} width={0} minWidth={0} overflow="hidden">
              <Svg source={midSvg(sg.color, px)} alt={sg.alt} width={4000} height={px} />
            </Box>
          ))}
          <Svg source={capSvg(segments[segments.length - 1]!.color, px, 'r')} alt="bar end" width={px / 2} height={px} />
        </Box>
      )
      : null
    // A label as GitHub draws it: a rounded pill sized to its text.
    const tag = (text: string, color: string) => {
      if (!Svg) return <Text size="caption" color={color}>{`[${text}]`}</Text>
      const w = Math.ceil(text.length * 6.6) + 16
      const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      return <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="18"><rect x="0.5" y="0.5" width="${w - 1}" height="17" rx="8.5" fill="${color}22" stroke="${color}66"/><text x="${w / 2}" y="12.5" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="11" font-weight="600" fill="${color}">${safe}</text></svg>`} alt={text} width={w} height={18} />
    }
    // A hairline across the pane: an SVG wider than any pane, capped to the slot.
    const RULE = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1"><rect width="4000" height="1" fill="${GREY}66"/></svg>`
    const rule = (key: string) => (Svg ? <Box key={key} width="100%" overflow="hidden"><Svg source={RULE} alt="divider" width={4000} height={1} /></Box> : null)
    // The unread count: a white disc with the number, laid over a corner.
    const disc = (n: number, ring = C.muted) => Svg
      ? <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8.5" fill="#ffffff" stroke="${ring}" stroke-width="1"/><text x="9" y="12.6" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${n > 9 ? 8.5 : 10.5}" font-weight="700" fill="#1f1f1f">${n > 99 ? '99+' : n}</text></svg>`} alt={`${n} new`} width={18} height={18} />
      : <Text bold color="#000000" backgroundColor="#ffffff">{` ${n} `}</Text>
    const repoLink = (href: string): Detail | null => {
      if (!repo) return null
      const m = href.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull|commit|releases\/tag)\/([^/#?]+)/)
      if (!m || m[1]!.toLowerCase() !== repo.owner.toLowerCase() || m[2]!.toLowerCase() !== repo.name.toLowerCase()) return null
      const kind = ({ issues: 'issue', pull: 'pr', commit: 'commit', 'releases/tag': 'release' } as const)[m[3] as 'issues']
      return { kind, id: decodeURIComponent(m[4]!) }
    }
    // Markdown from GitHub: #12 becomes a link, and links into this repo open here.
    const md = (key: string, raw: string) => {
      const attached = [...(raw ?? '').matchAll(ATTACHED)].map(m => ({ alt: m[1] || 'Picture', url: (m[2] ?? m[3])! }))
      const text = (raw ?? '')
        .replace(ATTACHED, '')
        .replace(/<img[^>]*>/gi, '')
        .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/!\[[^\]]*\]\((?!https?:)[^)]*\)/g, '')
        .replace(/<\/?(div|p|picture|source|br|a|span|sup|sub|center)[^>]*>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      const linked = repo ? text.replace(/(^|[\s(])#(\d+)\b/g, (_, pre, n) => `${pre}[#${n}](${repo.url}/issues/${n})`) : text
      const here = [...linked.matchAll(/\]\((https:\/\/github\.com\/[^)\s]+)\)/g)].map(m => m[1]!).filter(h => repoLink(h))
      const body = here.length
        ? <Markdown key={key} text={linked || (attached.length ? '' : '*No description provided.*')} pressableLinks={here}
            onLinkPress={link => { const d = repoLink(link.href); if (d) push(d) }} />
        : <Markdown text={linked || (attached.length ? '' : '*No description provided.*')} />
      if (!attached.length) return body
      for (const a of attached) void loadPicture($, a.url)
      return (
        <Box flexDirection="column" gap={1}>
          {linked ? body : null}
          {attached.map(a => {
            const pic = pictures.get(a.url)
            if (Svg && pic && pic !== 'loading') {
              const W = Math.min(360, pic.w)
              const H = Math.max(1, Math.round(W * pic.h / pic.w))
              return (
                <Box key={`picbox:${a.url}`} position="relative" alignSelf="flex-start" flexDirection="column">
                  <Svg alt={a.alt} width={W} height={H}
                    source={`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="r"><rect width="${W}" height="${H}" rx="10"/></clipPath></defs><image href="${pic.uri}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/></svg>`} />
                  <Box position="absolute" right={1} bottom={0}>
                    <Button key={`zoom:${key}:${a.url}`} plain onPress={() => push({ kind: 'image', id: a.url })}>⤢ Enlarge</Button>
                  </Box>
                </Box>
              )
            }
            return (
              <Text key={`pic:${a.url}`} size="caption" color={C.subtle}>
                {pic === 'loading' ? `Loading ${a.alt}…` : <Text>{`${a.alt} is a video or a file the panel cannot draw. `}<Link href={a.url} label="Open on GitHub" /></Text>}
              </Text>
            )
          })}
        </Box>
      )
    }

    // --- header ---
    const header = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          {Svg ? <Svg source={MARK} alt="GitHub" width={22} height={22} /> : <Text color={C.subtle}>◆</Text>}
          <Text size="heading" color={C.subtle}>{repo?.owner ?? 'local'}</Text>
          <Text size="heading" color={C.subtle}>/</Text>
          <Text size="heading" bold color={C.text}>{repo?.name ?? 'repository'}</Text>
        </Box>
        {repo?.description ? <Text color={C.subtle} size="footnote">{repo.description}</Text> : null}
        <Box flexDirection="row" columnGap={2} rowGap={0} flexWrap="wrap" alignItems="center">
          {local && <Text size="caption" color={C.subtle} wrap="truncate-end">on <Text color={ORANGE} bold>{local.branch}</Text></Text>}
          {repo && <Text size="caption" color={C.subtle}>★ <Text bold color={C.text}>{repo.stars}</Text> stars</Text>}
          {repo && <Text size="caption" color={C.subtle}>⑂ <Text bold color={C.text}>{repo.forks}</Text> forks</Text>}
          {local && local.changed > 0 && <Text size="caption" color="#d29922">● {local.changed} uncommitted</Text>}
          {local && local.ahead > 0 && (() => {
            // "↑ 2 to push" is the Push button too; hovered, "↑ Push now" is laid over it.
            const label = `↑ ${local.ahead} to push`
            const push = () => void $.prompt.submit({ text: PUSH_STEPS(repoTop) } as any).catch((x: unknown) => $.ui.toast(`Push did not start: ${String(x).slice(0, 120)}`))
            return (
              <Box key="aheadchip" position="relative" hover={rich ? { scope: 'pushnow' } : undefined}>
                <Button key="ahead:push" plain onPress={push}><Text size="caption" color={C.open}>{label}</Text></Button>
                {rich && (
                  <Box position="absolute" top={0} left={0} width={label.length} display="none" backgroundColor={C.pane}
                    hover={{ scope: 'pushnow', display: 'flex' }}>
                    <Button key="ahead:pushnow" plain onPress={push}><Text size="caption" color={C.open} underline>↑ Push now</Text></Button>
                  </Box>
                )}
              </Box>
            )
          })()}
          {local && local.behind > 0 && <Text size="caption" color={C.closed}>↓ {local.behind} to pull</Text>}
        </Box>
        {repo && repo.languages.length > 0 && Svg && (
          <Box flexDirection="column" gap={0} paddingTop={1}>
            {roundBar('langbar', repo.languages.map(l => ({ color: l.color, grow: l.share, alt: `${l.name} ${Math.round(l.share * 100)}%` })), 6)}
            <Box flexDirection="row" columnGap={2} flexWrap="wrap">
              {repo.languages.map(l => (
                <Text size="caption" color={C.subtle}><Text color={l.color}>●</Text> <Text color={C.text}>{l.name}</Text> {Math.round(l.share * 1000) / 10}%</Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )

    // --- tab bar: icon, label, counter; the open tab in Claude's accent; unread as a badge ---
    const TABS: [Tab, string, string, number | undefined, number][] = [
      ['code', 'Code', 'code', undefined, 0],
      ['commits', 'Commits', 'commit', local?.commits, 0],
      ['prs', 'PRs', 'pr', repo?.openPrs, unreadIn('pr#')],
      ['issues', 'Issues', 'issueOpen', repo?.openIssues, unreadIn('issue#')],
      ['releases', 'Releases', 'tag', repo?.releases, 0],
    ]
    // GitHub's repo nav: plain text tabs, a glyph, a count pill, the open one carried
    // by an accent bar under it. The whole tab is one button.
    const PILL_PX = 20 // the pill's height: exactly one tab row (measured), or it is clipped
    const GLYPH: Record<Tab, string> = { code: '‹›', commits: '◦', prs: '⇄', issues: '◎', releases: '◇' }
    // All tabs stay on one row: a narrower pane drops the counts first, then the closed
    // tabs' names (their glyphs stay). The app keeps a width the person dragged, so the
    // mod cannot reset it; it fits the row to it instead.
    const cols = ((e.props as any).bodyColumns ?? 72) as number
    const tabText = (label: string, count: number | undefined, level: number, active: boolean, id: Tab) =>
      level >= 2 && !active ? GLYPH[id] : `${GLYPH[id]}  ${label}${level === 0 && count !== undefined ? `  ${count}` : ''}`
    const fits = (level: number) => TABS.reduce((n, [id, label, , count]) => n + tabText(label, count, level, v.tab === id, id).length + 2, 0) <= cols
    const level = fits(0) ? 0 : fits(1) ? 1 : 2
    const tabs = (
      // A row of tabs straight on the pane (no card, unlike the content below). The open tab
      // sits on a rounded orange-tinted pill drawn as a picture behind its label: a border
      // would add a whole row of height.
      <Box flexDirection="row" columnGap={0} rowGap={0} flexWrap="nowrap" justifyContent="space-between" paddingX={0} paddingY={0}>
        {TABS.map(([id, label, , count, fresh]) => {
          const active = v.tab === id && v.stack.length === 0
          return (
            <Box key={`tabwrap:${id}`} flexGrow={1} flexDirection="row" justifyContent="center" alignItems="center">
              {/* The pill hugs the label's button, so it is exactly what hover lights. */}
              <Box key={`tabhug:${id}`} position="relative">
              {active && Svg && (
                <Box position="absolute" left={0} right={0} top={0} bottom={0} justifyContent="center" gap={0}>
                  {roundBar(`pill:${id}`, [{ color: C.accentBg, grow: 1, alt: 'open tab' }], PILL_PX)}
                </Box>
              )}
              <Button key={`tab:${id}`} plain onPress={() => set({ tab: id, file: null, stack: [] })}>
                <Text color={active ? C.text : C.subtle}>{tabText(label, count, level, active, id)}</Text>
              </Button>
              {fresh > 0 && (
                // Offsets are whole rows (20 px): one row up, then 13 px down, so the badge
                // sits on the pill's top-right corner instead of above it.
                <Box position="absolute" top={-1} right={-1} flexDirection="column" gap={0}>
                  {Svg ? <Svg source={'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="13"><rect width="1" height="13" fill-opacity="0"/></svg>'} alt="gap" width={1} height={13} /> : null}
                  {disc(fresh, accent)}
                </Box>
              )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    // --- list rows, GitHub's issue list ---
    const row = (r: Row) => {
      const isNew = !!r.seenKey && unread.has(r.seenKey)
      return (
        <Box key={`row:${r.key}`} flexDirection="row" gap={1} alignItems="flex-start" paddingX={1} paddingY={rich ? 1 : 0}
          borderStyle="round" borderColor={C.clear} hover={rich ? { backgroundColor: C.hover } : undefined}>
          {r.icon && icon(r.icon.name, r.icon.color)}
          <Box flexDirection="column" flexShrink={1} flexGrow={1} gap={0}>
            <Box flexDirection="row" columnGap={1} flexWrap="wrap" alignItems="center">
              <Box flexShrink={1}>
                <Markdown key={`open:${r.key}`} text={`**[${r.title.replace(/([\[\]\\*_`])/g, '\\$1')}](https://open/${r.key})**`}
                  onLinkPress={() => push(r.open)} />
              </Box>
              {r.state && !r.icon?.name.startsWith('issue') && !r.icon?.name.startsWith('pr') && pill(r.state.text, r.state.color)}
              {(r.labels ?? []).map(l => tag(l.name, l.color))}
            </Box>
            <Box flexDirection="row" columnGap={1} flexWrap="wrap">
              {r.id && <Text mono size="caption" color={C.subtle}>{r.id}</Text>}
              <Text color={C.subtle} size="caption">{r.meta}</Text>
              {r.plus !== undefined && <Text size="caption" color={C.open}>+{r.plus}</Text>}
              {r.minus !== undefined && <Text size="caption" color={C.closed}>−{r.minus}</Text>}
            </Box>
          </Box>
          {(r.messages ?? 0) > 0 && (
            <Box flexDirection="row" gap={0} alignItems="center" flexShrink={0} paddingRight={1}>
              {icon('comment', isNew ? C.text : C.subtle, 14)}
              <Text size="caption" bold={isNew} color={isNew ? C.text : C.subtle}>{` ${r.messages}`}</Text>
            </Box>
          )}
          {isNew && disc(Math.max(1, (repo?.activity[r.seenKey!] ?? 0) - (seen?.[r.seenKey!] ?? 0)))}
        </Box>
      )
    }
    const list = (rows: Row[], empty: string) => {
      for (const r of rows.slice(0, 10)) {
        if (r.open.kind === 'issue') prefetch(`issue|${r.open.id}`, () => issueOf($, r.open.id))
        if (r.open.kind === 'pr') prefetch(`pr|${r.open.id}`, () => prOf($, r.open.id))
      }
      return listOf(rows, empty)
    }
    const listOf = (rows: Row[], empty: string) => rows.length === 0
      ? box(<Text color={C.subtle} italic>{empty}</Text>)
      : (
        <Box flexDirection="column" gap={0} borderStyle="round" borderColor={edge} backgroundColor={fill(C.card)}>
          {rows.flatMap((r, i) => (i ? [rule(`rule:${r.key}`), row(r)] : [row(r)]))}
        </Box>
      )

    const segmented = <T extends string>(items: [T, string, string, number?][], value: T, onPick: (x: T) => void, prefix: string) => (
      <Box flexDirection="row" columnGap={3} rowGap={1} flexWrap="wrap" paddingX={1}>
        {items.map(([x, label, , count]) => {
          const picked = value === x
          return (
            <Button key={`${prefix}:${x}`} plain onPress={() => onPick(x)}>
              <Text color={picked ? C.text : C.subtle}>{`${picked ? '● ' : '○ '}${label}${count !== undefined ? `  ${count}` : ''}`}</Text>
            </Button>
          )
        })}
      </Box>
    )

    const backBar = (label: string) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button key="back" plain onPress={back}><Text color={ORANGE}>{label}</Text></Button>
      </Box>
    )

    // A comment as GitHub draws it: a header strip, then the body.
    // A round avatar with the login's first letter, its colour fixed per login.
    const avatar = (who: string) => {
      const hue = [...who].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)
      if (!Svg) return <Text color={C.subtle}>{who.slice(0, 1).toUpperCase()}</Text>
      void loadAvatar($, who)
      const face = avatars.get(who)
      if (face && face !== 'loading')
        return <Svg alt={who} width={26} height={26} source={`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><defs><clipPath id="c"><circle cx="13" cy="13" r="13"/></clipPath></defs><image href="${face}" width="26" height="26" clip-path="url(#c)"/><circle cx="13" cy="13" r="12.5" fill="none" stroke="#8b949e" stroke-opacity=".35"/></svg>`} />
      return <Svg alt={who} width={26} height={26} source={`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="13" fill="hsl(${hue},45%,42%)"/><text x="13" y="17.5" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="12" font-weight="600" fill="#fff">${(who[0] ?? '?').toUpperCase()}</text></svg>`} />
    }
    // A comment as a chat message: yours on the right in the accent, others on the left.
    // A small action: icon + label in one row, the label the button; tinted on hover.
    // Hover = the button: anything drawn outside a Button (an icon, a pill) is not lit by
    // its hover, so a small action's glyph is part of the button's own text.
    const ACTION_GLYPH: Record<string, string> = { pencil: '✎', trash: '✕', close: '⊗', issueOpen: '↺' }
    const action = (key: string, ic: string, label: string, onPress: () => void, color = C.muted) => (
      <Button key={key} plain onPress={onPress}><Text size="caption" color={color}>{`${ACTION_GLYPH[ic] ?? ''} ${label}`.trim()}</Text></Button>
    )
    // What a message can be changed through: the opening post, an issue/PR comment, a commit comment.
    type Act = { type: 'body'; d: Detail } | { type: 'ic'; id: string; d: Detail } | { type: 'cc'; id: string; d: Detail }
    const commentAct = (d: Detail, url?: string): Act | undefined => {
      const id = url?.match(/issuecomment-(\d+)/)?.[1]
      return id ? { type: 'ic', id, d } : undefined
    }
    const actKey = (a: Act) => (a.type === 'body' ? `body:${a.d.kind}:${a.d.id}` : `${a.type}:${a.id}`)
    const acts = new Map<string, Act>()
    async function changeMessage(a: Act, body: string | null) {
      const k = actKey(a)
      edits.set(k, { ...(edits.get(k) ?? { text: '' }), busy: body === null ? 'Deleting…' : 'Saving…', error: undefined })
      redraw()
      try {
        if (a.type === 'body') {
          if (body === null) throw new Error('the opening post cannot be deleted, only edited')
          await run($, ['gh', a.d.kind === 'pr' ? 'pr' : 'issue', 'edit', a.d.id, '--body-file', '-'], body)
        } else {
          const path = a.type === 'ic' ? `repos/{owner}/{repo}/issues/comments/${a.id}` : `repos/{owner}/{repo}/comments/${a.id}`
          if (body === null) await run($, ['gh', 'api', '--method', 'DELETE', path])
          else await run($, ['gh', 'api', '--method', 'PATCH', path, '-F', 'body=@-'], body)
        }
        edits.delete(k)
        await refresh(a.type === 'cc' ? `ccomments|${a.d.id}` : `${a.d.kind}|${a.d.id}`)
        await refresh('repo')
      } catch (err) {
        edits.set(k, { ...(edits.get(k) ?? { text: '' }), busy: undefined, error: String((err as Error)?.message ?? err).split('\n')[0] })
      }
      redraw()
    }
    const comment = (key: string, who: string, when: string, body: string, note = 'commented', isAuthor = false, act?: Act) => {
      const mine = !!me && who === me
      const ek = act ? actKey(act) : ''
      if (act) acts.set(ek, act)
      const editing = act ? edits.get(ek) : undefined
      const label = note === 'commented' ? ago(when) : `${note}, ${ago(when)}`
      return (
        <Box key={key} flexDirection="row" gap={1} alignItems="flex-start" justifyContent={mine ? 'flex-end' : 'flex-start'}
          paddingLeft={mine ? 6 : 0} paddingRight={mine ? 0 : 6}>
          {!mine && avatar(who)}
          <Box flexDirection="column" gap={0} flexShrink={1} alignItems={mine ? 'flex-end' : 'flex-start'}>
            <Box flexDirection="row" gap={1} alignItems="center">
              {!mine && <Text size="caption" bold>{who}</Text>}
              {!mine && isAuthor && <Text size="caption" color={C.subtle}>author</Text>}
              <Text size="caption" color={C.subtle}>{label}</Text>
            </Box>
            {editing && !editing.confirmDelete
              ? (
                // Edited in the chat box below; the bubble shows which message that is.
                <Box flexDirection="column" gap={0} alignItems="flex-end">
                  <Box paddingX={1} paddingY={rich ? 1 : 0} borderStyle="round"
                    borderColor={rich ? `${accent}99` : 'promptBorder'}
                    backgroundColor={fill(mine ? C.cardMine : C.card)}>
                    {md(`md:${key}`, body)}
                  </Box>
                  <Text size="caption" color={ORANGE}>editing</Text>
                </Box>
              )
              : (
                <Box paddingX={1} paddingY={rich ? 1 : 0} borderStyle="round"
                  borderColor={rich ? C.edge : 'promptBorder'}
                  backgroundColor={fill(mine ? C.cardMine : C.card)}>
                  {md(`md:${key}`, body)}
                </Box>
              )}
            {mine && act && !editing && (
              <Box flexDirection="row" columnGap={0}>
                {action(`edit:${ek}:open`, 'pencil', 'Edit', () => {
                  edits.set(ek, { text: body }); setDraft(`edit|${ek}`, { text: body })
                  editTarget = { k: slotKey(act.d), ek }; redraw()
                })}
                {act.type !== 'body' && (
                  action(`delete:${ek}`, 'trash', 'Delete', () => { edits.set(ek, { text: body, confirmDelete: true }); redraw() })
                )}
              </Box>
            )}
            {editing?.confirmDelete && (
              <Box flexDirection="row" columnGap={2} alignItems="center">
                <Text size="caption" color={C.subtle}>Delete this message?</Text>
                <Button key={`deleteyes:${ek}`} variant="primary" onPress={() => void changeMessage(act!, null)}>Delete</Button>
                {action(`deleteno:${ek}`, 'close', 'Keep', () => { edits.delete(ek); redraw() })}
                {editing.busy && <Text size="caption" color={C.subtle} italic>{editing.busy}</Text>}
                {editing.error && <Text size="caption" color="error">{editing.error}</Text>}
              </Box>
            )}
          </Box>
          {mine && avatar(who)}
        </Box>
      )
    }
    const diffFiles = (diff: string) => splitDiff(diff).map(([path, body, plus, minus]) => (
      <Box key={`diff:${path}`} flexDirection="column" gap={0}>
        {rule(`rule:diff:${path}`)}
        <Box flexDirection="row" gap={1} alignItems="center" paddingX={1} paddingY={rich ? 1 : 0}>
          {icon('file', C.subtle, 14)}
          <Box flexShrink={1}><Text mono size="caption" wrap="truncate-start">{path}</Text></Box>
          <Box flexGrow={1} />
          <Text size="caption" color={C.open}>+{plus}</Text>
          <Text size="caption" color={C.closed}>−{minus}</Text>
        </Box>
        {body ? <Code source={body} format="diff" path={path} /> : <Box paddingX={1}><Text color={C.subtle} size="caption">Binary or renamed file</Text></Box>}
      </Box>
    ))
    const title = (text: string, num?: string) => (
      <Text size="title" bold>{text}{num ? <Text color={C.subtle} weight="regular">{` ${num}`}</Text> : ''}</Text>
    )

    // --- writing: comment, attach, close or reopen ---
    const slotKey = (d: Detail) => `${d.kind}|${d.id}`
    async function refresh(key: string) {
      const slot = slots.get(key)
      if (!slot) return
      const gen = repoGen
      const value = await slot.fetch().catch(() => slot.value)
      if (gen === repoGen) slots.set(key, { value, json: JSON.stringify(value), gh: slot.gh, fetch: slot.fetch })
    }
    async function send(d: Detail, toggle?: 'close' | 'reopen') {
      const k = slotKey(d)
      const dr = draftOf(k)
      const text = dr.text.trim()
      if (!text && !dr.files.length && !toggle) { setDraft(k, { error: 'Write something or attach a file first.', note: undefined }); redraw(); return }
      setDraft(k, { busy: toggle ? (toggle === 'close' ? 'Closing…' : 'Reopening…') : 'Posting…', error: undefined, note: undefined })
      redraw()
      try {
        if (d.kind === 'commit') {
          await run($, ['gh', 'api', '--method', 'POST', `repos/{owner}/{repo}/commits/${d.id}/comments`, '-F', 'body=@-'], dr.text)
          await refresh(`ccomments|${d.id}`)
        } else {
          const noun = d.kind === 'issue' ? 'issue' : 'pr'
          if (text || dr.files.length)
            await run($, ['gh', noun, 'comment', d.id, '--body-file', '-', ...dr.files.flatMap(f => ['--attach', f])], dr.text)
          if (toggle) await run($, ['gh', noun, toggle, d.id])
          await refresh(k)
          await refresh(`${noun === 'pr' ? 'prs' : 'issues'}|all`)
          await refresh('repo')
          await markSeen($, repo, `${noun}#${d.id}`)
        }
        drafts.set(k, { text: '', files: [], note: toggle ? (toggle === 'close' ? 'Closed.' : 'Reopened.') : 'Comment posted.' })
        toEnd()
      } catch (err) {
        setDraft(k, { busy: undefined, error: String((err as Error)?.message ?? err).split('\n')[0] })
      }
      redraw()
    }
    // Close / Reopen, at the right end of an issue's or PR's header row.
    const stateAction = (d: Detail, state?: 'open' | 'closed') => {
      const k = slotKey(d)
      const noun = d.kind === 'pr' ? 'pull request' : d.kind
      return [
        <Box key={`hdrgrow:${k}`} flexGrow={1} />,
        state === 'open' ? action(`close:${k}`, 'close', draftOf(k).text.trim() ? 'Send and close' : `Close ${noun}`, () => void send(d, 'close'))
          : state === 'closed' ? action(`reopen:${k}`, 'issueOpen', `Reopen ${noun}`, () => void send(d, 'reopen')) : null,
      ]
    }
    // A message box grows with its text (wrapped at its width), from 2 rows up to 40% of the
    // panel's height; past that it scrolls inside.
    const fitRows = (text: string, cols: number) => {
      const bodyRows = (((e.props as any).scroll?.bodyRows ?? 40) as number)
      const width = Math.max(8, cols - 4)
      const lines = text.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / width)), 0)
      return Math.min(Math.max(2, lines), Math.max(3, Math.floor(bodyRows * 0.4)))
    }
    const composer = (d: Detail) => {
      const { Input } = els as any
      const k = slotKey(d)
      const act = editTarget?.k === k ? acts.get(editTarget.ek) : undefined
      if (editTarget && act) {
        const ek = editTarget.ek
        const dk = `edit|${ek}`
        const st = edits.get(ek)
        const stop = () => { edits.delete(ek); drafts.delete(dk); editTarget = null; redraw() }
        const save = () => void changeMessage(act, draftOf(dk).text).then(() => { if (!edits.has(ek)) { drafts.delete(dk); editTarget = null; redraw() } })
        senders.set(dk, save)
        return (
          <Box key={`composer:${k}`} flexDirection="column" gap={0}>
            <Box flexDirection="row" columnGap={1} alignItems="center">
              <Text size="caption" color={ORANGE}>✎ Editing message</Text>
              <Text size="caption" color={C.subtle}>·</Text>
              <Button key={`editcancel:${ek}`} plain onPress={stop}><Text size="caption" color={C.muted}>Cancel</Text></Button>
              {st?.busy && <Text size="caption" color={C.subtle} italic>{st.busy}</Text>}
              {st?.error && <Text size="caption" color="error">{st.error}</Text>}
            </Box>
            <Box flexDirection="column" width={Math.max(16, (((e.props as any).bodyColumns ?? 60) as number) - 2)}>
              <Input key={`edit:${ek}`} rows={fitRows(draftOf(dk).text, (((e.props as any).bodyColumns ?? 60) as number) - 2)} value={draftOf(dk).text} submitLabel="➤" autoFocus
                placeholder="Edit your message"
                onInput={(t: string) => void typed($, dk, t)}
                onSubmit={(t: string) => { setDraft(dk, { text: t }); save() }} />
            </Box>
          </Box>
        )
      }
      if (d.kind !== 'commit') pasteTarget = k
      senders.set(k, () => void send(d))
      const dr = draftOf(k)
      const canAttach = d.kind !== 'commit'
      const thumb = (f: string) => {
        const name = f.split(/[\\/]/).pop() ?? f
        // Keys carry no path: a click never reached a button keyed with a Windows path.
        const fk = name.replace(/[^\w.-]/g, '_')
        const src = thumbs.get(f)
        const isVideo = /\.(mp4|mov|webm)$/i.test(f)
        const art = Svg
          ? <Svg alt={name} width={64} height={64} source={src
              ? `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><clipPath id="r"><rect width="64" height="64" rx="10"/></clipPath></defs><image href="${src}" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/></svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="0.5" y="0.5" width="63" height="63" rx="10" fill="${C.surface}" stroke="${C.edge}"/>${isVideo
                  ? `<path d="M26 22 L44 32 L26 42 Z" fill="${C.muted}"/>`
                  : `<path d="M20 42 L29 31 L36 38 L40 34 L46 42 Z" fill="${C.muted}" opacity=".85"/><circle cx="38" cy="24" r="3.5" fill="${C.muted}"/>`}</svg>`} />
          : null
        return (
          <Box key={`thumb:${k}:${fk}`} flexDirection="column" gap={0} alignItems="center" width={12}>
            {art}
            <Text size="caption" color={C.subtle} wrap="truncate-middle">{name}</Text>
            <Button key={`unattach:${k}:${fk}`} plain onPress={() => { dismissed.add(`${k}|${f}`); setDraft(k, { files: draftOf(k).files.filter(x => x !== f) }); redraw() }}>
              <Text size="caption" color={C.muted}>✕ Remove</Text>
            </Button>
          </Box>
        )
      }
      return (
        <Box key={`composer:${k}`} flexDirection="column" gap={0}>
          {dr.files.length > 0 && <Box flexDirection="row" columnGap={2} rowGap={1} flexWrap="wrap" paddingX={1}>{dr.files.map(thumb)}</Box>}
          {canAttach && dr.pathField && (
            <Input key={`attach:${k}`} value="" submitLabel="add" autoFocus
              placeholder="A file path (Shift+right-click a file, Copy as path), then Enter"
              onSubmit={(t: string) => { setDraft(k, { pathField: false }); void addFiles($, k, t.split(/\r?\n/)) }} />
          )}
          {/* Discord-style bar: ＋ for attachments on the left, the field beside it. A field in a
              row shrinks to its placeholder, so its box gets the panel's width in cells. */}
          <Box flexDirection="row" gap={1} alignItems="flex-start" position="relative">
            {canAttach && (
              // Top-aligned with the field's own ➤, which the app draws 5 px down from its top.
              <Box key={`addwrap:${k}`} flexDirection="column" gap={0}>
                {Svg ? <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="5"><rect width="1" height="5" fill="#000" fill-opacity="0"/></svg>`} alt="gap" width={1} height={5} /> : null}
                <Button key={`add:${k}`} variant={dr.menu ? 'primary' : 'secondary'} onPress={() => { setDraft(k, { menu: !draftOf(k).menu, pathField: false }); redraw() }}>＋</Button>
              </Box>
            )}
            {canAttach && dr.menu && (
              // A card above the ＋, in the panel's own look (solid, so nothing shows through).
              <Box key={`menu:${k}`} position="absolute" left={0} bottom={3} flexDirection="column" gap={0}
                paddingX={1} paddingY={0} borderStyle="round" borderColor={edge} backgroundColor={fill(C.menu)}>
                {([
                  ['upload', 'Upload a file', () => void pickFiles($, k)],
                  ['clipboard', 'Paste from clipboard', () => void pasteClipboard($, k)],
                  ['link', 'Enter a file path', () => { setDraft(k, { menu: false, pathField: true }); redraw() }],
                ] as [string, string, () => void][]).map(([ic, label, act]) => (
                  // No border per row: each one added a row above and below (too tall).
                  <Button key={`menu:${k}:${ic}`} plain onPress={act}>
                    <Text color={C.text}>{`${({ upload: '↑', clipboard: '⎘', link: '⌨' } as Record<string, string>)[ic] ?? ''}  ${label}`}</Text>
                  </Button>
                ))}
              </Box>
            )}
            <Box flexDirection="column" width={Math.max(16, (((e.props as any).bodyColumns ?? 60) as number) - (canAttach ? 6 : 2))}>
              <Input key={`compose:${k}`} rows={fitRows(dr.text, (((e.props as any).bodyColumns ?? 60) as number) - (canAttach ? 6 : 2))} value={dr.text} submitLabel="➤"
                placeholder={d.kind === 'commit' ? 'Message on this commit' : `Message #${d.id}`}
                onInput={(t: string) => void typed($, k, t)}
                onSubmit={(t: string) => { setDraft(k, { text: t }); void send(d) }} />
            </Box>
          </Box>
          <Box flexDirection="row" columnGap={2} flexWrap="wrap" alignItems="center" paddingX={0}>
            {dr.busy
              ? <Text size="caption" color={C.subtle} italic>{dr.busy}</Text>
              : dr.error ? <Text size="caption" color="error">{dr.error}</Text>
                : dr.note ? <Text size="caption" color={C.open}>{dr.note}</Text> : null}
          </Box>
        </Box>
      )
    }

    // --- detail views ---
    async function detailView(d: Detail) {
      const from = v.stack.length > 1 ? 'Back' : ({ code: 'Code', commits: 'Commits', prs: 'Pull requests', issues: 'Issues', releases: 'Releases' })[v.tab]
      if (d.kind === 'image') {
        const pic = pictures.get(d.id)
        void loadLarge($, d.id)
        const big = large.get(d.id)
        const shown = big && big !== 'loading' ? big : pic && pic !== 'loading' ? pic : null
        return (
          <Box flexDirection="column" gap={1}>
            {backBar('← Back')}
            {Svg && shown
              ? <Svg alt="Picture, full size"
                  source={`<svg xmlns="http://www.w3.org/2000/svg" width="${shown.w}" height="${shown.h}" viewBox="0 0 ${shown.w} ${shown.h}"><defs><clipPath id="r"><rect width="${shown.w}" height="${shown.h}" rx="12"/></clipPath></defs><image href="${shown.uri}" width="${shown.w}" height="${shown.h}" clip-path="url(#r)"/></svg>`} />
              : <Text color={C.subtle} italic>Loading the picture…</Text>}
            {pic && pic !== 'loading' && (
              <Box flexDirection="row" columnGap={2} flexWrap="wrap" alignItems="center">
                <Text size="caption" color={C.subtle}>{`${pic.ow} × ${pic.oh}, ${size(pic.bytes)}${big === 'loading' ? ', sharpening…' : ''}`}</Text>
                <Box flexGrow={1} />
                <Button key={`original:${d.id}`} plain onPress={() => void openOriginal($, pic.file)}>Open original</Button>
              </Box>
            )}
          </Box>
        )
      }
      if (d.kind === 'issue') {
        const x = await get(`issue|${d.id}`, true, () => issueOf($, d.id))
        void markSeen($, repo, `issue#${d.id}`)
        const st = ISSUE_STATE(x.state, x.stateReason)
        return (
          <Box flexDirection="column" gap={1}>
            {backBar(`← ${from}`)}
            {title(x.title, `#${x.number}`)}
            <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
              {stateMark(st)}
              <Text size="caption" color={C.subtle}><Text bold color={C.text}>{x.author?.login}</Text> opened this {ago(x.createdAt)}{x.comments.length ? `, ${x.comments.length} ${x.comments.length === 1 ? 'reply' : 'replies'}` : ''}</Text>
              {stateAction(d, x.state === 'OPEN' ? 'open' : 'closed')}
            </Box>
            {(x.labels?.length ?? 0) > 0 && (
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {x.labels.map((l: any) => tag(l.name, `#${l.color}`))}
              </Box>
            )}
            {comment('body', x.author?.login ?? '?', x.createdAt, x.body, 'opened', true, { type: 'body', d })}
            {x.comments.map((c: any, i: number) =>
              comment(`c${i}`, c.author?.login ?? '?', c.createdAt, c.body, 'commented', c.author?.login === x.author?.login, commentAct(d, c.url)))}
            {composer(d)}
          </Box>
        )
      }
      if (d.kind === 'pr') {
        const x = await get(`pr|${d.id}`, true, () => prOf($, d.id))
        void markSeen($, repo, `pr#${d.id}`)
        const st = PR_STATE(x.state, x.isDraft)
        const timeline = [
          ...x.comments.map((c: any) => ({ who: c.author?.login, when: c.createdAt, body: c.body, note: 'commented', url: c.url })),
          ...x.reviews.filter((r: any) => r.body || r.state !== 'COMMENTED').map((r: any) => ({
            who: r.author?.login, when: r.submittedAt, body: r.body,
            note: r.state === 'APPROVED' ? 'approved these changes' : r.state === 'CHANGES_REQUESTED' ? 'requested changes' : 'reviewed',
          })),
        ].sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
        let inner
        if (v.sub === 'files') {
          const diff = await get(`prdiff|${d.id}`, true, () => prDiffOf($, d.id))
          inner = diffFiles(diff)
        } else if (v.sub === 'commits') {
          inner = list(x.commits.map((c: any) => ({
            key: c.oid, id: c.oid.slice(0, 7), title: c.messageHeadline, icon: { name: 'commit', color: C.muted },
            open: { kind: 'commit', id: c.oid }, meta: `${c.authors?.[0]?.login ?? c.authors?.[0]?.name ?? '?'} committed ${ago(c.committedDate)}`,
          })), 'No commits.')
        } else {
          inner = [
            comment('body', x.author?.login ?? '?', x.createdAt, x.body, 'opened', true, { type: 'body', d }),
            ...timeline.map((t: any, i: number) => comment(`t${i}`, t.who ?? '?', t.when, t.body, t.note, t.who === x.author?.login, t.url ? commentAct(d, t.url) : undefined)),
            composer(d),
          ]
        }
        return (
          <Box flexDirection="column" gap={1}>
            {backBar(`← ${from}`)}
            {title(x.title, `#${x.number}`)}
            <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
              {stateMark(st)}
              <Text size="caption" color={C.subtle}>
                <Text bold color={C.text}>{x.author?.login}</Text> {x.state === 'MERGED' ? 'merged' : 'wants to merge'} {x.commits.length} {x.commits.length === 1 ? 'commit' : 'commits'} into{' '}
                <Text mono color={C.text}>{x.baseRefName}</Text> from <Text mono color={C.text}>{x.isCrossRepository ? `${x.headRepositoryOwner?.login}:` : ''}{x.headRefName}</Text>
              </Text>
              {stateAction(d, x.state === 'OPEN' ? 'open' : x.state === 'CLOSED' ? 'closed' : undefined)}
            </Box>
            <Box flexDirection="row" gap={2}>
              <Text size="caption" color={C.open}>+{x.additions}</Text>
              <Text size="caption" color={C.closed}>−{x.deletions}</Text>
              {x.reviewDecision === 'APPROVED' && <Text size="caption" color={C.open}>✓ Approved</Text>}
              {x.reviewDecision === 'CHANGES_REQUESTED' && <Text size="caption" color={C.closed}>✗ Changes requested</Text>}
            </Box>
            {segmented<Sub>([
              ['conversation', 'Conversation', 'comment', timeline.length],
              ['commits', 'Commits', 'commit', x.commits.length],
              ['files', 'Files', 'file', x.changedFiles],
            ], v.sub, s => set({ sub: s }), 'sub')}
            {inner}
          </Box>
        )
      }
      if (d.kind === 'commit') {
        const x = await get(`commit|${d.id}`, false, () => commitOf($, d.id))
        const [headline = '', ...rest] = x.message.split('\n')
        const files = splitDiff(x.diff)
        return (
          <Box flexDirection="column" gap={1}>
            {backBar(`← ${from}`)}
            {title(headline)}
            {rest.join('\n').trim() ? box(<Text size="footnote">{rest.join('\n').trim()}</Text>) : null}
            <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
              {icon('commit', C.subtle, 14)}
              <Text size="caption" color={C.subtle}><Text bold color={C.text}>{x.who}</Text> committed {ago(x.when)}</Text>
              <Text mono size="caption" color={C.subtle}>{x.sha.slice(0, 7)}</Text>
            </Box>
            <Text size="caption" color={C.subtle}>
              {files.length} {files.length === 1 ? 'file' : 'files'} changed <Text color={C.open}>+{files.reduce((a, f) => a + f[2], 0)}</Text> <Text color={C.closed}>−{files.reduce((a, f) => a + f[3], 0)}</Text>
            </Text>
            {diffFiles(x.diff)}
            {(await get(`ccomments|${d.id}`, true, () => commitCommentsOf($, d.id)).catch(() => [] as any[])).map((c: any, i: number) =>
              comment(`cc${i}`, c.user?.login ?? '?', c.created_at, c.body + (c.path ? `\n\n*on ${c.path}${c.line ? ` line ${c.line}` : ''}*` : ''), 'commented', false, { type: 'cc', id: String(c.id), d }))}
            {composer(d)}
          </Box>
        )
      }
      const x = await get(`release|${d.id}`, true, () => releaseOf($, d.id))
      x.isLatest = (await get('releases', true, () => releasesOf($)).catch(() => [] as Row[])).some(r => r.key === d.id && r.state?.text === 'Latest')
      return (
        <Box flexDirection="column" gap={1}>
          {backBar(`← ${from}`)}
          <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
            {title(x.name || x.tagName)}
            {x.isLatest && pill('Latest', C.open)}
            {x.isPrerelease && pill('Pre-release', '#d29922')}
            {x.isDraft && pill('Draft', C.muted)}
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            {icon('tag', C.subtle, 14)}
            <Text mono size="caption" color={C.subtle}>{x.tagName}</Text>
            <Text size="caption" color={C.subtle}>released by <Text bold color={C.text}>{x.author?.login}</Text> {ago(x.publishedAt)}</Text>
          </Box>
          {rule('rule:notes')}
          {box(md('md:release', x.body))}
          {rule('rule:assets')}
          {box([
            <Text bold size="caption">Assets <Text color={C.subtle}>{` ${x.assets.length}`}</Text></Text>,
            ...x.assets.map((a: any) => (
              <Box flexDirection="row" gap={1} alignItems="center">
                {icon('file', C.subtle, 14)}
                <Box flexShrink={1}><Text mono size="caption" wrap="truncate-middle">{a.name}</Text></Box>
                <Box flexGrow={1} />
                <Text size="caption" color={C.subtle}>{size(a.size)}, {a.downloadCount} downloads</Text>
              </Box>
            )),
          ])}
        </Box>
      )
    }

    // --- tab views ---
    async function codeView() {
      const crumbs = [repo?.name ?? 'root', ...(v.file ?? v.dir).split('/').filter(Boolean)]
      const path = (
        <Box flexDirection="row" gap={0} flexWrap="wrap" alignItems="center">
          {crumbs.map((c, i) => {
            const target = crumbs.slice(1, i + 1).join('/')
            return i === crumbs.length - 1
              ? <Text bold>{c}</Text>
              : <Box flexDirection="row" gap={0}>
                  <Button key={`crumb:${target}`} plain onPress={() => set({ dir: target ? `${target}/` : '', file: null })}>
                    <Text color={C.subtle}>{c}</Text>
                  </Button>
                  <Text color={C.subtle}>{' / '}</Text>
                </Box>
          })}
        </Box>
      )
      const lastKey = v.file ?? v.dir
      const last = await get(`last|${lastKey}`, false, () => lastCommitOf($, lastKey)).catch(() => '')
      const [lh = '', lfull = '', ls = '', la = '', lw = ''] = last.split('\t')
      const lastRow = last
        ? (
          <Box flexDirection="column" gap={0} paddingX={1}>
            <Button key="lastcommit" plain onPress={() => push({ kind: 'commit', id: lfull })}>
              <Text size="caption" color={C.text} wrap="truncate-end">{ls}</Text>
            </Button>
            <Box flexDirection="row" gap={1} alignItems="center">
              {icon('commit', C.subtle, 12)}
              <Text size="caption" bold>{la}</Text>
              <Text mono size="caption" color={C.subtle}>{lh}</Text>
              <Text size="caption" color={C.subtle}>{ago(lw)}</Text>
            </Box>
          </Box>
        )
        : null
      const frame = (children: any) => (
        <Box flexDirection="column" gap={1} paddingY={rich ? 1 : 0} borderStyle="round" borderColor={edge} backgroundColor={fill(C.card)}>
          {lastRow}
          {rule('rule:files')}
          <Box flexDirection="column" gap={0} paddingX={1}>{children}</Box>
        </Box>
      )
      if (v.file) {
        const ext = v.file.split('.').pop() ?? ''
        const source = await get(`file|${v.file}`, false, () => fileOf($, v.file!))
        return (
          <Box flexDirection="column" gap={1}>
            {path}
            {frame(ext === 'md' ? md('md:file', source) : <Code source={source} path={v.file} language={LANG[ext] ?? ext} startLine={1} />)}
          </Box>
        )
      }
      const entries = await get(`tree|${v.dir}`, false, () => treeOf($, v.dir))
      const readme = entries.find(it => !it.isDir && /^readme\.md$/i.test(it.name))
      const readmeText = readme ? await get(`file|${v.dir}${readme.name}`, false, () => fileOf($, `${v.dir}${readme.name}`)).catch(() => '') : ''
      return (
        <Box flexDirection="column" gap={1}>
          {path}
          {frame([
            v.dir
              ? <Box key="upbox" flexDirection="row" gap={1} alignItems="center">
                  <Button key="up" plain onPress={() => set({ dir: v.dir.replace(/[^/]+\/$/, '') })}><Text color={C.subtle}>▴ ..</Text></Button>
                </Box>
              : null,
            ...entries.map(it => (
              <Box key={`fbox:${v.dir}${it.name}`} flexDirection="row" gap={1} alignItems="center">
                <Button key={`f:${v.dir}${it.name}`} plain
                  onPress={() => it.isDir ? set({ dir: `${v.dir}${it.name}/` }) : set({ file: `${v.dir}${it.name}` })}>
                  <Text color={it.isDir ? C.folder : C.subtle}>{it.isDir ? '▸ ' : '  '}</Text>
                  <Text color={C.text}>{it.isDir ? `${it.name}/` : it.name}</Text>
                </Button>
              </Box>
            )),
          ])}
          {readmeText
            ? (
              <Box flexDirection="column" gap={1}>
                {rule('rule:readme')}
                <Box flexDirection="row" gap={1} alignItems="center" paddingX={1}>
                  {icon('book', C.subtle, 14)}<Text bold size="caption">{readme!.name}</Text>
                </Box>
                <Box paddingX={1}>{md('md:readme', readmeText)}</Box>
              </Box>
            )
            : null}
        </Box>
      )
    }


    let body
    try {
      const top = v.stack[v.stack.length - 1]
      if (top) body = await detailView(top)
      else if (v.tab === 'code') body = await codeView()
      else if (v.tab === 'commits') body = list(await get('commits', false, () => commitsOf($)), 'No commits.')
      else if (v.tab === 'releases') body = list(await get('releases', true, () => releasesOf($)), 'No releases.')
      else if (v.tab === 'prs') body = list(await get('prs|all', true, () => prsOf($, 'all')), 'No pull requests yet.')
      else body = list(await get('issues|all', true, () => issuesOf($, 'all')), 'No issues yet.')
    } catch (err) {
      body = err === LOADING
        ? <Box paddingX={1}><Text color={C.subtle} italic>Loading…</Text></Box>
        : box(<Text color="error">{String((err as Error)?.message ?? err)}</Text>)
    }

    if (e.surface === 'desktop') ensureWatcher($)
    else stopWatcher()

    return (
      <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
        {header}
        {tabs}
        {body}
      </Box>
    )
  })
}
