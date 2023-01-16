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
const adapterName = import_package.default.name.split(".").pop();
class OchsnerRoomterminal extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: adapterName
    });
    this.deviceInfoUrl = "";
    this.getUrl = "";
    this.client = void 0;
    this.timeoutID = void 0;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.log.info(`Adapter Name: ${adapterName}`);
    this.main();
  }
  onUnload(callback) {
    try {
      clearTimeout(this.timeoutID);
      this.log.debug("clear polling succeeded");
      callback();
    } catch (e) {
      this.log.error(`clear timeout error`);
      callback();
    }
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
    await this.setObjectNotExistsAsync("testVariable", {
      type: "state",
      common: {
        name: "testVariable",
        type: "boolean",
        role: "indicator",
        read: true,
        write: true
      },
      native: {}
    });
    this.subscribeStates("testVariable");
    if (this.config.OIDs.length > 0)
      this.poll();
  }
  async poll(index = 0) {
    this.log.debug(`poll with index: ${index}`);
    await this.readOID(index);
    this.wait(this.config.pollInterval).then(() => this.poll(index == this.config.OIDs.length - 1 ? 0 : index + 1)).catch((error) => {
      this.log.error(`Error: ${JSON.stringify(error)}`);
      this.poll();
    });
  }
  wait(t) {
    return new Promise((s) => this.timeoutID = setTimeout(s, t, t));
  }
  async checkForConnection() {
    const options = {
      method: "get",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-cache",
        Connection: "Keep-Alive",
        Accept: "*.*"
      }
    };
    this.log.debug("DeviceInfo URL: " + this.deviceInfoUrl);
    try {
      const response = await this.client.fetch(this.deviceInfoUrl, options);
      const data = await response.json();
      this.log.info("DeviceInfo: " + JSON.stringify(data));
      await this.setStateAsync("deviceInfo.name", { val: data.device, ack: true });
      await this.setStateAsync("deviceInfo.version", { val: data.version, ack: true });
    } catch (error) {
      this.log.error("Invalid username, password or server IP-address in adapter configuration");
      return false;
    }
    return true;
  }
  async readOID(index) {
    var _a, _b, _c;
    const oid = this.config.OIDs[index].oid;
    this.log.info(`Polling OID: ${oid}`);
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
        SOAPAction: "http://ws01.lom.ch/soap/listDP",
        "Cache-Control": "no-cache",
        "Content-Type": "text/xml; charset=utf-8",
        "Content-length": body.length
      }
    };
    try {
      const response = await this.client.fetch(this.getUrl, options);
      const data = await response.text();
      const jsonResult = await (0, import_xml2js.parseStringPromise)(data);
      const value = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].value[0];
      const unit = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].unit[0];
      const step = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].step[0];
      const min = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].minValue[0];
      const max = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg[0].maxValue[0];
      let common = {
        name: this.config.OIDs[index].name,
        type: "number",
        role: "value",
        read: true,
        write: this.config.OIDs[index].isWriteable
      };
      common["unit"] = unit.length === 0 ? void 0 : unit;
      (_a = common.min) != null ? _a : common.min = min.length === 0 ? void 0 : Number(min);
      (_b = common.max) != null ? _b : common.max = max.length === 0 ? void 0 : Number(max);
      (_c = common.step) != null ? _c : common.step = max.length === 0 ? void 0 : Number(step);
      this.log.debug(`${JSON.stringify(common, null, 2)}`);
      if (value.length > 0) {
        this.log.debug("Got a valid result: " + value + unit);
        this.setObjectNotExists("OID." + oid, {
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
