# Language packs

Each `<code>.json` maps the **Japanese source string** to its translation.
Japanese is the source language, so `ja.json` only carries a display name.

To add a language, copy `en.json`, rename it to the locale code (e.g. `fr.json`),
set `"__name__"` to the language's name, and translate the values. It then
appears automatically in Settings → Language.
