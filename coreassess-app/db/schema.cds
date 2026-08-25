namespace CRA;

using {managed} from '@sap/cds/common';

entity MSTR_USER : managed {
  key ID           : Integer;
      USERNAME     : String;
      DISPLAY_NAME : String; // what the welcome note greets; user-editable in profile settings
      EMAIL        : String; // login identity shown in profile settings; from the IdP, read-only
      ROLE         : String;
      COMPANY      : Association to MSTR_COMPANY;
      LICENSE_ROLE : String;
      ALLOWEDOBJECTS: Integer;
      UPLOADEDOBJECTS: Integer;
      LicenseRoles : Composition of many MSTR_USER_LICENSE
                       on LicenseRoles.USER_ID = $self;
}

entity MSTR_USER_LICENSE : managed {
  key ID             : Integer;
      USER_ID        : Association to MSTR_USER;
      RoleType       : String; // superuser, limiteduser
      AssignedAt     : DateTime;
      RemainingCount : Integer;
      TotalCount     : Integer;
      COMPANY_ID     : Association to MSTR_COMPANY;
}

// entity MSTR_LICENSE_PLAN : managed


entity MSTR_COMPANY : managed {
  key ID           : Integer;
      COMPANY_NAME : String(100);
      IMAGE_URL    : String;
      // Set when archived (soft-deleted). Null = active. Data is retained until an
      // admin permanently deletes it; archived rows show greyed with restore.
      ARCHIVED_AT  : Timestamp;
      // Max objects that may be analysed across this company. Null = unlimited.
      OBJECT_LIMIT : Integer;
      // Cumulative objects ever analysed in this company. Incremented on each
      // analysis; NEVER decremented on delete, so consumption stays transparent.
      OBJECTS_CONSUMED : Integer default 0;
}

entity MSTR_PROJECT : managed {
  key ID            : Integer;
  key COMPANY       : Association to MSTR_COMPANY;
      PROJECT_NAME  : String(100);
      SkillSet      : Association to SkillSet;
      ACTIVE_STATUS : Boolean default true;
      // Archive flag (see MSTR_COMPANY.ARCHIVED_AT).
      ARCHIVED_AT   : Timestamp;
      // Max objects that may be analysed in this project. Null = unlimited.
      OBJECT_LIMIT  : Integer;
      // Cumulative objects ever analysed in this project (see MSTR_COMPANY).
      OBJECTS_CONSUMED : Integer default 0;
}

entity COMPANY_USER_MAP {
  key USERNAME   : String;
  key COMPANY_ID : Integer;
}

// Graph 1 -> SAP_MODULE_NAME

