import DigestFetch from 'digest-fetch';
import { parseStringPromise } from 'xml2js';
import type { OchsnerDataPoint } from './util';
import { extractOidIndex, padId } from './util';

/**
 * Device info response returned by `/api/1.0/info/deviceinfo`.
 */
export interface DeviceInfoResponse {
    /** Device name */
    device: string;
    /** Firmware version */
    version: string;
}

const DEFAULT_GET_OPTIONS = {
    method: 'get',
    headers: {
        Connection: 'Keep-Alive',
        Accept: 'text/xml',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/xml; charset=utf-8',
    },
};

/**
 * Builds the SOAP XML body for `getDpRequest`.
 *
 * @param oids - Semicolon-separated OID string
 * @returns SOAP XML payload
 */
export const buildGetDpSoapBody = (oids: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?>
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

/**
 * Builds the SOAP XML body for `writeDpRequest`.
 *
 * @param oid - Single OID path string
 * @param value - Value to write
 * @returns SOAP XML payload
 */
export const buildWriteDpSoapBody = (oid: string, value: string | number | boolean | null): string => {
    const ind = extractOidIndex(oid);
    return `<?xml version="1.0" encoding="UTF-8"?>
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
};

/**
 * Parses `VarIdentTexte_de.xml` content into a dictionary of `{ "gn:mn": "description" }`.
 *
 * @param xmlContent - Raw XML content
 * @returns Parsed OID names dictionary
 */
export const parseOidNamesXml = async (xmlContent: string): Promise<Record<string, string>> => {
    const oidNamesDict: Record<string, string> = {};
    const result = await parseStringPromise(xmlContent);
    const groups = result?.VarIdentTexte?.gn;
    if (!Array.isArray(groups)) {
        return oidNamesDict;
    }

    for (const gnEntry of groups) {
        const gn = padId(String(gnEntry?.$?.id ?? ''));
        const members = gnEntry?.mn;
        if (!Array.isArray(members)) {
            continue;
        }
        for (const mnEntry of members) {
            const mn = padId(String(mnEntry?.$?.id ?? ''));
            const key = `${gn}:${mn}`;
            oidNamesDict[key] = mnEntry._;
        }
    }
    return oidNamesDict;
};

/**
 * Parses `AufzaehlTexte_de.xml` content into a dictionary of `{ "gn:mn": ["enum0", "enum1", ...] }`.
 *
 * @param xmlContent - Raw XML content
 * @returns Parsed OID enums dictionary
 */
export const parseOidEnumsXml = async (xmlContent: string): Promise<Record<string, string[]>> => {
    const oidEnumsDict: Record<string, string[]> = {};
    const result = await parseStringPromise(xmlContent);
    const groups = result?.AufzaehlTexte?.gn;
    if (!Array.isArray(groups)) {
        return oidEnumsDict;
    }

    for (const gnEntry of groups) {
        const gn = padId(String(gnEntry?.$?.id ?? ''));
        const members = gnEntry?.mn;
        if (!Array.isArray(members)) {
            continue;
        }
        for (const mnEntry of members) {
            const mn = padId(String(mnEntry?.$?.id ?? ''));
            const key = `${gn}:${mn}`;
            const enumArray: string[] = [];
            const enums = mnEntry?.enum;
            if (Array.isArray(enums)) {
                for (const enumEntry of enums) {
                    const index = parseInt(String(enumEntry?.$?.id ?? ''), 10);
                    if (!Number.isNaN(index)) {
                        enumArray[index] = enumEntry._;
                    }
                }
            }
            oidEnumsDict[key] = enumArray;
        }
    }
    return oidEnumsDict;
};

/**
 * Parses a SOAP `getDpResponse` XML string into a list of `OchsnerDataPoint` items.
 *
 * @param xmlContent - Raw SOAP response XML
 * @returns Array of parsed data points
 */
export const parseGetDpResponseXml = async (xmlContent: string): Promise<OchsnerDataPoint[]> => {
    const jsonResult = await parseStringPromise(xmlContent);
    const dpCfg: any[] =
        jsonResult?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.[0]?.['ns:getDpResponse']?.[0]?.dpCfg ?? [];

    return dpCfg.map(dp => ({
        name: String(dp.name?.[0] ?? ''),
        prop: String(dp.prop?.[0] ?? ''),
        desc: String(dp.desc?.[0] ?? ''),
        value: String(dp.value?.[0] ?? ''),
        unit: String(dp.unit?.[0] ?? ''),
        step: String(dp.step?.[0] ?? ''),
        min: String(dp.minValue?.[0] ?? ''),
        max: String(dp.maxValue?.[0] ?? ''),
    }));
};

/**
 * HTTP/SOAP client for communicating with the Ochsner Roomterminal (web2comm) server.
 */
export class Web2CommClient {
    private readonly client: DigestFetch;
    private readonly deviceInfoUrl: string;
    private readonly wsUrl: string;
    private readonly serverIP: string;

    /**
     * Creates a new Web2CommClient instance.
     *
     * @param serverIP - IP address or hostname of the Ochsner Roomterminal
     * @param username - Digest auth username
     * @param password - Digest auth password
     */
    public constructor(serverIP: string, username: string, password: string) {
        this.serverIP = serverIP;
        this.deviceInfoUrl = `http://${serverIP}/api/1.0/info/deviceinfo`;
        this.wsUrl = `http://${serverIP}/ws`;
        this.client = new DigestFetch(username, password);
    }

    /**
     * Queries the device info endpoint to verify connectivity and credentials.
     *
     * @returns Parsed device info object (`device` and `version`)
     */
    public async fetchDeviceInfo(): Promise<DeviceInfoResponse> {
        const response = await this.client.fetch(this.deviceInfoUrl, DEFAULT_GET_OPTIONS);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as DeviceInfoResponse;
    }

    /**
     * Reads one or more OIDs via SOAP `getDpRequest`.
     *
     * @param oids - Semicolon-separated OID string
     * @returns Raw XML response string and parsed data points
     */
    public async readDataPoints(oids: string): Promise<{ rawXml: string; dataPoints: OchsnerDataPoint[] }> {
        const body = buildGetDpSoapBody(oids);
        const options = {
            method: 'post',
            body,
            headers: {
                Connection: 'Keep-Alive',
                Accept: 'text/xml',
                Pragma: 'no-cache',
                SOAPAction: 'http://ws01.lom.ch/soap/getDP',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-length': body.length,
            },
        };

        const response = await this.client.fetch(this.wsUrl, options);
        if (!response.ok) {
            throw new Error(`reading ${oids} failed! Message: ${JSON.stringify(response.statusText)}`);
        }

        const rawXml = await response.text();
        const dataPoints = await parseGetDpResponseXml(rawXml);
        return { rawXml, dataPoints };
    }

    /**
     * Writes a value to an OID via SOAP `writeDpRequest`.
     *
     * @param oid - OID path string
     * @param value - Value to write
     * @returns Object with SOAP request body and HTTP response status
     */
    public async writeDataPoint(
        oid: string,
        value: string | number | boolean | null,
    ): Promise<{ body: string; ok: boolean; statusText: string }> {
        const body = buildWriteDpSoapBody(oid, value);
        const options = {
            method: 'post',
            body,
            headers: {
                Connection: 'Keep-Alive',
                Accept: '*/*',
                Pragma: 'no-cache',
                SOAPAction: 'http://ws01.lom.ch/soap/writeDP',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-length': body.length,
            },
        };

        const response = await this.client.fetch(this.wsUrl, options);
        return {
            body,
            ok: response.ok === true,
            statusText: response.statusText,
        };
    }

    /**
     * Downloads and parses `VarIdentTexte_de.xml` from the device.
     *
     * @returns Dictionary mapping `"gn:mn"` to variable names
     */
    public async fetchOidNames(): Promise<Record<string, string>> {
        const response = await this.client.fetch(
            `http://${this.serverIP}/res/xml/VarIdentTexte_de.xml`,
            DEFAULT_GET_OPTIONS,
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const xmlContent = await response.text();
        return parseOidNamesXml(xmlContent);
    }

    /**
     * Downloads and parses `AufzaehlTexte_de.xml` from the device.
     *
     * @returns Dictionary mapping `"gn:mn"` to arrays of enum labels
     */
    public async fetchOidEnums(): Promise<Record<string, string[]>> {
        const response = await this.client.fetch(
            `http://${this.serverIP}/res/xml/AufzaehlTexte_de.xml`,
            DEFAULT_GET_OPTIONS,
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const xmlContent = await response.text();
        return parseOidEnumsXml(xmlContent);
    }
}
