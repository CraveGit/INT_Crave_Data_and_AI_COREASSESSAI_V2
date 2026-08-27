sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/export/Spreadsheet",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/TextArea",
    "sap/m/Label"
], function (Controller, JSONModel, MessageToast, MessageBox, Fragment, Spreadsheet, Filter, FilterOperator, Dialog, Button, TextArea, Label) {
    "use strict";

    return Controller.extend("com.crave.coreassessv2.controller.AdminPanel", {

        onInit: function () {
            this.getView().setModel(new JSONModel({ users: [] }), "usersModel");
            this.getView().setModel(new JSONModel({ requests: [], pendingCount: 0 }), "requestsModel");
            this.getView().setModel(new JSONModel({ stats: [] }), "statsModel");
            this.getView().setModel(new JSONModel({ companies: [] }), "companiesModel");
            this.getView().setModel(new JSONModel({ tickets: [], openCount: 0 }), "adminTicketsModel");
            this.getView().setModel(new JSONModel({ rows: [] }), "limitsModel");
            this.getView().setModel(new JSONModel({ rows: [] }), "costLedgerModel");
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("AdminPanel").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function () {
            this.onRefreshUsers();
            this.onRefreshRequests();
            this.onRefreshStats();
            this.onRefreshCostLedger();
            this.onRefreshAdminTickets();
            this.onRefreshLimits();
            this._loadCompanies();
        },

        // Flat plain table: each company row (Project cell empty) is followed by its
        // project rows (Company cell empty), like the users table.
        onRefreshLimits: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oL = this.getView().getModel("limitsModel");
            oModel.callFunction("/GetUploadLimits", {
                method: "GET",
                success: function (r) {
                    var d = r.GetUploadLimits || r;
                    var companies = (d.companies && d.companies.results) || d.companies || [];
                    var projects = (d.projects && d.projects.results) || d.projects || [];
                    var byCompany = {};
                    projects.forEach(function (p) {
                        (byCompany[p.companyId] = byCompany[p.companyId] || []).push(p);
                    });
                    var rows = [];
                    companies.forEach(function (c) {
                        rows.push({ type: "company", ID: c.ID, companyId: c.ID, name: c.name,
                                    company: c.name, project: "", used: c.used, limit: c.limit });
                        (byCompany[c.ID] || []).forEach(function (p) {
                            rows.push({ type: "project", ID: p.ID, companyId: p.companyId, name: p.name,
                                        company: "", project: p.name, used: p.used, limit: p.limit });
                        });
                    });
                    oL.setData({ rows: rows });
                },
                error: function () { /* non-admins get empty */ }
            });
        },

        // Edit a limit via a small dialog (table action), not an inline input.
        onEditLimit: function (oEvent) {
            var oRow = oEvent.getSource().getBindingContext("limitsModel").getObject();
            var that = this;
            var oInput = new sap.m.Input({
                type: "Number",
                value: (oRow.limit === null || oRow.limit === undefined) ? "" : String(oRow.limit),
                placeholder: "Blank = unlimited",
                width: "100%"
            });
            var oDlg = new sap.m.Dialog({
                title: "Object limit — " + (oRow.type === "company" ? oRow.company : oRow.project),
                contentWidth: "20rem",
                content: [
                    new sap.m.VBox({ items: [
                        new sap.m.Label({ text: "Used: " + oRow.used, design: "Bold" }),
                        new sap.m.Text({ text: "Max objects (leave blank for unlimited):", class: "sapUiTinyMarginTop" }),
                        oInput
                    ] }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new sap.m.Button({
                    text: "Save", type: "Emphasized",
                    press: function () {
                        that._saveLimit(oRow, oInput.getValue());
                        oDlg.close();
                    }
                }),
                endButton: new sap.m.Button({ text: "Cancel", press: function () { oDlg.close(); } }),
                afterClose: function () { oDlg.destroy(); }
            });
            this.getView().addDependent(oDlg);
            oDlg.open();
        },

        _saveLimit: function (oRow, sVal) {
            var oModel = this.getOwnerComponent().getModel();
            var fn = oRow.type === "company" ? "/SetCompanyLimit" : "/SetProjectLimit";
            var params = oRow.type === "company"
                ? { ID: oRow.ID, limit: sVal }
                : { ID: oRow.ID, COMPANY_ID: oRow.companyId, limit: sVal };
            oModel.callFunction(fn, {
                method: "POST",
                urlParameters: params,
                success: function () {
                    MessageToast.show("Limit saved for " + oRow.name);
                    this.onRefreshLimits();
                }.bind(this),
                error: function () { MessageBox.error("Could not save the limit"); }
            });
        },

        formatTicketState: function (sStatus) {
            switch (String(sStatus || "").toUpperCase()) {
                case "CLOSED": return "Success";
                case "ACKNOWLEDGED": return "Information";
                default: return "Warning";   // OPEN
            }
        },

        onRefreshAdminTickets: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oT = this.getView().getModel("adminTicketsModel");
            oModel.callFunction("/GetAllTickets", {
                method: "GET",
                success: function (r) {
                    var a = r.results || [];
                    oT.setProperty("/tickets", a);
                    oT.setProperty("/openCount", a.filter(function (x) { return x.STATUS === "OPEN"; }).length);
                },
                error: function () { /* non-admins get [] / 403; ignore */ }
            });
        },

        _updateTicket: function (sID, sAction, sComment) {
            var oModel = this.getOwnerComponent().getModel();
            oModel.callFunction("/UpdateTicket", {
                method: "POST",
                urlParameters: { ID: sID, action: sAction, comment: sComment || "" },
                success: function () {
                    MessageToast.show(sAction === "CLOSE" ? "Ticket closed" : "Ticket acknowledged");
                    this.onRefreshAdminTickets();
                }.bind(this),
                error: function () { MessageBox.error("Could not update the ticket"); }
            });
        },
        onAcknowledgeTicket: function (oEvent) {
            var sID = oEvent.getSource().getBindingContext("adminTicketsModel").getProperty("ID");
            this._updateTicket(sID, "ACKNOWLEDGE");
        },
        // Closing asks the admin/owner WHY, and records it as the close comment.
        onCloseTicket: function (oEvent) {
            var sID = oEvent.getSource().getBindingContext("adminTicketsModel").getProperty("ID");
            var that = this;
            var oTa = new TextArea({
                width: "100%", rows: 4, growing: true,
                placeholder: "Reason for closing this ticket (visible to the requester)…"
            });
            var oDialog = new Dialog({
                title: "Close ticket",
                contentWidth: "30rem",
                content: [
                    new Label({ text: "Comment", labelFor: oTa }).addStyleClass("sapUiTinyMarginBegin sapUiTinyMarginTop"),
                    oTa
                ],
                beginButton: new Button({
                    text: "Close ticket", type: "Accept",
                    press: function () {
                        var sComment = oTa.getValue().trim();
                        if (!sComment) { oTa.setValueState("Error"); oTa.setValueStateText("Please add a comment"); return; }
                        oDialog.close();
                        that._updateTicket(sID, "CLOSE", sComment);
                    }
                }),
                endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); } }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        // Delete a resolved (CLOSED) ticket, confirmed. Cross icon in the actions cell.
        onDeleteTicket: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("adminTicketsModel");
            var sID = oCtx.getProperty("ID");
            var sTitle = oCtx.getProperty("TITLE") || "this ticket";
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            MessageBox.confirm("Delete resolved ticket '" + sTitle + "'? This cannot be undone.", {
                title: "Delete ticket",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    oModel.callFunction("/DeleteTicket", {
                        method: "POST",
                        urlParameters: { ID: sID },
                        success: function (r) {
                            var res = (r && r.DeleteTicket) || "";
                            if (res === "forbidden") { MessageBox.error("You are not allowed to delete tickets"); return; }
                            if (res === "not_closed") { MessageBox.warning("Only resolved tickets can be deleted"); return; }
                            MessageToast.show("Ticket deleted");
                            that.onRefreshAdminTickets();
                        },
                        error: function () { MessageBox.error("Could not delete the ticket"); }
                    });
                }
            });
        },

        // Permanently delete a retained pricing-history row (confirmed). The ledger
        // is an audit trail, so deletion is irreversible and gated to admin/owner.
        onDeleteCostLedger: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("costLedgerModel");
            var sID = oCtx.getProperty("ID");
            var sObj = oCtx.getProperty("OBJECT_NAME") || "this record";
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            MessageBox.confirm("Delete the pricing record for '" + sObj + "'? This audit entry cannot be recovered.", {
                title: "Delete pricing record",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    oModel.callFunction("/DeleteCostLedger", {
                        method: "POST",
                        urlParameters: { ID: sID },
                        success: function (r) {
                            if (r.DeleteCostLedger === "forbidden") { MessageBox.error("You are not allowed to delete pricing records"); return; }
                            MessageToast.show("Pricing record deleted");
                            that.onRefreshCostLedger();
                        },
                        error: function () { MessageBox.error("Could not delete the pricing record"); }
                    });
                }
            });
        },

        // Global search: filter all three tables on one query. Each table matches
        // the query (case-insensitive) against its own relevant fields (OR); an
        // empty query clears the filters.
        onGlobalSearch: function (oEvent) {
            var sQuery = (oEvent.getParameter("newValue") != null
                ? oEvent.getParameter("newValue")
                : oEvent.getParameter("query")) || "";
            var mFields = {
                usersTable: ["DISPLAY_NAME", "EMAIL", "ROLE"],
                requestsTable: ["DISPLAY_NAME", "EMAIL", "ROLE", "REQUESTED_BY", "STATUS"],
                statsTable: ["PROJECT_NAME"],
                ticketsTable: ["TITLE", "DESCRIPTION", "RAISED_BY", "STATUS"]
            };
            Object.keys(mFields).forEach(function (sTableId) {
                var oTable = this.byId(sTableId);
                if (!oTable) { return; }
                var oBinding = oTable.getBinding("items");
                if (!oBinding) { return; }
                if (!sQuery) { oBinding.filter([]); return; }
                var aOr = mFields[sTableId].map(function (sField) {
                    return new Filter(sField, FilterOperator.Contains, sQuery);
                });
                oBinding.filter(new Filter({ filters: aOr, and: false }));
            }.bind(this));
        },

        // Companies + their projects for the Add/Edit dialog. Admin+ sees all.
        // Access is company-level (no user->project mapping), so projects are shown
        // read-only: whatever the selected companies include.
        _loadCompanies: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oCompanies = this.getView().getModel("companiesModel");
            oModel.read("/MSTR_COMPANY", {
                success: function (r) { oCompanies.setProperty("/companies", r.results || []); },
                error: function () { /* ignore */ }
            });
            this._projectsByCompany = {};
            oModel.read("/MSTR_PROJECT", {
                urlParameters: { "$expand": "COMPANY" },
                success: function (r) {
                    var map = {};
                    (r.results || []).forEach(function (p) {
                        var cid = (p.COMPANY && (p.COMPANY.ID != null ? p.COMPANY.ID : p.COMPANY)) || p.COMPANY_ID;
                        if (cid == null) { return; }
                        (map[cid] = map[cid] || []).push(p.PROJECT_NAME);
                    });
                    this._projectsByCompany = map;
                }.bind(this),
                error: function () { /* ignore */ }
            });
        },

        // Recompute the read-only project preview from the selected companies.
        _refreshProjectPreview: function () {
            var oAdd = this.getView().getModel("addUserModel");
            if (!oAdd) { return; }
            var aCids = oAdd.getProperty("/companyIDs") || [];
            var byCompany = this._projectsByCompany || {};
            var aLines = aCids.map(function (cid) {
                var aProj = byCompany[cid] || byCompany[parseInt(cid, 10)] || [];
                return aProj.length ? aProj.join(", ") : "No projects";
            });
            oAdd.setProperty("/projectsPreview", aLines.join("\n"));
        },
        onCompaniesChange: function () {
            this._refreshProjectPreview();
        },

        // -------- formatters --------
        formatRoleState: function (sRole) {
            switch (String(sRole || "").toUpperCase()) {
                case "OWNER": return "Error";      // red-ish accent, highest
                case "ADMIN": return "Warning";
                case "SUPERUSER": return "Information";
                default: return "Success";              // USER
            }
        },
        formatStatusState: function (sStatus) {
            switch (String(sStatus || "").toUpperCase()) {
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                default: return "Warning";              // PENDING
            }
        },
        // Meaningful, type-identifiable display code from the integer id (the real
        // primary key is untouched): C001 company, P001 project, U001 user, A001
        // assessment. Auto-derived, so it stays in lockstep with the id.
        _code: function (prefix, id) {
            if (id === null || id === undefined || id === "") { return ""; }
            var n = parseInt(id, 10);
            return isNaN(n) ? String(id) : prefix + String(n).padStart(3, "0");
        },
        formatCompanyCode: function (id) { return this._code("C", id); },
        formatProjectCode: function (id) { return this._code("P", id); },
        formatUserCode: function (id) { return this._code("U", id); },
        formatAssessmentCode: function (id) { return this._code("A", id); },

        formatUsd: function (v) {
            var n = Number(v || 0);
            return "$" + n.toFixed(4);
        },

        // Compact token count: 29548 -> "29.5K", 1_200_000 -> "1.2M", 3e9 -> "3B".
        formatTokens: function (v) {
            var n = Number(v || 0);
            if (!isFinite(n)) { return "0"; }
            var abs = Math.abs(n);
            var trim = function (s) { return s.replace(/\.0+$|(\.\d*?)0+$/, "$1"); };
            if (abs >= 1e9) { return trim((n / 1e9).toFixed(2)) + "B"; }
            if (abs >= 1e6) { return trim((n / 1e6).toFixed(2)) + "M"; }
            if (abs >= 1e3) { return trim((n / 1e3).toFixed(1)) + "K"; }
            return String(n);
        },

        // -------- data loads --------
        onRefreshUsers: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oUsers = this.getView().getModel("usersModel");
            oModel.callFunction("/GetUsers", {
                method: "GET",
                success: function (r) { oUsers.setProperty("/users", r.results || []); },
                error: function () { MessageToast.show("Could not load users"); }
            });
        },
        onRefreshRequests: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oReq = this.getView().getModel("requestsModel");
            oModel.callFunction("/GetAccessRequests", {
                method: "GET",
                success: function (r) {
                    var a = r.results || [];
                    oReq.setProperty("/requests", a);
                    oReq.setProperty("/pendingCount", a.filter(function (x) { return x.STATUS === "PENDING"; }).length);
                },
                error: function () { /* non-admins get [] / 403; ignore quietly */ }
            });
        },
        onRefreshStats: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oStats = this.getView().getModel("statsModel");
            oModel.callFunction("/GetProjectCostStats", {
                method: "GET",
                success: function (r) { oStats.setProperty("/stats", r.results || []); },
                error: function () { MessageToast.show("Could not load project stats"); }
            });
        },

        // Retained pricing of deleted objects/projects/companies (admin/owner only;
        // the service also gates it, so non-admins just get an empty list).
        onRefreshCostLedger: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oLedger = this.getView().getModel("costLedgerModel");
            oModel.callFunction("/GetCostLedger", {
                method: "GET",
                success: function (r) { oLedger.setProperty("/rows", (r && r.results) || []); },
                error: function () { /* non-admin or service down: leave empty */ }
            });
        },

        // -------- add / request user --------
        _openUserDialog: function () {
            if (!this._pAddUser) {
                this._pAddUser = Fragment.load({
                    id: this.getView().getId(), name: "com.crave.coreassessv2.view.AddUser", controller: this
                }).then(function (oDialog) { this.getView().addDependent(oDialog); return oDialog; }.bind(this));
            }
            this._pAddUser.then(function (oDialog) { oDialog.open(); });
        },
        onOpenAddUser: function () {
            var sRole = this.getOwnerComponent().getModel("visibleModel").getProperty("/role");
            var bRequest = sRole === "SUPERUSER";
            this.getView().setModel(new JSONModel({
                title: bRequest ? "Request User" : "Add User",
                submitText: bRequest ? "Send Request" : "Add User",
                isRequest: bRequest, isEdit: false,
                displayName: "", email: "", role: "USER", allowedObjects: 100,
                uploadedObjects: 0, companyIDs: [], projectsPreview: ""
            }), "addUserModel");
            this._refreshProjectPreview();
            this._openUserDialog();
        },
        onEditUser: function (oEvent) {
            var oRow = oEvent.getSource().getBindingContext("usersModel").getObject();
            var aCompanyIDs = (oRow.MAPPINGS || []).map(function (m) { return String(m.COMPANY_ID); });
            this.getView().setModel(new JSONModel({
                title: "Edit User", submitText: "Save",
                isRequest: false, isEdit: true,
                displayName: oRow.DISPLAY_NAME || "", email: oRow.EMAIL || oRow.USERNAME,
                role: oRow.ROLE || "USER", allowedObjects: oRow.ALLOWEDOBJECTS || 0,
                uploadedObjects: oRow.UPLOADEDOBJECTS || 0, companyIDs: aCompanyIDs, projectsPreview: ""
            }), "addUserModel");
            this._refreshProjectPreview();
            this._openUserDialog();
        },
        onRemoveUser: function (oEvent) {
            var oRow = oEvent.getSource().getBindingContext("usersModel").getObject();
            var sEmail = oRow.EMAIL || oRow.USERNAME;
            MessageBox.confirm("Remove user '" + sEmail + "'?", {
                title: "Remove User",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    var oModel = this.getOwnerComponent().getModel();
                    oModel.callFunction("/RemoveUser", {
                        method: "POST",
                        urlParameters: { email: sEmail },
                        success: function (r) {
                            if (r.RemoveUser === "removed") { MessageToast.show("User removed"); }
                            else if (r.RemoveUser === "forbidden") { MessageBox.error("You cannot remove that user"); }
                            else { MessageToast.show("Done"); }
                            this.onRefreshUsers();
                        }.bind(this),
                        error: function () { MessageBox.error("Could not remove user"); }
                    });
                }.bind(this)
            });
        },
        onCancelAddUser: function () {
            this._pAddUser.then(function (oDialog) { oDialog.close(); });
        },
        onSubmitAddUser: function () {
            var oData = this.getView().getModel("addUserModel").getData();
            var sEmail = (oData.email || "").trim();
            if (!sEmail) { MessageToast.show("Email is required"); return; }
            var oModel = this.getOwnerComponent().getModel();
            var sFn = oData.isEdit ? "/UpdateUser" : (oData.isRequest ? "/RequestUser" : "/AddUser");
            var sCompanyIDs = (oData.companyIDs || []).join(",");
            var oParams = oData.isEdit ? {
                email: sEmail, displayName: oData.displayName || "", role: oData.role || "USER",
                allowedObjects: parseInt(oData.allowedObjects, 10) || 0,
                uploadedObjects: parseInt(oData.uploadedObjects, 10) || 0,
                companyIDs: sCompanyIDs
            } : {
                displayName: oData.displayName || "", email: sEmail, role: oData.role || "USER",
                allowedObjects: parseInt(oData.allowedObjects, 10) || 0, companyIDs: sCompanyIDs
            };
            oModel.callFunction(sFn, {
                method: "POST",
                urlParameters: oParams,
                success: function (r) {
                    var sResult = r[sFn.substring(1)];
                    if (sResult === "created") { MessageToast.show("User added"); }
                    else if (sResult === "updated") { MessageToast.show("User updated"); }
                    else if (sResult === "requested") { MessageToast.show("Request sent for approval"); }
                    // Duplicate / invalid / forbidden: keep the dialog open so the
                    // user can correct the input.
                    else if (sResult === "exists") { MessageBox.warning("A user with that email already exists (any role counts)."); return; }
                    else if (sResult === "invalid") { MessageBox.warning("Please enter a valid email."); return; }
                    else if (sResult === "forbidden") { MessageBox.error("You are not allowed to grant that role"); return; }
                    else { MessageToast.show("Done"); }
                    this._pAddUser.then(function (oDialog) { oDialog.close(); });
                    this.onRefreshUsers();
                    this.onRefreshRequests();
                }.bind(this),
                error: function () { MessageBox.error("Could not submit"); }
            });
        },

        // -------- approve / reject --------
        _decide: function (oEvent, bApprove) {
            var oCtx = oEvent.getSource().getBindingContext("requestsModel");
            var sID = oCtx.getProperty("ID");
            var oModel = this.getOwnerComponent().getModel();
            oModel.callFunction("/DecideAccessRequest", {
                method: "POST",
                urlParameters: { ID: sID, approve: bApprove },
                success: function () {
                    MessageToast.show(bApprove ? "Approved" : "Rejected");
                    this.onRefreshRequests();
                    this.onRefreshUsers();
                }.bind(this),
                error: function () { MessageBox.error("Could not update request"); }
            });
        },
        onApproveRequest: function (oEvent) { this._decide(oEvent, true); },
        onRejectRequest: function (oEvent) { this._decide(oEvent, false); },

        // -------- export --------
        onExportStats: function () {
            var that = this;
            var aData = this.getView().getModel("statsModel").getProperty("/stats") || [];
            if (!aData.length) { MessageToast.show("Nothing to export"); return; }
            // Export the display CODES (C002/P004), not raw ids, to match the table.
            var aExport = aData.map(function (r) {
                return Object.assign({}, r, {
                    COMPANY_CODE: that._code("C", r.COMPANY_ID),
                    PROJECT_CODE: that._code("P", r.PROJECT_ID)
                });
            });
            var oSettings = {
                workbook: {
                    columns: [
                        { label: "Company", property: "COMPANY_CODE" },
                        { label: "Company Name", property: "COMPANY_NAME" },
                        { label: "Project", property: "PROJECT_CODE" },
                        { label: "Project Name", property: "PROJECT_NAME" },
                        { label: "Status", property: "STATUS" },
                        { label: "Assessment Total (USD)", property: "ASSESSMENT_TOTAL", type: "Number", scale: 4 },
                        { label: "Docgen Total (USD)", property: "DOCGEN_TOTAL", type: "Number", scale: 4 },
                        { label: "Project Total (USD)", property: "PROJECT_TOTAL", type: "Number", scale: 4 }
                    ]
                },
                dataSource: aExport,
                fileName: "project-cost-stats.xlsx"
            };
            new Spreadsheet(oSettings).build().finally(function () { MessageToast.show("Exported"); });
        },

        // Export the Pricing history (deleted) ledger. Tokens shown compact (K/M/B).
        onExportCostLedger: function () {
            var that = this;
            var aData = this.getView().getModel("costLedgerModel").getProperty("/rows") || [];
            if (!aData.length) { MessageToast.show("Nothing to export"); return; }
            var aExport = aData.map(function (r) {
                return Object.assign({}, r, { TOKENS_FMT: that.formatTokens(r.TOTAL_TOKENS) });
            });
            var oSettings = {
                workbook: {
                    columns: [
                        { label: "Object", property: "OBJECT_NAME" },
                        { label: "Project", property: "PROJECT_NAME" },
                        { label: "Company", property: "COMPANY_NAME" },
                        { label: "Source", property: "SOURCE" },
                        { label: "Tokens", property: "TOKENS_FMT" },
                        { label: "Cost (USD)", property: "COST_USD", type: "Number", scale: 4 },
                        { label: "Incurred by", property: "INCURRED_BY" },
                        { label: "Deleted", property: "STATUS" },
                        { label: "Deleted by", property: "DELETED_BY" }
                    ]
                },
                dataSource: aExport,
                fileName: "pricing-history-deleted.xlsx"
            };
            new Spreadsheet(oSettings).build().finally(function () { MessageToast.show("Exported"); });
        }
    });
});
