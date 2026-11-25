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
var util_exports = {};
__export(util_exports, {
  buildEnumStates: () => buildEnumStates,
  buildOidGroups: () => buildOidGroups,
  determineStateRole: () => determineStateRole,
  extractOidIndex: () => extractOidIndex,
  getEnumKeys: () => getEnumKeys,
  padId: () => padId
});
module.exports = __toCommonJS(util_exports);
const getEnumKeys = (prop) => {
  const regex = /(?<=enum = )(\d|,)*$/g;
  const found = prop.match(regex);
  if (found && found[0].length > 0) {
    return found[0].split(",");
  }
  return null;
};
const extractOidIndex = (oid) => {
  const lastSlash = oid.lastIndexOf("/");
  return lastSlash !== -1 ? oid.slice(lastSlash + 1) : oid;
};
const padId = (id) => id.length === 1 ? `0${id}` : id;
const determineStateRole = (unit, isWritable, hasStates) => {
  const normalizedUnit = unit.trim();
  if (normalizedUnit === "\xB0C" || normalizedUnit === "K") {
    return isWritable ? "level.temperature" : "value.temperature";
  }
  if (normalizedUnit === "%") {
    return isWritable ? "level" : "value";
  }
  if (normalizedUnit === "bar" || normalizedUnit === "mbar" || normalizedUnit === "hPa") {
    return "value.pressure";
  }
  if (normalizedUnit === "kWh" || normalizedUnit === "Wh" || normalizedUnit === "MWh") {
    return "value.energy";
  }
  if (normalizedUnit === "W" || normalizedUnit === "kW") {
    return "value.power";
  }
  if (hasStates) {
    return isWritable ? "level" : "value";
  }
  return isWritable ? "level" : "value";
};
const buildEnumStates = (dp, oidEnumsDict) => {
  var _a;
  const enumList = oidEnumsDict[dp.name];
  if (!enumList) {
    return void 0;
  }
  const states = {};
  if (dp.desc === "Enum Var") {
    const enumKeys = getEnumKeys(dp.prop);
    if (enumKeys) {
      for (const val of enumKeys) {
        states[val] = (_a = enumList[Number(val)]) != null ? _a : "undefined";
      }
    }
  } else {
    enumList.forEach((val, key) => {
      states[key] = val != null ? val : "undefined";
    });
  }
  return Object.keys(states).length > 0 ? states : void 0;
};
const buildOidGroups = (oids) => {
  const oidGroups = {};
  const groupOidString = {};
  if (!(oids == null ? void 0 : oids.length)) {
    return { oidGroups, groupOidString };
  }
  oids.forEach((entry, index) => {
    if (!entry.enabled || !entry.oid) {
      return;
    }
    const groupKey = String(entry.group);
    if (!oidGroups[groupKey]) {
      oidGroups[groupKey] = [index];
      groupOidString[groupKey] = entry.oid;
    } else {
      oidGroups[groupKey].push(index);
      groupOidString[groupKey] = `${groupOidString[groupKey]};${entry.oid}`;
    }
  });
  return { oidGroups, groupOidString };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildEnumStates,
  buildOidGroups,
  determineStateRole,
  extractOidIndex,
  getEnumKeys,
  padId
});
//# sourceMappingURL=util.js.map
