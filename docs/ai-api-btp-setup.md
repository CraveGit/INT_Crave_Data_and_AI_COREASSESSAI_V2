# AI API (`coreassess-ai`) — BTP setup & deploy

Standalone FastAPI (analysis + docgen). Plain `cf push` — no MTA, no service
bindings. All config via `cf set-env`; no `.env` shipped (`.cfignore` blocks it).
`load_dotenv()` in code is a no-op in CF.

- App name: `coreassess-ai`   (manifest.yaml)
- Path: `INT_CRAVE_COREASSESS_V2/coreassess-ai-api`
- Runtime: python 3.11 (runtime.txt) · buildpack python_buildpack
- Server: gunicorn + uvicorn workers, 900s timeout
- Talks to: SAP AI Core (LLM), HANA (CRA_* ref tables), Axiom MCP (grounding, optional)
- Called by: CAP app, server-to-server via destination `coreassess-api`. No login/XSUAA.

## Endpoints
    GET    /                     liveness -> {"status":"ok"}
    GET    /health               deep check -> {"status","checks":{hana,refdata,aicore,mcp}}
    GET    /logs?lines=200       tail Run.log (text/plain)      [X-Log-Token if set]
    DELETE /logs                 truncate Run.log               [X-Log-Token if set]
    GET    /models               {"default","models":[...]} -> feeds the CAPM dropdown
    POST   /analyze              analyze one ABAP object (JSON, gated)
    POST   /analyze/files        analyze uploaded files (multipart, gated)
    POST   /estimateservices     BTP service pricing from analysis+qna
    POST   /docs/export          generate FSD/TSD/BBP .docx
    POST   /docs/chat            doc chat (relevance-gated)
    POST   /docs/from-response   .docx from a chat response
    POST   /pricing/refresh?dry_run=true   refresh BTP price list  [X-Log-Token if set]

Note on /logs: logs go to stdout (use `cf logs`) AND to a per-instance file. With
2 instances x 3 workers, GET /logs returns whichever worker answered — it is a
convenience tail, not a complete log. `cf logs coreassess-ai` is authoritative.

### Postman quick tests
    GET  {url}/health
    POST {url}/analyze/files      Body -> form-data -> key "files" (type File), attach .abap/.txt
                                 (repeat key "files" for multiple files)
    POST {url}/analyze           Body -> raw JSON:
                                 { "abap_object": "REPORT z...", "ObjectName": "ZTEST",
                                   "SkillSet": {"Name": "NodeJS"} }
                                 SkillSet is optional (default NodeJS -> CAP).
                                 "ABAP" selects RAP. It only changes the BTP dev
                                 stack for hybrid / side-by-side; retire and
                                 on-stack ignore it.
    GET  {url}/logs?lines=100     (add header X-Log-Token if LOG_ADMIN_TOKEN set)

## Deploy steps

### 0. Pre-flight: verify the code parses under Python 3.11
runtime.txt pins python-3.11, but local dev may be 3.12+. `py_compile` on a newer
interpreter does NOT catch 3.11-only errors -- e.g. a backslash inside an f-string
expression is legal from 3.12 (PEP 701) and a SyntaxError on 3.11. That crash-loops
every worker at import time, with the real cause buried above gunicorn's generic
"Worker failed to boot".

Run from coreassess-ai-api/ before every push:

    python - <<'EOF'
    import ast, os
    bad = []
    for root, _, files in os.walk('.'):
        if '__pycache__' in root: continue
        for f in files:
            if not f.endswith('.py'): continue
            p = os.path.join(root, f)
            try: ast.parse(open(p, encoding='utf-8').read(), filename=p, feature_version=(3, 11))
            except SyntaxError as e: bad.append(f"{p}:{e.lineno} {e.msg}")
    print("\n".join(bad) if bad else "all files parse under python 3.11")
    EOF

### 1. Push without starting (env not set yet)
    cd INT_CRAVE_COREASSESS_V2/coreassess-ai-api
    cf login -a <api-endpoint> -o <org> -s <space>
    cf push --no-start

### 2. Set env

