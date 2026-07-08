# Seed CSVs

Ready-made files for trying the importer — upload any of them on the
`/import/upload` page.

| File | What it exercises |
| --- | --- |
| `leads-standard.csv` | A typical lead export: E.164 + local + `00`-prefixed phones, multiple emails in one cell, junk placeholders (`N/A`, `-`), a contact-free spam row (skipped with a reason), an incomplete phone (discarded with a warning), a typo'd email domain (kept as written — never "fixed"), status/source phrases for every enum value, and an evidence-free row (`status: null`). |
| `leads-messy.csv` | The hostile case: synonym headers (`Correo`, `Mob No.`, `Disposition`), split `first_name`/`last_name` columns, an `Email` column that actually contains phone numbers (the values-win rule), `Company` → `crm_note`, a prompt-injection attempt in a cell, an empty row, a date where a phone should be, and WhatsApp-vs-Primary-Mobile conflicts. |
| `generate-large.mjs` | Emits an N-row CSV for batching/progress/load testing: `node samples/generate-large.mjs 20000 > samples/leads-large.csv` (~1.2 MB; scale N to taste under the 5 MB upload cap). |

Expected behavior worth watching for in the results:

- `leads-standard.csv` → 13 imported, 2 skipped (the spam row and — after
  normalization discards its 5-digit phone — nothing left to import on the
  incomplete-phone row **only if** it also lacked an email), warnings on
  discarded values and low-confidence rows.
- `leads-messy.csv` → the injection row imports as ordinary data (the "name"
  is treated as text, never as instructions), row 9 skips as contact-free,
  and the lying `Email` column's digits end up as phones, not emails.

Exact counts can vary slightly with the model — that variability is what the
audit table (skipped/errors/warnings with per-row reasons) is for.