entity ASSESSMENT : managed {
  key ID                         : Integer;
      PROJECT                    : Association to MSTR_PROJECT;
      OBJECT_NAME                : String(400);
      BDC_USED                   : Integer;
      PRIORITY                   : String;
      SAP_MODULE_NAME            : String(400);
      SAP_SUB_MODULE             : String;
      FUNCTIONAL_ANALYSIS        : String;
      TShirt                     : String;
      // Efforts is HOURS. Person-days are derived (Efforts / HOURS_PER_DAY) so the
      // two can never drift; the UI renders "<hours>hrs / <days>PD".
      Efforts                    : Integer;
      HOURS_PER_DAY              : Decimal(4, 2) default 8;
      CODE_COMPLEXITY            : String;
      COUPLING                   : String(20);
      SQL_RECOMMENDATION         : String;
      APPROACH                   : String;
      APPROACH_REASON            : String;
      ADHERENCE                  : String;
      ADHERENCE_REASON           : String;
      // SAP Extensibility Classification Level (Clean Core tier): current (as-is)
      // and target (after the recommended approach). Plain String (not LargeString)
      // so raw-SQL reads return text, not a LOB Buffer.
      CLEANCORE_TIER             : String(2);
      CLEANCORE_TIER_REASON      : String(1000);
      CLEANCORE_TARGET_TIER      : String(2);
      CLEANCORE_TARGET_TIER_REASON : String(1000);
      BTP_SERVICES_SEARCH        : String;
      TOKEN_SIZE                 : Integer;
      CODELENGTH                 : String;
      DEVELOPMENTAPPROACH        : String;
      SCREENS_USED               : Integer;
      S4_ANALYSIS                : String;
      UI_INTEGRATION             : String;
      THIRD_PARTY_INTEGRATION    : String;
      USE_CASE_AREA_EXPLANATION  : String;
      INTEGRATION_MODERNIZATION  : String;
      RAW_ANALYSIS               : LargeString;
      // Original ABAP source, kept so DocGen "Deep analysis" can re-extract an
      // implementation-grade spec from the code. DEEP_SPEC caches that extraction
      // (per object) so regenerate/refine don't re-run the slow deep pass.
      SOURCE_CODE                : LargeString;
      DEEP_SPEC                  : LargeString;
      // Names only of the files this object's analysis covered (comma-separated).
      // Not the source -- safe to display; shown in the Overview.
      SOURCE_FILES               : String(5000);
      IS_ESTIMATED               : Boolean default false;
      IDENTIFIER                 : String(20);
      RETIRE_EXPLAINATION        : String;
      REIMPLEMENTATION           : String;
      CODEQUALITYSCORE           : String;
      CODEQUALITYSCORERATIO      : String;
      CRITICALITY                : String;
      USAGECONTEXT               : String;
      CODEREFERENCE              : String;
      DETAILEDBREAKDOWN          : LargeString;
      SCOREANALYSIS              : LargeString;
      // --- normalized children (collapsed from 22 redundant tables) ---
      ITEMS                      : Composition of many ASSESSMENT_ITEM
                                     on ITEMS.ASSESSMENT = $self;
      NOTES                      : Composition of many ASSESSMENT_NOTE
                                     on NOTES.ASSESSMENT = $self;
      BTP_SERVICES               : Composition of many BTP_SERVICES
                                     on BTP_SERVICES.ASSESSMENT_ID = $self;
      AUTHORIZATION_CHECK        : Composition of many AUTHORIZATION_CHECK
                                     on AUTHORIZATION_CHECK.ASSESSMENT = $self;
      FIELD_VALUES               : Composition of many FIELD_VALUES
                                     on FIELD_VALUES.ASSESSMENT = $self;
      USAGE                      : Composition of one ASSESSMENT_USAGE
                                     on USAGE.ASSESSMENT = $self;
}

// KIND replaces: READ_CRUD, WRICEF_TYPES, STANDARD/CUSTOM/NEW_S4_TABLES,
// SQL_ANALYSIS_TABLES_DIRECT/API/CDS, BAPIS, FUNCTION_MODULES, INTERFACE_IDOCS,
// INTERFACE_STANDARD_API, USE_CASE_AREA, EVENTS, STANDARD_EVENTS, TOPICS,
// SAP_STANDARD_API, SAP_STANDARD_FIORI_APP.
type ItemKind : String enum {
  CRUD; WRICEF; STANDARD_TABLE; CUSTOM_TABLE; S4_TABLE;
  SQL_DIRECT; SQL_API; SQL_CDS; BAPI; FUNCTION_MODULE;
  IDOC; INTERFACE_API; STANDARD_API; FIORI_APP;
  USE_CASE_AREA; EVENT; STANDARD_EVENT; TOPIC;
}
// KIND replaces: CLEAN_CORE_ANALYSIS, S4_RECOMMENDATIONS, INTEGERATION_RESULT,
// ASSESSMENT_RECOMMENDATIONS.
type NoteKind : String enum { CLEAN_CORE; S4_RECOMMENDATION; INTEGRATION; RECOMMENDATION; }

entity ASSESSMENT_ITEM : managed {
  key ID          : UUID;
      ASSESSMENT   : Association to ASSESSMENT;
      KIND        : ItemKind;
      VALUE       : String;   // technical name
      MAPPING     : String;   // OLD -> NEW (S4_TABLE / INTERFACE_API); else null
      DESCRIPTION : String;
      VERIFY      : String;   // grounding provenance: VERIFIED/UNVERIFIED/MISSING
}

entity ASSESSMENT_NOTE : managed {
  key ID          : UUID;
      ASSESSMENT   : Association to ASSESSMENT;
      KIND        : NoteKind;
      TITLE       : String;
      DESCRIPTION : LargeString;
}

