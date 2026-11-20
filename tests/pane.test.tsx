import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'github-panel', component: 'Pane', requestId: 'github-panel',
  props: { title: 'GitHub', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const REPO = {
  url: 'https://github.com/o/r', owner: { login: 'o' }, name: 'r', description: 'desc', stargazerCount: 3, forkCount: 1,
  languages: { totalSize: 10, edges: [{ size: 9, node: { name: 'Java', color: '#b07219' } }, { size: 1, node: { name: 'GLSL', color: '#5686a5' } }] },
  openIssues: { totalCount: 1 }, openPrs: { totalCount: 1 }, releases: { totalCount: 10 },
  issues: { nodes: [{ number: 3, comments: { totalCount: 1 } }] },
  pullRequests: { nodes: [{ number: 4, comments: { totalCount: 0 }, reviews: { totalCount: 0 } }] },
}
const PR = { number: 4, title: 'Fix interop', state: 'OPEN', isDraft: false, additions: 5, deletions: 2, labels: [], comments: [], author: { login: 'x' }, updatedAt: '2026-11-17T00:00:00Z' }
const ISSUE = { number: 3, title: 'Crash on join', state: 'OPEN', author: { login: 'y' }, updatedAt: '2026-11-17T00:00:00Z', labels: [], comments: [{}] }
const ISSUE_VIEW = { ...ISSUE, body: 'It crashes, see #4', createdAt: '2026-11-16T00:00:00Z', comments: [{ author: { login: 'o' }, body: 'Fixed in 0.5.0', createdAt: '2026-11-17T00:00:00Z', url: 'https://github.com/o/r/issues/3#issuecomment-777' }] }

const OUT: [RegExp, string][] = [
  [/^gh api graphql/, JSON.stringify({ data: { repository: REPO } })],
  [/^git status/, ['## main...origin/main [ahead 2]', ' M a.txt', ''].join('\n')],
  [/^git rev-list/, '42'],
  [/^git log -1/, ['abc1234', 'abc1234ff', 'last msg', 'me', '2026-11-17T00:00:00Z'].join('\t')],
  [/^git ls-tree/, ['040000 tree a\tmod', '100644 blob b\tREADME.md', ''].join('\n')],
  [/^git show/, '# Hello readme'],
  [/^gh pr list/, JSON.stringify([PR])],
  [/^gh issue list/, JSON.stringify([ISSUE])],
  [/^gh issue view 3/, JSON.stringify(ISSUE_VIEW)],
  [/^git log/, ['abc1234', 'abc1234ff', '2026-11-17T00:00:00Z', 'me', 'VIRIS 0.5.0'].join('\t')],
]

test('tabs draw, an issue opens inside the panel', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get((e as any).key) }))
  on('store.set', (_, e) => (store.set((e as any).key, (e as any).value), { value: undefined }))
  const sent: { cmd: string; stdin?: string }[] = []
  const filled: string[] = []
  on('clock.after', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('prompt.fill', (_, e) => (filled.push((e as any).text), { isFilled: true, cursor: 0 }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 2048, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: 'iVBORw0KGgo=' } }))
  on('process.run', (_, e) => {
    const cmd = (e as any).argv.join(' ')
    if (cmd.includes('OpenFileDialog')) return { value: { exitCode: 0, stdout: JSON.stringify(['C:/Temp/picked.png']), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (cmd === 'gh api user -q .login') return { value: { exitCode: 0, stdout: 'o', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (/^gh issue (comment|close|reopen)|^gh api --method (PATCH|DELETE)/.test(cmd)) {
      sent.push({ cmd, stdin: (e as any).stdin ?? (e as any).init?.stdin })
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const hit = OUT.find(([re]) => re.test(cmd))
    return { value: { exitCode: hit ? 0 : 1, stdout: hit?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Data lands in the background: look again until it is drawn.
    const seen = async (q: any) => {
      for (let i = 0; i < 50; i++) {
        const hit = await ui.find(q)
        if (hit) return hit
        await new Promise(r => setTimeout(r, 10))
      }
      return undefined
    }
    const pressWhenDrawn = async (q: any) => { await seen({ key: q.key }); await ui.press(q) }
    expect(await seen({ type: 'Text', text: /desc/ }), 'check 1').toBeDefined()
    expect(await seen({ type: 'Text', text: /90%/ }), 'check 2').toBeDefined()
    expect(await seen({ key: 'f:mod' }), 'check 3').toBeDefined()
    expect(await seen({ type: 'Text', text: /1 uncommitted/ }), 'check 4').toBeDefined()
    expect(await seen({ type: 'Text', text: /↑ 2/ }), 'check 5').toBeDefined()
    await pressWhenDrawn({ key: 'tab:prs' })
    expect(await seen({ type: 'Text', text: /#4/ }), 'check 6').toBeDefined()
    expect(await seen({ type: 'Text', text: /\+5/ }), 'check 7').toBeDefined()
    await pressWhenDrawn({ key: 'tab:issues' })
    await pressWhenDrawn({ key: 'open:issue#3', link: { href: 'https://open/issue#3' } })
    expect(await seen({ type: 'Text', text: /Crash on join/ }), 'check 8').toBeDefined()
    expect(await seen({ type: 'Text', text: /opened this/ }), 'check 9').toBeDefined()
    if (surface === 'desktop') {
      // Writing a comment sends it through gh with the text on stdin, then the box empties.
      await seen({ key: 'compose:issue|3' })
      // Enter in the desktop field types a line break: that sends, without the break.
      const beforeEnter = sent.length
      await ui.input({ key: 'compose:issue|3', text: 'Hello', kind: 'change' })
      await ui.input({ key: 'compose:issue|3', text: 'Hello\n', kind: 'change' })
      for (let i = 0; i < 50 && !sent.slice(beforeEnter).some(x => x.cmd.startsWith('gh issue comment 3')); i++) await new Promise(r => setTimeout(r, 10))
      expect(sent.slice(beforeEnter).find(x => x.cmd.startsWith('gh issue comment 3'))?.stdin, 'Enter sends').toBe('Hello')
      // ＋ opens the menu; Upload a file runs the file picker and attaches what it returns.
      await pressWhenDrawn({ key: 'add:issue|3' })
      expect(await seen({ key: 'menu:issue|3:upload' }), 'menu').toBeDefined()
      await pressWhenDrawn({ key: 'menu:issue|3:upload' })
      expect(await seen({ key: 'unattach:issue|3:picked.png' }), 'picked file').toBeDefined()
      // Enter a file path opens the path field.
      await pressWhenDrawn({ key: 'add:issue|3' })
      await pressWhenDrawn({ key: 'menu:issue|3:link' })
      expect(await seen({ key: 'attach:issue|3' }), 'attachment field').toBeDefined()
      // Your own message: Edit saves through the API, Delete asks first, then deletes.
      await pressWhenDrawn({ key: 'edit:ic:777:open' })
      await seen({ key: 'edit:ic:777' })
      await ui.input({ key: 'edit:ic:777', text: 'Fixed in 0.5.1' })
      for (let i = 0; i < 50 && !sent.some(x => x.cmd.includes('PATCH')); i++) await new Promise(r => setTimeout(r, 10))
      const patch = sent.find(x => x.cmd.includes('PATCH'))
      expect(patch?.cmd, 'edit call').toContain('repos/{owner}/{repo}/issues/comments/777')
      expect(patch?.stdin, 'edited text').toBe('Fixed in 0.5.1')
      await pressWhenDrawn({ key: 'delete:ic:777' })
      await pressWhenDrawn({ key: 'deleteyes:ic:777' })
      for (let i = 0; i < 50 && !sent.some(x => x.cmd.includes('DELETE')); i++) await new Promise(r => setTimeout(r, 10))
      expect(sent.some(x => x.cmd === 'gh api --method DELETE repos/{owner}/{repo}/issues/comments/777'), 'delete call').toBe(true)
      await ui.input({ key: 'compose:issue|3', text: 'Thanks, fixed in 0.5.0' })
      for (let i = 0; i < 50 && !sent.length; i++) await new Promise(r => setTimeout(r, 10))
      expect([...sent].reverse().find(x => x.cmd.startsWith('gh issue comment 3'))?.stdin, 'comment body').toBe('Thanks, fixed in 0.5.0')
      expect(await seen({ type: 'Text', text: /Comment posted/ }), 'posted note').toBeDefined()
      // Close issue sends gh issue close for that number.
      await pressWhenDrawn({ key: 'close:issue|3' })
      for (let i = 0; i < 50 && !sent.some(x => x.cmd === 'gh issue close 3'); i++) await new Promise(r => setTimeout(r, 10))
      expect(sent.some(x => x.cmd === 'gh issue close 3'), 'closed').toBe(true)
      // /comment in Claude's own box posts to the issue open in the panel.
      const before = sent.length
      const r: any = await $.prompt.submit({ text: '/comment From the prompt box', } as any).catch((err: unknown) => ({ err: String(err) }))
      const posted = sent.slice(before).find(x => x.cmd.startsWith('gh issue comment 3'))
      expect(posted?.stdin, 'prompt comment text ' + JSON.stringify(r)).toBe('From the prompt box')
    }
    await pressWhenDrawn({ key: 'back' })
    await pressWhenDrawn({ key: 'tab:commits' })
    expect(await seen({ type: 'Text', text: /abc1234/ }), 'check 10').toBeDefined()
    await pressWhenDrawn({ key: 'tab:code' })
    await ui.unmount()
  }
})

test('Ctrl+V with a picture lands in the open comment box', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get((e as any).key) }))
  on('store.set', (_, e) => (store.set((e as any).key, (e as any).value), { value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 2048, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: 'iVBORw0KGgo=' } }))
  on('ui.focus', () => ({}))
  // Timers fire at once here.
  on('clock.after', () => ({ value: undefined }))
  let release: () => void = () => {}
  const gate = new Promise<void>(r => { release = r })
  // The watcher: ready at once, reports one Ctrl+V with a copied picture once released
  // (again on every start: a removed picture must stay removed).
  let spawned = 0
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: 'READY' }
    spawned++
    await gate
    yield { stream: 'stdout', text: 'PASTE ' + JSON.stringify({ files: [], image: 'C:/Temp/clip.png' }) }
    return { value: { code: 0, signal: null } }
  } as any)
  on('process.run', (_, e) => {
    const cmd = (e as any).argv.join(' ')
    const hit = OUT.find(([re]) => re.test(cmd))
    return { value: { exitCode: hit ? 0 : 1, stdout: hit?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true }, surface: 'desktop' })
  const seen = async (q: any) => {
    for (let i = 0; i < 100; i++) {
      const hit = await ui.find(q)
      if (hit) return hit
      await new Promise(r => setTimeout(r, 10))
    }
    return undefined
  }
  await seen({ key: 'tab:issues' }); await ui.press({ key: 'tab:issues' })
  await seen({ key: 'open:issue#3' }); await ui.press({ key: 'open:issue#3', link: { href: 'https://open/issue#3' } })
  expect(await seen({ key: 'compose:issue|3' }), 'comment box').toBeDefined()
  release()
  expect(await seen({ key: 'unattach:issue|3:clip.png' }), 'pasted picture').toBeDefined()
  // Leave the issue and come back: the picture is still there and ✕ removes it.
  await ui.press({ key: 'back' })
  await seen({ key: 'open:issue#3' }); await ui.press({ key: 'open:issue#3', link: { href: 'https://open/issue#3' } })
  expect(await seen({ key: 'unattach:issue|3:clip.png' }), 'still attached').toBeDefined()
  const r = await ui.press({ key: 'unattach:issue|3:clip.png' })
  let gone = false
  for (let i = 0; i < 50 && !gone; i++) { gone = !(await ui.find({ key: 'unattach:issue|3:clip.png' })); if (!gone) await new Promise(r2 => setTimeout(r2, 10)) }
  expect(gone, 'removed after ✕ ' + JSON.stringify(r)).toBe(true)
  // Leave and come back once more: the watcher restarts and repeats its report.
  await ui.press({ key: 'back' })
  await seen({ key: 'open:issue#3' }); await ui.press({ key: 'open:issue#3', link: { href: 'https://open/issue#3' } })
  await seen({ key: 'compose:issue|3' })
  await new Promise(r2 => setTimeout(r2, 200))
  expect(await ui.find({ key: 'unattach:issue|3:clip.png' }), 'stays removed').toBeUndefined()
  await ui.unmount()
})

test('Ctrl+V while the panel does not have the keyboard is left alone', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get((e as any).key) }))
  on('store.set', (_, e) => (store.set((e as any).key, (e as any).value), { value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 2048, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: 'iVBORw0KGgo=' } }))
  on('ui.focus', () => ({}))
  on('clock.after', () => ({ value: undefined }))
  let release: () => void = () => {}
  const gate = new Promise<void>(r => { release = r })
  let reported = false
  on('process.spawn', async function* () {
    await gate
    reported = true
    yield { stream: 'stdout', text: 'PASTE ' + JSON.stringify({ files: [], image: 'C:/Temp/clip.png' }) }
    return { value: { code: 0, signal: null } }
  } as any)
  on('process.run', (_, e) => {
    const cmd = (e as any).argv.join(' ')
    const hit = OUT.find(([re]) => re.test(cmd))
    return { value: { exitCode: hit ? 0 : 1, stdout: hit?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false }, surface: 'desktop' })
  const seen = async (q: any, tries = 100) => {
    for (let i = 0; i < tries; i++) {
      const hit = await ui.find(q)
      if (hit) return hit
      await new Promise(r => setTimeout(r, 10))
    }
    return undefined
  }
  await seen({ key: 'tab:issues' }); await ui.press({ key: 'tab:issues' })
  await seen({ key: 'open:issue#3' }); await ui.press({ key: 'open:issue#3', link: { href: 'https://open/issue#3' } })
  expect(await seen({ key: 'compose:issue|3' }), 'comment box').toBeDefined()
  release()
  for (let i = 0; i < 50 && !reported; i++) await new Promise(r => setTimeout(r, 10))
  expect(reported, 'watcher reported the paste').toBe(true)
  expect(await seen({ key: 'unattach:issue|3:clip.png' }, 30), 'no picture taken').toBeUndefined()
  await ui.unmount()
})

