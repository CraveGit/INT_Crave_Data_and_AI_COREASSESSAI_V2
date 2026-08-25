

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

        return Controller.extend("com.crave.coreassessv2.controller.Configuration", {

            onInit: function () {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("Configuration").attachPatternMatched(this.onObjectMatch, this);
            },
            onObjectMatch: function () {
              //  this.getView().byId("sideNavigationConfiguration").setSelectedKey("config");
              this.changeView();
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