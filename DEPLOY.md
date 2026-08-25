# Deploy guide — CoreAssess.AI v2

End-to-end deploy of both components to SAP BTP Cloud Foundry. Component-specific
detail: [`docs/ai-api-btp-setup.md`](./docs/ai-api-btp-setup.md),
[`docs/cap-deploy.md`](./docs/cap-deploy.md).

Target space: `Crave_InfoTech - AI / dev` (us10-001).

## Prerequisites
- `cf` CLI v8 + `multiapps` plugin, logged in (`cf login`) to the target org/space.
- Node 22, `@sap/cds-dk`, `mbt` (MTA build tool) — for the CAP app.
- Python 3.11 target (runtime pinned by `runtime.txt`) — for the AI API.
- A running **HANA Cloud** instance in the space.
- **SAP AI Core** service key (LLM access): auth URL, base URL, client id/secret, resource group.
- *(optional)* **SAP API Hub** sandbox APIKey — only for the MCP connector (separate repo).

## Deploy order
1. **AI API** first (`coreassess-ai`) — the CAP destination points at its URL.
2. **CAP app** (`coreassess`) — creates the destination to the AI API.
3. *(optional)* **MCP connector** (`ai-sap-connectors`, separate repo) — for live Fiori/API grounding.

---

## 1. AI API — `coreassess-ai`
Plain `cf push`, no MTA. All config via `cf set-env` (nothing sensitive is shipped;
`.cfignore` blocks `.env`).

```bash
cd coreassess-ai-api

# pre-flight: catch Python 3.11-only syntax errors (local may be 3.12+)
python -m py_compile main.py genai.py $(git ls-files 'modules/*.py' 'docsuite/*.py')

cf push          # uses manifest.yaml (app name coreassess-ai, python_buildpack)
```

Set config once (survives future pushes), then restart:
```bash
cf set-env coreassess-ai AICORE_AUTH_URL       "<...>"
cf set-env coreassess-ai AICORE_BASE_URL       "<...>"
cf set-env coreassess-ai AICORE_CLIENT_ID      "<...>"
cf set-env coreassess-ai AICORE_CLIENT_SECRET  "<...>"
cf set-env coreassess-ai AICORE_RESOURCE_GROUP "default"
cf set-env coreassess-ai HANA_HOST "<...>"  ; cf set-env coreassess-ai HANA_PORT 443
cf set-env coreassess-ai HANA_USER "<...>"  ; cf set-env coreassess-ai HANA_PASS "<...>"
cf set-env coreassess-ai SCHEMA "<CRA schema>" ; cf set-env coreassess-ai TABLE_PREFIX "CRA_"
cf set-env coreassess-ai AXIOM_MCP_URL "https://ai-sap-connectors.cfapps.us10-001.hana.ondemand.com/mcp"
# optional docgen tuning
cf set-env coreassess-ai DOC_SECTION_WORKERS 8
cf restart coreassess-ai
```
Verify: `GET https://<route>/health` → `hana`, `aicore`, `mcp`, `refdata` all up.
Full env reference: `.env.example`.

## 2. CAP app — `coreassess` (MTA)
```bash
cd coreassess-app
npm install                     # not `npm ci` unless the lockfile is present
rm -rf gen && npx cds build --production   # gen/ must be fresh (schema changes)
mbt build -p=cf                 # -> mta_archives/coreassess_2.0.0.mtar
cf deploy mta_archives/coreassess_2.0.0.mtar
```
This creates the HANA `CRA_*` container, xsuaa, the `coreassess-destination`, the
HTML5 repo, and pushes srv + UI-deployer + approuter.

**Destination to the AI API** (`coreassess-destination` → `coreassess-api`): point it
at the AI API route, e.g. `https://coreassess-ai-api-v2.cfapps.us10-001.hana.ondemand.com`,
`ProxyType=Internet`, `Authentication=NoAuthentication`. (Set in the destination
service instance / cockpit if not already wired by the MTA.)

## 3. MCP connector — `ai-sap-connectors` *(optional, separate repo)*
```bash
cf push                         # from the axiom-sap-connectors repo
cf set-env ai-sap-connectors SAP_API_HUB_KEY "<sandbox.api.sap.com APIKey>"
cf restart ai-sap-connectors
```
The sandbox key powers the `api-hub` tools (latest S/4). `fiori-lib` needs no key.
If the MCP is down and `AXIOM_MCP_ENABLED=true`, analysis fails fast (grounding is
the source of truth) — set `AXIOM_MCP_ENABLED=false` on the AI API to bypass.

---

## Post-deploy
- **Re-analyze** objects so they pick up the current T-shirt bands (`CRA_TSHIRT_CONFIG`)
  and deterministic tier reasons. Sizing/tier are recomputed from the stored analysis.
- **Hard-refresh the UI** (Ctrl+Shift+R) after a CAP deploy so the browser reloads
  `$metadata` (new OData actions otherwise report "not found in the metadata").
- **Admin tables don't auto-refresh** — hit Refresh on Project cost / Pricing history
  after deletes.

## Reference data
`CRA_*` seed CSVs live in `coreassess-app/db/data/` and load on the HDI deploy
(SkillSet, T-shirt bands, BTP price list). The pre-MCP `REF_FIORIAPPS` seed (~6MB) is
**excluded** from the repo — Fiori grounding is MCP-only and that table is unused.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `Function '/X' not found in the metadata` | stale `$metadata` cache → hard-refresh after the CAP deploy finished |
| AI worker crash-loops at boot | a Python 3.11 syntax error (run the py_compile pre-flight); check `cf logs coreassess-ai` |
| static asset `503` during long docgen | approuter under-sized → it's 512M/2-inst in `mta.yaml`; scale up if still choked |
| docgen slow | pick a faster model in the dropdown; raise `DOC_SECTION_WORKERS`; ensure deep-analysis toggle off |
| `api-hub` returns 401 | `SAP_API_HUB_KEY` not set on the MCP connector |
