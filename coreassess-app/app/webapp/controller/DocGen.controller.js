sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    var DOC_LABELS = { FSD: "Functional Specification", TSD: "Technical Specification", BBP: "Business Blueprint" };

    return Controller.extend("com.crave.coreassessv2.controller.DocGen", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                assessmentID: null, projectID: null, docType: "FSD",
                objectName: "", model: "", models: [],
                docHtml: "", draft: "", messages: [],
                versions: [], selectedVersion: null, deep: false,
                busy: false, assistantOpen: true, started: false
            }), "docGenModel");
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("DocGen").attachPatternMatched(this._onMatched, this);
        },

        _model: function () { return this.getView().getModel("docGenModel"); },

        // Match the editor preview to the exported document's typography: Playfair
        // Display headings, Instrument Sans body, Fragment Mono code. Instrument and
        // Fragment are self-hosted (webapp/fonts); Playfair loads from Google with a
        // serif fallback. Injected as TinyMCE content_style so it applies inside the
        // editor's iframe (which does not inherit the app's fonts).
        onEditorInit: function (oEvent) {
            var cfg = oEvent.getParameter("configuration");
            if (!cfg) { return; }
            var base = sap.ui.require.toUrl("com/crave/coreassessv2/fonts");
            cfg.content_style = [
                "@font-face{font-family:'General Sans';src:url('" + base + "/general-sans-600.woff2') format('woff2');font-weight:600;font-display:swap;}",
                "@font-face{font-family:'General Sans';src:url('" + base + "/general-sans-700.woff2') format('woff2');font-weight:700;font-display:swap;}",
                "@font-face{font-family:'Instrument Sans';src:url('" + base + "/instrument-sans-latin.woff2') format('woff2');font-weight:100 900;font-display:swap;}",
                "@font-face{font-family:'Fragment Mono';src:url('" + base + "/fragment-mono-latin.woff2') format('woff2');font-display:swap;}",
                "body{font-family:'Instrument Sans',-apple-system,'Segoe UI',sans-serif;color:#1a1a1a;line-height:1.5;}",
                "h1,h2,h3,h4,h5,h6{font-family:'General Sans','Instrument Sans',-apple-system,sans-serif;font-weight:700;}",
                "code,pre,tt,kbd{font-family:'Fragment Mono',ui-monospace,monospace;}",
                "table{border-collapse:collapse;}",
                "th,td{border:1px solid #d0d5dd;padding:6px 10px;}"
            ].join("");
        },

        // Factory for chat messages. Classes are set imperatively because a bound
        // class attribute does not reach the DOM here, so bubble colours (which
        // depend on the role) would not apply from XML.
        msgFactory: function (sId, oContext) {
            var bUser = oContext.getProperty("role") === "user";
            var oText = new sap.m.FormattedText({ htmlText: "{docGenModel>text}" });
            var oBubble = new sap.m.VBox({ items: [oText] });
            oBubble.addStyleClass(bUser ? "craMsg craMsgUser" : "craMsg craMsgAi");
            var oRow = new sap.m.HBox({
                width: "100%",
                renderType: "Bare",
                justifyContent: bUser ? "End" : "Start",
                items: [oBubble]
            });
            oRow.addStyleClass("craMsgRow");
            return new sap.m.CustomListItem({ content: [oRow] }).addStyleClass("craMsgItem");
        },

        _onMatched: function (oEvent) {
            var a = oEvent.getParameter("arguments");
            var oM = this._model();
            oM.setProperty("/assessmentID", parseInt(a.assessmentID, 10) || null);
            oM.setProperty("/projectID", parseInt(a.projectID, 10) || null);
            oM.setProperty("/docType", a.docType || "FSD");
            oM.setProperty("/messages", []);
            oM.setProperty("/docHtml", "");
            // Object name for the header, from the loaded objects list if present.
            var oList = this.getOwnerComponent().getModel("listObjectsModel");
            var sName = "";
            if (oList) {
                var aObj = (oList.getData() || {}).objectList || [];
                var hit = aObj.filter(function (o) { return String(o.ID) === String(a.assessmentID); })[0];
                sName = hit ? hit.OBJECT_NAME : "";
            }
            oM.setProperty("/objectName", sName);
            oM.setProperty("/docHtml", "");
            oM.setProperty("/started", false);
            oM.setProperty("/versions", []);
            oM.setProperty("/selectedVersion", null);
            this._loadModels();
            // No autostart, but if this object+docType already has generated
            // versions, load the latest so the document survives leaving the tab.
            this._loadVersions(true);
        },

        // Fetch the version history for the current object + docType. When
        // bLoadLatest and versions exist, load the newest snapshot into the editor.
        _loadVersions: function (bLoadLatest) {
            var oM = this._model();
            var aid = oM.getProperty("/assessmentID"), pid = oM.getProperty("/projectID");
            if (!aid || !pid) { return; }
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/GetDocVersions", {
                method: "GET",
                urlParameters: { assessmentID: aid, projectID: pid, docType: oM.getProperty("/docType") },
                success: function (r) {
                    var d = r.GetDocVersions || r;
                    var aVers = (d && d.results) || d || [];
                    oM.setProperty("/versions", aVers);
                    if (bLoadLatest && aVers.length) {
                        // aVers is newest-first; the first is the latest snapshot.
                        this._loadVersion(aVers[0].ID);
                    }
                }.bind(this),
                error: function () { /* no history yet: leave the Generate empty state */ }
            });
        },

        // Load one version's stored HTML into the editor.
        _loadVersion: function (iId) {
            var oM = this._model();
            oM.setProperty("/busy", true);
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/GetDocVersion", {
                method: "GET",
                urlParameters: { ID: iId },
                success: function (r) {
                    var d = r.GetDocVersion || r;
                    var sHtml = (d && d.CONTENT) || "";
                    oM.setProperty("/docHtml", sHtml);
                    oM.setProperty("/selectedVersion", iId);
                    oM.setProperty("/started", true);
                    oM.setProperty("/busy", false);
                    // The RichTextEditor (TinyMCE) does not reliably re-render from a
                    // programmatic value-binding change once it is initialised, so
                    // switching versions left the old content on screen. Push the HTML
                    // into the editor explicitly.
                    var oEditor = this.byId("docEditor");
                    if (oEditor && oEditor.setValue) { oEditor.setValue(sHtml); }
                    // Restore this version's saved thumb (feedback persists on reopen).
                    this._loadDocFeedback(iId);
                }.bind(this),
                error: function () {
                    oM.setProperty("/busy", false);
                    MessageToast.show("Could not load that version");
                }
            });
        },

        onVersionChange: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }
            this._loadVersion(parseInt(oItem.getKey(), 10));
        },

        // Explicitly persist the current editor content as a version snapshot.
        // A generation/refine is only a draft until this is pressed.
        onSaveVersion: function () {
            var oM = this._model();
            var sHtml = oM.getProperty("/docHtml") || "";
            if (!sHtml) { MessageToast.show("Nothing to save yet"); return; }
            oM.setProperty("/busy", true);
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/SaveDocVersion", {
                method: "POST",
                urlParameters: {
                    assessmentID: oM.getProperty("/assessmentID"),
                    projectID: oM.getProperty("/projectID"),
                    docType: oM.getProperty("/docType"),
                    user: this._user(),
                    content: sHtml
                },
                success: function (r) {
                    oM.setProperty("/busy", false);
                    var d = r.SaveDocVersion || r;
                    MessageToast.show("Version saved");
                    // Refresh the picker and select the new snapshot (content already shown).
                    this._loadVersions(false);
                    if (d && d.ID) { oM.setProperty("/selectedVersion", d.ID); }
                }.bind(this),
                error: function () {
                    oM.setProperty("/busy", false);
                    MessageBox.error("Could not save the version.");
                }
            });
        },

        // Delete the selected saved version (draft rows are never deletable here).
        onDeleteVersion: function () {
            var oM = this._model();
            var iId = oM.getProperty("/selectedVersion");
            if (!iId) { MessageToast.show("Select a version to delete"); return; }
            var that = this;
            MessageBox.confirm("Delete this saved version? This cannot be undone.", {
                title: "Delete version",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    oM.setProperty("/busy", true);
                    var oDataModel = that.getOwnerComponent().getModel();
                    oDataModel.callFunction("/DeleteDocVersion", {
                        method: "POST",
                        urlParameters: { ID: iId },
                        success: function (r) {
                            oM.setProperty("/busy", false);
                            var res = r.DeleteDocVersion || r;
                            if (res === "forbidden") { MessageBox.error("This version cannot be deleted."); return; }
                            MessageToast.show(res === "not_found" ? "Version already removed" : "Version deleted");
                            // Keep the current editor content; just drop the selection
                            // and refresh the picker.
                            oM.setProperty("/selectedVersion", null);
                            that._loadVersions(false);
                        },
                        error: function () {
                            oM.setProperty("/busy", false);
                            MessageBox.error("Could not delete the version.");
                        }
                    });
                }
            });
        },

        // Load the current user's saved thumb for a given docgen response/version so
        // the highlight survives reopening the page. Best-effort.
        _loadDocFeedback: function (iChatId) {
            var oM = this._model();
            oM.setProperty("/fbVote", null);
            if (!iChatId) { return; }
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/GetFeedback", {
                method: "GET",
                urlParameters: { source: "DOCGEN_CHAT", assessmentID: oM.getProperty("/assessmentID") || 0, chatID: iChatId },
                success: function (r) {
                    var d = r.GetFeedback || r;
                    if (!d) { return; }
                    if (d.upvotes) { oM.setProperty("/fbVote", "up"); }
                    else if (d.downvotes) { oM.setProperty("/fbVote", "down"); }
                },
                error: function () { /* no feedback service / none yet: leave unset */ }
            });
        },

        _loadModels: function () {
            var oM = this._model();
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/GetModels", {
                method: "GET",
                success: function (r) {
                    var d = r.GetModels || r;
                    // OData V2 (cov2ap) wraps a function-import collection in
                    // { results: [...] }; unwrap it like the upload page does, else
                    // the Select binds an object and shows no items.
                    var aModels = (d.models && d.models.results) || d.models || [];
                    oM.setProperty("/models", aModels);
                    if (!oM.getProperty("/model")) { oM.setProperty("/model", d.default || ""); }
                },
                error: function () { /* dropdown stays empty */ }
            });
        },

        _user: function () {
            var oU = this.getOwnerComponent().getModel("userModel");
            return oU ? (oU.getProperty("/email") || oU.getProperty("/Username") || "") : "";
        },

        // Call chat() to (re)generate the document HTML. sPrompt empty = fresh
        // generation; non-empty = a modification request. fnDone(ok) fires after.
        _generate: function (sPrompt, fnDone) {
            var oM = this._model();
            var aid = oM.getProperty("/assessmentID"), pid = oM.getProperty("/projectID");
            if (!aid || !pid) { MessageToast.show("Missing object context"); return; }
            oM.setProperty("/busy", true);
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/chat", {
                method: "POST",
                urlParameters: {
                    assessmentID: aid, projectID: pid,
                    docType: oM.getProperty("/docType"), user: this._user(),
                    prompt: sPrompt || "", model: oM.getProperty("/model") || "",
                    deep: oM.getProperty("/deep") === true
                    // NOTE: the current draft is NOT sent from here. UI5 puts action
                    // params in the URL query, so a large doc bloated the URL and
                    // dropped other params (e.g. model -> fell back to the default).
                    // The chat handler loads the current draft server-side instead.
                },
                success: function (r) {
                    var d = r.chat || r;
                    oM.setProperty("/busy", false);
                    // relevance === false => the assistant answered a QUESTION; it did
                    // NOT change the document. Do not touch docHtml, the version, or the
                    // picker -- just hand the answer back to the chat panel.
                    if (d.relevance === false) {
                        if (fnDone) { fnDone(true, { modified: false, text: d.aiResponse || "" }); }
                        return;
                    }
                    // A document was generated/modified: show it. This is a working
                    // DRAFT, not a saved version -- it appears in the picker only after
                    // the user presses Save. Clear any picker selection and the stale
                    // feedback highlight so they reflect the new content.
                    oM.setProperty("/docHtml", d.aiResponse || "");
                    oM.setProperty("/responseID", d.responseID);
                    oM.setProperty("/selectedVersion", null);
                    oM.setProperty("/fbVote", null);
                    oM.setProperty("/started", true);
                    if (fnDone) { fnDone(true, { modified: true, text: d.aiResponse || "" }); }
                }.bind(this),
                error: function (oError) {
                    oM.setProperty("/busy", false);
                    // Show the specific backend reason (no analysis, timed out, etc.)
                    // rather than a blanket message.
                    var sMsg = "Could not generate the document. The document service may be unavailable.";
                    try { sMsg = JSON.parse(oError.responseText).error.message.value || sMsg; } catch (e) { /* keep default */ }
                    MessageBox.error(sMsg);
                    if (fnDone) { fnDone(false); }
                }
            });
        },

        onSendChat: function () {
            var oM = this._model();
            var sPrompt = (oM.getProperty("/draft") || "").trim();
            if (!sPrompt) { return; }
            var aMsgs = oM.getProperty("/messages").slice();
            aMsgs.push({ role: "user", text: sPrompt });
            aMsgs.push({ role: "ai", text: "Working…" });
            oM.setProperty("/messages", aMsgs);
            oM.setProperty("/draft", "");
            this._generate(sPrompt, function (ok, res) {
                var a = oM.getProperty("/messages").slice();
                var sText;
                if (!ok) { sText = "Sorry, that request failed."; }
                else if (res && res.modified) { sText = "Document updated."; }
                // A question: show the assistant's answer in the chat (HTML is rendered
                // by the FormattedText in the message factory). The document is untouched.
                else { sText = (res && res.text) || "No changes were made to the document."; }
                a[a.length - 1] = { role: "ai", text: sText };
                oM.setProperty("/messages", a);
            });
        },

        // First-time generation. Kept separate from Regenerate so the page can
        // stay idle until the user chooses a doc type + model and presses Generate.
        onGenerate: function () {
            var oM = this._model();
            oM.setProperty("/messages", []);
            oM.setProperty("/started", true);
            this._generate("");
        },

        onDocTypeChange: function () {
            var oM = this._model();
            oM.setProperty("/messages", []);
            // Switching doc type shows that type's own version history. Load its
            // latest snapshot if any; otherwise reset to the Generate empty state.
            oM.setProperty("/docHtml", "");
            oM.setProperty("/started", false);
            oM.setProperty("/selectedVersion", null);
            oM.setProperty("/versions", []);
            this._loadVersions(true);
        },

        onRegenerate: function () {
            this._model().setProperty("/messages", []);
            this._model().setProperty("/started", true);
            this._generate("");
        },

        onToggleAssistant: function () {
            var oM = this._model();
            oM.setProperty("/assistantOpen", !oM.getProperty("/assistantOpen"));
        },

        // Thumbs on the generated document. Submits via the unified SubmitFeedback
        // (DOCGEN_CHAT source); highlights the chosen thumb.
        onDocFeedback: function (oEvent) {
            var oM = this._model();
            var bUp = oEvent.getSource().getId().indexOf("docFbUp") > -1;
            oM.setProperty("/fbVote", bUp ? "up" : "down");
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/SubmitFeedback", {
                method: "POST",
                urlParameters: {
                    source: "DOCGEN_CHAT",
                    assessmentID: parseInt(oM.getProperty("/assessmentID"), 10) || 0,
                    projectID: parseInt(oM.getProperty("/projectID"), 10) || 0,
                    // Vote against the saved version when one is loaded (so it persists
                    // on reopen); otherwise against the current draft response.
                    chatID: parseInt(oM.getProperty("/selectedVersion") || oM.getProperty("/responseID"), 10) || 0,
                    docType: oM.getProperty("/docType") || "",
                    upvote: bUp ? 1 : 0, downvote: bUp ? 0 : 1, comment: "", user: this._user()
                },
                success: function () { MessageToast.show("Thanks for the feedback"); },
                error: function () { /* local/no-service: vote highlight still stands */ }
            });
        },

        onDownload: function () {
            var oM = this._model();
            var aid = oM.getProperty("/assessmentID"), pid = oM.getProperty("/projectID");
            oM.setProperty("/busy", true);
            var oDataModel = this.getOwnerComponent().getModel();
            oDataModel.callFunction("/generateDoc", {
                method: "POST",
                urlParameters: {
                    assessmentID: aid, projectID: pid, docType: oM.getProperty("/docType"),
                    user: this._user(), prompt: "",
                    lastResponse: oM.getProperty("/docHtml") || "",
                    model: oM.getProperty("/model") || ""
                },
                success: function (r) {
                    oM.setProperty("/busy", false);
                    var d = r.generateDoc || r;
                    if (d && d.content) { this._downloadDocx(d.content, d.filename || "document"); }
                    else { MessageToast.show("No document returned"); }
                }.bind(this),
                error: function () {
                    oM.setProperty("/busy", false);
                    MessageBox.error("Could not download the document.");
                }
            });
        },

        // Decode base64 .docx and trigger a browser download.
        _downloadDocx: function (sBase64, sName) {
            var sBin = atob(sBase64);
            var aBytes = [];
            for (var offset = 0; offset < sBin.length; offset += 1024) {
                var slice = sBin.slice(offset, offset + 1024);
                var nums = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) { nums[i] = slice.charCodeAt(i); }
                aBytes.push(new Uint8Array(nums));
            }
            var oBlob = new Blob(aBytes, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
            var oLink = document.createElement("a");
            oLink.href = URL.createObjectURL(oBlob);
            oLink.download = sName + ".docx";
            oLink.click();
            URL.revokeObjectURL(oLink.href);
        }
    });
});
