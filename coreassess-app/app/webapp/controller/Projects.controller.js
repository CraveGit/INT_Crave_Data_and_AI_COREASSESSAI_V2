sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    'sap/ui/export/Spreadsheet',
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
],
    function (Controller, JSONModel, Spreadsheet, MessageToast, MessageBox, Fragment, Filter, FilterOperator) {
        "use strict";
        var mainSource;
        return Controller.extend("com.crave.coreassessv2.controller.Projects", {
            // Avatar accepts initials of letters only (its validation regex is
            // /^[a-zA-Z...]{1,3}$/). "S/4 Migration" -> "S/" contains a slash and
            // is rejected, so the Avatar fell back to its default icon. Strip
            // non-letters first, then take the first two, so a valid avatar shows.
            formatInitials: function (sName) {
                var sLetters = String(sName || "").replace(/[^a-zA-Z]/g, "");
                return sLetters ? sLetters.substring(0, 2).toUpperCase() : "";
            },
            onInit: function () {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("Projects").attachPatternMatched(this.onObjectMatch, this);
                this.callSkillSet();
            },
            onObjectMatch: function () {
                // Do NOT call changeView() here. changeView reads the side-nav key
                // and re-routes from it; on arrival the key is still 'projects', so
                // an ADMIN was immediately sent back to Company -- the page flashed
                // and bounced. Company.navigateToProjects already loads
                // projectObjectsModel before navigating, so there is nothing to do.
            },
            callSkillSet: function () {
                var datamodel = this.getOwnerComponent().getModel();
                datamodel.read("/SkillSet", {
                    success: function (response) {
                        var skills = new JSONModel({ skillsetarray: response.results });
                        this.getView().setModel(skills, "skillSetModel");
                    }.bind(this),
                    error: function (error) {
                        sap.m.MessageToast.show("Error Fetching SkillSets");
                    }.bind(this)
                })
            },
            callProjects: function () {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var companyID = this.getOwnerComponent().getModel("userModel").getData().companyID;
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
                        var projectObjects = new JSONModel();
                        projectObjects.setSizeLimit(response.results.length);
                        projectObjects.setData({
                            projectArray: response.results
                        })
                        //
                        this.getOwnerComponent().setModel(projectObjects, "projectObjectsModel");

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");

                    }.bind(this)
                })
            },
            changeView: function () {
                var key = this.getView().getParent().getParent().getSideContent().getSelectedKey()
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
                        // callCompanies is not defined on this controller; the
                        // Company view loads its own data on route-match.
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Company");
                    } else if (sap.User === 'USER') {
                        this.callProjects();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Projects");
                    } else if (sap.User === 'INT_USER') {
                        // callCompanies is not defined on this controller; the
                        // Company view loads its own data on route-match.
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
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
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
            navigateToReport: function (oEvent) {
                var projectID = oEvent.getSource().getBindingContext("projectObjectsModel").getObject();
                this.getOwnerComponent().getModel("dataModel").getData().projectData = projectID;
                this.getOwnerComponent().getModel("dataModel").refresh(true);
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var oDataModel = this.getOwnerComponent().getModel();

                // var oPromise1 = new Promise((resolve, reject) => {
                //     oDataModel.callFunction("/GetKPIGraph_1", {
                //         urlParameters: {
                //             "PROJECT_ID": projectID.ID
                //         },
                //         success: function (response) {
                //             var oGraph1 = new JSONModel({ graph1Array: response.results });
                //             this.getOwnerComponent().setModel(oGraph1, "Graph1Model");
                //             resolve();
                //         }.bind(this),
                //         error: function (error) {
                //             reject(error);
                //         }
                //     });
                // });

                // var oPromise2 = new Promise((resolve, reject) => {
                //     oDataModel.callFunction("/GetKPIGraph_2", {
                //         urlParameters: {
                //             "PROJECT_ID": projectID.ID
                //         },
                //         success: function (response) {
                //             var oGraph2 = new JSONModel({ graph2Array: response.results });
                //             this.getOwnerComponent().setModel(oGraph2, "Graph2Model");
                //             resolve();
                //         }.bind(this),
                //         error: function (error) {
                //             reject(error);
                //         }
                //     });
                // });

                // var oPromise3 = new Promise((resolve, reject) => {
                //     oDataModel.callFunction("/GetKPIGraph_3", {
                //         urlParameters: {
                //             "PROJECT_ID": projectID.ID
                //         },
                //         success: function (response) {
                //             var oGraph3 = new JSONModel({ graph3Array: response.results });
                //             this.getOwnerComponent().setModel(oGraph3, "Graph3Model");
                //             resolve();
                //         }.bind(this),
                //         error: function (error) {
                //             reject(error);
                //         }
                //     });
                // });

                // var oPromise4 = new Promise((resolve, reject) => {
                //     oDataModel.callFunction("/GetKPIGraph_4", {
                //         urlParameters: {
                //             "PROJECT_ID": projectID.ID
                //         },
                //         success: function (response) {
                //             const output = response.results.map(item => {
                //                 const result = { name: item.name, High: 0, Moderate: 0 };
                //                 item.value.forEach(val => {
                //                     if (val.complexity === "High") {
                //                         result.High = val.count;
                //                     } else if (val.complexity === "Medium") {
                //                         result.Medium = val.count;
                //                     } else if (val.complexity === "Low") {
                //                         result.Low = val.count;
                //                     }
                //                 });
                //                 return result;
                //             });
                //             var oGraph4 = new JSONModel({ graph4Array: output });
                //             this.getOwnerComponent().setModel(oGraph4, "Graph4Model");
                //             resolve();
                //         }.bind(this),
                //         error: function (error) {
                //             reject(error);
                //         }
                //     });
                // });

                // Promise.all([oPromise1, oPromise2, oPromise3, oPromise4])
                //     .then(function () {
                //         sap.ui.getCore().busyDialog.close();
                //         sap.ui.core.UIComponent.getRouterFor(this).navTo("AssessmentReport");
                //     }.bind(this))
                //     .catch(function (error) {
                //         sap.ui.getCore().busyDialog.close();
                //         MessageToast.show(error.responseText);
                //     });

                var objectPromise = new Promise((resolve, reject) => {
                    oDataModel.callFunction("/GetObjects", {
                        urlParameters: {
                            "PROJECT_ID": projectID.ID
                        },
                        success: function (response) {
                            response.results.sort((a, b) => b.ID - a.ID);
                            // sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                            var listObject = new JSONModel({
                                objectList: response.results
                            });
                            this.getOwnerComponent().setModel(listObject, "listObjectsModel");
                            this.getOwnerComponent().getModel("dataModel").getData().objectLength = response.results.length;
                            resolve();
                        }.bind(this),
                        error: function (error) {
                            MessageToast.show(error.responseText);
                            reject(error);
                        }.bind(this)
                    })
                });


                var filterPromise = new Promise((resolve, reject) => {
                    oDataModel.callFunction("/GetMstrObjData", {
                        method: "GET",
                        urlParameters: { PROJECT_ID: parseInt(projectID.ID, 10) || 0 },
                        success: function (response) {
                            var d = (response && response.GetMstrObjData) || response;
                            var filterObject = new JSONModel({
                                filterList: [d]
                            });
                            this.getOwnerComponent().setModel(filterObject, "filterObjectModel");
                            // sap.ui.getCore().busyDialog.close();
                            // sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                            resolve();
                        }.bind(this),
                        error: function (error) {
                            // sap.ui.getCore().busyDialog.close();
                            MessageToast.show(JSON.parse(error.responseText).error.message.value);
                            reject();
                        }.bind(this)
                    })
                });

                var filterPromisetest = new Promise((resolve, reject) => {
                    oDataModel.read("/GetFilterAttributes()", {
                        success: function (response) {
                            var filterTestObject = new JSONModel({
                                filterTestList: [response.GetFilterAttributes]
                            });
                            this.getOwnerComponent().setModel(filterTestObject, "filterTestObjectModel");
                            // sap.ui.getCore().busyDialog.close();
                            // sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                            resolve();
                        }.bind(this),
                        error: function (error) {
                            // sap.ui.getCore().busyDialog.close();
                            MessageToast.show(JSON.parse(error.responseText).error.message.value);
                            reject();
                        }.bind(this)
                    })
                });



                Promise.all([objectPromise, filterPromise, filterPromisetest])
                    .then(function () {
                        sap.ui.getCore().busyDialog.close();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                    }.bind(this))
                    .catch(function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show(error.responseText);
                    });

                // oDataModel.callFunction("/GetObjects", {
                //     urlParameters: {
                //         "PROJECT_ID": projectID.ID
                //     },
                //     success: function (response) {              
                //         response.results.sort((a, b) => b.ID - a.ID);                 
                //         // sap.ui.core.UIComponent.getRouterFor(this).navTo("Objects");
                //         var listObject = new JSONModel({
                //             objectList: response.results
                //         });
                //         this.getOwnerComponent().setModel(listObject, "listObjectsModel");
                //         this.getOwnerComponent().getModel("dataModel").getData().objectLength = response.results.length;
                //     }.bind(this),
                //     error: function (error) {                    
                //         MessageToast.show(error.responseText);
                //     }.bind(this)
                // })
            },
            onSearchProject: function (oEvent) {
                var Text = oEvent.getSource().getValue();
                var oSearchFilter = new Filter({
                    filters: [
                        new Filter("PROJECT_NAME", FilterOperator.Contains, Text)
                    ]
                });
                this.getView().byId("projectList").getBinding("items").filter([oSearchFilter]);
            },
            createProjFrag: function () {
                var oView = this.getView()
                var that = this
                if (!this.byId("createProjFrag")) {
                    Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view.createProjFrag",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        oDialog.open();
                        that._resetProjFrag();
                    });
                } else {
                    that.byId("createProjFrag").open();
                    that._resetProjFrag();
                }
            },
            // Clear both fields on every open: the skillset ComboBox kept its
            // previous selection across opens (only the name was being reset).
            _resetProjFrag: function () {
                this.byId("projName").setValue("");
                var oSkill = this.byId("skillSetCreate");
                if (oSkill) { oSkill.setSelectedKey(""); oSkill.setValue(""); }
            },
            createProjFragClose: function () {
                this.byId("createProjFrag").close();
            },
            onCreateProj: function () {
                var projName = this.byId("projName").getValue();
                var skillSet = this.byId("skillSetCreate").getSelectedKey();
                if (projName === '') {
                    MessageToast.show("Enter Project Name!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var Model = this.getOwnerComponent().getModel()
                var projectCreatePayload = {
                    "PROJECT_NAME": projName,
                    "COMPANY_ID": this.getOwnerComponent().getModel("dataModel").getData().companyData.ID,
                    "SkillSet_ID": skillSet
                }
                Model.create("/MSTR_PROJECT", projectCreatePayload, {
                    success: function (response) {
                        this.recallProjects()
                            .then(() => {
                                this.createProjFragClose()
                                MessageBox.success("Project Created!");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch((error) => {
                                console.error("Error occurred during refresh:", error);
                                MessageToast.show("Failed to refresh the list.");
                                sap.ui.getCore().busyDialog.close();
                            });

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        // Show the backend message (e.g. the duplicate-name warning).
                        var sMsg = "Project Creation Failed!";
                        try { sMsg = JSON.parse(error.responseText).error.message.value || sMsg; } catch (e) { /* keep default */ }
                        MessageBox.warning(sMsg);
                        console.log("Error:" + error.responseText);
                    }.bind(this)
                })
            },
            recallProjects: function () {
                var companyID = this.getOwnerComponent().getModel("dataModel").getData().companyData.ID
                var that = this;
                return new Promise((resolve, reject) => {
                    var DataModels = this.getOwnerComponent().getModel();
                    var oFilter = new Filter({
                        filters: [
                            new Filter("COMPANY_ID", FilterOperator.EQ, companyID),
                        ],
                    });
                    DataModels.read("/MSTR_PROJECT", {
                        filters: [oFilter],
                        success: function (response) {
                            that.getOwnerComponent().getModel("projectObjectsModel").getData().projectArray = response.results
                            that.getOwnerComponent().getModel("projectObjectsModel").refresh(true);
                            resolve()
                        },
                        error: function (error) {
                            reject()
                            MessageToast.show("Try after some time! ");
                            that.getOwnerComponent().getModel("projectObjectsModel").refresh(true);
                        }
                    })
                });
            },
            onEditProject: function (oEvent) {
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                var sHash = oRouter.getHashChanger().getHash();
                let test = this.getOwnerComponent().getModel("dataModel").getData().companyData
                var oData = oEvent.getSource().getBindingContext("projectObjectsModel").getObject();
                oData.COMPANY = test.COMPANY_NAME
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
                var projectName = this.byId("projectFieldGrp4").getValue();
                var skillSet = this.byId("projectFieldGrp6").getSelectedKey();
                var IDs = this.getView().getModel("editModel").getData().oData
                if (projectName === '') {
                    MessageToast.show("Enter Name");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var editProjectPayload = {
                    "PROJECT_NAME": projectName,
                    "SkillSet_ID": skillSet
                }
                var ID = this.getView().getModel("editModel").getData().oData.ID
                var Model = this.getOwnerComponent().getModel();
                Model.update("/MSTR_PROJECT(COMPANY_ID=" + IDs.COMPANY_ID + ",ID=" + IDs.ID + ")", editProjectPayload, {
                    success: function (response) {
                        this.recallProjects()
                            .then(() => {
                                this.onEditEveryClose();
                                MessageBox.success("Project Updated Successfully!");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch((error) => {
                                this.onEditEveryClose();
                                console.error("Error occurred during  refresh:", error);
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
            // Archive (soft delete): row greys out, analysis retained, restorable.
            onDeleteProject: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("projectObjectsModel").getObject();
                var that = this;
                var oModel = this.getOwnerComponent().getModel();
                oModel.callFunction("/GetDeleteImpact", {
                    method: "GET",
                    urlParameters: { kind: "PROJECT", ID: oData.ID, COMPANY_ID: oData.COMPANY_ID },
                    success: function (r) {
                        var d = r.GetDeleteImpact || r;
                        MessageBox.warning(
                            "Archive project \"" + oData.PROJECT_NAME + "\"?\n\n" +
                            "This will archive " + (d.assessments || 0) + " assessment(s). They stay recoverable until you delete them permanently.",
                            {
                                title: "Archive project",
                                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                                emphasizedAction: MessageBox.Action.OK,
                                onClose: function (a) { if (a === "OK") { that._projectAction("/ArchiveProject", oData, "Project archived"); } },
                                dependentOn: that.getView()
                            }
                        );
                    },
                    error: function () {
                        MessageBox.warning("Archive project \"" + oData.PROJECT_NAME + "\"? It stays recoverable until permanently deleted.", {
                            title: "Archive project",
                            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                            emphasizedAction: MessageBox.Action.OK,
                            onClose: function (a) { if (a === "OK") { that._projectAction("/ArchiveProject", oData, "Project archived"); } },
                            dependentOn: that.getView()
                        });
                    }
                });
            },

            onRestoreProject: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("projectObjectsModel").getObject();
                this._projectAction("/RestoreProject", oData, "Project restored");
            },

            onPermaDeleteProject: function (oEvent) {
                var oData = oEvent.getSource().getBindingContext("projectObjectsModel").getObject();
                var that = this;
                MessageBox.error(
                    "Permanently delete project \"" + oData.PROJECT_NAME + "\"?\n\n" +
                    "This cannot be undone. All its assessments will be deleted for good.",
                    {
                        title: "Delete permanently",
                        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                        emphasizedAction: MessageBox.Action.CANCEL,
                        onClose: function (a) { if (a === MessageBox.Action.DELETE) { that.onDelete(oData); } },
                        dependentOn: that.getView()
                    }
                );
            },

            _projectAction: function (sFn, oData, sOkMsg) {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Please Wait..." });
                sap.ui.getCore().busyDialog.open();
                var oModel = this.getOwnerComponent().getModel();
                oModel.callFunction(sFn, {
                    method: "POST",
                    urlParameters: { ID: oData.ID, COMPANY_ID: oData.COMPANY_ID },
                    success: function () {
                        this.recallProjects().then(function () {
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
                var IDs = name;
                if (IDs.COMPANY_ID === '') {
                    MessageToast.show("Please Select a Project first!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Please Wait..." });
                sap.ui.getCore().busyDialog.open();
                var Model = this.getOwnerComponent().getModel();
                Model.remove("/MSTR_PROJECT(COMPANY_ID=" + IDs.COMPANY_ID + ",ID=" + IDs.ID + ")", {
                    success: function () {
                        this.recallProjects()
                            .then(() => {
                                MessageBox.success("Project deleted permanently.");
                                sap.ui.getCore().busyDialog.close();
                            })
                            .catch(() => {
                                MessageToast.show("Failed to refresh the list.");
                                sap.ui.getCore().busyDialog.close();
                            });
                    }.bind(this),
                    error: function () {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Failed to delete the project.");
                    }.bind(this)
                });
            }
        });
    });
