"use strict";

const cds = require("@sap/cds");
const proxy = require("@sap/cds-odata-v2-adapter-proxy");
const express = require('express');
const cors = require('cors')

cds.on("bootstrap", async app => {
    app.use(cors())
    // cov2ap parses the /v2/* body itself with its own limit (default ~100kb),
    // which rejected large ABAP objects with 413 "request entity too large".
    // Raise it so big source files can be uploaded/analysed.
    app.use(proxy({ bodyParserLimit: '50mb', fileUploadSizeLimit: 52428800 }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb',  extended: true }));
});

module.exports = cds.server; 
