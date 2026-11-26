import { parseStringPromise } from 'xml2js';
import type { OchsnerDataPoint } from './util';
import { escapeXml, extractOidIndex, normalizeBaseUrl, padId } from './util';

/**
 * Default HTTP request timeout in milliseconds.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Device info response returned by `/api/1.0/info/deviceinfo`.
 */
export interface DeviceInfoResponse {
    /** Device name */
    device: string;
    /** Firmware version */
    version: string;
}

/**
 * Minimal HTTP client interface compatible with `digest-fetch` and test doubles.
 */
export interface DigestHttpClient {
    /** Performs an HTTP fetch request */
    fetch(url: string, options?: Record<string, unknown>): Promise<Response>;
}

/**
 * Optional settings for `Web2CommClient`.
 */
export interface Web2CommClientOptions {
    /** Per-request timeout in milliseconds (default: 10000) */
    timeoutMs?: number;
    /** Optional injected HTTP client (primarily for unit testing) */
    httpClient?: DigestHttpClient;
}

interface XmlNodeWithText {
    _?: unknown;
    $?: Record<string, string>;
}

interface XmlDpCfg {
    name?: unknown[];
    prop?: unknown[];
    desc?: unknown[];
    value?: unknown[];
    unit?: unknown[];
    step?: unknown[];
    minValue?: unknown[];
    maxValue?: unknown[];
}

interface XmlSoapFault {
    faultcode?: unknown[];
    faultstring?: unknown[];
}

/**
 * Safely extracts text content from an `xml2js` parsed node.
 *
 * @param node - Parsed XML element value
 * @returns Text content or empty string if missing/non-text
 */
const extractXmlText = (node: unknown): string => {
    if (typeof node === 'string') {
        return node;
    }
    if (node && typeof node === 'object' && '_' in node) {
        const text = (node as XmlNodeWithText)._;
        return typeof text === 'string' ? text : '';
    }
    return '';
};

/**
 * Creates a fresh GET options object per request so `digest-fetch` header mutation never leaks across calls.
 *
 * @param accept - Value for the HTTP `Accept` header
 * @param signal - Optional `AbortSignal` for timeout/cancellation
 * @returns Fetch options object
 */
const createGetOptions = (accept: string, signal?: AbortSignal): Record<string, unknown> => ({
    method: 'GET',
    headers: {
        Connection: 'Keep-Alive',
        Accept: accept,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
    },
    ...(signal ? { signal } : {}),
});

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
     <oid>${escapeXml(oids)}</oid>
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
export const buildWriteDpSoapBody = (oid: string, value: string | number | boolean): string => {
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
    <oid>${escapeXml(oid)}</oid>
    <prop/>
   </ref>
   <dp>
    <index>${escapeXml(ind)}</index>
    <name/>
    <prop/>
    <desc/>
    <value>${escapeXml(String(value))}</value>
    <unit/>
    <timestamp>0</timestamp>
   </dp>
  </ns:writeDpRequest>   
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
};

/**
 * Extracts a SOAP Fault message from parsed XML if a fault is present.
 *
 * @param parsedXml - Result object from `xml2js.parseStringPromise`
 * @returns Fault description string or `undefined` if no fault is present
 */
const extractSoapFault = (parsedXml: Record<string, unknown>): string | undefined => {
    const envelope = parsedXml?.['SOAP-ENV:Envelope'] as Record<string, unknown> | undefined;
    const bodyList = envelope?.['SOAP-ENV:Body'];
    if (!Array.isArray(bodyList) || !bodyList[0] || typeof bodyList[0] !== 'object') {
        return undefined;
    }
    const body = bodyList[0] as Record<string, unknown>;
    const faultList = body['SOAP-ENV:Fault'] ?? body.Fault;
    if (!Array.isArray(faultList) || !faultList[0] || typeof faultList[0] !== 'object') {
        return undefined;
    }
    const fault = faultList[0] as XmlSoapFault;
    const faultString = extractXmlText(fault.faultstring?.[0]);
    const faultCode = extractXmlText(fault.faultcode?.[0]);
    if (faultString && faultCode) {
        return `${faultCode}: ${faultString}`;
    }
    return faultString || faultCode || 'SOAP Fault';
};

/**
 * Parses `VarIdentTexte_de.xml` content into a dictionary of `{ "gn:mn": "description" }`.
 *
 * @param xmlContent - Raw XML content
 * @returns Parsed OID names dictionary
 */
