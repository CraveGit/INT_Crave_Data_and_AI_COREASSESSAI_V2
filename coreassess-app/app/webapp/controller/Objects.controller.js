sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    'sap/ui/export/Spreadsheet',
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    'sap/ui/model/type/String',
    'sap/m/Token',
    "sap/ui/core/Fragment",
    "sap/m/MessageBox"
],
    function (Controller, JSONModel, Spreadsheet, MessageToast, Filter, FilterOperator, TypeString, Token, Fragment, MessageBox) {
        "use strict";
        var mainSource;
        var effortValue
        return Controller.extend("com.crave.coreassessv2.controller.Objects", {
            onInit: function () {
                this._oFacetFilter = null; this._oTxtFilter = null;
                this._oSingleConditionMultiInput = this.byId("singleCondition");
                // Drives the Customization detail panel visibility; starts empty
                // so the panel is hidden until a single row is selected.
                this.getView().setModel(new JSONModel({ name: "" }), "selModel");

                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.getRoute("Objects").attachPatternMatched(this.onObjectMatch, this);

                // sap.ushell only exists inside a Fiori Launchpad. Standalone (cds
                // watch, or the approuter without FLP) it is undefined, and the
                // unguarded call threw here -- which aborted onInit, so the view
                // never rendered and navTo("Objects") appeared to do nothing.
                this.email = (sap.ushell && sap.ushell.Container)
                    ? sap.ushell.Container.getUser().getEmail()
                    : (this.getOwnerComponent().getModel("userModel")
                        ? this.getOwnerComponent().getModel("userModel").getData().Username
                        : null);
            },
            onObjectMatch: function () {
                //  this.getView().byId("sideNavigation2").setSelectedKey("projects");
                this._formFragments = {};
                this.unSelectTable();
                if (sap.User === 'ADMIN') {
                    this.byId("exportObjects").setEnabled(true);
                } else if (sap.User === 'USER') {
                    this.byId("exportObjects").setEnabled(false);
                } else if (sap.User === 'INT_USER') {
                    this.byId("ehehxportObjects").setEnabled(true);
                }
            },
            onTokenUpdate: function (oEvent) {
                effortValue = undefined
            },
            onSingleConditionValueHelpOkPress: function (oEvent) {
                var aTokens = oEvent.getParameter("tokens");
                this._oSingleConditionMultiInput.setTokens(aTokens);
                this._oSingleConditionDialog.close();
                effortValue = aTokens[0].data("range")
            },
            onSingleConditionVHRequested: function () {
                this.loadFragment({
                    name: "com.crave.coreassessv2.view.valueHelp"
                }).then(function (oSingleConditionDialog) {
                    this._oSingleConditionDialog = oSingleConditionDialog;
                    oSingleConditionDialog.setRangeKeyFields([{
                        label: "Efforts",
                        key: "Efforts",
                        type: "string",
                        typeInstance: new TypeString({}, {
                            maxLength: 7
                        })
                    }]);

                    oSingleConditionDialog.setTokens(this._oSingleConditionMultiInput.getTokens());
                    oSingleConditionDialog.open();
                }.bind(this));
            },
            onSingleConditionCancelPress: function () {
                this._oSingleConditionDialog.close();
            },
            onSingleConditionAfterClose: function () {
                this._oSingleConditionDialog.destroy();
            },
            onSearchObjects: function (oEvent) {
                var Text = oEvent.getSource().getValue();
                var oSearchFilter = new Filter({
                    filters: [
                        new Filter("OBJECT_NAME", FilterOperator.Contains, Text),
                        new Filter("SAP_MODULE_NAME", FilterOperator.Contains, Text),
                        new Filter("APPROACH", FilterOperator.Contains, Text),
                        new Filter("ADHERENCE", FilterOperator.Contains, Text),
                        new Filter("CODE_COMPLEXITY", FilterOperator.Contains, Text),
                        new Filter("TSHIRT", FilterOperator.Contains, Text),
                        new Filter("EFFORTS", FilterOperator.EQ, Text)
                    ]
                });
                this.getView().byId("abapObjectTable").getBinding("rows").filter([oSearchFilter]);
            },
            applyFilter: function () {
                // var SAP_MODULES, APPROACH, ADHERENCE, CODE_COMPLEXITY, TSHIRT;
                // SAP_MODULES = this.byId("SAP_MODULES").getSelectedKeys();
                // APPROACH = this.byId("APPROACH").getSelectedKeys();
                // ADHERENCE = this.byId("ADHERENCE").getSelectedKeys();
                // CODE_COMPLEXITY = this.byId("CODE_COMPLEXITY").getSelectedKeys();
                // TSHIRT = this.byId("TSHIRT").getSelectedKeys();

                // if (mainSource === undefined) {
                //     mainSource = this.getOwnerComponent().getModel("listObjectsModel").getData().objectList;
                // }

                // if (SAP_MODULES.length != 0 || APPROACH.length != 0 || ADHERENCE.length != 0 || CODE_COMPLEXITY.length != 0 || TSHIRT.length != 0 || effortValue != undefined) {
                //     const allFilterTerms = [...SAP_MODULES, ...APPROACH, ...ADHERENCE, ...CODE_COMPLEXITY, ...TSHIRT];
                //     var data = mainSource;
                //     const filteredData = data.filter(item => {
                //         return allFilterTerms.every(term => {
                //             return ["APPROACH", "SAP_MODULE_NAME", "ADHERENCE", "TSHIRT", "CODE_COMPLEXITY"].some(fieldName => {
                //                 const fieldValue = item[fieldName];
                //                 if (Array.isArray(fieldValue)) {
                //                     return fieldValue.some(nestedItem => {
                //                         return Object.values(nestedItem).some(nestedField => {
                //                             return nestedField &&
                //                                 nestedField.toString().toLowerCase().includes(term.toLowerCase());
                //                         });
                //                     });
                //                 }
                //                 return fieldValue &&
                //                     fieldValue.toString().toLowerCase().includes(term.toLowerCase());
                //             });
                //         });
                //     });
                //     console.log(filteredData);
                if (this.byId("abapObjectTable").getEnableGrouping() === true) {
                    var table = this.byId("abapObjectTable");
                    var oModel = this.getOwnerComponent().getModel("listObjectsModel");
                    var oBinding = table.getBinding("rows");
                    table.setEnableGrouping(false);
                    table.setGroupBy(null);
                    oBinding.sort(null);
                    this.byId("groupObjectTable").setText("Group");
                    oModel.refresh(true);
                }

                // var SAP_MODULES, APPROACH, ADHERENCE, CODE_COMPLEXITY, TSHIRT;
                // SAP_MODULES = this.byId("SAP_MODULES").getSelectedKeys();
                // APPROACH = this.byId("APPROACH").getSelectedKeys();
                // ADHERENCE = this.byId("ADHERENCE").getSelectedKeys();
                // CODE_COMPLEXITY = this.byId("CODE_COMPLEXITY").getSelectedKeys();
                // TSHIRT = this.byId("TSHIRT").getSelectedKeys();

                // if (mainSource === undefined) {
                //     mainSource = this.getOwnerComponent().getModel("listObjectsModel").getData().objectList;
                // }

                // const filters = {
                //     SAP_MODULE_NAME: SAP_MODULES,
                //     APPROACH: APPROACH,
                //     ADHERENCE: ADHERENCE,
                //     CODE_COMPLEXITY: CODE_COMPLEXITY,
                //     TSHIRT: TSHIRT,
                // };

                // if (Object.values(filters).some(keys => keys.length > 0) || effortValue != undefined) {
                //     var data = mainSource;

                //     const filteredData = data.filter(item => {
                //         return Object.entries(filters).every(([fieldName, selectedKeys]) => {
                //             if (selectedKeys.length === 0) {
                //                 return true;
                //             }
                //             const fieldValue = item[fieldName];
                //             if (Array.isArray(fieldValue)) {
                //                 return fieldValue.some(nestedItem => {
                //                     return Object.values(nestedItem).some(nestedField => {
                //                         return selectedKeys.some(key =>
                //                             nestedField &&
                //                             nestedField.toString().toLowerCase().includes(key.toLowerCase())
                //                         );
                //                     });
                //                 });
                //             }
                //             return selectedKeys.some(key =>
                //                 fieldValue &&
                //                 fieldValue.toString().toLowerCase().includes(key.toLowerCase())
                //             );
                //         });
                //     });

                //     console.log(filteredData);

                //     this.getOwnerComponent().getModel("listObjectsModel").getData().objectList = filteredData;
                //     this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                //     var oFilter;
                //     if (effortValue != undefined) {
                //         var oFilter = new sap.ui.model.Filter({
                //             filters: [
                //                 new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.BT, effortValue.value1, effortValue.value2)
                //             ],
                //             and: false
                //         });
                //         var oTable = this.getView().byId("abapObjectTable");
                //         var oBinding = oTable.getBinding("rows");
                //         oBinding.filter(oFilter);
                //     } else {
                //         this.getView().byId("abapObjectTable").getBinding("rows").filter([]);
                //     }
                // } else {
                //     this.getView().byId("abapObjectTable").getBinding("rows").filter([]);
                //     this.getOwnerComponent().getModel("listObjectsModel").getData().objectList = mainSource;
                //     this.getOwnerComponent().getModel("listObjectsModel").refresh(true);

                // }

                var oTable = this.byId("abapObjectTable");
                var oBinding = oTable.getBinding("rows");
                var aFilters = [];

                var SAP_MODULE_NAME = this.byId("SAP_MODULES").getSelectedKeys();
                if (SAP_MODULE_NAME.length) {
                    aFilters.push(new sap.ui.model.Filter(
                        SAP_MODULE_NAME.map(function (sKey) {
                            return new sap.ui.model.Filter("SAP_MODULE_NAME", sap.ui.model.FilterOperator.EQ, sKey);
                        }),
                        false
                    ));
                }

                var APPROACH = this.byId("APPROACH").getSelectedKeys();
                if (APPROACH.length) {
                    aFilters.push(new sap.ui.model.Filter(
                        APPROACH.map(function (sKey) {
                            return new sap.ui.model.Filter("APPROACH", sap.ui.model.FilterOperator.EQ, sKey);
                        }),
                        false
                    ));
                }

                var ADHERENCE = this.byId("ADHERENCE").getSelectedKeys();
                if (ADHERENCE.length) {
                    aFilters.push(new sap.ui.model.Filter(
                        ADHERENCE.map(function (sKey) {
                            return new sap.ui.model.Filter("ADHERENCE", sap.ui.model.FilterOperator.EQ, sKey);
                        }),
                        false
                    ));
                }

                var CODE_COMPLEXITY = this.byId("CODE_COMPLEXITY").getSelectedKeys();
                if (CODE_COMPLEXITY.length) {
                    aFilters.push(new sap.ui.model.Filter(
                        CODE_COMPLEXITY.map(function (sKey) {
                            return new sap.ui.model.Filter("CODE_COMPLEXITY", sap.ui.model.FilterOperator.EQ, sKey);
                        }),
                        false
                    ));
                }

                var TSHIRT = this.byId("TSHIRT").getSelectedKeys();
                if (TSHIRT.length) {
                    aFilters.push(new sap.ui.model.Filter(
                        TSHIRT.map(function (sKey) {
                            return new sap.ui.model.Filter("TSHIRT", sap.ui.model.FilterOperator.EQ, sKey);
                        }),
                        false
                    ));
                }

                if (effortValue != undefined) {

                    switch (effortValue.operation) {
                        case 'BT':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.BT, effortValue.value1, effortValue.value2);
                                }),
                                false
                            ));
                            break;

                        case 'EQ':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.EQ, effortValue.value1);
                                }),
                                false
                            ));
                            break;

                        case 'LE':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.LE, effortValue.value1);
                                }),
                                false
                            ));
                            break;

                        case 'LT':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.LT, effortValue.value1);
                                }),
                                false
                            ));
                            break;

                        case 'GT':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.GT, effortValue.value1);
                                }),
                                false
                            ));
                            break;

                        case 'GE':
                            aFilters.push(new sap.ui.model.Filter(
                                [effortValue].map(function (sKey) {
                                    return new sap.ui.model.Filter("EFFORTS", sap.ui.model.FilterOperator.GE, effortValue.value1);
                                }),
                                false
                            ));
                            break;

                        case 'Contains':
                            MessageToast.show("'Contains','IsEmpty','StartsWith','EndsWith' Filter operator are not suitable");
                            return;

                        case 'IsEmpty':
                            MessageToast.show("'Contains','IsEmpty','StartsWith','EndsWith' Filter operator are not suitable");
                            return;

                        case 'StartsWith':
                            MessageToast.show("'Contains','IsEmpty','StartsWith','EndsWith' Filter operator are not suitable");
                            return;

                        case 'EndsWith':
                            MessageToast.show("'Contains','IsEmpty','StartsWith','EndsWith' Filter operator are not suitable");
                            return;

                        default:
                            console.warn("Unsupported operation:", effortValue.operation);
                            break;
                    }
                }

                var oCombinedFilter = new sap.ui.model.Filter(aFilters, true);
                oBinding.filter(aFilters.length ? [oCombinedFilter] : []);
                // Shrink the grid to the filtered row count (capped), otherwise the
                // leftover rows render empty -- with the tag/badge templates still
                // painting coloured boxes in them.
                var iCount = (oBinding.aIndices ? oBinding.aIndices.length : oBinding.getLength()) || 0;
                oTable.setVisibleRowCount(Math.max(1, Math.min(iCount, 8)));
                this.getView().byId("title").setText("Customizations (" + iCount + ")");
            },
            resetFilter: function () {
                var that = this;
                ["SAP_MODULES", "APPROACH", "TSHIRT", "ADHERENCE", "CODE_COMPLEXITY"].forEach(id => {
                    var oCtl = that.byId(id);
                    if (oCtl) { oCtl.setSelectedKeys(null); }
                });
                // Effort filter field was removed; clear its state defensively.
                effortValue = undefined;
                this.applyFilter();
            },
            changeView: function () {
                var key = this.getView().byId("sideNavigation2").getSelectedKey()
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
            unSelectTable: function () {
                var oPanel = this.byId("selectionPanel");
                if (oPanel) { oPanel.setExpanded(false); }
                var oTable = this.byId("abapObjectTable");
                if (oTable) { oTable.clearSelection(); }
                this._setSelName("");
                // Guard: on route-match this runs before the list model is loaded.
                var oModel = this.getOwnerComponent().getModel("listObjectsModel");
                if (oModel) { oModel.refresh(true); }
            },
            // "NAME (Description)" -> NAME. Name is everything before the FIRST
            // "(" or "[", so a description that itself contains parentheses
            // (e.g. "F7892 (Manage ... (Central Finance))") no longer leaks a stray
            // ")" into the id column.
            formatFirstColumn: function (sText) {
                if (!sText) { return ""; }
                var s = String(sText);
                var idx = s.search(/[\(\[]/);
                var name = (idx >= 0 ? s.slice(0, idx) : s);
                return name.replace(/[\(\)\[\]]/g, "").trim();
            },
            // "NAME (Description)" -> Description. Uses the FIRST "(" and the LAST
            // ")" so nested parentheses inside the description are kept intact.
            formatSecondColumn: function (sText) {
                if (!sText) { return ""; }
                var s = String(sText);
                var open = s.indexOf("("), close = s.lastIndexOf(")");
                if (open >= 0 && close > open) { return s.slice(open + 1, close).trim(); }
                var ob = s.indexOf("["), cb = s.lastIndexOf("]");
                if (ob >= 0 && cb > ob) { return s.slice(ob + 1, cb).trim(); }
                return s.trim();
            },
            _getFormFragment: function (sFragmentName) {
                var pFormFragment = this._formFragments[sFragmentName],
                    oView = this.getView();

                if (!pFormFragment) {
                    pFormFragment = Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view." + sFragmentName,
                        controller: this
                    });
                    this._formFragments[sFragmentName] = pFormFragment;
                }

                return pFormFragment;
            },

            _getAiNote: function () {
                if (!this._oAiNote) {
                    var oIcon = new sap.ui.core.Icon({ src: "sap-icon://message-warning" }).addStyleClass("craAiNoteIcon");
                    var oText = new sap.m.Text({
                        text: "Recommendations are AI-generated. Validate in sandbox and ensure clean core alignment before production implementation."
                    }).addStyleClass("craAiNote");
                    this._oAiNote = new sap.m.HBox({ alignItems: "Center", items: [oIcon, oText] }).addStyleClass("craAiNoteBox");
                }
                return this._oAiNote;
            },

            _showFormFragment: function (sFragmentName) {
                var oPanel = this.byId("selectionPanel");

                oPanel.removeAllContent();
                oPanel.insertContent(this._getAiNote(), 0);
                this._getFormFragment(sFragmentName).then(function (oVBox) {
                    oPanel.addContent(oVBox);
                }.bind(this));
            },
            // Header shows the selected object's name only when exactly one row is
            // selected; blank for none or multiple.
            _setSelName: function (sName) {
                var oModel = this.getView().getModel("selModel");
                if (!oModel) {
                    oModel = new JSONModel({ name: "" });
                    this.getView().setModel(oModel, "selModel");
                }
                oModel.setProperty("/name", sName || "");
            },
            _refreshSelName: function () {
                var oTable = this.byId("abapObjectTable");
                var aSel = oTable.getSelectedIndices();
                if (!aSel.length) { this._setSelName(""); return; }
                // Latest selected (lead index) so multi-select keeps the detail
                // panel open, showing the last-picked object.
                var idx = oTable.getSelectedIndex();
                if (idx < 0) { idx = aSel[aSel.length - 1]; }
                var oCtx = oTable.getContextByIndex(idx);
                this._setSelName(oCtx ? (oCtx.getObject().OBJECT_NAME || "") : "");
            },

            // The object currently shown in the Customization detail panel (the
            // latest selected), used by Estimate/Docs which act on what's displayed.
            _getDetailObject: function () {
                var oModel = this.getOwnerComponent().getModel("selectedObjectModel");
                var oObj = oModel && oModel.getData();
                if (!oObj || !oObj.OBJECT_NAME) {
                    MessageToast.show("Select an object first");
                    return null;
                }
                return oObj;
            },

            // Load the current user's saved thumb for an analysed object so the
            // highlight survives reselecting the row / refreshing the page. Best-effort.
            _loadObjFeedback: function (sAssessmentID) {
                var oSel = this.getOwnerComponent().getModel("selectedObjectModel");
                if (oSel) { oSel.setProperty("/FB_VOTE", null); }
                var iId = parseInt(sAssessmentID, 10);
                if (!iId) { return; }
                var oDataModel = this.getOwnerComponent().getModel();
                oDataModel.callFunction("/GetFeedback", {
                    method: "GET",
                    urlParameters: { source: "ASSESSMENT", assessmentID: iId, chatID: 0 },
                    success: function (r) {
                        var d = r.GetFeedback || r;
                        if (!d || !oSel) { return; }
                        if (d.upvotes) { oSel.setProperty("/FB_VOTE", "up"); }
                        else if (d.downvotes) { oSel.setProperty("/FB_VOTE", "down"); }
                    },
                    error: function () { /* no feedback service / none yet: leave unset */ }
                });
            },

            // Thumbs up/down on the analysis. Opens a popover to collect an optional
            // comment, then submits via the unified SubmitFeedback action.
            onFeedbackThumb: function (oEvent) {
                var oObj = this._getDetailObject();
                if (!oObj) { return; }
                var bUp = oEvent.getSource().getId().indexOf("fbUpBtn") > -1;
                this._fbVote = bUp ? "up" : "down";
                this.getView().setModel(new JSONModel({
                    title: bUp ? "Marked helpful" : "Marked not helpful",
                    up: bUp ? 1 : 0, down: bUp ? 0 : 1, comment: ""
                }), "feedbackModel");
                var oBtn = oEvent.getSource();
                if (!this._pFeedback) {
                    this._pFeedback = Fragment.load({
                        id: this.getView().getId(), name: "com.crave.coreassessv2.view.FeedbackPopover", controller: this
                    }).then(function (oPop) { this.getView().addDependent(oPop); return oPop; }.bind(this));
                }
                this._pFeedback.then(function (oPop) { oPop.openBy(oBtn); });
            },
            onCancelFeedback: function () {
                this._pFeedback.then(function (oPop) { oPop.close(); });
            },
            onSubmitFeedback: function () {
                var oObj = this._getDetailObject();
                if (!oObj) { return; }
                var oFb = this.getView().getModel("feedbackModel").getData();
                var oDataModel = this.getOwnerComponent().getModel();
                var projectId = this.getOwnerComponent().getModel("dataModel").getData().projectData.ID;
                oDataModel.callFunction("/SubmitFeedback", {
                    method: "POST",
                    urlParameters: {
                        source: "ASSESSMENT",
                        assessmentID: parseInt(oObj.ID, 10) || 0,
                        projectID: parseInt(projectId, 10) || 0,
                        chatID: 0,
                        docType: "",
                        upvote: oFb.up,
                        downvote: oFb.down,
                        comment: oFb.comment || "",
                        user: ""
                    },
                    success: function () {
                        MessageToast.show("Thanks for the feedback");
                        // Highlight the chosen thumb for this object.
                        var oSel = this.getOwnerComponent().getModel("selectedObjectModel");
                        if (oSel) { oSel.setProperty("/FB_VOTE", this._fbVote); }
                        this._pFeedback.then(function (oPop) { oPop.close(); });
                    }.bind(this),
                    error: function () { MessageBox.error("Could not submit feedback"); }
                });
            },

            showData1: function (oEvent) {
                this._refreshSelName();
                if (this.byId("abapObjectTable").getSelectedIndices().length != 0) {
                    var selected = this.byId("abapObjectTable").getSelectedIndices().length;
                    var index = oEvent.getSource().getSelectedIndex()
                    var Data = oEvent.getSource().getContextByIndex(index).getObject();
                    var companyObjects = new JSONModel(
                        Data
                    );
                    this.getOwnerComponent().setModel(companyObjects, "selectedObjectModel");
                    this.byId("selectionPanel").setExpanded(true);
                    // Restore this object's saved thumb so feedback survives reselect/refresh.
                    this._loadObjFeedback(Data.ID);
                    if (Data.APPROACH.startsWith('side')) {
                        this._showFormFragment("sidebyside");
                    } else if (Data.APPROACH.startsWith('retire')) {
                        this._showFormFragment("retire");
                    } else if (Data.APPROACH.startsWith('hybrid')) {
                        this._showFormFragment("hybrid");
                    } else {
                        this._showFormFragment("onStack");
                    }

                } else {

                }
            },
            showData: function (oEvent) {
                if (this.byId("abapObjectTable").getSelectedIndices().length != 0) {
                    var selected = this.byId("abapObjectTable").getSelectedIndices().length;
                    var index = oEvent.getSource().getSelectedIndex()
                    var Data = oEvent.getSource().getContextByIndex(index).getObject();
                    // var isInterfacePresent = Data.WRICEF_OBJECT_TYPE.some(
                    //     item => item.WRICEF_OBJECT_TYPE.toLowerCase() === 'interface'
                    // );
                    // ["interfaceFieldGrp", "interfaceFieldGrp1", "interfaceFieldGrp2"].forEach(id => {
                    //     this.byId(id).setVisible(isInterfacePresent);
                    // });

                    var companyObjects = new JSONModel(
                        Data
                    );
                    this.getOwnerComponent().setModel(companyObjects, "selectedObjectModel");
                    this.byId("selectionPanel").setExpanded(true);
                    var oView = this.getView();
                    oView.byId("idUseCase").setVisible(true);
                    oView.byId("containerLayoutUseCaseArea").setVisible(true);
                    oView.byId("containerLayout2").setVisible(true);
                    // oView.byId("containerLayout3").setVisible(true);
                    oView.byId("containerLayout4").setVisible(true);
                    oView.byId("idSQLAnalsis").setVisible(true);
                    oView.byId("containerLayout5").setVisible(true);
                    oView.byId("containerLayout6").setVisible(true);
                    oView.byId("containerLayout7").setVisible(true);
                    oView.byId("containerLayoutAutorizationCheck").setVisible(true);
                    oView.byId("IdIntegrationAnalysis").setVisible(true);
                    oView.byId("containerLayout8").setVisible(true);
                    oView.byId("containerLayout10").setVisible(true);
                    oView.byId("idOnstack").setVisible(false);
                    oView.byId("containerLayout13").setVisible(false);
                    oView.byId("idSqlAnalysis").setVisible(false);
                    oView.byId("containerLayout14").setVisible(false);
                    oView.byId("containerLayout15").setVisible(false);
                    oView.byId("containerLayout16").setVisible(false);

                    oView.byId("idonStack").setVisible(true);
                    oView.byId("containerLayout17").setVisible(true);
                    oView.byId("containerLayout18").setVisible(true);
                    oView.byId("containerLayout80").setVisible(true);
                    oView.byId("containerLayout81").setVisible(true);
                    oView.byId("idSqlAnalysisonSatck").setVisible(true);
                    oView.byId("containerLayout19").setVisible(true);
                    oView.byId("containerLayout20").setVisible(true);
                    oView.byId("containerLayout21").setVisible(true);
                    oView.byId("containerLayout22").setVisible(true);

                    // oView.byId("idSideBySide").setVisible(true);
                    // oView.byId("idUseCase").setVisible(true);
                    // oView.byId("idFlexBoxUsecase").setVisible(true);
                    // oView.byId("idSQLAnalysis").setVisible(true);
                    // oView.byId("idFlexBox1SQLAnalysis").setVisible(true);
                    // oView.byId("idIntegrationanalysis").setVisible(true);
                    // oView.byId("idFlexBox1Integrationanalysis").setVisible(true);

                    // oView.byId("idOnstack").setVisible(true);
                    // oView.byId("idSQL1Analysis").setVisible(true);
                    // oView.byId("idFlexBoxOnstackHeader").setVisible(true);
                    // oView.byId("idFlexBox1OnstackHeader").setVisible(true);
                    if (Data.APPROACH.startsWith('side')) {
                        oView.byId("idUseCase").setVisible(true);
                        oView.byId("containerLayoutUseCaseArea").setVisible(true);
                        oView.byId("containerLayout2").setVisible(true);
                        // oView.byId("containerLayout3").setVisible(true);
                        oView.byId("containerLayout4").setVisible(true);
                        oView.byId("idSQLAnalsis").setVisible(true);
                        oView.byId("containerLayout5").setVisible(true);
                        oView.byId("containerLayout6").setVisible(true);
                        oView.byId("containerLayout7").setVisible(true);
                        oView.byId("containerLayoutAutorizationCheck").setVisible(true);
                        oView.byId("IdIntegrationAnalysis").setVisible(true);
                        oView.byId("containerLayout8").setVisible(true);
                        oView.byId("containerLayout10").setVisible(true);
                        oView.byId("idOnstack").setVisible(false);
                        oView.byId("containerLayout13").setVisible(false);
                        oView.byId("idSqlAnalysis").setVisible(false);
                        oView.byId("containerLayout14").setVisible(false);
                        oView.byId("containerLayout15").setVisible(false);
                        oView.byId("containerLayout16").setVisible(false);

                        oView.byId("idonStack").setVisible(false);
                        oView.byId("containerLayout17").setVisible(false);
                        oView.byId("containerLayout18").setVisible(false);
                        oView.byId("idSqlAnalysisonSatck").setVisible(false);
                        oView.byId("containerLayout19").setVisible(false);
                        oView.byId("containerLayout20").setVisible(false);
                        oView.byId("containerLayout21").setVisible(false);
                        oView.byId("containerLayout22").setVisible(false);

                    } else {

                        oView.byId("containerLayout17").setVisible(true);
                        oView.byId("containerLayout18").setVisible(true);
                        oView.byId("idSqlAnalysisonSatck").setVisible(true);
                        oView.byId("containerLayout19").setVisible(true);
                        oView.byId("containerLayout20").setVisible(true);
                        oView.byId("containerLayout21").setVisible(true);
                        oView.byId("containerLayout22").setVisible(true);
                        oView.byId("idonStack").setVisible(true);


                        oView.byId("idSideBySide").setVisible(false);
                        oView.byId("idUseCase").setVisible(false);
                        oView.byId("containerLayoutUseCaseArea").setVisible(false);
                        oView.byId("containerLayout2").setVisible(false);
                        // oView.byId("containerLayout3").setVisible(false);
                        oView.byId("containerLayout4").setVisible(false);
                        oView.byId("idSQLAnalsis").setVisible(false);
                        oView.byId("containerLayout5").setVisible(false);
                        oView.byId("containerLayout6").setVisible(false);
                        oView.byId("containerLayout7").setVisible(false);
                        oView.byId("containerLayoutAutorizationCheck").setVisible(false);
                        oView.byId("IdIntegrationAnalysis").setVisible(false);
                        oView.byId("containerLayout8").setVisible(false);
                        oView.byId("containerLayout10").setVisible(false);
                        oView.byId("idOnstack").setVisible(false);
                        oView.byId("containerLayout13").setVisible(false);
                        oView.byId("idSqlAnalysis").setVisible(false);
                        oView.byId("containerLayout14").setVisible(false);
                        oView.byId("containerLayout15").setVisible(false);
                        oView.byId("containerLayout16").setVisible(false);

                    }
                    if (Data.APPROACH.startsWith('retire')) {
                        oView.byId("containerLayout80").setVisible(true);
                        oView.byId("containerLayout81").setVisible(true);
                    } else {
                        oView.byId("containerLayout80").setVisible(false);
                        oView.byId("containerLayout81").setVisible(false);
                    }
                    var isIntegrationPresent = Data.USE_CASE_AREA.some(
                        item => item.USE_CASE_AREA.toLowerCase() === "integration"
                    );
                    var isInterfacePresent = Data.WRICEF_OBJECT_TYPE.some(
                        item => item.WRICEF_OBJECT_TYPE.toLowerCase() === 'interface'
                    );
                    if (isIntegrationPresent || isInterfacePresent) {
                        oView.byId("idIntegrationanalysis").setVisible(true);
                        oView.byId("idFlexBox1Integrationanalysis").setVisible(true);
                        // oView.byId("idInterfaceCase2").setVisible(true);
                    } else {
                        oView.byId("idIntegrationanalysis").setVisible(false);
                        oView.byId("idFlexBox1Integrationanalysis").setVisible(false);
                        oView.byId("idInterfaceCase2").setVisible(true);
                    }
                }

            },
            formatHeader: function (sHeader) {
                if (sHeader != null) {
                    return sHeader.toUpperCase();
                }
            },
            UseCaseCheck: function (useArea, useArea1) {
                if (useArea === "Application Development" || useArea === "Automation") {
                    return true;
                } else if (useArea1 === "Application Development" || useArea1 === "Automation") {
                    return true;
                } else {
                    return false;
                }
            },
            onBTPAUTHMETRIC: function (BlockRequired, Metric) {
                if (BlockRequired && Metric) {
                    return BlockRequired + " - " + Metric;
                }
                return "";

            },
            UseCaseAreCheck: function (useArea, useArea1) {
                if (useArea && !useArea1) {
                    return useArea;
                }
                if (!useArea && useArea1) {
                    return useArea1;
                }
                if (useArea && useArea1) {
                    return useArea + "," + useArea1;
                }
            },

            // Criticality state for ObjectStatus. Keyword-matched and case-
            // insensitive so it tolerates the varied strings the analysis returns;
            // anything unrecognised stays neutral (None) rather than mis-coloured.
            // Clean Core tier badge colour: A green, B blue, C amber, D red.
            // InfoLabel colorScheme 1-9 (8 green, 6 blue, 3 amber, 1 red).
            formatTierScheme: function (sVal) {
                switch (String(sVal || "").toUpperCase()) {
                    case "A": return 8;
                    case "B": return 6;
                    case "C": return 3;
                    case "D": return 1;
                    default:  return 7;
                }
            },

            formatAdherenceState: function (sVal) {
                var s = String(sVal || "").toLowerCase();
                if (/non[-\s]?compl|deviat|breach|violat|not\s|fail/.test(s)) { return "Error"; }
                if (/partial|toler|medium|moderate|review/.test(s)) { return "Warning"; }
                if (/compl|adher|clean|pass|full|yes/.test(s)) { return "Success"; }
                return "None";
            },

            // Line (outline) icon per adherence state; the ObjectStatus colours the
            // icon + text, so there is no filled tag.
            formatAdherenceIcon: function (sVal) {
                switch (this.formatAdherenceState(sVal)) {
                    case "Success": return "sap-icon://accept";
                    case "Warning": return "sap-icon://alert";
                    case "Error":   return "sap-icon://decline";
                    default:         return "sap-icon://circle-task";
                }
            },

            formatComplexityState: function (sVal) {
                var s = String(sVal || "").toLowerCase();
                if (/high|complex|very/.test(s)) { return "Error"; }
                if (/med|moderate/.test(s)) { return "Warning"; }
                if (/low|simple|basic/.test(s)) { return "Success"; }
                return "None";
            },

            // Cap the grid table height: show at most MAX rows, the rest scroll
            // inside the table. (Binding to the raw length let it grow unbounded,
            // pushing the page to scroll under the sticky header.)
            // Inline "<b>Title</b>: Description" for FormattedText bullets, so the
            // label and content stay on the same wrapping line. Values are HTML-
            // escaped; only our own <b> is markup.
            formatBulletHtml: function (title, desc) {
                // Older assessments stored a nested description as the literal string
                // "[object Object]" (fixed at source now); hide that for existing rows.
                var clean = function (s) { return String(s || "") === "[object Object]" ? "" : s; };
                var esc = function (s) {
                    return String(s == null ? "" : s)
                        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                };
                var t = esc(clean(title)).trim(), d = esc(clean(desc)).trim();
                // sap.m.FormattedText's sanitizer whitelists <strong>/<em> but
                // NOT <b>/<i> (those get dropped with their content).
                if (!t) { return d; }
                // No trailing ": " when there is no description (e.g. legacy rows
                // whose description was lost before the fix).
                return d ? ("<strong>" + t + "</strong>: " + d) : ("<strong>" + t + "</strong>");
            },

            // Render a step-by-step string (e.g. Reimplementation) as a bulleted list,
            // one step per line — same visual family as the Clean Core / S4 bullet lists.
            // Backward compatible: new data is newline-separated; older data used " -> "
            // arrows or a "1. .. 2. .." numbered paragraph, so we split on whichever we find.
            formatStepsHtml: function (text) {
                var raw = String(text == null ? "" : text).trim();
                if (!raw) { return ""; }
                var parts;
                if (/\r|\n/.test(raw)) {
                    parts = raw.split(/\r?\n+/);
                } else if (/\s(?:->|→|=>)\s/.test(raw)) {
                    parts = raw.split(/\s(?:->|→|=>)\s/);
                } else if (/\d+[\.\)]\s/.test(raw)) {
                    parts = raw.split(/\s*(?=\d+[\.\)]\s)/);
                } else {
                    parts = [raw];
                }
                var esc = function (s) {
                    return String(s == null ? "" : s)
                        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                };
                var items = parts.map(function (p) {
                    // strip any leading numbering / bullet markers left in the text
                    var step = String(p).replace(/^\s*(?:\d+[\.\)]|[-•*])\s*/, "").trim();
                    if (!step) { return ""; }
                    // bold the "label:" prefix when present, mirroring the other bullets
                    var m = step.match(/^([^:]{2,40}):\s*(.+)$/);
                    return m
                        ? "<li><strong>" + esc(m[1].trim()) + "</strong>: " + esc(m[2].trim()) + "</li>"
                        : "<li>" + esc(step) + "</li>";
                }).filter(Boolean);
                return items.length ? ("<ul class=\"craStepsList\">" + items.join("") + "</ul>") : "";
            },

            // "SOURCE -> TARGET" for the BAPI->API and Table->CDS mapping tables.
            // Falls back to whichever side is present when one is missing.
            formatMapping: function (source, target) {
                var s = source == null ? "" : String(source).trim();
                var t = target == null ? "" : String(target).trim();
                if (s && t) { return s + " → " + t; }
                return s || t;
            },

            // Integration flags: show "Yes" when set, "None" otherwise (source is an
            // inconsistent mix of true/"true"/"True"/false/empty).
            formatYesNone: function (v) {
                if (v === true || v === "true" || v === "True" || v === "X" || v === "x" || v === 1 || v === "1") {
                    return "Yes";
                }
                return "None";
            },

            // Show the Integration Analysis section only on real integration signal:
            // a Third-Party or UI integration flag set, OR the object tagged with an
            // "integration" use-case / "interface" WRICEF type. Inter-module is
            // deliberately excluded (non-determinable from the analysis). Hidden otherwise.
            showIntegrationSection: function (aUseCase, aWricef, vThirdParty, vUi) {
                var truthy = function (v) {
                    return v === true || v === "true" || v === "True" || v === "X" ||
                        v === "x" || v === 1 || v === "1" || v === "Yes";
                };
                if (truthy(vThirdParty) || truthy(vUi)) { return true; }
                var hasTag = function (aArr, sKey, sWant) {
                    return Array.isArray(aArr) && aArr.some(function (o) {
                        return o && String(o[sKey] || "").trim().toLowerCase() === sWant;
                    });
                };
                return hasTag(aUseCase, "USE_CASE_AREA", "integration") ||
                    hasTag(aWricef, "WRICEF_OBJECT_TYPE", "interface");
            },

            // "20hrs/3PD" -- person-days are hours / HOURS_PER_DAY(8), ceiled.
            formatEffortPD: function (hrs) {
                var h = parseInt(hrs, 10);
                if (!h || h < 0) { return "Not Applicable"; }
                return h + "hrs/" + Math.ceil(h / 8) + "PD";
            },

            formatVisibleRows: function (aList) {
                var MAX = 8;
                var n = (aList && aList.length) || 1;
                return n < 1 ? 1 : (n > MAX ? MAX : n);
            },

            // InfoLabel colour scheme (1-10) for the t-shirt tag: larger sizes get
            // warmer schemes so the size reads at a glance.
            formatTshirtScheme: function (sVal) {
                var s = String(sVal || "").trim().toUpperCase();
                var map = { XS: 5, S: 6, M: 7, L: 8, XL: 2, XXL: 1 };
                return map[s] || 9;
            },

            onExportPress: function () {
                // Preferred: a styled ExcelJS workbook built from the live analysis model
                // (see createColumnConfig) — section-coloured header, frozen header row,
                // auto-filter, borders and zebra striping. Falls back to the plain
                // sap.ui.export sheet (onExportPress1) if ExcelJS can't be loaded (offline).
                var that = this;
                if (typeof ExcelJS !== "undefined") { this.onExportExcelJS(); return; }
                this._loadExcelJS()
                    .then(function () { that.onExportExcelJS(); })
                    .catch(function () {
                        MessageToast.show("Styled export unavailable — exporting a plain sheet.");
                        that.onExportPress1();
                    });
            },
            // Load ExcelJS (UMD) from CDN. UI5 exposes a global AMD `define`, so ExcelJS
            // would register as an anonymous module and never set window.ExcelJS. Hide
            // define.amd while the script evaluates so the UMD wrapper falls back to the
            // browser-global branch, then restore it.
            _loadExcelJS: function () {
                return new Promise(function (resolve, reject) {
                    if (typeof ExcelJS !== "undefined") { resolve(); return; }
                    var oDefine = window.define;
                    var oAmd = oDefine && oDefine.amd;
                    if (oAmd) { oDefine.amd = undefined; }
                    var fnRestore = function () { if (oAmd && oDefine) { oDefine.amd = oAmd; } };
                    var oScript = document.createElement("script");
                    oScript.src = "https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js";
                    oScript.async = true;
                    oScript.onload = function () {
                        fnRestore();
                        if (typeof ExcelJS !== "undefined") { resolve(); }
                        else { reject(new Error("ExcelJS not defined after load")); }
                    };
                    oScript.onerror = function () {
                        fnRestore();
                        reject(new Error("ExcelJS failed to load"));
                    };
                    document.head.appendChild(oScript);
                });
            },
            // Colour band per column section, keyed by the `section` in createColumnConfig.
            // Approach-wise export layout: a merged, coloured banner groups columns into
            // sections (Overview + SQL/Integration/Security are always shown; SIDE-BY-SIDE
            // / ON-STACK / RETIRE columns are filled only for rows of that approach).
            _exportSections: function () {
                return [
                    { key: "overview", title: "Overview", banner: "FFE29BDC", always: true, cols: [
                        { label: "Object Name", property: "OBJECT_NAME", width: 24 },
                        { label: "Approach", property: "APPROACH", width: 14 },
                        { label: "SAP Module", property: "SAP_MODULE_NAME", width: 22 },
                        { label: "SAP Sub Module", property: "SAP_SUB_MODULE", width: 22 },
                        { label: "WRICEF Object Type", property: "WRICEF_OBJECT_TYPE", width: 20 },
                        { label: "Clean Core Adherence", property: "ADHERENCE", width: 16 },
                        { label: "Current Clean Core Tier", property: "CLEANCORE_TIER_DISPLAY", width: 14 },
                        { label: "Current Tier Reason", property: "CLEANCORE_TIER_REASON", width: 60 },
                        { label: "Target Clean Core Tier", property: "CLEANCORE_TARGET_TIER_DISPLAY", width: 14 },
                        { label: "Target Tier Reason", property: "CLEANCORE_TARGET_TIER_REASON", width: 60 },
                        { label: "Code Complexity", property: "CODE_COMPLEXITY", width: 14 },
                        { label: "Coupling", property: "COUPLING", width: 12 },
                        { label: "CRUD Operations", property: "READ_CRUD", width: 16 },
                        { label: "Priority", property: "PRIORITY", width: 12 },
                        { label: "T-Shirt Size", property: "TSHIRT", width: 12 },
                        { label: "Effort", property: "EFFORT_DISPLAY", width: 14 },
                        { label: "Code Length", property: "CODELENGTH", width: 12 },
                        { label: "Code Quality Score", property: "CODEQUALITYSCORE", width: 14 },
                        { label: "Functional Analysis", property: "FUNCTIONAL_ANALYSIS", width: 70 },
                        { label: "Clean Core Analysis", property: "CLEAN_CORE_ANALYSIS", width: 70 }
                    ]},
                    { key: "sbs", title: "SIDE-BY-SIDE / HYBRID", banner: "FF6FA8DC", approaches: ["side-by-side", "hybrid"], cols: [
                        { label: "Use Case Area", property: "USE_CASE_AREA", width: 40 },
                        { label: "Use Case Description", property: "USE_CASE_AREA_EXPLANATION", width: 70 },
                        { label: "Development Approach", property: "DEVELOPMENTAPPROACH", width: 40 },
                        { label: "High Level S/4 Analysis", property: "HIGH_LVL_RECOMMENDATIONS", width: 70 },
                        { label: "Recommended SAP Standard API", property: "SAP_STANDARD_API", width: 40 },
                        { label: "Recommended BTP Services", property: "BTP_SERVICES", width: 70 }
                    ]},
                    { key: "onstack", title: "ON-STACK / HYBRID", banner: "FF93C47D", approaches: ["on-stack", "hybrid"], cols: [
                        { label: "High Level S/4 Analysis", property: "HIGH_LVL_RECOMMENDATIONS", width: 70 },
                        { label: "Recommended SAP Standard API", property: "SAP_STANDARD_API", width: 40 },
                        { label: "Recommended Fiori Apps", property: "SAP_STANDARD_FIORI_APP", width: 40 }
                    ]},
                    { key: "retire", title: "RETIRE", banner: "FFD5A863", approaches: ["retire"], cols: [
                        { label: "High Level S/4 Analysis", property: "HIGH_LVL_RECOMMENDATIONS", width: 70 },
                        { label: "Retire Explanation", property: "RETIRE_EXPLAINATION", width: 70 },
                        { label: "Re-Implementation", property: "REIMPLEMENTATION", width: 50 },
                        { label: "Recommended SAP Standard API", property: "SAP_STANDARD_API", width: 40 },
                        { label: "Recommended Fiori Apps", property: "SAP_STANDARD_FIORI_APP", width: 40 }
                    ]},
                    { key: "sql", title: "SQL Analysis", banner: "FFFFD54F", always: true, cols: [
                        { label: "SQL Recommendation", property: "SQL_RECOMMENDATION", width: 70 },
                        { label: "Standard Tables", property: "STANDARD_TABLES", width: 70 },
                        { label: "Recommended S/4 Replacements", property: "NEW_S4_TABLES", width: 70 },
                        { label: "Custom Tables", property: "CUSTOM_TABLES", width: 40 },
                        { label: "Function Modules", property: "FUNCTION_MODULES", width: 70 },
                        { label: "CDS Views", property: "SQL_ANALYSIS_TABLES_CDS", width: 40 }
                    ]},
                    { key: "integration", title: "Integration Analysis", banner: "FFB6DC7A", always: true, cols: [
                        { label: "Third-Party Integration", property: "THIRD_PARTY_INTEGRATION", width: 14 },
                        { label: "UI Integration", property: "UI_INTEGRATION", width: 14 },
                        { label: "Integration Specific", property: "INTEGERATION_RESULT", width: 70 },
                        { label: "Integration Modernization", property: "INTEGRATION_MODERNIZATION", width: 70 },
                        { label: "BAPIs Utilized", property: "BAPIS", width: 40 },
                        { label: "BAPI to API Replacements", property: "BAPI_API_MAP", width: 50 },
                        { label: "SAP APIs Utilized", property: "SQL_ANALYSIS_TABLES_API", width: 40 },
                        { label: "IDocs Utilized", property: "INTERFACE_IDOCS", width: 40 },
                        { label: "Standard Business Events", property: "STANDARD_EVENTS", width: 40 },
                        { label: "Custom Events", property: "EVENTS", width: 40 },
                        { label: "Event Topics", property: "TOPICS", width: 40 }
                    ]},
                    { key: "security", title: "Security & Governance", banner: "FF9FC5E8", always: true, cols: [
                        { label: "Authorization Checks", property: "AUTHORIZATION_STR", width: 50 }
                    ]}
                ];
            },
            // Flatten one selected row's model object into export-ready scalar strings.
            _buildExportRows: function (aSelectedIndices) {
                var oTable = this._oTable;
                return aSelectedIndices.map(function (iIndex) {
                    var oRowData = JSON.parse(JSON.stringify(oTable.getContextByIndex(iIndex).getObject()));

                    function concatenateListItems(list, properties) {
                        return list && Array.isArray(list)
                            ? list.map(function (item) {
                                return properties.map(function (prop) { return item[prop] || ""; }).join(": ");
                            }).join(", ")
                            : "";
                    }
                    // No pricing (PRICE/CURRENCY stripped — internal-only, no grounded source).
                    // Service fields joined by " · ", services separated by "  |  " so names
                    // that contain commas stay readable.
                    oRowData.BTP_SERVICES = Array.isArray(oRowData.BTP_SERVICES)
                        ? oRowData.BTP_SERVICES.map(function (s) {
                            return [s.SERVICE_NAME, s.BLOCKS_REQUIRED, s.METRIC]
                                .filter(function (x) { return x != null && x !== ""; })
                                .join(" · ");
                        }).join("  |  ")
                        : "";
                    oRowData.WRICEF_OBJECT_TYPE = concatenateListItems(oRowData.WRICEF_OBJECT_TYPE, ["WRICEF_OBJECT_TYPE"]);
                    oRowData.HIGH_LVL_RECOMMENDATIONS = concatenateListItems(oRowData.HIGH_LVL_RECOMMENDATIONS, ["TITLE", "DESCRIPTION"]);
                    oRowData.READ_CRUD = concatenateListItems(oRowData.READ_CRUD, ["READ_CRUD"]);
                    oRowData.CLEAN_CORE_ANALYSIS = concatenateListItems(oRowData.CLEAN_CORE_ANALYSIS, ["TITLE", "DESCRIPTION"]);
                    oRowData.FUNCTION_MODULES = concatenateListItems(oRowData.FUNCTION_MODULES, ["FUNCTION_MODULES"]);
                    oRowData.INTEGERATION_RESULT = concatenateListItems(oRowData.INTEGERATION_RESULT, ["TITLE", "DESCRIPTION"]);
                    oRowData.BAPIS = concatenateListItems(oRowData.BAPIS, ["BAPIS"]);
                    oRowData.SQL_ANALYSIS_TABLES_API = concatenateListItems(oRowData.SQL_ANALYSIS_TABLES_API, ["SQL_ANALYSIS_TABLES_API"]);
                    oRowData.SQL_ANALYSIS_TABLES_CDS = concatenateListItems(oRowData.SQL_ANALYSIS_TABLES_CDS, ["SQL_ANALYSIS_TABLES_CDS"]);
                    oRowData.NEW_S4_TABLES = concatenateListItems(oRowData.NEW_S4_TABLES, ["S4_TABLES"]);
                    oRowData.CUSTOM_TABLES = concatenateListItems(oRowData.CUSTOM_TABLES, ["TABLE_NAME"]);
                    oRowData.STANDARD_TABLES = concatenateListItems(oRowData.STANDARD_TABLES, ["TABLE_NAME"]);
                    oRowData.INTERFACE_IDOCS = concatenateListItems(oRowData.INTERFACE_IDOCS, ["IDOCS"]);
                    oRowData.USE_CASE_AREA = concatenateListItems(oRowData.USE_CASE_AREA, ["USE_CASE_AREA"]);
                    oRowData.EVENTS = concatenateListItems(oRowData.EVENTS, ["EVENTS"]);
                    oRowData.STANDARD_EVENTS = concatenateListItems(oRowData.STANDARD_EVENTS, ["STANDARD_EVENTS"]);
                    oRowData.TOPICS = concatenateListItems(oRowData.TOPICS, ["TOPICS"]);
                    oRowData.SAP_STANDARD_API = concatenateListItems(oRowData.SAP_STANDARD_API, ["SAP_STANDARD_API"]);
                    oRowData.SAP_STANDARD_FIORI_APP = concatenateListItems(oRowData.SAP_STANDARD_FIORI_APP, ["SAP_STANDARD_FIORI_APP"]);
                    // BAPI -> API replacements: "BAPI → API (desc)" per entry.
                    oRowData.BAPI_API_MAP = Array.isArray(oRowData.BAPI_API_RECOMMENDATIONS)
                        ? oRowData.BAPI_API_RECOMMENDATIONS.map(function (x) {
                            var m = [x.MAPPING, x.API].filter(Boolean).join(" → ");
                            return x.DESCRIPTION ? (m + " (" + x.DESCRIPTION + ")") : m;
                        }).join("  |  ")
                        : "";
                    // Authorization checks flattened for the Security section.
                    oRowData.AUTHORIZATION_STR = Array.isArray(oRowData.AUTHORIZATION_CHECK)
                        ? oRowData.AUTHORIZATION_CHECK.map(function (a) {
                            return [a.AUTHOBJECT, a.CHECKTYPE].filter(Boolean).join(" - ");
                        }).filter(Boolean).join(", ")
                        : "";

                    // Clean Core tier (current + target) + Effort, as the analysis shows them
                    oRowData.CLEANCORE_TIER_DISPLAY = oRowData.CLEANCORE_TIER ? ("Tier " + oRowData.CLEANCORE_TIER) : "";
                    oRowData.CLEANCORE_TARGET_TIER_DISPLAY = oRowData.CLEANCORE_TARGET_TIER ? ("Tier " + oRowData.CLEANCORE_TARGET_TIER) : "";
                    var _h = parseInt(oRowData.EFFORTS, 10);
                    oRowData.EFFORT_DISPLAY = (!_h || _h < 0) ? "Not Applicable" : (_h + "hrs/" + Math.ceil(_h / 8) + "PD");

                    // Integration flags -> Yes / None (source mixes true/True/false/empty)
                    function _yesNone(v) {
                        return (v === true || v === "true" || v === "True" || v === "X" || v === "x" || v === 1 || v === "1") ? "Yes" : "None";
                    }
                    oRowData.THIRD_PARTY_INTEGRATION = _yesNone(oRowData.THIRD_PARTY_INTEGRATION);
                    oRowData.UI_INTEGRATION = _yesNone(oRowData.UI_INTEGRATION);

                    return oRowData;
                });
            },
            // Styled export via ExcelJS: section-coloured header, frozen header row,
            // auto-filter, thin borders, zebra striping and per-column widths/wrapping.
            onExportExcelJS: async function () {
                if (!this._oTable) { this._oTable = this.byId('abapObjectTable'); }
                var oTable = this._oTable;
                var aSelectedIndices = oTable.getSelectedIndices();
                if (!aSelectedIndices.length) { MessageToast.show("Select object(s) to export"); return; }

                var sections = this._exportSections();
                var aRows = this._buildExportRows(aSelectedIndices);

                // Flatten sections -> ordered columns, each keeping a ref to its section.
                var cols = [];
                sections.forEach(function (s) {
                    s.cols.forEach(function (c) { cols.push({ label: c.label, property: c.property, width: c.width, section: s }); });
                });

                function _scalar(v) {
                    if (v == null) { return ""; }
                    if (Array.isArray(v)) {
                        return v.map(function (it) {
                            return (it && typeof it === "object")
                                ? Object.keys(it).map(function (k) { return it[k]; }).filter(Boolean).join(": ")
                                : it;
                        }).join(", ");
                    }
                    if (typeof v === "object") {
                        return Object.keys(v).map(function (k) { return v[k]; }).filter(Boolean).join(": ");
                    }
                    return v;
                }
                var appliesTo = function (section, approach) {
                    return section.always || (section.approaches && section.approaches.indexOf(approach) >= 0);
                };
                // Blend an ARGB colour toward white by `amt` (0..1) — used to tint the
                // label row a lighter shade of its section banner.
                var _lighten = function (argb, amt) {
                    var hex = String(argb || "FFCCCCCC").slice(-6);
                    var toHex = function (n) { return ("0" + Math.round(n).toString(16)).slice(-2).toUpperCase(); };
                    var ch = function (i) {
                        var v = parseInt(hex.substr(i, 2), 16);
                        return toHex(v + (255 - v) * amt);
                    };
                    return "FF" + ch(0) + ch(2) + ch(4);
                };

                var wb = new ExcelJS.Workbook();
                wb.creator = "CoreAssess.AI";
                // Freeze both header rows (banner + labels) and the first column.
                var ws = wb.addWorksheet("ABAP Objects", {
                    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }]
                });

                var thin = { style: "thin", color: { argb: "FFC9CDD6" } };
                var border = { top: thin, left: thin, bottom: thin, right: thin };

                // Column widths
                cols.forEach(function (c, i) { ws.getColumn(i + 1).width = c.width || 20; });

                // Row 1: merged, coloured section banners.
                ws.getRow(1).height = 22;
                var idx = 1;
                sections.forEach(function (s) {
                    var start = idx, end = idx + s.cols.length - 1;
                    var top = ws.getCell(1, start);
                    top.value = s.title;
                    top.font = { bold: true, size: 11, color: { argb: "FF2A2A2A" } };
                    top.alignment = { vertical: "middle", horizontal: "center" };
                    if (end > start) { ws.mergeCells(1, start, 1, end); }
                    for (var c = start; c <= end; c++) {
                        var cell = ws.getCell(1, c);
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.banner } };
                        cell.border = border;
                    }
                    idx = end + 1;
                });

                // Row 2: column labels.
                ws.getRow(2).height = 30;
                cols.forEach(function (c, i) {
                    var cell = ws.getCell(2, i + 1);
                    cell.value = c.label;
                    // Lighter tint of the parent section's banner colour.
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: _lighten(c.section.banner, 0.55) } };
                    cell.font = { bold: true, size: 10, color: { argb: "FF333333" } };
                    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
                    cell.border = border;
                });

                // Data rows (from row 3): fill common sections always; approach sections
                // only for rows of that approach; zebra striping + borders + wrap.
                aRows.forEach(function (row, r) {
                    var approach = String(row.APPROACH || "").toLowerCase();
                    var values = cols.map(function (c) {
                        return appliesTo(c.section, approach) ? _scalar(row[c.property]) : "";
                    });
                    var xlRow = ws.addRow(values);
                    var isAlt = (r % 2 === 1);
                    xlRow.eachCell({ includeEmpty: true }, function (cell) {
                        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
                        cell.border = border;
                        if (isAlt) {
                            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFC" } };
                        }
                    });
                });

                ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

                var buffer = await wb.xlsx.writeBuffer();
                var blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                var link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = "ABAP Objects.xlsx";
                link.click();
                URL.revokeObjectURL(link.href);
            },
            // DEPRECATED — old template-based export. Kept for reference only; not wired.
            // It fetched a binary template.xlsx from a build-hash URL (breaks each deploy)
            // and wrote fixed cells, so it could not carry the Clean Core Tier / Coupling
            // columns. Use onExportExcelJS instead.
            onExportPressNew: async function () {
                var aCols, oRowBinding, oSettings, oSheet, oTable, aSelectedIndices, aSelectedData;
                var aCols, oRowBinding, oSettings, oSheet, oTable, aSelectedIndices, aSelectedData;
                if (!this._oTable) {
                    this._oTable = this.byId('abapObjectTable');
                }
                oTable = this._oTable;
                oRowBinding = oTable.getBinding();
                aSelectedIndices = oTable.getSelectedIndices();

                aSelectedData = aSelectedIndices.map(function (iIndex) {
                    var oRowData = JSON.parse(JSON.stringify(oTable.getContextByIndex(iIndex).getObject()));

                    function concatenateListItems(list, properties) {
                        return list && Array.isArray(list)
                            ? list.map(item => properties.map(prop => item[prop] || "").join(": ")).join(", ")
                            : "";
                    }
                    oRowData.BTP_SERVICES = concatenateListItems(oRowData.BTP_SERVICES, ["SERVICE_NAME", "BLOCKS_REQUIRED", "METRIC"]);
                    oRowData.WRICEF_OBJECT_TYPE = concatenateListItems(oRowData.WRICEF_OBJECT_TYPE, ["WRICEF_OBJECT_TYPE"]);
                    oRowData.HIGH_LVL_RECOMMENDATIONS = concatenateListItems(oRowData.HIGH_LVL_RECOMMENDATIONS, ["TITLE", "DESCRIPTION"]);
                    // oRowData.SQL_ANALYSIS = concatenateListItems(oRowData.SQL_ANALYSIS, "RECOMMENDATIONS");

                    oRowData.READ_CRUD = concatenateListItems(oRowData.READ_CRUD, ["READ_CRUD"]);
                    oRowData.CLEAN_CORE_ANALYSIS = concatenateListItems(oRowData.CLEAN_CORE_ANALYSIS, ["TITLE", "DESCRIPTION"]);
                    oRowData.SQL_ANALYSIS_TABLES_DIRECT = concatenateListItems(oRowData.SQL_ANALYSIS_TABLES_DIRECT, ["TABLE_NAME"]);
                    oRowData.FUNCTION_MODULES = concatenateListItems(oRowData.FUNCTION_MODULES, ["FUNCTION_MODULES"]);
                    oRowData.INTEGERATION_RESULT = concatenateListItems(oRowData.INTEGERATION_RESULT, ["TITLE", "DESCRIPTION"]);
                    oRowData.BAPIS = concatenateListItems(oRowData.BAPIS, ["BAPIS"]);
                    oRowData.SQL_ANALYSIS_TABLES_API = concatenateListItems(oRowData.SQL_ANALYSIS_TABLES_API, ["SQL_ANALYSIS_TABLES_API"]);
                    oRowData.SQL_ANALYSIS_TABLES_CDS = concatenateListItems(oRowData.SQL_ANALYSIS_TABLES_CDS, ["SQL_ANALYSIS_TABLES_CDS"]);
                    oRowData.NEW_S4_TABLES = concatenateListItems(oRowData.NEW_S4_TABLES, ["S4_TABLES"]);
                    oRowData.CUSTOM_TABLES = concatenateListItems(oRowData.CUSTOM_TABLES, ["TABLE_NAME"]);
                    oRowData.STANDARD_TABLES = concatenateListItems(oRowData.STANDARD_TABLES, ["TABLE_NAME"]);
                    oRowData.INTERFACE_IDOCS = concatenateListItems(oRowData.INTERFACE_IDOCS, ["IDOCS"]);
                    oRowData.INTERFACE_STANDARD_API = concatenateListItems(oRowData.INTERFACE_STANDARD_API, ["STANDARD_API"]);
                    oRowData.USE_CASE_AREA = concatenateListItems(oRowData.USE_CASE_AREA, ["USE_CASE_AREA"]);
                    oRowData.EVENTS = concatenateListItems(oRowData.EVENTS, ["EVENTS"]);
                    oRowData.STANDARD_EVENTS = concatenateListItems(oRowData.STANDARD_EVENTS, ["STANDARD_EVENTS"]);
                    oRowData.TOPICS = concatenateListItems(oRowData.TOPICS, ["TOPICS"]);


                    return oRowData;
                });
                const response = await fetch("../4765f4e9-26d7-4a9d-917a-5da155d577ce.comcravecoreassessv2.comcravecoreassessv2/~2cf5ed15-4b7c-4f18-9611-a745ce617386~/template/template.xlsx");
                const arrayBuffer = await response.arrayBuffer();
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(arrayBuffer);
                const sheet = workbook.getWorksheet(1);
                //================Header Data ===============================
                if (aSelectedData.length > 0) {
                    var j = 3;
                    for (var i = 0; i < aSelectedData.length; i++) {
                        //=============Header Data===========================================
                        sheet.getCell("A" + (j + i)).value = aSelectedData[i].OBJECT_NAME;
                        sheet.getCell("B" + (j + i)).value = aSelectedData[i].APPROACH;
                        sheet.getCell("C" + (j + i)).value = aSelectedData[i].SAP_MODULE_NAME;
                        sheet.getCell("D" + (j + i)).value = aSelectedData[i].SAP_SUB_MODULE;
                        sheet.getCell("E" + (j + i)).value = aSelectedData[i].WRICEF_OBJECT_TYPE;
                        sheet.getCell("F" + (j + i)).value = aSelectedData[i].ADHERENCE;
                        sheet.getCell("G" + (j + i)).value = aSelectedData[i].CODE_COMPLEXITY;
                        sheet.getCell("H" + (j + i)).value = aSelectedData[i].READ_CRUD;
                        sheet.getCell("I" + (j + i)).value = aSelectedData[i].PRIORITY;
                        sheet.getCell("J" + (j + i)).value = aSelectedData[i].TSHIRT;
                        sheet.getCell("K" + (j + i)).value = aSelectedData[i].EFFORTS;
                        sheet.getCell("L" + (j + i)).value = aSelectedData[i].FUNCTIONAL_ANALYSIS;
                        sheet.getCell("M" + (j + i)).value = aSelectedData[i].CLEAN_CORE_ANALYSIS;

                        if (aSelectedData[i].APPROACH.startsWith('side')) {
                            sheet.getCell("N" + (j + i)).value = aSelectedData[i].USE_CASE_AREA;
                            sheet.getCell("O" + (j + i)).value = aSelectedData[i].USE_CASE_AREA_EXPLANATION;
                            sheet.getCell("P" + (j + i)).value = aSelectedData[i].HIGH_LVL_RECOMMENDATIONS;
                            sheet.getCell("Q" + (j + i)).value = aSelectedData[i].SAP_STANDARD_API;
                            sheet.getCell("R" + (j + i)).value = aSelectedData[i].DEVELOPMENTAPPROACH;
                            sheet.getCell("S" + (j + i)).value = aSelectedData[i].BTP_SERVICES;



                            sheet.getCell("AI" + (j + i)).value = aSelectedData[i].THIRD_PARTY_INTEGRATION;
                            sheet.getCell("AJ" + (j + i)).value = aSelectedData[i].UI_INTEGRATION;
                            sheet.getCell("AK" + (j + i)).value = aSelectedData[i].INTEGERATION_RESULT;
                            sheet.getCell("AM" + (j + i)).value = aSelectedData[i].BAPIS;
                            sheet.getCell("AN" + (j + i)).value = aSelectedData[i].SQL_ANALYSIS_TABLES_API;
                            sheet.getCell("AO" + (j + i)).value = aSelectedData[i].INTERFACE_IDOCS;
                            sheet.getCell("AP" + (j + i)).value = aSelectedData[i].SAP_STANDARD_API;




                        } else if (aSelectedData[i].APPROACH.startsWith('retire')) {
                            sheet.getCell("W" + (j + i)).value = aSelectedData[i].HIGH_LVL_RECOMMENDATIONS;
                            sheet.getCell("X" + (j + i)).value = aSelectedData[i].RETIRE_EXPLAINATION;
                            sheet.getCell("Y" + (j + i)).value = aSelectedData[i].REIMPLEMENTATION;
                            sheet.getCell("Z" + (j + i)).value = aSelectedData[i].SAP_STANDARD_API;
                            sheet.getCell("AA" + (j + i)).value = aSelectedData[i].SAP_STANDARD_FIORI_APP;
                        } else {
                            sheet.getCell("T" + (j + i)).value = aSelectedData[i].HIGH_LVL_RECOMMENDATIONS;
                            sheet.getCell("U" + (j + i)).value = aSelectedData[i].SAP_STANDARD_API;
                            sheet.getCell("V" + (j + i)).value = aSelectedData[i].SAP_STANDARD_FIORI_APP;

                            sheet.getCell("AI" + (j + i)).value = aSelectedData[i].THIRD_PARTY_INTEGRATION;
                            sheet.getCell("AJ" + (j + i)).value = aSelectedData[i].UI_INTEGRATION;
                            sheet.getCell("AK" + (j + i)).value = aSelectedData[i].INTEGERATION_RESULT;
                            sheet.getCell("AM" + (j + i)).value = aSelectedData[i].BAPIS;
                            sheet.getCell("AN" + (j + i)).value = aSelectedData[i].SQL_ANALYSIS_TABLES_API;
                            sheet.getCell("AO" + (j + i)).value = aSelectedData[i].INTERFACE_IDOCS;
                            sheet.getCell("AP" + (j + i)).value = aSelectedData[i].SAP_STANDARD_API;

                        }
                        sheet.getCell("AB" + (j + i)).value = aSelectedData[i].SQL_RECOMMENDATION;
                        sheet.getCell("AC" + (j + i)).value = aSelectedData[i].STANDARD_TABLES;
                        sheet.getCell("AD" + (j + i)).value = aSelectedData[i].NEW_S4_TABLES;
                        sheet.getCell("AE" + (j + i)).value = aSelectedData[i].CUSTOM_TABLES;
                        sheet.getCell("AF" + (j + i)).value = aSelectedData[i].FUNCTION_MODULES;
                        sheet.getCell("AG" + (j + i)).value = aSelectedData[i].SQL_ANALYSIS_TABLES_CDS;



                    }

                    // sheet.getCell("A3").value = "John Doe";
                    // sheet.getCell("B2").value = "John Doe";

                    // Export again
                    const buffer = await workbook.xlsx.writeBuffer();
                    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = "ABAP Objects.xlsx";
                    link.click();

                }


            },
            // Offline fallback — plain sap.ui.export sheet (no colours). Same columns/data
            // as the styled ExcelJS export; used only when ExcelJS can't be loaded.
            onExportPress1: function () {
                if (!this._oTable) { this._oTable = this.byId('abapObjectTable'); }
                var oTable = this._oTable;
                var aSelectedIndices = oTable.getSelectedIndices();
                if (!aSelectedIndices.length) { MessageToast.show("Select object(s) to export"); return; }
                var aSelectedData = this._buildExportRows(aSelectedIndices);
                var oSettings = {
                    workbook: { columns: this.createColumnConfig() },
                    dataSource: aSelectedData,
                    fileName: 'ABAP Objects.xlsx',
                    worker: false
                };
                var oSheet = new Spreadsheet(oSettings);
                oSheet.build().finally(function () { oSheet.destroy(); });
            },
            // Flat column list for the sap.ui.export FALLBACK only (no merged banners /
            // approach-conditional data — that lives in onExportExcelJS). Derived from
            // _exportSections so both paths stay in sync. Duplicate labels across approach
            // sections are suffixed with the section title to keep them distinct.
            createColumnConfig: function () {
                var S = 'sap.ui.export.EdmType.String';
                var seen = {};
                var out = [];
                this._exportSections().forEach(function (s) {
                    s.cols.forEach(function (c) {
                        var prop = c.property;
                        if (seen[prop]) { return; }   // fallback can't repeat a property key
                        seen[prop] = true;
                        out.push({ label: c.label, property: prop, type: S, width: c.width });
                    });
                });
                return out;
            },
            // Delete the selected object assessment(s) from the analysis table,
            // including all child rows (items/notes/usage/etc.). Admin+/superuser.
            onPressDeleteObject: function () {
                var oTable = this.byId("abapObjectTable");
                var aSel = oTable.getSelectedIndices();
                if (!aSel.length) { MessageToast.show("Select object(s) to delete"); return; }
                var aObjs = aSel.map(function (i) {
                    var c = oTable.getContextByIndex(i);
                    return c ? c.getObject() : null;
                }).filter(Boolean);
                var aIds = aObjs.map(function (o) { return o.ID; }).filter(function (v) { return v != null; });
                if (!aIds.length) { MessageToast.show("Could not resolve the selected object(s)"); return; }
                var that = this;
                var sNames = aObjs.slice(0, 3).map(function (o) { return o.OBJECT_NAME; }).join(", ") +
                    (aObjs.length > 3 ? "…" : "");
                MessageBox.error(
                    "Permanently delete " + aIds.length + " object assessment(s)?\n\n" + sNames +
                    "\n\nThis removes the analysis and cannot be undone.",
                    {
                        title: "Delete analysis",
                        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                        emphasizedAction: MessageBox.Action.CANCEL,
                        onClose: function (a) {
                            if (a !== MessageBox.Action.DELETE) { return; }
                            sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Deleting..." });
                            sap.ui.getCore().busyDialog.open();
                            that.getOwnerComponent().getModel().callFunction("/DeleteAssessments", {
                                method: "POST",
                                urlParameters: { IDs: aIds.join(",") },
                                success: function (r) {
                                    sap.ui.getCore().busyDialog.close();
                                    var res = (r && r.DeleteAssessments) || "";
                                    if (res === "forbidden") { MessageBox.error("You are not allowed to delete assessments."); return; }
                                    MessageToast.show("Deleted");
                                    oTable.clearSelection();
                                    that.getOwnerComponent().getModel("selectedObjectModel").setData({});
                                    that.onRefreshTable();
                                },
                                error: function () {
                                    sap.ui.getCore().busyDialog.close();
                                    MessageBox.error("Could not delete the selected object(s).");
                                }
                            });
                        },
                        dependentOn: that.getView()
                    }
                );
            },

            onPressEditObject: function (oEvent) {
                // Edit now lives in the header toolbar, so the button carries no row
                // binding context -- resolve the object from the selected row. Falls
                // back to a row context if one is present (legacy row button).
                var oCtx = oEvent.getSource().getBindingContext("listObjectsModel");
                if (!oCtx) {
                    var oTable = this.byId("abapObjectTable");
                    var aSel = oTable.getSelectedIndices();
                    if (aSel.length !== 1) {
                        MessageToast.show(aSel.length === 0 ? "Select an object to edit" : "Select only one object to edit");
                        return;
                    }
                    oCtx = oTable.getContextByIndex(aSel[0]);
                }
                if (!oCtx) { MessageToast.show("Could not resolve the selected object"); return; }

                this.editObject = oCtx.getObject()

                var editToObject = oCtx.getObject()
                var editselectObject = new JSONModel(
                    editToObject
                );
                this.getView().setModel(editselectObject, "editselectObjectModel");
                var oView = this.getView()
                var that = this
                if (!this.byId("editObjectFrag")) {
                    Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view.EditObject",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        oDialog.open();

                        // var isInterfacePresentEdit = that.editObject.WRICEF_OBJECT_TYPE.some(
                        //     item => item.WRICEF_OBJECT_TYPE.toLowerCase() === 'interface'
                        // );
                        // ["interfaceFieldGrpEdit", "interfaceFieldGrpEdit1", "interfaceFieldGrpEdit2"].forEach(id => {
                        //     that.byId(id).setVisible(isInterfacePresentEdit);
                        // });
                    });
                } else {
                    that.byId("editObjectFrag").open();

                    // var isInterfacePresentEdit = that.editObject.WRICEF_OBJECT_TYPE.some(
                    //     item => item.WRICEF_OBJECT_TYPE.toLowerCase() === 'interface'
                    // );
                    // ["interfaceFieldGrpEdit", "interfaceFieldGrpEdit1", "interfaceFieldGrpEdit2"].forEach(id => {
                    //     that.byId(id).setVisible(isInterfacePresentEdit);
                    // });
                }
            },
            editFragClose: function () {
                this.byId("editObjectFrag").close();
            },
            // Single selected object, or null (with a toast) if 0/many selected.
            _getSingleSelectedObject: function () {
                var oTable = this.byId("abapObjectTable");
                var aSel = oTable.getSelectedIndices();
                if (aSel.length !== 1) {
                    MessageToast.show(aSel.length === 0 ? "Select an object first" : "Select only one object");
                    return null;
                }
                return oTable.getContextByIndex(aSel[0]).getObject();
            },

            onPressEstimate: function (oEvent) {
                // Toolbar button: resolve the selected object (fall back to detail).
                var oCtx = oEvent.getSource().getBindingContext("listObjectsModel");
                var oObj = oCtx ? oCtx.getObject() : this._getDetailObject();
                if (!oObj) { return; }
                var _appr = String(oObj.APPROACH || "").toLowerCase();
                if (_appr !== "side-by-side" && _appr !== "hybrid") {
                    MessageToast.show("BTP Services apply to side-by-side and hybrid objects only");
                    return;
                }
                this.estimateObject = oObj;
                var oView = this.getView();
                var that = this;
                var openAndLoad = function () {
                    that.byId("estimateFrag").open();
                    that.byId("estimateFrag").setTitle("BTP Services for: " + that.estimateObject.OBJECT_NAME);
                    that._loadEstimateQuestions();
                };
                if (!this.byId("estimateFrag")) {
                    Fragment.load({
                        id: oView.getId(),
                        name: "com.crave.coreassessv2.view.Estimate",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        openAndLoad();
                    });
                } else {
                    openAndLoad();
                }
            },
            // Load the object's prebaked, AI-generated sizing questions (with any saved
            // answers merged) into the popup model. Re-openable: reloads every time so
            // the questions/answers always reflect the current analysis.
            _loadEstimateQuestions: function () {
                var that = this;
                var o = this.estimateObject;
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Loading questions..." });
                sap.ui.getCore().busyDialog.open();
                this.getOwnerComponent().getModel().callFunction("/GetObjectEstimate", {
                    urlParameters: {
                        "companyID": parseInt(o.PROJECT_COMPANY_ID),
                        "projectID": parseInt(o.PROJECT_ID),
                        "assessmentID": parseInt(o.ID),
                        "objectName": o.OBJECT_NAME,
                        "type": "both"
                    },
                    success: function (r) {
                        var res = (r && r.GetObjectEstimate) || r || {};
                        var qs = res.questions;
                        if (qs && qs.results) { qs = qs.results; }
                        that.getView().setModel(new JSONModel({ questions: qs || [] }), "estimateQuestionModel");
                        sap.ui.getCore().busyDialog.close();
                    },
                    error: function () {
                        sap.ui.getCore().busyDialog.close();
                        MessageToast.show("Could not load the sizing questions.");
                    }
                });
            },
            estimateFragClose: function () {
                this.byId("estimateFrag").close();
            },
            onEstimate: function () {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({ text: "Saving & sizing services..." });
                sap.ui.getCore().busyDialog.open();

                var o = this.estimateObject;
                var oModel = this.getView().getModel("estimateQuestionModel");
                var qs = (oModel && oModel.getData().questions) || [];
                var data = qs.map(function (q) {
                    return {
                        "questionID": q.questionId,
                        "question": q.question,
                        "answer": (q.answer != null ? String(q.answer) : "")
                    };
                });
                var payload = {
                    "assessmentID": parseInt(o.ID),
                    "projectID": parseInt(o.PROJECT_ID),
                    "companyID": parseInt(o.PROJECT_COMPANY_ID),
                    "data": data
                };
                this.getOwnerComponent().getModel().create("/AddEstimateAnswer", payload, {
                    success: function (response) {
                        if (response.AddEstimateAnswer === true) {
                            MessageToast.show("BTP services updated");
                            this.estimateFragClose();
                            this.onAfterRefreshObjectTable()
                                .then(() => {
                                    this.byId("selectionPanel").setExpanded(false);
                                    this.byId('abapObjectTable').setSelectedIndex();
                                    this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                                    sap.ui.getCore().busyDialog.close();
                                })
                                .catch((error) => {
                                    console.error("Error occurred during object table refresh:", error);
                                    this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                                    sap.ui.getCore().busyDialog.close();
                                });
                        } else {
                            MessageToast.show("Could not update services");
                            sap.ui.getCore().busyDialog.close();
                        }
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Error while saving");
                        this.estimateFragClose();
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this)
                });
            },
            onUpdateObject: function () {
                var that = this;
                MessageBox.warning("Do you want to update the Object details??", {
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === 'OK') {
                            that.callObjectUpdateFun();
                        }
                    },
                    dependentOn: this.getView()
                });
            },
            callObjectUpdateFun: function () {
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Please Wait..."
                });
                sap.ui.getCore().busyDialog.open();
                var selectedObjectUpdate = this.getView().getModel("editselectObjectModel").getData();
                // var companyID = this.editObject.PROJECT_COMPANY_ID
                var payload = {
                    "ADHERENCE": selectedObjectUpdate.ADHERENCE,
                    "APPROACH": selectedObjectUpdate.APPROACH,
                    "BDC_USED": "",
                    "BTP_SERVICES_SEARCH": null,
                    "CODE_COMPLEXITY": selectedObjectUpdate.CODE_COMPLEXITY,
                    "COUPLING": null,
                    "Efforts": parseInt(selectedObjectUpdate.EFFORTS),
                    "FUNCTIONAL_ANALYSIS": selectedObjectUpdate.FUNCTIONAL_ANALYSIS,
                    "ID": parseInt(selectedObjectUpdate.ID),
                    "INTEGRATION_MODERNIZATION": selectedObjectUpdate.INTEGRATION_MODERNIZATION,
                    "OBJECT_NAME": selectedObjectUpdate.OBJECT_NAME,
                    "PRIORITY": selectedObjectUpdate.PRIORITY,
                    "PROJECT_COMPANY_ID": parseInt(selectedObjectUpdate.PROJECT_COMPANY_ID),
                    "PROJECT_ID": parseInt(selectedObjectUpdate.PROJECT_ID),
                    "S4_ANALYSIS": selectedObjectUpdate.S4_ANALYSIS,
                    "SAP_MODULE_NAME": selectedObjectUpdate.SAP_MODULE_NAME,
                    "SAP_SUB_MODULE": null,
                    "SCREENS_USED": parseInt(selectedObjectUpdate.SCREENS_USED),
                    "SQL_RECOMMENDATION": selectedObjectUpdate.SQL_RECOMMENDATION,
                    "THIRD_PARTY_INTEGRATION": selectedObjectUpdate.THIRD_PARTY_INTEGRATION,
                    "TOKEN_SIZE": parseInt(selectedObjectUpdate.TOKEN_SIZE),
                    "TShirt": selectedObjectUpdate.TSHIRT,
                    "UI_INTEGRATION": selectedObjectUpdate.UI_INTEGRATION,
                    "USE_CASE_AREA_EXPLANATION": ""

                }
                var oDataModel = this.getOwnerComponent().getModel();
                oDataModel.update("/ASSESSMENT(ID=" + selectedObjectUpdate.ID + ")", payload, {
                    success: function (response) {
                        MessageToast.show("Updated Successfully!, Please Refresh Table")
                        sap.ui.getCore().busyDialog.close();
                        this.editFragClose();
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Error")
                        sap.ui.getCore().busyDialog.close();
                        this.editFragClose();
                    }.bind(this)
                });
            },
            onRefreshTable: function () {
                var projectId = this.getOwnerComponent().getModel("dataModel").getData().projectData.ID;
                if (projectId === "") {
                    MessageToast.show("Project Id is getting Empty");
                    return;
                }
                sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                    text: "Refreshing Table..."
                });
                sap.ui.getCore().busyDialog.open();
                var oDataModel = this.getOwnerComponent().getModel();
                oDataModel.callFunction("/GetObjects", {
                    urlParameters: {
                        "PROJECT_ID": projectId
                    },
                    success: function (response) {
                        response.results.sort((a, b) => b.ID - a.ID);
                        this.getOwnerComponent().getModel("listObjectsModel").getData().objectList = response.results;
                        this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Error while refreshing!");
                        this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                        sap.ui.getCore().busyDialog.close();
                    }.bind(this)
                });
            },
            onAfterRefreshObjectTable: function () {
                var projectId = this.getOwnerComponent().getModel("dataModel").getData().projectData.ID;
                var oDataModel = this.getOwnerComponent().getModel();

                return new Promise((resolve, reject) => {
                    oDataModel.callFunction("/GetObjects", {
                        urlParameters: {
                            "PROJECT_ID": projectId
                        },
                        success: function (response) {
                            response.results.sort((a, b) => b.ID - a.ID);
                            this.getOwnerComponent().getModel("listObjectsModel").getData().objectList = response.results;
                            this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                            resolve();
                        }.bind(this),
                        error: function (error) {
                            MessageToast.show("Error while refreshing!");
                            this.getOwnerComponent().getModel("listObjectsModel").refresh(true);
                            reject(error);
                        }.bind(this)
                    });
                });
            },

            onAfterGroupObjectTable: function () {
                var oTable = this.byId("abapObjectTable");
                var oModel = this.getOwnerComponent().getModel("listObjectsModel");
                var oBinding = oTable.getBinding("rows");

                if (!oTable.getEnableGrouping()) {

                    oTable.setEnableGrouping(true);
                    var oColumn = oTable.getColumns()[2];
                    oTable.setGroupBy(oColumn);
                    var oSorter = new sap.ui.model.Sorter("SAP_MODULE_NAME", false, true);
                    oBinding.sort(oSorter);
                    this.byId("groupObjectTable").setText("Ungroup");
                } else {

                    oTable.setEnableGrouping(false);
                    oTable.setGroupBy(null);
                    oBinding.sort(null);
                    this.byId("groupObjectTable").setText("Group")
                }

                oModel.refresh(true);
            },

            handleListClose: function (oEvent) {
                // const aFacetFilterLists = this._getFacetFilterLists().filter(function(oList) {
                //     return oList.getActive() && oList.getSelectedItems().length;
                // });

                // // Directly create a single array of filters without wrapping in an additional Filter
                // const aFilters = aFacetFilterLists.reduce(function(acc, oList) {
                //     // Add filters for each selected item in the facet filter list
                //     oList.getSelectedItems().forEach(function(oItem) {
                //         acc.push(new Filter(oList.getTitle(), FilterOperator.EQ, oItem.getText()));
                //     });
                //     return acc;
                // }, []);

                // // Apply combined filters with AND logic
                // if (aFilters.length > 0) {
                //     this._oFacetFilter = new Filter(aFilters, true); // true means AND logic between the filters
                // } else {
                //     this._oFacetFilter = null; // Handle the case where no filters are selected
                // }

                // this._filter();
                const aFacetFilterLists = this._getFacetFilterLists().filter(function (oList) {
                    return oList.getActive() && oList.getSelectedItems().length;
                });

                // Create an array to hold all filters
                const aFilters = aFacetFilterLists.reduce(function (acc, oList) {
                    oList.getSelectedItems().forEach(function (oItem) {
                        const sPath = oList.getTitle(); // Assuming title is the filter path (e.g., 'OBJECT_NAME', 'SAP_MODULE_NAME')
                        const oValue1 = oItem.getText(); // Get the selected item's text to use as the filter value
                        let sOperator = FilterOperator.Contains; // Default operator (Contains)

                        // You can modify the logic below to set different operators based on the field
                        if (sPath === 'MODULES') {
                            sOperator = FilterOperator.EQ; // Set EQ for the 'EFFORTS' field
                        }

                        // Add a new filter for each selected item and push it to the accumulator
                        acc.push(new Filter(sPath, sOperator, oValue1));
                    });
                    return acc;
                }, []);

                // Log the filters to check the result
                console.log("Constructed Filters:", aFilters);

                // Apply the filters if there are any
                if (aFilters.length > 0) {
                    this._oFacetFilter = new Filter(aFilters, true); // Combine filters with AND logic
                } else {
                    this._oFacetFilter = null; // Clear if no filters are selected
                }

                this._filter();
            },
            _getFacetFilterLists: function () {
                const oFacetFilter = this.byId("facetFilter");
                return oFacetFilter.getLists();
            },
            _filter: function () {
                let oFilter = null;

                if (this._oTxtFilter && this._oFacetFilter) {
                    oFilter = new Filter([this._oTxtFilter, this._oFacetFilter], true);
                } else if (this._oTxtFilter) {
                    oFilter = this._oTxtFilter;
                } else if (this._oFacetFilter) {
                    oFilter = this._oFacetFilter;
                }

                this.byId("abapObjectTable").getBinding("rows").filter(oFilter, "Application");
            },

            downloadAsWord: function (oEvent) {
                try {
                    var data = oEvent.getSource().getBindingContext("listObjectsModel").getObject()
                    var payload = {
                        "assessmentID": data.ID,
                        "projectID": data.PROJECT_ID,
                        "companyID": data.PROJECT_COMPANY_ID
                    }
                    sap.ui.getCore().busyDialog = new sap.m.BusyDialog({
                        text: "Creating document please wait..."
                    });
                    sap.ui.getCore().busyDialog.open();
                    var dataModel = this.getOwnerComponent().getModel();
                    dataModel.create("/PostRawAnalysisToAI", payload, {
                        success: function (response) {
                            if (response.PostRawAnalysisToAI.base64Data != "") {
                                this.downloadDoc(response.PostRawAnalysisToAI.base64Data, data.OBJECT_NAME);
                            } else {
                                sap.m.MessageBox.error("Error fetching data from AI!")
                            }
                            sap.ui.getCore().busyDialog.close();
                        }.bind(this),
                        error: function () {
                            sap.ui.getCore().busyDialog.close();
                            sap.m.MessageBox.error("Error fetching data from AI!")
                        }.bind(this)
                    })
                } catch (error) {
                    console.error("Error loading PDF:", error);
                    sap.m.MessageBox.error("Allow Popover on browser");
                }
            },

            openAIDialog: function (oEvent) {
                var oSelctedObj = oEvent.getSource().getParent().getBindingContext("listObjectsModel").getObject();
                var oJsonModel = new JSONModel();
                var obj = {
                    "estimate": "",
                    "searchValue": "",
                    "companyId": oSelctedObj.PROJECT_COMPANY_ID,
                    "projectId": oSelctedObj.PROJECT_ID,
                    "assessmentId": oSelctedObj.ID,
                    "objectName": oSelctedObj.OBJECT_NAME
                };
                oJsonModel.setData(obj);
                this.loadFragment({
                    name: "com.crave.coreassessv2.view.OpenAI"
                }).then(function (oDialog) {
                    this._oOpenAIDialog = oDialog;
                    oDialog.setModel(oJsonModel, "aiALModel")
                    oDialog.open();
                }.bind(this));


            },
            CloseAIDialog: function () {
                this._oOpenAIDialog.close();
            },
            onSelectAIEstimate: function (oEvent) {
                this._oOpenAIDialog.getModel('aiALModel').setProperty('/DocDesc', oEvent.getParameter('selectedItem').getText());
                //var oSelectedObj = oEvent.getParameter('selectedItem').getBindingContext('aiALModel').getObject();
                if (oEvent.getParameter('selectedItem').getKey() !== "FSD") {
                    this._oOpenAIDialog.getModel('aiALModel').setProperty('/searchValue', "");
                }
            },
            DownloadDoc: function () {
                this._oOpenAIDialog.setBusy(true);
                var oData = this._oOpenAIDialog.getModel("aiALModel").getData(),
                    payload = {

                        "assessmentID": oData.assessmentId,
                        "projectID": oData.projectId,
                        "companyID": oData.companyId,
                        "docType": oData.estimate,
                        "prompt": oData.searchValue
                    };
                var oDataModel = this.getOwnerComponent().getModel();
                oDataModel.create("/PostRawAnalysisToAI", payload, {
                    success: function (response) {
                        function base64ToDocx(base64String, fileName) {
                            // Decode Base64 string to a byte array
                            const byteCharacters = atob(base64String);
                            const byteArrays = [];

                            // Convert Base64 string into a byte array
                            for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
                                const slice = byteCharacters.slice(offset, offset + 1024);
                                const byteNumbers = new Array(slice.length);

                                for (let i = 0; i < slice.length; i++) {
                                    byteNumbers[i] = slice.charCodeAt(i);
                                }

                                const byteArray = new Uint8Array(byteNumbers);
                                byteArrays.push(byteArray);
                            }

                            // Create a Blob from the byte array
                            const blob = new Blob(byteArrays, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                            // Create a URL for the Blob
                            const url = URL.createObjectURL(blob);

                            // Create a link to download the file
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = fileName || 'document.docx';

                            // Trigger the download
                            a.click();

                            // Clean up the object URL
                            URL.revokeObjectURL(url);
                        }
                        const base64String = response.PostRawAnalysisToAI.base64Data;
                        var oData = this._oOpenAIDialog.getModel("aiALModel").getData();
                        base64ToDocx(base64String, oData.objectName + "_" + oData.DocDesc);
                        this._oOpenAIDialog.setBusy(false);

                        this._oOpenAIDialog.close();
                    }.bind(this),
                    error: function (error) {
                        MessageToast.show("Error While Posting");
                        sap.ui.getCore().busyDialog.close();
                        this._oOpenAIDialog.setBusy(false);
                    }.bind(this)
                });

            },
            // Toolbar Docs action: doc type comes from the Select, the object from
            // the single selection. The Select is reset so it behaves like a menu.
            // Opens the in-app Document Generation page for the selected object. The
            // document type (FSD/TSD/BBP) is chosen there via tabs, so no dropdown is
            // needed here -- just pass the object + project context.
            onGenerateDoc: function () {
                var oObj = this._getDetailObject();
                if (!oObj) { return; }
                sap.ui.core.UIComponent.getRouterFor(this).navTo("DocGen", {
                    assessmentID: oObj.ID,
                    projectID: oObj.PROJECT_ID,
                    docType: "FSD"
                });
            },

            onNavigateToChat: function (oEvent) {
                var Id = oEvent.getSource().getParent().getBindingContext('listObjectsModel').getObject().ID;
                var ProjectId = oEvent.getSource().getParent().getBindingContext('listObjectsModel').getObject().PROJECT_ID;
                var docType = oEvent.getParameter('selectedItem').getKey();
                var that = this;
                // var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
                // oCrossAppNavigator.toExternal({
                //     target: {
                //         semanticObject: "ZCraveGEN_DOCS",
                //         action: "Manage"
                //     },
                //     params: {
                //         "assessmentID": ["12345"],
                //         "docType": ["12345"],
                //         "user": ["12345"],
                //         "projectID": ["12345"]
                //     }
                // });
                // var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
                // var sHref = oCrossAppNavigator.hrefForExternal({
                //     target: {
                //         semanticObject: "ZCraveGEN_DOCS",
                //         action: "Manage"
                //     },
                //     params: {
                //         "assessmentID": [Id],
                //         "docType": [docType],
                //         "user": [this.email],
                //         "projectID": [ProjectId]
                //     }
                // });

                // if (sHref) {
                //     var url = window.location.href.split('#')[0] + sHref;
                //     sap.m.URLHelper.redirect(url, true);

                // }

                sap.ushell.Container.getServiceAsync("CrossApplicationNavigation")
                    .then(function (oCrossAppNav) {
                        var href = oCrossAppNav.hrefForExternal({
                            target: {
                                semanticObject: "ZCraveGEN_DOCS",
                                action: "Manage"
                            },
                            params: {
                                "assessmentID": [Id],
                                "docType": [docType],
                                "user": [that.email],
                                "projectID": [ProjectId]
                            }
                        });

                        // Navigate to the target app
                        if (href) {
                            var url = window.location.href.split('#')[0] + href;
                            sap.m.URLHelper.redirect(url, true);
                        }
                    })
                    .catch(function (oError) {
                        console.error("Failed to get CrossApplicationNavigation service:", oError);
                    });
            },
            downloadDoc: function (base64Data, ObjectName) {
                var byteCharacters = atob(base64Data);
                var byteArrays = [];

                for (var offset = 0; offset < byteCharacters.length; offset += 1024) {
                    var slice = byteCharacters.slice(offset, offset + 1024);
                    var byteNumbers = new Array(slice.length);
                    for (var i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                    }
                    byteArrays.push(new Uint8Array(byteNumbers));
                }

                var blob = new Blob(byteArrays, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                var link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = ObjectName + ".docx";
                link.click();
            }
        });
    });
