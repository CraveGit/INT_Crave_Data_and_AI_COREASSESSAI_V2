sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ushell/Container",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
],
    function (Controller, JSONModel, MessageBox, Container, Filter, FilterOperator, MessageToast) {
        "use strict";
        var sContent;
        var stringArray = [];
        return Controller.extend("com.crave.coreassessv2.controller.ListPage", {
            // Populates the AI model dropdown; falls back to the default if the
            // service is unreachable so upload is never blocked.
            _loadAiModels: function (oDataModel) {
                var oComponent = this.getOwnerComponent();
                var FALLBACK = "anthropic--claude-4.8-opus";
                var oModel = new sap.ui.model.json.JSONModel({
                    default: FALLBACK,
                    models: [{ name: FALLBACK }]
                });
                oComponent.setModel(oModel, "aiModelModel");
                oDataModel.callFunction("/GetModels", {
                    method: "GET",
                    success: function (oResponse) {
                        var oResult = (oResponse && oResponse.GetModels) || {};
                        var aModels = (oResult.models && oResult.models.results) || oResult.models || [];
                        if (aModels.length) {
                            oModel.setData({
                                default: oResult.default || FALLBACK,
                                models: aModels
                            });
                        }
                    },
                    error: function () { /* keep fallback */ }
                });
            },

            onInit: function () {

                this.accessToken = null
                var DataModel = this.getOwnerComponent().getModel()
                this._loadAiModels(DataModel);
                DataModel.callFunction("/GetUserRole", {
                    success: function (response) {
                        // Map OWNER/SUPERUSER to ADMIN for the legacy view controllers
                        // (see App.controller for details); real role stays in the models.
                        var _role = response.GetUserRole.role;
                        sap.User = (_role === "OWNER" || _role === "SUPERUSER") ? "ADMIN" : _role;
                        // Merge into the existing model rather than replacing it:
                        // App.controller populates displayName/email/initials here
                        // too, and a fresh JSONModel wiped them depending on which
                        // GetUserRole call returned last.
                        var oUserModel = this.getOwnerComponent().getModel("userModel");
                        if (!oUserModel) {
                            oUserModel = new sap.ui.model.json.JSONModel({});
                            this.getOwnerComponent().setModel(oUserModel, "userModel");
                        }
                        oUserModel.setData({
                            companyID: response.GetUserRole.companyID,
                            username: response.GetUserRole.username,
                            Username: response.GetUserRole.username,
                            displayName: response.GetUserRole.displayName,
                            email: response.GetUserRole.email,
                            initials: response.GetUserRole.initials,
                            allowedObjects: response.GetUserRole.allowedObjects,
                            uploadedObjects: response.GetUserRole.uploadedObjects
                        }, true);
                        // Call for Project Select Dropdown on List Page
                        this.call();
                        var visible = new sap.ui.model.json.JSONModel();
                        visible.setData({
                            role: response.GetUserRole.role
                        });
                        this.getOwnerComponent().setModel(visible, "visibleModel");

                        if (sap.User === 'ADMIN') {
                            this.callConfigDetail();
                        }

                    }.bind(this),
                    error: function (error) {
                        sap.m.MessageBox.information("Error while fetching user, Kindly Login Again")
                    }.bind(this)
                });
                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("RouteListPage").attachPatternMatched(this.onObjectMatch, this);

                var theme = new JSONModel({
                    state: false, width: "", height: ""
                });
                this.getOwnerComponent().setModel(theme, "themeModel");
            },
            onSideNavButtonPress: function () {
                var toolPage = this.byId("toolPage");
                var sideExpanded = toolPage.getSideExpanded();
                //this._setToggleButtonTooltip(sideExpanded);
                toolPage.setSideExpanded(!toolPage.getSideExpanded());
            },
            changeTheme: function (oEvent) {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: " Wait ..."
                });
                sap.ui.getCore().busyDialog.open();
                var state = oEvent.getParameter("state");
                var oCore = sap.ui.getCore();
                var sCurrentTheme = oCore.getConfiguration().getTheme();
                if (state === true) {
                    oCore.applyTheme("sap_horizon_dark");
                    sap.ui.getCore().busyDialog.close();
                    this.getOwnerComponent().getModel("themeModel").getData().state = true;
                    this.getOwnerComponent().getModel("themeModel").refresh(true);
                } else {
                    oCore.applyTheme("sap_horizon");
                    sap.ui.getCore().busyDialog.close();
                    this.getOwnerComponent().getModel("themeModel").getData().state = false;
                    this.getOwnerComponent().getModel("themeModel").refresh(true);
                }
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
                    // Only active (non-archived) companies in the upload dropdown.
                    filters: [new Filter("ARCHIVED_AT", FilterOperator.EQ, null)],
                    success: function (response) {
                        // var listPageCompany = new JSONModel({
                        //     companyArray: response.results
                        // });
                        var listPageCompany = new JSONModel();
                        listPageCompany.setSizeLimit(response.results.length);
                        listPageCompany.setData({
                             companyArray: response.results
                        })
                        this.getOwnerComponent().setModel(listPageCompany, "listPageCompanyModel");
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

            },

            onCompanyChange: function (oEvent) {
                var comp_ID = parseInt(oEvent.getSource().getSelectedKey());
                // Project depends on Company: always clear any stale project pick when
                // the company changes so a project from the previous company can't linger.
                var oProjectBox = this.byId("listPageSelectProject");
                oProjectBox.setSelectedKey("");

                // Company cleared -> disable + empty the project selector and stop.
                if (!comp_ID) {
                    oProjectBox.setEnabled(false);
                    oProjectBox.setPlaceholder("Select a company first");
                    this.getOwnerComponent().setModel(new JSONModel({ projectArray: [] }), "listPageProjectModel");
                    return;
                }

                sap.ui.getCore().busyDialog.open();
                var oFilter = new Filter({
                    filters: [
                        new Filter("COMPANY_ID", FilterOperator.EQ, comp_ID),
                    ],
                });
                var DataModels = this.getOwnerComponent().getModel();
                this.oFileData = [];
                DataModels.read("/MSTR_PROJECT", {
                    filters: [oFilter, new Filter("ARCHIVED_AT", FilterOperator.EQ, null)],
                    success: function (response) {
                        sap.ui.getCore().busyDialog.close();
                                    var listPageProject = new JSONModel({
                            projectArray: response.results
                        });
                        this.getOwnerComponent().setModel(listPageProject, "listPageProjectModel");
                        // Company chosen -> the project selector is now usable.
                        oProjectBox.setEnabled(true);
                        oProjectBox.setPlaceholder("Select a project");
                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");
                    }.bind(this)
                })

            },

            onObjectMatch: function (oEvent) {
                stringArray = [];
              //  this.getView().byId("sideNavigation").setSelectedKey("uploadFile");

                // Refetch the company dropdown too, so companies created on the
                // Companies tab appear here without a full page refresh (previously
                // only projects were reloaded on navigation).
                this.call();

                // Project is company-scoped: start every visit with an empty, disabled
                // project selector so a project can't be chosen before a company (which
                // previously left the company filter unset). onCompanyChange loads and
                // enables it once a company is picked.
                this.getOwnerComponent().setModel(new JSONModel({ projectArray: [] }), "listPageProjectModel");
                var oProjectBox = this.byId("listPageSelectProject");
                if (oProjectBox) {
                    oProjectBox.setSelectedKey("");
                    oProjectBox.setEnabled(false);
                    oProjectBox.setPlaceholder("Select a company first");
                }
                var oCompanyBox = this.byId("listPageSelectProject1");
                if (oCompanyBox) { oCompanyBox.setSelectedKey(""); }
            },

            // Wires native drag/drop on the drop zone. UI5's DragDropInfo only
            // handles control-to-control drags, not files from the OS, so the
            // DOM events are used directly.
            onAfterRendering: function () {
                this._makeCardHeadersInert();
                var oZone = this.byId("dropZone");
                if (!oZone) { return; }
                var oDom = oZone.getDomRef();
                if (!oDom || oDom._craDropBound) { return; }
                oDom._craDropBound = true;

                var fnOver = function (oEvt) {
                    oEvt.preventDefault();
                    oEvt.stopPropagation();
                    oDom.classList.add("craDropZoneActive");
                };
                var fnLeave = function (oEvt) {
                    oEvt.preventDefault();
                    oEvt.stopPropagation();
                    // relatedTarget outside the zone means the pointer really left,
                    // not just crossed onto a child element.
                    if (!oDom.contains(oEvt.relatedTarget)) {
                        oDom.classList.remove("craDropZoneActive");
                    }
                };
                oDom.addEventListener("dragenter", fnOver);
                oDom.addEventListener("dragover", fnOver);
                oDom.addEventListener("dragleave", fnLeave);
                oDom.addEventListener("drop", function (oEvt) {
                    oEvt.preventDefault();
                    oEvt.stopPropagation();
                    oDom.classList.remove("craDropZoneActive");
                    this._handleDrop(oEvt);
                }.bind(this));
            },

            // A dropped directory exposes no entries through dataTransfer.files,
            // so the FileSystem API is walked instead. Falls back to plain files
            // where webkitGetAsEntry is unavailable.
            _handleDrop: function (oEvt) {
                var aItems = oEvt.dataTransfer && oEvt.dataTransfer.items;
                if (!aItems || !aItems.length) {
                    MessageToast.show("Nothing was dropped.");
                    return;
                }
                var aEntries = [];
                var bHadFiles = false;
                for (var i = 0; i < aItems.length; i++) {
                    var oEntry = aItems[i].webkitGetAsEntry && aItems[i].webkitGetAsEntry();
                    if (!oEntry) { continue; }
                    // Only folders are accepted: each customization is a folder of
                    // source. Loose files are rejected.
                    if (oEntry.isDirectory) { aEntries.push(oEntry); }
                    else { bHadFiles = true; }
                }
                if (!aEntries.length) {
                    MessageToast.show(bHadFiles
                        ? "Only folders can be uploaded -- drop a folder, not individual files."
                        : "Your browser does not support folder drops. Use Browse instead.");
                    return;
                }
                if (bHadFiles) {
                    MessageToast.show("Ignored loose files -- only folders are accepted.");
                }
                this.byId("dropZone").addStyleClass("craDropZoneBusy");
                // Wrapped in an arrow-equivalent rather than passing _readEntry
                // directly: Array.map supplies (element, index, array), so the
                // index arrived as the sRoot argument and every entry after the
                // first was named after its position (1, 2, 3...).
                Promise.all(aEntries.map(function (oEntry) {
                    return this._readEntry(oEntry);
                }.bind(this)))
                    .then(function (aNested) {
                        var aFiles = aNested.reduce(function (a, b) { return a.concat(b); }, []);
                        this.byId("dropZone").removeStyleClass("craDropZoneBusy");
                        if (!aFiles.length) {
                            MessageToast.show("No readable files in the dropped folders.");
                            return;
                        }
                        this._ingestFiles(aFiles);
                    }.bind(this))
                    .catch(function (oErr) {
                        this.byId("dropZone").removeStyleClass("craDropZoneBusy");
                        console.log("E-DROP-" + (oErr && oErr.message));
                        MessageToast.show("Could not read the dropped folders.");
                    }.bind(this));
            },

            // Recursively collects File objects, stamping each with the top-level
            // folder name so _processFiles groups them exactly as it does for the
            // FileUploader path.
            _readEntry: function (oEntry, sRoot) {
                var sTop = sRoot || oEntry.name;
                if (oEntry.isFile) {
                    return new Promise(function (resolve, reject) {
                        oEntry.file(function (oFile) {
                            oFile._craRoot = sTop;
                            resolve([oFile]);
                        }, reject);
                    });
                }
                if (oEntry.isDirectory) {
                    var oReader = oEntry.createReader();
                    var aAll = [];
                    var readBatch = function () {
                        return new Promise(function (resolve, reject) {
                            // readEntries returns at most 100 per call, so it must be
                            // drained in a loop until it yields an empty batch.
                            oReader.readEntries(function (aBatch) {
                                if (!aBatch.length) { resolve(aAll); return; }
                                aAll = aAll.concat(aBatch);
                                resolve(readBatch());
                            }, reject);
                        });
                    };
                    return readBatch().then(function (aChildren) {
                        return Promise.all(aChildren.map(function (oChild) {
                            return this._readEntry(oChild, sTop);
                        }.bind(this))).then(function (aNested) {
                            return aNested.reduce(function (a, b) { return a.concat(b); }, []);
                        });
                    }.bind(this));
                }
                return Promise.resolve([]);
            },

            // sap.f.cards.Header renders focusable with a widget role even when
            // no press handler is attached, so keyboard users tab onto a dead
            // stop. Strip the affordances from the DOM; CSS handles the visuals.
            _makeCardHeadersInert: function () {
                var oView = this.getView();
                if (!oView || !oView.getDomRef()) { return; }
                var aHeaders = oView.getDomRef().querySelectorAll(".sapFCardHeader");
                Array.prototype.forEach.call(aHeaders, function (oNode) {
                    oNode.removeAttribute("tabindex");
                    oNode.removeAttribute("role");
                    oNode.removeAttribute("aria-roledescription");
                });
            },

            // Resolves the grouping name for one file, in priority order:
            // the drop-walk root, the first segment of webkitRelativePath, the
            // file name without extension. Never returns an empty string -- a
            // blank key is what collapsed every file into one unnamed group.
            _folderNameFor: function (oFile) {
                if (oFile._craRoot) { return oFile._craRoot; }
                var sPath = oFile.webkitRelativePath || "";
                var aSegments = sPath.split('/').filter(Boolean);
                if (aSegments.length > 1) { return aSegments[0]; }
                var sName = oFile.name || "";
                return sName.replace(/\.[^.]+$/, "") || "Unnamed";
            },

            // Shared tail of both intake paths: read every file as text, then hand
            // off to _processFiles. Counts settled reads rather than successful
            // ones so a single unreadable file cannot stall the whole batch.
            _ingestFiles: function (aFiles) {
                var that = this;
                this.oFileData = [];
                var iTotal = aFiles.length;
                var fnSettle = function (oFile, sContent) {
                    // Keep the real leaf filename (not the folder) so the analysis can
                    // list which files it covered. Names only -- never the content.
                    var sLeaf = (oFile.webkitRelativePath || oFile.name || "").split('/').filter(Boolean).pop() || (oFile.name || "");
                    that.oFileData.push({
                        webkitRelativePath: that._folderNameFor(oFile),
                        fileName: sLeaf,
                        fileContent: sContent
                    });
                    if (that.oFileData.length === iTotal) { that._processFiles(); }
                };
                aFiles.forEach(function (oFile) {
                    var oReader = new FileReader();
                    oReader.onload = function (e) { fnSettle(oFile, e.target.result); };
                    oReader.onerror = function () { fnSettle(oFile, ""); };
                    oReader.readAsText(oFile);
                });
            },

            // Both intake paths now share _ingestFiles. The old inline reader
            // derived the folder from webkitRelativePath.split('/')[0], which is
            // "" for files picked without a directory -- every such file then
            // grouped under one blank key and the list showed FileList indices
            // (1, 2, 3...) instead of names.
            onFileChange1: function (oEvent) {
                var oFileList = oEvent.getParameter("files");
                var aFiles = oFileList ? Array.prototype.slice.call(oFileList) : [];
                if (!aFiles.length) {
                    MessageToast.show("Please upload valid text files.");
                    return;
                }
                this._ingestFiles(aFiles);
            },
            _processFiles: function () {
                var groupedFiles = {};
                var result = [];

                this.oFileData.forEach(function (obj) {
                    var folder = obj.webkitRelativePath;
                    if (!groupedFiles[folder]) {
                        groupedFiles[folder] = {
                            webkitRelativePath: folder,
                            content: obj.fileContent,
                            size: obj.fileContent.length,
                            files: obj.fileName ? [obj.fileName] : []
                        };
                    } else {
                        groupedFiles[folder].content += "\n" + obj.fileContent;
                        if (obj.fileName) { groupedFiles[folder].files.push(obj.fileName); }
                    }
                });

                for (var folder in groupedFiles) {
                    result.push(groupedFiles[folder]);
                }

                var oFolders = this.getOwnerComponent().getModel("foldersModel");
                if (!oFolders) {
                    oFolders = new JSONModel();
                    oFolders.setData({ folderArray: [] });
                    this.getOwnerComponent().setModel(oFolders, "foldersModel");
                }
                // Append every folder, not just result[0]. Dropping or browsing a
                // multi-folder selection previously kept only the first one.
                var aExisting = oFolders.getData().folderArray;
                result.forEach(function (oNew) {
                    var iAt = aExisting.findIndex(function (oOld) {
                        return oOld.webkitRelativePath === oNew.webkitRelativePath;
                    });
                    if (iAt === -1) { aExisting.push(oNew); } else { aExisting[iAt] = oNew; }
                });
                oFolders.setSizeLimit(Math.max(100, aExisting.length));
                oFolders.refresh(true);
                this.byId("fileUploader2").setValue("");
            },
            handleUploadPress2: function(){
                var listPageSelectedProject = this.byId("listPageSelectProject").getSelectedKey();
                if (listPageSelectedProject === "") {
                    MessageBox.information("Please Select Project!");
                    return;
                }
                if (!this.getOwnerComponent().getModel("foldersModel")) {
                    MessageBox.information("Please Upload Folders!");
                    return;
                } else if (this.getOwnerComponent().getModel("foldersModel").getData().folderArray.length === 0) {
                    MessageBox.information("Please Select Folders!");
                    return;
                }
                var selectedCompanyId = this.byId("listPageSelectProject").getSelectedItem().getBindingContext("listPageProjectModel").getObject()
                if(selectedCompanyId.SkillSet_ID === null){
                    MessageBox.information("Skillset is not defined for selected project, kindly assign skillset first on project tab by editing and assigning skillset to project!");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait a few seconds..."
                });
                sap.ui.getCore().busyDialog.open();
                var count = 0;
                var DataModel = this.getOwnerComponent().getModel();
                var check = this.getOwnerComponent().getModel("foldersModel").getData().folderArray
                var that = this;
                var Model = this.getOwnerComponent().getModel()
                var oModelBox = this.byId("listPageSelectModel");
                var sSelectedModel = oModelBox ? oModelBox.getSelectedKey() : "";
                this.getBearerToken().then(() => {
                    for (var i = 0; i < check.length; i++) {
                        var payload = {
                            "ObjectName": check[i].webkitRelativePath,
                            "ObjectContent": check[i].content,
                            "SourceFiles": (check[i].files || []).join(', '),
                            "PROJECT_ID": parseInt(listPageSelectedProject),
                            "PROJECT_COMPANY_ID": parseInt(selectedCompanyId.COMPANY_ID),
                            "Skillset":selectedCompanyId.SkillSet_ID != null ? parseInt(selectedCompanyId.SkillSet_ID) : 0,
                            "model": sSelectedModel || "anthropic--claude-4.8-opus"
                        };
                        Model.create("/UploadObject", payload,{
                            success: function (response) { 
                                count++;
                                if (check.length === count) {
                                    sap.ui.getCore().busyDialog.close();
                                    that.byId("fileUploader2").setValue("");
                                    that.getView().getModel("foldersModel").getData().folderArray = [];
                                    that.getView().getModel("foldersModel").refresh(true);
                                    check = [];
                                    stringArray = [];
                                    MessageBox.success("Files Uploaded Successfully");
                                }
                               
                            }.bind(this),
                            error: function (error) { 
                                count++;
                                if (check.length === count) {
                                    sap.ui.getCore().busyDialog.close();
                                    that.byId("fileUploader2").setValue("");
                                    that.getView().getModel("foldersModel").getData().folderArray = [];
                                    that.getView().getModel("foldersModel").refresh(true);
                                    check = [];
                                    stringArray = [];
                                    if(JSON.parse(error.responseText).error.code === "500"){
                                        MessageBox.error("We are experiencing server issue. Please try again. If the issue persists, please contact support.");
                                    }else{
                                        MessageBox.error(JSON.parse(error.responseText).error.message.value);
                                    }
                                    
                                }
                            
                            }.bind(this)
                        })
                    }
                })
            },
            // Live per-file upload progress dialog.
            _openUploadProgress: function () {
                var that = this;
                if (this._pUploadProgress) {
                    this._pUploadProgress.then(function (oDlg) { oDlg.open(); });
                    return;
                }
                this._pUploadProgress = sap.ui.core.Fragment.load({
                    id: this.getView().getId(),
                    name: "com.crave.coreassessv2.view.UploadProgress",
                    controller: this
                }).then(function (oDlg) {
                    that.getView().addDependent(oDlg);
                    oDlg.open();
                    return oDlg;
                });
            },
            // Minimize: hide the dialog but keep analysing in the background. The
            // header "Analysis jobs" notification tracks it while the user navigates.
            onMinimizeUpload: function () {
                if (this._pUploadProgress) {
                    this._pUploadProgress.then(function (oDlg) { oDlg.close(); });
                }
                MessageToast.show("Analysis running in the background. Track it from the header — don't reload the page.");
            },

            onCloseUploadProgress: function () {
                if (this._pUploadProgress) {
                    this._pUploadProgress.then(function (oDlg) { oDlg.close(); });
                }
                // Dismiss the finished job: clear the list and the header badge.
                var oFoldersModel = this.getOwnerComponent().getModel("foldersModel");
                if (oFoldersModel) {
                    oFoldersModel.setProperty("/running", false);
                    oFoldersModel.setProperty("/uploadDone", false);
                    oFoldersModel.setProperty("/folderArray", []);
                    oFoldersModel.refresh(true);
                }
            },
            formatUploadStatusState: function (sStatus) {
                switch (sStatus) {
                    case "Success": return "Success";
                    case "Failed": return "Error";
                    case "Uploading": return "Information";
                    case "Cancelled": return "Warning";
                    default: return "None";   // Pending
                }
            },
            formatUploadStatusIcon: function (sStatus) {
                switch (sStatus) {
                    case "Success": return "sap-icon://accept";
                    case "Failed": return "sap-icon://error";
                    case "Uploading": return "sap-icon://pending";
                    case "Cancelled": return "sap-icon://cancel";
                    default: return "sap-icon://circle-task-2";   // Pending
                }
            },

            handleUploadPress1: function () {
                // Guard against a second click while a run is in progress -- two
                // overlapping runs could both pass the duplicate check and insert the
                // same object twice (the double row seen in the table).
                var oFM = this.getOwnerComponent().getModel("foldersModel");
                if (oFM && oFM.getProperty("/running") === true) {
                    MessageToast.show("An analysis is already running.");
                    return;
                }
                // sap.ushell exists only inside a Fiori Launchpad; unguarded this
                // threw on every upload attempt outside one.
                var oUser = (sap.ushell && sap.ushell.Container)
                    ? sap.ushell.Container.getUser() : null;
                var listPageSelectedProject = this.byId("listPageSelectProject").getSelectedKey();
                if (listPageSelectedProject === "") {
                    MessageBox.information("Please Select Project!");
                    return;
                }
                if (!this.getOwnerComponent().getModel("foldersModel")) {
                    MessageBox.information("Please Upload Folders!");
                    return;
                } else if (this.getOwnerComponent().getModel("foldersModel").getData().folderArray.length === 0) {
                    MessageBox.information("Please Select Folders!");
                    return;
                }
                var selectedCompanyId = this.byId("listPageSelectProject").getSelectedItem().getBindingContext("listPageProjectModel").getObject()
                if(selectedCompanyId.SkillSet_ID === null){
                    MessageBox.information("Skillset is not defined for selected project, kindly assign skillset first on project tab by editing and assigning skillset to project!");
                    return;
                }
                var that = this;
                var oFoldersModel = this.getOwnerComponent().getModel("foldersModel");
                var check = oFoldersModel.getData().folderArray;
                var total = check.length;
                var count = 0;

                // Quota pre-check: block before any request/token spend when the
                // user has no remaining object allowance. null allowed = unlimited
                // (owner / env-admin), so skip the check for them.
                var oUM = this.getOwnerComponent().getModel("userModel");
                var iAllowed = oUM ? oUM.getProperty("/allowedObjects") : null;
                if (iAllowed !== null && iAllowed !== undefined) {
                    var iUsed = (oUM.getProperty("/uploadedObjects") || 0);
                    var iRemaining = iAllowed - iUsed;
                    if (iRemaining <= 0) {
                        MessageBox.warning(
                            "You've used your full object allowance (" + iUsed + " of " + iAllowed + "). " +
                            "Reach out to your administrator to request more before uploading again.",
                            { title: "No object allowance left" }
                        );
                        return;
                    }
                    if (total > iRemaining) {
                        MessageBox.warning(
                            "You selected " + total + " object(s) but only " + iRemaining + " remain in your allowance. " +
                            "Upload " + iRemaining + " or fewer, or ask your administrator to raise your limit.",
                            { title: "Selection exceeds your allowance" }
                        );
                        return;
                    }
                }

                // Seed per-file status. Analysis runs in the BACKGROUND (non-modal):
                // the user can navigate the app while it progresses; a header
                // notification (App.view) shows the running count and per-object status.
                check.forEach(function (f) { f.status = "Pending"; f.statusNote = ""; });
                oFoldersModel.setProperty("/running", true);
                oFoldersModel.setProperty("/uploadDone", false);
                oFoldersModel.setProperty("/cancelled", false);
                oFoldersModel.setProperty("/pendingCount", total);
                oFoldersModel.setProperty("/progressPercent", 0);
                oFoldersModel.setProperty("/progressText", "0 / " + total);
                oFoldersModel.refresh(true);
                // Show the progress dialog by default (stays on this page). The user
                // can Minimize it to keep analysing in the background while they
                // navigate -- the header "Analysis jobs" notification takes over then.
                this._openUploadProgress();

                // Update one file's status + the overall progress bar.
                var setStatus = function (idx, status, note) {
                    oFoldersModel.setProperty("/folderArray/" + idx + "/status", status);
                    if (note !== undefined) { oFoldersModel.setProperty("/folderArray/" + idx + "/statusNote", note); }
                };
                var onOneDone = function () {
                    count++;
                    oFoldersModel.setProperty("/progressPercent", Math.round((count / total) * 100));
                    oFoldersModel.setProperty("/progressText", count + " / " + total);
                    if (count === total) {
                        oFoldersModel.setProperty("/running", false);
                        oFoldersModel.setProperty("/uploadDone", true);
                        that.byId("fileUploader2").setValue("");
                        MessageToast.show("Analysis complete (" + total + " object" + (total === 1 ? "" : "s") + ").");
                    }
                };

                // No manual bearer token: the OData model call goes through the
                // approuter with the logged-in session. The old getBearerToken() hit a
                // hardcoded foreign auth server and rejected, so its .then() never ran
                // and NO upload request was ever sent.
                var oUserModel = this.getOwnerComponent().getModel("userModel");
                var sEmail = oUserModel ? (oUserModel.getProperty("/email") || oUserModel.getProperty("/username") || "") : "";
                var oModelBox = this.byId("listPageSelectModel");
                var sSelectedModel = oModelBox ? oModelBox.getSelectedKey() : "";
                var Model = this.getOwnerComponent().getModel();

                // Process objects one at a time so Cancel can skip the rest (the
                // in-flight object still finishes -- its tokens are already spent --
                // but no further analyses start, which is where the saving is).
                var processNext = function (idx) {
                    if (idx >= total) { return; }
                    if (oFoldersModel.getProperty("/cancelled")) {
                        for (var j = idx; j < total; j++) {
                            setStatus(j, "Cancelled", "Skipped to save tokens");
                        }
                        oFoldersModel.setProperty("/progressText", count + " / " + total + " (cancelled)");
                        oFoldersModel.setProperty("/running", false);
                        oFoldersModel.setProperty("/uploadDone", true);
                        that.byId("fileUploader2").setValue("");
                        return;
                    }
                    setStatus(idx, "Uploading");
                    // Objects still queued after this one; Cancel only helps while
                    // something is still waiting to start.
                    oFoldersModel.setProperty("/pendingCount", total - idx - 1);
                    var oFile = check[idx];
                    var payload = {
                        "UserEmail": sEmail,
                        "ObjectName": oFile.webkitRelativePath,
                        "ObjectContent": oFile.content,
                        // Names only of the files that made up this object (no content),
                        // so the analysis can show what it covered.
                        "SourceFiles": (oFile.files || []).join(', '),
                        "PROJECT_ID": parseInt(listPageSelectedProject),
                        "PROJECT_COMPANY_ID": parseInt(selectedCompanyId.COMPANY_ID),
                        "Skillset": selectedCompanyId.SkillSet_ID != null ? parseInt(selectedCompanyId.SkillSet_ID) : 0,
                        "model": sSelectedModel || "anthropic--claude-4.8-opus"
                    };
                    Model.create("/UploadObject", payload, {
                        success: function () {
                            setStatus(idx, "Success");
                            onOneDone();
                            processNext(idx + 1);
                        },
                        error: function (error) {
                            var sNote = "Failed";
                            try {
                                var oErr = JSON.parse(error.responseText).error;
                                sNote = (oErr.message && oErr.message.value) || oErr.message || sNote;
                            } catch (e) {
                                // Body wasn't JSON (e.g. a gateway 5xx HTML page) --
                                // map the HTTP status to a readable reason.
                                var code = error.statusCode || error.status || 0;
                                if (code === 504) { sNote = "Analysis timed out. Please retry."; }
                                else if (code === 502 || code === 503) { sNote = "Analysis service busy/unavailable. Please retry."; }
                                else if (code >= 500) { sNote = "Server error. Please retry."; }
                            }
                            setStatus(idx, "Failed", sNote);
                            onOneDone();
                            processNext(idx + 1);
                        }
                    });
                };
                processNext(0);

            },

            // Stop starting new analyses. The current in-flight object completes;
            // the rest are marked Cancelled (saves their tokens).
            onCancelUpload: function () {
                var oFoldersModel = this.getOwnerComponent().getModel("foldersModel");
                if (oFoldersModel) { oFoldersModel.setProperty("/cancelled", true); }
                MessageToast.show("Cancelling after the current object finishes...");
            },
            handleDelete: function (oEvent) {
                var sPath = oEvent.getParameter("listItem").getBindingContext("foldersModel").getPath().split('/')[2];
                this.getView().getModel("foldersModel").getData().folderArray.splice(sPath, 1);
                this.getView().getModel("foldersModel").refresh(true);

            },

            changeView: function () {
                var key = this.getView().byId("sideNavigation").getSelectedKey();

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
                    } else if (sap.User === 'INT_USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("CustomPrompt");
                    }
                } else if (key === 'config') {
                    if (sap.User === "ADMIN") {
                        this.callConfigDetail();
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("Configuration");
                    } else if (sap.User === 'USER') {
                        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteListPage");
                    } else if (sap.User === 'INT_USER') {
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
                        var companyObjects = new JSONModel({
                            objectArray: response.results
                        });
                        this.getOwnerComponent().setModel(companyObjects, "companyObjectsModel");

                    }.bind(this),
                    error: function (error) {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Try after some time! ");

                    }.bind(this)
                })
            },
            callConfigDetail: function () {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var oDataModel = this.getOwnerComponent().getModel();
                oDataModel.read("/GetConfig()", {
                    success: function (response) {
                        var configAttibute = new JSONModel({
                            config: response.GetConfig
                        });
                        this.getOwnerComponent().setModel(configAttibute, "configAttributeModel");
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show(JSON.parse(error.responseText).error.message.value);
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this)
                })
            }
        });
    });
