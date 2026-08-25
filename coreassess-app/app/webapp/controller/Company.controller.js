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

        return Controller.extend("com.crave.coreassessv2.controller.Company", {

            // Avatar accepts initials of letters only (validation regex is
            // /^[a-zA-Z...]{1,3}$/), so names with digits or symbols fell back to
            // an icon. Strip non-letters first, then take the first two.
            formatInitials: function (sName) {
                var sLetters = String(sName || "").replace(/[^a-zA-Z]/g, "");
                return sLetters ? sLetters.substring(0, 2).toUpperCase() : "";
            },

            onInit: function () {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("Company").attachPatternMatched(this.onObjectMatch, this);
            },
            onObjectMatch: function () {
                //this.getView().byId("sideNavigation33").setSelectedKey("projects");
                this.changeView();
            },
            callCompanies: function () {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var DataModels = this.getOwnerComponent().getModel();
                DataModels.read("/MSTR_COMPANY", {
                    success: function (response) {
                        sap.ui.getCore().busyDialog.close();
                        // sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                        var companyObjects = new JSONModel();
                         // objectArray: response.results
                        companyObjects.setSizeLimit(response.results.length);
                        companyObjects.setData({
                            objectArray: response.results
                        })
                        this.getOwnerComponent().setModel(companyObjects, "companyObjectsModel");

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");

                    }.bind(this)
                })
            },
            changeView: function () {
                var key =this.getView().getParent().getParent().getSideContent().getSelectedKey()
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
                        this.callCompanies();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    } else if (sap.User === 'USER') {
                        this.callProjects();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                    } else if (sap.User === 'INT_USER') {
                        this.callCompanies();
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
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }
                }else if(key === 'roiInput'){
                    if(sap.User==="ADMIN"){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIInput");
                    }else if(sap.User === 'USER'){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }
                }else if(key === 'roiOutput'){
                    if(sap.User==="ADMIN"){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("ROIOutput");
                    }else if(sap.User === 'USER'){
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    }
                }
            },
            navigateToProjects: function (oEvent) {
                // var companyID = this.getOwnerComponent().getModel("userModel").getData().companyID;
                this.getOwnerComponent().getModel("dataModel").getData().companyData = oEvent.getSource().getBindingContext("companyObjectsModel").getObject();
                var companyID = oEvent.getSource().getBindingContext("companyObjectsModel").getObject().ID;
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var oFilter = new Filter({
                    filters: [
                        new Filter("COMPANY_ID", FilterOperator.EQ, companyID),
                    ],
                });
                var DataModels = this.getOwnerComponent().getModel();
                DataModels.read("/MSTR_PROJECT", {
                    filters: [oFilter],
                    success: function (response) {
                        sap.ui.getCore().busyDialog.close();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                        var projectObjects = new JSONModel({
                            projectArray: response.results
                        });
                        this.getOwnerComponent().setModel(projectObjects, "projectObjectsModel");

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");

                    }.bind(this)
                })
            },
            onSearchCompany: function (oEvent) {
                var Text = oEvent.getSource().getValue();
                var oSearchFilter = new Filter({
                    filters: [
                        new Filter("COMPANY_NAME", FilterOperator.Contains, Text)
                    ]
                });
                this.getView().byId("companyList").getBinding("items").filter([oSearchFilter]);
            },
            createCompanyFrag: function (oEvent) {
                var oView = this.getView()
                var that = this
                if (!this.byId("createCompanyFrag")) {
                    Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view.createCompFrag",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        oDialog.open();
                        that.byId("companyName").setValue("");
                    });
                } else {
                    that.byId("createCompanyFrag").open();
                    that.byId("companyName").setValue("")
                }
            },
            createCompFragClose: function () {
                this.byId("createCompanyFrag").close();
            },
            createComp: function () {
                var companyName = this.byId("companyName").getValue();
                if (companyName === '') {
                    MessageToast.show("Enter Company Name!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var Model = this.getOwnerComponent().getModel()
                var companyCreatePayload = {
                    "COMPANY_NAME": companyName,
                    "IMAGE_URL": "/image/crave_logo.png",
                }
                Model.create("/MSTR_COMPANY", companyCreatePayload, {
                    success: function (response) {
                        this.recallCompany()
                            .then(() => {
                                this.createCompFragClose()
                                MessageBox.success("Company Created!");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch((error) => {
                                console.error("Error occurred during object table refresh:", error);
                                MessageToast.show("Failed to refresh the list.");
                                sap.ui.getCore().busyDialog.close();
                            });

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        // Show the backend message (e.g. the duplicate-name warning)
                        // instead of a generic failure.
                        var sMsg = "Company Creation Failed!";
                        try { sMsg = JSON.parse(error.responseText).error.message.value || sMsg; } catch (e) { /* keep default */ }
                        MessageBox.warning(sMsg);
                        console.log("Error:" + error);
                    }.bind(this)
                })
            },
            recallCompany: function () {
                var that = this;
                return new Promise((resolve, reject) => {
                    var DataModels = this.getOwnerComponent().getModel();
                    DataModels.read("/MSTR_COMPANY", {
                        success: function (response) {
                            // Create the model if it does not exist yet (e.g. the list
                            // was never loaded), so this never throws and hangs the
                            // busy dialog.
                            var oCompModel = that.getOwnerComponent().getModel("companyObjectsModel");
                            if (!oCompModel) {
                                oCompModel = new JSONModel({ objectArray: [] });
                                that.getOwnerComponent().setModel(oCompModel, "companyObjectsModel");
                            }
                            oCompModel.setData({ objectArray: response.results });
                            oCompModel.refresh(true);
                            resolve()
                        },
                        error: function (error) {
                            reject()
                            MessageToast.show("Try after some time! ");
                            that.getOwnerComponent().getModel("companyObjectsModel").refresh(true);
                        }
                    })
                });
            },
            onEditCompany: function (oEvent) {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                var sHash = oRouter.getHashChanger().getHash();
                // var oList = this.byId("companyList");
                // var oSelectedItem = oList.getSelectedItem();
                var oData = oEvent.getSource().getBindingContext("companyObjectsModel").getObject();
                var oModel = new sap.ui.model.json.JSONModel({
                    oData
                });
                this.getView().setModel(oModel, "editModel");
                var oView = this.getView()
                var that = this
                if (!this.byId("editEveryFrag")) {
                    Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view.editEveryFrag",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        oDialog.open();
                        if (sHash === 'Company') {
                            ["companyFieldGrp1", "companyFieldGrp2"].forEach(id => {
                                that.byId(id).setVisible(true);
                            });
                            ["projectFieldGrp1", "projectFieldGrp2", "projectFieldGrp3", "projectFieldGrp4", "projectFieldGrp5", "projectFieldGrp6"].forEach(id => {
                                that.byId(id).setVisible(false);
                            });
                        } else if (sHash === 'Projects') {
                            ["companyFieldGrp1", "companyFieldGrp2"].forEach(id => {
                                that.byId(id).setVisible(false);
                            });
                            ["projectFieldGrp1", "projectFieldGrp2", "projectFieldGrp3", "projectFieldGrp4", "projectFieldGrp5", "projectFieldGrp6"].forEach(id => {
                                that.byId(id).setVisible(true);
                            });
                        }
                    });
                } else {
                    that.byId("editEveryFrag").open();
                    if (sHash === 'Company') {
                        ["companyFieldGrp1", "companyFieldGrp2"].forEach(id => {
                            that.byId(id).setVisible(true);
                        });
                        ["projectFieldGrp1", "projectFieldGrp2", "projectFieldGrp3", "projectFieldGrp4", "projectFieldGrp5", "projectFieldGrp6"].forEach(id => {
                            that.byId(id).setVisible(false);
                        });
                    } else if (sHash === 'Projects') {
                        ["companyFieldGrp1", "companyFieldGrp2"].forEach(id => {
                            that.byId(id).setVisible(false);
                        });
                        ["projectFieldGrp1", "projectFieldGrp2", "projectFieldGrp3", "projectFieldGrp4", "projectFieldGrp5", "projectFieldGrp6"].forEach(id => {
                            that.byId(id).setVisible(true);
                        });
                    }
                }
            },
            onEditEveryClose: function () {
                this.byId("editEveryFrag").close();
            },
            onEditEvery: function () {
                var companyName = this.byId("companyFieldGrp2").getValue();
                if(companyName === ''){
                    MessageToast.show("Enter Name");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var editPayload={
                    "COMPANY_NAME": companyName,
                    "IMAGE_URL": "/image/crave_logo.png",
                }
                var ID = this.getView().getModel("editModel").getData().oData.ID
                var Model = this.getOwnerComponent().getModel();
                Model.update("/MSTR_COMPANY(ID="+ID+")",editPayload, {
                    success: function (response) {
                        this.recallCompany()
                            .then(() => {
                                this.onEditEveryClose();
                                MessageBox.success("Company Updated!");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch((error) => {
                                this.onEditEveryClose();
                                console.error("Error occurred during object table refresh:", error);
                                MessageToast.show("Failed to refresh the list.");
                                sap.ui.getCore().busyDialog.close();
                            });
                    }.bind(this),
                    error: function (error) {
                        this.onEditEveryClose();
                        console.error("Error occurred during object table refresh:", error);
                                MessageToast.show("Failed to refresh the list.");
                    }.bind(this)
                });
            },
            // Archive (soft delete): row greys out, data retained, restorable. The
            // confirmation shows the blast radius (projects + assessments affected).
            onDeleteCompany: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("companyObjectsModel").getObject();
                var that = this;
                var oModel = this.getOwnerComponent().getModel();
                oModel.callFunction("/GetDeleteImpact", {
                    method: "GET",
                    urlParameters: { kind: "COMPANY", ID: oData.ID, COMPANY_ID: 0 },
                    success: function (r) {
                        var d = r.GetDeleteImpact || r;
                        var sMsg = "Archive company \"" + oData.COMPANY_NAME + "\"?\n\n" +
                            "This will archive " + (d.projects || 0) + " project(s) and " +
                            (d.assessments || 0) + " assessment(s). They stay recoverable until you delete them permanently.";
                        MessageBox.warning(sMsg, {
                            title: "Archive company",
                            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                            emphasizedAction: MessageBox.Action.OK,
                            onClose: function (a) { if (a === "OK") { that._companyAction("/ArchiveCompany", oData.ID, "Company archived"); } },
                            dependentOn: that.getView()
                        });
                    },
                    error: function () {
                        // Impact lookup failed -- still allow archiving with a generic prompt.
                        MessageBox.warning("Archive company \"" + oData.COMPANY_NAME + "\"? It stays recoverable until permanently deleted.", {
                            title: "Archive company",
                            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                            emphasizedAction: MessageBox.Action.OK,
                            onClose: function (a) { if (a === "OK") { that._companyAction("/ArchiveCompany", oData.ID, "Company archived"); } },
                            dependentOn: that.getView()
                        });
                    }
                });
            },

            onRestoreCompany: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("companyObjectsModel").getObject();
                this._companyAction("/RestoreCompany", oData.ID, "Company restored");
            },

            onPermaDeleteCompany: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("companyObjectsModel").getObject();
                var that = this;
                MessageBox.error(
                    "Permanently delete company \"" + oData.COMPANY_NAME + "\"?\n\n" +
                    "This cannot be undone. All its projects and assessments will be deleted for good.",
                    {
                        title: "Delete permanently",
                        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                        emphasizedAction: MessageBox.Action.CANCEL,
                        onClose: function (a) { if (a === MessageBox.Action.DELETE) { that.onDelete(oData); } },
                        dependentOn: that.getView()
                    }
                );
            },

            // Archive / restore go through a service action, then refresh the list.
            _companyAction: function (sFn, iID, sOkMsg) {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Please Wait..." });
                sap.ui.getCore().busyDialog.open();
                var oModel = this.getOwnerComponent().getModel();
                oModel.callFunction(sFn, {
                    method: "POST",
                    urlParameters: { ID: iID },
                    success: function () {
                        this.recallCompany().then(function () {
                            sap.ui.getCore().busyDialog.close();
                            MessageToast.show(sOkMsg);
                        }).catch(function () { sap.ui.getCore().busyDialog.close(); });
                    }.bind(this),
                    error: function () {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Action failed. Try again.");
                    }
                });
            },

            // Permanent delete (cascade on the server).
            onDelete: function (name) {
                var ID = name.ID;
                if (ID === '') {
                    MessageToast.show("Please Select a company first!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Please Wait..." });
                sap.ui.getCore().busyDialog.open();
                var Model = this.getOwnerComponent().getModel();
                Model.remove("/MSTR_COMPANY(ID=" + ID + ")", {
                    success: function () {
                        this.recallCompany()
                            .then(() => {
                                MessageBox.success("Company deleted permanently.");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch(() => {
                                MessageToast.show("Failed to refresh the list.");
                                sap.ui.getCore().busyDialog.close();
                            });
                    }.bind(this),
                    error: function () {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Failed to delete the company.");
                    }.bind(this)
                });
            }

        })
    })