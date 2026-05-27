# 2. Pluggable Inline Text Editing and Escape Hatch

To avoid the formatting inconsistencies and tag pollution caused by browser-specific `contenteditable` rich-text commands, we decided to restrict the default inline text editor to plain-text modifications (`contenteditable="plaintext-only"`). For rich-text editing (e.g. bold, italic, custom fonts), we expose a pluggable `onTextEditRequest` callback so host applications can bypass the default behavior and mount custom editors (e.g., TipTap or Quill) directly into the workspace.
