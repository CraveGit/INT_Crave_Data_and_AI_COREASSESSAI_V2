# CoreAssess.AI v2

**AI-assisted SAP Clean Core assessment and modernization planning for S/4HANA migrations.**

CoreAssess.AI analyzes an organization's custom ABAP (Z/Y) objects and turns each one
into an evidence-based migration decision: *retire, rebuild on-stack, go hybrid, or move
side-by-side to SAP BTP* — with a Clean Core compliance tier, an effort estimate, verified
SAP standard replacements, and ready-to-share specification documents.

---

## The problem it solves

Moving to S/4HANA and SAP's **Clean Core** strategy means every custom program, report,
enhancement and interface has to be judged: *Is it upgrade-safe? Does it touch standard
SAP the wrong way? What replaces it? How much effort to remediate?* Doing this by hand
across thousands of objects is slow, inconsistent, and hard to cost.

CoreAssess.AI automates that judgment at scale — **consistently, with an audit trail, and
grounded in live SAP catalogs** rather than an analyst's memory.

## What you get for every object

| Output | Description |
|---|---|
| **Migration approach** | retire / on-stack / hybrid / side-by-side — decided deterministically from code-scan facts, not a coin toss |
| **Clean Core tier** | current tier **A–D** (cloud-native → technical debt) *and* the achievable target tier, each with a plain-language justification |
| **Adherence & coupling** | how compliant the object is, and how tightly it's bound to standard SAP |
| **Standard replacements** | released SAP **Fiori apps, OData APIs and CDS views** that can replace the custom logic — verified against live SAP catalogs |
| **Effort & sizing** | build/logic/design/test/deploy/PM hours → person-days → **T-shirt size** (XS–XL) → priority |
| **BTP service estimate** | recommended SAP BTP services (for hybrid / side-by-side) with indicative pricing |
| **Documents** | generated **FSD / TSD / BBP** as Word `.docx`, refinable through an in-app AI assistant, with version history |

## Key capabilities

- **Deterministic decision engine** — approach, adherence, coupling and Clean Core tier
  are derived from a code fact-scan plus LLM observations, so the same object always yields
  the same verdict (no randomness, fully explainable).
- **Live grounding, not hallucination** — recommended Fiori apps and APIs are resolved and
  verified against the **SAP Fiori Apps Library** and **SAP API Hub** through an MCP
  connector; if grounding is unavailable, the run fails rather than emit guesses.
- **Document generation suite** — section-by-section FSD/TSD/BBP with diagrams, an AI
  editing assistant, deep source-level analysis, and saved versions.
- **Multi-tenant workspace** — companies → projects → assessments, role-based access
  (owner / admin / superuser / user), per-project cost & token tracking, retained pricing
  history, and a support-ticket workflow.
- **ROI tooling** — model the financial case for modernization alongside the technical one.

## How it works

```
        SAP UI5 Fiori UI  ──►  CAP OData service  ──►  FastAPI analysis + doc-gen  ──►  SAP AI Core (LLMs)
        (standalone approuter)      (HANA CRA_*)              │
                                                              └──►  MCP connector ──►  SAP Fiori Library / API Hub
```

Two independently-deployed components (plus one external MCP connector):

| Path | CF app | Stack | Role |
|---|---|---|---|
| [`coreassess-app/`](./coreassess-app) | `coreassess` (MTA) | SAP CAP · UI5 1.130 · OData V2 · standalone approuter · HANA Cloud | OData service, Fiori UI, auth, multi-tenant data, cost tracking |
| [`coreassess-ai-api/`](./coreassess-ai-api) | `coreassess-ai` | Python · FastAPI · gunicorn/uvicorn · SAP AI Core | ABAP analysis, decision engine, effort model, document generation |
| *(separate repo)* | `ai-sap-connectors` | Python · FastMCP | live Fiori/API grounding via MCP |

The CAP app reaches the AI API over a BTP **destination** (`coreassess-api`); the AI API
reaches the MCP over HTTP. The LLM tier is model-agnostic (Claude / GPT via SAP AI Core),
selectable per request.

## Tech stack

**Backend/UI:** SAP CAP (Node.js), SAPUI5 1.130, OData V2 (via `@sap/cds-odata-v2-adapter-proxy`),
SAP HANA Cloud, standalone approuter, XSUAA.
**AI service:** Python 3.11, FastAPI, `python-docx`, SAP Generative AI Hub SDK (SAP AI Core).
**Grounding:** FastMCP connector over the SAP Fiori Apps Library + SAP API Hub.
**Platform:** SAP BTP, Cloud Foundry (us10).

## Repository structure

```
coreassess-app/       CAP service + UI5 Fiori app + approuter (deployed as one MTA)
  ├─ db/              CDS data model + seed data
  ├─ srv/             OData service + handlers
  ├─ app/webapp/      UI5 Fiori frontend
  └─ approuter/       standalone approuter
coreassess-ai-api/    FastAPI analysis + document-generation service
  ├─ modules/         decision engine, sizing, grounding, helpers
  └─ docsuite/        FSD/TSD/BBP generation + rendering
docs/                 component setup notes
DEPLOY.md             end-to-end deploy guide
```

## Getting started

Deploying to SAP BTP? See **[DEPLOY.md](./DEPLOY.md)** for the full end-to-end guide
(prereqs, order, env vars, post-deploy, troubleshooting).

Local dev:
- **UI/CAP:** `cd coreassess-app && npm install && npm run watch`
- **AI API:** `cd coreassess-ai-api && pip install -r requirements.txt && uvicorn main:app --reload`
  (copy `.env.example` → `.env` and fill in SAP AI Core + HANA credentials).

## Documentation

- [DEPLOY.md](./DEPLOY.md) — deployment guide
- [`docs/`](./docs) — component setup & data notes
- **Technical & functional specifications — coming soon.**

## Security

No credentials are committed. Secrets live in `.env` (gitignored) locally and in
`cf set-env` on Cloud Foundry. See `coreassess-ai-api/.env.example` for the required keys.

---

*Internal Crave Infotech project. © Crave Infotech.*
