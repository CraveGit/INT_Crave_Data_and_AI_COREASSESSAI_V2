// Next free integer key. The namespace is CRA (was kcc in v1) -- the old value
// pointed at a schema that does not exist in this container, so every caller
// (custom prompts, both ROI actions) failed at runtime.
const autoID = async (entity, ID, tx) => {
    let selectQuery = `SELECT max(${ID}) as max FROM CRA.${entity}`;
    let query = cds.parse.cql(selectQuery);
    let result = await tx.run(query);
    return (result[0] && result[0].max) ? result[0].max + 1 : 1;
}

// Resolve CoreAssess API base URL from BTP destination "coreassess-api",
// fallback to env COREASSESS_API_URL.
let _apiBase;
const getApiBase = async () => {
    if (_apiBase) return _apiBase;
    try {
        const { getDestination } = require('@sap-cloud-sdk/connectivity');
        const dest = await getDestination({ destinationName: 'coreassess-api' });
        if (dest && dest.url) return (_apiBase = dest.url.replace(/\/$/, ''));
    } catch (e) { /* fall through */ }
    _apiBase = (process.env.COREASSESS_API_URL || '').replace(/\/$/, '');
    if (!_apiBase) throw new Error('coreassess api url unresolved');
    return _apiBase;
}

// --- normalized child mapping helpers (22 tables -> ASSESSMENT_ITEM/NOTE) ---

// NCLOB (LargeString) columns read via raw SQL (tx.run(sqlString)) come back
// from the HANA driver as Node Buffers instead of strings -- the LOB is not
// materialized to text the way the CQN query builder does it. That is why
// NOTE.DESCRIPTION / DETAILEDBREAKDOWN / SCOREANALYSIS reached the UI as
// {"type":"Buffer","data":[...]} and rendered as "no description". Decode any
// Buffer (live, or an already-JSON-serialized {type:'Buffer',data:[...]}) back
// to UTF-8; pass strings/scalars through untouched.
const lobText = v => {
    if (v === null || v === undefined) return v;
    if (Buffer.isBuffer(v)) return v.toString('utf8');
    if (typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
        return Buffer.from(v.data).toString('utf8');
    }
    return v;
};

// Rank an S4 replacement row for display order:
//   0 = standard table WITH a released CDS view
//   1 = standard table with NO released alternative ("No released CDS view")
//   2 = custom table (Z/Y -> custom CDS view)
const s4Rank = (table, cds) => {
    const t = String(table || '').trim().toUpperCase();
    const c = String(cds || '').trim();
    if (t[0] === 'Z' || t[0] === 'Y') return 2;
    if (!c || /^no\b/i.test(c)) return 1;
    return 0;
};

// Coerce any analysis value to readable text. The model sometimes returns a
// nested object/array for a Description, which used to render as "[object Object]".
const asText = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (Array.isArray(v)) return v.map(asText).filter(Boolean).join('; ') || null;
    if (typeof v === 'object') return Object.values(v).map(asText).filter(Boolean).join(' — ') || null;
    return String(v);
};

