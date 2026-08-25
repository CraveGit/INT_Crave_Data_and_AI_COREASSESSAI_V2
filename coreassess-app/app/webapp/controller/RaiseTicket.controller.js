sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("com.crave.coreassessv2.controller.RaiseTicket", {

        onInit: function () {
            this.getView().setModel(new JSONModel({ title: "", description: "", tickets: [] }), "ticketModel");
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("RaiseTicket").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function () { this.onRefreshTickets(); },

        formatTicketState: function (sStatus) {
            switch (String(sStatus || "").toUpperCase()) {
                case "CLOSED": return "Success";
                case "ACKNOWLEDGED": return "Information";
                default: return "Warning";   // OPEN
            }
        },

        onRefreshTickets: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oT = this.getView().getModel("ticketModel");
            oModel.callFunction("/GetMyTickets", {
                method: "GET",
                success: function (r) { oT.setProperty("/tickets", r.results || []); },
                error: function () { /* ignore */ }
            });
        },

        onSubmitTicket: function () {
            var oT = this.getView().getModel("ticketModel");
            var sTitle = (oT.getProperty("/title") || "").trim();
            if (!sTitle) { MessageToast.show("Title is required"); return; }
            var oModel = this.getOwnerComponent().getModel();
            oModel.callFunction("/RaiseTicket", {
                method: "POST",
                urlParameters: { title: sTitle, description: oT.getProperty("/description") || "" },
                success: function (r) {
                    if (r.RaiseTicket === "raised") {
                        MessageToast.show("Ticket raised");
                        oT.setProperty("/title", "");
                        oT.setProperty("/description", "");
                        this.onRefreshTickets();
                    } else {
                        MessageToast.show("Could not raise the ticket");
                    }
                }.bind(this),
                error: function () { MessageBox.error("Could not raise the ticket"); }
            });
        }
    });
});
