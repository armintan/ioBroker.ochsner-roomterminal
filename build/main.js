"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_digest_fetch = __toESM(require("digest-fetch"));
var import_xml2js = require("xml2js");
var import_package = __toESM(require("../package.json"));
var import_util = require("./lib/util");
const adapterName = import_package.default.name.split(".").pop();
const getOptions = {
  method: "get",
  headers: {
    Connection: "Keep-Alive",
    Accept: "text/xml",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    "Content-Type": "text/xml; charset=utf-8"
  }
};
class OchsnerRoomterminal extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: adapterName
    });
    this.deviceInfoUrl = "";
    this.getUrl = "";
    this.client = void 0;
    this.oidNamesDict = void 0;
    this.oidEnumsDict = void 0;
    this.oidUpdate = {};
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.log.info(`Adapter Name: ${this.name} is ready !!!!!!`);
    this.main();
  }
  onUnload(callback) {
    callback();
  }
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  async main() {
    this.setState("info.connection", false, true);
    this.deviceInfoUrl = `http://${this.config.serverIP}/api/1.0/info/deviceinfo`;
    this.getUrl = `http://${this.config.serverIP}/ws`;
    this.client = new import_digest_fetch.default(this.config.username, this.config.password);
    this.log.info(`Config: ${JSON.stringify(this.config, null, 2)}`);
    if (!this.config.serverIP) {
      this.log.error("Server IP address configuration must not be emtpy");
      return;
    }
    this.log.info("config username: " + this.config.username);
    this.log.info("config serverIP: " + this.config.serverIP);
    this.log.info("config pollInterval: " + this.config.pollInterval);
    const connected = await this.checkForConnection();
    if (!connected) {
      return;
    }
    this.setState("info.connection", true, true);
    this.oidNamesDict = await this.oidGetNames();
    this.oidEnumsDict = await this.oidGetEnums();
    if (this.config.OIDs.length > 0)
      this.poll();
  }
  async poll(index = 0) {
    await this.oidRead(index);
    try {
      await this.delay(this.config.pollInterval);
      if (index == this.config.OIDs.length - 1) {
        await this.updateNativeOIDs(Object.keys(this.oidUpdate));
        this.poll();
      } else
        this.poll(++index);
    } catch (error) {
      this.log.error(`Error: ${JSON.stringify(error)}`);
      this.poll();
    }
  }
  async updateNativeOIDs(keys) {
    if (!keys.length)
      return;
    try {
      const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (instanceObj) {
        keys.forEach((key) => {
          var _a;
          const index = instanceObj.native.OIDs.findIndex((oid) => key === oid.oid);
          if (index !== -1)
            instanceObj.native.OIDs[index].name = (_a = this.oidUpdate[key]) != null ? _a : key;
        });
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
        this.oidUpdate = {};
      }
    } catch (error) {
      this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
    }
  }
  async oidGetNames() {
    let oidNamesDict = {};
    const fileName = "oidNames.json";
    try {
      const oidNamesExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidNamesExists) {
        this.log.debug("oidNames exists");
        const res = await this.readFileAsync(this.namespace, fileName);
        oidNamesDict = JSON.parse(res.file);
      } else {
        const response = await this.client.fetch(
          "http://192.168.1.108/res/xml/VarIdentTexte_de.xml",
          getOptions
        );
        const data = await response.text();
        const result = await (0, import_xml2js.parseStringPromise)(data);
        for (const gnIndex in result["VarIdentTexte"]["gn"]) {
          for (const mnIndex in result["VarIdentTexte"]["gn"][gnIndex]["mn"]) {
            let gn = result["VarIdentTexte"]["gn"][gnIndex]["$"]["id"];
            let mn = result["VarIdentTexte"]["gn"][gnIndex]["mn"][mnIndex]["$"]["id"];
            if (gn.length == 1)
              gn = "0" + gn;
            if (mn.length == 1)
              mn = "0" + mn;
            const key = `${gn}:${mn}`;
            oidNamesDict[key] = result["VarIdentTexte"]["gn"][gnIndex]["mn"][mnIndex]["_"];
          }
        }
        await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidNamesDict));
        this.log.debug(`${fileName} wirtten to files`);
      }
    } catch (error) {
      this.log.error(`oidGetNames error: ${JSON.stringify(error)}`);
    }
    return oidNamesDict;
  }
  async oidGetEnums() {
    let oidEnumsDict = {};
    const fileName = "oidEnums.json";
    try {
      const oidEnumsExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidEnumsExists) {
        this.log.debug("oidEnums exists");
        const res = await this.readFileAsync(this.namespace, fileName);
        oidEnumsDict = JSON.parse(res.file);
      } else {
        const response = await this.client.fetch(
          "http://192.168.1.108/res/xml/AufzaehlTexte_de.xml",
          getOptions
        );
        const data = await response.text();
        const result = await (0, import_xml2js.parseStringPromise)(data);
        for (const gnIndex in result["AufzaehlTexte"]["gn"]) {
          for (const mnIndex in result["AufzaehlTexte"]["gn"][gnIndex]["mn"]) {
            let gn = result["AufzaehlTexte"]["gn"][gnIndex]["$"]["id"];
            let mn = result["AufzaehlTexte"]["gn"][gnIndex]["mn"][mnIndex]["$"]["id"];
            gn = gn.length == 1 ? "0" + gn : gn;
            mn = mn.length == 1 ? "0" + mn : mn;
            const key = `${gn}:${mn}`;
            const enumArray = [];
            for (const enumIndex in result["AufzaehlTexte"]["gn"][gnIndex]["mn"][mnIndex]["enum"]) {
              const index = parseInt(
                result["AufzaehlTexte"]["gn"][gnIndex]["mn"][mnIndex]["enum"][enumIndex]["$"]["id"]
              );
              enumArray[index] = result["AufzaehlTexte"]["gn"][gnIndex]["mn"][mnIndex]["enum"][enumIndex]["_"];
            }
            oidEnumsDict[key] = enumArray;
          }
        }
        await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidEnumsDict));
        this.log.debug(`${fileName} wirtten to files`);
      }
    } catch (error) {
      console.log("error:", { error });
    }
    return oidEnumsDict;
  }
  async checkForConnection() {
    try {
      const response = await this.client.fetch(this.deviceInfoUrl, getOptions);
      const data = await response.json();
      this.log.info("DeviceInfo: " + JSON.stringify(data));
      this.setStateAsync("deviceInfo.name", { val: data.device, ack: true });
      this.setStateAsync("deviceInfo.version", { val: data.version, ack: true });
    } catch (error) {
      this.log.error("Invalid username, password or server IP-address in adapter configuration");
      return false;
    }
    return true;
  }
  async oidRead(index) {
    var _a;
    const oid = this.config.OIDs[index].oid;
    let states = {};
    const body = `<?xml version="1.0" encoding="UTF-8"?>
		<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" 
		xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" 
		xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
		xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
		xmlns:ns="http://ws01.lom.ch/soap/">
		 <SOAP-ENV:Body>
		   <ns:getDpRequest>
			<ref>
			 <oid>${oid}</oid>
			 <prop/>
			</ref>
			<startIndex>0</startIndex>
			<count>-1</count>
		   </ns:getDpRequest>
		 </SOAP-ENV:Body>
		</SOAP-ENV:Envelope>`;
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
    try {
      const response = await this.client.fetch(this.getUrl, options);
      const data = await response.text();
      const jsonResult = await (0, import_xml2js.parseStringPromise)(data);
      const name = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].name[0];
      const prop = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].prop[0];
      const desc = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].desc[0];
      const value = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].value[0];
      const unit = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].unit[0];
      const step = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].step[0];
      const min = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].minValue[0];
      const max = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].maxValue[0];
      if (desc === "Enum Var") {
        const enums = (0, import_util.getEnumKeys)(prop);
        if (enums) {
          this.log.debug(`enums: ${enums}`);
          enums.forEach((e) => {
            var _a2;
            return states[e] = (_a2 = this.oidEnumsDict[name][Number(e)]) != null ? _a2 : "undefined";
          });
          this.log.debug(`${JSON.stringify(states)}`);
        }
      }
      const common = {
        name: this.config.OIDs[index].name.length ? this.config.OIDs[index].name : this.oidNamesDict[name],
        type: "number",
        role: "value",
        read: prop[1] === "r" ? true : false,
        write: prop[2] === "w" ? true : false,
        unit: unit.length === 0 ? void 0 : unit,
        min: min.length === 0 ? void 0 : Number(min),
        max: max.length === 0 ? void 0 : Number(max),
        step: step.length === 0 ? void 0 : Number(step),
        states: Object.keys(states).length == 0 ? void 0 : states
      };
      if (this.config.OIDs[index].name.length === 0)
        this.oidUpdate[this.config.OIDs[index].oid] = (_a = this.oidNamesDict[name]) != null ? _a : name;
      if (value.length > 0) {
        this.log.debug(`result for [${oid}]: ${value} ${unit}`);
        await this.setObjectNotExistsAsync("OID." + oid, {
          type: "state",
          common,
          native: {}
        });
        this.setState("OID." + oid, { val: Number(value), ack: true });
      } else {
        this.log.error(`result for ${oid} not valid`);
        this.setState("info.connection", false, true);
      }
    } catch (error) {
      this.log.error(`OID read error: ${oid}`);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new OchsnerRoomterminal(options);
} else {
  (() => new OchsnerRoomterminal())();
}
//# sourceMappingURL=main.js.map