test('the panel follows the repository Claude works in', async ($, on) => {
  const calls: { cmd: string; cwd?: string }[] = []
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    const cmd = (e as any).argv.join(' ')
    calls.push({ cmd, cwd: (e as any).cwd ?? (e as any).init?.cwd })
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git -C C:/x/other/src rev-parse --show-toplevel') return ok('C:/x/other\n')
    if (cmd === 'git -C C:/x/other remote get-url origin') return ok('https://github.com/o/other.git\n')
    if (cmd === 'git -C C:/x/plain rev-parse --show-toplevel') return ok('C:/x/plain\n')
    if (cmd === 'git -C C:/x/plain remote get-url origin') return { value: { exitCode: 2, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const hit = OUT.find(([re]) => re.test(cmd))
    return { value: { exitCode: hit ? 0 : 1, stdout: hit?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.tool.call({ tool: 'Bash', command: 'cd "C:/x/plain" && ls' } as any) // no GitHub remote: stays
  await $.tool.call({ tool: 'Edit', file_path: 'C:/x/other/src/a.ts', old_string: 'a', new_string: 'b' } as any)
  for (let i = 0; i < 100 && !calls.some(c => c.cmd.includes('remote get-url') && c.cmd.includes('other')); i++) await new Promise(r => setTimeout(r, 10))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (let i = 0; i < 100 && !calls.some(c => c.cmd.startsWith('gh api graphql') && c.cwd === 'C:/x/other'); i++) await new Promise(r => setTimeout(r, 10))
  expect(calls.some(c => c.cmd.startsWith('gh api graphql') && c.cwd === 'C:/x/other'), 'GitHub asked about the other repo').toBe(true)
  expect(calls.some(c => c.cwd === 'C:/x/plain'), 'a folder without a GitHub remote is not followed').toBe(false)
  await ui.unmount()
})

test('/push hands Claude the push steps', async ($, on) => {
  const asked: string[] = []
  on('prompt.submit', (_, e) => (asked.push((e as any).text), { text: (e as any).text }) as any)
  await $.prompt.submit({ text: '/push' } as any)
  expect(asked[0]).toContain('Push all current progress')
  expect(asked[0]).toContain('CLAUDE.md')
  const r: any = await ($ as any).command.run({ command: 'push', args: '' })
  expect(r.context?.[0]).toContain('Push all current progress')
})

test('the Push button above the prompt starts the push steps', async ($, on) => {
  const asked: string[] = []
  on('prompt.submit', (_, e) => (asked.push((e as any).text), { text: (e as any).text }) as any)
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'true', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: {} }) as any)
  on('clock.every', () => ({ value: {} }) as any)
  on('session.start', (_, e) => ({ cwd: (e as any).cwd }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  await ($ as any).session.start({ cwd: 'C:/x/repo' })
  const ui = await $.ui.mount({ plugin: 'github-panel', component: 'AbovePrompt', surface: 'desktop', props: {} } as any)
  await ui.press({ key: 'band:push' })
  for (let i = 0; i < 50 && !asked.length; i++) await new Promise(r => setTimeout(r, 10))
  expect(asked[0]).toContain('Push all current progress')
  await ui.unmount()
})

test('an answer for the old repository does not come back after a switch', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('process.run', async (_, e) => {
    const cmd = (e as any).argv.join(' ')
    const cwd = (e as any).cwd ?? (e as any).init?.cwd
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git -C C:/x/next rev-parse --show-toplevel') return ok('C:/x/next\n')
    if (cmd === 'git -C C:/x/next remote get-url origin') return ok('https://github.com/o/next.git\n')
    if (cmd.startsWith('gh api graphql')) {
      if (cwd === 'C:/x/next') return ok(JSON.stringify({ data: { repository: { ...REPO, name: 'newrepo' } } }))
      await new Promise(r => setTimeout(r, 150)) // the old repository answers late
      return ok(JSON.stringify({ data: { repository: { ...REPO, name: 'oldrepo' } } }))
    }
    const hit = OUT.find(([re]) => re.test(cmd))
    return { value: { exitCode: hit ? 0 : 1, stdout: hit?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await new Promise(r => setTimeout(r, 30)) // the old request is on its way
  await $.tool.call({ tool: 'Edit', file_path: 'C:/x/next/a.ts', old_string: 'a', new_string: 'b' } as any)
  let shown: unknown
  for (let i = 0; i < 100 && !shown; i++) { shown = await ui.find({ text: 'newrepo' } as any); if (!shown) await new Promise(r => setTimeout(r, 10)) }
  expect(shown, 'the new repository shows').toBeDefined()
  await new Promise(r => setTimeout(r, 300))
  expect(await ui.find({ text: 'oldrepo' } as any), 'the late answer is dropped').toBeUndefined()
  expect(await ui.find({ text: 'no-such-text' } as any)).toBeUndefined()
  await ui.unmount()
})
