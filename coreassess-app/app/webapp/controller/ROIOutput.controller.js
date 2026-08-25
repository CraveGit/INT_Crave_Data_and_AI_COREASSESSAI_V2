

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

        return Controller.extend("com.crave.coreassessv2.controller.ROIOutput", {

            onInit: function () {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("ROIOutput").attachPatternMatched(this.onObjectMatch, this);
                this.call();

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
               // this.getView().byId("sideNavigationROIOutput").setSelectedKey("roiOutput");
               this.changeView();
            },
            callOutput:function(){
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var oDataModel = this.getOwnerComponent().getModel();
                var projectID = this.byId("ROIOutputPageSelectProject").getSelectedKey();
                if(projectID === ""){
                    sap.m.MessageBox.information("Select Project!");
                    return;
                }
                var oFilter = new Filter({
                    filters: [
                        new Filter("project_ID", FilterOperator.EQ, projectID),
                    ],
                });
                oDataModel.read("/ROI_Calculation_Output", {
                      filters: [oFilter],
                    success: function (response) {
                        var configAttibute = new JSONModel({
                            RO_Out: response.results
                        });
                        this.getOwnerComponent().setModel(configAttibute, "ROI_Out_Model");
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show(JSON.parse(error.responseText).error.message.value);
                        sap.ui.getCore().busyDialog.close();
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
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }
                } else if (key === 'projects') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    }
                } else if (key === 'customPrompts') {
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                    }
                }else if(key === 'config'){
                    if (sap.User === "ADMIN") {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Configuration");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Configuration");
                    }
                }else if(key === 'roiInput'){
                    if(sap.User==="ADMIN"){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                    }else if(sap.User === 'USER'){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                    }
                }else if(key === 'roiOutput'){
                    if(sap.User==="ADMIN"){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                    }else if(sap.User === 'USER'){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                    }
                }
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
                        var listPageCompany = new JSONModel({
                            companyArray: response.results
                        });
                        this.getOwnerComponent().setModel(listPageCompany, "listPageCompanyModel");
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

            },
            onCompanyChange: function (oEvent) {

                var oComboBox = this.byId("ROIOutputPageSelectProject");
                if (oComboBox) {
                    oComboBox.setSelectedKey(null); // Sets the selected key to null
                }

                // Clear the model
                var ROIInputProject = new sap.ui.model.json.JSONModel(); // Create an empty model
                ROIInputProject.setData({ projectArray: [] }); // Set the data to an empty array or object
                this.getOwnerComponent().setModel(ROIInputProject, "ROIInputProjectModel");


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
                        var listPageProject = new JSONModel({
                            projectArray: response.results
                        });
                        this.getOwnerComponent().setModel(listPageProject, "listPageProjectModel");
                    }.bind(this),
                    error: function (error) {
                        // sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

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
            }
        })
    })