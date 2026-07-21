# coc-explorer

Lean filesystem explorer for coc.nvim. It mounts an Explorer TreeView in the
Explorer View Container selected from the primary Activity Bar provided by
`@statiolake/coc-ui`, with open, split, reveal,
root-change, refresh, and filesystem actions. Files open and folders toggle on
single click; right click opens the item's context action menu through
`@statiolake/coc-ui`. Folders use compact disclosure markers instead of folder
icons, while files use one generic configurable icon. Nested items have
vertical indent guides by default; configure them with
`explorer.indentGuides.enabled` and `explorer.indentGuides.character`. Focusing
the Explorer reveals the most recently focused file by default; set
`explorer.revealOnFocus` to `false` to disable this behavior.

View actions define both the right-click context menu and NvimTree-style local
keys: `o`, `<C-x>`, `<C-v>`, `<C-t>`, `a`, `x` (cut), `y` (copy), `p` (paste),
`d` (delete), `r`, `R`, `gy`, `.`, `s`, `-`, `+`, `<BS>`, and `P`. Coc's native
`<CR>`, `<Tab>`, `f`, `t`, and `M` TreeView bindings remain available.