export const parseOidNamesXml = async (xmlContent: string): Promise<Record<string, string>> => {
    const oidNamesDict: Record<string, string> = {};
    const result = (await parseStringPromise(xmlContent)) as Record<string, unknown>;
    const root = result?.VarIdentTexte as { gn?: unknown[] } | undefined;
    const groups = root?.gn;
    if (!Array.isArray(groups)) {
        return oidNamesDict;
    }

    for (const gnEntry of groups) {
        const gnObj = gnEntry as { $?: { id?: string }; mn?: unknown[] };
        const gnRaw = (gnObj?.$?.id ?? '').trim();
        if (!gnRaw) {
            continue;
        }
        const gn = padId(gnRaw);
        const members = gnObj?.mn;
        if (!Array.isArray(members)) {
            continue;
        }
        for (const mnEntry of members) {
            const mnObj = mnEntry as XmlNodeWithText;
            const mnRaw = (mnObj?.$?.id ?? '').trim();
            const text = extractXmlText(mnEntry);
            if (!mnRaw || !text) {
                continue;
            }
            const mn = padId(mnRaw);
            oidNamesDict[`${gn}:${mn}`] = text;
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
    const result = (await parseStringPromise(xmlContent)) as Record<string, unknown>;
    const root = result?.AufzaehlTexte as { gn?: unknown[] } | undefined;
    const groups = root?.gn;
    if (!Array.isArray(groups)) {
        return oidEnumsDict;
    }

    for (const gnEntry of groups) {
        const gnObj = gnEntry as { $?: { id?: string }; mn?: unknown[] };
        const gnRaw = (gnObj?.$?.id ?? '').trim();
        if (!gnRaw) {
            continue;
        }
        const gn = padId(gnRaw);
        const members = gnObj?.mn;
        if (!Array.isArray(members)) {
            continue;
        }
        for (const mnEntry of members) {
            const mnObj = mnEntry as { $?: { id?: string }; enum?: unknown[] };
            const mnRaw = (mnObj?.$?.id ?? '').trim();
            if (!mnRaw) {
                continue;
            }
            const mn = padId(mnRaw);
            const key = `${gn}:${mn}`;
            const enumArray: string[] = [];
            const enums = mnObj?.enum;
            if (Array.isArray(enums)) {
                for (const enumEntry of enums) {
                    const enumObj = enumEntry as XmlNodeWithText;
                    const index = parseInt(enumObj?.$?.id ?? '', 10);
                    const text = extractXmlText(enumEntry);
                    if (Number.isInteger(index) && index >= 0 && text.length > 0) {
                        enumArray[index] = text;
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
 * Throws if the XML contains a SOAP Fault.
 *
 * @param xmlContent - Raw SOAP response XML
 * @returns Array of parsed data points
 */
export const parseGetDpResponseXml = async (xmlContent: string): Promise<OchsnerDataPoint[]> => {
    const jsonResult = (await parseStringPromise(xmlContent)) as Record<string, unknown>;
    const fault = extractSoapFault(jsonResult);
    if (fault) {
        throw new Error(`SOAP Fault: ${fault}`);
    }

    const envelope = jsonResult?.['SOAP-ENV:Envelope'] as Record<string, unknown> | undefined;
    const bodyList = envelope?.['SOAP-ENV:Body'];
    const body = Array.isArray(bodyList) ? (bodyList[0] as Record<string, unknown> | undefined) : undefined;
    const responseList = body?.['ns:getDpResponse'];
    const responseObj = Array.isArray(responseList)
        ? (responseList[0] as { dpCfg?: XmlDpCfg[] } | undefined)
        : undefined;
    const dpCfg: XmlDpCfg[] = Array.isArray(responseObj?.dpCfg) ? responseObj.dpCfg : [];

    return dpCfg.map(dp => ({
        name: extractXmlText(dp.name?.[0]),
        prop: extractXmlText(dp.prop?.[0]),
        desc: extractXmlText(dp.desc?.[0]),
        value: extractXmlText(dp.value?.[0]),
        unit: extractXmlText(dp.unit?.[0]),
        step: extractXmlText(dp.step?.[0]),
        min: extractXmlText(dp.minValue?.[0]),
        max: extractXmlText(dp.maxValue?.[0]),
    }));
};

/**
 * HTTP/SOAP client for communicating with the Ochsner Roomterminal (web2comm) server.
 */
export class Web2CommClient {
    private readonly baseUrl: string;
    private readonly deviceInfoUrl: string;
    private readonly wsUrl: string;
    private readonly username: string;
    private readonly password: string;
    private readonly timeoutMs: number;
    private httpClientPromise: Promise<DigestHttpClient> | undefined;
    private readonly activeControllers = new Set<AbortController>();

    /**
     * Creates a new Web2CommClient instance.
     *
     * @param serverIP - IP address, hostname, or base URL of the Ochsner Roomterminal
     * @param username - Digest auth username
     * @param password - Digest auth password
     * @param options - Optional timeout and HTTP client overrides
     */
    public constructor(serverIP: string, username: string, password: string, options: Web2CommClientOptions = {}) {
        this.baseUrl = normalizeBaseUrl(serverIP);
        this.deviceInfoUrl = `${this.baseUrl}/api/1.0/info/deviceinfo`;
        this.wsUrl = `${this.baseUrl}/ws`;
        this.username = username;
        this.password = password;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        if (options.httpClient) {
            this.httpClientPromise = Promise.resolve(options.httpClient);
        }
    }

    /**
     * Aborts all currently in-flight HTTP requests (e.g. during adapter unload).
     */
    public abort(): void {
        for (const controller of this.activeControllers) {
            controller.abort(new Error('Request aborted'));
        }
        this.activeControllers.clear();
    }

    /**
     * Lazily loads the ESM `digest-fetch` module via native `import()` so CommonJS output
     * built by esbuild works on all Node.js 20.x versions (including < 20.19).
     */
    private getHttpClient(): Promise<DigestHttpClient> {
        if (!this.httpClientPromise) {
            const nativeImport = new Function('specifier', 'return import(specifier)') as (
                specifier: string,
            ) => Promise<{ default: new (user: string, pass: string) => DigestHttpClient }>;

            this.httpClientPromise = nativeImport('digest-fetch').then(mod => {
                const DigestFetchCtor = mod.default;
                return new DigestFetchCtor(this.username, this.password);
            });
        }
        return this.httpClientPromise;
    }

    /**
     * Executes an HTTP request with per-request timeout and abort tracking.
     *
     * @param url - Request URL
     * @param buildOptions - Callback receiving the request's `AbortSignal` and returning fetch options
     * @returns HTTP `Response`
     */
    private async fetchWithTimeout(
        url: string,
        buildOptions: (signal: AbortSignal) => Record<string, unknown>,
    ): Promise<Response> {
        const controller = new AbortController();
        this.activeControllers.add(controller);
        const timer = setTimeout(
            () => controller.abort(new Error(`Request timed out after ${this.timeoutMs} ms`)),
            this.timeoutMs,
        );

        try {
            const client = await this.getHttpClient();
            if (controller.signal.aborted) {
                throw controller.signal.reason instanceof Error
                    ? controller.signal.reason
                    : new Error('Request aborted');
            }
            return await client.fetch(url, buildOptions(controller.signal));
        } finally {
            clearTimeout(timer);
            this.activeControllers.delete(controller);
        }
    }

    /**
     * Queries the device info endpoint to verify connectivity and credentials.
     *
     * @returns Parsed device info object (`device` and `version`)
     */
    public async fetchDeviceInfo(): Promise<DeviceInfoResponse> {
        const response = await this.fetchWithTimeout(this.deviceInfoUrl, signal =>
            createGetOptions('application/json', signal),
        );
        if (!response.ok) {
            await response.text().catch(() => undefined);
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
        const contentLength = String(Buffer.byteLength(body, 'utf8'));

        const response = await this.fetchWithTimeout(this.wsUrl, signal => ({
            method: 'POST',
            body,
            headers: {
                Connection: 'Keep-Alive',
                Accept: 'text/xml',
                Pragma: 'no-cache',
                SOAPAction: 'http://ws01.lom.ch/soap/getDP',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': contentLength,
            },
            signal,
        }));

        const rawXml = await response.text();
        if (!response.ok) {
            throw new Error(`reading ${oids} failed! HTTP ${response.status}: ${response.statusText}`);
        }

        const dataPoints = await parseGetDpResponseXml(rawXml);
        return { rawXml, dataPoints };
    }

    /**
     * Writes a value to an OID via SOAP `writeDpRequest`.
     *
     * @param oid - OID path string
     * @param value - Value to write
     * @returns Object with SOAP request body, HTTP/SOAP success flag, and status text
     */
    public async writeDataPoint(
        oid: string,
        value: string | number | boolean,
    ): Promise<{ body: string; ok: boolean; statusText: string }> {
        const body = buildWriteDpSoapBody(oid, value);
        const contentLength = String(Buffer.byteLength(body, 'utf8'));

        const response = await this.fetchWithTimeout(this.wsUrl, signal => ({
            method: 'POST',
            body,
            headers: {
                Connection: 'Keep-Alive',
                Accept: '*/*',
                Pragma: 'no-cache',
                SOAPAction: 'http://ws01.lom.ch/soap/writeDP',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': contentLength,
            },
            signal,
        }));

        // Always consume response body to allow Keep-Alive connection reuse
        const responseText = await response.text();
        if (!response.ok) {
            return {
                body,
                ok: false,
                statusText: response.statusText || `HTTP ${response.status}`,
            };
        }

        if (responseText.includes('Fault')) {
            try {
                const parsed = (await parseStringPromise(responseText)) as Record<string, unknown>;
                const fault = extractSoapFault(parsed);
                if (fault) {
                    return {
                        body,
                        ok: false,
                        statusText: fault,
                    };
                }
            } catch {
                // Ignore XML parse failures on non-XML success bodies
            }
        }

        return {
            body,
            ok: true,
            statusText: response.statusText,
        };
    }

    /**
     * Downloads and parses `VarIdentTexte_de.xml` from the device.
     *
     * @returns Dictionary mapping `"gn:mn"` to variable names
     */
    public async fetchOidNames(): Promise<Record<string, string>> {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/res/xml/VarIdentTexte_de.xml`, signal =>
            createGetOptions('text/xml', signal),
        );
        const xmlContent = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return parseOidNamesXml(xmlContent);
    }

    /**
     * Downloads and parses `AufzaehlTexte_de.xml` from the device.
     *
     * @returns Dictionary mapping `"gn:mn"` to arrays of enum labels
     */
    public async fetchOidEnums(): Promise<Record<string, string[]>> {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/res/xml/AufzaehlTexte_de.xml`, signal =>
            createGetOptions('text/xml', signal),
        );
        const xmlContent = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return parseOidEnumsXml(xmlContent);
    }
}
