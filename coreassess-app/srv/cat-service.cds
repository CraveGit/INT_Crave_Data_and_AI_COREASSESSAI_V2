using CRA as my from '../db/schema';

// Every handler resolves data from the caller's identity (COMPANY_USER_MAP,
// MSTR_USER.ROLE) and returns [] for 'anonymous'. Without this the service is
// public: locally the browser is never challenged so nothing renders, and on CF
// the srv route bypasses the approuter entirely.
@path    : 'assessment'
service AssessmentService {
    entity ASSESSMENT                      as projection on my.ASSESSMENT;
    entity ASSESSMENT_ITEM                as projection on my.ASSESSMENT_ITEM;
    entity ASSESSMENT_NOTE                as projection on my.ASSESSMENT_NOTE;
    entity ASSESSMENT_USAGE               as projection on my.ASSESSMENT_USAGE;
    entity BTP_SERVICES                   as projection on my.BTP_SERVICES;
    entity BTP_SERVICES_PRICE_LIST        as projection on my.BTP_SERVICES_PRICE_LIST;
    entity MSTR_COMPANY                   as projection on my.MSTR_COMPANY;
    entity MSTR_PROJECT                   as projection on my.MSTR_PROJECT;
    entity MSTR_USER                      as projection on my.MSTR_USER;
    entity KPI_D_GRAPH_1                  as projection on my.KPI_D_GRAPH_1;
    entity KPI_D_GRAPH_2                  as projection on my.KPI_D_GRAPH_2;
    entity KPI_D_GRAPH_3                  as projection on my.KPI_D_GRAPH_3;
    entity KPI_D_GRAPH_4                  as projection on my.KPI_D_GRAPH_4;
    entity PROPMT                         as projection on my.PROPMT;
    entity CONFIG_MSTR                    as projection on my.CONFIG_MSTR;
    entity CONFIG_DETAILS                 as projection on my.CONFIG_DETAILS;
    entity MSTR_QUESTIONNAIRE             as projection on my.MSTR_QUESTIONNAIRE;
    entity OBJECT_ESTIMATE_ANSWER         as projection on my.OBJECT_ESTIMATE_ANSWER;
    entity S4_STANDARD_EVENTS             as projection on my.S4_STANDARD_EVENTS;
    entity Project_Header                 as projection on my.Project_Header;
    entity Project_Config                 as projection on my.Project_Config;
    entity Migration_Option               as projection on my.Migration_Option;
    entity RICEFW_Objects                 as projection on my.RICEFW_Objects;
    entity ExportMWC                      as projection on my.ExportMWC;
    entity COMPANY_USER_MAP               as projection on my.COMPANY_USER_MAP;
    entity CustomerData_ROI               as projection on my.CustomerData_ROI;
    entity ROI_Calculation                as projection on my.ROI_Calculation;
    entity YEAR                           as projection on my.YEAR;
    entity ROI_Calculation_Output         as projection on my.ROI_Calculation_Output;
    entity SkillSet                       as projection on my.SkillSet;
    entity YearCalculation                as projection on my.YearCalculation;
    entity REF_EVENTS                     as projection on my.REF_EVENTS;
    entity REF_PRICELIST                  as projection on my.REF_PRICELIST;
    entity REF_FIORIAPPS                  as projection on my.REF_FIORIAPPS;
    entity FILE_STORAGE                   as projection on my.FILE_STORAGE;
    entity PRIORITY_CONFIG                as projection on my.PRIORITY_CONFIG;
    entity TSHIRT_CONFIG                  as projection on my.TSHIRT_CONFIG;
    entity AUTHORIZATION_CHECK            as projection on my.AUTHORIZATION_CHECK;
    entity FIELD_VALUES                   as projection on my.FIELD_VALUES;
    entity LLMChatHistory                 as projection on my.LLMChatHistory;
    entity COST_LEDGER                    as projection on my.COST_LEDGER;
    entity APP_LOG                        as projection on my.APP_LOG;
    entity FEEDBACK                       as projection on my.FEEDBACK;
    entity ACCESS_REQUEST                 as projection on my.ACCESS_REQUEST;
    entity TICKET                         as projection on my.TICKET;


    type HIGH_LVL_RECOMMENDATIONS_TYPE {
        ASSESSMENT_ID : Integer;
        ID            : String;
        TITLE         : String;
        DESCRIPTION   : String;
    }

    type GetObjectType {
        ID                       : Integer;
        PROJECT_ID               : Integer;
        OBJECT_NAME              : String;
        READ_CRUD                : String;
        SAP_MODULE_NAME          : String;
        CLEAN_CORE_HIGH_LEVEL    : String;
        FUNCTIONAL_ANALYSIS      : String;
        CODE_COMPLEXITY          : String;
        COUPLING                 : String;
        APPROACH                 : String;
        ADHERENCE                : String;
        CLEANCORE_TIER           : String;
        CLEANCORE_TIER_REASON    : String;
        CLEANCORE_TARGET_TIER    : String;
        CLEANCORE_TARGET_TIER_REASON : String;
        SOURCE_FILES             : String;
        BTP_SERVICES_SEARCH      : String;
        CODELENGTH               : String;
        DEVELOPMENTAPPROACH      : String;
        WRICEF_OBJECT_TYPE       : many {
            ASSESSMENT_ID      : Integer;
            ID                 : String;
            WRICEF_OBJECT_TYPE : String;
        };
        HIGH_LVL_RECOMMENDATIONS : many HIGH_LVL_RECOMMENDATIONS_TYPE;
        BTP_SERVICES             : many {
            ASSESSMENT_ID : Integer;
            ID            : Integer;
            SERVICE_NAME  : String;
            METRICS       : String;
            QUANTITY      : Integer
        };
        STANDARD_TABLES          : many {
            ASSESSMENT_ID : Integer;
            TABLE_NAME    : String
        };
        CUSTOM_TABLES            : many {
            ASSESSMENT_ID : Integer;
            TABLE_NAME    : String
        };
        AUTHORIZATION_CHECK      : many {
            ASSESSMENT_ID : Integer;
            AUTHOBJECT    : String;
            FIELDSCHECKED : String;
            CHECKTYPE     : String;
            CODEREFERENCE : String;
        };
        RETIRE_EXPLAINATION      : String;
        REIMPLEMENTATION         : String;
        CODEQUALITYSCORE         : String;
        CODEQUALITYSCORERATIO    : String;
        CRITICALITY              : String;
        USAGECONTEXT             : String;
        CODEREFERENCE            : String;
        DETAILEDBREAKDOWN        : LargeString;
        SCOREANALYSIS            : LargeString;
        FIELD_VALUES             : many {
            ASSESSMENT_ID : Integer;
            ACTVT         : String;
            OBTYP         : String;
            STSMA         : String;
            BERSL         : String;
        };
    }

    entity vw_graph_module_wise_report    as
        select from ASSESSMENT as T0 {
            key T0.SAP_MODULE_NAME,
            key T0.PROJECT.ID as PROJECT_ID,
                cast(
                    count(T0.SAP_MODULE_NAME) as Integer
                )             as Count
        }
        where
            T0.SAP_MODULE_NAME is not null
        group by
            T0.SAP_MODULE_NAME,
            T0.PROJECT.ID;

    entity vw_distinct_complexity         as
        select from ASSESSMENT as T0 {
            key T0.PROJECT.ID as PROJECT_ID,
            key T0.CODE_COMPLEXITY
        }
        group by
            T0.CODE_COMPLEXITY,
            T0.PROJECT.ID;

    // entity vw_assessment as select from ASSESSMENT as T0 {
    //     *,
    //     cast(T0.B as String) as BTP_SERVICES_COMBINED
    // }


    function GetObjects(PROJECT_ID: Integer)                                                                                                                      returns many GetObjectType;
    action   UploadObject(ObjectName: String, ObjectContent: LargeString, SourceFiles: String, PROJECT_ID: Integer, PROJECT_COMPANY_ID: Integer, Skillset: Integer, UserEmail: String, model: String) returns Boolean; //SkillSet:String
    action   UploadFile(ObjectContent: LargeBinary)                                                                                                               returns String;
    action   UploadPriceFile(Content: LargeBinary)                                                                                                                returns String;
    function GetKPIGraph_1(PROJECT_ID: Integer)                                                                                                                   returns many kpi_obj;
    function GetKPIGraph_2(PROJECT_ID: Integer)                                                                                                                   returns many kpi_obj;
    function GetKPIGraph_3(PROJECT_ID: Integer)                                                                                                                   returns many kpi_obj;
    function GetKPIGraph_4(PROJECT_ID: Integer)                                                                                                                   returns many kpi_obj1;
    function GetMstrObjData(PROJECT_ID: Integer)                                                                                                                  returns MstrObjectDataType;
    // function GetUserRole()                                                                                                      returns String;
    function GetUserRole()                                                                                                                                        returns String;
    action   SetDisplayName(DISPLAY_NAME: String)                                                                                                                 returns Boolean;

    // ---- Admin panel: user management, access requests, project cost stats ----
    // Users visible to the caller (admin panel onboarding table).
    function GetUsers() returns many {
        ID             : Integer;
        USERNAME       : String;
        DISPLAY_NAME   : String;
        EMAIL          : String;
        ROLE           : String;
        ALLOWEDOBJECTS : Integer;
        UPLOADEDOBJECTS: Integer;
        COMPANY_ID     : Integer;
        // A user maps to many companies (COMPANY_USER_MAP); each company has many
        // projects. One row per mapped company, with its projects listed.
        MAPPINGS       : many {
            COMPANY_ID   : Integer;
            COMPANY_NAME : String;
            PROJECTS     : String;
        };
    };
    // Add a user. Guarded by the caller's role: OWNER can add anyone incl
    // ADMIN; ADMIN can add SUPERUSER/USER; SUPERUSER cannot add directly (use
    // RequestUser). Returns a status string ('created' | 'requested' | 'forbidden').
    // companyIDs is a comma-separated list (a user maps to many companies).
    action AddUser(displayName: String, email: String, role: String, allowedObjects: Integer, companyIDs: String) returns String;
    // Superuser raises a pending request for an admin to approve.
    action RequestUser(displayName: String, email: String, role: String, allowedObjects: Integer, companyIDs: String) returns String;
    // Edit an existing user: display name / role / allowed uploads / company
    // mappings, plus consumed uploads (uploadedObjects, owner only). Same
    // role guard as AddUser: cannot set a role >= the caller's own.
    action UpdateUser(email: String, displayName: String, role: String, allowedObjects: Integer, uploadedObjects: Integer, companyIDs: String) returns String;
    // Remove a user. Cannot remove yourself, a owner, or a peer/superior.
    action RemoveUser(email: String) returns String;
    // Pending/decided access requests (admin panel).
    function GetAccessRequests() returns many {
        ID           : String;
        DISPLAY_NAME : String;
        EMAIL        : String;
        ROLE         : String;
        ALLOWEDOBJECTS: Integer;
        STATUS       : String;
        REQUESTED_BY : String;
        COMPANY_ID   : Integer;
    };
    // Admin approves (creates the user) or rejects a request.
    action DecideAccessRequest(ID: String, approve: Boolean) returns String;
    // ---- Support tickets ----
    // Any authenticated user raises a ticket.
    action RaiseTicket(title: String, description: String) returns String;
    // The caller's own tickets (Raise Ticket page).
    function GetMyTickets() returns many {
        ID          : String;
        TITLE       : String;
        DESCRIPTION : String;
        STATUS      : String;
        CLOSE_COMMENT : String;
        createdAt   : DateTime;
    };
    // All tickets (admin panel) -- admin/owner only.
    function GetAllTickets() returns many {
        ID          : String;
        TITLE       : String;
        DESCRIPTION : String;
        STATUS      : String;
        RAISED_BY   : String;
        ACK_BY      : String;
        CLOSED_BY   : String;
        CLOSE_COMMENT : String;
        createdAt   : DateTime;
    };
    // Acknowledge or close a ticket (admin/owner). action: 'ACKNOWLEDGE' | 'CLOSE'.
    // comment: admin's note on why the ticket was closed (CLOSE only).
    action UpdateTicket(ID: String, action: String, comment: String) returns String;
    // Remove a resolved (CLOSED) ticket. Admin/owner only.
    action DeleteTicket(ID: String) returns String;

    // Per-project cost: analysis (ASSESSMENT_USAGE) + docgen (LLMChatHistory).
    function GetProjectCostStats() returns many {
        PROJECT_ID      : Integer;
        PROJECT_NAME    : String;
        COMPANY_ID      : Integer;
        COMPANY_NAME    : String;
        ASSESSMENT_TOTAL: Decimal(14, 4);
        DOCGEN_TOTAL    : Decimal(14, 4);
        PROJECT_TOTAL   : Decimal(14, 4);
        STATUS          : String;   // 'Active' | 'Inactive' (archived)
    };

    // Retained pricing history for DELETED objects/projects/companies (admin+ only).
    function GetCostLedger() returns many {
        ID           : String;
        OBJECT_NAME  : String;
        PROJECT_NAME : String;
        COMPANY_NAME : String;
        INCURRED_BY  : String;
        SOURCE       : String;
        TOTAL_TOKENS : Integer;
        COST_USD     : Decimal(14, 6);
        DELETED_AT   : Timestamp;
        DELETED_BY   : String;
        STATUS       : String;   // always 'Deleted' -- these are purged objects
    };
    // Remove a retained pricing-history row (admin/owner only).
    action DeleteCostLedger(ID: String) returns String;

    // ---- Upload limits (per company / per project) ----
    function GetUploadLimits() returns {
        companies : many { ID: Integer; name: String; used: Integer; limit: Integer; };
        projects  : many { ID: Integer; companyId: Integer; name: String; companyName: String; used: Integer; limit: Integer; };
    };
    action SetCompanyLimit(ID: Integer, limit: Integer) returns String;
    action SetProjectLimit(ID: Integer, COMPANY_ID: Integer, limit: Integer) returns String;

    // ---- Archive / restore (soft delete) for companies and projects ----
    action ArchiveCompany(ID: Integer)   returns String;
    action RestoreCompany(ID: Integer)   returns String;
    action ArchiveProject(ID: Integer, COMPANY_ID: Integer) returns String;
    action RestoreProject(ID: Integer, COMPANY_ID: Integer) returns String;
    // Blast-radius counts for the delete/archive confirmation dialog.
    function GetDeleteImpact(kind: String, ID: Integer, COMPANY_ID: Integer) returns {
        projects    : Integer;
        assessments : Integer;
    };
    action   CreatePrompt(PROMPT_STR: String, COMPANY_ID: Integer, PROJECT_ID: Integer, USER: String)                                                             returns PROPMT;
    function AnalyzeFileData(prompts: array of String, ObjectContent: LargeString, model: String)                                                                                returns ObjectType;
    action   DeletePrompt(COMPANY_ID: Integer, PROJECT_ID: Integer)                                                                                               returns Boolean;

    type UploadResult {
        message    : String;
        statusCode : Integer;
    }

    action   uploadLicenseFile(fileName: String)                                                                                                                  returns UploadResult;


    function GetObjectEstimate(companyID: Integer, projectID: Integer, assessmentID: Integer, objectName: String, type: String)                                   returns {
        default     : many {
            questionId  : Integer;
            question    : String;
            answer      : String;
            placeholder : String;
        };
        application : many {
            questionId  : Integer;
            question    : String;
            answer      : String;
            placeholder : String;
        };
        automation  : many {
            questionId  : Integer;
            question    : String;
            answer      : String;
            placeholder : String;
        };
    };

    type estimateAnswerObj {
        questionID : Integer;
        question   : String;
        answer     : String
    };

    action   AddEstimateAnswer(assessmentID: Integer, projectID: Integer, companyID: Integer, data: many estimateAnswerObj, model: String)                                       returns Boolean;

    type ObjectType {
        SAP_MODULE_NAME          : String;
        CLEAN_CORE_HIGH_LEVEL    : String;
        FUNCTIONAL_ANALYSIS      : String;
        CODE_COMPLEXITY          : String;
        STANDARD_TABLES          : String;
        CUSTOM_TABLES            : String;
        COUPLING                 : String;
        APPROACH                 : String;
        ADHERENCE                : String;
        BTP_SERVICES_SEARCH      : String;
        WRICEF_OBJECT_TYPE       : many {
            ASSESSMENT_ID      : Integer;
            ID                 : String;
            WRICEF_OBJECT_TYPE : String;
        };
        HIGH_LVL_RECOMMENDATIONS : many HIGH_LVL_RECOMMENDATIONS_TYPE;
        BTP_SERVICES             : many {
            ASSESSMENT_ID : Integer;
            ID            : Integer;
            SERVICE_NAME  : String;
            METRICS       : String;
            QUANTITY      : Integer
        }
    }

    type kpi_obj1 {
        name  : String;
        value : many {
            complexity : String;
            count      : Integer;
        }
    }

    type MstrObjectDataType : {
        SAP_MODULES     : many {
            name : String
        };
        APPROACH        : many {
            name : String
        };
        WRICEF          : many {
            name : String
        };
        ADHERENCE       : many {
            name : String
        };
        TSHIRT          : many {
            name : String
        };
        CODE_COMPLEXITY : many {
            name : String
        };
    }

    type kpi_obj {
        name  : String;
        value : Integer;
    }

    // Per-project item counts by KIND. ABAP report chart (GetKPIGraph_3).
    // Counts sourced from normalized ASSESSMENT_ITEM (KIND) instead of 22 tables.
    entity vw_abap_code_report            as
        select from ASSESSMENT_ITEM as I
        inner join ASSESSMENT as A
            on I.ASSESSMENT.ID = A.ID
        {
            key A.PROJECT.ID as PROJECT_ID,
                cast(sum( case when I.KIND = 'BAPI'           then 1 else 0 end ) as Integer) as BAPI_COUNT,
                cast(sum( case when I.KIND = 'STANDARD_TABLE' then 1 else 0 end ) as Integer) as STANDARD_TABLES_COUNT,
                cast(sum( case when I.KIND = 'CUSTOM_TABLE'   then 1 else 0 end ) as Integer) as CUSTOM_TABLES_COUNT,
                cast(sum( case when I.KIND = 'S4_TABLE'       then 1 else 0 end ) as Integer) as NEW_S4_TABLES_COUNT,
                cast(sum( case when I.KIND = 'SQL_API'        then 1 else 0 end ) as Integer) as SQL_ANALYSIS_TABLES_API_COUNT,
                cast(sum( case when I.KIND = 'SQL_CDS'        then 1 else 0 end ) as Integer) as SQL_ANALYSIS_TABLES_CDS_COUNT
        }
        group by
            A.PROJECT.ID;

    // Screens/Efforts counts (scalar on ASSESSMENT) kept separate from item counts.
    entity vw_abap_scalar_report          as
        select from ASSESSMENT as T0 {
            key T0.PROJECT.ID as PROJECT_ID,
                cast(
                    count(T0.SCREENS_USED) as Integer
                )             as SCREENS_USED_COUNT,
                cast(
                    count(T0.Efforts) as Integer
                )             as EFFORTS_COUNT
        }
        group by
            T0.PROJECT.ID;

    entity vw_module_based_efforts        as
        select from ASSESSMENT as T0 {
            key T0.SAP_MODULE_NAME,
            key T0.PROJECT.ID as PROJECT_ID,
                cast(
                    sum(T0.Efforts) as Integer
                )             as EffortsCount
        }
        where
            T0.Efforts is not null
        group by
            T0.SAP_MODULE_NAME,
            T0.PROJECT.ID;

    entity vw_unique_modules              as
        select from ASSESSMENT as T0 {
            key T0.SAP_MODULE_NAME as MODULE_NAME
        }
        group by
            T0.SAP_MODULE_NAME;

    entity vw_unique_approach             as
        select from ASSESSMENT as T0 {
            key T0.APPROACH as MODULE_NAME
        }
        group by
            T0.APPROACH;

    entity vw_unique_adherence            as
        select from ASSESSMENT as T0 {
            key T0.ADHERENCE as MODULE_NAME
        }
        group by
            T0.ADHERENCE;


    entity GetPromptsPerUser              as
        select from PROPMT as T1 {
            T1.ID,
            T1.USER,
            T1.PROMPT_STR,
            T1.createdAt
        }
        group by
            T1.createdAt,
            T1.PROMPT_STR,
            T1.ID,
            T1.USER;


    function GetFilterAttributes()                                                                                                                                returns filterAttributeType;

    type filterAttributeType {
        Filters : many {
            type   : String;
            name   : String;
            values : many {
                text : String;
                name : String;
            }
        }
    }

    function GetConfig()                                                                                                                                          returns ConfigMstrType;

    type ConfigMstrType {
        TABLES  : many obj;
        CRUD    : many obj;
        Screens : many obj;
        Forms   : many obj;

    }

    type obj {
        COMPLEXITY     : String;
        CONFIG_MSTR_ID : Integer;
        COUNT_FROM     : Integer;
        COUNT_TO       : Integer;
        EFFORTS        : Integer;
        ID             : Integer;
        SUBFIELD       : String;
    }


    //shital

    function GetTotalUnitPriceByProject(ProjectID: Integer)                                                                                                       returns {
        Field1 : Decimal(15, 2);
        Field2 : Decimal(15, 2);
        Field3 : Decimal(15, 2);
        Field4 : Decimal(15, 2);
        Field5 : Decimal(15, 2);
        Field6 : Decimal(15, 2);
    };

    action   createROI(AnnualMaintainanceCost: Integer, projectID: Integer, companyID: Integer, data: array of ROI_Calculation)                                   returns String;
    action   createYearCalculation2(data: array of YearCalculation)                                                                                               returns String;
    action   deleteAssessmentsForProject(PROJECT_ID: Integer, COMPANY_ID: Integer)                                                                                returns String;
    // Delete selected assessments (analysis) + all their child rows.
    // IDs = comma-separated assessment IDs (string is robust over OData V2).
    action   DeleteAssessments(IDs: String)                                                                                                                       returns String;
    action   PostRawAnalysisToAI(assessmentID: Integer, projectID: Integer, companyID: Integer, docType: String, prompt: String, model: String)                                  returns Boolean;
    action   test()                                                                                                                                               returns Boolean;

    entity BTP_SERVICES_WITH_PROJECT2     as
        select from BTP_SERVICES as T0 {
            key T0.ASSESSMENT_ID.PROJECT.ID as ProjectID, // Project ID from ASSESSMENT table
                T0.SERVICE_ID,
                // Service identifier
                sum(T0.BLOCKS_REQUIRED)    as TotalBlocksRequired : Integer, // Sum of BLOCKS_REQUIRED per Project and Service
                sum(cast(
                    T0.UNITPRICE as Decimal(10, 2)
                ))                         as TotalUnitPrice      : Decimal(10, 2) // Sum of UNITPRICE per Project and Service
        }
        group by
            T0.ASSESSMENT_ID.PROJECT.ID, // Group by Project ID
            T0.SERVICE_ID; // Group by Service ID

    entity BTP_SERVICES_TOTAL_PER_PROJECT as
        select from BTP_SERVICES_WITH_PROJECT2 as T0 {
            key T0.ProjectID,
                // Project ID
                sum(T0.TotalUnitPrice) as TotalUnitPricePerProject : Decimal(10, 2) // Sum of TotalUnitPrice for all services under a project
        }
        group by
            T0.ProjectID;

    entity ProjectWithCompany             as
        select from MSTR_PROJECT as T0
        inner join MSTR_COMPANY as T1
            on T0.COMPANY.ID = T1.ID
        {
            key T0.ID as PROJECT_ID,
                T0.PROJECT_NAME,
            key T1.ID as COMPANY_ID,
                T1.COMPANY_NAME
        }

    entity SkillsetPerProject             as
        select from MSTR_PROJECT as T0
        inner join SkillSet as T1
            on T0.SkillSet.ID = T1.ID
        {
            key T0.ID          as PROJECT_ID,
                T0.COMPANY     as COMPANY_ID,
                T0.SkillSet.ID as SKILLSET_ID,
                T1.Name        as SKILLSET_NAME
        }


    action   calculateROI(Project_ID: Integer,
                          AnnualMaintainanceCost: Decimal(15, 2),
                          CustomCodeMaintenancePercent: Decimal(5, 2),
                          CustomCodeImprovementPercent: Decimal(5, 2),
                          NewDevSpendPercent: Decimal(5, 2),
                          NewDevImprovementPercent: Decimal(5, 2),
                          TechDebtImpactPercent: Decimal(5, 2),
                          TechDebtImprovementPercent: Decimal(5, 2),
                          Revenue: Decimal(15, 2),
                          ITSpendPercent: Decimal(5, 2),
                          SAPSpendPercent: Decimal(5, 2),
                          ITMaintenanceCostPercent: Decimal(5, 2),
                          ITMaintenanceImprovementPercent: Decimal(5, 2),
                          DataQualityLossPercent: Decimal(5, 2),
                          DataQualityImprovementPercent: Decimal(5, 2),
                          ITSecuritySpendPercent: Decimal(5, 2),
                          SAPSecuritySpendPercent: Decimal(5, 2),
                          DataSecurityCostPercent: Decimal(5, 2),
                          DataSecurityImprovementPercent: Decimal(5, 2),
                          TotalDiskStorage: Decimal(10, 2),
                          CostPerTB: Decimal(15, 2),
                          NumberOfInstances: Integer,
                          DiskStorageImprovementPercent: Decimal(5, 2),
                          TotalMemoryStorage: Decimal(10, 2),
                          CostPerTBMemory: Decimal(15, 2),
                          MemoryStorageImprovementPercent: Decimal(5, 2))                                                                                         returns array of {
        Category        : String;
        Value_Driver    : String;
        Yearly_Benefits : Decimal(15, 2);
    };

    // An ACTION (POST), not a function: on a refine the live document (lastResponse,
    // the editor HTML) is sent so the model edits it in place. That payload is far
    // too large for a GET query string, so POST carries it in the request body.
    action chat(assessmentID: Integer, projectID: Integer, docType: String, user: String, prompt: String, model: String, deep: Boolean, lastResponse: LargeString) returns {
        responseID : Integer;
        aiResponse : String;
        relevance  : Boolean;   // false => answer-only (question); true => document changed
    };

    // Docgen version history: every generated/refined document is a snapshot in
    // LLMChatHistory. GetDocVersions lists them (newest first) with a
    // "v<n>-<DDMMYYYY>-<HHmm>" label; GetDocVersion loads one snapshot's HTML.
    function GetDocVersions(assessmentID: Integer, projectID: Integer, docType: String) returns many {
        ID         : Integer;
        VERSION_NO : Integer;
        LABEL      : String;
        PROMPT     : String;
        CREATED_AT : Timestamp;
    };
    function GetDocVersion(ID: Integer) returns {
        ID       : Integer;
        DOC_TYPE : String;
        LABEL    : String;
        CONTENT  : LargeString;
    };
    // Explicitly save the current editor content as a version snapshot. A generation
    // or refine is only a working draft; nothing is kept in the version picker until
    // this is called. Returns the new snapshot's ID.
    action SaveDocVersion(assessmentID: Integer, projectID: Integer, docType: String, user: String, content: LargeString) returns {
        ID : Integer;
    };
    // Remove a saved version snapshot (does not touch cost-bearing draft rows).
    action DeleteDocVersion(ID: Integer) returns String;

    function reactOnChat(ID: Integer, downvote: Integer, upvote: Integer, remarks: String(400))                                                                   returns {
        totalUpvotes   : Integer;
        totalDownvotes : Integer;
        remarks        : String(400);
    };

    action   generateDoc(assessmentID: Integer, projectID: Integer, docType: String, user: String, prompt: String, lastResponse: String, model: String)                          returns {
        filename : String;
        content  : LargeBinary
    };

    // AI model list for the UI dropdown; `default` is preselected.
    function GetModels()                                                                                                                                          returns {
        default : String;
        models  : many {
            name : String;
        };
    };

    // Unified feedback (up/down + comment). source = ASSESSMENT | DOCGEN_CHAT.
    // For DOCGEN_CHAT pass chatID + docType; upserts per user + target.
    action   SubmitFeedback(source: String, assessmentID: Integer, projectID: Integer, chatID: Integer, docType: String, upvote: Integer, downvote: Integer, comment: String, user: String) returns Boolean;
    function GetFeedback(source: String, assessmentID: Integer, chatID: Integer)                                                                                  returns {
        upvotes   : Integer;
        downvotes : Integer;
        comment   : String;
        totals    : {
            upvotes   : Integer;
            downvotes : Integer;
        };
    };

}
