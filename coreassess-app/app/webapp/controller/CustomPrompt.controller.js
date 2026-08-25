sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
],
    function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
        "use strict";

        return Controller.extend("com.crave.coreassessv2.controller.CustomPrompt", {
            onInit: function () {
              //  this.byId("sideNavigation259").setSelectedKey("customPrompts");
                this.accessToken1 = null
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("CustomPrompt").attachPatternMatched(this.onObjectMatch, this);

                var DataModels = this.getOwnerComponent().getModel();
                DataModels.read("/MSTR_COMPANY", {
                    success: function (response) {
                        var companyObjects = new JSONModel({
                            objectArray: response.results
                        });
                        this.getOwnerComponent().setModel(companyObjects, "companyObjectsModel");

                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })
               // var companyID = this.getOwnerComponent().getModel("userModel").getData().companyID;
                // var oFilter = new Filter({
                //     filters: [
                //         new Filter("COMPANY_ID", FilterOperator.EQ, companyID),
                //     ],
                // });
                DataModels.read("/MSTR_PROJECT", {
                    // filters: [oFilter],
                    success: function (response) {
                        var customPromptProject = new JSONModel({
                            projectList: response.results
                        });
                        this.getOwnerComponent().setModel(customPromptProject, "customPromptProjectModel");

                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })


            },
            onObjectMatch: function (oEvent) {
                //this.byId("sideNavigation259").setSelectedKey("customPrompts");
                this.onPressRefresh();
                this.changeView();
            },
            changeView: function () {
                var key = this.getView().getParent().getParent().getSideContent().getSelectedKey()
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
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
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
            onFileChange1: function (oEvent) {
                var aFiles = oEvent.getParameter("files");
                if (Object.keys(aFiles).length > 3) {
                    MessageBox.information("You Can Upload a folder with 3 files only for trial!");
                    this.byId("fileUploader").setValue("");
                    return;
                }
                this.oFileData = [];
                var that = this;
                if (aFiles && Object.keys(aFiles).length > 0) {

                    Object.keys(aFiles).forEach(function (key) {
                        var oFile = aFiles[key];
                        if (oFile) {
                            var oFileReader = new FileReader();
                            oFileReader.onload = function (e) {
                                var sContent = e.target.result;
                                var sFolder = oFile.webkitRelativePath.split('/')[0];
                                that.oFileData.push({
                                    webkitRelativePath: sFolder,
                                    fileContent: sContent
                                });
                                if (that.oFileData.length === Object.keys(aFiles).length) {
                                    that._processFiles();
                                }
                            };
                            oFileReader.readAsText(oFile);
                        }
                    });
                } else {
                    MessageToast.show("Please upload valid text files.");
                }

            },
            _processFiles: function () {
                var groupedFiles = {};
                var result = [];

                this.oFileData.forEach(function (obj) {
                    var folder = obj.webkitRelativePath;
                    if (!groupedFiles[folder]) {
                        groupedFiles[folder] = {
                            webkitRelativePath: folder,
                            content: obj.fileContent
                        };
                    } else {
                        groupedFiles[folder].content += "\n" + obj.fileContent;
                    }
                });

                for (var folder in groupedFiles) {
                    result.push(groupedFiles[folder]);
                }
                console.log(result);
                var trialFolder = new JSONModel({
                    trial: result
                });
                this.getView().setModel(trialFolder, "trialFolderModel");

            },
            onPressCustomPrompt: function () {
                var companyId, projectId, promptText, oDataModel, payload
                companyId = this.byId("customPrompSelectCompany").getSelectedKey();
                projectId = this.byId("customPrompSelectProject").getSelectedKey();
                promptText = this.byId("promptText").getValue();
                if (companyId === "") {
                    MessageBox.information("Select Company!")
                    return;
                }
                if (projectId === "") {
                    MessageBox.information("Select Project!")
                    return;
                }
                if (promptText === "") {
                    MessageBox.information("Please Enter Prompt!")
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                payload = {
                    "PROMPT_STR": promptText,
                    "COMPANY_ID": parseInt(companyId),
                    "PROJECT_ID": parseInt(projectId),
                    "USER": this.getOwnerComponent().getModel("userModel").getData().Username
                }
                oDataModel = this.getOwnerComponent().getModel();
                var that = this;
                oDataModel.create("/CreatePrompt", payload, {
                    success: function (response) {
                        sap.ui.getCore().busyDialog.close();
                        that.byId("promptText").setValue("");
                        that.byId("customPrompSelectCompany").setSelectedKey("");
                        that.byId("customPrompSelectProject").setSelectedKey("");
                        MessageToast.show("Prompt Created Successfully, Please Click Refresh button below");
                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        that.byId("promptText").setValue("");
                        that.byId("customPrompSelectCompany").setSelectedKey("");
                        that.byId("customPrompSelectProject").setSelectedKey("")
                        MessageToast.show(JSON.parse(error.responseText).error.message.value);
                    }.bind(this)
                })

            },
            onPressRefresh: function () {

                var oDataModel = this.getOwnerComponent().getModel();
                var username = this.getOwnerComponent().getModel("userModel").getData().Username
                var that = this;
                var oFilter = new Filter({
                    filters: [
                        new Filter("USER", FilterOperator.EQ, username),
                    ],
                });
                oDataModel.read("/GetPromptsPerUser", {
                    filters: [oFilter],
                    success: function (response) {
                        response.results.sort((a, b) => b.ID - a.ID);
                        var userPrompts = new JSONModel({
                            userPromptArray: response.results
                        });
                        that.getOwnerComponent().setModel(userPrompts, "userPromptsModel");

                    }.bind(this),
                    error: function (error) {

                    }.bind(this)
                })
            },
            getBearerTokenCustomPrompt: function () {
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
                            that.accessToken1 = token;
                            resolve(token);
                        },
                        error: function (error) {
                            reject("Failed to fetch Bearer token: " + error.responseText);
                        }
                    });
                });
            },
            handleSingleUpload: function () {

                var folder, selected;
                selected = this.byId("selectPrompTrial").getSelectedItems();
                if (this.byId("selectPrompTrial").getSelectedItems().length === 0) {
                    MessageToast.show("Please Select Prompt")
                    return;
                }
                if(!this.getView().getModel("trialFolderModel")){
                    MessageToast.show("Please Browse Folder!");
                    return;
                }else if(this.getView().getModel("trialFolderModel").getData().trial.length === 0){
                    MessageToast.show("Please Browse Folder!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var aSelectedData = [];
                selected.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext("userPromptsModel");
                    if (oContext) {
                        aSelectedData.push(oContext.getObject().PROMPT_STR);
                    }
                });
                folder = this.getView().getModel("trialFolderModel").getData().trial;

                var that = this;

                this.getBearerTokenCustomPrompt().then(() => {
                    for (var i = 0; i < folder.length; i++) {
                        var payload = {
                            "prompts": aSelectedData,
                            "ObjectContent": folder[i].content
                        };

                        $.ajax({
                            url: "/v2/odata/v4/assessment/AnalyzeFileData",
                            method: "POST",
                            contentType: "application/json",
                            data: JSON.stringify(payload),
                            contentType: "application/json;odata=verbose",
                            accept: "application/json",
                            headers: {
                                "Authorization": "Bearer " + that.accessToken1,
                                "Accept": "application/json"
                            },
                            success: function (response) {
                                console.log(response.AnalyzeFileData);
                                var trialObject = new JSONModel(
                                    response
                                );
                                that.getOwnerComponent().setModel(trialObject, "trialObjectModel");
                                sap.ui.getCore().busyDialog.close();
                                that.byId("singleTrialPanel").setExpanded(true);
                                that.byId("fileUploader").setValue("");
                            },
                            error: function (error) {
                                sap.ui.getCore().busyDialog.close();
                                that.byId("singleTrialPanel").setExpanded(false);
                                that.byId("fileUploader").setValue("");
                            }
                        });
                    }
                })

            },
            onSearchCustomPrompt1:function(oEvent){
                var Text = oEvent.getSource().getValue();
                var oSearchFilter = new Filter({
                    filters: [
                            new Filter("PROMPT_STR", FilterOperator.Contains, Text)                          
                        ]
                });
                this.getView().byId("infoTableCustomPrompt").getBinding("rows").filter([oSearchFilter]);
            },
            onSearchCustomPrompt2:function(oEvent){
                var Text = oEvent.getSource().getValue();
                var oSearchFilter = new Filter({
                    filters: [
                            new Filter("PROMPT_STR", FilterOperator.Contains, Text)                          
                        ]
                });
                this.getView().byId("selectPrompTrial").getBinding("rows").filter([oSearchFilter]);
            }

        })
    })