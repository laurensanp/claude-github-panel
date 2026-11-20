export type Tab = 'code' | 'commits' | 'releases' | 'prs' | 'issues'
export type Filter = 'open' | 'closed' | 'all'
export type Sub = 'conversation' | 'commits' | 'files'
/** Something opened inside the panel: an issue or PR by number, a commit by sha, a release by tag. */
export type Detail = { kind: 'issue' | 'pr' | 'commit' | 'release' | 'image'; id: string }
export type View = { tab: Tab; dir: string; file: string | null; filter: Filter; stack: Detail[]; sub: Sub }

declare module 'claude-code' {
  interface PluginState {
    'github-panel': { view: Shaped<View> }
  }
}