// Retained pricing/cost audit. Written when an assessment / project / company is
// deleted, so the spend survives the cascade purge -- a superuser cannot erase
// cost by deleting the object. Deliberately NOT a composition of company/project,
// so nothing cascade-deletes it. Names are denormalized so rows stay readable
// after the source company/project/assessment are gone.
entity COST_LEDGER : managed {
  key ID           : UUID;
      ASSESSMENT_ID : Integer;
      OBJECT_NAME  : String;
      PROJECT_ID   : Integer;
      PROJECT_NAME : String;
      COMPANY_ID   : Integer;
      COMPANY_NAME : String;
      INCURRED_BY  : String;        // uploader (analysis) / doc user (docgen)
      SOURCE       : String(20);    // ANALYSIS | DOCGEN
      TOTAL_TOKENS : Integer;
      COST_USD     : Decimal(12, 6);
      DELETED_AT   : Timestamp;     // when the object was deleted
      DELETED_BY   : String;        // who triggered the delete
}

// One row per assessment: the total cost of analysis. Per-model breakdown is
// deliberately not stored -- the UI shows a single figure.
entity ASSESSMENT_USAGE : managed {
  key ID           : UUID;
      ASSESSMENT    : Association to ASSESSMENT;
      INPUT_TOKENS : Integer;
      OUTPUT_TOKENS: Integer;
      TOTAL_TOKENS : Integer;
      LLM_CALLS    : Integer;
      COST_USD     : Decimal(12, 6);
}

entity FIELD_VALUES : managed {
  key ID         : UUID;
      ACTVT      : String;
      OBTYP      : String;
      STSMA      : String;
      BERSL      : String;
      ASSESSMENT : Association to ASSESSMENT;
}

entity AUTHORIZATION_CHECK : managed {
  key ID            : UUID;
      AUTHOBJECT    : String;
      FIELDSCHECKED : String;
      CHECKTYPE     : String;
      CODEREFERENCE : String;
      ASSESSMENT    : Association to ASSESSMENT;
}

// entity FIELDSCHECKED {
//   key ID : UUID;
//   key AUTHORIZATION_CHECK : Association to AUTHORIZATION_CHECK;
//   NAME : String;
// }

entity MSTR_QUESTIONNAIRE : managed {
  key ID          : Integer;
      QUESTION    : String;
      PLATFORM    : String;
      IDENTIFIER  : String;
      PLACEHOLDER : String;
}

entity OBJECT_ESTIMATE_ANSWER : managed {
  key ID            : UUID;
      ASSESSMENT     : Association to ASSESSMENT;
      QUESTIONNAIRE : Association to MSTR_QUESTIONNAIRE;
      PROJECT       : Association to MSTR_PROJECT;
      ANSWER        : String;
}

entity BTP_SERVICES : managed {
  key ID              : Integer;
  key ASSESSMENT_ID    : Association to ASSESSMENT;
      BLOCKS_REQUIRED : Integer; //
      METRIC          : String;
      SERVICE_NAME    : String;
      PRICE           : String; //
      CURRENCY        : String;
      SERVICE_ID      : String;
      UNITPRICE       : String; //
}

entity BTP_SERVICES_PRICE_LIST : managed {
  key ID             : Integer;
      ITEMCODE       : String;
      ITEM           : String;
      IN_BLOCKS_OF   : Integer; //
      METRICS        : String(100);
      PRICE_PER_UNIT : Decimal(10, 2); //
      CURRENCY       : String;
      FEES           : String; //
      VOLUME_FROM    : String;
      VOLUME_TO      : String;
}

entity KPI_D_GRAPH_1 {
  key ID                   : Integer;
      PROGRAM              : Integer;
      TABLE_NAME           : Integer;
      CLASS                : Integer;
      TRANSACTION          : Integer;
      DATA_ELEMENT         : Integer;
      TABLE_TYPE           : Integer;
      FUNCTION_GROUP       : Integer;
      VIEW                 : Integer;
      DATA_DEFINATION_LANG : Integer;
      DOMAIN               : Integer;
      SAP_SCRIPT_FORM      : Integer;
      ABAP_QUERY           : Integer;
      CUSTOMER_ENHANCE     : Integer;
      SEARCH_HELP          : Integer;
      NUMBER_RANGE_OBJECT  : Integer;
}

