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
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_xml2js = require("xml2js");
var import_package = __toESM(require("../package.json"));
var import_util = require("./lib/util.js");
var import_digest_fetch = __toESM(require("digest-fetch"));
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
  deviceInfoUrl = "";
  getUrl = "";
  client = void 0;
  oidNamesDict = void 0;
  oidEnumsDict = void 0;
  oidUpdate = {};
  oidGroups = {};
  groupOidString = {};
  constructor(options = {}) {
    super({
      ...options,
      name: adapterName
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.subscribeStates("OID.*");
    this.log.info(`Adapter Name: ${this.name} is ready !!!!!!`);
    this.main();
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  onUnload(callback) {
    try {
      callback();
    } catch (e) {
      callback();
    }
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  // 	if (obj) {
  // 		// The object was changed
  // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  // 	} else { 17058
  // 		// The object was deleted
  // 		this.log.info(`object ${id} deleted`);
  // 	}
  // }
  /**
   * Is called if a subscribed state changes
   */
  async onStateChange(id, state) {
    const oids = this.config.OIDs;
    if (state) {
      if (!state.ack) {
        this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        const index = oids.findIndex((elem) => id.endsWith(elem.oid));
        if (index == -1) {
          this.log.error(`state ${id} not found in OID list`);
          return;
        }
        this.log.debug(`From: system.adapter.${this.name}`);
        if (!state.from.startsWith(`system.adapter.${this.name}`)) {
          await this.oidWrite(index, state.val);
          await this.delay(1500);
          await this.oidRead(this.config.OIDs[index].oid, [index]);
        }
      }
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  async onMessage(obj) {
    var _a;
    this.log.debug("message received" + JSON.stringify(obj, null, 2));
    let resultMsg = { error: "internal error" };
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "readGroup") {
        const groupIndex = Object.keys(this.oidGroups).indexOf(String(obj.message));
        this.log.debug(`read group ${obj.message} (groupIndex: ${groupIndex})`);
        if (groupIndex !== -1) {
          try {
            const group = String(obj.message);
            await this.oidRead(this.groupOidString[group], this.oidGroups[group]);
            resultMsg = "success";
          } catch (error) {
            resultMsg = { error: (_a = error.message) != null ? _a : "unknown error" };
          }
        } else {
          this.log.info(`group "${obj.message}" does not exist`);
          resultMsg = { error: `group ${obj.message} does not exist` };
        }
      } else resultMsg = { error: "message command not supported" };
    }
    if (obj.callback) {
      this.sendTo(obj.from, obj.command, resultMsg, obj.callback);
    }
  }
  /**
   * -----------------
   * Private functions
   * -----------------
   */
  /**
   *  Inititialize the adapter
   * ----------------------------
   */
  async main() {
    var _a;
    this.setState("info.connection", false, true);
    this.deviceInfoUrl = `http://${this.config.serverIP}/api/1.0/info/deviceinfo`;
    this.getUrl = `http://${this.config.serverIP}/ws`;
    this.client = new import_digest_fetch.default(this.config.username, this.config.password);
    if (!this.config.serverIP) {
      this.log.error("Server IP address configuration must not be emtpy");
      return;
    }
    this.log.info("Config username: " + this.config.username);
    this.log.info("Config serverIP: " + this.config.serverIP);
    this.log.info("Config pollInterval: " + this.config.pollInterval);
    const connected = await this.checkForConnection();
    if (!connected) {
      return;
    }
    this.setState("info.connection", true, true);
    if ((_a = this.config.OIDs) == null ? void 0 : _a.length) {
      this.config.OIDs.forEach((value, key) => {
        const group = this.config.OIDs[key].group;
        const enabled = this.config.OIDs[key].enabled;
        const oid = this.config.OIDs[key].oid;
        this.log.debug(`Key: ${key} Object: ${JSON.stringify(this.config.OIDs[key])}`);
        if (enabled) {
          if (this.oidGroups[group] == void 0) this.oidGroups[group] = [key];
          else this.oidGroups[group].push(key);
          if (this.groupOidString[group] == void 0) this.groupOidString[group] = oid;
          else this.groupOidString[group] = this.groupOidString[group] + ";" + oid;
        }
      });
      this.log.debug(`Groups: ${JSON.stringify(this.oidGroups)}`);
      this.log.debug(`Group OIDs: ${JSON.stringify(this.groupOidString)}`);
      this.oidNamesDict = await this.oidGetNames();
      this.oidEnumsDict = await this.oidGetEnums();
    }
    if (Object.keys(this.oidGroups).findIndex((groupName) => +groupName < 10) == -1)
      this.log.info("No OIDs to poll in instance configuration");
    else this.poll();
  }
  /**
   * Main polling routine - fetching next Group in list
   *
   * @description Started once during startup, restarts itself when finished
   * 				(only called when there is at least one group 0-9)
   */
  async poll(groupIndex = 0) {
    const keys = Object.keys(this.oidGroups);
    try {
      if (groupIndex >= keys.length) {
        await this.updateNativeOIDs();
        this.poll(0);
      } else if (+keys[groupIndex] > 9) {
        this.log.debug(
          `skip group ${keys[groupIndex]}, groups with numbers > 9 are reserved for readGroup messages, only!!`
        );
        this.poll(++groupIndex);
      } else {
        const groupKey = keys[groupIndex];
        this.log.debug(`Read Group ${groupKey}`);
        await this.oidRead(this.groupOidString[groupKey], this.oidGroups[groupKey]);
        await this.delay(this.config.pollInterval * 1e3);
        this.poll(++groupIndex);
      }
    } catch (error) {
      this.log.error(`Error: ${JSON.stringify(error)}`);
      await this.delay(this.config.pollInterval * 1e3);
      this.poll(0);
    }
  }
  /**
   * Check for empty OID names in config, add default names
   * and update common.native.OIDs in instance object (which restarts the adapter)
   */
  async updateNativeOIDs() {
    const keys = Object.keys(this.oidUpdate);
    if (!keys.length) return;
    this.log.debug(`UpdateNativeOIDs: ${JSON.stringify(keys)}`);
    try {
      const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (instanceObj) {
        keys.forEach((key) => {
          var _a;
          const index = instanceObj.native.OIDs.findIndex((oid) => key === oid.oid);
          if (index !== -1) instanceObj.native.OIDs[index].name = (_a = this.oidUpdate[key]) != null ? _a : key;
        });
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
        this.oidUpdate = {};
      }
    } catch (error) {
      this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
    }
  }
  /**
   * Read OID group from roomterminal, given by group oids and group indices
   *
   * @param oids OID string to read e.g. "/1/2/3/5/8;/1/2/3/5/;/1/2/3/5/10"
   * @param indices OID config indices [5,7,9] (must correspond to oids)
   */
  async oidRead(oids, oidIndices) {
    var _a;
    this.log.debug(`Read OIDs ${oids} (Config indices: [ ${JSON.stringify(oidIndices)} ])`);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
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
      if (response.ok == true) {
        this.setState("info.connection", true, true);
        const data = await response.text();
        this.log.debug(`OID Raw Data: ${data}`);
        const jsonResult = await (0, import_xml2js.parseStringPromise)(data);
        const dpCfg = jsonResult["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns:getDpResponse"][0].dpCfg;
        dpCfg.forEach(async (dp, key) => {
          var _a2;
          const configOidIndex = oidIndices[key];
          const oid = this.config.OIDs[configOidIndex].oid;
          const states = {};
          const name = dp.name[0];
          const prop = dp.prop[0];
          const desc = dp.desc[0];
          const value = dp.value[0];
          const unit = dp.unit[0];
          const step = dp.step[0];
          const min = dp.minValue[0];
          const max = dp.maxValue[0];
          if (this.oidEnumsDict[name]) {
            if (desc === "Enum Var") {
              const enums = (0, import_util.getEnumKeys)(prop);
              if (enums) {
                enums.forEach(
                  (val) => {
                    var _a3;
                    return states[val] = (_a3 = this.oidEnumsDict[name][Number(val)]) != null ? _a3 : "undefined";
                  }
                );
              }
            } else {
              this.oidEnumsDict[name].forEach((val, key2) => states[key2] = val != null ? val : "undefined");
            }
          }
          this.log.debug(`Update object: ${oid} - "${name}" with value: ${value} `);
          const common = {
            name: this.config.OIDs[configOidIndex].name.length ? this.config.OIDs[configOidIndex].name : this.oidNamesDict[name],
            type: "number",
            role: "value",
            read: prop[1] === "r" ? true : false,
            write: prop[2] === "w" ? true : false,
            unit: unit.length === 0 ? void 0 : unit,
            min: prop[2] === "w" ? min.length === 0 ? void 0 : Number(min) : void 0,
            max: prop[2] === "w" ? max.length === 0 ? void 0 : Number(max) : void 0,
            step: prop[2] === "w" ? step.length === 0 ? void 0 : Number(step) : void 0,
            //TODO: add states based on XML
            states: Object.keys(states).length == 0 ? void 0 : states
            // 	// states: { '0': 'OFF', '1': 'ON', '-3': 'whatever' },
          };
          if (this.config.OIDs[configOidIndex].name.length === 0)
            this.oidUpdate[oid] = (_a2 = this.oidNamesDict[name]) != null ? _a2 : name;
          try {
            if (value.length > 0) {
              await this.setObjectNotExistsAsync("OID." + oid, {
                type: "state",
                common,
                native: {}
              });
              this.setState("OID." + oid, { val: Number(value), ack: true });
            }
            if (this.config.OIDs[configOidIndex].isStatus) {
              if (this.oidEnumsDict[name]) {
                const status = this.oidEnumsDict[name][Number(value)];
                if (status) {
                  await this.setObjectNotExistsAsync("Status." + oid, {
                    type: "state",
                    common: {
                      name: "Status." + this.config.OIDs[configOidIndex].name,
                      type: "string",
                      role: "value",
                      read: true,
                      write: false
                    },
                    native: {}
                  });
                  this.setState("Status." + oid, { val: status, ack: true });
                  this.log.debug(`Update status object: ${oid} with value: ${status}`);
                }
              } else {
                this.log.info(`No status text found for ${oid} (${name})`);
                this.log.info(`Please check isStatus configuration for ${oid}`);
              }
            }
          } catch (error) {
            this.log.error("Error message: " + (error == null ? void 0 : error.message));
            this.log.error(`State update for ${oids} failed`);
          }
        });
      } else {
        this.log.error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
        throw new Error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
      }
    } catch (_error) {
      this.log.error("OID read or parse error: " + oids);
      this.setState("info.connection", false, true);
      throw new Error((_a = _error.message) != null ? _a : "OID read or parse error");
    }
  }
  /**
   * Write OID to roomterminal, given by index
   *
   * @param index index of the OID etnry to read in this.config.OiDs
   */
  async oidWrite(index, value) {
    const oid = this.config.OIDs[index].oid;
    const ind = oid.slice(oid.lastIndexOf("/") - oid.length + 1);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
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
    this.log.debug(`write body ${oid}: ${body}`);
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
    try {
      this.log.debug(`Write OID ${oid} (XML-index ${ind}) with value: ${value}`);
      const response = await this.client.fetch(this.getUrl, options);
      if (response.ok != true)
        this.log.debug(`writing ${oid} failed" Message: ${JSON.stringify(response.statusText)}`);
    } catch (error) {
      this.log.error(`OID (${oid}) write error: ${JSON.stringify(error)}`);
      this.setState("info.connection", false, true);
    }
  }
  /**
   * Ochnser API for getting the oidNames Dictionary,
   * 		either from file
   * 		or
   * 		from device (then stored to file)
   *
   * @returns oiNameDictionary
   */
  async oidGetNames() {
    let oidNamesDict = {};
    const fileName = "oidNames.json";
    try {
      const oidNamesExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidNamesExists) {
        this.log.debug("oidNames.json file exists - skip reading from device");
        const res = await this.readFileAsync(this.namespace, fileName);
        oidNamesDict = JSON.parse(res.file);
      } else {
        const response = await this.client.fetch(
          `http://${this.config.serverIP}/res/xml/VarIdentTexte_de.xml`,
          getOptions
        );
        const data = await response.text();
        const result = await (0, import_xml2js.parseStringPromise)(data);
        for (const gnIndex in result["VarIdentTexte"]["gn"]) {
          for (const mnIndex in result["VarIdentTexte"]["gn"][gnIndex]["mn"]) {
            let gn = result["VarIdentTexte"]["gn"][gnIndex]["$"]["id"];
            let mn = result["VarIdentTexte"]["gn"][gnIndex]["mn"][mnIndex]["$"]["id"];
            if (gn.length == 1) gn = "0" + gn;
            if (mn.length == 1) mn = "0" + mn;
            const key = `${gn}:${mn}`;
            oidNamesDict[key] = result["VarIdentTexte"]["gn"][gnIndex]["mn"][mnIndex]["_"];
          }
        }
        await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidNamesDict));
        this.log.debug(`${fileName} written to 'Files'`);
      }
    } catch (error) {
      this.log.error(`oidGetNames error: ${JSON.stringify(error)}`);
    }
    return oidNamesDict;
  }
  /**
   * Ochnser API for getting the oidEnum Dictionary,
   * 		either from file
   * 		or
   * 		from device (then stored to file)
   *
   * @returns oidEnumDictionary
   */
  async oidGetEnums() {
    let oidEnumsDict = {};
    const fileName = "oidEnums.json";
    try {
      const oidEnumsExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidEnumsExists) {
        this.log.debug("oidEnums.json file exists - skip reading from device");
        const res = await this.readFileAsync(this.namespace, fileName);
        oidEnumsDict = JSON.parse(res.file);
      } else {
        const response = await this.client.fetch(
          `http://${this.config.serverIP}/res/xml/AufzaehlTexte_de.xml`,
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
        this.log.debug(`${fileName} written to 'Files'`);
      }
    } catch (error) {
      console.log("error:", { error });
    }
    return oidEnumsDict;
  }
  /**
   * Ochnser API for getting the DeviceInfo
   * @returns
   */
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
}
if (require.main !== module) {
  module.exports = (options) => new OchsnerRoomterminal(options);
} else {
  (() => new OchsnerRoomterminal())();
}
//# sourceMappingURL=main.js.map
