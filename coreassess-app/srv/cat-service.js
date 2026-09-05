const cds = require('@sap/cds');
const XLSX = require('xlsx');
const axios = require('axios');
const autoID = require('./util');
const util = require('./util');

// Preselected in the UI dropdown; the AI API applies its own default if omitted.
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'anthropic--claude-4.8-opus';

// Local development only. UI5 fetches OData over XHR, and browsers do not raise a
// basic-auth prompt for background requests -- so `cds watch` always arrives as
// 'anonymous', every handler returns [], and nothing renders. Mapping anonymous to
// a seeded user makes the app usable locally. Requires an explicit env opt-in and
// is inert in production, where the approuter supplies a real identity.
// Set via cds.env (package.json -> cds.devFallbackUser) so it needs no extra
// dependency, and only applies when auth is mocked -- i.e. never in production.
const DEV_USER = process.env.DEV_FALLBACK_USER
    || (cds.env.requires?.auth?.kind === 'mocked' ? cds.env.devFallbackUser : null);
// The login id is lowercased so it matches stored USERNAMEs, which are always
// saved lowercased (createUserRow). The IdP sends mixed case (e.g. John@X.com),
// so without this the case-sensitive USERNAME lookup misses the row and the user
// is treated as USER even when added as ADMIN.
const currentUser = req => {
    const id = (DEV_USER && (!req.user?.id || req.user.id === 'anonymous')) ? DEV_USER : req.user?.id;
    return id ? String(id).toLowerCase() : id;
};

// Env-driven admin allow-list (comma-separated logins), so the app is usable on a
// freshly-deployed, empty database: a listed user is treated as ADMIN even with no
// MSTR_USER row. Case-insensitive. Set via `cf set-env coreassess-srv ADMIN_USERS`.
const ADMIN_USERS = (process.env.ADMIN_USERS || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const isEnvAdmin = u => !!u && ADMIN_USERS.includes(String(u).toLowerCase());

// Role hierarchy for the admin panel. The owner is fixed (can provision
// admins); everyone else's role comes from MSTR_USER.ROLE. Rank is used to decide
// who may create/act on whom.
// Cap how long an object analysis may run before we fail fast (the analysis
// fans out to several LLM calls, so allow a generous default). Overridable.
const ANALYZE_TIMEOUT_MS = parseInt(process.env.ANALYZE_TIMEOUT_MS || '180000', 10);
// Docgen generates a full multi-section document in one LLM call (up to 16k
// output tokens). At ~55 tok/s on gpt-4o a worst-case document approaches ~300s,
// so a 300s cap would 504 while the AI is still working. Size the chain so the
// innermost timeout fails first with a clean message:
//   CAP->AI axios (540s) < approuter destination (600s, mta.yaml) < worker (900s, gunicorn -t)
const DOC_TIMEOUT_MS = parseInt(process.env.DOC_TIMEOUT_MS || '540000', 10);
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'rohan.chavan@craveinfotech.com').toLowerCase();
const isOwner = u => !!u && String(u).toLowerCase() === OWNER_EMAIL;
const ROLE_RANK = { OWNER: 4, ADMIN: 3, SUPERUSER: 2, USER: 1 };
const roleRank = r => ROLE_RANK[String(r || '').toUpperCase()] || 0;

