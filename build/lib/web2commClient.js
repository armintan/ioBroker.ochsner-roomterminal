"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var web2commClient_exports = {};
__export(web2commClient_exports, {
  DEFAULT_REQUEST_TIMEOUT_MS: () => DEFAULT_REQUEST_TIMEOUT_MS,
  Web2CommClient: () => Web2CommClient,
  buildGetDpSoapBody: () => buildGetDpSoapBody,
  buildWriteDpSoapBody: () => buildWriteDpSoapBody,
  parseGetDpResponseXml: () => parseGetDpResponseXml,
  parseOidEnumsXml: () => parseOidEnumsXml,
  parseOidNamesXml: () => parseOidNamesXml
});
module.exports = __toCommonJS(web2commClient_exports);
var import_xml2js = require("xml2js");
var import_util = require("./util");
const DEFAULT_REQUEST_TIMEOUT_MS = 1e4;
const extractXmlText = (node) => {
  if (typeof node === "string") {
    return node;
  }
  if (node && typeof node === "object" && "_" in node) {
    const text = node._;
    return typeof text === "string" ? text : "";
  }
  return "";
};
const createGetOptions = (accept, signal) => ({
  method: "GET",
  headers: {
    Connection: "Keep-Alive",
    Accept: accept,
    Pragma: "no-cache",
    "Cache-Control": "no-cache"
  },
  ...signal ? { signal } : {}
});
const buildGetDpSoapBody = (oids) => `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" 
xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" 
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
xmlns:ns="http://ws01.lom.ch/soap/">
 <SOAP-ENV:Body>
   <ns:getDpRequest>
    <ref>
     <oid>${(0, import_util.escapeXml)(oids)}</oid>
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
    <oid>${(0, import_util.escapeXml)(oid)}</oid>
    <prop/>
   </ref>
   <dp>
    <index>${(0, import_util.escapeXml)(ind)}</index>
    <name/>
    <prop/>
    <desc/>
    <value>${(0, import_util.escapeXml)(String(value))}</value>
    <unit/>
    <timestamp>0</timestamp>
   </dp>
  </ns:writeDpRequest>   
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
};
const extractSoapFault = (parsedXml) => {
  var _a, _b, _c;
  const envelope = parsedXml == null ? void 0 : parsedXml["SOAP-ENV:Envelope"];
  const bodyList = envelope == null ? void 0 : envelope["SOAP-ENV:Body"];
  if (!Array.isArray(bodyList) || !bodyList[0] || typeof bodyList[0] !== "object") {
    return void 0;
  }
  const body = bodyList[0];
  const faultList = (_a = body["SOAP-ENV:Fault"]) != null ? _a : body.Fault;
  if (!Array.isArray(faultList) || !faultList[0] || typeof faultList[0] !== "object") {
    return void 0;
  }
  const fault = faultList[0];
  const faultString = extractXmlText((_b = fault.faultstring) == null ? void 0 : _b[0]);
  const faultCode = extractXmlText((_c = fault.faultcode) == null ? void 0 : _c[0]);
  if (faultString && faultCode) {
    return `${faultCode}: ${faultString}`;
  }
  return faultString || faultCode || "SOAP Fault";
};
const parseOidNamesXml = async (xmlContent) => {
  var _a, _b, _c, _d;
  const oidNamesDict = {};
  const result = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const root = result == null ? void 0 : result.VarIdentTexte;
  const groups = root == null ? void 0 : root.gn;
  if (!Array.isArray(groups)) {
    return oidNamesDict;
  }
  for (const gnEntry of groups) {
    const gnObj = gnEntry;
    const gnRaw = ((_b = (_a = gnObj == null ? void 0 : gnObj.$) == null ? void 0 : _a.id) != null ? _b : "").trim();
    if (!gnRaw) {
      continue;
    }
    const gn = (0, import_util.padId)(gnRaw);
    const members = gnObj == null ? void 0 : gnObj.mn;
    if (!Array.isArray(members)) {
      continue;
    }
    for (const mnEntry of members) {
      const mnObj = mnEntry;
      const mnRaw = ((_d = (_c = mnObj == null ? void 0 : mnObj.$) == null ? void 0 : _c.id) != null ? _d : "").trim();
      const text = extractXmlText(mnEntry);
      if (!mnRaw || !text) {
        continue;
      }
      const mn = (0, import_util.padId)(mnRaw);
      oidNamesDict[`${gn}:${mn}`] = text;
    }
  }
  return oidNamesDict;
};
const parseOidEnumsXml = async (xmlContent) => {
  var _a, _b, _c, _d, _e, _f;
  const oidEnumsDict = {};
  const result = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const root = result == null ? void 0 : result.AufzaehlTexte;
  const groups = root == null ? void 0 : root.gn;
  if (!Array.isArray(groups)) {
    return oidEnumsDict;
  }
  for (const gnEntry of groups) {
    const gnObj = gnEntry;
    const gnRaw = ((_b = (_a = gnObj == null ? void 0 : gnObj.$) == null ? void 0 : _a.id) != null ? _b : "").trim();
    if (!gnRaw) {
      continue;
    }
    const gn = (0, import_util.padId)(gnRaw);
    const members = gnObj == null ? void 0 : gnObj.mn;
    if (!Array.isArray(members)) {
      continue;
    }
    for (const mnEntry of members) {
      const mnObj = mnEntry;
      const mnRaw = ((_d = (_c = mnObj == null ? void 0 : mnObj.$) == null ? void 0 : _c.id) != null ? _d : "").trim();
      if (!mnRaw) {
        continue;
      }
      const mn = (0, import_util.padId)(mnRaw);
      const key = `${gn}:${mn}`;
      const enumArray = [];
      const enums = mnObj == null ? void 0 : mnObj.enum;
      if (Array.isArray(enums)) {
        for (const enumEntry of enums) {
          const enumObj = enumEntry;
          const index = parseInt((_f = (_e = enumObj == null ? void 0 : enumObj.$) == null ? void 0 : _e.id) != null ? _f : "", 10);
          const text = extractXmlText(enumEntry);
          if (Number.isInteger(index) && index >= 0 && text.length > 0) {
            enumArray[index] = text;
          }
        }
      }
      oidEnumsDict[key] = enumArray;
    }
  }
  return oidEnumsDict;
};
const parseGetDpResponseXml = async (xmlContent) => {
  const jsonResult = await (0, import_xml2js.parseStringPromise)(xmlContent);
  const fault = extractSoapFault(jsonResult);
  if (fault) {
    throw new Error(`SOAP Fault: ${fault}`);
  }
  const envelope = jsonResult == null ? void 0 : jsonResult["SOAP-ENV:Envelope"];
  const bodyList = envelope == null ? void 0 : envelope["SOAP-ENV:Body"];
  const body = Array.isArray(bodyList) ? bodyList[0] : void 0;
  const responseList = body == null ? void 0 : body["ns:getDpResponse"];
  const responseObj = Array.isArray(responseList) ? responseList[0] : void 0;
  const dpCfg = Array.isArray(responseObj == null ? void 0 : responseObj.dpCfg) ? responseObj.dpCfg : [];
  return dpCfg.map((dp) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
      name: extractXmlText((_a = dp.name) == null ? void 0 : _a[0]),
      prop: extractXmlText((_b = dp.prop) == null ? void 0 : _b[0]),
      desc: extractXmlText((_c = dp.desc) == null ? void 0 : _c[0]),
      value: extractXmlText((_d = dp.value) == null ? void 0 : _d[0]),
      unit: extractXmlText((_e = dp.unit) == null ? void 0 : _e[0]),
      step: extractXmlText((_f = dp.step) == null ? void 0 : _f[0]),
      min: extractXmlText((_g = dp.minValue) == null ? void 0 : _g[0]),
      max: extractXmlText((_h = dp.maxValue) == null ? void 0 : _h[0])
    };
  });
};
class Web2CommClient {
  baseUrl;
  deviceInfoUrl;
  wsUrl;
  username;
  password;
  timeoutMs;
  httpClientPromise;
  activeControllers = /* @__PURE__ */ new Set();
  /**
   * Creates a new Web2CommClient instance.
   *
   * @param serverIP - IP address, hostname, or base URL of the Ochsner Roomterminal
   * @param username - Digest auth username
   * @param password - Digest auth password
   * @param options - Optional timeout and HTTP client overrides
   */
  constructor(serverIP, username, password, options = {}) {
    var _a;
    this.baseUrl = (0, import_util.normalizeBaseUrl)(serverIP);
    this.deviceInfoUrl = `${this.baseUrl}/api/1.0/info/deviceinfo`;
    this.wsUrl = `${this.baseUrl}/ws`;
    this.username = username;
    this.password = password;
    this.timeoutMs = (_a = options.timeoutMs) != null ? _a : DEFAULT_REQUEST_TIMEOUT_MS;
    if (options.httpClient) {
      this.httpClientPromise = Promise.resolve(options.httpClient);
    }
  }
  /**
   * Aborts all currently in-flight HTTP requests (e.g. during adapter unload).
   */
  abort() {
    for (const controller of this.activeControllers) {
      controller.abort(new Error("Request aborted"));
    }
    this.activeControllers.clear();
  }
  /**
   * Lazily loads the ESM `digest-fetch` module via native `import()` so CommonJS output
   * built by esbuild works on all Node.js 20.x versions (including < 20.19).
   */
  getHttpClient() {
    if (!this.httpClientPromise) {
      const nativeImport = new Function("specifier", "return import(specifier)");
      this.httpClientPromise = nativeImport("digest-fetch").then((mod) => {
        const DigestFetchCtor = mod.default;
        return new DigestFetchCtor(this.username, this.password);
      });
    }
    return this.httpClientPromise;
  }
  /**
   * Executes an HTTP request with per-request timeout and abort tracking.
   *
   * @param url - Request URL
   * @param buildOptions - Callback receiving the request's `AbortSignal` and returning fetch options
   * @returns HTTP `Response`
   */
  async fetchWithTimeout(url, buildOptions) {
    const controller = new AbortController();
    this.activeControllers.add(controller);
    const timer = setTimeout(
      () => controller.abort(new Error(`Request timed out after ${this.timeoutMs} ms`)),
      this.timeoutMs
    );
    try {
      const client = await this.getHttpClient();
      if (controller.signal.aborted) {
        throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error("Request aborted");
      }
      return await client.fetch(url, buildOptions(controller.signal));
    } finally {
      clearTimeout(timer);
      this.activeControllers.delete(controller);
    }
  }
  /**
   * Queries the device info endpoint to verify connectivity and credentials.
   *
   * @returns Parsed device info object (`device` and `version`)
   */
  async fetchDeviceInfo() {
    const response = await this.fetchWithTimeout(
      this.deviceInfoUrl,
      (signal) => createGetOptions("application/json", signal)
    );
    if (!response.ok) {
      await response.text().catch(() => void 0);
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
    const contentLength = String(Buffer.byteLength(body, "utf8"));
    const response = await this.fetchWithTimeout(this.wsUrl, (signal) => ({
      method: "POST",
      body,
      headers: {
        Connection: "Keep-Alive",
        Accept: "text/xml",
        Pragma: "no-cache",
        SOAPAction: "http://ws01.lom.ch/soap/getDP",
        "Cache-Control": "no-cache",
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": contentLength
      },
      signal
    }));
    const rawXml = await response.text();
    if (!response.ok) {
      throw new Error(`reading ${oids} failed! HTTP ${response.status}: ${response.statusText}`);
    }
    const dataPoints = await parseGetDpResponseXml(rawXml);
    return { rawXml, dataPoints };
  }
  /**
   * Writes a value to an OID via SOAP `writeDpRequest`.
   *
   * @param oid - OID path string
   * @param value - Value to write
   * @returns Object with SOAP request body, HTTP/SOAP success flag, and status text
   */
  async writeDataPoint(oid, value) {
    const body = buildWriteDpSoapBody(oid, value);
    const contentLength = String(Buffer.byteLength(body, "utf8"));
    const response = await this.fetchWithTimeout(this.wsUrl, (signal) => ({
      method: "POST",
      body,
      headers: {
        Connection: "Keep-Alive",
        Accept: "*/*",
        Pragma: "no-cache",
        SOAPAction: "http://ws01.lom.ch/soap/writeDP",
        "Cache-Control": "no-cache",
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": contentLength
      },
      signal
    }));
    const responseText = await response.text();
    if (!response.ok) {
      return {
        body,
        ok: false,
        statusText: response.statusText || `HTTP ${response.status}`
      };
    }
    if (responseText.includes("Fault")) {
      try {
        const parsed = await (0, import_xml2js.parseStringPromise)(responseText);
        const fault = extractSoapFault(parsed);
        if (fault) {
          return {
            body,
            ok: false,
            statusText: fault
          };
        }
      } catch {
      }
    }
    return {
      body,
      ok: true,
      statusText: response.statusText
    };
  }
  /**
   * Downloads and parses `VarIdentTexte_de.xml` from the device.
   *
   * @returns Dictionary mapping `"gn:mn"` to variable names
   */
  async fetchOidNames() {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/res/xml/VarIdentTexte_de.xml`,
      (signal) => createGetOptions("text/xml", signal)
    );
    const xmlContent = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return parseOidNamesXml(xmlContent);
  }
  /**
   * Downloads and parses `AufzaehlTexte_de.xml` from the device.
   *
   * @returns Dictionary mapping `"gn:mn"` to arrays of enum labels
   */
  async fetchOidEnums() {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/res/xml/AufzaehlTexte_de.xml`,
      (signal) => createGetOptions("text/xml", signal)
    );
    const xmlContent = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return parseOidEnumsXml(xmlContent);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  Web2CommClient,
  buildGetDpSoapBody,
  buildWriteDpSoapBody,
  parseGetDpResponseXml,
  parseOidEnumsXml,
  parseOidNamesXml
});
//# sourceMappingURL=web2commClient.js.map
