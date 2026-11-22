# fix/escape-closes-modals

Pressing Escape now closes a dialog, like clicking the backdrop. Only the topmost one: a confirmation opened over another
dialog (e.g. removing a מסד inside the מסדים dialog) closes by itself and leaves the dialog under it open. Implemented once
in the shared `Modal`, so every dialog gets it. Tests: `components/Modal.test.tsx`.
