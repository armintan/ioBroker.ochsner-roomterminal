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
 * Escapes special XML characters in a text value to prevent malformed XML or injection.
 *
 * @param value - Input string to escape
 * @returns XML-escaped string
 */
export const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

/**
 * Normalizes a configured server IP/hostname into a base URL without trailing slash.
 *
 * @param serverIP - Configured IP address, hostname, or URL
 * @returns Normalized base URL (e.g. `"http://192.168.1.108"`)
 */
export const normalizeBaseUrl = (serverIP: string): string => {
    const trimmed = serverIP.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `http://${trimmed}`;
};

/**
 * Parses a numeric string into a finite number, returning `undefined` for empty or non-numeric strings.
 *
 * @param raw - Raw string value from device XML
 * @returns Finite number or `undefined`
 */
export const parseFiniteNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : undefined;
};

/**
 * Extracts enum key indices from a web2comm `prop` string (e.g. `"enum = 0,1,2"` -> `["0", "1", "2"]`).
 *
 * @param prop - Property descriptor string from web2comm XML
 * @returns Array of enum key strings or null if not matched
 */
export const getEnumKeys = (prop: string): string[] | null => {
    const match = /enum\s*=\s*(\d+(?:\s*,\s*\d+)*)/.exec(prop);
    if (!match?.[1]) {
        return null;
    }
    return match[1].split(',').map(key => key.trim());
};

/**
 * Extracts the trailing numeric index from an OID path (e.g. `"/1/2/3/5/10"` -> `"10"`).
 *
 * @param oid - OID path string
 * @returns Trailing segment of the OID path
 */
export const extractOidIndex = (oid: string): string => {
    const cleaned = oid.trim().replace(/\/+$/, '');
    const lastSlash = cleaned.lastIndexOf('/');
    return lastSlash !== -1 ? cleaned.slice(lastSlash + 1) : cleaned;
};

/**
 * Pad single-digit identifier with a leading zero (e.g. `"1"` -> `"01"`).
 *
 * @param id - Identifier string
 * @returns Two-digit padded string
 */
export const padId = (id: string): string => (id.length === 1 ? `0${id}` : id);

/**
 * Determines an appropriate ioBroker standard role based on unit and write flag.
 *
 * @param unit - Unit string of the data point
 * @param isWritable - Whether the data point is writable
 * @returns Standard ioBroker role string
 */
export const determineStateRole = (unit: string, isWritable: boolean): string => {
    const normalizedUnit = unit.trim();
    if (normalizedUnit === '°C' || normalizedUnit === 'K') {
        return isWritable ? 'level.temperature' : 'value.temperature';
    }
    if (normalizedUnit === 'bar' || normalizedUnit === 'mbar' || normalizedUnit === 'hPa') {
        return isWritable ? 'level.pressure' : 'value.pressure';
    }
    if (normalizedUnit === 'kWh' || normalizedUnit === 'Wh' || normalizedUnit === 'MWh') {
        return 'value.energy';
    }
    if (normalizedUnit === 'W' || normalizedUnit === 'kW') {
        return 'value.power';
    }
    if (normalizedUnit === 'V') {
        return 'value.voltage';
    }
    if (normalizedUnit === 'A') {
        return 'value.current';
    }
    if (normalizedUnit === 'Hz') {
        return 'value.frequency';
    }
    return isWritable ? 'level' : 'value';
};

/**
 * Builds the states mapping dictionary for an enum data point.
 *
 * Handles sparse arrays and `null` holes created by JSON round-tripping consistently.
 *
 * @param dp - Parsed Ochsner data point
 * @param oidEnumsDict - Loaded enum dictionary
 * @returns States mapping `{ [key: string]: string }` or undefined if no states exist
 */
export const buildEnumStates = (
    dp: Pick<OchsnerDataPoint, 'name' | 'prop' | 'desc'>,
    oidEnumsDict: Record<string, (string | null | undefined)[]>,
): Record<string, string> | undefined => {
    const enumList = oidEnumsDict[dp.name];
    if (!Array.isArray(enumList)) {
        return undefined;
    }

    const states: Record<string, string> = {};
    if (dp.desc === 'Enum Var') {
        const enumKeys = getEnumKeys(dp.prop);
        if (enumKeys) {
            for (const val of enumKeys) {
                const label = enumList[Number(val)];
                if (typeof label === 'string' && label.length > 0) {
                    states[val] = label;
                }
            }
        }
    } else {
        enumList.forEach((val, key) => {
            if (typeof val === 'string' && val.length > 0) {
                states[key] = val;
            }
        });
    }

    return Object.keys(states).length > 0 ? states : undefined;
};

/**
 * Groups configured and enabled OIDs by their group number.
 *
 * Skips disabled entries, empty OIDs, invalid group numbers, and duplicate OIDs within the same group.
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
    const seenPerGroup: Record<string, Set<string>> = {};

    if (!oids?.length) {
        return { oidGroups, groupOidString };
    }

    oids.forEach((entry, index) => {
        const trimmedOid = typeof entry?.oid === 'string' ? entry.oid.trim() : '';
        if (!entry?.enabled || !trimmedOid) {
            return;
        }
        const groupNum = Number(entry.group ?? 0);
        if (!Number.isInteger(groupNum) || groupNum < 0) {
            return;
        }
        const groupKey = String(groupNum);
        if (!seenPerGroup[groupKey]) {
            seenPerGroup[groupKey] = new Set();
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
