# Defuddle Content Extraction Library

## Source

- **Package:** [defuddle](https://github.com/kepano/defuddle)
- **Version:** 0.18.1
- **CDN URL:** `https://cdn.jsdelivr.net/npm/defuddle@0.18.1/dist/index.js`
- **License:** MIT

## Files

- `defuddle.min.js` — Core UMD bundle (295 KB). Attaches `Defuddle` to global scope.

## Update Procedure

1. Download new version from `https://cdn.jsdelivr.net/npm/defuddle@{VERSION}/dist/index.js`
2. Replace `defuddle.min.js` with the new content
3. Update the version comment header at the top of the file
4. Update this README with the new version number
5. Test extraction on a few pages to verify compatibility

## Notes

- This is the **core** bundle only. It does NOT include Turndown (Markdown conversion).
- The core bundle returns cleaned HTML in `result.content`. The extraction code strips HTML to plain text before returning.
- Do NOT use `dist/index.full.js` (688 KB) — it includes unnecessary dependencies.