entity KPI_D_GRAPH_2 {
  key ID                    : Integer;
      FINANCIAL_ACCOUNTING  : Integer;
      CROSS_APPLICATION     : Integer;
      ASSET_ACCOUNTING      : Integer;
      ENTERPRISE_DATA_MODEL : Integer;
      GENERAL_LEDGER        : Integer;
}

entity KPI_D_GRAPH_3 {
  key ID                 : Integer;
      CALL_TRANS         : Integer;
      MAIL_SENDING       : Integer;
      UPLOAD_DOWNLOAD    : Integer;
      LOGICAL_DATA       : Integer;
      ALV_REPORT         : Integer;
      DOWNLOADED_PROGRAM : Integer;
      UPLOADED_PROGRAM   : Integer;
      HTTP_CALLS         : Integer;
      BAPI_PROGRAM       : Integer;
}

entity KPI_D_GRAPH_4 {
  key ID                       : Integer;
      FINANCIAL_ACCOUNTING_V1  : Integer;
      FINANCIAL_ACCOUNTING_V2  : Integer;
      CROSS_APPLICATION_V1     : Integer;
      CROSS_APPLICATION_V2     : Integer;
      ASSET_ACCOUNTING_V1      : Integer;
      ASSET_ACCOUNTING_V2      : Integer;
      ENTERPRISE_DATA_MODEL_V1 : Integer;
      ENTERPRISE_DATA_MODEL_V2 : Integer;
      GENERAL_LEDGER_V1        : Integer;
      GENERAL_LEDGER_V2        : Integer;
}

entity PROPMT : managed {
  key ID         : Integer;
      COMPANY    : Association to MSTR_COMPANY;   // to-one: handler writes COMPANY_ID
      USER       : String;
      PROJECT    : Association to MSTR_PROJECT;   // to-one: handler writes PROJECT_ID
      PROMPT_STR : String(1000);
}

entity CONFIG_MSTR {
  key ID             : Integer;
      FIELD          : String;
      CONFIG_DETAILS : Composition of many CONFIG_DETAILS
                         on CONFIG_DETAILS.CONFIG_MSTR = $self;
}

entity CONFIG_DETAILS {
  key ID          : Integer;
  key CONFIG_MSTR : Association to CONFIG_MSTR;
      SUBFIELD    : String;
      COUNT_FROM  : Integer;
      COUNT_TO    : Integer;
      COMPLEXITY  : String;
      EFFORTS     : Integer;
}

entity S4_STANDARD_EVENTS {
  key EVENT : String
}


//Shital
entity Project_Header : managed {
  key ProjectId       : String(50);
      ProjectDesc     : String(100);
      CustomerId      : String(20);
      CustomerDetails : String;
      ProjectType     : String;
      Variant         : String;
      Project_Config  : Composition of many Project_Config
                          on Project_Config.ProjectId = $self;
}

entity Project_Config : managed {
  key RowID                      : Integer;
  key ProjectId                  : Association to Project_Header;
      Priority                   : Integer;
      CheckTitle                 : String(255);
      CheckMessage               : String(255);
      ObjectType                 : String(10); //increse length
      ObjectName                 : String(80);
      Package                    : String(30);
      Processor                  : String(12);
      Approach                   : String(100);
      SimplificationItemCategory : String(80);
      SapNoteNumber              : String(50);
      QuickFixAvailability       : String(100);
      ChangeCategory             : String(100);
      AppComponent               : String(80);
      RefObjectType              : String(80);
      RefObjectName              : String(80);
      ScopeInformation           : String(100);
      UsageInformation           : String(100);
      AdditionalInformation      : String(80);
      SapNoteNumberDesc          : String(150);
      Btp                        : String(5); //additional fields
      CraveComment               : String(100);
      Scenario                   : String(50);
      Migration_Option           : Composition of many Migration_Option
                                     on Migration_Option.Project_Config = $self;
      Migration_Efforts          : String(15); //drop down
}

