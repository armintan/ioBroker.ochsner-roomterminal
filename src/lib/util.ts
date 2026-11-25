/**
 * Data point metadata returned by Ochsner web2comm getDpResponse.
 */
export interface OchsnerDataPoint {
    /** Variable identifier (e.g. "01:02") */
    name: string;
    /** Access and enum property descriptor (e.g. "-rw") */
    prop: string;
    /** Data point type description */
    desc: string;
    /** Current value string */
    value: string;
    /** Physical unit string */
    unit: string;
    /** Step size string */
    step: string;
    /** Minimum value string */
    min: string;
    /** Maximum value string */
    max: string;
}

/**
 * Extracts enum key indices from a web2comm `prop` string (e.g. `"enum = 0,1,2"` -> `["0", "1", "2"]`).
 *
 * @param prop - Property descriptor string from web2comm XML
 * @returns Array of enum key strings or null if not matched
 */
export const getEnumKeys = (prop: string): string[] | null => {
    const regex = /(?<=enum = )(\d|,)*$/g;
    const found = prop.match(regex);
    if (found && found[0].length > 0) {
        return found[0].split(',');
    }
    return null;
};

/**
 * Extracts the trailing numeric index from an OID path (e.g. `"/1/2/3/5/10"` -> `"10"`).
 *
 * @param oid - OID path string
 * @returns Trailing segment of the OID path
 */
export const extractOidIndex = (oid: string): string => {
    const lastSlash = oid.lastIndexOf('/');
    return lastSlash !== -1 ? oid.slice(lastSlash + 1) : oid;
};

/**
 * Pad single-digit identifier with a leading zero (e.g. `"1"` -> `"01"`).
 *
 * @param id - Identifier string
 * @returns Two-digit padded string
 */
export const padId = (id: string): string => (id.length === 1 ? `0${id}` : id);

/**
 * Determines an appropriate ioBroker standard role based on unit, read/write flags, and states mapping.
 *
 * @param unit - Unit string of the data point
 * @param isWritable - Whether the data point is writable
 * @param hasStates - Whether the data point has an enum states mapping
 * @returns Standard ioBroker role string
 */
export const determineStateRole = (unit: string, isWritable: boolean, hasStates: boolean): string => {
    const normalizedUnit = unit.trim();
    if (normalizedUnit === '°C' || normalizedUnit === 'K') {
        return isWritable ? 'level.temperature' : 'value.temperature';
    }
    if (normalizedUnit === '%') {
        return isWritable ? 'level' : 'value';
    }
    if (normalizedUnit === 'bar' || normalizedUnit === 'mbar' || normalizedUnit === 'hPa') {
        return 'value.pressure';
    }
    if (normalizedUnit === 'kWh' || normalizedUnit === 'Wh' || normalizedUnit === 'MWh') {
        return 'value.energy';
    }
    if (normalizedUnit === 'W' || normalizedUnit === 'kW') {
        return 'value.power';
    }
    if (hasStates) {
        return isWritable ? 'level' : 'value';
    }
    return isWritable ? 'level' : 'value';
};

/**
 * Builds the states mapping dictionary for an enum data point.
 *
 * @param dp - Parsed Ochsner data point
 * @param oidEnumsDict - Loaded enum dictionary
 * @returns States mapping `{ [key: string]: string }` or undefined if no states exist
 */
export const buildEnumStates = (
    dp: Pick<OchsnerDataPoint, 'name' | 'prop' | 'desc'>,
    oidEnumsDict: Record<string, string[]>,
): Record<string, string> | undefined => {
    const enumList = oidEnumsDict[dp.name];
    if (!enumList) {
        return undefined;
    }

    const states: Record<string, string> = {};
    if (dp.desc === 'Enum Var') {
        const enumKeys = getEnumKeys(dp.prop);
        if (enumKeys) {
            for (const val of enumKeys) {
                states[val] = enumList[Number(val)] ?? 'undefined';
            }
        }
    } else {
        enumList.forEach((val, key) => {
            states[key] = val ?? 'undefined';
        });
    }

    return Object.keys(states).length > 0 ? states : undefined;
};

/**
 * Groups configured and enabled OIDs by their group number.
 *
 * @param oids - List of configured OID entries
 * @returns Object containing `oidGroups` (group -> config indices) and `groupOidString` (group -> semicolon-separated OIDs)
 */
export const buildOidGroups = (
    oids: ioBroker.OID[] | undefined,
): {
    oidGroups: Record<string, number[]>;
    groupOidString: Record<string, string>;
} => {
    const oidGroups: Record<string, number[]> = {};
    const groupOidString: Record<string, string> = {};

    if (!oids?.length) {
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
