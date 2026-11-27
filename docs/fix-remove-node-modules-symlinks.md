# fix: remove the committed `node_modules` symlinks

Commit `44e3d31` (liquid-glass nav) accidentally committed two symlinks, `node_modules` and
`apps/web/node_modules`, each pointing at its own absolute path on the author's machine.

**Why it hurts:** `.gitignore` had `node_modules/` (trailing slash), which matches directories only, so a
symlink slipped past it. On the next `git pull`, git tries to replace a real `node_modules` directory with
that symlink, fails with `cannot rmdir 'node_modules': Directory not empty`, and can leave the tree
half-updated (it also wiped `apps/web`'s installed packages).

**What this does:** deletes both symlinks from the index and changes the ignore pattern to `node_modules`
(no slash) so a symlink of that name is ignored too.

Anyone who already pulled `main` with these symlinks: after merging this, run `npm install` once.