entity Migration_Option : managed {
      //  key RowID :Association to Project_Config;
      //  key ProjectId :Association to Project_Header;
  key Project_Config   : Association to Project_Config;
  key RowID            : Integer;
      RICEFW           : String(30);
      Migration_Option : String(300);
}

entity ExportMWC : managed {
  key ID                   : Integer;
  key ProjectId            : Association to Project_Header;
  key ProgramID            : String(100);
      ObjectType           : String(100);
      ObjectName           : String(300);
      RequestTask          : String(200);
      OriginalSystem       : String(200);
      PersonResponsible    : String(100);
      RepairFlag           : String(2);
      Package              : String(300);
      Editable             : String(30);
      Approach             : String(50);
      GenerationFlag       : String(50);
      InternalUse          : String(2);
      OriginalLanguage     : String(10);
      VersionNumber        : Integer;
      PackageException     : String(2);
      ObsoleteField        : String(100);
      SoftwareComponent    : String(100);
      SAPRelease           : String(100);
      Object               : String(2);
      TranslateDevLanguage : String(2);
      CreatedOn            : Date;
      CheckedOn            : Date;
      CheckConfiguration   : String(100);
}

entity RICEFW_Objects : managed {
  key ObjectType : String(10);
      OTDesc     : String(50);
      RICEFW     : String(30);
      Solution   : String(80);
}

entity CustomerData_ROI : managed {
  key ID                     : Integer;
  key Project                : Association to MSTR_PROJECT;
  key COMPANY                : Association to MSTR_COMPANY;
      Revenue                : Integer;
      OperationIncome        : Integer;
      AnnualMaintainanceCost : Integer;
      NumberOfEmployees      : Integer;
      CURRENCY               : String;
}

entity ROI_Calculation : managed {
  key ID                   : Integer;
      projectID            : Association to MSTR_PROJECT;
      SoftwareSubscription : Decimal(10, 2);
      Implementation_Cost  : Integer;
      Internal_FTE_Cost    : Integer;
      Productivity_Impact  : Integer;
      Any_Other_Cost       : Integer;
      Total_Cost           : Integer;
      YearID               : Association to YEAR;
}

entity YEAR : managed {
  key YearID : Integer;
      Year   : String
}

entity ROI_Calculation_Output : managed {
  key ID                 : Integer;
      ROI_ID             : Association to ROI_Calculation;
      project            : Association to MSTR_PROJECT;
      Business_Outcome   : String;
      Value_Driver       : String;
      Applicable         : String;
      Rationalization    : String;
      Expected_Benefits  : Integer;
      Clean_Core_Enabler : String;
      Yearly_Benefits    : String;
      Proof_Point1       : String;
      Proof_Point2       : String
}


entity SkillSet : managed {
  key ID   : Integer;
      Name : String
}


entity YearCalculation : managed {
  key ID                         : Integer;
      projectID                  : Association to MSTR_PROJECT;
      Benefit_Realization_Dactor : Integer;
      YearID                     : Association to YEAR;

}


