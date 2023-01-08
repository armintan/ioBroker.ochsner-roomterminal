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
class OchsnerRoomterminal extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "ochsner-roomterminal"
    });
    this.deviceInfoUrl = "";
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.main();
  }
  onUnload(callback) {
    try {
      callback();
    } catch (e) {
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
    this.poll();
  }
  async poll() {
    this.log.debug("Polling....");
    this.wait(this.config.pollInterval).then(() => this.poll()).catch((error) => {
      this.log.error(JSON.stringify(error));
      this.poll();
    });
  }
  wait(t) {
    return new Promise((s) => setTimeout(s, t, t));
  }
  async checkForConnection() {
    const client = new import_digest_fetch.default(this.config.username, this.config.password);
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
      const response = await client.fetch(this.deviceInfoUrl, options);
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
}
if (require.main !== module) {
  module.exports = (options) => new OchsnerRoomterminal(options);
} else {
  (() => new OchsnerRoomterminal())();
}
//# sourceMappingURL=main.js.map
