

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
],
    function (Controller, JSONModel, MessageBox, MessageToast, Fragment, Filter, FilterOperator) {
        "use strict";

        return Controller.extend("com.crave.coreassessv2.controller.ROIInput", {

            onInit: function () {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("Configuration").attachPatternMatched(this.onObjectMatch, this);
                this.onEnhancedItSupport();
                this.call();
                this.getYears();
                var costTableData = {
                    rows: [
                        { desc: "Additional Software Subscription", year0: 0.00, year1: 0.00, year2: 0.00, year3: 0.00, year4: 0.00, year5: 0.00, editable: false },
                        { desc: "Implementation cost", year0: 0.00, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0, editable: true },
                        { desc: "Internal FTE Cost", year0: 0, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0, editable: true },
                        { desc: "Productivity impact", year0: 0, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0, editable: true },
                        { desc: "any other", year0: 0, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0, editable: true },
                        { desc: "Total cost", year0: 0, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0, editable: false }
                    ]
                };

                // Create a named model (e.g., "costModel")
                var oCostModel = new sap.ui.model.json.JSONModel(costTableData);

                // Set the named model to the view
                this.getView().setModel(oCostModel, "costModel");

                // Bind the rows of the table to the "rows" path in the "costModel"
                //this.getView().byId("costTable").bindRows("costModel>/rows");

                // var benefitRealizationDactorData = new sap.ui.model.json.JSONModel({
                //     rows: [
                //         {
                //             desc: "Benefit Realization Dactor",
                //             year1: 0,
                //             year2: 0,
                //             year3: 0,
                //             year4: 0,
                //             year5: 0,
                //             editable: false
                //         }
                //     ]
                // });

                // this.getView().setModel(benefitRealizationDactorData, "benefitRealizationDactorModel");


                // this.getView()
                //     .byId("benefitRealizationDactor")
                //     .bindRows("benefitRealizationDactorModel>/rows");

            },
            onObjectMatch: function () {
                //this.getView().byId("sideNavigationROIInput").setSelectedKey("roiInput");
                this.onEnhancedItSupport();
                this.changeView();
            },
            onEnhancedItSupport: function(){
                var oTreeModel = new JSONModel();
                oTreeModel.setData({
                    "treeItems":{
                        "categories":[
                        {
                            "no":'1',
                            "cat_desc":"Minimize Expenses for Managing Existing Custom Code",
                            "Desc":"",
                            "Edit_Field":"",
                            "Edit_Field_Visiblity":false,
                            "DropdownKey":"",
                            "Dropdown_Visiblity":false,
                            "CatagoryLabel":"Bold",
                            "categories":[
                                            {
                                                "no":'1.1',
                                                "cat_desc":"Existing Custom Code Maintenance Cost",
                                                "Desc":"Percentage of annual SAP ERP maintenance cost allocated to custom code maintenance.",
                                                "Edit_Field":"",
                                                "Edit_Field_Visiblity":true,
                                                "DropdownKey":"",
                                               "Dropdown_Visiblity":false,
                                               "CatagoryLabel":"Standard",
                                            },
                                            {
                                                "no":'1.2',
                                                "cat_desc":"Improvement Percentage",
                                                "Desc":"Expected reduction in custom code maintenance costs.",
                                                "Edit_Field":"",
                                                "Edit_Field_Visiblity":true,
                                                "DropdownKey":"",
                                                "Dropdown_Visiblity":false,
                                                "CatagoryLabel":"Standard",
                                            }
                                     ]
                        },
                        {
                        "no":'2',
                            "cat_desc":"Lower Spending on New Custom Development Efforts",
                            "Desc":"",
                            "Edit_Field":"",
                            "Edit_Field_Visiblity":false,
                            "DropdownKey":"",
                            "Dropdown_Visiblity":false,
                            "CatagoryLabel":"Bold",
                            "categories":[
                                            {
                                                "no":'2.1',
                                                "cat_desc":"Annual Spend on Custom Developments",
                                                "Desc":"Percentage of annual SAP ERP maintenance cost allocated to new custom development.",
                                                "Edit_Field":"",
                                                "Edit_Field_Visiblity":true,
                                                "DropdownKey":"",
                                                "Dropdown_Visiblity":false,
                                                "CatagoryLabel":"Standard",
                                            },
                                            {
                                                "no":'2.2',
                                                "cat_desc":"Improvement Percentage",
                                                "Desc":"Expected cost reduction in new custom developments",
                                                "Edit_Field":"",
                                                "Edit_Field_Visiblity":true,
                                                "DropdownKey":"",
                                                "Dropdown_Visiblity":false,
                                                "CatagoryLabel":"Standard",
                                            }
                                     ]
                        },
                        {
                            "no":'3',
                                "cat_desc":"Decrease Costs Associated with IT Project Execution",
                                "Desc":"",
                                "Edit_Field":"",
                                "Edit_Field_Visiblity":false,
                                "DropdownKey":"",
                                "Dropdown_Visiblity":false,
                                "CatagoryLabel":"Bold",
                                "categories":[
                                                {
                                                    "no":'3.1',
                                                    "cat_desc":"Estimated Technical Debt Impact",
                                                    "Desc":"Percentage of IT project cost attributed to technical debt",
                                                    "Edit_Field":"",
                                                    "Edit_Field_Visiblity":true,
                                                    "DropdownKey":"",
                                                    "Dropdown_Visiblity":false,
                                                    "CatagoryLabel":"Standard",
                                                },
                                                {
                                                    "no":'3.2',
                                                    "cat_desc":"Improvement Percentage",
                                                    "Desc":"Expected reduction in technical debt impact.",
                                                    "Edit_Field":"",
                                                    "Edit_Field_Visiblity":true,
                                                    "DropdownKey":"",
                                                    "Dropdown_Visiblity":false,
                                                    "CatagoryLabel":"Standard",
                                                }
                                         ]
                            },
                            {
                                "no":'4',
                                    "cat_desc":"Cut Down on IT Integration and Maintenance Expenses",
                                    "Desc":"",
                                    "Edit_Field":"",
                                    "Edit_Field_Visiblity":false,
                                    "DropdownKey":"",
                                    "Dropdown_Visiblity":false,
                                    "CatagoryLabel":"Bold",
                                    "categories":[
                                                    {
                                                        "no":'4.1',
                                                        "cat_desc":"Total IT Spend (% of Revenue)",
                                                        "Desc":"Percentage of revenue allocated to total IT spending.",
                                                        "Edit_Field":"",
                                                        "Edit_Field_Visiblity":true,
                                                        "DropdownKey":"",
                                                        "Dropdown_Visiblity":false,
                                                        "CatagoryLabel":"Standard",
                                                    },
                                                    {
                                                        "no":'4.2',
                                                        "cat_desc":"SAP Spend (% of Total IT Spend)",
                                                        "Desc":"Percentage of total IT spend allocated to SAP.",
                                                        "Edit_Field":"",
                                                        "Edit_Field_Visiblity":true,
                                                        "DropdownKey":"",
                                                        "Dropdown_Visiblity":false,
                                                        "CatagoryLabel":"Standard",
                                                    },
                                                    {
                                                        "no":'4.3',
                                                        "cat_desc":"SAP IT Integration & Maintenance Cost (% of SAP Spend)",
                                                        "Desc":"Percentage of SAP spend allocated to integration and maintenance.",
                                                        "Edit_Field":"",
                                                        "Edit_Field_Visiblity":true,
                                                        "DropdownKey":"",
                                                        "Dropdown_Visiblity":false,
                                                        "CatagoryLabel":"Standard",
                                                    },
                                                    {
                                                        "no":'4.4',
                                                        "cat_desc":"Improvement Percentage",
                                                        "Desc":"Expected cost reduction in SAP IT integration and maintenance.",
                                                        "Edit_Field":"",
                                                        "Edit_Field_Visiblity":true,
                                                        "DropdownKey":"",
                                                        "Dropdown_Visiblity":false,
                                                        "CatagoryLabel":"Standard",
                                                    }
                                             ]
                                },
                                {
                                    "no":'5',
                                        "cat_desc":"Lessen the Impact of Poor Data Quality on Costs",
                                        "Desc":"",
                                        "Edit_Field":"",
                                        "Edit_Field_Visiblity":false,
                                        "DropdownKey":"",
                                        "Dropdown_Visiblity":false,
                                        "CatagoryLabel":"Bold",
                                        "categories":[
                                                        {
                                                            "no":'5.1',
                                                            "cat_desc":"Revenue Lost Due to Poor Data Quality",
                                                            "Desc":"Percentage of revenue lost due to poor data quality.",
                                                            "Edit_Field":"",
                                                            "Edit_Field_Visiblity":true,
                                                            "DropdownKey":"",
                                                            "Dropdown_Visiblity":false,
                                                            "CatagoryLabel":"Standard",
                                                        },
                                                        {
                                                            "no":'5.2',
                                                            "cat_desc":"Improvement Percentage",
                                                            "Desc":"Expected improvement in reducing revenue loss.",
                                                            "Edit_Field":"",
                                                            "Edit_Field_Visiblity":true,
                                                            "DropdownKey":"",
                                                            "Dropdown_Visiblity":false,
                                                            "CatagoryLabel":"Standard",
                                                        }
                                                 ]
                                    },
                                    {
                                        "no":'6',
                                            "cat_desc":"Optimize Expenses Related to Data Security",
                                            "Desc":"",
                                            "Edit_Field":"",
                                            "Edit_Field_Visiblity":false,
                                            "DropdownKey":"",
                                            "Dropdown_Visiblity":false,
                                            "CatagoryLabel":"Bold",
                                            "categories":[
                                                            {
                                                                "no":'6.1',
                                                                "cat_desc":"Total IT Spend (% of Revenue)",
                                                                "Desc":"Percentage of revenue allocated to IT security spending.",
                                                                "Edit_Field":"",
                                                                "Edit_Field_Visiblity":true,
                                                                "DropdownKey":"",
                                                                "Dropdown_Visiblity":false,
                                                                "CatagoryLabel":"Standard",
                                                            },
                                                            {
                                                                "no":'6.2',
                                                                "cat_desc":"SAP Spend (% of IT Spend)",
                                                                "Desc":"Percentage of IT spend allocated to SAP security measures.",
                                                                "Edit_Field":"",
                                                                "Edit_Field_Visiblity":true,
                                                                "DropdownKey":"",
                                                                "Dropdown_Visiblity":false,
                                                                "CatagoryLabel":"Standard",
                                                            },
                                                            {
                                                                "no":'6.3',
                                                                "cat_desc":"Data Security Cost (% of SAP Spend)",
                                                                "Desc":"Percentage of SAP spend allocated to data security.",
                                                                "Edit_Field":"",
                                                                "Edit_Field_Visiblity":true,
                                                                "DropdownKey":"",
                                                                "Dropdown_Visiblity":false,
                                                                "CatagoryLabel":"Standard",
                                                            },
                                                            {
                                                                "no":'6.4',
                                                                "cat_desc":"Improvement Percentage",
                                                                "Desc":"Expected cost reduction in SAP data security expenses.",
                                                                "Edit_Field":"",
                                                                "Edit_Field_Visiblity":true,
                                                                "DropdownKey":"",
                                                                "Dropdown_Visiblity":false,
                                                                "CatagoryLabel":"Standard",
                                                            }
                                                     ]
                                        },
                                        {
                                            "no":'7',
                                                "cat_desc":"Reduce Disk Storage Expenses",
                                                "Desc":"",
                                                "Edit_Field":"",
                                                "Edit_Field_Visiblity":false,
                                                "DropdownKey":"",
                                                "Dropdown_Visiblity":false,
                                                "CatagoryLabel":"Bold",
                                                "categories":[
                                                                {
                                                                    "no":'7.1',
                                                                    "cat_desc":"Total Disk Data Storage",
                                                                    "Desc":"Total storage capacity allocated for disk data.",
                                                                    "Edit_Field":"",
                                                                    "Edit_Field_Visiblity":true,
                                                                    "DropdownKey":"",
                                                                    "Dropdown_Visiblity":true,
                                                                    "CatagoryLabel":"Standard",
                                                                },
                                                                {
                                                                    "no":'7.2',
                                                                    "cat_desc":"Number of Instances",
                                                                    "Desc":"Total instances utilizing disk storage.",
                                                                    "Edit_Field":"",
                                                                    "Edit_Field_Visiblity":true,
                                                                    "DropdownKey":"",
                                                                    "Dropdown_Visiblity":false,
                                                                    "CatagoryLabel":"Standard",
                                                                },
                                                                {
                                                                    "no":'7.3',
                                                                    "cat_desc":"Cost of Storing Disk Data per TB",
                                                                    "Desc":"Cost incurred per TB of disk data storage.",
                                                                    "Edit_Field":"",
                                                                    "Edit_Field_Visiblity":true,
                                                                    "DropdownKey":"",
                                                                    "Dropdown_Visiblity":false,
                                                                    "CatagoryLabel":"Standard",
                                                                },
                                                                {
                                                                    "no":'7.4',
                                                                    "cat_desc":"Improvement Percentage",
                                                                    "Desc":"Expected cost reduction in disk storage expenses.",
                                                                    "Edit_Field":"",
                                                                    "Edit_Field_Visiblity":true,
                                                                    "DropdownKey":"",
                                                                    "Dropdown_Visiblity":false,
                                                                    "CatagoryLabel":"Standard",
                                                                }
                                                         ]
                                            },
                                            {
                                                "no":'8',
                                                    "cat_desc":"Decrease Memory Storage Costs",
                                                    "Desc":"",
                                                    "Edit_Field":"",
                                                    "Edit_Field_Visiblity":false,
                                                    "DropdownKey":"",
                                                    "Dropdown_Visiblity":false,
                                                    "CatagoryLabel":"Bold",
                                                    "categories":[
                                                                    {
                                                                        "no":'8.1',
                                                                        "cat_desc":"Total Memory Storage",
                                                                        "Desc":"Total storage capacity allocated for memory.",
                                                                        "Edit_Field":"",
                                                                        "Edit_Field_Visiblity":true,
                                                                        "DropdownKey":"",
                                                                        "Dropdown_Visiblity":true,
                                                                        "CatagoryLabel":"Standard",
                                                                    },
                                                                    {
                                                                        "no":'8.2',
                                                                        "cat_desc":"Number of Instances",
                                                                        "Desc":"Total instances utilizing memory storage.",
                                                                        "Edit_Field":"",
                                                                        "Edit_Field_Visiblity":true,
                                                                        "DropdownKey":"",
                                                                        "Dropdown_Visiblity":false,
                                                                        "CatagoryLabel":"Standard",
                                                                    },
                                                                    {
                                                                        "no":'8.3',
                                                                        "cat_desc":"Cost of Storing Memory Data per TB",
                                                                        "Desc":"Cost incurred per TB of memory storage.",
                                                                        "Edit_Field":"",
                                                                        "Edit_Field_Visiblity":true,
                                                                        "DropdownKey":"",
                                                                        "Dropdown_Visiblity":false,
                                                                        "CatagoryLabel":"Standard",
                                                                    },
                                                                    {
                                                                        "no":'8.4',
                                                                        "cat_desc":"Improvement Percentage",
                                                                        "Desc":"Expected cost reduction in memory storage expenses.",
                                                                        "Edit_Field":"",
                                                                        "Edit_Field_Visiblity":true,
                                                                        "DropdownKey":"",
                                                                        "Dropdown_Visiblity":false,
                                                                        "CatagoryLabel":"Standard",
                                                                    }
                                                             ]
                                                }			
                        ]		
                    }
                    
                    });
                    this.getView().byId("TreeTable").setModel(oTreeModel,"alTreeModel");
            },
            onLiveChange2: function (oEvent) {
                // Get the input value
                var sValue = oEvent.getParameter("value");

                // Ensure the value is within the range 0-100
                if (sValue < 0) {
                    oEvent.getSource().setValue(0); // Set to minimum value
                } else if (sValue > 100) {
                    oEvent.getSource().setValue(100); // Set to maximum value
                }
            },


            onInputChange: function (oEvent) {
                var oModel = this.getView().getModel("costModel");
                var aRows = oModel.getProperty("/rows");


                var aTotals = [0, 0, 0, 0, 0, 0];


                aRows.forEach(function (row) {
                    if (row.desc !== "Total cost") {
                        aTotals[0] += parseFloat(row.year0) || 0;
                        aTotals[1] += parseFloat(row.year1) || 0;
                        aTotals[2] += parseFloat(row.year2) || 0;
                        aTotals[3] += parseFloat(row.year3) || 0;
                        aTotals[4] += parseFloat(row.year4) || 0;
                        aTotals[5] += parseFloat(row.year5) || 0;
                    }
                });


                aRows[aRows.length - 1] = {
                    desc: "Total cost",
                    year0: aTotals[0].toFixed(2),
                    year1: aTotals[1].toFixed(2),
                    year2: aTotals[2].toFixed(2),
                    year3: aTotals[3].toFixed(2),
                    year4: aTotals[4].toFixed(2),
                    year5: aTotals[5].toFixed(2),
                    editable: false
                };

                // Set the updated data back to the model
                oModel.setProperty("/rows", aRows);
            },


            // Helper function to format numbers with commas
            formatNumber: function (num) {
                return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            },


            call: function () {

                // var companyID = this.getOwnerComponent().getModel("userModel").getData().companyID;
                // var oFilter = new Filter({
                //     filters: [
                //         new Filter("COMPANY_ID", FilterOperator.EQ, companyID),
                //     ],
                // });

                var DataModels = this.getOwnerComponent().getModel();
                this.oFileData = [];
                DataModels.read("/MSTR_COMPANY", {
                    // filters: [oFilter],
                    success: function (response) {
                        var ROIInputCompany = new JSONModel({
                            companyArray: response.results
                        });
                        this.getOwnerComponent().setModel(ROIInputCompany, "ROIInputCompanyModel");
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

            },
            onCompanyChange: function (oEvent) {

                var oComboBox = this.byId("ROIInputPageSelectProject");
                if (oComboBox) {
                    oComboBox.setSelectedKey(null); // Sets the selected key to null
                }

                // Clear the model
                var ROIInputProject = new sap.ui.model.json.JSONModel(); // Create an empty model
                ROIInputProject.setData({ projectArray: [] }); // Set the data to an empty array or object
                this.getOwnerComponent().setModel(ROIInputProject, "listPageProjectMode");

                // sap.ui.getCore().busyDialog.open();
                var comp_ID = parseInt(oEvent.getSource().getSelectedKey());
                var oFilter = new Filter({
                    filters: [
                        new Filter("COMPANY_ID", FilterOperator.EQ, comp_ID),
                    ],
                });
                var DataModels = this.getOwnerComponent().getModel();
                this.oFileData = [];
                DataModels.read("/MSTR_PROJECT", {
                    filters: [oFilter],
                    success: function (response) {
                        // sap.ui.getCore().busyDialog.close();
                        var ROIInputProject = new JSONModel({
                            projectArray: response.results
                        });
                        this.getOwnerComponent().setModel(ROIInputProject, "ROIInputProjectModel");
                    }.bind(this),
                    error: function (error) {
                        // sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

            },
            changeView: function () {
                var key = this.getView().getParent().getParent().getSideContent().getSelectedKey();

                if (key === 'uploadFile') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }
                } else if (key === 'projects') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    }
                } else if (key === 'customPrompts') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                    }
                } else if (key === 'config') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Configuration");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Configuration");
                    }
                } else if (key === 'roiInput') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                    }
                } else if (key === 'roiOutput') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                    }
                }
            },
            formatComplexityValueState: function (sComplexity) {
                if (!sComplexity) {
                    return sap.ui.core.ValueState.None;
                }

                switch (sComplexity) {
                    case 'Low':
                        return sap.ui.core.ValueState.Success;
                    case 'Medium':
                        return sap.ui.core.ValueState.Warning;
                    case 'High':
                        return sap.ui.core.ValueState.Error;
                    default:
                        return sap.ui.core.ValueState.Information;
                }
            },
            onAddBlankRow: function (oEvent) {
                var aCustomData = oEvent.getSource().getCustomData();
                var sPath = aCustomData.find(function (oData) {
                    return oData.getKey() === "path";
                })?.getValue();

                if (!sPath) {
                    sap.m.MessageToast.show("No path specified for the table.");
                    return;
                }
                var oModel = this.getView().getModel("configAttributeModel");
                var aTableData = oModel.getProperty(sPath) || [];
                var oBlankRow = {
                    SUBFIELD: "",
                    COUNT_FROM: "",
                    COUNT_TO: "",
                    COMPLEXITY: "",
                    EFFORTS: ""
                };
                aTableData.push(oBlankRow);
                oModel.setProperty(sPath, aTableData);
            },
            onSubmitForm: function () {
                var oView = this.getView();
                var that = this;

                // Retrieve values from input fields and ComboBoxes
                var sCompanyID = oView.byId("ROIInputPageSelectCompany").getSelectedKey();
                var sProjectID = oView.byId("ROIInputPageSelectProject").getSelectedKey();
                var sRevenue = oView.byId("inputRevenue").getValue();
                var sOperatingIncome = oView.byId("inputOperatingIncome").getValue();
                var sAnnualCost = oView.byId("inputSapERPMaintenanceCost").getValue();
                var sNumEmployees = oView.byId("inputNumEmployees").getValue();

                // Validation: Check for empty fields
                if (!sCompanyID || !sProjectID || !sRevenue || !sOperatingIncome || !sAnnualCost || !sNumEmployees) {
                    sap.m.MessageBox.error("All fields are mandatory. Please fill in all required fields.");
                    return; // Stop the function execution
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Calculating Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                // Prepare the payload
                var payload = {
                    "Project_ID": sProjectID,
                    "Project_COMPANY_ID": sCompanyID,
                    "COMPANY_ID": sCompanyID,
                    "Revenue": sRevenue,
                    "OperationIncome": sOperatingIncome,
                    "AnnualMaintainanceCost": sAnnualCost,
                    "NumberOfEmployees": sNumEmployees,
                    "CURRENCY": "$"
                };

                // Log the payload for debugging
                console.log("Payload to be submitted:", payload);
                this.getBearerToken().then(() => {


                    var oDataModel = this.getOwnerComponent().getModel();
                    oDataModel.create("/CustomerData_ROI", payload, {
                        success: function (response) {
                            sap.m.MessageBox.success("Form submitted successfully!");

                        }.bind(this),
                        error: function (error) {
                            sap.m.MessageBox.error("Error:", error);
                        }.bind(this)
                    });

                })

                this.postCostData();
                this.postCalculateROI();
                sap.ui.getCore().busyDialog.close();
                // this.postBenefitRealizationDactor();

            },
            postCalculateROI : function(){
                var oTable = this.getView().byId("TreeTable");
                var oData = oTable.getModel("alTreeModel").getData();
                var oPayload ={};
                oData.treeItems.categories.forEach(function(obj,index){
                   if(index === 0){
                    oPayload.CustomCodeMaintenancePercent = obj.categories[0].Edit_Field;
                    oPayload.CustomCodeImprovementPercent = obj.categories[1].Edit_Field;
                   }
                   if(index === 1){
                    oPayload.NewDevSpendPercent = obj.categories[0].Edit_Field;
                    oPayload.NewDevImprovementPercent = obj.categories[1].Edit_Field;
                   }
                   if(index === 2){
                    oPayload.TechDebtImpactPercent = obj.categories[0].Edit_Field;
                    oPayload.TechDebtImprovementPercent = obj.categories[1].Edit_Field;
                   }
                   if(index === 3){
                    oPayload.ITSpendPercent = obj.categories[0].Edit_Field;
                    oPayload.SAPSpendPercent = obj.categories[1].Edit_Field;
                    oPayload.ITMaintenanceCostPercent = obj.categories[2].Edit_Field;
                    oPayload.ITMaintenanceImprovementPercent = obj.categories[3].Edit_Field;
                   }
                   if(index === 4){
                    oPayload.DataQualityLossPercent = obj.categories[0].Edit_Field;
                    oPayload.DataQualityImprovementPercent = obj.categories[1].Edit_Field;
                   }
                   if(index === 5){
                    oPayload.ITSecuritySpendPercent = obj.categories[0].Edit_Field;
                    oPayload.SAPSecuritySpendPercent = obj.categories[1].Edit_Field;
                    oPayload.DataSecurityCostPercent = obj.categories[2].Edit_Field;
                    oPayload.DataSecurityImprovementPercent = obj.categories[3].Edit_Field;
                   }
                   if(index === 6){
                    oPayload.TotalDiskStorage = obj.categories[0].Edit_Field;
                    oPayload.CostPerTB = obj.categories[1].Edit_Field;
                    oPayload.NumberOfInstances = obj.categories[2].Edit_Field;
                    oPayload.DiskStorageImprovementPercent = obj.categories[3].Edit_Field;
                   }
                   if(index === 7){
                    oPayload.TotalMemoryStorage = obj.categories[0].Edit_Field;
                    oPayload.CostPerTBMemory = obj.categories[1].Edit_Field;
                    oPayload.NumberOfInstances = obj.categories[2].Edit_Field;
                    oPayload.MemoryStorageImprovementPercent = obj.categories[3].Edit_Field;
                   }
                });
                this.getBearerToken().then(() => {
                    var that = this;
                $.ajax({
                    url: "/v2/odata/v4/assessment/calculateROI",
                    method: "POST",
                    contentType: "application/json",
                    data: JSON.stringify(oPayload),
                    contentType: "application/json;odata=verbose",
                    accept: "application/json",
                    headers: {
                        "Authorization": "Bearer " + that.accessToken,
                        "Accept": "application/json"
                    },
                    success: function (response) {
                        sap.m.MessageBox.success("ROI Calculated successfully!");
                        sap.ui.getCore().busyDialog.close();
                    },
                    error: function (error) {
                        sap.m.MessageBox.error("Error:", error);
                        sap.ui.getCore().busyDialog.close();
                    }
                });
            });
            },

            getBearerToken: function () {
                var clientId = "sb-CoreAssess_v2-dev!t187872";
                var clientSecret = "zbhelRu98UuMcSBGvK+n5085LP8=";
                var tokenUrl = "https://workshop-sap-build-9w562br3.authentication.eu10.hana.ondemand.com/oauth/token";
                var that = this;

                return new Promise(function (resolve, reject) {
                    $.ajax({
                        url: tokenUrl,
                        type: "POST",
                        contentType: "application/x-www-form-urlencoded",
                        data: {
                            "grant_type": "client_credentials",
                            "client_id": clientId,
                            "client_secret": clientSecret
                        },
                        success: function (data) {
                            var token = data.access_token;
                            that.accessToken = token;
                            resolve(token);
                        },
                        error: function (error) {
                            reject("Failed to fetch Bearer token: " + error.responseText);
                        }
                    });
                });
            },

            convertRowsToPayloadCostData: function (rows) {
                const payload = [];

                var sCompanyID = parseInt(this.byId("ROIInputPageSelectCompany").getSelectedKey());
                var sProjectID = parseInt(this.byId("ROIInputPageSelectProject").getSelectedKey())

                // Extract column names for each year from the rows
                const years = Object.keys(rows[0]).filter(key => key.startsWith('year'));

                for (const year of years) {
                    const yearIndex = parseInt(year.replace('year', '')) + 1; // Convert year key to YearID (e.g., year0 -> YearID_YearID = 1)
                    const yearData = {
                        YearID_YearID: yearIndex,
                        projectID_ID: sProjectID, // Placeholder; adjust according to your requirement
                        projectID_COMPANY_ID: sCompanyID, // Placeholder; adjust according to your requirement
                        Implementation_Cost: 0,
                        Internal_FTE_Cost: 0,
                        Productivity_Impact: 0,
                        Any_Other_Cost: 0,
                        Total_Cost: 0
                    };

                    rows.forEach(row => {
                        // Map row descriptions to hardcoded keys
                        switch (row.desc) {
                            case "Implementation cost":
                                yearData.Implementation_Cost = row[year];
                                break;
                            case "Internal FTE Cost":
                                yearData.Internal_FTE_Cost = row[year];
                                break;
                            case "Productivity impact":
                                yearData.Productivity_Impact = row[year];
                                break;
                            case "any other":
                                yearData.Any_Other_Cost = row[year];
                                break;
                            case "Total cost":
                                yearData.Total_Cost = row[year];
                                break;
                            default:
                                // Ignore rows that don't map to a specific payload field
                                break;
                        }
                    });

                    payload.push(yearData);
                }

                return { data: payload };
            },

            postCostData: function () {
                var that = this;

                var a = this.convertRowsToPayloadCostData(this.getView().getModel("costModel").getData()?.rows)
                var payload = { AnnualMaintainanceCost: parseInt(this.byId("inputSapERPMaintenanceCost").getValue()), data: a["data"] }

                var DataModel = this.getOwnerComponent().getModel();
                DataModel.create("/createROI", payload, {
                    success: function (response) {
                        sap.m.MessageBox.success("Form submitted successfully!");

                    }.bind(this),
                    error: function (error) {
                        sap.m.MessageBox.error("Error:", error);
                    }.bind(this)
                });

            },
            createPayloadBenefitRealizationDactor: function (inputData, projectId, companyId) {
                const payload = { data: [] };

                inputData.forEach(item => {
                    // Iterate through years (year1, year2, ...)
                    for (let i = 1; i <= 5; i++) {
                        const yearKey = `year${i}`;
                        if (yearKey in item) {
                            payload.data.push({
                                YearID_YearID: i, // Year ID derived from the key
                                projectID_ID: projectId,
                                projectID_COMPANY_ID: companyId,
                                [item.desc.replace(/\s+/g, '_')]: item[yearKey] // Dynamically set the description field
                            });
                        }
                    }
                })

                return payload;
            },

            postBenefitRealizationDactor: function () {
                var that = this;
                var sCompanyID = parseInt(this.byId("ROIInputPageSelectCompany").getSelectedKey());
                var sProjectID = parseInt(this.byId("ROIInputPageSelectProject").getSelectedKey())

                var a = this.createPayloadBenefitRealizationDactor(this.getView().getModel("benefitRealizationDactorModel").getData()?.rows, sProjectID, sCompanyID)
                var payload = a
                $.ajax({
                    url: "/v2/odata/v4/assessment/createYearCalculation2",
                    method: "POST",
                    contentType: "application/json",
                    data: JSON.stringify(payload),
                    contentType: "application/json;odata=verbose",
                    accept: "application/json",
                    headers: {
                        "Authorization": "Bearer " + that.accessToken,
                        "Accept": "application/json"
                    },
                    success: function (response) {
                        sap.m.MessageBox.success("Form submitted successfully!");
                    },
                    error: function (error) {
                        sap.m.MessageBox.error("Error:", error);
                    }
                });

            },
            getYears: function () {
                this.getBearerToken().then(() => {
                    var that = this;
                    $.ajax({
                        url: "/v2/odata/v4/assessment/YEAR",
                        method: "GET",
                        contentType: "application/json",
                        contentType: "application/json;odata=verbose",
                        accept: "application/json",
                        headers: {
                            "Authorization": "Bearer " + that.accessToken,
                            "Accept": "application/json"
                        },
                        success: function (response) {
                            var yearsModel = new JSONModel({
                                yearArr: response.results
                            });
                            that.getOwnerComponent().setModel(yearsModel, "yearModel");
                        },
                        error: function (error) {
                            sap.m.MessageBox.error("Error:", error);
                        }
                    });
                })
            },
            getAdditionalSoftwareSubscription: function (projectID) {
                this.getBearerToken().then(() => {
                    var that = this;
                    $.ajax({
                        url: "/v2/odata/v4/assessment/GetTotalUnitPriceByProject(ProjectID=" + projectID + ")",
                        method: "GET",
                        contentType: "application/json",
                        contentType: "application/json;odata=verbose",
                        accept: "application/json",
                        headers: {
                            "Authorization": "Bearer " + that.accessToken,
                            "Accept": "application/json"
                        },
                        success: function (response) {
                            var totalUnitPrices = response; // Parse the values as floats

                            // Get the current costModel
                            var costModel = that.getView().getModel("costModel");
                            var costData = costModel.getProperty("/rows");

                            costData.forEach(item => {
                                if (item.desc === "Additional Software Subscription") {
                                    item.year0 = parseFloat(totalUnitPrices.Field1);
                                    item.year1 = parseFloat(totalUnitPrices.Field2);
                                    item.year2 = parseFloat(totalUnitPrices.Field3);
                                    item.year3 = parseFloat(totalUnitPrices.Field4);
                                    item.year4 = parseFloat(totalUnitPrices.Field5);
                                    item.year5 = parseFloat(totalUnitPrices.Field6);
                                }
                            });

                            costModel.setProperty("/rows", costData);
                        },
                        error: function (error) {
                            sap.m.MessageBox.error("Error:", error);
                        }
                    });
                })
            },
            onProjectChange: function () {
                var projectID = this.byId("ROIInputPageSelectProject").getSelectedKey()
                this.getAdditionalSoftwareSubscription(projectID)
            }



        })
    })