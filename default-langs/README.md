# default-langs

This folder contains **optional** default translations that are pre-loaded into
the translation table when a user selects a target language.

## How it works

When the user clicks **"Load Translation Table"**, the app tries to `fetch` the
file `default-langs/<targetLangCode>.lang` (e.g. `default-langs/de_DE.lang`).

- If the file **exists and is valid**, its key=value pairs are used to
  pre-fill the translation column so the user only needs to review and adjust
  the existing strings instead of starting from scratch.
- If the file **does not exist** (or the fetch fails for any reason), the
  translator simply starts empty – the feature degrades gracefully.

Translations that are already present inside the uploaded pack always take
**priority** over the defaults here.

## Format

Files must follow the standard Minecraft Bedrock `.lang` format:

```
## Optional comment lines start with ##
pack.name=Mein Paket
pack.description=Eine tolle Erweiterung
some.key=Übersetzter Text
```

- One `key=value` pair per line.
- Lines starting with `##` are treated as comments and are ignored.
- Trailing comments separated by a tab (`\t##`) are stripped when read.

## Adding a new default translation

1. Create a file named `<languageCode>.lang` in this folder
   (e.g. `de_DE.lang`, `fr_FR.lang`, `ja_JP.lang`).
2. Fill it with the pre-translated key=value pairs for that language.
3. Commit and push – the file will be served automatically alongside the app.

Supported language codes match the Minecraft Bedrock language list defined in
`js/app.js` (e.g. `en_US`, `de_DE`, `es_ES`, `fr_FR`, `zh_CN`, …).
