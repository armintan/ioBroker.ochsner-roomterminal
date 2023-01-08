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
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var utils = __toESM(require("@iobroker/adapter-core"));
var import_digest_fetch = __toESM(require("digest-fetch"));
var _deviceInfoUrl;
class OchsnerRoomterminal extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "ochsner-roomterminal"
    });
    __privateAdd(this, _deviceInfoUrl, "");
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
    __privateSet(this, _deviceInfoUrl, `http://${this.config.serverIP}/api/1.0/info/deviceinfo`);
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
    await this.setStateAsync("testVariable", true);
    await this.setStateAsync("testVariable", { val: true, ack: true });
    await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });
    let result = await this.checkPasswordAsync("admin", "iobroker");
    this.log.info("check user admin pw iobroker: " + result);
    result = await this.checkGroupAsync("admin", "admin");
    this.log.info("check group user admin group admin: " + result);
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
    this.log.debug("DeviceInfo URL: " + __privateGet(this, _deviceInfoUrl));
    try {
      const response = await client.fetch(__privateGet(this, _deviceInfoUrl), options);
      const data = await response.json();
      this.log.info("DeviceInfo: " + JSON.stringify(data));
    } catch (error) {
      this.log.error("Invalid username, password of server IP-address");
      return false;
    }
    return true;
  }
}
_deviceInfoUrl = new WeakMap();
if (require.main !== module) {
  module.exports = (options) => new OchsnerRoomterminal(options);
} else {
  (() => new OchsnerRoomterminal())();
}
//# sourceMappingURL=main.js.map