SAP AI Core (required — SDK reads these exact names via `from_env()`):
    cf set-env coreassess-ai AICORE_AUTH_URL       "https://<subaccount>.authentication.<region>.hana.ondemand.com"
    cf set-env coreassess-ai AICORE_BASE_URL       "https://api.ai.<region>.aws.ml.hana.ondemand.com/v2"
    cf set-env coreassess-ai AICORE_CLIENT_ID      "<clientid>"
    cf set-env coreassess-ai AICORE_CLIENT_SECRET  "<clientsecret>"
    cf set-env coreassess-ai AICORE_RESOURCE_GROUP "default"

HANA — reads reference tables (required):
    cf set-env coreassess-ai HANA_HOST    "<host>.hana.<region>.hanacloud.ondemand.com"
    cf set-env coreassess-ai HANA_PORT    "443"
    cf set-env coreassess-ai HANA_USER    "<user with SELECT on the schema>"
    cf set-env coreassess-ai HANA_PASS    "<password>"
    cf set-env coreassess-ai SCHEMA       "<schema>"
    cf set-env coreassess-ai TABLE_PREFIX "KCC_"     # legacy schema; use CRA_ once CAP is deployed

TABLE_PREFIX decouples this app from the CAP deploy:
  KCC_ -> legacy schema (works today, verified: 1906 pricelist / 3279 fiori / 937 events rows)
  CRA_ -> new CAP HDI container (after CAP deploy + seeding)
Missing reference tables no longer crash startup; the app boots and /health reports
"refdata": "down: prefix ... missing ...".

Axiom MCP grounding (primary source for Fiori app IDs / API names). If disabled,
the fallback is a fuzzy match over REF_FIORIAPPS — which is empty until that table
loads, so keep this enabled:
    cf set-env coreassess-ai AXIOM_MCP_URL     "https://ai-sap-connectors.cfapps.us10-001.hana.ondemand.com/mcp"
    cf set-env coreassess-ai AXIOM_MCP_ENABLED "true"
    cf set-env coreassess-ai AXIOM_MCP_TIMEOUT "30"

Models (optional — see "Model map" below for what each one drives):
    cf set-env coreassess-ai ANALYSIS_MODEL "anthropic--claude-4.8-opus"  # global default
    cf set-env coreassess-ai MODEL_DOCSUITE "gpt-4o"                      # docgen + diagrams
    # per-task overrides: MODEL_BASIC, MODEL_S4, MODEL_TECHNICAL, MODEL_INTERFACE,
    # MODEL_CDS, MODEL_RETIRE, MODEL_QUALITY, MODEL_RELIST

Tuning (optional — have code defaults):
    cf set-env coreassess-ai MAX_CONCURRENT_ANALYSIS "4"       # per-worker analysis cap (default 4)
    cf set-env coreassess-ai ANALYSIS_CONTEXT_WINDOW "200000"
    cf set-env coreassess-ai ANALYSIS_MAX_OUTPUT     "8192"
    cf set-env coreassess-ai ANALYSIS_MIN_OUTPUT     "2048"
    cf set-env coreassess-ai DOC_SECTION_WORKERS     "4"       # parallel docgen sections
    cf set-env coreassess-ai DOC_SECTION_MAX_TOKENS  "8000"
    cf set-env coreassess-ai HOURS_PER_PERSON_DAY    "8"       # person-days = hours / this
    cf set-env coreassess-ai LOG_LEVEL               "WARNING"
    cf set-env coreassess-ai LOG_ADMIN_TOKEN         "<random-secret>"   # protects GET/DELETE /logs
                                                                         # and POST /pricing/refresh; unset = open

Price-list refresh (optional — POST /pricing/refresh):
    cf set-env coreassess-ai BTP_CATALOG_URL       "<priced catalog endpoint>"
    cf set-env coreassess-ai PRICING_FETCH_TIMEOUT "60"
    cf set-env coreassess-ai PRICING_MIN_ROWS      "200"   # reject a fetch smaller than this
KNOWN GAP: no working priced source is configured. The Discovery Center endpoint
returns catalog entries WITHOUT prices, so validation rejects the fetch and the
endpoint is a safe no-op. Leave it unset until a real source is available; seed
the price list via docs/export_refdata.py instead.

Do NOT set on CF:
    DEBUG_DUMP_DIR   # local debugging only; writes per-analysis JSON to disk
    LOG_FILE         # default Run.log is correct; only /logs reads it

### 3. Start + verify
    cf start coreassess-ai
    cf app coreassess-ai          # note route
    curl https://<route>/         # {"status":"ok"}
    cf logs coreassess-ai --recent    # look for "Connected HANADB@..."

