"""One-time: transform ai-api referencedata CSVs into CAP seed CSVs (db/data/).
Headers rewritten to match schema.cds element names; ID keys added.
Run once; output committed as CRA-<Entity>.csv."""
import csv, io, re, os

SRC = "W:/_PROJECT_COREASSESSAI/btp_cloud/INT_CRAVE_COREASSESS_V2/coreassess-ai-api/referencedata"
OUT = "W:/_PROJECT_COREASSESSAI/btp_cloud/INT_CRAVE_COREASSESS_V2/coreassess-app/db/data"
os.makedirs(OUT, exist_ok=True)

# ---- pricelist -> REF_PRICELIST + BTP_SERVICES_PRICE_LIST -------------------
# CSV cols: itemcode,item,in blocks,metrics,price per unit,currency,fees,volume from,volume to
with open(f"{SRC}/pricelist.csv", encoding="latin1") as f:
    raw = f.read().replace("\xa0", " ")
rows = list(csv.DictReader(io.StringIO(raw)))

def num(v):
    v = (v or "").replace(",", "").strip()
    if v.lower() == "infinite": return "1000000000"
    return v

# REF_PRICELIST: IN_BLOCKS (Integer), PRICE_PER_UNIT (String)
with open(f"{OUT}/CRA-REF_PRICELIST.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["ID","ITEMCODE","ITEM","IN_BLOCKS","METRICS","PRICE_PER_UNIT","CURRENCY","FEES","VOLUME_FROM","VOLUME_TO"])
    for i, r in enumerate(rows, 1):
        w.writerow([i, r.get("itemcode",""), r.get("item",""), num(r.get("in blocks","")) or "0",
                    r.get("metrics",""), num(r.get("price per unit","")), r.get("currency",""),
                    r.get("fees",""), r.get("volume from",""), r.get("volume to","")])

# BTP_SERVICES_PRICE_LIST: IN_BLOCKS_OF (Integer), PRICE_PER_UNIT (Decimal)
with open(f"{OUT}/CRA-BTP_SERVICES_PRICE_LIST.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["ID","ITEMCODE","ITEM","IN_BLOCKS_OF","METRICS","PRICE_PER_UNIT","CURRENCY","FEES","VOLUME_FROM","VOLUME_TO"])
    for i, r in enumerate(rows, 1):
        ppu = num(r.get("price per unit",""))
        try: ppu = f"{float(ppu):.2f}" if ppu else "0.00"
        except ValueError: ppu = "0.00"
        w.writerow([i, r.get("itemcode",""), r.get("item",""), num(r.get("in blocks","")) or "0",
                    r.get("metrics",""), ppu, r.get("currency",""),
                    r.get("fees",""), r.get("volume from",""), r.get("volume to","")])

print(f"pricelist rows: {len(rows)}")

# ---- fioriapps -> REF_FIORIAPPS -------------------------------------------
# Map friendly CSV header -> entity element (key = FIORI_ID from 'fiori Id').
FIORI_MAP = {
    "fiori Id":"FIORI_ID","LineofBusiness":"LINE_OF_BUSINESS","ScopeItem":"SCOPE_ITEM",
    "RoleName":"ROLE_NAME","App Name":"APP_NAME","ApplicationType":"APPLICATION_TYPE",
    "App Launcher Title - Subtitle":"APP_LAUNCHER_TITLE","Lighthouse":"LIGHTHOUSE",
    "ApplicationComponent":"APPLICATION_COMPONENT","UITechnology":"UI_TECHNOLOGY",
    "Device Type(s)":"DEVICE_TYPE","ProductCategory":"PRODUCT_CATEGORY","Database":"DATABASE",
    "FrontendSoftwareComponent":"FRONTEND_SOFTWARE_COMPONENT","FrontendMinSP":"FRONTEND_MIN_SP",
    "BackendSoftwareComponentVersions":"BACKEND_SOFTWARE_COMPONENT_VERSIONS","BackendMinSP":"BACKEND_MIN_SP",
    "HANASoftwareComponentVersions":"HANA_SOFTWARE_COMPONENT_VERSIONS","HANAMinSP":"HANA_MIN_SP",
    "FrontendProductVersion":"FRONTEND_PRODUCT_VERSION","ProductVersionNameBackend":"PRODUCT_VERSIONNAME_BACKEND",
    "HANAProductVersion":"HANA_PRODUCT_VERSION","FrontendProductVersionStack":"FRONTEND_PRODUCT_VERSION_STACK",
    "BackendProductVersionStack":"BACKEND_PRODUCT_VERSION_STACK","HANAProductVersionStack":"HANA_PRODUCT_VERSION_STACK",
    "NoteCollection":"NOTE_COLLECTION","Semantic Object Action":"SEMENTIC_OBJECT_ACTION",
    "TechnicalCatalogName":"TECHNICAL_CATALOG_NAME","TechnicalCatalogDescription":"TECHNICAL_CATALOG_DESCRIPTION",
    "BusinessCatalogName":"BUSINESS_CATALOG_NAME","BusinessCatalogDescription":"BUSINESS_CATALOG_DESCRIPTION",
    "BusinessGroupName":"BUSINESS_GROUP_NAME","BusinessGroupDescription":"BUSINESS_GROUP_DESCRIPTION",
    "Page":"PAGE","Page Title":"PAGE_TITLE","Space":"SPACE","Space Title":"SPACE_TITLE",
    "LeadingBusinessRoleName":"LEADING_BUSINESSROLE_NAME","LeadingBusinessRoleDescription":"LEADING_BUSINESSROLE_DESCRIPTION",
    "AdditionalBusinessRoleName":"ADDITIONAL_BUSINESSROLE_NAME","AdditionalBusinessRoleDescription":"ADDITIONAL_BUSINESSROLE_DESCRIPTION",
    "Industry":"INDUSTRY","Extensibility via SAPUI5 Adaptation":"EXTENSIBILITY_VIA_SAPUI5_ADAPTATION",
    "GTMAppDescription":"GTM_APP_DESCRIPTION","BSPName":"BSP_NAME","BSPApplicationURL":"BSP_APPLICATION_URL",
    "SAPUI5ComponentId":"SAPUI5_COMPONENT_ID","PrimaryODataServiceName":"PRIMARY_ODATA_SERVICE_NAME",
    "PrimaryODataServiceVersion":"PRIMARY_ODATA_SERVICE_VERSION","AdditionalODataServices":"ADDITIONAL_ODATA_SERVICES",
    "AdditionalODataServicesVersions":"ADDITIONAL_ODATA_SERVICES_VERSIONS","BexQueryName":"BEX_QUERY_NAME",
    "LeadingTransactionCodes":"LEADING_TRANSACTION_CODES","WDAConfiguration":"WDA_CONGIGURATION",
    "OData V4 Service Group":"ODATA_V4_SERVICE_GROUP","Link":"LINK",
}
with open(f"{SRC}/fioriapps.csv", encoding="utf-8-sig") as f:
    fr = list(csv.DictReader(f))
out_cols = list(FIORI_MAP.values())
seen = set(); n = 0
with open(f"{OUT}/CRA-REF_FIORIAPPS.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=out_cols); w.writeheader()
    for r in fr:
        row = {ent: (r.get(src) or "").strip() for src, ent in FIORI_MAP.items()}
        fid = row.get("FIORI_ID")
        if not fid or fid in seen:  # FIORI_ID is key -> must be unique/non-empty
            continue
        seen.add(fid); w.writerow(row); n += 1
print(f"fioriapps rows written (unique FIORI_ID): {n} / {len(fr)}")
