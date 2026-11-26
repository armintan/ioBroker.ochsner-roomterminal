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
  escapeXml: () => escapeXml,
  extractOidIndex: () => extractOidIndex,
  getEnumKeys: () => getEnumKeys,
  normalizeBaseUrl: () => normalizeBaseUrl,
  padId: () => padId,
  parseFiniteNumber: () => parseFiniteNumber
});
module.exports = __toCommonJS(util_exports);
const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const normalizeBaseUrl = (serverIP) => {
  const trimmed = serverIP.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
};
const parseFiniteNumber = (raw) => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return void 0;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : void 0;
};
const getEnumKeys = (prop) => {
  const match = /enum\s*=\s*(\d+(?:\s*,\s*\d+)*)/.exec(prop);
  if (!(match == null ? void 0 : match[1])) {
    return null;
  }
  return match[1].split(",").map((key) => key.trim());
};
const extractOidIndex = (oid) => {
  const cleaned = oid.trim().replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  return lastSlash !== -1 ? cleaned.slice(lastSlash + 1) : cleaned;
};
const padId = (id) => id.length === 1 ? `0${id}` : id;
const determineStateRole = (unit, isWritable) => {
  const normalizedUnit = unit.trim();
  if (normalizedUnit === "\xB0C" || normalizedUnit === "K") {
    return isWritable ? "level.temperature" : "value.temperature";
  }
  if (normalizedUnit === "bar" || normalizedUnit === "mbar" || normalizedUnit === "hPa") {
    return isWritable ? "level.pressure" : "value.pressure";
  }
  if (normalizedUnit === "kWh" || normalizedUnit === "Wh" || normalizedUnit === "MWh") {
    return "value.energy";
  }
  if (normalizedUnit === "W" || normalizedUnit === "kW") {
    return "value.power";
  }
  if (normalizedUnit === "V") {
    return "value.voltage";
  }
  if (normalizedUnit === "A") {
    return "value.current";
  }
  if (normalizedUnit === "Hz") {
    return "value.frequency";
  }
  return isWritable ? "level" : "value";
};
const buildEnumStates = (dp, oidEnumsDict) => {
  const enumList = oidEnumsDict[dp.name];
  if (!Array.isArray(enumList)) {
    return void 0;
  }
  const states = {};
  if (dp.desc === "Enum Var") {
    const enumKeys = getEnumKeys(dp.prop);
    if (enumKeys) {
      for (const val of enumKeys) {
        const label = enumList[Number(val)];
        if (typeof label === "string" && label.length > 0) {
          states[val] = label;
        }
      }
    }
  } else {
    enumList.forEach((val, key) => {
      if (typeof val === "string" && val.length > 0) {
        states[key] = val;
      }
    });
  }
  return Object.keys(states).length > 0 ? states : void 0;
};
const buildOidGroups = (oids) => {
  const oidGroups = {};
  const groupOidString = {};
  const seenPerGroup = {};
  if (!(oids == null ? void 0 : oids.length)) {
    return { oidGroups, groupOidString };
  }
  oids.forEach((entry, index) => {
    var _a;
    const trimmedOid = typeof (entry == null ? void 0 : entry.oid) === "string" ? entry.oid.trim() : "";
    if (!(entry == null ? void 0 : entry.enabled) || !trimmedOid) {
      return;
    }
    const groupNum = Number((_a = entry.group) != null ? _a : 0);
    if (!Number.isInteger(groupNum) || groupNum < 0) {
      return;
    }
    const groupKey = String(groupNum);
    if (!seenPerGroup[groupKey]) {
      seenPerGroup[groupKey] = /* @__PURE__ */ new Set();
    }
    if (seenPerGroup[groupKey].has(trimmedOid)) {
      return;
    }
    seenPerGroup[groupKey].add(trimmedOid);
    if (!oidGroups[groupKey]) {
      oidGroups[groupKey] = [index];
      groupOidString[groupKey] = trimmedOid;
    } else {
      oidGroups[groupKey].push(index);
      groupOidString[groupKey] = `${groupOidString[groupKey]};${trimmedOid}`;
    }
  });
  return { oidGroups, groupOidString };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildEnumStates,
  buildOidGroups,
  determineStateRole,
  escapeXml,
  extractOidIndex,
  getEnumKeys,
  normalizeBaseUrl,
  padId,
  parseFiniteNumber
});
//# sourceMappingURL=util.js.map