// Build ASSESSMENT_ITEM rows from an analysis response for one assessment.
// Each entry: KIND + list-source + value-extractor. Skips empty sources.
const buildItems = (assessmentID, r) => {
    const ta = r.technical_analysis || {};
    const ba = r.basic_analysis || {};
    const s4 = r.highlvl_s4_analysis || {};
    const ia = r.interface_analysis || {};
    const sql = ta.SQLAnalysis || {};
    const items = [];
    const push = (kind, value, mapping, description) => {
        if (value === undefined || value === null || value === '') return;
        items.push({ ASSESSMENT_ID: assessmentID, KIND: kind, VALUE: String(value), MAPPING: mapping || null, DESCRIPTION: description || null });
    };
    const list = v => Array.isArray(v) ? v : (v ? [v] : []);

    // Split a "TABLE -> CDSVIEW (Description)" string (or a structured object)
    // into { table, cds, desc } so the S4-replacement table fills all 3 columns
    // instead of collapsing everything into the first one.
    const parseS4 = v => {
        if (v && typeof v === 'object') {
            return { table: asText(v.table || v.Table || v.name || v.Name),
                     cds: asText(v.cdsView || v.CDSView || v.CdsView || v.cds || v.CDS),
                     desc: asText(v.description || v.Description) };
        }
        const s = String(v || '');
        const parts = s.split(/\s*(?:→|->)\s*/);   // left of the arrow = table
        const table = (parts[0] || '').trim();
        let rest = (parts[1] || '').trim();
        let cds = rest, desc = '';
        const m = rest.match(/^(.*?)\s*\((.*)\)\s*$/);   // "CDSView (Description)"
        if (m) { cds = m[1].trim(); desc = m[2].trim(); }
        return { table, cds, desc };
    };

    list(ba.CRUD).forEach(v => push('CRUD', v));
    list(ba.WRICEFObjectType).forEach(v => push('WRICEF', v));
    list(ba.StandardTables).forEach(v => push('STANDARD_TABLE', v));
    list(ba.CustomTables).forEach(v => push('CUSTOM_TABLE', v));
    list(ba.BAPIs).forEach(v => push('BAPI', v));
    list(ba.FunctionModules).forEach(v => push('FUNCTION_MODULE', v));
    list(ba.UseCaseArea).forEach(v => push('USE_CASE_AREA', v));
    list(sql.TablesDirect).forEach(v => push('SQL_DIRECT', v));
    list(sql.TablesAPI).forEach(v => push('SQL_API', v));
    list(sql.TablesCDSViews).forEach(v => push('SQL_CDS', v));
    // S4 replacement rows, ordered: standard-with-CDS -> standard-without-alternative
    // -> custom (Z/Y). Stable sort keeps each group in the model's original order.
    list(sql.S4Tables)
        .map(v => ({ v, p: parseS4(v) }))
        .sort((a, b) => s4Rank(a.p.table, a.p.cds) - s4Rank(b.p.table, b.p.cds))
        .forEach(({ v, p }) => push('S4_TABLE', p.table || v, p.cds, p.desc));
    list(ia.IDocs).forEach(v => push('IDOC', v));
    list(ia.StandardAPIs).forEach(v => push('INTERFACE_API', v));
    list(ia.BOREvents).forEach(v => push('EVENT', v));
    list(ia.StandardEvents).forEach(v => push('STANDARD_EVENT', v));
    list(ia.Topics).forEach(v => push('TOPIC', v));
    list(s4.SAPStandardAPIs).forEach(v => push('STANDARD_API', v));
    list(s4.SAPStandardFioriApps).forEach(v => push('FIORI_APP', v));
    return items;
};

// Build ASSESSMENT_NOTE rows (Title/Description pairs) for one assessment.
const buildNotes = (assessmentID, r) => {
    const ta = r.technical_analysis || {};
    const s4 = r.highlvl_s4_analysis || {};
    const ia = ta.IntegrationAnalysis || {};
    const notes = [];
    const push = (kind, src) => {
        for (const k in (src || {})) {
            const o = src[k]; if (!o) continue;
            // asText flattens nested object/array descriptions (fixes [object Object]).
            notes.push({ ASSESSMENT_ID: assessmentID, KIND: kind, TITLE: asText(o.Title), DESCRIPTION: asText(o.Description) });
        }
    };
    push('CLEAN_CORE', ta.CleanCoreAnalysis);
    push('S4_RECOMMENDATION', s4.S4Recommendations);
    push('INTEGRATION', ia.IntegrationResult);
    return notes;
};