module.exports = cds.service.impl(function () {
    const { COST_LEDGER, LLMChatHistory, BTP_SERVICES_PRICE_LIST, BTP_SERVICES, ASSESSMENT, ASSESSMENT_ITEM, ASSESSMENT_NOTE, ASSESSMENT_USAGE, KPI_D_GRAPH_1, KPI_D_GRAPH_2, KPI_D_GRAPH_3, MSTR_USER, PROPMT, MSTR_COMPANY, MSTR_PROJECT, OBJECT_ESTIMATE_ANSWER, MSTR_QUESTIONNAIRE, CONFIG_MSTR, CONFIG_DETAILS, COMPANY_USER_MAP, CustomerData_ROI, BTP_SERVICES_TOTAL_PER_PROJECT, ROI_Calculation, YearCalculation, YEAR, SkillSet, ROI_Calculation_Output, FILE_STORAGE, AUTHORIZATION_CHECK, FIELD_VALUES, APP_LOG, FEEDBACK, ACCESS_REQUEST, TICKET } = this.entities;

    // Fire-and-forget operational log. Never throws into caller.
    const logEvent = async ({ level = 'INFO', source = 'CAP', action, message, context, user, assessmentID, projectID }) => {
        try {
            await INSERT.into(APP_LOG).entries({
                LEVEL: level, SOURCE: source, ACTION: action || null,
                MESSAGE: message ? String(message).slice(0, 1000) : null,
                CONTEXT: context ? (typeof context === 'string' ? context : JSON.stringify(context)) : null,
                USER: user || null, ASSESSMENT_ID: assessmentID || null, PROJECT_ID: projectID || null
            });
        } catch (e) { console.error('logEvent failed:', e.message); }
    };

    this.before('CREATE', 'ASSESSMENT', async req => {
        try {
            const data = req.data;
            console.log('In assesment create: ', data);
        } catch (error) {
            console.log(error);
        }
    })

    //access according to role for project 
    this.on('READ', 'MSTR_PROJECT', async (req) => {
        try {
            const user = currentUser(req);
            console.log("User:", user);

            if (user === 'anonymous') {
                return [];
            }

            const dbUser = await SELECT.from(COMPANY_USER_MAP).columns('COMPANY_ID').where({ USERNAME: user });
            const userRole = await SELECT.one.from(MSTR_USER).where({ USERNAME: user });

            // Admin and owner see all; everyone else is scoped to their
            // mapped companies below.
            const rl = String(userRole?.ROLE || '').toUpperCase();
            if (rl === 'ADMIN' || rl === 'OWNER' || isEnvAdmin(user) || isOwner(user)) {
                return cds.run(req.query);
            }

            if (!dbUser || dbUser.length === 0) {
                return [];
            }

            const companyIDs = dbUser.map((item) => item.COMPANY_ID);

            req.query.where('COMPANY_ID in', companyIDs);

            return cds.run(req.query);
        } catch (error) {
            console.error('Error in READ handler for MSTR_PROJECT:', error);
            req.error(500, 'An error occurred while processing your request.');
        }
    });

    //access according to role for company 
    this.on('READ', 'MSTR_COMPANY', async (req) => {
        try {
            const user = currentUser(req);
            console.log("User:", user);

            if (user === 'anonymous') {
                return [];
            }

            const dbUser = await SELECT.from(COMPANY_USER_MAP).columns('COMPANY_ID').where({ USERNAME: user });
            const userRole = await SELECT.one.from(MSTR_USER).where({ USERNAME: user });

            // Admin and owner see all; everyone else is scoped to their
            // mapped companies below.
            const rl = String(userRole?.ROLE || '').toUpperCase();
            if (rl === 'ADMIN' || rl === 'OWNER' || isEnvAdmin(user) || isOwner(user)) {
                return cds.run(req.query);
            }

            if (!dbUser || dbUser.length === 0) {
                return [];
            }

            const companyIDs = dbUser.map((item) => item.COMPANY_ID);

            req.query.where('ID in', companyIDs);

            return cds.run(req.query);
        } catch (error) {
            console.error('Error in READ handler for MSTR_COMPANY:', error);
            req.error(500, 'An error occurred while fetching company data.');
        }
    });

    this.before('CREATE', 'MSTR_COMPANY', async req => {
        // A company name must be unique (case-insensitive).
        const name = String(req.data.COMPANY_NAME || '').trim();
        if (name) {
            const rows = await SELECT.from(MSTR_COMPANY).columns('COMPANY_NAME');
            if (rows.some(r => String(r.COMPANY_NAME || '').trim().toLowerCase() === name.toLowerCase())) {
                return req.error(409, `A company named "${name}" already exists.`);
            }
        }
        try {
            const { maxID } = await SELECT.one.from(MSTR_COMPANY).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })

    //autoid
    this.before('CREATE', 'MSTR_PROJECT', async req => {
        // A project name must be unique within its company (case-insensitive).
        const name = String(req.data.PROJECT_NAME || '').trim();
        const companyId = req.data.COMPANY_ID;
        if (name && companyId != null) {
            const rows = await SELECT.from(MSTR_PROJECT).columns('PROJECT_NAME').where({ COMPANY_ID: companyId });
            if (rows.some(r => String(r.PROJECT_NAME || '').trim().toLowerCase() === name.toLowerCase())) {
                return req.error(409, `A project named "${name}" already exists in this company.`);
            }
        }
        try {
            const { maxID } = await SELECT.one.from(MSTR_PROJECT).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })

    //autoid
    this.before('CREATE', 'FILE_STORAGE', async req => {
        try {
            const { maxID } = await SELECT.one.from(FILE_STORAGE).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })

    this.before('CREATE', 'TSHIRT_CONFIG', async req => {
        try {
            const { maxID } = await SELECT.one.from(TSHIRT_CONFIG).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })

    this.before('CREATE', 'PRIORITY_CONFIG', async req => {
        try {
            const { maxID } = await SELECT.one.from(PRIORITY_CONFIG).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })

    //convert excel to json format
    async function base64ExcelToJson(base64Data, sheetNo) {
        const binaryData = Buffer.from(base64Data, 'base64');
        const workbook = XLSX.read(binaryData, { type: 'buffer' });
        const sheetName = workbook.SheetNames[sheetNo];
        console.log(sheetName);
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = jsonData[0];
        const rows = jsonData.slice(1);
        console.log(rows.length);
        const result = rows.map(row => {
            let rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = row[index] || null;
            });
            return rowObject;
        });
        return result;
    }

    //convert string to number by removing commas
    function sanitizeString(s) {
        if (typeof s === 'string') {
            s = s.replace(/,/g, '');
        }
        return isNaN(s) ? null : parseFloat(s);
    }

    this.on('UploadFile', async req => {
        try {
            const data = req.data;
            const extractedData = await base64ExcelToJson(data.ObjectContent, 0);
            let id = 330;

            for (const x of extractedData) {
                if (x['Sr. No.'] === null) break;
                x.ID = id;
                x.PROJECT_ID = 2;
                x.PROJECT_COMPANY_ID = 1;
                x.OBJECT_NAME = x['Object Name'];
                x.SAP_MODULE_NAME = x['SAP Module'];
                x.FUNCTIONAL_ANALYSIS = x['Functional Analysis'];
                x.CODE_COMPLEXITY = x['Complexity'];
                x.TShirt = x['T-Shirt'];
                x.Efforts = x['Efforts'];
                x.COUPLING = x['Coupling'];
                x.HIGH_LVL_RECOMMENDATIONS = [];
                x.HIGH_LVL_RECOMMENDATIONS.push({ ASSESSMENT_ID: x.ID, DESCRIPTION: x['First high-level analysis against S/4HANA standard functions and Recommendations'] });
                x.WRICEF_OBJECT_TYPE = [];
                x.WRICEF_OBJECT_TYPE.push(
                    {
                        ASSESSMENT_ID_ID: x.ID,
                        WRICEF_OBJECT_TYPE: x['WRICEF Object Type']
                    }
                )
                x.APPROACH = x['Approach'];

                let servicesArray = [];
                let arr = [];
                if (x['SAP BTP Services']) {

                    servicesArray = x['SAP BTP Services'].split('\n');
                    console.log("services array: ", servicesArray);
                    for (let i = 0; i < servicesArray.length; i++) {
                        let obj = {}
                        obj.ID = i + 1;
                        obj.ASSESSMENT_ID_ID = x.ID;
                        obj.SERVICE_NAME = servicesArray[i];
                        arr.push(obj);
                    }
                }

                console.log("arr : ", arr);
                x.BTP_SERVICES = arr;
                id += 1
            }

            // Legacy bulk Excel import. Child rows now normalized (ITEM/NOTE); the
            // old per-array inserts were dead (property on array, not rows) so dropped.
            extractedData.splice(extractedData.length - 2, 2)
            await INSERT.into(ASSESSMENT).entries(extractedData);

            return extractedData;
        } catch (error) {
            console.log(error);
        }
    })

    this.on('UploadPriceFile', async req => {
        try {
            const { Content } = req.data;
            console.log();
            // const decodedText = Buffer.from(base64String, 'base64').toString('utf-8');

            const extractedData = await base64ExcelToJson(Content, 0);
            let id = 1;

            for (const x of extractedData) {
                x.ID = id;

                x.ITEMCODE = x['itemcode']
                x.ITEM = x['item']
                x.IN_BLOCKS_OF = x['in blocks']
                x.METRICS = x['metrics']
                x.PRICE_PER_UNIT = sanitizeString(x['price per unit'])
                x.CURRENCY = x['currency']
                x.FEES = x['fees']
                x.VOLUME_FROM = x['volume from']
                x.VOLUME_TO = x['volume to']

                id += 1;
                console.log(x);
            }
            await INSERT.into(BTP_SERVICES_PRICE_LIST).entries(extractedData);

            // return decodedText;
            return true;
        } catch (error) {
            console.log(error);
            return req.error(500, 'Internal server error')
        }
    })

    this.on('UploadObject', async req => {
        try {
            let { ObjectName, ObjectContent, SourceFiles, PROJECT_ID, PROJECT_COMPANY_ID, Skillset, UserEmail, model } = req.data;  //Skillset
            const emailLc = String(UserEmail || '').toLowerCase();
            // Owner and env-admins have no MSTR_USER row / no upload quota, so they
            // bypass the user-row and token-limit checks (otherwise they got a 403
            // "user not found" and could never upload). The IRPA bot is exempt too.
            const uploadExempt = UserEmail === "IRPA Bot" || isOwner(emailLc) || isEnvAdmin(emailLc);
            let user;
            if (!uploadExempt) {
                user = await SELECT.one.from(MSTR_USER).where({ USERNAME: emailLc });
                console.log(user);
                if (!user) return req.error(403, 'Access denied: User not found');

                if (user.UPLOADEDOBJECTS >= user.ALLOWEDOBJECTS) {
                    return req.error(403, 'Your token limit to upload the object has exceeded');
                }
            }

            const objectName = await SELECT.one.from(ASSESSMENT).columns('OBJECT_NAME as objectName').where({ OBJECT_NAME: ObjectName, PROJECT_ID: PROJECT_ID });

            // An object can only be assessed once per project. Block a duplicate
            // upload up front, before the (paid) analysis call runs.
            if (objectName !== undefined) {
                return req.error(409, `An assessment for "${ObjectName}" already exists in this project.`);
            }

            // Company- and project-wide caps (independent of the per-user quota).
            // Null limit = unlimited. Enforced against the CUMULATIVE consumed counter
            // (not the live row count), so deleting objects never frees the cap --
            // consumption is transparent; raise the limit to allow more.
            const proj = await SELECT.one.from(MSTR_PROJECT).columns('OBJECT_LIMIT', 'OBJECTS_CONSUMED').where({ ID: PROJECT_ID, COMPANY_ID: PROJECT_COMPANY_ID });
            if (proj && proj.OBJECT_LIMIT != null && (proj.OBJECTS_CONSUMED || 0) >= proj.OBJECT_LIMIT) {
                return req.error(403, `Project object limit reached (${proj.OBJECTS_CONSUMED || 0}/${proj.OBJECT_LIMIT}). Ask an admin to raise the project limit.`);
            }
            const comp = await SELECT.one.from(MSTR_COMPANY).columns('OBJECT_LIMIT', 'OBJECTS_CONSUMED').where({ ID: PROJECT_COMPANY_ID });
            if (comp && comp.OBJECT_LIMIT != null && (comp.OBJECTS_CONSUMED || 0) >= comp.OBJECT_LIMIT) {
                return req.error(403, `Company object limit reached (${comp.OBJECTS_CONSUMED || 0}/${comp.OBJECT_LIMIT}). Ask an admin to raise the company limit.`);
            }

            const SkillsetName = await SELECT.one.from(SkillSet).columns('Name').where({ ID: Skillset });
            let flag = false;
            if (objectName !== undefined) { flag = true; }

            let response;
            try {
                response = await axios.post(`${await util.getApiBase()}/analyze`, {
                    "abap_object": ObjectContent,
                    "SkillSet": SkillsetName,
                    "ObjectName": ObjectName,
                    "CompanyID": PROJECT_COMPANY_ID,
                    "ProjectID": PROJECT_ID,
                    "model": model || DEFAULT_MODEL
                }, { timeout: ANALYZE_TIMEOUT_MS });
            } catch (err) {
                // Fail fast with a clear message instead of hanging the UI forever
                // when the analysis service is slow or unreachable.
                const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
                const status = err.response && err.response.status;
                // The AI API returns { error: { code, message } }; surface its reason
                // (e.g. MCP grounding unavailable -> code "mcp_unavailable") so the
                // object's failure note says WHY, not just "unavailable".
                const aiErr = err.response && err.response.data && err.response.data.error;
                const aiMsg = aiErr && aiErr.message;
                await logEvent({ level: 'ERROR', action: 'UploadObject', message: `analyze ${isTimeout ? 'timeout' : 'failed'} (${status || 'no-status'}${aiErr ? '/' + aiErr.code : ''}): ${aiMsg || err.message}`, user: UserEmail, projectID: PROJECT_ID });
                if (isTimeout) {
                    return req.error(504, `Analysis timed out for "${ObjectName}". Please try again.`);
                }
                // Grounding (MCP) down -> object is not analysed; propagate the reason.
                if (aiMsg) {
                    return req.error(status || 502, `Analysis failed for "${ObjectName}": ${aiMsg}`);
                }
                return req.error(504, `The analysis service is unavailable. Please try again later.`);
            }

            const objectResponse = response.data;
            console.log(objectResponse);


            let { maxAssessmentID } = await SELECT.one.from(ASSESSMENT).columns('MAX(ID) as maxAssessmentID');
            maxAssessmentID += 1;

            const assessmentObj = {
                ID: maxAssessmentID,
                PROJECT_ID: PROJECT_ID,
                PROJECT_COMPANY_ID: PROJECT_COMPANY_ID,
                OBJECT_NAME: ObjectName,
                SAP_MODULE_NAME: objectResponse.basic_analysis.SAPModule,
                FUNCTIONAL_ANALYSIS: objectResponse.basic_analysis.FunctionalAnalysis,
                CODE_COMPLEXITY: objectResponse.basic_analysis.LogicComplexity,
                APPROACH: objectResponse.basic_analysis.RecommendedApproach,
                ADHERENCE: objectResponse.basic_analysis.CleanCoreAdherence,
                // Coupling is computed deterministically by the AI API but was not
                // being saved, so the Coupling column showed empty.
                COUPLING: objectResponse.basic_analysis.Coupling,
                // Clean Core tier (SAP Extensibility Classification Level): current + target.
                CLEANCORE_TIER: objectResponse.basic_analysis.CleanCoreTier,
                CLEANCORE_TIER_REASON: objectResponse.basic_analysis.CleanCoreTierReason,
                CLEANCORE_TARGET_TIER: objectResponse.basic_analysis.CleanCoreTargetTier,
                CLEANCORE_TARGET_TIER_REASON: objectResponse.basic_analysis.CleanCoreTargetTierReason,
                SQL_RECOMMENDATION: objectResponse.technical_analysis.SQLAnalysis.SQLRecommendation,
                TOKEN_SIZE: objectResponse.basic_analysis.TokenSize,
                SCREENS_USED: objectResponse.basic_analysis.ScreensUsed,
                S4_ANALYSIS: objectResponse.highlvl_s4_analysis.S4Analysis,
                INTER_MODULE_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.InterModuleIntegration,
                UI_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.UIIntegration,
                THIRD_PARTY_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.ThirdPartyIntegration,
                BDC_USED: objectResponse.basic_analysis.BDCUsed,
                Efforts: objectResponse.basic_analysis.ManEfforts,
                HOURS_PER_DAY: objectResponse.basic_analysis.HoursPerDay ?? 8,
                TShirt: objectResponse.basic_analysis.TShirtSize,
                PRIORITY: objectResponse.basic_analysis.Priority,
                INTEGRATION_MODERNIZATION: objectResponse.interface_analysis.IntegrationModernization,
                USE_CASE_AREA_EXPLANATION: objectResponse.basic_analysis.UseCaseAreaExplanation,
                SAP_SUB_MODULE: objectResponse.basic_analysis.SAPSubModule,
                CODELENGTH: objectResponse.basic_analysis.CodeLength,
                DEVELOPMENTAPPROACH: objectResponse.technical_analysis.DevelopmentApproach,
                RAW_ANALYSIS: JSON.stringify(objectResponse),
                SOURCE_CODE: ObjectContent,   // kept for DocGen deep analysis
                SOURCE_FILES: SourceFiles || null,   // names only (shown in Overview)

                IDENTIFIER: flag === true ? '1' : null,
                RETIRE_EXPLAINATION: objectResponse.basic_analysis.RetireExplanation,
                REIMPLEMENTATION: objectResponse.basic_analysis.Reimplementation,
                CODEQUALITYSCORE: objectResponse.basic_analysis.CodeQualityScore,
                CODEQUALITYSCORERATIO: objectResponse.basic_analysis.CodeQualityScoreRatio,
                CRITICALITY: objectResponse?.technical_analysis?.SQLAnalysis?.AuthorizationChecks?.Criticality ?? null,
                USAGECONTEXT: objectResponse?.technical_analysis?.SQLAnalysis?.AuthorizationChecks?.UsageContext ?? null,
                CODEREFERENCE: objectResponse?.technical_analysis?.SQLAnalysis?.AuthorizationChecks?.CodeReference ?? null,
                DETAILEDBREAKDOWN: JSON.stringify(objectResponse.basic_analysis.DetailedBreakdown),
                SCOREANALYSIS: JSON.stringify(objectResponse.basic_analysis.ScoreAnalysis),
                // FIELD_VALUES: JSON.stringify(objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.Field_values)
            };

            // Normalized children (22 tables collapsed to ITEM/NOTE via helpers).
            const itemRows = util.buildItems(maxAssessmentID, objectResponse);
            const noteRows = util.buildNotes(maxAssessmentID, objectResponse);

            let { maxBTPSrvcsID } = await SELECT.one.from(BTP_SERVICES).columns('MAX(ID) as maxBTPSrvcsID');
            if (!maxBTPSrvcsID || Number.isNaN(maxBTPSrvcsID)) {
                maxBTPSrvcsID = 0;
            }
            const btpServicesObj = [];
            for (const btpObj in objectResponse.technical_analysis.BTPServices) {
                const obj = {
                    ID: maxBTPSrvcsID + 1,
                    ASSESSMENT_ID_ID: maxAssessmentID,
                    SERVICE_NAME: objectResponse.technical_analysis.BTPServices[btpObj].ServiceName,
                    BLOCKS_REQUIRED: objectResponse.technical_analysis.BTPServices[btpObj].BlocksRequired,
                    METRIC: objectResponse.technical_analysis.BTPServices[btpObj].Metric,
                    PRICE: objectResponse.technical_analysis.BTPServices[btpObj].Price,
                    CURRENCY: objectResponse.technical_analysis.BTPServices[btpObj].Currency,
                    SERVICE_ID: objectResponse.technical_analysis.BTPServices[btpObj].ServiceID,
                    UNITPRICE: objectResponse.technical_analysis.BTPServices[btpObj].UnitPrice
                };
                maxBTPSrvcsID += 1;
                btpServicesObj.push(obj);
            }

            // Token/cost usage (new additive analysis output; null-safe).
            const u = objectResponse.usage || {};
            const usageObj = (u && (u.total_tokens || u.TotalTokens)) ? {
                ASSESSMENT_ID: maxAssessmentID,
                INPUT_TOKENS: u.input_tokens ?? u.InputTokens ?? null,
                OUTPUT_TOKENS: u.output_tokens ?? u.OutputTokens ?? null,
                TOTAL_TOKENS: u.total_tokens ?? u.TotalTokens ?? null,
                LLM_CALLS: u.llm_calls ?? u.LLMCalls ?? null,
                COST_USD: u.cost_usd ?? u.CostUSD ?? null
            } : null;

            const AUTHORIZATION_CHECK_1 = [];
            for (const authCheck in objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks) {
                const obj = {
                    ASSESSMENT_ID: maxAssessmentID,
                    AUTHOBJECT: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks[authCheck].AuthObject,
                    FIELDSCHECKED: JSON.stringify(objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks[authCheck].FieldsChecked),
                    CHECKTYPE: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks[authCheck].CheckType,
                    CODEREFERENCE: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks[authCheck].CodeReference,
                }
                AUTHORIZATION_CHECK_1.push(obj);
            }
            console.log("Auth Check: ", JSON.stringify(objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks), AUTHORIZATION_CHECK_1);

            // const fieldValues = [];
            // for(let i=0; i<objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.length; i++) {
            //     fieldValues.push({
            //         ASSESSMENT_ID: maxAssessmentID,
            //         ACTVT: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.Field_values.ACTVT,
            //         OBTYP: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.Field_values.OBTYP,
            //         STSMA: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.Field_values.STSMA,
            //         BERSL: objectResponse.technical_analysis.SQLAnalysis.AuthorizationChecks.Field_values.BERSL,
            //     })
            // }

            if (objectName === undefined) {
                await cds.tx(req).run(async () => {
                    await INSERT.into(ASSESSMENT).entries(assessmentObj);
                    if (itemRows.length) await INSERT.into(ASSESSMENT_ITEM).entries(itemRows);
                    if (noteRows.length) await INSERT.into(ASSESSMENT_NOTE).entries(noteRows);
                    if (btpServicesObj.length) await INSERT.into(BTP_SERVICES).entries(btpServicesObj);
                    if (AUTHORIZATION_CHECK_1.length) await INSERT.into(AUTHORIZATION_CHECK).entries(AUTHORIZATION_CHECK_1);
                    if (usageObj) await INSERT.into(ASSESSMENT_USAGE).entries(usageObj);
                });
                console.log('Transaction successful: all entries were inserted.');
                await logEvent({ action: 'UploadObject', message: `analyzed ${ObjectName}`, user: UserEmail, assessmentID: maxAssessmentID, projectID: PROJECT_ID });

                // Cumulative consumption counters (transparent; never reset on delete).
                // Project + company each +1 (company total = sum of its projects).
                if (proj) {
                    await UPDATE(MSTR_PROJECT).set({ OBJECTS_CONSUMED: (proj.OBJECTS_CONSUMED || 0) + 1 })
                        .where({ ID: PROJECT_ID, COMPANY_ID: PROJECT_COMPANY_ID });
                }
                if (comp) {
                    await UPDATE(MSTR_COMPANY).set({ OBJECTS_CONSUMED: (comp.OBJECTS_CONSUMED || 0) + 1 })
                        .where({ ID: PROJECT_COMPANY_ID });
                }

                // Per-user consumption. For a real user, bump the counter. Owner/
                // env-admin have no row -> create one so their consumption is tracked
                // too (they stay exempt from the limit check above, just counted).
                if (user) {
                    await UPDATE(MSTR_USER).set({ UPLOADEDOBJECTS: (user.UPLOADEDOBJECTS || 0) + 1 }).where({ USERNAME: emailLc });
                } else if (emailLc && emailLc !== 'irpa bot') {
                    const existing = await SELECT.one.from(MSTR_USER).where({ USERNAME: emailLc });
                    if (existing) {
                        await UPDATE(MSTR_USER).set({ UPLOADEDOBJECTS: (existing.UPLOADEDOBJECTS || 0) + 1 }).where({ USERNAME: emailLc });
                    } else {
                        const { maxId } = await SELECT.one(['max(ID) as maxId']).from(MSTR_USER);
                        await INSERT.into(MSTR_USER).entries({
                            ID: (maxId || 0) + 1, USERNAME: emailLc, EMAIL: emailLc,
                            ROLE: isOwner(emailLc) ? 'OWNER' : (isEnvAdmin(emailLc) ? 'ADMIN' : 'USER'),
                            LICENSE_ROLE: 'Standard', ALLOWEDOBJECTS: 0, UPLOADEDOBJECTS: 1
                        });
                    }
                }
            }

            return true;
        } catch (error) {
            console.log(error);
            await logEvent({ level: 'ERROR', action: 'UploadObject', message: error.message, context: error.stack, user: req.data && req.data.UserEmail, projectID: req.data && req.data.PROJECT_ID });
            return false;
        }
    });

    this.on('GetObjects', async (req) => {
        try {
            const tx = cds.tx(req);
            const { PROJECT_ID } = req.data;

            const assessmentsQuery = `
                SELECT 
                    A.ID, PROJECT_ID, A.OBJECT_NAME, A.CREATEDBY, A.SAP_MODULE_NAME, A.BDC_USED, A.PRIORITY, A.INTEGRATION_MODERNIZATION, A.PROJECT_COMPANY_ID, A.USE_CASE_AREA_EXPLANATION, A.FUNCTIONAL_ANALYSIS, A.CODE_COMPLEXITY, A.COUPLING, A.APPROACH, A.ADHERENCE, A.CLEANCORE_TIER, A.CLEANCORE_TIER_REASON, A.CLEANCORE_TARGET_TIER, A.CLEANCORE_TARGET_TIER_REASON, A.SOURCE_FILES, A.SAP_SUB_MODULE, A.BTP_SERVICES_SEARCH, A.TShirt as TSHIRT, A.Efforts as EFFORTS, A.SQL_RECOMMENDATION, A.TOKEN_SIZE, A.SCREENS_USED, A.S4_ANALYSIS, A.UI_INTEGRATION, A.THIRD_PARTY_INTEGRATION, A.IS_ESTIMATED, A.DEVELOPMENTAPPROACH, A.CODELENGTH, A.REIMPLEMENTATION, A.CODEQUALITYSCORE, A.CODEQUALITYSCORERATIO, A.CRITICALITY, A.USAGECONTEXT, A.CODEREFERENCE, A.DETAILEDBREAKDOWN, A.SCOREANALYSIS, A.RETIRE_EXPLAINATION
                FROM CRA_ASSESSMENT A 
                WHERE PROJECT_ID = ?
            `;
            const assessments = await tx.run(assessmentsQuery, [PROJECT_ID]);
            console.log(assessments[0]);


            if (!assessments.length) {
                return [];
            }

            const assessmentIds = assessments.map((a) => a.ID);
            const assessmentPlaceholders = assessmentIds.map(() => '?').join(',');

            const fetchChildTableData = async (query, params) => {
                return await tx.run(query, params);
            };

            // Normalized reads: one ITEM query + one NOTE query, bucketed by KIND.
            const items = await tx.run(
                `SELECT ASSESSMENT_ID, ID, KIND, VALUE, MAPPING, DESCRIPTION
                 FROM CRA_ASSESSMENT_ITEM WHERE ASSESSMENT_ID IN (${assessmentPlaceholders})`,
                assessmentIds
            );
            const notes = await tx.run(
                `SELECT ASSESSMENT_ID, ID, KIND, TITLE, DESCRIPTION
                 FROM CRA_ASSESSMENT_NOTE WHERE ASSESSMENT_ID IN (${assessmentPlaceholders})`,
                assessmentIds
            );

            // BTP_SERVICES + AUTHORIZATION_CHECK stay as dedicated tables.
            const btpServices = await fetchChildTableData(
                `SELECT ASSESSMENT_ID_ID AS ASSESSMENT_ID, ID, SERVICE_NAME, BLOCKS_REQUIRED, METRIC, CURRENCY, PRICE, UNITPRICE, SERVICE_ID
                 FROM CRA_BTP_SERVICES WHERE ASSESSMENT_ID_ID IN (${assessmentPlaceholders})`,
                assessmentIds
            );
            const authCheckResult = await fetchChildTableData(
                `SELECT ASSESSMENT_ID AS ASSESSMENT_ID, AUTHOBJECT, FIELDSCHECKED, CHECKTYPE, CODEREFERENCE
                 FROM CRA_AUTHORIZATION_CHECK WHERE ASSESSMENT_ID IN (${assessmentPlaceholders})`,
                assessmentIds
            );
            const fieldValueResult = await fetchChildTableData(
                `SELECT ASSESSMENT_ID AS ASSESSMENT_ID, ACTVT, OBTYP, STSMA, BERSL
                 FROM CRA_FIELD_VALUES WHERE ASSESSMENT_ID IN (${assessmentPlaceholders})`,
                assessmentIds
            );

            assessments.forEach((assessment) => {
                const myItems = items.filter((i) => i.ASSESSMENT_ID === assessment.ID);
                const myNotes = notes.filter((n) => n.ASSESSMENT_ID === assessment.ID);
                Object.assign(assessment, util.bucketItems(myItems), util.bucketNotes(myNotes));

                // These NCLOB columns come back from raw SQL as Buffers; decode to
                // the JSON text the UI expects (else DETAILEDBREAKDOWN/SCOREANALYSIS
                // arrive as {"type":"Buffer",...} and fail to parse).
                assessment.DETAILEDBREAKDOWN = util.lobText(assessment.DETAILEDBREAKDOWN);
                assessment.SCOREANALYSIS = util.lobText(assessment.SCOREANALYSIS);

                assessment.BTP_SERVICES = btpServices.filter((b) => b.ASSESSMENT_ID === assessment.ID);
                assessment.BTP_SERVICES_COMBINED = assessment.BTP_SERVICES.map((b) => b.SERVICE_NAME).join(', ');
                assessment.AUTHORIZATION_CHECK = authCheckResult.filter((b) => b.ASSESSMENT_ID === assessment.ID);
                assessment.FIELD_VALUES = fieldValueResult.filter((b) => b.ASSESSMENT_ID === assessment.ID);
            });

            return assessments;
        } catch (error) {
            console.error(error);
            return false;
        }
    });


    this.on('GetKPIGraph_1', async req => {
        try {
            const tx = cds.tx(req);
            const { PROJECT_ID } = req.data;
            const selectQuery = `SELECT * from ASSESSMENTSERVICE_VW_GRAPH_MODULE_WISE_REPORT WHERE PROJECT_ID = ${PROJECT_ID}`;
            const data = await tx.run(selectQuery);
            console.log(data);

            const res = [];
            for (let i = 0; i < data.length; i++) {
                res.push({
                    name: data[i].SAP_MODULE_NAME,
                    value: data[i].COUNT
                })
            }
            return res;
        } catch (error) {
            console.log(error);
        }
    })

    this.on('GetKPIGraph_2', async req => {
        try {
            const { PROJECT_ID } = req.data;
            const selectQuery = `SELECT * from ASSESSMENTSERVICE_vw_module_based_efforts where PROJECT_ID = ${PROJECT_ID}`;
            const result = await cds.run(selectQuery);
            console.log(result);
            const response = [];
            for (const x of result) {
                response.push({
                    name: x.SAP_MODULE_NAME,
                    value: x.EFFORTSCOUNT
                })
            }
            return response
        } catch (error) {
            console.log(error);
        }
    })
    this.on('GetKPIGraph_3', async req => {
        try {
            const { PROJECT_ID } = req.data;
            const assessments = await SELECT.from(ASSESSMENT).where({ PROJECT_ID: PROJECT_ID });

            // Item counts (by KIND) + scalar counts (screens/efforts) live in 2 views now.
            const itemRep = await cds.tx(req).run(`select * from ASSESSMENTSERVICE_VW_ABAP_CODE_REPORT where PROJECT_ID = ${PROJECT_ID}`);
            const scalarRep = await cds.tx(req).run(`select * from ASSESSMENTSERVICE_VW_ABAP_SCALAR_REPORT where PROJECT_ID = ${PROJECT_ID}`);
            const ir = itemRep[0] || {};
            const sr = scalarRep[0] || {};
            console.log(ir, sr);

            let onStack = 0;
            let sideBySide = 0;
            let retire = 0;
            let hybrid = 0;
            for (const assesment of assessments) {
                const a = (assesment.APPROACH || '').toLowerCase();
                if (a.includes('on-stack')) onStack++;
                else if (a.includes('hybrid')) hybrid++;
                else if (a.includes('side-by-side') || a.includes('side by side')) sideBySide++;
                else if (a.includes('retire')) retire++;
            }

            const response = [
                { name: 'Bapis', value: ir.BAPI_COUNT || 0 },
                { name: 'Screens used', value: sr.SCREENS_USED_COUNT || 0 },
                { name: 'Efforts', value: sr.EFFORTS_COUNT || 0 },
                { name: 'Standard tables', value: ir.STANDARD_TABLES_COUNT || 0 },
                { name: 'Custom tables', value: ir.CUSTOM_TABLES_COUNT || 0 },
                { name: 'S4 tables', value: ir.NEW_S4_TABLES_COUNT || 0 },
                { name: 'SQL APIs', value: ir.SQL_ANALYSIS_TABLES_API_COUNT || 0 },
                { name: 'SQL CDS', value: ir.SQL_ANALYSIS_TABLES_CDS_COUNT || 0 },
                { name: 'On-Stack', value: onStack },
                { name: 'Hybrid', value: hybrid },
                { name: 'Side-by-Side', value: sideBySide },
                { name: 'Retire', value: retire }
            ]

            return response
        } catch (error) {
            console.log(error);
        }
    })

    this.on('GetKPIGraph_4', async req => {
        try {
            const { PROJECT_ID } = req.data;
            const tx = cds.tx(req);

            const distinctModules = `SELECT SAP_MODULE_NAME from CRA_ASSESSMENT WHERE PROJECT_ID = ${PROJECT_ID} GROUP BY SAP_MODULE_NAME`
            const distinctModulesResults = await tx.run(distinctModules);
            console.log(distinctModulesResults);

            const data = await SELECT.from(KPI_D_GRAPH_3);
            const res = [];
            const keys = Object.keys(data[0]);

            for (let j = 0; j < distinctModulesResults.length; j++) {
                const obj = {};

                const dc = `SELECT CODE_COMPLEXITY from CRA_ASSESSMENT WHERE PROJECT_ID = ${PROJECT_ID} GROUP BY CODE_COMPLEXITY`;
                const dcr = await tx.run(dc);
                console.log("asd: ", dcr);
                obj.name = distinctModulesResults[j].SAP_MODULE_NAME;
                obj.value = [];
                for (let k = 0; k < dcr.length; k++) {
                    const sqlqctQuery = `SELECT COUNT(*) as count from CRA_ASSESSMENT WHERE SAP_MODULE_NAME = '${distinctModulesResults[j].SAP_MODULE_NAME}' and PROJECT_ID = ${PROJECT_ID} and CODE_COMPLEXITY = '${dcr[k].CODE_COMPLEXITY}'`;
                    const tData = await tx.run(sqlqctQuery);
                    console.log(tData);
                    obj.value.push({
                        complexity: dcr[k].CODE_COMPLEXITY,
                        count: tData[0].COUNT
                    })
                }
                res.push(obj)
            }

            return res;
        } catch (error) {
            console.log(error);
        }
    });

    this.on('GetFilterAttributes', async req => {
        try {
            const modulesSelect = 'SELECT MODULE_NAME as TEXT, MODULE_NAME as NAME from ASSESSMENTSERVICE_vw_unique_modules';
            const modules = await cds.tx(req).run(modulesSelect);
            console.log(modules);

            const adherenceSelect = 'SELECT MODULE_NAME as TEXT, MODULE_NAME as NAME from ASSESSMENTSERVICE_vw_unique_adherence';
            const adherence = await cds.tx(req).run(adherenceSelect);
            console.log(adherence);

            const response = {
                Filters: [
                    {
                        type: 'SAP_MODULE_NAME',
                        name: 'SAP_MODULE_NAME',
                        values: modules
                    },
                    {
                        type: 'ADHERENCE',
                        name: 'ADHERENCE',
                        values: adherence
                    },
                    {
                        type: 'APPROACH',
                        name: 'APPROACH',
                        values: [
                            { text: 'On-Stack', name: 'On-Stack' },
                            { text: 'Hybrid', name: 'Hybrid' },
                            { text: 'Side-by-Side', name: 'Side-by-Side' },
                            { text: 'Retire', name: 'Retire' },
                        ]
                    },
                    {
                        type: 'WRICEF',
                        name: 'WRICEF',
                        values: [
                            { text: 'Report', name: 'Report' },
                            { text: 'Interface', name: 'Interface' },
                            { text: 'Enhancement', name: 'Enhancement' },
                            { text: 'Form', name: 'Form' },
                            { text: 'Conversion', name: 'Conversion' },
                        ]
                    },
                    {
                        type: 'CODE_COMPLEXITY',
                        name: 'CODE_COMPLEXITY',
                        values: [
                            { text: 'Low', name: 'Low' },
                            { text: 'Medium', name: 'Medium' },
                            { text: 'High', name: 'High' },
                        ]
                    },
                    {
                        type: 'TShirt',
                        name: 'TShirt',
                        values: [
                            { text: 'S', name: 'S' },
                            { text: 'M', name: 'M' },
                            { text: 'L', name: 'L' },
                        ]
                    }
                ]
            }

            return response;
        } catch (error) {
            console.log(error);
            req.error(500, 'Internal Server Error');
        }
    })

    this.on('GetMstrObjData', async req => {
        try {
            const { PROJECT_ID } = req.data;
            const tx = cds.tx(req);
            // Project-scoped distinct values: each filter dropdown must offer ONLY
            // values that exist in THIS project. Sourcing modules/adherence from the
            // global unique-value views listed values from other projects, so picking
            // one returned zero rows. Every filter is now data-driven and scoped.
            // It also returns the stored values verbatim (e.g. APPROACH "on-stack"),
            // so the case-sensitive EQ filter in applyFilter matches -- previously the
            // static "On-Stack" key never matched the stored "on-stack".
            const distinct = async (col) => {
                if (!PROJECT_ID) return [];
                return tx.run(
                    `SELECT ${col} AS NAME FROM CRA_ASSESSMENT ` +
                    `WHERE PROJECT_ID = ? AND ${col} IS NOT NULL AND ${col} <> '' ` +
                    `GROUP BY ${col} ORDER BY ${col}`, [PROJECT_ID]);
            };
            const data = {
                SAP_MODULES: await distinct('SAP_MODULE_NAME'),
                APPROACH: await distinct('APPROACH'),
                ADHERENCE: await distinct('ADHERENCE'),
                CODE_COMPLEXITY: await distinct('CODE_COMPLEXITY'),
                TSHIRT: await distinct('TShirt'),
                // Not shown on the analysis filter bar; kept for any other consumer.
                WRICEF: [{ NAME: 'Report' }, { NAME: 'Interface' }, { NAME: 'Enhancement' }, { NAME: 'Form' }, { NAME: 'Conversion' }]
            };
            return data;
        } catch (error) {
            console.log(error);
        }
    });

    this.on('GetUserRole', async req => {
        try {
            const user = currentUser(req);
            const username = req.user.username;
            console.log(req.user, user);
            console.log(req.username, username);
            // COMPANY_ID is NOT a column on MSTR_USER -- the user-to-company
            // mapping lives in COMPANY_USER_MAP. Selecting it here always yielded
            // null, so the UI filtered MSTR_PROJECT by null and rendered an empty
            // project list.
            const { name, role, displayName, email, allowedObjects, uploadedObjects } = await SELECT
                .one(['USERNAME as name', 'ROLE as role', 'DISPLAY_NAME as displayName', 'EMAIL as email',
                    'ALLOWEDOBJECTS as allowedObjects', 'UPLOADEDOBJECTS as uploadedObjects'])
                .from(MSTR_USER)
                .where({ USERNAME: user }) || {};
            const mapped = await SELECT
                .one(['COMPANY_ID as companyID'])
                .from(COMPANY_USER_MAP)
                .where({ USERNAME: user });
            const companyID = mapped?.companyID ?? null;
            // const role = await SELECT.one.from(MSTR_USER).columns('ROLE as role').where({ USERNAME: user });
            // const companyID = await SELECT.one.from(MSTR_USER).columns('COMPANY_ID as companyID').where({ USERNAME: user });

            if (!user || user === 'anonymous') { return { role: "USER", name: null, username: null, displayName: null, email: null, initials: null, companyID: 1 } };

            // Effective role: DB role if the user has an MSTR_USER row, else ADMIN
            // when the login is in the env allow-list (so a fresh, empty DB is
            // still usable), otherwise USER. This is why the app now shows the
            // username/role and lets an env-admin create the first company.
            // Owner is fixed and outranks any stored role. Otherwise use the
            // MSTR_USER role, falling back to ADMIN for env-admins (empty DB) or USER.
            const effectiveRole = isOwner(user)
                ? 'OWNER'
                : (role || (isEnvAdmin(user) ? 'ADMIN' : 'USER'));
            // Defaults to 'user' until a display name is set in profile settings.
            // Initials stay empty in that case so the avatar shows its person icon.
            const shown = displayName || 'user';
            console.log('GetUserRole ->', { user, effectiveRole, hasRow: name !== undefined, companyID });
            // email falls back to the username: in production the IdP login IS the
            // address. Lowercased because some IdPs return the login capitalised,
            // and emails are case-insensitive -- show the natural lowercase form.
            const emailShown = String(email || user || '').toLowerCase();
            // Upload quota for the client's pre-check. Owner/env-admins are exempt
            // (no row / no limit) -> report unlimited so the UI never blocks them.
            const unlimited = isOwner(user) || isEnvAdmin(user);
            return {
                role: effectiveRole, username: user, displayName: shown, email: emailShown,
                initials: displayName ? getInitials(shown) : '', companyID: companyID,
                allowedObjects: unlimited ? null : (allowedObjects ?? 0),
                uploadedObjects: unlimited ? 0 : (uploadedObjects ?? 0)
            };
        } catch (error) {
            console.log(error);
        }
    })

    this.on('SetDisplayName', async req => {
        try {
            const user = currentUser(req);
            console.log('SetDisplayName -> user:', user, 'value:', req.data.DISPLAY_NAME);
            if (!user || user === 'anonymous') { return false; }
            const value = (req.data.DISPLAY_NAME || '').trim().slice(0, 60);
            const updated = await UPDATE(MSTR_USER).set({ DISPLAY_NAME: value || null }).where({ USERNAME: user });
            console.log('SetDisplayName -> rows updated:', updated);
            if (updated > 0) { return true; }
            // No MSTR_USER row yet (owner / env-admin have none) -- create one so the
            // display name persists and GetUserRole can read it back.
            const { maxId } = await SELECT.one(['max(ID) as maxId']).from(MSTR_USER);
            await INSERT.into(MSTR_USER).entries({
                ID: (maxId || 0) + 1,
                USERNAME: user,
                DISPLAY_NAME: value || null,
                EMAIL: user,
                ROLE: isOwner(user) ? 'OWNER' : (isEnvAdmin(user) ? 'ADMIN' : 'USER'),
                LICENSE_ROLE: 'Standard',
                ALLOWEDOBJECTS: 0,
                UPLOADEDOBJECTS: 0
            });
            return true;
        } catch (error) {
            console.log(`E-SETDISPLAYNAME-${error.message}`);
            return false;
        }
    })

    // Initials for the header avatar: the first two characters of the name, so
    // it reads the same way as the Company/Projects tables ("Contoso" -> "CO").
    function getInitials(value) {
        return String(value || '').trim().slice(0, 2).toUpperCase();
    }

    // ------------------------------------------------------------------ admin
    // Caller's effective role, using the same rules as GetUserRole.
    const effectiveRoleOf = async (user) => {
        if (isOwner(user)) { return 'OWNER'; }
        const row = await SELECT.one(['ROLE as role']).from(MSTR_USER).where({ USERNAME: user });
        return (row && row.role) || (isEnvAdmin(user) ? 'ADMIN' : 'USER');
    };

    // Admin-panel user list. Admin+ sees everyone; anyone else gets [].
    this.on('GetUsers', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.SUPERUSER) { return []; }
        const isAdminPlus = roleRank(role) >= ROLE_RANK.ADMIN;
        const users = await SELECT.from(MSTR_USER).columns(
            'ID', 'USERNAME', 'DISPLAY_NAME', 'EMAIL', 'ROLE', 'ALLOWEDOBJECTS', 'UPLOADEDOBJECTS'
        );
        // The owner has no MSTR_USER row unless he set a display name, so inject a
        // synthetic row (deduped) and force ROLE=OWNER so he always appears in the
        // list. Shown to admins/owners only.
        if (isAdminPlus) {
            // Owner now gets a real MSTR_USER row on first upload (UploadObject),
            // and its UPLOADEDOBJECTS is a cumulative counter -- so show that stored
            // value (transparent; not reduced when assessments are deleted).
            const ownerRow = users.find(u => isOwner(u.USERNAME));
            if (ownerRow) {
                ownerRow.ROLE = 'OWNER';
            } else {
                users.unshift({
                    ID: 0, USERNAME: OWNER_EMAIL, EMAIL: OWNER_EMAIL,
                    DISPLAY_NAME: OWNER_EMAIL.split('@')[0], ROLE: 'OWNER',
                    ALLOWEDOBJECTS: 0, UPLOADEDOBJECTS: 0
                });
            }
        }
        const maps = await SELECT.from(COMPANY_USER_MAP).columns('USERNAME', 'COMPANY_ID');
        const companies = await SELECT.from(MSTR_COMPANY).columns('ID', 'COMPANY_NAME');
        const projects = await SELECT.from(MSTR_PROJECT).columns('COMPANY.ID as COMPANY_ID', 'PROJECT_NAME');
        const companyName = {};
        for (const c of companies) { companyName[c.ID] = c.COMPANY_NAME; }
        const projectsByCompany = {};
        for (const p of projects) {
            (projectsByCompany[p.COMPANY_ID] = projectsByCompany[p.COMPANY_ID] || []).push(p.PROJECT_NAME);
        }
        // Company IDs each user maps to (a user -> many companies).
        const companiesByUser = {};
        for (const m of maps) {
            (companiesByUser[m.USERNAME] = companiesByUser[m.USERNAME] || []).push(m.COMPANY_ID);
        }
        // Visibility:
        //  - Admins/owners see everyone (including other admins and the owner).
        //  - A superuser sees ONLY regular users/superusers who share at least one
        //    of their own companies -- never admins or the owner.
        const callerCompanies = new Set(companiesByUser[user] || []);
        const scoped = isAdminPlus
            ? users
            : users.filter(u =>
                roleRank(u.ROLE) < ROLE_RANK.ADMIN && !isOwner(u.USERNAME)
                && (companiesByUser[u.USERNAME] || []).some(cid => callerCompanies.has(cid)));
        return scoped.map(u => {
            const cids = companiesByUser[u.USERNAME] || [];
            // Admins and owners inherently have access to ALL companies/projects
            // (the READ handlers bypass company scoping for them), so their row
            // reads "All companies / All projects" rather than a specific list.
            // Regular users/superusers show the concrete companies they map to.
            const rowIsAdminPlus = roleRank(u.ROLE) >= ROLE_RANK.ADMIN || isOwner(u.USERNAME);
            const MAPPINGS = rowIsAdminPlus
                ? [{ COMPANY_ID: null, COMPANY_NAME: 'All companies', PROJECTS: 'All projects' }]
                : cids.map(cid => ({
                    COMPANY_ID: cid,
                    COMPANY_NAME: companyName[cid] || ('Company ' + cid),
                    PROJECTS: (projectsByCompany[cid] || []).join(', ')
                }));
            return { ...u, COMPANY_ID: cids[0] ?? null, MAPPINGS };
        });
    });

    // Parse a comma-separated companyIDs string into a de-duplicated int array.
    const parseCompanyIDs = (s) => {
        return String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => !isNaN(n))
            .filter((v, i, a) => a.indexOf(v) === i);
    };

    // Create the MSTR_USER row + company mappings. Shared by AddUser and approval.
    const createUserRow = async (data) => {
        const email = String(data.email || '').trim().toLowerCase();
        if (!email) { return 'invalid'; }
        // The owner (fixed via env) is implicitly the top role and has no row, so a
        // plain row lookup would miss him -- reject explicitly. Env-admins likewise.
        if (isOwner(email)) { return 'exists'; }
        const existing = await SELECT.one.from(MSTR_USER).where({ USERNAME: email });
        if (existing) { return 'exists'; }
        const maxRow = await SELECT.one(['max(ID) as maxId']).from(MSTR_USER);
        const nextId = (maxRow && maxRow.maxId ? maxRow.maxId : 0) + 1;
        await INSERT.into(MSTR_USER).entries({
            ID: nextId,
            USERNAME: email,
            DISPLAY_NAME: (data.displayName || '').trim() || null,
            EMAIL: email,
            ROLE: String(data.role || 'USER').toUpperCase(),
            LICENSE_ROLE: 'Standard',
            ALLOWEDOBJECTS: data.allowedObjects || 0,
            UPLOADEDOBJECTS: 0
        });
        const cids = parseCompanyIDs(data.companyIDs);
        if (cids.length) {
            await INSERT.into(COMPANY_USER_MAP).entries(cids.map(cid => ({ USERNAME: email, COMPANY_ID: cid })));
        }
        return 'created';
    };

    // Add a user, enforcing the role hierarchy. A caller may only grant a role
    // strictly below their own: OWNER -> ADMIN/SUPERUSER/USER, ADMIN ->
    // SUPERUSER/USER. SUPERUSER cannot add directly (must RequestUser).
    this.on('AddUser', async req => {
        const user = currentUser(req);
        const callerRole = await effectiveRoleOf(user);
        const targetRole = String(req.data.role || 'USER').toUpperCase();
        if (roleRank(callerRole) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        if (roleRank(targetRole) >= roleRank(callerRole)) { return 'forbidden'; }
        return await createUserRow(req.data);
    });

    // Superuser raises a pending request for an admin to approve. Superusers may
    // only request USER (or SUPERUSER) accounts, never ADMIN.
    this.on('RequestUser', async req => {
        const user = currentUser(req);
        const callerRole = await effectiveRoleOf(user);
        const targetRole = String(req.data.role || 'USER').toUpperCase();
        if (roleRank(callerRole) < ROLE_RANK.SUPERUSER) { return 'forbidden'; }
        if (roleRank(targetRole) >= ROLE_RANK.ADMIN) { return 'forbidden'; }
        const email = String(req.data.email || '').trim().toLowerCase();
        if (!email) { return 'invalid'; }
        // No duplicate accounts (any role) and no pending duplicate request.
        if (isOwner(email) || await SELECT.one.from(MSTR_USER).where({ USERNAME: email })) { return 'exists'; }
        const pending = await SELECT.one.from(ACCESS_REQUEST).where({ EMAIL: email, STATUS: 'PENDING' });
        if (pending) { return 'exists'; }
        await INSERT.into(ACCESS_REQUEST).entries({
            ID: cds.utils.uuid(),
            DISPLAY_NAME: (req.data.displayName || '').trim() || null,
            EMAIL: email,
            ROLE: targetRole,
            ALLOWEDOBJECTS: req.data.allowedObjects || 0,
            STATUS: 'PENDING',
            REQUESTED_BY: user,
            COMPANY_ID: parseCompanyIDs(req.data.companyIDs)[0] || null
        });
        return 'requested';
    });

    // Edit a user. A caller may only set a role strictly below their own, and may
    // not edit a user who outranks or equals them.
    this.on('UpdateUser', async req => {
        const user = currentUser(req);
        const callerRole = await effectiveRoleOf(user);
        if (roleRank(callerRole) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const email = String(req.data.email || '').trim().toLowerCase();
        const target = await SELECT.one.from(MSTR_USER).where({ USERNAME: email });
        if (!target) { return 'not_found'; }
        if (isOwner(email) || roleRank(target.ROLE) >= roleRank(callerRole)) { return 'forbidden'; }
        const newRole = String(req.data.role || target.ROLE).toUpperCase();
        if (roleRank(newRole) >= roleRank(callerRole)) { return 'forbidden'; }
        const patch = {
            DISPLAY_NAME: (req.data.displayName || '').trim() || null,
            ROLE: newRole,
            ALLOWEDOBJECTS: req.data.allowedObjects != null ? req.data.allowedObjects : target.ALLOWEDOBJECTS
        };
        // Consumed uploads can only be corrected by an owner.
        if (req.data.uploadedObjects != null && isOwner(user)) {
            patch.UPLOADEDOBJECTS = req.data.uploadedObjects;
        }
        await UPDATE(MSTR_USER).set(patch).where({ USERNAME: email });
        // Rewrite company mappings when a (possibly empty) list is supplied.
        if (req.data.companyIDs != null && req.data.companyIDs !== '') {
            const cids = parseCompanyIDs(req.data.companyIDs);
            await DELETE.from(COMPANY_USER_MAP).where({ USERNAME: email });
            if (cids.length) {
                await INSERT.into(COMPANY_USER_MAP).entries(cids.map(cid => ({ USERNAME: email, COMPANY_ID: cid })));
            }
        }
        return 'updated';
    });

    // Remove a user (and their company mappings). Cannot remove self, an owner,
    // or anyone who outranks/equals the caller.
    this.on('RemoveUser', async req => {
        const user = currentUser(req);
        const callerRole = await effectiveRoleOf(user);
        if (roleRank(callerRole) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const email = String(req.data.email || '').trim().toLowerCase();
        if (email === String(user).toLowerCase() || isOwner(email)) { return 'forbidden'; }
        const target = await SELECT.one.from(MSTR_USER).where({ USERNAME: email });
        if (!target) { return 'not_found'; }
        if (roleRank(target.ROLE) >= roleRank(callerRole)) { return 'forbidden'; }
        await DELETE.from(COMPANY_USER_MAP).where({ USERNAME: email });
        await DELETE.from(MSTR_USER).where({ USERNAME: email });
        return 'removed';
    });

    // Pending + decided access requests, for admins to action.
    this.on('GetAccessRequests', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.SUPERUSER) { return []; }
        const rows = await SELECT.from(ACCESS_REQUEST).columns(
            'ID', 'DISPLAY_NAME', 'EMAIL', 'ROLE', 'ALLOWEDOBJECTS', 'STATUS', 'REQUESTED_BY', 'COMPANY_ID'
        ).orderBy('createdAt desc');
        // Admins/owners see (and action) everything. A superuser sees, read-only,
        // only requests scoped to a company they belong to -- e.g. one raised by
        // another superuser in the same company. Approve/reject stays admin+ (see
        // DecideAccessRequest gate below).
        if (roleRank(role) >= ROLE_RANK.ADMIN) { return rows; }
        const maps = await SELECT.from(COMPANY_USER_MAP).columns('COMPANY_ID').where({ USERNAME: user });
        const mine = new Set(maps.map(m => m.COMPANY_ID));
        return rows.filter(r => r.COMPANY_ID != null && mine.has(r.COMPANY_ID));
    });

    // Admin approves (creates the user) or rejects a pending request.
    this.on('DecideAccessRequest', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const reqRow = await SELECT.one.from(ACCESS_REQUEST).where({ ID: req.data.ID });
        if (!reqRow || reqRow.STATUS !== 'PENDING') { return 'not_pending'; }
        let outcome = 'rejected';
        if (req.data.approve) {
            outcome = await createUserRow({
                displayName: reqRow.DISPLAY_NAME, email: reqRow.EMAIL, role: reqRow.ROLE,
                // createUserRow reads `companyIDs` (parseCompanyIDs); passing the old
                // `companyID` key meant approved users got NO company mapping and were
                // invisible to their company's superusers. Map the request's company.
                allowedObjects: reqRow.ALLOWEDOBJECTS, companyIDs: reqRow.COMPANY_ID
            });
        }
        await UPDATE(ACCESS_REQUEST).set({
            STATUS: req.data.approve ? 'APPROVED' : 'REJECTED', DECIDED_BY: user
        }).where({ ID: req.data.ID });
        return outcome;
    });

    // ---- Support tickets ----
    // Any authenticated user can raise a ticket.
    this.on('RaiseTicket', async req => {
        const user = currentUser(req);
        if (!user || user === 'anonymous') { return 'forbidden'; }
        const title = String(req.data.title || '').trim();
        if (!title) { return 'invalid'; }
        await INSERT.into(TICKET).entries({
            ID: cds.utils.uuid(),
            TITLE: title.slice(0, 200),
            DESCRIPTION: String(req.data.description || '').trim().slice(0, 2000) || null,
            STATUS: 'OPEN',
            RAISED_BY: user
        });
        return 'raised';
    });

    // The caller's own tickets.
    this.on('GetMyTickets', async req => {
        const user = currentUser(req);
        if (!user || user === 'anonymous') { return []; }
        return await SELECT.from(TICKET)
            .columns('ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'CLOSE_COMMENT', 'createdAt')
            .where({ RAISED_BY: user }).orderBy('createdAt desc');
    });

    // All tickets, for admins/owners.
    this.on('GetAllTickets', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.ADMIN) { return []; }
        return await SELECT.from(TICKET)
            .columns('ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'RAISED_BY', 'ACK_BY', 'CLOSED_BY', 'CLOSE_COMMENT', 'createdAt')
            .orderBy('createdAt desc');
    });

    // Acknowledge or close a ticket (admin/owner only).
    this.on('UpdateTicket', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const t = await SELECT.one.from(TICKET).where({ ID: req.data.ID });
        if (!t) { return 'not_found'; }
        const act = String(req.data.action || '').toUpperCase();
        if (act === 'ACKNOWLEDGE') {
            await UPDATE(TICKET).set({ STATUS: 'ACKNOWLEDGED', ACK_BY: user }).where({ ID: req.data.ID });
            return 'acknowledged';
        }
        if (act === 'CLOSE') {
            const comment = String(req.data.comment || '').trim().slice(0, 1000) || null;
            await UPDATE(TICKET).set({ STATUS: 'CLOSED', CLOSED_BY: user, CLOSE_COMMENT: comment }).where({ ID: req.data.ID });
            return 'closed';
        }
        return 'invalid';
    });

    // Remove a resolved ticket (admin/owner). Only CLOSED tickets are deletable --
    // open/acknowledged ones must be worked, not silently dropped.
    this.on('DeleteTicket', async req => {
        const user = currentUser(req);
        if (roleRank(await effectiveRoleOf(user)) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const t = await SELECT.one.from(TICKET).where({ ID: req.data.ID });
        if (!t) { return 'not_found'; }
        if (String(t.STATUS).toUpperCase() !== 'CLOSED') { return 'not_closed'; }
        await DELETE.from(TICKET).where({ ID: req.data.ID });
        return 'deleted';
    });

    // Remove a retained pricing-history row (admin/owner only).
    this.on('DeleteCostLedger', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        if (roleRank(role) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const row = await SELECT.one.from(COST_LEDGER).where({ ID: req.data.ID });
        if (!row) { return 'not_found'; }
        await DELETE.from(COST_LEDGER).where({ ID: req.data.ID });
        return 'deleted';
    });

    // Per-project cost: analysis spend (ASSESSMENT_USAGE) + docgen spend
    // (LLMChatHistory.costUsd), grouped by project.
    this.on('GetProjectCostStats', async req => {
        const user = currentUser(req);
        const role = await effectiveRoleOf(user);
        // Cost is admin/owner-only. Superusers and users get an empty list.
        if (roleRank(role) < ROLE_RANK.ADMIN) { return []; }
        const projects = await SELECT.from(MSTR_PROJECT).columns('ID', 'PROJECT_NAME', 'COMPANY.ID as COMPANY_ID', 'ARCHIVED_AT');
        // Company names so the table shows a name, not a bare id.
        const companyRows = await SELECT.from(MSTR_COMPANY).columns('ID', 'COMPANY_NAME');
        const companyNameById = {};
        for (const c of companyRows) { companyNameById[c.ID] = c.COMPANY_NAME; }
        // Analysis cost per project: join usage -> assessment -> project.
        const usage = await SELECT.from(ASSESSMENT_USAGE).columns('ASSESSMENT.ID as AID', 'COST_USD');
        const assessments = await SELECT.from(ASSESSMENT).columns('ID', 'PROJECT.ID as PID');
        const pidByAid = {};
        for (const a of assessments) { pidByAid[a.ID] = a.PID; }
        const analysisByPid = {};
        for (const u of usage) {
            const pid = pidByAid[u.AID];
            if (pid == null) { continue; }
            analysisByPid[pid] = (analysisByPid[pid] || 0) + Number(u.COST_USD || 0);
        }
        // Docgen cost per project from the chat history.
        const chats = await SELECT.from(LLMChatHistory).columns('projectID', 'costUsd');
        const docgenByPid = {};
        for (const c of chats) {
            const pid = Number(c.projectID);
            if (!pid) { continue; }
            docgenByPid[pid] = (docgenByPid[pid] || 0) + Number(c.costUsd || 0);
        }
        // Project-wise cost is LIVE only: deleting an assessment reduces it (to 0 when
        // all are gone). Deleted spend is NOT added back here -- it lives in the
        // retained "Pricing history (deleted)" ledger instead.
        return projects.map(p => {
            const a = analysisByPid[p.ID] || 0;
            const d = docgenByPid[p.ID] || 0;
            return {
                PROJECT_ID: p.ID, PROJECT_NAME: p.PROJECT_NAME,
                COMPANY_ID: p.COMPANY_ID, COMPANY_NAME: companyNameById[p.COMPANY_ID] || null,
                ASSESSMENT_TOTAL: a, DOCGEN_TOTAL: d, PROJECT_TOTAL: a + d,
                // Archived projects keep their cost history for reporting but show
                // as Inactive.
                STATUS: p.ARCHIVED_AT ? 'Inactive' : 'Active'
            };
        });
    });

    // Retained pricing history for DELETED objects/projects/companies. Admin+ only
    // (the point is that a superuser cannot hide spend by deleting -- admins audit
    // it here). Newest first; STATUS reads "Deleted on DD.MM.YYYY.HH.mm.ss".
    this.on('GetCostLedger', async req => {
        const user = currentUser(req);
        if (roleRank(await effectiveRoleOf(user)) < ROLE_RANK.ADMIN) { return []; }
        const rows = await SELECT.from(COST_LEDGER).orderBy('DELETED_AT desc');
        const fmt = ts => {
            const d = ts ? new Date(ts) : null;
            if (!d || isNaN(d.getTime())) { return 'Deleted'; }
            const p = x => String(x).padStart(2, '0');
            return `Deleted on ${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}.${p(d.getUTCHours())}.${p(d.getUTCMinutes())}.${p(d.getUTCSeconds())}`;
        };
        return rows.map(r => ({
            ID: r.ID, OBJECT_NAME: r.OBJECT_NAME, PROJECT_NAME: r.PROJECT_NAME, COMPANY_NAME: r.COMPANY_NAME,
            INCURRED_BY: r.INCURRED_BY, SOURCE: r.SOURCE, TOTAL_TOKENS: r.TOTAL_TOKENS,
            COST_USD: Number(r.COST_USD || 0), DELETED_AT: r.DELETED_AT, DELETED_BY: r.DELETED_BY,
            STATUS: fmt(r.DELETED_AT)
        }));
    });

    this.on('CreatePrompt', async (req) => {
        const { PROMPT_STR, COMPANY_ID, PROJECT_ID, USER } = req.data;
        const tx = cds.transaction(req);
        const company = await tx.read(MSTR_COMPANY).where({ ID: COMPANY_ID });
        console.log(company);
        const project = await tx.read(MSTR_PROJECT).where({ ID: PROJECT_ID, 'COMPANY.ID': COMPANY_ID });
        console.log(project);
        const user = USER;
        console.log(user);
        const MaxID = await autoID('PROPMT', 'ID', tx);

        console.log(user);
        if (!company.length) {
            req.error(400, `Company with ID ${COMPANY_ID} not found`);
        }
        if (!project.length) {
            req.error(400, `Project with ID ${PROJECT_ID} not found`);
        }
        const NewPrompt = await tx.create(PROPMT, {
            ID: MaxID,
            PROMPT_STR: PROMPT_STR,
            COMPANY_ID: COMPANY_ID,
            PROJECT_ID: PROJECT_ID,
            USER: user,
        });

        return NewPrompt;
    });

    this.on('AnalyzeFileData', async req => {
        try {
            const { prompts, ObjectContent, model } = req.data;
            const promptArray = Array.isArray(prompts) ? prompts : [prompts];

            const response = await axios.post(`${await util.getApiBase()}/analyze`, {
                "abap_object": ObjectContent,
                "Prompts": promptArray,
                "model": model || DEFAULT_MODEL
            });

            console.log(response.data);
            const objectResponse = response.data;

            console.log("AI Service Response: ", objectResponse);
            let wricef = typeof objectResponse.basic_analysis.WRICEFObjectType === 'object' && objectResponse.basic_analysis.WRICEFObjectType !== null ? objectResponse.basic_analysis.WRICEFObjectType : [objectResponse.basic_analysis.WRICEFObjectType];
            const wricefObj = []

            for (let i = 0; i < wricef.length; i++) {
                wricefObj.push({
                    WRICEF_OBJECT_TYPE: wricef[i]
                })
            }
            return {
                SAP_MODULE_NAME: objectResponse.basic_analysis.SAPModule,
                FUNCTIONAL_ANALYSIS: objectResponse.basic_analysis.FunctionalAnalysis,
                CODE_COMPLEXITY: objectResponse.basic_analysis.LogicComplexity,
                APPROACH: objectResponse.basic_analysis.RecommendedApproach,
                ADHERENCE: objectResponse.basic_analysis.CleanCoreAdherence,
                // Coupling is computed deterministically by the AI API but was not
                // being saved, so the Coupling column showed empty.
                COUPLING: objectResponse.basic_analysis.Coupling,
                // Clean Core tier (SAP Extensibility Classification Level): current + target.
                CLEANCORE_TIER: objectResponse.basic_analysis.CleanCoreTier,
                CLEANCORE_TIER_REASON: objectResponse.basic_analysis.CleanCoreTierReason,
                CLEANCORE_TARGET_TIER: objectResponse.basic_analysis.CleanCoreTargetTier,
                CLEANCORE_TARGET_TIER_REASON: objectResponse.basic_analysis.CleanCoreTargetTierReason,
                SQL_RECOMMENDATION: objectResponse.technical_analysis.SQLAnalysis.SQLRecommendation,
                TOKEN_SIZE: objectResponse.basic_analysis.TokenSize,
                SCREENS_USED: objectResponse.basic_analysis.ScreensUsed,
                S4_ANALYSIS: objectResponse.highlvl_s4_analysis.S4Analysis,
                INTER_MODULE_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.InterModuleIntegration,
                UI_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.UIIntegration,
                THIRD_PARTY_INTEGRATION: objectResponse.technical_analysis.IntegrationAnalysis.ThirdPartyIntegration,
                BDC_USED: objectResponse.basic_analysis.BDCUsed,
                Efforts: objectResponse.basic_analysis.ManEfforts,
                HOURS_PER_DAY: objectResponse.basic_analysis.HoursPerDay ?? 8,
                TShirt: objectResponse.basic_analysis.TShirtSize,
                PRIORITY: objectResponse.basic_analysis.Priority,
                CRUD: objectResponse.basic_analysis['CRUD'],
                WRICEF_OBJECT_TYPE: wricefObj,
                HIGH_LVL_RECOMMENDATIONS: objectResponse.highlvl_s4_analysis.S4Recommendations,
                BTP_SERVICES: objectResponse.technical_analysis.BTPServices,
                STANDARD_TABLES: objectResponse.basic_analysis.StandardTables
            };
        } catch (error) {
            console.error("Error in AnalyzeFileData: ", error);
            return { error: 'Error processing the request' };
        }
    });

    // this.on('DeletePrompt', async (req) => {
    //     const { COMPANY_ID, PROJECT_ID } = req.data;
    //     const tx = cds.transaction(req);
    //     const prompts = await tx.read(PROPMT).where({ 'COMPANY_ID': COMPANY_ID, 'PROJECT_ID': PROJECT_ID });
    //     if (!prompts.length) {
    //         return false;
    //     }
    //     await tx.delete(PROPMT).where({ 'COMPANY_ID': COMPANY_ID, 'PROJECT_ID': PROJECT_ID });
    //     return true;
    // });.

    this.on('DeletePrompt', async (req) => {
        const { COMPANY_ID, PROJECT_ID } = req.data;
        const tx = cds.transaction(req);
        const projects = await tx.read(MSTR_PROJECT).where({ 'COMPANY': COMPANY_ID, 'ID': PROJECT_ID });
        if (!projects.length) {
            return false;
        }
        await tx.update(MSTR_PROJECT)
            .set({ ACTIVE_STATUS: false })
            .where({ 'COMPANY': COMPANY_ID, 'ID': PROJECT_ID });

        return true;
    });


    this.on('GetObjectEstimate', async req => {
        try {
            const { projectID, assessmentID } = req.data;

            // Questions are prebaked per object by the AI during analysis and stored in
            // RAW_ANALYSIS.basic_analysis.EstimateQuestions (each tagged with the BTP
            // service it sizes). No master questionnaire. Merge any saved answers.
            const row = await SELECT.one.from(ASSESSMENT).columns('RAW_ANALYSIS as analysis').where({ ID: assessmentID });
            let estimateQuestions = [];
            try {
                const parsed = row && row.analysis ? JSON.parse(row.analysis) : {};
                estimateQuestions = ((parsed.basic_analysis || {}).EstimateQuestions) || [];
            } catch (e) { estimateQuestions = []; }

            const answers = await SELECT.from(OBJECT_ESTIMATE_ANSWER).where({
                PROJECT_ID: projectID, ASSESSMENT_ID: assessmentID
            });
            const answerById = {};
            for (const a of answers) { answerById[String(a.QUESTIONNAIRE_ID)] = a.ANSWER; }

            const questions = estimateQuestions.map((q, i) => {
                const qid = q.ID != null ? q.ID : (i + 1);
                return {
                    questionId: qid,
                    question: q.Question,
                    answer: answerById[String(qid)] != null ? answerById[String(qid)] : null,
                    palceholder: q.Placeholder || "",
                    scope: q.Scope || "",
                    serviceName: q.ServiceName || "",
                    metric: q.Metric || ""
                };
            });

            return { questions };
        } catch (error) {
            console.log(error);
            return { questions: [] };
        }
    })

    this.on('AddEstimateAnswer', async req => {
        try {
            const { assessmentID, projectID, companyID, data, model } = req.data;

            // 1) Upsert the answers (button is re-openable, so answers can change).
            const existing = await SELECT.from(OBJECT_ESTIMATE_ANSWER).where({ ASSESSMENT_ID: assessmentID });
            const seen = new Set(existing.map(r => String(r.QUESTIONNAIRE_ID)));
            for (const answer of data) {
                if (seen.has(String(answer.questionID))) {
                    await UPDATE(OBJECT_ESTIMATE_ANSWER).set({ ANSWER: answer.answer })
                        .where({ ASSESSMENT_ID: assessmentID, QUESTIONNAIRE_ID: answer.questionID });
                } else {
                    await INSERT.into(OBJECT_ESTIMATE_ANSWER).entries({
                        ASSESSMENT_ID: assessmentID, QUESTIONNAIRE_ID: answer.questionID,
                        PROJECT_ID: projectID, PROJECT_COMPANY_ID: companyID, ANSWER: answer.answer
                    });
                }
            }

            // 2) Recompute answer-derived services from the analysis' tagged questions.
            const qnaArray = data.map(a => ({ questionID: a.questionID, question: a.question, answer: a.answer }));
            const { analysis } = await SELECT.one.from(ASSESSMENT).columns('RAW_ANALYSIS as analysis').where({ ID: assessmentID });
            const parsedAnalysis = analysis ? JSON.parse(analysis) : {};
            const estimateServices = await axios.post(`${await util.getApiBase()}/estimateservices`, {
                "qna": qnaArray,
                "analysis": parsedAnalysis,
                "model": model || DEFAULT_MODEL
            });
            const derived = estimateServices.data || [];

            // 3) Reconcile: start from the baseline auto-services (from the analysis),
            //    then OVERRIDE/ADD the answer-derived ones by ServiceName+Metric. Rebuilding
            //    from baseline each time makes this idempotent and lets a removed answer
            //    drop back to baseline (merge/reconcile, never blind append).
            const baseline = ((parsedAnalysis.technical_analysis || {}).BTPServices) || [];
            const keyOf = s => `${String(s.ServiceName || '').trim().toLowerCase()}|${String(s.Metric || '').trim().toLowerCase()}`;
            const merged = new Map();
            for (const s of baseline) merged.set(keyOf(s), s);
            for (const s of derived) merged.set(keyOf(s), s);
            const finalServices = [...merged.values()];

            // 4) Replace this assessment's BTP services with the reconciled set.
            await DELETE.from(BTP_SERVICES).where({ ASSESSMENT_ID_ID: assessmentID });
            let { maxBTPSrvcsID } = await SELECT.one.from(BTP_SERVICES).columns('MAX(ID) as maxBTPSrvcsID');
            if (!maxBTPSrvcsID || Number.isNaN(Number(maxBTPSrvcsID))) maxBTPSrvcsID = 0;
            const rows = [];
            for (const s of finalServices) {
                maxBTPSrvcsID += 1;
                rows.push({
                    ID: maxBTPSrvcsID, ASSESSMENT_ID_ID: assessmentID,
                    SERVICE_NAME: s.ServiceName, BLOCKS_REQUIRED: s.BlocksRequired, METRIC: s.Metric,
                    PRICE: s.Price, CURRENCY: s.Currency, SERVICE_ID: s.ServiceID, UNITPRICE: s.UnitPrice
                });
            }
            if (rows.length) await INSERT.into(BTP_SERVICES).entries(rows);
            await UPDATE(ASSESSMENT).set({ IS_ESTIMATED: 1 }).where({ ID: assessmentID });
            return true;
        } catch (error) {
            console.log(error);
            return false;
        }
    })

    this.on('GetConfig', async req => {
        try {
            const mstrConfig = await SELECT.from(CONFIG_MSTR);
            const configDetails = await SELECT.from(CONFIG_DETAILS);
            console.log(mstrConfig, configDetails);

            const response = {};
            for (const mstrObj of mstrConfig) {
                console.log(mstrObj);

                const detailObj = configDetails.filter(x => x.CONFIG_MSTR_ID === mstrObj.ID);
                response[mstrObj.FIELD] = detailObj
            }
            return response
        } catch (error) {
            console.log(error);
            return error.message;
        }
    })



    //shital 
    //autoid = CustomerData_ROI
    this.before('CREATE', 'CustomerData_ROI', async req => {
        try {
            const { maxID } = await SELECT.one.from(CustomerData_ROI).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;

            const valueDrivers = [
                'Reduce cost of existing custom code management',
                'Reduce investment in new custom development',
                'Reduce cost of executing IT projects',
                'Reduce IT integration and maintenance cost',
                'Reduce cost of poor data quality',
                'Reduce data security cost',
                'Reduce data storage cost (disk )',
                'Reduce data storage cost (memory )'
            ];

            const entries = [];
            let { maxROIOutputID } = await SELECT.one.from(ROI_Calculation_Output).columns('MAX(ID) as maxROIOutputID');
            if (maxROIOutputID === NaN || maxROIOutputID === null) {
                maxROIOutputID = 1
            } else {
                maxROIOutputID += 1;
            }
            for (const val of valueDrivers) {
                console.log(val);

                if (val === 'Reduce cost of existing custom code management') {
                    const baseline = req.data.AnnualMaintainanceCost * 0.3;
                    const totalBenefits = baseline * 0.43;
                    console.log("baseline: ", baseline, totalBenefits);

                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Minimize expenses for managing existing custom code.',
                        Yearly_Benefits: totalBenefits,
                        Business_Outcome: 'Enhanced IT Spend Effectiveness'
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce investment in new custom development') {
                    const baseline = req.data.AnnualMaintainanceCost * 0.1;
                    const totalBenefits = baseline * 0.1;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Lower spending on new custom development efforts.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce cost of executing IT projects') {
                    const baseline = 7 * 5000 * 0.4
                    const totalBenefits = baseline * 0.25;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Decrease costs associated with IT project execution.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce IT integration and maintenance cost') {
                    const baseline = req.data.Revenue * 0.25 * 0.19 * 0.16;
                    const totalBenefits = baseline * 0.1;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Cut down on IT integration and maintenance expenses.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce cost of poor data quality') {
                    const baseline = req.data.OperationIncome * 0.2;
                    const totalBenefits = baseline * 0.02;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Lessen the impact of poor data quality on costs.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce data security cost') {
                    const baseline = req.data.Revenue * 0.025 * 0.19 * 0.056;
                    const totalBenefits = baseline * 0.2;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Optimize expenses related to data security.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce data storage cost (disk )') {
                    const baseline = 10000;
                    const totalBenefits = baseline * 0.4;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Reduce disk storage expenses.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                } else if (val === 'Reduce data storage cost (memory )') {
                    const baseline = 220000;
                    const totalBenefits = baseline * 0.4;
                    entries.push({
                        ID: maxROIOutputID,
                        project_ID: req.data.Project_ID,
                        project_COMPANY_ID: req.data.COMPANY_ID,
                        Value_Driver: 'Decrease memory storage costs.',
                        Yearly_Benefits: totalBenefits
                    })
                    maxROIOutputID += 1;
                }
            }
            console.log(entries);
            const isExist = await SELECT.from(ROI_Calculation_Output).where({ project_ID: req.data.Project_ID });
            if (isExist.length == 0) {
                console.log("inserted");
                await INSERT.into(ROI_Calculation_Output).entries(entries)
            } else {
                console.log("not inserted");
            }


        } catch (error) {
            console.log(error);
        }
    })

    this.before('CREATE', 'ROI_Calculation', async req => {
        try {
            const { maxID } = await SELECT.one.from(ROI_Calculation).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })


    this.on('createROI', async (req) => {
        const { data } = req.data;

        const tx = cds.transaction(req);

        const recordsToInsert = [];
        let ID = await autoID('ROI_Calculation', 'ID', tx);
        console.log(ID);

        for (const entry of data) {
            const { projectID_ID, projectID_COMPANY_ID, Inplementation_Cost, Internal_FTE_Cost, Productivity_Impact, Any_Other_Cost, Total_Cost, YearID_YearID } = entry;

            const result = await SELECT.from(BTP_SERVICES_TOTAL_PER_PROJECT)
                .where({ ProjectID: projectID_ID });

            if (result.length === 0) {
                return req.error(404, `No data found for ProjectID: ${projectID_ID}`);
            }

            const totalUnitPrice = result[0].TotalUnitPricePerProject;

            recordsToInsert.push({
                ID: ID,
                projectID_ID: projectID_ID,
                projectID_COMPANY_ID: projectID_COMPANY_ID,
                SoftwareSubscription: totalUnitPrice,
                Inplementation_Cost: Inplementation_Cost,
                Internal_FTE_Cost: Internal_FTE_Cost,
                Productivity_Impact: Productivity_Impact,
                Any_Other_Cost: Any_Other_Cost,
                Total_Cost: 0,
                YearID_YearID: YearID_YearID
            });
            ID += 1;
        }
        // return recordsToInsert;
        try {
            await INSERT.into(ROI_Calculation).entries(recordsToInsert);

            console.log('Inserted ROI Calculation records successfully');
        } catch (error) {
            console.error('Error inserting records:', error);
            return req.error(500, 'Error inserting ROI Calculation records');  // Send error if insert fails
        }

        return { message: 'ROI Calculation records inserted successfully' };
    });

    this.on('GetTotalUnitPriceByProject', async (req) => {
        const { ProjectID } = req.data;

        try {
            if (typeof ProjectID !== 'number') {
                return req.error(400, 'Invalid ProjectID');
            }


            const result = await SELECT.from(BTP_SERVICES_TOTAL_PER_PROJECT)
                .where({ ProjectID });

            if (result.length === 0) {
                return req.error(404, `No data found for ProjectID: ${ProjectID}`);
            }

            const totalUnitPrices = result.map(record => record.TotalUnitPricePerProject);

            return {
                Field1: totalUnitPrices[0],
                Field2: totalUnitPrices[0],
                Field3: totalUnitPrices[0],
                Field4: totalUnitPrices[0],
                Field5: totalUnitPrices[0],
                Field6: totalUnitPrices[0],
            };

        } catch (error) {
            console.error('Error fetching TotalUnitPricePerProject:', error);
            return req.error(500, 'Error fetching TotalUnitPricePerProject');
        }
    });

    this.before('CREATE', 'YearCalculation', async req => {
        try {
            const { maxID } = await SELECT.one.from(YearCalculation).columns('MAX(ID) as maxID');
            console.log("MAX ID: ", maxID);
            if (maxID === NaN || maxID === undefined) {
                maxID = 0
            }
            req.data.ID = maxID + 1;
        } catch (error) {
            console.log(error);
        }
    })


    this.on('createYearCalculation2', async (req) => {
        const { data } = req.data;

        const tx = cds.transaction(req);

        let ID = await autoID('YearCalculation', 'ID', tx);
        const recordsToInsert = [];

        for (const entry of data) {
            const { projectID_ID, projectID_COMPANY_ID, Benefit_Realization_Dactor, YearID_YearID } = entry;

            recordsToInsert.push({
                ID: ID,
                projectID_ID: projectID_ID,
                projectID_COMPANY_ID: projectID_COMPANY_ID,
                Benefit_Realization_Dactor: Benefit_Realization_Dactor,
                YearID_YearID: YearID_YearID
            });

            ID += 1;
        }
        try {
            await INSERT.into(YearCalculation).entries(recordsToInsert);
            return { message: 'Year Calculation records inserted successfully' };
        } catch (error) {
            return req.error(500, 'Error inserting Year Calculation records');
        }
    });

    // Deep-delete every assessment (and all its child rows + docgen chat history)
    // for one project. Shared by the action and the cascade DELETE handlers so
    // deleting a project or company never leaves orphaned analysis behind.
    // Delete the child rows + docgen history for a set of assessment IDs.
    // Resolve (and cache) project + company names for the retained cost ledger, so
    // deleted rows stay human-readable after the source rows are gone.
    const _resolveNames = async (tx, cache, projectId, companyId) => {
        const key = `${projectId}:${companyId}`;
        if (cache[key]) { return cache[key]; }
        let projectName = null, companyName = null, compId = companyId;
        if (projectId != null) {
            const p = await tx.run(SELECT.one.from(MSTR_PROJECT).columns('PROJECT_NAME', 'COMPANY.ID as COMPANY_ID').where({ ID: projectId }));
            if (p) { projectName = p.PROJECT_NAME; if (compId == null) { compId = p.COMPANY_ID; } }
        }
        if (compId != null) {
            const c = await tx.run(SELECT.one.from(MSTR_COMPANY).columns('COMPANY_NAME').where({ ID: compId }));
            if (c) { companyName = c.COMPANY_NAME; }
        }
        return (cache[key] = { projectName, companyName, companyId: compId });
    };

    const purgeAssessmentChildren = async (tx, ids, deletedBy) => {
        const nameCache = {};
        const deletedAt = new Date().toISOString();
        for (const ID of ids) {
            // Snapshot cost into the retained ledger BEFORE the usage/chat rows are
            // deleted, so spend survives the purge (best-effort; never blocks delete).
            try {
                // Use VALID CDS elements only. PROJECT_COMPANY_ID / CREATEDBY are raw
                // HANA columns, NOT model elements -- a CQL select on them throws and
                // (being inside this try) silently skipped the whole snapshot. Company
                // is derived from the project inside _resolveNames; createdBy is the
                // managed element (aliased so INCURRED_BY below still reads a.CREATEDBY).
                const a = await tx.run(SELECT.one.from(ASSESSMENT).columns('OBJECT_NAME', 'PROJECT.ID as PROJECT_ID', 'createdBy as CREATEDBY').where({ ID }));
                const nm = a ? await _resolveNames(tx, nameCache, a.PROJECT_ID, null) : { projectName: null, companyName: null, companyId: null };
                const base = {
                    ASSESSMENT_ID: ID, OBJECT_NAME: a && a.OBJECT_NAME,
                    PROJECT_ID: a && a.PROJECT_ID, PROJECT_NAME: nm.projectName,
                    COMPANY_ID: nm.companyId, COMPANY_NAME: nm.companyName,
                    DELETED_AT: deletedAt, DELETED_BY: deletedBy || null
                };
                const rows = [];
                const usages = await tx.run(SELECT.from(ASSESSMENT_USAGE).columns('COST_USD', 'TOTAL_TOKENS').where({ ASSESSMENT_ID: ID }));
                for (const u of usages) {
                    rows.push({ ...base, SOURCE: 'ANALYSIS', INCURRED_BY: a && a.CREATEDBY, COST_USD: u.COST_USD || 0, TOTAL_TOKENS: u.TOTAL_TOKENS || 0 });
                }
                const chats = await tx.run(SELECT.from(LLMChatHistory).columns('costUsd', 'totalTokens', 'user').where({ assessmentID: String(ID) }));
                for (const c of chats) {
                    if (c.costUsd == null && c.totalTokens == null) { continue; }   // skip drafts with no cost
                    rows.push({ ...base, SOURCE: 'DOCGEN', INCURRED_BY: c.user, COST_USD: c.costUsd || 0, TOTAL_TOKENS: c.totalTokens || 0 });
                }
                // Always audit the deletion, even for a zero-cost object (so a delete
                // never silently vanishes from the ledger / project totals).
                if (!rows.length) {
                    rows.push({ ...base, SOURCE: 'ANALYSIS', INCURRED_BY: a && a.CREATEDBY, COST_USD: 0, TOTAL_TOKENS: 0 });
                }
                await tx.run(INSERT.into(COST_LEDGER).entries(rows));
            } catch (e) {
                console.log('cost ledger snapshot failed for assessment', ID, e && e.message);
            }

            await tx.run(DELETE.from(ASSESSMENT_ITEM).where({ ASSESSMENT_ID: ID }));
            await tx.run(DELETE.from(ASSESSMENT_NOTE).where({ ASSESSMENT_ID: ID }));
            await tx.run(DELETE.from(ASSESSMENT_USAGE).where({ ASSESSMENT_ID: ID }));
            await tx.run(DELETE.from(BTP_SERVICES).where({ ASSESSMENT_ID: ID }));
            await tx.run(DELETE.from(AUTHORIZATION_CHECK).where({ ASSESSMENT: ID }));
            await tx.run(DELETE.from(FIELD_VALUES).where({ ASSESSMENT: ID }));
            // Docgen chat/cost history keys assessmentID as a string.
            await tx.run(DELETE.from(LLMChatHistory).where({ assessmentID: String(ID) }));
        }
    };

    const purgeProjectAssessments = async (tx, PROJECT_ID, COMPANY_ID, deletedBy) => {
        const where = COMPANY_ID != null
            ? { PROJECT_COMPANY_ID: COMPANY_ID, PROJECT_ID: PROJECT_ID }
            : { PROJECT_ID: PROJECT_ID };
        const assessments = await tx.read(ASSESSMENT).where(where);
        await purgeAssessmentChildren(tx, assessments.map(a => a.ID), deletedBy);
        await tx.run(DELETE.from(ASSESSMENT).where(where));
        return assessments.length;
    };

    // Delete individually selected assessments (from the analysis table). Admin/
    // owner/superuser only.
    this.on('DeleteAssessments', async req => {
        if (roleRank(await effectiveRoleOf(currentUser(req))) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        const ids = String(req.data.IDs || '').split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        if (!ids.length) { return 'invalid'; }
        const tx = cds.transaction(req);
        // NOTE: deletion does NOT refund the user's object quota -- the analysis
        // (and its token cost) was already consumed; deleting the record is not a refund.
        await purgeAssessmentChildren(tx, ids, currentUser(req));
        await tx.run(DELETE.from(ASSESSMENT).where({ ID: { in: ids } }));
        return `deleted ${ids.length}`;
    });

    this.on('deleteAssessmentsForProject', async (req) => {
        const { PROJECT_ID, COMPANY_ID } = req.data;
        try {
            const n = await purgeProjectAssessments(cds.transaction(req), PROJECT_ID, COMPANY_ID, currentUser(req));
            return n === 0
                ? `No assessments found for project with ID ${PROJECT_ID}.`
                : `All assessments and related data for project with ID ${PROJECT_ID} have been successfully deleted.`;
        } catch (error) {
            req.error(500, 'Error deleting assessments or their related data.', error);
        }
    });

    // Cascade: deleting a project also removes its assessments (analysis) so no
    // orphaned data is left behind and cost stats stay accurate.
    this.before('DELETE', 'MSTR_PROJECT', async req => {
        try {
            const keys = req.data || {};
            const projectId = keys.ID;
            const companyId = keys.COMPANY_ID ?? keys.COMPANY_ID_ID ?? null;
            if (projectId != null) {
                await purgeProjectAssessments(cds.transaction(req), projectId, companyId, currentUser(req));
            }
        } catch (error) {
            return req.error(500, 'Could not delete the project\'s analysis data.');
        }
    });

    // Cascade: deleting a company removes each of its projects' assessments, then
    // the projects and the user->company mappings.
    this.before('DELETE', 'MSTR_COMPANY', async req => {
        try {
            const companyId = (req.data || {}).ID;
            if (companyId == null) { return; }
            const tx = cds.transaction(req);
            const deletedBy = currentUser(req);
            const projects = await tx.read(MSTR_PROJECT).where({ COMPANY_ID: companyId });
            for (const p of projects) {
                await purgeProjectAssessments(tx, p.ID, companyId, deletedBy);
            }
            await tx.run(DELETE.from(MSTR_PROJECT).where({ COMPANY_ID: companyId }));
            await tx.run(DELETE.from(COMPANY_USER_MAP).where({ COMPANY_ID: companyId }));
        } catch (error) {
            return req.error(500, 'Could not delete the company\'s related data.');
        }
    });

    // ---- Upload limits (per company / project). Admin+ manages; everyone's
    // uploads are enforced against them in UploadObject. ----
    this.on('GetUploadLimits', async req => {
        if (roleRank(await effectiveRoleOf(currentUser(req))) < ROLE_RANK.ADMIN) {
            return { companies: [], projects: [] };
        }
        const companies = await SELECT.from(MSTR_COMPANY).columns('ID', 'COMPANY_NAME', 'OBJECT_LIMIT', 'OBJECTS_CONSUMED');
        const projects = await SELECT.from(MSTR_PROJECT).columns('ID', 'COMPANY.ID as COMPANY_ID', 'PROJECT_NAME', 'OBJECT_LIMIT', 'OBJECTS_CONSUMED');
        const cName = {};
        for (const c of companies) { cName[c.ID] = c.COMPANY_NAME; }
        // "used" = cumulative OBJECTS_CONSUMED (transparent; not reduced on delete).
        return {
            companies: companies.map(c => ({
                ID: c.ID, name: c.COMPANY_NAME, used: c.OBJECTS_CONSUMED || 0,
                limit: c.OBJECT_LIMIT
            })),
            projects: projects.map(p => ({
                ID: p.ID, companyId: p.COMPANY_ID, name: p.PROJECT_NAME,
                companyName: cName[p.COMPANY_ID] || ('Company ' + p.COMPANY_ID),
                used: p.OBJECTS_CONSUMED || 0, limit: p.OBJECT_LIMIT
            }))
        };
    });

    // A blank/negative limit clears the cap (unlimited).
    const normLimit = v => (v === null || v === undefined || v === '' || Number(v) < 0) ? null : parseInt(v, 10);

    this.on('SetCompanyLimit', async req => {
        if (roleRank(await effectiveRoleOf(currentUser(req))) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        await UPDATE(MSTR_COMPANY).set({ OBJECT_LIMIT: normLimit(req.data.limit) }).where({ ID: req.data.ID });
        return 'saved';
    });

    this.on('SetProjectLimit', async req => {
        if (roleRank(await effectiveRoleOf(currentUser(req))) < ROLE_RANK.ADMIN) { return 'forbidden'; }
        await UPDATE(MSTR_PROJECT).set({ OBJECT_LIMIT: normLimit(req.data.limit) })
            .where({ ID: req.data.ID, COMPANY_ID: req.data.COMPANY_ID });
        return 'saved';
    });

    // ---- Archive / restore (soft delete). Companies: admin+. Projects:
    // superuser+ (they already manage/delete projects). ----
    const rankOf = async (req) => roleRank(await effectiveRoleOf(currentUser(req)));
    const requireAdmin = async (req) => (await rankOf(req)) >= ROLE_RANK.ADMIN;
    const requireSuperuser = async (req) => (await rankOf(req)) >= ROLE_RANK.SUPERUSER;

    this.on('ArchiveCompany', async req => {
        if (!await requireAdmin(req)) { return 'forbidden'; }
        await UPDATE(MSTR_COMPANY).set({ ARCHIVED_AT: new Date().toISOString() }).where({ ID: req.data.ID });
        // Cascade the flag to the company's projects so they drop out of the
        // upload dropdowns too.
        await UPDATE(MSTR_PROJECT).set({ ARCHIVED_AT: new Date().toISOString(), ACTIVE_STATUS: false }).where({ COMPANY_ID: req.data.ID });
        return 'archived';
    });

    this.on('RestoreCompany', async req => {
        if (!await requireAdmin(req)) { return 'forbidden'; }
        await UPDATE(MSTR_COMPANY).set({ ARCHIVED_AT: null }).where({ ID: req.data.ID });
        await UPDATE(MSTR_PROJECT).set({ ARCHIVED_AT: null, ACTIVE_STATUS: true }).where({ COMPANY_ID: req.data.ID });
        return 'restored';
    });

    this.on('ArchiveProject', async req => {
        if (!await requireSuperuser(req)) { return 'forbidden'; }
        await UPDATE(MSTR_PROJECT).set({ ARCHIVED_AT: new Date().toISOString(), ACTIVE_STATUS: false })
            .where({ ID: req.data.ID, COMPANY_ID: req.data.COMPANY_ID });
        return 'archived';
    });

    this.on('RestoreProject', async req => {
        if (!await requireSuperuser(req)) { return 'forbidden'; }
        await UPDATE(MSTR_PROJECT).set({ ARCHIVED_AT: null, ACTIVE_STATUS: true })
            .where({ ID: req.data.ID, COMPANY_ID: req.data.COMPANY_ID });
        return 'restored';
    });

    // Counts for the archive/delete confirmation dialog.
    this.on('GetDeleteImpact', async req => {
        const { kind, ID, COMPANY_ID } = req.data;
        if (String(kind).toUpperCase() === 'COMPANY') {
            const projects = await SELECT.from(MSTR_PROJECT).columns('ID').where({ COMPANY_ID: ID });
            const pids = projects.map(p => p.ID);
            let assessments = 0;
            if (pids.length) {
                const rows = await SELECT.from(ASSESSMENT).columns('ID').where({ 'PROJECT.ID in': pids });
                assessments = rows.length;
            }
            return { projects: projects.length, assessments };
        }
        // project
        const rows = await SELECT.from(ASSESSMENT).columns('ID').where({ PROJECT_ID: ID, PROJECT_COMPANY_ID: COMPANY_ID });
        return { projects: 0, assessments: rows.length };
    });


    this.on('PostRawAnalysisToAI', async req => {
        try {
            const { assessmentID, projectID, companyID, docType, prompt, model } = req.data;

            const { analysis, objectName } = await SELECT.one.from(ASSESSMENT)
                .columns('RAW_ANALYSIS as analysis', 'OBJECT_NAME as objectName')
                .where({ ID: assessmentID });

            const ProjectName = await SELECT.one.from(MSTR_PROJECT)
                .columns('PROJECT_NAME as ProjectName')
                .where({ ID: projectID });

            const CompanyName = await SELECT.one.from(MSTR_COMPANY)
                .columns('COMPANY_NAME as CompanyName')
                .where({ ID: companyID });

            const companyName = CompanyName ? CompanyName.CompanyName : 'No Company Found';
            const projectName = ProjectName ? ProjectName.ProjectName : 'No Project Found';

            console.log(companyName);
            console.log(projectName);

            if (!analysis) {
                console.log("No raw analysis found for the given assessmentID.");
                return false;
            }

            console.log("Retrieved RAW_ANALYSIS: ", analysis);

            const aiPayload = {
                projectID: projectID,
                companyID: companyID,
                docType: docType,
                assessmentID: assessmentID,
                objectName: objectName,
                CompanyName: companyName,
                ProjectName: projectName,
                prompt: prompt,
                analysis: JSON.parse(analysis),
                model: model || DEFAULT_MODEL,
            };

            const aiResponse = await axios.post(`${await util.getApiBase()}/docs/export`, aiPayload, {
                responseType: 'arraybuffer'
            });

            console.log("AI response received");

            if (aiResponse.data) {
                const base64Encoded = Buffer.from(aiResponse.data, 'binary').toString('base64');
                console.log("Converted binary to Base64:", base64Encoded);

                return { base64Data: base64Encoded };
            } else {
                console.log("No binary data found in AI response.");
                return false;
            }

        } catch (error) {
            console.error("Error while posting raw analysis to AI: ", error);
            return false;
        }
    });


    this.on('calculateROI', async (req) => {
        try {
            const data = req.data;
            let entries = [];

            // Category: Minimize Expenses for Managing Existing Custom Code
            let baseline = data.AnnualMaintainanceCost * (data.CustomCodeMaintenancePercent / 100);
            let totalBenefits = baseline * (data.CustomCodeImprovementPercent / 100);
            entries.push({
                Category: "Minimize Expenses for Managing Existing Custom Code",
                Value_Driver: "Existing Custom Code Maintenance Cost",
                Yearly_Benefits: totalBenefits
            });

            // Category: Lower Spending on New Custom Development Efforts
            baseline = data.AnnualMaintainanceCost * (data.NewDevSpendPercent / 100);
            totalBenefits = baseline * (data.NewDevImprovementPercent / 100);
            entries.push({
                Category: "Lower Spending on New Custom Development Efforts",
                Value_Driver: "Annual Spend on Custom Developments",
                Yearly_Benefits: totalBenefits
            });

            // Category: Decrease Costs Associated with IT Project Execution
            baseline = 7 * 5000 * (data.TechDebtImpactPercent / 100);
            totalBenefits = baseline * (data.TechDebtImprovementPercent / 100);
            entries.push({
                Category: "Decrease Costs Associated with IT Project Execution",
                Value_Driver: "Estimated Technical Debt Impact",
                Yearly_Benefits: totalBenefits
            });

            // Category: Cut Down on IT Integration and Maintenance Expenses

            baseline = data.Revenue * (data.ITSpendPercent / 100) * (data.SAPSpendPercent / 100) * (data.ITMaintenanceCostPercent / 100);
            // missing field
            totalBenefits = baseline * (data.ITMaintenanceImprovementPercent / 100);
            entries.push({
                Category: "Cut Down on IT Integration and Maintenance Expenses",
                Value_Driver: "Total IT Spend (% of Revenue)",
                Yearly_Benefits: totalBenefits
            });

            // Category: Lessen the Impact of Poor Data Quality on Costs
            baseline = data.Revenue * (data.DataQualityLossPercent / 100);
            totalBenefits = baseline * (data.DataQualityImprovementPercent / 100);
            entries.push({
                Category: "Lessen the Impact of Poor Data Quality on Costs",
                Value_Driver: "Revenue Lost Due to Poor Data Quality",
                Yearly_Benefits: totalBenefits
            });

            // Category: Optimize Expenses Related to Data Security
            baseline = data.Revenue * (data.ITSecuritySpendPercent / 100) * (data.SAPSecuritySpendPercent / 100) * (data.DataSecurityCostPercent / 100);
            totalBenefits = baseline * (data.DataSecurityImprovementPercent / 100);
            entries.push({
                Category: "Optimize Expenses Related to Data Security",
                Value_Driver: "Total IT Spend (% of Revenue)",
                Yearly_Benefits: totalBenefits
            });

            // Category: Reduce Disk Storage Expenses
            baseline = data.TotalDiskStorage * data.CostPerTB * data.NumberOfInstances;
            totalBenefits = baseline * (data.DiskStorageImprovementPercent / 100);
            entries.push({
                Category: "Reduce Disk Storage Expenses",
                Value_Driver: "Total Disk Data Storage",
                Yearly_Benefits: totalBenefits
            });

            // Category: Decrease Memory Storage Costs
            baseline = data.TotalMemoryStorage * data.CostPerTBMemory * data.NumberOfInstances;
            totalBenefits = baseline * (data.MemoryStorageImprovementPercent / 100);
            entries.push({
                Category: "Decrease Memory Storage Costs",
                Value_Driver: "Total Memory Storage",
                Yearly_Benefits: totalBenefits
            });

            const isExist = await SELECT.from(ROI_Calculation_Output).where({ project_ID: req.data.Project_ID });
            if (isExist.length == 0) {
                console.log("inserted");
                await INSERT.into(ROI_Calculation_Output).entries(entries)
            } else {
                console.log("not inserted");
            }

            return { message: "ROI Calculations successful", results: entries };
        } catch (error) {
            console.error(error);
            return { error: "Error calculating ROI" };
        }
    });


    this.on('chat', async req => {
        try {
            const { assessmentID, projectID, docType, user, prompt, model, deep } = req.data;
            const project = await SELECT.one.from(MSTR_PROJECT).where({ ID: projectID });
            if (!project || !project.COMPANY_ID) { return req.error(400, 'Invalid project.'); }
            const { COMPANY_ID, PROJECT_NAME } = project;
            const comp = await SELECT.one.from(MSTR_COMPANY).where({ ID: COMPANY_ID }) || {};

            const analysis = await SELECT.one.from(ASSESSMENT).where({ ID: assessmentID });
            if (!analysis) { return req.error(404, 'Assessment not found.'); }
            if (!analysis.RAW_ANALYSIS) {
                return req.error(422, 'This object has no stored analysis to generate a document from. Please re-analyze it.');
            }
            let parsedAnalysis;
            try { parsedAnalysis = JSON.parse(analysis.RAW_ANALYSIS); }
            catch (e) { return req.error(422, 'The stored analysis is unreadable; please re-analyze the object.'); }

            // On a refine (non-empty prompt) the AI edits the CURRENT draft in place.
            // Load it SERVER-SIDE (latest stored draft/version for this object+docType)
            // rather than receiving it from the client -- sending the large HTML as an
            // action param bloated the request URL and dropped other params (model).
            let currentDoc = "";
            if (prompt) {
                const last = await SELECT.one.from(LLMChatHistory)
                    .columns('response')
                    .where({ assessmentID: String(assessmentID), projectID: String(projectID), docType: docType })
                    .orderBy('ID desc');
                if (last && last.response) { currentDoc = util.lobText(last.response); }
            }

            const payload = {
                analysis: parsedAnalysis,
                objectName: analysis.OBJECT_NAME,
                CompanyName: comp.COMPANY_NAME,
                ProjectName: PROJECT_NAME,
                docType: docType,
                user: user,
                chat_prompt: prompt,
                model: model || DEFAULT_MODEL,
                // Current draft loaded server-side; on a refine the AI edits THIS in
                // place instead of regenerating from the analysis (which lost content).
                current_doc: currentDoc
            }
            // Record the model actually sent, so a "wrong model was used" report is
            // verifiable from the srv logs (empty selection falls back to DEFAULT_MODEL).
            await logEvent({ action: 'chat', message: `docgen model=${payload.model} docType=${docType} mode=${prompt ? 'refine/qna' : 'generate'} (selected='${model || ''}')`, user, assessmentID, projectID });
            // Deep analysis: ground the doc on a spec extracted from the ABAP source.
            // Reuse the cached extraction if present; otherwise send the source so the
            // AI extracts it once (and returns it below to cache).
            let cachedSpec = null;
            if (deep === true || deep === 'true') {
                payload.deep = true;
                if (analysis.DEEP_SPEC) {
                    try { cachedSpec = JSON.parse(util.lobText(analysis.DEEP_SPEC)); } catch (e) { cachedSpec = null; }
                }
                if (cachedSpec) { payload.deep_spec = cachedSpec; }
                else if (analysis.SOURCE_CODE) { payload.source = util.lobText(analysis.SOURCE_CODE); }
            }
            // The AI API's /docs/chat returns { relevance, response: html, usage }.
            let aiResponse;
            try {
                aiResponse = await axios.post(`${await util.getApiBase()}/docs/chat`, payload, { timeout: DOC_TIMEOUT_MS });
            } catch (err) {
                const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
                const status = err.response && err.response.status;
                // The AI API returns { error: { code, message } }; surface it so the
                // failure reason is specific instead of a blanket "unavailable".
                const aiErr = err.response && err.response.data && err.response.data.error;
                const aiMsg = aiErr && aiErr.message;
                await logEvent({ level: 'ERROR', action: 'chat', message: `docs/chat ${isTimeout ? 'timeout' : 'failed'} (status=${status || err.code || 'none'}${aiErr ? '/' + aiErr.code : ''}): ${aiMsg || err.message}`, user, assessmentID, projectID });
                if (isTimeout) {
                    return req.error(504, 'Document generation timed out. Please try a faster model or a shorter request.');
                }
                if (aiMsg) {
                    return req.error(status || 502, `Document generation failed: ${aiMsg}`);
                }
                return req.error(502, `The document service returned an error${status ? ' (' + status + ')' : ''}. Please try again.`);
            }
            const chatHtml = (aiResponse.data && aiResponse.data.response) || aiResponse.data;
            const usage = aiResponse.data && aiResponse.data.usage;
            // Cache a freshly-extracted deep spec on the object so later regenerate/
            // refine reuse it instead of re-running the slow extraction.
            const newSpec = aiResponse.data && aiResponse.data.deep_spec;
            if ((deep === true || deep === 'true') && newSpec && !cachedSpec) {
                try { await UPDATE(ASSESSMENT).set({ DEEP_SPEC: JSON.stringify(newSpec) }).where({ ID: assessmentID }); }
                catch (e) { /* caching is best-effort; generation already succeeded */ }
            }
            // relevance=false => the prompt was a QUESTION about the document, not an
            // add/remove/modify request. Return the answer for the chat panel only;
            // do NOT touch the document and do NOT create a new version.
            const isModification = aiResponse.data && aiResponse.data.relevance !== false;
            if (!isModification) {
                return { responseID: null, aiResponse: chatHtml, relevance: false };
            }

            let { maxID } = await SELECT.one.from(LLMChatHistory).columns('MAX(ID) as maxID');
            if (!maxID || typeof maxID === NaN) {
                maxID = 0;
            }
            maxID += 1;

            await INSERT.into(LLMChatHistory).entries({
                ID: maxID,
                assessmentID: assessmentID,
                projectID: projectID,
                user: user,
                docType: docType,
                prompt: prompt,
                response: chatHtml,
                CREATED_AT: new Date().toISOString(),   // backs the version label
                // A generation/refine is a working DRAFT: it records cost but is not a
                // version until the user explicitly saves it (SaveDocVersion).
                IS_SAVED: false,
                // Docgen token/cost from the AI API's usage object (it prices per
                // model), so project stats can total docgen spend.
                inputTokens: usage ? usage.input_tokens : null,
                outputTokens: usage ? usage.output_tokens : null,
                totalTokens: usage ? usage.total_tokens : null,
                costUsd: usage ? usage.cost_usd : null
            })

            return { responseID: maxID, aiResponse: chatHtml, relevance: true }
        } catch (error) {
            console.log(error);
            req.error(500, error.message);
        }
    });

    // "v<n>-<DDMMYYYY>-<HHmm>" from a version number + timestamp (UTC on CF).
    const _docVersionLabel = (n, ts) => {
        const d = ts ? new Date(ts) : null;
        if (!d || isNaN(d.getTime())) { return `v${n}`; }
        const p = x => String(x).padStart(2, '0');
        return `v${n}-${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${d.getUTCFullYear()}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
    };

    // List every stored document snapshot for one object + docType as a version.
    // assessmentID/projectID are String(100) columns, so compare as strings.
    this.on('GetDocVersions', async req => {
        try {
            const { assessmentID, projectID, docType } = req.data;
            const all = await SELECT.from(LLMChatHistory)
                .columns('ID', 'prompt', 'docType', 'CREATED_AT', 'IS_SAVED')
                .where({ assessmentID: String(assessmentID), projectID: String(projectID), docType: docType })
                .orderBy('ID asc');
            // Only SAVED snapshots are versions. Draft rows (IS_SAVED=false) record
            // cost but are hidden; legacy rows (null) predate the flag -> treat as saved.
            const rows = all.filter(r => r.IS_SAVED !== false);
            // Number chronologically (v1 = oldest); present newest-first for the picker.
            const numbered = rows.map((r, i) => ({
                ID: r.ID,
                VERSION_NO: i + 1,
                LABEL: _docVersionLabel(i + 1, r.CREATED_AT),
                PROMPT: r.prompt || '',
                CREATED_AT: r.CREATED_AT
            }));
            return numbered.reverse();
        } catch (error) {
            await logEvent({ level: 'WARN', action: 'GetDocVersions', message: error.message });
            return [];
        }
    });

    // Load one stored document snapshot (its full HTML) by history ID.
    this.on('GetDocVersion', async req => {
        try {
            const { ID } = req.data;
            const row = await SELECT.one.from(LLMChatHistory).where({ ID: ID });
            if (!row) { return req.error(404, 'Document version not found.'); }
            return { ID: row.ID, DOC_TYPE: row.docType, LABEL: '', CONTENT: util.lobText(row.response) };
        } catch (error) {
            await logEvent({ level: 'ERROR', action: 'GetDocVersion', message: error.message });
            return req.error(500, 'Could not load the document version.');
        }
    });

    // Save the current editor content as an explicit version snapshot. Cost-free
    // (no LLM call): it just persists whatever is on screen with IS_SAVED=true.
    this.on('SaveDocVersion', async req => {
        try {
            const { assessmentID, projectID, docType, user, content } = req.data;
            if (!content || !String(content).trim()) { return req.error(400, 'Nothing to save.'); }
            let { maxID } = await SELECT.one.from(LLMChatHistory).columns('MAX(ID) as maxID');
            if (!maxID || typeof maxID === NaN) { maxID = 0; }
            maxID += 1;
            await INSERT.into(LLMChatHistory).entries({
                ID: maxID,
                assessmentID: String(assessmentID),
                projectID: String(projectID),
                user: user,
                docType: docType,
                prompt: 'Saved version',
                response: content,
                CREATED_AT: new Date().toISOString(),
                IS_SAVED: true
                // No cost/token fields: a save is not a generation.
            });
            return { ID: maxID };
        } catch (error) {
            await logEvent({ level: 'ERROR', action: 'SaveDocVersion', message: error.message });
            return req.error(500, 'Could not save the version.');
        }
    });

    // Delete a SAVED version snapshot. Draft rows (IS_SAVED=false) carry cost and are
    // never removable here, so docgen spend cannot be hidden by deleting versions.
    this.on('DeleteDocVersion', async req => {
        try {
            const { ID } = req.data;
            const row = await SELECT.one.from(LLMChatHistory).where({ ID: ID });
            if (!row) { return 'not_found'; }
            if (row.IS_SAVED === false) { return 'forbidden'; }   // a cost-bearing draft
            await DELETE.from(LLMChatHistory).where({ ID: ID });
            return 'deleted';
        } catch (error) {
            await logEvent({ level: 'ERROR', action: 'DeleteDocVersion', message: error.message });
            return req.error(500, 'Could not delete the version.');
        }
    });

    this.on('reactOnChat', async req => {
        try {
            const { remarks, upvote, downvote, ID } = req.data;
            const up = upvote || 0, down = downvote || 0;

            const chat = await SELECT.one.from(LLMChatHistory).where({ ID: ID });
            if (!chat) return req.error(404, 'chat not found');

            const totalUp = (chat.upvotes || 0) + up;
            const totalDown = (chat.downvotes || 0) + down;

            await UPDATE(LLMChatHistory).set({ upvotes: totalUp, downvotes: totalDown, remarks: remarks }).where({ ID: ID });

            // Mirror into unified FEEDBACK (DOCGEN_CHAT) for the admin dashboard.
            const user = (req.user && req.user.id) || chat.user;
            const existing = await SELECT.one.from(FEEDBACK).where({ SOURCE: 'DOCGEN_CHAT', CHAT_ID: ID, USER: user });
            if (existing) {
                await UPDATE(FEEDBACK).set({
                    UPVOTES: existing.UPVOTES + up, DOWNVOTES: existing.DOWNVOTES + down,
                    COMMENT: remarks != null ? remarks : existing.COMMENT
                }).where({ ID: existing.ID });
            } else {
                await INSERT.into(FEEDBACK).entries({
                    SOURCE: 'DOCGEN_CHAT', CHAT_ID: ID,
                    ASSESSMENT_ID: chat.assessmentID ? Number(chat.assessmentID) : null,
                    PROJECT_ID: chat.projectID ? Number(chat.projectID) : null,
                    DOC_TYPE: chat.docType || null,
                    UPVOTES: up, DOWNVOTES: down, COMMENT: remarks || null, USER: user
                });
            }

            return { totalUpvotes: totalUp, totalDownvotes: totalDown, remarks: remarks };
        } catch (error) {
            console.log(error);
            await logEvent({ level: 'ERROR', action: 'reactOnChat', message: error.message, context: error.stack });
        }
    })

    this.on('generateDoc', async req => {
        try {
            const { assessmentID, projectID, docType, user, prompt, lastResponse, model } = req.data;
            const projectData = await SELECT.one.from(MSTR_PROJECT).where({ ID: projectID });
            if (!projectData) {
                return req.error(400, 'Invalid project id or assessment id')
            }
            const { ID, COMPANY_ID, PROJECT_NAME } = projectData;
            const { COMPANY_NAME } = await SELECT.one.from(MSTR_COMPANY).where({ ID: COMPANY_ID });

            if (!ID || !COMPANY_ID) return req.error(400, 'Invalid projectID');
            const analysis = await SELECT.one.from(ASSESSMENT).where({ ID: assessmentID });

            const payload = {
                analysis: JSON.parse(analysis.RAW_ANALYSIS),
                objectName: analysis.OBJECT_NAME,
                CompanyName: COMPANY_NAME,
                ProjectName: PROJECT_NAME,
                docType: docType,
                user: user,
                chat_prompt: prompt,
                last_response: lastResponse,
                model: model || DEFAULT_MODEL
            }
            // fs.writeFileSync('gendoc.json', JSON.stringify(payload, null, 2));
            const aiResponse = await axios.post(`${await util.getApiBase()}/docs/from-response`, payload, {
                responseType: 'arraybuffer'
            });
            console.log(aiResponse.data);


            const base64Encoded = Buffer.from(aiResponse.data, 'binary').toString('base64');

            const response = {
                content: base64Encoded
            }
            if (docType === 'FSD') {
                response.filename = analysis.OBJECT_NAME + '_Functional_Specification_Document'
            } else if (docType === 'TSD') {
                response.filename = analysis.OBJECT_NAME + '_Technical_Specification_Document'
            } else {
                response.filename = analysis.OBJECT_NAME + '_Business_Blueprint_Document'
            }

            return response;
        } catch (error) {
            console.log(error);
            req.error(500, error.message);
        }
    })

    // Match key for one feedback target: assessment (ASSESSMENT) or chat (DOCGEN_CHAT).
    const feedbackKey = (source, { assessmentID, chatID }) =>
        source === 'DOCGEN_CHAT' ? { SOURCE: source, CHAT_ID: chatID } : { SOURCE: source, ASSESSMENT_ID: assessmentID };

    // Model list for the UI dropdown, read live from the AI API.
    this.on('GetModels', async () => {
        try {
            const { data } = await axios.get(`${await util.getApiBase()}/models`, { timeout: 10000 });
            const names = (data && data.models) || [];
            return {
                default: (data && data.default) || DEFAULT_MODEL,
                models: names.filter(n => !String(n).includes('embedding')).map(n => ({ name: n }))
            };
        } catch (error) {
            await logEvent({ level: 'WARN', action: 'GetModels', message: error.message });
            return { default: DEFAULT_MODEL, models: [{ name: DEFAULT_MODEL }] };
        }
    });

    // Unified feedback upsert (up/down + comment) per user + target. Works for
    // both assessment analysis and docgen chat via `source`.
    this.on('SubmitFeedback', async req => {
        try {
            const { source, assessmentID, projectID, chatID, docType, upvote, downvote, comment, user } = req.data;
            const s = String(source || '').toUpperCase();
            if (s !== 'ASSESSMENT' && s !== 'DOCGEN_CHAT') return req.error(400, 'source must be ASSESSMENT or DOCGEN_CHAT');
            if (s === 'DOCGEN_CHAT' && !chatID) return req.error(400, 'chatID required for DOCGEN_CHAT');
            if (s === 'ASSESSMENT' && !assessmentID) return req.error(400, 'assessmentID required for ASSESSMENT');

            const key = { ...feedbackKey(s, { assessmentID, chatID }), USER: user };
            const existing = await SELECT.one.from(FEEDBACK).where(key);

            if (existing) {
                await UPDATE(FEEDBACK).set({
                    UPVOTES: existing.UPVOTES + (upvote || 0),
                    DOWNVOTES: existing.DOWNVOTES + (downvote || 0),
                    COMMENT: comment != null ? comment : existing.COMMENT
                }).where({ ID: existing.ID });
            } else {
                await INSERT.into(FEEDBACK).entries({
                    SOURCE: s, ASSESSMENT_ID: assessmentID || null, PROJECT_ID: projectID || null,
                    CHAT_ID: chatID || null, DOC_TYPE: docType || null,
                    UPVOTES: upvote || 0, DOWNVOTES: downvote || 0,
                    COMMENT: comment || null, USER: user
                });
            }
            await logEvent({ source: 'UI', action: 'SubmitFeedback', message: `${s} up:${upvote || 0} down:${downvote || 0}`, user, assessmentID, projectID });
            return true;
        } catch (error) {
            await logEvent({ level: 'ERROR', action: 'SubmitFeedback', message: error.message, context: error.stack });
            console.error(error);
            return false;
        }
    });

    // Caller's own vote/comment + aggregate up/down totals for a target.
    this.on('GetFeedback', async req => {
        try {
            const { source, assessmentID, chatID } = req.data;
            const s = String(source || '').toUpperCase();
            const user = req.user && req.user.id;
            const target = feedbackKey(s, { assessmentID, chatID });

            const mine = await SELECT.one.from(FEEDBACK).where({ ...target, USER: user });
            const [agg] = await SELECT.from(FEEDBACK)
                .columns('sum(UPVOTES) as up', 'sum(DOWNVOTES) as down')
                .where(target);

            return {
                upvotes: mine ? mine.UPVOTES : 0,
                downvotes: mine ? mine.DOWNVOTES : 0,
                comment: mine ? mine.COMMENT : null,
                totals: { upvotes: (agg && agg.up) || 0, downvotes: (agg && agg.down) || 0 }
            };
        } catch (error) {
            console.error(error);
            req.error(500, error.message);
        }
    });


});