entity REF_FIORIAPPS : managed {
  key FIORI_ID                            : String;
      LINE_OF_BUSINESS                    : String;
      SCOPE_ITEM                          : String;
      ROLE_NAME                           : String;
      APP_NAME                            : String;
      APPLICATION_TYPE                    : String;
      APP_LAUNCHER_TITLE                  : String;
      LIGHTHOUSE                          : String;
      APPLICATION_COMPONENT               : String;
      UI_TECHNOLOGY                       : String;
      DEVICE_TYPE                         : String;
      PRODUCT_CATEGORY                    : String;
      DATABASE                            : String;
      FRONTEND_SOFTWARE_COMPONENT         : String;
      FRONTEND_MIN_SP                     : String;
      BACKEND_SOFTWARE_COMPONENT_VERSIONS : String;
      BACKEND_MIN_SP                      : String;
      HANA_SOFTWARE_COMPONENT_VERSIONS    : String;
      HANA_MIN_SP                         : String;
      FRONTEND_PRODUCT_VERSION            : String;
      PRODUCT_VERSIONNAME_BACKEND         : String;
      HANA_PRODUCT_VERSION                : String;
      FRONTEND_PRODUCT_VERSION_STACK      : String;
      BACKEND_PRODUCT_VERSION_STACK       : String;
      HANA_PRODUCT_VERSION_STACK          : String;
      NOTE_COLLECTION                     : String;
      SEMENTIC_OBJECT_ACTION              : String;
      TECHNICAL_CATALOG_NAME              : String;
      TECHNICAL_CATALOG_DESCRIPTION       : String;
      BUSINESS_CATALOG_NAME               : String;
      BUSINESS_CATALOG_DESCRIPTION        : String;
      BUSINESS_GROUP_NAME                 : String;
      BUSINESS_GROUP_DESCRIPTION          : String;
      PAGE                                : String;
      PAGE_TITLE                          : String;
      SPACE                               : String;
      SPACE_TITLE                         : String;
      LEADING_BUSINESSROLE_NAME           : String;
      LEADING_BUSINESSROLE_DESCRIPTION    : String;
      ADDITIONAL_BUSINESSROLE_NAME        : String;
      ADDITIONAL_BUSINESSROLE_DESCRIPTION : String;
      INDUSTRY                            : String;
      EXTENSIBILITY_VIA_SAPUI5_ADAPTATION : String;
      GTM_APP_DESCRIPTION                 : String;
      BSP_NAME                            : String;
      BSP_APPLICATION_URL                 : String;
      SAPUI5_COMPONENT_ID                 : String;
      PRIMARY_ODATA_SERVICE_NAME          : String;
      PRIMARY_ODATA_SERVICE_VERSION       : String;
      ADDITIONAL_ODATA_SERVICES           : String;
      ADDITIONAL_ODATA_SERVICES_VERSIONS  : String;
      BEX_QUERY_NAME                      : String;
      LEADING_TRANSACTION_CODES           : String;
      WDA_CONGIGURATION                   : String;
      ODATA_V4_SERVICE_GROUP              : String;
      LINK                                : String;
}

entity REF_PRICELIST : managed {
  key ID             : Integer;
      ITEMCODE       : String;
      ITEM           : String;
      IN_BLOCKS      : Integer;
      METRICS        : String;
      PRICE_PER_UNIT : String;
      CURRENCY       : String;
      FEES           : String;
      VOLUME_FROM    : String;
      VOLUME_TO      : String;
}

entity REF_EVENTS : managed {
  key ID        : Integer;
      EVENTNAME : String;
}

entity FILE_STORAGE : managed {
  key ID        : Integer;
      ASSESSMENT : Association to ASSESSMENT;
      CONTENT   : LargeString;
}

entity TSHIRT_CONFIG : managed {
  key ID       : Integer;
      FROM_HRS : Integer;
      TO_HRS   : Integer;
      TSHIRT   : String
}

entity PRIORITY_CONFIG : managed {
  key ID          : Integer;
      METRIC      : String;
      COMPLEXITY  : Integer;
      HIGH_IMPACT : Integer
}


entity EncryptedData {
  key LICID     : Integer;
      CREATEDAT : DateTime;
      BASE64    : LargeString;
      IV        : String(32);
      COMPANY   : Association to MSTR_COMPANY;
      PROJECT   : Association to MSTR_PROJECT;
      LICENSE_TYPE : String(30);

}

// entity MSTR_OBJECT_COMPARE : managed {
//   key ASSESSMENT : Association to ASSESSMENT;
//   PROJECT :  Association to MSTR_PROJECT;
//   OBJECT_NAME : String(200);
// }


entity OBJECT_LIMIT {
  key ID                 : Integer;
      LimitOfObjects     : Integer;
      InitialObjectCount : Integer;
      COMPANY_ID         : Association to MSTR_COMPANY;
}