## Model map — which model runs where

Resolution order (genai.resolveModel): explicit arg -> per-request override ->
per-task default -> ANALYSIS_MODEL.

| Stage | Prompt type | Env var | Default |
|---|---|---|---|
| Core analysis | BASIC | `MODEL_BASIC` | `ANALYSIS_MODEL` (Opus 4.8) |
| S/4 standard match | S4 | `MODEL_S4` | `ANALYSIS_MODEL` (Opus 4.8) |
| Technical analysis | TECHNICAL | `MODEL_TECHNICAL` | `ANALYSIS_MODEL` (Opus 4.8) |
| Interface analysis | INTERFACE | `MODEL_INTERFACE` | `gpt-4o` |
| CDS suggestions | CDS | `MODEL_CDS` | `gpt-4o` |
| Retire check | RETIRE_CHECK | `MODEL_RETIRE` | `gpt-4o` |
| Table categorisation | RELIST_TABLES | `MODEL_RELIST` | `gpt-4o-mini` |
| Quality scoring | QUALITY_SCORING | `MODEL_QUALITY` | `gpt-4o-mini` |
| Docgen sections | — | `MODEL_DOCSUITE` | `gpt-4o` |
| Doc chat / from-response | — | `MODEL_DOCSUITE` | `gpt-4o` |
| Diagrams (flow/ER/UI) | — | `MODEL_DOCSUITE` | `gpt-4o` |

The tiering is deliberate: deep reasoning where SAP accuracy matters, cheap models
for mechanical extraction.

### The UI dropdown overrides EVERY stage, not just the deep ones
A `model` in the request body is a ContextVar override that outranks all per-task
defaults. So picking Opus in the CAPM dropdown runs Opus for quality scoring and
table categorisation too — tasks that gpt-4o-mini handles fine. That is correct
"user asked for X, they get X" behaviour, but it is markedly more expensive than
the default. Leave the dropdown unset to get the tuned per-task mix.

Endpoints honouring the override: /analyze, /analyze/files, /estimateservices,
/docs/export, /docs/chat, /docs/from-response.

## IMPORTANT — order matters
The AI API reads the reference tables at STARTUP (data_initializers.py), but the
reads are non-fatal: missing tables log to LOAD_ERRORS and the app still boots.
/health then reports "refdata": "down: ...".

What actually degrades when the tables are missing (all reference data comes from
HANA — the bundled referencedata/*.csv files are NOT read at runtime):
  - Fiori app IDs   -> MCP grounding still works; the offline fuzzy fallback is empty
  - BTP price list  -> service pricing returns no/zero costs
  - config/tshirt/priority -> effort sizing and priority weighting degrade
Analysis itself still runs.

Recommended order:
  1. Deploy CAP app -> creates + seeds CRA_* in its HDI container.
  2. Grant the AI API's HANA user SELECT on the CAP container schema.
  3. Set AI API HANA_* + SCHEMA.
  4. Start AI API.

If you want to push/verify the AI API BEFORE CAP is up, it will boot to /health
but analysis stays down until HANA is reachable — that's expected.

## Sizing note
manifest.yaml: 2 instances x 1G, gunicorn -w 3. Reference DataFrames measure ~8MB
per worker (~24MB/instance), so 1G is comfortable; the real memory driver is
concurrent docgen (font embedding + PNG rasterisation held in memory). If workers
OOM under load, raise memory to 2G or drop to -w 2 (scale by instances instead).
The concurrency gate already caps LLM fan-out per worker.

Upload is ~7.4MB. 6.5MB of that is referencedata/*.csv, which nothing reads at
runtime (kept only as the seed source for docs/export_refdata.py). Safe to add to
.cfignore if you want a leaner push.

## Do NOT set (removed dead Azure client)
AZURE_ENDPOINT, AZURE_API_KEY, DEPLOYMENT, APIVERSION.

## Alternative to set-env (cleaner secrets)
    cf create-user-provided-service coreassess-ai-config -p "{\"AICORE_CLIENT_SECRET\":\"...\",\"HANA_PASS\":\"...\"}"
    cf bind-service coreassess-ai coreassess-ai-config
    cf restage coreassess-ai
(App reads plain env; the UPS injects via VCAP. set-env is fine to start.)

## Verify env is set (names only, not values)
    cf env coreassess-ai
