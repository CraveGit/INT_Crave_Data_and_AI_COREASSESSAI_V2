sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ushell/Container",
    "com/crave/coreassessv2/model/models"
],
    function (UIComponent, Device, Container, models) {
        "use strict";

        return UIComponent.extend("com.crave.coreassessv2.Component", {
            metadata: {
                manifest: "json"
            },


            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // enable routing
                this.getRouter().initialize();

                // set the device model
                this.setModel(models.createDeviceModel(), "device");
                //    For Images
                var rootPath = jQuery.sap.getModulePath("com.crave.coreassessv2");
                var oImgModel = new sap.ui.model.json.JSONModel({
                    Path: rootPath
                });
                this.setModel(oImgModel, "ImgModel");
                sap.ImgModel = this.getModel("ImgModel");

                // To pass data from one page to another
                var dataModel = new sap.ui.model.json.JSONModel({
                    dataToPass: "", objectLength: "", projectData: "", companyData: ""
                });
                this.setModel(dataModel, "dataModel");

                this.redirectOnRefresh();
                //     var jQueryScript = document.createElement('script');
                // jQueryScript.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.10.0/jszip.js');
                // document.head.appendChild(jQueryScript);


                // var jQueryScript = document.createElement('script');
                // jQueryScript.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.10.0/xlsx.js');
                // document.head.appendChild(jQueryScript);


                // var jQueryScript = document.createElement('script');
                // jQueryScript.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.js');
                // document.head.appendChild(jQueryScript);

                // sap.ui.loader.config({
                //     shim: {
                //         "com/crave/coreassessv2/lib/exceljs.min.js": {
                //             amd: true, // When being required, UI5 temporarily disables the global `define` to allow the third party lib register its global name to `globalThis` or `window`.
                //             exports: "exceljs", // Name of the global variable under which SheetJS exports its module value
                //         },
                //     },
                // });


            },
            redirectOnRefresh: function () {
                const oRouter = this.getRouter();
                const sCurrentHash = window.location.hash;
                const sHomeRoute = "RouteListPage";

                if (!sCurrentHash.includes(sHomeRoute)) {
                    oRouter.navTo(sHomeRoute, {}, true);
                }
            }


        });
    }
);