// Bucket flat ASSESSMENT_ITEM rows back into UI-facing arrays by KIND.
// Preserves legacy GetObjectType field names the UI consumes.
const bucketItems = rows => {
    const b = {
        WRICEF_OBJECT_TYPE: [], READ_CRUD: [], STANDARD_TABLES: [], CUSTOM_TABLES: [],
        NEW_S4_TABLES: [], SQL_ANALYSIS_TABLES_DIRECT: [], SQL_ANALYSIS_TABLES_API: [],
        SQL_ANALYSIS_TABLES_CDS: [], BAPIS: [], FUNCTION_MODULES: [], INTERFACE_IDOCS: [],
        INTERFACE_STANDARD_API: [], USE_CASE_AREA: [], EVENTS: [], STANDARD_EVENTS: [],
        TOPICS: [], SAP_STANDARD_API: [], SAP_STANDARD_FIORI_APP: []
    };
    const KIND_TO_FIELD = {
        WRICEF: ['WRICEF_OBJECT_TYPE', 'WRICEF_OBJECT_TYPE'], CRUD: ['READ_CRUD', 'READ_CRUD'],
        STANDARD_TABLE: ['STANDARD_TABLES', 'TABLE_NAME'], CUSTOM_TABLE: ['CUSTOM_TABLES', 'TABLE_NAME'],
        S4_TABLE: ['NEW_S4_TABLES', 'S4_TABLES'], SQL_DIRECT: ['SQL_ANALYSIS_TABLES_DIRECT', 'TABLE_NAME'],
        SQL_API: ['SQL_ANALYSIS_TABLES_API', 'SQL_ANALYSIS_TABLES_API'], SQL_CDS: ['SQL_ANALYSIS_TABLES_CDS', 'SQL_ANALYSIS_TABLES_CDS'],
        BAPI: ['BAPIS', 'BAPIS'], FUNCTION_MODULE: ['FUNCTION_MODULES', 'FUNCTION_MODULES'],
        IDOC: ['INTERFACE_IDOCS', 'IDOCS'], INTERFACE_API: ['INTERFACE_STANDARD_API', 'STANDARD_API'],
        USE_CASE_AREA: ['USE_CASE_AREA', 'USE_CASE_AREA'], EVENT: ['EVENTS', 'EVENTS'],
        STANDARD_EVENT: ['STANDARD_EVENTS', 'STANDARD_EVENTS'], TOPIC: ['TOPICS', 'TOPICS'],
        STANDARD_API: ['SAP_STANDARD_API', 'SAP_STANDARD_API'], FIORI_APP: ['SAP_STANDARD_FIORI_APP', 'SAP_STANDARD_FIORI_APP']
    };
    for (const row of rows) {
        const m = KIND_TO_FIELD[row.KIND]; if (!m) continue;
        const [field, valueKey] = m;
        const o = { ASSESSMENT_ID: row.ASSESSMENT_ID, ID: row.ID, [valueKey]: row.VALUE };
        if (row.MAPPING) o.MAPPING = lobText(row.MAPPING);
        if (row.DESCRIPTION) o.DESCRIPTION = lobText(row.DESCRIPTION);
        b[field].push(o);
    }
    // Order the S4 replacements at read time too, so the sort holds regardless of
    // DB row order and applies to objects analysed before the ordering was added.
    b.NEW_S4_TABLES.sort((x, y) => s4Rank(x.S4_TABLES, x.MAPPING) - s4Rank(y.S4_TABLES, y.MAPPING));
    return b;
};

// Bucket ASSESSMENT_NOTE rows into UI-facing arrays by KIND.
const bucketNotes = rows => {
    const b = { CLEAN_CORE_ANALYSIS: [], HIGH_LVL_RECOMMENDATIONS: [], INTEGERATION_RESULT: [] };
    const KIND_TO_FIELD = { CLEAN_CORE: 'CLEAN_CORE_ANALYSIS', S4_RECOMMENDATION: 'HIGH_LVL_RECOMMENDATIONS', INTEGRATION: 'INTEGERATION_RESULT' };
    for (const row of rows) {
        const field = KIND_TO_FIELD[row.KIND]; if (!field) continue;
        b[field].push({ ASSESSMENT_ID: row.ASSESSMENT_ID, ID: row.ID, TITLE: lobText(row.TITLE), DESCRIPTION: lobText(row.DESCRIPTION) });
    }
    return b;
};

module.exports = autoID;
module.exports.getApiBase = getApiBase;
module.exports.lobText = lobText;
module.exports.buildItems = buildItems;
module.exports.buildNotes = buildNotes;
module.exports.bucketItems = bucketItems;
module.exports.bucketNotes = bucketNotes;
