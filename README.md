# GitHub Panel for Claude Code

A side panel in the Claude Code desktop app that shows the GitHub repository of the folder you are working in: code, commits, pull requests, issues and releases, all readable inside the panel. You can comment on issues, PRs and commits (with pictures and files), edit and delete your own comments, and the panel updates live.

Open it with `/github`, or with the GitHub button in the row above the message box (shown in git repositories).

## Requirements

- Claude Code (desktop app or terminal)
- [GitHub CLI](https://cli.github.com/) (`gh`), signed in with `gh auth login`
- `git`
- Windows for pasting pictures, the file picker and picture previews (they use PowerShell, which ships with Windows). Everything else works anywhere.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install github-panel --marketplace laurensanp/claude-github-panel
```

Answer `y` to add the marketplace, then press Enter for the user scope.

From a shell:

```
claude plugin install github-panel --marketplace laurensanp/claude-github-panel
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `laurensanp/claude-github-panel`, then **Add plugin**.

### Or let Claude install it

Paste this into Claude Code:

> Install the Claude Code plugin `github-panel` from the marketplace `laurensanp/claude-github-panel` by running `claude plugin install github-panel --marketplace laurensanp/claude-github-panel`, then tell me to open it with `/github`.

## Using it

- **Follows your work**: it shows the GitHub repository of the session's folder, and switches by itself when Claude edits files or runs commands (`cd`, `git -C`) in another GitHub repository.
- **Tabs**: Code, Commits, PRs, Issues, Releases. An orange dot with a number marks unread activity.
- **Open anything**: click an issue, PR, commit or release to read it in the panel. Click a picture to see it large.
- **Comment**: type in the box at the bottom. Enter sends, Ctrl+Enter (or Shift+Enter) starts a new line.
- **Attach**: Ctrl+V a copied picture or file, or use **+** (Upload a file, Paste from clipboard, Enter a file path).
- **Your messages**: Edit puts the text into the message box at the bottom (➤ saves, Cancel above the box); Delete asks first.
- **Back and forward**: the back link, or mouse buttons 4 and 5 while the panel has focus.
- `/comment <text>` in Claude's own box comments on whatever is open in the panel.
- **Push** (next to the GitHub button above the message box, or the green "↑ 2 to push" in the panel's header, which reads "Push now" on hover) or `/push`: Claude commits what is left in small commits, bumps the version if the changes need one (semver), pushes, makes the GitHub release (and Modrinth, where the project's CLAUDE.md says so) and notes it in CLAUDE.md. A project's own "Releases" section in CLAUDE.md wins over the default steps. Claude asks before merging a branch into main, and stops to ask when something needs you.
- The tabs always stay on one row: in a narrow panel the counts go first, then the names of the tabs that aren't open.

## What runs in the background

The panel only talks to GitHub through your own `gh` and `git`. It sends nothing anywhere else and stores only which items you have already seen (in Claude Code's own plugin storage).

On Windows it starts small PowerShell scripts. All of them are in [`hooks/register.tsx`](hooks/register.tsx), readable as plain text:

| Script | When it runs | What it does |
|---|---|---|
| Key watcher (`PASTE_WATCH_PS`) | While the panel is open in the desktop app; stopped when you close the panel | Every 25 ms it checks whether Ctrl+V, Ctrl/Shift+Enter or mouse buttons 4/5 (back/forward) are held down (key state only, it records no typing). Mouse buttons 4/5 go back and forward in the panel while it has focus: then a low-level mouse hook keeps those two buttons from the app (which would otherwise also go back/forward); every other click, and buttons 4/5 at any other time, pass untouched. The panel's focus is passed to it in `%TEMP%\github-panel-focus`. On Ctrl+V while Claude is the window in front, it reads the clipboard once: copied files are passed as paths, a copied picture is saved as a PNG in `%TEMP%`. The panel uses it only when the panel itself has focus. |
| File picker (`PICK_FILES_PS`) | When you click **+ → Upload a file** | Opens the normal Windows file dialog and returns the files you chose. |
| Clipboard read (`READ_CLIP_PS`) | When you click **+ → Paste from clipboard** | Reads the clipboard once, like the watcher. |
| Picture shrink (`SHRINK_PS`) | When a picture is shown | Scales a picture down with Windows' own System.Drawing so it fits the panel; your original file is not changed. |

Pictures from private repositories are downloaded with your `gh` token into `%TEMP%` (files named `github-panel-*`), so they can be shown in the panel.

## License

MIT
