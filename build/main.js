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
var import_package = __toESM(require("../package.json"));
var import_util = require("./lib/util");
var import_web2commClient = require("./lib/web2commClient");
const adapterName = import_package.default.name.split(".").pop();
const WRITE_READBACK_DELAY_MS = 1500;
class OchsnerRoomterminal extends utils.Adapter {
  client = void 0;
  oidNamesDict = {};
  oidEnumsDict = {};
  oidUpdate = {};
  oidGroups = {};
  groupOidString = {};
  pollTimeout = void 0;
  writeReadbackTimeouts = /* @__PURE__ */ new Set();
  isUnloading = false;
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
    this.log.info(`Adapter ${this.name} is ready`);
    await this.main();
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback - Callback function
   */
  onUnload(callback) {
    try {
      this.isUnloading = true;
      if (this.pollTimeout) {
        this.clearTimeout(this.pollTimeout);
        this.pollTimeout = void 0;
      }
      for (const timeout of this.writeReadbackTimeouts) {
        this.clearTimeout(timeout);
      }
      this.writeReadbackTimeouts.clear();
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id - State ID
   * @param state - State object
   */
  async onStateChange(id, state) {
    var _a;
    if (!state) {
      this.log.info(`state ${id} deleted`);
      return;
    }
    if (state.ack) {
      return;
    }
    const oids = (_a = this.config.OIDs) != null ? _a : [];
    this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    const index = oids.findIndex((elem) => id.endsWith(`OID.${elem.oid}`) || id.endsWith(elem.oid));
    if (index === -1) {
      this.log.error(`state ${id} not found in OID list`);
      return;
    }
    if (!state.from.startsWith(`system.adapter.${this.name}`)) {
      const writeSuccess = await this.oidWrite(index, state.val);
      if (writeSuccess) {
        await this.setStateChangedAsync(id, { val: state.val, ack: true });
        this.scheduleWriteReadback(index);
      }
    }
  }
  /**
   * Schedules a delayed readback of a written OID using adapter-managed timeouts.
   *
   * @param index - Index of the OID in `this.config.OIDs`
   */
  scheduleWriteReadback(index) {
    const timeout = this.setTimeout(async () => {
      var _a, _b;
      if (timeout) {
        this.writeReadbackTimeouts.delete(timeout);
      }
      if (this.isUnloading) {
        return;
      }
      try {
        const oid = (_b = (_a = this.config.OIDs) == null ? void 0 : _a[index]) == null ? void 0 : _b.oid;
        if (oid) {
          await this.oidRead(oid, [index]);
        }
      } catch (error) {
        this.log.error(`Readback after write failed: ${error.message}`);
      }
    }, WRITE_READBACK_DELAY_MS);
    if (timeout) {
      this.writeReadbackTimeouts.add(timeout);
    }
  }
  /**
   * Handles messages sent to this adapter instance over the message box.
   *
   * @param obj - ioBroker message object
   */
  async onMessage(obj) {
    var _a;
    this.log.debug(`message received ${JSON.stringify(obj, null, 2)}`);
    let resultMsg = { error: "internal error" };
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "readGroup") {
        const group = String(obj.message);
        const groupExists = Object.prototype.hasOwnProperty.call(this.oidGroups, group);
        this.log.debug(`read group ${group} (exists: ${groupExists})`);
        if (groupExists) {
          try {
            await this.oidRead(this.groupOidString[group], this.oidGroups[group]);
            resultMsg = "success";
          } catch (error) {
            resultMsg = { error: (_a = error.message) != null ? _a : "unknown error" };
          }
        } else {
          this.log.info(`group "${group}" does not exist`);
          resultMsg = { error: `group ${group} does not exist` };
        }
      } else {
        resultMsg = { error: "message command not supported" };
      }
    }
    if (obj.callback) {
      this.sendTo(obj.from, obj.command, resultMsg, obj.callback);
    }
  }
  /**
   * Initializes the adapter connection, dictionaries, and group polling.
   */
  async main() {
    var _a;
    await this.setStateChangedAsync("info.connection", false, true);
    if (!this.config.serverIP) {
      this.log.error("Server IP address configuration must not be empty");
      return;
    }
    this.client = new import_web2commClient.Web2CommClient(this.config.serverIP, this.config.username, this.config.password);
    this.log.info(`Config username: ${this.config.username}`);
    this.log.info(`Config serverIP: ${this.config.serverIP}`);
    this.log.info(`Config pollInterval: ${this.config.pollInterval}`);
    const connected = await this.checkForConnection();
    if (!connected) {
      return;
    }
    await this.setStateChangedAsync("info.connection", true, true);
    if ((_a = this.config.OIDs) == null ? void 0 : _a.length) {
      const { oidGroups, groupOidString } = (0, import_util.buildOidGroups)(this.config.OIDs);
      this.oidGroups = oidGroups;
      this.groupOidString = groupOidString;
      this.log.debug(`Groups: ${JSON.stringify(this.oidGroups)}`);
      this.log.debug(`Group OIDs: ${JSON.stringify(this.groupOidString)}`);
      this.oidNamesDict = await this.oidGetNames();
      this.oidEnumsDict = await this.oidGetEnums();
    }
    const hasPollableGroup = Object.keys(this.oidGroups).some((groupName) => Number(groupName) < 10);
    if (!hasPollableGroup) {
      this.log.info("No OIDs to poll in instance configuration");
    } else {
      void this.poll(0);
    }
  }
  /**
   * Schedules the next poll execution after the configured pollInterval.
   *
   * @param nextGroupIndex - Next group index to poll
   */
  scheduleNextPoll(nextGroupIndex) {
    if (this.isUnloading) {
      return;
    }
    if (this.pollTimeout) {
      this.clearTimeout(this.pollTimeout);
    }
    const intervalMs = Math.max(1, Number(this.config.pollInterval) || 30) * 1e3;
    this.pollTimeout = this.setTimeout(() => {
      this.pollTimeout = void 0;
      void this.poll(nextGroupIndex);
    }, intervalMs);
  }
  /**
   * Main polling routine - fetching next Group in list.
   *
   * @param groupIndex - Index of the group to poll (default: 0)
   */
  async poll(groupIndex = 0) {
    if (this.isUnloading) {
      return;
    }
    const keys = Object.keys(this.oidGroups);
    try {
      if (groupIndex >= keys.length) {
        await this.updateNativeOIDs();
        void this.poll(0);
      } else if (Number(keys[groupIndex]) > 9) {
        this.log.debug(
          `skip group ${keys[groupIndex]}, groups with numbers > 9 are reserved for readGroup messages, only!!`
        );
        void this.poll(groupIndex + 1);
      } else {
        const groupKey = keys[groupIndex];
        this.log.debug(`Read Group ${groupKey}`);
        await this.oidRead(this.groupOidString[groupKey], this.oidGroups[groupKey]);
        this.scheduleNextPoll(groupIndex + 1);
      }
    } catch (error) {
      this.log.error(`Error during poll: ${error.message}`);
      this.scheduleNextPoll(0);
    }
  }
  /**
   * Checks for empty OID names in config, populates default names from the device dictionary,
   * and updates `native.OIDs` in the instance object (which restarts the adapter).
   */
  async updateNativeOIDs() {
    var _a, _b;
    const keys = Object.keys(this.oidUpdate);
    if (!keys.length) {
      return;
    }
    this.log.debug(`UpdateNativeOIDs: ${JSON.stringify(keys)}`);
    try {
      const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (instanceObj && Array.isArray((_a = instanceObj.native) == null ? void 0 : _a.OIDs)) {
        for (const key of keys) {
          const index = instanceObj.native.OIDs.findIndex((oid) => key === oid.oid);
          if (index !== -1) {
            instanceObj.native.OIDs[index].name = (_b = this.oidUpdate[key]) != null ? _b : key;
          }
        }
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
        this.oidUpdate = {};
      }
    } catch (error) {
      this.log.debug(`getObject error: ${JSON.stringify(error, null, 2)}`);
    }
  }
  /**
   * Reads an OID group from the roomterminal, given by group OIDs and group config indices.
   *
   * @param oids - OID string to read, e.g. `"/1/2/3/5/8;/1/2/3/5/10"`
   * @param oidIndices - OID config indices `[5, 7]` (must correspond to `oids`)
   */
  async oidRead(oids, oidIndices) {
    var _a, _b, _c, _d;
    this.log.debug(`Read OIDs ${oids} (Config indices: [ ${JSON.stringify(oidIndices)} ])`);
    try {
      const { rawXml, dataPoints } = await this.client.readDataPoints(oids);
      await this.setStateChangedAsync("info.connection", true, true);
      this.log.debug(`OID Raw Data: ${rawXml}`);
      for (let key = 0; key < dataPoints.length; key++) {
        const dp = dataPoints[key];
        const configOidIndex = oidIndices[key];
        const oidConfig = (_a = this.config.OIDs) == null ? void 0 : _a[configOidIndex];
        if (!oidConfig) {
          continue;
        }
        const oid = oidConfig.oid;
        const states = (0, import_util.buildEnumStates)(dp, this.oidEnumsDict);
        const isReadable = dp.prop[1] === "r";
        const isWritable = dp.prop[2] === "w";
        const displayName = oidConfig.name.length ? oidConfig.name : (_b = this.oidNamesDict[dp.name]) != null ? _b : dp.name;
        this.log.debug(`Update object: ${oid} - "${dp.name}" with value: ${dp.value}`);
        const common = {
          name: displayName,
          type: "number",
          role: (0, import_util.determineStateRole)(dp.unit, isWritable, states !== void 0),
          read: isReadable,
          write: isWritable,
          unit: dp.unit.length === 0 ? void 0 : dp.unit,
          min: isWritable ? dp.min.length === 0 ? void 0 : Number(dp.min) : void 0,
          max: isWritable ? dp.max.length === 0 ? void 0 : Number(dp.max) : void 0,
          step: isWritable ? dp.step.length === 0 ? void 0 : Number(dp.step) : void 0,
          states
        };
        if (oidConfig.name.length === 0) {
          this.oidUpdate[oid] = (_c = this.oidNamesDict[dp.name]) != null ? _c : dp.name;
        }
        try {
          if (dp.value.length > 0) {
            await this.setObjectNotExistsAsync(`OID.${oid}`, {
              type: "state",
              common,
              native: {}
            });
            await this.setStateChangedAsync(`OID.${oid}`, { val: Number(dp.value), ack: true });
          }
          if (oidConfig.isStatus) {
            const enumList = this.oidEnumsDict[dp.name];
            if (enumList) {
              const status = enumList[Number(dp.value)];
              if (status) {
                await this.setObjectNotExistsAsync(`Status.${oid}`, {
                  type: "state",
                  common: {
                    name: `Status.${displayName}`,
                    type: "string",
                    role: "text",
                    read: true,
                    write: false
                  },
                  native: {}
                });
                await this.setStateChangedAsync(`Status.${oid}`, { val: status, ack: true });
                this.log.debug(`Update status object: ${oid} with value: ${status}`);
              }
            } else {
              this.log.info(`No status text found for ${oid} (${dp.name})`);
              this.log.info(`Please check isStatus configuration for ${oid}`);
            }
          }
        } catch (error) {
          this.log.error(`Error message: ${error == null ? void 0 : error.message}`);
          this.log.error(`State update for ${oids} failed`);
        }
      }
    } catch (error) {
      this.log.error(`OID read or parse error: ${oids}`);
      await this.setStateChangedAsync("info.connection", false, true);
      throw new Error((_d = error.message) != null ? _d : "OID read or parse error");
    }
  }
  /**
   * Writes an OID value to the roomterminal, given by config index.
   *
   * @param index - Index of the OID entry in `this.config.OIDs`
   * @param value - Value to write to the OID
   * @returns `true` if write succeeded, `false` otherwise
   */
  async oidWrite(index, value) {
    const oid = this.config.OIDs[index].oid;
    const ind = (0, import_util.extractOidIndex)(oid);
    try {
      this.log.debug(`Write OID ${oid} (XML-index ${ind}) with value: ${value}`);
      const result = await this.client.writeDataPoint(oid, value);
      this.log.debug(`write body ${oid}: ${result.body}`);
      if (!result.ok) {
        this.log.error(`writing ${oid} failed! Message: ${JSON.stringify(result.statusText)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.log.error(`OID (${oid}) write error: ${error.message}`);
      await this.setStateChangedAsync("info.connection", false, true);
      return false;
    }
  }
  /**
   * Loads the OID names dictionary, either from ioBroker file storage or from the device.
   *
   * @returns OID names dictionary
   */
  async oidGetNames() {
    let oidNamesDict = {};
    const fileName = "oidNames.json";
    try {
      const oidNamesExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidNamesExists) {
        this.log.debug("oidNames.json file exists - skip reading from device");
        const res = await this.readFileAsync(this.namespace, fileName);
        const content = Buffer.isBuffer(res.file) ? res.file.toString("utf-8") : String(res.file);
        oidNamesDict = JSON.parse(content);
      } else {
        oidNamesDict = await this.client.fetchOidNames();
        await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidNamesDict));
        this.log.debug(`${fileName} written to 'Files'`);
      }
    } catch (error) {
      this.log.error(`oidGetNames error: ${error.message}`);
    }
    return oidNamesDict;
  }
  /**
   * Loads the OID enums dictionary, either from ioBroker file storage or from the device.
   *
   * @returns OID enums dictionary
   */
  async oidGetEnums() {
    let oidEnumsDict = {};
    const fileName = "oidEnums.json";
    try {
      const oidEnumsExists = await this.fileExistsAsync(this.namespace, fileName);
      if (oidEnumsExists) {
        this.log.debug("oidEnums.json file exists - skip reading from device");
        const res = await this.readFileAsync(this.namespace, fileName);
        const content = Buffer.isBuffer(res.file) ? res.file.toString("utf-8") : String(res.file);
        oidEnumsDict = JSON.parse(content);
      } else {
        oidEnumsDict = await this.client.fetchOidEnums();
        await this.writeFileAsync(this.namespace, fileName, JSON.stringify(oidEnumsDict));
        this.log.debug(`${fileName} written to 'Files'`);
      }
    } catch (error) {
      this.log.error(`oidGetEnums error: ${error.message}`);
    }
    return oidEnumsDict;
  }
  /**
   * Verifies the connection to the Ochsner Roomterminal and updates `deviceInfo` states.
   *
   * @returns `true` if connection is successful, `false` otherwise
   */
  async checkForConnection() {
    try {
      const data = await this.client.fetchDeviceInfo();
      this.log.info(`DeviceInfo: ${JSON.stringify(data)}`);
      await this.setStateChangedAsync("deviceInfo.name", { val: data.device, ack: true });
      await this.setStateChangedAsync("deviceInfo.version", { val: data.version, ack: true });
    } catch {
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
