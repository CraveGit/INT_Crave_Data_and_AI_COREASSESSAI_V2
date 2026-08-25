// using CatalogService from './cat-service';

// annotate CatalogService.ASSESMENT with {
//     ID                  @title: 'ID';
//     OBJECT_NAME         @title: 'Object Name';
//     SAP_MODULE_NAME     @title: 'Module Name';
//     FUNCTIONAL_ANALYSIS @title: 'FUNCTIONAL_ANALYSIS';
//     RECOMMENDATIONS     @title: 'RECOMMENDATIONS';
//     APPROACH            @title: 'APPROACH';
//     ADHERENCE           @title: 'ADHERENCE';
// };

// annotate CatalogService.WRICEF_TYPES with {
//     ID                  @title: 'ID';
//     ASSESMENT_ID        @title: 'ASSESMENT_ID';
//     WRICEF_OBJECT_TYPE  @title: 'WRICEF_OBJECT_TYPE';
// };

// annotate CatalogService.ASSESMENT with @(
//     sap.searchable        : false,
//     UI.PresentationVariant: {$Type: 'UI.PresentationVariantType'},
//     UI.HeaderInfo         : {
//         TypeName      : 'Assessment Report',
//         TypeNamePlural: 'Assessment Report',
//     },
//     UI.SelectionFields    : [
//         OBJECT_NAME,
//         SAP_MODULE_NAME,
//         ADHERENCE,
//         BTP_SERVICES_SEARCH
//     ],
//     UI.LineItem           : [
//         {
//             $Type: 'UI.DataField',
//             Value: ID
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: OBJECT_NAME
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: SAP_MODULE_NAME
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: FUNCTIONAL_ANALYSIS
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: RECOMMENDATIONS
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: APPROACH
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: ADHERENCE
//         }
//     ],
//     UI.FieldGroup #FieldGroup1 : {
//         $Type: 'UI.FieldGroupType',
//         Data : [
//             {
//                 $Type: 'UI.DataField',
//                 Value: OBJECT_NAME,
//             },
//             {
//                 $Type: 'UI.DataField',
//                 Value: SAP_MODULE_NAME,
//             },
//             {
//                 $Type: 'UI.DataField',
//                 Value: FUNCTIONAL_ANALYSIS,
//             },
//             {
//                 $Type: 'UI.DataField',
//                 Value: APPROACH,
//             },
//         ]
//     },
//     UI.Facets                     : [{
//         $Type : 'UI.ReferenceFacet',
//         ID    : 'FieldGroup1',
//         Label : 'General Information',
//         Target: '@UI.FieldGroup#FieldGroup1',
//     },
//     {
//         $Type : 'UI.ReferenceFacet',
//         ID    : 'LineItem1',
//         Label : 'General Information',
//         Target: 'WRICEF_OBJECT_TYPE/@UI.LineItem#LineItem1',
//     } ]
// );

// annotate CatalogService.WRICEF_TYPES with @(
//     sap.searchable        : false,
//     UI.PresentationVariant: {$Type: 'UI.PresentationVariantType'},
//     UI.HeaderInfo         : {
//         TypeName      : 'WRICEF Type',
//         TypeNamePlural: 'WRICEF Types',
//     },
//     UI.SelectionFields    : [
//         WRICEF_OBJECT_TYPE,
//         ASSESMENT_ID_ID
//     ],
//     UI.LineItem #LineItem1: [
//         {
//             $Type: 'UI.DataField',
//             Value: ID
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: ASSESMENT_ID_ID
//         },
//         {
//             $Type: 'UI.DataField',
//             Value: WRICEF_OBJECT_TYPE
//         }
//     ]
// );

// annotate CatalogService.ASSESMENT with {
//     BTP_SERVICES_SEARCH @(
//         Common.ValueList               : {
//             $Type         : 'Common.ValueListType',
//             CollectionPath: 'BTP_SERVICES',
//             Parameters    : [{
//                 $Type            : 'Common.ValueListParameterInOut',
//                 LocalDataProperty: BTP_SERVICES.SERVICE_NAME,
//                 ValueListProperty: 'SERVICE_NAME'
//             }]
//         },
//         Common.ValueListWithFixedValues: true
//     )
// };