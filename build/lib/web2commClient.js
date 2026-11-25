"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var web2commClient_exports = {};
__export(web2commClient_exports, {
  Web2CommClient: () => Web2CommClient,
  buildGetDpSoapBody: () => buildGetDpSoapBody,
  buildWriteDpSoapBody: () => buildWriteDpSoapBody,
  parseGetDpResponseXml: () => parseGetDpResponseXml,
  parseOidEnumsXml: () => parseOidEnumsXml,
  parseOidNamesXml: () => parseOidNamesXml
});
module.exports = __toCommonJS(web2commClient_exports);
var import_digest_fetch = __toESM(require("digest-fetch"));
var import_xml2js = require("xml2js");
var import_util = require("./util");
const DEFAULT_GET_OPTIONS = {
  method: "get",
  headers: {
    Connection: "Keep-Alive",
    Accept: "text/xml",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    "Content-Type": "text/xml; charset=utf-8"
  }
};
const buildGetDpSoapBody = (oids) => `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" 
xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" 
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
xmlns:ns="http://ws01.lom.ch/soap/">
 <SOAP-ENV:Body>
   <ns:getDpRequest>
    <ref>
     <oid>${oids}</oid>
     <prop/>
    </ref>
    <startIndex>0</startIndex>
    <count>-1</count>
   </ns:getDpRequest>
 </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
const buildWriteDpSoapBody = (oid, value) => {
  const ind = (0, import_util.extractOidIndex)(oid);
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" 
xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" 
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
xmlns:ns="http://ws01.lom.ch/soap/">
<SOAP-ENV:Body>
  <ns:writeDpRequest>
   <ref>
    <oid>${oid}</oid>
    <prop/>
   </ref>
   <dp>
    <index>${ind}</index>
    <name/>
    <prop/>
    <desc/>
    <value>${value}</value>
    <unit/>
    <timestamp>0</timestamp>
   </dp>
  </ns:writeDpRequest>   
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
};
const parseOidNamesXml = async (xmlContent) => {
  var _a, _b, _c, _d, _e;
  const oidNamesDict = {};
  const result = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const groups = (_a = result == null ? void 0 : result.VarIdentTexte) == null ? void 0 : _a.gn;
  if (!Array.isArray(groups)) {
    return oidNamesDict;
  }
  for (const gnEntry of groups) {
    const gn = (0, import_util.padId)(String((_c = (_b = gnEntry == null ? void 0 : gnEntry.$) == null ? void 0 : _b.id) != null ? _c : ""));
    const members = gnEntry == null ? void 0 : gnEntry.mn;
    if (!Array.isArray(members)) {
      continue;
    }
    for (const mnEntry of members) {
      const mn = (0, import_util.padId)(String((_e = (_d = mnEntry == null ? void 0 : mnEntry.$) == null ? void 0 : _d.id) != null ? _e : ""));
      const key = `${gn}:${mn}`;
      oidNamesDict[key] = mnEntry._;
    }
  }
  return oidNamesDict;
};
const parseOidEnumsXml = async (xmlContent) => {
  var _a, _b, _c, _d, _e, _f, _g;
  const oidEnumsDict = {};
  const result = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const groups = (_a = result == null ? void 0 : result.AufzaehlTexte) == null ? void 0 : _a.gn;
  if (!Array.isArray(groups)) {
    return oidEnumsDict;
  }
  for (const gnEntry of groups) {
    const gn = (0, import_util.padId)(String((_c = (_b = gnEntry == null ? void 0 : gnEntry.$) == null ? void 0 : _b.id) != null ? _c : ""));
    const members = gnEntry == null ? void 0 : gnEntry.mn;
    if (!Array.isArray(members)) {
      continue;
    }
    for (const mnEntry of members) {
      const mn = (0, import_util.padId)(String((_e = (_d = mnEntry == null ? void 0 : mnEntry.$) == null ? void 0 : _d.id) != null ? _e : ""));
      const key = `${gn}:${mn}`;
      const enumArray = [];
      const enums = mnEntry == null ? void 0 : mnEntry.enum;
      if (Array.isArray(enums)) {
        for (const enumEntry of enums) {
          const index = parseInt(String((_g = (_f = enumEntry == null ? void 0 : enumEntry.$) == null ? void 0 : _f.id) != null ? _g : ""), 10);
          if (!Number.isNaN(index)) {
            enumArray[index] = enumEntry._;
          }
        }
      }
      oidEnumsDict[key] = enumArray;
    }
  }
  return oidEnumsDict;
};
const parseGetDpResponseXml = async (xmlContent) => {
  var _a, _b, _c, _d, _e, _f;
  const jsonResult = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const dpCfg = (_f = (_e = (_d = (_c = (_b = (_a = jsonResult == null ? void 0 : jsonResult["SOAP-ENV:Envelope"]) == null ? void 0 : _a["SOAP-ENV:Body"]) == null ? void 0 : _b[0]) == null ? void 0 : _c["ns:getDpResponse"]) == null ? void 0 : _d[0]) == null ? void 0 : _e.dpCfg) != null ? _f : [];
  return dpCfg.map((dp) => {
    var _a2, _b2, _c2, _d2, _e2, _f2, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    return {
      name: String((_b2 = (_a2 = dp.name) == null ? void 0 : _a2[0]) != null ? _b2 : ""),
      prop: String((_d2 = (_c2 = dp.prop) == null ? void 0 : _c2[0]) != null ? _d2 : ""),
      desc: String((_f2 = (_e2 = dp.desc) == null ? void 0 : _e2[0]) != null ? _f2 : ""),
      value: String((_h = (_g = dp.value) == null ? void 0 : _g[0]) != null ? _h : ""),
      unit: String((_j = (_i = dp.unit) == null ? void 0 : _i[0]) != null ? _j : ""),
      step: String((_l = (_k = dp.step) == null ? void 0 : _k[0]) != null ? _l : ""),
      min: String((_n = (_m = dp.minValue) == null ? void 0 : _m[0]) != null ? _n : ""),
      max: String((_p = (_o = dp.maxValue) == null ? void 0 : _o[0]) != null ? _p : "")
    };
  });
};
class Web2CommClient {
  client;
  deviceInfoUrl;
  wsUrl;
  serverIP;
  /**
   * Creates a new Web2CommClient instance.
   *
   * @param serverIP - IP address or hostname of the Ochsner Roomterminal
   * @param username - Digest auth username
   * @param password - Digest auth password
   */
  constructor(serverIP, username, password) {
    this.serverIP = serverIP;
    this.deviceInfoUrl = `http://${serverIP}/api/1.0/info/deviceinfo`;
    this.wsUrl = `http://${serverIP}/ws`;
    this.client = new import_digest_fetch.default(username, password);
  }
  /**
   * Queries the device info endpoint to verify connectivity and credentials.
   *
   * @returns Parsed device info object (`device` and `version`)
   */
  async fetchDeviceInfo() {
    const response = await this.client.fetch(this.deviceInfoUrl, DEFAULT_GET_OPTIONS);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }
  /**
   * Reads one or more OIDs via SOAP `getDpRequest`.
   *
   * @param oids - Semicolon-separated OID string
   * @returns Raw XML response string and parsed data points
   */
  async readDataPoints(oids) {
    const body = buildGetDpSoapBody(oids);
    const options = {
      method: "post",
      body,
      headers: {
        Connection: "Keep-Alive",
        Accept: "text/xml",
        Pragma: "no-cache",
        SOAPAction: "http://ws01.lom.ch/soap/getDP",
        "Cache-Control": "no-cache",
        "Content-Type": "text/xml; charset=utf-8",
        "Content-length": body.length
      }
    };
    const response = await this.client.fetch(this.wsUrl, options);
    if (!response.ok) {
      throw new Error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
    }
    const rawXml = await response.text();
    const dataPoints = await parseGetDpResponseXml(rawXml);
    return { rawXml, dataPoints };
  }
  /**
   * Writes a value to an OID via SOAP `writeDpRequest`.
   *
   * @param oid - OID path string
   * @param value - Value to write
   * @returns Object with SOAP request body and HTTP response status
   */
  async writeDataPoint(oid, value) {
    const body = buildWriteDpSoapBody(oid, value);
    const options = {
      method: "post",
      body,
      headers: {
        Connection: "Keep-Alive",
        Accept: "*/*",
        Pragma: "no-cache",
        SOAPAction: "http://ws01.lom.ch/soap/writeDP",
        "Cache-Control": "no-cache",
        "Content-Type": "text/xml; charset=utf-8",
        "Content-length": body.length
      }
    };
    const response = await this.client.fetch(this.wsUrl, options);
    return {
      body,
      ok: response.ok === true,
      statusText: response.statusText
    };
  }
  /**
   * Downloads and parses `VarIdentTexte_de.xml` from the device.
   *
   * @returns Dictionary mapping `"gn:mn"` to variable names
   */
  async fetchOidNames() {
    const response = await this.client.fetch(
      `http://${this.serverIP}/res/xml/VarIdentTexte_de.xml`,
      DEFAULT_GET_OPTIONS
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const xmlContent = await response.text();
    return parseOidNamesXml(xmlContent);
  }
  /**
   * Downloads and parses `AufzaehlTexte_de.xml` from the device.
   *
   * @returns Dictionary mapping `"gn:mn"` to arrays of enum labels
   */
  async fetchOidEnums() {
    const response = await this.client.fetch(
      `http://${this.serverIP}/res/xml/AufzaehlTexte_de.xml`,
      DEFAULT_GET_OPTIONS
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const xmlContent = await response.text();
    return parseOidEnumsXml(xmlContent);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Web2CommClient,
  buildGetDpSoapBody,
  buildWriteDpSoapBody,
  parseGetDpResponseXml,
  parseOidEnumsXml,
  parseOidNamesXml
});
//# sourceMappingURL=web2commClient.js.map