entity LLMChatHistory {
  key ID : Integer;
  assessmentID: String(100);
  projectID: String(100);
  docType: String(100);
  user: String(100);
  prompt: String(400);
  response: LargeString;
  // Set explicitly by the chat handler on insert (this entity is not @managed).
  // Backs the docgen version label "v<n>-<DDMMYYYY>-<HHmm>"; null on legacy rows.
  CREATED_AT: Timestamp;
  // A generation/refine is a working draft and is NOT a version unless the user
  // explicitly saves it. Auto rows (IS_SAVED=false) still record cost for project
  // stats but never appear in the version picker; SaveDocVersion writes a saved
  // snapshot (IS_SAVED=true, cost-free). Legacy rows (null) are treated as saved.
  IS_SAVED: Boolean default false;
  upvotes: Integer;
  downvotes: Integer;
  remarks: String(500);
  // Doc-generation cost, so project stats can total docgen spend alongside the
  // per-assessment analysis cost in ASSESSMENT_USAGE.
  inputTokens: Integer;
  outputTokens: Integer;
  totalTokens: Integer;
  costUsd: Decimal(12, 6);
}

// Operational log: app/analysis/docgen events. createdAt = timestamp.
type LogLevel  : String enum { DEBUG; INFO; WARN; ERROR; }
type LogSource : String enum { CAP; ANALYSIS_API; DOCGEN_API; UI; }

entity APP_LOG : managed {
  key ID       : UUID;
      LEVEL    : LogLevel default 'INFO';
      SOURCE   : LogSource default 'CAP';
      ACTION   : String(100);       // e.g. UploadObject, /analyze, generateDoc
      MESSAGE  : String(1000);
      CONTEXT  : LargeString;       // JSON: request/error detail
      USER     : String(255);
      ASSESSMENT: Association to ASSESSMENT;
      PROJECT  : Association to MSTR_PROJECT;
}

// Unified user feedback: covers assessment analysis AND docgen chat responses.
// SOURCE distinguishes origin; up/down votes + comment apply to both.
type FeedbackSource : String enum { ASSESSMENT; DOCGEN_CHAT; }

entity FEEDBACK : managed {
  key ID        : UUID;
      SOURCE    : FeedbackSource;
      ASSESSMENT : Association to ASSESSMENT;        // set for both sources
      PROJECT   : Association to MSTR_PROJECT;
      CHAT      : Association to LLMChatHistory;    // set for DOCGEN_CHAT only
      DOC_TYPE  : String(20);                       // FSD/TSD/BBP for DOCGEN_CHAT
      UPVOTES   : Integer default 0;
      DOWNVOTES : Integer default 0;
      COMMENT   : String(2000);
      USER      : String(255);
}

// Role hierarchy (stored in MSTR_USER.ROLE as plain strings):
//   OWNER - all access, can provision admins (rohan.chavan@craveinfotech.com)
//   ADMIN      - all access except creating admins; can add users/superusers
//   SUPERUSER  - can create projects (not companies), and can REQUEST new users
//                (a pending ACCESS_REQUEST for an admin to approve)
//   USER       - assessment uploads and related functions only
type UserRole : String enum { OWNER; ADMIN; SUPERUSER; USER; }

// A superuser's request to onboard a user. Admins approve/reject it in the admin
// panel; approval creates the MSTR_USER row. Avoids giving superusers direct
// user-creation rights while keeping an auditable trail.
type AccessRequestStatus : String enum { PENDING; APPROVED; REJECTED; }

entity ACCESS_REQUEST : managed {
  key ID            : UUID;
      DISPLAY_NAME  : String;
      EMAIL         : String;
      ROLE          : String;         // requested role (USER / SUPERUSER)
      ALLOWEDOBJECTS: Integer;
      STATUS        : AccessRequestStatus default 'PENDING';
      REQUESTED_BY  : String(255);    // superuser who raised it
      DECIDED_BY    : String(255);    // admin who approved/rejected
      COMPANY_ID    : Integer;        // company the new user maps to
}

// Support tickets: any user raises one (title + description); admins/owners
// acknowledge and close them from the admin panel.
type TicketStatus : String enum { OPEN; ACKNOWLEDGED; CLOSED; }

entity TICKET : managed {
  key ID          : UUID;
      TITLE       : String(200);
      DESCRIPTION : String(2000);
      STATUS      : TicketStatus default 'OPEN';
      RAISED_BY   : String(255);      // login of the user who raised it
      ACK_BY      : String(255);      // admin/owner who acknowledged
      CLOSED_BY   : String(255);      // admin/owner who closed
      CLOSE_COMMENT : String(1000);   // admin/owner note on why it was closed
}

