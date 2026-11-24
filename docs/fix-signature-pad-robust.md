# Signature pad: a drawn signature is always reported

- A quick stroke could lift before React re-rendered, so the handler still saw "no ink" and never reported the signature. The pad looked used but the sign button stayed disabled. The stroke now keeps its own record.
- `setPointerCapture` throwing (some pointers cannot be captured) no longer aborts the stroke.
- A `resize` event wiped the signature even when the width had not changed (a phone's address bar or keyboard, a scrollbar appearing). It now only resets on a real change of width.
