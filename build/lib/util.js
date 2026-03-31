const getEnumKeys = (prop) => {
  const regex = /(?<=enum = )(\d|,)*$/g;
  const found = prop.match(regex);
  if (found) {
    return found[0].split(",");
  }
  return null;
};
export {
  getEnumKeys
};
//# sourceMappingURL=util.js.map
