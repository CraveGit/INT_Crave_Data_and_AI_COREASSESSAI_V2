sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/ui/Device",
  ],
  function (BaseController, JSONModel, Fragment, MessageToast, Device) {
    "use strict";

    return BaseController.extend("com.crave.coreassessv2.controller.App", {
      onInit: function () {
        var DataModel = this.getOwnerComponent().getModel()
        DataModel.callFunction("/GetUserRole", {
          success: function (response) {
            // Legacy view controllers branch on sap.User being ADMIN/USER/INT_USER
            // only. OWNER and SUPERUSER are newer roles they do not understand, so
            // map them to ADMIN here (full access) to avoid falling through every
            // branch (which left pages stuck loading). The real role is kept in
            // visibleModel/userModel below for the Admin Panel gating.
            var _role = response.GetUserRole.role;
            sap.User = (_role === "OWNER" || _role === "SUPERUSER") ? "ADMIN" : _role;
            var oUserModel = new sap.ui.model.json.JSONModel();
            oUserModel.setData({
              initials: response.GetUserRole.initials,
              displayName: response.GetUserRole.displayName,
              email: response.GetUserRole.email,
              Username: response.GetUserRole.username,
              companyID: response.GetUserRole.companyID,
              allowedObjects: response.GetUserRole.allowedObjects,
              uploadedObjects: response.GetUserRole.uploadedObjects
            });
            this.getOwnerComponent().setModel(oUserModel, "userModel");

            var visible = new sap.ui.model.json.JSONModel();
            visible.setData({
              role: response.GetUserRole.role
            });
            this.getOwnerComponent().setModel(visible, "visibleModel");

          }.bind(this),
          error: function (error) {
            sap.m.MessageToast.show("error while fetching user")
          }.bind(this)
        });

        var theme = new JSONModel({
          state: false, width: "", height: ""
        });
        this.getOwnerComponent().setModel(theme, "themeModel");

        // Drives the toggle's icon/tooltip. Mirrors ToolPage.sideExpanded, which
        // has no binding of its own. All three (model, ToolPage, SideNavigation)
        // must start on the same value or the first render shows the wrong arrow.
        // Expanded by default, matching expanded="true" in the view; phones start
        // collapsed since the panel overlays the content there.
        var bStartExpanded = !Device.system.phone;
        this.getOwnerComponent().setModel(new JSONModel({ expanded: bStartExpanded }), "sideNavModel");
        this._setSideExpanded(bStartExpanded);
        this.onNavmenuHome();

        // Warn before reload/close while a background analysis is in progress --
        // it lives in this tab, so leaving would stop it.
        var oComp = this.getOwnerComponent();
        window.addEventListener("beforeunload", function (e) {
          var oF = oComp.getModel("foldersModel");
          if (oF && oF.getProperty("/running") === true) {
            e.preventDefault();
            e.returnValue = "";   // triggers the browser's native leave-site prompt
            return "";
          }
        });

        // Seed foldersModel up front so the header "Analysis jobs" icon has a real
        // model on first render and is DISABLED (running:false) before any upload.
        // Without this the enabled-binding had no model at load and the button
        // defaulted to enabled. ListPage reuses this model if it already exists.
        if (!oComp.getModel("foldersModel")) {
          oComp.setModel(new JSONModel({ folderArray: [], running: false, uploadDone: false }), "foldersModel");
        }

        // The header icon is always visible; it is only ENABLED while objects are
        // actually queued/running (no appear/disappear flicker). On every page load,
        // re-check the real queue and clear a stale running flag so the icon can
        // never be wrongly enabled after navigation.
        sap.ui.core.UIComponent.getRouterFor(this).attachRouteMatched(this._syncJobIcon, this);
        this._syncJobIcon();
      },

      _syncJobIcon: function () {
        var oF = this.getOwnerComponent().getModel("foldersModel");
        if (!oF || oF.getProperty("/running") !== true) { return; }
        // running===true but nothing is actually Pending/Uploading => stale; clear
        // it so the icon disables. (A live run keeps its items queued, so it stays.)
        var aArr = oF.getProperty("/folderArray") || [];
        var bQueued = aArr.some(function (f) {
          var s = String((f && f.status) || "").toLowerCase();
          return s === "pending" || s === "uploading";
        });
        if (!bQueued) { oF.setProperty("/running", false); }
      },
      // ToolPage is the single source of truth: its setSideExpanded already
      // forwards to SideNavigation.setExpanded. Calling both separately let the
      // two properties drift apart, and since setExpanded early-returns when the
      // value is unchanged, the first click only re-synced them -- which is why
      // the toggle needed two presses after the panel had been collapsed by
      // anything else.
      onSideNavButtonPress: function () {
        this._setSideExpanded(!this.byId("toolPage").getSideExpanded());
      },

      // Single place that changes panel state, so ToolPage and the model that
      // drives the toggle icon can never drift apart.
      _setSideExpanded: function (bExpanded) {
        this.byId("toolPage").setSideExpanded(bExpanded);
        this.getOwnerComponent().getModel("sideNavModel").setProperty("/expanded", bExpanded);
      },
      onNavmenuHome: function () {
        var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        oRouter.navTo("RouteListPage");
      },
      onItemSelect: function (oEvent) {
        var sKey = oEvent.getParameter('item').getKey();
        if (!sKey) { return; }
        // SAC Report opens its dashboard in a new tab. Handled here (not a native
        // href) so the nav item renders as a plain button with no external-link
        // arrow, matching the other buttons.
        if (sKey === "sacReport") {
          window.open("https://craveinfotech.us10.hcs.cloud.sap/sap/fpa/ui/app.html#/story2&/s2/D9E881016A0837ED4A67E2938F5B791D/?url_api=true&preview=true&mode=embed&view_id=story2", "_blank");
          return;
        }
        // On desktop the panel is owned solely by the header toggle, so
        // navigating leaves it alone. On phones it overlays the content, so it
        // must close or it hides the page just opened -- routed through the same
        // helper as the toggle to keep ToolPage and the model in step.
        if (Device.system.phone) { this._setSideExpanded(false); }
        var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        switch (sKey) {
          case "uploadFile":
            oRouter.navTo("RouteListPage");
            break;
          case "projects":
            oRouter.navTo("Company");
            break;
          case "customPrompts":
            oRouter.navTo("CustomPrompt");
            break;
          case "config":
            oRouter.navTo("Configuration");
            break;
          case "adminPanel":
            oRouter.navTo("AdminPanel");
            break;
          case "innovate":
            oRouter.navTo("Innovate");
            break;
          case "raiseTicket":
            oRouter.navTo("RaiseTicket");
            break;
          case "roiInput":
            oRouter.navTo("ROIInput");
            break;
          case "roiOutput":
            oRouter.navTo("ROIOutput");
            break;
        }
      },

      // ---- Background analysis notification (header) ----
      onOpenUploadJobs: function (oEvent) {
        var oSource = oEvent.getSource();
        if (this._pUploadJobs) {
          this._pUploadJobs.then(function (oPop) { oPop.openBy(oSource); });
          return;
        }
        this._pUploadJobs = Fragment.load({
          id: this.getView().getId(),
          name: "com.crave.coreassessv2.view.UploadNotification",
          controller: this
        }).then(function (oPop) {
          this.getView().addDependent(oPop);
          return oPop;
        }.bind(this));
        this._pUploadJobs.then(function (oPop) { oPop.openBy(oSource); });
      },

      onCloseUploadJobs: function () {
        if (this._pUploadJobs) { this._pUploadJobs.then(function (oPop) { oPop.close(); }); }
        // Dismiss clears the finished job so the header badge disappears.
        var oFolders = this.getOwnerComponent().getModel("foldersModel");
        if (oFolders && oFolders.getProperty("/running") !== true) {
          oFolders.setProperty("/uploadDone", false);
          oFolders.setProperty("/folderArray", []);
          oFolders.refresh(true);
        }
      },

      // Cancel from the header: sets the flag the ListPage upload loop checks, so
      // no further objects start analysing.
      onCancelUploadJobs: function () {
        var oFolders = this.getOwnerComponent().getModel("foldersModel");
        if (oFolders) { oFolders.setProperty("/cancelled", true); }
        MessageToast.show("Cancelling after the current object finishes...");
      },

      formatUploadStatusState: function (sStatus) {
        switch (sStatus) {
          case "Success": return "Success";
          case "Failed": return "Error";
          case "Uploading": return "Information";
          case "Cancelled": return "Warning";
          default: return "None";
        }
      },
      formatUploadStatusIcon: function (sStatus) {
        switch (sStatus) {
          case "Success": return "sap-icon://accept";
          case "Failed": return "sap-icon://error";
          case "Uploading": return "sap-icon://pending";
          case "Cancelled": return "sap-icon://cancel";
          default: return "sap-icon://circle-task-2";
        }
      },

      onAvatarPressed: function (oEvent) {
        var oSource = oEvent.getSource();
        if (this._pProfileDialog) {
          this._pProfileDialog.then(function (oPopover) { oPopover.openBy(oSource); });
          return;
        }
        this._pProfileDialog = Fragment.load({
          id: this.getView().getId(),
          name: "com.crave.coreassessv2.view.ProfileSettings",
          controller: this
        }).then(function (oPopover) {
          this.getView().addDependent(oPopover);
          return oPopover;
        }.bind(this));
        this._pProfileDialog.then(function (oPopover) { oPopover.openBy(oSource); });
      },

      onCloseProfile: function () {
        if (this._pProfileDialog) {
          this._pProfileDialog.then(function (oPopover) { oPopover.close(); });
        }
      },

      // Fires on focus-out (and Enter). Persists the name, then refreshes the
      // model so the header greeting and avatar initials update without a reload.
      onDisplayNameChange: function (oEvent) {
        var sValue = (oEvent.getParameter("value") || "").trim();
        var oUserModel = this.getOwnerComponent().getModel("userModel");
        var sCurrent = oUserModel.getProperty("/displayName");
        if (sValue === sCurrent) { return; }
        if (!sValue) {
          oUserModel.setProperty("/displayName", sCurrent);
          MessageToast.show("Display name cannot be empty");
          return;
        }
        var oDataModel = this.getOwnerComponent().getModel();
        oDataModel.callFunction("/SetDisplayName", {
          method: "POST",
          urlParameters: { DISPLAY_NAME: sValue },
          success: function (oResponse) {
            if (oResponse.SetDisplayName === false || oResponse.SetDisplayName === "false") {
              oUserModel.setProperty("/displayName", sCurrent);
              MessageToast.show("Could not save display name");
              return;
            }
            oUserModel.setProperty("/displayName", sValue);
            oUserModel.setProperty("/initials", this._deriveInitials(sValue));
            this._flashSaved();
          }.bind(this),
          error: function () {
            oUserModel.setProperty("/displayName", sCurrent);
            MessageToast.show("Could not save display name");
          }
        });
      },

      // Green border on the input for ~1.4s. Timer is tracked so rapid saves
      // cannot leave the class stuck on from an earlier, already-cleared flash.
      _flashSaved: function () {
        var oInput = this.byId("displayNameInput");
        if (!oInput) { return; }
        if (this._iFlashTimer) { clearTimeout(this._iFlashTimer); }
        oInput.addStyleClass("craSaveFlash");
        this._iFlashTimer = setTimeout(function () {
          if (!oInput.bIsDestroyed) { oInput.removeStyleClass("craSaveFlash"); }
          this._iFlashTimer = null;
        }.bind(this), 1400);
      },

      // Mirrors getInitials() in cat-service.js and the Company/Projects tables:
      // first two characters of the name ("Contoso" -> "CO").
      _deriveInitials: function (sValue) {
        return String(sValue || "").trim().slice(0, 2).toUpperCase();
      },

      // Avatar initials from the display name. sap.m.Avatar only accepts 1-3
      // letters (else it shows fallbackIcon), so non-letters are stripped first.
      // Falls back to the email's local part so a user without a set display name
      // still gets initials instead of the permanent person icon.
      formatAvatarInitials: function (sDisplayName) {
        var sName = String(sDisplayName || "").trim();
        if (!sName || sName.toLowerCase() === "user") {
          var oUserModel = this.getOwnerComponent().getModel("userModel");
          var sEmail = oUserModel ? (oUserModel.getProperty("/email") || "") : "";
          sName = String(sEmail).split("@")[0];
        }
        var sLetters = sName.replace(/[^a-zA-Z]/g, "");
        return sLetters ? sLetters.slice(0, 2).toUpperCase() : "";
      },

      // Logout hits the approuter's logout endpoint (configured in
      // approuter/xs-app.json), which clears the XSUAA session and returns to the
      // login. Locally (mocked auth) there is no such endpoint, so just reload.
      onLogout: function () {
        if (this._pProfileDialog) {
          this._pProfileDialog.then(function (oPopover) { oPopover.close(); });
        }
        if (Device.system && window.location.hostname === "localhost") {
          window.location.reload();
          return;
        }
        window.location.href = "/do/logout";
      }
    });
  }

);
