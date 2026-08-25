sap.ui.define([
    "sap/ui/core/mvc/Controller",
   "sap/ui/model/json/JSONModel",
   'sap/viz/ui5/format/ChartFormatter',
   'sap/viz/ui5/api/env/Format',
   "sap/m/MessageToast"
],
function (Controller,JSONModel,ChartFormatter,Format,MessageToast) {
    "use strict";

    return Controller.extend("com.crave.coreassessv2.controller.AssessmentReport", {
        onInit: function() {        
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("AssessmentReport").attachPatternMatched(this.onObjectMatch, this);
        },
        onObjectMatch: function (oEvent) {
            this.getView().byId("sideNavigation3").setSelectedKey("projects");
            var length = this.getOwnerComponent().getModel("dataModel").getData()
            this.byId("totalNoOfObjects").setValue(length.objectLength);
            
            sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                text: "Please Wait..."
            });
            sap.ui.getCore().busyDialog.open();
            Format.numericFormatter(ChartFormatter.getInstance());
            var formatPattern = ChartFormatter.DefaultPattern;
            var oPopOver = this.getView().byId("idPopOver1");
            oPopOver.connect(this.getView().byId("chartContainerContentVizFrame1").getVizUid());
            oPopOver.setFormatString(formatPattern.STANDARDFLOAT);

            this.getView().byId("chartContainerContentVizFrame1").setVizProperties({
                plotArea: {
                    dataLabel: {
                        formatString: formatPattern.SHORTFLOAT_MFD2,
                        visible: true
                    },
                    sumLabel: {
                        name: "Sum Value Label",
                        defaultState: true
                    }
                },
                valueAxis: {
                    label: {
                        formatString: formatPattern.SHORTFLOAT
                    },
                    title: {
                        visible: true
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    }
                }
            });

            var oPopOver1 = this.getView().byId("idPopOver2");
            oPopOver1.connect(this.getView().byId("chartContainerContentVizFrame2").getVizUid());
            oPopOver1.setFormatString(formatPattern.STANDARDFLOAT);

            this.getView().byId("chartContainerContentVizFrame2").setVizProperties({
                plotArea: {
                    dataLabel: {
                        formatString: formatPattern.SHORTFLOAT_MFD2,
                        visible: true
                    },
                    sumLabel: {
                        name: "Sum Value Label",
                        defaultState: true
                    }
                },
                valueAxis: {
                    label: {
                        formatString: formatPattern.SHORTFLOAT
                    },
                    title: {
                        visible: true
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    }
                }
            });

            var oPopOver3 = this.getView().byId("idPopOver3");
            oPopOver3.connect(this.getView().byId("chartContainerContentVizFrame3").getVizUid());
            oPopOver3.setFormatString(formatPattern.STANDARDFLOAT);

            this.getView().byId("chartContainerContentVizFrame3").setVizProperties({
                plotArea: {
                    dataLabel: {
                        formatString: formatPattern.SHORTFLOAT_MFD2,
                        visible: true
                    },
                    sumLabel: {
                        name: "Sum Value Label",
                        defaultState: true
                    }
                },
                valueAxis: {
                    label: {
                        formatString: formatPattern.SHORTFLOAT
                    },
                    title: {
                        visible: true
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    }
                }
            });

            var oPopOver4 = this.getView().byId("idPopOver4");
            oPopOver4.connect(this.getView().byId("chartContainerContentVizFrame4").getVizUid());
            oPopOver4.setFormatString(formatPattern.STANDARDFLOAT);

            this.getView().byId("chartContainerContentVizFrame4").setVizProperties({
                plotArea: {
                    dataLabel: {
                        formatString: formatPattern.SHORTFLOAT_MFD2,
                        visible: true
                    },
                    sumLabel: {
                        name: "Sum Value Label",
                        defaultState: true
                    }
                },
                valueAxis: {
                    label: {
                        formatString: formatPattern.SHORTFLOAT
                    },
                    title: {
                        visible: true
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    }
                }
            });
            sap.ui.getCore().busyDialog.close();
        },
        changeView: function () {
            var key = this.getView().byId("sideNavigation3").getSelectedKey()
    
            if(key === 'uploadFile'){
                if(sap.User==="ADMIN"){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                }else if(sap.User === 'USER'){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                }
            }else if(key === 'projects'){
                if(sap.User==="ADMIN"){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                }else if(sap.User === 'USER'){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                }
            }else if(key === 'customPrompts'){
                if(sap.User==="ADMIN"){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                }else if(sap.User === 'USER'){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                }
            }else if(key === 'roiInput'){
                if(sap.User==="ADMIN"){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                }else if(sap.User === 'USER'){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                }
            }else if(key === 'roiOutput'){
                if(sap.User==="ADMIN"){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                }else if(sap.User === 'USER'){
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                }
            }
        },
        navigateToObjects: function () {
            sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                text: "Getting Data Please Wait..."
            });
            sap.ui.getCore().busyDialog.open();
             var DataModel = this.getOwnerComponent().getModel();
          
            
            var projectId = this.getOwnerComponent().getModel("dataModel").getData().projectData.ID;
            DataModel.callFunction("/GetMstrObjData", {
                method: "GET",
                urlParameters: { PROJECT_ID: parseInt(projectId, 10) || 0 },
                success: function (response) {
                    var d = (response && response.GetMstrObjData) || response;
                    var filterObject = new JSONModel({
                        filterList: [d]
                    });
                    this.getOwnerComponent().setModel(filterObject, "filterObjectModel");
                    sap.ui.getCore().busyDialog.close();
                    sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                }.bind(this),
                error: function (error) {
                    sap.ui.getCore().busyDialog.close();
                    MessageToast.show(JSON.parse(error.responseText).error.message.value);
                }.bind(this)
            })

        },

    });
});
