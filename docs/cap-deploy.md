# Full-stack CAP app (`coreassess`) — deploy guide

Deploys the CAP service + Fiori UI + approuter as one MTA. The AI API is already
live at `https://coreassess-ai-api-v2.cfapps.us10-001.hana.ondemand.com`; this app
reaches it through a destination, not a service binding.

Target space: `Crave_InfoTech - AI / dev` (us10-001).

## What gets created

| MTA resource | service / plan | purpose |
|---|---|---|
| `coreassess-db` | hana / hdi-shared | new `CRA_*` container (separate from `ai_primary_data`) |
| `coreassess-auth` | xsuaa / application | authentication |
| `coreassess-destination` | destination / lite | holds `coreassess-api` -> AI API |
| `coreassess-html5-host` | html5-apps-repo / app-host | UI content |
| `coreassess-html5-runtime` | html5-apps-repo / app-runtime | UI serving |

Modules: `coreassess-srv` (512M), `coreassess-db-deployer` (512M, one-shot),
`coreassess-ui-deployer`, `coreassess-approuter` (256M).

Prerequisites (already verified on this machine): node 22, @sap/cds-dk 9.9.1,
mbt 1.2.47, cf multiapps plugin 3.11.1, and a running HANA Cloud instance.

---

## 1. Install dependencies and build

    cd INT_CRAVE_COREASSESS_V2/coreassess-app
    npm install

Use `npm install`, not `npm ci`: this project had no package-lock.json, and
`npm ci` fails outright without one. The lockfile now exists (committed alongside
package.json), so later runs may use `npm ci` for reproducibility.

`gen/` may contain a stale build from before the schema changed (dropped
`BY_MODEL`, added `HOURS_PER_DAY`, new `CRA-SkillSet.csv`). Remove it so the
deployer cannot ship old artefacts:

    rm -rf gen
    npx cds build --production

Check the output before continuing:

    ls gen/srv gen/db
    ls gen/db/src/gen                # .hdbtable files
    grep -l HOURS_PER_DAY gen/db/src/gen/*.hdbtable

`gen/db` must exist -- without it the db-deployer has nothing to deploy.

## 2. Assemble the MTA archive

    mbt build -p=cf

Produces `mta_archives/coreassess_2.0.0.mtar`. The build runs `npm ci` and
`cds build --production` again via `before-all`, plus the UI build.

## 3. Deploy

    cf deploy mta_archives/coreassess_2.0.0.mtar

Takes 5-15 minutes. It creates the five services, deploys the HDI container
content, then starts srv / approuter.

If it fails partway, MTA prints an operation id. Do not re-run blindly:

    cf mta-ops                       # list operations
    cf deploy -i <operation-id> -a retry
    cf deploy -i <operation-id> -a abort    # roll back instead

## 4. Verify the deploy

    cf mta coreassess
    cf apps | grep coreassess
    cf services | grep coreassess

Expect `coreassess-srv` and `coreassess-approuter` started;
`coreassess-db-deployer` shows as stopped -- that is correct, it is a one-shot task.

    cf app coreassess-srv            # note the srv route
    cf app coreassess-approuter      # note the approuter route (the UI entry point)

## 5. Create the `coreassess-api` destination

The CAP service calls the AI API through this destination. Without it every
AI-backed action fails.

BTP cockpit -> your subaccount -> Connectivity -> Destinations -> New Destination:

    Name            coreassess-api
    Type            HTTP
    URL             https://coreassess-ai-api-v2.cfapps.us10-001.hana.ondemand.com
    Proxy Type      Internet
    Authentication  NoAuthentication
    
    Additional properties:
      HTML5.DynamicDestination  true
      WebIDEEnabled             true

The AI API has no XSUAA, so NoAuthentication is correct. It is reachable on the
public internet; anyone with the route can call it. Add authentication here only
if you also put XSUAA in front of the AI API.

Verify from the cockpit with "Check Connection" (expect 200).

## 6. Smoke test

    curl https://<approuter-route>/                     # UI loads (login redirect)
    curl https://<srv-route>/health                     # CAP srv health

OData, after authenticating in a browser:

    https://<approuter-route>/v2/odata/v4/assessment/$metadata
    https://<approuter-route>/v2/odata/v4/assessment/GetModels()

`GetModels()` proves the destination works end-to-end: CAP -> destination ->
AI API -> AI Core. It should return the 5 chat models.

## 7. Seed reference data

The container starts empty apart from the three CSVs in `db/data/`
(BTP_SERVICES_PRICE_LIST, REF_FIORIAPPS, REF_PRICELIST) and the new SkillSet seed.
The remaining reference tables come from the legacy schema:

    cf create-service-key coreassess-db coreassess-db-key
    cf service-key coreassess-db coreassess-db-key

Note `host`, `port`, `user`, `password`, `schema` from the output, then:

    cd ../docs
    python export_refdata.py --help

IMPORTANT: point source at the LEGACY schema (EB52511D3B904FEBAEB11D5680057F8E)
and target at the NEW container schema from the service key. Getting these the
wrong way round writes into the v1 data.

## 8. Point the AI API at the new container

Only after step 7 has seeded the tables:

    cf set-env coreassess-ai SCHEMA       "<new container schema>"
    cf set-env coreassess-ai TABLE_PREFIX "CRA_"
    cf set-env coreassess-ai HANA_USER    "<container user from the service key>"
    cf set-env coreassess-ai HANA_PASS    "<container password>"
    cf restart coreassess-ai

    curl https://coreassess-ai-api-v2.cfapps.us10-001.hana.ondemand.com/health

`refdata` should read `up (prefix CRA_)`. If it reports down, the tables are not
seeded -- revert TABLE_PREFIX to KCC_ and finish step 7.

---

## Known risks

**The CAP service layer has never run against a real container.** The raw SQL in
`srv/cat-service.js` was renamed `KCC_PROD_*` -> `CRA_*` and
`CATALOGSERVICE_*` -> `ASSESSMENTSERVICE_*` but never executed. Expect SQL errors
on the first smoke test of KPI/report endpoints; the standard CRUD paths should be
fine. Budget time for this rather than assuming a clean run.

**The UI had hardcoded v1 URLs**, now relative (`/v2/odata/v4/assessment/`). They
resolve through the approuter, so the UI only works via the approuter route --
not by calling the srv route directly.

**Rollback:** `cf undeploy coreassess -f --delete-services` removes everything
including the HDI container and its data. `ai_primary_data` and the legacy schema
are untouched by this MTA.
